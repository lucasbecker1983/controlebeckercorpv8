// =============================================================================
// BeckerCorp v8 — backend-proxy/src/server.ts
// =============================================================================
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import https from 'https';
import proxyRoutes from './routes/proxy-routes';
import auditRoutes from './routes/audit-routes';
import engineRoutes from './routes/engine-routes';
import dnsRoutes from './routes/dns-routes';
import vipRoutes from './routes/vip-routes';

const app = express();
const PORT = 6779;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`[PROXY] ${req.method} ${req.url}`);
    next();
});

// Rotas
app.use('/api/proxy', proxyRoutes);
app.use('/api/proxy/audit', auditRoutes);
app.use('/api/proxy/engine', engineRoutes);

app.use('/sarg', express.static('/opt/controlebeckercorp-v8/backend-proxy/public/sarg'));
app.use('/proxy', proxyRoutes);
app.use('/', proxyRoutes);

// Certificado
const CERT_FILE = '/opt/controlebeckercorp-v8/backend-proxy/public/certificado.der';
const downloadHandler = (req: any, res: any) => {
    if (fs.existsSync(CERT_FILE)) {
        res.download(CERT_FILE, 'certificado_becker_proxy.der');
    } else {
        res.status(404).json({ error: 'Certificado não encontrado.' });
    }
};
app.get('/api/proxy/cert/download', downloadHandler);
app.get('/api/cert/download', downloadHandler);
app.get('/cert/download', downloadHandler);

// DNS Filter
app.use('/api/dns/vip', vipRoutes);
app.use('/api/dns', dnsRoutes);

const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/console.jacarezinho.cloud/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/console.jacarezinho.cloud/fullchain.pem')
};
https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
    console.log('[PROXY API] Rodando com HTTPS na porta ' + PORT);
});
