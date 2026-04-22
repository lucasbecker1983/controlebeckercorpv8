import { Router } from 'express';
import { updateSchedule } from './vlan-schedule-controller';

const router = Router();

// A rota real ficará /api/vlans/schedule (pois vamos montar /api/vlans no server.ts)
router.post('/schedule', updateSchedule);

export default router;
