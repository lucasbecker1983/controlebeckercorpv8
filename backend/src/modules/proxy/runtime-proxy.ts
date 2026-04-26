import https from 'https';
import { URL } from 'url';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';

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

const shouldProxy = (path: string) => proxyablePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

const sanitizeHeaders = (req: Request, bodyBuffer?: Buffer) => {
    const headers: Record<string, string> = {};
    const forwardable = ['authorization', 'content-type', 'accept', 'x-user', 'user-agent', 'cookie'];

    for (const headerName of forwardable) {
        const value = req.headers[headerName];
        if (typeof value === 'string' && value.length > 0) {
            headers[headerName] = value;
        }
    }

    if (bodyBuffer) {
        headers['content-length'] = String(bodyBuffer.length);
    }

    return headers;
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
        port: targetUrl.port,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        method: req.method,
        headers: sanitizeHeaders(req, bodyBuffer),
    }, (proxyRes) => {
        res.status(proxyRes.statusCode || 502);

        for (const [headerName, headerValue] of Object.entries(proxyRes.headers)) {
            if (headerValue === undefined) continue;
            if (['connection', 'keep-alive', 'transfer-encoding'].includes(headerName.toLowerCase())) continue;
            res.setHeader(headerName, headerValue as string | string[]);
        }

        proxyRes.pipe(res);
    });

    proxyReq.on('error', (error) => {
        if (!res.headersSent) {
            res.status(502).json({ error: `Falha ao acessar backend-proxy: ${error.message}` });
        }
    });

    if (bodyBuffer) {
        proxyReq.write(bodyBuffer);
    }

    proxyReq.end();
};
