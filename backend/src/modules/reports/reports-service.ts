import PDFDocument from 'pdfkit';
import { pool } from '../../config/db';
import { identityEnrichment } from '../identity/identity-enrichment';

const INSTITUTION = 'Prefeitura Municipal de Jacarezinho — PR';
const ENTITY = 'Secretaria de Comércio, Indústria, Serviços e Inovação';
const SYSTEM = 'SGCG — Sistema de Governança e Controle Governamental';

const LOGO_PATH = '/opt/controlebeckercorp-v8/frontend/public/jmb-logo-clean.png';

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
        const limit = Math.min(Number(filters.limit) || 200, 1000);
        const page = Math.max(Number(filters.page) || 1, 1);
        const offset = (page - 1) * limit;
        const params: unknown[] = [];

        // Exclui loopback e domínios internos .local
        const where: string[] = [
            "d.client_ip NOT IN ('127.0.0.1'::inet, '::1'::inet)",
            "d.query_name NOT LIKE '%.local'",
            "d.query_name NOT LIKE '%.arpa'",
        ];

        where.push(buildTimeFilter('d.occurred_at', params, filters));

        if (filters.ip?.trim()) {
            where.push(`d.client_ip = ${p(params, filters.ip.trim())}::inet`);
        }
        if (filters.vlan) {
            const vnum = parseInt(String(filters.vlan).replace(/\D/g, ''), 10);
            where.push(`d.vlan_id = ${p(params, vnum)}`);
        }
        if (filters.domain?.trim()) {
            where.push(`d.query_name ILIKE ${p(params, `%${filters.domain.trim()}%`)}`);
        }
        if (filters.action === 'block') where.push(`d.action = 'blocked'`);
        else if (filters.action === 'allow') where.push(`d.action <> 'blocked'`);

        const wc = where.join(' AND ');
        const baseParams = params.slice();

        const [rowsRes, statsRes] = await Promise.all([
            pool.query(
                `SELECT
                    d.id,
                    d.occurred_at,
                    d.vlan_id,
                    host(d.client_ip) AS client_ip,
                    d.query_name      AS domain,
                    d.query_type,
                    d.response_code,
                    d.action,
                    d.action = 'blocked' AS blocked,
                    d.category,
                    d.matched_rule,
                    d.policy_source
                FROM dns_policy_events d
                WHERE ${wc}
                ORDER BY d.occurred_at DESC
                LIMIT ${p(params, limit)} OFFSET ${p(params, offset)}`,
                params,
            ),
            pool.query(
                `SELECT
                    COUNT(*)::bigint AS total,
                    COUNT(*) FILTER (WHERE d.action = 'blocked')::bigint   AS blocked,
                    COUNT(*) FILTER (WHERE d.action <> 'blocked')::bigint  AS allowed,
                    COUNT(DISTINCT d.client_ip)::int   AS unique_ips,
                    COUNT(DISTINCT d.query_name)::int  AS unique_domains
                FROM dns_policy_events d
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
            summary: statsRes.rows[0] ?? { total: 0, blocked: 0, allowed: 0, unique_ips: 0, unique_domains: 0 },
        };
    },

    async getNavigationByIp(filters: NavFilters) {
        const params: unknown[] = [];
        const where: string[] = [
            "client_ip NOT IN ('127.0.0.1'::inet, '::1'::inet)",
            "query_name NOT LIKE '%.local'",
            "query_name NOT LIKE '%.arpa'",
        ];

        where.push(buildTimeFilter('occurred_at', params, filters));

        if (filters.vlan) {
            const vnum = parseInt(String(filters.vlan).replace(/\D/g, ''), 10);
            where.push(`vlan_id = ${p(params, vnum)}`);
        }
        if (filters.domain?.trim()) {
            where.push(`query_name ILIKE ${p(params, `%${filters.domain.trim()}%`)}`);
        }
        if (filters.action === 'block') where.push(`action = 'blocked'`);
        else if (filters.action === 'allow') where.push(`action <> 'blocked'`);

        const wc = where.join(' AND ');

        const { rows } = await pool.query(
            `SELECT
                host(client_ip) AS client_ip,
                vlan_id,
                COUNT(*)::bigint AS total,
                COUNT(*) FILTER (WHERE action = 'blocked')::bigint  AS blocked,
                COUNT(*) FILTER (WHERE action <> 'blocked')::bigint AS allowed,
                COUNT(DISTINCT query_name)::bigint AS unique_domains,
                MAX(occurred_at) AS last_seen,
                MIN(occurred_at) AS first_seen
            FROM dns_policy_events
            WHERE ${wc}
            GROUP BY client_ip, vlan_id
            ORDER BY total DESC
            LIMIT 300`,
            params,
        );
        return identityEnrichment.enrichRows(rows);
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
