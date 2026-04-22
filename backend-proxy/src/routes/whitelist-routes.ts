import { Router } from 'express';
import { proxyEngineService } from '../services/proxy-module';

const router = Router();
const policyWriteMoved = (_req: any, res: any) => res.status(410).json({
    error: 'Operação movida para Bloqueios & Liberações.',
    owner: 'bloqueios-liberacoes',
});

router.get('/', async (_req, res) => {
    try {
        const custom = await proxyEngineService.domainPolicyService.listWhitelist();
        const categories = await proxyEngineService.domainPolicyService.getBuiltinCategories();
        const protectedDomains = await proxyEngineService.domainPolicyService.getProtectedDomains();
        res.json({
            categories,
            custom: custom.filter((item) => !item.protected).map((item) => item.domain),
            total: custom.length + protectedDomains.length,
            source_of_truth: 'bloqueios-liberacoes',
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/add', policyWriteMoved);

router.post('/remove', policyWriteMoved);

export default router;
