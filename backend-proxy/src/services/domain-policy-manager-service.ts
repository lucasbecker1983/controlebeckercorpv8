import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { ensureBlockingReleaseSchema } from './blocking-release-schema-service';
import { isManagedBlockingVlan } from './blocking-release-scope';

type PolicyType = 'allow' | 'block';
type ScopeType = 'global' | 'vlan';

type AuditContext = {
    username?: string | null;
    userId?: number | null;
    ipAddress?: string | null;
    userAgent?: string | null;
};

type GovernanceMetadata = {
    summary: string;
    legal_basis: string | null;
    requested_by: string | null;
    approval_scope: string | null;
    lifecycle_status: string | null;
    review_date: string | null;
    approved_by: string | null;
    approved_at: string | null;
    effective_from: string | null;
    expires_at: string | null;
    revoked_by: string | null;
    revoked_at: string | null;
};

type PolicyEntryType = 'domain' | 'url';
type NormalizedPolicyEntry = {
    raw: string;
    entry_type: PolicyEntryType;
    normalized_domain: string;
    normalized_host_domain: string | null;
};

const normalizeDomain = (value: string) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/^\*\./, '')
    .replace(/\.$/, '');

const collapseSlashes = (value: string) => value.replace(/\/{2,}/g, '/');

const isValidDomain = (domain: string) => {
    if (!domain || domain.length > 255) return false;
    if (domain.includes('..') || domain.startsWith('.') || domain.endsWith('.')) return false;
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain);
};

const normalizeTextKey = (value: string) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const parseGovernanceText = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return { summary: '', metadata: {} as Record<string, string> };
    const marker = '\n[Governanca]\n';
    const [summaryPart, metaPart] = raw.includes(marker)
        ? raw.split(marker)
        : [raw, ''];
    const metadata: Record<string, string> = {};
    metaPart.split('\n').forEach((line) => {
        const match = line.match(/^([^:]+):\s*(.+)$/);
        if (!match) return;
        metadata[normalizeTextKey(match[1])] = match[2].trim();
    });
    return {
        summary: summaryPart.trim(),
        metadata,
    };
};

const normalizeOptionalText = (value: unknown) => {
    const normalized = String(value ?? '').trim();
    return normalized || null;
};

const normalizeOptionalTimestamp = (value: unknown) => {
    const normalized = String(value ?? '').trim();
    if (!normalized) return null;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) throw new Error(`Data/hora inválida: ${normalized}`);
    return date.toISOString();
};

const normalizeOptionalDate = (value: unknown) => {
    const normalized = String(value ?? '').trim();
    if (!normalized) return null;
    const date = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new Error(`Data inválida: ${normalized}`);
    return normalized;
};

const resolveGovernanceMetadata = (payload: any, fallback?: any): GovernanceMetadata => {
    const parsedPayload = parseGovernanceText(payload?.description);
    const parsedFallback = parseGovernanceText(fallback?.description);
    return {
        summary: String(
            payload?.governance_summary
            ?? payload?.governanceSummary
            ?? parsedPayload.summary
            ?? fallback?.governance_summary
            ?? parsedFallback.summary
            ?? '',
        ).trim(),
        legal_basis: normalizeOptionalText(
            payload?.legal_basis
            ?? payload?.legalBasis
            ?? parsedPayload.metadata['base-legal']
            ?? fallback?.legal_basis
            ?? parsedFallback.metadata['base-legal'],
        ),
        requested_by: normalizeOptionalText(
            payload?.requested_by
            ?? payload?.requestedBy
            ?? parsedPayload.metadata.solicitante
            ?? fallback?.requested_by
            ?? parsedFallback.metadata.solicitante,
        ),
        approval_scope: normalizeOptionalText(
            payload?.approval_scope
            ?? payload?.approvalScope
            ?? parsedPayload.metadata['alcada-de-aprovacao']
            ?? fallback?.approval_scope
            ?? parsedFallback.metadata['alcada-de-aprovacao'],
        ),
        lifecycle_status: normalizeOptionalText(
            payload?.lifecycle_status
            ?? payload?.lifecycleStatus
            ?? parsedPayload.metadata['status-institucional']
            ?? fallback?.lifecycle_status
            ?? parsedFallback.metadata['status-institucional'],
        ),
        review_date: normalizeOptionalDate(
            payload?.review_date
            ?? payload?.reviewDate
            ?? parsedPayload.metadata['revisao-prevista']
            ?? fallback?.review_date
            ?? parsedFallback.metadata['revisao-prevista'],
        ),
        approved_by: normalizeOptionalText(payload?.approved_by ?? payload?.approvedBy ?? fallback?.approved_by),
        approved_at: normalizeOptionalTimestamp(payload?.approved_at ?? payload?.approvedAt ?? fallback?.approved_at),
        effective_from: normalizeOptionalTimestamp(payload?.effective_from ?? payload?.effectiveFrom ?? fallback?.effective_from),
        expires_at: normalizeOptionalTimestamp(payload?.expires_at ?? payload?.expiresAt ?? fallback?.expires_at),
        revoked_by: normalizeOptionalText(payload?.revoked_by ?? payload?.revokedBy ?? fallback?.revoked_by),
        revoked_at: normalizeOptionalTimestamp(payload?.revoked_at ?? payload?.revokedAt ?? fallback?.revoked_at),
    };
};

