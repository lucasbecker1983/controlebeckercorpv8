import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';
import { env } from '../config/env';
import { runCommand } from '../utils/process';
import { proxyEngineService } from './proxy-module';
import { ensureBlockingReleaseSchema } from './blocking-release-schema-service';
import {
    extractVlanIdFromIp,
    filterManagedVlans,
    filterOperationalVlans,
    getInternalDnsForVlan,
    getGatewayFromSubnet,
    INTERNAL_DNS_BY_VLAN,
    isManagedBlockingIp,
    isManagedBlockingVlan,
    MANAGED_VLAN_SQL_LIST,
} from './blocking-release-scope';
import { dnsContingencyService } from './dns-contingency-service';
import { dnsRadarService } from './dns-radar-service';
import { EnforcementMode, policyCompilerService } from './policy-compiler-service';

type ScopeType = 'global' | 'vlan';
type PolicyKind = 'block' | 'allow';
type ApplyOptions = {
    disconnect_active_sessions?: boolean;
    auto_disconnect_social_sessions?: boolean;
    domains?: string[];
    vlan_ids?: number[];
    lookback_minutes?: number;
    restart_squid?: boolean;
};
type SyncTelemetryOptions = {
    force?: boolean;
    background?: boolean;
};

const ENTERPRISE_DIR = path.join(env.rulesDir, 'generated', 'bloqueios-liberacoes');
const SNAPSHOT_DIR = path.join(env.proxyStateDir, 'backups', 'bloqueios-liberacoes');
const LEGACY_BYPASS_FILE = path.join(env.rulesDir, 'bypassed_vlans.json');
const PROXY_IP_BYPASS_FILE = path.join(env.rulesDir, 'generated', 'proxy_ip_bypass.acl');
const POLICY_MANIFEST_FILE = path.join(env.proxyStateDir, 'policy-compiler', 'manifest.json');
const SNAPSHOT_META_FILE = 'snapshot-meta.json';
const LEGACY_QUARANTINE_DIR = path.join(env.projectRoot, 'legacy-quarantine');
const ACTIVE_LEGACY_SCRIPT_PATHS = [
    path.join(env.projectRoot, 'scripts', 'panic_on.sh'),
    path.join(env.projectRoot, 'scripts', 'panic_off.sh'),
    path.join(env.projectRoot, 'backend', '999_vlan_scheduler.sh'),
];
const QUARANTINED_LEGACY_SCRIPT_PATHS = [
    path.join(LEGACY_QUARANTINE_DIR, 'scripts', 'panic_on.sh'),
    path.join(LEGACY_QUARANTINE_DIR, 'scripts', 'panic_off.sh'),
    path.join(LEGACY_QUARANTINE_DIR, 'backend', '999_vlan_scheduler.sh'),
];
const MANAGED_POLICY_SCOPE_SQL = `(scope_type = 'global' OR (scope_type = 'vlan' AND scope_value ~ '^[0-9]+$' AND CAST(scope_value AS integer) IN (${MANAGED_VLAN_SQL_LIST})))`;
const MANAGED_EXCEPTION_SCOPE_SQL = `(vlan_id IN (${MANAGED_VLAN_SQL_LIST}) OR CAST(substring(host(ip) from '^192\\.168\\.([0-9]{1,3})\\.') AS integer) IN (${MANAGED_VLAN_SQL_LIST}))`;
const TELEMETRY_SYNC_INTERVAL_MS = 5 * 60 * 1000;

const BASELINE_BLOCK_CATALOG = {
    'Pornografia': [
        'pornhub.com', 'phncdn.com', 'xvideos.com', 'xnxx.com', 'xhamster.com',
        'redtube.com', 'youporn.com', 'tube8.com', 'spankbang.com', 'beeg.com',
        'sunporno.com', 'hqporner.com', 'eporner.com', 'txxx.com', 'thumbzilla.com',
        'porntrex.com', 'tnaflix.com', 'drtuber.com', 'nudostar.com', 'porn.com',
        'xxx.com', 'brazzers.com', 'realitykings.com', 'bangbros.com', 'mofos.com',
        'digitalplayground.com', 'teamskeet.com', 'fakehub.com', 'hentaihaven.xxx',
        'nhentai.net', 'rule34.xxx', 'erome.com', 'cam4.com', 'chaturbate.com',
        'stripchat.com', 'bongacams.com', 'livejasmin.com', 'xnxx-cdn.com',
    ],
    'Redes Sociais': [
        'beacons.ai', 'byteoversea.com', 'cdninstagram.com', 'discordapp.com', 'discordapp.net',
        'discord.com', 'discord.gg', 'facebook.com', 'facebook.net', 'fbcdn.net',
        'fb.com', 'ibytedtos.com', 'ig.me', 'instagram.com', 'kuaishou.com',
        'kwai.com', 'kwimgs.com', 'licdn.com', 'linkedin.com', 'messengercdn.com',
        'messenger.com', 'musical.ly', 'pinimg.com', 'pinterest.com', 'redd.it',
        'reddit.com', 'redditmedia.com', 'sc-cdn.net', 'snapchat.com', 'snap.com',
        't.co', 'threads.net', 'tiktokcdn.com', 'tiktok.com', 'tiktokv.com',
        'tumblr.co', 'tumblr.com', 'twimg.com', 'twitter.com', 'x.com',
    ],
};

const SOCIAL_SESSION_DOMAINS = [
    ...BASELINE_BLOCK_CATALOG['Redes Sociais'],
    'b-graph.facebook.com',
    'connect.facebook.net',
    'edge-mqtt.facebook.com',
    'graph.facebook.com',
    'graph.instagram.com',
    'i.instagram.com',
    'scontent-gru1-1.cdninstagram.com',
    'test-gateway.instagram.com',
    'z-m-gateway.facebook.com',
];

const BASELINE_ALLOW_CATALOG = {
    WhatsApp: [
        'static.whatsapp.net', 'wa.me', 'web.whatsapp.com', 'whatsapp.com', 'whatsapp.net',
    ],
    'Sites Google': [
        'earth.google.com',
        'gstatic.com',
        'google.com',
        'google.com.br',
        'googleapis.com',
        'googleearth.com',
        'maps.google.com',
        'maps.googleapis.com',
    ],
    Bancos: [
        'bb.com.br', 'bradesco.com.br', 'caixa.gov.br', 'itau.com.br', 'nubank.com.br', 'sicredi.com.br',
    ],
    Governo: [
        'conectividade.caixa.gov.br', 'esocial.gov.br', 'gov.br', 'pr.gov.br', 'serpro.gov.br', 'trt.jus.br',
    ],
};

const DEFAULT_MANAGED_VLAN_ROWS = [
    {
        vlan_id: 10,
        label: 'Secretaria',
        interface_name: 'enp6s0.10',
        subnet_cidr: '192.168.10.0/24',
        exempt: false,
        blocking_enabled: true,
        monitoring_enabled: true,
        custom_policy: true,
        policy_mode: 'global',
        whitelist_scope: ['governo', 'bancos', 'sites_google'],
        blacklist_scope: ['redes_sociais', 'pornografia'],
        notes: 'Escopo padrão da VLAN 10.',
    },
    {
        vlan_id: 30,
        label: 'Celulares',
        interface_name: 'enp6s0.30',
        subnet_cidr: '192.168.30.0/24',
        exempt: false,
        blocking_enabled: true,
        monitoring_enabled: true,
        custom_policy: true,
        policy_mode: 'global',
        whitelist_scope: [],
        blacklist_scope: ['redes_sociais', 'pornografia'],
        notes: 'Escopo padrão da VLAN 30: redes sociais somente via VIP ou exceção esporádica.',
    },
    {
        vlan_id: 50,
        label: 'SINE',
        interface_name: 'enp6s0.50',
        subnet_cidr: '192.168.50.0/24',
        exempt: false,
        blocking_enabled: true,
        monitoring_enabled: true,
        custom_policy: true,
        policy_mode: 'global',
        whitelist_scope: ['governo', 'bancos', 'sites_google'],
        blacklist_scope: ['redes_sociais', 'pornografia'],
        notes: 'Escopo padrão da VLAN 50.',
    },
    {
        vlan_id: 70,
        label: 'Visitantes',
        interface_name: 'enp6s0.70',
        subnet_cidr: '192.168.70.0/24',
        exempt: false,
        blocking_enabled: true,
        monitoring_enabled: true,
        custom_policy: true,
        policy_mode: 'global',
        whitelist_scope: ['governo', 'bancos'],
        blacklist_scope: ['redes_sociais', 'pornografia'],
        notes: 'Escopo padrão da VLAN 70: redes sociais somente via VIP ou exceção esporádica.',
    },
] as const;

const normalizeDomain = (value: string) => value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/^\*\./, '')
    .replace(/\.$/, '');

const normalizePolicyDomains = (raw: unknown) => {
    const source = Array.isArray(raw) ? raw : String(raw || '').split(/[\n,;\s]+/);
    const domains = Array.from(new Set(source
        .map((item) => normalizeDomain(String(item || '')))
        .filter(Boolean)));
    if (!domains.length) throw new Error('Informe ao menos um domínio');
    const invalid = domains.find((domain) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain));
    if (invalid) throw new Error(`Domínio inválido: ${invalid}`);
    return domains;
};

const normalizeOptionalPolicyDomains = (raw: unknown) => {
    if (!Array.isArray(raw) && !String(raw || '').trim()) return [];
    return normalizePolicyDomains(raw);
};

const normalizeCategoryKey = (value: string) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const formatSnapshotKey = (date = new Date()) => date.toISOString().replace(/[:.]/g, '-');

const normalizeMetadataKey = (value: string) => String(value || '')
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
        metadata[normalizeMetadataKey(match[1])] = match[2].trim();
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

let telemetrySyncPromise: Promise<any> | null = null;
let lastTelemetrySyncAt = 0;

const resolveExceptionGovernance = (payload: any, requestedBy = 'system', fallback?: any) => {
    const parsedPayload = parseGovernanceText(payload?.notes ?? payload?.reason);
    const parsedFallback = parseGovernanceText(fallback?.notes ?? fallback?.reason);
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
            ?? parsedFallback.metadata.solicitante
            ?? payload?.responsible
            ?? fallback?.responsible
            ?? requestedBy,
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
        effective_from: normalizeOptionalTimestamp(payload?.effective_from ?? payload?.effectiveFrom ?? payload?.valid_until ?? fallback?.effective_from),
        expires_at: normalizeOptionalTimestamp(payload?.expires_at ?? payload?.expiresAt ?? payload?.valid_until ?? fallback?.expires_at ?? fallback?.valid_until),
        revoked_by: normalizeOptionalText(payload?.revoked_by ?? payload?.revokedBy ?? fallback?.revoked_by),
        revoked_at: normalizeOptionalTimestamp(payload?.revoked_at ?? payload?.revokedAt ?? fallback?.revoked_at),
    };
};

const readTextIfExists = (filePath: string) => fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
const isQuarantineStub = (filePath: string) => readTextIfExists(filePath).includes('[LEGACY QUARANTINED]');
const modeLabel = (mode: string | null | undefined) => mode === 'acl-only'
    ? 'ACL'
    : mode === 'intercept-selective'
        ? 'Interceptação Seletiva'
        : 'ACL + DNS';

const parseSimpleTable = (html: string) => {
    const rows = [...html.matchAll(/<tr>(.*?)<\/tr>/gsi)];
    return rows.map((row) => {
        const cells = [...row[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gsi)]
            .map((cell) => cell[1]
                .replace(/<a[^>]*>/gsi, '')
                .replace(/<\/a>/gsi, '')
                .replace(/<[^>]+>/gsi, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/\s+/g, ' ')
                .trim());
        return cells;
    }).filter((cells) => cells.length > 0);
};

const sanitizeProxyStatusForPublicPayload = (value: any) => {
    if (!value || typeof value !== 'object') return value;
    const {
        test_target_ip,
        target_host,
        bootstrap_host,
        ...rest
    } = value;
    return {
        ...rest,
        observed_scopes: Array.isArray(rest.observed_scopes) ? [] : rest.observed_scopes,
        legacy_fields_hidden: {
            ...(rest.legacy_fields_hidden || {}),
            test_target_ip: true,
            target_host: true,
            bootstrap_host: true,
        },
    };
};

const assertManagedPolicyVlan = (value: unknown) => {
    if (!isManagedBlockingVlan(value)) {
        throw new Error('VLAN inválida. Use IDs entre 1 e 4094.');
    }
    return Number(value);
};

const normalizeInterfaceName = (value: unknown, vlanId: number) => {
    const normalized = String(value || '').trim();
    return normalized || `enp6s0.${vlanId}`;
};

const normalizeSubnetCidr = (value: unknown, vlanId: number) => {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
    return `192.168.${vlanId}.0/24`;
};

const buildInternalDnsByVlan = (vlans: Array<{ vlan_id: number; subnet_cidr?: string | null }>) => Object.fromEntries(
    vlans
        .filter((row) => isManagedBlockingVlan(row.vlan_id))
        .map((row) => [
            Number(row.vlan_id),
            getGatewayFromSubnet(row.subnet_cidr) || getInternalDnsForVlan(Number(row.vlan_id)) || `192.168.${row.vlan_id}.1`,
        ]),
);

class BlockingReleaseService {
    constructor() {
        fs.mkdirSync(ENTERPRISE_DIR, { recursive: true });
        fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    }

    async ensureReady() {
        await ensureBlockingReleaseSchema();
        await dnsContingencyService.ensureSchema();
    }

    async recordAudit(input: {
        action: string;
        requestedBy?: string;
        payload?: any;
        result?: any;
        success: boolean;
        message?: string;
        vlanId?: number | null;
        domain?: string | null;
        ip?: string | null;
    }) {
        await this.ensureReady();
        await pool.query(
            `
                INSERT INTO action_audit_logs (action, requested_by, payload, result, success, vlan_id, domain, ip, message)
                VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9)
            `,
            [
                input.action,
                input.requestedBy || 'system',
                JSON.stringify(input.payload || {}),
                JSON.stringify(input.result || {}),
                input.success,
                input.vlanId || null,
                input.domain || null,
                input.ip || null,
                input.message || null,
            ],
        );
    }

