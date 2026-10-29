import { Router } from 'express';
import { monitorService } from './monitor-service';

const router = Router();

router.get('/live', (_req, res) => {
    res.json(monitorService.getLive());
});

router.get('/recent', (req, res) => {
    const minutes = Math.min(60, Math.max(1, Number(req.query.minutes) || 15));
    res.json({ step_seconds: 5, samples: monitorService.getRecent(minutes) });
});

router.get('/history', async (req, res) => {
    const range = ['1h', '24h', '7d', '30d'].includes(String(req.query.range)) ? String(req.query.range) : '24h';
    const scope = String(req.query.scope || 'wan');
    if (scope !== 'wan' && !/^vlan:\d{1,4}$/.test(scope)) {
        return res.status(400).json({ error: 'Escopo inválido. Use wan ou vlan:<id>.' });
    }
    try {
        res.json(await monitorService.getHistory(range, scope));
    } catch (error) {
        console.error('[MONITOR] Falha no histórico:', error);
        res.status(500).json({ error: 'Falha ao ler o histórico de tráfego.' });
    }
});

router.get('/traffic', (_req, res) => {
    res.json(monitorService.getTraffic());
});

router.get('/dns-summary', async (_req, res) => {
    try {
        res.json(await monitorService.getDnsSummary());
    } catch (error) {
        console.error('[MONITOR] Falha no resumo DNS:', error);
        res.status(500).json({ error: 'Falha ao ler o resumo de DNS.' });
    }
});

router.get('/dns-stats', async (_req, res) => {
    try {
        res.json(await monitorService.getDnsStats());
    } catch (error) {
        console.error('[MONITOR] Falha nos indicadores DNS:', error);
        res.status(500).json({ error: 'Falha ao ler os indicadores de DNS.' });
    }
});

router.get('/dns-recent', async (req, res) => {
    const vlan = Number(String(req.query.vlan || '').replace(/\D/g, '')) || null;
    try {
        res.json({ entries: await monitorService.getDnsRecent({ vlan, blocked: String(req.query.blocked) === 'true', limit: Number(req.query.limit) || 300 }) });
    } catch (error) {
        console.error('[MONITOR] Falha nas consultas DNS:', error);
        res.status(500).json({ error: 'Falha ao ler as consultas de DNS.' });
    }
});

router.get('/dns-device', async (req, res) => {
    const ip = String(req.query.ip || '').trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return res.status(400).json({ error: 'IP inválido.' });
    const minutes = Math.min(1440, Math.max(5, Number(req.query.minutes) || 120));
    try {
        res.json(await monitorService.getDeviceDns(ip, minutes));
    } catch (error) {
        console.error('[MONITOR] Falha no DNS por dispositivo:', error);
        res.status(500).json({ error: 'Falha ao ler as consultas do dispositivo.' });
    }
});

router.get('/alerts', async (_req, res) => {
    try {
        res.json({ alerts: await monitorService.getAlerts() });
    } catch (error) {
        console.error('[MONITOR] Falha nos alertas:', error);
        res.status(500).json({ error: 'Falha ao montar os alertas.' });
    }
});

export default router;
