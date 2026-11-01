import fs from 'fs';
import { Pool } from 'pg';

/*
 * Bases de dados de OUTROS projetos que o assistente pode consultar.
 *
 * Nada é aberto por padrão: cada base entra aqui, explicitamente, com a lista de campos permitidos. O modelo nunca
 * escreve SQL: ele escolhe a base, os filtros e o agrupamento, e o servidor monta a consulta a partir desta lista
 * (valores sempre como parâmetros). A conexão é só leitura (default_transaction_read_only) e com limite de tempo.
 *
 * Regra de privacidade: só consultas AGREGADAS (contagens e agrupamentos). Nada de listar pessoas, e campos que
 * identificam uma pessoa ou empresa individual (CNPJ, razão social, nome) não são filtráveis, para a pergunta nunca
 * conseguir apontar um indivíduo. Bases com dados pessoais sensíveis (saúde, crianças, processos) NÃO entram sem
 * decisão explícita do responsável.
 */

type Field = {
    nome: string;
    descricao: string;
    expr: string; // coluna ou expressão SQL fixa (nunca vem do modelo)
    tipo: 'texto' | 'codigo';
    normalizar?: boolean; // compara em MAIÚSCULAS e sem acento
    exemplos?: string;
};

export type DataSource = {
    id: string;
    nome: string;
    descricao: string;
    banco: string;
    usuario: string;
    tabela: string;
    campos: Field[];
    referencia: () => Promise<string>; // de quando são os dados
    descreverCodigos?: (campo: string, valores: string[]) => Promise<Record<string, string>>;
};

const pools = new Map<string, Pool>();
const poolFor = (src: DataSource) => {
    let pool = pools.get(src.id);
    if (!pool) {
        pool = new Pool({
            host: '127.0.0.1',
            port: 5432,
            database: src.banco,
            user: src.usuario,
            max: 2,
            idleTimeoutMillis: 60_000,
            // Só leitura e no máximo 15 s por consulta, garantidos na própria sessão.
            options: '-c default_transaction_read_only=on -c statement_timeout=15000',
        });
        pool.on('error', () => undefined);
        pools.set(src.id, pool);
    }
    return pool;
};

const mei: DataSource = {
    id: 'mei',
    nome: 'MEI (Microempreendedores Individuais) do Brasil',
    descricao: 'Base pública da Receita Federal (dados abertos) com todos os MEI do país, atualizada por projeto próprio (Consulta CNPJ). Serve para quantos MEI existem em um município, quantos estão ativos e quais atividades predominam.',
    banco: 'cnpj_mei',
    usuario: 'cnpjmei',
    tabela: 'mei_establishments',
    campos: [
        { nome: 'municipio', descricao: 'Nome do município (sem acento, ex.: JACAREZINHO). Use sempre junto com "uf".', expr: 'municipio_normalizado', tipo: 'texto', normalizar: true, exemplos: 'JACAREZINHO, LONDRINA' },
        { nome: 'uf', descricao: 'Sigla do estado, ex.: PR.', expr: 'uf', tipo: 'texto', normalizar: true, exemplos: 'PR, SP' },
        { nome: 'situacao', descricao: 'Situação cadastral na Receita: ATIVA, INAPTA, SUSPENSA, BAIXADA ou NULA.', expr: 'situacao_cadastral', tipo: 'texto', normalizar: true, exemplos: 'ATIVA' },
        { nome: 'cnae', descricao: 'Código da atividade econômica principal (7 dígitos). Ao agrupar, a descrição vem junto.', expr: 'cnae_principal', tipo: 'codigo', exemplos: '9602501' },
        { nome: 'ano_abertura', descricao: 'Ano em que o MEI foi aberto (4 dígitos).', expr: 'left(data_abertura, 4)', tipo: 'codigo', exemplos: '2024' },
    ],
    async referencia() {
        try {
            const state = JSON.parse(fs.readFileSync('/var/www/agentes/cnpj/data/update_state.json', 'utf-8'));
            return `Dados da Receita Federal, versão ${state.applied_version} (${Number(state.record_count).toLocaleString('pt-BR')} MEI no país)`;
        } catch {
            return 'Dados da Receita Federal (versão não identificada)';
        }
    },
    async descreverCodigos(campo, valores) {
        if (campo !== 'cnae' || !valores.length) return {};
        const rfb = new Pool({ host: '127.0.0.1', port: 5432, database: 'cnpj_rfb', user: 'cnpjrfb', max: 1, options: '-c default_transaction_read_only=on -c statement_timeout=8000' });
        try {
            const { rows } = await rfb.query('SELECT codigo, descricao FROM cnae WHERE codigo = ANY($1::text[])', [valores]);
            return Object.fromEntries(rows.map((r: any) => [r.codigo, r.descricao]));
        } catch {
            return {};
        } finally {
            await rfb.end().catch(() => null);
        }
    },
};

