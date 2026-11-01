import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';

/*
 * Chaves dos provedores de IA. Regra do projeto: segredo só no .env (nunca no banco, nunca em resposta da API).
 * Este módulo lê do ambiente do processo e, quando o GOD troca uma chave pela tela, grava no .env de forma atômica
 * (arquivo temporário no mesmo diretório e rename, modo 0600) e atualiza o processo sem reiniciar.
 */

export type Provider = 'gemini' | 'groq' | 'openrouter';
export const PROVIDERS: Provider[] = ['gemini', 'groq', 'openrouter'];

export const PROVIDER_LABEL: Record<Provider, string> = {
    gemini: 'Google Gemini',
    groq: 'Groq',
    openrouter: 'OpenRouter',
};

const ENV_NAME: Record<Provider, string> = {
    gemini: 'GEMINI_API_KEY',
    groq: 'GROQ_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
};

// Formato mínimo de cada chave: só para recusar colagem errada (espaços, aspas, texto de outro campo).
const KEY_SHAPE: Record<Provider, RegExp> = {
    gemini: /^AIza[0-9A-Za-z_-]{20,}$/,
    groq: /^gsk_[0-9A-Za-z]{20,}$/,
    openrouter: /^sk-or-[0-9A-Za-z_-]{20,}$/,
};

const ENV_FILE = path.resolve(__dirname, '../../../.env');

export const getKey = (provider: Provider): string => String(process.env[ENV_NAME[provider]] || '').trim();

export const keyStatus = (provider: Provider) => {
    const key = getKey(provider);
    return { configured: Boolean(key), hint: key ? `••••${key.slice(-4)}` : null };
};

const applyToProcess = (provider: Provider, value: string) => {
    process.env[ENV_NAME[provider]] = value;
    // O resto do sistema (RAG antigo) lê a chave do Gemini do objeto env, que foi montado no boot.
    if (provider === 'gemini') (env as any).geminiApiKey = value;
};

const writeEnvLine = (name: string, value: string) => {
    const original = fs.readFileSync(ENV_FILE, 'utf-8');
    const lines = original.split('\n');
    const line = `${name}=${value}`;
    const idx = lines.findIndex((item) => item.startsWith(`${name}=`));
    if (idx >= 0) lines[idx] = line;
    else {
        if (lines.length && lines[lines.length - 1] === '') lines.splice(lines.length - 1, 0, line);
        else lines.push(line);
    }
    const next = lines.join('\n');
    const tmp = `${ENV_FILE}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, next, { mode: 0o600 });
    // Confere antes de trocar: nenhuma outra linha pode ter mudado.
    const before = original.split('\n').filter((item) => !item.startsWith(`${name}=`));
    const after = fs.readFileSync(tmp, 'utf-8').split('\n').filter((item) => !item.startsWith(`${name}=`));
    if (before.join('\n') !== after.join('\n')) {
        fs.unlinkSync(tmp);
        throw new Error('Conferência do .env falhou; nada foi gravado.');
    }
    fs.renameSync(tmp, ENV_FILE);
};

export const setKey = (provider: Provider, rawValue: string) => {
    const value = String(rawValue || '').trim();
    if (!KEY_SHAPE[provider].test(value)) {
        throw new Error(`A chave não tem o formato esperado do ${PROVIDER_LABEL[provider]}. Cole só a chave, sem espaços, aspas ou quebra de linha.`);
    }
    writeEnvLine(ENV_NAME[provider], value);
    applyToProcess(provider, value);
};

export const clearKey = (provider: Provider) => {
    writeEnvLine(ENV_NAME[provider], '');
    applyToProcess(provider, '');
};

// Quem é "GOD": papel god, ou usuário listado em GOD_USERS no .env (separados por vírgula).
export const isGod = (auth?: { username?: string; role?: string } | null) => {
    if (!auth) return false;
    if (String(auth.role || '').trim().toLowerCase() === 'god') return true;
    const allowed = String(process.env.GOD_USERS || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
    return allowed.includes(String(auth.username || '').trim().toLowerCase());
};

export const isAdmin = (auth?: { username?: string; role?: string } | null) => {
    if (!auth) return false;
    return ['admin', 'god'].includes(String(auth.role || '').trim().toLowerCase()) || isGod(auth);
};
