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
const PONTORH_BEGIN_MARKER = '# BEGIN SGCG_PONTORH_OPENDNS';
const PONTORH_END_MARKER = '# END SGCG_PONTORH_OPENDNS';
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
const cidrGatewayIp = (cidr: string) => {
    const match = String(cidr || '').trim().match(/^(\d+)\.(\d+)\.(\d+)\.\d+\/\d+$/);
    if (!match) return '';
    return `${match[1]}.${match[2]}.${match[3]}.1`;
};

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
    readonly firewallRetryDelayMs = 1_500;
    readonly firewallRetryAttempts = 3;
    readonly blockFile = env.ufwBeforeRulesFile;
    interval: NodeJS.Timeout | null = null;
    firewallApplyPromise: Promise<any> | null = null;
    runtimeVipApplyPromise: Promise<any> | null = null;

    async sleep(ms: number) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

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
        await this.ensureFirewallStateWithRetry('bootstrap');
        if (!this.interval) {
            this.interval = setInterval(() => {
                this.reconcileExpired()
                    .then(() => this.ensureFirewallStateWithRetry('reconciler'))
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
                SELECT host(ip) AS ip, vlan_id, id AS sort_id
                FROM policy_exceptions
                WHERE active = TRUE
                  AND masklen(ip) = 32
                  AND (valid_until IS NULL OR valid_until >= NOW())
                UNION ALL
                SELECT host(cidr::inet) AS ip, NULL::integer AS vlan_id, id AS sort_id
                FROM dns_vip
                WHERE ativo = TRUE
                  AND masklen(cidr::inet) = 32
                ORDER BY sort_id ASC
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

    async listEmergencyVlanRows(): Promise<VlanRow[]> {
        const { rows: activeBypass } = await pool.query(
            `SELECT vlan_id FROM emergency_vlan_bypass
             WHERE active = TRUE AND (expires_at IS NULL OR expires_at >= NOW())`,
        ).catch(() => ({ rows: [] as Array<{ vlan_id: number }> }));
        if (!activeBypass.length) return [];
        const ids = activeBypass.map((r) => Number(r.vlan_id));
        const { rows } = await pool.query(
            `SELECT vlan_id, label, interface_name, subnet_cidr, blocking_enabled, monitoring_enabled
             FROM vlan_policies
             WHERE vlan_id = ANY($1::int[])
               AND interface_name IS NOT NULL AND TRIM(interface_name) <> ''
               AND subnet_cidr IS NOT NULL AND TRIM(subnet_cidr) <> ''`,
            [ids],
        ).catch(() => ({ rows: [] as VlanRow[] }));
        return rows as VlanRow[];
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

    stripPontorhManagedBlock(content: string) {
        const managedPattern = new RegExp(`\\n?${PONTORH_BEGIN_MARKER}[\\s\\S]*?${PONTORH_END_MARKER}\\n?`, 'g');
        return content.replace(managedPattern, '\n').replace(/\n{3,}/g, '\n\n');
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

    injectPontorhManagedBlock(content: string, block: string) {
        const stripped = this.stripPontorhManagedBlock(content);
        const anchor = '# FTP externo: publica 18121 na WAN e entrega ao ProFTPD local na 21.';
        if (stripped.includes(anchor)) {
            return stripped.replace(anchor, `${block}\n${anchor}`);
        }
        return `${stripped.trimEnd()}\n\n${block}\n`;
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

    async commandExists(command: string) {
        const result = await runCommand('sh', ['-lc', `command -v ${command}`], { allowFailure: true });
        return result.code === 0;
    }

    async ensureIptablesRule(table: string, chain: string, args: string[]) {
        const baseArgs = table === 'filter' ? [] : ['-t', table];
        const check = await runCommand('iptables', [...baseArgs, '-C', chain, ...args], { elevated: true, allowFailure: true });
        if (check.code === 0) return false;
        await runCommand('iptables', [...baseArgs, '-I', chain, '1', ...args], { elevated: true });
        return true;
    }

    async deleteAllIptablesRules(table: string, chain: string, args: string[]) {
        const baseArgs = table === 'filter' ? [] : ['-t', table];
        let removed = 0;
        while (true) {
            const result = await runCommand('iptables', [...baseArgs, '-D', chain, ...args], { elevated: true, allowFailure: true });
            if (result.code !== 0) break;
            removed += 1;
        }
        return removed;
    }

    async countRuntimeRulesWithComment(table: string, chain: string, comment: string) {
        const saved = await runCommand('iptables-save', ['-t', table], { elevated: true, allowFailure: true });
        return String(saved.stdout || '')
            .split('\n')
            .filter((line) => line.startsWith(`-A ${chain} `) && line.includes(comment))
            .length;
    }

    runtimeRuleKey(table: string, chain: string, args: string[]) {
        return `${table}/${chain} ${args.join(' ')}`;
    }

    async ensureOrderedIptablesRule(table: string, chain: string, args: string[], insertPosition = 1) {
        const baseArgs = table === 'filter' ? [] : ['-t', table];
        const check = await runCommand('iptables', [...baseArgs, '-C', chain, ...args], { elevated: true, allowFailure: true });
        if (check.code === 0) return false;
        await runCommand('iptables', [...baseArgs, '-I', chain, String(insertPosition), ...args], { elevated: true });
        return 'applied';
    }

    async applyRuntimeVipBypassRules(vipBypassRows: VipBypassRow[], emergencyVlans: VlanRow[] = []) {
        if (this.runtimeVipApplyPromise) return this.runtimeVipApplyPromise;

        this.runtimeVipApplyPromise = this.applyRuntimeVipBypassRulesLocked(vipBypassRows, emergencyVlans);
        try {
            return await this.runtimeVipApplyPromise;
        } finally {
            this.runtimeVipApplyPromise = null;
        }
    }

    async applyRuntimeVipBypassRulesLocked(vipBypassRows: VipBypassRow[], emergencyVlans: VlanRow[] = []) {
        const vipIps = unique(vipBypassRows.map((vip) => vip.ip));
        const configuredVlans = await this.listConfiguredVlans();
        const gatewayByVlanId = new Map(configuredVlans.map((vlan) => [Number(vlan.vlan_id), cidrGatewayIp(vlan.subnet_cidr)]));
        const fallbackLocalDnsTargets = unique([
            env.proxyDnsServerIp,
            env.proxyGatewayIp,
        ]);
        const activeVipSet = new Set(vipIps.map((ip) => `${ip}/32`));
        const activeEmergencySubnets = new Set(emergencyVlans.map((v) => v.subnet_cidr));
        const applied: string[] = [];
        const removed: string[] = [];
        const currentRules = await runCommand('iptables-save', ['-t', 'filter'], { elevated: true, allowFailure: true });
        const currentNatRules = await runCommand('iptables-save', ['-t', 'nat'], { elevated: true, allowFailure: true });
        const existingRuntimeRules = new Set<string>();
        const staleNatVipIps = new Set<string>();
        const natVipOrder = new Map<string, { firstRedirect: number | null; firstReturn: number | null }>();

        String(currentNatRules.stdout || '').split('\n').forEach((line, index) => {
            if (!line.includes('sgcg-vip-bypass') || !line.startsWith('-A PREROUTING ')) return;
            const ipMatch = line.match(/\s-s\s+(\d+\.\d+\.\d+\.\d+(?:\/32)?)\b/);
            const normalizedIp = ipMatch?.[1]?.includes('/') ? ipMatch[1] : `${ipMatch?.[1]}/32`;
            if (!normalizedIp || !activeVipSet.has(normalizedIp)) return;
            const state = natVipOrder.get(normalizedIp) || { firstRedirect: null, firstReturn: null };
            if (line.includes('-j REDIRECT') && line.includes(`--to-ports ${env.vipCleanDnsPort}`)) {
                state.firstRedirect = state.firstRedirect === null ? index : Math.min(state.firstRedirect, index);
            }
            if (line.includes('-j RETURN')) {
                state.firstReturn = state.firstReturn === null ? index : Math.min(state.firstReturn, index);
            }
            natVipOrder.set(normalizedIp, state);
        });

        for (const [ip, state] of natVipOrder.entries()) {
            if (state.firstReturn !== null && (state.firstRedirect === null || state.firstReturn < state.firstRedirect)) {
                staleNatVipIps.add(ip);
            }
        }

        for (const line of `${currentRules.stdout || ''}\n${currentNatRules.stdout || ''}`.split('\n')) {
            if (line.includes('sgcg-vip-bypass')) {
                const match = line.match(/^-A\s+(\S+)\s+(.+)$/);
                if (!match) continue;
                const ipMatch = line.match(/\s-[sd]\s+(\d+\.\d+\.\d+\.\d+(?:\/32)?)\b/);
                const normalizedIp = ipMatch?.[1]?.includes('/') ? ipMatch[1] : `${ipMatch?.[1]}/32`;
                if (normalizedIp && activeVipSet.has(normalizedIp) && !staleNatVipIps.has(normalizedIp)) continue;
                const args = match[2].trim().split(/\s+/);
                const table = line.includes('--to-ports') || match[1] === 'PREROUTING' ? 'nat' : 'filter';
                const key = this.runtimeRuleKey(table, match[1], args);
                existingRuntimeRules.add(key);
                const result = await runCommand('iptables', ['-t', table, '-D', match[1], ...args], { elevated: true, allowFailure: true });
                if (result.code === 0) {
                    existingRuntimeRules.delete(key);
                    removed.push(key);
                }
            }

            if (line.includes('sgcg-emergency-bypass')) {
                const match = line.match(/^-A\s+(\S+)\s+(.+)$/);
                if (!match) continue;
                const subnetMatch = line.match(/\s-[sd]\s+(\d+\.\d+\.\d+\.\d+\/\d+)\b/);
                const subnet = subnetMatch?.[1];
                if (subnet && activeEmergencySubnets.has(subnet)) continue;
                const args = match[2].trim().split(/\s+/);
                const result = await runCommand('iptables', ['-t', 'filter', '-D', match[1], ...args], { elevated: true, allowFailure: true });
                if (result.code === 0) removed.push(`${match[1]} ${args.join(' ')}`);
            }
        }

        for (const ip of vipIps) {
            const scopedLocalDnsTargets = unique(vipBypassRows
                .filter((vip) => vip.ip === ip)
                .map((vip) => (vip.vlan_id ? gatewayByVlanId.get(Number(vip.vlan_id)) || '' : ''))
                .filter(Boolean));
            const localDnsTargets = scopedLocalDnsTargets.length ? scopedLocalDnsTargets : fallbackLocalDnsTargets;
            const natInsertPosition = (await this.countRuntimeRulesWithComment('nat', 'PREROUTING', 'sgcg-total-vlan-block')) + 1;
            const filterInsertPosition = (await this.countRuntimeRulesWithComment('filter', 'FORWARD', 'sgcg-total-vlan-block')) + 1;
            const rules = [
                ['nat', 'PREROUTING', ['-s', ip, '-p', 'udp', '--dport', '53', '-m', 'comment', '--comment', 'sgcg-vip-bypass', '-j', 'RETURN'], natInsertPosition],
                ['nat', 'PREROUTING', ['-s', ip, '-p', 'tcp', '--dport', '53', '-m', 'comment', '--comment', 'sgcg-vip-bypass', '-j', 'RETURN'], natInsertPosition],
                ['nat', 'PREROUTING', ['-s', ip, '-m', 'comment', '--comment', 'sgcg-vip-bypass', '-j', 'RETURN'], natInsertPosition],
                ...localDnsTargets.flatMap((target) => ([
                    ['nat', 'PREROUTING', ['-s', ip, '-d', target, '-p', 'udp', '--dport', '53', '-m', 'comment', '--comment', 'sgcg-vip-bypass', '-j', 'REDIRECT', '--to-ports', String(env.vipCleanDnsPort)], natInsertPosition],
                    ['nat', 'PREROUTING', ['-s', ip, '-d', target, '-p', 'tcp', '--dport', '53', '-m', 'comment', '--comment', 'sgcg-vip-bypass', '-j', 'REDIRECT', '--to-ports', String(env.vipCleanDnsPort)], natInsertPosition],
                ] as Array<[string, string, string[], number]>)),
                ['filter', 'INPUT', ['-s', ip, '-p', 'udp', '--dport', '53', '-m', 'comment', '--comment', 'sgcg-vip-bypass', '-j', 'ACCEPT'], 1],
                ['filter', 'INPUT', ['-s', ip, '-p', 'tcp', '--dport', '53', '-m', 'comment', '--comment', 'sgcg-vip-bypass', '-j', 'ACCEPT'], 1],
                ['filter', 'INPUT', ['-s', ip, '-p', 'udp', '--dport', String(env.vipCleanDnsPort), '-m', 'comment', '--comment', 'sgcg-vip-bypass', '-j', 'ACCEPT'], 1],
                ['filter', 'INPUT', ['-s', ip, '-p', 'tcp', '--dport', String(env.vipCleanDnsPort), '-m', 'comment', '--comment', 'sgcg-vip-bypass', '-j', 'ACCEPT'], 1],
                ['filter', 'FORWARD', ['-s', ip, '-o', env.wanInterface, '-p', 'udp', '--dport', '53', '-m', 'comment', '--comment', 'sgcg-vip-bypass', '-j', 'ACCEPT'], filterInsertPosition],
                ['filter', 'FORWARD', ['-s', ip, '-o', env.wanInterface, '-p', 'tcp', '--dport', '53', '-m', 'comment', '--comment', 'sgcg-vip-bypass', '-j', 'ACCEPT'], filterInsertPosition],
                ['filter', 'FORWARD', ['-s', ip, '-o', env.wanInterface, '-p', 'tcp', '--dport', '853', '-m', 'comment', '--comment', 'sgcg-vip-bypass', '-j', 'ACCEPT'], filterInsertPosition],
                ['filter', 'FORWARD', ['-s', ip, '-o', env.wanInterface, '-p', 'tcp', '--dport', '443', '-m', 'comment', '--comment', 'sgcg-vip-bypass', '-j', 'ACCEPT'], filterInsertPosition],
                ['filter', 'FORWARD', ['-s', ip, '-o', env.wanInterface, '-p', 'udp', '--dport', '443', '-m', 'comment', '--comment', 'sgcg-vip-bypass', '-j', 'ACCEPT'], filterInsertPosition],
                ['filter', 'FORWARD', ['-s', ip, '-o', env.wanInterface, '-m', 'comment', '--comment', 'sgcg-vip-bypass', '-j', 'ACCEPT'], filterInsertPosition],
                ['filter', 'FORWARD', ['-d', ip, '-i', env.wanInterface, '-m', 'conntrack', '--ctstate', 'RELATED,ESTABLISHED', '-m', 'comment', '--comment', 'sgcg-vip-bypass', '-j', 'ACCEPT'], filterInsertPosition],
            ] as Array<[string, string, string[], number]>;

            for (const [table, chain, args, insertPosition] of rules) {
                const key = this.runtimeRuleKey(table, chain, args);
                if (existingRuntimeRules.has(key)) continue;
                const result = await this.ensureOrderedIptablesRule(table, chain, args, insertPosition);
                if (result) {
                    existingRuntimeRules.add(key);
                    applied.push(key);
                }
            }
        }

        for (const vlan of emergencyVlans) {
            const rules = [
                ['filter', 'FORWARD', ['-s', vlan.subnet_cidr, '-o', env.wanInterface, '-m', 'comment', '--comment', 'sgcg-emergency-bypass', '-j', 'ACCEPT']],
                ['filter', 'FORWARD', ['-d', vlan.subnet_cidr, '-i', env.wanInterface, '-m', 'conntrack', '--ctstate', 'RELATED,ESTABLISHED', '-m', 'comment', '--comment', 'sgcg-emergency-bypass', '-j', 'ACCEPT']],
                ['filter', 'FORWARD', ['-i', vlan.interface_name, '-p', 'tcp', '--dport', '853', '-m', 'comment', '--comment', 'sgcg-emergency-bypass', '-j', 'ACCEPT']],
            ] as Array<[string, string, string[]]>;
            for (const [table, chain, args] of rules) {
                if (await this.ensureIptablesRule(table, chain, args)) {
                    applied.push(`${table}/${chain} ${args.join(' ')}`);
                }
            }
        }

        return { mode: 'iptables-runtime', applied, removed, active_vips: vipIps };
    }

    async applyRuntimePontorhOpenDnsRules(configuredVlans: VlanRow[]) {
        const resolvers = this.getResolverAddresses(PERMANENT_WORK_DNS_PROVIDERS);
        const rules = configuredVlans.flatMap((vlan) => resolvers.flatMap((resolver) => ([
            ['nat', 'PREROUTING', ['-i', vlan.interface_name, '-d', resolver, '-p', 'udp', '--dport', '53', '-j', 'RETURN']],
            ['nat', 'PREROUTING', ['-i', vlan.interface_name, '-d', resolver, '-p', 'tcp', '--dport', '53', '-j', 'RETURN']],
        ] as Array<[string, string, string[]]>)));
        const applied: string[] = [];

        // Reinsere no topo para que a excecao do PontoRH sempre vença o REDIRECT global.
        for (const [table, chain, args] of [...rules].reverse()) {
            await this.deleteAllIptablesRules(table, chain, args);
            await runCommand('iptables', ['-t', table, '-I', chain, '1', ...args], { elevated: true });
            applied.push(`${table}/${chain} ${args.join(' ')}`);
        }

        return { mode: 'iptables-runtime', applied };
    }

    buildEarlyFirewallBlock(vipBypassRows: VipBypassRow[], emergencyVlans: VlanRow[] = []) {
        const vipIps = unique(vipBypassRows.map((vip) => vip.ip));
        const vipForwardRules = vipIps.flatMap((ip) => [
            `-A ufw-before-input -s ${ip} -p udp --dport ${env.vipCleanDnsPort} -j ACCEPT`,
            `-A ufw-before-input -s ${ip} -p tcp --dport ${env.vipCleanDnsPort} -j ACCEPT`,
            `-A ufw-before-forward -s ${ip} -o ${env.wanInterface} -p udp --dport 53 -j ACCEPT`,
            `-A ufw-before-forward -s ${ip} -o ${env.wanInterface} -p tcp --dport 53 -j ACCEPT`,
            `-A ufw-before-forward -s ${ip} -o ${env.wanInterface} -p tcp --dport 853 -j ACCEPT`,
            `-A ufw-before-forward -s ${ip} -o ${env.wanInterface} -p tcp --dport 443 -j ACCEPT`,
            `-A ufw-before-forward -s ${ip} -o ${env.wanInterface} -p udp --dport 443 -j ACCEPT`,
            `-A ufw-before-forward -s ${ip} -o ${env.wanInterface} -j ACCEPT`,
            `-A ufw-before-forward -d ${ip} -i ${env.wanInterface} -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT`,
        ]);
        const lines = [
            EARLY_BEGIN_MARKER,
            '# VIPs sempre saem antes dos bloqueios comuns; DNS da maquina pode ser local, publico, DoT ou DoH.',
            ...vipForwardRules,
            '',
            '# WhatsApp/Web WhatsApp compartilha infraestrutura Meta; nao bloquear faixas Meta ou portas push aqui.',
            '# Redes sociais ficam bloqueadas por Unbound/RPZ e ACLs de dominio para preservar WhatsApp.',
            `-A ufw-before-forward -i enp6s0+ -o ${env.wanInterface} -d 149.154.160.0/20 -j DROP`,
            `-A ufw-before-forward -i enp6s0+ -o ${env.wanInterface} -d 91.108.4.0/22 -j DROP`,
            `-A ufw-before-forward -i enp6s0+ -o ${env.wanInterface} -d 91.108.8.0/21 -j DROP`,
            `-A ufw-before-forward -i enp6s0+ -o ${env.wanInterface} -d 91.108.16.0/21 -j DROP`,
            `-A ufw-before-forward -i enp6s0+ -o ${env.wanInterface} -d 91.108.56.0/22 -j DROP`,
            '',
            '# Bloqueios mobile da VLAN 70 precisam preceder o allow geral de roteamento do UFW.',
            `-A ufw-before-forward -i enp6s0.70 -o ${env.wanInterface} -p tcp --dport 5222 -j DROP`,
            `-A ufw-before-forward -i enp6s0.70 -o ${env.wanInterface} -p tcp --dport 5223 -j DROP`,
            `-A ufw-before-forward -i enp6s0.70 -o ${env.wanInterface} -p tcp --dport 5228 -j DROP`,
            '',
            '# DoT bloqueado: impede bypass do Unbound/RPZ via DNS-over-TLS em todas as VLANs internas.',
            '# VLANs em bypass emergencial recebem ACCEPT antes do DROP global.',
            ...emergencyVlans.map((v) => `-A ufw-before-forward -i ${v.interface_name} -p tcp --dport 853 -j ACCEPT`),
            `-A ufw-before-forward -i enp6s0+ -p tcp --dport 853 -j DROP`,
            EARLY_END_MARKER,
        ];
        return lines.join('\n');
    }

    buildPontorhOpenDnsNatBlock(configuredVlans: VlanRow[]) {
        const resolvers = this.getResolverAddresses(PERMANENT_WORK_DNS_PROVIDERS);
        const lines = [
            PONTORH_BEGIN_MARKER,
            '# Regra inegociavel SGCG: PontoRH usa OpenDNS hardcoded e precisa sair direto.',
            '# Essas consultas TCP/UDP 53 nao podem ser capturadas pelo REDIRECT global do Unbound.',
        ];

        for (const vlan of configuredVlans) {
            for (const resolver of resolvers) {
                lines.push(`-A PREROUTING -i ${vlan.interface_name} -d ${resolver} -p udp --dport 53 -j RETURN`);
                lines.push(`-A PREROUTING -i ${vlan.interface_name} -d ${resolver} -p tcp --dport 53 -j RETURN`);
            }
        }

        lines.push(PONTORH_END_MARKER);
        return lines.join('\n');
    }

    async applyFirewallBlock(block: string, vipBypassRows: VipBypassRow[], emergencyVlans: VlanRow[] = []) {
        const original = await this.readFirewallConfig();
        const configuredVlans = await this.listConfiguredVlans();
        const withEarlyBlock = this.injectEarlyManagedBlock(original, this.buildEarlyFirewallBlock(vipBypassRows, emergencyVlans));
        const withPontorhNatBlock = this.injectPontorhManagedBlock(withEarlyBlock, this.buildPontorhOpenDnsNatBlock(configuredVlans));
        const candidate = this.injectManagedBlock(withPontorhNatBlock, block);
        await this.validateFirewallConfig(candidate);
        fs.writeFileSync(this.blockFile, candidate);
        try {
            if (await this.commandExists('ufw')) {
                await runCommand('ufw', ['reload'], { elevated: true });
            }
            await this.applyRuntimePontorhOpenDnsRules(configuredVlans);
            await this.applyRuntimeVipBypassRules(vipBypassRows, emergencyVlans);
        } catch (error) {
            fs.writeFileSync(this.blockFile, original);
            if (await this.commandExists('ufw')) {
                await runCommand('ufw', ['reload'], { elevated: true, allowFailure: true });
            }
            throw error;
        }
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
        if (!active) {
            return `${BEGIN_MARKER}\n# Contingencia DNS inativa: enforcement retorna para ACL + DNS (Unbound/Squid).\n${END_MARKER}\n`;
        }

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
        if (this.firewallApplyPromise) return this.firewallApplyPromise;

        this.firewallApplyPromise = (async () => {
            const block = await this.buildFirewallBlock();
            const [vipBypassRows, emergencyVlans] = await Promise.all([
                this.listVipBypassRows(),
                this.listEmergencyVlanRows(),
            ]);
            return this.applyFirewallBlock(block, vipBypassRows, emergencyVlans);
        })();

        try {
            return await this.firewallApplyPromise;
        } finally {
            this.firewallApplyPromise = null;
        }
    }

    async ensureFirewallStateWithRetry(context = 'runtime') {
        let lastError: unknown = null;

        for (let attempt = 1; attempt <= this.firewallRetryAttempts; attempt += 1) {
            try {
                return await this.ensureFirewallState();
            } catch (error) {
                lastError = error;
                if (attempt >= this.firewallRetryAttempts) break;
                console.warn(`[DNS CONTINGENCY] Falha ao reconciliar firewall (${context}), tentativa ${attempt}/${this.firewallRetryAttempts}. Nova tentativa em ${this.firewallRetryDelayMs}ms.`);
                await this.sleep(this.firewallRetryDelayMs);
            }
        }

        throw lastError;
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
