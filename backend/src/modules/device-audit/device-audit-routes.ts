import { Router, Request, Response } from 'express';
import { deviceAuditService } from './device-audit-service';

const router = Router();

// Relatório de redes sociais por aparelho: GET /api/device-audit/social?from=AAAA-MM-DD&to=AAAA-MM-DD&vlan=30
router.get('/social', async (req: Request, res: Response) => {
    try {
        res.json(await deviceAuditService.socialReport({
            from: req.query.from as string,
            to: req.query.to as string,
            vlan: req.query.vlan as string,
        }));
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

export default router;
