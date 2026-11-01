import { pool } from '../../config/db';
import { getKey, PROVIDERS, Provider } from './ai-env';
import { AiError, chat, listProviderModels } from './ai-providers';
import { ensureSchema, listModels, logModelEvent, recordCallResult } from './ai-store';

/*
 * Caçador de modelos gratuitos. Roda no boot, a cada 6 horas e sob demanda (tela do GOD).
 *
 * Regra do projeto: SOMENTE modelos gratuitos. Duas travas:
 *  1. só entram no catálogo modelos que o provedor lista como gratuitos
 *     - OpenRouter: preço de entrada e de saída iguais a zero na própria listagem (prova objetiva);
 *     - Groq: todo modelo de chat do plano gratuito (sem cartão não há cobrança, só limite de uso);
 *     - Gemini: só as famílias flash/flash-lite e gemma, que têm cota gratuita; uma chamada recusada por cota zero
 *       marca o modelo como indisponível.
 *  2. o assistente só chama modelo que está no catálogo (ver ai-assistant.ts).
 */

const SIX_HOURS = 6 * 60 * 60 * 1000;
const PROBE_PER_PROVIDER = 4;
const REPROBE_OK_MS = 24 * 60 * 60 * 1000;
const REPROBE_FAIL_MS = 2 * 60 * 60 * 1000;

export type HuntSummary = {
    trigger: string;
    providers: Record<string, { listed?: number; free?: number; added?: number; gone?: number; probed?: number; ok?: number; skipped?: string; error?: string }>;
};

type Candidate = {
    model_id: string;
    display_name: string | null;
    context_length: number | null;
    params_b: number | null;
    free_basis: string;
    supports_json: boolean | null;
    supports_tools: boolean | null;
};

const paramsOf = (id: string): number | null => {
    const moe = id.match(/(\d+)x(\d+(?:\.\d+)?)b/i);
    if (moe) return Number(moe[1]) * Number(moe[2]);
    const m = id.match(/(?:^|[^a-z0-9])(\d+(?:\.\d+)?)b(?![a-z])/i);
    return m ? Number(m[1]) : null;
};

const scoreOf = (provider: Provider, c: Candidate) => {
    let score = 0;
    if (c.context_length) score += Math.min(Math.log2(Math.max(c.context_length, 4096) / 4096), 6);
    if (c.params_b) score += Math.min(Math.log2(c.params_b), 7) * 1.2;
    if (c.supports_tools) score += 1;
    if (c.supports_json) score += 1;
    // Modelos que "pensam em voz alta" quebram o formato JSON do assistente.
    if (/(^|[-_/])(r1|reason|reasoning|thinking|think|qwq)([-_:/]|$)/i.test(c.model_id)) score -= 3;
    if (provider === 'gemini') score += /flash-lite/.test(c.model_id) ? 2 : /flash/.test(c.model_id) ? 4 : 0;
    // Um modelo com data (ex.: -0827) ou "preview" some mais cedo.
    if (/preview|exp(erimental)?\b|-\d{4}$/.test(c.model_id)) score -= 1.5;
    return Math.round(score * 100) / 100;
};

const openRouterCandidates = (data: any): Candidate[] => {
    const out: Candidate[] = [];
    for (const item of data?.data || []) {
        const id = String(item?.id || '');
        if (!id || id.startsWith('openrouter/')) continue;
        const pricing = item?.pricing || {};
        const free = Number(pricing.prompt) === 0 && Number(pricing.completion) === 0 && Number(pricing.request ?? 0) === 0;
        if (!free) continue;
        const outputs: string[] = item?.architecture?.output_modalities || [];
        const inputs: string[] = item?.architecture?.input_modalities || [];
        if (outputs.length && !outputs.includes('text')) continue;
        if (inputs.length && !inputs.includes('text')) continue;
        // Classificadores de segurança, moderação, áudio e imagem não conversam: ficam fora do catálogo.
        if (/(embed|moderation|guard|safeguard|safety|tts|whisper|image-gen)/i.test(id)) continue;
        const sp: string[] = item?.supported_parameters || [];
        out.push({
            model_id: id,
            display_name: item?.name || null,
            context_length: Number(item?.context_length) || null,
            params_b: paramsOf(id),
            free_basis: 'preço zero na listagem do OpenRouter',
            supports_json: sp.includes('response_format') || sp.includes('structured_outputs'),
            supports_tools: sp.includes('tools'),
        });
    }
    return out;
};

const groqCandidates = (data: any): Candidate[] => {
    const out: Candidate[] = [];
    for (const item of data?.data || []) {
        const id = String(item?.id || '');
        if (!id || item?.active === false) continue;
        if (/(whisper|tts|guard|orpheus|playai|embed|compound|safeguard|vision-preview)/i.test(id)) continue;
        out.push({
            model_id: id,
            display_name: id,
            context_length: Number(item?.context_window) || null,
            params_b: paramsOf(id),
            free_basis: 'plano gratuito da Groq (sem cobrança, só limite de uso)',
            supports_json: true,
            supports_tools: true,
        });
    }
    return out;
};

