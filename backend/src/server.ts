import express from 'express';
import cors from 'cors';
import fs from 'fs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
import { qosRuntimeService, qosSchemaService } from './modules/qos/qos-routes';
import accessRoutes from './modules/access/access-routes';
import connectivityRoutes from './modules/connectivity/connectivity-routes';
import downtimeRoutes from './modules/connectivity/downtime-routes';
import unboundRoutes from './modules/unbound/routes';
import proxyRoutes from './modules/proxy/proxy-routes';
import securityRoutes from './modules/security/security-routes';
import lgpdRoutes from './modules/lgpd/lgpd-routes';
import reportsRoutes from './modules/reports/reports-routes';
import identityRoutes from './modules/identity/identity-routes';
import hotspotRoutes, { hotspotSchemaService } from './modules/hotspot/hotspot-routes';
import collaboratorsRoutes, { collaboratorsSchemaService } from './modules/collaborators/collaborators-routes';
import supportRoutes, { supportSchemaService } from './modules/support/support-routes';
import { runtimeProxyMiddleware } from './modules/proxy/runtime-proxy';
import { institutionalAuditMiddleware } from './modules/institutional/institutional-audit-middleware';
import { institutionalAuditService } from './modules/institutional/institutional-audit-service';

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

// Rate limiting global — anti-brute-force e anti-DoS na API
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Tente novamente em instantes.' },
    skip: (req) => req.path === '/api/ping',
});
const authLimiter = rateLimit({
    windowMs: 2 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas tentativas de autenticação. Aguarde 2 minutos.' },
});
app.use('/api', globalLimiter);
app.use('/api/auth/login', authLimiter);

app.use((req, res, next) => {
    if (!req.url.includes('/ping')) console.log(`[API] ${req.method} ${req.url}`);
    next();
});
app.use(globalJwtGuard);
app.use(institutionalAuditMiddleware);
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
app.use('/api/reports', reportsRoutes);
app.use('/api/identity', identityRoutes);
app.use('/api/hotspot', hotspotRoutes);
app.use('/api/collaborators', collaboratorsRoutes);
app.use('/api/support', supportRoutes);

app.use("/api/vlans", vlanScheduleRoutes);

// Rota de Healthcheck (Ajustada para HTTP)
app.get('/api/ping', (req, res) => res.json({ msg: 'Pong HTTP (Core 6778)' }));

// Motor HTTP Puro e Leve (Terminação SSL via Nginx)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`>>> BACKEND CORE ONLINE: ${PORT} (HTTP Interno)`);
    authSecurityService.ensureSchema().catch((error) => {
        console.error('[AUTH] Falha ao garantir schema de autenticacao:', error);
    });
    institutionalAuditService.ensureSchema().catch((error) => {
        console.error('[AUDIT] Falha ao garantir schema institucional:', error);
    });
    hotspotSchemaService.ensureSchema().catch((error) => {
        console.error('[HOTSPOT] Falha ao garantir schema do hotspot:', error);
    });
    hotspotSchemaService.ensureHotspotEnforcement().catch((error) => {
        console.error('[HOTSPOT] Falha ao reconciliar enforcement complementar:', error);
    });
    collaboratorsSchemaService.ensureSchema().catch((error) => {
        console.error('[COLLAB] Falha ao garantir schema de colaboradores:', error);
    });
    collaboratorsSchemaService.ensureCollabEnforcement().catch((error) => {
        console.error('[COLLAB] Falha ao reconciliar enforcement da VLAN 30:', error);
    });
    supportSchemaService.ensureSchema().catch((error) => {
        console.error('[SUPPORT] Falha ao garantir schema da central de chamados:', error);
    });
    const hotspotSessionSweeper = setInterval(() => {
        hotspotSchemaService.expireExpiredSessions().catch((error) => {
            console.error('[HOTSPOT] Falha ao expirar sessoes vencidas:', error);
        });
    }, 60 * 1000);
    hotspotSessionSweeper.unref?.();
    let hotspotCleanupRunning = false;
    const hotspotStaleCleanupSweeper = setInterval(() => {
        if (hotspotCleanupRunning) return;
        hotspotCleanupRunning = true;
        hotspotSchemaService.cleanupStaleSessions({ requestedBy: 'system:hourly-hotspot-cleanup' })
            .catch((error) => {
                console.error('[HOTSPOT] Falha ao limpar sessoes expiradas/revogadas:', error);
            })
            .finally(() => {
                hotspotCleanupRunning = false;
            });
    }, 60 * 60 * 1000);
    hotspotStaleCleanupSweeper.unref?.();
    const collabSessionSweeper = setInterval(() => {
        collaboratorsSchemaService.expireExpiredSessions().catch((error) => {
            console.error('[COLLAB] Falha ao expirar sessoes vencidas:', error);
        });
    }, 60 * 1000);
    collabSessionSweeper.unref?.();
    qosSchemaService.ensureSchema().catch((error) => {
        console.error('[QOS] Falha ao garantir schema de QoS:', error);
    });
    qosRuntimeService.reconcileAllPolicies().catch((error) => {
        console.error('[QOS] Falha ao reconciliar runtime do QoS no boot:', error);
    });
    // Ativa proteção de imutabilidade nos logs de auditoria
    import('./modules/reports/reports-service').then(({ reportsService }) => {
        reportsService.ensureSchema().catch((e) =>
            console.error('[REPORTS] Falha ao garantir schema de relatórios:', e),
        );
    });
    // Iniciando Sentinelas
    try { startMonitor(); } catch(e) {}
    try { startBackupScanner(); } catch(e) {}
    startLinkMonitor().catch((error) => {
        console.error('[LINK-SENTINEL] Falha ao iniciar sentinela de link:', error);
    });
    try { startCftvRetentionMonitor(); } catch(e) {}
});