    async getEngineState() {
        await this.ensureReady();
        const { rows } = await pool.query(`SELECT * FROM policy_engine_state WHERE id = 1`);
        return rows[0];
    }

    async updateEngineState(patch: Record<string, any>) {
        const current = await this.getEngineState();
        const next = { ...current, ...patch };
        await pool.query(
            `
                UPDATE policy_engine_state
                SET enforcement_mode = $1,
                    global_blocking_enabled = $2,
                    global_monitoring_enabled = $3,
                    emergency_bypass = $4,
                    last_apply_at = $5,
                    last_apply_by = $6,
                    last_rollback_at = $7,
                    last_rollback_by = $8,
                    last_error = $9,
                    last_sync_at = $10,
                    health_status = $11,
                    compiler_status = $12,
                    compiler_version = $13,
                    last_snapshot_path = $14,
                    last_validation = $15::jsonb,
                    updated_at = NOW()
                WHERE id = 1
            `,
            [
                next.enforcement_mode || 'acl-plus-dns',
                next.global_blocking_enabled,
                next.global_monitoring_enabled,
                next.emergency_bypass,
                next.last_apply_at || null,
                next.last_apply_by || null,
                next.last_rollback_at || null,
                next.last_rollback_by || null,
                next.last_error || null,
                next.last_sync_at || null,
                next.health_status || 'unknown',
                next.compiler_status || 'unknown',
                next.compiler_version || null,
                next.last_snapshot_path || null,
                JSON.stringify(next.last_validation || {}),
            ],
        );
    }

    async restoreExpectedBaseline(requestedBy = 'system') {
        await this.ensureReady();

        const vlanBaseline = [
            {
                vlanId: 10,
                label: 'Secretaria',
                interfaceName: 'enp6s0.10',
                subnetCidr: '192.168.10.0/24',
                whitelistScope: ['governo', 'bancos', 'sites_google'],
                blacklistScope: ['redes_sociais', 'pornografia'],
                notes: 'VLAN 10 bloqueia redes sociais e pornografia, liberando governo, bancos e sites Google.',
            },
            {
                vlanId: 30,
                label: 'Celulares',
                interfaceName: 'enp6s0.30',
                subnetCidr: '192.168.30.0/24',
                whitelistScope: ['redes_sociais'],
                blacklistScope: ['pornografia'],
                notes: 'VLAN 30 libera redes sociais e mantém pornografia bloqueada.',
            },
            {
                vlanId: 50,
                label: 'SINE',
                interfaceName: 'enp6s0.50',
                subnetCidr: '192.168.50.0/24',
                whitelistScope: ['governo', 'bancos', 'sites_google'],
                blacklistScope: ['redes_sociais', 'pornografia'],
                notes: 'VLAN 50 segue a mesma política da VLAN 10.',
            },
            {
                vlanId: 70,
                label: 'Visitantes',
                interfaceName: 'enp6s0.70',
                subnetCidr: '192.168.70.0/24',
                whitelistScope: ['redes_sociais', 'governo', 'bancos'],
                blacklistScope: ['pornografia'],
                notes: 'VLAN 70 libera redes sociais, governo e bancos, mantendo pornografia bloqueada.',
            },
        ];
        const offlineVlanBaseline = [
            {
                vlanId: 40,
                label: 'Cameras / CFTV',
                interfaceName: 'enp6s0.40',
                subnetCidr: '192.168.40.0/24',
                notes: 'VLAN desligada do padrão: câmeras/CFTV fora de monitoramento, liberações e bloqueios.',
            },
            {
                vlanId: 80,
                label: 'VoIP',
                interfaceName: 'enp6s0.80',
                subnetCidr: '192.168.80.0/24',
                notes: 'VLAN desligada do padrão: VoIP fora de monitoramento, liberações e bloqueios.',
            },
            {
                vlanId: 99,
                label: 'Infra fora do padrão',
                interfaceName: 'enp6s0.99',
                subnetCidr: '192.168.99.0/24',
                notes: 'VLAN desligada do padrão operacional do módulo.',
            },
        ];

        await pool.query(`DELETE FROM blocking_policies`);
        await pool.query(`DELETE FROM release_policies`);
        await pool.query(`UPDATE policy_exceptions SET active = FALSE, updated_at = NOW(), notes = CONCAT(COALESCE(notes, ''), CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\\n' END, 'Desativada na restauração baseline 2026-04-15.') WHERE active = TRUE`);

        for (const vlan of vlanBaseline) {
            await pool.query(
                    `
                        INSERT INTO vlan_policies (
                            vlan_id,
                            label,
                            interface_name,
                            subnet_cidr,
                            exempt,
                            blocking_enabled,
                            monitoring_enabled,
                            custom_policy,
                            policy_mode,
                            whitelist_scope,
                            blacklist_scope,
                            notes
                        )
                        VALUES ($1, $2, $3, $4, FALSE, TRUE, TRUE, TRUE, 'global', $5::jsonb, $6::jsonb, $7)
                        ON CONFLICT (vlan_id) DO UPDATE SET
                            label = EXCLUDED.label,
                            interface_name = EXCLUDED.interface_name,
                            subnet_cidr = EXCLUDED.subnet_cidr,
                            exempt = FALSE,
                            blocking_enabled = TRUE,
                            monitoring_enabled = TRUE,
                            custom_policy = TRUE,
                            policy_mode = 'global',
                            whitelist_scope = EXCLUDED.whitelist_scope,
                            blacklist_scope = EXCLUDED.blacklist_scope,
                            notes = EXCLUDED.notes,
                            updated_at = NOW()
                    `,
                    [
                        vlan.vlanId,
                        vlan.label,
                        vlan.interfaceName,
                        vlan.subnetCidr,
                        JSON.stringify(vlan.whitelistScope),
                        JSON.stringify(vlan.blacklistScope),
                        vlan.notes,
                    ],
                );
        }

        for (const vlan of offlineVlanBaseline) {
            await pool.query(
                    `
                        INSERT INTO vlan_policies (
                            vlan_id,
                            label,
                            interface_name,
                            subnet_cidr,
                            exempt,
                            blocking_enabled,
                            monitoring_enabled,
                            custom_policy,
                            policy_mode,
                            whitelist_scope,
                            blacklist_scope,
                            notes
                        )
                        VALUES ($1, $2, $3, $4, TRUE, FALSE, FALSE, FALSE, 'global', '[]'::jsonb, '[]'::jsonb, $5)
                        ON CONFLICT (vlan_id) DO UPDATE SET
                            label = EXCLUDED.label,
                            interface_name = EXCLUDED.interface_name,
                            subnet_cidr = EXCLUDED.subnet_cidr,
                            exempt = TRUE,
                            blocking_enabled = FALSE,
                            monitoring_enabled = FALSE,
                            custom_policy = FALSE,
                            policy_mode = 'global',
                            whitelist_scope = '[]'::jsonb,
                            blacklist_scope = '[]'::jsonb,
                            notes = EXCLUDED.notes,
                            updated_at = NOW()
                    `,
                    [
                        vlan.vlanId,
                        vlan.label,
                        vlan.interfaceName,
                        vlan.subnetCidr,
                        vlan.notes,
                    ],
                );
        }

        for (const domain of BASELINE_BLOCK_CATALOG['Pornografia']) {
            await pool.query(
                    `
                        INSERT INTO blocking_policies (domain, description, category, active, scope_type, scope_value, origin_rule, created_by, notes)
                        VALUES ($1, $2, 'Pornografia', TRUE, 'global', 'global', 'baseline_restore_2026_04_15', $3, $4)
                    `,
                    [domain, 'Bloqueio global mandatório de pornografia.', requestedBy, 'Baseline restaurada 2026-04-15.'],
                );
        }

        for (const vlanId of [10, 50]) {
            for (const domain of BASELINE_BLOCK_CATALOG['Redes Sociais']) {
                await pool.query(
                        `
                            INSERT INTO blocking_policies (domain, description, category, active, scope_type, scope_value, origin_rule, created_by, notes)
                            VALUES ($1, $2, 'Redes Sociais', TRUE, 'vlan', $3, 'baseline_restore_2026_04_15', $4, $5)
                        `,
                        [domain, `Bloqueio de redes sociais para VLAN ${vlanId}.`, String(vlanId), requestedBy, 'Baseline restaurada 2026-04-15.'],
                    );
            }
        }

        for (const domain of BASELINE_ALLOW_CATALOG['WhatsApp']) {
            await pool.query(
                    `
                        INSERT INTO release_policies (domain, description, category, reason, protected, active, scope_type, scope_value, created_by, notes)
                        VALUES ($1, $2, 'WhatsApp', 'WhatsApp liberado globalmente', TRUE, TRUE, 'global', 'global', $3, $4)
                    `,
                    [domain, 'Liberação global mandatória de WhatsApp.', requestedBy, 'Baseline restaurada 2026-04-15.'],
                );
        }

        for (const vlanId of [30, 70]) {
            for (const domain of BASELINE_BLOCK_CATALOG['Redes Sociais']) {
                await pool.query(
                        `
                            INSERT INTO release_policies (domain, description, category, reason, protected, active, scope_type, scope_value, created_by, notes)
                            VALUES ($1, $2, 'Redes Sociais', $3, FALSE, TRUE, 'vlan', $4, $5, $6)
                        `,
                        [domain, `Liberação de redes sociais para VLAN ${vlanId}.`, `Redes sociais liberadas para VLAN ${vlanId}`, String(vlanId), requestedBy, 'Baseline restaurada 2026-04-15.'],
                    );
            }
        }

        for (const vlanId of [10, 50]) {
            for (const category of ['Bancos', 'Governo', 'Sites Google'] as const) {
                for (const domain of BASELINE_ALLOW_CATALOG[category]) {
                    await pool.query(
                        `
                            INSERT INTO release_policies (domain, description, category, reason, protected, active, scope_type, scope_value, created_by, notes)
                            VALUES ($1, $2, $3, $4, FALSE, TRUE, 'vlan', $5, $6, $7)
                        `,
                        [domain, `${category} liberado para a VLAN ${vlanId}.`, category, `${category} liberado na VLAN ${vlanId}`, String(vlanId), requestedBy, 'Baseline restaurada 2026-04-15.'],
                    );
                }
            }
        }

        for (const category of ['Bancos', 'Governo'] as const) {
            for (const domain of BASELINE_ALLOW_CATALOG[category]) {
                await pool.query(
                        `
                            INSERT INTO release_policies (domain, description, category, reason, protected, active, scope_type, scope_value, created_by, notes)
                            VALUES ($1, $2, $3, $4, FALSE, TRUE, 'vlan', '70', $5, $6)
                        `,
                        [domain, `${category} liberado para a VLAN 70.`, category, `${category} liberado na VLAN 70`, requestedBy, 'Baseline restaurada 2026-04-15.'],
                    );
            }
        }

        await this.updateEngineState({
            enforcement_mode: 'acl-plus-dns',
            global_blocking_enabled: true,
            global_monitoring_enabled: true,
            emergency_bypass: false,
            last_error: null,
            compiler_status: 'unknown',
        });

        await dnsContingencyService.deactivate(requestedBy, 'Restauração da baseline funcional do módulo');
        await this.syncDnsVipFromExceptions([], { applyRuntime: false });
        const result = {
            engine_mode: 'acl-plus-dns',
            baseline: '2026-04-15',
            active_exceptions: 0,
            matrix: {
                vlan_10: { allow: ['governo', 'bancos', 'sites_google'], block: ['redes_sociais', 'pornografia'] },
                vlan_30: { allow: ['redes_sociais'], block: ['pornografia'] },
                vlan_50: { allow: ['governo', 'bancos', 'sites_google'], block: ['redes_sociais', 'pornografia'] },
                vlan_70: { allow: ['redes_sociais', 'governo', 'bancos'], block: ['pornografia'] },
                removed_from_product_scope: [40, 80, 99],
            },
        };
        await this.recordAudit({
            action: 'restore:baseline',
            requestedBy,
            payload: result.matrix,
            result,
            success: true,
            message: 'Baseline funcional restaurada antes do apply',
        });
        return result;
    }