const geminiCandidates = (data: any): Candidate[] => {
    const out: Candidate[] = [];
    for (const item of data?.models || []) {
        const id = String(item?.name || '').replace(/^models\//, '');
        const methods: string[] = item?.supportedGenerationMethods || [];
        if (!id || !methods.includes('generateContent')) continue;
        if (!/^(gemini-[\d.]+-flash(-lite)?(-[\w.]+)?|gemma-[\w.-]+)$/i.test(id)) continue;
        if (/(tts|image|embed|live|native-audio|robotics|computer-use|thinking)/i.test(id)) continue;
        out.push({
            model_id: id,
            display_name: item?.displayName || id,
            context_length: Number(item?.inputTokenLimit) || null,
            params_b: paramsOf(id),
            free_basis: 'cota gratuita do Google AI Studio (flash, flash-lite e gemma)',
            supports_json: !/gemma/i.test(id),
            supports_tools: !/gemma/i.test(id),
        });
    }
    return out;
};

const candidatesFor = (provider: Provider, data: any) => (
    provider === 'openrouter' ? openRouterCandidates(data) : provider === 'groq' ? groqCandidates(data) : geminiCandidates(data)
);

const upsert = async (provider: Provider, list: Candidate[]) => {
    const before = new Map((await pool.query('SELECT model_id, status FROM ai_models WHERE provider = $1', [provider])).rows.map((r: any) => [r.model_id, r.status as string]));
    const firstTime = before.size === 0;
    let added = 0;
    for (const c of list) {
        const score = scoreOf(provider, c);
        await pool.query(
            `INSERT INTO ai_models (provider, model_id, display_name, context_length, params_b, free_basis, supports_json, supports_tools, last_seen_at, score)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
             ON CONFLICT (provider, model_id) DO UPDATE SET
                display_name = EXCLUDED.display_name, context_length = EXCLUDED.context_length, params_b = EXCLUDED.params_b,
                free_basis = EXCLUDED.free_basis, supports_json = EXCLUDED.supports_json, supports_tools = EXCLUDED.supports_tools,
                last_seen_at = NOW(), score = EXCLUDED.score,
                -- Listado mas recusado pelo provedor na chamada: continua descartado por 7 dias (o Google ainda lista modelos aposentados).
                status = CASE
                    WHEN ai_models.status = 'gone' AND ai_models.last_error LIKE 'Modelo não existe%' AND ai_models.last_probe_at > NOW() - INTERVAL '7 days' THEN 'gone'
                    WHEN ai_models.status = 'gone' THEN 'unverified'
                    ELSE ai_models.status END`,
            [provider, c.model_id, c.display_name, c.context_length, c.params_b, c.free_basis, c.supports_json, c.supports_tools, score],
        );
        if (!before.has(c.model_id)) {
            added += 1;
            // Na primeira carga do provedor não é "novidade": é só o catálogo nascendo.
            if (!firstTime) await logModelEvent(provider, c.model_id, 'novo', `entrou no menu gratuito (${c.free_basis})`);
        } else if (before.get(c.model_id) === 'gone') {
            const now = (await pool.query('SELECT status FROM ai_models WHERE provider = $1 AND model_id = $2', [provider, c.model_id])).rows[0]?.status;
            if (now !== 'gone') await logModelEvent(provider, c.model_id, 'voltou', 'voltou a aparecer na lista gratuita do provedor');
        }
    }
    // Quem sumiu da listagem deixa de ser usado.
    const ids = new Set(list.map((c) => c.model_id));
    const vanished = Array.from(before.entries()).filter(([id, status]) => status !== 'gone' && !ids.has(id)).map(([id]) => id);
    for (const id of vanished) {
        await pool.query("UPDATE ai_models SET status = 'gone' WHERE provider = $1 AND model_id = $2", [provider, id]);
        await logModelEvent(provider, id, 'descontinuado', 'saiu da lista gratuita do provedor (aposentado, trocado ou deixou de ser grátis)');
    }
    return { added, gone: vanished.length };
};

const parseOk = (text: string) => {
    const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return false;
    try {
        return JSON.parse(match[0])?.ok === true;
    } catch {
        return false;
    }
};

const probe = async (provider: Provider, modelId: string, preferredGemini: string) => {
    try {
        const result = await chat(
            provider,
            modelId,
            [
                { role: 'system', content: 'Responda somente com um objeto JSON, sem texto fora dele.' },
                { role: 'user', content: 'Devolva exatamente {"ok":true}' },
            ],
            { json: provider !== 'openrouter', maxTokens: 600, timeoutMs: 45000, temperature: 0 },
        );
        if (!parseOk(result.text)) {
            await recordCallResult(provider, modelId, false, result.ms, 'Não seguiu o formato JSON pedido.', 'bad');
            return false;
        }
        await recordCallResult(provider, modelId, true, result.ms);
        return true;
    } catch (error: any) {
        const e = error as AiError;
        await recordCallResult(provider, modelId, false, 0, e?.message || 'falha', e?.kind);
        // Gemini devolvendo cota zero para um modelo "flash" significa que ele não é gratuito nesta conta.
        if (provider === 'gemini' && e?.kind === 'quota') {
            await pool.query("UPDATE ai_models SET last_error = $3 WHERE provider = $1 AND model_id = $2", [provider, modelId, `${e.message} (sem cota gratuita para este modelo)`]);
        }
        return false;
    } finally {
        void preferredGemini;
    }
};

let running = false;
let lastFinished = 0;
export const lastHuntAt = () => lastFinished;

export const hunt = async (trigger: 'boot' | 'agendado' | 'manual', by = 'sistema'): Promise<HuntSummary> => {
    const summary: HuntSummary = { trigger, providers: {} };
    if (running) throw new Error('O caçador já está rodando.');
    running = true;
    await ensureSchema();
    const run = await pool.query("INSERT INTO ai_hunter_runs (trigger) VALUES ($1) RETURNING id", [`${trigger}:${by}`]);
    let fatal: string | null = null;
    try {
        for (const provider of PROVIDERS) {
            const info: HuntSummary['providers'][string] = {};
            summary.providers[provider] = info;
            if (provider !== 'openrouter' && !getKey(provider)) {
                info.skipped = 'sem chave configurada';
                continue;
            }
            try {
                const data = await listProviderModels(provider);
                const list = candidatesFor(provider, data);
                info.listed = (data?.data || data?.models || []).length;
                info.free = list.length;
                // Trava contra falha momentânea do provedor: lista vazia, ou que faria sumir quase todo o catálogo, é ignorada.
                const known = (await listModels(provider)).filter((m) => m.status !== 'gone');
                const keep = new Set(list.map((c) => c.model_id));
                const wouldVanish = known.filter((m) => !keep.has(m.model_id)).length;
                if (!list.length || (known.length >= 5 && wouldVanish / known.length > 0.6)) {
                    info.error = `listagem suspeita (${list.length} gratuitos; sumiriam ${wouldVanish} de ${known.length}): catálogo mantido`;
                    continue;
                }
                const { added, gone } = await upsert(provider, list);
                info.added = added;
                info.gone = gone;
            } catch (error: any) {
                info.error = String(error?.message || error).slice(0, 200);
                continue;
            }
            // Só testa de verdade (gasta cota gratuita) quem tem chave e está vencido.
            if (!getKey(provider)) continue;
            const rows = (await listModels(provider)).filter((m) => m.status !== 'gone');
            const now = Date.now();
            const due = rows
                .filter((m) => {
                    const last = m.last_probe_at ? new Date(m.last_probe_at).getTime() : 0;
                    const wait = m.status === 'ok' ? REPROBE_OK_MS : m.last_probe_at ? REPROBE_FAIL_MS : 0;
                    return now - last >= wait;
                })
                .slice(0, PROBE_PER_PROVIDER);
            info.probed = 0;
            info.ok = 0;
            for (const model of due) {
                const ok = await probe(provider, model.model_id, process.env.GEMINI_MODEL || '');
                info.probed += 1;
                if (ok) info.ok += 1;
                await new Promise((resolve) => setTimeout(resolve, 1500));
            }
        }
    } catch (error: any) {
        fatal = String(error?.message || error).slice(0, 300);
    } finally {
        running = false;
        lastFinished = Date.now();
        await pool.query(
            'UPDATE ai_hunter_runs SET finished_at = NOW(), summary = $2::jsonb, error = $3 WHERE id = $1',
            [run.rows[0].id, JSON.stringify(summary), fatal],
        ).catch(() => null);
    }
    if (fatal) throw new Error(fatal);
    return summary;
};

export const isHunting = () => running;

export const lastRuns = async (limit = 5) => {
    await ensureSchema();
    const { rows } = await pool.query(
        'SELECT id, started_at, finished_at, trigger, summary, error FROM ai_hunter_runs ORDER BY id DESC LIMIT $1',
        [limit],
    );
    return rows;
};

let timer: NodeJS.Timeout | null = null;

export const startHunter = () => {
    if (timer) return;
    const first = setTimeout(() => {
        hunt('boot').catch((error) => console.error('[IA-CAÇADOR] Falha na primeira busca:', error?.message || error));
    }, 90 * 1000);
    first.unref?.();
    timer = setInterval(() => {
        hunt('agendado').catch((error) => console.error('[IA-CAÇADOR] Falha na busca agendada:', error?.message || error));
    }, SIX_HOURS);
    timer.unref?.();
};
