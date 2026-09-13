import { Router, Request, Response } from 'express';
import { centralAuditService, AuditFilters } from './central-audit-service';
import { AuthenticatedRequest } from '../../middleware/auth';

const router = Router();

const readFilters = (req: Request): AuditFilters => ({
    category: req.query.category as string,
    source: req.query.source as string,
    actor: req.query.actor as string,
    ip: req.query.ip as string,
    action: req.query.action as string,
    severity: req.query.severity as string,
    success: req.query.success as string,
    search: req.query.search as string,
    period: req.query.period as string,
    date_from: req.query.date_from as string,
    date_to: req.query.date_to as string,
    limit: req.query.limit as string,
});

router.get('/categories', async (_req: Request, res: Response) => {
    try {
        res.json(await centralAuditService.categories());
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/sources', async (req: Request, res: Response) => {
    try {
        res.json(await centralAuditService.sources(readFilters(req)));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/summary', async (req: Request, res: Response) => {
    try {
        res.json(await centralAuditService.summary(readFilters(req)));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/events', async (req: Request, res: Response) => {
    try {
        res.json(await centralAuditService.list(readFilters(req)));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/events', async (req: AuthenticatedRequest, res: Response) => {
    try {
        await centralAuditService.log({
            category: req.body?.category,
            source: String(req.body?.source || 'central'),
            action: String(req.body?.action || 'manual_event'),
            title: req.body?.title,
            actor: req.body?.actor || req.auth?.username || req.auth?.name || 'sistema',
            actorId: req.body?.actor_id || req.auth?.id || null,
            ip: req.body?.ip || req.ip,
            target: req.body?.target,
            success: req.body?.success !== false,
            severity: req.body?.severity,
            message: req.body?.message,
            details: req.body?.details || {},
        });
        res.status(201).json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export { centralAuditService };
export default router;