    async syncTelemetry(options: SyncTelemetryOptions = {}) {
        const { force = false, background = false } = options;
        const now = Date.now();

        if (!force && telemetrySyncPromise) {
            return background
                ? { running: true, skipped: true, reason: 'sync-in-progress' }
                : telemetrySyncPromise;
        }

        if (!force && lastTelemetrySyncAt && now - lastTelemetrySyncAt < TELEMETRY_SYNC_INTERVAL_MS) {
            return {
                importedEvents: 0,
                importedDnsEvents: 0,
                importedProxyEvents: 0,
                skipped: true,
                reason: 'fresh-cache',
                last_sync_at: new Date(lastTelemetrySyncAt).toISOString(),
            };
        }

        const run = async () => {
            await this.ensureReady();
            const [proxyRadarImport, dnsImport, proxyImport] = await Promise.all([
                pool.query(
                `
                    INSERT INTO access_events (
                        occurred_at,
                        client_ip,
                        vlan_id,
                        domain,
                        action,
                        source,
                        policy_origin,
                        http_status,
                        evidence,
                        raw_payload
                    )
                    SELECT
                        occurred_at,
                        NULLIF(client_ip, '')::inet,
                        NULLIF(regexp_replace(COALESCE(vlan_id, ''), '[^0-9]', '', 'g'), '')::integer,
                        NULLIF(domain, ''),
                        CASE WHEN blocked THEN 'blocked' ELSE 'allowed' END,
                        COALESCE(source, 'proxy-radar'),
                        COALESCE(status, 'proxy-radar'),
                        NULL,
                        evidence,
                        COALESCE(raw_payload, '{}'::jsonb)
                    FROM proxy_radar_events
                    ON CONFLICT (occurred_at, client_ip, vlan_id, domain, action, source) DO NOTHING
                `,
                ).catch(() => ({ rowCount: 0 })),
                pool.query(
                    `
                        INSERT INTO access_events (
                            occurred_at,
                            client_ip,
                            vlan_id,
                            domain,
                            action,
                            source,
                            policy_origin,
                            http_status,
                            evidence,
                            raw_payload
                        )
                        SELECT
                            occurred_at,
                            client_ip,
                            vlan_id,
                            NULLIF(query_name, ''),
                            action,
                            resolver,
                            policy_source,
                            NULL,
                            response_code,
                            COALESCE(raw_payload, '{}'::jsonb)
                        FROM dns_policy_events
                        ON CONFLICT (occurred_at, client_ip, vlan_id, domain, action, source) DO NOTHING
                    `,
                ).catch(() => ({ rowCount: 0 })),
                pool.query(
                    `
                        INSERT INTO access_events (
                            occurred_at,
                            client_ip,
                            vlan_id,
                            domain,
                            action,
                            source,
                            policy_origin,
                            http_status,
                            evidence,
                            raw_payload
                        )
                        SELECT
                            occurred_at,
                            client_ip,
                            vlan_id,
                            NULLIF(host, ''),
                            action,
                            proxy_layer,
                            matched_rule,
                            status_code,
                            category,
                            COALESCE(raw_payload, '{}'::jsonb)
                        FROM proxy_policy_events
                        ON CONFLICT (occurred_at, client_ip, vlan_id, domain, action, source) DO NOTHING
                    `,
                ).catch(() => ({ rowCount: 0 })),
            ]);

            await this.refreshReportIndex();
            lastTelemetrySyncAt = Date.now();
            await this.updateEngineState({ last_sync_at: new Date(lastTelemetrySyncAt).toISOString() });
            return {
                importedEvents: (proxyRadarImport.rowCount || 0) + (dnsImport.rowCount || 0) + (proxyImport.rowCount || 0),
                importedDnsEvents: dnsImport.rowCount || 0,
                importedProxyEvents: proxyImport.rowCount || 0,
                skipped: false,
                last_sync_at: new Date(lastTelemetrySyncAt).toISOString(),
            };
        };

        telemetrySyncPromise = run().finally(() => {
            telemetrySyncPromise = null;
        });

        if (background) {
            telemetrySyncPromise.catch(() => undefined);
            return {
                started: true,
                skipped: false,
                background: true,
                last_sync_at: lastTelemetrySyncAt ? new Date(lastTelemetrySyncAt).toISOString() : null,
            };
        }

        return telemetrySyncPromise;
    }

    async refreshReportIndex() {
        if (!fs.existsSync(env.sargDir)) return [];
        const reports = fs.readdirSync(env.sargDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => {
                const fullPath = path.join(env.sargDir, entry.name);
                const stat = fs.statSync(fullPath);
                return {
                    key: entry.name,
                    title: entry.name,
                    relativePath: `/sarg/${entry.name}/index.html`,
                    metadata: {
                        updated_at: stat.mtime.toISOString(),
                    },
                };
            });

        for (const report of reports) {
            await pool.query(
                `
                    INSERT INTO report_index (report_key, report_type, title, relative_path, metadata, updated_at)
                    VALUES ($1, 'sarg', $2, $3, $4::jsonb, NOW())
                    ON CONFLICT (report_key)
                    DO UPDATE SET
                        title = EXCLUDED.title,
                        relative_path = EXCLUDED.relative_path,
                        metadata = EXCLUDED.metadata,
                        updated_at = NOW()
                `,
                [report.key, report.title, report.relativePath, JSON.stringify(report.metadata)],
            );
        }
        return reports;
    }

    getSnapshotMetaPath(snapshotPath: string) {
        return path.join(snapshotPath, SNAPSHOT_META_FILE);
    }

    async getSnapshotTargets() {
        const files = [
            env.squidConfigPath,
            path.join(env.squidAclDir, 'proxy_whitelist.acl'),
            path.join(env.squidAclDir, 'proxy_blocklist.acl'),
            path.join(env.squidAclDir, 'proxy_protected_ssl.acl'),
            path.join(env.squidAclDir, 'proxy_bump_ssl.acl'),
            path.join(env.squidAclDir, 'proxy_ip_bypass.acl'),
            env.whitelistFile,
            env.blockedRpzFile,
            env.vipConf,
            env.unboundPolicyConf,
            env.ufwBeforeRulesFile,
            POLICY_MANIFEST_FILE,
            LEGACY_BYPASS_FILE,
        ];
        for (const vlan of await this.listVlans()) {
            files.push(path.join(env.squidAclDir, `allowlist-vlan-${vlan.vlan_id}.acl`));
            files.push(path.join(env.squidAclDir, `blocklist-vlan-${vlan.vlan_id}.acl`));
            files.push(path.join(path.dirname(env.blockedRpzFile), `allowlist-vlan-${vlan.vlan_id}.rpz`));
            files.push(path.join(path.dirname(env.blockedRpzFile), `blocklist-vlan-${vlan.vlan_id}.rpz`));
        }
        return files;
    }

    async validateCurrentRuntime() {
        const [unboundValidation, squidValidation, unboundService, squidService] = await Promise.all([
            this.validateUnbound().catch((error: any) => ({ code: 1, stdout: '', stderr: error.message || String(error) })),
            runCommand('squid', ['-k', 'parse'], { elevated: true, allowFailure: true }),
            runCommand('systemctl', ['is-active', 'unbound'], { elevated: true, allowFailure: true }),
            runCommand('systemctl', ['is-active', env.squidServiceName], { elevated: true, allowFailure: true }),
        ]);

        return {
            unbound_validation: unboundValidation,
            squid_validation: squidValidation,
            services: {
                unbound: (unboundService.stdout || '').trim() || 'unknown',
                squid: (squidService.stdout || '').trim() || 'unknown',
            },
            healthy: unboundValidation.code === 0
                && squidValidation.code === 0
                && (unboundService.stdout || '').trim() === 'active'
                && (squidService.stdout || '').trim() === 'active',
        };
    }

    readSnapshotMeta(snapshotPath: string) {
        const metaPath = this.getSnapshotMetaPath(snapshotPath);
        if (!fs.existsSync(metaPath)) return null;
        return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    }

    writeSnapshotMeta(snapshotPath: string, payload: Record<string, any>) {
        const current = this.readSnapshotMeta(snapshotPath) || {};
        const next = { ...current, ...payload, updated_at: new Date().toISOString() };
        fs.writeFileSync(this.getSnapshotMetaPath(snapshotPath), `${JSON.stringify(next, null, 2)}\n`);
        return next;
    }

