import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import fs from 'fs/promises';
import { pool } from '../../config/db';
import { identityEnrichment } from '../identity/identity-enrichment';

const INSTITUTION = 'Prefeitura Municipal de Jacarezinho — PR';
const ENTITY = 'Secretaria de Comércio, Indústria, Serviços e Inovação';
const SYSTEM = 'SGCG — Sistema de Governança e Controle Governamental';

const LOGO_PATH = '/opt/controlebeckercorp-v8/frontend/public/jmb-logo-clean.png';
const UFW_LOG_PATH = '/var/log/ufw.log';

const LGPD_REFS = [
    'Lei nº 13.709/2018 (LGPD) — Art. 6º, I: finalidade legítima',
    'Art. 37: registro das operações de tratamento',
    'Art. 46: medidas técnicas de segurança e prevenção',
    'Art. 48: comunicação de incidentes de segurança',
];

const ACTION_LABELS: Record<string, string> = {
    login: 'Acesso ao sistema',
    login_success: 'Acesso autenticado',
    login_failed: 'Tentativa de acesso mal-sucedida',
    logout: 'Encerramento de sessão',
    refresh: 'Renovação de sessão',
    block: 'Bloqueio aplicado',
    unblock: 'Desbloqueio aplicado',
    create: 'Criação de registro',
    update: 'Atualização de registro',
    delete: 'Exclusão de registro',
    create_policy: 'Criação de política',
    update_policy: 'Atualização de política',
    delete_policy: 'Exclusão de política',
    compile_policy: 'Compilação de políticas',
    compile: 'Compilação de políticas',
    restart: 'Reinicialização de serviço',
    emergency_bypass: 'Bypass emergencial ativado',
    bypass_activate: 'Bypass emergencial ativado',
    bypass_deactivate: 'Bypass emergencial encerrado',
    antimalware_scan: 'Varredura antimalware',
    antimalware_update: 'Atualização de assinaturas antimalware',
    sporadic_exception: 'Exceção esporádica concedida',
    vip_add: 'VIP adicionado',
    vip_remove: 'VIP revogado',
    dns_flush: 'Cache DNS limpo',
    dns_zone_add: 'Zona DNS adicionada',
    dns_zone_remove: 'Zona DNS removida',
    contingency_activate: 'Contingência DNS ativada',
    contingency_deactivate: 'Contingência DNS desativada',
    ufw_rule_add: 'Regra de firewall adicionada',
    ufw_rule_delete: 'Regra de firewall removida',
    f2b_ban: 'IP banido pelo Fail2Ban',
    f2b_unban: 'IP liberado pelo Fail2Ban',
    smtp_update: 'Configuração SMTP atualizada',
    hotspot_mac_not_found: 'Hotspot sem MAC identificado',
    hotspot_mac_unknown: 'Hotspot com dispositivo não cadastrado',
    hotspot_auto_login: 'Hotspot liberado por MAC',
    hotspot_register_failed: 'Cadastro de hotspot recusado',
    hotspot_register_success: 'Cadastro de hotspot concluído',
    hotspot_login_failed: 'Login de hotspot recusado',
    hotspot_login_success: 'Login de hotspot concluído',
    hotspot_session_revoked: 'Sessão de hotspot revogada',
    hotspot_enforcement_reconciled: 'Enforcement do hotspot reconciliado',
    hotspot_visitor_create_failed: 'Criação de visitante recusada',
    hotspot_visitor_created: 'Visitante de hotspot criado',
    hotspot_visitor_update_failed: 'Atualização de visitante recusada',
    hotspot_visitor_updated: 'Visitante de hotspot atualizado',
    hotspot_visitor_deleted: 'Visitante de hotspot excluído',
};

const humanizeAction = (action: string | null | undefined): string => {
    if (!action) return '—';
    const key = String(action).toLowerCase().trim();
    if (ACTION_LABELS[key]) return ACTION_LABELS[key];
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const parsePeriod = (p?: string): string => {
    const s = String(p || '24h').toLowerCase().trim();
    if (s.endsWith('h')) return `${parseInt(s, 10)} hours`;
    if (s.endsWith('d')) return `${parseInt(s, 10)} days`;
    if (s.endsWith('m')) return `${parseInt(s, 10)} months`;
    return '24 hours';
};

const fmt = (d: Date | string | null | undefined): string => {
    if (!d) return '—';
    return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }).replace(',', '');
};

