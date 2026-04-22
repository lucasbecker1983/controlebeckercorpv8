import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { ensureBlockingReleaseSchema } from './blocking-release-schema-service';
import { isManagedBlockingVlan } from './blocking-release-scope';

type PolicyType = 'allow' | 'block';
type ScopeType = 'global' | 'vlan';

const normalizeDomain = (value: string) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/^\*\./, '')
    .replace(/\.$/, '');

const isValidDomain = (domain: string) => {
    if (!domain || domain.length > 255) return false;
    if (domain.includes('..') || domain.startsWith('.') || domain.endsWith('.')) return false;
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain);
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
                    'normalized_domain', dpe.normalized_domain,
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
    async ensureReady() {
        await ensureBlockingReleaseSchema();
    }

    private mapRow(row: any) {
        const scopeValues = row.scope_type === 'vlan'
            ? String(row.scope_value || '').split(',').map((item) => item.trim()).filter(Boolean)
            : ['global'];
        return {
            ...row,
            scope_values: scopeValues,
            vlan_ids: row.scope_type === 'vlan' ? scopeValues.map(Number).filter(Number.isFinite) : [],
            domains: (row.entries || []).map((entry: any) => entry.normalized_domain || entry.domain),
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
    }

    private async replaceEntries(client: PoolClient, policyId: number, domains: string[]) {
        await client.query(`DELETE FROM domain_policy_entries WHERE policy_id = $1`, [policyId]);
        for (const domain of domains) {
            await client.query(
                `
                    INSERT INTO domain_policy_entries (policy_id, domain, normalized_domain)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (policy_id, normalized_domain) DO UPDATE SET
                        domain = EXCLUDED.domain,
                        updated_at = NOW()
                `,
                [policyId, domain, domain],
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
        const description = policy.description || `Política nomeada: ${policy.name}`;
        const originRule = `domain_policy:${policy.id}`;

        for (const scopeValue of scopeValues) {
            for (const domain of policy.domains) {
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

    async create(payload: any, requestedBy = 'system') {
        await this.ensureReady();
        const name = String(payload?.name || '').trim();
        if (!name) throw new Error('Nome da política obrigatório');
        const policyType = normalizePolicyType(payload?.policy_type || payload?.policyType || payload?.type);
        const scope = normalizeScope(payload);
        const domains = normalizeDomainList(payload?.domains ?? payload?.entries);
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
                        created_by,
                        updated_by
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
                    RETURNING *
                `,
                [
                    name,
                    policyType,
                    scope.scopeType,
                    scope.scopeValue,
                    payload?.enabled ?? true,
                    payload?.description || null,
                    requestedBy,
                ],
            );
            await this.replaceEntries(client, rows[0].id, domains);
            const synced = await this.syncLegacyRows(client, rows[0].id);
            await this.recordPolicyAudit(client, {
                policyId: rows[0].id,
                action: 'domain_policy:create',
                requestedBy,
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

    async update(id: number, payload: any, requestedBy = 'system') {
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
            const domains = payload?.domains !== undefined || payload?.entries !== undefined
                ? normalizeDomainList(payload?.domains ?? payload?.entries)
                : current.domains;

            await client.query(
                `
                    UPDATE domain_policies
                    SET name = $1,
                        policy_type = $2,
                        scope_type = $3,
                        scope_value = $4,
                        enabled = $5,
                        description = $6,
                        updated_by = $7,
                        updated_at = NOW()
                    WHERE id = $8
                `,
                [
                    name,
                    policyType,
                    scope.scopeType,
                    scope.scopeValue,
                    payload?.enabled ?? current.enabled,
                    payload?.description ?? current.description,
                    requestedBy,
                    id,
                ],
            );
            await this.replaceEntries(client, id, domains);
            const synced = await this.syncLegacyRows(client, id);
            await this.recordPolicyAudit(client, {
                policyId: id,
                action: 'domain_policy:update',
                requestedBy,
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

    async duplicate(id: number, requestedBy = 'system') {
        await this.ensureReady();
        const source = await this.get(id);
        return this.create({
            name: `${source.name} - cópia`,
            policy_type: source.policy_type,
            scope_type: source.scope_type,
            scope_value: source.scope_value,
            enabled: false,
            description: source.description,
            domains: source.domains,
        }, requestedBy);
    }

    async toggle(id: number, requestedBy = 'system') {
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

    async delete(id: number, requestedBy = 'system') {
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
