import crypto from 'crypto';
import { pool } from '../../config/db';
import { collectKnowledge, KnowItem } from './ai-knowledge-collectors';
import { sanitize as sanitizeText, secretValuesFromEnv } from './ai-knowledge-sanitize';

// Base de conhecimento do servidor inteiro: fichas geradas ao vivo (serviços, portas, projetos, nginx, bancos...) e
// documentação dos projetos, guardadas no próprio PostgreSQL com busca de texto em português sem acento.
// Nada daqui sai do servidor para indexar: só os poucos trechos achados para uma pergunta vão ao modelo,
// e ainda passam pelo Pseudonymizer. Segredos são apagados antes de gravar (ai-knowledge-sanitize.ts).

export type KnowledgeHit = {
    fonte: string;
    tipo: string;
    titulo: string;
    atualizado_em: string;
    trecho: string;
    score: number;
};

let ready: Promise<void> | null = null;
let indexing: Promise<IndexSummary> | null = null;

export const ensureKnowledgeSchema = () => {
    if (!ready) {
        ready = (async () => {
            await pool.query('CREATE EXTENSION IF NOT EXISTS unaccent').catch(() => undefined);
            // configuração própria: o dicionário "unaccent" antes do stemmer português deixa a busca insensível a acento
            // e, ao contrário de unaccent() solto, é IMMUTABLE e pode ser usada em coluna gerada.
            const exists = await pool.query("SELECT 1 FROM pg_ts_config WHERE cfgname = 'sgcg_pt'");
            if (!exists.rows.length) {
                await pool.query('CREATE TEXT SEARCH CONFIGURATION sgcg_pt (COPY = portuguese)');
                await pool.query('ALTER TEXT SEARCH CONFIGURATION sgcg_pt ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem')
                    .catch(() => undefined);
            }
            await pool.query(`
                CREATE TABLE IF NOT EXISTS ai_knowledge (
                    key TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    title TEXT NOT NULL,
                    source TEXT NOT NULL,
                    body TEXT NOT NULL,
                    hash TEXT NOT NULL,
                    collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    tsv tsvector GENERATED ALWAYS AS (
                        setweight(to_tsvector('sgcg_pt'::regconfig, title), 'A') ||
                        setweight(to_tsvector('sgcg_pt'::regconfig, source), 'B') ||
                        setweight(to_tsvector('sgcg_pt'::regconfig, body), 'C')
                    ) STORED
                )`);
            await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_knowledge_tsv ON ai_knowledge USING GIN (tsv)');
            await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_knowledge_kind ON ai_knowledge (kind)');
            await pool.query(`
                CREATE TABLE IF NOT EXISTS ai_knowledge_runs (
                    id SERIAL PRIMARY KEY,
                    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    finished_at TIMESTAMPTZ,
                    trigger TEXT NOT NULL,
                    total INTEGER,
                    changed INTEGER,
                    removed INTEGER,
                    by_kind JSONB,
                    errors JSONB,
                    redactions INTEGER
                )`);
        })().catch((error) => {
            ready = null;
            throw error;
        });
    }
    return ready;
};

export type IndexSummary = {
    total: number;
    changed: number;
    removed: number;
    by_kind: Record<string, number>;
    errors: Record<string, string>;
    redactions: number;
    ms: number;
};

const hashOf = (item: { title: string; source: string; body: string }) =>
    crypto.createHash('sha1').update(`${item.title}\n${item.source}\n${item.body}`).digest('hex');

