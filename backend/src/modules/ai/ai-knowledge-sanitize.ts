// Limpeza de segredos e dados pessoais ANTES de qualquer texto entrar na base de conhecimento (e de novo na saída da busca).
// Regra de ouro: na dúvida, apaga. É melhor a IA dizer "o valor está mascarado" do que vazar uma chave.

// "pass" solto só vale como palavra inteira (BYPASS, COMPASS não são senha); password/passwd/PGPASSWORD valem em qualquer posição
const NAME_PART = '(?:pass(?:word|wd|phrase)|(?<![A-Za-z])pass(?![A-Za-z])|senha|secret|segredo|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credential|credencial|authorization|psk|jwt|dsn)';
// NOME=valor, NOME: valor, "nome": "valor" onde o NOME contém uma palavra sensível
const KEYED = new RegExp(`(["']?[A-Za-z0-9_.-]*${NAME_PART}[A-Za-z0-9_.-]*["']?\\s*[:=]\\s*)(["']?)([^\\s"',;]{1,})\\2`, 'gi');
const PLACEHOLDER = /^(?:true|false|null|none|yes|no|sim|nao|não|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|<[^>]*>|\[[^\]]*\]|\.{3}|\*+|x+|seu_.*|sua_.*|changeme|exemplo)$/i;

const PATTERNS: Array<{ re: RegExp; to: string }> = [
    { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, to: '[CHAVE_PRIVADA]' },
    { re: /\b(postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|amqps?|ftp|sftp|smtps?|https?):\/\/([^\s:@/]+):([^\s@/]+)@/gi, to: '$1://$2:[SEGREDO]@' },
    { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, to: '[JWT]' },
    { re: /\b(?:AIza[0-9A-Za-z_-]{20,}|AQ\.[0-9A-Za-z_-]{20,}|sk-or-[0-9A-Za-z_-]{16,}|sk-[0-9A-Za-z_-]{20,}|gsk_[0-9A-Za-z]{20,}|xox[baprs]-[0-9A-Za-z-]{10,}|gh[pousr]_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{30,}|glpat-[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|npm_[0-9A-Za-z]{30,}|vcp_[0-9A-Za-z]{20,}|nvapi-[0-9A-Za-z_-]{20,}|csk-[0-9a-z]{20,}|r2_[0-9a-zA-Z]{20,})\b/g, to: '[CHAVE_DE_API]' },
    { re: /\b\d{8,10}:AA[0-9A-Za-z_-]{30,}\b/g, to: '[TOKEN_TELEGRAM]' },
    // CPF, CNPJ, telefone e MAC: dado pessoal ou de aparelho nunca entra na base
    { re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, to: '[CPF]' },
    { re: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, to: '[CNPJ]' },
    { re: /(?:\+55\s?)?\(\d{2}\)\s?9?\d{4}-?\d{4}\b/g, to: '[TELEFONE]' },
    { re: /\+55\s?\d{2}\s?9?\d{4}-?\d{4}\b/g, to: '[TELEFONE]' },
    { re: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g, to: '[MAC]' },
];

// sequência longa com maiúscula, minúscula e dígito: cara de chave/base64, não de palavra ou nome de arquivo
const RANDOM_LIKE = /\b(?=[A-Za-z0-9]*[A-Z])(?=[A-Za-z0-9]*[a-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{32,}\b/g;

export const sanitize = (input: string, extraSecrets: string[] = []): { text: string; hits: number } => {
    let hits = 0;
    let text = String(input ?? '');
    for (const secret of extraSecrets) {
        if (secret.length >= 8 && text.includes(secret)) {
            text = text.split(secret).join('[SEGREDO]');
            hits++;
        }
    }
    for (const { re, to } of PATTERNS) {
        text = text.replace(re, (...args) => {
            hits++;
            // usa o próprio "to" com $1.. quando houver grupos
            const groups = args.slice(1, -2) as string[];
            return to.replace(/\$(\d)/g, (_m, n) => groups[Number(n) - 1] ?? '');
        });
    }
    text = text.replace(KEYED, (full, head: string, quote: string, value: string) => {
        // placeholders e caminhos de arquivo (LoadCredential=nome:/caminho) não são o segredo em si
        const bare = value.replace(/^[`(\[]+|[`).\]]+$/g, '');
        if (PLACEHOLDER.test(bare) || /^\d{1,7}$/.test(bare) || /^(?:bearer|basic|token|apikey|digest)$/i.test(bare)) return full;
        if (value.startsWith('[') || /^(?:[\w.-]+:)?\/[\w./@%+-]*$/.test(value)) return full;
        hits++;
        return `${head}${quote}[SEGREDO]${quote}`;
    });
    text = text.replace(RANDOM_LIKE, () => {
        hits++;
        return '[CHAVE_OU_HASH]';
    });
    return { text, hits };
};

// valores reais de segredo do processo (do .env já carregado), para apagar mesmo se aparecerem soltos num arquivo.
// Variáveis de URL/DSN entram só com a senha embutida (postgres://user:SENHA@... ou password=SENHA), nunca com a URL inteira.
export const secretValuesFromEnv = (): string[] => {
    const out: string[] = [];
    for (const [key, value] of Object.entries(process.env)) {
        if (!value || value.length < 8) continue;
        if (/(ISSUER|AUDIENCE|USERNAME|_USER$|_ID$|EXPIRES|TTL|ENABLED|_MODE$|_TYPE$|_HOST$|_PORT$|_NAME$|ALGORITHM)/i.test(key)) continue;
        if (/(_URL|_URI|DSN|DATABASE)/i.test(key)) {
            const embedded = value.match(/:\/\/[^:@/\s]+:([^@/\s]+)@/)?.[1] || value.match(/password=(\S+)/i)?.[1];
            if (embedded && embedded.length >= 6) out.push(decodeURIComponent(embedded), embedded);
        } else if (new RegExp(NAME_PART, 'i').test(key)) {
            out.push(value);
        }
    }
    return out;
};
