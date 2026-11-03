import { execFile } from 'child_process';
import fs from 'fs';
import { pool } from '../../config/db';
import { execCmd } from '../../utils/sys';
import { monitorService } from '../monitor/monitor-service';
import { getLinkStatus } from '../connectivity/downtime-monitor';
import { ragService } from '../control/rag-service';
import { searchKnowledge } from './ai-knowledge';
import { querySource } from './ai-sources';

/*
 * Ferramentas de consulta do assistente. TODAS são somente leitura, com parâmetros validados e consultas fixas
 * (o modelo nunca escreve SQL nem comando). Cada ferramenta devolve no máximo 40 linhas e o total encontrado.
 */

export type ToolResult = { total: number; rows: any[]; note?: string };
export type ToolDef = {
    name: string;
    descricao: string;
    parametros: string;
    run: (args: Record<string, any>) => Promise<ToolResult>;
};

const TZ = "AT TIME ZONE 'America/Sao_Paulo'";
const STAMP = "'DD/MM/YYYY HH24:MI:SS'";

const clamp = (value: any, def: number, min: number, max: number) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, Math.round(n)));
};

const like = (value: any) => `%${String(value).trim().replace(/[\\%_]/g, '\\$&')}%`;

const text = (value: any, max = 120) => {
    const s = String(value ?? '').trim();
    return s.length > max ? s.slice(0, max) : s;
};

const parseDate = (value: any): Date | null => {
    if (!value) return null;
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d;
};

// Intervalo [desde, ate): datas explícitas ou "dias" (padrão 30, máximo 400).
const range = (args: Record<string, any>) => {
    const to = parseDate(args.ate) ? new Date(parseDate(args.ate)!.getTime() + 24 * 3600 * 1000) : new Date(Date.now() + 60 * 1000);
    const from = parseDate(args.desde) || new Date(to.getTime() - clamp(args.dias, 30, 1, 400) * 24 * 3600 * 1000);
    return { from, to };
};

const rowsLimit = (args: Record<string, any>) => clamp(args.limite, 20, 1, 40);

class Where {
    clauses: string[] = [];
    params: any[] = [];
    add(clause: string, ...values: any[]) {
        let c = clause;
        values.forEach((value) => {
            this.params.push(value);
            c = c.replace('?', `$${this.params.length}`);
        });
        this.clauses.push(c);
    }
    get sql() {
        return this.clauses.length ? `WHERE ${this.clauses.join(' AND ')}` : '';
    }
}

const ipFilter = (where: Where, column: string, ip: any, inet = false) => {
    const v = String(ip || '').trim();
    if (!v) return;
    if (!/^[0-9a-f.:]+\*?$/i.test(v)) return;
    const col = inet ? `host(${column})` : column;
    if (v.endsWith('*')) where.add(`${col} LIKE ?`, `${v.slice(0, -1)}%`);
    else where.add(`${col} = ?`, v);
};

// Vários módulos gravam a ação com o nome do módulo ("collaborators", "hotspot") como autor. O pedido HTTP da mesma
// operação (core:...) leva o usuário logado: liga os dois pelo mesmo IP e por até 3 segundos de diferença.
const QUEM = `COALESCE(
    u.username,
    CASE WHEN a.requested_by IN ('collaborators', 'hotspot') THEN (
        SELECT COALESCE(u2.username, b.requested_by) FROM action_audit_logs b
          LEFT JOIN auth_users u2 ON u2.id = b.actor_user_id
         WHERE b.action LIKE 'core:%' AND b.actor_ip = a.actor_ip AND b.requested_by NOT IN ('collaborators', 'hotspot')
           AND b.created_at BETWEEN a.created_at - INTERVAL '3 seconds' AND a.created_at + INTERVAL '3 seconds'
         ORDER BY ABS(EXTRACT(EPOCH FROM (b.created_at - a.created_at))) LIMIT 1
    ) END,
    a.requested_by)`;

// ─── auditoria geral ───────────────────────────────────────────────────────────────────────────
const AUDIT_SELECT = `
    SELECT a.id,
           to_char(a.created_at ${TZ}, ${STAMP}) AS quando,
           ${QUEM} AS quem,
           a.actor_ip AS ip,
           a.action AS acao,
           a.success AS sucesso,
           left(a.payload::text, 320) AS dados,
           left(a.result::text, 160) AS resultado,
           left(COALESCE(a.message, ''), 120) AS mensagem,
           left(COALESCE(a.actor_user_agent, ''), 90) AS navegador
      FROM action_audit_logs a
      LEFT JOIN auth_users u ON u.id = a.actor_user_id`;

const runAudit = async (where: Where, limit: number): Promise<ToolResult> => {
    const total = await pool.query(`SELECT count(*)::int AS n FROM action_audit_logs a LEFT JOIN auth_users u ON u.id = a.actor_user_id ${where.sql}`, where.params);
    const { rows } = await pool.query(`${AUDIT_SELECT} ${where.sql} ORDER BY a.id DESC LIMIT ${limit}`, where.params);
    return { total: total.rows[0].n, rows, note: total.rows[0].n > rows.length ? `Mostrando as ${rows.length} mais recentes de ${total.rows[0].n}.` : undefined };
};

