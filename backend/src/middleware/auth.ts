import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const PUBLIC_ROUTES = new Set([
    '/api/auth/login',
    '/api/ping',
]);

export type AuthenticatedRequest = Request & {
    auth?: {
        id?: number;
        role?: string;
    };
};

export const requireJwt = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization || '';
    const [, token] = authHeader.split(' ');

    if (!token) {
        return res.status(401).json({ error: 'Token ausente.' });
    }

    try {
        const decoded = jwt.verify(token, env.jwtSecret) as { id?: number; role?: string };
        req.auth = decoded;
        next();
    } catch {
        return res.status(401).json({ error: 'Token invalido.' });
    }
};

export const globalJwtGuard = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (PUBLIC_ROUTES.has(req.path)) return next();
    return requireJwt(req, res, next);
};
