import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { env } from '../../config/env';

type RagChunk = {
    id: string;
    source: string;
    title: string;
    content: string;
    lineStart: number;
    lineEnd: number;
    tokens: string[];
};

type RagSource = {
    path: string;
    label: string;
    kind: 'file' | 'runtime';
};

type RagAnswer = {
    generated_at: string;
    mode: 'local-extractive-rag' | 'gemini-rag';
    question: string;
    answer: string;
    confidence: 'high' | 'medium' | 'low';
    provider: 'local' | 'gemini';
    model: string;
    external_ai_used: boolean;
    external_ai_error?: string;
    sources: Array<{
        source: string;
        title: string;
        line_start: number;
        line_end: number;
        score: number;
        excerpt: string;
    }>;
    runtime: {
        prometheus_targets_up: number;
        prometheus_targets_down: number;
        prometheus_ready: boolean;
    };
};

const STOPWORDS = new Set([
    'a', 'as', 'ao', 'aos', 'e', 'o', 'os', 'de', 'da', 'das', 'do', 'dos', 'em', 'no', 'nos', 'na', 'nas',
    'um', 'uma', 'uns', 'umas', 'que', 'por', 'para', 'com', 'sem', 'como', 'qual', 'quais', 'quando', 'onde',
    'porque', 'porquê', 'sobre', 'temos', 'tem', 'esta', 'este', 'isso', 'isto', 'ele', 'ela', 'eles', 'elas',
    'ser', 'se', 'ou', 'mais', 'menos', 'já', 'ja', 'não', 'nao', 'sim', 'agora', 'sistema', 'sgcg',
]);

const PROJECT_SOURCE_PATTERNS = [
    { path: 'CODEX.md', label: 'CODEX.md' },
    { path: 'RESUMO_TECNICO_SGCG.md', label: 'Resumo técnico SGCG' },
    { path: 'DOCUMENTACAO_PROJETO.md', label: 'Documentação do projeto' },
    { path: 'pontorh.md', label: 'PontoRH/OpenDNS' },
];

const DOC_DIRS = [
    'docs',
    'backend-proxy/docs',
    'instalador/docs',
];

const RUNTIME_SOURCES: RagSource[] = [
    { path: '/etc/prometheus/prometheus.yml', label: 'Prometheus config', kind: 'file' },
    { path: '/etc/grafana/provisioning/datasources/sgcg-prometheus.yml', label: 'Grafana datasource', kind: 'file' },
];

let cachedChunks: RagChunk[] = [];
let cachedAt = 0;

const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const tokenize = (value: string) => normalize(value)
    .split(/[^a-z0-9_.:/-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));

const unique = <T,>(values: T[]) => Array.from(new Set(values));

