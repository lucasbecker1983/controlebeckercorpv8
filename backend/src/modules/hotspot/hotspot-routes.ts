import { Router, Request } from 'express';
import argon2 from 'argon2';
import { execCmd, execCmdStrict } from '../../utils/sys';
import { pool } from '../../config/db';
import { institutionalAuditService } from '../institutional/institutional-audit-service';
import { AuthenticatedRequest, requireJwt } from '../../middleware/auth';

const router = Router();

// Carrega filtro dinâmico de domínios ignorados da tabela dns_ignored_domains (mesma DB)
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

const HOTSPOT_SESSION_HOURS = 12;
const HOTSPOT_VLAN_ID = 70;
const HOTSPOT_VLAN_IFACE = 'enp6s0.70';
const HOTSPOT_WAN_IFACE = 'enp8s0';
const HOTSPOT_GATEWAY_IP = '192.168.70.1';
const HOTSPOT_AUTH_SET = 'sgcg_hotspot_v70_auth';
const HOTSPOT_SESSION_SECONDS = HOTSPOT_SESSION_HOURS * 60 * 60;
const HOTSPOT_SUCCESS_REDIRECT_URL = 'https://www.jacarezinho.pr.gov.br/';

const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalizeMac = (value: unknown) => String(value || '').trim().toLowerCase();
const MAC_ADDRESS_REGEX = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
const normalizeOptionalMac = (value: unknown) => {
    const normalized = normalizeMac(value);
    return MAC_ADDRESS_REGEX.test(normalized) ? normalized : null;
};

const normalizeIp = (value: unknown) => {
    const raw = String(value || '').split(',')[0].trim();
    const withoutV6Prefix = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
    return withoutV6Prefix.split('/')[0].trim();
};

const inferVlanId = (ip: string | null) => {
    const normalized = normalizeIp(ip);
    if (!normalized) return null;
    const match = normalized.match(/^192\.168\.(\d{1,3})\./);
    return match ? Number(match[1]) : null;
};

const maskCpf = (cpf: string) => cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.***.***-$4');
const isValidBirthDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const getClientIp = (req: Request) => normalizeIp(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress);

const isVlan70Ip = (ip: string | null) => /^192\.168\.70\.(\d{1,3})$/.test(normalizeIp(ip));

async function ensureAccessLogSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hotspot_access_log (
            id BIGSERIAL PRIMARY KEY,
            logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            session_id BIGINT,
            visitor_id BIGINT,
            visitor_name TEXT,
            cpf_masked TEXT,
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
        CREATE INDEX IF NOT EXISTS idx_hotspot_access_log_date
            ON hotspot_access_log (session_started_at);
        CREATE INDEX IF NOT EXISTS idx_hotspot_access_log_visitor
            ON hotspot_access_log (visitor_id, session_started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_hotspot_access_log_vlan
            ON hotspot_access_log (vlan_id, session_started_at DESC);
    `);
}

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hotspot_visitors (
            id BIGSERIAL PRIMARY KEY,
            full_name TEXT NOT NULL,
            cpf VARCHAR(11) NOT NULL UNIQUE,
            birth_date DATE NOT NULL,
            mac_address VARCHAR(17),
            password_hash TEXT NOT NULL,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE hotspot_visitors DROP COLUMN IF EXISTS mother_name;
        ALTER TABLE hotspot_visitors ADD COLUMN IF NOT EXISTS mac_address VARCHAR(17);

        CREATE TABLE IF NOT EXISTS hotspot_devices (
            id BIGSERIAL PRIMARY KEY,
            visitor_id BIGINT NOT NULL REFERENCES hotspot_visitors(id) ON DELETE CASCADE,
            mac_address VARCHAR(17) NOT NULL UNIQUE,
            first_ip INET,
            last_ip INET,
            vlan_id INTEGER,
            first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            active BOOLEAN NOT NULL DEFAULT TRUE
        );

        CREATE TABLE IF NOT EXISTS hotspot_sessions (
            id BIGSERIAL PRIMARY KEY,
            visitor_id BIGINT REFERENCES hotspot_visitors(id) ON DELETE SET NULL,
            device_id BIGINT REFERENCES hotspot_devices(id) ON DELETE SET NULL,
            client_ip INET,
            mac_address VARCHAR(17),
            vlan_id INTEGER,
            auth_method VARCHAR(32) NOT NULL,
            status VARCHAR(24) NOT NULL DEFAULT 'active',
            user_agent TEXT,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '12 hours'),
            revoked_at TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_hotspot_devices_mac ON hotspot_devices (mac_address);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_hotspot_visitors_mac
            ON hotspot_visitors (mac_address)
            WHERE mac_address IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_hotspot_sessions_status ON hotspot_sessions (status, expires_at DESC);
        CREATE INDEX IF NOT EXISTS idx_hotspot_sessions_vlan ON hotspot_sessions (vlan_id, started_at DESC);
        REVOKE ALL ON hotspot_visitors, hotspot_devices, hotspot_sessions FROM PUBLIC;
    `);
}

async function inferMac(ip: string | null) {
    if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return null;
    const output = await execCmd(`ip neigh show ${ip}`).catch(() => '');
    const match = output.match(/lladdr\s+([0-9a-f:]{17})/i);
    return match ? normalizeMac(match[1]) : null;
}

async function ensureRule(checkCommand: string, insertCommand: string) {
    try {
        await execCmdStrict(checkCommand);
    } catch {
        await execCmdStrict(insertCommand);
    }
}

async function listAuthorizedHotspotIps() {
    const ipsetOutput = await execCmd(`ipset list ${HOTSPOT_AUTH_SET}`).catch(() => '');
    return Array.from(new Set(ipsetOutput.match(/192\.168\.70\.\d{1,3}/g) || [])).sort();
}

async function revokeLegacyAutoSessions() {
    const result = await pool.query(
        `UPDATE hotspot_sessions
            SET status = 'revoked', revoked_at = NOW(), last_seen_at = NOW()
          WHERE status = 'active'
            AND auth_method = 'mac_auto'
          RETURNING host(client_ip) AS client_ip`,
    ).catch(() => ({ rows: [] as Array<{ client_ip?: string | null }> }));
    const ips = Array.from(new Set(result.rows.map((row) => row.client_ip).filter(Boolean))) as string[];
    for (const ip of ips) await revokeHotspotIpRuntimeOnly(ip);
}

