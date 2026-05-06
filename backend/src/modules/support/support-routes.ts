import { randomBytes } from 'crypto';
import { Router, Request } from 'express';
import argon2 from 'argon2';
import { pool } from '../../config/db';
import { AuthenticatedRequest, requireJwt } from '../../middleware/auth';
import { institutionalAuditService } from '../institutional/institutional-audit-service';

const router = Router();

const TOKEN_BYTES = 32;
const SESSION_HOURS = 12;

const normalizeIp = (value: unknown) => {
    const raw = String(value || '').split(',')[0].trim();
    const withoutV6Prefix = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
    return withoutV6Prefix.split('/')[0].trim();
};

const getClientIp = (req: Request) =>
    normalizeIp(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress);

const slug = (value: unknown) => String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const readableStatus: Record<string, string> = {
    open: 'Aberto',
    triage: 'Em triagem',
    waiting_user: 'Aguardando colaborador',
    analysis: 'Em análise',
    waiting_approval: 'Aguardando autorização',
    approved: 'Autorizado',
    in_progress: 'Em atendimento',
    resolved: 'Resolvido',
    denied: 'Não autorizado',
    canceled: 'Cancelado',
};

const categoryLabels: Record<string, string> = {
    site_not_opening: 'Site ou sistema não abre',
    release_request: 'Pedir acesso a site ou aplicativo',
    slow_connection: 'Internet lenta',
    wifi_problem: 'Problema no Wi-Fi',
    system_access: 'Acesso a sistema de trabalho',
    device_problem: 'Computador ou celular com problema',
    other: 'Outro atendimento',
};

const priorityLabels: Record<string, string> = {
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
    critical: 'Urgente',
};

