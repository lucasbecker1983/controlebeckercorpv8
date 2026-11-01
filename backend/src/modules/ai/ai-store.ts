import { pool } from '../../config/db';
import { PROVIDERS, Provider } from './ai-env';

export type ModelStatus = 'unverified' | 'ok' | 'limited' | 'error' | 'gone';

export type ModelRow = {
    provider: Provider;
    model_id: string;
    display_name: string | null;
    context_length: number | null;
    params_b: number | null;
    free_basis: string;
    status: ModelStatus;
    supports_json: boolean | null;
    supports_tools: boolean | null;
    latency_ms: number | null;
    last_error: string | null;
    discovered_at: string;
    last_seen_at: string | null;
    last_probe_at: string | null;
    fail_count: number;
    score: number;
};

export type AiSettings = {
    order: Provider[];
    enabled: Record<Provider, boolean>;
};

const DEFAULT_SETTINGS: AiSettings = {
    order: ['gemini', 'groq', 'openrouter'],
    enabled: { gemini: true, groq: true, openrouter: true },
};

let ready: Promise<void> | null = null;

export const ensureSchema = () => {
    if (!ready) {
        ready = (async () => {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS ai_models (
                    provider TEXT NOT NULL,
                    model_id TEXT NOT NULL,
                    display_name TEXT,
                    context_length INTEGER,
                    params_b NUMERIC,
                    free_basis TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'unverified',
                    supports_json BOOLEAN,
                    supports_tools BOOLEAN,
                    latency_ms INTEGER,
                    last_error TEXT,
                    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_seen_at TIMESTAMPTZ,
                    last_probe_at TIMESTAMPTZ,
                    fail_count INTEGER NOT NULL DEFAULT 0,
                    score NUMERIC NOT NULL DEFAULT 0,
                    PRIMARY KEY (provider, model_id)
                )`);
            await pool.query(`
                CREATE TABLE IF NOT EXISTS ai_hunter_runs (
                    id SERIAL PRIMARY KEY,
                    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    finished_at TIMESTAMPTZ,
                    trigger TEXT NOT NULL,
                    summary JSONB,
                    error TEXT
                )`);
            await pool.query(`
                CREATE TABLE IF NOT EXISTS ai_settings (
                    key TEXT PRIMARY KEY,
                    value JSONB NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_by TEXT
                )`);
            await pool.query(`
                CREATE TABLE IF NOT EXISTS ai_chat_log (
                    id SERIAL PRIMARY KEY,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    username TEXT,
                    user_id INTEGER,
                    ip TEXT,
                    question TEXT,
                    provider TEXT,
                    model TEXT,
                    tools JSONB,
                    attempts JSONB,
                    ms INTEGER,
                    success BOOLEAN NOT NULL DEFAULT TRUE,
                    error TEXT,
                    answer_chars INTEGER
                )`);
            await pool.query(`
                CREATE TABLE IF NOT EXISTS ai_model_events (
                    id SERIAL PRIMARY KEY,
                    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    provider TEXT NOT NULL,
                    model_id TEXT NOT NULL,
                    event TEXT NOT NULL,
                    detail TEXT
                )`);
            await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_model_events_at ON ai_model_events (at DESC)');
            await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_chat_log_created ON ai_chat_log (created_at DESC)');
        })().catch((error) => {
            ready = null;
            throw error;
        });
    }
    return ready;
};

export const getSettings = async (): Promise<AiSettings> => {
    await ensureSchema();
    const { rows } = await pool.query("SELECT value FROM ai_settings WHERE key = 'providers'");
    const saved = rows[0]?.value || {};
    const order = Array.isArray(saved.order) ? saved.order.filter((p: string) => (PROVIDERS as string[]).includes(p)) : [];
    for (const p of PROVIDERS) if (!order.includes(p)) order.push(p);
    return {
        order,
        enabled: { ...DEFAULT_SETTINGS.enabled, ...(saved.enabled || {}) },
    };
};

export const saveSettings = async (settings: AiSettings, by: string) => {
    await ensureSchema();
    await pool.query(
        `INSERT INTO ai_settings (key, value, updated_by) VALUES ('providers', $1::jsonb, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
        [JSON.stringify(settings), by],
    );
};

export const listModels = async (provider?: Provider): Promise<ModelRow[]> => {
    await ensureSchema();
    const { rows } = await pool.query(
        `SELECT provider, model_id, display_name, context_length, params_b::float AS params_b, free_basis, status,
                supports_json, supports_tools, latency_ms, last_error, discovered_at, last_seen_at, last_probe_at,
                fail_count, score::float AS score
           FROM ai_models
          ${provider ? 'WHERE provider = $1' : ''}
          ORDER BY provider, (status = 'gone'), (status = 'error'), score DESC, model_id`,
        provider ? [provider] : [],
    );
    return rows as ModelRow[];
};

export const getModel = async (provider: Provider, modelId: string): Promise<ModelRow | null> => {
    await ensureSchema();
    const { rows } = await pool.query(
        `SELECT provider, model_id, status, free_basis, supports_json, score::float AS score
           FROM ai_models WHERE provider = $1 AND model_id = $2`,
        [provider, modelId],
    );
    return (rows[0] as ModelRow) || null;
};

export const logModelEvent = async (provider: string, modelId: string, event: string, detail?: string) => {
    await ensureSchema();
    await pool.query('INSERT INTO ai_model_events (provider, model_id, event, detail) VALUES ($1, $2, $3, $4)', [provider, modelId, event, detail ? detail.slice(0, 300) : null]);
};

export const listModelEvents = async (limit = 30) => {
    await ensureSchema();
    const { rows } = await pool.query('SELECT at, provider, model_id, event, detail FROM ai_model_events ORDER BY id DESC LIMIT $1', [limit]);
    return rows;
};

export const recordCallResult = async (provider: Provider, modelId: string, ok: boolean, ms: number, error?: string, kind?: string) => {
    await ensureSchema();
    const before = (await pool.query('SELECT status FROM ai_models WHERE provider = $1 AND model_id = $2', [provider, modelId])).rows[0]?.status as ModelStatus | undefined;
    if (ok) {
        await pool.query(
            `UPDATE ai_models SET status = 'ok', latency_ms = $3, last_error = NULL, fail_count = 0, last_probe_at = NOW()
              WHERE provider = $1 AND model_id = $2 AND status <> 'gone'`,
            [provider, modelId, ms],
        );
        if (before === 'error' || before === 'limited') await logModelEvent(provider, modelId, 'recuperou', `voltou a responder em ${ms} ms`);
        return;
    }
    const status: ModelStatus = kind === 'gone' ? 'gone' : kind === 'quota' ? 'limited' : 'error';
    await pool.query(
        `UPDATE ai_models SET status = $3, last_error = $4, fail_count = fail_count + 1, last_probe_at = NOW()
          WHERE provider = $1 AND model_id = $2`,
        [provider, modelId, status, String(error || '').slice(0, 300)],
    );
    if (status === 'gone' && before !== 'gone') await logModelEvent(provider, modelId, 'descontinuado', 'o provedor recusou o modelo (não existe mais ou foi aposentado)');
    else if (status === 'error' && before !== 'error') await logModelEvent(provider, modelId, 'falhou', String(error || '').slice(0, 200));
    else if (status === 'limited' && before !== 'limited') await logModelEvent(provider, modelId, 'sem cota', 'limite do plano gratuito atingido; volta a ser testado depois');
};

export const logChat = async (entry: {
    username?: string | null;
    userId?: number | null;
    ip?: string | null;
    question: string;
    provider?: string | null;
    model?: string | null;
    tools?: any;
    attempts?: any;
    ms: number;
    success: boolean;
    error?: string | null;
    answerChars?: number;
}) => {
    await ensureSchema();
    await pool.query(
        `INSERT INTO ai_chat_log (username, user_id, ip, question, provider, model, tools, attempts, ms, success, error, answer_chars)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12)`,
        [
            entry.username || null, entry.userId || null, entry.ip || null, entry.question.slice(0, 2000),
            entry.provider || null, entry.model || null, JSON.stringify(entry.tools || []), JSON.stringify(entry.attempts || []),
            Math.round(entry.ms), entry.success, entry.error ? String(entry.error).slice(0, 400) : null, entry.answerChars || 0,
        ],
    );
};

// Melhor modelo Gemini gratuito e saudável do catálogo; se o catálogo ainda estiver vazio, usa o nome do .env.
export const bestGeminiModel = async (fallback: string): Promise<string> => {
    try {
        await ensureSchema();
        const { rows } = await pool.query(
            `SELECT model_id FROM ai_models
              WHERE provider = 'gemini' AND status IN ('ok', 'unverified')
              ORDER BY (status = 'ok') DESC, score DESC LIMIT 1`,
        );
        return rows[0]?.model_id || fallback;
    } catch {
        return fallback;
    }
};
