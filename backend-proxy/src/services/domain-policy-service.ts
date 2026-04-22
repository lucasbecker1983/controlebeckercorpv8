import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';
import { env } from '../config/env';
import { ensureProxySchema } from './proxy-schema-service';
import { ensureBlockingReleaseSchema } from './blocking-release-schema-service';

type DomainRecord = {
    id: number;
    domain: string;
    category?: string | null;
    source?: string | null;
    protected?: boolean;
    active?: boolean;
    created_at?: string;
};

const BUILTIN_CATEGORIES: Record<string, string[]> = {
    Bancos: [
        'bancodobrasil.com.br', 'bb.com.br', 'caixa.gov.br', 'itau.com.br',
        'bradesco.com.br', 'sicoob.com.br', 'sicredi.com.br', 'santander.com.br',
        'banrisul.com.br', 'inter.co', 'bancointer.com.br', 'nubank.com.br',
        'nu.com.br', 'c6bank.com.br', 'btgpactual.com', 'sicredipioneira.com.br',
    ],
    'Gov.br / Sensivel': [
        'gov.br', 'fazenda.gov.br', 'receita.fazenda.gov.br', 'esocial.gov.br',
        'nfe.fazenda.gov.br', 'nfce.fazenda.gov.br', 'sped.fazenda.gov.br',
        'inss.gov.br', 'previdencia.gov.br', 'dataprev.gov.br', 'serpro.gov.br',
        'trt.jus.br', 'tst.jus.br', 'stf.jus.br', 'cnj.jus.br', 'nfse.gov.br',
        'conectividade.caixa.gov.br', 'fgts.caixa.gov.br',
        'jacarezinho.pr.gov.br', 'pr.gov.br', 'simepar.br',
    ],
    'Microsoft / Apple / Google': [
        'microsoft.com', 'microsoftonline.com', 'office.com', 'office365.com',
        'live.com', 'outlook.com', 'hotmail.com', 'sharepoint.com', 'onedrive.com',
        'azure.com', 'azureedge.net', 'windowsupdate.com',
        'google.com', 'google.com.br', 'googleapis.com', 'googleusercontent.com',
        'gstatic.com', 'gmail.com', 'googlemail.com',
        'apple.com', 'icloud.com', 'mzstatic.com', 'apple-dns.net',
    ],
    'Mensageria / Sensivel': [
        'whatsapp.com', 'whatsapp.net', 'web.whatsapp.com',
        'telegram.org', 'signal.org',
    ],
    'Hospedagem / Institucional': [
        'jmbtecnologia.com.br', 'astrolabia.jmbtecnologia.com.br',
        'jacarezinho.cloud',
    ],
};

const normalizeDomain = (value: string) => value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/^\*\./, '')
    .replace(/^\./, '')
    .replace(/\.$/, '');

const isValidDomain = (domain: string) => {
    if (!domain || domain.length > 255) return false;
    if (domain.includes('..') || domain.startsWith('.') || domain.endsWith('.')) return false;
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain);
};

const readAclFile = (filePath: string) => {
    if (!fs.existsSync(filePath)) return [] as string[];
    return fs.readFileSync(filePath, 'utf8')
        .split('\n')
        .map((line) => normalizeDomain(line))
        .filter(Boolean);
};

export class DomainPolicyService {
    readonly generatedDir = path.join(env.rulesDir, 'generated');
    readonly squidBlocklistFile = path.join(this.generatedDir, 'proxy_blocklist.acl');
    readonly squidWhitelistFile = path.join(this.generatedDir, 'proxy_whitelist.acl');
    readonly squidProtectedFile = path.join(this.generatedDir, 'proxy_protected_ssl.acl');
    readonly squidBumpFile = path.join(this.generatedDir, 'proxy_bump_ssl.acl');
    readonly dnsBlocklistFile = path.join(env.rulesDir, 'listas', 'blocked_domains.txt');
    readonly enterpriseDir = path.join(this.generatedDir, 'bloqueios-liberacoes');

    async ensureBaseState() {
        await ensureProxySchema();
        await ensureBlockingReleaseSchema();
        fs.mkdirSync(this.generatedDir, { recursive: true });
        fs.mkdirSync(path.dirname(this.dnsBlocklistFile), { recursive: true });
    }

    async getBuiltinCategories() {
        await this.ensureBaseState();
        const { rows } = await pool.query(
            `
                SELECT
                    dp.name,
                    ARRAY_AGG(DISTINCT dpe.normalized_domain ORDER BY dpe.normalized_domain) AS domains
                FROM domain_policies dp
                JOIN domain_policy_entries dpe ON dpe.policy_id = dp.id
                WHERE dp.enabled = TRUE
                  AND dp.policy_type = 'allow'
                  AND dpe.normalized_domain IS NOT NULL
                  AND dpe.normalized_domain <> ''
                GROUP BY dp.id, dp.name
                ORDER BY dp.name ASC
            `,
        );

        if (rows.length) {
            return rows.map((row) => ({
                name: row.name,
                domains: (row.domains || []).map(normalizeDomain).filter(isValidDomain),
                count: (row.domains || []).map(normalizeDomain).filter(isValidDomain).length,
                source: 'bloqueios-liberacoes',
            }));
        }

        return Object.entries(BUILTIN_CATEGORIES).map(([name, domains]) => ({
            name,
            domains,
            count: domains.length,
            source: 'fallback-proxy',
        }));
    }

    async getProtectedDomains() {
        const categories = await this.getBuiltinCategories();
        return Array.from(new Set(categories.flatMap((category) => category.domains).map(normalizeDomain).filter(isValidDomain))).sort();
    }

