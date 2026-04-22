import { Router } from 'express';
import { proxyEngineService } from '../services/proxy-module';

const router = Router();
const policyWriteMoved = (_req: any, res: any) => res.status(410).json({
    error: 'Operação movida para Bloqueios & Liberações.',
    owner: 'bloqueios-liberacoes',
});

router.get('/stats', async (_req, res) => {
    try {
        res.json(await proxyEngineService.dnsLoggerService.stats());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/latency-breakdown', async (_req, res) => {
    res.json([
        { name: '< 10ms', value: 0 },
        { name: '10ms - 50ms', value: 0 },
        { name: '> 50ms', value: 0 },
    ]);
});

router.get('/status', async (_req, res) => {
    try {
        const services = await proxyEngineService.getServicesStatus();
        res.json({
            unbound_active: true,
            logger_active: services.dns_logger_active,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
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
        res.json({ success: true, message: result.message, deleted_rows: result.deleted });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/vlan-summary', async (_req, res) => {
    try {
        const radar = await proxyEngineService.dnsLoggerService.getRadar(500, 'VLAN10', false);
        const total = radar.entries.length;
        const blocked = radar.entries.filter((entry: any) => entry.blocked).length;
        const uniqueIps = new Set(radar.entries.map((entry: any) => entry.client_ip).filter(Boolean)).size;
        res.json([
            {
                vlan: 'VLAN10',
                total_queries: total,
                blocked_queries: blocked,
                unique_ips: uniqueIps,
                block_pct: total > 0 ? ((blocked / total) * 100).toFixed(1) : '0.0',
            },
        ]);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/listas', async (_req, res) => {
    try {
        const rows = await proxyEngineService.domainPolicyService.listBlocklist();
        res.json(rows.map((row) => row.domain));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/listas/add', policyWriteMoved);

router.post('/listas/remove', policyWriteMoved);

router.get('/top-blocked', async (_req, res) => {
    try {
        res.json(await proxyEngineService.dnsLoggerService.topBlocked());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/restart-unbound', async (_req, res) => {
    res.json({ success: true, message: 'Integração com Unbound permanece preparada pelo backend.' });
});

router.post('/reload-rules', async (_req, res) => {
    try {
        await proxyEngineService.domainPolicyService.syncPolicyFiles();
        res.json({ success: true, message: 'Políticas sincronizadas.' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/restart-logger', async (_req, res) => {
    try {
        const logger = await proxyEngineService.dnsLoggerService.restart();
        res.json({ success: true, message: 'Logger reiniciado.', logger });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/cleanup', async (_req, res) => {
    try {
        const deleted = await proxyEngineService.dnsLoggerService.cleanup(30);
        res.json({ success: true, message: 'Logs antigos limpos.', deleted_rows: deleted });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