const buscarAuditoria: ToolDef = {
    name: 'buscar_auditoria',
    descricao: 'Busca na trilha de auditoria geral do sistema (quem fez o quê, quando, de qual IP). Serve para quase qualquer pergunta sobre ações de usuários.',
    parametros: '{acao?: parte do nome da ação, quem?: usuário, ip?: IP exato ou prefixo com *, texto?: palavra nos dados, sucesso?: true|false, dias?: 1-400, desde?: AAAA-MM-DD, ate?: AAAA-MM-DD, limite?: 1-40}',
    async run(args) {
        const { from, to } = range(args);
        const w = new Where();
        w.add('a.created_at >= ?', from);
        w.add('a.created_at < ?', to);
        if (args.acao) w.add('a.action ILIKE ?', like(args.acao));
        else w.add("a.action <> 'core:post:/checkin'");
        if (args.quem) w.add('(a.requested_by ILIKE ? OR u.username ILIKE ?)', like(args.quem), like(args.quem));
        ipFilter(w, 'a.actor_ip', args.ip);
        if (args.texto) w.add('(a.payload::text ILIKE ? OR a.result::text ILIKE ? OR a.message ILIKE ?)', like(args.texto), like(args.texto), like(args.texto));
        if (typeof args.sucesso === 'boolean') w.add('a.success = ?', args.sucesso);
        return runAudit(w, rowsLimit(args));
    },
};

const acoesDeServicos: ToolDef = {
    name: 'acoes_de_servicos',
    descricao: 'Quem ligou, desligou ou reiniciou serviços do servidor (e quem reiniciou/desligou o próprio servidor), com data, hora e IP.',
    parametros: '{servico?: nome do serviço (ex.: unbound, squid, clamav), acao?: start|stop|restart|reload, quem?: usuário, dias?: 1-400, limite?: 1-40}',
    async run(args) {
        const { from, to } = range(args);
        const w = new Where();
        w.add('a.created_at >= ?', from);
        w.add('a.created_at < ?', to);
        w.add("a.action IN ('core:post:/service-action', 'core:post:/server-power')");
        if (args.servico) w.add("a.payload->>'service' ILIKE ?", like(args.servico));
        if (args.acao) w.add("a.payload->>'action' ILIKE ?", text(args.acao, 20));
        if (args.quem) w.add('(a.requested_by ILIKE ? OR u.username ILIKE ?)', like(args.quem), like(args.quem));
        const total = await pool.query(`SELECT count(*)::int AS n FROM action_audit_logs a LEFT JOIN auth_users u ON u.id = a.actor_user_id ${w.sql}`, w.params);
        const { rows } = await pool.query(
            `SELECT to_char(a.created_at ${TZ}, ${STAMP}) AS quando,
                    COALESCE(u.username, a.requested_by) AS quem,
                    a.actor_ip AS ip,
                    CASE WHEN a.action = 'core:post:/server-power' THEN 'servidor' ELSE a.payload->>'service' END AS servico,
                    a.payload->>'action' AS acao_executada,
                    a.success AS sucesso,
                    left(COALESCE(a.actor_user_agent, ''), 70) AS navegador
               FROM action_audit_logs a LEFT JOIN auth_users u ON u.id = a.actor_user_id
               ${w.sql} ORDER BY a.id DESC LIMIT ${rowsLimit(args)}`,
            w.params,
        );
        return { total: total.rows[0].n, rows };
    },
};

const atividadeDeLogin: ToolDef = {
    name: 'atividade_de_login',
    descricao: 'Entradas, saídas e renovações de sessão dos usuários do console (administradores), com IP e navegador.',
    parametros: '{usuario?: nome, ip?: IP exato, sucesso?: true|false, acao?: parte (ex.: login, refresh), dias?: 1-400, limite?: 1-40}',
    async run(args) {
        const { from, to } = range(args);
        const w = new Where();
        w.add('created_at >= ?', from);
        w.add('created_at < ?', to);
        if (args.usuario) w.add('username ILIKE ?', like(args.usuario));
        ipFilter(w, 'ip_address', args.ip);
        if (args.acao) w.add('action ILIKE ?', like(args.acao));
        if (typeof args.sucesso === 'boolean') w.add('success = ?', args.sucesso);
        const total = await pool.query(`SELECT count(*)::int AS n FROM auth_activity_logs ${w.sql}`, w.params);
        const { rows } = await pool.query(
            `SELECT to_char(created_at ${TZ}, ${STAMP}) AS quando, username AS quem, ip_address AS ip, action AS acao,
                    success AS sucesso, left(COALESCE(detail, ''), 120) AS detalhe, left(COALESCE(user_agent, ''), 80) AS navegador
               FROM auth_activity_logs ${w.sql} ORDER BY id DESC LIMIT ${rowsLimit(args)}`,
            w.params,
        );
        return { total: total.rows[0].n, rows };
    },
};

