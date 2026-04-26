import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { pool } from '../config/db';
import { env } from '../config/env';
import { ensureProxySchema } from './proxy-schema-service';
import { ensureBlockingReleaseSchema } from './blocking-release-schema-service';
import { policyResolutionService } from './policy-resolution-service';
import { extractVlanIdFromIp } from './blocking-release-scope';

const normalizeRadarScope = async (clientIp: string | null | undefined, fallbackVlanId: number | null | undefined) => {
    const vlan = await policyResolutionService.resolveVlanByIp(clientIp);
    const vlanId = vlan?.vlan_id || fallbackVlanId || null;
    return {
        vlanKey: vlanId ? `VLAN${vlanId}` : null,
        interfaceName: vlan?.interface_name || null,
    };
};

const LOG_FILE = '/var/log/squid/access.log';
const LOCAL_NOISE = new Set(['127.0.0.1', '::1', '']);

const normalizeDomain = (rawUrl: string | null | undefined) => {
    if (!rawUrl) return '-';
    const clean = rawUrl.trim();
    try {
        if (clean.startsWith('http://') || clean.startsWith('https://')) {
            return new URL(clean).hostname || clean;
        }
        if (clean.includes('/')) return clean.split('/')[0];
        if (clean.includes(':')) return clean.split(':')[0];
        return clean;
    } catch {
        return clean;
    }
};

export const parseSquidAccessLine = (line: string) => {
    const match = line.match(/^(\d+\.\d+)\s+(\d+)\s+([0-9a-fA-F\.:]+)\s+([^\s]+)\s+(\d+)\s+(\w+)\s+([^\s]+)/);
    if (!match) return null;

    const clientIp = String(match[3] || '').trim();
    const hierarchyStatus = String(match[4] || '').trim();
    const statusCode = parseInt(match[5] || '0', 10) || 0;
    const method = String(match[6] || 'GET').trim();
    const url = String(match[7] || '').trim();
    const domain = normalizeDomain(url);
    const blocked = hierarchyStatus.includes('DENIED') || hierarchyStatus.includes('BLOCK');
    const source = LOCAL_NOISE.has(clientIp) ? 'server-local' : 'other-client';

    return {
        clientIp,
        domain,
        url,
        method,
        bytes: parseInt(match[5] || '0', 10) || 0,
        statusCode,
        hierarchyStatus,
        blocked,
        source,
        evidence: source === 'server-local' ? 'LOCAL_NOISE' : 'REAL_CLIENT',
    };
};

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const inferVlanKey = (clientIp: string | null | undefined, storedVlan: string | null | undefined) => {
    const inferred = extractVlanIdFromIp(clientIp);
    if (inferred !== null) return `VLAN${inferred}`;
    return String(storedVlan || '').trim() || 'Sem classificação';
};

export class DnsLoggerService {
    readonly pidFile = path.join(env.proxyStateDir, 'dns-logger.pid');
    readonly logFile = path.join(env.proxyStateDir, 'logs', 'dns-logger.log');

    constructor() {
        fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
    }

    async ingestLine(line: string) {
        await ensureProxySchema();
        await ensureBlockingReleaseSchema();
        const parsed = parseSquidAccessLine(line);
        if (!parsed) return;
        const resolved = await policyResolutionService.resolveProxyDecision(parsed.clientIp, parsed.domain);
        const radarScope = await normalizeRadarScope(parsed.clientIp, resolved.vlan_id);
        const fingerprint = sha256([
            parsed.clientIp,
            parsed.domain,
            parsed.url,
            parsed.method,
            parsed.statusCode,
            parsed.hierarchyStatus,
            parsed.source,
        ].join('|'));

        await pool.query(
            `
                INSERT INTO proxy_audit_log (timestamp, client_ip, url, method, status_code, bytes, action)
                VALUES (NOW(), $1, $2, $3, $4, $5, $6)
            `,
            [
                parsed.clientIp,
                parsed.url,
                parsed.method,
                parsed.statusCode,
                parsed.bytes,
                parsed.blocked ? 'DENIED' : 'AUDIT',
            ],
        ).catch(() => undefined);

        await pool.query(
            `
                INSERT INTO proxy_radar_events (
                    occurred_at,
                    vlan_id,
                    interface_name,
                    client_ip,
                    domain,
                    event_type,
                    evidence,
                    status,
                    blocked,
                    source,
                    raw_payload
                )
                VALUES (
                    NOW(),
                    $1,
                    $2,
                    $3,
                    $4,
                    'squid-access',
                    $5,
                    $6,
                    $7,
                    $8,
                    $9::jsonb
                )
            `,
            [
                radarScope.vlanKey,
                radarScope.interfaceName,
                parsed.clientIp,
                parsed.domain,
                parsed.evidence,
                parsed.hierarchyStatus,
                parsed.blocked,
                parsed.source,
                JSON.stringify({ ...parsed, resolved, radar_scope: radarScope }),
            ],
        );

        await pool.query(
            `
                INSERT INTO proxy_policy_events (
                    occurred_at,
                    client_ip,
                    vlan_id,
                    host,
                    url_or_host,
                    method,
                    status_code,
                    action,
                    category,
                    rule_id,
                    matched_rule,
                    proxy_layer,
                    raw_payload,
                    fingerprint
                )
                VALUES (
                    NOW(),
                    $1::inet,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9,
                    $10,
                    'explicit',
                    $11::jsonb,
                    $12
                )
                ON CONFLICT (fingerprint) DO NOTHING
            `,
            [
                parsed.clientIp || null,
                resolved.vlan_id,
                parsed.domain,
                parsed.url,
                parsed.method,
                parsed.statusCode,
                parsed.blocked ? 'blocked' : resolved.action,
                resolved.category,
                resolved.rule_id,
                resolved.matched_rule,
                JSON.stringify({ parsed, resolved }),
                fingerprint,
            ],
        ).catch(() => undefined);
    }