const fmtBytes = (b: number | null | undefined): string => {
    const n = Number(b) || 0;
    if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
    if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${n} B`;
};

const p = (params: unknown[], v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
};

export type NavFilters = {
    period?: string;
    ip?: string;
    vlan?: string | number;
    domain?: string;
    source?: 'all' | 'dns' | 'proxy' | 'ufw';
    action?: 'block' | 'allow' | 'all';
    page?: number;
    limit?: number;
    date_from?: string;
    date_to?: string;
    view?: 'events' | 'by_ip';
};

export type AuditFilters = {
    period?: string;
    actor?: string;
    ip?: string;
    source?: 'all' | 'sistema' | 'autenticacao' | 'lgpd' | 'politicas';
    action?: string;
    success?: boolean | 'all' | string;
    page?: number;
    limit?: number;
    date_from?: string;
    date_to?: string;
};

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

const buildTimeFilter = (col: string, params: unknown[], filters: { period?: string; date_from?: string; date_to?: string }): string => {
    if (filters.date_from) {
        let cond = `${col} >= ${p(params, filters.date_from)}::timestamptz`;
        if (filters.date_to) cond += ` AND ${col} <= ${p(params, filters.date_to)}::timestamptz`;
        return cond;
    }
    return `${col} >= NOW() - ${p(params, parsePeriod(filters.period))}::interval`;
};

const periodMs = (period?: string) => {
    const parsed = parsePeriod(period);
    const [rawValue, unit] = parsed.split(' ');
    const value = Math.max(1, parseInt(rawValue, 10) || 24);
    if (unit.startsWith('hour')) return value * 60 * 60 * 1000;
    if (unit.startsWith('day')) return value * 24 * 60 * 60 * 1000;
    if (unit.startsWith('month')) return value * 30 * 24 * 60 * 60 * 1000;
    return 24 * 60 * 60 * 1000;
};

const inferVlanFromIp = (ip: string | null | undefined): number | null => {
    if (!ip) return null;
    const match = /^192\.168\.(\d+)\./.exec(ip);
    if (!match) return null;
    const octet = Number(match[1]);
    return Number.isFinite(octet) ? octet : null;
};

const isInternalAuditIp = (ip: string | null | undefined): boolean => {
    if (!ip) return false;
    return /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) || /^192\.168\./.test(ip);
};

const parseUfwLine = (line: string) => {
    if (!line.includes('[UFW ')) return null;
    const timestamp = line.split(/\s+/, 1)[0];
    const eventAt = new Date(timestamp);
    if (Number.isNaN(eventAt.getTime())) return null;
    const read = (key: string) => {
        const match = new RegExp(`(?:^|\\s)${key}=([^\\s]+)`).exec(line);
        return match?.[1] || null;
    };
    const src = read('SRC');
    if (!isInternalAuditIp(src)) return null;
    const dst = read('DST');
    const proto = read('PROTO');
    const spt = read('SPT');
    const dpt = read('DPT');
    const inIface = read('IN');
    const outIface = read('OUT');
    const actionMatch = /\[UFW\s+([^\]]+)\]/.exec(line);
    const rawAction = actionMatch?.[1] || 'LOG';
    const sourceId = crypto
        .createHash('sha1')
        .update([timestamp, src, dst, proto, spt, dpt, inIface, outIface, rawAction].join('|'))
        .digest('hex');
    return {
        sourceId,
        eventAt,
        clientIp: src,
        vlanId: inferVlanFromIp(src),
        domain: dst || null,
        url: `${proto || 'IP'} ${src || '-'}:${spt || '-'} -> ${dst || '-'}:${dpt || '-'}`,
        method: proto || null,
        statusCode: dpt ? Number(dpt) : null,
        action: rawAction.toLowerCase().includes('block') ? 'blocked' : 'allowed',
        blocked: rawAction.toLowerCase().includes('block'),
        matchedRule: rawAction,
        evidence: {
            in: inIface,
            out: outIface,
            src,
            dst,
            spt,
            dpt,
            proto,
            raw_action: rawAction,
        },
    };
};

const getFilterWindow = (filters: NavFilters) => {
    const now = Date.now();
    const from = filters.date_from ? new Date(filters.date_from).getTime() : now - periodMs(filters.period);
    const to = filters.date_to ? new Date(filters.date_to).getTime() : now;
    return { from, to };
};

const proxyDomainSql = `
    CASE
        WHEN pal.url IS NULL OR pal.url = '' OR pal.url = '-' THEN NULL
        WHEN pal.url ILIKE 'IP:%' THEN LOWER(NULLIF(TRIM(SUBSTRING(pal.url FROM 4)), ''))
        ELSE LOWER(NULLIF(SPLIT_PART(SPLIT_PART(REGEXP_REPLACE(pal.url, '^https?://', '', 'i'), '/', 1), ':', 1), ''))
    END
`;

const proxyIpSql = `
    CASE
        WHEN pal.client_ip ~ '^[0-9]{1,3}(\\.[0-9]{1,3}){3}$' THEN pal.client_ip::inet
        ELSE NULL
    END
`;

const proxyVlanSql = `
    CASE
        WHEN pal.client_ip LIKE '192.168.10.%' THEN 10
        WHEN pal.client_ip LIKE '192.168.30.%' THEN 30
        WHEN pal.client_ip LIKE '192.168.50.%' THEN 50
        WHEN pal.client_ip LIKE '192.168.70.%' THEN 70
        WHEN pal.client_ip LIKE '192.168.99.%' THEN 99
        ELSE NULL
    END
`;

async function syncUfwNavigationEvents(filters: NavFilters = {}) {
    if (filters.source && filters.source !== 'all' && filters.source !== 'ufw') {
        return { inserted: 0, error: null as string | null };
    }
    let content = '';
    try {
        content = await fs.readFile(UFW_LOG_PATH, 'utf8');
    } catch (error: any) {
        return { inserted: 0, error: error?.message || 'ufw_log_unavailable' };
    }

    const { from, to } = getFilterWindow(filters);
    const rows = content
        .split('\n')
        .map(parseUfwLine)
        .filter((row): row is NonNullable<ReturnType<typeof parseUfwLine>> => Boolean(row))
        .filter((row) => {
            const time = row.eventAt.getTime();
            if (time < from || time > to) return false;
            if (filters.ip?.trim() && row.clientIp !== filters.ip.trim()) return false;
            if (filters.vlan) {
                const vlan = parseInt(String(filters.vlan).replace(/\D/g, ''), 10);
                if (Number.isFinite(vlan) && row.vlanId !== vlan) return false;
            }
            if (filters.domain?.trim()) {
                const needle = filters.domain.trim().toLowerCase();
                if (!String(row.domain || row.url || '').toLowerCase().includes(needle)) return false;
            }
            if (filters.action === 'block' && !row.blocked) return false;
            if (filters.action === 'allow' && row.blocked) return false;
            return true;
        })
        .slice(-5000);

    if (!rows.length) return { inserted: 0, error: null as string | null };

    const params: unknown[] = [];
    const tuples = rows.map((row) => {
        const values = [
            row.sourceId,
            row.eventAt,
            row.clientIp,
            row.vlanId,
            row.domain,
            row.url,
            row.method,
            row.statusCode,
            row.action,
            row.blocked,
            row.matchedRule,
            JSON.stringify(row.evidence),
        ];
        const placeholders = values.map((value) => p(params, value));
        return `(${placeholders.join(', ')})`;
    });

    const sql = `
        WITH incoming (
            source_event_id, event_at, client_ip, vlan_id, domain, url, method,
            status_code, action, blocked, matched_rule, evidence
        ) AS (
            VALUES ${tuples.join(',\n')}
        )
        INSERT INTO navigation_events (
            source_type, source_event_id, event_at, client_ip, vlan_id, mac_address,
            identity_type, identity_id, identity_name, identity_username,
            session_type, session_id, domain, url, method, status_code, bytes,
            action, blocked, category, query_type, response_code, policy_source,
            matched_rule, confidence, evidence
        )
        SELECT
            'ufw',
            i.source_event_id::text,
            i.event_at::timestamptz,
            i.client_ip::inet,
            i.vlan_id::int,
            COALESCE(hs.mac_address, cs.mac_address),
            CASE WHEN hs.id IS NOT NULL THEN 'hotspot'
                 WHEN cs.id IS NOT NULL THEN 'collaborator'
                 ELSE NULL END,
            COALESCE(hs.visitor_id::text, cs.user_id::text),
            COALESCE(hv.full_name, cu.full_name),
            cu.username,
            CASE WHEN hs.id IS NOT NULL THEN 'hotspot'
                 WHEN cs.id IS NOT NULL THEN 'collaborator'
                 ELSE NULL END,
            COALESCE(hs.id, cs.id),
            i.domain::text,
            i.url::text,
            i.method::text,
            i.status_code::int,
            NULL,
            i.action::text,
            i.blocked::boolean,
            'firewall',
            NULL,
            NULL,
            'ufw',
            i.matched_rule::text,
            CASE WHEN hs.id IS NOT NULL OR cs.id IS NOT NULL THEN 85 ELSE 55 END,
            i.evidence::jsonb
        FROM incoming i
        LEFT JOIN LATERAL (
            SELECT s.*
            FROM hotspot_sessions s
            WHERE s.client_ip = i.client_ip::inet
              AND i.event_at::timestamptz >= s.started_at
              AND i.event_at::timestamptz <= COALESCE(s.revoked_at, s.expires_at, s.last_seen_at + INTERVAL '4 hours')
            ORDER BY s.started_at DESC
            LIMIT 1
        ) hs ON true
        LEFT JOIN hotspot_visitors hv ON hv.id = hs.visitor_id
        LEFT JOIN LATERAL (
            SELECT s.*
            FROM collab_sessions s
            WHERE s.client_ip = i.client_ip::inet
              AND i.event_at::timestamptz >= s.started_at
              AND i.event_at::timestamptz <= COALESCE(s.revoked_at, s.expires_at)
            ORDER BY s.started_at DESC
            LIMIT 1
        ) cs ON hs.id IS NULL
        LEFT JOIN collab_users cu ON cu.id = cs.user_id
        ON CONFLICT (source_type, source_event_id) DO NOTHING
    `;

    const result = await pool.query(sql, params);
    return { inserted: result.rowCount || 0, error: null as string | null };
}

async function syncNavigationEvents(filters: NavFilters = {}) {
    const dnsParams: unknown[] = [];
    const dnsWhere = [
        buildTimeFilter('d.occurred_at', dnsParams, filters),
        "d.client_ip IS NOT NULL",
        "d.query_name IS NOT NULL",
        "d.query_name <> '-'",
        "d.query_name NOT LIKE '%.local'",
        "d.query_name NOT LIKE '%.arpa'",
        "d.client_ip NOT IN ('127.0.0.1'::inet, '::1'::inet)",
    ];
    if (filters.ip?.trim()) dnsWhere.push(`d.client_ip = ${p(dnsParams, filters.ip.trim())}::inet`);
    if (filters.vlan) {
        const vnum = parseInt(String(filters.vlan).replace(/\D/g, ''), 10);
        if (Number.isFinite(vnum)) dnsWhere.push(`d.vlan_id = ${p(dnsParams, vnum)}`);
    }
    if (filters.domain?.trim()) dnsWhere.push(`d.query_name ILIKE ${p(dnsParams, `%${filters.domain.trim()}%`)}`);
    if (filters.action === 'block') dnsWhere.push(`d.action = 'blocked'`);
    else if (filters.action === 'allow') dnsWhere.push(`d.action <> 'blocked'`);

    const proxyParams: unknown[] = [];
    const proxyWhere = [
        buildTimeFilter('pal.timestamp', proxyParams, filters),
        "pal.client_ip IS NOT NULL",
        "pal.client_ip NOT IN ('127.0.0.1', '::1')",
        `${proxyIpSql} IS NOT NULL`,
        `${proxyDomainSql} IS NOT NULL`,
        `${proxyDomainSql} <> ''`,
    ];
    if (filters.ip?.trim()) proxyWhere.push(`pal.client_ip = ${p(proxyParams, filters.ip.trim())}`);
    if (filters.vlan) {
        const vnum = parseInt(String(filters.vlan).replace(/\D/g, ''), 10);
        if (Number.isFinite(vnum)) proxyWhere.push(`${proxyVlanSql} = ${p(proxyParams, vnum)}`);
    }
    if (filters.domain?.trim()) proxyWhere.push(`${proxyDomainSql} ILIKE ${p(proxyParams, `%${filters.domain.trim()}%`)}`);
    if (filters.action === 'block') proxyWhere.push(`UPPER(COALESCE(pal.action, '')) ~ '(DENIED|BLOCK|FORBIDDEN)'`);
    else if (filters.action === 'allow') proxyWhere.push(`NOT (UPPER(COALESCE(pal.action, '')) ~ '(DENIED|BLOCK|FORBIDDEN)')`);

    const dnsSql = `
        INSERT INTO navigation_events (
            source_type, source_event_id, event_at, client_ip, vlan_id, mac_address,
            identity_type, identity_id, identity_name, identity_username,
            session_type, session_id, domain, url, method, status_code, bytes,
            action, blocked, category, query_type, response_code, policy_source,
            matched_rule, confidence, evidence
        )
        SELECT
            'dns',
            d.id::text,
            d.occurred_at,
            d.client_ip,
            d.vlan_id,
            COALESCE(hs.mac_address, cs.mac_address),
            CASE WHEN hs.id IS NOT NULL THEN 'hotspot'
                 WHEN cs.id IS NOT NULL THEN 'collaborator'
                 WHEN d.identity_user IS NOT NULL OR d.identity_computer IS NOT NULL THEN 'endpoint'
                 ELSE NULL END,
            COALESCE(hs.visitor_id::text, cs.user_id::text),
            COALESCE(hv.full_name, cu.full_name, d.identity_user, d.identity_computer),
            COALESCE(cu.username, d.identity_user),
            CASE WHEN hs.id IS NOT NULL THEN 'hotspot'
                 WHEN cs.id IS NOT NULL THEN 'collaborator'
                 ELSE NULL END,
            COALESCE(hs.id, cs.id),
            LOWER(d.query_name),
            NULL,
            NULL,
            NULL,
            NULL,
            CASE WHEN d.action = 'blocked' THEN 'blocked' ELSE 'allowed' END,
            d.action = 'blocked',
            d.category,
            d.query_type,
            d.response_code,
            d.policy_source,
            d.matched_rule,
            CASE WHEN hs.id IS NOT NULL OR cs.id IS NOT NULL THEN 95
                 WHEN d.identity_user IS NOT NULL OR d.identity_computer IS NOT NULL THEN 80
                 ELSE 65 END,
            jsonb_build_object(
                'resolver', d.resolver,
                'rule_id', d.rule_id,
                'raw_action', d.action,
                'fingerprint', d.fingerprint,
                'identity_user', d.identity_user,
                'identity_computer', d.identity_computer
            )
        FROM dns_policy_events d
        LEFT JOIN LATERAL (
            SELECT s.*
            FROM hotspot_sessions s
            WHERE s.client_ip = d.client_ip
              AND d.occurred_at >= s.started_at
              AND d.occurred_at <= COALESCE(s.revoked_at, s.expires_at, s.last_seen_at + INTERVAL '4 hours')
            ORDER BY s.started_at DESC
            LIMIT 1
        ) hs ON true
        LEFT JOIN hotspot_visitors hv ON hv.id = hs.visitor_id
        LEFT JOIN LATERAL (
            SELECT s.*
            FROM collab_sessions s
            WHERE s.client_ip = d.client_ip
              AND d.occurred_at >= s.started_at
              AND d.occurred_at <= COALESCE(s.revoked_at, s.expires_at)
            ORDER BY s.started_at DESC
            LIMIT 1
        ) cs ON hs.id IS NULL
        LEFT JOIN collab_users cu ON cu.id = cs.user_id
        WHERE ${dnsWhere.join(' AND ')}
        ON CONFLICT (source_type, source_event_id) DO NOTHING
    `;

    const proxySql = `
        INSERT INTO navigation_events (
            source_type, source_event_id, event_at, client_ip, vlan_id, mac_address,
            identity_type, identity_id, identity_name, identity_username,
            session_type, session_id, domain, url, method, status_code, bytes,
            action, blocked, category, query_type, response_code, policy_source,
            matched_rule, confidence, evidence
        )
        SELECT
            'proxy',
            pal.id::text,
            pal.timestamp::timestamptz,
            ${proxyIpSql},
            ${proxyVlanSql},
            COALESCE(hs.mac_address, cs.mac_address),
            CASE WHEN hs.id IS NOT NULL THEN 'hotspot'
                 WHEN cs.id IS NOT NULL THEN 'collaborator'
                 WHEN pal.username IS NOT NULL THEN 'proxy_user'
                 ELSE NULL END,
            COALESCE(hs.visitor_id::text, cs.user_id::text),
            COALESCE(hv.full_name, cu.full_name, pal.username),
            COALESCE(cu.username, pal.username),
            CASE WHEN hs.id IS NOT NULL THEN 'hotspot'
                 WHEN cs.id IS NOT NULL THEN 'collaborator'
                 ELSE NULL END,
            COALESCE(hs.id, cs.id),
            ${proxyDomainSql},
            pal.url,
            pal.method,
            pal.status_code,
            pal.bytes,
            CASE WHEN UPPER(COALESCE(pal.action, '')) ~ '(DENIED|BLOCK|FORBIDDEN)' THEN 'blocked' ELSE 'allowed' END,
            UPPER(COALESCE(pal.action, '')) ~ '(DENIED|BLOCK|FORBIDDEN)',
            NULL,
            NULL,
            NULL,
            'proxy',
            pal.action,
            CASE WHEN hs.id IS NOT NULL OR cs.id IS NOT NULL THEN 90
                 WHEN pal.username IS NOT NULL THEN 75
                 ELSE 60 END,
            jsonb_build_object(
                'proxy_action', pal.action,
                'duration_ms', pal.duration_ms,
                'username', pal.username
            )
        FROM proxy_audit_log pal
        LEFT JOIN LATERAL (
            SELECT s.*
            FROM hotspot_sessions s
            WHERE s.client_ip = ${proxyIpSql}
              AND pal.timestamp::timestamptz >= s.started_at
              AND pal.timestamp::timestamptz <= COALESCE(s.revoked_at, s.expires_at, s.last_seen_at + INTERVAL '4 hours')
            ORDER BY s.started_at DESC
            LIMIT 1
        ) hs ON true
        LEFT JOIN hotspot_visitors hv ON hv.id = hs.visitor_id
        LEFT JOIN LATERAL (
            SELECT s.*
            FROM collab_sessions s
            WHERE s.client_ip = ${proxyIpSql}
              AND pal.timestamp::timestamptz >= s.started_at
              AND pal.timestamp::timestamptz <= COALESCE(s.revoked_at, s.expires_at)
            ORDER BY s.started_at DESC
            LIMIT 1
        ) cs ON hs.id IS NULL
        LEFT JOIN collab_users cu ON cu.id = cs.user_id
        WHERE ${proxyWhere.join(' AND ')}
        ON CONFLICT (source_type, source_event_id) DO NOTHING
    `;

    const results = await Promise.allSettled([
        pool.query(dnsSql, dnsParams),
        pool.query(proxySql, proxyParams),
        syncUfwNavigationEvents(filters),
    ]);

    return {
        dns_inserted: results[0].status === 'fulfilled' ? results[0].value.rowCount : 0,
        proxy_inserted: results[1].status === 'fulfilled' ? results[1].value.rowCount : 0,
        ufw_inserted: results[2].status === 'fulfilled' ? results[2].value.inserted : 0,
        errors: results
            .map((result) => {
                if (result.status === 'rejected') return result.reason?.message || String(result.reason);
                if ('error' in result.value && result.value.error) return result.value.error;
                return null;
            })
            .filter(Boolean),
    };
}

export const reportsService = {
    async ensureSchema() {
        if (schemaReady) return;
        if (schemaPromise) return schemaPromise;
        schemaPromise = (async () => {
            await pool.query(`
                CREATE OR REPLACE FUNCTION prevent_audit_record_modification()
                RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
                BEGIN
                    RAISE EXCEPTION
                        'SGCG: Registros de auditoria são imutáveis. Fundamento: Lei 13.709/2018 (LGPD), Art. 46.'
                    USING ERRCODE = 'restrict_violation';
                END;
                $$;

                DO $outer$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_trigger
                        WHERE tgname = 'trg_immutable_action_audit'
                          AND tgrelid = 'action_audit_logs'::regclass
                    ) THEN
                        EXECUTE $sql$
                            CREATE TRIGGER trg_immutable_action_audit
                                BEFORE UPDATE OR DELETE ON action_audit_logs
                                FOR EACH ROW EXECUTE FUNCTION prevent_audit_record_modification()
                        $sql$;
                    END IF;
                EXCEPTION WHEN undefined_table THEN NULL;
                END $outer$;

                DO $outer$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_trigger
                        WHERE tgname = 'trg_immutable_auth_activity'
                          AND tgrelid = 'auth_activity_logs'::regclass
                    ) THEN
                        EXECUTE $sql$
                            CREATE TRIGGER trg_immutable_auth_activity
                                BEFORE UPDATE OR DELETE ON auth_activity_logs
                                FOR EACH ROW EXECUTE FUNCTION prevent_audit_record_modification()
                        $sql$;
                    END IF;
                EXCEPTION WHEN undefined_table THEN NULL;
                END $outer$;

                DO $outer$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_trigger
                        WHERE tgname = 'trg_immutable_lgpd_audit'
                          AND tgrelid = 'lgpd_audit_logs'::regclass
                    ) THEN
                        EXECUTE $sql$
                            CREATE TRIGGER trg_immutable_lgpd_audit
                                BEFORE UPDATE OR DELETE ON lgpd_audit_logs
                                FOR EACH ROW EXECUTE FUNCTION prevent_audit_record_modification()
                        $sql$;
                    END IF;
                EXCEPTION WHEN undefined_table THEN NULL;
                END $outer$;

                DO $outer$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_trigger
                        WHERE tgname = 'trg_immutable_domain_policy_audit'
                          AND tgrelid = 'domain_policy_audit_logs'::regclass
                    ) THEN
                        EXECUTE $sql$
                            CREATE TRIGGER trg_immutable_domain_policy_audit
                                BEFORE UPDATE OR DELETE ON domain_policy_audit_logs
                                FOR EACH ROW EXECUTE FUNCTION prevent_audit_record_modification()
                        $sql$;
                    END IF;
                EXCEPTION WHEN undefined_table THEN NULL;
                END $outer$;

                CREATE TABLE IF NOT EXISTS navigation_events (
                    id BIGSERIAL PRIMARY KEY,
                    source_type VARCHAR(24) NOT NULL,
                    source_event_id TEXT NOT NULL,
                    event_at TIMESTAMPTZ NOT NULL,
                    client_ip INET NOT NULL,
                    vlan_id INTEGER,
                    mac_address TEXT,
                    identity_type VARCHAR(32),
                    identity_id TEXT,
                    identity_name TEXT,
                    identity_username TEXT,
                    session_type VARCHAR(32),
                    session_id BIGINT,
                    domain TEXT,
                    url TEXT,
                    method VARCHAR(16),
                    status_code INTEGER,
                    bytes BIGINT,
                    action VARCHAR(32) NOT NULL,
                    blocked BOOLEAN NOT NULL DEFAULT FALSE,
                    category TEXT,
                    query_type VARCHAR(32),
                    response_code VARCHAR(32),
                    policy_source TEXT,
                    matched_rule TEXT,
                    confidence INTEGER NOT NULL DEFAULT 50,
                    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (source_type, source_event_id)
                );

                CREATE INDEX IF NOT EXISTS idx_navigation_events_event_at
                    ON navigation_events (event_at DESC);
                CREATE INDEX IF NOT EXISTS idx_navigation_events_ip_time
                    ON navigation_events (client_ip, event_at DESC);
                CREATE INDEX IF NOT EXISTS idx_navigation_events_vlan_time
                    ON navigation_events (vlan_id, event_at DESC);
                CREATE INDEX IF NOT EXISTS idx_navigation_events_domain
                    ON navigation_events (domain);
                CREATE INDEX IF NOT EXISTS idx_navigation_events_source_time
                    ON navigation_events (source_type, event_at DESC);
                CREATE INDEX IF NOT EXISTS idx_navigation_events_session
                    ON navigation_events (session_type, session_id, event_at DESC);

                DO $outer$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_trigger
                        WHERE tgname = 'trg_immutable_navigation_events'
                          AND tgrelid = 'navigation_events'::regclass
                    ) THEN
                        EXECUTE $sql$
                            CREATE TRIGGER trg_immutable_navigation_events
                                BEFORE UPDATE OR DELETE ON navigation_events
                                FOR EACH ROW EXECUTE FUNCTION prevent_audit_record_modification()
                        $sql$;
                    END IF;
                END $outer$;

                CREATE INDEX IF NOT EXISTS idx_proxy_radar_vlan_occurred
                    ON proxy_radar_events (vlan_id, occurred_at DESC);
                CREATE INDEX IF NOT EXISTS idx_proxy_radar_blocked_occurred
                    ON proxy_radar_events (blocked, occurred_at DESC);
                CREATE INDEX IF NOT EXISTS idx_proxy_radar_ip_occurred
                    ON proxy_radar_events (client_ip, occurred_at DESC);
                CREATE INDEX IF NOT EXISTS idx_action_audit_success_created
                    ON action_audit_logs (success, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_action_audit_actor
                    ON action_audit_logs (requested_by, created_at DESC);
            `);
            schemaReady = true;
        })().catch((err) => {
            console.error('[REPORTS] ensureSchema:', err.message);
            schemaPromise = null;
        });
        return schemaPromise;
    },

    async getNavigation(filters: NavFilters) {
        const sync = await syncNavigationEvents(filters);
        const limit = Math.min(Number(filters.limit) || 200, 1000);
        const page = Math.max(Number(filters.page) || 1, 1);
        const offset = (page - 1) * limit;
        const params: unknown[] = [];

        const where: string[] = [
            "ne.client_ip NOT IN ('127.0.0.1'::inet, '::1'::inet)",
            "(ne.domain IS NULL OR (ne.domain NOT LIKE '%.local' AND ne.domain NOT LIKE '%.arpa'))",
        ];

        where.push(buildTimeFilter('ne.event_at', params, filters));

        if (filters.ip?.trim()) {
            where.push(`ne.client_ip = ${p(params, filters.ip.trim())}::inet`);
        }
        if (filters.vlan) {
            const vnum = parseInt(String(filters.vlan).replace(/\D/g, ''), 10);
            where.push(`ne.vlan_id = ${p(params, vnum)}`);
        }
        if (filters.domain?.trim()) {
            where.push(`COALESCE(ne.domain, ne.url, '') ILIKE ${p(params, `%${filters.domain.trim()}%`)}`);
        }
        if (filters.source && filters.source !== 'all') {
            where.push(`ne.source_type = ${p(params, filters.source)}`);
        }
        if (filters.action === 'block') where.push(`ne.blocked = true`);
        else if (filters.action === 'allow') where.push(`ne.blocked = false`);

        const wc = where.join(' AND ');
        const baseParams = params.slice();

        const [rowsRes, statsRes] = await Promise.all([
            pool.query(
                `SELECT
                    ne.id,
                    ne.source_type,
                    ne.source_event_id,
                    ne.event_at AS occurred_at,
                    ne.vlan_id,
                    host(ne.client_ip) AS client_ip,
                    ne.mac_address,
                    ne.identity_type,
                    ne.identity_id,
                    ne.identity_name,
                    ne.identity_username,
                    ne.identity_name AS identity_display_user,
                    ne.identity_username AS identity_user,
                    ne.session_type,
                    ne.session_id,
                    ne.domain,
                    ne.url,
                    ne.method,
                    ne.status_code,
                    ne.bytes,
                    ne.query_type,
                    ne.response_code,
                    ne.action,
                    ne.blocked,
                    ne.category,
                    ne.matched_rule,
                    ne.policy_source,
                    ne.confidence
                FROM navigation_events ne
                WHERE ${wc}
                ORDER BY ne.event_at DESC
                LIMIT ${p(params, limit)} OFFSET ${p(params, offset)}`,
                params,
            ),
            pool.query(
                `SELECT
                    COUNT(*)::bigint AS total,
                    COUNT(*) FILTER (WHERE ne.blocked)::bigint   AS blocked,
                    COUNT(*) FILTER (WHERE NOT ne.blocked)::bigint  AS allowed,
                    COUNT(DISTINCT ne.client_ip)::int   AS unique_ips,
                    COUNT(DISTINCT ne.domain)::int  AS unique_domains,
                    COUNT(*) FILTER (WHERE ne.source_type = 'dns')::bigint AS dns_events,
                    COUNT(*) FILTER (WHERE ne.source_type = 'proxy')::bigint AS proxy_events,
                    COUNT(*) FILTER (WHERE ne.source_type = 'ufw')::bigint AS ufw_events,
                    COUNT(*) FILTER (WHERE ne.session_id IS NOT NULL)::bigint AS session_linked
                FROM navigation_events ne
                WHERE ${wc}`,
                baseParams,
            ),
        ]);

        const total = Number(statsRes.rows[0]?.total ?? 0);
        return {
            rows: identityEnrichment.enrichRows(rowsRes.rows),
            total,
            page,
            limit,
            sync,
            summary: statsRes.rows[0] ?? { total: 0, blocked: 0, allowed: 0, unique_ips: 0, unique_domains: 0 },
        };
    },

    async getNavigationByIp(filters: NavFilters) {
        const sync = await syncNavigationEvents(filters);
        const params: unknown[] = [];
        const where: string[] = [
            "client_ip NOT IN ('127.0.0.1'::inet, '::1'::inet)",
            "(domain IS NULL OR (domain NOT LIKE '%.local' AND domain NOT LIKE '%.arpa'))",
        ];

        where.push(buildTimeFilter('event_at', params, filters));

        if (filters.ip?.trim()) {
            where.push(`client_ip = ${p(params, filters.ip.trim())}::inet`);
        }
        if (filters.vlan) {
            const vnum = parseInt(String(filters.vlan).replace(/\D/g, ''), 10);
            where.push(`vlan_id = ${p(params, vnum)}`);
        }
        if (filters.domain?.trim()) {
            where.push(`COALESCE(domain, url, '') ILIKE ${p(params, `%${filters.domain.trim()}%`)}`);
        }
        if (filters.source && filters.source !== 'all') {
            where.push(`source_type = ${p(params, filters.source)}`);
        }
        if (filters.action === 'block') where.push(`blocked = true`);
        else if (filters.action === 'allow') where.push(`blocked = false`);

        const wc = where.join(' AND ');

        const { rows } = await pool.query(
            `SELECT
                host(client_ip) AS client_ip,
                vlan_id,
                COUNT(*)::bigint AS total,
                COUNT(*) FILTER (WHERE blocked)::bigint  AS blocked,
                COUNT(*) FILTER (WHERE NOT blocked)::bigint AS allowed,
                COUNT(DISTINCT domain)::bigint AS unique_domains,
                COUNT(*) FILTER (WHERE source_type = 'dns')::bigint AS dns_events,
                COUNT(*) FILTER (WHERE source_type = 'proxy')::bigint AS proxy_events,
                COUNT(*) FILTER (WHERE source_type = 'ufw')::bigint AS ufw_events,
                MAX(event_at) AS last_seen,
                MIN(event_at) AS first_seen,
                MAX(identity_name) FILTER (WHERE identity_name IS NOT NULL) AS identity_display_user,
                MAX(identity_username) FILTER (WHERE identity_username IS NOT NULL) AS identity_user,
                MAX(mac_address) FILTER (WHERE mac_address IS NOT NULL) AS mac_address
            FROM navigation_events
            WHERE ${wc}
            GROUP BY client_ip, vlan_id
            ORDER BY total DESC
            LIMIT 300`,
            params,
        );
        return { rows: identityEnrichment.enrichRows(rows), sync };
    },

    async getGovernanceVisual(filters: NavFilters = {}) {
        const effectiveFilters: NavFilters = {
            period: filters.period || '24h',
            source: filters.source || 'all',
            action: filters.action || 'all',
            vlan: filters.vlan,
            domain: filters.domain,
            ip: filters.ip,
            date_from: filters.date_from,
            date_to: filters.date_to,
        };
        const sync = await syncNavigationEvents(effectiveFilters);
        const params: unknown[] = [];
        const where: string[] = [
            "ne.client_ip NOT IN ('127.0.0.1'::inet, '::1'::inet)",
            "(ne.domain IS NULL OR (ne.domain NOT LIKE '%.local' AND ne.domain NOT LIKE '%.arpa'))",
        ];
        where.push(buildTimeFilter('ne.event_at', params, effectiveFilters));
        if (effectiveFilters.vlan) {
            const vnum = parseInt(String(effectiveFilters.vlan).replace(/\D/g, ''), 10);
            if (Number.isFinite(vnum)) where.push(`ne.vlan_id = ${p(params, vnum)}`);
        }
        if (effectiveFilters.domain?.trim()) {
            where.push(`COALESCE(ne.domain, ne.url, '') ILIKE ${p(params, `%${effectiveFilters.domain.trim()}%`)}`);
        }
        if (effectiveFilters.ip?.trim()) {
            where.push(`ne.client_ip = ${p(params, effectiveFilters.ip.trim())}::inet`);
        }
        if (effectiveFilters.source && effectiveFilters.source !== 'all') {
            where.push(`ne.source_type = ${p(params, effectiveFilters.source)}`);
        }
        if (effectiveFilters.action === 'block') where.push('ne.blocked = true');
        else if (effectiveFilters.action === 'allow') where.push('ne.blocked = false');

        const wc = where.join(' AND ');
        const baseParams = params.slice();

        const [
            summary,
            byHour,
            byVlan,
            byCategory,
            topBlockedDomains,
            topAllowedDomains,
            topClients,
            sourceDistribution,
            policyHits,
            sessionTypes,
            anomalies,
        ] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(*)::bigint AS total,
                    COUNT(*) FILTER (WHERE ne.blocked)::bigint AS blocked,
                    COUNT(*) FILTER (WHERE NOT ne.blocked)::bigint AS allowed,
                    COUNT(DISTINCT ne.client_ip)::int AS unique_ips,
                    COUNT(DISTINCT ne.domain)::int AS unique_domains,
                    COUNT(*) FILTER (WHERE ne.session_id IS NOT NULL)::bigint AS session_linked,
                    COUNT(*) FILTER (WHERE ne.source_type = 'dns')::bigint AS dns_events,
                    COUNT(*) FILTER (WHERE ne.source_type = 'proxy')::bigint AS proxy_events,
                    COUNT(*) FILTER (WHERE ne.source_type = 'ufw')::bigint AS ufw_events,
                    COUNT(DISTINCT ne.vlan_id)::int AS active_vlans
                FROM navigation_events ne
                WHERE ${wc}
            `, baseParams),
            pool.query(`
                SELECT
                    date_trunc('hour', ne.event_at) AS bucket,
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE ne.blocked)::int AS blocked,
                    COUNT(*) FILTER (WHERE NOT ne.blocked)::int AS allowed
                FROM navigation_events ne
                WHERE ${wc}
                GROUP BY bucket
                ORDER BY bucket ASC
            `, baseParams),
            pool.query(`
                SELECT
                    COALESCE(ne.vlan_id::text, 'n/d') AS vlan_id,
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE ne.blocked)::int AS blocked,
                    COUNT(*) FILTER (WHERE NOT ne.blocked)::int AS allowed,
                    COUNT(DISTINCT ne.client_ip)::int AS unique_ips,
                    COUNT(DISTINCT ne.domain)::int AS unique_domains
                FROM navigation_events ne
                WHERE ${wc}
                GROUP BY COALESCE(ne.vlan_id::text, 'n/d')
                ORDER BY total DESC
                LIMIT 12
            `, baseParams),
            pool.query(`
                SELECT
                    COALESCE(NULLIF(ne.category, ''), 'Sem classificacao') AS category,
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE ne.blocked)::int AS blocked
                FROM navigation_events ne
                WHERE ${wc}
                GROUP BY COALESCE(NULLIF(ne.category, ''), 'Sem classificacao')
                ORDER BY blocked DESC, total DESC
                LIMIT 12
            `, baseParams),
            pool.query(`
                SELECT
                    COALESCE(ne.domain, ne.url, 'sem dominio') AS domain,
                    COUNT(*)::int AS total,
                    COUNT(DISTINCT ne.client_ip)::int AS unique_ips,
                    MAX(ne.event_at) AS last_seen,
                    MAX(ne.policy_source) FILTER (WHERE ne.policy_source IS NOT NULL) AS policy_source
                FROM navigation_events ne
                WHERE ${wc} AND ne.blocked
                GROUP BY COALESCE(ne.domain, ne.url, 'sem dominio')
                ORDER BY total DESC
                LIMIT 12
            `, baseParams),
            pool.query(`
                SELECT
                    COALESCE(ne.domain, ne.url, 'sem dominio') AS domain,
                    COUNT(*)::int AS total,
                    COUNT(DISTINCT ne.client_ip)::int AS unique_ips,
                    MAX(ne.event_at) AS last_seen
                FROM navigation_events ne
                WHERE ${wc} AND NOT ne.blocked
                GROUP BY COALESCE(ne.domain, ne.url, 'sem dominio')
                ORDER BY total DESC
                LIMIT 12
            `, baseParams),
            pool.query(`
                SELECT
                    host(ne.client_ip) AS client_ip,
                    COALESCE(MAX(ne.identity_name), MAX(ne.identity_username), 'Sem identidade') AS identity_label,
                    MAX(ne.mac_address) FILTER (WHERE ne.mac_address IS NOT NULL) AS mac_address,
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE ne.blocked)::int AS blocked,
                    COUNT(*) FILTER (WHERE NOT ne.blocked)::int AS allowed,
                    COUNT(DISTINCT ne.domain)::int AS unique_domains,
                    MAX(ne.event_at) AS last_seen
                FROM navigation_events ne
                WHERE ${wc}
                GROUP BY ne.client_ip
                ORDER BY blocked DESC, total DESC
                LIMIT 12
            `, baseParams),
            pool.query(`
                SELECT
                    ne.source_type,
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE ne.blocked)::int AS blocked
                FROM navigation_events ne
                WHERE ${wc}
                GROUP BY ne.source_type
                ORDER BY total DESC
            `, baseParams),
            pool.query(`
                SELECT
                    COALESCE(NULLIF(ne.policy_source, ''), 'sem politica') AS policy_source,
                    COALESCE(NULLIF(ne.matched_rule, ''), 'sem regra') AS matched_rule,
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE ne.blocked)::int AS blocked
                FROM navigation_events ne
                WHERE ${wc}
                GROUP BY COALESCE(NULLIF(ne.policy_source, ''), 'sem politica'), COALESCE(NULLIF(ne.matched_rule, ''), 'sem regra')
                ORDER BY blocked DESC, total DESC
                LIMIT 10
            `, baseParams),
            pool.query(`
                SELECT
                    COALESCE(ne.session_type, 'sem sessao') AS session_type,
                    COUNT(*)::int AS total
                FROM navigation_events ne
                WHERE ${wc}
                GROUP BY COALESCE(ne.session_type, 'sem sessao')
                ORDER BY total DESC
            `, baseParams),
            pool.query(`
                WITH hour_counts AS (
                    SELECT date_trunc('hour', ne.event_at) AS bucket, COUNT(*)::float AS total
                    FROM navigation_events ne
                    WHERE ${wc}
                    GROUP BY bucket
                ),
                stats AS (
                    SELECT AVG(total) AS avg_total, STDDEV_POP(total) AS std_total FROM hour_counts
                )
                SELECT
                    h.bucket,
                    h.total::int AS total,
                    ROUND(COALESCE((h.total - s.avg_total) / NULLIF(s.std_total, 0), 0)::numeric, 2) AS score
                FROM hour_counts h CROSS JOIN stats s
                WHERE h.total > COALESCE(s.avg_total, 0)
                ORDER BY score DESC, h.total DESC
                LIMIT 5
            `, baseParams),
        ]);

        return {
            generated_at: new Date().toISOString(),
            scope: effectiveFilters,
            sync,
            summary: summary.rows[0] || {},
            charts: {
                by_hour: byHour.rows,
                by_vlan: byVlan.rows,
                by_category: byCategory.rows,
                top_blocked_domains: topBlockedDomains.rows,
                top_allowed_domains: topAllowedDomains.rows,
                top_clients: identityEnrichment.enrichRows(topClients.rows),
                source_distribution: sourceDistribution.rows,
                policy_hits: policyHits.rows,
                session_types: sessionTypes.rows,
                anomalies: anomalies.rows,
            },
        };
    },

    async getSystemAudit(filters: AuditFilters) {
        const limit = Math.min(Number(filters.limit) || 200, 1000);
        const page = Math.max(Number(filters.page) || 1, 1);
        const source = String(filters.source || 'all');
        const successFilter = filters.success === 'true' || filters.success === true
            ? true : filters.success === 'false' || filters.success === false ? false : null;

        const buildQuery = (
            tableSrc: 'action' | 'auth' | 'lgpd' | 'policy',
            params: unknown[],
        ): string | null => {
            const w: string[] = [];
            const timeCol = tableSrc === 'auth' ? 'created_at' : 'created_at';
            w.push(buildTimeFilter(timeCol, params, filters));

            const actorCol = tableSrc === 'action' ? 'requested_by'
                : tableSrc === 'auth' ? 'username'
                : tableSrc === 'lgpd' ? 'actor_username'
                : 'requested_by';

            const ipCol = tableSrc === 'action' ? 'actor_ip'
                : tableSrc === 'auth' ? 'ip_address'
                : tableSrc === 'lgpd' ? 'actor_ip'
                : null;

            if (filters.actor?.trim()) {
                w.push(`COALESCE(${actorCol}, '') ILIKE ${p(params, '%' + filters.actor.trim() + '%')}`);
            }
            if (filters.ip?.trim() && ipCol) {
                w.push(`${ipCol} = ${p(params, filters.ip.trim())}`);
            }
            if (filters.action?.trim()) {
                w.push(`action ILIKE ${p(params, '%' + filters.action.trim() + '%')}`);
            }
            if (successFilter !== null) {
                w.push(`success = ${p(params, successFilter)}`);
            }

            const wc = w.join(' AND ');

            if (tableSrc === 'action') {
                return `
                    SELECT id::text AS id, 'sistema' AS source, created_at,
                        COALESCE(requested_by, 'sistema') AS actor,
                        actor_ip AS ip, actor_user_agent AS user_agent,
                        action,
                        COALESCE(route, method, '-') AS module,
                        method, status_code, success, message
                    FROM action_audit_logs
                    WHERE ${wc}
                      AND LOWER(COALESCE(requested_by, '')) <> 'codex'
                    ORDER BY created_at DESC LIMIT 1500
                `;
            }
            if (tableSrc === 'auth') {
                return `
                    SELECT id::text AS id, 'autenticacao' AS source, created_at,
                        COALESCE(username, 'anonimo') AS actor,
                        ip_address AS ip, user_agent,
                        action,
                        COALESCE(module_name, 'auth') AS module,
                        method, NULL::int AS status_code, success,
                        COALESCE(detail::text, status) AS message
                    FROM auth_activity_logs
                    WHERE ${wc}
                      AND LOWER(COALESCE(username, '')) <> 'codex'
                    ORDER BY created_at DESC LIMIT 1500
                `;
            }
            if (tableSrc === 'lgpd') {
                return `
                    SELECT id::text AS id, 'lgpd' AS source, created_at,
                        COALESCE(actor_username, 'sistema') AS actor,
                        actor_ip AS ip, actor_user_agent AS user_agent,
                        action,
                        COALESCE(entity_type, 'lgpd') AS module,
                        NULL AS method, NULL::int AS status_code, success, message
                    FROM lgpd_audit_logs
                    WHERE ${wc}
                      AND LOWER(COALESCE(actor_username, '')) <> 'codex'
                    ORDER BY created_at DESC LIMIT 1500
                `;
            }
            if (tableSrc === 'policy') {
                return `
                    SELECT id::text AS id, 'politicas' AS source, created_at,
                        COALESCE(requested_by, 'sistema') AS actor,
                        NULL AS ip, NULL AS user_agent,
                        action,
                        'politica-dominio' AS module,
                        NULL AS method, NULL::int AS status_code, success, message
                    FROM domain_policy_audit_logs
                    WHERE ${wc}
                      AND LOWER(COALESCE(requested_by, '')) <> 'codex'
                    ORDER BY created_at DESC LIMIT 1500
                `;
            }
            return null;
        };

        const included = (s: string) => source === 'all' || source === s;

        const runQuery = async (tableSrc: 'action' | 'auth' | 'lgpd' | 'policy', tableName: string) => {
            const params: unknown[] = [];
            const sql = buildQuery(tableSrc, params);
            if (!sql) return [];
            try {
                const exists = await pool.query(
                    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
                    [tableName],
                );
                if (!exists.rows.length) return [];
                const { rows } = await pool.query(sql, params);
                return rows;
            } catch (e: any) {
                console.error(`[REPORTS] audit query ${tableSrc}:`, e.message);
                return [];
            }
        };

        const [sysRows, authRows, lgpdRows, policyRows] = await Promise.all([
            included('sistema') ? runQuery('action', 'action_audit_logs') : Promise.resolve([]),
            included('autenticacao') ? runQuery('auth', 'auth_activity_logs') : Promise.resolve([]),
            included('lgpd') ? runQuery('lgpd', 'lgpd_audit_logs') : Promise.resolve([]),
            included('politicas') ? runQuery('policy', 'domain_policy_audit_logs') : Promise.resolve([]),
        ]);

        const all = identityEnrichment.enrichRows([...sysRows, ...authRows, ...lgpdRows, ...policyRows])
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const total = all.length;
        const rows = all.slice((page - 1) * limit, page * limit);

        const failed = all.filter((r) => !r.success).length;
        const uniqueActors = new Set(all.map((r) => r.actor).filter(Boolean)).size;
        const logins = authRows.filter((r) => String(r.action).includes('login')).length;

        return {
            rows,
            total,
            page,
            limit,
            summary: {
                total,
                failed,
                succeeded: total - failed,
                unique_actors: uniqueActors,
                logins,
            },
        };
    },

    async exportNavigationPdf(filters: NavFilters) {
        const data = await this.getNavigation({ ...filters, limit: 1000, page: 1 });
        return new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true });
            const chunks: Buffer[] = [];
            doc.on('data', (c) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            let y = 36;
            let pageNum = 1;
            const W = 769; // landscape A4 minus 2*36 margins
            const M = 36;

            const drawHeader = () => {
                doc.rect(M, y, W, 74).fillColor('#0f172a').fill();
                doc.fillColor('#f1f5f9').font('Helvetica-Bold').fontSize(12)
                    .text('PREFEITURA MUNICIPAL DE JACAREZINHO — PARANÁ', M + 12, y + 8, { width: W - 24 });
                doc.fillColor('#cbd5e1').font('Helvetica').fontSize(8.5)
                    .text(ENTITY, M + 12, y + 27, { width: W - 24 });
                doc.fillColor('#64748b').font('Helvetica').fontSize(7.5)
                    .text(SYSTEM, M + 12, y + 43, { width: W - 24 });
                doc.fillColor('#7dd3fc').font('Helvetica-Bold').fontSize(9)
                    .text('Relatório Forense de Navegação — ' + fmt(new Date()), M + 12, y + 57, { width: W - 24 });
                y += 86;

                // LGPD bar
                doc.rect(M, y, W, 20).fillColor('#1e3a5f').fill();
                doc.fillColor('#93c5fd').font('Helvetica').fontSize(7)
                    .text('⚖  ' + LGPD_REFS.join('   ·   '), M + 8, y + 6, { width: W - 16 });
                y += 28;
            };

            const drawFooter = (pn: number, _total: number) => {
                doc.moveTo(M, 543).lineTo(M + W, 543).strokeColor('#e2e8f0').stroke();
                doc.fillColor('#64748b').font('Helvetica').fontSize(7)
                    .text(`Gerado em ${fmt(new Date())} • Documento de uso institucional restrito`, M, 549, { width: 370 });
                try { doc.image(LOGO_PATH, M + W - 132, 540, { width: 46, height: 20 }); } catch (_) {}
                doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7)
                    .text('JMB Tecnologia', M + W - 82, 546, { width: 82, align: 'right' });
                doc.fillColor('#64748b').font('Helvetica').fontSize(6.5)
                    .text(`Página ${pn}`, M + W - 82, 557, { width: 82, align: 'right' });
            };

            drawHeader();

            // Stats cards
            const stats = [
                ['Total', data.summary.total],
                ['Bloqueados', data.summary.blocked],
                ['Liberados', data.summary.allowed],
                ['IPs únicos', data.summary.unique_ips],
                ['Domínios únicos', data.summary.unique_domains],
            ];
            let sx = M;
            for (const [label, val] of stats) {
                const cw = W / stats.length - 4;
                doc.roundedRect(sx, y, cw, 40, 4).fillAndStroke('#f8fafc', '#e2e8f0');
                doc.fillColor('#64748b').font('Helvetica').fontSize(7).text(String(label).toUpperCase(), sx + 8, y + 7, { width: cw - 16 });
                doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text(String(val), sx + 8, y + 18, { width: cw - 16 });
                sx += cw + 4;
            }
            y += 50;

            // Filters
            const filterStr = Object.entries(filters)
                .filter(([, v]) => v !== undefined && v !== null && String(v) !== '' && !['page', 'limit'].includes(String(v)))
                .map(([k, v]) => `${k}: ${v}`)
                .join('   |   ') || 'período: 24h';
            doc.fillColor('#475569').font('Helvetica').fontSize(8).text(`Filtros: ${filterStr}`, M, y, { width: W });
            y += 18;

            // Table — colunas adaptadas para DNS (sem URL/bytes, com tipo de query e categoria)
            const cols = [
                { label: 'Data / Hora', w: 108 },
                { label: 'Origem', w: 164 },
                { label: 'VLAN', w: 48 },
                { label: 'Domínio consultado', w: 170 },
                { label: 'Tipo', w: 44 },
                { label: 'Ação', w: 68 },
                { label: 'Resposta DNS', w: 72 },
                { label: 'Categoria', w: 95 },
            ];

            const drawTableHeader = () => {
                doc.rect(M, y, W, 20).fillColor('#334155').fill();
                let cx = M;
                for (const c of cols) {
                    doc.fillColor('#e2e8f0').font('Helvetica-Bold').fontSize(7)
                        .text(c.label, cx + 4, y + 6, { width: c.w - 8 });
                    cx += c.w;
                }
                y += 24;
            };

            drawTableHeader();

            let row = 0;
            for (const ev of data.rows) {
                if (y > 525) {
                    drawFooter(pageNum, data.rows.length);
                    doc.addPage({ size: 'A4', layout: 'landscape', margin: 36 });
                    pageNum++;
                    y = 36;
                    drawHeader();
                    drawTableHeader();
                }
                const isBlock = Boolean(ev.blocked);
                const bg = row % 2 === 0 ? '#f8fafc' : '#ffffff';
                doc.rect(M, y, W, 16).fillColor(bg).fill();
                if (isBlock) doc.rect(M, y, 3, 16).fillColor('#ef4444').fill();
                else doc.rect(M, y, 3, 16).fillColor('#22c55e').fill();

                const cells = [
                    fmt(ev.occurred_at),
                    `${ev.client_ip || '—'} ${ev.identity_display_user || ev.identity_user || ev.identity_computer ? '• ' + (ev.identity_display_user || ev.identity_user || ev.identity_computer) : ''}`,
                    String(ev.vlan_id ?? '—'),
                    String(ev.domain || '—').substring(0, 55),
                    String(ev.query_type || '—'),
                    isBlock ? 'BLOQUEADO' : (ev.action === 'bypassed' ? 'BYPASS' : 'LIBERADO'),
                    String(ev.response_code || '—'),
                    String(ev.category || '—'),
                ];
                let cx = M;
                for (let i = 0; i < cols.length; i++) {
                    const color = i === 5 ? (isBlock ? '#dc2626' : '#16a34a') : '#1e293b';
                    doc.fillColor(color).font(i === 5 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
                        .text(cells[i], cx + 4, y + 4, { width: cols[i].w - 8, ellipsis: true });
                    cx += cols[i].w;
                }
                y += 16;
                row++;
            }

            drawFooter(pageNum, data.rows.length);
            doc.end();
        });
    },

    async exportAuditPdf(filters: AuditFilters) {
        const data = await this.getSystemAudit({ ...filters, limit: 1000, page: 1 });
        return new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
            const chunks: Buffer[] = [];
            doc.on('data', (c) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            let y = 42;
            let pageNum = 1;
            const W = 511; // 595 - 2*42
            const M = 42;

            const drawHeader = () => {
                doc.rect(M, y, W, 74).fillColor('#0f172a').fill();
                doc.fillColor('#f1f5f9').font('Helvetica-Bold').fontSize(11)
                    .text('PREFEITURA MUNICIPAL DE JACAREZINHO — PARANÁ', M + 12, y + 8, { width: W - 24 });
                doc.fillColor('#cbd5e1').font('Helvetica').fontSize(8.5)
                    .text(ENTITY, M + 12, y + 26, { width: W - 24 });
                doc.fillColor('#64748b').font('Helvetica').fontSize(7.5)
                    .text(SYSTEM, M + 12, y + 42, { width: W - 24 });
                doc.fillColor('#7dd3fc').font('Helvetica-Bold').fontSize(9)
                    .text('Relatório Forense de Auditoria do Sistema — ' + fmt(new Date()), M + 12, y + 57, { width: W - 24 });
                y += 86;

                doc.rect(M, y, W, 20).fillColor('#1e3a5f').fill();
                doc.fillColor('#93c5fd').font('Helvetica').fontSize(7)
                    .text('⚖  ' + LGPD_REFS.slice(0, 3).join('   ·   '), M + 8, y + 6, { width: W - 16 });
                y += 28;
            };

            const drawFooter = (pn: number) => {
                doc.moveTo(M, 775).lineTo(M + W, 775).strokeColor('#e2e8f0').stroke();
                doc.fillColor('#64748b').font('Helvetica').fontSize(7)
                    .text(`Gerado em ${fmt(new Date())} • Documento de uso institucional restrito`, M, 780, { width: 300 });
                try { doc.image(LOGO_PATH, M + W - 132, 772, { width: 46, height: 20 }); } catch (_) {}
                doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7)
                    .text('JMB Tecnologia', M + W - 82, 777, { width: 82, align: 'right' });
                doc.fillColor('#64748b').font('Helvetica').fontSize(6.5)
                    .text(`Página ${pn}`, M + W - 82, 787, { width: 82, align: 'right' });
            };

            drawHeader();

            // Stats
            const stats = [
                ['Total', data.summary.total],
                ['Logins', data.summary.logins],
                ['Falhas', data.summary.failed],
                ['Operadores', data.summary.unique_actors],
            ];
            let sx = M;
            const cw = (W - 12) / 4;
            for (const [label, val] of stats) {
                doc.roundedRect(sx, y, cw, 40, 4).fillAndStroke('#f8fafc', '#e2e8f0');
                doc.fillColor('#64748b').font('Helvetica').fontSize(7).text(String(label).toUpperCase(), sx + 8, y + 7);
                doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(15).text(String(val), sx + 8, y + 19);
                sx += cw + 4;
            }
            y += 50;

            const filterStr = Object.entries(filters)
                .filter(([, v]) => v !== undefined && v !== null && String(v) !== '' && !['page', 'limit'].includes(String(v)))
                .map(([k, v]) => `${k}: ${v}`)
                .join('   |   ') || 'período: 24h';
            doc.fillColor('#475569').font('Helvetica').fontSize(8).text(`Filtros: ${filterStr}`, M, y, { width: W });
            y += 18;

            const cols = [
                { label: 'Data / Hora', w: 86 },
                { label: 'Fonte', w: 62 },
                { label: 'Operador', w: 92 },
                { label: 'IP', w: 84 },
                { label: 'Módulo / Rota', w: 88 },
                { label: 'Ação', w: 68 },
                { label: 'Resultado', w: 31 },
            ];

            const drawTableHeader = () => {
                doc.rect(M, y, W, 20).fillColor('#334155').fill();
                let cx = M;
                for (const c of cols) {
                    doc.fillColor('#e2e8f0').font('Helvetica-Bold').fontSize(7)
                        .text(c.label, cx + 4, y + 6, { width: c.w - 8 });
                    cx += c.w;
                }
                y += 24;
            };

            drawTableHeader();

            const srcColor: Record<string, string> = {
                sistema: '#3b82f6',
                autenticacao: '#8b5cf6',
                lgpd: '#f59e0b',
                politicas: '#10b981',
            };

            let row = 0;
            for (const ev of data.rows) {
                if (y > 760) {
                    drawFooter(pageNum);
                    doc.addPage({ size: 'A4', margin: 42 });
                    pageNum++;
                    y = 42;
                    drawHeader();
                    drawTableHeader();
                }
                const ok = Boolean(ev.success);
                const bg = row % 2 === 0 ? '#f8fafc' : '#ffffff';
                doc.rect(M, y, W, 16).fillColor(bg).fill();
                doc.rect(M, y, 3, 16).fillColor(ok ? '#22c55e' : '#ef4444').fill();

                const cells = [
                    fmt(ev.created_at),
                    String(ev.source || '—'),
                    String(ev.actor || '—').substring(0, 18),
                    String(ev.ip || '—'),
                    String(ev.module || '—').substring(0, 22),
                    humanizeAction(ev.action).substring(0, 40),
                    ok ? 'OK' : 'FALHA',
                ];

                let cx = M;
                for (let i = 0; i < cols.length; i++) {
                    let color = '#1e293b';
                    if (i === 1) color = srcColor[ev.source] || '#64748b';
                    if (i === 6) color = ok ? '#16a34a' : '#dc2626';
                    doc.fillColor(color).font(i === 6 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
                        .text(cells[i], cx + 4, y + 4, { width: cols[i].w - 8, ellipsis: true });
                    cx += cols[i].w;
                }
                y += 16;
                row++;
            }

            drawFooter(pageNum);
            doc.end();
        });
    },
};