const normalizeDomainList = (raw: unknown) => {
    const source = Array.isArray(raw)
        ? raw
        : String(raw || '').split(/[\n,;\s]+/);
    const normalized = source
        .map((item) => normalizeDomain(String(item || '')))
        .filter(Boolean);
    const unique = Array.from(new Set(normalized));
    const invalid = unique.filter((domain) => !isValidDomain(domain));
    if (invalid.length) {
        throw new Error(`Domínio inválido: ${invalid[0]}`);
    }
    if (!unique.length) throw new Error('Informe ao menos um domínio');
    return unique;
};

const isLikelyUrl = (value: string) => /^https?:\/\//i.test(value) || /[/?#]/.test(value);

const normalizeUrlEntry = (value: string): NormalizedPolicyEntry => {
    const raw = String(value || '').trim();
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let parsed: URL;
    try {
        parsed = new URL(candidate);
    } catch {
        throw new Error(`URL inválida: ${raw}`);
    }
    const host = normalizeDomain(parsed.hostname);
    if (!isValidDomain(host)) throw new Error(`URL inválida: ${raw}`);
    const pathname = collapseSlashes(parsed.pathname || '/');
    const normalized = `${host}${pathname === '/' && !parsed.search ? '' : pathname}${parsed.search || ''}`;
    return {
        raw,
        entry_type: 'url',
        normalized_domain: normalized,
        normalized_host_domain: host,
    };
};

const normalizePolicyEntryList = (raw: unknown): NormalizedPolicyEntry[] => {
    const source = Array.isArray(raw)
        ? raw
        : String(raw || '').split(/[\n,;\s]+/);
    const normalized = source
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .map((item) => {
            if (isLikelyUrl(item)) return normalizeUrlEntry(item);
            const domain = normalizeDomain(item);
            if (!isValidDomain(domain)) throw new Error(`Domínio inválido: ${item}`);
            return {
                raw: item,
                entry_type: 'domain' as const,
                normalized_domain: domain,
                normalized_host_domain: domain,
            };
        });
    const unique = Array.from(new Map(
        normalized.map((entry) => [`${entry.entry_type}:${entry.normalized_domain}`, entry]),
    ).values());
    if (!unique.length) throw new Error('Informe ao menos um domínio ou URL');
    return unique;
};

const normalizePolicyType = (value: unknown): PolicyType => {
    const raw = String(value || '').toLowerCase();
    if (raw === 'allow' || raw === 'liberar' || raw === 'whitelist') return 'allow';
    if (raw === 'block' || raw === 'bloquear' || raw === 'blacklist') return 'block';
    throw new Error('Tipo de política inválido');
};

const normalizeScope = (payload: any, fallback?: { scope_type?: string; scope_value?: string }) => {
    const rawScopeType = String(payload?.scope_type || payload?.scopeType || fallback?.scope_type || 'global').toLowerCase();
    const scopeType: ScopeType = rawScopeType === 'vlan' ? 'vlan' : 'global';
    if (scopeType === 'global') {
        return { scopeType, scopeValues: ['global'], scopeValue: 'global' };
    }

    const rawValues = payload?.vlan_ids
        ?? payload?.vlanIds
        ?? payload?.scope_values
        ?? payload?.scopeValues
        ?? payload?.scope_value
        ?? payload?.scopeValue
        ?? fallback?.scope_value
        ?? [];
    const values = (Array.isArray(rawValues) ? rawValues : String(rawValues).split(','))
        .map((item: any) => Number(String(item).trim()))
        .filter((item: number) => Number.isFinite(item));
    const unique = Array.from(new Set(values)).sort((left, right) => left - right);
    if (!unique.length) throw new Error('Selecione ao menos uma VLAN');
    const invalid = unique.filter((vlanId) => !isManagedBlockingVlan(vlanId));
    if (invalid.length) {
        throw new Error('VLAN inválida. Use IDs entre 1 e 4094.');
    }
    return { scopeType, scopeValues: unique.map(String), scopeValue: unique.join(',') };
};

