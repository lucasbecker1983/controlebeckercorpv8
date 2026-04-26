import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';
import { env } from '../config/env';
import { runCommand } from '../utils/process';
import { filterOperationalVlans, isManagedBlockingIp, isManagedBlockingVlan } from './blocking-release-scope';
import { policyCompilerService } from './policy-compiler-service';

type ContingencyStatus = 'normal' | 'active' | 'expired' | 'error';
type ContingencyScopeType = 'global' | 'vlan';
type ResolverProvider = 'google' | 'cloudflare' | 'quad9' | 'opendns';

type VlanRow = {
    vlan_id: number;
    label: string;
    interface_name: string;
    subnet_cidr: string;
    blocking_enabled: boolean;
    monitoring_enabled: boolean;
};

type VipBypassRow = {
    ip: string;
    vlan_id: number | null;
};

const BEGIN_MARKER = '# BEGIN DNS_EMERGENCY_V8';
const END_MARKER = '# END DNS_EMERGENCY_V8';
const EARLY_BEGIN_MARKER = '# BEGIN BECKERCORP_EARLY_FORWARD';
const EARLY_END_MARKER = '# END BECKERCORP_EARLY_FORWARD';
const CHAIN_NAME = 'DNS_EMERGENCY_V8';
const DEFAULT_PROVIDERS: ResolverProvider[] = ['google', 'cloudflare', 'quad9'];
const PERMANENT_WORK_DNS_PROVIDERS: ResolverProvider[] = ['opendns'];

const RESOLVER_CATALOG: Record<ResolverProvider, { label: string; addresses: string[] }> = {
    google: { label: 'Google Public DNS', addresses: ['8.8.8.8', '8.8.4.4'] },
    cloudflare: { label: 'Cloudflare', addresses: ['1.1.1.1', '1.0.0.1'] },
    quad9: { label: 'Quad9 Secure', addresses: ['9.9.9.9', '149.112.112.112'] },
    opendns: { label: 'OpenDNS / Cisco Umbrella', addresses: ['208.67.222.222', '208.67.220.220'] },
};

const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));
const normalizeProviders = (items: unknown): ResolverProvider[] => {
    const requested = Array.isArray(items) ? items : [];
    const normalized = requested
        .map((item) => String(item || '').trim().toLowerCase())
        .filter((item): item is ResolverProvider => item === 'google' || item === 'cloudflare' || item === 'quad9' || item === 'opendns');
    return normalized.length ? Array.from(new Set(normalized)) : [...DEFAULT_PROVIDERS];
};

const normalizeDuration = (value: unknown) => {
    if (value === null || value === undefined || value === '' || value === 'manual') return null;
    const parsed = Number(value);
    if ([15, 30, 60].includes(parsed)) return parsed;
    throw new Error('Duração inválida. Use 15, 30, 60 ou manual.');
};

const normalizeVlanIds = (value: unknown) => {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)));
};

const formatRemainingSeconds = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.floor(diffMs / 1000));
};

class DnsContingencyService {
    readonly healthDomain = 'cloudflare.com';
    readonly providerLabels = Object.fromEntries(Object.entries(RESOLVER_CATALOG).map(([key, value]) => [key, value.label]));
    readonly retryIntervalMs = 60_000;
    readonly blockFile = env.ufwBeforeRulesFile;
    interval: NodeJS.Timeout | null = null;

