import type { NextFunction, Request, Response } from 'express';
import { getRequestActor } from '../../utils/request-context';
import { institutionalAuditService } from './institutional-audit-service';

const shouldAudit = (req: Request) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return false;
    if (req.path.startsWith('/api/auth/')) return false;
    if (req.path.startsWith('/api/lgpd/')) return false;
    return true;
};

const actionFromRequest = (req: Request) => `core:${req.method.toLowerCase()}:${req.path.replace(/^\/api\//, '')}`;

export const institutionalAuditMiddleware = (req: Request & { auth?: any }, res: Response, next: NextFunction) => {
    if (!shouldAudit(req)) return next();

    const actor = getRequestActor(req);
    const startedAt = Date.now();

    res.on('finish', () => {
        institutionalAuditService.log({
            action: actionFromRequest(req),
            requestedBy: actor.username || 'operador-autenticado',
            actorUserId: actor.userId,
            actorIp: actor.ipAddress,
            actorUserAgent: actor.userAgent,
            payload: req.body || {},
            result: { duration_ms: Date.now() - startedAt },
            success: res.statusCode < 400,
            message: res.statusCode < 400 ? 'Operação institucional registrada.' : 'Operação institucional falhou.',
            route: req.originalUrl || req.path,
            method: req.method,
            statusCode: res.statusCode,
        }).catch((error) => {
            console.error('[AUDIT] Falha ao registrar trilha institucional:', error);
        });
    });

    next();
};
