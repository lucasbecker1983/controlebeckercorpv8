import crypto from 'crypto';
import type { Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import argon2 from 'argon2';
import { pool } from '../../config/db';
import { env } from '../../config/env';
import { getClientIp, getUserAgent } from '../../utils/request-context';

export const ACCESS_COOKIE = 'sgcg_access';
export const REFRESH_COOKIE = 'sgcg_refresh';
const ACCESS_EXPIRES_IN = env.jwtExpiresIn || '12h';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const durationToMs = (value: string, fallbackMs: number) => {
    const match = String(value || '').trim().match(/^(\d+)\s*(ms|s|m|h|d)?$/i);
    if (!match) return fallbackMs;
    const amount = Number(match[1]);
    const unit = String(match[2] || 'ms').toLowerCase();
    const multipliers: Record<string, number> = {
        ms: 1,
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    };
    return amount * (multipliers[unit] || 1);
};

const ACCESS_TTL_MS = durationToMs(ACCESS_EXPIRES_IN, 12 * 60 * 60 * 1000);

type AppUser = {
    id: number;
    username: string;
    role: string;
    display_name?: string | null;
    password_hash: string;
};

type SessionMeta = {
    ipAddress?: string | null;
    userAgent?: string | null;
    route?: string | null;
    method?: string | null;
};

type SessionRow = {
    id: number;
    user_id: number;
    family_id: string;
    refresh_token_hash: string;
    replaced_by_hash?: string | null;
    revoked_at?: string | null;
    revoked_reason?: string | null;
    expires_at: string;
    username?: string;
    role?: string;
    display_name?: string | null;
};

export type AuthUserPayload = {
    id: number;
    username: string;
    role: string;
    name: string;
};

export type AccessTokenPayload = {
    id: number;
    username: string;
    role: string;
    name: string;
    type: 'access';
    jti: string;
};

const shouldUseSecureCookies = (req?: Request) => {
    const forwardedProto = String(req?.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    if (req?.secure || forwardedProto === 'https') return true;
    return false;
};

const makeCookieOptions = (maxAge: number, req?: Request) => ({
    httpOnly: true,
    secure: shouldUseSecureCookies(req),
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
});

export function parseCookies(req: Request) {
    const raw = String(req.headers.cookie || '');
    return raw.split(';').reduce<Record<string, string>>((acc, part) => {
        const [name, ...rest] = part.trim().split('=');
        if (!name) return acc;
        acc[name] = decodeURIComponent(rest.join('=') || '');
        return acc;
    }, {});
}

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const randomToken = () => crypto.randomBytes(48).toString('base64url');
const randomId = () => crypto.randomUUID();

const tokenExpiryDate = () => new Date(Date.now() + REFRESH_TTL_MS);

const normalizeUser = (user: AppUser): AuthUserPayload => ({
    id: Number(user.id),
    username: user.username,
    role: user.role || 'user',
    name: user.display_name || user.username,
});

const signAccessToken = (user: AuthUserPayload) => jwt.sign(
    {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        type: 'access',
        jti: randomId(),
    },
    env.jwtSecret,
    { expiresIn: ACCESS_EXPIRES_IN as SignOptions['expiresIn'] },
);

export const authSecurityService = {
    async ensureSchema() {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
                id BIGSERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
                family_id UUID NOT NULL,
                refresh_token_hash TEXT NOT NULL UNIQUE,
                replaced_by_hash TEXT,
                ip_address TEXT,
                user_agent TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_used_at TIMESTAMPTZ,
                expires_at TIMESTAMPTZ NOT NULL,
                revoked_at TIMESTAMPTZ,
                revoked_reason TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_user_id ON auth_refresh_sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_family_id ON auth_refresh_sessions(family_id);
            CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_expires_at ON auth_refresh_sessions(expires_at DESC);

            CREATE TABLE IF NOT EXISTS auth_activity_logs (
                id BIGSERIAL PRIMARY KEY,
                user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
                username TEXT,
                action TEXT NOT NULL,
                module_name TEXT NOT NULL DEFAULT 'governanca-dados',
                route TEXT,
                method TEXT,
                ip_address TEXT,
                user_agent TEXT,
                success BOOLEAN NOT NULL DEFAULT FALSE,
                status TEXT NOT NULL DEFAULT 'observado',
                detail JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_auth_activity_logs_created_at ON auth_activity_logs(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_auth_activity_logs_user_id ON auth_activity_logs(user_id);
            CREATE INDEX IF NOT EXISTS idx_auth_activity_logs_action ON auth_activity_logs(action);

            REVOKE ALL ON TABLE auth_refresh_sessions FROM PUBLIC;
            REVOKE ALL ON TABLE auth_activity_logs FROM PUBLIC;
        `);
    },

    async logActivity(input: {
        userId?: number | null;
        username?: string | null;
        action: string;
        moduleName?: string;
        route?: string | null;
        method?: string | null;
        ipAddress?: string | null;
        userAgent?: string | null;
        success?: boolean;
        status?: string;
        detail?: Record<string, unknown>;
    }) {
        await pool.query(
            `INSERT INTO auth_activity_logs
                (user_id, username, action, module_name, route, method, ip_address, user_agent, success, status, detail)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
            [
                input.userId || null,
                input.username || null,
                input.action,
                input.moduleName || 'governanca-dados',
                input.route || null,
                input.method || null,
                input.ipAddress || null,
                input.userAgent || null,
                Boolean(input.success),
                input.status || (input.success ? 'sucesso' : 'falha'),
                JSON.stringify(input.detail || {}),
            ],
        );
    },

    async findUserByUsername(username: string) {
        const result = await pool.query<AppUser>('SELECT * FROM app_users WHERE username = $1 LIMIT 1', [username]);
        return result.rows[0] || null;
    },

    async verifyPassword(user: AppUser, password: string) {
        const hash = String(user.password_hash || '');
        if (!hash) return { valid: false, upgraded: false };

        if (hash.startsWith('$argon2')) {
            const valid = await argon2.verify(hash, password);
            return { valid, upgraded: false };
        }

        const valid = await bcrypt.compare(password, hash);
        if (!valid) return { valid: false, upgraded: false };

        const nextHash = await argon2.hash(password, { type: argon2.argon2id });
        await pool.query('UPDATE app_users SET password_hash = $1 WHERE id = $2', [nextHash, user.id]);
        return { valid: true, upgraded: true };
    },

    async hashPassword(password: string) {
        return argon2.hash(password, { type: argon2.argon2id });
    },

    async createSession(user: AppUser, meta: SessionMeta) {
        const normalizedUser = normalizeUser(user);
        const refreshToken = randomToken();
        const refreshHash = hashToken(refreshToken);
        const familyId = randomId();

        await pool.query(
            `INSERT INTO auth_refresh_sessions
                (user_id, family_id, refresh_token_hash, ip_address, user_agent, expires_at)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [user.id, familyId, refreshHash, meta.ipAddress || null, meta.userAgent || null, tokenExpiryDate().toISOString()],
        );

        return {
            accessToken: signAccessToken(normalizedUser),
            refreshToken,
            user: normalizedUser,
        };
    },

    async revokeFamilySessions(familyId: string, reason: string) {
        await pool.query(
            'UPDATE auth_refresh_sessions SET revoked_at = NOW(), revoked_reason = COALESCE(revoked_reason, $2) WHERE family_id = $1 AND revoked_at IS NULL',
            [familyId, reason],
        );
    },

    async revokeAllUserSessions(userId: number, reason: string) {
        await pool.query(
            'UPDATE auth_refresh_sessions SET revoked_at = NOW(), revoked_reason = COALESCE(revoked_reason, $2) WHERE user_id = $1 AND revoked_at IS NULL',
            [userId, reason],
        );
    },

    async findSessionByRefreshToken(refreshToken: string) {
        const refreshHash = hashToken(refreshToken);
        const result = await pool.query<SessionRow & AppUser>(
            `SELECT s.*, u.username, u.role, u.display_name
             FROM auth_refresh_sessions s
             JOIN app_users u ON u.id = s.user_id
             WHERE s.refresh_token_hash = $1
             LIMIT 1`,
            [refreshHash],
        );
        return result.rows[0] || null;
    },

    async revokeByRefreshToken(refreshToken: string, reason: string) {
        const refreshHash = hashToken(refreshToken);
        await pool.query(
            'UPDATE auth_refresh_sessions SET revoked_at = NOW(), revoked_reason = COALESCE(revoked_reason, $2) WHERE refresh_token_hash = $1 AND revoked_at IS NULL',
            [refreshHash, reason],
        );
    },

    async rotateRefreshToken(refreshToken: string, meta: SessionMeta) {
        const refreshHash = hashToken(refreshToken);
        const result = await pool.query<SessionRow & AppUser>(
            `SELECT s.*, u.username, u.role, u.display_name
             FROM auth_refresh_sessions s
             JOIN app_users u ON u.id = s.user_id
             WHERE s.refresh_token_hash = $1
             LIMIT 1`,
            [refreshHash],
        );
        const session = result.rows[0];
        if (!session) {
            return { status: 'missing' as const };
        }

        const expired = new Date(session.expires_at).getTime() <= Date.now();
        if (session.replaced_by_hash || session.revoked_at) {
            await this.revokeAllUserSessions(session.user_id, 'refresh-token-reuse-detected');
            return { status: 'reused' as const, session };
        }
        if (expired) {
            await this.revokeByRefreshToken(refreshToken, 'refresh-token-expired');
            return { status: 'expired' as const, session };
        }

        const nextRefreshToken = randomToken();
        const nextRefreshHash = hashToken(nextRefreshToken);
        const normalizedUser = normalizeUser({
            id: session.user_id,
            username: session.username || '',
            role: session.role || 'user',
            display_name: session.display_name || session.username || '',
            password_hash: '',
        });

        await pool.query('BEGIN');
        try {
            await pool.query(
                `UPDATE auth_refresh_sessions
                 SET replaced_by_hash = $2, revoked_at = NOW(), revoked_reason = 'rotated', last_used_at = NOW()
                 WHERE id = $1`,
                [session.id, nextRefreshHash],
            );
            await pool.query(
                `INSERT INTO auth_refresh_sessions
                    (user_id, family_id, refresh_token_hash, ip_address, user_agent, expires_at)
                 VALUES ($1,$2,$3,$4,$5,$6)`,
                [session.user_id, session.family_id, nextRefreshHash, meta.ipAddress || null, meta.userAgent || null, tokenExpiryDate().toISOString()],
            );
            await pool.query('COMMIT');
        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }

        return {
            status: 'rotated' as const,
            accessToken: signAccessToken(normalizedUser),
            refreshToken: nextRefreshToken,
            user: normalizedUser,
            session,
        };
    },

    verifyAccessToken(token: string) {
        return jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
    },

    readAccessToken(req: Request) {
        const cookies = parseCookies(req);
        const authHeader = String(req.headers.authorization || '');
        const [, bearer] = authHeader.split(' ');
        return bearer || cookies[ACCESS_COOKIE] || '';
    },

    readRefreshToken(req: Request) {
        const cookies = parseCookies(req);
        return cookies[REFRESH_COOKIE] || '';
    },

    setAuthCookies(req: Request, res: Response, accessToken: string, refreshToken: string) {
        res.cookie(ACCESS_COOKIE, accessToken, makeCookieOptions(ACCESS_TTL_MS, req));
        res.cookie(REFRESH_COOKIE, refreshToken, makeCookieOptions(REFRESH_TTL_MS, req));
    },

    clearAuthCookies(req: Request, res: Response) {
        res.clearCookie(ACCESS_COOKIE, { ...makeCookieOptions(0, req), maxAge: undefined });
        res.clearCookie(REFRESH_COOKIE, { ...makeCookieOptions(0, req), maxAge: undefined });
    },

    requestMeta(req: Request): SessionMeta {
        return {
            ipAddress: getClientIp(req),
            userAgent: getUserAgent(req),
            route: req.originalUrl || req.path,
            method: req.method,
        };
    },

    async listActivity(limit = 200) {
        const result = await pool.query(
            `SELECT l.id,
                    l.user_id,
                    COALESCE(l.username, u.username, 'sistema') AS username,
                    l.action,
                    l.module_name,
                    l.route,
                    l.method,
                    l.ip_address,
                    l.user_agent,
                    l.success,
                    l.status,
                    l.detail,
                    l.created_at
             FROM auth_activity_logs l
             LEFT JOIN app_users u ON u.id = l.user_id
             ORDER BY l.created_at DESC
             LIMIT $1`,
            [limit],
        );
        return result.rows;
    },
};
