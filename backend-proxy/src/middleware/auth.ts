import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export const requireJwt = (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS') {
        return next();
    }

    const authHeader = req.headers.authorization || '';
    const [, token] = authHeader.split(' ');

    if (!token) {
        return res.status(401).json({ error: 'Token ausente.' });
    }

    try {
        jwt.verify(token, env.jwtSecret);
        next();
    } catch {
        return res.status(401).json({ error: 'Token invalido.' });
    }
};
