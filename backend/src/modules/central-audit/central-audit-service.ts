import { pool } from '../../config/db';

type AuditCategory =
    | 'seguranca'
    | 'rede'
    | 'sistema'
    | 'usuarios'
    | 'chamados'
    | 'lgpd'
    | 'automacao'
    | 'infraestrutura';

type AuditSeverity = 'info' | 'success' | 'warning' | 'critical';

export type AuditFilters = {
    category?: string;
    source?: string;
    actor?: string;
    ip?: string;
    action?: string;
    severity?: string;
    success?: string;
    search?: string;
    period?: string;
    date_from?: string;
    date_to?: string;
    limit?: string;
};

const CATEGORY_LABELS: Record<AuditCategory, string> = {
    seguranca: 'Seguranca',
    rede: 'Rede',
    sistema: 'Sistema',
    usuarios: 'Usuarios',
    chamados: 'Chamados',
    lgpd: 'LGPD',
    automacao: 'Automacao',
    infraestrutura: 'Infraestrutura',
};

const PERIODS: Record<string, string> = {
    '30m': '30 minutes',
    '1h': '1 hour',
    '6h': '6 hours',
    '12h': '12 hours',
    '24h': '24 hours',
    '7d': '7 days',
    '30d': '30 days',
    '90d': '90 days',
};

const SOURCE_CATEGORIES: Record<string, AuditCategory> = {
    central: 'sistema',
    sistema: 'sistema',
    autenticacao: 'seguranca',
    auth: 'seguranca',
    institucional: 'sistema',
    lgpd: 'lgpd',
    hotspot: 'usuarios',
    colaboradores: 'usuarios',
    chamados: 'chamados',
    suporte: 'chamados',
    politicas: 'rede',
    proxy: 'rede',
    dns: 'rede',
    contingencia_dns: 'rede',
    navegacao: 'rede',
    antimalware: 'seguranca',
};

const clampLimit = (value?: string) => {
    const parsed = Number(value || 240);
    if (!Number.isFinite(parsed)) return 240;
    return Math.max(1, Math.min(500, Math.trunc(parsed)));
};

const parsePeriod = (period?: string) => PERIODS[String(period || '24h').toLowerCase()] || PERIODS['24h'];

const hasTable = async (table: string) => {
    const { rows } = await pool.query('SELECT to_regclass($1) AS name', [table]);
    return Boolean(rows[0]?.name);
};

const buildWhere = (filters: AuditFilters) => {
    const where: string[] = [];
    const params: any[] = [];

    const add = (sql: string, value: any) => {
        params.push(value);
        where.push(sql.replace('?', `$${params.length}`));
    };

    if (filters.category && filters.category !== 'all') add('category = ?', filters.category);
    if (filters.source && filters.source !== 'all') add('source = ?', filters.source);
    if (filters.severity && filters.severity !== 'all') add('severity = ?', filters.severity);
    if (filters.success === 'true' || filters.success === 'false') add('success = ?', filters.success === 'true');
    if (filters.ip) add('COALESCE(ip, \'\') ILIKE ?', `%${filters.ip}%`);
    if (filters.action) add('action ILIKE ?', `%${filters.action}%`);
    if (filters.actor) {
        params.push(`%${filters.actor}%`, `%${filters.actor}%`);
        where.push(`(COALESCE(actor, '') ILIKE $${params.length - 1} OR COALESCE(actor_id, '') ILIKE $${params.length})`);
    }
    if (filters.search) {
        params.push(`%${filters.search}%`);
        const p = `$${params.length}`;
        where.push(`(
            COALESCE(title, '') ILIKE ${p}
            OR COALESCE(action, '') ILIKE ${p}
            OR COALESCE(message, '') ILIKE ${p}
            OR COALESCE(target, '') ILIKE ${p}
            OR COALESCE(details::text, '') ILIKE ${p}
        )`);
    }
    if (filters.date_from) add('event_at >= ?::timestamptz', filters.date_from);
    if (filters.date_to) add('event_at <= ?::timestamptz', filters.date_to);
    if (!filters.date_from && !filters.date_to) {
        where.push(`event_at >= NOW() - INTERVAL '${parsePeriod(filters.period)}'`);
    }

    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
};

