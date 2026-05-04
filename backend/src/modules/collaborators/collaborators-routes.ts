import { Router, Request } from 'express';
import argon2 from 'argon2';
import fs from 'fs';
import { execCmd, execCmdStrict } from '../../utils/sys';
import { pool } from '../../config/db';
import { institutionalAuditService } from '../institutional/institutional-audit-service';
import { AuthenticatedRequest, requireJwt } from '../../middleware/auth';

const router = Router();

const COLLAB_SESSION_HOURS = 8;
const COLLAB_VLAN_ID = 30;
const COLLAB_VLAN_IFACE = 'enp6s0.30';
const COLLAB_WAN_IFACE = 'enp8s0';
const COLLAB_GATEWAY_IP = '192.168.30.1';
const COLLAB_AUTH_SET = 'sgcg_collab_v30_auth';
const COLLAB_SESSION_SECONDS = COLLAB_SESSION_HOURS * 3600;
const COLLAB_SUCCESS_REDIRECT_URL = 'https://www.jacarezinho.pr.gov.br/';
const NGINX_VHOST_PATH = '/etc/nginx/sites-available/sgcg-collab-captive';
const NGINX_ENABLED_PATH = '/etc/nginx/sites-enabled/sgcg-collab-captive';

const normalizeIp = (value: unknown) => {
    const raw = String(value || '').split(',')[0].trim();
    const withoutV6Prefix = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
    return withoutV6Prefix.split('/')[0].trim();
};

const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');
const maskCpf = (cpf: string) => cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.***.***-$4');
const normalizeMac = (value: unknown) => String(value || '').trim().toLowerCase();
const isVlan30Ip = (ip: string) => /^192\.168\.30\.\d{1,3}$/.test(ip);

const getClientIp = (req: Request) =>
    normalizeIp(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress);

async function loadDnsIgnoreFilter(col: string): Promise<string> {
    try {
        const { rows } = await pool.query(
            `SELECT pattern, match_type FROM dns_ignored_domains WHERE active = TRUE`,
        );
        if (!rows.length) return '';
        const parts: string[] = [];
        const exactList = rows
            .filter((p: any) => p.match_type === 'exact')
            .map((p: any) => `'${String(p.pattern).replace(/'/g, "''")}'`);
        if (exactList.length) parts.push(`${col} NOT IN (${exactList.join(', ')})`);
        for (const p of rows.filter((x: any) => x.match_type !== 'exact')) {
            const esc = String(p.pattern).replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_');
            if (p.match_type === 'contains') parts.push(`${col} NOT LIKE '%${esc}%' ESCAPE '\\'`);
            else if (p.match_type === 'suffix') parts.push(`${col} NOT LIKE '%${esc}' ESCAPE '\\'`);
            else if (p.match_type === 'prefix') parts.push(`${col} NOT LIKE '${esc}%' ESCAPE '\\'`);
        }
        return parts.length ? '\n  AND ' + parts.join('\n  AND ') : '';
    } catch {
        return '';
    }
}

// ─── Schema ────────────────────────────────────────────────────────────────

export async function ensureAccessLogSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS collab_access_log (
            id BIGSERIAL PRIMARY KEY,
            logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            session_id BIGINT,
            user_id INTEGER,
            full_name TEXT,
            username TEXT,
            department TEXT,
            position TEXT,
            client_ip INET,
            mac_address TEXT,
            vlan_id INTEGER,
            auth_method TEXT,
            session_started_at TIMESTAMPTZ,
            session_ended_at TIMESTAMPTZ,
            duration_seconds INTEGER,
            bytes_up BIGINT DEFAULT 0,
            bytes_down BIGINT DEFAULT 0,
            top_domain TEXT,
            notes TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_collab_access_log_date
            ON collab_access_log (session_started_at);
        CREATE INDEX IF NOT EXISTS idx_collab_access_log_user
            ON collab_access_log (user_id, session_started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_collab_access_log_vlan
            ON collab_access_log (vlan_id, session_started_at DESC);
        REVOKE ALL ON collab_access_log FROM PUBLIC;
    `);
}

export async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS collab_users (
            id         SERIAL PRIMARY KEY,
            username   TEXT NOT NULL UNIQUE,
            cpf        VARCHAR(11) UNIQUE,
            password_hash TEXT NOT NULL,
            full_name  TEXT NOT NULL,
            department TEXT,
            position   TEXT,
            active     BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE collab_users ADD COLUMN IF NOT EXISTS cpf VARCHAR(11) UNIQUE;

        CREATE TABLE IF NOT EXISTS collab_devices (
            id          BIGSERIAL PRIMARY KEY,
            user_id     INTEGER NOT NULL REFERENCES collab_users(id) ON DELETE CASCADE,
            mac_address VARCHAR(17) NOT NULL UNIQUE,
            first_ip    INET,
            last_ip     INET,
            vlan_id     INTEGER,
            first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            active      BOOLEAN NOT NULL DEFAULT TRUE
        );

        CREATE TABLE IF NOT EXISTS collab_sessions (
            id         BIGSERIAL PRIMARY KEY,
            user_id    INTEGER REFERENCES collab_users(id) ON DELETE SET NULL,
            device_id  BIGINT REFERENCES collab_devices(id) ON DELETE SET NULL,
            client_ip  INET,
            mac_address TEXT,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '8 hours'),
            status     TEXT NOT NULL DEFAULT 'active',
            auth_method TEXT NOT NULL DEFAULT 'usuario_senha',
            revoked_at TIMESTAMPTZ,
            revoked_by TEXT,
            user_agent TEXT
        );

        ALTER TABLE collab_sessions ADD COLUMN IF NOT EXISTS device_id BIGINT REFERENCES collab_devices(id) ON DELETE SET NULL;
        ALTER TABLE collab_sessions ADD COLUMN IF NOT EXISTS auth_method TEXT NOT NULL DEFAULT 'usuario_senha';
        CREATE INDEX IF NOT EXISTS idx_collab_devices_mac ON collab_devices (mac_address);
        CREATE INDEX IF NOT EXISTS idx_collab_sessions_status ON collab_sessions (status, expires_at DESC);
        CREATE INDEX IF NOT EXISTS idx_collab_sessions_ip    ON collab_sessions (client_ip, started_at DESC);
        CREATE TABLE IF NOT EXISTS collab_settings (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        INSERT INTO collab_settings (key, value)
        VALUES ('access_mode', '{"auth_required": true}'::jsonb)
        ON CONFLICT (key) DO NOTHING;
        REVOKE ALL ON collab_users, collab_devices, collab_sessions, collab_settings FROM PUBLIC;
    `);
    await ensureAccessLogSchema();
}

// ─── Enforcement helpers ────────────────────────────────────────────────────