async function pruneUnauthorizedHotspotIps() {
    const authorizedIps = await listAuthorizedHotspotIps();
    if (!authorizedIps.length) return 0;
    const active = await pool.query(
        `SELECT DISTINCT host(client_ip) AS ip
           FROM hotspot_sessions
          WHERE status = 'active'
            AND expires_at > NOW()
            AND auth_method <> 'mac_auto'
            AND client_ip IS NOT NULL
            AND vlan_id = $1`,
        [HOTSPOT_VLAN_ID],
    ).catch(() => ({ rows: [] as Array<{ ip: string }> }));
    const activeIps = new Set(active.rows.map((row) => row.ip));
    const staleIps = authorizedIps.filter((ip) => !activeIps.has(ip));
    for (const ip of staleIps) await revokeHotspotIpRuntimeOnly(ip);
    return staleIps.length;
}

async function expireExpiredSessions() {
    const result = await pool.query(
        `UPDATE hotspot_sessions
            SET status = 'expired', revoked_at = COALESCE(revoked_at, NOW()), last_seen_at = NOW()
          WHERE status = 'active'
            AND expires_at <= NOW()
          RETURNING host(client_ip) AS client_ip`,
    ).catch(() => ({ rows: [] as Array<{ client_ip?: string | null }> }));
    const ips = Array.from(new Set(result.rows.map((row) => row.client_ip).filter(Boolean))) as string[];
    for (const ip of ips) await revokeHotspotIpRuntimeOnly(ip);
    if (ips.length) await pruneUnauthorizedHotspotIps().catch(() => 0);
    return { expired: result.rows.length, runtime_revoked: ips.length };
}

async function ensureHotspotEnforcement() {
    await execCmdStrict(`ipset create ${HOTSPOT_AUTH_SET} hash:ip timeout ${HOTSPOT_SESSION_SECONDS} -exist`);
    await revokeLegacyAutoSessions();
    await expireExpiredSessions();
    await ensureRule(
        `iptables -t nat -C PREROUTING -i ${HOTSPOT_VLAN_IFACE} -p tcp --dport 80 -m set ! --match-set ${HOTSPOT_AUTH_SET} src -j DNAT --to-destination ${HOTSPOT_GATEWAY_IP}:80`,
        `iptables -t nat -I PREROUTING 1 -i ${HOTSPOT_VLAN_IFACE} -p tcp --dport 80 -m set ! --match-set ${HOTSPOT_AUTH_SET} src -j DNAT --to-destination ${HOTSPOT_GATEWAY_IP}:80`,
    );
    await ensureRule(
        `iptables -C FORWARD -i ${HOTSPOT_VLAN_IFACE} -o ${HOTSPOT_WAN_IFACE} -m set ! --match-set ${HOTSPOT_AUTH_SET} src -j REJECT --reject-with icmp-port-unreachable`,
        `iptables -I FORWARD 1 -i ${HOTSPOT_VLAN_IFACE} -o ${HOTSPOT_WAN_IFACE} -m set ! --match-set ${HOTSPOT_AUTH_SET} src -j REJECT --reject-with icmp-port-unreachable`,
    );
    await pruneUnauthorizedHotspotIps();
}

async function authorizeHotspotIp(ip: string | null, vlanId: number | null) {
    const normalizedIp = normalizeIp(ip);
    if (vlanId !== HOTSPOT_VLAN_ID || !isVlan70Ip(normalizedIp)) return false;
    await ensureHotspotEnforcement();
    await execCmdStrict(`ipset add ${HOTSPOT_AUTH_SET} ${normalizedIp} timeout ${HOTSPOT_SESSION_SECONDS} -exist`);
    return true;
}

async function revokeHotspotIp(ip: string | null) {
    const normalizedIp = normalizeIp(ip);
    if (!isVlan70Ip(normalizedIp)) return false;
    await ensureHotspotEnforcement().catch(() => null);
    await revokeHotspotIpRuntimeOnly(normalizedIp);
    return true;
}

async function revokeHotspotIpRuntimeOnly(ip: string | null) {
    const normalizedIp = normalizeIp(ip);
    if (!isVlan70Ip(normalizedIp)) return false;
    await execCmd(`ipset del ${HOTSPOT_AUTH_SET} ${normalizedIp}`).catch(() => '');
    await dropHotspotConnections(normalizedIp);
    return true;
}

async function dropHotspotConnections(ip: string | null) {
    const normalizedIp = normalizeIp(ip);
    if (!isVlan70Ip(normalizedIp)) return false;
    await execCmd(`conntrack -D -s ${normalizedIp}`).catch(() => '');
    await execCmd(`conntrack -D -d ${normalizedIp}`).catch(() => '');
    return true;
}

async function revokeRuntimeIps(rows: Array<{ client_ip?: string | null }>) {
    const ips = Array.from(new Set(rows.map((row) => row.client_ip).filter(Boolean))) as string[];
    for (const ip of ips) await revokeHotspotIpRuntimeOnly(ip).catch(() => false);
    return ips.length;
}

async function revokeActiveSessionsByDeviceMacOrIp(deviceId: number | null, mac: string | null, ip: string | null, reason: string) {
    const result = await pool.query(
        `UPDATE hotspot_sessions
            SET status = 'revoked', revoked_at = NOW(), last_seen_at = NOW()
          WHERE status = 'active'
            AND (
                ($1::bigint IS NOT NULL AND device_id = $1::bigint)
                OR ($2::text IS NOT NULL AND mac_address = $2::text)
                OR ($3::inet IS NOT NULL AND client_ip = $3::inet)
            )
          RETURNING host(client_ip) AS client_ip`,
        [deviceId || null, mac || null, ip || null],
    );
    const runtimeRevoked = await revokeRuntimeIps(result.rows);
    return { revoked_sessions: result.rowCount || 0, runtime_revoked: runtimeRevoked, reason };
}

async function findKnownDevice(mac: string) {
    const normalizedMac = normalizeOptionalMac(mac);
    if (!normalizedMac) return null;
    const found = await pool.query(
        `SELECT d.*, v.full_name, v.cpf, v.active AS visitor_active
           FROM hotspot_devices d
           JOIN hotspot_visitors v ON v.id = d.visitor_id
          WHERE d.mac_address = $1 AND d.active = TRUE
          LIMIT 1`,
        [normalizedMac],
    );
    if (found.rowCount && found.rows[0].visitor_active) return found.rows[0];

    const visitor = await pool.query(
        `SELECT NULL::bigint AS id,
                v.id AS visitor_id,
                v.mac_address,
                NULL::inet AS first_ip,
                NULL::inet AS last_ip,
                NULL::integer AS vlan_id,
                TRUE AS active,
                v.full_name,
                v.cpf,
                v.active AS visitor_active
           FROM hotspot_visitors v
          WHERE v.mac_address = $1 AND v.active = TRUE
          LIMIT 1`,
        [normalizedMac],
    );
    return visitor.rowCount && visitor.rows[0].visitor_active ? visitor.rows[0] : null;
}

