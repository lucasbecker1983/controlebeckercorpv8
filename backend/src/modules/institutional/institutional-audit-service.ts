import { pool } from '../../config/db';

export type InstitutionalAuditInput = {
    action: string;
    requestedBy?: string | null;
    actorUserId?: number | null;
    actorIp?: string | null;
    actorUserAgent?: string | null;
    payload?: any;
    result?: any;
    success: boolean;
    message?: string | null;
    route?: string | null;
    method?: string | null;
    statusCode?: number | null;
};

// Qualquer campo que pareça segredo (senha, token, chave de API, segredo) é censurado em qualquer nível do corpo da requisição.
const SECRET_KEY = /(pass|senha|secret|segredo|token|api[_-]?key|apikey|chave|authorization|credential|(^|[_-])key($|[_-]))/i;

const redactSecrets = (value: any, depth = 0): any => {
    if (depth > 6 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
    const clone: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
        clone[key] = SECRET_KEY.test(key) ? '[redacted]' : redactSecrets(item, depth + 1);
    }
    return clone;
};

const sanitizePayload = (value: any) => {
    if (!value || typeof value !== 'object') return value || {};
    return redactSecrets(value);
};

export const institutionalAuditService = {
    async ensureSchema() {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS action_audit_logs (
                id BIGSERIAL PRIMARY KEY,
                action VARCHAR(128) NOT NULL,
                requested_by VARCHAR(128) NOT NULL DEFAULT 'system',
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                result JSONB NOT NULL DEFAULT '{}'::jsonb,
                success BOOLEAN NOT NULL DEFAULT FALSE,
                vlan_id INTEGER,
                domain VARCHAR(255),
                ip INET,
                message TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            ALTER TABLE action_audit_logs ADD COLUMN IF NOT EXISTS actor_user_id BIGINT;
            ALTER TABLE action_audit_logs ADD COLUMN IF NOT EXISTS actor_ip TEXT;
            ALTER TABLE action_audit_logs ADD COLUMN IF NOT EXISTS actor_user_agent TEXT;
            ALTER TABLE action_audit_logs ADD COLUMN IF NOT EXISTS route TEXT;
            ALTER TABLE action_audit_logs ADD COLUMN IF NOT EXISTS method TEXT;
            ALTER TABLE action_audit_logs ADD COLUMN IF NOT EXISTS status_code INTEGER;

            CREATE INDEX IF NOT EXISTS idx_action_audit_logs_created_at ON action_audit_logs (created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_action_audit_logs_actor ON action_audit_logs (requested_by, created_at DESC);
        `);
    },

    async log(input: InstitutionalAuditInput) {
        await this.ensureSchema();
        await pool.query(
            `INSERT INTO action_audit_logs
                (action, requested_by, actor_user_id, actor_ip, actor_user_agent, payload, result, success, message, route, method, status_code)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12)`,
            [
                input.action,
                input.requestedBy || 'sistema',
                input.actorUserId || null,
                input.actorIp || null,
                input.actorUserAgent || null,
                JSON.stringify(sanitizePayload(input.payload)),
                JSON.stringify(input.result || {}),
                input.success,
                input.message || null,
                input.route || null,
                input.method || null,
                input.statusCode || null,
            ],
        );
    },
};