const CADASTRO_LABEL: Record<string, string> = {
    collab_register_success: 'Colaborador se cadastrou sozinho pelo portal',
    collab_user_created: 'Administrador cadastrou colaborador',
    collab_user_updated: 'Administrador alterou colaborador',
    collab_user_deactivated: 'Administrador inativou colaborador',
    collab_user_deleted: 'Administrador inativou colaborador (registro antigo)',
    collab_user_permanently_deleted: 'Administrador apagou colaborador de vez',
    hotspot_register_success: 'Visitante se cadastrou sozinho pelo portal do Hotspot',
    hotspot_visitor_deleted: 'Administrador apagou visitante do Hotspot',
};

const cadastros: ToolDef = {
    name: 'cadastros',
    descricao: 'Quem cadastrou, alterou, inativou ou apagou colaboradores e visitantes (inclui auto-cadastros pelo portal), com data, hora, IP e navegador de quem fez.',
    parametros: '{tipo?: colaborador|visitante|todos, nome?: parte do usuário ou nome cadastrado, dias?: 1-400, limite?: 1-40}',
    async run(args) {
        const { from, to } = range(args);
        const tipo = String(args.tipo || 'todos').toLowerCase();
        const actions = Object.keys(CADASTRO_LABEL).filter((a) => tipo === 'todos' || (tipo.startsWith('colab') ? a.startsWith('collab') : tipo.startsWith('visit') ? a.startsWith('hotspot') : true));
        const w = new Where();
        w.add('a.created_at >= ?', from);
        w.add('a.created_at < ?', to);
        w.add('(a.action = ANY(?::text[]) OR a.action LIKE ?)', actions, tipo === 'visitante' ? 'core:delete:/visitors/%' : 'core:delete:/users/%');
        if (args.nome) w.add('(a.payload::text ILIKE ? OR a.result::text ILIKE ?)', like(args.nome), like(args.nome));
        const total = await pool.query(`SELECT count(*)::int AS n FROM action_audit_logs a LEFT JOIN auth_users u ON u.id = a.actor_user_id ${w.sql}`, w.params);
        const { rows } = await pool.query(
            `SELECT to_char(a.created_at ${TZ}, ${STAMP}) AS quando, a.action AS acao,
                    ${QUEM} AS quem_fez, a.actor_ip AS ip,
                    left(a.payload::text, 260) AS dados, left(a.result::text, 140) AS resultado,
                    left(COALESCE(a.actor_user_agent, ''), 80) AS navegador
               FROM action_audit_logs a LEFT JOIN auth_users u ON u.id = a.actor_user_id
               ${w.sql} ORDER BY a.id DESC LIMIT ${rowsLimit(args)}`,
            w.params,
        );
        return {
            total: total.rows[0].n,
            rows: rows.map((r: any) => ({ ...r, o_que_foi: CADASTRO_LABEL[r.acao] || (String(r.acao).startsWith('core:delete:/users/') ? 'Administrador inativou colaborador (registro antigo)' : r.acao) })),
            note: 'Auto-cadastro: quem_fez é o próprio cadastrado; o IP mostra de onde ele entrou.',
        };
    },
};