async function readHotspotEnforcementStatus() {
    const authorizedIps = await listAuthorizedHotspotIps();
    return {
        vlan_id: HOTSPOT_VLAN_ID,
        interface: HOTSPOT_VLAN_IFACE,
        gateway_ip: HOTSPOT_GATEWAY_IP,
        auth_set: HOTSPOT_AUTH_SET,
        session_seconds: HOTSPOT_SESSION_SECONDS,
        authorized_ips: authorizedIps,
        authorized_count: authorizedIps.length,
        enforcement: 'iptables_ipset_complementar_ao_ufw',
        ufw_principal: true,
    };
}

async function audit(req: Request, action: string, success: boolean, payload: any = {}, result: any = {}, message?: string) {
    await institutionalAuditService.log({
        action,
        requestedBy: 'hotspot',
        actorIp: getClientIp(req),
        actorUserAgent: req.headers['user-agent'] || null,
        payload,
        result,
        success,
        message,
        route: req.originalUrl,
        method: req.method,
        statusCode: success ? 200 : 400,
    });
}

async function createSession(req: Request, visitor: any, device: any, authMethod: string, ip: string | null, mac: string | null, vlanId: number | null) {
    await revokeActiveSessionsByDeviceMacOrIp(device?.id || null, mac, ip, authMethod).catch(() => null);
    const session = await pool.query(
        `INSERT INTO hotspot_sessions
            (visitor_id, device_id, client_ip, mac_address, vlan_id, auth_method, user_agent, expires_at)
         VALUES ($1,$2,$3::inet,$4,$5,$6,$7,NOW() + ($8 || ' hours')::interval)
         RETURNING id, status, started_at, expires_at`,
        [visitor.id, device?.id || null, ip || null, mac || null, vlanId, authMethod, req.headers['user-agent'] || null, HOTSPOT_SESSION_HOURS],
    );
    const row = session.rows[0];
    const runtimeAuthorized = await authorizeHotspotIp(ip, vlanId).catch(() => false);
    return { ...row, runtime_authorized: runtimeAuthorized };
}

async function upsertDevice(visitorId: number, ip: string | null, mac: string | null, vlanId: number | null) {
    const normalizedMac = normalizeOptionalMac(mac);
    if (!normalizedMac) return null;
    const result = await pool.query(
        `INSERT INTO hotspot_devices (visitor_id, mac_address, first_ip, last_ip, vlan_id)
         VALUES ($1,$2,$3::inet,$3::inet,$4)
         ON CONFLICT (mac_address) DO UPDATE SET
            visitor_id = EXCLUDED.visitor_id,
            last_ip = EXCLUDED.last_ip,
            vlan_id = EXCLUDED.vlan_id,
            last_seen_at = NOW(),
            active = TRUE
         RETURNING *`,
        [visitorId, normalizedMac, ip || null, vlanId],
    );
    return result.rows[0];
}

async function assignVisitorMac(visitorId: number, mac: string | null) {
    const normalizedMac = normalizeOptionalMac(mac);
    if (!normalizedMac) return null;
    const result = await pool.query(
        `UPDATE hotspot_visitors
            SET mac_address = $2,
                updated_at = NOW()
          WHERE id = $1
            AND NOT EXISTS (
                SELECT 1 FROM hotspot_visitors other
                 WHERE other.mac_address = $2
                   AND other.id <> $1
            )
          RETURNING mac_address`,
        [visitorId, normalizedMac],
    );
    return result.rowCount ? result.rows[0].mac_address : null;
}

function publicVisitor(row: any) {
    return {
        id: row.id,
        full_name: row.full_name,
        cpf: maskCpf(row.cpf),
        mac_address: row.mac_address || null,
    };
}

function adminVisitor(row: any, includeRawCpf = false) {
    return {
        ...row,
        cpf: maskCpf(row.cpf),
        cpf_raw: includeRawCpf ? row.cpf : undefined,
    };
}

async function auditAdmin(req: AuthenticatedRequest, action: string, success: boolean, payload: any = {}, result: any = {}, message?: string, statusCode = 200) {
    await institutionalAuditService.log({
        action,
        requestedBy: req.auth?.username || 'sistema',
        actorUserId: req.auth?.id || null,
        actorIp: getClientIp(req),
        actorUserAgent: req.headers['user-agent'] || null,
        payload,
        result,
        success,
        message,
        route: req.originalUrl,
        method: req.method,
        statusCode,
    });
}

