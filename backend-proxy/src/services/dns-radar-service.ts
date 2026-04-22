import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { pool } from '../config/db';
import { env } from '../config/env';
import { ensureBlockingReleaseSchema } from './blocking-release-schema-service';
import { policyResolutionService } from './policy-resolution-service';

type PendingRpz = {
    matchedRule: string | null;
    queryName: string;
    queryType: string;
    clientIp: string;
    occurredAt: string;
};

const JOURNAL_ARGS = ['-fu', 'unbound', '-n', '200', '--no-pager', '-o', 'short-iso'];

const normalizeDomain = (value: string) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.$/, '');

const QUERY_RESULT_REGEX = /^(\d{4}-\d{2}-\d{2}T[^\s]+)\s+\S+\s+unbound\[\d+\]:\s+\[\d+:\d+\]\s+info:\s+([0-9a-fA-F\.:]+)\s+(.+?)\.\s+([A-Z0-9]+)\s+IN\s+([A-Z]+)\s+([0-9.]+)\s+(\d+)\s+(\d+)$/;
const RPZ_REGEX = /^(\d{4}-\d{2}-\d{2}T[^\s]+)\s+\S+\s+unbound\[\d+\]:\s+\[\d+:\d+\]\s+info:\s+rpz:\s+applied\s+\[(.+?)\]\s+(.+?)\s+rpz-[^\s]+\s+([0-9a-fA-F\.:]+)@\d+\s+(.+?)\.\s+([A-Z0-9]+)\s+IN$/;
const LOCAL_DNS_NOISE = new Set(['127.0.0.1', '::1']);

