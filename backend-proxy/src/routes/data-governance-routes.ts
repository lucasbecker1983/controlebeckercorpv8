import { Router } from 'express';
import { pool } from '../config/db';
import { blockingAuditService } from '../services/blocking-audit-service';
import { blockingReleaseService } from '../services/blocking-release-service';
import { MANAGED_VLAN_SQL_LIST } from '../services/blocking-release-scope';

const router = Router();

const PERIOD_INTERVALS: Record<string, string> = {
    '24h': '24 hours',
    '7d': '7 days',
    '30d': '30 days',
    '90d': '90 days',
};

const resolveSinceExpr = (period: string) => `NOW() - INTERVAL '${PERIOD_INTERVALS[period] || PERIOD_INTERVALS['24h']}'`;

const governanceEventsCte = (sinceExpr: string) => `
    WITH events AS (
        SELECT
            occurred_at,
            host(client_ip) AS client_ip,
            vlan_id,
            lower(query_name) AS domain,
            action,
            'dns'::text AS source
        FROM dns_policy_events
        WHERE occurred_at >= ${sinceExpr}
          AND (vlan_id IS NULL OR vlan_id IN (${MANAGED_VLAN_SQL_LIST}))
        UNION ALL
        SELECT
            occurred_at,
            host(client_ip) AS client_ip,
            vlan_id,
            lower(host) AS domain,
            action,
            'proxy'::text AS source
        FROM proxy_policy_events
        WHERE occurred_at >= ${sinceExpr}
          AND (vlan_id IS NULL OR vlan_id IN (${MANAGED_VLAN_SQL_LIST}))
    )
`;

const summarizeTopVlan = (rows: any[] = []) => {
    if (!Array.isArray(rows) || !rows.length) return null;
    const top = rows[0];
    return {
        vlan_id: top.vlan_id,
        total: Number(top.total || 0),
        blocked: Number(top.blocked || 0),
    };
};

const buildGovernanceMetrics = async (period: string) => {
    const sinceExpr = resolveSinceExpr(period);
    const cte = governanceEventsCte(sinceExpr);

    const [
        topSites,
        topBlocked,
        topIps,
        topVlans,
        hourly,
        daily,
        recent,
        allowedDomains,
        serviceTrend,
        heatmapRows,
        totals,
        exceptionUsage,
    ] = await Promise.all([
        pool.query(`${cte}
            SELECT domain, COUNT(*)::int AS total
            FROM events
            WHERE domain IS NOT NULL AND domain <> ''
            GROUP BY domain
            ORDER BY total DESC NULLS LAST
            LIMIT 8`),
        pool.query(`${cte}
            SELECT domain, COUNT(*)::int AS total
            FROM events
            WHERE domain IS NOT NULL AND domain <> '' AND action = 'blocked'
            GROUP BY domain
            ORDER BY total DESC NULLS LAST
            LIMIT 8`),
        pool.query(`${cte}
            SELECT client_ip, COUNT(*)::int AS total
            FROM events
            WHERE client_ip IS NOT NULL AND client_ip <> '' AND action = 'blocked'
            GROUP BY client_ip
            ORDER BY total DESC NULLS LAST
            LIMIT 8`),
        pool.query(`${cte}
            SELECT vlan_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE action = 'blocked')::int AS blocked
            FROM events
            WHERE vlan_id IS NOT NULL
            GROUP BY vlan_id
            ORDER BY total DESC NULLS LAST
            LIMIT 8`),
        pool.query(`${cte}
            SELECT EXTRACT(HOUR FROM occurred_at)::int AS hour, COUNT(*)::int AS total
            FROM events
            GROUP BY hour
            ORDER BY hour ASC`),
        pool.query(`${cte}
            SELECT TO_CHAR(occurred_at, 'YYYY-MM-DD') AS day, COUNT(*)::int AS total
            FROM events
            GROUP BY day
            ORDER BY day ASC`),
        pool.query(`${cte}
            SELECT occurred_at, client_ip, vlan_id, domain, action, source
            FROM events
            ORDER BY occurred_at DESC
            LIMIT 20`),
        pool.query(`${cte}
            SELECT domain, COUNT(*)::int AS total
            FROM events
            WHERE domain IS NOT NULL AND domain <> '' AND action = 'allowed'
            GROUP BY domain
            ORDER BY total DESC NULLS LAST
            LIMIT 8`),
        pool.query(`SELECT created_at::date AS day, COUNT(*)::int AS changes FROM action_audit_logs WHERE created_at >= ${sinceExpr} GROUP BY day ORDER BY day ASC`),
        pool.query(`${cte}
            SELECT EXTRACT(DOW FROM occurred_at)::int AS dow, EXTRACT(HOUR FROM occurred_at)::int AS hour, COUNT(*)::int AS total
            FROM events
            GROUP BY dow, hour
            ORDER BY dow ASC, hour ASC`),
        pool.query(`${cte}
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE action = 'blocked')::int AS blocked,
                COUNT(*) FILTER (WHERE action = 'allowed')::int AS allowed,
                COUNT(*) FILTER (WHERE action = 'bypassed')::int AS bypassed,
                COUNT(DISTINCT client_ip)::int AS unique_ips,
                COUNT(DISTINCT domain)::int AS unique_domains
            FROM events`),
        pool.query(`
            SELECT exception_type, COUNT(*)::int AS total
            FROM policy_exceptions
            WHERE active = TRUE
              AND (vlan_id IN (${MANAGED_VLAN_SQL_LIST}) OR CAST(substring(host(ip) from '^192\\.168\\.([0-9]{1,3})\\.') AS integer) IN (${MANAGED_VLAN_SQL_LIST}))
            GROUP BY exception_type
            ORDER BY total DESC
        `),
    ]);

    return {
        range: period,
        summary: totals.rows[0] || {},
        topSites: topSites.rows,
        topBlocked: topBlocked.rows,
        topIps: topIps.rows,
        topVlans: topVlans.rows,
        hourly: hourly.rows,
        daily: daily.rows,
        recentAttempts: recent.rows,
        releasedDomains: allowedDomains.rows,
        exceptionUsage: exceptionUsage.rows,
        serviceTrend: serviceTrend.rows,
        heatmap: heatmapRows.rows,
    };
};

