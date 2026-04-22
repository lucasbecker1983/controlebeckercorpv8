import { Router } from 'express';
import VlanSchedulerController from '../controllers/VlanSchedulerController';

const vlanRoutes = Router();

vlanRoutes.post('/api/vlans/schedule', VlanSchedulerController.updateSchedule);

export default vlanRoutes;
