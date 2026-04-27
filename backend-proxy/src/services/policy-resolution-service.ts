import { pool } from '../config/db';
import { filterOperationalVlans, isOperationalVlan } from './blocking-release-scope';

type PolicyRow = {
    id: number;
    domain: string;
    category?: string | null;
    protected?: boolean;
    scope_type: 'global' | 'vlan';
    scope_value: string;
};

type ExceptionRow = {
    id: number;
    ip: string;
    vlan_id: number | null;
    exception_type?: string | null;
    bypass_total?: boolean;
};

type EmergencyVlanBypassRow = {
    id: number;
    vlan_id: number;
    reason: string;
};

type VlanRow = {
    vlan_id: number;
    label: string;
    interface_name: string;
    subnet_cidr: string;
    exempt: boolean;
    blocking_enabled: boolean;
    monitoring_enabled: boolean;
    policy_mode: string;
};

type CacheState = {
    loadedAt: number;
    blocks: PolicyRow[];
    allows: PolicyRow[];
    exceptions: ExceptionRow[];
    emergencyVlanBypasses: EmergencyVlanBypassRow[];
    vlans: VlanRow[];
};

const CACHE_TTL_MS = 15_000;

const normalizeDomain = (value: string) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/^\*\./, '')
    .replace(/\.$/, '');

const ipv4ToInt = (ip: string) => ip.split('.').reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0);

const cidrContainsIp = (cidr: string, ip: string) => {
    try {
        const [networkIp, prefixRaw] = cidr.includes('/') ? cidr.split('/') : [cidr, '32'];
        const prefix = Number(prefixRaw);
        if (networkIp.split('.').length !== 4 || ip.split('.').length !== 4 || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
            return false;
        }
        const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
        return (ipv4ToInt(ip) & mask) === (ipv4ToInt(networkIp) & mask);
    } catch {
        return false;
    }
};

const domainMatches = (queryName: string, policyDomain: string) => {
    const query = normalizeDomain(queryName);
    const policy = normalizeDomain(policyDomain);
    return Boolean(query && policy && (query === policy || query.endsWith(`.${policy}`)));
};

const bestMatch = (queryName: string, rows: PolicyRow[]) => rows
    .filter((row) => domainMatches(queryName, row.domain))
    .sort((left, right) => normalizeDomain(right.domain).length - normalizeDomain(left.domain).length || left.id - right.id)[0] || null;

export type ResolvedPolicyDecision = {
    normalizedDomain: string;
    vlan_id: number | null;
    vlan_label: string | null;
    action: 'allowed' | 'blocked' | 'bypassed';
    policy_source: 'global' | 'vlan' | 'vip' | 'emergency-vlan' | 'default';
    category: string | null;
    rule_id: number | null;
    matched_rule: string | null;
    matched_policy_kind: 'allow' | 'block' | 'exception' | 'default';
};

export class PolicyResolutionService {
    private cache: CacheState | null = null;

    private async loadState(force = false) {
        if (!force && this.cache && (Date.now() - this.cache.loadedAt) < CACHE_TTL_MS) {
            return this.cache;
        }

        const [blocks, allows, exceptions, emergencyVlanBypasses, vlans] = await Promise.all([
            pool.query(`SELECT id, domain, category, scope_type, scope_value FROM blocking_policies WHERE active = TRUE ORDER BY id ASC`),
            pool.query(`SELECT id, domain, category, protected, scope_type, scope_value FROM release_policies WHERE active = TRUE ORDER BY id ASC`),
            pool.query(`
                SELECT id, host(ip) AS ip, vlan_id, exception_type, bypass_total
                FROM policy_exceptions
                WHERE active = TRUE
                  AND masklen(ip) = 32
                  AND (valid_until IS NULL OR valid_until >= NOW())
                ORDER BY id ASC
            `),
            pool.query(`
                SELECT id, vlan_id, reason
                FROM emergency_vlan_bypass
                WHERE active = TRUE
                  AND (expires_at IS NULL OR expires_at >= NOW())
                ORDER BY vlan_id ASC, id DESC
            `).catch(() => ({ rows: [] as EmergencyVlanBypassRow[] })),
            pool.query(`SELECT vlan_id, label, interface_name, subnet_cidr, exempt, blocking_enabled, monitoring_enabled, policy_mode FROM vlan_policies ORDER BY vlan_id ASC`),
        ]);

        this.cache = {
            loadedAt: Date.now(),
            blocks: blocks.rows as PolicyRow[],
            allows: allows.rows as PolicyRow[],
            exceptions: exceptions.rows as ExceptionRow[],
            emergencyVlanBypasses: emergencyVlanBypasses.rows as EmergencyVlanBypassRow[],
            vlans: filterOperationalVlans(vlans.rows as VlanRow[]),
        };
        return this.cache;
    }

    async resolveVlanByIp(clientIp: string | null | undefined) {
        const state = await this.loadState();
        const normalizedIp = String(clientIp || '').trim();
        if (!normalizedIp) return null;
        return state.vlans.find((vlan) => cidrContainsIp(vlan.subnet_cidr, normalizedIp)) || null;
    }

