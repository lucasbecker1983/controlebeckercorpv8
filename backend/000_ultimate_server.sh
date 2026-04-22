#!/bin/bash
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}>>> [SÊNIOR] INJETANDO O CÓDIGO MESTRE DO SERVER.TS...${NC}"

BACKEND_DIR="/opt/controlebeckercorp-v8/backend"

cat > "$BACKEND_DIR/src/server.ts" << 'EOF'
import express from 'express';
import cors from 'cors';
import fs from 'fs';

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

// Monitores
import { startCftvRetentionMonitor } from './modules/cftv/cftv-monitor';
import { startMonitor } from './modules/control/monitor';
import { startBackupScanner } from './modules/backups/backup-monitor';
import { startLinkMonitor } from './modules/connectivity/downtime-monitor';

const app = express();
const PORT = 6778;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    if (!req.url.includes('/ping')) console.log(`[API] ${req.method} ${req.url}`);
    next();
});

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

// Rota de Healthcheck (Ajustada para HTTP)
app.get('/api/ping', (req, res) => res.json({ msg: 'Pong HTTP (Core 6778)' }));

// Motor HTTP Puro e Leve (Terminação SSL via Nginx)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`>>> BACKEND CORE ONLINE: ${PORT} (HTTP Interno)`);
    // Iniciando Sentinelas
    try { startMonitor(); } catch(e) {}
    try { startBackupScanner(); } catch(e) {}
    try { startLinkMonitor(); } catch(e) {}
    try { startCftvRetentionMonitor(); } catch(e) {}
});
EOF

echo -e "${YELLOW}-> Compilando TypeScript...${NC}"
cd "$BACKEND_DIR" || exit
rm -rf dist/ build/
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}>>> COMPILAÇÃO PERFEITA! <<<${NC}"
    pm2 restart bcc-backend > /dev/null 2>&1
    echo -e "${CYAN}>>> Motor Node.js no ar e respirando. <<<${NC}"
else
    echo -e "${RED}[!] Erro de compilação. Me mande o log.[!]${NC}"
fi
