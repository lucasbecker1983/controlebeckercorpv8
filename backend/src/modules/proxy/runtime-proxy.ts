import https from 'https';
import { URL } from 'url';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { getClientIp } from '../../utils/request-context';

const proxyablePrefixes = [
    '/api/bloqueios-liberacoes',
    '/api/data-governance',
    '/api/proxy',
    '/api/cert',
    '/api/dns/radar',
    '/api/dns/stats',
    '/api/dns/status',
    '/api/dns/vlan-summary',
    '/api/dns/listas',
    '/api/dns/top-blocked',
    '/api/dns/restart-logger',
    '/api/dns/reload-rules',
    '/api/dns/cleanup',
    '/api/dns/whitelist',
    '/api/dns/vip',
];

const proxyLocalRoutes = ['/api/proxy/stats', '/api/proxy/logs'];
const proxyAgent = new https.Agent({
    keepAlive: true,
    rejectUnauthorized: false,
});

const shouldProxy = (path: string) =>
    !proxyLocalRoutes.some((local) => path === local || path.startsWith(`${local}/`)) &&
    proxyablePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

const sanitizeHeaders = (req: Request & { auth?: { id?: number; username?: string } }, bodyBuffer?: Buffer) => {
    const headers: Record<string, string> = {};
    const forwardable = ['authorization', 'content-type', 'accept', 'user-agent', 'cookie'];

    for (const headerName of forwardable) {
        const value = req.headers[headerName];
        if (typeof value === 'string' && value.length > 0) {
            headers[headerName] = value;
        }
    }

    const clientIp = getClientIp(req);
    if (req.auth?.username) headers['x-user'] = req.auth.username;
    if (req.auth?.id) headers['x-user-id'] = String(req.auth.id);
    if (clientIp) headers['x-client-ip'] = clientIp;
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
        headers['x-forwarded-for'] = forwardedFor;
    } else if (clientIp) {
        headers['x-forwarded-for'] = clientIp;
    }

    if (bodyBuffer) {
        headers['content-length'] = String(bodyBuffer.length);
    }

    return headers;
};

const finishWithProxyError = (res: Response, message: string) => {
    if (res.writableEnded) return;

    if (res.headersSent) {
        res.end();
        return;
    }

    res.status(502).json({ error: message });
};

export const runtimeProxyMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (!shouldProxy(req.path)) {
        return next();
    }

    const targetUrl = new URL(req.originalUrl, env.proxyRuntimeBaseUrl);
    const bodyBuffer = ['GET', 'HEAD'].includes(req.method)
        ? undefined
        : Buffer.from(JSON.stringify(req.body ?? {}));

    const proxyReq = https.request({
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || 443,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        method: req.method,
        headers: sanitizeHeaders(req, bodyBuffer),
        agent: proxyAgent,
        servername: env.appDomain,
    }, (proxyRes) => {
        res.status(proxyRes.statusCode || 502);

        for (const [headerName, headerValue] of Object.entries(proxyRes.headers)) {
            if (headerValue === undefined) continue;
            if (['connection', 'keep-alive', 'transfer-encoding'].includes(headerName.toLowerCase())) continue;
            res.setHeader(headerName, headerValue as string | string[]);
        }

        proxyRes.on('error', (error) => {
            finishWithProxyError(res, `Falha ao ler resposta do backend-proxy: ${error.message}`);
        });

        proxyRes.pipe(res);
    });

    proxyReq.setTimeout(20000, () => {
        proxyReq.destroy(new Error('Timeout ao acessar backend-proxy.'));
    });

    proxyReq.on('error', (error) => {
        finishWithProxyError(res, `Falha ao acessar backend-proxy: ${error.message}`);
    });

    res.on('close', () => {
        if (!proxyReq.destroyed) {
            proxyReq.destroy();
        }
    });

    if (bodyBuffer) {
        proxyReq.write(bodyBuffer);
    }

    proxyReq.end();
};
