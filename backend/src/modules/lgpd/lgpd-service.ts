import PDFDocument from 'pdfkit';
import { pool } from '../../config/db';

type LgpdActor = {
    username?: string | null;
    userId?: number | null;
    ipAddress?: string | null;
    userAgent?: string | null;
};

type LgpdAuditInput = {
    entityType: 'processing' | 'request' | 'incident' | 'program' | 'domain_policy';
    entityId?: number | null;
    action: string;
    actor?: LgpdActor;
    payload?: Record<string, unknown>;
    success?: boolean;
    message?: string | null;
};

const toJsonArray = (value: unknown) => {
    if (Array.isArray(value)) {
        return value
            .map((item) => String(item || '').trim())
            .filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(/[\n,;]+/)
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
};

const toBool = (value: unknown, fallback = false) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return fallback;
};

const normalizeProcessingPayload = (payload: any) => ({
    process_name: String(payload?.process_name || '').trim(),
    purpose: String(payload?.purpose || '').trim(),
    legal_basis: String(payload?.legal_basis || '').trim(),
    controller_name: String(payload?.controller_name || '').trim(),
    operator_name: String(payload?.operator_name || '').trim(),
    data_categories: toJsonArray(payload?.data_categories),
    data_subject_categories: toJsonArray(payload?.data_subject_categories),
    shared_with: toJsonArray(payload?.shared_with),
    storage_location: String(payload?.storage_location || '').trim(),
    retention_period: String(payload?.retention_period || '').trim(),
    security_measures: String(payload?.security_measures || '').trim(),
    international_transfer: toBool(payload?.international_transfer, false),
    transfer_details: String(payload?.transfer_details || '').trim(),
    risk_level: ['baixo', 'medio', 'alto', 'critico'].includes(String(payload?.risk_level || '').toLowerCase())
        ? String(payload?.risk_level || '').toLowerCase()
        : 'medio',
    status: ['mapeado', 'revisao', 'aprovado', 'suspenso'].includes(String(payload?.status || '').toLowerCase())
        ? String(payload?.status || '').toLowerCase()
        : 'mapeado',
});

const normalizeRequestPayload = (payload: any) => ({
    requester_name: String(payload?.requester_name || '').trim(),
    requester_email: String(payload?.requester_email || '').trim(),
    requester_document: String(payload?.requester_document || '').trim(),
    request_type: ['confirmacao', 'acesso', 'correcao', 'anonimizacao', 'eliminacao', 'portabilidade', 'informacao-compartilhamento', 'revogacao-consentimento', 'oposicao', 'outro'].includes(String(payload?.request_type || '').toLowerCase())
        ? String(payload?.request_type || '').toLowerCase()
        : 'acesso',
    status: ['recebido', 'em-analise', 'atendido', 'indeferido', 'encerrado'].includes(String(payload?.status || '').toLowerCase())
        ? String(payload?.status || '').toLowerCase()
        : 'recebido',
    due_date: payload?.due_date ? String(payload.due_date) : null,
    response_summary: String(payload?.response_summary || '').trim(),
    notes: String(payload?.notes || '').trim(),
});

const normalizeIncidentPayload = (payload: any) => ({
    title: String(payload?.title || '').trim(),
    severity: ['baixo', 'medio', 'alto', 'critico'].includes(String(payload?.severity || '').toLowerCase())
        ? String(payload?.severity || '').toLowerCase()
        : 'medio',
    status: ['aberto', 'investigacao', 'contido', 'comunicado', 'encerrado'].includes(String(payload?.status || '').toLowerCase())
        ? String(payload?.status || '').toLowerCase()
        : 'aberto',
    occurred_at: payload?.occurred_at ? String(payload.occurred_at) : null,
    reported_at: payload?.reported_at ? String(payload.reported_at) : null,
    affected_data: toJsonArray(payload?.affected_data),
    affected_subjects_estimate: Number(payload?.affected_subjects_estimate || 0) || 0,
    authority_notified: toBool(payload?.authority_notified, false),
    authority_notified_at: payload?.authority_notified_at ? String(payload.authority_notified_at) : null,
    summary: String(payload?.summary || '').trim(),
    containment_actions: String(payload?.containment_actions || '').trim(),
    notes: String(payload?.notes || '').trim(),
});