export const reindexKnowledge = (trigger = 'manual'): Promise<IndexSummary> => {
    if (indexing) return indexing;
    indexing = (async () => {
        await ensureKnowledgeSchema();
        const started = Date.now();
        const run = await pool.query('INSERT INTO ai_knowledge_runs (trigger) VALUES ($1) RETURNING id', [trigger]);
        const runId = run.rows[0].id;
        try {
            const { items, kinds, errors } = await collectKnowledge();
            let redactions = 0;
            const known = secretValuesFromEnv();
            const sanitize = (text: string) => sanitizeText(text, known);
            const clean: Array<KnowItem & { hash: string }> = [];
            const seen = new Set<string>();
            for (const item of items) {
                if (seen.has(item.key)) continue;
                seen.add(item.key);
                const title = sanitize(item.title);
                const source = sanitize(item.source);
                const body = sanitize(item.body);
                redactions += title.hits + source.hits + body.hits;
                if (body.text.trim().length < 20) continue;
                clean.push({ ...item, title: title.text.slice(0, 300), source: source.text.slice(0, 400), body: body.text.slice(0, 6000), hash: hashOf({ title: title.text, source: source.text, body: body.text }) });
            }

            const before = await pool.query('SELECT key, hash FROM ai_knowledge');
            const oldHash = new Map<string, string>(before.rows.map((r: any) => [r.key, r.hash]));
            const toWrite = clean.filter((item) => oldHash.get(item.key) !== item.hash);
            for (let i = 0; i < toWrite.length; i += 200) {
                const part = toWrite.slice(i, i + 200);
                await pool.query(
                    `INSERT INTO ai_knowledge (key, kind, title, source, body, hash, collected_at)
                     SELECT k, kd, t, s, b, h, now() FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[]) AS x(k, kd, t, s, b, h)
                     ON CONFLICT (key) DO UPDATE SET kind = EXCLUDED.kind, title = EXCLUDED.title, source = EXCLUDED.source,
                        body = EXCLUDED.body, hash = EXCLUDED.hash, collected_at = now()`,
                    [part.map((x) => x.key), part.map((x) => x.kind), part.map((x) => x.title), part.map((x) => x.source), part.map((x) => x.body), part.map((x) => x.hash)],
                );
            }
            // só apaga o que sumiu dos coletores que rodaram sem erro (um coletor quebrado não esvazia a base)
            const alive = clean.map((x) => x.key);
            const removed = await pool.query('DELETE FROM ai_knowledge WHERE kind = ANY($1::text[]) AND key <> ALL($2::text[])', [kinds, alive]);

            const by_kind: Record<string, number> = {};
            clean.forEach((x) => { by_kind[x.kind] = (by_kind[x.kind] || 0) + 1; });
            const summary: IndexSummary = { total: clean.length, changed: toWrite.length, removed: removed.rowCount || 0, by_kind, errors, redactions, ms: Date.now() - started };
            await pool.query(
                'UPDATE ai_knowledge_runs SET finished_at = now(), total = $2, changed = $3, removed = $4, by_kind = $5, errors = $6, redactions = $7 WHERE id = $1',
                [runId, summary.total, summary.changed, summary.removed, JSON.stringify(by_kind), JSON.stringify(errors), redactions],
            );
            return summary;
        } catch (error: any) {
            await pool.query('UPDATE ai_knowledge_runs SET finished_at = now(), errors = $2 WHERE id = $1', [runId, JSON.stringify({ geral: String(error?.message || error).slice(0, 300) })]).catch(() => undefined);
            throw error;
        }
    })().finally(() => { indexing = null; });
    return indexing;
};

export const isIndexing = () => !!indexing;

export const knowledgeStatus = async () => {
    await ensureKnowledgeSchema();
    const [kinds, last, newest] = await Promise.all([
        pool.query('SELECT kind, count(*)::int AS total FROM ai_knowledge GROUP BY kind ORDER BY total DESC'),
        pool.query('SELECT id, started_at, finished_at, trigger, total, changed, removed, errors, redactions FROM ai_knowledge_runs ORDER BY id DESC LIMIT 5'),
        pool.query('SELECT max(collected_at) AS at FROM ai_knowledge'),
    ]);
    return { indexing: !!indexing, total: kinds.rows.reduce((n: number, r: any) => n + r.total, 0), by_kind: kinds.rows, last_runs: last.rows, newest_at: newest.rows[0]?.at || null };
};

// ---------------------------------------------------------------- busca