    isPidRunning(pid: number) {
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    }

    async status() {
        const pid = fs.existsSync(this.pidFile) ? Number(fs.readFileSync(this.pidFile, 'utf8').trim()) : 0;
        return {
            active: pid > 0 && this.isPidRunning(pid),
            pid: pid || null,
            log_file: this.logFile,
            source_file: LOG_FILE,
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
        const scriptPath = path.join(env.projectRoot, 'backend-proxy', 'dist', 'ingester.js');

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
        await ensureProxySchema();
        const result = await pool.query(
            `DELETE FROM proxy_radar_events WHERE occurred_at < NOW() - ($1 || ' days')::interval`,
            [String(days)],
        );
        await pool.query(
            `DELETE FROM proxy_audit_log WHERE timestamp < NOW() - ($1 || ' days')::interval`,
            [String(days)],
        ).catch(() => undefined);
        return result.rowCount || 0;
    }

    async clear(scope: 'all' | 'noise' = 'noise') {
        await ensureProxySchema();
        if (scope === 'all') {
            const result = await pool.query(`DELETE FROM proxy_radar_events`);
            return { deleted: result.rowCount || 0, message: 'Histórico do radar zerado.' };
        }

        const result = await pool.query(
            `
                DELETE FROM proxy_radar_events
                WHERE source = 'server-local'
                   OR client_ip IS NULL
                   OR client_ip = ''
            `,
        );
        return { deleted: result.rowCount || 0, message: 'Ruído local removido do radar.' };
    }

    async getRadar(limit = 200, vlan = 'todas', blockedOnly = false) {
        await ensureProxySchema();
        const safeLimit = Math.max(1, Math.min(limit, 500));
        const params: any[] = [safeLimit];
        const filters = ['1 = 1'];

        if (blockedOnly) {
            params.push(true);
            filters.push(`blocked = $${params.length}`);
        }

        if (vlan && vlan !== 'todas') {
            params.push(vlan);
            filters.push(`COALESCE(NULLIF(vlan_id, ''), CONCAT('VLAN', CAST(substring(client_ip from '^192\\.168\\.([0-9]{1,3})\\.') AS integer))) = $${params.length}`);
        }

        const { rows } = await pool.query(
            `
                SELECT id, occurred_at, vlan_id, client_ip, domain, event_type, evidence, status, blocked, source
                FROM proxy_radar_events
                WHERE ${filters.join(' AND ')}
                ORDER BY occurred_at DESC
                LIMIT $1
            `,
            params,
        );

        const realClients = Array.from(new Set(
            rows
                .filter((row) => row.source !== 'server-local' && row.client_ip)
                .map((row) => row.client_ip),
        ));
        const localNoise = Array.from(new Set(
            rows
                .filter((row) => row.source === 'server-local')
                .map((row) => row.client_ip),
        ));

        return {
            entries: rows.map((row) => ({
                id: row.id,
                timestamp: row.occurred_at,
                vlan: inferVlanKey(row.client_ip, row.vlan_id),
                client_ip: row.client_ip,
                domain: row.domain,
                query_type: row.event_type,
                blocked: row.blocked,
                local_noise: row.source === 'server-local',
                real_client: row.source !== 'server-local',
                evidence: row.evidence,
                status: row.status,
            })),
            summary: {
                observed_clients: realClients,
                dns_server_ip: env.proxyDnsServerIp,
                real_clients_seen: realClients,
                local_noise_seen: localNoise,
                local_noise_count: rows.filter((row) => row.source === 'server-local').length,
                real_client_count: rows.filter((row) => row.source !== 'server-local').length,
                has_real_clients: realClients.length > 0,
                monitored_scope: env.proxyTestTargetIp,
            },
        };
    }

    async stats() {
        await ensureProxySchema();
        const [events, blocked, activeIps, recent] = await Promise.all([
            pool.query(`SELECT COUNT(*)::int AS total FROM proxy_radar_events WHERE occurred_at >= CURRENT_DATE`),
            pool.query(`SELECT COUNT(*)::int AS total FROM proxy_radar_events WHERE occurred_at >= CURRENT_DATE AND blocked = TRUE`),
            pool.query(`SELECT COUNT(DISTINCT client_ip)::int AS total FROM proxy_radar_events WHERE occurred_at >= CURRENT_DATE AND source <> 'server-local'`),
            pool.query(`SELECT COUNT(*)::int AS total FROM proxy_radar_events WHERE occurred_at >= NOW() - INTERVAL '5 minutes'`),
        ]);

        return {
            totalQueries: events.rows[0]?.total || 0,
            blockedQueries: blocked.rows[0]?.total || 0,
            avgLatency: 0,
            activeZones: 1,
            total_hoje: events.rows[0]?.total || 0,
            bloqueados_hoje: blocked.rows[0]?.total || 0,
            ips_ativos: activeIps.rows[0]?.total || 0,
            queries_5min: recent.rows[0]?.total || 0,
        };
    }

    async topBlocked() {
        await ensureProxySchema();
        const { rows } = await pool.query(
            `
                SELECT domain, COUNT(*)::int AS attempts, COUNT(DISTINCT client_ip)::int AS unique_ips
                FROM proxy_radar_events
                WHERE occurred_at >= CURRENT_DATE
                  AND blocked = TRUE
                  AND domain IS NOT NULL
                  AND domain <> '-'
                GROUP BY domain
                ORDER BY attempts DESC, domain ASC
                LIMIT 20
            `,
        );
        return rows;
    }
}