const normalizeProgramSettingsPayload = (payload: any) => ({
    controller_name: String(payload?.controller_name || '').trim(),
    controller_unit: String(payload?.controller_unit || '').trim(),
    controller_email: String(payload?.controller_email || '').trim(),
    dpo_name: String(payload?.dpo_name || '').trim(),
    dpo_email: String(payload?.dpo_email || '').trim(),
    dpo_phone: String(payload?.dpo_phone || '').trim(),
    data_subject_channel: String(payload?.data_subject_channel || '').trim(),
    privacy_notice_url: String(payload?.privacy_notice_url || '').trim(),
    review_frequency_days: Math.max(30, Number(payload?.review_frequency_days || 180) || 180),
    last_review_at: payload?.last_review_at ? String(payload.last_review_at) : null,
    notes: String(payload?.notes || '').trim(),
});

const requireFields = (payload: Record<string, any>, fields: string[]) => {
    const missing = fields.find((field) => !String(payload[field] || '').trim());
    if (missing) throw new Error(`Campo obrigatório ausente: ${missing}`);
};

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

export const lgpdService = {
    async ensureSchema() {
        if (schemaReady) return;
        if (schemaPromise) return schemaPromise;

        schemaPromise = (async () => {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS lgpd_processing_activities (
                    id BIGSERIAL PRIMARY KEY,
                    process_name TEXT NOT NULL,
                    purpose TEXT NOT NULL,
                    legal_basis TEXT NOT NULL,
                    controller_name TEXT,
                    operator_name TEXT,
                    data_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
                    data_subject_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
                    shared_with JSONB NOT NULL DEFAULT '[]'::jsonb,
                    storage_location TEXT,
                    retention_period TEXT,
                    security_measures TEXT,
                    international_transfer BOOLEAN NOT NULL DEFAULT FALSE,
                    transfer_details TEXT,
                    risk_level TEXT NOT NULL DEFAULT 'medio',
                    status TEXT NOT NULL DEFAULT 'mapeado',
                    created_by TEXT,
                    updated_by TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS lgpd_data_subject_requests (
                    id BIGSERIAL PRIMARY KEY,
                    requester_name TEXT NOT NULL,
                    requester_email TEXT,
                    requester_document TEXT,
                    request_type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'recebido',
                    due_date DATE,
                    response_summary TEXT,
                    notes TEXT,
                    created_by TEXT,
                    updated_by TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

            CREATE TABLE IF NOT EXISTS lgpd_incidents (
                id BIGSERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'medio',
                status TEXT NOT NULL DEFAULT 'aberto',
                occurred_at TIMESTAMPTZ,
                reported_at TIMESTAMPTZ,
                affected_data JSONB NOT NULL DEFAULT '[]'::jsonb,
                affected_subjects_estimate INTEGER NOT NULL DEFAULT 0,
                authority_notified BOOLEAN NOT NULL DEFAULT FALSE,
                authority_notified_at TIMESTAMPTZ,
                summary TEXT,
                containment_actions TEXT,
                notes TEXT,
                created_by TEXT,
                updated_by TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS lgpd_audit_logs (
                id BIGSERIAL PRIMARY KEY,
                entity_type TEXT NOT NULL,
                entity_id BIGINT,
                action TEXT NOT NULL,
                actor_username TEXT,
                actor_user_id BIGINT,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                success BOOLEAN NOT NULL DEFAULT TRUE,
                message TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            ALTER TABLE lgpd_audit_logs ADD COLUMN IF NOT EXISTS actor_ip TEXT;
            ALTER TABLE lgpd_audit_logs ADD COLUMN IF NOT EXISTS actor_user_agent TEXT;

            CREATE TABLE IF NOT EXISTS lgpd_program_settings (
                id SMALLINT PRIMARY KEY DEFAULT 1,
                controller_name TEXT,
                controller_unit TEXT,
                controller_email TEXT,
                dpo_name TEXT,
                dpo_email TEXT,
                dpo_phone TEXT,
                data_subject_channel TEXT,
                privacy_notice_url TEXT,
                review_frequency_days INTEGER NOT NULL DEFAULT 180,
                last_review_at TIMESTAMPTZ,
                notes TEXT,
                updated_by TEXT,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT lgpd_program_settings_singleton CHECK (id = 1)
            );

            CREATE INDEX IF NOT EXISTS idx_lgpd_processing_created_at ON lgpd_processing_activities(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_lgpd_processing_status ON lgpd_processing_activities(status);
            CREATE INDEX IF NOT EXISTS idx_lgpd_requests_created_at ON lgpd_data_subject_requests(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_lgpd_requests_status ON lgpd_data_subject_requests(status);
            CREATE INDEX IF NOT EXISTS idx_lgpd_incidents_created_at ON lgpd_incidents(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_lgpd_incidents_status ON lgpd_incidents(status);
            CREATE INDEX IF NOT EXISTS idx_lgpd_audit_created_at ON lgpd_audit_logs(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_lgpd_audit_entity ON lgpd_audit_logs(entity_type, entity_id);

            REVOKE ALL ON TABLE lgpd_processing_activities FROM PUBLIC;
            REVOKE ALL ON TABLE lgpd_data_subject_requests FROM PUBLIC;
            REVOKE ALL ON TABLE lgpd_incidents FROM PUBLIC;
            REVOKE ALL ON TABLE lgpd_audit_logs FROM PUBLIC;
            REVOKE ALL ON TABLE lgpd_program_settings FROM PUBLIC;

            INSERT INTO lgpd_program_settings (id)
            VALUES (1)
            ON CONFLICT (id) DO NOTHING;
        `);
        })();

        try {
            await schemaPromise;
            schemaReady = true;
        } finally {
            schemaPromise = null;
        }
    },

    async logAudit(input: LgpdAuditInput) {
        await this.ensureSchema();
        await pool.query(
            `INSERT INTO lgpd_audit_logs
                (entity_type, entity_id, action, actor_username, actor_user_id, actor_ip, actor_user_agent, payload, success, message)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
            [
                input.entityType,
                input.entityId || null,
                input.action,
                input.actor?.username || 'sistema',
                input.actor?.userId || null,
                input.actor?.ipAddress || null,
                input.actor?.userAgent || null,
                JSON.stringify(input.payload || {}),
                input.success !== false,
                input.message || null,
            ],
        );
    },

    async getDashboard() {
        await this.ensureSchema();
        const [processing, requests, incidents, audit, authSummary, rightsSummary, programSettings] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE status = 'aprovado')::int AS approved,
                    COUNT(*) FILTER (WHERE risk_level IN ('alto','critico'))::int AS high_risk,
                    COUNT(*) FILTER (WHERE international_transfer = TRUE)::int AS transfers,
                    COUNT(*) FILTER (
                        WHERE COALESCE(retention_period, '') = ''
                           OR COALESCE(security_measures, '') = ''
                           OR COALESCE(controller_name, '') = ''
                    )::int AS missing_safeguards
                FROM lgpd_processing_activities
            `),
            pool.query(`
                SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE status IN ('recebido','em-analise'))::int AS open,
                    COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date < CURRENT_DATE AND status NOT IN ('atendido','indeferido','encerrado'))::int AS overdue
                FROM lgpd_data_subject_requests
            `),
            pool.query(`
                SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE status <> 'encerrado')::int AS open,
                    COUNT(*) FILTER (WHERE authority_notified = TRUE)::int AS notified,
                    COUNT(*) FILTER (
                        WHERE status <> 'encerrado'
                          AND severity IN ('alto','critico')
                          AND authority_notified = FALSE
                    )::int AS pending_notification
                FROM lgpd_incidents
            `),
            pool.query(`SELECT id, entity_type, action, actor_username, success, message, created_at FROM lgpd_audit_logs ORDER BY created_at DESC LIMIT 10`),
            pool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE action = 'auth.login' AND success = TRUE)::int AS auth_success,
                    COUNT(*) FILTER (WHERE success = FALSE)::int AS auth_failures
                FROM auth_activity_logs
                WHERE created_at >= NOW() - INTERVAL '30 days'
            `).catch(() => ({ rows: [{ auth_success: 0, auth_failures: 0 }] })),
            pool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE request_type = 'confirmacao')::int AS confirmacao,
                    COUNT(*) FILTER (WHERE request_type = 'acesso')::int AS acesso,
                    COUNT(*) FILTER (WHERE request_type = 'correcao')::int AS correcao,
                    COUNT(*) FILTER (WHERE request_type = 'anonimizacao')::int AS anonimizacao,
                    COUNT(*) FILTER (WHERE request_type = 'eliminacao')::int AS eliminacao,
                    COUNT(*) FILTER (WHERE request_type = 'portabilidade')::int AS portabilidade,
                    COUNT(*) FILTER (WHERE request_type = 'informacao-compartilhamento')::int AS informacao_compartilhamento,
                    COUNT(*) FILTER (WHERE request_type = 'revogacao-consentimento')::int AS revogacao_consentimento,
                    COUNT(*) FILTER (WHERE request_type = 'oposicao')::int AS oposicao
                FROM lgpd_data_subject_requests
            `),
            pool.query(`SELECT * FROM lgpd_program_settings WHERE id = 1`),
        ]);

        return {
            summary: {
                processing: processing.rows[0] || { total: 0, approved: 0, high_risk: 0, transfers: 0, missing_safeguards: 0 },
                requests: requests.rows[0] || { total: 0, open: 0, overdue: 0 },
                incidents: incidents.rows[0] || { total: 0, open: 0, notified: 0, pending_notification: 0 },
                auth: authSummary.rows[0] || { auth_success: 0, auth_failures: 0 },
                rights: rightsSummary.rows[0] || {},
            },
            program: programSettings.rows[0] || null,
            recent_audit: audit.rows,
        };
    },

    async getProgramSettings() {
        await this.ensureSchema();
        const { rows } = await pool.query(`SELECT * FROM lgpd_program_settings WHERE id = 1`);
        return rows[0] || null;
    },

    async upsertProgramSettings(payload: any, actor: LgpdActor) {
        await this.ensureSchema();
        const data = normalizeProgramSettingsPayload(payload);

        const { rows } = await pool.query(
            `UPDATE lgpd_program_settings
             SET controller_name = $1,
                 controller_unit = $2,
                 controller_email = $3,
                 dpo_name = $4,
                 dpo_email = $5,
                 dpo_phone = $6,
                 data_subject_channel = $7,
                 privacy_notice_url = $8,
                 review_frequency_days = $9,
                 last_review_at = $10,
                 notes = $11,
                 updated_by = $12,
                 updated_at = NOW()
             WHERE id = 1
             RETURNING *`,
            [
                data.controller_name || null,
                data.controller_unit || null,
                data.controller_email || null,
                data.dpo_name || null,
                data.dpo_email || null,
                data.dpo_phone || null,
                data.data_subject_channel || null,
                data.privacy_notice_url || null,
                data.review_frequency_days,
                data.last_review_at,
                data.notes || null,
                actor.username || null,
            ],
        );

        await this.logAudit({
            entityType: 'program',
            entityId: 1,
            action: 'program.update',
            actor,
            payload: data,
            message: 'Configuração institucional do programa LGPD atualizada.',
        });

        return rows[0];
    },

    async listProcessingActivities() {
        await this.ensureSchema();
        const { rows } = await pool.query(`
            SELECT *
            FROM lgpd_processing_activities
            ORDER BY updated_at DESC, created_at DESC
        `);
        return rows;
    },

    async upsertProcessingActivity(payload: any, actor: LgpdActor, id?: number) {
        await this.ensureSchema();
        const data = normalizeProcessingPayload(payload);
        requireFields(data, ['process_name', 'purpose', 'legal_basis']);

        if (id) {
            const { rows } = await pool.query(
                `UPDATE lgpd_processing_activities
                 SET process_name = $1,
                     purpose = $2,
                     legal_basis = $3,
                     controller_name = $4,
                     operator_name = $5,
                     data_categories = $6::jsonb,
                     data_subject_categories = $7::jsonb,
                     shared_with = $8::jsonb,
                     storage_location = $9,
                     retention_period = $10,
                     security_measures = $11,
                     international_transfer = $12,
                     transfer_details = $13,
                     risk_level = $14,
                     status = $15,
                     updated_by = $16,
                     updated_at = NOW()
                 WHERE id = $17
                 RETURNING *`,
                [
                    data.process_name,
                    data.purpose,
                    data.legal_basis,
                    data.controller_name || null,
                    data.operator_name || null,
                    JSON.stringify(data.data_categories),
                    JSON.stringify(data.data_subject_categories),
                    JSON.stringify(data.shared_with),
                    data.storage_location || null,
                    data.retention_period || null,
                    data.security_measures || null,
                    data.international_transfer,
                    data.transfer_details || null,
                    data.risk_level,
                    data.status,
                    actor.username || null,
                    id,
                ],
            );
            if (!rows[0]) throw new Error('Atividade de tratamento não encontrada.');
            await this.logAudit({ entityType: 'processing', entityId: id, action: 'update', actor, payload: data, message: 'Atividade de tratamento atualizada.' });
            return rows[0];
        }

        const { rows } = await pool.query(
            `INSERT INTO lgpd_processing_activities
                (process_name, purpose, legal_basis, controller_name, operator_name, data_categories, data_subject_categories, shared_with, storage_location, retention_period, security_measures, international_transfer, transfer_details, risk_level, status, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             RETURNING *`,
            [
                data.process_name,
                data.purpose,
                data.legal_basis,
                data.controller_name || null,
                data.operator_name || null,
                JSON.stringify(data.data_categories),
                JSON.stringify(data.data_subject_categories),
                JSON.stringify(data.shared_with),
                data.storage_location || null,
                data.retention_period || null,
                data.security_measures || null,
                data.international_transfer,
                data.transfer_details || null,
                data.risk_level,
                data.status,
                actor.username || null,
                actor.username || null,
            ],
        );
        await this.logAudit({ entityType: 'processing', entityId: rows[0]?.id, action: 'create', actor, payload: data, message: 'Atividade de tratamento criada.' });
        return rows[0];
    },

    async listRequests() {
        await this.ensureSchema();
        const { rows } = await pool.query(`
            SELECT *
            FROM lgpd_data_subject_requests
            ORDER BY updated_at DESC, created_at DESC
        `);
        return rows;
    },

    async upsertRequest(payload: any, actor: LgpdActor, id?: number) {
        await this.ensureSchema();
        const data = normalizeRequestPayload(payload);
        requireFields(data, ['requester_name', 'request_type']);

        if (id) {
            const { rows } = await pool.query(
                `UPDATE lgpd_data_subject_requests
                 SET requester_name = $1,
                     requester_email = $2,
                     requester_document = $3,
                     request_type = $4,
                     status = $5,
                     due_date = $6,
                     response_summary = $7,
                     notes = $8,
                     updated_by = $9,
                     updated_at = NOW()
                 WHERE id = $10
                 RETURNING *`,
                [
                    data.requester_name,
                    data.requester_email || null,
                    data.requester_document || null,
                    data.request_type,
                    data.status,
                    data.due_date,
                    data.response_summary || null,
                    data.notes || null,
                    actor.username || null,
                    id,
                ],
            );
            if (!rows[0]) throw new Error('Solicitação do titular não encontrada.');
            await this.logAudit({ entityType: 'request', entityId: id, action: 'update', actor, payload: data, message: 'Solicitação do titular atualizada.' });
            return rows[0];
        }

        const { rows } = await pool.query(
            `INSERT INTO lgpd_data_subject_requests
                (requester_name, requester_email, requester_document, request_type, status, due_date, response_summary, notes, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING *`,
            [
                data.requester_name,
                data.requester_email || null,
                data.requester_document || null,
                data.request_type,
                data.status,
                data.due_date,
                data.response_summary || null,
                data.notes || null,
                actor.username || null,
                actor.username || null,
            ],
        );
        await this.logAudit({ entityType: 'request', entityId: rows[0]?.id, action: 'create', actor, payload: data, message: 'Solicitação do titular criada.' });
        return rows[0];
    },

    async listIncidents() {
        await this.ensureSchema();
        const { rows } = await pool.query(`
            SELECT *
            FROM lgpd_incidents
            ORDER BY updated_at DESC, created_at DESC
        `);
        return rows;
    },

    async upsertIncident(payload: any, actor: LgpdActor, id?: number) {
        await this.ensureSchema();
        const data = normalizeIncidentPayload(payload);
        requireFields(data, ['title']);

        if (id) {
            const { rows } = await pool.query(
                `UPDATE lgpd_incidents
                 SET title = $1,
                     severity = $2,
                     status = $3,
                     occurred_at = $4,
                     reported_at = $5,
                     affected_data = $6::jsonb,
                     affected_subjects_estimate = $7,
                     authority_notified = $8,
                     authority_notified_at = $9,
                     summary = $10,
                     containment_actions = $11,
                     notes = $12,
                     updated_by = $13,
                     updated_at = NOW()
                 WHERE id = $14
                 RETURNING *`,
                [
                    data.title,
                    data.severity,
                    data.status,
                    data.occurred_at,
                    data.reported_at,
                    JSON.stringify(data.affected_data),
                    data.affected_subjects_estimate,
                    data.authority_notified,
                    data.authority_notified_at,
                    data.summary || null,
                    data.containment_actions || null,
                    data.notes || null,
                    actor.username || null,
                    id,
                ],
            );
            if (!rows[0]) throw new Error('Incidente LGPD não encontrado.');
            await this.logAudit({ entityType: 'incident', entityId: id, action: 'update', actor, payload: data, message: 'Incidente LGPD atualizado.' });
            return rows[0];
        }

        const { rows } = await pool.query(
            `INSERT INTO lgpd_incidents
                (title, severity, status, occurred_at, reported_at, affected_data, affected_subjects_estimate, authority_notified, authority_notified_at, summary, containment_actions, notes, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14)
             RETURNING *`,
            [
                data.title,
                data.severity,
                data.status,
                data.occurred_at,
                data.reported_at,
                JSON.stringify(data.affected_data),
                data.affected_subjects_estimate,
                data.authority_notified,
                data.authority_notified_at,
                data.summary || null,
                data.containment_actions || null,
                data.notes || null,
                actor.username || null,
                actor.username || null,
            ],
        );
        await this.logAudit({ entityType: 'incident', entityId: rows[0]?.id, action: 'create', actor, payload: data, message: 'Incidente LGPD criado.' });
        return rows[0];
    },

    async exportInventoryPdf(activities: any[], program: any) {
        const ENTITY = 'Secretaria de Comércio, Indústria, Serviços e Inovação';
        const SYSTEM = 'SGCG — Sistema de Governança e Controle Governamental';
        const LOGO_PATH = '/opt/controlebeckercorp-v8/frontend/public/jmb-logo-clean.png';
        const W = 511;
        const M = 42;
        const fmtDate = (d: any) => {
            if (!d) return '—';
            return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }).replace(',', '');
        };
        const riskLabel: Record<string, string> = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto', critico: 'Crítico' };
        const statusLabel: Record<string, string> = { mapeado: 'Mapeado', revisao: 'Em revisão', aprovado: 'Aprovado', suspenso: 'Suspenso' };

        return new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true });
            const chunks: Buffer[] = [];
            doc.on('data', (c: Buffer) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            let y = M;
            let pageNum = 1;

            const drawHeader = () => {
                doc.rect(M, y, W, 74).fillColor('#0f172a').fill();
                doc.fillColor('#f1f5f9').font('Helvetica-Bold').fontSize(11)
                    .text('PREFEITURA MUNICIPAL DE JACAREZINHO — PARANÁ', M + 12, y + 8, { width: W - 24 });
                doc.fillColor('#cbd5e1').font('Helvetica').fontSize(8.5)
                    .text(ENTITY, M + 12, y + 26, { width: W - 24 });
                doc.fillColor('#64748b').font('Helvetica').fontSize(7.5)
                    .text(SYSTEM, M + 12, y + 42, { width: W - 24 });
                doc.fillColor('#86efac').font('Helvetica-Bold').fontSize(9)
                    .text('Inventário de Operações de Tratamento — Art. 37, Lei nº 13.709/2018 (LGPD)', M + 12, y + 57, { width: W - 24 });
                y += 84;
                doc.rect(M, y, W, 18).fillColor('#14532d').fill();
                doc.fillColor('#86efac').font('Helvetica').fontSize(7)
                    .text('⚖  Art. 37: Registro das operações de tratamento   ·   Art. 46: Medidas de segurança e prevenção   ·   Lei nº 13.709/2018 (LGPD)', M + 8, y + 5, { width: W - 16 });
                y += 26;
            };

            drawHeader();

            if (program?.controller_name) {
                doc.rect(M, y, W, 28).fillColor('#f8fafc').fillAndStroke('#e2e8f0').fill();
                doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7.5).text(`Controlador: ${program.controller_name}   |   Unidade: ${program.controller_unit || '—'}   |   DPO: ${program.dpo_name || '—'}`, M + 10, y + 6, { width: W - 20 });
                doc.fillColor('#64748b').font('Helvetica').fontSize(7).text(`Emitido em: ${fmtDate(new Date())}   |   Última revisão: ${fmtDate(program.last_review_at)}   |   Frequência: ${program.review_frequency_days || 180} dias`, M + 10, y + 17, { width: W - 20 });
                y += 36;
            }

            const total = activities.length;
            const approved = activities.filter((a) => a.status === 'aprovado').length;
            const highRisk = activities.filter((a) => ['alto', 'critico'].includes(a.risk_level)).length;
            const stats = [['Total de tratamentos', total], ['Aprovados formalmente', approved], ['Alto risco / Crítico', highRisk]];
            let sx = M;
            const cw = (W - 8) / 3;
            for (const [label, val] of stats) {
                doc.roundedRect(sx, y, cw - 4, 34, 3).fillAndStroke('#f8fafc', '#e2e8f0');
                doc.fillColor('#64748b').font('Helvetica').fontSize(6.5).text(String(label).toUpperCase(), sx + 8, y + 6, { width: cw - 16 });
                doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text(String(val), sx + 8, y + 17, { width: cw - 16 });
                sx += cw;
            }
            y += 42;

            const cols = [
                { label: 'Processo / Finalidade', w: 148 },
                { label: 'Base Legal', w: 92 },
                { label: 'Risco', w: 48 },
                { label: 'Status', w: 58 },
                { label: 'Retenção', w: 74 },
                { label: 'Controlador', w: 91 },
            ];

            const drawTableHeader = () => {
                doc.rect(M, y, W, 18).fillColor('#334155').fill();
                let cx = M;
                for (const c of cols) {
                    doc.fillColor('#e2e8f0').font('Helvetica-Bold').fontSize(7).text(c.label, cx + 4, y + 5, { width: c.w - 8 });
                    cx += c.w;
                }
                y += 22;
            };

            drawTableHeader();

            let row = 0;
            for (const a of activities) {
                if (y > 760) {
                    doc.moveTo(M, 775).lineTo(M + W, 775).strokeColor('#e2e8f0').stroke();
                    try { doc.image(LOGO_PATH, M + W - 132, 772, { width: 46, height: 20 }); } catch (_) {}
                    doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7)
                        .text('JMB Tecnologia', M + W - 82, 777, { width: 82, align: 'right' });
                    doc.fillColor('#64748b').font('Helvetica').fontSize(6.5)
                        .text(`Página ${pageNum}`, M + W - 82, 787, { width: 82, align: 'right' });
                    doc.addPage({ size: 'A4', margin: M });
                    pageNum++;
                    y = M;
                    drawTableHeader();
                }
                const isHigh = ['alto', 'critico'].includes(a.risk_level);
                doc.rect(M, y, W, 20).fillColor(row % 2 === 0 ? '#f8fafc' : '#fff').fill();
                if (isHigh) doc.rect(M, y, 3, 20).fillColor('#ef4444').fill();
                const purpose = String(a.purpose || '').substring(0, 35);
                const cells = [
                    `${String(a.process_name || '—').substring(0, 28)}${purpose ? `\n${purpose}` : ''}`,
                    String(a.legal_basis || '—').substring(0, 22),
                    riskLabel[a.risk_level] || a.risk_level || '—',
                    statusLabel[a.status] || a.status || '—',
                    String(a.retention_period || '—').substring(0, 18),
                    String(a.controller_name || '—').substring(0, 22),
                ];
                let cx = M;
                for (let i = 0; i < cols.length; i++) {
                    const color = i === 2 && isHigh ? '#dc2626' : '#1e293b';
                    doc.fillColor(color).font(i === 2 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
                        .text(cells[i], cx + 4, y + 5, { width: cols[i].w - 8, ellipsis: true });
                    cx += cols[i].w;
                }
                y += 20;
                row++;
            }

            doc.moveTo(M, 775).lineTo(M + W, 775).strokeColor('#e2e8f0').stroke();
            doc.fillColor('#64748b').font('Helvetica').fontSize(7)
                .text(`Gerado em ${fmtDate(new Date())} • Documento de uso institucional restrito — LGPD Art. 37`, M, 780, { width: 300 });
            try { doc.image(LOGO_PATH, M + W - 132, 772, { width: 46, height: 20 }); } catch (_) {}
            doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7)
                .text('JMB Tecnologia', M + W - 82, 777, { width: 82, align: 'right' });
            doc.fillColor('#64748b').font('Helvetica').fontSize(6.5)
                .text(`Página ${pageNum}`, M + W - 82, 787, { width: 82, align: 'right' });
            doc.end();
        });
    },

    async listAuditLogs(limit = 120) {
        await this.ensureSchema();
        const safeLimit = Math.max(1, Math.min(Number(limit || 120), 300));
        const { rows } = await pool.query(
            `SELECT * FROM lgpd_audit_logs ORDER BY created_at DESC LIMIT $1`,
            [safeLimit],
        );
        return rows;
    },
};
