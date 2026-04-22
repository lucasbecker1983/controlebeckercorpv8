import { Request, Response } from 'express';

class VlanSchedulerController {
  public async updateSchedule(req: Request, res: Response): Promise<Response | void> {
    return res.status(410).json({
      error: 'Agendador legado de VLAN desativado.',
      detail: 'Use o módulo Bloqueios & Liberações com apply auditado. O script 999_vlan_scheduler.sh foi colocado em quarentena.',
    });
  }
}

export default new VlanSchedulerController();