const lgpd: ToolDef = {
    name: 'lgpd',
    descricao: 'LGPD: trilha de auditoria do módulo, solicitações de titulares, incidentes e atividades de tratamento registradas.',
    parametros: '{parte?: auditoria|solicitacoes|incidentes|atividades|resumo, ator?: usuário, acao?: parte do nome, dias?: 1-400, limite?: 1-40}',
    async run(args) {
        const parte = String(args.parte || 'resumo').toLowerCase();
        const limit = rowsLimit(args);
        const counts = async (table: string) => (await pool.query(`SELECT count(*)::int AS n FROM ${table}`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
        if (parte === 'resumo') {
            return {
                total: 1,
                rows: [{
                    solicitacoes_de_titulares: await counts('lgpd_data_subject_requests'),
                    incidentes: await counts('lgpd_incidents'),
                    atividades_de_tratamento: await counts('lgpd_processing_activities'),
                    eventos_de_auditoria_lgpd: await counts('lgpd_audit_logs'),
                }],
            };
        }
        if (parte.startsWith('solic')) {
            const { rows } = await pool.query(
                `SELECT id, request_type AS tipo, status, to_char(due_date, 'DD/MM/YYYY') AS prazo, created_by AS criado_por,
                        to_char(created_at ${TZ}, ${STAMP}) AS quando
                   FROM lgpd_data_subject_requests ORDER BY id DESC LIMIT ${limit}`,
            );
            return { total: await counts('lgpd_data_subject_requests'), rows };
        }
        if (parte.startsWith('inc')) {
            const { rows } = await pool.query(
                `SELECT id, title AS titulo, severity AS gravidade, status, authority_notified AS autoridade_avisada,
                        to_char(occurred_at ${TZ}, ${STAMP}) AS ocorreu_em, created_by AS criado_por
                   FROM lgpd_incidents ORDER BY id DESC LIMIT ${limit}`,
            );
            return { total: await counts('lgpd_incidents'), rows };
        }
        if (parte.startsWith('ativ')) {
            const { rows } = await pool.query(
                `SELECT id, process_name AS tratamento, purpose AS finalidade, legal_basis AS base_legal, risk_level AS risco, status
                   FROM lgpd_processing_activities ORDER BY id DESC LIMIT ${limit}`,
            );
            return { total: await counts('lgpd_processing_activities'), rows };
        }
        const { from, to } = range(args);
        const w = new Where();
        w.add('created_at >= ?', from);
        w.add('created_at < ?', to);
        if (args.ator) w.add('actor_username ILIKE ?', like(args.ator));
        if (args.acao) w.add('action ILIKE ?', like(args.acao));
        const total = await pool.query(`SELECT count(*)::int AS n FROM lgpd_audit_logs ${w.sql}`, w.params);
        const { rows } = await pool.query(
            `SELECT to_char(created_at ${TZ}, ${STAMP}) AS quando, actor_username AS quem, actor_ip AS ip, action AS acao,
                    entity_type AS entidade, entity_id AS id_entidade, success AS sucesso, left(COALESCE(message, ''), 120) AS mensagem,
                    left(payload::text, 200) AS dados
               FROM lgpd_audit_logs ${w.sql} ORDER BY id DESC LIMIT ${limit}`,
            w.params,
        );
        return { total: total.rows[0].n, rows };
    },
};

const mudancasDePolitica: ToolDef = {
    name: 'mudancas_de_politica',
    descricao: 'Mudanças de políticas de acesso (bloqueios e liberações), exceções por IP (VIPs, quem pediu e quem aprovou) e contingências de DNS.',
    parametros: '{fonte?: politicas|excecoes|contingencia, quem?: usuário, dias?: 1-400, limite?: 1-40}',
    async run(args) {
        const fonte = String(args.fonte || 'politicas').toLowerCase();
        const { from, to } = range(args);
        const limit = rowsLimit(args);
        const w = new Where();
        if (fonte.startsWith('exce')) {
            w.add('updated_at >= ?', from);
            w.add('updated_at < ?', to);
            if (args.quem) w.add('(requested_by ILIKE ? OR approved_by ILIKE ? OR revoked_by ILIKE ?)', like(args.quem), like(args.quem), like(args.quem));
            const total = await pool.query(`SELECT count(*)::int AS n FROM policy_exceptions ${w.sql}`, w.params);
            const { rows } = await pool.query(
                `SELECT id, host(ip) AS ip, hostname, left(COALESCE(description, ''), 80) AS descricao, exception_type AS tipo,
                        active AS ativa, lifecycle_status AS situacao, requested_by AS pedido_por, approved_by AS aprovado_por,
                        revoked_by AS revogado_por, to_char(updated_at ${TZ}, ${STAMP}) AS atualizado_em
                   FROM policy_exceptions ${w.sql} ORDER BY updated_at DESC LIMIT ${limit}`,
                w.params,
            );
            return { total: total.rows[0].n, rows };
        }
        if (fonte.startsWith('cont')) {
            w.add('created_at >= ?', from);
            w.add('created_at < ?', to);
            if (args.quem) w.add('requested_by ILIKE ?', like(args.quem));
            const total = await pool.query(`SELECT count(*)::int AS n FROM dns_contingency_audit ${w.sql}`, w.params);
            const { rows } = await pool.query(
                `SELECT to_char(created_at ${TZ}, ${STAMP}) AS quando, requested_by AS quem, action AS acao, scope_type AS escopo,
                        left(COALESCE(reason, ''), 120) AS motivo, success AS sucesso
                   FROM dns_contingency_audit ${w.sql} ORDER BY id DESC LIMIT ${limit}`,
                w.params,
            );
            return { total: total.rows[0].n, rows };
        }
        w.add('created_at >= ?', from);
        w.add('created_at < ?', to);
        if (args.quem) w.add('requested_by ILIKE ?', like(args.quem));
        const total = await pool.query(`SELECT count(*)::int AS n FROM domain_policy_audit_logs ${w.sql}`, w.params);
        const { rows } = await pool.query(
            `SELECT to_char(created_at ${TZ}, ${STAMP}) AS quando, requested_by AS quem, action AS acao, policy_id,
                    success AS sucesso, left(COALESCE(message, ''), 120) AS mensagem, left(payload::text, 220) AS dados
               FROM domain_policy_audit_logs ${w.sql} ORDER BY id DESC LIMIT ${limit}`,
            w.params,
        );
        return { total: total.rows[0].n, rows };
    },
};

const consultarIp: ToolDef = {
    name: 'consultar_ip',
    descricao: 'Tudo que o sistema sabe sobre um IP: sessões de colaboradores e de visitantes, exceção/VIP, logins do console e ações na auditoria.',
    parametros: '{ip: endereço IPv4 exato}',
    async run(args) {
        const ip = String(args.ip || '').trim();
        if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) throw new Error('Informe um IPv4 válido em "ip".');
        const out: any[] = [];
        const safe = async (label: string, sql: string, params: any[]) => {
            try {
                const { rows } = await pool.query(sql, params);
                for (const row of rows) out.push({ origem: label, ...row });
            } catch (error: any) {
                out.push({ origem: label, erro: String(error?.message || error).slice(0, 100) });
            }
        };
        await safe('sessão de colaborador',
            `SELECT to_char(s.started_at ${TZ}, ${STAMP}) AS quando, u.username AS quem, u.department AS departamento, s.status, s.auth_method AS entrada, s.mac_address AS mac
               FROM collab_sessions s LEFT JOIN collab_users u ON u.id = s.user_id WHERE host(s.client_ip) = $1 ORDER BY s.id DESC LIMIT 5`, [ip]);
        await safe('sessão de visitante',
            `SELECT to_char(s.started_at ${TZ}, ${STAMP}) AS quando, v.full_name AS quem, s.status, s.auth_method AS entrada, s.mac_address AS mac
               FROM hotspot_sessions s LEFT JOIN hotspot_visitors v ON v.id = s.visitor_id WHERE host(s.client_ip) = $1 ORDER BY s.id DESC LIMIT 5`, [ip]);
        await safe('exceção/VIP',
            `SELECT hostname, left(COALESCE(description, ''), 80) AS descricao, active AS ativa, requested_by AS pedido_por, approved_by AS aprovado_por
               FROM policy_exceptions WHERE host(ip) = $1 ORDER BY id DESC LIMIT 3`, [ip]);
        await safe('login no console',
            `SELECT to_char(created_at ${TZ}, ${STAMP}) AS quando, username AS quem, action AS acao, success AS sucesso
               FROM auth_activity_logs WHERE ip_address = $1 ORDER BY id DESC LIMIT 5`, [ip]);
        await safe('ações na auditoria',
            `SELECT to_char(created_at ${TZ}, ${STAMP}) AS quando, requested_by AS quem, action AS acao, success AS sucesso
               FROM action_audit_logs WHERE actor_ip = $1 AND action <> 'core:post:/checkin' ORDER BY id DESC LIMIT 5`, [ip]);
        return { total: out.length, rows: out.slice(0, 40), note: out.length ? undefined : 'Nenhum registro encontrado para esse IP.' };
    },
};

const buscarUsuario: ToolDef = {
    name: 'buscar_usuario',
    descricao: 'Procura uma pessoa pelo nome ou usuário entre administradores do console, colaboradores e visitantes do Hotspot.',
    parametros: '{nome: parte do nome ou usuário}',
    async run(args) {
        const nome = String(args.nome || '').trim();
        if (nome.length < 2) throw new Error('Informe pelo menos 2 letras em "nome".');
        const out: any[] = [];
        const a = await pool.query(
            `SELECT username AS usuario, display_name AS nome, role AS perfil, is_active AS ativo, to_char(created_at ${TZ}, ${STAMP}) AS criado_em
               FROM auth_users WHERE username ILIKE $1 OR display_name ILIKE $1 ORDER BY id LIMIT 10`, [like(nome)]);
        a.rows.forEach((r: any) => out.push({ onde: 'administrador do console', ...r }));
        const c = await pool.query(
            `SELECT username AS usuario, full_name AS nome, department AS departamento, active AS ativo, to_char(created_at ${TZ}, ${STAMP}) AS criado_em
               FROM collab_users WHERE username ILIKE $1 OR full_name ILIKE $1 ORDER BY id LIMIT 10`, [like(nome)]);
        c.rows.forEach((r: any) => out.push({ onde: 'colaborador', ...r }));
        const v = await pool.query(
            `SELECT full_name AS nome, active AS ativo, to_char(created_at ${TZ}, ${STAMP}) AS criado_em
               FROM hotspot_visitors WHERE full_name ILIKE $1 ORDER BY id DESC LIMIT 10`, [like(nome)]);
        v.rows.forEach((r: any) => out.push({ onde: 'visitante do Hotspot', ...r }));
        return { total: out.length, rows: out, note: out.length ? undefined : 'Ninguém encontrado com esse nome (contas apagadas não aparecem; veja a ferramenta cadastros).' };
    },
};

// ─── servidor (leitura ao vivo) ────────────────────────────────────────────────────────────────
const readMeminfo = () => {
    const raw = fs.readFileSync('/proc/meminfo', 'utf-8');
    const kb = (name: string) => Number(raw.match(new RegExp(`${name}:\\s+(\\d+)`))?.[1] || 0);
    const gb = (v: number) => Math.round((v / 1024 / 1024) * 10) / 10;
    const total = kb('MemTotal');
    const available = kb('MemAvailable');
    const swapTotal = kb('SwapTotal');
    const swapFree = kb('SwapFree');
    return {
        memoria_total_gb: gb(total),
        memoria_em_uso_gb: gb(total - available),
        memoria_disponivel_gb: gb(available),
        cache_de_arquivos_gb: gb(kb('Cached') + kb('Buffers')),
        swap_total_gb: gb(swapTotal),
        swap_em_uso_gb: gb(swapTotal - swapFree),
        swap_em_uso_percent: swapTotal ? Math.round(((swapTotal - swapFree) / swapTotal) * 100) : 0,
    };
};

// Memória REAL por programa: PSS divide a memória compartilhada entre quem a usa (o RSS conta a mesma página várias
// vezes e faz o PostgreSQL parecer 10 vezes maior do que é).
const topProcesses = () => {
    const byName = new Map<string, { mb: number; n: number }>();
    for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
        try {
            let kb = 0;
            try {
                kb = Number(fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf-8').match(/Pss:\s+(\d+)/)?.[1] || 0);
            } catch {
                kb = Number(fs.readFileSync(`/proc/${pid}/status`, 'utf-8').match(/VmRSS:\s+(\d+)/)?.[1] || 0);
            }
            if (!kb) continue;
            const name = String(fs.readFileSync(`/proc/${pid}/comm`, 'utf-8')).trim() || pid;
            const cur = byName.get(name) || { mb: 0, n: 0 };
            cur.mb += kb / 1024;
            cur.n += 1;
            byName.set(name, cur);
        } catch { /* processo terminou */ }
    }
    return Array.from(byName.entries())
        .map(([programa, v]) => ({ programa, memoria_real_mb: Math.round(v.mb), processos: v.n }))
        .sort((a, b) => b.memoria_real_mb - a.memoria_real_mb)
        .slice(0, 12);
};

const SERVICES = ['unbound', 'sgcg-vip-dns', 'squid', 'postgresql@18-main', 'nginx', 'ufw', 'fail2ban', 'isc-dhcp-server', 'wg-quick@wg0', 'clamav-daemon.socket', 'clamav-freshclam', 'docker', 'netdata', 'tailscaled', 'postfix', 'dovecot'];

const estadoDoServidor: ToolDef = {
    name: 'estado_do_servidor',
    descricao: 'Situação AGORA do servidor: memória e swap, disco, carga, tempo ligado, programas que mais usam memória, serviços principais e estado do link com o provedor.',
    parametros: '{}',
    async run() {
        const mem = readMeminfo();
        const live: any = monitorService.getLive();
        const services = await Promise.all(SERVICES.map(async (name) => {
            const state = (await execCmd(`systemctl is-active ${name} || echo "inactive"`).catch(() => 'erro')).trim().split('\n')[0];
            return { servico: name, estado: state };
        }));
        const link = getLinkStatus();
        const disk = live?.disk || {};
        return {
            total: 1,
            rows: [{
                ...mem,
                disco_percent: disk.percent,
                carga_media_1_5_15: fs.readFileSync('/proc/loadavg', 'utf-8').split(' ').slice(0, 3).join(' '),
                ligado_ha_dias: Math.round((Number(live?.uptime || 0) / 86400) * 10) / 10,
                cpu_percent: live?.cpu,
                programas_que_mais_usam_memoria: topProcesses(),
                servicos: services,
                link_provedor: { estado: link.state, gateway_ms: link.gateway?.rtt_ms, internet_ms: link.world?.rtt_ms },
            }],
        };
    },
};

// ─── histórico de vida de um serviço (journal do systemd) ─────────────────────────────────────────
const journal = (args: string[]) => new Promise<string>((resolve) => {
    // Sem shell: os argumentos são fixos ou validados, então nada vindo do modelo vira comando.
    execFile('journalctl', [...args, '--no-pager', '-o', 'short-iso'], { timeout: 15000, maxBuffer: 24 * 1024 * 1024 }, (err, stdout) => resolve(err ? '' : String(stdout)));
});

const LIFECYCLE = /(Started |Starting |Stopped |Stopping |Reloading|Reloaded|Failed|failed with|Main process exited|Deactivated successfully|Killed|SIGKILL|SIGTERM|oom-kill|Out of memory|start of service|service stopped|Restart of|Scheduled restart|entered failed state)/i;

const classify = (message: string) => {
    if (/Reloading/i.test(message)) return 'recarregando (configuração)';
    if (/Reloaded/i.test(message)) return 'recarregado';
    if (/service stopped|Stopped |Stopping /i.test(message)) return 'parou';
    if (/start of service|Started |Starting /i.test(message)) return 'iniciou';
    if (/Failed|failed with|entered failed|Main process exited/i.test(message)) return 'falhou';
    if (/oom-kill|Out of memory|Killed|SIGKILL/i.test(message)) return 'encerrado à força';
    return 'evento';
};

const localStamp = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : iso;
};