const policyRowSelect = `
    SELECT
        dp.*,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', dpe.id,
                    'domain', dpe.domain,
                    'entry_type', dpe.entry_type,
                    'normalized_domain', dpe.normalized_domain,
                    'normalized_host_domain', dpe.normalized_host_domain,
                    'created_at', dpe.created_at,
                    'updated_at', dpe.updated_at
                )
                ORDER BY dpe.normalized_domain ASC
            ) FILTER (WHERE dpe.id IS NOT NULL),
            '[]'::jsonb
        ) AS entries,
        COUNT(dpe.id)::int AS domain_count
    FROM domain_policies dp
    LEFT JOIN domain_policy_entries dpe ON dpe.policy_id = dp.id
`;

export class DomainPolicyManagerService {
    private lgpdAuditReady = false;

    async ensureReady() {
        await ensureBlockingReleaseSchema();
        await this.ensureLgpdAuditSchema();
    }

    private async ensureLgpdAuditSchema() {
        if (this.lgpdAuditReady) return;
        await pool.query(`
            CREATE TABLE IF NOT EXISTS lgpd_audit_logs (
                id BIGSERIAL PRIMARY KEY,
                entity_type TEXT NOT NULL,
                entity_id BIGINT,
                action TEXT NOT NULL,
                actor_username TEXT,
                actor_user_id BIGINT,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                success BOOLEAN NOT NULL DEFAULT TRUE,
                message TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await pool.query(`ALTER TABLE lgpd_audit_logs ADD COLUMN IF NOT EXISTS actor_ip TEXT`);
        await pool.query(`ALTER TABLE lgpd_audit_logs ADD COLUMN IF NOT EXISTS actor_user_agent TEXT`);
        this.lgpdAuditReady = true;
    }

    private mapRow(row: any) {
        const scopeValues = row.scope_type === 'vlan'
            ? String(row.scope_value || '').split(',').map((item) => item.trim()).filter(Boolean)
            : ['global'];
        const governance = {
            summary: row.governance_summary || '',
            legal_basis: row.legal_basis || null,
            requested_by: row.requested_by || null,
            approval_scope: row.approval_scope || null,
            lifecycle_status: row.lifecycle_status || null,
            review_date: row.review_date || null,
            approved_by: row.approved_by || null,
            approved_at: row.approved_at || null,
            effective_from: row.effective_from || null,
            expires_at: row.expires_at || null,
            revoked_by: row.revoked_by || null,
            revoked_at: row.revoked_at || null,
        };
        return {
            ...row,
            scope_values: scopeValues,
            vlan_ids: row.scope_type === 'vlan' ? scopeValues.map(Number).filter(Number.isFinite) : [],
            domains: (row.entries || []).map((entry: any) => entry.domain || entry.normalized_domain),
            governance,
        };
    }

    private async getPolicyForClient(client: PoolClient, id: number) {
        const { rows } = await client.query(
            `
                ${policyRowSelect}
                WHERE dp.id = $1
                GROUP BY dp.id
            `,
            [id],
        );
        if (!rows.length) throw new Error('Política não encontrada');
        return this.mapRow(rows[0]);
    }

    private async recordPolicyAudit(client: PoolClient, input: {
        policyId?: number | null;
        action: string;
        requestedBy: string;
        auditContext?: AuditContext;
        payload?: any;
        result?: any;
        success: boolean;
        message?: string;
    }) {
        await client.query(
            `
                INSERT INTO domain_policy_audit_logs (policy_id, action, requested_by, payload, result, success, message)
                VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
            `,
            [
                input.policyId || null,
                input.action,
                input.requestedBy,
                JSON.stringify(input.payload || {}),
                JSON.stringify(input.result || {}),
                input.success,
                input.message || null,
            ],
        );

        await client.query(
            `
                INSERT INTO lgpd_audit_logs (
                    entity_type,
                    entity_id,
                    action,
                    actor_username,
                    actor_user_id,
                    actor_ip,
                    actor_user_agent,
                    payload,
                    success,
                    message
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
            `,
            [
                'domain_policy',
                input.policyId || null,
                input.action,
                input.auditContext?.username || input.requestedBy || 'api',
                input.auditContext?.userId || null,
                input.auditContext?.ipAddress || null,
                input.auditContext?.userAgent || null,
                JSON.stringify(input.payload || {}),
                input.success,
                input.message || null,
            ],
        );
    }

    private async replaceEntries(client: PoolClient, policyId: number, entries: NormalizedPolicyEntry[]) {
        await client.query(`DELETE FROM domain_policy_entries WHERE policy_id = $1`, [policyId]);
        for (const entry of entries) {
            await client.query(
                `
                    INSERT INTO domain_policy_entries (policy_id, domain, entry_type, normalized_domain, normalized_host_domain)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (policy_id, entry_type, normalized_domain) DO UPDATE SET
                        domain = EXCLUDED.domain,
                        normalized_host_domain = EXCLUDED.normalized_host_domain,
                        updated_at = NOW()
                `,
                [policyId, entry.raw, entry.entry_type, entry.normalized_domain, entry.normalized_host_domain],
            );
        }
    }

    private async syncLegacyRows(client: PoolClient, policyId: number) {
        const policy = await this.getPolicyForClient(client, policyId);
        await client.query(`DELETE FROM blocking_policies WHERE domain_policy_id = $1`, [policyId]);
        await client.query(`DELETE FROM release_policies WHERE domain_policy_id = $1`, [policyId]);
        if (!policy.enabled) return policy;

        const table = policy.policy_type === 'block' ? 'blocking_policies' : 'release_policies';
        const scopeValues = policy.scope_type === 'global' ? ['global'] : policy.scope_values;
        const category = policy.name;
        const description = policy.description || policy.governance_summary || `Política nomeada: ${policy.name}`;
        const originRule = `domain_policy:${policy.id}`;

        for (const scopeValue of scopeValues) {
            for (const entry of (policy.entries || []).filter((item: any) => item.entry_type !== 'url')) {
                const domain = entry.normalized_host_domain || entry.normalized_domain || entry.domain;
                if (!domain) continue;
                if (policy.policy_type === 'block') {
                    await client.query(
                        `
                            INSERT INTO ${table} (
                                domain,
                                description,
                                category,
                                active,
                                scope_type,
                                scope_value,
                                origin_rule,
                                created_by,
                                notes,
                                domain_policy_id
                            )
                            VALUES ($1, $2, $3, TRUE, $4, $5, $6, $7, $8, $9)
                            ON CONFLICT (domain, scope_type, scope_value) DO UPDATE SET
                                description = EXCLUDED.description,
                                category = EXCLUDED.category,
                                active = TRUE,
                                origin_rule = EXCLUDED.origin_rule,
                                notes = EXCLUDED.notes,
                                domain_policy_id = EXCLUDED.domain_policy_id,
                                updated_at = NOW()
                        `,
                        [
                            domain,
                            description,
                            category,
                            policy.scope_type,
                            policy.scope_type === 'global' ? 'global' : scopeValue,
                            originRule,
                            policy.updated_by || policy.created_by || 'system',
                            policy.description || null,
                            policy.id,
                        ],
                    );
                } else {
                    await client.query(
                        `
                            INSERT INTO ${table} (
                                domain,
                                description,
                                category,
                                reason,
                                protected,
                                active,
                                scope_type,
                                scope_value,
                                created_by,
                                notes,
                                origin_rule,
                                domain_policy_id
                            )
                            VALUES ($1, $2, $3, $4, FALSE, TRUE, $5, $6, $7, $8, $9, $10)
                            ON CONFLICT (domain, scope_type, scope_value) DO UPDATE SET
                                description = EXCLUDED.description,
                                category = EXCLUDED.category,
                                reason = EXCLUDED.reason,
                                active = TRUE,
                                notes = EXCLUDED.notes,
                                origin_rule = EXCLUDED.origin_rule,
                                domain_policy_id = EXCLUDED.domain_policy_id,
                                updated_at = NOW()
                        `,
                        [
                            domain,
                            description,
                            category,
                            policy.description || policy.name,
                            policy.scope_type,
                            policy.scope_type === 'global' ? 'global' : scopeValue,
                            policy.updated_by || policy.created_by || 'system',
                            policy.description || null,
                            originRule,
                            policy.id,
                        ],
                    );
                }
            }
        }

        return policy;
    }

    async list(filters: Record<string, any> = {}) {
        await this.ensureReady();
        const clauses = ['1 = 1'];
        const params: any[] = [];

        if (filters.search) {
            params.push(`%${String(filters.search).trim().toLowerCase()}%`);
            clauses.push(`(
                LOWER(dp.name) LIKE $${params.length}
                OR LOWER(COALESCE(dp.description, '')) LIKE $${params.length}
                OR EXISTS (
                    SELECT 1 FROM domain_policy_entries dpes
                    WHERE dpes.policy_id = dp.id
                      AND LOWER(dpes.normalized_domain) LIKE $${params.length}
                )
            )`);
        }
        if (filters.type || filters.policy_type) {
            params.push(normalizePolicyType(filters.type || filters.policy_type));
            clauses.push(`dp.policy_type = $${params.length}`);
        }
        if (filters.status === 'active' || filters.status === 'enabled') clauses.push(`dp.enabled = TRUE`);
        if (filters.status === 'inactive' || filters.status === 'disabled') clauses.push(`dp.enabled = FALSE`);
        if (filters.scope_type || filters.scopeType) {
            const scopeType = String(filters.scope_type || filters.scopeType) === 'vlan' ? 'vlan' : 'global';
            params.push(scopeType);
            clauses.push(`dp.scope_type = $${params.length}`);
        }
        if (filters.vlan_id || filters.vlan) {
            const vlanId = Number(filters.vlan_id || filters.vlan);
            if (!isManagedBlockingVlan(vlanId)) throw new Error('VLAN fora do escopo do módulo');
            params.push(`%,${vlanId},%`);
            clauses.push(`(',' || dp.scope_value || ',') LIKE $${params.length}`);
        }

        const { rows } = await pool.query(
            `
                ${policyRowSelect}
                WHERE ${clauses.join(' AND ')}
                GROUP BY dp.id
                ORDER BY dp.enabled DESC, dp.updated_at DESC, dp.created_at DESC
            `,
            params,
        );
        return rows.map((row) => this.mapRow(row));
    }

    async get(id: number) {
        await this.ensureReady();
        const client = await pool.connect();
        try {
            return await this.getPolicyForClient(client, id);
        } finally {
            client.release();
        }
    }

    async create(payload: any, requestedBy = 'system', auditContext: AuditContext = {}) {
        await this.ensureReady();
        const name = String(payload?.name || '').trim();
        if (!name) throw new Error('Nome da política obrigatório');
        const policyType = normalizePolicyType(payload?.policy_type || payload?.policyType || payload?.type);
        const scope = normalizeScope(payload);
        const entries = normalizePolicyEntryList(payload?.domains ?? payload?.entries);
        const governance = resolveGovernanceMetadata({
            ...payload,
            requested_by: payload?.requested_by || requestedBy,
        });
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(
                `
                    INSERT INTO domain_policies (
                        name,
                        policy_type,
                        scope_type,
                        scope_value,
                        enabled,
                        description,
                        governance_summary,
                        legal_basis,
                        requested_by,
                        approval_scope,
                        lifecycle_status,
                        review_date,
                        approved_by,
                        approved_at,
                        effective_from,
                        expires_at,
                        revoked_by,
                        revoked_at,
                        created_by,
                        updated_by
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $19)
                    RETURNING *
                `,
                [
                    name,
                    policyType,
                    scope.scopeType,
                    scope.scopeValue,
                    payload?.enabled ?? true,
                    payload?.description || null,
                    governance.summary || null,
                    governance.legal_basis,
                    governance.requested_by,
                    governance.approval_scope,
                    governance.lifecycle_status,
                    governance.review_date,
                    governance.approved_by,
                    governance.approved_at,
                    governance.effective_from,
                    governance.expires_at,
                    governance.revoked_by,
                    governance.revoked_at,
                    requestedBy,
                ],
            );
            await this.replaceEntries(client, rows[0].id, entries);
            const synced = await this.syncLegacyRows(client, rows[0].id);
            await this.recordPolicyAudit(client, {
                policyId: rows[0].id,
                action: 'domain_policy:create',
                requestedBy,
                auditContext,
                payload,
                result: synced,
                success: true,
                message: 'Política nomeada criada',
            });
            await client.query('COMMIT');
            return synced;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async update(id: number, payload: any, requestedBy = 'system', auditContext: AuditContext = {}) {
        await this.ensureReady();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const current = await this.getPolicyForClient(client, id);
            const name = String(payload?.name ?? current.name).trim();
            if (!name) throw new Error('Nome da política obrigatório');
            const policyType = payload?.policy_type || payload?.policyType || payload?.type
                ? normalizePolicyType(payload?.policy_type || payload?.policyType || payload?.type)
                : current.policy_type;
            const scope = normalizeScope(payload, current);
            const entries = payload?.domains !== undefined || payload?.entries !== undefined
                ? normalizePolicyEntryList(payload?.domains ?? payload?.entries)
                : current.entries;
            const governance = resolveGovernanceMetadata({
                ...payload,
                requested_by: payload?.requested_by || current.requested_by || requestedBy,
            }, current);

            await client.query(
                `
                    UPDATE domain_policies
                    SET name = $1,
                        policy_type = $2,
                        scope_type = $3,
                        scope_value = $4,
                        enabled = $5,
                        description = $6,
                        governance_summary = $7,
                        legal_basis = $8,
                        requested_by = $9,
                        approval_scope = $10,
                        lifecycle_status = $11,
                        review_date = $12,
                        approved_by = $13,
                        approved_at = $14,
                        effective_from = $15,
                        expires_at = $16,
                        revoked_by = $17,
                        revoked_at = $18,
                        updated_by = $19,
                        updated_at = NOW()
                    WHERE id = $20
                `,
                [
                    name,
                    policyType,
                    scope.scopeType,
                    scope.scopeValue,
                    payload?.enabled ?? current.enabled,
                    payload?.description ?? current.description,
                    governance.summary || null,
                    governance.legal_basis,
                    governance.requested_by,
                    governance.approval_scope,
                    governance.lifecycle_status,
                    governance.review_date,
                    governance.approved_by,
                    governance.approved_at,
                    governance.effective_from,
                    governance.expires_at,
                    governance.revoked_by,
                    governance.revoked_at,
                    requestedBy,
                    id,
                ],
            );
            await this.replaceEntries(client, id, entries);
            const synced = await this.syncLegacyRows(client, id);
            await this.recordPolicyAudit(client, {
                policyId: id,
                action: 'domain_policy:update',
                requestedBy,
                auditContext,
                payload,
                result: synced,
                success: true,
                message: 'Política nomeada atualizada',
            });
            await client.query('COMMIT');
            return synced;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async duplicate(id: number, requestedBy = 'system', auditContext: AuditContext = {}) {
        await this.ensureReady();
        const source = await this.get(id);
        return this.create({
            name: `${source.name} - cópia`,
            policy_type: source.policy_type,
            scope_type: source.scope_type,
            scope_value: source.scope_value,
            enabled: false,
            description: source.description,
            governance_summary: source.governance_summary,
            legal_basis: source.legal_basis,
            requested_by: source.requested_by,
            approval_scope: source.approval_scope,
            lifecycle_status: source.lifecycle_status,
            review_date: source.review_date,
            approved_by: source.approved_by,
            approved_at: source.approved_at,
            effective_from: source.effective_from,
            expires_at: source.expires_at,
            revoked_by: source.revoked_by,
            revoked_at: source.revoked_at,
            domains: (source.entries || []).map((entry: any) => entry.domain || entry.normalized_domain),
        }, requestedBy, auditContext);
    }

    async toggle(id: number, requestedBy = 'system', auditContext: AuditContext = {}) {
        await this.ensureReady();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE domain_policies SET enabled = NOT enabled, updated_by = $1, updated_at = NOW() WHERE id = $2`,
                [requestedBy, id],
            );
            const synced = await this.syncLegacyRows(client, id);
            await this.recordPolicyAudit(client, {
                policyId: id,
                action: 'domain_policy:toggle',
                requestedBy,
                auditContext,
                payload: { id },
                result: synced,
                success: true,
                message: synced.enabled ? 'Política ativada' : 'Política desativada',
            });
            await client.query('COMMIT');
            return synced;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async delete(id: number, requestedBy = 'system', auditContext: AuditContext = {}) {
        await this.ensureReady();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const current = await this.getPolicyForClient(client, id);
            await client.query(`DELETE FROM blocking_policies WHERE domain_policy_id = $1`, [id]);
            await client.query(`DELETE FROM release_policies WHERE domain_policy_id = $1`, [id]);
            await client.query(`DELETE FROM domain_policies WHERE id = $1`, [id]);
            await this.recordPolicyAudit(client, {
                policyId: id,
                action: 'domain_policy:delete',
                requestedBy,
                auditContext,
                payload: { id },
                result: current,
                success: true,
                message: 'Política nomeada excluída',
            });
            await client.query('COMMIT');
            return current;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

export const domainPolicyManagerService = new DomainPolicyManagerService();
