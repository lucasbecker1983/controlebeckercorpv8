import { Router } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth';
import { lgpdService } from './lgpd-service';
import { getRequestActor } from '../../utils/request-context';

const router = Router();

const actorFromRequest = (req: AuthenticatedRequest) => {
    const actor = getRequestActor(req);
    return {
        username: actor.username || 'sistema',
        userId: actor.userId,
        ipAddress: actor.ipAddress || null,
        userAgent: actor.userAgent,
    };
};

router.get('/dashboard', async (_req, res) => {
    try {
        res.json(await lgpdService.getDashboard());
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Falha ao carregar painel LGPD.' });
    }
});

router.get('/program-settings', async (_req, res) => {
    try {
        res.json(await lgpdService.getProgramSettings());
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Falha ao carregar configuração institucional LGPD.' });
    }
});

router.post('/program-settings', async (req: AuthenticatedRequest, res) => {
    try {
        res.json(await lgpdService.upsertProgramSettings(req.body, actorFromRequest(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'Falha ao atualizar configuração institucional LGPD.' });
    }
});

router.get('/processing-activities/export.pdf', async (_req, res) => {
    try {
        const [activities, program] = await Promise.all([
            lgpdService.listProcessingActivities(),
            lgpdService.getProgramSettings(),
        ]);
        const pdf = await lgpdService.exportInventoryPdf(activities, program);
        const filename = `inventario-lgpd-${new Date().toISOString().slice(0, 10)}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(pdf);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Falha ao gerar PDF do inventário LGPD.' });
    }
});

router.get('/processing-activities', async (_req, res) => {
    try {
        res.json(await lgpdService.listProcessingActivities());
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Falha ao listar atividades de tratamento.' });
    }
});

router.post('/processing-activities', async (req: AuthenticatedRequest, res) => {
    try {
        res.json(await lgpdService.upsertProcessingActivity(req.body, actorFromRequest(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'Falha ao criar atividade de tratamento.' });
    }
});

router.patch('/processing-activities/:id', async (req: AuthenticatedRequest, res) => {
    try {
        res.json(await lgpdService.upsertProcessingActivity(req.body, actorFromRequest(req), Number(req.params.id)));
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'Falha ao atualizar atividade de tratamento.' });
    }
});

router.get('/requests', async (_req, res) => {
    try {
        res.json(await lgpdService.listRequests());
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Falha ao listar solicitações.' });
    }
});

router.post('/requests', async (req: AuthenticatedRequest, res) => {
    try {
        res.json(await lgpdService.upsertRequest(req.body, actorFromRequest(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'Falha ao criar solicitação.' });
    }
});

router.patch('/requests/:id', async (req: AuthenticatedRequest, res) => {
    try {
        res.json(await lgpdService.upsertRequest(req.body, actorFromRequest(req), Number(req.params.id)));
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'Falha ao atualizar solicitação.' });
    }
});

router.get('/incidents', async (_req, res) => {
    try {
        res.json(await lgpdService.listIncidents());
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Falha ao listar incidentes.' });
    }
});

router.post('/incidents', async (req: AuthenticatedRequest, res) => {
    try {
        res.json(await lgpdService.upsertIncident(req.body, actorFromRequest(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'Falha ao criar incidente.' });
    }
});

router.patch('/incidents/:id', async (req: AuthenticatedRequest, res) => {
    try {
        res.json(await lgpdService.upsertIncident(req.body, actorFromRequest(req), Number(req.params.id)));
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'Falha ao atualizar incidente.' });
    }
});

router.get('/audit', async (req, res) => {
    try {
        res.json(await lgpdService.listAuditLogs(Number(req.query.limit || 120)));
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Falha ao listar trilha LGPD.' });
    }
});

export default router;
