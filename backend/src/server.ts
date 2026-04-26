import express from 'express';
import cors from 'cors';
import fs from 'fs';
import helmet from 'helmet';
import { env } from './config/env';
import { globalJwtGuard } from './middleware/auth';
import { authSecurityService } from './modules/auth/auth-security-service';

// Rotas Modernas (Modules)
import authRoutes from './modules/auth/auth-routes';
import dashboardRoutes from './modules/dashboard/dashboard-routes';
import serverRoutes from './modules/server/server-routes';
import backupRoutes from './modules/backups/backups-routes';
import controlRoutes from './modules/control/control-routes';
import usersRoutes from './modules/users/users-routes';
import networkRoutes from './modules/network/network-routes';
import qosRoutes from './modules/qos/qos-routes';
import accessRoutes from './modules/access/access-routes';
import connectivityRoutes from './modules/connectivity/connectivity-routes';
import downtimeRoutes from './modules/connectivity/downtime-routes';
import unboundRoutes from './modules/unbound/routes';
import proxyRoutes from './modules/proxy/proxy-routes';
import securityRoutes from './modules/security/security-routes';
import lgpdRoutes from './modules/lgpd/lgpd-routes';
import { runtimeProxyMiddleware } from './modules/proxy/runtime-proxy';

import vlanScheduleRoutes from "./modules/network/vlan-schedule-routes";

// Monitores
import { startCftvRetentionMonitor } from './modules/cftv/cftv-monitor';
import { startMonitor } from './modules/control/monitor';
import { startBackupScanner } from './modules/backups/backup-monitor';
import { startLinkMonitor } from './modules/connectivity/downtime-monitor';

const app = express();
const PORT = env.corePort;

app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'", env.appBaseUrl, env.proxyRuntimeBaseUrl],
            imgSrc: ["'self'", 'data:', 'blob:'],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            frameAncestors: ["'self'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
}));
app.use(cors({
    origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((item) => item.trim()),
    credentials: true,
}));
app.use(express.json());

app.use((req, res, next) => {
    if (!req.url.includes('/ping')) console.log(`[API] ${req.method} ${req.url}`);
    next();
});
app.use(globalJwtGuard);
app.use(runtimeProxyMiddleware);

// Mapeamento de Rotas
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/server', serverRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/control', controlRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/qos', qosRoutes);
app.use('/api/access', accessRoutes);
app.use('/api/connectivity', connectivityRoutes);
app.use('/api/downtime', downtimeRoutes);
app.use('/api/dns', unboundRoutes);
app.use('/api/proxy', proxyRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/lgpd', lgpdRoutes);

app.use("/api/vlans", vlanScheduleRoutes);

// Rota de Healthcheck (Ajustada para HTTP)
app.get('/api/ping', (req, res) => res.json({ msg: 'Pong HTTP (Core 6778)' }));

// Motor HTTP Puro e Leve (Terminação SSL via Nginx)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`>>> BACKEND CORE ONLINE: ${PORT} (HTTP Interno)`);
    authSecurityService.ensureSchema().catch((error) => {
        console.error('[AUTH] Falha ao garantir schema de autenticacao:', error);
    });
    // Iniciando Sentinelas
    try { startMonitor(); } catch(e) {}
    try { startBackupScanner(); } catch(e) {}
    try { startLinkMonitor(); } catch(e) {}
    try { startCftvRetentionMonitor(); } catch(e) {}
});