    async resolveDnsDecision(clientIp: string | null | undefined, queryName: string) {
        const state = await this.loadState();
        const normalizedDomain = normalizeDomain(queryName);
        const vlan = await this.resolveVlanByIp(clientIp);
        const vlanId = vlan?.vlan_id || null;
        const managedClient = vlan ? isOperationalVlan(vlan) : false;
        const matchedEmergencyVlanBypass = vlanId
            ? state.emergencyVlanBypasses.find((row) => Number(row.vlan_id) === Number(vlanId)) || null
            : null;

        const allowGlobal = managedClient ? bestMatch(normalizedDomain, state.allows.filter((row) => row.scope_type === 'global')) : null;
        const allowVlan = managedClient ? bestMatch(normalizedDomain, state.allows.filter((row) => row.scope_type === 'vlan' && Number(row.scope_value) === vlanId)) : null;
        const blockGlobal = managedClient ? bestMatch(normalizedDomain, state.blocks.filter((row) => row.scope_type === 'global')) : null;
        const blockVlan = managedClient ? bestMatch(normalizedDomain, state.blocks.filter((row) => row.scope_type === 'vlan' && Number(row.scope_value) === vlanId)) : null;
        const matchedException = state.exceptions.find((row) => cidrContainsIp(row.ip, String(clientIp || ''))) || null;
        const blockedRule = blockVlan || blockGlobal;

        if (matchedEmergencyVlanBypass) {
            return {
                normalizedDomain,
                vlan_id: vlanId,
                vlan_label: vlan?.label || null,
                action: 'bypassed',
                policy_source: 'emergency-vlan',
                category: blockedRule?.category || null,
                rule_id: matchedEmergencyVlanBypass.id,
                matched_rule: `emergency_vlan_bypass:${matchedEmergencyVlanBypass.id}`,
                matched_policy_kind: 'exception',
            } satisfies ResolvedPolicyDecision;
        }

        if (matchedException && matchedException.bypass_total) {
            return {
                normalizedDomain,
                vlan_id: vlanId,
                vlan_label: vlan?.label || null,
                action: 'bypassed',
                policy_source: 'vip',
                category: blockedRule?.category || null,
                rule_id: matchedException.id,
                matched_rule: `policy_exceptions:${matchedException.id}`,
                matched_policy_kind: 'exception',
            } satisfies ResolvedPolicyDecision;
        }

        if (matchedException && blockedRule) {
            return {
                normalizedDomain,
                vlan_id: vlanId,
                vlan_label: vlan?.label || null,
                action: 'bypassed',
                policy_source: 'vip',
                category: blockedRule.category || null,
                rule_id: matchedException.id,
                matched_rule: `policy_exceptions:${matchedException.id}`,
                matched_policy_kind: 'exception',
            } satisfies ResolvedPolicyDecision;
        }

        if (allowVlan) {
            return {
                normalizedDomain,
                vlan_id: vlanId,
                vlan_label: vlan?.label || null,
                action: 'allowed',
                policy_source: 'vlan',
                category: allowVlan.category || null,
                rule_id: allowVlan.id,
                matched_rule: `release_policies:${allowVlan.id}`,
                matched_policy_kind: 'allow',
            } satisfies ResolvedPolicyDecision;
        }

        if (blockVlan) {
            return {
                normalizedDomain,
                vlan_id: vlanId,
                vlan_label: vlan?.label || null,
                action: 'blocked',
                policy_source: 'vlan',
                category: blockVlan.category || null,
                rule_id: blockVlan.id,
                matched_rule: `blocking_policies:${blockVlan.id}`,
                matched_policy_kind: 'block',
            } satisfies ResolvedPolicyDecision;
        }

        if (allowGlobal) {
            return {
                normalizedDomain,
                vlan_id: vlanId,
                vlan_label: vlan?.label || null,
                action: 'allowed',
                policy_source: 'global',
                category: allowGlobal.category || null,
                rule_id: allowGlobal.id,
                matched_rule: `release_policies:${allowGlobal.id}`,
                matched_policy_kind: 'allow',
            } satisfies ResolvedPolicyDecision;
        }

        if (blockGlobal) {
            return {
                normalizedDomain,
                vlan_id: vlanId,
                vlan_label: vlan?.label || null,
                action: 'blocked',
                policy_source: 'global',
                category: blockGlobal.category || null,
                rule_id: blockGlobal.id,
                matched_rule: `blocking_policies:${blockGlobal.id}`,
                matched_policy_kind: 'block',
            } satisfies ResolvedPolicyDecision;
        }

        return {
            normalizedDomain,
            vlan_id: vlanId,
            vlan_label: vlan?.label || null,
            action: 'allowed',
            policy_source: 'default',
            category: null,
            rule_id: null,
            matched_rule: null,
            matched_policy_kind: 'default',
        } satisfies ResolvedPolicyDecision;
    }

    async resolveProxyDecision(clientIp: string | null | undefined, host: string) {
        return this.resolveDnsDecision(clientIp, host);
    }
}

export const policyResolutionService = new PolicyResolutionService();