const truncate = (value: string, max = 900) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 1).trim()}…`;
};

const maskSensitive = (value: string) => value
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF_MASCARADO]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ_MASCARADO]')
    .replace(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}\b/g, '[TELEFONE_MASCARADO]')
    .replace(/\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/gi, '[MAC_MASCARADO]')
    .replace(/\b(AIza[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z_-]{20,}|xox[baprs]-[0-9A-Za-z-]{10,})\b/g, '[SEGREDO_MASCARADO]')
    .replace(/(password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*['"]?[^'"\s]+/gi, '$1=[SEGREDO_MASCARADO]');

const excerptAround = (value: string, queryTokens: string[], max = 520) => {
    const compact = value.replace(/\s+/g, ' ').trim();
    const normalized = normalize(compact);
    const firstHit = queryTokens
        .map((token) => normalized.indexOf(token))
        .filter((index) => index >= 0)
        .sort((left, right) => left - right)[0];
    if (firstHit === undefined) return truncate(compact, max);
    const start = Math.max(0, firstHit - Math.floor(max * 0.28));
    const end = Math.min(compact.length, start + max);
    return `${start > 0 ? '…' : ''}${compact.slice(start, end).trim()}${end < compact.length ? '…' : ''}`;
};

const readTextFile = async (filePath: string) => {
    try {
        const stat = await fs.promises.stat(filePath);
        if (!stat.isFile() || stat.size > 6 * 1024 * 1024) return '';
        return await fs.promises.readFile(filePath, 'utf-8');
    } catch {
        return '';
    }
};

const listMarkdownFiles = async (dirPath: string) => {
    const files: string[] = [];
    const walk = async (current: string) => {
        let entries: fs.Dirent[] = [];
        try {
            entries = await fs.promises.readdir(current, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const nextPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
                await walk(nextPath);
            } else if (entry.isFile() && /\.(md|txt|yml|yaml)$/i.test(entry.name)) {
                files.push(nextPath);
            }
        }
    };
    await walk(dirPath);
    return files;
};

const titleForBlock = (lines: string[]) => {
    const heading = lines.find((line) => /^#{1,4}\s+/.test(line.trim()));
    return heading ? heading.replace(/^#{1,4}\s+/, '').trim() : 'Trecho operacional';
};

const chunkDocument = (source: RagSource, text: string): RagChunk[] => {
    const lines = text.split(/\r?\n/);
    const chunks: RagChunk[] = [];
    const blockSize = source.label === 'CODEX.md' ? 34 : 42;
    const overlap = 6;
    for (let index = 0; index < lines.length; index += blockSize - overlap) {
        const block = lines.slice(index, index + blockSize);
        const content = block.join('\n').trim();
        if (content.length < 80) continue;
        const tokens = unique(tokenize(`${source.label} ${titleForBlock(block)} ${content}`));
        if (!tokens.length) continue;
        chunks.push({
            id: `${source.label}:${index + 1}`,
            source: source.path,
            title: titleForBlock(block),
            content,
            lineStart: index + 1,
            lineEnd: Math.min(lines.length, index + block.length),
            tokens,
        });
    }
    return chunks;
};

const requestLocalJson = <T = any>(urlPath: string): Promise<T | null> => new Promise((resolve) => {
    const req = http.request({
        hostname: '127.0.0.1',
        port: 9090,
        path: urlPath,
        method: 'GET',
        timeout: 2500,
    }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch {
                resolve(null);
            }
        });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
        req.destroy();
        resolve(null);
    });
    req.end();
});

const requestGemini = (prompt: string): Promise<string> => new Promise((resolve, reject) => {
    if (!env.geminiApiKey) {
        reject(new Error('GEMINI_API_KEY ausente.'));
        return;
    }
    const model = encodeURIComponent(env.geminiModel || 'gemini-2.5-flash');
    const payload = JSON.stringify({
        system_instruction: {
            parts: [{
                text: [
                    'Você é a IA operacional do SGCG.',
                    'Responda em português do Brasil.',
                    'Use somente o contexto fornecido.',
                    'Não invente comandos, IPs, usuários, evidências ou conclusões.',
                    'Quando houver incerteza, diga exatamente o que falta validar.',
                    'Preserve a rastreabilidade citando as fontes recebidas.',
                    'Não sugira ação destrutiva automática.',
                ].join(' '),
            }],
        },
        contents: [{
            role: 'user',
            parts: [{ text: prompt }],
        }],
        generationConfig: {
            temperature: 0.2,
            topP: 0.8,
            maxOutputTokens: 1200,
        },
    });
    const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:generateContent`,
        method: 'POST',
        timeout: 12000,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'x-goog-api-key': env.geminiApiKey,
        },
    }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
                reject(new Error(`Gemini HTTP ${res.statusCode || 0}`));
                return;
            }
            try {
                const data = JSON.parse(body);
                const text = data?.candidates?.[0]?.content?.parts
                    ?.map((part: any) => String(part?.text || ''))
                    .join('\n')
                    .trim();
                if (!text) {
                    reject(new Error('Gemini retornou resposta vazia.'));
                    return;
                }
                resolve(text);
            } catch {
                reject(new Error('Falha ao interpretar resposta do Gemini.'));
            }
        });
    });
    req.on('error', (error) => reject(error));
    req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout ao consultar Gemini.'));
    });
    req.write(payload);
    req.end();
});