const buildKey = (clientIp: string, queryName: string, queryType: string) => [clientIp, normalizeDomain(queryName), queryType].join('|');
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export class DnsRadarService {
    readonly pidFile = path.join(env.proxyStateDir, 'dns-radar', 'dns-radar.pid');
    readonly logFile = path.join(env.proxyStateDir, 'dns-radar', 'dns-radar.log');
    readonly resolver = 'unbound';
    private pendingRpz = new Map<string, PendingRpz>();

    constructor() {
        fs.mkdirSync(path.dirname(this.pidFile), { recursive: true });
    }

    private cleanupPendingMap() {
        const now = Date.now();
        for (const [key, value] of this.pendingRpz.entries()) {
            if ((now - new Date(value.occurredAt).getTime()) > 15_000) {
                this.pendingRpz.delete(key);
            }
        }
    }

    parseLine(line: string) {
        const rpzMatch = line.match(RPZ_REGEX);
        if (rpzMatch) {
            return {
                type: 'rpz' as const,
                occurredAt: rpzMatch[1],
                policyName: rpzMatch[2],
                matchedRule: rpzMatch[3],
                clientIp: rpzMatch[4],
                queryName: normalizeDomain(rpzMatch[5]),
                queryType: rpzMatch[6],
            };
        }

        const resultMatch = line.match(QUERY_RESULT_REGEX);
        if (resultMatch) {
            return {
                type: 'result' as const,
                occurredAt: resultMatch[1],
                clientIp: resultMatch[2],
                queryName: normalizeDomain(resultMatch[3]),
                queryType: resultMatch[4],
                responseCode: resultMatch[5],
                durationMs: Math.round(Number(resultMatch[6] || '0') * 1000),
                cacheFlag: Number(resultMatch[7] || '0'),
                answerSize: Number(resultMatch[8] || '0'),
            };
        }

        return null;
    }

    async ingestLine(line: string) {
        await ensureBlockingReleaseSchema();
        const parsed = this.parseLine(line);
        if (!parsed) return null;

        this.cleanupPendingMap();

        if (parsed.type === 'rpz') {
            if (LOCAL_DNS_NOISE.has(parsed.clientIp)) return null;
            this.pendingRpz.set(buildKey(parsed.clientIp, parsed.queryName, parsed.queryType), {
                matchedRule: parsed.matchedRule,
                queryName: parsed.queryName,
                queryType: parsed.queryType,
                clientIp: parsed.clientIp,
                occurredAt: parsed.occurredAt,
            });
            return null;
        }

        if (LOCAL_DNS_NOISE.has(parsed.clientIp)) return null;
        const key = buildKey(parsed.clientIp, parsed.queryName, parsed.queryType);
        const rpz = this.pendingRpz.get(key) || null;
        if (rpz) this.pendingRpz.delete(key);

        const resolved = await policyResolutionService.resolveDnsDecision(parsed.clientIp, parsed.queryName);
        const action = rpz && resolved.action !== 'bypassed' ? 'blocked' : resolved.action;
        const payload = {
            parser: 'journalctl-short-iso',
            rpz,
            resolved,
            response_code: parsed.responseCode,
            duration_ms: parsed.durationMs,
            cache_flag: parsed.cacheFlag,
            answer_size: parsed.answerSize,
            raw_line: line,
        };
        const fingerprint = sha256([
            parsed.occurredAt,
            parsed.clientIp,
            parsed.queryName,
            parsed.queryType,
            parsed.responseCode,
            action,
            this.resolver,
        ].join('|'));

        await pool.query(
            `
                INSERT INTO dns_policy_events (
                    occurred_at,
                    client_ip,
                    vlan_id,
                    query_name,
                    query_type,
                    response_code,
                    action,
                    policy_source,
                    category,
                    rule_id,
                    matched_rule,
                    resolver,
                    raw_payload,
                    fingerprint
                )
                VALUES (
                    $1::timestamptz,
                    $2::inet,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9,
                    $10,
                    $11,
                    $12,
                    $13::jsonb,
                    $14
                )
                ON CONFLICT (fingerprint) DO NOTHING
            `,
            [
                parsed.occurredAt,
                parsed.clientIp || null,
                resolved.vlan_id,
                parsed.queryName,
                parsed.queryType,
                parsed.responseCode,
                action,
                resolved.policy_source,
                resolved.category,
                resolved.rule_id,
                rpz?.matchedRule || resolved.matched_rule,
                this.resolver,
                JSON.stringify(payload),
                fingerprint,
            ],
        );
        return { ...parsed, action, resolved, rpz };
    }

    private isPidRunning(pid: number) {
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    }

    async status() {
        const pid = fs.existsSync(this.pidFile) ? Number(fs.readFileSync(this.pidFile, 'utf8').trim()) : 0;
        const active = pid > 0 && this.isPidRunning(pid);
        const recent = await pool.query(
            `SELECT COUNT(*)::int AS total, MAX(occurred_at) AS last_seen_at FROM dns_policy_events WHERE occurred_at >= NOW() - INTERVAL '10 minutes'`,
        ).catch(() => ({ rows: [{ total: 0, last_seen_at: null }] as any[] }));

        return {
            active,
            pid: pid || null,
            log_file: this.logFile,
            source: 'journalctl -fu unbound -o short-iso',
            last_seen_at: recent.rows[0]?.last_seen_at || null,
            events_10m: recent.rows[0]?.total || 0,
        };
    }

    async ensureRunning() {
        const current = await this.status();
        if (current.active) return current;
        return this.start();
    }

    async start() {
        const out = fs.openSync(this.logFile, 'a');
        const err = fs.openSync(this.logFile, 'a');
        const scriptPath = path.join(env.projectRoot, 'backend-proxy', 'dist', 'dns-radar-ingester.js');
        const child = spawn(process.execPath, [scriptPath], {
            detached: true,
            stdio: ['ignore', out, err],
        });
        child.unref();
        fs.writeFileSync(this.pidFile, String(child.pid));
        return { active: true, pid: child.pid, log_file: this.logFile };
    }

    async restart() {
        const current = await this.status();
        if (current.active && current.pid) {
            try {
                process.kill(current.pid, 'SIGTERM');
            } catch {
                // noop
            }
        }
        return this.start();
    }

    async cleanup(days = 30) {
        await ensureBlockingReleaseSchema();
        const result = await pool.query(
            `DELETE FROM dns_policy_events WHERE occurred_at < NOW() - ($1 || ' days')::interval`,
            [String(days)],
        );
        return result.rowCount || 0;
    }

    async getOverview(range = '24h') {
        await ensureBlockingReleaseSchema();
        const interval = range === '7d' ? '7 days' : range === '30d' ? '30 days' : '24 hours';
        const [topDomains, topBlockedDomains, topIps, topVlans, topCategories, totals] = await Promise.all([
            pool.query(`
                SELECT query_name AS domain, COUNT(*)::int AS total
                FROM dns_policy_events
                WHERE occurred_at >= NOW() - INTERVAL '${interval}'
                GROUP BY query_name
                ORDER BY total DESC, domain ASC
                LIMIT 8
            `),
            pool.query(`
                SELECT query_name AS domain, COUNT(*)::int AS total
                FROM dns_policy_events
                WHERE occurred_at >= NOW() - INTERVAL '${interval}'
                  AND action = 'blocked'
                GROUP BY query_name
                ORDER BY total DESC, domain ASC
                LIMIT 8
            `),
            pool.query(`
                SELECT host(client_ip) AS client_ip, COUNT(*)::int AS total
                FROM dns_policy_events
                WHERE occurred_at >= NOW() - INTERVAL '${interval}'
                  AND action = 'blocked'
                  AND client_ip IS NOT NULL
                GROUP BY client_ip
                ORDER BY total DESC, client_ip ASC
                LIMIT 8
            `),
            pool.query(`
                SELECT vlan_id, COUNT(*)::int AS total
                FROM dns_policy_events
                WHERE occurred_at >= NOW() - INTERVAL '${interval}'
                  AND vlan_id IS NOT NULL
                GROUP BY vlan_id
                ORDER BY total DESC, vlan_id ASC
                LIMIT 8
            `),
            pool.query(`
                SELECT COALESCE(category, 'Sem categoria') AS category, COUNT(*)::int AS total
                FROM dns_policy_events
                WHERE occurred_at >= NOW() - INTERVAL '${interval}'
                  AND action = 'blocked'
                GROUP BY 1
                ORDER BY total DESC, category ASC
                LIMIT 8
            `),
            pool.query(`
                SELECT
                    COUNT(*)::int AS total_attempts,
                    COUNT(*) FILTER (WHERE action = 'blocked')::int AS blocked_attempts,
                    COUNT(*) FILTER (WHERE action = 'allowed')::int AS allowed_attempts,
                    COUNT(*) FILTER (WHERE action = 'bypassed')::int AS bypassed_attempts,
                    COUNT(DISTINCT client_ip)::int AS unique_ips
                FROM dns_policy_events
                WHERE occurred_at >= NOW() - INTERVAL '${interval}'
            `),
        ]);

        return {
            range,
            cards: totals.rows[0] || {},
            topDomains: topDomains.rows,
            topBlockedDomains: topBlockedDomains.rows,
            topBlockedIps: topIps.rows,
            topVlans: topVlans.rows,
            topBlockedCategories: topCategories.rows,
        };
    }

    async getEvents(filters: Record<string, any> = {}) {
        await ensureBlockingReleaseSchema();
        const params: any[] = [];
        const where = ['1 = 1'];
        const limit = Math.max(1, Math.min(Number(filters.limit || 100), 500));

        if (filters.domain) {
            params.push(`%${String(filters.domain).toLowerCase()}%`);
            where.push(`LOWER(query_name) LIKE $${params.length}`);
        }
        if (filters.client_ip) {
            params.push(String(filters.client_ip));
            where.push(`client_ip = $${params.length}::inet`);
        }
        if (filters.vlan_id) {
            params.push(Number(filters.vlan_id));
            where.push(`vlan_id = $${params.length}`);
        }
        if (filters.action) {
            params.push(String(filters.action));
            where.push(`action = $${params.length}`);
        }
        if (filters.category) {
            params.push(String(filters.category));
            where.push(`category = $${params.length}`);
        }
        if (filters.range) {
            const interval = filters.range === '7d' ? '7 days' : filters.range === '30d' ? '30 days' : '24 hours';
            where.push(`occurred_at >= NOW() - INTERVAL '${interval}'`);
        }

        params.push(limit);
        const { rows } = await pool.query(
            `
                SELECT id, occurred_at, host(client_ip) AS client_ip, vlan_id, query_name, query_type, response_code,
                       action, policy_source, category, rule_id, matched_rule, resolver
                FROM dns_policy_events
                WHERE ${where.join(' AND ')}
                ORDER BY occurred_at DESC
                LIMIT $${params.length}
            `,
            params,
        );
        return rows;
    }

    async getTimeline(range = '24h') {
        await ensureBlockingReleaseSchema();
        const interval = range === '7d' ? '7 days' : range === '30d' ? '30 days' : '24 hours';
        const bucket = range === '24h' ? 'hour' : 'day';
        const { rows } = await pool.query(`
            SELECT
                TO_CHAR(date_trunc('${bucket}', occurred_at), '${bucket === 'hour' ? 'YYYY-MM-DD HH24:00' : 'YYYY-MM-DD'}') AS bucket,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE action = 'blocked')::int AS blocked,
                COUNT(*) FILTER (WHERE action = 'allowed')::int AS allowed,
                COUNT(*) FILTER (WHERE action = 'bypassed')::int AS bypassed
            FROM dns_policy_events
            WHERE occurred_at >= NOW() - INTERVAL '${interval}'
            GROUP BY 1
            ORDER BY 1 ASC
        `);
        return rows;
    }
}

export const dnsRadarService = new DnsRadarService();
