import type { Request } from 'express';

const firstHeaderValue = (value: unknown) => {
    if (Array.isArray(value)) return String(value[0] || '').trim();
    return String(value || '').split(',')[0].trim();
};

const normalizeIp = (value: string) => value
    .replace(/^::ffff:/, '')
    .replace(/^::1$/, '127.0.0.1')
    .trim();

export const getClientIp = (req: Request) => {
    const candidates = [
        firstHeaderValue(req.headers['x-client-ip']),
        firstHeaderValue(req.headers['x-real-ip']),
        firstHeaderValue(req.headers['x-forwarded-for']),
        req.ip || '',
        req.socket.remoteAddress || '',
    ].map(normalizeIp).filter(Boolean);

    return candidates.find((ip) => ip !== '127.0.0.1') || candidates[0] || '';
};

export const getUserAgent = (req: Request) => String(req.headers['user-agent'] || '');

export const getRequestActor = (req: Request & { auth?: any }) => ({
    username: req.auth?.username || null,
    userId: req.auth?.id ? Number(req.auth.id) : null,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
});