router.use('/public', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

router.get('/public/context', async (req, res) => {
    await ensureSchema();
    const ip = getClientIp(req);
    const vlanId = inferVlanId(ip);
    const mac = await inferMac(ip);

    if (!mac) {
        const revoked = await revokeActiveSessionsByDeviceMacOrIp(null, null, ip, 'context_without_mac').catch(() => null);
        await audit(req, 'hotspot_mac_not_found', true, { ip, vlan_id: vlanId }, {}, 'MAC nao encontrado na tabela de vizinhanca.');
        return res.json({ authenticated: false, ip, mac: null, vlan_id: vlanId, requires_login: true, revoked });
    }

    const row = await findKnownDevice(mac);

    if (!row) {
        const revoked = await revokeActiveSessionsByDeviceMacOrIp(null, mac, ip, 'context_unknown_mac').catch(() => null);
        await audit(req, 'hotspot_mac_unknown', true, { ip, mac, vlan_id: vlanId }, {}, 'Dispositivo ainda nao cadastrado.');
        return res.json({ authenticated: false, ip, mac, vlan_id: vlanId, requires_login: true, revoked });
    }

    const visitor = { id: row.visitor_id, full_name: row.full_name, cpf: row.cpf, mac_address: row.mac_address };
    const revoked = await revokeActiveSessionsByDeviceMacOrIp(row.id, mac, ip, 'context_known_mac_requires_confirm').catch(() => null);
    await audit(
        req,
        'hotspot_mac_recognized_confirmation_required',
        true,
        { ip, mac, vlan_id: vlanId },
        { visitor_id: visitor.id, device_id: row.id, revoked },
        'Dispositivo reconhecido por MAC; confirmacao explicita exigida no portal.',
    );
    res.json({
        authenticated: false,
        recognized: true,
        requires_confirm: true,
        requires_login: false,
        ip,
        mac,
        vlan_id: vlanId,
        visitor: publicVisitor(visitor),
        revoked,
        message: `Bem-vindo, ${visitor.full_name}. Clique em Entrar na Internet para navegar.`,
    });
});

router.post('/public/continue', async (req, res) => {
    await ensureSchema();
    const ip = getClientIp(req);
    const vlanId = inferVlanId(ip);
    const mac = await inferMac(ip);

    if (!mac) {
        await audit(req, 'hotspot_continue_failed', false, { ip, vlan_id: vlanId }, {}, 'MAC nao encontrado para confirmacao de retorno.');
        return res.status(401).json({ error: 'Dispositivo não identificado. Faça login com CPF e senha.' });
    }

    const row = await findKnownDevice(mac);
    if (!row) {
        await audit(req, 'hotspot_continue_failed', false, { ip, mac, vlan_id: vlanId }, {}, 'Dispositivo nao cadastrado para confirmacao de retorno.');
        return res.status(401).json({ error: 'Dispositivo ainda não cadastrado. Faça login ou realize o primeiro acesso.' });
    }

    const visitor = { id: row.visitor_id, full_name: row.full_name, cpf: row.cpf, mac_address: row.mac_address };
    await pool.query(
        `UPDATE hotspot_sessions
            SET status = 'revoked', revoked_at = NOW(), last_seen_at = NOW()
          WHERE status = 'active'
            AND (
                device_id = $1
                OR mac_address = $2
                OR client_ip = $3::inet
            )`,
        [row.id, mac, ip || null],
    );
    await revokeHotspotIp(ip).catch(() => false);
    const session = await createSession(req, visitor, row, 'mac_confirm', ip, mac, vlanId);
    await audit(
        req,
        'hotspot_mac_confirmed',
        true,
        { ip, mac, vlan_id: vlanId },
        { visitor_id: visitor.id, device_id: row.id, session_id: session.id },
        'Dispositivo reconhecido por MAC confirmado explicitamente no portal.',
    );
    res.json({ authenticated: true, visitor: publicVisitor(visitor), ip, mac, vlan_id: vlanId, session, redirect_url: HOTSPOT_SUCCESS_REDIRECT_URL });
});

router.post('/public/register', async (req, res) => {
    await ensureSchema();
    const fullName = String(req.body.full_name || '').trim();
    const cpf = onlyDigits(req.body.cpf);
    const birthDate = String(req.body.birth_date || '').trim();
    const password = String(req.body.password || '');
    const ip = getClientIp(req);
    const vlanId = inferVlanId(ip);
    const mac = await inferMac(ip);

    if (fullName.length < 6 || cpf.length !== 11 || !birthDate || password.length < 6) {
        await audit(req, 'hotspot_register_failed', false, { cpf: cpf ? maskCpf(cpf) : null, ip, mac, vlan_id: vlanId }, {}, 'Dados obrigatorios invalidos.');
        return res.status(400).json({ error: 'Preencha nome completo, CPF, data de nascimento e senha com ao menos 6 caracteres.' });
    }

    const exists = await pool.query('SELECT id, active FROM hotspot_visitors WHERE cpf = $1 LIMIT 1', [cpf]);
    if (exists.rowCount) {
        if (exists.rows[0].active) {
            await audit(req, 'hotspot_register_failed', false, { cpf: maskCpf(cpf), ip, mac, vlan_id: vlanId }, {}, 'CPF ja cadastrado.');
            return res.status(409).json({ error: 'CPF já cadastrado. Entre com CPF e senha para associar este dispositivo.' });
        }

        const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
        const visitorResult = await pool.query(
            `UPDATE hotspot_visitors
                SET full_name = $1,
                    birth_date = $2::date,
                    password_hash = $3,
                    active = TRUE,
                    mac_address = CASE
                        WHEN $4::varchar IS NULL THEN mac_address
                        WHEN NOT EXISTS (
                            SELECT 1 FROM hotspot_visitors other
                             WHERE other.mac_address = $4::varchar
                               AND other.id <> hotspot_visitors.id
                        ) THEN $4::varchar
                        ELSE mac_address
                    END,
                    updated_at = NOW()
              WHERE id = $5
              RETURNING id, full_name, cpf, mac_address`,
            [fullName, birthDate, passwordHash, normalizeOptionalMac(mac), exists.rows[0].id],
        );
        const visitor = visitorResult.rows[0];
        const device = await upsertDevice(visitor.id, ip, mac, vlanId);
        const session = await createSession(req, visitor, device, 'reactivated_register', ip, mac, vlanId);

        await audit(req, 'hotspot_register_reactivated', true, { cpf: maskCpf(cpf), ip, mac, vlan_id: vlanId }, { visitor_id: visitor.id, device_id: device?.id, session_id: session.id }, 'Cadastro inativo do hotspot reativado pelo portal publico.');
        return res.status(200).json({ authenticated: true, visitor: publicVisitor(visitor), ip, mac, vlan_id: vlanId, session, redirect_url: HOTSPOT_SUCCESS_REDIRECT_URL });
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const visitorResult = await pool.query(
        `INSERT INTO hotspot_visitors (full_name, cpf, birth_date, mac_address, password_hash)
         VALUES ($1,$2,$3::date,$4,$5)
         RETURNING id, full_name, cpf, mac_address`,
        [fullName, cpf, birthDate, normalizeOptionalMac(mac), passwordHash],
    );
    const visitor = visitorResult.rows[0];
    const device = await upsertDevice(visitor.id, ip, mac, vlanId);
    const session = await createSession(req, visitor, device, 'first_register', ip, mac, vlanId);

    await audit(req, 'hotspot_register_success', true, { cpf: maskCpf(cpf), ip, mac, vlan_id: vlanId }, { visitor_id: visitor.id, device_id: device?.id, session_id: session.id }, 'Cadastro e sessao inicial do hotspot.');
    res.status(201).json({ authenticated: true, visitor: publicVisitor(visitor), ip, mac, vlan_id: vlanId, session, redirect_url: HOTSPOT_SUCCESS_REDIRECT_URL });
});

router.post('/public/login', async (req, res) => {
    await ensureSchema();
    const cpf = onlyDigits(req.body.cpf);
    const password = String(req.body.password || '');
    const ip = getClientIp(req);
    const vlanId = inferVlanId(ip);
    const mac = await inferMac(ip);
    const result = await pool.query('SELECT * FROM hotspot_visitors WHERE cpf = $1 AND active = TRUE LIMIT 1', [cpf]);

    if (!result.rowCount || !(await argon2.verify(result.rows[0].password_hash, password).catch(() => false))) {
        await audit(req, 'hotspot_login_failed', false, { cpf: cpf ? maskCpf(cpf) : null, ip, mac, vlan_id: vlanId }, {}, 'CPF ou senha invalidos.');
        return res.status(401).json({ error: 'CPF ou senha inválidos.' });
    }

    const visitor = result.rows[0];
    await assignVisitorMac(visitor.id, mac);
    const device = await upsertDevice(visitor.id, ip, mac, vlanId);
    const session = await createSession(req, visitor, device, 'cpf_password', ip, mac, vlanId);
    await audit(req, 'hotspot_login_success', true, { cpf: maskCpf(cpf), ip, mac, vlan_id: vlanId }, { visitor_id: visitor.id, device_id: device?.id, session_id: session.id }, 'Login do hotspot por CPF e senha.');
    res.json({ authenticated: true, visitor: publicVisitor(visitor), ip, mac, vlan_id: vlanId, session, redirect_url: HOTSPOT_SUCCESS_REDIRECT_URL });
});

router.get('/overview', requireJwt, async (_req: AuthenticatedRequest, res) => {
    await ensureSchema();
    await ensureHotspotEnforcement().catch(() => null);
    const [visitors, devices, sessions, recent, enforcement] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS total FROM hotspot_visitors WHERE active = TRUE'),
        pool.query('SELECT COUNT(*)::int AS total FROM hotspot_devices WHERE active = TRUE'),
        pool.query(`SELECT COUNT(*)::int AS total FROM hotspot_sessions WHERE status = 'active' AND expires_at > NOW()`),
        pool.query(`
            SELECT s.id, s.client_ip::text, s.mac_address, s.vlan_id, s.auth_method, s.status, s.started_at, s.expires_at,
                   v.full_name, v.cpf
              FROM hotspot_sessions s
              LEFT JOIN hotspot_visitors v ON v.id = s.visitor_id
             ORDER BY s.started_at DESC
             LIMIT 12
        `),
        readHotspotEnforcementStatus(),
    ]);
    res.json({
        totals: {
            visitors: visitors.rows[0].total,
            devices: devices.rows[0].total,
            active_sessions: sessions.rows[0].total,
        },
        enforcement,
        recent_sessions: recent.rows.map((row) => ({ ...row, cpf: row.cpf ? maskCpf(row.cpf) : null })),
    });
});