const getPrometheusRuntime = async () => {
    const [ready, targets] = await Promise.all([
        new Promise<boolean>((resolve) => {
            const req = http.request({ hostname: '127.0.0.1', port: 9090, path: '/prometheus/-/ready', timeout: 2000 }, (res) => {
                resolve(res.statusCode === 200);
                res.resume();
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
            req.end();
        }),
        requestLocalJson<any>('/prometheus/api/v1/targets?state=active'),
    ]);
    const activeTargets = Array.isArray(targets?.data?.activeTargets) ? targets.data.activeTargets : [];
    const rows = activeTargets.map((target: any) => ({
        job: String(target?.labels?.job || ''),
        instance: String(target?.labels?.instance || ''),
        health: String(target?.health || ''),
        error: String(target?.lastError || ''),
    }));
    const up = rows.filter((row) => row.health === 'up').length;
    const down = rows.filter((row) => row.health && row.health !== 'up').length;
    const text = [
        '# Runtime Prometheus SGCG',
        `ready: ${ready}`,
        `targets_up: ${up}`,
        `targets_down: ${down}`,
        ...rows.map((row) => `- ${row.job} ${row.instance}: ${row.health}${row.error ? ` (${row.error})` : ''}`),
    ].join('\n');
    return { ready, up, down, text };
};

const buildIndex = async () => {
    const sources: RagSource[] = [
        ...PROJECT_SOURCE_PATTERNS.map((item) => ({
            path: path.join(env.projectRoot, item.path),
            label: item.label,
            kind: 'file' as const,
        })),
        ...RUNTIME_SOURCES,
    ];
    for (const docDir of DOC_DIRS) {
        const absoluteDir = path.join(env.projectRoot, docDir);
        const files = await listMarkdownFiles(absoluteDir);
        sources.push(...files.map((file) => ({
            path: file,
            label: path.relative(env.projectRoot, file),
            kind: 'file' as const,
        })));
    }

    const chunks: RagChunk[] = [];
    for (const source of sources) {
        const text = await readTextFile(source.path);
        if (!text) continue;
        chunks.push(...chunkDocument(source, text));
    }

    const prometheusRuntime = await getPrometheusRuntime();
    chunks.push(...chunkDocument({
        path: 'runtime://prometheus-targets',
        label: 'Runtime Prometheus',
        kind: 'runtime',
    }, prometheusRuntime.text));

    cachedChunks = chunks;
    cachedAt = Date.now();
    return chunks;
};

const getIndex = async (force = false) => {
    if (!force && cachedChunks.length && Date.now() - cachedAt < 5 * 60 * 1000) return cachedChunks;
    return buildIndex();
};

const scoreChunk = (chunk: RagChunk, queryTokens: string[]) => {
    const tokenSet = new Set(chunk.tokens);
    let score = 0;
    for (const token of queryTokens) {
        if (tokenSet.has(token)) score += token.length > 6 ? 3 : 2;
        if (chunk.source.toLowerCase().includes(token)) score += 1;
        if (normalize(chunk.title).includes(token)) score += 2;
    }
    return score;
};

const buildAnswer = async (question: string, matches: Array<RagChunk & { score: number }>, runtime: Awaited<ReturnType<typeof getPrometheusRuntime>>): Promise<RagAnswer> => {
    const primary = matches[0];
    const queryTokens = unique(tokenize(question));
    const confidence = !primary || primary.score < 4 ? 'low' : primary.score > 12 && matches.length >= 3 ? 'high' : 'medium';
    const citedFacts = matches.slice(0, 4).map((match) => {
        const cleanSource = match.source.startsWith(env.projectRoot)
            ? path.relative(env.projectRoot, match.source)
            : match.source;
        return `- ${excerptAround(match.content, queryTokens, 420)}\n  Fonte: ${cleanSource}:${match.lineStart}`;
    });
    const localAnswer = primary
        ? [
            `Encontrei conhecimento operacional relacionado a "${question}".`,
            '',
            'Leitura consolidada:',
            ...citedFacts,
            '',
            runtime.ready
                ? `Sinal ao vivo: Prometheus está pronto, com ${runtime.up} alvo(s) up e ${runtime.down} alvo(s) fora de up.`
                : 'Sinal ao vivo: Prometheus não respondeu como pronto no momento da consulta.',
            '',
            confidence === 'low'
                ? 'A confiança é baixa porque os trechos recuperados têm pouca sobreposição com a pergunta; vale refinar a pergunta com serviço, VLAN, IP, módulo ou sintoma.'
                : 'A resposta acima é baseada somente em fontes locais recuperadas e sinais internos do SGCG.',
        ].join('\n')
        : [
            `Não encontrei base local suficiente para responder "${question}" com segurança.`,
            'Refine a pergunta com VLAN, IP, módulo, serviço, rota ou erro observado para o RAG recuperar fontes melhores.',
        ].join('\n');

    let answer = localAnswer;
    let provider: 'local' | 'gemini' = 'local';
    let mode: RagAnswer['mode'] = 'local-extractive-rag';
    let externalAiError: string | undefined;

    if (env.aiProvider === 'gemini' && env.geminiApiKey && primary) {
        const context = matches.slice(0, 6).map((match, index) => {
            const cleanSource = match.source.startsWith(env.projectRoot)
                ? path.relative(env.projectRoot, match.source)
                : match.source;
            return [
                `Fonte ${index + 1}: ${cleanSource}:${match.lineStart}-${match.lineEnd}`,
                `Título: ${match.title}`,
                maskSensitive(excerptAround(match.content, queryTokens, 1200)),
            ].join('\n');
        }).join('\n\n');
        const prompt = maskSensitive([
            `Pergunta do operador: ${question}`,
            '',
            `Prometheus: ready=${runtime.ready}; targets_up=${runtime.up}; targets_down=${runtime.down}`,
            '',
            'Contexto recuperado:',
            context,
            '',
            'Tarefa: responda com diagnóstico operacional curto, evidências citadas e próximo passo seguro. Se o contexto não bastar, diga o que falta validar.',
        ].join('\n'));
        try {
            answer = await requestGemini(prompt);
            provider = 'gemini';
            mode = 'gemini-rag';
        } catch (error: any) {
            externalAiError = error?.message || 'Falha ao consultar Gemini.';
        }
    }

    return {
        generated_at: new Date().toISOString(),
        mode,
        question,
        answer,
        confidence,
        provider,
        model: provider === 'gemini' ? env.geminiModel : 'local-extractive-rag',
        external_ai_used: provider === 'gemini',
        ...(externalAiError ? { external_ai_error: externalAiError } : {}),
        sources: matches.slice(0, 6).map((match) => ({
            source: match.source.startsWith(env.projectRoot) ? path.relative(env.projectRoot, match.source) : match.source,
            title: match.title,
            line_start: match.lineStart,
            line_end: match.lineEnd,
            score: match.score,
            excerpt: excerptAround(match.content, queryTokens, 520),
        })),
        runtime: {
            prometheus_targets_up: runtime.up,
            prometheus_targets_down: runtime.down,
            prometheus_ready: runtime.ready,
        },
    };
};

export const ragService = {
    async status(force = false) {
        const [chunks, runtime] = await Promise.all([getIndex(force), getPrometheusRuntime()]);
        return {
            generated_at: new Date().toISOString(),
            mode: 'local-extractive-rag',
            chunks: chunks.length,
            indexed_at: cachedAt ? new Date(cachedAt).toISOString() : null,
            sources: unique(chunks.map((chunk) => chunk.source)).length,
            runtime: {
                prometheus_targets_up: runtime.up,
                prometheus_targets_down: runtime.down,
                prometheus_ready: runtime.ready,
            },
        };
    },

    async ask(question: string): Promise<RagAnswer> {
        const normalizedQuestion = String(question || '').trim();
        if (normalizedQuestion.length < 3) {
            throw new Error('Informe uma pergunta operacional com pelo menos 3 caracteres.');
        }
        const [chunks, runtime] = await Promise.all([getIndex(false), getPrometheusRuntime()]);
        const queryTokens = unique(tokenize(normalizedQuestion));
        const matches = chunks
            .map((chunk) => ({ ...chunk, score: scoreChunk(chunk, queryTokens) }))
            .filter((chunk) => chunk.score > 0)
            .sort((left, right) => right.score - left.score)
            .slice(0, 8);
        return buildAnswer(normalizedQuestion, matches, runtime);
    },

    async reindex() {
        await buildIndex();
        return this.status(false);
    },
};