    async isProtectedDomain(domain: string) {
        const normalized = normalizeDomain(domain);
        return (await this.getProtectedDomains()).includes(normalized);
    }

    async listWhitelist() {
        await this.ensureBaseState();
        const { rows } = await pool.query(
            `
                SELECT id, domain, category, source, protected, active, created_at
                FROM proxy_whitelist
                WHERE active = TRUE
                ORDER BY protected DESC, domain ASC
            `,
        );
        return rows as DomainRecord[];
    }

    async listBlocklist() {
        await this.ensureBaseState();
        const { rows } = await pool.query(
            `
                SELECT id, domain, source, active, created_at
                FROM proxy_blocklist
                WHERE active = TRUE
                ORDER BY created_at DESC, domain ASC
            `,
        );
        return rows as DomainRecord[];
    }

    async addWhitelist(domain: string, requestedBy = 'system') {
        await this.ensureBaseState();
        const normalized = normalizeDomain(domain);
        if (!normalized) throw new Error('domain obrigatório');

        const existing = await pool.query(
            `SELECT id FROM proxy_whitelist WHERE domain = $1`,
            [normalized],
        );
        if (existing.rowCount) throw new Error(`${normalized} já está na whitelist`);

        const { rows } = await pool.query(
            `
                INSERT INTO proxy_whitelist (domain, category, source, protected, active)
                VALUES ($1, $2, $3, FALSE, TRUE)
                RETURNING id, domain, category, source, protected, active, created_at
            `,
            [normalized, 'Custom', requestedBy],
        );
        await this.syncPolicyFiles();
        return rows[0];
    }

    async removeWhitelist(id: number) {
        await this.ensureBaseState();
        const { rows } = await pool.query(
            `
                DELETE FROM proxy_whitelist
                WHERE id = $1 AND protected = FALSE
                RETURNING id, domain
            `,
            [id],
        );
        if (!rows.length) throw new Error('Whitelist não encontrada');
        await this.syncPolicyFiles();
        return rows[0];
    }

    async addBlocklist(domain: string, requestedBy = 'system') {
        await this.ensureBaseState();
        const normalized = normalizeDomain(domain);
        if (!normalized) throw new Error('domain obrigatório');
        if (await this.isProtectedDomain(normalized)) {
            throw new Error(`${normalized} é protegido e não pode ser bloqueado`);
        }

        const whitelisted = await pool.query(
            `SELECT id FROM proxy_whitelist WHERE domain = $1 AND active = TRUE`,
            [normalized],
        );
        if (whitelisted.rowCount) {
            throw new Error(`${normalized} está na whitelist e não pode ser bloqueado`);
        }

        const existing = await pool.query(
            `SELECT id FROM proxy_blocklist WHERE domain = $1`,
            [normalized],
        );
        if (existing.rowCount) throw new Error(`${normalized} já está bloqueado`);

        const { rows } = await pool.query(
            `
                INSERT INTO proxy_blocklist (domain, source, active)
                VALUES ($1, $2, TRUE)
                RETURNING id, domain, source, active, created_at
            `,
            [normalized, requestedBy],
        );
        await this.syncPolicyFiles();
        return rows[0];
    }

    async removeBlocklist(id: number) {
        await this.ensureBaseState();
        const { rows } = await pool.query(
            `
                DELETE FROM proxy_blocklist
                WHERE id = $1
                RETURNING id, domain
            `,
            [id],
        );
        if (!rows.length) throw new Error('Bloqueio não encontrado');
        await this.syncPolicyFiles();
        return rows[0];
    }

    async syncPolicyFiles() {
        await this.ensureBaseState();

        const whitelist = await this.listWhitelist();
        const blocklist = await this.listBlocklist();
        const protectedDomains = await this.getProtectedDomains();
        const protectedDomainSet = new Set(protectedDomains);
        const enterpriseAllow = readAclFile(path.join(this.enterpriseDir, 'allowlist-global.acl'));
        const enterpriseBlock = readAclFile(path.join(this.enterpriseDir, 'blocklist-global.acl'));

        const customWhitelist = whitelist.map((row) => row.domain);
        const mergedWhitelist = Array.from(new Set([...customWhitelist, ...enterpriseAllow]));
        const mergedProtected = Array.from(new Set([...protectedDomains, ...enterpriseAllow]));
        const blockDomains = Array.from(new Set([
            ...blocklist.map((row) => row.domain).filter((domain) => !protectedDomainSet.has(normalizeDomain(domain))),
            ...enterpriseBlock,
        ])).filter((domain) => !mergedWhitelist.includes(domain) && !mergedProtected.includes(domain));

        fs.writeFileSync(this.squidWhitelistFile, `${mergedWhitelist.join('\n')}${mergedWhitelist.length ? '\n' : ''}`);
        fs.writeFileSync(this.squidBlocklistFile, `${blockDomains.join('\n')}${blockDomains.length ? '\n' : ''}`);
        fs.writeFileSync(this.squidProtectedFile, `${mergedProtected.join('\n')}${mergedProtected.length ? '\n' : ''}`);
        fs.writeFileSync(this.squidBumpFile, `${blockDomains.join('\n')}${blockDomains.length ? '\n' : ''}`);
        fs.writeFileSync(this.dnsBlocklistFile, `${blockDomains.join('\n')}${blockDomains.length ? '\n' : ''}`);

        // O RPZ principal agora é exclusivo do Policy Compiler. A camada legado
        // mantém apenas artefatos de compatibilidade do proxy antigo.
    }
}
