import { pool } from '../config/db';
import { ensureBlockingReleaseSchema } from './blocking-release-schema-service';

export type DnsIgnoredPattern = {
    id: number;
    pattern: string;
    match_type: 'exact' | 'contains' | 'suffix' | 'prefix';
    reason: string | null;
    active: boolean;
    created_at: string;
};

const DEFAULT_SEEDS: Omit<DnsIgnoredPattern, 'id' | 'created_at'>[] = [
    { pattern: 'vlan',                          match_type: 'contains', reason: 'Ruído de hardware — domínios de VLAN local', active: true },
    { pattern: '.local',                         match_type: 'suffix',   reason: 'Domínios mDNS/rede local',                  active: true },
    { pattern: 'api-cronos.intelbras.com.br',    match_type: 'exact',    reason: 'API periódica de hardware Intelbras',        active: true },
    { pattern: 'neverssl.com',                   match_type: 'exact',    reason: 'Detecção de portal cativo (Android/iOS)',    active: true },
    { pattern: 'tp-link.com',                    match_type: 'exact',    reason: 'Consulta periódica de firmware TP-Link',     active: true },
];

let _cache: DnsIgnoredPattern[] | null = null;
let _cacheExpires = 0;
const CACHE_TTL_MS = 30_000;

function escLike(s: string) {
    return s.replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export const dnsIgnoredService = {
    async seed() {
        await ensureBlockingReleaseSchema();
        for (const p of DEFAULT_SEEDS) {
            await pool.query(
                `INSERT INTO dns_ignored_domains (pattern, match_type, reason, active)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (pattern) DO NOTHING`,
                [p.pattern, p.match_type, p.reason, p.active],
            ).catch(() => null);
        }
    },

    invalidateCache() {
        _cache = null;
        _cacheExpires = 0;
    },

    async loadActive(): Promise<DnsIgnoredPattern[]> {
        if (_cache && Date.now() < _cacheExpires) return _cache;
        await ensureBlockingReleaseSchema();
        const { rows } = await pool.query(
            `SELECT id, pattern, match_type, reason, active, created_at
             FROM dns_ignored_domains WHERE active = TRUE ORDER BY id ASC`,
        );
        _cache = rows as DnsIgnoredPattern[];
        _cacheExpires = Date.now() + CACHE_TTL_MS;
        return _cache;
    },

    buildSqlFilter(patterns: DnsIgnoredPattern[], col: string): string {
        if (!patterns.length) return '';
        const parts: string[] = [];

        const exactList = patterns
            .filter((p) => p.match_type === 'exact')
            .map((p) => `'${escLike(p.pattern)}'`);
        if (exactList.length) {
            parts.push(`${col} NOT IN (${exactList.join(', ')})`);
        }

        for (const p of patterns.filter((x) => x.match_type !== 'exact')) {
            const esc = escLike(p.pattern);
            if (p.match_type === 'contains') parts.push(`${col} NOT LIKE '%${esc}%' ESCAPE '\\'`);
            else if (p.match_type === 'suffix') parts.push(`${col} NOT LIKE '%${esc}' ESCAPE '\\'`);
            else if (p.match_type === 'prefix') parts.push(`${col} NOT LIKE '${esc}%' ESCAPE '\\'`);
        }

        return parts.length ? '\n  AND ' + parts.join('\n  AND ') : '';
    },

    async list(): Promise<DnsIgnoredPattern[]> {
        await ensureBlockingReleaseSchema();
        const { rows } = await pool.query(
            `SELECT id, pattern, match_type, reason, active, created_at
             FROM dns_ignored_domains ORDER BY active DESC, id ASC`,
        );
        return rows as DnsIgnoredPattern[];
    },

    async add(pattern: string, match_type: string, reason?: string): Promise<DnsIgnoredPattern> {
        await ensureBlockingReleaseSchema();
        const { rows } = await pool.query(
            `INSERT INTO dns_ignored_domains (pattern, match_type, reason, active)
             VALUES ($1, $2, $3, TRUE)
             ON CONFLICT (pattern) DO UPDATE SET match_type = $2, reason = COALESCE($3, dns_ignored_domains.reason), active = TRUE
             RETURNING id, pattern, match_type, reason, active, created_at`,
            [pattern.trim().toLowerCase(), match_type || 'contains', reason || null],
        );
        this.invalidateCache();
        return rows[0] as DnsIgnoredPattern;
    },

    async remove(id: number): Promise<void> {
        await pool.query(`DELETE FROM dns_ignored_domains WHERE id = $1`, [id]);
        this.invalidateCache();
    },

    async toggle(id: number): Promise<DnsIgnoredPattern | null> {
        const { rows } = await pool.query(
            `UPDATE dns_ignored_domains SET active = NOT active WHERE id = $1
             RETURNING id, pattern, match_type, reason, active, created_at`,
            [id],
        );
        this.invalidateCache();
        return rows[0] as DnsIgnoredPattern || null;
    },

    async shouldIgnore(domain: string): Promise<boolean> {
        const patterns = await this.loadActive().catch(() => [] as DnsIgnoredPattern[]);
        const d = domain.toLowerCase();
        for (const p of patterns) {
            if (p.match_type === 'exact' && d === p.pattern) return true;
            if (p.match_type === 'contains' && d.includes(p.pattern)) return true;
            if (p.match_type === 'suffix' && d.endsWith(p.pattern)) return true;
            if (p.match_type === 'prefix' && d.startsWith(p.pattern)) return true;
        }
        return false;
    },
};