async function countRuntimeRulesWithComment(table: 'filter' | 'nat', chain: string, comment: string) {
    const readCommand = table === 'nat'
        ? `iptables -t nat -S ${chain} | grep -- "--comment ${comment}" || true`
        : `iptables -S ${chain} | grep -- "--comment ${comment}" || true`;
    const output = await execCmd(readCommand).catch(() => '');
    return output
        .split('\n')
        .filter((line) => line.startsWith(`-A ${chain} `) && line.includes(`--comment ${comment}`))
        .length;
}

async function getPortalInsertPosition(table: 'filter' | 'nat', chain: string) {
    const totalBlockCount = await countRuntimeRulesWithComment(table, chain, 'sgcg-total-vlan-block');
    const vipBypassCount = await countRuntimeRulesWithComment(table, chain, 'sgcg-vip-bypass');
    return totalBlockCount + vipBypassCount + 1;
}

async function removeRuntimeRule(check: string, remove: string) {
    while (true) {
        try {
            await execCmdStrict(check);
            await execCmdStrict(remove);
        } catch {
            break;
        }
    }
}

async function ensureOrderedPortalRule(
    table: 'filter' | 'nat',
    chain: string,
    check: string,
    remove: string,
    insertForPosition: (position: number) => string,
) {
    await removeRuntimeRule(check, remove);
    const position = await getPortalInsertPosition(table, chain);
    await execCmdStrict(insertForPosition(position));
}

async function isAuthRequired(): Promise<boolean> {
    const { rows } = await pool.query(
        `SELECT value FROM collab_settings WHERE key = 'access_mode' LIMIT 1`,
    ).catch(() => ({ rows: [] as Array<{ value?: any }> }));
    return rows[0]?.value?.auth_required !== false;
}