const STOP = new Set([
    'a', 'as', 'o', 'os', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'pra', 'com', 'sem',
    'que', 'qual', 'quais', 'quando', 'onde', 'como', 'porque', 'por que', 'foi', 'ser', 'sao', 'esta', 'estao', 'tem', 'temos', 'existe', 'existem',
    'me', 'mim', 'meu', 'minha', 'isso', 'esse', 'essa', 'aqui', 'la', 'fica', 'ficam', 'serve', 'servem', 'rodam', 'roda', 'ativas', 'ativo', 'ativa',
    'sistema', 'servidor', 'ele', 'ela', 'se', 'ou', 'e', 'ao', 'aos', 'mais', 'menos', 'muito', 'pouco', 'diz', 'fazer', 'faz', 'quanto', 'quanta', 'quantos', 'quantas',
]);

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// palavras que o operador usa e que não aparecem assim nas fichas
const SYNONYMS: Record<string, string[]> = {
    memoria: ['ram', 'swap', 'memorycurrent'],
    pasta: ['diretorio', 'workingdirectory', 'cwd'],
    diretorio: ['pasta'],
    banco: ['postgresql', 'database'],
    dados: ['postgresql'],
    firewall: ['ufw'],
    agendamento: ['timer'],
    agendado: ['timer'],
    dominio: ['nginx', 'server_name'],
    site: ['nginx'],
    processos: ['pm2'],
    processo: ['pm2'],
    cai: ['falha', 'failed'],
    caiu: ['falha', 'failed'],
    parou: ['falha', 'failed'],
    recarrega: ['reload', 'recarga', 'sighup'],
    recarregar: ['reload', 'recarga', 'sighup'],
    recarga: ['reload', 'sighup'],
    reiniciar: ['restart', 'reinicio'],
    reinicia: ['restart', 'reinicio'],
    avisa: ['alerta', 'telegram', 'email'],
    avisar: ['alerta', 'telegram', 'email'],
    alerta: ['telegram', 'email'],
    cpu: ['processador', 'nucleos'],
    disco: ['discos', 'df', 'montagens'],
    ram: ['memoria'],
};

// quando a pergunta fala de um tipo de coisa, as fichas desse tipo ganham prioridade
const INTENT: Array<[RegExp, string[]]> = [
    [/^(timers?|agendamentos?|agendados?|cron)$/, ['timer']],
    [/^(portas?|escuta|escutando|listen)$/, ['porta', 'projeto', 'pm2']],
    [/^(pm2|processos?)$/, ['pm2']],
    [/^(nginx|dominios?|proxy_pass|sites?)$/, ['nginx']],
    [/^(bancos?|postgres|postgresql|database|databases)$/, ['banco']],
    [/^(tabelas?|colunas?|triggers?|gatilhos?)$/, ['tabela']],
    [/^(firewall|ufw|iptables)$/, ['firewall']],
    [/^(docker|conteineres?|containers?)$/, ['docker']],
    [/^(projetos?|pasta|pastas|diretorios?|repositorios?)$/, ['projeto']],
    [/^(servicos?|systemd|units?)$/, ['servico']],
    [/^(scripts?)$/, ['script']],
    [/^(configuracao|configuracoes|config|configs)$/, ['config']],
    [/^(memoria|ram|swap|disco|discos|cpu|hardware|kernel)$/, ['sistema']],
];

export const intentKinds = (question: string) => {
    const kinds = new Set<string>();
    for (const t of fold(question).split(/[^a-z0-9_]+/)) for (const [re, ks] of INTENT) if (re.test(t)) ks.forEach((k) => kinds.add(k));
    return Array.from(kinds);
};

export const queryTerms = (question: string) => {
    const raw = fold(question).split(/[^a-z0-9_.:-]+/).map((t) => t.replace(/^[._:-]+|[._:-]+$/g, '')).filter((t) => t.length >= 2 && !STOP.has(t));
    const terms = new Set<string>();
    for (const t of raw) {
        terms.add(t);
        (SYNONYMS[t] || []).forEach((s) => terms.add(s));
    }
    return Array.from(terms).slice(0, 14);
};

// lexemas seguros para to_tsquery (letras, números e _); termos com hífen/ponto viram "a <-> b"
const toTsQuery = (terms: string[], joiner: ' | ' | ' & ') => {
    const parts = terms
        .map((t) => t.split(/[^a-z0-9_]+/).filter(Boolean))
        .filter((p) => p.length)
        .map((p) => (p.length > 1 ? `(${p.join(' <-> ')})` : p[0]));
    return parts.join(joiner);
};

const excerptFor = (body: string, terms: string[], max = 760) => {
    const compact = body.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (compact.length <= max) return compact;
    const lower = fold(compact);
    const hit = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
    if (hit === undefined) return `${compact.slice(0, max - 1).trim()}…`;
    const start = Math.max(0, hit - Math.floor(max * 0.25));
    return `${start > 0 ? '…' : ''}${compact.slice(start, start + max).trim()}${start + max < compact.length ? '…' : ''}`;
};

