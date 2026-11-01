/*
 * Pseudonimização dos dados que vão para provedores externos de IA (todos gratuitos, sem garantia de que não
 * guardam o que recebem). O modelo vê códigos (PESSOA_1, IPPUB_2, CPF_1...) e responde com os mesmos códigos; o
 * sistema troca de volta pelos valores reais só na resposta mostrada ao operador. Os dados reais nunca saem.
 */

const PREFIX = { PESSOA: 'PESSOA', EMAIL: 'EMAIL', CPF: 'CPF', CNPJ: 'CNPJ', TEL: 'TEL', MAC: 'MAC', IPPUB: 'IPPUB' } as const;
type Kind = keyof typeof PREFIX;

// Chaves cujo valor é uma pessoa/conta (vira PESSOA_n mesmo sem estar na lista de nomes).
const PERSON_KEY = /(^|_)(quem|usuario|user|username|actor|ator|requested_by|created_by|approved_by|revoked_by|responsavel|responsible|solicitante|full_name|nome|name|display_name|owner|autor|decidido_por|criado_por)($|_)/i;
// Valores que são módulos do sistema, não pessoas.
const SYSTEM_VALUE = /^(sistema|system|collaborators|hotspot|auto|automatico|operador-autenticado|core|cron|watchdog)(:.*)?$/i;

const RE_EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const RE_CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const RE_CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const RE_PHONE = /(?<![\d.])(?:\+?55\s?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}(?![\d.])/g;
const RE_MAC = /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi;
const RE_IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const RE_SECRET = /(AIza[0-9A-Za-z_-]{20,}|gsk_[0-9A-Za-z]{20,}|sk-or-[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z_-]{20,}|xox[baprs]-[0-9A-Za-z-]{10,}|eyJ[0-9A-Za-z_-]{20,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,})/g;

const isPrivateIp = (ip: string) => {
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // não é IP: deixa como está
    return p[0] === 10 || p[0] === 127 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || p[0] === 0 || (p[0] === 169 && p[1] === 254);
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class Pseudonymizer {
    private forward = new Map<string, string>();
    private reverse = new Map<string, string>();
    private counters: Record<Kind, number> = { PESSOA: 0, EMAIL: 0, CPF: 0, CNPJ: 0, TEL: 0, MAC: 0, IPPUB: 0 };
    private names: Array<{ re: RegExp; value: string }> = [];

    // `knownNames`: nomes e usuários conhecidos, para trocar também quando aparecem soltos em texto livre.
    constructor(knownNames: string[] = []) {
        const unique = Array.from(new Set(knownNames.map((n) => String(n || '').trim()).filter((n) => n.length >= 4)));
        unique.sort((a, b) => b.length - a.length);
        this.names = unique.map((value) => ({ re: new RegExp(`(?<![\\w])${escapeRe(value)}(?![\\w])`, 'gi'), value }));
    }

    private token(kind: Kind, value: string) {
        const key = `${kind}:${value.toLowerCase()}`;
        const hit = this.forward.get(key);
        if (hit) return hit;
        this.counters[kind] += 1;
        const token = `${PREFIX[kind]}_${this.counters[kind]}`;
        this.forward.set(key, token);
        this.reverse.set(token, value);
        return token;
    }

    get size() {
        return this.reverse.size;
    }

    maskText(input: string): string {
        let text = String(input ?? '');
        text = text.replace(RE_SECRET, '[SEGREDO]');
        text = text.replace(RE_EMAIL, (m) => this.token('EMAIL', m));
        text = text.replace(RE_CNPJ, (m) => this.token('CNPJ', m));
        text = text.replace(RE_CPF, (m) => this.token('CPF', m));
        text = text.replace(RE_MAC, (m) => this.token('MAC', m));
        text = text.replace(RE_IPV4, (m) => (isPrivateIp(m) ? m : this.token('IPPUB', m)));
        text = text.replace(RE_PHONE, (m) => (m.replace(/\D/g, '').length >= 10 ? this.token('TEL', m) : m));
        for (const { re, value } of this.names) text = text.replace(re, () => this.token('PESSOA', value));
        return text;
    }

    // Percorre o objeto: valores sob chaves de pessoa viram PESSOA_n; o resto passa pela máscara de texto.
    maskDeep(value: any, key = '', depth = 0): any {
        if (depth > 8 || value === null || value === undefined) return value;
        if (typeof value === 'string') {
            const v = value.trim();
            if (v && PERSON_KEY.test(key) && !SYSTEM_VALUE.test(v) && !/^\d+$/.test(v)) return this.token('PESSOA', v);
            return this.maskText(value);
        }
        if (Array.isArray(value)) return value.map((item) => this.maskDeep(item, key, depth + 1));
        if (typeof value === 'object') {
            const out: Record<string, any> = {};
            for (const [k, v] of Object.entries(value)) out[k] = this.maskDeep(v, k, depth + 1);
            return out;
        }
        return value;
    }

    unmask(input: string): string {
        return String(input ?? '').replace(/\b(PESSOA|EMAIL|CPF|CNPJ|TEL|MAC|IPPUB)_(\d+)\b/g, (token) => this.reverse.get(token) ?? token);
    }

    unmaskDeep(value: any, depth = 0): any {
        if (depth > 8 || value === null || value === undefined) return value;
        if (typeof value === 'string') return this.unmask(value);
        if (Array.isArray(value)) return value.map((item) => this.unmaskDeep(item, depth + 1));
        if (typeof value === 'object') {
            const out: Record<string, any> = {};
            for (const [k, v] of Object.entries(value)) out[k] = this.unmaskDeep(v, depth + 1);
            return out;
        }
        return value;
    }
}