const severityFor = (success: boolean, action?: string, status?: string): AuditSeverity => {
    const value = `${action || ''} ${status || ''}`.toLowerCase();
    if (!success) return 'warning';
    if (/(delete|remove|revog|block|bloque|deny|falha|failed|critical|emergency|bypass|incident)/.test(value)) return 'warning';
    if (/(login_success|created|updated|resolved|success|allowed|liberad)/.test(value)) return 'success';
    return 'info';
};

const titleFor = (action?: string, message?: string | null) => {
    if (message) return message;
    return String(action || 'evento')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
};

const categoryFor = (source: string, action?: string): AuditCategory => {
    const normalizedSource = String(source || '').toLowerCase();
    const normalizedAction = String(action || '').toLowerCase();
    if (normalizedAction.includes('login') || normalizedAction.includes('auth') || normalizedAction.includes('token')) return 'seguranca';
    if (normalizedAction.includes('support') || normalizedAction.includes('ticket')) return 'chamados';
    if (normalizedAction.includes('hotspot') || normalizedAction.includes('collab') || normalizedAction.includes('user')) return 'usuarios';
    if (normalizedAction.includes('lgpd') || normalizedSource.includes('lgpd')) return 'lgpd';
    return SOURCE_CATEGORIES[normalizedSource] || 'sistema';
};

