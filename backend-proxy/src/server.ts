// =============================================================================
// BeckerCorp v8 — backend-proxy/src/server.ts
// =============================================================================
import express from 'express';
import backupRoutes from './routes/backup-routes';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { env } from './config/env';
import { requireJwt } from './middleware/auth';
import { proxyEngineService } from './services/proxy-module';
import proxyRoutes from './routes/proxy-routes';
import auditRoutes from './routes/audit-routes';
import engineRoutes from './routes/engine-routes';
import dnsRoutes from './routes/dns-routes';
import vipRoutes from './routes/vip-routes';
import whitelistRoutes from './routes/whitelist-routes';
import blockingReleaseRoutes from './routes/blocking-release-routes';
import dataGovernanceRoutes from './routes/data-governance-routes';
import { blockingReleaseService } from './services/blocking-release-service';
import { dnsContingencyService } from './services/dns-contingency-service';
import { dnsRadarService } from './services/dns-radar-service';

const app = express();
const PORT = env.proxyPort;
const allowedOrigins = env.corsOrigin === '*'
    ? ['*']
    : env.corsOrigin.split(',').map((item) => item.trim()).filter(Boolean);

const parseOrigin = (value: string | undefined | null) => {
    if (!value) return null;
    try {
        return new URL(value);
    } catch {
        return null;
    }
};

const isOriginAllowed = (requestOrigin: string | undefined) => {
    if (!requestOrigin) return false;
    if (allowedOrigins[0] === '*') return true;
    if (allowedOrigins.includes(requestOrigin)) return true;

    const requestUrl = parseOrigin(requestOrigin);
    if (!requestUrl) return false;

    return allowedOrigins.some((origin) => {
        const allowedUrl = parseOrigin(origin);
        if (!allowedUrl) return false;
        return allowedUrl.protocol === requestUrl.protocol && allowedUrl.hostname === requestUrl.hostname;
    });
};

const corsOptions = {
    origin: true,
    preflightContinue: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'Origin', 'X-Requested-With', 'X-User', 'X-User-Id', 'X-Client-Ip'],
    exposedHeaders: ['Content-Disposition'],
};

app.use(cors(corsOptions));
app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;
    const allowOrigin = requestOrigin || (allowedOrigins[0] === '*' ? '*' : allowedOrigins[0]);

    if (allowOrigin) {
        res.header('Access-Control-Allow-Origin', allowOrigin);
    }
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Authorization,Content-Type,Accept,Origin,X-Requested-With,X-User,X-User-Id,X-Client-Ip');
    res.header('Access-Control-Expose-Headers', 'Content-Disposition');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});
app.use(express.json());

app.use((req, res, next) => {
    console.log(`[PROXY] ${req.method} ${req.url}`);
    next();
});
app.use(requireJwt);

// Rotas
app.use('/api/proxy', proxyRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/proxy/audit', auditRoutes);
app.use('/api/proxy/engine', engineRoutes);

app.use('/sarg', express.static(env.sargDir));
app.use('/proxy', proxyRoutes);
app.use('/', proxyRoutes);

const downloadCertificateAlias = async (_req: any, res: any) => {
    try {
        const certificate = await proxyEngineService.certificateService.ensureActiveCertificate();
        res.download(certificate.file_path, 'certificado_becker_proxy.der');
    } catch (error: any) {
        res.status(404).json({ error: error.message || 'Certificado não encontrado.' });
    }
};
app.get('/api/cert/download', downloadCertificateAlias);
app.get('/cert/download', downloadCertificateAlias);

// DNS Filter
app.use('/api/dns/vip', vipRoutes);
app.use('/api/dns/whitelist', whitelistRoutes);
app.use('/api/dns', dnsRoutes);
app.use('/api/bloqueios-liberacoes', blockingReleaseRoutes);
app.use('/api/data-governance', dataGovernanceRoutes);

const options = {
    key: fs.readFileSync(env.letsencryptPrivkey),
    cert: fs.readFileSync(env.letsencryptFullchain)
};
https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
    console.log('[PROXY API] Rodando com HTTPS na porta ' + PORT);
    proxyEngineService.bootstrap().catch((error) => {
        console.error('[PROXY API] Falha no bootstrap do módulo Proxy & Logs:', error);
    });
    blockingReleaseService.syncTelemetry().catch((error) => {
        console.error('[PROXY API] Falha no bootstrap de Bloqueios e Liberações:', error);
    });
    dnsContingencyService.bootstrap().catch((error) => {
        console.error('[PROXY API] Falha no bootstrap da Contingência DNS:', error);
    });
    dnsRadarService.ensureRunning().catch((error) => {
        console.error('[PROXY API] Falha no bootstrap do Radar DNS real:', error);
    });
});
