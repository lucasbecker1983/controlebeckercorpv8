import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const parseCookies = (req: Request) => {
    const raw = String(req.headers.cookie || '');
    return raw.split(';').reduce<Record<string, string>>((acc, part) => {
        const [name, ...rest] = part.trim().split('=');
        if (!name) return acc;
        acc[name] = decodeURIComponent(rest.join('=') || '');
        return acc;
    }, {});
};

export const requireJwt = (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS') {
        return next();
    }

    const authHeader = req.headers.authorization || '';
    const [, bearerToken] = authHeader.split(' ');
    const token = bearerToken || parseCookies(req).sgcg_access;

    if (!token) {
        return res.status(401).json({ error: 'Token ausente.' });
    }

    try {
        const decoded = jwt.verify(token, env.jwtSecret) as any;
        (req as any).auth = {
            id: decoded?.id,
            username: decoded?.username,
            role: decoded?.role,
            name: decoded?.name,
        };
        next();
    } catch {
        return res.status(401).json({ error: 'Token invalido.' });
    }
};
