import { Request, Response } from 'express';

export const updateSchedule = async (req: Request, res: Response): Promise<any> => {
    return res.status(410).json({
        error: 'Agendador legado de VLAN desativado.',
        detail: 'A operação foi removida do fluxo principal. Use políticas DNS/Squid do módulo Bloqueios & Liberações.',
    });
};
