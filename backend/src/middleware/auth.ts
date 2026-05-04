import { NextFunction, Request, Response } from 'express';
import { authSecurityService } from '../modules/auth/auth-security-service';

const PUBLIC_ROUTES = new Set([
    '/api/auth/login',
    '/api/auth/refresh',
    '/api/auth/logout',
    '/api/ping',
    '/api/identity/health',
    '/api/identity/checkin',
]);

export type AuthenticatedRequest = Request & {
    auth?: {
        id?: number;
        username?: string;
        role?: string;
        name?: string;
    };
};

export const requireJwt = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = authSecurityService.readAccessToken(req);

    if (!token) {
        return res.status(401).json({ error: 'Token ausente.' });
    }

    try {
        const decoded = authSecurityService.verifyAccessToken(token);
        req.auth = decoded;
        next();
    } catch {
        return res.status(401).json({ error: 'Token invalido.' });
    }
};

export const globalJwtGuard = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (PUBLIC_ROUTES.has(req.path)) return next();
    if (req.path.startsWith('/api/hotspot/public/')) return next();
    if (req.path.startsWith('/api/collaborators/public/')) return next();
    return requireJwt(req, res, next);
};
