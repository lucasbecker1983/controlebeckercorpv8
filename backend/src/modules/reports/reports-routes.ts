import { Router, Request, Response } from 'express';
import { reportsService } from './reports-service';

const router = Router();

router.get('/navigation', async (req: Request, res: Response) => {
    try {
        await reportsService.ensureSchema();
        const result = await reportsService.getNavigation({
            period: String(req.query.period || '24h'),
            ip: req.query.ip as string,
            vlan: req.query.vlan as string,
            domain: req.query.domain as string,
            action: req.query.action as 'block' | 'allow' | 'all',
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 200,
            date_from: req.query.date_from as string,
            date_to: req.query.date_to as string,
        });
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/navigation/by-ip', async (req: Request, res: Response) => {
    try {
        await reportsService.ensureSchema();
        const rows = await reportsService.getNavigationByIp({
            period: String(req.query.period || '24h'),
            vlan: req.query.vlan as string,
            domain: req.query.domain as string,
            action: req.query.action as 'block' | 'allow' | 'all',
            date_from: req.query.date_from as string,
            date_to: req.query.date_to as string,
        });
        res.json({ rows });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/navigation/export.pdf', async (req: Request, res: Response) => {
    try {
        await reportsService.ensureSchema();
        const buf = await reportsService.exportNavigationPdf({
            period: String(req.query.period || '24h'),
            ip: req.query.ip as string,
            vlan: req.query.vlan as string,
            domain: req.query.domain as string,
            action: req.query.action as 'block' | 'allow' | 'all',
            date_from: req.query.date_from as string,
            date_to: req.query.date_to as string,
        });
        const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="relatorio-navegacao-${now}.pdf"`);
        res.send(buf);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/audit', async (req: Request, res: Response) => {
    try {
        await reportsService.ensureSchema();
        const result = await reportsService.getSystemAudit({
            period: String(req.query.period || '24h'),
            actor: req.query.actor as string,
            ip: req.query.ip as string,
            source: req.query.source as 'all' | 'sistema' | 'autenticacao' | 'lgpd' | 'politicas',
            action: req.query.action as string,
            success: req.query.success as string,
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 200,
            date_from: req.query.date_from as string,
            date_to: req.query.date_to as string,
        });
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/audit/export.pdf', async (req: Request, res: Response) => {
    try {
        await reportsService.ensureSchema();
        const buf = await reportsService.exportAuditPdf({
            period: String(req.query.period || '24h'),
            actor: req.query.actor as string,
            ip: req.query.ip as string,
            source: req.query.source as 'all' | 'sistema' | 'autenticacao' | 'lgpd' | 'politicas',
            action: req.query.action as string,
            success: req.query.success as string,
            date_from: req.query.date_from as string,
            date_to: req.query.date_to as string,
        });
        const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="relatorio-auditoria-${now}.pdf"`);
        res.send(buf);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
