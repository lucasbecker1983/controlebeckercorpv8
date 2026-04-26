import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authSecurityService } from './auth-security-service';
import type { AuthenticatedRequest } from '../../middleware/auth';

const router = Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas tentativas de autenticação. Aguarde alguns minutos.' },
});

const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas renovações de sessão. Aguarde alguns minutos.' },
});

router.post('/login', authLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    const meta = authSecurityService.requestMeta(req);

    if (!username || !password) {
        await authSecurityService.logActivity({
            username: String(username || ''),
            action: 'auth.login',
            route: meta.route,
            method: meta.method,
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
            success: false,
            status: 'rejeitado',
            detail: { reason: 'missing-credentials' },
        });
        return res.status(400).json({ error: 'Dados incompletos' });
    }

    try {
        const user = await authSecurityService.findUserByUsername(String(username));
        if (!user) {
            await authSecurityService.logActivity({
                username: String(username),
                action: 'auth.login',
                route: meta.route,
                method: meta.method,
                ipAddress: meta.ipAddress,
                userAgent: meta.userAgent,
                success: false,
                status: 'falha',
                detail: { reason: 'user-not-found' },
            });
            return res.status(401).json({ error: 'Credenciais invalidas' });
        }

        const verification = await authSecurityService.verifyPassword(user, String(password));
        if (!verification.valid) {
            await authSecurityService.logActivity({
                userId: user.id,
                username: user.username,
                action: 'auth.login',
                route: meta.route,
                method: meta.method,
                ipAddress: meta.ipAddress,
                userAgent: meta.userAgent,
                success: false,
                status: 'falha',
                detail: { reason: 'password-mismatch' },
            });
            return res.status(401).json({ error: 'Credenciais invalidas' });
        }

        const session = await authSecurityService.createSession(user, meta);
        authSecurityService.setAuthCookies(req, res, session.accessToken, session.refreshToken);
        await authSecurityService.logActivity({
            userId: user.id,
            username: user.username,
            action: 'auth.login',
            route: meta.route,
            method: meta.method,
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
            success: true,
            status: verification.upgraded ? 'sucesso-com-upgrade' : 'sucesso',
            detail: { password_upgraded_to_argon2: verification.upgraded },
        });

        return res.status(200).json({
            success: true,
            user: session.user,
            accessToken: session.accessToken,
        });
    } catch (error) {
        console.error('[AUTH] Login falhou:', error);
        await authSecurityService.logActivity({
            username: String(username || ''),
            action: 'auth.login',
            route: meta.route,
            method: meta.method,
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
            success: false,
            status: 'erro',
            detail: { reason: 'server-error' },
        });
        return res.status(500).json({ error: 'Erro interno' });
    }
});

router.post('/refresh', refreshLimiter, async (req, res) => {
    const meta = authSecurityService.requestMeta(req);
    const refreshToken = authSecurityService.readRefreshToken(req);
    if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token ausente' });
    }

    try {
        const rotated = await authSecurityService.rotateRefreshToken(refreshToken, meta);
        if (rotated.status === 'rotated') {
            authSecurityService.setAuthCookies(req, res, rotated.accessToken, rotated.refreshToken);
            await authSecurityService.logActivity({
                userId: rotated.user.id,
                username: rotated.user.username,
                action: 'auth.refresh',
                route: meta.route,
                method: meta.method,
                ipAddress: meta.ipAddress,
                userAgent: meta.userAgent,
                success: true,
                status: 'rotacionado',
                detail: { family_id: rotated.session.family_id },
            });
            return res.json({ success: true, user: rotated.user, accessToken: rotated.accessToken });
        }

        authSecurityService.clearAuthCookies(req, res);
        if (rotated.status === 'reused' && rotated.session) {
            await authSecurityService.logActivity({
                userId: rotated.session.user_id,
                username: rotated.session.username,
                action: 'auth.refresh.reuse-detected',
                route: meta.route,
                method: meta.method,
                ipAddress: meta.ipAddress,
                userAgent: meta.userAgent,
                success: false,
                status: 'sessoes-revogadas',
                detail: { family_id: rotated.session.family_id },
            });
            return res.status(401).json({ error: 'Reuso de refresh token detectado. Todas as sessões foram revogadas.' });
        }
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    } catch (error) {
        console.error('[AUTH] Refresh falhou:', error);
        authSecurityService.clearAuthCookies(req, res);
        return res.status(500).json({ error: 'Erro ao renovar sessão.' });
    }
});

router.post('/logout', async (req: AuthenticatedRequest, res) => {
    const meta = authSecurityService.requestMeta(req);
    const refreshToken = authSecurityService.readRefreshToken(req);
    if (refreshToken) {
        await authSecurityService.revokeByRefreshToken(refreshToken, 'logout');
    }
    authSecurityService.clearAuthCookies(req, res);
    await authSecurityService.logActivity({
        userId: req.auth?.id,
        username: undefined,
        action: 'auth.logout',
        route: meta.route,
        method: meta.method,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        success: true,
        status: 'encerrado',
    });
    return res.json({ success: true });
});

router.post('/logout-all', async (req: AuthenticatedRequest, res) => {
    const meta = authSecurityService.requestMeta(req);
    if (!req.auth?.id) return res.status(401).json({ error: 'Sessão ausente.' });
    await authSecurityService.revokeAllUserSessions(req.auth.id, 'logout-all');
    authSecurityService.clearAuthCookies(req, res);
    await authSecurityService.logActivity({
        userId: req.auth.id,
        username: req.auth.username,
        action: 'auth.logout-all',
        route: meta.route,
        method: meta.method,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        success: true,
        status: 'sessoes-revogadas',
    });
    return res.json({ success: true });
});

router.get('/me', async (req: AuthenticatedRequest, res) => {
    if (!req.auth?.id) return res.status(401).json({ error: 'Sessão ausente.' });
    return res.json({
        success: true,
        user: {
            id: req.auth.id,
            username: req.auth.username,
            role: req.auth.role,
            name: req.auth.name || req.auth.username,
        },
    });
});

router.get('/activity', async (req: AuthenticatedRequest, res) => {
    if (!req.auth?.id) return res.status(401).json({ error: 'Sessão ausente.' });
    const limit = Math.min(Number(req.query.limit || 200), 500);
    const rows = await authSecurityService.listActivity(limit);
    return res.json(rows);
});

export default router;
