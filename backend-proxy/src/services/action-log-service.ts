import { pool } from '../config/db';
import { ensureProxySchema } from './proxy-schema-service';

type ActionLogInput = {
    action: string;
    requestedBy?: string;
    payload?: any;
    result?: any;
    success: boolean;
    message?: string;
};

export class ActionLogService {
    async log(entry: ActionLogInput) {
        await ensureProxySchema();
        await pool.query(
            `
                INSERT INTO proxy_action_logs (action, requested_by, payload, result, success, message)
                VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
            `,
            [
                entry.action,
                entry.requestedBy || 'system',
                JSON.stringify(entry.payload || {}),
                JSON.stringify(entry.result || {}),
                entry.success,
                entry.message || null,
            ],
        );
    }

    async listRecent(limit = 50) {
        await ensureProxySchema();
        const safeLimit = Math.max(1, Math.min(limit, 200));
        const { rows } = await pool.query(
            `
                SELECT id, action, requested_by, payload, result, success, message, created_at
                FROM proxy_action_logs
                ORDER BY created_at DESC
                LIMIT $1
            `,
            [safeLimit],
        );
        return rows;
    }
}