    async validateSnapshot(snapshotPath: string) {
        const targets = await this.getSnapshotTargets();
        const missingFiles = targets
            .map((targetPath) => targetPath.replace(/^\//, '').replace(/\//g, '__'))
            .filter((relativeName) => !fs.existsSync(path.join(snapshotPath, relativeName)));

        const manifestRelative = POLICY_MANIFEST_FILE.replace(/^\//, '').replace(/\//g, '__');
        let manifestOk = false;
        let manifestVersion = null;
        try {
            const manifestRaw = fs.readFileSync(path.join(snapshotPath, manifestRelative), 'utf8');
            const manifest = JSON.parse(manifestRaw);
            manifestOk = Boolean(manifest?.version && manifest?.paths && manifest?.hashes);
            manifestVersion = manifest?.version || null;
        } catch {
            manifestOk = false;
        }

        const databaseExportPresent = fs.existsSync(path.join(snapshotPath, 'database-export.json'));
        const restorable = missingFiles.length === 0 && manifestOk && databaseExportPresent;
        return {
            snapshotPath,
            missingFiles,
            manifestOk,
            manifestVersion,
            databaseExportPresent,
            restorable,
        };
    }

    async listPolicies(kind: PolicyKind, filters: Record<string, any> = {}) {
        await this.ensureReady();
        const table = kind === 'block' ? 'blocking_policies' : 'release_policies';
        const clauses = [MANAGED_POLICY_SCOPE_SQL];
        const params: any[] = [];

        if (filters.search) {
            params.push(`%${String(filters.search).trim().toLowerCase()}%`);
            clauses.push(`(LOWER(domain) LIKE $${params.length} OR LOWER(COALESCE(description, '')) LIKE $${params.length} OR LOWER(COALESCE(notes, '')) LIKE $${params.length})`);
        }
        if (filters.scopeValue) {
            params.push(String(filters.scopeValue));
            clauses.push(`scope_value = $${params.length}`);
        }
        if (filters.status === 'active' || filters.status === 'inactive') {
            params.push(filters.status === 'active');
            clauses.push(`active = $${params.length}`);
        }
        if (kind === 'block' && filters.category) {
            params.push(String(filters.category));
            clauses.push(`category = $${params.length}`);
        }
        if (kind === 'allow' && filters.category) {
            params.push(String(filters.category));
            clauses.push(`category = $${params.length}`);
        }
        if (kind === 'allow' && filters.protected === 'true') {
            clauses.push(`protected = TRUE`);
        }

        const { rows } = await pool.query(
            `SELECT * FROM ${table} WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC, created_at DESC`,
            params,
        );
        return rows;
    }

    async upsertPolicy(kind: PolicyKind, payload: any, requestedBy = 'system', id?: number) {
        await this.ensureReady();
        const table = kind === 'block' ? 'blocking_policies' : 'release_policies';
        const domain = normalizeDomain(String(payload?.domain || ''));
        const scopeType: ScopeType = String(payload?.scope_type || payload?.scopeType || 'global') === 'vlan' ? 'vlan' : 'global';
        const scopeValue = scopeType === 'vlan'
            ? String(assertManagedPolicyVlan(payload?.scope_value || payload?.scopeValue || payload?.vlan_id || ''))
            : 'global';

        if (!domain) throw new Error('Domínio obrigatório');
        if (scopeType === 'vlan' && !scopeValue) throw new Error('VLAN obrigatória para escopo por VLAN');

        if (kind === 'block') {
            const { rows } = await pool.query(
                `SELECT id, domain, protected FROM release_policies WHERE domain = $1 AND active = TRUE`,
                [domain],
            );
            if (rows.length) {
                throw new Error(rows[0].protected ? `${domain} está protegido na whitelist` : `${domain} está liberado e tem precedência sobre blacklist`);
            }
        }

        const values = {
            domain,
            description: payload?.description || null,
            category: payload?.category || null,
            active: payload?.active ?? true,
            scopeType,
            scopeValue,
            originRule: payload?.origin_rule || payload?.originRule || 'manual',
            createdBy: requestedBy,
            notes: payload?.notes || payload?.observations || null,
            reason: payload?.reason || null,
            protected: Boolean(payload?.protected),
        };

        const query = kind === 'block'
            ? id
                ? `
                    UPDATE blocking_policies
                    SET domain = $1,
                        description = $2,
                        category = $3,
                        active = $4,
                        scope_type = $5,
                        scope_value = $6,
                        origin_rule = $7,
                        notes = $8,
                        updated_at = NOW()
                    WHERE id = $9
                    RETURNING *
                `
                : `
                    INSERT INTO blocking_policies (domain, description, category, active, scope_type, scope_value, origin_rule, created_by, notes)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING *
                `
            : id
                ? `
                    UPDATE release_policies
                    SET domain = $1,
                        description = $2,
                        category = $3,
                        reason = $4,
                        protected = $5,
                        active = $6,
                        scope_type = $7,
                        scope_value = $8,
                        notes = $9,
                        updated_at = NOW()
                    WHERE id = $10
                    RETURNING *
                `
                : `
                    INSERT INTO release_policies (domain, description, category, reason, protected, active, scope_type, scope_value, created_by, notes)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING *
                `;

        const params = kind === 'block'
            ? id
                ? [values.domain, values.description, values.category, values.active, values.scopeType, values.scopeValue, values.originRule, values.notes, id]
                : [values.domain, values.description, values.category, values.active, values.scopeType, values.scopeValue, values.originRule, values.createdBy, values.notes]
            : id
                ? [values.domain, values.description, values.category, values.reason, values.protected, values.active, values.scopeType, values.scopeValue, values.notes, id]
                : [values.domain, values.description, values.category, values.reason, values.protected, values.active, values.scopeType, values.scopeValue, values.createdBy, values.notes];

        const { rows } = await pool.query(query, params);
        const action = `${kind === 'block' ? 'blocklist' : 'allowlist'}:${id ? 'update' : 'create'}`;
        await this.recordAudit({
            action,
            requestedBy,
            payload,
            result: rows[0],
            success: true,
            message: `${kind === 'block' ? 'Bloqueio' : 'Liberação'} persistido`,
            vlanId: scopeType === 'vlan' ? Number(scopeValue) : null,
            domain,
        });
        return rows[0];
    }

    async deletePolicy(kind: PolicyKind, id: number, requestedBy = 'system') {
        await this.ensureReady();
        const table = kind === 'block' ? 'blocking_policies' : 'release_policies';
        const { rows } = await pool.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [id]);
        if (!rows.length) throw new Error('Registro não encontrado');
        await this.recordAudit({
            action: `${kind === 'block' ? 'blocklist' : 'allowlist'}:delete`,
            requestedBy,
            payload: { id },
            result: rows[0],
            success: true,
            message: 'Registro removido',
            domain: rows[0].domain,
            vlanId: rows[0].scope_type === 'vlan' ? Number(rows[0].scope_value) : null,
        });
        return rows[0];
    }

    private buildCategoryAliases(payload: any) {
        const raw = [
            payload?.category,
            payload?.label,
            payload?.key,
            ...(Array.isArray(payload?.aliases) ? payload.aliases : []),
        ].filter(Boolean).map((item) => normalizeCategoryKey(String(item)));
        const aliases = Array.from(new Set(raw));
        if (!aliases.length) throw new Error('Categoria obrigatória');
        return aliases;
    }

    private buildCategoryScope(payload: any) {
        const scopeType: ScopeType = String(payload?.scope_type || payload?.scopeType || 'global') === 'vlan' ? 'vlan' : 'global';
        const scopeValue = scopeType === 'vlan'
            ? String(assertManagedPolicyVlan(payload?.scope_value || payload?.scopeValue || payload?.vlan_id || payload?.vlanId || ''))
            : 'global';
        return { scopeType, scopeValue };
    }

    async deleteCategoryPolicy(payload: any, requestedBy = 'system') {
        await this.ensureReady();
        const aliases = this.buildCategoryAliases(payload);
        const { scopeType, scopeValue } = this.buildCategoryScope(payload);
        const params = [aliases, scopeType, scopeValue];

        const [blocks, allows] = await Promise.all([
            pool.query(
                `
                    DELETE FROM blocking_policies
                    WHERE (
                        lower(COALESCE(category, '')) = ANY($1::text[])
                        OR lower(replace(COALESCE(category, ''), ' ', '-')) = ANY($1::text[])
                    )
                      AND scope_type = $2
                      AND scope_value = $3
                    RETURNING *
                `,
                params,
            ),
            pool.query(
                `
                    DELETE FROM release_policies
                    WHERE (
                        lower(COALESCE(category, '')) = ANY($1::text[])
                        OR lower(COALESCE(reason, '')) = ANY($1::text[])
                        OR lower(replace(COALESCE(category, ''), ' ', '-')) = ANY($1::text[])
                    )
                      AND scope_type = $2
                      AND scope_value = $3
                    RETURNING *
                `,
                params,
            ),
        ]);

        const result = {
            deleted_blocks: blocks.rows,
            deleted_allows: allows.rows,
            deleted_total: blocks.rows.length + allows.rows.length,
            scope_type: scopeType,
            scope_value: scopeValue,
            aliases,
        };
        await this.recordAudit({
            action: 'category-policy:delete',
            requestedBy,
            payload,
            result,
            success: true,
            message: 'Categoria rápida excluída do escopo',
            vlanId: scopeType === 'vlan' ? Number(scopeValue) : null,
        });
        return result;
    }

    async updateCategoryPolicy(payload: any, requestedBy = 'system') {
        await this.ensureReady();
        const kind: PolicyKind = String(payload?.policy_type || payload?.policyType || payload?.kind || 'allow') === 'block' ? 'block' : 'allow';
        const domains = normalizePolicyDomains(payload?.domains);
        const category = String(payload?.category || payload?.label || payload?.key || '').trim();
        const description = String(payload?.description || payload?.helper || category || '').trim() || null;
        const { scopeType, scopeValue } = this.buildCategoryScope(payload);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const aliases = this.buildCategoryAliases(payload);
            const deleteParams = [aliases, scopeType, scopeValue];
            await client.query(
                `
                    DELETE FROM blocking_policies
                    WHERE (
                        lower(COALESCE(category, '')) = ANY($1::text[])
                        OR lower(replace(COALESCE(category, ''), ' ', '-')) = ANY($1::text[])
                    )
                      AND scope_type = $2
                      AND scope_value = $3
                `,
                deleteParams,
            );
            await client.query(
                `
                    DELETE FROM release_policies
                    WHERE (
                        lower(COALESCE(category, '')) = ANY($1::text[])
                        OR lower(COALESCE(reason, '')) = ANY($1::text[])
                        OR lower(replace(COALESCE(category, ''), ' ', '-')) = ANY($1::text[])
                    )
                      AND scope_type = $2
                      AND scope_value = $3
                `,
                deleteParams,
            );

            const table = kind === 'block' ? 'blocking_policies' : 'release_policies';
            const inserted = [];
            for (const domain of domains) {
                const query = kind === 'block'
                    ? `
                        INSERT INTO ${table} (domain, description, category, active, scope_type, scope_value, origin_rule, created_by, notes)
                        VALUES ($1, $2, $3, TRUE, $4, $5, 'category-quick', $6, $7)
                        ON CONFLICT (domain, scope_type, scope_value) DO UPDATE SET
                            description = EXCLUDED.description,
                            category = EXCLUDED.category,
                            active = TRUE,
                            origin_rule = EXCLUDED.origin_rule,
                            notes = EXCLUDED.notes,
                            updated_at = NOW()
                        RETURNING *
                    `
                    : `
                        INSERT INTO ${table} (domain, description, category, reason, protected, active, scope_type, scope_value, created_by, notes, origin_rule)
                        VALUES ($1, $2, $3, $8, FALSE, TRUE, $4, $5, $6, $7, 'category-quick')
                        ON CONFLICT (domain, scope_type, scope_value) DO UPDATE SET
                            description = EXCLUDED.description,
                            category = EXCLUDED.category,
                            reason = EXCLUDED.reason,
                            active = TRUE,
                            notes = EXCLUDED.notes,
                            origin_rule = EXCLUDED.origin_rule,
                            updated_at = NOW()
                        RETURNING *
                    `;
                const params = kind === 'block'
                    ? [
                        domain,
                        description,
                        category,
                        scopeType,
                        scopeValue,
                        requestedBy,
                        payload?.notes || null,
                    ]
                    : [
                        domain,
                        description,
                        category,
                        scopeType,
                        scopeValue,
                        requestedBy,
                        payload?.notes || null,
                        category,
                    ];
                const { rows } = await client.query(query, params);
                inserted.push(rows[0]);
            }

            const result = {
                policy_type: kind,
                category,
                scope_type: scopeType,
                scope_value: scopeValue,
                domains,
                rows: inserted,
            };
            await client.query('COMMIT');
            await this.recordAudit({
                action: 'category-policy:update',
                requestedBy,
                payload,
                result,
                success: true,
                message: 'Categoria rápida atualizada',
                vlanId: scopeType === 'vlan' ? Number(scopeValue) : null,
            });
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async listVlans() {
        await this.ensureReady();
        const { rows } = await pool.query(
            `
                SELECT
                    vp.*,
                    nic.alias AS interface_label,
                    COALESCE(evt.clients_seen, 0) AS clients_seen,
                    COALESCE(evt.events_today, 0) AS events_today,
                    COALESCE(evt.blocked_today, 0) AS blocked_today,
                    COALESCE(evt.allowed_today, 0) AS allowed_today,
                    evt.last_activity
                FROM vlan_policies vp
                LEFT JOIN net_interface_config nic
                    ON nic.iface_name = vp.interface_name
                LEFT JOIN (
                    SELECT
                        vlan_id,
                        COUNT(*) AS events_today,
                        COUNT(*) FILTER (WHERE action = 'blocked') AS blocked_today,
                        COUNT(*) FILTER (WHERE action = 'allowed') AS allowed_today,
                        COUNT(DISTINCT client_ip) AS clients_seen,
                        MAX(occurred_at) AS last_activity
                    FROM access_events
                    WHERE occurred_at >= NOW() - INTERVAL '30 minutes'
                    GROUP BY vlan_id
                ) evt
                    ON evt.vlan_id = vp.vlan_id
                ORDER BY vp.vlan_id ASC
            `,
        );
        const currentRows = filterManagedVlans(rows);
        if (currentRows.length) {
            return currentRows;
        }

        return DEFAULT_MANAGED_VLAN_ROWS.map((fallback) => ({
            id: `virtual-${fallback.vlan_id}`,
            ...fallback,
            interface_label: fallback.label,
            clients_seen: 0,
            events_today: 0,
            blocked_today: 0,
            allowed_today: 0,
            last_activity: null,
            created_at: null,
            updated_at: null,
        }));
    }

    async createVlan(payload: any, requestedBy = 'system') {
        await this.ensureReady();
        const vlanId = assertManagedPolicyVlan(payload?.vlan_id ?? payload?.id);
        const label = String(payload?.label || `VLAN ${vlanId}`).trim();
        if (!label) throw new Error('Nome da VLAN obrigatório');

        const subnetCidr = normalizeSubnetCidr(payload?.subnet_cidr, vlanId);
        const interfaceName = normalizeInterfaceName(payload?.interface_name, vlanId);

        const { rows } = await pool.query(
            `
                INSERT INTO vlan_policies (
                    vlan_id,
                    label,
                    interface_name,
                    subnet_cidr,
                    exempt,
                    blocking_enabled,
                    monitoring_enabled,
                    custom_policy,
                    policy_mode,
                    whitelist_scope,
                    blacklist_scope,
                    notes
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12)
                RETURNING *
            `,
            [
                vlanId,
                label,
                interfaceName,
                subnetCidr,
                Boolean(payload?.exempt ?? false),
                Boolean(payload?.blocking_enabled ?? true),
                Boolean(payload?.monitoring_enabled ?? true),
                Boolean(payload?.custom_policy ?? false),
                String(payload?.policy_mode || 'global'),
                JSON.stringify(payload?.whitelist_scope || []),
                JSON.stringify(payload?.blacklist_scope || []),
                payload?.notes || null,
            ],
        );
        await this.recordAudit({
            action: 'vlan:create',
            requestedBy,
            payload,
            result: rows[0],
            success: true,
            message: `VLAN ${vlanId} criada`,
            vlanId,
        });
        return rows[0];
    }

    async deleteVlan(id: number, requestedBy = 'system') {
        await this.ensureReady();
        const current = await pool.query(`SELECT * FROM vlan_policies WHERE id = $1 OR vlan_id = $1`, [id]);
        if (!current.rows.length) throw new Error('VLAN não encontrada');
        const currentRow = current.rows[0];

        await pool.query(`DELETE FROM vlan_policies WHERE id = $1`, [currentRow.id]);
        await this.recordAudit({
            action: 'vlan:delete',
            requestedBy,
            payload: { id },
            result: currentRow,
            success: true,
            message: `VLAN ${currentRow.vlan_id} excluída`,
            vlanId: currentRow.vlan_id,
        });
        return currentRow;
    }

    async updateVlan(id: number, payload: any, requestedBy = 'system') {
        await this.ensureReady();
        const current = await pool.query(`SELECT * FROM vlan_policies WHERE id = $1 OR vlan_id = $1`, [id]);
        if (!current.rows.length) throw new Error('VLAN não encontrada');

        const currentRow = current.rows[0];
        assertManagedPolicyVlan(currentRow.vlan_id);
        const next = {
            label: payload?.label ?? currentRow.label,
            interface_name: normalizeInterfaceName(payload?.interface_name ?? currentRow.interface_name, currentRow.vlan_id),
            subnet_cidr: normalizeSubnetCidr(payload?.subnet_cidr ?? currentRow.subnet_cidr, currentRow.vlan_id),
            exempt: payload?.exempt ?? currentRow.exempt,
            blocking_enabled: payload?.blocking_enabled ?? currentRow.blocking_enabled,
            monitoring_enabled: payload?.monitoring_enabled ?? currentRow.monitoring_enabled,
            custom_policy: payload?.custom_policy ?? currentRow.custom_policy,
            policy_mode: payload?.policy_mode ?? currentRow.policy_mode,
            whitelist_scope: payload?.whitelist_scope ?? currentRow.whitelist_scope,
            blacklist_scope: payload?.blacklist_scope ?? currentRow.blacklist_scope,
            notes: payload?.notes ?? currentRow.notes,
        };

        const { rows } = await pool.query(
            `
                UPDATE vlan_policies
                SET label = $1,
                    interface_name = $2,
                    subnet_cidr = $3,
                    exempt = $4,
                    blocking_enabled = $5,
                    monitoring_enabled = $6,
                    custom_policy = $7,
                    policy_mode = $8,
                    whitelist_scope = $9::jsonb,
                    blacklist_scope = $10::jsonb,
                    notes = $11,
                    updated_at = NOW()
                WHERE id = $12
                RETURNING *
            `,
            [
                next.label,
                next.interface_name,
                next.subnet_cidr,
                next.exempt,
                next.blocking_enabled,
                next.monitoring_enabled,
                next.custom_policy,
                next.policy_mode,
                JSON.stringify(next.whitelist_scope || []),
                JSON.stringify(next.blacklist_scope || []),
                next.notes,
                currentRow.id,
            ],
        );
        await this.recordAudit({
            action: 'vlan:update',
            requestedBy,
            payload,
            result: rows[0],
            success: true,
            message: `VLAN ${rows[0].vlan_id} atualizada`,
            vlanId: rows[0].vlan_id,
        });
        return rows[0];
    }

    async toggleVlan(vlanRef: number, field: 'blocking_enabled' | 'monitoring_enabled' | 'exempt', requestedBy = 'system') {
        assertManagedPolicyVlan(vlanRef);
        const { rows } = await pool.query(
            `
                UPDATE vlan_policies
                SET ${field} = NOT ${field}, updated_at = NOW()
                WHERE id = $1 OR vlan_id = $1
                RETURNING *
            `,
            [vlanRef],
        );
        if (!rows.length) throw new Error('VLAN não encontrada');
        await this.recordAudit({
            action: `vlan:${field}:toggle`,
            requestedBy,
            payload: { vlanRef, field },
            result: rows[0],
            success: true,
            message: `Campo ${field} alternado`,
            vlanId: rows[0].vlan_id,
        });
        return rows[0];
    }

    async listExceptions(filters: Record<string, any> = {}) {
        await this.ensureReady();
        const clauses = ['1 = 1'];
        const params: any[] = [];
        if (filters.vlan) {
            params.push(assertManagedPolicyVlan(filters.vlan));
            clauses.push(`vlan_id = $${params.length}`);
        }
        if (filters.status === 'active' || filters.status === 'inactive') {
            params.push(filters.status === 'active');
            clauses.push(`active = $${params.length}`);
        }
        const { rows } = await pool.query(
            `SELECT * FROM policy_exceptions WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC, created_at DESC`,
            params,
        );
        return rows.filter((row) => {
            if (row.vlan_id && isManagedBlockingVlan(row.vlan_id)) return true;
            if (isManagedBlockingIp(row.ip)) return true;
            return false;
        });
    }

    async upsertException(payload: any, requestedBy = 'system', id?: number) {
        await this.ensureReady();
        const ip = String(payload?.ip || '').trim();
        if (!ip) throw new Error('IP obrigatório');
        const inferredVlanId = extractVlanIdFromIp(ip);
        const vlanId = payload?.vlan_id ? Number(payload.vlan_id) : inferredVlanId;
        if (vlanId !== null && vlanId !== undefined) {
            assertManagedPolicyVlan(vlanId);
        }
        const current = id
            ? (await pool.query(`SELECT * FROM policy_exceptions WHERE id = $1`, [id])).rows[0]
            : null;
        if (id && !current) throw new Error('Exceção não encontrada');
        const governance = resolveExceptionGovernance(payload, requestedBy, current);
        const values = [
            ip,
            payload?.hostname || null,
            payload?.description || null,
            governance.summary || null,
            governance.legal_basis,
            payload?.responsible || current?.responsible || governance.requested_by || requestedBy,
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
            vlanId || null,
            payload?.exception_type || 'vip',
            true,
            payload?.active ?? true,
            governance.expires_at || payload?.valid_until || current?.valid_until || null,
            payload?.notes || null,
        ];
        const { rows } = id
            ? await pool.query(
                `
                    UPDATE policy_exceptions
                    SET ip = $1,
                        hostname = $2,
                        description = $3,
                        governance_summary = $4,
                        legal_basis = $5,
                        responsible = $6,
                        requested_by = $7,
                        approval_scope = $8,
                        lifecycle_status = $9,
                        review_date = $10,
                        approved_by = $11,
                        approved_at = $12,
                        effective_from = $13,
                        expires_at = $14,
                        revoked_by = $15,
                        revoked_at = $16,
                        vlan_id = $17,
                        exception_type = $18,
                        bypass_total = $19,
                        active = $20,
                        valid_until = $21,
                        notes = $22,
                        updated_at = NOW()
                    WHERE id = $23
                    RETURNING *
                `,
                [...values, id],
            )
            : await pool.query(
                `
                    INSERT INTO policy_exceptions (
                        ip,
                        hostname,
                        description,
                        governance_summary,
                        legal_basis,
                        responsible,
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
                        vlan_id,
                        exception_type,
                        bypass_total,
                        active,
                        valid_until,
                        notes
                    )
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
                    RETURNING *
                `,
                values,
            );
        await this.recordAudit({
            action: `exception:${id ? 'update' : 'create'}`,
            requestedBy,
            payload,
            result: rows[0],
            success: true,
            message: 'Exceção persistida',
            vlanId: rows[0].vlan_id,
            ip,
        });
        await this.syncDnsVipFromExceptions();
        return rows[0];
    }

    async deleteException(id: number, requestedBy = 'system') {
        await this.ensureReady();
        const { rows } = await pool.query(
            `
                UPDATE policy_exceptions
                SET active = FALSE,
                    lifecycle_status = 'revoked',
                    revoked_by = COALESCE(revoked_by, $2),
                    revoked_at = COALESCE(revoked_at, NOW()),
                    updated_at = NOW()
                WHERE id = $1
                RETURNING *
            `,
            [id, requestedBy],
        );
        if (!rows.length) {
            await this.recordAudit({
                action: 'exception:delete',
                requestedBy,
                payload: { id },
                result: { id, active: false, already_absent: true },
                success: true,
                message: 'Exceção já ausente',
            });
            return { id, active: false, already_absent: true };
        }
        await this.recordAudit({
            action: 'exception:delete',
            requestedBy,
            payload: { id },
            result: rows[0],
            success: true,
            message: 'Exceção revogada',
            vlanId: rows[0].vlan_id,
            ip: rows[0].ip,
        });
        await this.syncDnsVipFromExceptions();
        await this.disconnectClientSessions(
            [String(rows[0].ip || '').trim()].filter(Boolean),
            requestedBy,
            'VIP revogado',
        );
        return rows[0];
    }

    async listSporadicExceptions(filters: Record<string, any> = {}) {
        await this.ensureReady();
        const { rows } = await pool.query(
            `SELECT * FROM sporadic_exceptions ORDER BY created_at DESC`,
        );
        return rows.map((row) => ({
            ...row,
            is_expired: row.active && new Date(row.expires_at) < new Date(),
        }));
    }

    async createSporadicException(payload: any, requestedBy = 'system') {
        await this.ensureReady();
        const ip = String(payload?.ip || '').trim();
        if (!ip) throw new Error('IP obrigatório');
        const reqBy = String(payload?.requested_by || requestedBy || '').trim();
        if (!reqBy) throw new Error('Solicitante obrigatório');
        const justification = String(payload?.justification || '').trim();
        if (!justification) throw new Error('Justificativa obrigatória');
        const durationMinutes = Number(payload?.duration_minutes);
        if (!Number.isFinite(durationMinutes) || durationMinutes < 1) throw new Error('Duração obrigatória (mínimo 1 minuto)');
        const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
        const approvedCategories = Array.isArray(payload?.approved_categories) ? payload.approved_categories : [];
        const customDomains = Array.isArray(payload?.custom_domains) ? payload.custom_domains.map(String).filter(Boolean) : [];

        const { rows } = await pool.query(
            `INSERT INTO sporadic_exceptions (ip, requested_by, approved_categories, custom_domains, justification, duration_minutes, expires_at, active, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8) RETURNING *`,
            [ip, reqBy, JSON.stringify(approvedCategories), customDomains, justification, durationMinutes, expiresAt, requestedBy],
        );
        await this.recordAudit({
            action: 'sporadic_exception:create',
            requestedBy,
            payload,
            result: rows[0],
            success: true,
            message: `Exceção esporádica criada para ${ip} por ${durationMinutes} min`,
            ip,
        });
        await this.syncDnsVipFromExceptions();
        await this.apply(requestedBy);
        return rows[0];
    }

    async revokeSporadicException(id: number, requestedBy = 'system') {
        await this.ensureReady();
        const { rows } = await pool.query(
            `UPDATE sporadic_exceptions SET active = FALSE, revoked_by = $1, revoked_at = NOW(), updated_at = NOW()
             WHERE id = $2 RETURNING *`,
            [requestedBy, id],
        );
        if (!rows.length) throw new Error('Exceção esporádica não encontrada');
        await this.recordAudit({
            action: 'sporadic_exception:revoke',
            requestedBy,
            payload: { id },
            result: rows[0],
            success: true,
            message: `Exceção esporádica revogada para ${rows[0].ip}`,
            ip: rows[0].ip,
        });
        await this.syncDnsVipFromExceptions();
        await this.disconnectClientSessions(
            [String(rows[0].ip || '').trim()].filter(Boolean),
            requestedBy,
            'Exceção esporádica revogada',
        );
        await this.apply(requestedBy);
        return rows[0];
    }

    async getMetrics(range = '24h') {
        await this.syncTelemetry({ background: true });
        const periods: Record<string, string> = {
            '24h': "NOW() - INTERVAL '24 hours'",
            '7d': "NOW() - INTERVAL '7 days'",
            '30d': "NOW() - INTERVAL '30 days'",
            '90d': "NOW() - INTERVAL '90 days'",
        };
        const sinceExpr = periods[range] || periods['24h'];
        const [topSites, topBlocked, topIps, topVlans, hourly, daily, recent, allowedDomains, serviceTrend] = await Promise.all([
            pool.query(`SELECT domain, COUNT(*)::int AS total FROM access_events WHERE occurred_at >= ${sinceExpr} AND vlan_id IN (${MANAGED_VLAN_SQL_LIST}) GROUP BY domain ORDER BY total DESC NULLS LAST LIMIT 8`),
            pool.query(`SELECT domain, COUNT(*)::int AS total FROM access_events WHERE occurred_at >= ${sinceExpr} AND vlan_id IN (${MANAGED_VLAN_SQL_LIST}) AND action = 'blocked' GROUP BY domain ORDER BY total DESC NULLS LAST LIMIT 8`),
            pool.query(`SELECT host(client_ip) AS client_ip, COUNT(*)::int AS total FROM access_events WHERE occurred_at >= ${sinceExpr} AND vlan_id IN (${MANAGED_VLAN_SQL_LIST}) AND action = 'blocked' GROUP BY client_ip ORDER BY total DESC NULLS LAST LIMIT 8`),
            pool.query(`SELECT vlan_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE action = 'blocked')::int AS blocked FROM access_events WHERE occurred_at >= ${sinceExpr} AND vlan_id IN (${MANAGED_VLAN_SQL_LIST}) GROUP BY vlan_id ORDER BY total DESC NULLS LAST LIMIT 8`),
            pool.query(`SELECT EXTRACT(HOUR FROM occurred_at)::int AS hour, COUNT(*)::int AS total FROM access_events WHERE occurred_at >= ${sinceExpr} AND vlan_id IN (${MANAGED_VLAN_SQL_LIST}) GROUP BY hour ORDER BY hour ASC`),
            pool.query(`SELECT TO_CHAR(occurred_at, 'YYYY-MM-DD') AS day, COUNT(*)::int AS total FROM access_events WHERE occurred_at >= ${sinceExpr} AND vlan_id IN (${MANAGED_VLAN_SQL_LIST}) GROUP BY day ORDER BY day ASC`),
            pool.query(`SELECT occurred_at, host(client_ip) AS client_ip, vlan_id, domain, action, policy_origin, source FROM access_events WHERE vlan_id IN (${MANAGED_VLAN_SQL_LIST}) ORDER BY occurred_at DESC LIMIT 20`),
            pool.query(`SELECT domain, COUNT(*)::int AS total FROM access_events WHERE occurred_at >= ${sinceExpr} AND vlan_id IN (${MANAGED_VLAN_SQL_LIST}) AND action = 'allowed' GROUP BY domain ORDER BY total DESC NULLS LAST LIMIT 8`),
            pool.query(`SELECT created_at::date AS day, COUNT(*)::int AS changes FROM action_audit_logs WHERE created_at >= ${sinceExpr} GROUP BY day ORDER BY day ASC`),
        ]);

        const heatmapRows = await pool.query(
            `
                SELECT
                    EXTRACT(DOW FROM occurred_at)::int AS dow,
                    EXTRACT(HOUR FROM occurred_at)::int AS hour,
                    COUNT(*)::int AS total
                FROM access_events
                WHERE occurred_at >= ${sinceExpr}
                  AND vlan_id IN (${MANAGED_VLAN_SQL_LIST})
                GROUP BY dow, hour
                ORDER BY dow ASC, hour ASC
            `,
        );

        const exceptionUsage = await pool.query(
            `
                SELECT exception_type, COUNT(*)::int AS total
                FROM policy_exceptions
                WHERE active = TRUE
                  AND ${MANAGED_EXCEPTION_SCOPE_SQL}
                GROUP BY exception_type
                ORDER BY total DESC
            `,
        );

        return {
            range,
            topSites: topSites.rows,
            topBlocked: topBlocked.rows,
            topIps: topIps.rows,
            topVlans: topVlans.rows,
            hourly: hourly.rows,
            daily: daily.rows,
            recentAttempts: recent.rows,
            releasedDomains: allowedDomains.rows,
            exceptionUsage: exceptionUsage.rows,
            serviceTrend: serviceTrend.rows,
            heatmap: heatmapRows.rows,
        };
    }

    async parseSargReport(reportKey: string) {
        const reportDir = path.join(env.sargDir, reportKey);
        if (!fs.existsSync(reportDir)) throw new Error('Relatório não encontrado');
        const topSitesHtml = readTextIfExists(path.join(reportDir, 'topsites.html'));
        const deniedHtml = readTextIfExists(path.join(reportDir, 'denied.html'));
        const siteUserHtml = readTextIfExists(path.join(reportDir, 'siteuser.html'));
        const generalText = readTextIfExists(path.join(reportDir, 'sarg-general'));

        const topSiteRows = parseSimpleTable(topSitesHtml).slice(1).map((cells) => ({
            num: cells[0],
            domain: cells[1],
            connects: cells[2],
            bytes: cells[3],
            users: cells[5],
        }));
        const deniedRows = parseSimpleTable(deniedHtml).slice(1).map((cells) => ({
            user: cells[0],
            client_ip: cells[1],
            occurred_at: cells[2],
            domain: cells[3],
        }));
        const siteUserRows = parseSimpleTable(siteUserHtml).slice(1).map((cells) => ({
            num: cells[0],
            domain: cells[1],
            user: cells[2],
        }));
        const generalParts = generalText.trim().split(/\s+/);

        return {
            reportKey,
            summary: {
                totalAccesses: Number(generalParts[1] || 0),
                totalBytes: generalParts[2] || null,
                totalUsers: Number(generalParts[3] || 0),
            },
            topSites: topSiteRows,
            denied: deniedRows,
            siteUsers: siteUserRows,
            capabilities: {
                has_ip: deniedRows.some((row) => !!row.client_ip),
                has_domain: topSiteRows.some((row) => !!row.domain) || deniedRows.some((row) => !!row.domain),
                has_datetime: deniedRows.some((row) => !!row.occurred_at),
            },
        };
    }

    async listReports(filters: Record<string, any> = {}) {
        await this.refreshReportIndex();
        const { rows } = await pool.query(
            `SELECT * FROM report_index WHERE report_type = 'sarg' ORDER BY updated_at DESC, created_at DESC`,
        );
        if (filters.reportKey) {
            return rows.filter((row) => row.report_key === filters.reportKey);
        }
        return rows;
    }

    async getHealth() {
        await this.ensureReady();
        const [engineState, proxyState, services] = await Promise.all([
            this.getEngineState(),
            proxyEngineService.getStatus().catch(() => null),
            Promise.all([
                runCommand('systemctl', ['is-active', env.squidServiceName], { elevated: true, allowFailure: true }),
                runCommand('systemctl', ['is-active', 'unbound'], { elevated: true, allowFailure: true }),
                runCommand('systemctl', ['is-active', 'postgresql'], { elevated: true, allowFailure: true }),
            ]),
        ]);
        const [squidStatus, unboundStatus, postgresStatus] = services;
        const [dnsLogger, dnsRadar] = await Promise.all([
            proxyEngineService.dnsLoggerService.status().catch(() => ({ active: false })),
            dnsRadarService.status().catch(() => ({ active: false, events_10m: 0, last_seen_at: null })),
        ]);
        const operationalVlans = filterOperationalVlans(await this.listVlans().catch(() => [] as any[]));
        const contingencyStatus = await dnsContingencyService.getStatus().catch(() => null);
        const lastReport = await pool.query(`SELECT * FROM report_index ORDER BY updated_at DESC LIMIT 1`).catch(() => ({ rows: [] as any[] }));
        const compilerInspection = policyCompilerService.inspectManifest();
        const compilerManifest = compilerInspection.manifest;
        const runtimeValidation = await this.validateCurrentRuntime();
        const squidWarnings = String(runtimeValidation.squid_validation?.stderr || '')
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.startsWith('WARNING:'));
        const snapshotValidation = engineState.last_snapshot_path
            ? await this.validateSnapshot(engineState.last_snapshot_path).catch(() => null)
            : null;
        const legacyRisk = {
            active_scripts: ACTIVE_LEGACY_SCRIPT_PATHS.filter((filePath) => fs.existsSync(filePath) && !isQuarantineStub(filePath)),
            stubbed_scripts: ACTIVE_LEGACY_SCRIPT_PATHS.filter((filePath) => fs.existsSync(filePath) && isQuarantineStub(filePath)),
            quarantined_scripts: QUARANTINED_LEGACY_SCRIPT_PATHS.filter((filePath) => fs.existsSync(filePath)),
        };
        const integrity = {
            whitelist_file: fs.existsSync(path.join(env.squidAclDir, 'proxy_whitelist.acl')),
            blocklist_file: fs.existsSync(path.join(env.squidAclDir, 'proxy_blocklist.acl')),
            bypass_file: fs.existsSync(LEGACY_BYPASS_FILE),
            sarg_dir: fs.existsSync(env.sargDir),
            allowed_rpz: fs.existsSync(env.whitelistFile),
            blocked_rpz: fs.existsSync(env.blockedRpzFile),
            vip_bypass: fs.existsSync(env.vipConf),
            compiler_manifest: compilerInspection.present,
            compiler_include: compilerInspection.compilerIncludePresent,
            compiler_include_loaded: compilerInspection.compilerIncludeLoaded,
            module_config_ok: compilerInspection.moduleConfigOk,
            manifest_matches_files: compilerInspection.filesMatchManifest,
            rpz_references_ok: compilerInspection.rpzReferencesOk,
            snapshot_restorable: snapshotValidation?.restorable ?? false,
        };

        const alerts = [
            ...(compilerInspection.compilerIncludeLoaded ? [] : ['Compiler include do Unbound ausente do carregamento ativo']),
            ...(compilerInspection.allowedReferenced ? [] : ['allowed.rpz não referenciado no include ativo']),
            ...(compilerInspection.blockedReferenced ? [] : ['blocked.rpz não referenciado no include ativo']),
            ...(compilerInspection.vipBypassReferenced ? [] : ['vip-bypass.conf não referenciado no include ativo']),
            ...(compilerInspection.filesMatchManifest ? [] : [`Manifesto divergente dos artefatos: ${compilerInspection.mismatchedPaths.join(', ')}`]),
            ...(compilerInspection.missingTaggedVpcFiles.length ? [`RPZ por VLAN ausente: ${compilerInspection.missingTaggedVpcFiles.join(', ')}`] : []),
            ...(compilerInspection.missingTaggedVpcTags.length ? [`Tag/attach DNS por VLAN ausente: ${compilerInspection.missingTaggedVpcTags.join(', ')}`] : []),
            ...(legacyRisk.active_scripts.length ? [`Scripts legados ainda ativos fora da quarentena: ${legacyRisk.active_scripts.join(', ')}`] : []),
            ...(squidWarnings.length ? [`Warnings do Squid presentes: ${squidWarnings.join(' | ')}`] : []),
            ...(!contingencyStatus || contingencyStatus.chain !== 'DNS_EMERGENCY_V8' ? ['Chain de contingência DNS indisponível para inspeção.'] : []),
        ];

        const integrityScore = Object.values(integrity).reduce((acc, value) => acc + (value ? 1 : 0), 0);
        const sanitizedEngineValidation = engineState.last_validation && typeof engineState.last_validation === 'object'
            ? {
                ...engineState.last_validation,
                validation: engineState.last_validation.validation
                    ? {
                        ...engineState.last_validation.validation,
                        proxy_status: sanitizeProxyStatusForPublicPayload(engineState.last_validation.validation.proxy_status),
                    }
                    : engineState.last_validation.validation,
            }
            : engineState.last_validation;

        return {
            engine: {
                ...engineState,
                last_validation: sanitizedEngineValidation,
            },
            services: {
                squid: (squidStatus.stdout || 'unknown').trim(),
                unbound: (unboundStatus.stdout || 'unknown').trim(),
                postgresql: (postgresStatus.stdout || 'unknown').trim(),
                policy_compiler: engineState.compiler_status || 'unknown',
                dns_telemetry: dnsRadar.active && Number(dnsRadar.events_10m || 0) > 0 ? 'active' : dnsRadar.active ? 'idle' : 'inactive',
                squid_telemetry: dnsLogger.active ? 'active' : 'inactive',
                squid_mode: proxyState?.mode || 'unknown',
                policy_engine: engineState.enforcement_mode || 'acl-plus-dns',
                managed_vlan_ids: operationalVlans.map((row: any) => Number(row.vlan_id)).sort((left: number, right: number) => left - right),
                apply_engine: engineState.last_error ? 'degraded' : 'healthy',
                rollback_engine: snapshotValidation?.restorable ? 'healthy' : 'degraded',
                drift_monitor: compilerInspection.filesMatchManifest && !compilerInspection.missingPaths.length ? 'healthy' : 'degraded',
                legacy_risk: legacyRisk.active_scripts.length ? 'danger' : legacyRisk.quarantined_scripts.length ? 'quarantined' : legacyRisk.stubbed_scripts.length ? 'stubbed' : 'none',
                audit_trail: 'active',
                dns_radar: dnsRadar.active ? 'active' : 'inactive',
                dns_contingency: contingencyStatus?.status || 'unknown',
            },
            timestamps: {
                last_apply: engineState.last_apply_at,
                last_rollback: engineState.last_rollback_at,
                last_sync: engineState.last_sync_at,
                last_failure: engineState.last_error,
                last_report: lastReport.rows[0]?.updated_at || null,
                last_dns_event: dnsRadar.last_seen_at || null,
            },
            integrity,
            divergence: {
                manifest_mode: compilerManifest?.enforcementMode || null,
                engine_mode: engineState.enforcement_mode || null,
                mode_mismatch: compilerManifest ? compilerManifest.enforcementMode !== engineState.enforcement_mode : false,
                compiler_version: compilerManifest?.version || null,
            },
            compiler: compilerInspection,
            contingency: contingencyStatus,
            validation: runtimeValidation,
            warnings: {
                squid: squidWarnings,
            },
            snapshot: snapshotValidation,
            legacy_risk: legacyRisk,
            alerts,
            integrity_score: `${integrityScore}/${Object.keys(integrity).length}`,
            uptime: proxyState?.updated_at || null,
            latency_hint_ms: null,
            degraded: Object.values(integrity).some((value) => !value) || alerts.length > 0,
        };
    }

    async buildOverview() {
        await this.syncTelemetry({ background: true });
        const [engineState, health, policyCounts, vlanSummary, traffic, recentFailures, contingency] = await Promise.all([
            this.getEngineState(),
            this.getHealth(),
            Promise.all([
                pool.query(`SELECT COUNT(*)::int AS total FROM blocking_policies WHERE active = TRUE AND ${MANAGED_POLICY_SCOPE_SQL}`),
                pool.query(`SELECT COUNT(*)::int AS total FROM release_policies WHERE active = TRUE AND ${MANAGED_POLICY_SCOPE_SQL}`),
                pool.query(`SELECT COUNT(*)::int AS total FROM policy_exceptions WHERE active = TRUE AND ${MANAGED_EXCEPTION_SCOPE_SQL}`),
                pool.query(`SELECT COUNT(*)::int AS total FROM vlan_policies WHERE vlan_id BETWEEN 1 AND 4094 AND (exempt = TRUE OR blocking_enabled = FALSE OR monitoring_enabled = FALSE)`),
                pool.query(`SELECT COUNT(*)::int AS total FROM vlan_policies WHERE vlan_id BETWEEN 1 AND 4094 AND exempt = FALSE AND blocking_enabled = TRUE AND monitoring_enabled = TRUE`),
            ]),
            this.listVlans(),
            Promise.all([
                pool.query(`SELECT COUNT(*)::int AS total FROM access_events WHERE occurred_at >= date_trunc('day', NOW()) AND vlan_id IN (${MANAGED_VLAN_SQL_LIST}) AND action = 'blocked'`),
                pool.query(`SELECT COUNT(*)::int AS total FROM access_events WHERE occurred_at >= date_trunc('day', NOW()) AND vlan_id IN (${MANAGED_VLAN_SQL_LIST}) AND action = 'allowed'`),
                pool.query(`SELECT COUNT(DISTINCT domain)::int AS total FROM access_events WHERE occurred_at >= NOW() - INTERVAL '7 days' AND vlan_id IN (${MANAGED_VLAN_SQL_LIST})`),
                pool.query(`SELECT COUNT(DISTINCT client_ip)::int AS total FROM access_events WHERE occurred_at >= date_trunc('day', NOW()) AND vlan_id IN (${MANAGED_VLAN_SQL_LIST})`),
                pool.query(`SELECT COUNT(*)::int AS total FROM access_events WHERE occurred_at >= NOW() - INTERVAL '5 minutes' AND vlan_id IN (${MANAGED_VLAN_SQL_LIST}) AND action = 'blocked'`),
                pool.query(`SELECT TO_CHAR(date_trunc('hour', occurred_at), 'HH24:00') AS hour, COUNT(*)::int AS total FROM access_events WHERE occurred_at >= NOW() - INTERVAL '24 hours' AND vlan_id IN (${MANAGED_VLAN_SQL_LIST}) GROUP BY 1 ORDER BY 1`),
                pool.query(`SELECT vlan_id, COUNT(*)::int AS total FROM access_events WHERE occurred_at >= NOW() - INTERVAL '24 hours' AND vlan_id IN (${MANAGED_VLAN_SQL_LIST}) GROUP BY vlan_id ORDER BY total DESC NULLS LAST LIMIT 1`),
                pool.query(`SELECT domain, COUNT(*)::int AS total FROM access_events WHERE occurred_at >= NOW() - INTERVAL '24 hours' AND vlan_id IN (${MANAGED_VLAN_SQL_LIST}) GROUP BY domain ORDER BY total DESC NULLS LAST LIMIT 1`),
            ]),
            pool.query(`SELECT action, message, created_at FROM action_audit_logs WHERE success = FALSE ORDER BY created_at DESC LIMIT 1`),
            dnsContingencyService.getStatus().catch(() => null),
        ]);

        const [blockCount, allowCount, exceptionCount, exemptCount, protectedCount] = policyCounts;
        const [blockedToday, allowedToday, monitoredDomains, activeIps, blocked5m, hourlyVolume, topVlan, topDomain] = traffic;

        const score =
            (health.services.squid === 'active' ? 35 : 0) +
            (engineState.global_blocking_enabled ? 20 : 0) +
            (!engineState.emergency_bypass ? 15 : 0) +
            (recentFailures.rows.length === 0 ? 15 : 0) +
            (health.integrity.whitelist_file && health.integrity.blocklist_file ? 15 : 0);

        const insights = [
            topVlan.rows[0]?.vlan_id ? `VLAN ${topVlan.rows[0].vlan_id} lidera a atividade recente` : 'Sem VLAN dominante suficiente no período',
            topDomain.rows[0]?.domain ? `Maior volume nas últimas 24h: ${topDomain.rows[0].domain}` : 'Sem domínio dominante recente',
            `O módulo opera hoje sobre ${vlanSummary.length} VLAN(s) cadastradas.`,
            `Política global ${engineState.global_blocking_enabled ? 'ativa' : 'desativada'}`,
            contingency?.status === 'active'
                ? `Contingência DNS ativa em escopo ${contingency.scope_type}`
                : 'Contingência DNS inativa',
            recentFailures.rows.length === 0 ? 'Sem falhas críticas na janela recente' : `Última falha: ${recentFailures.rows[0].action}`,
        ];

        return {
            cards: {
                bloqueios_hoje: blockedToday.rows[0]?.total || 0,
                liberacoes_hoje: allowedToday.rows[0]?.total || 0,
                dominios_monitorados: monitoredDomains.rows[0]?.total || 0,
                ips_ativos_hoje: activeIps.rows[0]?.total || 0,
                tentativas_bloqueadas_5m: blocked5m.rows[0]?.total || 0,
                top_vlan_atividade: topVlan.rows[0]?.vlan_id || null,
                saude_motor: health.degraded ? 'degraded' : 'healthy',
                ultima_sincronizacao: engineState.last_sync_at,
                ultima_falha: recentFailures.rows[0] || null,
                politicas_ativas: Number(blockCount.rows[0]?.total || 0) + Number(allowCount.rows[0]?.total || 0),
                excecoes_ativas: exceptionCount.rows[0]?.total || 0,
                vlans_protegidas: protectedCount.rows[0]?.total || 0,
                vlans_isentas: exemptCount.rows[0]?.total || 0,
                dns_contingency_status: contingency?.status || 'unknown',
                dns_contingency_scope: contingency?.scope_type || 'global',
                volume_por_hora: hourlyVolume.rows,
                score_operacional: score,
            },
            insights,
            vlans: vlanSummary,
            contingency,
        };
    }

    async exportPolicies() {
        const [blocks, allows, vlans, exceptions] = await Promise.all([
            this.listPolicies('block'),
            this.listPolicies('allow'),
            this.listVlans(),
            this.listExceptions(),
        ]);
        return { generated_at: new Date().toISOString(), blocks, allows, vlans, exceptions };
    }

    async writeGeneratedArtifacts() {
        await this.ensureReady();
        const [engineState, blocks, allows, vlans, exceptions] = await Promise.all([
            this.getEngineState(),
            this.listPolicies('block', { status: 'active' }),
            this.listPolicies('allow', { status: 'active' }),
            this.listVlans(),
            this.listExceptions({ status: 'active' }),
        ]);

        const mode = (engineState.enforcement_mode || 'acl-plus-dns') as EnforcementMode;
        await this.syncDnsVipFromExceptions(exceptions, { applyRuntime: false });
        const manifest = await policyCompilerService.compile(mode);

        const bypassState = {
            global: Boolean(engineState.emergency_bypass),
            vlans: Object.fromEntries(vlans.map((row) => [row.interface_name, Boolean(row.exempt || !row.blocking_enabled || !row.monitoring_enabled)])),
        };
        fs.writeFileSync(LEGACY_BYPASS_FILE, JSON.stringify(bypassState, null, 2));
        fs.writeFileSync(path.join(ENTERPRISE_DIR, 'vlan-policies.json'), JSON.stringify(vlans, null, 2));
        fs.writeFileSync(path.join(ENTERPRISE_DIR, 'exceptions.json'), JSON.stringify(exceptions, null, 2));
        fs.writeFileSync(path.join(ENTERPRISE_DIR, 'engine-state.json'), JSON.stringify(engineState, null, 2));
        fs.writeFileSync(path.join(ENTERPRISE_DIR, 'export.json'), JSON.stringify({ blocks, allows, vlans, exceptions, engineState, manifest }, null, 2));

        return {
            directory: ENTERPRISE_DIR,
            manifest,
            bypassState,
        };
    }

    async syncDnsVipFromExceptions(exceptions?: any[], options: { applyRuntime?: boolean } = {}) {
        await this.ensureReady();
        const activeExceptions = exceptions || await this.listExceptions({ status: 'active' });

        const { rows: sporadicRows } = await pool.query(
            `SELECT ip FROM sporadic_exceptions WHERE active = TRUE AND expires_at > NOW()`,
        ).catch(() => ({ rows: [] as any[] }));
        const sporadicCandidates = sporadicRows
            .filter((row) => isManagedBlockingIp(row.ip))
            .map((row) => ({ ip: row.ip, vlan_id: null, description: 'Exceção esporádica temporária', responsible: 'sporadic' }));

        const vipCandidates = [
            ...activeExceptions.filter((row) => isManagedBlockingIp(row.ip) || isManagedBlockingVlan(row.vlan_id)),
            ...sporadicCandidates,
        ];

        const activeIps = vipCandidates.map((row) => String(row.ip || '').trim()).filter(Boolean);
        fs.writeFileSync(PROXY_IP_BYPASS_FILE, `${Array.from(new Set(activeIps)).join('\n')}${activeIps.length ? '\n' : ''}`);

        await pool.query(
            `
                UPDATE dns_vip
                SET ativo = FALSE
                WHERE motivo = 'policy_exception'
            `,
        ).catch(() => undefined);

        for (const row of vipCandidates) {
            const cidr = String(row.ip || '').trim();
            if (!cidr) continue;
            await pool.query(
                `
                    INSERT INTO dns_vip (cidr, descricao, responsavel, motivo, ativo)
                    VALUES ($1, $2, $3, 'policy_exception', TRUE)
                    ON CONFLICT (cidr) DO UPDATE
                    SET descricao = EXCLUDED.descricao,
                        responsavel = EXCLUDED.responsavel,
                        motivo = 'policy_exception',
                        ativo = TRUE
                `,
                [
                    cidr,
                    row.description || `Bypass por exceção ${cidr}`,
                    row.responsible || 'bloqueios-liberacoes',
                ],
            ).catch(() => undefined);
        }

        await pool.query(
            `
                DELETE FROM proxy_vips
                WHERE source = 'policy_exception'
            `,
        ).catch(() => undefined);

        for (const cidr of activeIps) {
            await pool.query(
                `
                    INSERT INTO proxy_vips (ip, description, active, source)
                    VALUES ($1, $2, TRUE, 'policy_exception')
                    ON CONFLICT (ip) DO UPDATE
                    SET description = EXCLUDED.description,
                        active = TRUE,
                        source = 'policy_exception',
                        updated_at = NOW()
                `,
                [cidr, `Bypass por IP ${cidr}`],
            ).catch(() => undefined);
        }

        if (options.applyRuntime === false) return;

        const mode = ((await this.getEngineState()).enforcement_mode || policyCompilerService.readManifest()?.enforcementMode || 'acl-plus-dns') as EnforcementMode;
        await policyCompilerService.compile(mode);
        await this.reloadUnbound();
        await dnsContingencyService.ensureFirewallState();
    }

    async regenerateVipRpz() {
        const manifest = policyCompilerService.readManifest();
        await policyCompilerService.compile((manifest?.enforcementMode || 'acl-plus-dns') as EnforcementMode);
        await runCommand('unbound-control', ['reload'], { elevated: true, allowFailure: true }).catch(() => undefined);
    }

    async validateUnbound() {
        return runCommand('unbound-checkconf', [], { elevated: true });
    }

    async reloadUnbound() {
        await runCommand('systemctl', ['reload', 'unbound'], { elevated: true });
        const status = await runCommand('systemctl', ['is-active', 'unbound'], { elevated: true, allowFailure: true });
        if ((status.stdout || '').trim() !== 'active') {
            throw new Error('Unbound não ficou ativo após reload');
        }
        return status;
    }

    async validateCompiledState(mode: EnforcementMode) {
        const unboundValidation = await this.validateUnbound();
        let proxyStatus = null;

        if (mode === 'intercept-selective') {
            proxyStatus = await proxyEngineService.setMode('test-http-only', 'policy-compiler', 'intercept-selective');
        } else {
            proxyStatus = await proxyEngineService.setMode('off', 'policy-compiler', `mode:${mode}`);
        }

        const unboundStatus = await this.reloadUnbound();

        return {
            unbound_validation: {
                stdout: unboundValidation.stdout,
                stderr: unboundValidation.stderr,
                code: unboundValidation.code,
            },
            proxy_status: sanitizeProxyStatusForPublicPayload(proxyStatus),
            unbound_status: unboundStatus.stdout || 'unknown',
        };
    }

    async createSnapshot() {
        const snapshotKey = formatSnapshotKey();
        const snapshotPath = path.join(SNAPSHOT_DIR, snapshotKey);
        fs.mkdirSync(snapshotPath, { recursive: true });
        const files = await this.getSnapshotTargets();
        for (const filePath of files) {
            const relativeName = filePath.replace(/^\//, '').replace(/\//g, '__');
            fs.writeFileSync(path.join(snapshotPath, relativeName), readTextIfExists(filePath));
        }
        fs.writeFileSync(path.join(snapshotPath, 'database-export.json'), JSON.stringify(await this.exportPolicies(), null, 2));
        const runtimeValidation = await this.validateCurrentRuntime();
        const snapshotValidation = await this.validateSnapshot(snapshotPath);
        this.writeSnapshotMeta(snapshotPath, {
            snapshot_key: snapshotKey,
            created_at: new Date().toISOString(),
            status: 'created',
            required_files: files.length,
            runtime_validation: runtimeValidation,
            manifest_version: policyCompilerService.readManifest()?.version || null,
            valid: snapshotValidation.restorable && runtimeValidation.healthy,
            restorable: snapshotValidation.restorable,
            preferred: snapshotValidation.restorable && runtimeValidation.healthy,
            missing_files: snapshotValidation.missingFiles,
        });
        return { snapshotKey, snapshotPath };
    }

    private async findRecentClientsForDomains(domains: string[], vlanIds: number[], lookbackMinutes: number) {
        if (!domains.length) return [];
        const managedVlans = (vlanIds || []).map(Number).filter((value) => Number.isFinite(value) && isManagedBlockingVlan(value));
        const scopedVlans = managedVlans.length ? managedVlans : [10, 30, 50, 70];
        const params: any[] = [lookbackMinutes, scopedVlans];
        const domainClauses = domains.map((domain) => {
            params.push(domain);
            const exactParam = `$${params.length}`;
            params.push(`%.${domain}`);
            const suffixParam = `$${params.length}`;
            return `(domain = ${exactParam} OR domain LIKE ${suffixParam})`;
        });

        const { rows } = await pool.query(
            `
                SELECT DISTINCT client_ip
                FROM access_events
                WHERE occurred_at >= NOW() - ($1::text || ' minutes')::interval
                  AND vlan_id = ANY($2::int[])
                  AND client_ip IS NOT NULL
                  AND (${domainClauses.join(' OR ')})
            `,
            params,
        );

        return rows
            .map((row) => String(row.client_ip || '').trim())
            .filter(Boolean);
    }

    private async dropClientSessions(clientIps: string[], restartSquid = true) {
        const connectionSpecs: Array<{ protocol: 'tcp' | 'udp'; port: number }> = [
            { protocol: 'tcp', port: 80 },
            { protocol: 'tcp', port: 443 },
            { protocol: 'udp', port: 443 },
            { protocol: 'tcp', port: 853 },
        ];

        const conntrack = [];
        for (const clientIp of clientIps) {
            for (const spec of connectionSpecs) {
                const result = await runCommand('conntrack', [
                    '-D',
                    '-s',
                    clientIp,
                    '-p',
                    spec.protocol,
                    '--dport',
                    String(spec.port),
                ], {
                    elevated: true,
                    allowFailure: true,
                });
                conntrack.push({
                    client_ip: clientIp,
                    protocol: spec.protocol,
                    port: spec.port,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    code: result.code,
                });
            }
        }

        const squid = restartSquid
            ? await runCommand('systemctl', ['restart', env.squidServiceName], { elevated: true, allowFailure: true })
            : null;

        return {
            clients: clientIps,
            conntrack,
            squid_restart: squid
                ? { stdout: squid.stdout, stderr: squid.stderr, code: squid.code }
                : null,
        };
    }

    private async filterClientsWithoutActiveBypass(clientIps: string[]) {
        const uniqueClients = Array.from(new Set(clientIps.map((ip) => String(ip || '').replace(/\/32$/, '').trim()).filter(Boolean)));
        if (!uniqueClients.length) return [];

        const { rows: policyRows } = await pool.query(
            `
                SELECT DISTINCT ip::text AS ip
                FROM policy_exceptions
                WHERE active = TRUE
                  AND ip = ANY($1::inet[])
            `,
            [uniqueClients],
        );
        const { rows: sporadicRows } = await pool.query(
            `
                SELECT DISTINCT ip::text AS ip
                FROM sporadic_exceptions
                WHERE active = TRUE
                  AND expires_at > NOW()
                  AND ip = ANY($1::inet[])
            `,
            [uniqueClients],
        ).catch(() => ({ rows: [] as any[] }));
        const rows = [...policyRows, ...sporadicRows];
        const bypassed = new Set(rows.map((row) => String(row.ip || '').replace(/\/32$/, '').trim()));
        return uniqueClients.filter((ip) => !bypassed.has(ip));
    }

    async disconnectClientSessions(clientIps: string[], requestedBy = 'system', reason = 'Política institucional aplicada') {
        const clients = await this.filterClientsWithoutActiveBypass(clientIps);
        if (!clients.length) {
            return { disconnected: false, reason: 'Nenhum cliente fora de bypass ativo', clients: [], conntrack: [], squid_restart: null };
        }

        const terminated = await this.dropClientSessions(clients, false);
        const result = {
            disconnected: true,
            reason,
            affected_clients: clients.length,
            ...terminated,
        };
        await this.recordAudit({
            action: 'disconnect-client-sessions',
            requestedBy,
            payload: { clients, reason },
            result,
            success: true,
            message: `${clients.length} cliente(s) tiveram sessões persistentes derrubadas`,
        });
        return result;
    }

    async disconnectRecentSocialSessions(requestedBy = 'system', options: ApplyOptions = {}) {
        const lookbackMinutes = Number(options.lookback_minutes) > 0 ? Number(options.lookback_minutes) : 120;
        const vlanIds = options.vlan_ids?.length ? options.vlan_ids : [10, 30, 50, 70];
        const clients = await this.findRecentClientsForDomains(SOCIAL_SESSION_DOMAINS, vlanIds, lookbackMinutes);
        const eligibleClients = await this.filterClientsWithoutActiveBypass(clients);

        if (!eligibleClients.length) {
            const result = {
                disconnected: false,
                reason: 'Nenhum cliente recente de redes sociais fora de VIP/exceção',
                domains: SOCIAL_SESSION_DOMAINS,
                vlan_ids: vlanIds,
                lookback_minutes: lookbackMinutes,
                clients: [],
                conntrack: [],
                squid_restart: null,
            };
            await this.recordAudit({
                action: 'disconnect-social-sessions:auto',
                requestedBy,
                payload: { vlan_ids: vlanIds, lookback_minutes: lookbackMinutes },
                result,
                success: true,
                message: result.reason,
            });
            return result;
        }

        const terminated = await this.dropClientSessions(eligibleClients, false);
        const result = {
            disconnected: true,
            domains: SOCIAL_SESSION_DOMAINS,
            vlan_ids: vlanIds,
            lookback_minutes: lookbackMinutes,
            affected_clients: eligibleClients.length,
            ...terminated,
        };
        await this.recordAudit({
            action: 'disconnect-social-sessions:auto',
            requestedBy,
            payload: { vlan_ids: vlanIds, lookback_minutes: lookbackMinutes },
            result,
            success: true,
            message: `${eligibleClients.length} cliente(s) com sessões de redes sociais derrubadas`,
        });
        return result;
    }

    async disconnectActiveSessions(requestedBy = 'system', options: ApplyOptions = {}) {
        const domains = normalizeOptionalPolicyDomains(options.domains);
        if (!domains.length) {
            return { disconnected: false, reason: 'Nenhum domínio informado', clients: [], conntrack: [], squid_restart: null };
        }

        const vlanIds = (options.vlan_ids || []).map(Number).filter(Number.isFinite);
        const lookbackMinutes = Number(options.lookback_minutes) > 0 ? Number(options.lookback_minutes) : 20;
        const recentClients = await this.findRecentClientsForDomains(domains, vlanIds, lookbackMinutes);
        const clients = await this.filterClientsWithoutActiveBypass(recentClients);

        if (!clients.length) {
            const result = {
                disconnected: false,
                reason: 'Nenhum cliente recente fora de VIP/exceção encontrado para os domínios informados',
                domains,
                vlan_ids: vlanIds,
                lookback_minutes: lookbackMinutes,
                clients: [],
                conntrack: [],
                squid_restart: null,
            };
            await this.recordAudit({
                action: 'disconnect-active-sessions',
                requestedBy,
                payload: { domains, vlan_ids: vlanIds, lookback_minutes: lookbackMinutes },
                result,
                success: true,
                message: result.reason,
            });
            return result;
        }

        const terminated = await this.dropClientSessions(clients, options.restart_squid !== false);
        const result = {
            disconnected: true,
            domains,
            vlan_ids: vlanIds,
            lookback_minutes: lookbackMinutes,
            affected_clients: clients.length,
            ...terminated,
        };
        await this.recordAudit({
            action: 'disconnect-active-sessions',
            requestedBy,
            payload: { domains, vlan_ids: vlanIds, lookback_minutes: lookbackMinutes },
            result,
            success: true,
            message: `${clients.length} cliente(s) tiveram sessões ativas derrubadas`,
        });
        return result;
    }

    async apply(requestedBy = 'system', options: ApplyOptions = {}) {
        await this.syncTelemetry();
        const previousManifest = policyCompilerService.readManifest();
        const snapshot = await this.createSnapshot();
        try {
            const artifacts = await this.writeGeneratedArtifacts();
            const mode = (await this.getEngineState()).enforcement_mode as EnforcementMode || 'acl-plus-dns';
            const desiredProxyMode = mode === 'intercept-selective' ? 'test-http-only' : 'off';
            const desiredSquidConfig = await proxyEngineService.renderDesiredSquidConfig(desiredProxyMode);
            const squidConfigAligned = readTextIfExists(env.squidConfigPath) === desiredSquidConfig;
            const noOp = Boolean(previousManifest
                && previousManifest.version === artifacts.manifest.version
                && previousManifest.enforcementMode === artifacts.manifest.enforcementMode
                && JSON.stringify(previousManifest.hashes || {}) === JSON.stringify(artifacts.manifest.hashes || {})
                && squidConfigAligned);
            const validation = noOp
                ? await this.validateCurrentRuntime()
                : await this.validateCompiledState(mode);
            await dnsContingencyService.ensureFirewallState();
            const sessionTermination = options.disconnect_active_sessions
                ? await this.disconnectActiveSessions(requestedBy, options)
                : options.auto_disconnect_social_sessions === false
                    ? null
                    : await this.disconnectRecentSocialSessions(requestedBy, options);
            await this.updateEngineState({
                enforcement_mode: mode,
                last_apply_at: new Date().toISOString(),
                last_apply_by: requestedBy,
                last_snapshot_path: snapshot.snapshotPath,
                last_error: null,
                health_status: 'healthy',
                compiler_status: 'healthy',
                compiler_version: artifacts.manifest.version,
                last_validation: {
                    snapshot: snapshot.snapshotPath,
                    generated_at: new Date().toISOString(),
                    artifacts,
                    validation,
                    session_termination: sessionTermination,
                    no_op: noOp,
                    squid_config_aligned: squidConfigAligned,
                },
            });
            this.writeSnapshotMeta(snapshot.snapshotPath, {
                status: 'valid',
                valid: true,
                restorable: true,
                preferred: true,
            });
            await this.recordAudit({
                action: 'apply',
                requestedBy,
                payload: options,
                result: { snapshot: snapshot.snapshotPath, artifacts, validation, session_termination: sessionTermination, no_op: noOp, squid_config_aligned: squidConfigAligned },
                success: true,
                message: noOp ? 'No-op apply: artefatos já estavam convergentes' : 'Políticas aplicadas',
            });
            return { success: true, snapshot: snapshot.snapshotPath, artifacts, validation, session_termination: sessionTermination, no_op: noOp, squid_config_aligned: squidConfigAligned };
        } catch (error: any) {
            await this.updateEngineState({
                last_error: error.message || String(error),
                health_status: 'degraded',
                compiler_status: 'degraded',
            });
            this.writeSnapshotMeta(snapshot.snapshotPath, {
                status: 'invalid',
                valid: false,
                preferred: false,
                failure: error.message || String(error),
            });
            await this.recordAudit({
                action: 'apply',
                requestedBy,
                payload: {},
                result: { error: error.message || String(error) },
                success: false,
                message: error.message || String(error),
            });
            throw error;
        }
    }

    async rollback(requestedBy = 'system') {
        await this.ensureReady();
        const engineState = await this.getEngineState();
        if (!engineState.last_snapshot_path || !fs.existsSync(engineState.last_snapshot_path)) {
            throw new Error('Nenhum snapshot anterior disponível para rollback');
        }

        const snapshotPath = engineState.last_snapshot_path;
        const snapshotValidation = await this.validateSnapshot(snapshotPath);
        if (!snapshotValidation.restorable) {
            await this.recordAudit({
                action: 'rollback',
                requestedBy,
                payload: { snapshot: snapshotPath },
                result: snapshotValidation,
                success: false,
                message: 'Snapshot corrompido, incompleto ou não restaurável',
            });
            throw new Error(`Snapshot não restaurável: ${snapshotValidation.missingFiles.join(', ') || 'manifesto inválido'}`);
        }
        const filesToRestore = await this.getSnapshotTargets();

        try {
            for (const targetPath of filesToRestore) {
                const sourcePath = path.join(snapshotPath, targetPath.replace(/^\//, '').replace(/\//g, '__'));
                if (fs.existsSync(sourcePath)) {
                    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                    fs.writeFileSync(targetPath, fs.readFileSync(sourcePath, 'utf8'));
                }
            }

            const mode = (engineState.enforcement_mode || 'acl-plus-dns') as EnforcementMode;
            const validation = await this.validateCompiledState(mode);
            await this.updateEngineState({
                last_rollback_at: new Date().toISOString(),
                last_rollback_by: requestedBy,
                last_error: null,
                health_status: 'healthy',
                compiler_status: 'healthy',
                compiler_version: policyCompilerService.readManifest()?.version || engineState.compiler_version || null,
                last_validation: {
                    rollback_snapshot: snapshotPath,
                    restored_at: new Date().toISOString(),
                    validation,
                    snapshot_validation: snapshotValidation,
                },
            });
            await this.recordAudit({
                action: 'rollback',
                requestedBy,
                payload: { snapshot: snapshotPath },
                result: { restored: true, validation, snapshot_validation: snapshotValidation },
                success: true,
                message: 'Rollback executado',
            });
            return { success: true, snapshot: snapshotPath, validation, snapshot_validation: snapshotValidation };
        } catch (error: any) {
            await this.updateEngineState({
                last_error: error.message || String(error),
                health_status: 'degraded',
                compiler_status: 'degraded',
                last_validation: {
                    rollback_snapshot: snapshotPath,
                    restored_at: new Date().toISOString(),
                    partial: true,
                    snapshot_validation: snapshotValidation,
                    error: error.message || String(error),
                },
            });
            await this.recordAudit({
                action: 'rollback',
                requestedBy,
                payload: { snapshot: snapshotPath },
                result: { restored: false, partial: true, snapshot_validation: snapshotValidation, error: error.message || String(error) },
                success: false,
                message: `Rollback parcial/falhou: ${error.message || String(error)}`,
            });
            throw error;
        }
    }

    async setEmergencyBypass(enabled: boolean, requestedBy = 'system') {
        await this.updateEngineState({
            emergency_bypass: enabled,
            health_status: enabled ? 'degraded' : 'healthy',
        });
        await this.writeGeneratedArtifacts();
        await this.validateCompiledState(((await this.getEngineState()).enforcement_mode || 'acl-plus-dns') as EnforcementMode);
        await this.recordAudit({
            action: 'emergency-bypass',
            requestedBy,
            payload: { enabled },
            result: { enabled },
            success: true,
            message: enabled ? 'Bypass global ativado' : 'Bypass global desativado',
        });
        return this.getEngineState();
    }

    async setEnforcementMode(mode: EnforcementMode, requestedBy = 'system') {
        await this.updateEngineState({
            enforcement_mode: mode,
            compiler_status: 'pending',
        });
        await this.recordAudit({
            action: 'mode:update',
            requestedBy,
            payload: { mode },
            result: { mode },
            success: true,
            message: `Modo de enforcement definido para ${mode}`,
        });
        return this.getEngineState();
    }

    async runOperationalAction(action: string, requestedBy = 'system') {
        const handlers: Record<string, () => Promise<any>> = {
            'apply-now': async () => this.apply(requestedBy),
            'disconnect-active-sessions': async () => this.disconnectActiveSessions(requestedBy),
            'restore-baseline': async () => this.restoreExpectedBaseline(requestedBy),
            'reload-engine': async () => {
                const status = await proxyEngineService.getStatus();
                return proxyEngineService.setMode(status.mode || 'off', requestedBy, 'bloqueios-liberacoes:reload');
            },
            'regenerate-config': async () => this.writeGeneratedArtifacts(),
            'validate': async () => this.getHealth(),
            'restart-services': async () => {
                const squid = await runCommand('systemctl', ['restart', env.squidServiceName], { elevated: true, allowFailure: true });
                const unbound = await runCommand('systemctl', ['restart', 'unbound'], { elevated: true, allowFailure: true });
                return { squid, unbound };
            },
            'rollback-last': async () => this.rollback(requestedBy),
            'clean-old-logs': async () => ({ deleted: await proxyEngineService.dnsLoggerService.cleanup(30) }),
            'reindex-metrics': async () => this.syncTelemetry(),
        };
        if (!handlers[action]) throw new Error('Ação operacional inválida');
        const result = await handlers[action]();
        await this.recordAudit({
            action: `ops:${action}`,
            requestedBy,
            payload: {},
            result,
            success: true,
            message: `Ação ${action} executada`,
        });
        return result;
    }

    async listAudit(filters: Record<string, any> = {}) {
        await this.ensureReady();
        const clauses = [`(vlan_id IS NULL OR vlan_id IN (${MANAGED_VLAN_SQL_LIST}))`];
        const params: any[] = [];
        if (filters.user) {
            params.push(String(filters.user));
            clauses.push(`requested_by = $${params.length}`);
        }
        if (filters.action) {
            params.push(String(filters.action));
            clauses.push(`action = $${params.length}`);
        }
        if (filters.status === 'success' || filters.status === 'failure') {
            params.push(filters.status === 'success');
            clauses.push(`success = $${params.length}`);
        }
        if (filters.vlan) {
            params.push(Number(filters.vlan));
            clauses.push(`vlan_id = $${params.length}`);
        }
        if (filters.domain) {
            params.push(String(filters.domain));
            clauses.push(`domain = $${params.length}`);
        }
        if (filters.ip) {
            params.push(String(filters.ip));
            clauses.push(`host(ip) = $${params.length}`);
        }
        if (filters.period === '24h') clauses.push(`created_at >= NOW() - INTERVAL '24 hours'`);
        if (filters.period === '7d') clauses.push(`created_at >= NOW() - INTERVAL '7 days'`);
        if (filters.period === '30d') clauses.push(`created_at >= NOW() - INTERVAL '30 days'`);

        const { rows } = await pool.query(
            `SELECT * FROM action_audit_logs WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT 300`,
            params,
        );
        return rows;
    }

    async getStatus() {
        const [engine, health, contingency, vlans] = await Promise.all([
            this.getEngineState(),
            this.getHealth(),
            dnsContingencyService.getStatus().catch(() => null),
            this.listVlans().catch(() => []),
        ]);
        const operationalVlans = filterOperationalVlans(vlans as any[]);
        const internalDnsByVlan = buildInternalDnsByVlan(operationalVlans as any[]);
        return {
            engine: {
                ...engine,
                mode_label: modeLabel(engine.enforcement_mode),
                available_modes: [
                    {
                        key: 'acl-only',
                        label: 'ACL',
                        hint: 'Proxy explícito complementar, sem enforcement DNS por RPZ.',
                    },
                    {
                        key: 'acl-plus-dns',
                        label: 'ACL + DNS',
                        hint: 'Unbound como enforcement principal com Squid explícito complementar.',
                    },
                    {
                        key: 'intercept-selective',
                        label: 'Interceptação Seletiva',
                        hint: 'Ativa redirecionamento HTTP apenas nas VLANs marcadas para esse modo.',
                    },
                ],
                managed_vlan_ids: operationalVlans.map((row: any) => Number(row.vlan_id)).filter((value: number) => Number.isFinite(value)).sort((left: number, right: number) => left - right),
                internal_dns_by_vlan: internalDnsByVlan,
            },
            health,
            contingency,
        };
    }
}

export const blockingReleaseService = new BlockingReleaseService();
