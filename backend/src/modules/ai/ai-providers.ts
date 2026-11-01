import { getKey, Provider } from './ai-env';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type AiErrorKind = 'nokey' | 'auth' | 'quota' | 'timeout' | 'server' | 'bad' | 'empty' | 'gone';

export class AiError extends Error {
    kind: AiErrorKind;
    status?: number;
    retryAfterMs?: number;
    constructor(kind: AiErrorKind, message: string, status?: number, retryAfterMs?: number) {
        super(message);
        this.kind = kind;
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}

export type ChatOptions = { json?: boolean; maxTokens?: number; timeoutMs?: number; temperature?: number };
export type ChatResult = { text: string; ms: number };

// Endereços podem ser trocados por variáveis de ambiente só para teste com servidor falso.
const BASE: Record<Provider, string> = {
    gemini: process.env.AI_GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
    groq: process.env.AI_GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    openrouter: process.env.AI_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
};

// Nunca deixa uma chave aparecer em mensagem de erro.
const scrub = (text: string) => String(text || '')
    .replace(/(AQ\.[0-9A-Za-z_-]{20,}|AIza[0-9A-Za-z_-]{20,}|gsk_[0-9A-Za-z]{20,}|sk-or-[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z_-]{20,})/g, '[chave]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

const classify = (status: number, body: string, headers: Headers): AiError => {
    const message = scrub(body);
    const retry = Number(headers.get('retry-after'));
    const retryAfterMs = Number.isFinite(retry) && retry > 0 ? retry * 1000 : undefined;
    // Modelo que o provedor aposentou, trocou de nome ou não conhece mais.
    if (status === 404 || /(model|modelo).{0,60}(not found|does not exist|deprecated|decommission|no longer|not supported)|decommission/i.test(message)) {
        return new AiError('gone', `Modelo não existe mais no provedor (HTTP ${status}). ${message}`, status);
    }
    if (status === 401 || status === 403 || /api key not valid|invalid api key|permission denied/i.test(message)) {
        return new AiError('auth', `Chave recusada pelo provedor (HTTP ${status}). ${message}`, status);
    }
    if (status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(message)) {
        return new AiError('quota', `Limite de uso do plano gratuito atingido (HTTP ${status}).`, status, retryAfterMs);
    }
    if (status === 408 || status === 504) return new AiError('timeout', `Provedor demorou demais (HTTP ${status}).`, status);
    if (status >= 500) return new AiError('server', `Falha no provedor (HTTP ${status}). ${message}`, status, retryAfterMs);
    return new AiError('bad', `Pedido recusado (HTTP ${status}). ${message}`, status);
};

const postJson = async (url: string, headers: Record<string, string>, payload: any, timeoutMs: number) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        const text = await res.text();
        if (!res.ok) throw classify(res.status, text, res.headers);
        try {
            return JSON.parse(text);
        } catch {
            throw new AiError('bad', 'Resposta do provedor não é JSON válido.');
        }
    } catch (error: any) {
        if (error instanceof AiError) throw error;
        if (error?.name === 'AbortError') throw new AiError('timeout', `Sem resposta em ${Math.round(timeoutMs / 1000)} s.`);
        throw new AiError('server', `Falha de rede: ${scrub(error?.cause?.code || error?.message || 'desconhecida')}`);
    } finally {
        clearTimeout(timer);
    }
};

const chatGemini = async (model: string, messages: ChatMessage[], opts: ChatOptions, key: string) => {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const data = await postJson(
        `${BASE.gemini}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { 'x-goog-api-key': key },
        {
            ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
            contents,
            generationConfig: {
                temperature: opts.temperature ?? 0.1,
                maxOutputTokens: opts.maxTokens ?? 1500,
                ...(opts.json ? { responseMimeType: 'application/json' } : {}),
            },
        },
        opts.timeoutMs ?? 30000,
    );
    const text = (data?.candidates?.[0]?.content?.parts || []).map((part: any) => String(part?.text || '')).join('\n').trim();
    if (!text) throw new AiError('empty', 'O modelo devolveu resposta vazia.');
    return text;
};

const chatOpenAiCompatible = async (provider: 'groq' | 'openrouter', model: string, messages: ChatMessage[], opts: ChatOptions, key: string) => {
    const data = await postJson(
        `${BASE[provider]}/chat/completions`,
        {
            Authorization: `Bearer ${key}`,
            ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://console.jacarezinho.app.br', 'X-Title': 'SGCG' } : {}),
        },
        {
            model,
            messages,
            temperature: opts.temperature ?? 0.1,
            max_tokens: opts.maxTokens ?? 1500,
            ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        },
        opts.timeoutMs ?? 30000,
    );
    const text = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!text) throw new AiError('empty', 'O modelo devolveu resposta vazia.');
    return text;
};

export const chat = async (provider: Provider, model: string, messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> => {
    const key = getKey(provider);
    if (!key) throw new AiError('nokey', 'Chave não configurada.');
    const started = Date.now();
    const text = provider === 'gemini'
        ? await chatGemini(model, messages, opts, key)
        : await chatOpenAiCompatible(provider, model, messages, opts, key);
    return { text, ms: Date.now() - started };
};

// Listagens de modelos (usadas pelo caçador).
const getJson = async (url: string, headers: Record<string, string>, timeoutMs = 20000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { headers, signal: controller.signal });
        const text = await res.text();
        if (!res.ok) throw classify(res.status, text, res.headers);
        return JSON.parse(text);
    } catch (error: any) {
        if (error instanceof AiError) throw error;
        if (error?.name === 'AbortError') throw new AiError('timeout', 'Listagem demorou demais.');
        throw new AiError('server', `Falha de rede: ${scrub(error?.cause?.code || error?.message || 'desconhecida')}`);
    } finally {
        clearTimeout(timer);
    }
};

export const listProviderModels = async (provider: Provider): Promise<any> => {
    const key = getKey(provider);
    if (provider === 'openrouter') return getJson(`${BASE.openrouter}/models`, key ? { Authorization: `Bearer ${key}` } : {});
    if (!key) throw new AiError('nokey', 'Chave não configurada.');
    if (provider === 'groq') return getJson(`${BASE.groq}/models`, { Authorization: `Bearer ${key}` });
    return getJson(`${BASE.gemini}/v1beta/models?pageSize=200`, { 'x-goog-api-key': key });
};
