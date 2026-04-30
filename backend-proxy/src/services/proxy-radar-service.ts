import { pool } from '../config/db';
import { ensureBlockingReleaseSchema } from './blocking-release-schema-service';
import { identityEnrichmentService } from './identity-enrichment-service';

export class ProxyRadarService {
    async getOverview(range = '24h') {
        await ensureBlockingReleaseSchema();
        const interval = range === '7d' ? '7 days' : range === '30d' ? '30 days' : '24 hours';
        const [topHosts, topBlockedHosts, topBlockedIps, topVlans, topCategories, totals] = await Promise.all([
            pool.query(`
                SELECT COALESCE(host, '-') AS domain, COUNT(*)::int AS total
                FROM proxy_policy_events
                WHERE occurred_at >= NOW() - INTERVAL '${interval}'
                GROUP BY 1
                ORDER BY total DESC, domain ASC
                LIMIT 8
            `),
            pool.query(`
                SELECT COALESCE(host, '-') AS domain, COUNT(*)::int AS total
                FROM proxy_policy_events
                WHERE occurred_at >= NOW() - INTERVAL '${interval}'
                  AND action = 'blocked'
                GROUP BY 1
                ORDER BY total DESC, domain ASC
                LIMIT 8
            `),
            pool.query(`
                SELECT host(client_ip) AS client_ip, COUNT(*)::int AS total
                FROM proxy_policy_events
                WHERE occurred_at >= NOW() - INTERVAL '${interval}'
                  AND action = 'blocked'
                  AND client_ip IS NOT NULL
                GROUP BY client_ip
                ORDER BY total DESC, client_ip ASC
                LIMIT 8
            `),
            pool.query(`
                SELECT vlan_id, COUNT(*)::int AS total
                FROM proxy_policy_events
                WHERE occurred_at >= NOW() - INTERVAL '${interval}'
                  AND vlan_id IS NOT NULL
                GROUP BY vlan_id
                ORDER BY total DESC, vlan_id ASC
                LIMIT 8
            `),
            pool.query(`
                SELECT COALESCE(category, 'Sem categoria') AS category, COUNT(*)::int AS total
                FROM proxy_policy_events
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
                FROM proxy_policy_events
                WHERE occurred_at >= NOW() - INTERVAL '${interval}'
            `),
        ]);

        return {
            range,
            cards: totals.rows[0] || {},
            topDomains: topHosts.rows,
            topBlockedDomains: topBlockedHosts.rows,
            topBlockedIps: identityEnrichmentService.enrichRows(topBlockedIps.rows),
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
            where.push(`LOWER(COALESCE(host, '')) LIKE $${params.length}`);
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
                SELECT id, occurred_at, host(client_ip) AS client_ip, vlan_id, host, url_or_host, method, status_code,
                       action, category, rule_id, matched_rule, proxy_layer
                FROM proxy_policy_events
                WHERE ${where.join(' AND ')}
                ORDER BY occurred_at DESC
                LIMIT $${params.length}
            `,
            params,
        );
        return identityEnrichmentService.enrichRows(rows);
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
            FROM proxy_policy_events
            WHERE occurred_at >= NOW() - INTERVAL '${interval}'
            GROUP BY 1
            ORDER BY 1 ASC
        `);
        return rows;
    }
}

export const proxyRadarService = new ProxyRadarService();