export const searchKnowledge = async (question: string, max = 5, opts: { kinds?: string[] } = {}): Promise<KnowledgeHit[]> => {
    await ensureKnowledgeSchema();
    const terms = queryTerms(question);
    if (!terms.length) return [];
    const queries = terms.map((t) => toTsQuery([t], ' | ')).filter(Boolean);
    if (!queries.length) return [];
    // peso por raridade (IDF): "unbound" aparece em dezenas de fichas e vale pouco; "auth_zone_reload" aparece em poucas e vale muito
    const total = Number((await pool.query('SELECT count(*)::int AS n FROM ai_knowledge')).rows[0].n) || 1;
    const df = await pool.query(
        `SELECT u.i::int AS i, (SELECT count(*) FROM ai_knowledge WHERE tsv @@ to_tsquery('sgcg_pt', u.q))::int AS df
           FROM unnest($1::text[]) WITH ORDINALITY AS u(q, i)`,
        [queries],
    );
    const used = df.rows.filter((r: any) => r.df > 0).map((r: any) => ({ q: queries[r.i - 1], idf: Math.log(1 + total / r.df) }));
    if (!used.length) return [];
    const params: any[] = used.map((u) => u.q);
    // pesos do ts_rank_cd: {D, C, B, A} = corpo, fonte e título valem cada vez mais
    const score = used.map((u, i) => `${u.idf.toFixed(4)} * ts_rank_cd('{0.1, 0.3, 0.7, 1.0}', tsv, to_tsquery('sgcg_pt', $${i + 1}), 33)`).join(' + ');
    const anyMatch = used.map((_, i) => `to_tsquery('sgcg_pt', $${i + 1})`).join(' || ');
    const boost = intentKinds(question);
    params.push(boost);
    const boostIdx = params.length;
    // "quais ... existem?", "liste ...": a ficha-resumo do tipo responde melhor do que uma ficha individual
    const listy = /\b(quais|liste|listar|lista|todos|todas|quantos|quantas)\b/.test(fold(question));
    let kindFilter = '';
    if (opts.kinds?.length) {
        params.push(opts.kinds);
        kindFilter = `AND kind = ANY($${params.length}::text[])`;
    }
    params.push(Math.max(max * 3, 12));
    const sql = `
        SELECT key, kind, title, source, body, collected_at,
               (${score}) * CASE WHEN kind = ANY($${boostIdx}::text[]) THEN 1.7 ELSE 1 END${listy ? " * CASE WHEN source LIKE '%:resumo' THEN 2.4 ELSE 1 END" : ''} AS rank
          FROM ai_knowledge
         WHERE tsv @@ (${anyMatch}) ${kindFilter}
         ORDER BY rank DESC LIMIT $${params.length}`;
    const { rows } = await pool.query(sql, params);
    // um único ficheiro de documentação não pode ocupar todas as vagas: no máximo 2 trechos por fonte
    const perSource = new Map<string, number>();
    const out: KnowledgeHit[] = [];
    for (const row of rows) {
        const used2 = perSource.get(row.source) || 0;
        if (used2 >= 2) continue;
        perSource.set(row.source, used2 + 1);
        out.push({
            fonte: row.source,
            tipo: row.kind,
            titulo: row.title,
            atualizado_em: new Date(row.collected_at).toISOString(),
            trecho: sanitizeText(excerptFor(row.body, terms, String(row.source).endsWith(':resumo') ? 1500 : 760)).text,
            score: Number(Number(row.rank).toFixed(3)),
        });
        if (out.length >= max) break;
    }
    return out;
};

let timer: NodeJS.Timeout | null = null;
const THIRTY_MIN = 30 * 60 * 1000;

export const startKnowledge = () => {
    if (timer) return;
    const first = setTimeout(() => {
        reindexKnowledge('boot').catch((error) => console.error('[IA-CONHECIMENTO] Falha na primeira indexação:', error?.message || error));
    }, 120 * 1000);
    first.unref?.();
    timer = setInterval(() => {
        reindexKnowledge('agendado').catch((error) => console.error('[IA-CONHECIMENTO] Falha na indexação agendada:', error?.message || error));
    }, THIRTY_MIN);
    timer.unref?.();
};

// usado pelos testes e pela tela para saber quais pastas ficam fora da base
export { EXCLUDED_PROJECTS } from './ai-knowledge-collectors';