const normalizeIp = (value?: string | null) => {
    const ip = String(value || '').trim();
    if (!ip) return null;
    if (/^::ffff:\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.replace('::ffff:', '');
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return ip;
    if (/^[0-9a-f:]+$/i.test(ip) && ip.includes(':')) return ip;
    return null;
};

const buildUnionSql = async () => {
    const sources: string[] = [];

    if (await hasTable('central_audit_events')) {
        sources.push(`
            SELECT id::text AS id, event_at, category, source, action, title, actor, actor_id, ip::text AS ip,
                   target, success, severity, message, details
              FROM central_audit_events
        `);
    }

    if (await hasTable('auth_activity_logs')) {
        sources.push(`
            SELECT ('auth-' || id)::text AS id, created_at AS event_at, 'seguranca' AS category, 'autenticacao' AS source,
                   action, action AS title, COALESCE(username, 'sistema') AS actor, user_id::text AS actor_id,
                   ip_address AS ip, route AS target, success,
                   CASE WHEN success THEN 'success' ELSE 'warning' END AS severity,
                   status AS message, COALESCE(detail, '{}'::jsonb) AS details
              FROM auth_activity_logs
        `);
    }

    if (await hasTable('action_audit_logs')) {
        sources.push(`
            SELECT ('action-' || id)::text AS id, created_at AS event_at,
                   CASE
                     WHEN action ILIKE '%support%' OR action ILIKE '%ticket%' THEN 'chamados'
                     WHEN action ILIKE '%hotspot%' OR action ILIKE '%collab%' OR action ILIKE '%user%' THEN 'usuarios'
                     WHEN action ILIKE '%dns%' OR action ILIKE '%proxy%' OR action ILIKE '%policy%' OR action ILIKE '%ufw%' THEN 'rede'
                     WHEN action ILIKE '%login%' OR action ILIKE '%auth%' THEN 'seguranca'
                     ELSE 'sistema'
                   END AS category,
                   'sistema' AS source, action, action AS title, requested_by AS actor, actor_user_id::text AS actor_id,
                   COALESCE(actor_ip, ip::text) AS ip, COALESCE(domain, route) AS target, success,
                   CASE WHEN success THEN 'success' ELSE 'warning' END AS severity,
                   message, COALESCE(payload, '{}'::jsonb) || jsonb_build_object('result', COALESCE(result, '{}'::jsonb), 'vlan_id', vlan_id, 'method', method, 'status_code', status_code) AS details
              FROM action_audit_logs
        `);
    }

    if (await hasTable('lgpd_audit_logs')) {
        sources.push(`
            SELECT ('lgpd-' || id)::text AS id, created_at AS event_at, 'lgpd' AS category, 'lgpd' AS source,
                   action, action AS title, COALESCE(actor_username, 'sistema') AS actor, actor_user_id::text AS actor_id,
                   actor_ip AS ip, CONCAT(entity_type, COALESCE(' #' || entity_id::text, '')) AS target,
                   success, CASE WHEN success THEN 'success' ELSE 'warning' END AS severity,
                   message, COALESCE(payload, '{}'::jsonb) AS details
              FROM lgpd_audit_logs
        `);
    }

    if (await hasTable('hotspot_access_log')) {
        sources.push(`
            SELECT ('hotspot-' || id)::text AS id, logged_at AS event_at, 'usuarios' AS category, 'hotspot' AS source,
                   'access_session' AS action, 'Sessao hotspot' AS title, COALESCE(visitor_name, cpf_masked, 'visitante') AS actor,
                   COALESCE(visitor_id::text, session_id::text) AS actor_id, client_ip::text AS ip,
                   COALESCE(top_domain, mac_address) AS target, TRUE AS success, 'info' AS severity,
                   notes AS message,
                   jsonb_build_object('session_id', session_id, 'mac_address', mac_address, 'vlan_id', vlan_id, 'auth_method', auth_method, 'duration_seconds', duration_seconds, 'bytes_up', bytes_up, 'bytes_down', bytes_down) AS details
              FROM hotspot_access_log
        `);
    }

    if (await hasTable('collab_access_log')) {
        sources.push(`
            SELECT ('collab-' || id)::text AS id, logged_at AS event_at, 'usuarios' AS category, 'colaboradores' AS source,
                   'access_session' AS action, 'Sessao colaborador' AS title, COALESCE(full_name, username, 'colaborador') AS actor,
                   COALESCE(user_id::text, session_id::text) AS actor_id, client_ip::text AS ip,
                   COALESCE(top_domain, mac_address) AS target, TRUE AS success, 'info' AS severity,
                   notes AS message,
                   jsonb_build_object('session_id', session_id, 'username', username, 'department', department, 'position', position, 'mac_address', mac_address, 'vlan_id', vlan_id, 'auth_method', auth_method, 'duration_seconds', duration_seconds, 'bytes_up', bytes_up, 'bytes_down', bytes_down) AS details
              FROM collab_access_log
        `);
    }

    if (await hasTable('support_ticket_events')) {
        sources.push(`
            SELECT ('support-' || e.id)::text AS id, e.created_at AS event_at, 'chamados' AS category, 'chamados' AS source,
                   e.event_type AS action, e.event_type AS title, COALESCE(e.actor_name, e.actor_type, 'sistema') AS actor,
                   NULL::text AS actor_id, NULL::text AS ip,
                   COALESCE(t.protocol, e.ticket_id::text) AS target, TRUE AS success, 'success' AS severity,
                   e.actor_type AS message, COALESCE(e.payload, '{}'::jsonb) AS details
              FROM support_ticket_events e
              LEFT JOIN support_tickets t ON t.id = e.ticket_id
        `);
    }

    if (await hasTable('domain_policy_audit_logs')) {
        sources.push(`
            SELECT ('domain-policy-' || id)::text AS id, created_at AS event_at, 'rede' AS category, 'politicas' AS source,
                   action, action AS title, COALESCE(requested_by, 'sistema') AS actor, NULL::text AS actor_id,
                   NULL::text AS ip, policy_id::text AS target, success,
                   CASE WHEN success THEN 'success' ELSE 'warning' END AS severity,
                   message, COALESCE(payload, '{}'::jsonb) || jsonb_build_object('result', COALESCE(result, '{}'::jsonb)) AS details
              FROM domain_policy_audit_logs
        `);
    }

    if (await hasTable('proxy_action_logs')) {
        sources.push(`
            SELECT ('proxy-action-' || id)::text AS id, created_at AS event_at, 'rede' AS category, 'proxy' AS source,
                   action, action AS title, COALESCE(requested_by, 'sistema') AS actor, NULL::text AS actor_id,
                   NULL::text AS ip, NULL::text AS target, success,
                   CASE WHEN success THEN 'success' ELSE 'warning' END AS severity,
                   message, COALESCE(payload, '{}'::jsonb) || jsonb_build_object('result', COALESCE(result, '{}'::jsonb)) AS details
              FROM proxy_action_logs
        `);
    }

    if (await hasTable('dns_contingency_audit')) {
        sources.push(`
            SELECT ('dns-contingency-' || id)::text AS id, created_at AS event_at, 'rede' AS category, 'contingencia_dns' AS source,
                   action, action AS title, COALESCE(requested_by, 'sistema') AS actor, NULL::text AS actor_id,
                   NULL::text AS ip, COALESCE(scope_type, vlan_ids::text) AS target, success,
                   CASE WHEN success THEN 'success' ELSE 'critical' END AS severity,
                   reason AS message, jsonb_build_object('providers', providers, 'resolvers', resolvers, 'result', COALESCE(result, '{}'::jsonb)) AS details
              FROM dns_contingency_audit
        `);
    }

    if (await hasTable('control_antimalware_runs')) {
        sources.push(`
            SELECT ('antimalware-' || id)::text AS id, created_at AS event_at, 'seguranca' AS category, 'antimalware' AS source,
                   action, action AS title, 'sistema' AS actor, NULL::text AS actor_id, NULL::text AS ip,
                   status AS target, success,
                   CASE WHEN infected_files > 0 THEN 'critical' WHEN success THEN 'success' ELSE 'warning' END AS severity,
                   output AS message, jsonb_build_object('infected_files', infected_files, 'target_paths', target_paths, 'started_at', started_at, 'finished_at', finished_at) AS details
              FROM control_antimalware_runs
        `);
    }

    if (await hasTable('navigation_events')) {
        sources.push(`
            SELECT ('navigation-' || id)::text AS id, event_at, 'rede' AS category, 'navegacao' AS source,
                   action, action AS title, COALESCE(identity_username, identity_name, mac_address, client_ip::text) AS actor,
                   COALESCE(identity_id, session_id::text) AS actor_id, client_ip::text AS ip,
                   COALESCE(domain, url) AS target, NOT blocked AS success,
                   CASE WHEN blocked THEN 'warning' ELSE 'info' END AS severity,
                   policy_source AS message, COALESCE(evidence, '{}'::jsonb) || jsonb_build_object('vlan_id', vlan_id, 'source_type', source_type, 'method', method, 'status_code', status_code, 'matched_rule', matched_rule) AS details
              FROM navigation_events
        `);
    }

    if (!sources.length) {
        sources.push(`
            SELECT NULL::text AS id, NOW() AS event_at, 'sistema' AS category, 'central' AS source,
                   'empty' AS action, 'Sem fontes de auditoria' AS title, 'sistema' AS actor, NULL::text AS actor_id,
                   NULL::text AS ip, NULL::text AS target, TRUE AS success, 'info' AS severity, NULL::text AS message,
                   '{}'::jsonb AS details
             WHERE FALSE
        `);
    }

    return sources.join('\nUNION ALL\n');
};

export const centralAuditService = {
    async ensureSchema() {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS central_audit_events (
                id BIGSERIAL PRIMARY KEY,
                event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                category TEXT NOT NULL,
                source TEXT NOT NULL,
                action TEXT NOT NULL,
                title TEXT,
                actor TEXT,
                actor_id TEXT,
                ip INET,
                target TEXT,
                success BOOLEAN NOT NULL DEFAULT TRUE,
                severity TEXT NOT NULL DEFAULT 'info',
                message TEXT,
                details JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_central_audit_events_event_at ON central_audit_events(event_at DESC);
            CREATE INDEX IF NOT EXISTS idx_central_audit_events_category ON central_audit_events(category, event_at DESC);
            CREATE INDEX IF NOT EXISTS idx_central_audit_events_source ON central_audit_events(source, event_at DESC);
            CREATE INDEX IF NOT EXISTS idx_central_audit_events_actor ON central_audit_events(actor, event_at DESC);
        `);
    },

    async log(input: {
        category?: AuditCategory;
        source: string;
        action: string;
        title?: string;
        actor?: string | null;
        actorId?: string | number | null;
        ip?: string | null;
        target?: string | null;
        success?: boolean;
        severity?: AuditSeverity;
        message?: string | null;
        details?: any;
    }) {
        await this.ensureSchema();
        const success = input.success !== false;
        const category = input.category || categoryFor(input.source, input.action);
        await pool.query(
            `INSERT INTO central_audit_events
                (category, source, action, title, actor, actor_id, ip, target, success, severity, message, details)
             VALUES ($1,$2,$3,$4,$5,$6,$7::inet,$8,$9,$10,$11,$12::jsonb)`,
            [
                category,
                input.source,
                input.action,
                input.title || titleFor(input.action, input.message),
                input.actor || 'sistema',
                input.actorId ? String(input.actorId) : null,
                normalizeIp(input.ip),
                input.target || null,
                success,
                input.severity || severityFor(success, input.action),
                input.message || null,
                JSON.stringify(input.details || {}),
            ],
        );
    },

    async list(filters: AuditFilters) {
        await this.ensureSchema();
        const unionSql = await buildUnionSql();
        const { whereSql, params } = buildWhere(filters);
        const limit = clampLimit(filters.limit);
        const query = `
            WITH unified AS (${unionSql})
            SELECT id, event_at, category, source, action, title, actor, actor_id, ip, target, success, severity, message, details
              FROM unified
              ${whereSql}
             ORDER BY event_at DESC
             LIMIT ${limit}
        `;
        const { rows } = await pool.query(query, params);
        return rows;
    },

    async summary(filters: AuditFilters) {
        await this.ensureSchema();
        const unionSql = await buildUnionSql();
        const { whereSql, params } = buildWhere({ ...filters, limit: undefined });
        const query = `
            WITH unified AS (${unionSql}),
            filtered AS (
                SELECT *
                  FROM unified
                  ${whereSql}
            )
            SELECT
                (SELECT COUNT(*)::int FROM filtered) AS total,
                (SELECT COUNT(*)::int FROM filtered WHERE success) AS success,
                (SELECT COUNT(*)::int FROM filtered WHERE NOT success) AS failures,
                (SELECT COUNT(*)::int FROM filtered WHERE severity IN ('critical', 'warning')) AS attention,
                (
                    SELECT COALESCE(jsonb_object_agg(category, total ORDER BY category), '{}'::jsonb)
                      FROM (SELECT category, COUNT(*)::int AS total FROM filtered GROUP BY category) category_stats
                ) AS by_category,
                (
                    SELECT COALESCE(jsonb_object_agg(source, total ORDER BY source), '{}'::jsonb)
                      FROM (SELECT source, COUNT(*)::int AS total FROM filtered GROUP BY source) source_stats
                ) AS by_source
        `;
        const { rows } = await pool.query(query, params);
        const raw = rows[0] || {};
        return {
            total: raw.total || 0,
            success: raw.success || 0,
            failures: raw.failures || 0,
            attention: raw.attention || 0,
            by_category: raw.by_category || {},
            by_source: raw.by_source || {},
            category_labels: CATEGORY_LABELS,
        };
    },

    async sources(filters: AuditFilters = {}) {
        await this.ensureSchema();
        const unionSql = await buildUnionSql();
        const { whereSql, params } = buildWhere(filters);
        const { rows } = await pool.query(
            `
                WITH unified AS (${unionSql})
                SELECT source, category, COUNT(*)::int AS total, MAX(event_at) AS latest_event_at
                  FROM unified
                  ${whereSql}
                 GROUP BY source, category
                 ORDER BY category, source
            `,
            params,
        );
        return rows;
    },

    async categories() {
        return Object.entries(CATEGORY_LABELS).map(([key, label]) => ({ key, label }));
    },
};
