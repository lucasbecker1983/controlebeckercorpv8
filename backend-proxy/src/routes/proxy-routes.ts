import { Router } from 'express';
import { pool } from '../config/db';
import { proxyEngineService } from '../services/proxy-module';

const router = Router();

const requestedBy = (req: any) => String(req.headers['x-user'] || req.body?.requested_by || 'api');
const policyWriteMoved = (_req: any, res: any) => res.status(410).json({
    error: 'Operação movida para Bloqueios & Liberações.',
    owner: 'bloqueios-liberacoes',
});

router.get('/status', async (req, res) => {
    try {
        res.json(await proxyEngineService.getStatus());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/engine', async (req, res) => {
    try {
        res.json(await proxyEngineService.getStatus());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/services', async (req, res) => {
    try {
        res.json(await proxyEngineService.getServicesStatus());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/mode/test-http-only', async (req, res) => {
    try {
        res.json(await proxyEngineService.setMode('test-http-only', requestedBy(req), 'proxy-route:test-http-only'));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/mode/test-http-https', async (req, res) => {
    try {
        res.json(await proxyEngineService.setMode('test-http+https', requestedBy(req), 'proxy-route:test-http+https'));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/mode/off', async (req, res) => {
    try {
        res.json(await proxyEngineService.setMode('off', requestedBy(req), 'proxy-route:off'));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/emergency-bypass', async (req, res) => {
    try {
        res.json(await proxyEngineService.emergencyBypass(requestedBy(req)));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/logger/restart', async (req, res) => {
    try {
        const result = await proxyEngineService.dnsLoggerService.restart();
        await proxyEngineService.actionLogService.log({
            action: 'logger:restart',
            requestedBy: requestedBy(req),
            payload: {},
            result,
            success: true,
            message: 'Logger reiniciado',
        });
        res.json({ success: true, message: 'Logger reiniciado.', logger: result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/certificate', async (req, res) => {
    try {
        const certificate = await proxyEngineService.certificateService.ensureActiveCertificate();
        res.json(certificate);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/certificate/regenerate', async (req, res) => {
    try {
        const certificate = await proxyEngineService.certificateService.regenerate(requestedBy(req));
        await proxyEngineService.actionLogService.log({
            action: 'certificate:regenerate',
            requestedBy: requestedBy(req),
            payload: {},
            result: certificate,
            success: true,
            message: 'Nova CA gerada com sucesso',
        });
        res.json(certificate);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/certificate/download', async (req, res) => {
    try {
        const certificate = await proxyEngineService.certificateService.ensureActiveCertificate();
        await proxyEngineService.actionLogService.log({
            action: 'certificate:download',
            requestedBy: requestedBy(req),
            payload: {},
            result: { certificate_id: certificate.id, file_path: certificate.file_path },
            success: true,
            message: 'Download do certificado solicitado',
        });
        res.download(certificate.file_path, 'certificado_becker_proxy.der');
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
});

router.get('/cert/download', async (req, res) => {
    try {
        const certificate = await proxyEngineService.certificateService.ensureActiveCertificate();
        res.download(certificate.file_path, 'certificado_becker_proxy.der');
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
});

router.get('/radar', async (req, res) => {
    try {
        const payload = await proxyEngineService.dnsLoggerService.getRadar(
            parseInt(String(req.query.limit || '200'), 10) || 200,
            String(req.query.vlan || 'todas'),
            String(req.query.blocked || '').toLowerCase() === 'true',
        );
        res.json(payload);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/radar/clear', async (req, res) => {
    try {
        const result = await proxyEngineService.dnsLoggerService.clear(
            String(req.body?.scope || 'noise').toLowerCase() === 'all' ? 'all' : 'noise',
        );
        await proxyEngineService.actionLogService.log({
            action: 'radar:clear',
            requestedBy: requestedBy(req),
            payload: { scope: req.body?.scope || 'noise' },
            result,
            success: true,
            message: result.message,
        });
        res.json({ success: true, message: result.message, deleted_rows: result.deleted });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/blocklist', async (req, res) => {
    try {
        res.json(await proxyEngineService.domainPolicyService.listBlocklist());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/blocklist', policyWriteMoved);

router.delete('/blocklist/:id', policyWriteMoved);

router.get('/whitelist', async (req, res) => {
    try {
        const custom = await proxyEngineService.domainPolicyService.listWhitelist();
        const categories = await proxyEngineService.domainPolicyService.getBuiltinCategories();
        const protectedDomains = await proxyEngineService.domainPolicyService.getProtectedDomains();
        res.json({
            categories,
            custom,
            total: custom.length + protectedDomains.length,
            source_of_truth: 'bloqueios-liberacoes',
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/whitelist', policyWriteMoved);

router.delete('/whitelist/:id', policyWriteMoved);

router.get('/vips', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `
                SELECT id, cidr AS ip, descricao AS description, ativo AS active, created_at
                FROM dns_vip
                ORDER BY ativo DESC, descricao ASC
            `,
        );
        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/vips', policyWriteMoved);

router.patch('/vips/:id', policyWriteMoved);

router.delete('/vips/:id', policyWriteMoved);

router.get('/reports', async (req, res) => {
    try {
        res.json(await proxyEngineService.reportService.listReports());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/reports/generate', async (req, res) => {
    try {
        const reports = await proxyEngineService.reportService.generate();
        res.json({ success: true, reports });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/action-logs', async (req, res) => {
    try {
        res.json(await proxyEngineService.actionLogService.listRecent(parseInt(String(req.query.limit || '50'), 10) || 50));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