export const SOURCES: DataSource[] = [mei];

export const sourceById = (id: string) => SOURCES.find((s) => s.id === String(id || '').toLowerCase());

const strip = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

type Filter = { campo: string; op: string; valor: any };

export const describeForPrompt = () => SOURCES.map((s) => [
    `- ${s.id}: ${s.nome}. ${s.descricao}`,
    `  campos: ${s.campos.map((c) => `${c.nome} (${c.descricao})`).join('; ')}`,
].join('\n')).join('\n');

export const listSources = () => SOURCES.map((s) => ({ id: s.id, nome: s.nome, descricao: s.descricao, banco: s.banco, campos: s.campos.map((c) => c.nome) }));

export const querySource = async (args: Record<string, any>) => {
    const src = sourceById(args.fonte);
    if (!src) throw new Error(`Fonte desconhecida. Use uma de: ${SOURCES.map((s) => s.id).join(', ')}.`);
    const field = (name: any) => {
        const f = src.campos.find((c) => c.nome === String(name || '').toLowerCase());
        if (!f) throw new Error(`Campo "${name}" não existe na fonte ${src.id}. Campos: ${src.campos.map((c) => c.nome).join(', ')}.`);
        return f;
    };

    const params: any[] = [];
    const clauses: string[] = [];
    const filters: Filter[] = Array.isArray(args.onde) ? args.onde.slice(0, 6) : [];
    for (const item of filters) {
        const f = field(item?.campo);
        const op = String(item?.op || '=').toLowerCase();
        const raw = String(item?.valor ?? '').trim();
        if (!raw) throw new Error(`Filtro de "${f.nome}" sem valor.`);
        const value = f.normalizar ? strip(raw) : raw;
        params.push(op === 'comeca_com' ? `${value.replace(/[\\%_]/g, '\\$&')}%` : value);
        const ph = `$${params.length}`;
        if (op === '=' || op === '==') clauses.push(`${f.expr} = ${ph}`);
        else if (op === '!=' || op === 'diferente') clauses.push(`${f.expr} <> ${ph}`);
        else if (op === '>=') clauses.push(`${f.expr} >= ${ph}`);
        else if (op === '<=') clauses.push(`${f.expr} <= ${ph}`);
        else if (op === 'comeca_com') clauses.push(`${f.expr} LIKE ${ph}`);
        else throw new Error(`Operador "${op}" não aceito. Use =, !=, >=, <= ou comeca_com.`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(40, Math.round(Number(args.limite)) || 20));
    const pool = poolFor(src);
    const started = Date.now();

    if (args.agrupar_por) {
        const g = field(args.agrupar_por);
        const { rows } = await pool.query(
            `SELECT ${g.expr} AS valor, count(*)::bigint AS quantidade FROM ${src.tabela} ${where} GROUP BY 1 ORDER BY 2 DESC LIMIT ${limit}`,
            params,
        );
        const codes = src.descreverCodigos && g.tipo === 'codigo' ? await src.descreverCodigos(g.nome, rows.map((r: any) => String(r.valor))) : {};
        const out = rows.map((r: any) => ({ [g.nome]: r.valor, ...(codes[String(r.valor)] ? { descricao: codes[String(r.valor)] } : {}), quantidade: Number(r.quantidade) }));
        return { total: out.length, rows: out, note: `${await src.referencia()}. Consulta em ${Date.now() - started} ms.` };
    }
    const { rows } = await pool.query(`SELECT count(*)::bigint AS quantidade FROM ${src.tabela} ${where}`, params);
    return { total: 1, rows: [{ quantidade: Number(rows[0].quantidade) }], note: `${await src.referencia()}. Consulta em ${Date.now() - started} ms.` };
};