    async ensureSchema() {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS dns_contingency_state (
                id INTEGER PRIMARY KEY DEFAULT 1,
                status VARCHAR(32) NOT NULL DEFAULT 'normal',
                scope_type VARCHAR(16) NOT NULL DEFAULT 'global',
                vlan_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
                providers JSONB NOT NULL DEFAULT '[]'::jsonb,
                resolvers JSONB NOT NULL DEFAULT '[]'::jsonb,
                reason TEXT,
                impact_summary TEXT,
                requested_by VARCHAR(128),
                activated_at TIMESTAMPTZ,
                expires_at TIMESTAMPTZ,
                deactivated_at TIMESTAMPTZ,
                last_test JSONB NOT NULL DEFAULT '{}'::jsonb,
                last_error TEXT,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS dns_contingency_audit (
                id BIGSERIAL PRIMARY KEY,
                action VARCHAR(64) NOT NULL,
                requested_by VARCHAR(128) NOT NULL DEFAULT 'system',
                scope_type VARCHAR(16),
                vlan_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
                providers JSONB NOT NULL DEFAULT '[]'::jsonb,
                resolvers JSONB NOT NULL DEFAULT '[]'::jsonb,
                reason TEXT,
                result JSONB NOT NULL DEFAULT '{}'::jsonb,
                success BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            INSERT INTO dns_contingency_state (id, status, scope_type, vlan_ids, providers, resolvers, last_test)
            VALUES (1, 'normal', 'global', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb)
            ON CONFLICT (id) DO NOTHING;
        `);
    }

    async bootstrap() {
        await this.ensureSchema();
        await this.reconcileExpired();
        await this.ensureFirewallState();
        if (!this.interval) {
            this.interval = setInterval(() => {
                this.reconcileExpired()
                    .then(() => this.ensureFirewallState())
                    .catch((error) => console.error('[DNS CONTINGENCY] Falha no reconciler:', error));
            }, this.retryIntervalMs);
        }
    }

    async getStateRow() {
        await this.ensureSchema();
        const { rows } = await pool.query(`SELECT * FROM dns_contingency_state WHERE id = 1`);
        return rows[0];
    }

    async updateState(patch: Record<string, unknown>) {
        const current = await this.getStateRow();
        const next = { ...current, ...patch };
        await pool.query(
            `
                UPDATE dns_contingency_state
                SET status = $1,
                    scope_type = $2,
                    vlan_ids = $3::jsonb,
                    providers = $4::jsonb,
                    resolvers = $5::jsonb,
                    reason = $6,
                    impact_summary = $7,
                    requested_by = $8,
                    activated_at = $9,
                    expires_at = $10,
                    deactivated_at = $11,
                    last_test = $12::jsonb,
                    last_error = $13,
                    updated_at = NOW()
                WHERE id = 1
            `,
            [
                next.status || 'normal',
                next.scope_type || 'global',
                JSON.stringify(next.vlan_ids || []),
                JSON.stringify(next.providers || []),
                JSON.stringify(next.resolvers || []),
                next.reason || null,
                next.impact_summary || null,
                next.requested_by || null,
                next.activated_at || null,
                next.expires_at || null,
                next.deactivated_at || null,
                JSON.stringify(next.last_test || {}),
                next.last_error || null,
            ],
        );
    }

    async recordAudit(input: {
        action: string;
        requestedBy: string;
        scopeType?: string;
        vlanIds?: number[];
        providers?: ResolverProvider[];
        resolvers?: string[];
        reason?: string | null;
        result?: Record<string, unknown>;
        success: boolean;
    }) {
        await pool.query(
            `
                INSERT INTO dns_contingency_audit (
                    action,
                    requested_by,
                    scope_type,
                    vlan_ids,
                    providers,
                    resolvers,
                    reason,
                    result,
                    success
                )
                VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8::jsonb, $9)
            `,
            [
                input.action,
                input.requestedBy,
                input.scopeType || null,
                JSON.stringify(input.vlanIds || []),
                JSON.stringify(input.providers || []),
                JSON.stringify(input.resolvers || []),
                input.reason || null,
                JSON.stringify(input.result || {}),
                input.success,
            ],
        );
    }

    async listOperationalVlans() {
        const { rows } = await pool.query(
            `
                SELECT vlan_id, label, interface_name, subnet_cidr, blocking_enabled, monitoring_enabled
                FROM vlan_policies
                WHERE monitoring_enabled = TRUE
                ORDER BY vlan_id ASC
            `,
        ).catch(() => ({ rows: [] as VlanRow[] }));
        return filterOperationalVlans(rows as VlanRow[]);
    }

    async listConfiguredVlans() {
        const { rows } = await pool.query(
            `
                SELECT vlan_id, label, interface_name, subnet_cidr, blocking_enabled, monitoring_enabled
                FROM vlan_policies
                WHERE interface_name IS NOT NULL
                  AND TRIM(interface_name) <> ''
                ORDER BY vlan_id ASC
            `,
        ).catch(() => ({ rows: [] as VlanRow[] }));

        const seen = new Set<string>();
        return (rows as VlanRow[])
            .filter((row) => row.interface_name && row.subnet_cidr)
            .filter((row) => {
                const key = String(row.interface_name).trim();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    async listVipBypassRows(): Promise<VipBypassRow[]> {
        const { rows } = await pool.query(
            `
                SELECT host(ip) AS ip, vlan_id
                FROM policy_exceptions
                WHERE active = TRUE
                  AND (valid_until IS NULL OR valid_until >= NOW())
                ORDER BY id ASC
            `,
        ).catch(() => ({ rows: [] as Array<{ ip: string; vlan_id: number | null }> }));

        const seen = new Set<string>();
        return rows
            .filter((row) => isManagedBlockingVlan(row.vlan_id) || isManagedBlockingIp(row.ip))
            .map((row) => ({
                ip: String(row.ip || '').trim(),
                vlan_id: row.vlan_id === null || row.vlan_id === undefined ? null : Number(row.vlan_id),
            }))
            .filter((row) => {
                if (!row.ip) return false;
                const key = `${row.ip}|${row.vlan_id || ''}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    async listVipBypassCidrs() {
        return unique((await this.listVipBypassRows()).map((row) => row.ip));
    }

    getResolverAddresses(providers: ResolverProvider[]) {
        return unique(providers.flatMap((provider) => RESOLVER_CATALOG[provider].addresses));
    }

    stripManagedBlock(content: string) {
        const pattern = new RegExp(`${BEGIN_MARKER}[\\s\\S]*?${END_MARKER}\\n?`, 'g');
        return content.replace(pattern, '').trimEnd();
    }

    stripEarlyManagedBlock(content: string) {
        const managedPattern = new RegExp(`\\n?${EARLY_BEGIN_MARKER}[\\s\\S]*?${EARLY_END_MARKER}\\n?`, 'g');
        const legacyManualPattern = /\n?# BeckerCorp VIPs: bypass total antes dos bloqueios comuns\.[\s\S]*?# quickly process packets for which we already have a connection/g;
        return content
            .replace(managedPattern, '\n')
            .replace(legacyManualPattern, '\n# quickly process packets for which we already have a connection')
            .replace(/\n{3,}/g, '\n\n');
    }

    injectEarlyManagedBlock(content: string, block: string) {
        const stripped = this.stripEarlyManagedBlock(content);
        const anchor = '# quickly process packets for which we already have a connection';
        if (stripped.includes(anchor)) {
            return stripped.replace(anchor, `${block}\n${anchor}`);
        }
        return `${stripped.trimEnd()}\n\n${block}\n`;
    }

    injectManagedBlock(content: string, block: string) {
        const stripped = this.stripManagedBlock(content);
        return `${stripped}\n\n${block}\n`;
    }

    async readFirewallConfig() {
        return fs.readFileSync(this.blockFile, 'utf8');
    }

    async validateFirewallConfig(content: string) {
        await runCommand('iptables-restore', ['--test'], {
            elevated: true,
            input: content,
        });
    }

    buildEarlyFirewallBlock(vipBypassRows: VipBypassRow[]) {
        const vipIps = unique(vipBypassRows.map((vip) => vip.ip));
        const lines = [
            EARLY_BEGIN_MARKER,
            '# VIPs sempre saem antes dos bloqueios comuns; nao exige DNS externo.',
            ...vipIps.map((ip) => `-A ufw-before-forward -s ${ip} -o ${env.wanInterface} -j ACCEPT`),
            '',
            '# WhatsApp/Web WhatsApp compartilha infraestrutura Meta; nao bloquear faixas Meta ou portas push aqui.',
            '# Redes sociais ficam bloqueadas por Unbound/RPZ e ACLs de dominio para preservar WhatsApp.',
            `-A ufw-before-forward -i enp6s0+ -o ${env.wanInterface} -d 149.154.160.0/20 -j DROP`,
            `-A ufw-before-forward -i enp6s0+ -o ${env.wanInterface} -d 91.108.4.0/22 -j DROP`,
            `-A ufw-before-forward -i enp6s0+ -o ${env.wanInterface} -d 91.108.8.0/21 -j DROP`,
            `-A ufw-before-forward -i enp6s0+ -o ${env.wanInterface} -d 91.108.16.0/21 -j DROP`,
            `-A ufw-before-forward -i enp6s0+ -o ${env.wanInterface} -d 91.108.56.0/22 -j DROP`,
            EARLY_END_MARKER,
        ];
        return lines.join('\n');
    }

    async applyFirewallBlock(block: string, vipBypassRows: VipBypassRow[]) {
        const original = await this.readFirewallConfig();
        const withEarlyBlock = this.injectEarlyManagedBlock(original, this.buildEarlyFirewallBlock(vipBypassRows));
        const candidate = this.injectManagedBlock(withEarlyBlock, block);
        await this.validateFirewallConfig(candidate);
        fs.writeFileSync(this.blockFile, candidate);
        await runCommand('ufw', ['reload'], { elevated: true });
        return { original, candidate };
    }

    async getScopedVlans(scopeType: ContingencyScopeType, vlanIds: number[]) {
        const vlans = await this.listOperationalVlans();
        if (scopeType === 'global') return vlans;
        const selected = vlans.filter((row) => vlanIds.includes(Number(row.vlan_id)));
        if (!selected.length) throw new Error('Nenhuma VLAN operacional válida foi selecionada para a contingência.');
        return selected;
    }

    async buildFirewallBlock() {
        const state = await this.getStateRow();
        const operationalVlans = await this.listOperationalVlans();
        const configuredVlans = await this.listConfiguredVlans();
        const vipBypassRows = await this.listVipBypassRows();
        const active = state.status === 'active';
        const scopedVlans = active
            ? await this.getScopedVlans(state.scope_type as ContingencyScopeType, normalizeVlanIds(state.vlan_ids))
            : [];
        const resolverAddresses = active ? this.getResolverAddresses(normalizeProviders(state.providers)) : [];
        const permanentWorkDnsResolvers = this.getResolverAddresses(PERMANENT_WORK_DNS_PROVIDERS);
        const lines = [
            BEGIN_MARKER,
            '*filter',
            `:${CHAIN_NAME} - [0:0]`,
            `-A ufw-before-forward -j ${CHAIN_NAME}`,
        ];

        for (const vlan of operationalVlans) {
            const vlanVips = vipBypassRows.filter((vip) => !vip.vlan_id || vip.vlan_id === vlan.vlan_id);
            for (const vip of vlanVips) {
                lines.push(`-A ${CHAIN_NAME} -i ${vlan.interface_name} -s ${vip.ip} -o ${env.wanInterface} -j ACCEPT`);
            }
        }

        for (const vlan of configuredVlans) {
            for (const resolver of permanentWorkDnsResolvers) {
                lines.push(`-A ${CHAIN_NAME} -i ${vlan.interface_name} -o ${env.wanInterface} -d ${resolver} -p udp --dport 53 -j ACCEPT`);
                lines.push(`-A ${CHAIN_NAME} -i ${vlan.interface_name} -o ${env.wanInterface} -d ${resolver} -p tcp --dport 53 -j ACCEPT`);
            }
        }

        for (const vlan of scopedVlans) {
            for (const resolver of resolverAddresses) {
                lines.push(`-A ${CHAIN_NAME} -i ${vlan.interface_name} -o ${env.wanInterface} -d ${resolver} -p udp --dport 53 -j ACCEPT`);
                lines.push(`-A ${CHAIN_NAME} -i ${vlan.interface_name} -o ${env.wanInterface} -d ${resolver} -p tcp --dport 53 -j ACCEPT`);
            }
        }

        for (const vlan of operationalVlans) {
            const vlanVips = vipBypassRows.filter((vip) => !vip.vlan_id || vip.vlan_id === vlan.vlan_id);
            for (const vip of vlanVips) {
                lines.push(`-A ${CHAIN_NAME} -i ${vlan.interface_name} -s ${vip.ip} -o ${env.wanInterface} -p udp --dport 53 -j ACCEPT`);
                lines.push(`-A ${CHAIN_NAME} -i ${vlan.interface_name} -s ${vip.ip} -o ${env.wanInterface} -p tcp --dport 53 -j ACCEPT`);
            }
        }

        for (const vlan of operationalVlans) {
            lines.push(`-A ${CHAIN_NAME} -i ${vlan.interface_name} -o ${env.wanInterface} -p udp --dport 53 -j DROP`);
            lines.push(`-A ${CHAIN_NAME} -i ${vlan.interface_name} -o ${env.wanInterface} -p tcp --dport 53 -j DROP`);
        }

        lines.push(`-A ${CHAIN_NAME} -j RETURN`);
        lines.push('COMMIT');
        lines.push(END_MARKER);
        return `${lines.join('\n')}\n`;
    }

    async ensureFirewallState() {
        const block = await this.buildFirewallBlock();
        const vipBypassRows = await this.listVipBypassRows();
        return this.applyFirewallBlock(block, vipBypassRows);
    }

    async verifyRuntime() {
        const compiler = policyCompilerService.inspectManifest();
        const [unboundCheck, unboundActive, realResolution] = await Promise.all([
            runCommand('unbound-checkconf', [], { elevated: true, allowFailure: true }),
            runCommand('systemctl', ['is-active', 'unbound'], { elevated: true, allowFailure: true }),
            runCommand('dig', ['+short', '@127.0.0.1', this.healthDomain], { elevated: true, allowFailure: true }),
        ]);

        const healthy = unboundCheck.code === 0
            && (unboundActive.stdout || '').trim() === 'active'
            && Boolean((realResolution.stdout || '').trim())
            && compiler.compilerIncludeLoaded
            && compiler.rpzReferencesOk
            && compiler.filesMatchManifest;

        return {
            healthy,
            checks: {
                unbound_checkconf: unboundCheck.code === 0,
                unbound_active: (unboundActive.stdout || '').trim() === 'active',
                real_resolution: Boolean((realResolution.stdout || '').trim()),
                include_loaded: compiler.compilerIncludeLoaded,
                manifest_aligned: compiler.filesMatchManifest,
                rpz_references_ok: compiler.rpzReferencesOk,
            },
            outputs: {
                unbound_checkconf: unboundCheck.stderr || unboundCheck.stdout,
                unbound_active: (unboundActive.stdout || '').trim() || 'unknown',
                real_resolution: (realResolution.stdout || '').trim(),
            },
            recommendation: healthy
                ? 'Unbound saudável; contingência não sugerida.'
                : 'Unbound degradado ou desalinhado; contingência manual pode ser usada temporariamente.',
        };
    }

    async reconcileExpired() {
        const state = await this.getStateRow();
        if (state.status !== 'active' || !state.expires_at) return state;
        if (new Date(state.expires_at).getTime() > Date.now()) return state;

        await this.updateState({
            status: 'expired',
            deactivated_at: new Date().toISOString(),
            last_error: null,
        });
        await this.recordAudit({
            action: 'expired',
            requestedBy: state.requested_by || 'system',
            scopeType: state.scope_type,
            vlanIds: normalizeVlanIds(state.vlan_ids),
            providers: normalizeProviders(state.providers),
            resolvers: this.getResolverAddresses(normalizeProviders(state.providers)),
            reason: state.reason,
            result: { expires_at: state.expires_at },
            success: true,
        });
        return this.getStateRow();
    }

    async getStatus() {
        await this.reconcileExpired();
        const state = await this.getStateRow();
        const runtime = await this.verifyRuntime();
        const operationalVlans = await this.listOperationalVlans();
        const vlanIds = normalizeVlanIds(state.vlan_ids);
        const providers = normalizeProviders(state.providers);
        const activeResolvers = this.getResolverAddresses(providers);
        const scopedVlans = state.scope_type === 'global'
            ? operationalVlans.map((row) => row.vlan_id)
            : vlanIds;
        const remainingSeconds = formatRemainingSeconds(state.expires_at);

        return {
            chain: CHAIN_NAME,
            status: state.status as ContingencyStatus,
            scope_type: state.scope_type as ContingencyScopeType,
            vlan_ids: vlanIds,
            scoped_vlans: scopedVlans,
            providers,
            provider_labels: providers.map((provider) => this.providerLabels[provider]),
            resolvers: activeResolvers,
            permanent_work_dns_resolvers: this.getResolverAddresses(PERMANENT_WORK_DNS_PROVIDERS),
            activated_at: state.activated_at,
            expires_at: state.expires_at,
            deactivated_at: state.deactivated_at,
            requested_by: state.requested_by,
            reason: state.reason,
            impact_summary: state.impact_summary,
            remaining_seconds: remainingSeconds,
            mode_label: state.status === 'active'
                ? 'Contingência ativa'
                : state.status === 'expired'
                    ? 'Contingência expirada'
                    : state.status === 'error'
                        ? 'Erro'
                        : 'Normal',
            runtime,
            catalog: Object.entries(RESOLVER_CATALOG).map(([key, value]) => ({
                key,
                label: value.label,
                addresses: value.addresses,
            })),
        };
    }

    async activate(payload: any, requestedBy = 'system') {
        await this.ensureSchema();
        const scopeType = String(payload?.scope_type || payload?.scopeType || 'global') === 'vlan' ? 'vlan' : 'global';
        const vlanIds = normalizeVlanIds(payload?.vlan_ids || payload?.vlanIds);
        const providers = normalizeProviders(payload?.providers);
        const resolvers = this.getResolverAddresses(providers);
        const durationMinutes = normalizeDuration(payload?.duration_minutes ?? payload?.durationMinutes);
        const reason = String(payload?.reason || '').trim();
        if (!reason) throw new Error('Motivo obrigatório para ativar a contingência DNS.');

        const scopedVlans = await this.getScopedVlans(scopeType, vlanIds);
        const now = new Date();
        const expiresAt = durationMinutes ? new Date(now.getTime() + (durationMinutes * 60 * 1000)).toISOString() : null;
        const impactSummary = scopeType === 'global'
            ? 'Fallback DNS público liberado globalmente; enforcement DNS degradado temporariamente.'
            : `Fallback DNS público liberado para VLAN ${scopedVlans.map((row) => row.vlan_id).join(', ')}; enforcement DNS degradado temporariamente.`;

        try {
            await this.updateState({
                status: 'active',
                scope_type: scopeType,
                vlan_ids: scopedVlans.map((row) => row.vlan_id),
                providers,
                resolvers,
                reason,
                impact_summary: impactSummary,
                requested_by: requestedBy,
                activated_at: now.toISOString(),
                expires_at: expiresAt,
                deactivated_at: null,
                last_error: null,
            });
            await this.ensureFirewallState();
            const status = await this.getStatus();
            await this.recordAudit({
                action: 'activate',
                requestedBy,
                scopeType,
                vlanIds: scopedVlans.map((row) => row.vlan_id),
                providers,
                resolvers,
                reason,
                result: status,
                success: true,
            });
            return status;
        } catch (error: any) {
            await this.updateState({
                status: 'error',
                last_error: error.message || String(error),
            });
            await this.recordAudit({
                action: 'activate',
                requestedBy,
                scopeType,
                vlanIds,
                providers,
                resolvers,
                reason,
                result: { error: error.message || String(error) },
                success: false,
            });
            throw error;
        }
    }

    async deactivate(requestedBy = 'system', reason = 'Retorno ao modo normal') {
        const current = await this.getStateRow();
        await this.updateState({
            status: 'normal',
            scope_type: 'global',
            vlan_ids: [],
            providers: [],
            resolvers: [],
            reason,
            impact_summary: 'Clientes voltaram a usar o DNS interno com enforcement principal no Unbound.',
            requested_by: requestedBy,
            deactivated_at: new Date().toISOString(),
            expires_at: null,
            last_error: null,
        });
        await this.ensureFirewallState();
        const status = await this.getStatus();
        await this.recordAudit({
            action: 'deactivate',
            requestedBy,
            scopeType: current.scope_type,
            vlanIds: normalizeVlanIds(current.vlan_ids),
            providers: normalizeProviders(current.providers),
            resolvers: this.getResolverAddresses(normalizeProviders(current.providers)),
            reason,
            result: status,
            success: true,
        });
        return status;
    }

    async renew(payload: any, requestedBy = 'system') {
        const current = await this.getStateRow();
        if (current.status !== 'active') throw new Error('Não há contingência ativa para renovar.');
        const durationMinutes = normalizeDuration(payload?.duration_minutes ?? payload?.durationMinutes);
        const expiresAt = durationMinutes ? new Date(Date.now() + (durationMinutes * 60 * 1000)).toISOString() : null;
        await this.updateState({
            expires_at: expiresAt,
            requested_by: requestedBy,
            reason: String(payload?.reason || current.reason || 'Renovação manual da contingência DNS'),
            last_error: null,
        });
        const status = await this.getStatus();
        await this.recordAudit({
            action: 'renew',
            requestedBy,
            scopeType: current.scope_type,
            vlanIds: normalizeVlanIds(current.vlan_ids),
            providers: normalizeProviders(current.providers),
            resolvers: this.getResolverAddresses(normalizeProviders(current.providers)),
            reason: status.reason,
            result: status,
            success: true,
        });
        return status;
    }

    async testResolvers() {
        const targets = Object.entries(RESOLVER_CATALOG).flatMap(([provider, metadata]) =>
            metadata.addresses.map((resolver) => ({ provider, resolver })),
        );

        const results = [];
        for (const target of targets) {
            const probe = await runCommand('dig', ['+time=2', '+tries=1', `@${target.resolver}`, this.healthDomain, 'A', '+short'], {
                elevated: true,
                allowFailure: true,
            });
            results.push({
                provider: target.provider,
                resolver: target.resolver,
                ok: probe.code === 0 && Boolean((probe.stdout || '').trim()),
                stdout: (probe.stdout || '').trim(),
                stderr: (probe.stderr || '').trim(),
            });
        }

        await this.updateState({
            last_test: {
                tested_at: new Date().toISOString(),
                results,
            },
        });

        return {
            tested_at: new Date().toISOString(),
            results,
        };
    }

    async listAudit() {
        const { rows } = await pool.query(`SELECT * FROM dns_contingency_audit ORDER BY created_at DESC LIMIT 200`);
        return rows;
    }
}

export const dnsContingencyService = new DnsContingencyService();