export async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS support_portal_sessions (
            id BIGSERIAL PRIMARY KEY,
            token_hash TEXT NOT NULL UNIQUE,
            collaborator_id INTEGER NOT NULL REFERENCES collab_users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '${SESSION_HOURS} hours'),
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            client_ip INET,
            user_agent TEXT,
            active BOOLEAN NOT NULL DEFAULT TRUE
        );

        CREATE TABLE IF NOT EXISTS support_tickets (
            id BIGSERIAL PRIMARY KEY,
            protocol TEXT NOT NULL UNIQUE,
            requester_id INTEGER REFERENCES collab_users(id) ON DELETE SET NULL,
            requester_name TEXT NOT NULL,
            requester_username TEXT,
            requester_department TEXT,
            requester_ip INET,
            requester_user_agent TEXT,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            requested_site TEXT,
            affected_area TEXT,
            impact TEXT NOT NULL DEFAULT 'person',
            urgency TEXT NOT NULL DEFAULT 'normal',
            priority TEXT NOT NULL DEFAULT 'medium',
            status TEXT NOT NULL DEFAULT 'open',
            assigned_to TEXT,
            admin_unread BOOLEAN NOT NULL DEFAULT TRUE,
            requester_unread BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            closed_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS support_ticket_comments (
            id BIGSERIAL PRIMARY KEY,
            ticket_id BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
            author_type TEXT NOT NULL,
            author_name TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS support_ticket_events (
            id BIGSERIAL PRIMARY KEY,
            ticket_id BIGINT REFERENCES support_tickets(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            actor_type TEXT NOT NULL,
            actor_name TEXT,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (status, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets (priority, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_support_tickets_requester ON support_tickets (requester_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_support_comments_ticket ON support_ticket_comments (ticket_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_support_events_ticket ON support_ticket_events (ticket_id, created_at);
        REVOKE ALL ON support_portal_sessions, support_tickets, support_ticket_comments, support_ticket_events FROM PUBLIC;
    `);
}

function classifyPriority(input: { category: string; impact: string; urgency: string }) {
    const impact = slug(input.impact);
    const urgency = slug(input.urgency);
    const category = slug(input.category);
    if (impact === 'everyone' || urgency === 'stopped' || category === 'security_risk') return 'critical';
    if (impact === 'department' || urgency === 'work_blocked') return 'high';
    if (category === 'release_request' || urgency === 'can_wait') return 'medium';
    return 'medium';
}

function makeProtocol(id: number) {
    const d = new Date();
    const stamp = [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
    ].join('');
    return `SGCG-CH-${stamp}-${String(id).padStart(5, '0')}`;
}

function publicTicket(row: any) {
    return {
        ...row,
        status_label: readableStatus[row.status] || row.status,
        category_label: categoryLabels[row.category] || row.category,
        priority_label: priorityLabels[row.priority] || row.priority,
    };
}

async function audit(req: Request, action: string, success: boolean, payload: any = {}, result: any = {}) {
    await institutionalAuditService.log({
        action,
        requestedBy: 'support',
        actorIp: getClientIp(req),
        actorUserAgent: req.headers['user-agent'] || null,
        payload,
        result,
        success,
    }).catch(() => null);
}

async function logEvent(ticketId: number | string | null, eventType: string, actorType: string, actorName: string | null, payload: any = {}) {
    await pool.query(
        `INSERT INTO support_ticket_events (ticket_id, event_type, actor_type, actor_name, payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [ticketId, eventType, actorType, actorName, JSON.stringify(payload || {})],
    );
}

async function readPortalSession(req: Request) {
    const token = String(req.headers['x-sgcg-support-token'] || '').trim();
    if (!token) return null;
    // Argon2 hashes are salted; verify each active token hash instead of comparing.
    const { rows } = await pool.query(
        `SELECT s.*, u.username, u.full_name, u.department, u.position, u.active AS user_active
           FROM support_portal_sessions s
           JOIN collab_users u ON u.id = s.collaborator_id
          WHERE s.active = TRUE AND s.expires_at > NOW()
          ORDER BY s.last_seen_at DESC
          LIMIT 200`,
    );
    for (const row of rows) {
        if (await argon2.verify(row.token_hash, token).catch(() => false)) {
            if (!row.user_active) return null;
            await pool.query(`UPDATE support_portal_sessions SET last_seen_at = NOW() WHERE id = $1`, [row.id]).catch(() => null);
            return row;
        }
    }
    return null;
}

async function requirePortalSession(req: Request, res: any) {
    const session = await readPortalSession(req);
    if (!session) {
        res.status(401).json({ error: 'Entre com seu usuário e senha do Portal do Colaborador.' });
        return null;
    }
    return session;
}

router.post('/public/login', async (req, res) => {
    await ensureSchema();
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!username || !password) {
        return res.status(400).json({ error: 'Informe usuário e senha.' });
    }
    const { rows } = await pool.query(
        `SELECT id, username, password_hash, full_name, department, position, active
           FROM collab_users
          WHERE LOWER(username) = LOWER($1)
          LIMIT 1`,
        [username],
    );
    const user = rows[0];
    if (!user?.active || !(await argon2.verify(user.password_hash, password).catch(() => false))) {
        await audit(req, 'support_public_login_failed', false, { username }, { reason: 'invalid_credentials' });
        return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const tokenHash = await argon2.hash(token);
    await pool.query(
        `INSERT INTO support_portal_sessions (token_hash, collaborator_id, client_ip, user_agent)
         VALUES ($1, $2, $3::inet, $4)`,
        [tokenHash, user.id, getClientIp(req) || null, req.headers['user-agent'] || null],
    );
    await audit(req, 'support_public_login_success', true, { username }, { collaborator_id: user.id });
    res.json({
        token,
        user: {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            department: user.department,
            position: user.position,
        },
    });
});

router.get('/public/me', async (req, res) => {
    await ensureSchema();
    const session = await requirePortalSession(req, res);
    if (!session) return;
    res.json({
        user: {
            id: session.collaborator_id,
            username: session.username,
            full_name: session.full_name,
            department: session.department,
            position: session.position,
        },
    });
});

router.get('/public/notifications', async (req, res) => {
    await ensureSchema();
    const session = await requirePortalSession(req, res);
    if (!session) return;
    const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS unread
           FROM support_tickets
          WHERE requester_id = $1 AND requester_unread = TRUE`,
        [session.collaborator_id],
    );
    res.json({ unread: rows[0]?.unread || 0 });
});

router.get('/public/tickets', async (req, res) => {
    await ensureSchema();
    const session = await requirePortalSession(req, res);
    if (!session) return;
    const { rows } = await pool.query(
        `SELECT id, protocol, category, title, requested_site, affected_area, impact, urgency,
                priority, status, admin_unread, requester_unread, created_at, updated_at, closed_at
           FROM support_tickets
          WHERE requester_id = $1
          ORDER BY updated_at DESC
          LIMIT 100`,
        [session.collaborator_id],
    );
    await pool.query(
        `UPDATE support_tickets SET requester_unread = FALSE WHERE requester_id = $1 AND requester_unread = TRUE`,
        [session.collaborator_id],
    ).catch(() => null);
    res.json({ tickets: rows.map(publicTicket) });
});

router.post('/public/tickets', async (req, res) => {
    await ensureSchema();
    const session = await requirePortalSession(req, res);
    if (!session) return;

    const category = slug(req.body?.category) || 'other';
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const requestedSite = String(req.body?.requested_site || '').trim();
    const affectedArea = String(req.body?.affected_area || '').trim();
    const impact = slug(req.body?.impact) || 'person';
    const urgency = slug(req.body?.urgency) || 'normal';
    if (title.length < 4 || description.length < 10) {
        return res.status(400).json({ error: 'Descreva o problema com um título e uma explicação curta.' });
    }
    if (category === 'release_request' && requestedSite.length < 3) {
        return res.status(400).json({ error: 'Informe qual site, aplicativo ou serviço precisa de acesso.' });
    }
    const priority = classifyPriority({ category, impact, urgency });
    const { rows } = await pool.query(
        `INSERT INTO support_tickets (
            protocol, requester_id, requester_name, requester_username, requester_department,
            requester_ip, requester_user_agent, category, title, description, requested_site,
            affected_area, impact, urgency, priority, status
         )
         VALUES (
            $15, $1, $2, $3, $4, $5::inet, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'open'
         )
         RETURNING *`,
        [
            session.collaborator_id,
            session.full_name,
            session.username,
            session.department,
            getClientIp(req) || null,
            req.headers['user-agent'] || null,
            category,
            title,
            description,
            requestedSite || null,
            affectedArea || null,
            impact,
            urgency,
            priority,
            `PENDING-${randomBytes(6).toString('hex')}`,
        ],
    );
    const ticket = rows[0];
    const protocol = makeProtocol(Number(ticket.id));
    const updated = await pool.query(
        `UPDATE support_tickets SET protocol = $1 WHERE id = $2 RETURNING *`,
        [protocol, ticket.id],
    );
    await logEvent(ticket.id, 'ticket_created', 'collaborator', session.full_name, { category, impact, urgency, priority });
    await audit(req, 'support_ticket_created', true, { protocol, category, priority }, { ticket_id: ticket.id });
    res.status(201).json({ ticket: publicTicket(updated.rows[0]) });
});

router.get('/public/tickets/:id', async (req, res) => {
    await ensureSchema();
    const session = await requirePortalSession(req, res);
    if (!session) return;
    const { rows } = await pool.query(
        `SELECT * FROM support_tickets WHERE id = $1 AND requester_id = $2 LIMIT 1`,
        [req.params.id, session.collaborator_id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Chamado não encontrado.' });
    const comments = await pool.query(
        `SELECT id, author_type, author_name, body, created_at
           FROM support_ticket_comments
          WHERE ticket_id = $1
          ORDER BY created_at ASC`,
        [req.params.id],
    );
    await pool.query(`UPDATE support_tickets SET requester_unread = FALSE WHERE id = $1`, [req.params.id]).catch(() => null);
    res.json({ ticket: publicTicket(rows[0]), comments: comments.rows });
});

router.post('/public/tickets/:id/comments', async (req, res) => {
    await ensureSchema();
    const session = await requirePortalSession(req, res);
    if (!session) return;
    const body = String(req.body?.body || '').trim();
    if (body.length < 2) return res.status(400).json({ error: 'Escreva uma mensagem.' });
    const ticket = await pool.query(
        `SELECT id FROM support_tickets WHERE id = $1 AND requester_id = $2 LIMIT 1`,
        [req.params.id, session.collaborator_id],
    );
    if (!ticket.rows[0]) return res.status(404).json({ error: 'Chamado não encontrado.' });
    const { rows } = await pool.query(
        `INSERT INTO support_ticket_comments (ticket_id, author_type, author_name, body)
         VALUES ($1, 'collaborator', $2, $3)
         RETURNING id, author_type, author_name, body, created_at`,
        [req.params.id, session.full_name, body],
    );
    await pool.query(
        `UPDATE support_tickets
            SET updated_at = NOW(), admin_unread = TRUE
          WHERE id = $1`,
        [req.params.id],
    );
    await logEvent(req.params.id, 'comment_added', 'collaborator', session.full_name);
    res.status(201).json({ comment: rows[0] });
});

router.get('/notifications', requireJwt, async (_req, res) => {
    await ensureSchema();
    const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS unread,
                COUNT(*) FILTER (WHERE status IN ('open', 'triage', 'analysis', 'waiting_approval', 'in_progress'))::int AS active
           FROM support_tickets
          WHERE admin_unread = TRUE OR status IN ('open', 'triage', 'analysis', 'waiting_approval', 'in_progress')`,
    );
    res.json({ unread: rows[0]?.unread || 0, active: rows[0]?.active || 0 });
});

router.get('/tickets', requireJwt, async (req, res) => {
    await ensureSchema();
    const status = String(req.query.status || '').trim();
    const params: any[] = [];
    let where = '';
    if (status && status !== 'all') {
        params.push(status);
        where = `WHERE status = $${params.length}`;
    }
    const { rows } = await pool.query(
        `SELECT id, protocol, requester_name, requester_username, requester_department,
                requester_ip, category, title, requested_site, affected_area, impact, urgency,
                priority, status, assigned_to, admin_unread, requester_unread, created_at, updated_at, closed_at
           FROM support_tickets
           ${where}
          ORDER BY
            CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
            updated_at DESC
          LIMIT 250`,
        params,
    );
    res.json({ tickets: rows.map(publicTicket) });
});

router.get('/tickets/:id', requireJwt, async (req, res) => {
    await ensureSchema();
    const { rows } = await pool.query(`SELECT * FROM support_tickets WHERE id = $1 LIMIT 1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Chamado não encontrado.' });
    const comments = await pool.query(
        `SELECT id, author_type, author_name, body, created_at
           FROM support_ticket_comments
          WHERE ticket_id = $1
          ORDER BY created_at ASC`,
        [req.params.id],
    );
    const events = await pool.query(
        `SELECT id, event_type, actor_type, actor_name, payload, created_at
           FROM support_ticket_events
          WHERE ticket_id = $1
          ORDER BY created_at ASC`,
        [req.params.id],
    );
    await pool.query(`UPDATE support_tickets SET admin_unread = FALSE WHERE id = $1`, [req.params.id]).catch(() => null);
    res.json({ ticket: publicTicket(rows[0]), comments: comments.rows, events: events.rows });
});

router.patch('/tickets/:id', requireJwt, async (req: AuthenticatedRequest, res) => {
    await ensureSchema();
    const allowedStatus = new Set(Object.keys(readableStatus));
    const status = slug(req.body?.status);
    const priority = slug(req.body?.priority);
    const assignedTo = String(req.body?.assigned_to || '').trim();
    if (status && !allowedStatus.has(status)) return res.status(400).json({ error: 'Status inválido.' });
    if (priority && !priorityLabels[priority]) return res.status(400).json({ error: 'Prioridade inválida.' });
    const { rows } = await pool.query(
        `UPDATE support_tickets
            SET status = COALESCE(NULLIF($1, ''), status),
                priority = COALESCE(NULLIF($2, ''), priority),
                assigned_to = COALESCE(NULLIF($3, ''), assigned_to),
                requester_unread = TRUE,
                updated_at = NOW(),
                closed_at = CASE
                    WHEN COALESCE(NULLIF($1, ''), status) IN ('resolved', 'denied', 'canceled') THEN COALESCE(closed_at, NOW())
                    ELSE NULL
                END
          WHERE id = $4
          RETURNING *`,
        [status || '', priority || '', assignedTo || '', req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Chamado não encontrado.' });
    const actor = req.auth?.username || req.auth?.name || 'SGCG';
    await logEvent(req.params.id, 'ticket_updated', 'admin', actor, { status, priority, assigned_to: assignedTo || null });
    await audit(req, 'support_ticket_updated', true, { ticket_id: req.params.id, status, priority }, { protocol: rows[0].protocol });
    res.json({ ticket: publicTicket(rows[0]) });
});

router.post('/tickets/:id/comments', requireJwt, async (req: AuthenticatedRequest, res) => {
    await ensureSchema();
    const body = String(req.body?.body || '').trim();
    if (body.length < 2) return res.status(400).json({ error: 'Escreva uma mensagem.' });
    const ticket = await pool.query(`SELECT id FROM support_tickets WHERE id = $1 LIMIT 1`, [req.params.id]);
    if (!ticket.rows[0]) return res.status(404).json({ error: 'Chamado não encontrado.' });
    const actor = req.auth?.username || req.auth?.name || 'Equipe SGCG';
    const { rows } = await pool.query(
        `INSERT INTO support_ticket_comments (ticket_id, author_type, author_name, body)
         VALUES ($1, 'admin', $2, $3)
         RETURNING id, author_type, author_name, body, created_at`,
        [req.params.id, actor, body],
    );
    await pool.query(
        `UPDATE support_tickets
            SET updated_at = NOW(), requester_unread = TRUE
          WHERE id = $1`,
        [req.params.id],
    );
    await logEvent(req.params.id, 'comment_added', 'admin', actor);
    res.status(201).json({ comment: rows[0] });
});

router.post('/tickets/:id/mark-read', requireJwt, async (req, res) => {
    await ensureSchema();
    await pool.query(`UPDATE support_tickets SET admin_unread = FALSE WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
});

export const supportSchemaService = { ensureSchema };
export default router;