async function setAuthRequired(authRequired: boolean) {
    await pool.query(
        `INSERT INTO collab_settings (key, value, updated_at)
         VALUES ('access_mode', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify({ auth_required: authRequired })],
    );
}

async function disableCollabEnforcement() {
    await execCmd(`iptables -t nat -D PREROUTING -i ${COLLAB_VLAN_IFACE} -p tcp --dport 80 -m set ! --match-set ${COLLAB_AUTH_SET} src -j DNAT --to-destination ${COLLAB_GATEWAY_IP}:80`).catch(() => '');
    await execCmd(`iptables -D FORWARD -i ${COLLAB_VLAN_IFACE} -o ${COLLAB_WAN_IFACE} -m set ! --match-set ${COLLAB_AUTH_SET} src -j REJECT --reject-with icmp-port-unreachable`).catch(() => '');
    await pool.query(
        `UPDATE collab_sessions
            SET status = 'revoked', revoked_at = COALESCE(revoked_at, NOW()), revoked_by = 'auth_disabled'
          WHERE status = 'active'`,
    ).catch(() => null);
}

async function listAuthorizedIps(): Promise<string[]> {
    const out = await execCmd(`ipset list ${COLLAB_AUTH_SET}`).catch(() => '');
    return Array.from(new Set(out.match(/192\.168\.30\.\d{1,3}/g) || [])).sort();
}

async function revokeIpRuntimeOnly(ip: string): Promise<boolean> {
    const n = normalizeIp(ip);
    if (!isVlan30Ip(n)) return false;
    await execCmd(`ipset del ${COLLAB_AUTH_SET} ${n}`).catch(() => '');
    await execCmd(`conntrack -D -s ${n}`).catch(() => '');
    await execCmd(`conntrack -D -d ${n}`).catch(() => '');
    return true;
}

async function pruneStaleIps() {
    const authorized = await listAuthorizedIps();
    if (!authorized.length) return 0;
    const { rows } = await pool.query(
        `SELECT DISTINCT host(client_ip) AS ip FROM collab_sessions
          WHERE status = 'active' AND expires_at > NOW() AND client_ip IS NOT NULL`,
    ).catch(() => ({ rows: [] as Array<{ ip: string }> }));
    const activeSet = new Set(rows.map((r) => r.ip));
    const stale = authorized.filter((ip) => !activeSet.has(ip));
    for (const ip of stale) await revokeIpRuntimeOnly(ip).catch(() => null);
    return stale.length;
}

async function revokeActiveSessionsByDeviceOrIp(deviceId: number | null, mac: string | null, ip: string | null, revokedBy: string) {
    const { rows } = await pool.query(
        `UPDATE collab_sessions
            SET status = 'revoked', revoked_at = NOW(), revoked_by = $1
          WHERE status = 'active'
            AND (
                ($2::bigint IS NOT NULL AND device_id = $2::bigint)
                OR ($3::text IS NOT NULL AND mac_address = $3::text)
                OR ($4::inet IS NOT NULL AND client_ip = $4::inet)
            )
          RETURNING host(client_ip) AS client_ip`,
        [revokedBy, deviceId, mac, ip || null],
    ).catch(() => ({ rows: [] as Array<{ client_ip?: string | null }> }));
    const ips = Array.from(new Set(rows.map((row) => row.client_ip).filter(Boolean))) as string[];
    for (const runtimeIp of ips) await revokeIpRuntimeOnly(runtimeIp).catch(() => null);
    return rows.length;
}

export async function expireExpiredSessions() {
    const { rows } = await pool.query(
        `UPDATE collab_sessions
            SET status = 'expired', revoked_at = COALESCE(revoked_at, NOW())
          WHERE status = 'active' AND expires_at <= NOW()
          RETURNING host(client_ip) AS client_ip`,
    ).catch(() => ({ rows: [] as Array<{ client_ip?: string | null }> }));
    const ips = Array.from(new Set(rows.map((r) => r.client_ip).filter(Boolean))) as string[];
    for (const ip of ips) await revokeIpRuntimeOnly(ip).catch(() => null);
    return { expired: rows.length };
}

export async function ensureCollabEnforcement() {
    if (!(await isAuthRequired())) {
        await disableCollabEnforcement();
        return;
    }
    await execCmdStrict(`ipset create ${COLLAB_AUTH_SET} hash:ip timeout ${COLLAB_SESSION_SECONDS} -exist`);
    await expireExpiredSessions();
    await ensureOrderedPortalRule(
        'nat',
        'PREROUTING',
        `iptables -t nat -C PREROUTING -i ${COLLAB_VLAN_IFACE} -p tcp --dport 80 -m set ! --match-set ${COLLAB_AUTH_SET} src -j DNAT --to-destination ${COLLAB_GATEWAY_IP}:80`,
        `iptables -t nat -D PREROUTING -i ${COLLAB_VLAN_IFACE} -p tcp --dport 80 -m set ! --match-set ${COLLAB_AUTH_SET} src -j DNAT --to-destination ${COLLAB_GATEWAY_IP}:80`,
        (position) => `iptables -t nat -I PREROUTING ${position} -i ${COLLAB_VLAN_IFACE} -p tcp --dport 80 -m set ! --match-set ${COLLAB_AUTH_SET} src -j DNAT --to-destination ${COLLAB_GATEWAY_IP}:80`,
    );
    await ensureOrderedPortalRule(
        'filter',
        'FORWARD',
        `iptables -C FORWARD -i ${COLLAB_VLAN_IFACE} -o ${COLLAB_WAN_IFACE} -m set ! --match-set ${COLLAB_AUTH_SET} src -j REJECT --reject-with icmp-port-unreachable`,
        `iptables -D FORWARD -i ${COLLAB_VLAN_IFACE} -o ${COLLAB_WAN_IFACE} -m set ! --match-set ${COLLAB_AUTH_SET} src -j REJECT --reject-with icmp-port-unreachable`,
        (position) => `iptables -I FORWARD ${position} -i ${COLLAB_VLAN_IFACE} -o ${COLLAB_WAN_IFACE} -m set ! --match-set ${COLLAB_AUTH_SET} src -j REJECT --reject-with icmp-port-unreachable`,
    );
    await pruneStaleIps();
}

async function authorizeIp(ip: string): Promise<boolean> {
    if (!isVlan30Ip(ip)) return false;
    await ensureCollabEnforcement();
    await execCmdStrict(`ipset add ${COLLAB_AUTH_SET} ${ip} timeout ${COLLAB_SESSION_SECONDS} -exist`);
    return true;
}

async function inferMac(ip: string): Promise<string | null> {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return null;
    const out = await execCmd(`ip neigh show ${ip}`).catch(() => '');
    const m = out.match(/lladdr\s+([0-9a-f:]{17})/i);
    return m ? m[1].toLowerCase() : null;
}

async function findKnownDevice(mac: string) {
    const { rows } = await pool.query(
        `SELECT d.*, u.full_name, u.username, u.department, u.cpf, u.active AS user_active
           FROM collab_devices d
           JOIN collab_users u ON u.id = d.user_id
          WHERE d.mac_address = $1 AND d.active = TRUE
          LIMIT 1`,
        [normalizeMac(mac)],
    );
    return rows[0]?.user_active ? rows[0] : null;
}

async function findActiveSessionByIp(ip: string) {
    const { rows } = await pool.query(
        `SELECT s.id AS session_id,
                s.started_at,
                s.expires_at,
                s.auth_method,
                u.id,
                u.full_name,
                u.username,
                u.department,
                u.cpf,
                u.active AS user_active
           FROM collab_sessions s
           JOIN collab_users u ON u.id = s.user_id
          WHERE s.client_ip = $1::inet
            AND s.status = 'active'
            AND s.expires_at > NOW()
          ORDER BY s.started_at DESC
          LIMIT 1`,
        [ip],
    ).catch(() => ({ rows: [] as any[] }));
    const row = rows[0];
    return row?.user_active ? row : null;
}

async function upsertDevice(userId: number, ip: string | null, mac: string | null) {
    const normalizedMac = normalizeMac(mac);
    if (!normalizedMac) return null;
    const { rows } = await pool.query(
        `INSERT INTO collab_devices (user_id, mac_address, first_ip, last_ip, vlan_id)
         VALUES ($1, $2, $3::inet, $3::inet, $4)
         ON CONFLICT (mac_address) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            last_ip = EXCLUDED.last_ip,
            vlan_id = EXCLUDED.vlan_id,
            last_seen_at = NOW(),
            active = TRUE
         RETURNING *`,
        [userId, normalizedMac, ip || null, COLLAB_VLAN_ID],
    );
    return rows[0] || null;
}

async function createSession(req: Request, user: any, device: any, authMethod: string, ip: string, mac: string | null) {
    await revokeActiveSessionsByDeviceOrIp(device?.id || null, mac, ip, authMethod);
    const { rows } = await pool.query(
        `INSERT INTO collab_sessions (user_id, device_id, client_ip, mac_address, auth_method, expires_at, user_agent)
         VALUES ($1, $2, $3::inet, $4, $5, NOW() + INTERVAL '${COLLAB_SESSION_HOURS} hours', $6)
         RETURNING id, status, started_at, expires_at`,
        [user.id, device?.id || null, ip, mac || null, authMethod, req.headers['user-agent'] || null],
    );
    const runtimeAuthorized = await authorizeIp(ip).catch(() => false);
    return { ...rows[0], runtime_authorized: runtimeAuthorized };
}

function publicUser(row: any) {
    return {
        id: row.id || row.user_id,
        full_name: row.full_name,
        username: row.username,
        department: row.department,
        cpf: row.cpf ? maskCpf(row.cpf) : null,
    };
}

function buildNginxVhost(): string {
    return `# Portal Cativo SGCG — Colaboradores VLAN 30
server {
    listen ${COLLAB_GATEWAY_IP}:80;
    server_name _;

    access_log /var/log/nginx/sgcg-collab-captive.access.log;
    error_log /var/log/nginx/sgcg-collab-captive.error.log;

    proxy_hide_header ETag;
    proxy_hide_header Last-Modified;
    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;

    location = /generate_204          { proxy_pass https://127.0.0.1:6777/collab/portal; proxy_ssl_verify off; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
    location = /connecttest.txt       { proxy_pass https://127.0.0.1:6777/collab/portal; proxy_ssl_verify off; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
    location = /ncsi.txt              { proxy_pass https://127.0.0.1:6777/collab/portal; proxy_ssl_verify off; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
    location = /hotspot-detect.html   { proxy_pass https://127.0.0.1:6777/collab/portal; proxy_ssl_verify off; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
    location = /library/test/success.html { proxy_pass https://127.0.0.1:6777/collab/portal; proxy_ssl_verify off; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
    location = /success.txt           { proxy_pass https://127.0.0.1:6777/collab/portal; proxy_ssl_verify off; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
    location = /kindle-wifi/wifistub.html { proxy_pass https://127.0.0.1:6777/collab/portal; proxy_ssl_verify off; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
    location = /wpad.dat              { return 404; }

    location /api/collaborators/public/ {
        proxy_pass http://127.0.0.1:6778;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location = /LOGO-JACAREZINHO.png {
        proxy_pass https://127.0.0.1:6777/LOGO-JACAREZINHO.png;
        proxy_ssl_verify off;
    }

    location = /favicon.ico {
        proxy_pass https://127.0.0.1:6777/favicon.ico;
        proxy_ssl_verify off;
    }

    location = /favicon.png {
        proxy_pass https://127.0.0.1:6777/favicon.png;
        proxy_ssl_verify off;
    }

    location / {
        proxy_pass https://127.0.0.1:6777;
        proxy_ssl_verify off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
`;
}

// ─── Audit ──────────────────────────────────────────────────────────────────

async function audit(req: Request, action: string, success: boolean, payload: any = {}, result: any = {}) {
    await institutionalAuditService.log({
        action,
        requestedBy: 'collaborators',
        actorIp: getClientIp(req),
        actorUserAgent: req.headers['user-agent'] || null,
        payload,
        result,
        success,
    }).catch(() => null);
}

// ─── Public routes (sem JWT) ─────────────────────────────────────────────────

router.get('/public/context', async (req, res) => {
    await ensureSchema();
    const ip = getClientIp(req);
    if (!(await isAuthRequired())) {
        return res.json({
            authenticated: true,
            auth_required: false,
            vlan_ok: isVlan30Ip(ip),
            ip,
            redirect_url: COLLAB_SUCCESS_REDIRECT_URL,
        });
    }
    if (!isVlan30Ip(ip)) {
        return res.json({ authenticated: false, auth_required: true, vlan_ok: false, ip });
    }

    const activeSession = await findActiveSessionByIp(ip);
    if (activeSession) {
        const runtimeAuthorized = await authorizeIp(ip).catch(() => false);
        return res.json({
            authenticated: true,
            auth_required: true,
            vlan_ok: true,
            ip,
            user: publicUser(activeSession),
            session: {
                id: activeSession.session_id,
                started_at: activeSession.started_at,
                expires_at: activeSession.expires_at,
                auth_method: activeSession.auth_method,
                runtime_authorized: runtimeAuthorized,
            },
            redirect_url: COLLAB_SUCCESS_REDIRECT_URL,
        });
    }

    await revokeIpRuntimeOnly(ip).catch(() => false);
    const mac = await inferMac(ip).catch(() => null);
    if (mac) {
        const known = await findKnownDevice(mac).catch(() => null);
        if (known) {
            await audit(req, 'collab_mac_recognized_confirmation_required', true, { ip, mac }, { user_id: known.user_id, device_id: known.id });
            return res.json({
                authenticated: false,
                auth_required: true,
                vlan_ok: true,
                recognized: true,
                requires_confirm: true,
                ip,
                mac,
                user: publicUser(known),
                message: `Bem-vindo, ${known.full_name}. Clique em Entrar na Internet para navegar.`,
            });
        }
    }

    return res.json({ authenticated: false, auth_required: true, vlan_ok: true, ip, mac, requires_login: true });
});

router.post('/public/continue', async (req, res) => {
    await ensureSchema();
    const ip = getClientIp(req);

    if (!(await isAuthRequired())) {
        return res.json({
            authenticated: true,
            auth_required: false,
            vlan_ok: true,
            ip,
            redirect_url: COLLAB_SUCCESS_REDIRECT_URL,
        });
    }

    if (!isVlan30Ip(ip)) {
        return res.status(403).json({ error: 'Acesso permitido apenas pela rede interna VLAN 30.' });
    }

    const mac = await inferMac(ip).catch(() => null);
    if (!mac) {
        await audit(req, 'collab_continue_failed', false, { ip }, { reason: 'mac_not_found' });
        return res.status(401).json({ error: 'Dispositivo não identificado. Faça cadastro ou login com usuário e senha.' });
    }

    const known = await findKnownDevice(mac).catch(() => null);
    if (!known) {
        await audit(req, 'collab_continue_failed', false, { ip, mac }, { reason: 'device_not_found' });
        return res.status(401).json({ error: 'Dispositivo ainda não cadastrado. Faça cadastro ou login.' });
    }

    await revokeIpRuntimeOnly(ip).catch(() => false);
    const user = { id: known.user_id, full_name: known.full_name, username: known.username, department: known.department, cpf: known.cpf };
    const session = await createSession(req, user, known, 'mac_confirm', ip, mac);
    await audit(req, 'collab_mac_confirmed', true, { ip, mac }, { user_id: user.id, device_id: known.id, session_id: session.id });
    return res.json({ authenticated: true, user: publicUser(user), ip, mac, session, redirect_url: COLLAB_SUCCESS_REDIRECT_URL });
});

router.post('/public/register', async (req, res) => {
    await ensureSchema();
    const ip = getClientIp(req);
    const fullName = String(req.body?.full_name || '').trim();
    const cpf = onlyDigits(req.body?.cpf);
    const department = String(req.body?.department || '').trim();
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const lgpdAccepted = req.body?.lgpd_accepted === true || req.body?.lgpd_accepted === 'true' || req.body?.lgpd_accepted === 'on';

    if (!(await isAuthRequired())) {
        return res.status(409).json({ error: 'Autenticação da VLAN 30 está desativada no SGCG.' });
    }
    if (!isVlan30Ip(ip)) {
        return res.status(403).json({ error: 'Acesso permitido apenas pela rede interna VLAN 30.' });
    }
    if (fullName.length < 6 || cpf.length !== 11 || department.length < 2 || username.length < 3 || password.length < 6) {
        await audit(req, 'collab_register_failed', false, { username, cpf: cpf ? maskCpf(cpf) : null, ip }, { reason: 'invalid_payload' });
        return res.status(400).json({ error: 'Todos os campos são obrigatórios: nome completo, CPF, setor, usuário, senha e ciência LGPD.' });
    }
    if (!lgpdAccepted) {
        await audit(req, 'collab_register_failed', false, { username, cpf: cpf ? maskCpf(cpf) : null, ip }, { reason: 'lgpd_not_accepted' });
        return res.status(400).json({ error: 'É obrigatório confirmar ciência da Lei Geral de Proteção de Dados - LGPD.' });
    }

    const mac = await inferMac(ip).catch(() => null);
    const exists = await pool.query(
        `SELECT id FROM collab_users WHERE LOWER(username) = LOWER($1) OR cpf = $2 LIMIT 1`,
        [username, cpf],
    );
    if (exists.rowCount) {
        await audit(req, 'collab_register_failed', false, { username, cpf: maskCpf(cpf), ip, mac }, { reason: 'duplicate_user_or_cpf' });
        return res.status(409).json({ error: 'Usuário ou CPF já cadastrado. Use o login para associar este dispositivo.' });
    }

    const hash = await argon2.hash(password);
    const { rows } = await pool.query(
        `INSERT INTO collab_users (username, cpf, password_hash, full_name, department)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, cpf, full_name, department, position, active`,
        [username, cpf, hash, fullName, department],
    );
    const user = rows[0];
    const device = await upsertDevice(user.id, ip, mac);
    const session = await createSession(req, user, device, 'first_register', ip, mac);
    await audit(req, 'collab_register_success', true, { username, cpf: maskCpf(cpf), ip, mac, lgpd_accepted: true }, { user_id: user.id, device_id: device?.id, session_id: session.id });
    return res.status(201).json({ authenticated: true, user: publicUser(user), ip, mac, session, redirect_url: COLLAB_SUCCESS_REDIRECT_URL });
});

router.post('/public/login', async (req, res) => {
    await ensureSchema();
    const ip = getClientIp(req);
    const { username, password } = req.body || {};

    if (!(await isAuthRequired())) {
        return res.status(409).json({ error: 'Autenticação da VLAN 30 está desativada no SGCG.' });
    }

    if (!username || !password) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
    }
    if (!isVlan30Ip(ip)) {
        return res.status(403).json({ error: 'Acesso permitido apenas pela rede interna VLAN 30.' });
    }

    const { rows: userRows } = await pool.query(
        `SELECT id, username, cpf, full_name, department, position, password_hash, active
           FROM collab_users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
        [String(username).trim()],
    ).catch(() => ({ rows: [] }));

    const user = userRows[0];
    if (!user || !user.active) {
        await audit(req, 'collab_login_failed', false, { username }, { reason: 'user_not_found' });
        return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }

    const valid = await argon2.verify(user.password_hash, String(password)).catch(() => false);
    if (!valid) {
        await audit(req, 'collab_login_failed', false, { username }, { reason: 'wrong_password' });
        return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }

    const mac = await inferMac(ip).catch(() => null);
    const device = await upsertDevice(user.id, ip, mac);
    const session = await createSession(req, user, device, 'usuario_senha', ip, mac);
    await audit(req, 'collab_login', true, { username: user.username, ip, mac }, { session_id: session.id, device_id: device?.id });

    return res.json({
        authenticated: true,
        user: publicUser(user),
        session,
        redirect_url: COLLAB_SUCCESS_REDIRECT_URL,
    });
});

// ─── Admin routes (JWT) ──────────────────────────────────────────────────────

router.get('/overview', requireJwt, async (_req, res) => {
    const [users, sessions, authorized] = await Promise.allSettled([
        pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE active) AS active_count FROM collab_users`),
        pool.query(`SELECT COUNT(*) AS total FROM collab_sessions WHERE status = 'active' AND expires_at > NOW()`),
        listAuthorizedIps(),
    ]);
    const authRequired = await isAuthRequired();
    return res.json({
        settings: {
            auth_required: authRequired,
            mode: authRequired ? 'auth_required' : 'dns_acl_only',
        },
        users: {
            total: Number((users as any).value?.rows[0]?.total || 0),
            active: Number((users as any).value?.rows[0]?.active_count || 0),
        },
        sessions: { active: Number((sessions as any).value?.rows[0]?.total || 0) },
        enforcement: {
            authorized_count: ((authorized as any).value?.length || 0),
            auth_set: COLLAB_AUTH_SET,
            session_hours: COLLAB_SESSION_HOURS,
        },
    });
});

router.get('/users', requireJwt, async (_req, res) => {
    const { rows } = await pool.query(
        `SELECT id, username, full_name, department, position, active, created_at, updated_at
           FROM collab_users ORDER BY full_name ASC`,
    );
    return res.json(rows);
});

router.post('/users', requireJwt, async (req: AuthenticatedRequest, res) => {
    const { username, password, full_name, department, position } = req.body || {};
    if (!username || !password || !full_name) {
        return res.status(400).json({ error: 'username, password e full_name são obrigatórios.' });
    }
    if (String(password).length < 6) {
        return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    }
    const hash = await argon2.hash(String(password));
    const { rows } = await pool.query(
        `INSERT INTO collab_users (username, password_hash, full_name, department, position)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, username, full_name, department, position, active, created_at`,
        [String(username).trim().toLowerCase(), hash, String(full_name).trim(), department || null, position || null],
    );
    await audit(req, 'collab_user_created', true, { username }, { id: rows[0].id });
    return res.status(201).json(rows[0]);
});

router.put('/users/:id', requireJwt, async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { full_name, department, position, active, password } = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];

    if (full_name !== undefined) { params.push(String(full_name).trim()); sets.push(`full_name = $${params.length}`); }
    if (department !== undefined) { params.push(department || null); sets.push(`department = $${params.length}`); }
    if (position !== undefined) { params.push(position || null); sets.push(`position = $${params.length}`); }
    if (active !== undefined) { params.push(Boolean(active)); sets.push(`active = $${params.length}`); }
    if (password) {
        if (String(password).length < 6) return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
        params.push(await argon2.hash(String(password)));
        sets.push(`password_hash = $${params.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

    sets.push('updated_at = NOW()');
    params.push(Number(id));
    const { rows } = await pool.query(
        `UPDATE collab_users SET ${sets.join(', ')} WHERE id = $${params.length}
         RETURNING id, username, full_name, department, position, active`,
        params,
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });

    if (active === false) {
        const { rows: sRows } = await pool.query(
            `UPDATE collab_sessions SET status = 'revoked', revoked_at = NOW(), revoked_by = $1
              WHERE user_id = $2 AND status = 'active'
              RETURNING host(client_ip) AS ip`,
            [req.auth?.username || 'admin', Number(id)],
        ).catch(() => ({ rows: [] }));
        for (const r of sRows) if (r.ip) await revokeIpRuntimeOnly(r.ip).catch(() => null);
    }

    await audit(req, 'collab_user_updated', true, { id, changes: req.body }, { username: rows[0].username });
    return res.json(rows[0]);
});

router.delete('/users/:id', requireJwt, async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { rows: sRows } = await pool.query(
        `UPDATE collab_sessions SET status = 'revoked', revoked_at = NOW(), revoked_by = $1
          WHERE user_id = $2 AND status = 'active'
          RETURNING host(client_ip) AS ip`,
        [req.auth?.username || 'admin', Number(id)],
    ).catch(() => ({ rows: [] }));
    for (const r of sRows) if (r.ip) await revokeIpRuntimeOnly(r.ip).catch(() => null);

    const { rows } = await pool.query(
        `UPDATE collab_users SET active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id, username`,
        [Number(id)],
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });
    await audit(req, 'collab_user_deleted', true, { id }, { username: rows[0].username });
    return res.json({ success: true });
});

router.get('/sessions', requireJwt, async (_req, res) => {
    const { rows } = await pool.query(
        `SELECT s.id, host(s.client_ip) AS client_ip, s.mac_address,
                s.started_at, s.expires_at, s.status, s.user_agent,
                u.username, u.full_name, u.department
           FROM collab_sessions s
           LEFT JOIN collab_users u ON u.id = s.user_id
          WHERE s.status = 'active' AND s.expires_at > NOW()
          ORDER BY s.started_at DESC LIMIT 200`,
    );
    return res.json(rows);
});

router.get('/metrics', requireJwt, async (_req: AuthenticatedRequest, res) => {
    try {
        await ensureSchema();
        await ensureAccessLogSchema();
        const noiseFilter = await loadDnsIgnoreFilter('query_name');
        const [dailyRows, monthlyRow, topUsersRows, authRows, vlanRows, hourlyRows, topDomainsRows] = await Promise.all([
            pool.query(`
                SELECT DATE(started_at)::text AS date,
                       COUNT(*) AS sessions,
                       COUNT(DISTINCT user_id) AS unique_users
                FROM collab_sessions
                WHERE started_at >= NOW() - INTERVAL '30 days'
                GROUP BY DATE(started_at)
                ORDER BY date DESC
            `),
            pool.query(`
                SELECT COUNT(*) AS total_sessions,
                       COUNT(DISTINCT user_id) AS unique_users,
                       COUNT(DISTINCT DATE(started_at)) AS active_days,
                       COUNT(DISTINCT CASE WHEN started_at >= DATE_TRUNC('month', NOW()) THEN user_id END) AS monthly_unique
                FROM collab_sessions
                WHERE started_at >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
            `),
            pool.query(`
                SELECT u.full_name, u.username, u.department, COUNT(s.id) AS sessions,
                       MAX(s.started_at) AS last_seen
                FROM collab_sessions s
                JOIN collab_users u ON u.id = s.user_id
                WHERE s.started_at >= NOW() - INTERVAL '30 days'
                GROUP BY u.id, u.full_name, u.username, u.department
                ORDER BY sessions DESC
                LIMIT 10
            `),
            pool.query(`
                SELECT auth_method, COUNT(*) AS count
                FROM collab_sessions
                WHERE started_at >= NOW() - INTERVAL '30 days'
                GROUP BY auth_method
                ORDER BY count DESC
            `),
            pool.query(`
                SELECT '${COLLAB_VLAN_ID}' AS vlan_id, COUNT(*) AS count
                FROM collab_sessions
                WHERE started_at >= NOW() - INTERVAL '30 days'
            `),
            pool.query(`
                SELECT EXTRACT(HOUR FROM started_at)::int AS hour,
                       COUNT(*) AS count
                FROM collab_sessions
                WHERE started_at >= NOW() - INTERVAL '30 days'
                GROUP BY hour
                ORDER BY hour
            `),
            pool.query(`
                SELECT query_name AS domain,
                       COUNT(*)::int AS total,
                       COUNT(DISTINCT host(client_ip))::int AS unique_ips
                FROM dns_policy_events
                WHERE occurred_at >= NOW() - INTERVAL '30 days'
                  AND client_ip::text LIKE '192.168.30.%'
                  AND action != 'blocked'
                  AND query_name IS NOT NULL
                  AND query_name != '-'
                  ${noiseFilter}
                GROUP BY query_name
                ORDER BY total DESC
                LIMIT 10
            `).catch(() => ({ rows: [] })),
        ]);

        const totalSessions = authRows.rows.reduce((acc, r) => acc + Number(r.count), 0) || 1;
        const hourlyMap: Record<number, number> = {};
        hourlyRows.rows.forEach((r) => { hourlyMap[r.hour] = Number(r.count); });
        const hourlyFull = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourlyMap[h] || 0 }));

        res.json({
            daily_users: dailyRows.rows,
            monthly_summary: monthlyRow.rows[0] || {},
            top_users: topUsersRows.rows,
            auth_methods: authRows.rows.map((r) => ({
                ...r,
                pct: Math.round((Number(r.count) / totalSessions) * 100),
            })),
            vlan_distribution: vlanRows.rows,
            hourly_distribution: hourlyFull,
            top_domains: topDomainsRows.rows,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Erro ao carregar métricas.' });
    }
});

router.post('/access-log/sync', requireJwt, async (req: AuthenticatedRequest, res) => {
    try {
        await ensureAccessLogSchema();
        const noiseFilterDpe = await loadDnsIgnoreFilter('dpe.query_name');
        const result = await pool.query(`
            INSERT INTO collab_access_log
                (session_id, user_id, full_name, username, department, position, client_ip,
                 mac_address, vlan_id, auth_method, session_started_at, session_ended_at,
                 duration_seconds, logged_at)
            SELECT
                s.id,
                s.user_id,
                u.full_name,
                u.username,
                u.department,
                u.position,
                s.client_ip,
                s.mac_address,
                ${COLLAB_VLAN_ID},
                COALESCE(s.auth_method, 'usuario_senha'),
                s.started_at,
                COALESCE(s.revoked_at, LEAST(s.expires_at, NOW())),
                GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s.revoked_at, LEAST(s.expires_at, NOW())) - s.started_at))::int),
                NOW()
            FROM collab_sessions s
            LEFT JOIN collab_users u ON u.id = s.user_id
            WHERE s.id NOT IN (
                SELECT session_id FROM collab_access_log WHERE session_id IS NOT NULL
            )
            RETURNING id
        `);

        await pool.query(`
            UPDATE collab_access_log cal
            SET top_domain = (
                SELECT dpe.query_name
                FROM dns_policy_events dpe
                WHERE dpe.client_ip = cal.client_ip
                  AND dpe.occurred_at >= cal.session_started_at
                  AND dpe.occurred_at <= COALESCE(cal.session_ended_at, cal.session_started_at + INTERVAL '8 hours')
                  AND dpe.action != 'blocked'
                  AND dpe.query_name IS NOT NULL
                  AND dpe.query_name != '-'
                  ${noiseFilterDpe}
                GROUP BY dpe.query_name
                ORDER BY COUNT(*) DESC
                LIMIT 1
            )
            WHERE cal.top_domain IS NULL
              AND cal.client_ip IS NOT NULL
              AND cal.session_started_at IS NOT NULL
        `).catch(() => null);

        await audit(req, 'collab_access_log_sync', true, {}, { inserted: result.rowCount });
        res.json({ success: true, inserted: result.rowCount });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Erro ao sincronizar log.' });
    }
});

router.get('/report/validate', requireJwt, async (req: AuthenticatedRequest, res) => {
    try {
        await ensureSchema();
        await ensureAccessLogSchema();
        const from = req.query.from ? String(req.query.from) : null;
        const to = req.query.to ? String(req.query.to) : null;
        const userId = req.query.user_id ? Number(req.query.user_id) : null;
        const vlanId = req.query.vlan_id ? Number(req.query.vlan_id) : null;

        const conditions: string[] = [];
        const params: unknown[] = [];
        if (from) { conditions.push(`s.started_at >= $${params.length + 1}::date`); params.push(from); }
        if (to) { conditions.push(`s.started_at < ($${params.length + 1}::date + INTERVAL '1 day')`); params.push(to); }
        if (userId && Number.isFinite(userId)) { conditions.push(`s.user_id = $${params.length + 1}`); params.push(userId); }
        if (vlanId && Number.isFinite(vlanId)) { conditions.push(`${COLLAB_VLAN_ID} = $${params.length + 1}`); params.push(vlanId); }
        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

        const [summary, missingLogs, duplicateLogs, identityGaps, ipGaps, durationIssues, staleLogs, domainGaps] = await Promise.all([
            pool.query(`
                SELECT COUNT(*)::int AS total_sessions,
                       COUNT(*) FILTER (WHERE cal.session_id IS NOT NULL)::int AS logged_sessions,
                       COUNT(DISTINCT s.user_id)::int AS unique_users
                FROM collab_sessions s
                LEFT JOIN collab_access_log cal ON cal.session_id = s.id
                ${where}
            `, params),
            pool.query(`
                SELECT s.id, s.started_at, host(s.client_ip) AS client_ip
                FROM collab_sessions s
                LEFT JOIN collab_access_log cal ON cal.session_id = s.id
                ${where}
                  ${where ? 'AND' : 'WHERE'} cal.session_id IS NULL
                ORDER BY s.started_at DESC
                LIMIT 25
            `, params),
            pool.query(`
                SELECT cal.session_id, COUNT(*)::int AS copies
                FROM collab_access_log cal
                JOIN collab_sessions s ON s.id = cal.session_id
                ${where}
                GROUP BY cal.session_id
                HAVING COUNT(*) > 1
                ORDER BY copies DESC
                LIMIT 25
            `, params),
            pool.query(`
                SELECT s.id, s.user_id, host(s.client_ip) AS client_ip, s.started_at
                FROM collab_sessions s
                LEFT JOIN collab_users u ON u.id = s.user_id
                ${where}
                  ${where ? 'AND' : 'WHERE'} (s.user_id IS NULL OR u.id IS NULL OR u.full_name IS NULL OR u.username IS NULL)
                ORDER BY s.started_at DESC
                LIMIT 25
            `, params),
            pool.query(`
                SELECT s.id, s.user_id, s.started_at
                FROM collab_sessions s
                ${where}
                  ${where ? 'AND' : 'WHERE'} s.client_ip IS NULL
                ORDER BY s.started_at DESC
                LIMIT 25
            `, params),
            pool.query(`
                SELECT s.id, s.started_at, COALESCE(s.revoked_at, LEAST(s.expires_at, NOW())) AS ended_at
                FROM collab_sessions s
                ${where}
                  ${where ? 'AND' : 'WHERE'} COALESCE(s.revoked_at, LEAST(s.expires_at, NOW())) < s.started_at
                ORDER BY s.started_at DESC
                LIMIT 25
            `, params),
            pool.query(`
                SELECT s.id,
                       GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s.revoked_at, LEAST(s.expires_at, NOW())) - s.started_at))::int) AS computed_duration,
                       cal.duration_seconds AS logged_duration
                FROM collab_sessions s
                JOIN collab_access_log cal ON cal.session_id = s.id
                ${where}
                  ${where ? 'AND' : 'WHERE'} ABS(COALESCE(cal.duration_seconds, -1) - GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s.revoked_at, LEAST(s.expires_at, NOW())) - s.started_at))::int)) > 60
                ORDER BY s.started_at DESC
                LIMIT 25
            `, params),
            pool.query(`
                SELECT s.id, host(s.client_ip) AS client_ip, s.started_at
                FROM collab_sessions s
                LEFT JOIN collab_access_log cal ON cal.session_id = s.id
                ${where}
                  ${where ? 'AND' : 'WHERE'} COALESCE(cal.top_domain, '') = ''
                    AND EXISTS (
                        SELECT 1 FROM dns_policy_events dpe
                        WHERE dpe.client_ip = s.client_ip
                          AND dpe.occurred_at >= s.started_at
                          AND dpe.action != 'blocked'
                          AND dpe.query_name IS NOT NULL
                          AND dpe.query_name != '-'
                        LIMIT 1
                    )
                ORDER BY s.started_at DESC
                LIMIT 25
            `, params).catch(() => ({ rows: [] })),
        ]);

        const checks = [
            { key: 'missing_logs', label: 'Sessões fora do log imutável', severity: 'critical', count: missingLogs.rowCount || 0, rows: missingLogs.rows },
            { key: 'duplicate_logs', label: 'Sessões duplicadas no log imutável', severity: 'critical', count: duplicateLogs.rowCount || 0, rows: duplicateLogs.rows },
            { key: 'identity_gaps', label: 'Sessões sem colaborador íntegro', severity: 'critical', count: identityGaps.rowCount || 0, rows: identityGaps.rows },
            { key: 'ip_gaps', label: 'Sessões sem IP de origem', severity: 'critical', count: ipGaps.rowCount || 0, rows: ipGaps.rows },
            { key: 'duration_issues', label: 'Sessões com duração incoerente', severity: 'critical', count: durationIssues.rowCount || 0, rows: durationIssues.rows },
            { key: 'stale_logs', label: 'Duração do log divergente da sessão', severity: 'warning', count: staleLogs.rowCount || 0, rows: staleLogs.rows },
            { key: 'domain_gaps', label: 'Sessões com DNS disponível sem site principal no log', severity: 'warning', count: domainGaps.rows.length || 0, rows: domainGaps.rows },
        ];
        const critical = checks.filter((c) => c.severity === 'critical').reduce((acc, c) => acc + c.count, 0);
        const warning = checks.filter((c) => c.severity === 'warning').reduce((acc, c) => acc + c.count, 0);

        res.json({
            valid: critical === 0,
            status: critical ? 'invalid' : warning ? 'warning' : 'valid',
            generated_at: new Date().toISOString(),
            scope: { from, to, user_id: userId, vlan_id: vlanId || COLLAB_VLAN_ID },
            summary: {
                total_sessions: Number(summary.rows[0]?.total_sessions || 0),
                logged_sessions: Number(summary.rows[0]?.logged_sessions || 0),
                unique_users: Number(summary.rows[0]?.unique_users || 0),
                critical,
                warning,
            },
            checks,
            recommendation: critical
                ? 'Sincronize o log, corrija as inconsistências críticas e valide novamente antes de emitir o PDF.'
                : warning
                    ? 'O relatório pode ser emitido, mas recomenda-se revisar os avisos antes de anexar a auditorias externas.'
                    : 'Relatório consistente para emissão institucional.',
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Erro ao validar relatório.' });
    }
});

router.get('/report', requireJwt, async (req: AuthenticatedRequest, res) => {
    try {
        await ensureSchema();
        await ensureAccessLogSchema();
        const noiseFilterDpe = await loadDnsIgnoreFilter('dpe.query_name');
        const from = req.query.from ? String(req.query.from) : null;
        const to = req.query.to ? String(req.query.to) : null;
        const userId = req.query.user_id ? Number(req.query.user_id) : null;
        const vlanId = req.query.vlan_id ? Number(req.query.vlan_id) : null;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(1000, Math.max(10, Number(req.query.limit) || 100));
        const offset = (page - 1) * limit;

        const conditions: string[] = [];
        const params: unknown[] = [];

        if (from) { conditions.push(`s.started_at >= $${params.length + 1}::date`); params.push(from); }
        if (to) { conditions.push(`s.started_at < ($${params.length + 1}::date + INTERVAL '1 day')`); params.push(to); }
        if (userId && Number.isFinite(userId)) { conditions.push(`s.user_id = $${params.length + 1}`); params.push(userId); }
        if (vlanId && Number.isFinite(vlanId)) { conditions.push(`${COLLAB_VLAN_ID} = $${params.length + 1}`); params.push(vlanId); }

        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
        const baseParams = [...params];

        const [rows, countRes, summaryRes] = await Promise.all([
            pool.query(`
                SELECT
                    s.id,
                    TO_CHAR(s.started_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') AS date_fmt,
                    TO_CHAR(s.started_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI:SS') AS hour_fmt,
                    host(s.client_ip) AS client_ip,
                    s.mac_address,
                    ${COLLAB_VLAN_ID} AS vlan_id,
                    COALESCE(s.auth_method, 'usuario_senha') AS auth_method,
                    s.status,
                    COALESCE(u.full_name, 'N/I') AS full_name,
                    COALESCE(u.username, 'N/I') AS username,
                    COALESCE(u.department, 'N/I') AS department,
                    GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s.revoked_at, LEAST(s.expires_at, NOW())) - s.started_at))::int) AS duration_seconds,
                    COALESCE(cal.top_domain, (
                        SELECT dpe.query_name
                        FROM dns_policy_events dpe
                        WHERE dpe.client_ip = s.client_ip
                          AND dpe.occurred_at >= s.started_at
                          AND dpe.action != 'blocked'
                          AND dpe.query_name IS NOT NULL
                          AND dpe.query_name != '-'
                          ${noiseFilterDpe}
                        GROUP BY dpe.query_name
                        ORDER BY COUNT(*) DESC
                        LIMIT 1
                    )) AS top_domain,
                    COALESCE(cal.bytes_up, 0) AS bytes_up,
                    COALESCE(cal.bytes_down, 0) AS bytes_down
                FROM collab_sessions s
                LEFT JOIN collab_users u ON u.id = s.user_id
                LEFT JOIN collab_access_log cal ON cal.session_id = s.id
                ${where}
                ORDER BY s.started_at DESC
                LIMIT $${params.length + 1} OFFSET $${params.length + 2}
            `, [...params, limit, offset]),
            pool.query(`SELECT COUNT(*)::int AS total FROM collab_sessions s ${where}`, baseParams),
            pool.query(`
                SELECT
                    COUNT(*)::int AS total_sessions,
                    COUNT(DISTINCT s.user_id)::int AS unique_users,
                    COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s.revoked_at, LEAST(s.expires_at, NOW())) - s.started_at))::int)), 0)::bigint AS total_seconds
                FROM collab_sessions s ${where}
            `, baseParams),
        ]);

        res.json({
            rows: rows.rows,
            total: countRes.rows[0].total,
            page,
            limit,
            summary: summaryRes.rows[0],
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Erro ao gerar relatório.' });
    }
});

router.post('/sessions/:id/revoke', requireJwt, async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { rows } = await pool.query(
        `UPDATE collab_sessions SET status = 'revoked', revoked_at = NOW(), revoked_by = $1
          WHERE id = $2 AND status = 'active'
          RETURNING id, host(client_ip) AS client_ip`,
        [req.auth?.username || 'admin', Number(id)],
    );
    if (!rows.length) return res.status(404).json({ error: 'Sessão não encontrada ou já encerrada.' });

    const ip = rows[0].client_ip;
    const runtimeRevoked = ip ? await revokeIpRuntimeOnly(ip).catch(() => false) : false;
    await audit(req, 'collab_session_revoked', true, { session_id: id }, { ip, runtime_revoked: runtimeRevoked });
    return res.json({ success: true, ip, runtime_revoked: runtimeRevoked });
});

router.get('/enforcement/status', requireJwt, async (_req, res) => {
    const ips = await listAuthorizedIps().catch(() => [] as string[]);
    const authRequired = await isAuthRequired();
    return res.json({
        vlan_id: COLLAB_VLAN_ID,
        interface: COLLAB_VLAN_IFACE,
        gateway_ip: COLLAB_GATEWAY_IP,
        auth_set: COLLAB_AUTH_SET,
        session_hours: COLLAB_SESSION_HOURS,
        authorized_ips: ips,
        authorized_count: ips.length,
        auth_required: authRequired,
        mode: authRequired ? 'auth_required' : 'dns_acl_only',
        enforcement: 'iptables_ipset_complementar_ao_ufw',
        ufw_principal: true,
    });
});

router.put('/settings/access-mode', requireJwt, async (req: AuthenticatedRequest, res) => {
    const authRequired = req.body?.auth_required !== false;
    await setAuthRequired(authRequired);
    if (authRequired) await ensureCollabEnforcement();
    else await disableCollabEnforcement();
    await audit(
        req,
        'collab_access_mode_updated',
        true,
        { auth_required: authRequired },
        { mode: authRequired ? 'auth_required' : 'dns_acl_only' },
    );
    return res.json({
        success: true,
        auth_required: authRequired,
        mode: authRequired ? 'auth_required' : 'dns_acl_only',
    });
});

router.post('/enforcement/setup', requireJwt, async (req: AuthenticatedRequest, res) => {
    const results: Record<string, string> = {};

    try {
        fs.writeFileSync(NGINX_VHOST_PATH, buildNginxVhost(), 'utf8');
        if (!fs.existsSync(NGINX_ENABLED_PATH)) {
            fs.symlinkSync(NGINX_VHOST_PATH, NGINX_ENABLED_PATH);
        }
        results.nginx_vhost = 'ok';
    } catch (e: any) {
        results.nginx_vhost = `erro: ${e.message}`;
    }

    try {
        await execCmdStrict('systemctl reload nginx');
        results.nginx_reload = 'ok';
    } catch (e: any) {
        results.nginx_reload = `erro: ${e.message}`;
    }

    try {
        await ensureCollabEnforcement();
        results.enforcement = 'ok';
    } catch (e: any) {
        results.enforcement = `erro: ${e.message}`;
    }

    await audit(req, 'collab_enforcement_setup', Object.values(results).every((v) => v === 'ok'), {}, results);
    return res.json({ success: true, results });
});

export const collaboratorsSchemaService = {
    ensureSchema,
    ensureAccessLogSchema,
    ensureCollabEnforcement,
    expireExpiredSessions,
};

export default router;