const historicoDeServico: ToolDef = {
    name: 'historico_de_servico',
    descricao: 'Histórico de vida de um serviço do servidor no journal do sistema: quando iniciou, parou, foi recarregado ou falhou, e qual outra unidade (timer, script) foi iniciada na mesma hora, que é a pista de quem disparou. Use para "por que o serviço X parou/caiu às HH:MM". Um "parou" de poucos segundos junto de "recarregando" é recarga de configuração, não queda.',
    parametros: '{servico: nome da unidade (ex.: unbound, squid, postgresql, nginx), dias?: 1-30 (padrão 2), desde?: AAAA-MM-DD, ate?: AAAA-MM-DD, limite?: 1-40}',
    async run(args) {
        const unit = String(args.servico || '').trim().replace(/\.service$/, '');
        if (!/^[A-Za-z0-9@._-]{2,64}$/.test(unit)) throw new Error('Informe o nome do serviço, ex.: unbound.');
        const days = clamp(args.dias, 2, 1, 30);
        const from = parseDate(args.desde) || new Date(Date.now() - days * 24 * 3600 * 1000);
        const to = parseDate(args.ate) ? new Date(parseDate(args.ate)!.getTime() + 24 * 3600 * 1000) : new Date();
        // O journalctl lê --since/--until no horário LOCAL do servidor: formata em Brasília, não em UTC.
        const fmt = (d: Date) => d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
        const raw = await journal(['-u', `${unit}.service`, '--since', fmt(from), '--until', fmt(to)]);
        const events: Array<{ iso: string; message: string }> = [];
        for (const line of raw.split('\n')) {
            const m = line.match(/^(\S+)\s+\S+\s+([^:]+):\s+(.*)$/);
            if (!m || !LIFECYCLE.test(m[3])) continue;
            // Só o que o systemd diz sobre a unidade ou o que o próprio serviço diz sobre ligar/desligar (nunca a atividade dele).
            if (!/^systemd\[1\]$/.test(m[2]) && !/(start of service|service stopped|Restart of)/i.test(m[3])) continue;
            events.push({ iso: m[1], message: m[3].replace(/\s+/g, ' ').slice(0, 140) });
        }
        const newest = events.slice(-Math.min(rowsLimit(args), 40)).reverse();
        const rows: any[] = [];
        for (const ev of newest) {
            const t = new Date(ev.iso).getTime();
            const w0 = fmt(new Date(t - 9000));
            const w1 = fmt(new Date(t + 2000));
            const near = await journal(['--since', w0, '--until', w1, '-g', 'Starting ']);
            const triggers = Array.from(new Set(near.split('\n').map((l) => l.match(/systemd\[1\]: Starting ([^\s]+\.(?:service|timer))/)?.[1]).filter(Boolean) as string[]))
                .filter((u) => u !== `${unit}.service` && !/^(user@|session-|systemd-)/.test(u)).slice(0, 3);
            rows.push({ quando: localStamp(ev.iso), evento: classify(ev.message), mensagem: ev.message, iniciado_na_mesma_hora: triggers.join(', ') || '—' });
        }
        return { total: events.length, rows, note: events.length ? 'Horário de Brasília. "iniciado_na_mesma_hora" lista as unidades que o systemd começou até 9 s antes do evento.' : `Nenhum início, parada, recarga ou falha de ${unit} no período.` };
    },
};

