import { Router, Request, Response } from 'express';
import { deviceAuditService } from './device-audit-service';
import { AuthenticatedRequest } from '../../middleware/auth';

const router = Router();
const actorOf = (req: AuthenticatedRequest) => String(req.auth?.username || 'admin');
const ipOf = (req: Request) => String(req.headers['x-real-ip'] || req.ip || '').replace(/^::ffff:/, '');

// Relatório de redes sociais por aparelho: GET /api/device-audit/social?from=AAAA-MM-DD&to=AAAA-MM-DD&vlan=30
router.get('/social', async (req: Request, res: Response) => {
    try {
        res.json(await deviceAuditService.socialReport({ from: req.query.from as string, to: req.query.to as string, vlan: req.query.vlan as string }));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Identificação manual de um aparelho (fica na auditoria).
router.get('/labels', async (_req: Request, res: Response) => {
    try { res.json((await deviceAuditService.listLabels()).rows); } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/labels', async (req: AuthenticatedRequest, res: Response) => {
    try { res.json(await deviceAuditService.setLabel(req.body || {}, actorOf(req), ipOf(req))); } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete('/labels/:id', async (req: AuthenticatedRequest, res: Response) => {
    try { res.json(await deviceAuditService.removeLabel(Number(req.params.id), actorOf(req), ipOf(req))); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