router.get('/overview', async (req, res) => {
    try {
        const period = String(req.query.period || '24h');
        const [metricsResult, auditResult, radarResult, healthResult, statusResult] = await Promise.allSettled([
            buildGovernanceMetrics(period),
            blockingAuditService.listEvents({ period, limit: 160 }),
            blockingAuditService.getRealtimeRadar({ window_minutes: 10, limit: 100 }),
            blockingReleaseService.getHealth(),
            blockingReleaseService.getStatus(),
        ]);

        const metrics = metricsResult.status === 'fulfilled' ? metricsResult.value : {
            summary: {},
            topBlocked: [],
            topSites: [],
            topVlans: [],
        };
        const audit = auditResult.status === 'fulfilled' ? auditResult.value : {
            summary: {},
            events: [],
        };
        const radar = radarResult.status === 'fulfilled' ? radarResult.value : {
            summary: null,
        };
        const health = healthResult.status === 'fulfilled' ? healthResult.value : null;
        const status = statusResult.status === 'fulfilled' ? statusResult.value : null;
        const summary = (metrics?.summary || audit?.summary || {}) as Record<string, number>;
        const topBlockedDomain = Array.isArray(metrics.topBlocked) && metrics.topBlocked.length ? metrics.topBlocked[0] : null;
        const topAllowedDomain = Array.isArray(metrics.topSites) && metrics.topSites.length ? metrics.topSites[0] : null;
        const topVlan = summarizeTopVlan(metrics.topVlans);
        const integrityScoreRaw = String(health?.integrity_score || '0').trim();
        const integrityScore = integrityScoreRaw.includes('/')
            ? Number(integrityScoreRaw.split('/')[0] || 0)
            : Number(integrityScoreRaw || 0);
        const servicePosture = {
            policy_engine: health?.services?.policy_engine || status?.engine?.enforcement_mode || 'unknown',
            dns_radar: health?.services?.dns_radar || 'unknown',
            dns_contingency: health?.services?.dns_contingency || 'unknown',
            integrity_score: Number.isFinite(integrityScore) ? integrityScore : 0,
            degraded: Boolean(health?.degraded),
        };

        res.json({
            generated_at: new Date().toISOString(),
            period,
            summary: {
                total_events: Number(summary.total || 0),
                blocked_events: Number(summary.blocked || 0),
                allowed_events: Number(summary.allowed || 0),
                bypassed_events: Number(summary.bypassed || 0),
                unique_ips: Number(summary.unique_ips || 0),
                unique_domains: Number(summary.unique_domains || 0),
            },
            highlights: {
                top_blocked_domain: topBlockedDomain,
                top_allowed_domain: topAllowedDomain,
                top_vlan: topVlan,
                hot_window: radar?.summary || null,
            },
            service_posture: servicePosture,
            recent_events: Array.isArray(audit.events) ? audit.events.slice(0, 12) : [],
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/audit/events', async (req, res) => {
    try {
        res.json(await blockingAuditService.listEvents(req.query));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar/realtime', async (req, res) => {
    try {
        res.json(await blockingAuditService.getRealtimeRadar(req.query));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/metrics', async (req, res) => {
    try {
        res.json(await buildGovernanceMetrics(String(req.query.range || '24h')));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/audit/export.pdf', async (req, res) => {
    try {
        const pdf = await blockingAuditService.exportPdf(req.query);
        const suffix = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="governanca-dados-${suffix}.pdf"`);
        res.send(pdf);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