router.get('/enforcement', requireJwt, async (_req: AuthenticatedRequest, res) => {
    await ensureHotspotEnforcement();
    res.json(await readHotspotEnforcementStatus());
});

router.post('/enforcement/reconcile', requireJwt, async (req: AuthenticatedRequest, res) => {
    await ensureHotspotEnforcement();
    await institutionalAuditService.log({
        action: 'hotspot_enforcement_reconciled',
        requestedBy: req.auth?.username || 'sistema',
        actorUserId: req.auth?.id || null,
        actorIp: getClientIp(req),
        actorUserAgent: req.headers['user-agent'] || null,
        payload: { vlan_id: HOTSPOT_VLAN_ID, interface: HOTSPOT_VLAN_IFACE },
        result: await readHotspotEnforcementStatus(),
        success: true,
        message: 'Enforcement complementar do Hotspot reconciliado.',
        route: req.originalUrl,
        method: req.method,
        statusCode: 200,
    });
    res.json({ success: true, enforcement: await readHotspotEnforcementStatus() });
});

router.get('/visitors', requireJwt, async (req: AuthenticatedRequest, res) => {
    await ensureSchema();
    const includeInactive = String(req.query.include_inactive || req.query.includeInactive || '').toLowerCase() === 'true';
    const result = await pool.query(`
        SELECT v.id, v.full_name, v.cpf, v.birth_date, v.mac_address, v.active, v.created_at,
               COUNT(d.id)::int AS devices
          FROM hotspot_visitors v
          LEFT JOIN hotspot_devices d ON d.visitor_id = v.id
         WHERE ($1::boolean = TRUE OR v.active = TRUE)
         GROUP BY v.id
         ORDER BY v.created_at DESC
         LIMIT 200
    `, [includeInactive]);
    res.json({ visitors: result.rows.map((row) => adminVisitor(row)) });
});

