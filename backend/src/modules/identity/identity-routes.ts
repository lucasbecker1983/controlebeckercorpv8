import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';

const router = Router();
const dataDir = path.join(env.projectRoot, 'data', 'identity');
const checkinsFile = path.join(dataDir, 'checkins.jsonl');
const latestFile = path.join(dataDir, 'latest.json');

const expectedToken = process.env.SGCG_AGENT_TOKEN || '';

const ensureDataDir = () => {
    fs.mkdirSync(dataDir, { recursive: true });
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
    const token = req.header('X-Agent-Token');
    if (!expectedToken) {
        return res.status(503).json({ ok: false, error: 'agent_token_not_configured' });
    }
    if (!expectedToken || token !== expectedToken) {
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
