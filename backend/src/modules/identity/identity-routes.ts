import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';

const router = Router();
const dataDir = path.join(env.projectRoot, 'data', 'identity');
const checkinsFile = path.join(dataDir, 'checkins.jsonl');
const latestFile = path.join(dataDir, 'latest.json');
const tokenHashFile = path.join(dataDir, 'agent-token.sha256');

const expectedToken = process.env.SGCG_AGENT_TOKEN || '';
const expectedTokenHash = process.env.SGCG_AGENT_TOKEN_SHA256 || '';

const ensureDataDir = () => {
    fs.mkdirSync(dataDir, { recursive: true });
};

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const readStoredTokenHash = () => {
    try {
        return fs.readFileSync(tokenHashFile, 'utf8').trim();
    } catch {
        return '';
    }
};

const writeStoredTokenHash = (token: string) => {
    ensureDataDir();
    fs.writeFileSync(tokenHashFile, `${sha256(token)}\n`, { encoding: 'utf8', mode: 0o600 });
};

const normalizeRemoteIp = (value: string) => value.replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');

const isLanRemote = (value: string) => {
    const ip = normalizeRemoteIp(value);
    return ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
};

const hasPlausibleIdentityPayload = (payload: any) => {
    return String(payload?.source || '') === 'sgcg-endpoint-identity-service'
        && Boolean(String(payload?.agent_id || '').trim())
        && Boolean(String(payload?.computer || '').trim());
};

const isValidAgentToken = (token: string) => {
    if (!token) return false;
    if (expectedToken) return token === expectedToken;

    const configuredHash = expectedTokenHash || readStoredTokenHash();
    if (!configuredHash) return false;
    return sha256(token) === configuredHash;
};

const tryRecoverAgentToken = (token: string, payload: any, req: Request) => {
    if (!token || expectedToken || expectedTokenHash || readStoredTokenHash()) return false;
    const remoteIp = req.ip || req.socket.remoteAddress || '';
    if (!isLanRemote(remoteIp) || !hasPlausibleIdentityPayload(payload)) return false;

    writeStoredTokenHash(token);
    return true;
};

const normalize = (payload: any, req: Request) => ({
    received_at: new Date().toISOString(),
    remote_ip: req.ip || req.socket.remoteAddress || '',
    agent_id: String(payload?.agent_id || ''),
    user: String(payload?.user || ''),
    display_user: String(payload?.display_user || ''),
    computer: String(payload?.computer || ''),
    ip: String(payload?.ip || ''),
    mac: String(payload?.mac || ''),
    vlan: String(payload?.vlan || 'unknown'),
    logged: Boolean(payload?.logged),
    source: String(payload?.source || 'sgcg-endpoint-identity-service'),
    agent_version: String(payload?.agent_version || ''),
    checked_at: String(payload?.checked_at || ''),
});

const upsertLatest = (checkin: ReturnType<typeof normalize>) => {
    let latest: Record<string, ReturnType<typeof normalize>> = {};
    try {
        latest = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
    } catch {
        latest = {};
    }
    const key = checkin.agent_id || checkin.computer || checkin.ip || checkin.remote_ip;
    latest[key] = checkin;
    fs.writeFileSync(latestFile, JSON.stringify(latest, null, 2));
};

router.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'sgcg-endpoint-identity', path: '/api/identity/checkin' });
});

router.post('/checkin', (req: Request, res: Response) => {
    const token = req.header('X-Agent-Token') || '';
    if (!isValidAgentToken(token) && !tryRecoverAgentToken(token, req.body, req)) {
        if (!expectedToken && !expectedTokenHash && !readStoredTokenHash()) {
            return res.status(503).json({ ok: false, error: 'agent_token_not_configured' });
        }
        return res.status(401).json({ ok: false, error: 'invalid_agent_token' });
    }

    try {
        ensureDataDir();
        const checkin = normalize(req.body, req);
        fs.appendFileSync(checkinsFile, `${JSON.stringify(checkin)}\n`);
        upsertLatest(checkin);
        return res.json({ ok: true, received_at: checkin.received_at });
    } catch (error: any) {
        return res.status(500).json({ ok: false, error: error?.message || 'identity_checkin_failed' });
    }
});

router.get('/latest', (_req: Request, res: Response) => {
    try {
        const latest = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
        res.json({ ok: true, devices: Object.values(latest) });
    } catch {
        res.json({ ok: true, devices: [] });
    }
});

export default router;