// Estado de AGORA de um serviço/processo/contêiner pelo nome (ou parte dele). Só leitura, sem shell: nome validado e comandos fixos.
const runRead = (cmd: string, args: string[]) => new Promise<string>((resolve) => {
    execFile(cmd, args, { timeout: 10000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => resolve(err && !stdout ? '' : String(stdout || '')));
});

const servicoAgora: ToolDef = {
    name: 'servico_agora',
    descricao: 'Estado de AGORA de um serviço systemd, processo pm2 ou contêiner Docker, procurando pelo nome ou parte dele (ex.: "cafetech", "unbound", "backend"): ativo ou não, memória usada POR ELE, desde quando, reinícios. Use para "quanta memória o projeto X usa", "o serviço Y está no ar?". Os totais de estado_do_servidor são do servidor inteiro: nunca os atribua a um projeto.',
    parametros: '{nome: parte do nome do serviço, processo ou projeto}',
    async run(args) {
        const nome = String(args.nome || '').trim().toLowerCase();
        if (!/^[a-z0-9_.@:-]{2,80}$/.test(nome)) return { total: 0, rows: [], note: 'Informe só o nome (letras, números, - _ . @), com ao menos 2 caracteres.' };
        const rows: any[] = [];
        const mb = (n: number) => (n > 0 ? Math.round(n / 1048576) : null);

        const units = (await runRead('systemctl', ['list-units', '--type=service', '--all', '--no-legend', '--plain', '--no-pager']))
            .split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((u) => u && u.endsWith('.service') && u.toLowerCase().includes(nome)).slice(0, 8);
        if (units.length) {
            const raw = await runRead('systemctl', ['show', '--no-pager', '-p', 'Id,ActiveState,SubState,MainPID,MemoryCurrent,ActiveEnterTimestamp,NRestarts,Result', ...units]);
            for (const block of raw.split('\n\n')) {
                const v: Record<string, string> = {};
                block.split('\n').forEach((line) => { const k = line.indexOf('='); if (k > 0) v[line.slice(0, k)] = line.slice(k + 1); });
                if (!v.Id) continue;
                const mem = Number(v.MemoryCurrent);
                rows.push({ tipo: 'serviço systemd', nome: v.Id, estado: `${v.ActiveState} (${v.SubState})${v.Result && v.Result !== 'success' ? `, resultado ${v.Result}` : ''}`, memoria_mb: Number.isFinite(mem) && mem < 1e14 ? mb(mem) : null, pid: Number(v.MainPID) || null, desde: v.ActiveEnterTimestamp || null, reinicios: Number(v.NRestarts) || 0 });
            }
        }

        const raw2 = await runRead('/usr/local/bin/pm2', ['jlist']);
        const start = raw2.indexOf('[');
        if (start >= 0) {
            try {
                for (const a of JSON.parse(raw2.slice(start))) {
                    if (!String(a.name).toLowerCase().includes(nome) && !String(a.pm2_env?.pm_cwd || '').toLowerCase().includes(nome)) continue;
                    rows.push({ tipo: 'processo pm2', nome: a.name, estado: a.pm2_env?.status, memoria_mb: mb(Number(a.monit?.memory)), pid: a.pid || null, cpu_pct: a.monit?.cpu, desde: a.pm2_env?.pm_uptime ? localStamp(new Date(a.pm2_env.pm_uptime).toISOString()) : null, reinicios: a.pm2_env?.restart_time, pasta: a.pm2_env?.pm_cwd });
                }
            } catch { /* pm2 sem JSON válido: ignora */ }
        }

        for (const line of (await runRead('docker', ['ps', '-a', '--format', '{{json .}}'])).split('\n').filter(Boolean)) {
            try {
                const c = JSON.parse(line);
                if (String(c.Names).toLowerCase().includes(nome)) rows.push({ tipo: 'contêiner Docker', nome: c.Names, estado: c.Status, imagem: c.Image, portas: c.Ports || null });
            } catch { /* linha inválida */ }
        }
        return { total: rows.length, rows, note: rows.length ? 'Memória é a do próprio serviço/processo (não do servidor inteiro). Um projeto pode ter vários serviços: some só se a pergunta pedir o total do projeto.' : `Nenhum serviço, processo pm2 ou contêiner com "${nome}" no nome. Tente buscar_conhecimento para achar o nome certo.` };
    },
};

const buscarConhecimento: ToolDef = {
    name: 'buscar_conhecimento',
    descricao: 'Base de conhecimento do servidor inteiro: documentação e decisões dos projetos (CODEX), scripts, configurações (Unbound, Squid, nginx, DHCP, firewall), serviços systemd, timers, portas, processos pm2, domínios, projetos (pasta, porta, banco) e tabelas do banco. Use para "como funciona", "onde fica", "qual porta/pasta/domínio", "o que já foi feito". Cada trecho traz a data da indexação (máx. 30 min); para o estado de AGORA use estado_do_servidor.',
    parametros: '{pergunta: o que procurar (use nomes e termos técnicos), tipo?: doc|script|config|servico|timer|porta|pm2|nginx|projeto|banco|tabela|firewall|docker|sistema}',
    async run(args) {
        const tipo = String(args.tipo || '').trim();
        let rows: any[] = [];
        try {
            rows = await searchKnowledge(String(args.pergunta || ''), 6, tipo ? { kinds: [tipo] } : {});
        } catch {
            rows = [];
        }
        if (!rows.length) {
            // base ainda vazia ou fora do ar: cai na busca antiga só em documentação
            rows = await ragService.search(String(args.pergunta || ''), 5);
        }
        return { total: rows.length, rows, note: rows.length ? undefined : 'Nada relevante na base de conhecimento.' };
    },
};

const consultarProjeto: ToolDef = {
    name: 'consultar_projeto',
    descricao: 'Consulta dados AGREGADOS de bases de outros projetos (contagens e agrupamentos), ex.: quantos MEI existem em um município. Veja a lista de FONTES DE DADOS no fim das instruções. Nunca lista pessoas.',
    parametros: '{fonte: id da fonte, onde?: [{campo, op: "="|"!="|">="|"<="|"comeca_com", valor}], agrupar_por?: campo, limite?: 1-40}. Sem agrupar_por devolve só a contagem total.',
    async run(args) {
        return querySource(args);
    },
};

export const TOOLS: ToolDef[] = [
    buscarAuditoria, acoesDeServicos, atividadeDeLogin, cadastros, lgpd, mudancasDePolitica, consultarIp, buscarUsuario, estadoDoServidor, servicoAgora, historicoDeServico, buscarConhecimento, consultarProjeto,
];

export const toolByName = (name: string) => TOOLS.find((tool) => tool.name === name);

// Nomes que devem virar código (PESSOA_n) mesmo aparecendo soltos em texto: contas do console e colaboradores.
export const loadKnownNames = async (): Promise<string[]> => {
    const names: string[] = [];
    const a = await pool.query('SELECT username, display_name FROM auth_users').catch(() => ({ rows: [] as any[] }));
    a.rows.forEach((r: any) => names.push(r.username, r.display_name));
    const c = await pool.query('SELECT username, full_name FROM collab_users').catch(() => ({ rows: [] as any[] }));
    c.rows.forEach((r: any) => names.push(r.username, r.full_name));
    return names.filter(Boolean);
};