router.get('/visitors/:id', requireJwt, async (req: AuthenticatedRequest, res) => {
    await ensureSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Visitante inválido.' });
    const result = await pool.query(
        `SELECT v.id, v.full_name, v.cpf, v.birth_date, v.mac_address, v.active, v.created_at,
                COUNT(d.id)::int AS devices
           FROM hotspot_visitors v
           LEFT JOIN hotspot_devices d ON d.visitor_id = v.id
          WHERE v.id = $1
          GROUP BY v.id
          LIMIT 1`,
        [id],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Visitante não encontrado.' });
    res.json({ visitor: adminVisitor(result.rows[0], true) });
});

router.post('/visitors', requireJwt, async (req: AuthenticatedRequest, res) => {
    await ensureSchema();
    const fullName = String(req.body.full_name || '').trim();
    const cpf = onlyDigits(req.body.cpf);
    const birthDate = String(req.body.birth_date || '').trim();
    const macAddress = normalizeOptionalMac(req.body.mac_address);
    const password = String(req.body.password || '');
    const active = req.body.active !== false;

    if (String(req.body.mac_address || '').trim() && !macAddress) {
        await auditAdmin(req, 'hotspot_visitor_create_failed', false, { cpf: cpf ? maskCpf(cpf) : null, mac_address: req.body.mac_address }, {}, 'MAC invalido.', 400);
        return res.status(400).json({ error: 'Informe o MAC no formato aa:bb:cc:dd:ee:ff.' });
    }

    if (fullName.length < 6 || cpf.length !== 11 || !isValidBirthDate(birthDate) || password.length < 6) {
        await auditAdmin(req, 'hotspot_visitor_create_failed', false, { cpf: cpf ? maskCpf(cpf) : null }, {}, 'Dados obrigatorios invalidos.', 400);
        return res.status(400).json({ error: 'Preencha nome completo, CPF, data de nascimento e senha com ao menos 6 caracteres.' });
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    try {
        const result = await pool.query(
            `INSERT INTO hotspot_visitors (full_name, cpf, birth_date, mac_address, password_hash, active)
             VALUES ($1,$2,$3::date,$4,$5,$6)
             RETURNING id, full_name, cpf, birth_date, mac_address, active, created_at, 0::int AS devices`,
            [fullName, cpf, birthDate, macAddress, passwordHash, active],
        );
        if (macAddress) await upsertDevice(Number(result.rows[0].id), null, macAddress, HOTSPOT_VLAN_ID).catch(() => null);
        await auditAdmin(req, 'hotspot_visitor_created', true, { cpf: maskCpf(cpf), active }, { visitor_id: result.rows[0].id }, 'Visitante de hotspot criado pelo SGCG.');
        res.status(201).json({ visitor: adminVisitor(result.rows[0], true) });
    } catch (error: any) {
        if (error?.code === '23505') {
            await auditAdmin(req, 'hotspot_visitor_create_failed', false, { cpf: maskCpf(cpf) }, {}, 'CPF ja cadastrado.', 409);
            return res.status(409).json({ error: 'CPF já cadastrado.' });
        }
        throw error;
    }
});

router.put('/visitors/:id', requireJwt, async (req: AuthenticatedRequest, res) => {
    await ensureSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Visitante inválido.' });
    const fullName = String(req.body.full_name || '').trim();
    const cpf = onlyDigits(req.body.cpf);
    const birthDate = String(req.body.birth_date || '').trim();
    const macAddress = normalizeOptionalMac(req.body.mac_address);
    const password = String(req.body.password || '');
    const active = req.body.active !== false;

    if (String(req.body.mac_address || '').trim() && !macAddress) {
        await auditAdmin(req, 'hotspot_visitor_update_failed', false, { visitor_id: id, cpf: cpf ? maskCpf(cpf) : null, mac_address: req.body.mac_address }, {}, 'MAC invalido.', 400);
        return res.status(400).json({ error: 'Informe o MAC no formato aa:bb:cc:dd:ee:ff.' });
    }

    if (fullName.length < 6 || cpf.length !== 11 || !isValidBirthDate(birthDate) || (password && password.length < 6)) {
        await auditAdmin(req, 'hotspot_visitor_update_failed', false, { visitor_id: id, cpf: cpf ? maskCpf(cpf) : null }, {}, 'Dados obrigatorios invalidos.', 400);
        return res.status(400).json({ error: 'Revise nome completo, CPF, data de nascimento e senha opcional com ao menos 6 caracteres.' });
    }

    const previous = await pool.query('SELECT id, cpf, active FROM hotspot_visitors WHERE id = $1 LIMIT 1', [id]);
    if (!previous.rowCount) return res.status(404).json({ error: 'Visitante não encontrado.' });

    const passwordHash = password ? await argon2.hash(password, { type: argon2.argon2id }) : null;
    try {
        const result = await pool.query(
            `UPDATE hotspot_visitors
                SET full_name = $1,
                    cpf = $2,
                    birth_date = $3::date,
                    mac_address = $4,
                    active = $5,
                    password_hash = COALESCE($6, password_hash),
                    updated_at = NOW()
              WHERE id = $7
              RETURNING id, full_name, cpf, birth_date, mac_address, active, created_at,
                        (SELECT COUNT(*)::int FROM hotspot_devices d WHERE d.visitor_id = hotspot_visitors.id) AS devices`,
            [fullName, cpf, birthDate, macAddress, active, passwordHash, id],
        );
        if (macAddress) await upsertDevice(id, null, macAddress, HOTSPOT_VLAN_ID).catch(() => null);
        if (!active && previous.rows[0].active) {
            await pool.query(`UPDATE hotspot_devices SET active = FALSE WHERE visitor_id = $1`, [id]);
            const sessions = await pool.query(
                `UPDATE hotspot_sessions
                    SET status = 'revoked', revoked_at = NOW(), last_seen_at = NOW()
                  WHERE visitor_id = $1 AND status = 'active'
                  RETURNING host(client_ip) AS client_ip`,
                [id],
            );
            await revokeRuntimeIps(sessions.rows);
        }
        await auditAdmin(req, 'hotspot_visitor_updated', true, { visitor_id: id, cpf: maskCpf(cpf), active, password_changed: !!passwordHash }, { visitor_id: id }, 'Visitante de hotspot atualizado pelo SGCG.');
        res.json({ visitor: adminVisitor(result.rows[0], true) });
    } catch (error: any) {
        if (error?.code === '23505') {
            await auditAdmin(req, 'hotspot_visitor_update_failed', false, { visitor_id: id, cpf: maskCpf(cpf) }, {}, 'CPF ja cadastrado.', 409);
            return res.status(409).json({ error: 'CPF já cadastrado em outro visitante.' });
        }
        throw error;
    }
});

router.delete('/visitors/:id', requireJwt, async (req: AuthenticatedRequest, res) => {
    await ensureSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Visitante inválido.' });
    const visitor = await pool.query('SELECT id, cpf FROM hotspot_visitors WHERE id = $1 LIMIT 1', [id]);
    if (!visitor.rowCount) return res.status(404).json({ error: 'Visitante não encontrado.' });

    await pool.query(`UPDATE hotspot_visitors SET active = FALSE, updated_at = NOW() WHERE id = $1`, [id]);
    await pool.query(`UPDATE hotspot_devices SET active = FALSE WHERE visitor_id = $1`, [id]);
    const sessions = await pool.query(
        `UPDATE hotspot_sessions
            SET status = 'revoked', revoked_at = NOW(), last_seen_at = NOW()
          WHERE visitor_id = $1 AND status = 'active'
          RETURNING host(client_ip) AS client_ip`,
        [id],
    );
    await revokeRuntimeIps(sessions.rows);
    await auditAdmin(req, 'hotspot_visitor_deleted', true, { visitor_id: id, cpf: maskCpf(visitor.rows[0].cpf) }, { revoked_sessions: sessions.rowCount }, 'Visitante de hotspot desativado pelo SGCG.');
    res.json({ success: true, revoked_sessions: sessions.rowCount });
});

router.get('/sessions', requireJwt, async (_req: AuthenticatedRequest, res) => {
    await ensureSchema();
    const result = await pool.query(`
        SELECT s.id, s.client_ip::text, s.mac_address, s.vlan_id, s.auth_method, s.status, s.started_at, s.last_seen_at, s.expires_at,
               v.full_name, v.cpf
          FROM hotspot_sessions s
          LEFT JOIN hotspot_visitors v ON v.id = s.visitor_id
         ORDER BY s.started_at DESC
         LIMIT 300
    `);
    res.json({ sessions: result.rows.map((row) => ({ ...row, cpf: row.cpf ? maskCpf(row.cpf) : null })) });
});

router.post('/sessions/:id/revoke', requireJwt, async (req: AuthenticatedRequest, res) => {
    await ensureSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Sessão inválida.' });
    const result = await pool.query(
        `UPDATE hotspot_sessions
            SET status = 'revoked', revoked_at = NOW(), last_seen_at = NOW()
          WHERE id = $1
          RETURNING id, visitor_id, device_id, mac_address, host(client_ip) AS client_ip, vlan_id`,
        [id],
    );
    let relatedRevoked = 0;
    let revokedRuntimeIps = 0;
    if (result.rowCount) {
        const session = result.rows[0];
        const related = await pool.query(
            `UPDATE hotspot_sessions
                SET status = 'revoked', revoked_at = NOW(), last_seen_at = NOW()
              WHERE id <> $1
                AND status = 'active'
                AND (
                    ($2::bigint IS NOT NULL AND device_id = $2::bigint)
                    OR ($3::text IS NOT NULL AND mac_address = $3::text)
                    OR ($4::inet IS NOT NULL AND client_ip = $4::inet)
                )
              RETURNING host(client_ip) AS client_ip`,
            [id, session.device_id || null, session.mac_address || null, session.client_ip || null],
        );
        relatedRevoked = related.rowCount || 0;
        revokedRuntimeIps = await revokeRuntimeIps([session, ...related.rows]);
    }
    await institutionalAuditService.log({
        action: 'hotspot_session_revoked',
        requestedBy: req.auth?.username || 'sistema',
        actorUserId: req.auth?.id || null,
        actorIp: getClientIp(req),
        actorUserAgent: req.headers['user-agent'] || null,
        payload: { session_id: id },
        result: result.rowCount ? { ...result.rows[0], related_revoked: relatedRevoked, runtime_ips_revoked: revokedRuntimeIps, mac_auto_preserved: false, confirmation_required: true } : {},
        success: !!result.rowCount,
        message: result.rowCount ? 'Sessao de hotspot revogada.' : 'Sessao de hotspot nao encontrada.',
        route: req.originalUrl,
        method: req.method,
        statusCode: result.rowCount ? 200 : 404,
    });
    if (!result.rowCount) return res.status(404).json({ error: 'Sessão não encontrada.' });
    res.json({ success: true, runtime_revoked: revokedRuntimeIps > 0, related_revoked: relatedRevoked, mac_auto_preserved: false, confirmation_required: true, session: result.rows[0] });
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
                       COUNT(DISTINCT visitor_id) AS unique_visitors
                FROM hotspot_sessions
                WHERE started_at >= NOW() - INTERVAL '30 days'
                GROUP BY DATE(started_at)
                ORDER BY date DESC
            `),
            pool.query(`
                SELECT COUNT(*) AS total_sessions,
                       COUNT(DISTINCT visitor_id) AS unique_visitors,
                       COUNT(DISTINCT DATE(started_at)) AS active_days,
                       COUNT(DISTINCT CASE WHEN started_at >= DATE_TRUNC('month', NOW()) THEN visitor_id END) AS monthly_unique
                FROM hotspot_sessions
                WHERE started_at >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
            `),
            pool.query(`
                SELECT v.full_name, v.cpf, COUNT(s.id) AS sessions,
                       MAX(s.started_at) AS last_seen
                FROM hotspot_sessions s
                JOIN hotspot_visitors v ON v.id = s.visitor_id
                WHERE s.started_at >= NOW() - INTERVAL '30 days'
                GROUP BY v.id, v.full_name, v.cpf
                ORDER BY sessions DESC
                LIMIT 10
            `),
            pool.query(`
                SELECT auth_method, COUNT(*) AS count
                FROM hotspot_sessions
                WHERE started_at >= NOW() - INTERVAL '30 days'
                GROUP BY auth_method
                ORDER BY count DESC
            `),
            pool.query(`
                SELECT COALESCE(vlan_id::text, 'n/d') AS vlan_id, COUNT(*) AS count
                FROM hotspot_sessions
                WHERE started_at >= NOW() - INTERVAL '30 days'
                GROUP BY vlan_id
                ORDER BY count DESC
            `),
            pool.query(`
                SELECT EXTRACT(HOUR FROM started_at)::int AS hour,
                       COUNT(*) AS count
                FROM hotspot_sessions
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
                  AND client_ip::text LIKE '192.168.70.%'
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
            top_users: topUsersRows.rows.map((r) => ({ ...r, cpf: maskCpf(r.cpf) })),
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
            INSERT INTO hotspot_access_log
                (session_id, visitor_id, visitor_name, cpf_masked, client_ip,
                 mac_address, vlan_id, auth_method, session_started_at, session_ended_at,
                 duration_seconds, logged_at)
            SELECT
                s.id,
                s.visitor_id,
                v.full_name,
                REGEXP_REPLACE(COALESCE(v.cpf,''), '(\\d{3})(\\d{3})(\\d{3})(\\d{2})', '\\1.***.***-\\4'),
                s.client_ip,
                s.mac_address,
                s.vlan_id,
                s.auth_method,
                s.started_at,
                COALESCE(s.revoked_at, s.last_seen_at),
                GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s.revoked_at, s.last_seen_at) - s.started_at))::int),
                NOW()
            FROM hotspot_sessions s
            LEFT JOIN hotspot_visitors v ON v.id = s.visitor_id
            WHERE s.id NOT IN (
                SELECT session_id FROM hotspot_access_log WHERE session_id IS NOT NULL
            )
            RETURNING id
        `);
        // Popula top_domain a partir do dns_policy_events para os registros recém-inseridos
        await pool.query(`
            UPDATE hotspot_access_log hal
            SET top_domain = (
                SELECT dpe.query_name
                FROM dns_policy_events dpe
                WHERE dpe.client_ip = hal.client_ip
                  AND dpe.occurred_at >= hal.session_started_at
                  AND dpe.occurred_at <= COALESCE(hal.session_ended_at, hal.session_started_at + INTERVAL '12 hours')
                  AND dpe.action != 'blocked'
                  AND dpe.query_name IS NOT NULL
                  AND dpe.query_name != '-'
                  ${noiseFilterDpe}
                GROUP BY dpe.query_name
                ORDER BY COUNT(*) DESC
                LIMIT 1
            )
            WHERE hal.top_domain IS NULL
              AND hal.client_ip IS NOT NULL
              AND hal.session_started_at IS NOT NULL
        `).catch(() => null);

        await auditAdmin(req, 'hotspot_access_log_sync', true, {}, { inserted: result.rowCount }, 'Log de acesso do hotspot sincronizado.');
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
        const visitorId = req.query.visitor_id ? Number(req.query.visitor_id) : null;
        const vlanId = req.query.vlan_id ? Number(req.query.vlan_id) : null;

        const conditions: string[] = [];
        const params: unknown[] = [];
        if (from) { conditions.push(`s.started_at >= $${params.length + 1}::date`); params.push(from); }
        if (to) { conditions.push(`s.started_at < ($${params.length + 1}::date + INTERVAL '1 day')`); params.push(to); }
        if (visitorId && Number.isFinite(visitorId)) { conditions.push(`s.visitor_id = $${params.length + 1}`); params.push(visitorId); }
        if (vlanId && Number.isFinite(vlanId)) { conditions.push(`s.vlan_id = $${params.length + 1}`); params.push(vlanId); }
        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

        const [summary, missingLogs, duplicateLogs, identityGaps, ipGaps, durationIssues, staleLogs, domainGaps] = await Promise.all([
            pool.query(`
                SELECT COUNT(*)::int AS total_sessions,
                       COUNT(*) FILTER (WHERE al.session_id IS NOT NULL)::int AS logged_sessions,
                       COUNT(DISTINCT s.visitor_id)::int AS unique_visitors
                FROM hotspot_sessions s
                LEFT JOIN hotspot_access_log al ON al.session_id = s.id
                ${where}
            `, params),
            pool.query(`
                SELECT s.id, s.started_at, host(s.client_ip) AS client_ip, s.vlan_id
                FROM hotspot_sessions s
                LEFT JOIN hotspot_access_log al ON al.session_id = s.id
                ${where}
                  ${where ? 'AND' : 'WHERE'} al.session_id IS NULL
                ORDER BY s.started_at DESC
                LIMIT 25
            `, params),
            pool.query(`
                SELECT al.session_id, COUNT(*)::int AS copies
                FROM hotspot_access_log al
                JOIN hotspot_sessions s ON s.id = al.session_id
                ${where}
                GROUP BY al.session_id
                HAVING COUNT(*) > 1
                ORDER BY copies DESC
                LIMIT 25
            `, params),
            pool.query(`
                SELECT s.id, s.visitor_id, host(s.client_ip) AS client_ip, s.started_at
                FROM hotspot_sessions s
                LEFT JOIN hotspot_visitors v ON v.id = s.visitor_id
                ${where}
                  ${where ? 'AND' : 'WHERE'} (s.visitor_id IS NULL OR v.id IS NULL OR v.full_name IS NULL OR v.cpf IS NULL)
                ORDER BY s.started_at DESC
                LIMIT 25
            `, params),
            pool.query(`
                SELECT s.id, s.visitor_id, s.started_at
                FROM hotspot_sessions s
                ${where}
                  ${where ? 'AND' : 'WHERE'} s.client_ip IS NULL
                ORDER BY s.started_at DESC
                LIMIT 25
            `, params),
            pool.query(`
                SELECT s.id, s.started_at, COALESCE(s.revoked_at, s.last_seen_at) AS ended_at
                FROM hotspot_sessions s
                ${where}
                  ${where ? 'AND' : 'WHERE'} COALESCE(s.revoked_at, s.last_seen_at) < s.started_at
                ORDER BY s.started_at DESC
                LIMIT 25
            `, params),
            pool.query(`
                SELECT s.id,
                       GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s.revoked_at, s.last_seen_at) - s.started_at))::int) AS computed_duration,
                       al.duration_seconds AS logged_duration
                FROM hotspot_sessions s
                JOIN hotspot_access_log al ON al.session_id = s.id
                ${where}
                  ${where ? 'AND' : 'WHERE'} ABS(COALESCE(al.duration_seconds, -1) - GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s.revoked_at, s.last_seen_at) - s.started_at))::int)) > 60
                ORDER BY s.started_at DESC
                LIMIT 25
            `, params),
            pool.query(`
                SELECT s.id, host(s.client_ip) AS client_ip, s.started_at
                FROM hotspot_sessions s
                LEFT JOIN hotspot_access_log al ON al.session_id = s.id
                ${where}
                  ${where ? 'AND' : 'WHERE'} COALESCE(al.top_domain, '') = ''
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
            { key: 'identity_gaps', label: 'Sessões sem visitante íntegro', severity: 'critical', count: identityGaps.rowCount || 0, rows: identityGaps.rows },
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
            scope: { from, to, visitor_id: visitorId, vlan_id: vlanId || HOTSPOT_VLAN_ID },
            summary: {
                total_sessions: Number(summary.rows[0]?.total_sessions || 0),
                logged_sessions: Number(summary.rows[0]?.logged_sessions || 0),
                unique_visitors: Number(summary.rows[0]?.unique_visitors || 0),
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
        const visitorId = req.query.visitor_id ? Number(req.query.visitor_id) : null;
        const vlanId = req.query.vlan_id ? Number(req.query.vlan_id) : null;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(1000, Math.max(10, Number(req.query.limit) || 100));
        const offset = (page - 1) * limit;

        const conditions: string[] = [];
        const params: unknown[] = [];

        if (from) { conditions.push(`s.started_at >= $${params.length + 1}::date`); params.push(from); }
        if (to) { conditions.push(`s.started_at < ($${params.length + 1}::date + INTERVAL '1 day')`); params.push(to); }
        if (visitorId && Number.isFinite(visitorId)) { conditions.push(`s.visitor_id = $${params.length + 1}`); params.push(visitorId); }
        if (vlanId && Number.isFinite(vlanId)) { conditions.push(`s.vlan_id = $${params.length + 1}`); params.push(vlanId); }

        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
        const baseParams = [...params];

        const [rows, countRes, summaryRes] = await Promise.all([
            pool.query(`
                SELECT
                    s.id,
                    TO_CHAR(s.started_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') AS date_fmt,
                    TO_CHAR(s.started_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI:SS') AS hour_fmt,
                    s.client_ip::text AS client_ip,
                    s.mac_address,
                    s.vlan_id,
                    s.auth_method,
                    s.status,
                    COALESCE(v.full_name, 'N/I') AS visitor_name,
                    COALESCE(
                        REGEXP_REPLACE(v.cpf, '(\\d{3})(\\d{3})(\\d{3})(\\d{2})', '\\1.***.***-\\4'),
                        'N/I'
                    ) AS cpf_masked,
                    GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s.revoked_at, s.last_seen_at) - s.started_at))::int) AS duration_seconds,
                    COALESCE(al.top_domain, (
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
                    COALESCE(al.bytes_up, 0) AS bytes_up,
                    COALESCE(al.bytes_down, 0) AS bytes_down
                FROM hotspot_sessions s
                LEFT JOIN hotspot_visitors v ON v.id = s.visitor_id
                LEFT JOIN hotspot_access_log al ON al.session_id = s.id
                ${where}
                ORDER BY s.started_at DESC
                LIMIT $${params.length + 1} OFFSET $${params.length + 2}
            `, [...params, limit, offset]),
            pool.query(`SELECT COUNT(*)::int AS total FROM hotspot_sessions s ${where}`, baseParams),
            pool.query(`
                SELECT
                    COUNT(*)::int AS total_sessions,
                    COUNT(DISTINCT s.visitor_id)::int AS unique_visitors,
                    COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s.revoked_at, s.last_seen_at) - s.started_at))::int)), 0)::bigint AS total_seconds
                FROM hotspot_sessions s ${where}
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

export const hotspotSchemaService = { ensureSchema, ensureHotspotEnforcement, ensureAccessLogSchema, expireExpiredSessions };
export default router;
