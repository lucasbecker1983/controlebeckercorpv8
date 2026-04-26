import { Router } from 'express';
import { blockingAuditService } from '../services/blocking-audit-service';
import { blockingReleaseService } from '../services/blocking-release-service';

const router = Router();

const summarizeTopVlan = (rows: any[] = []) => {
    if (!Array.isArray(rows) || !rows.length) return null;
    const top = rows[0];
    return {
        vlan_id: top.vlan_id,
        total: Number(top.total || 0),
        blocked: Number(top.blocked || 0),
    };
};

router.get('/overview', async (req, res) => {
    try {
        const period = String(req.query.period || '24h');
        const [metricsResult, auditResult, radarResult, healthResult, statusResult] = await Promise.allSettled([
            blockingReleaseService.getMetrics(period),
            blockingAuditService.listEvents({ period, limit: 160 }),
            blockingAuditService.getRealtimeRadar({ window_minutes: 10, limit: 100 }),
            blockingReleaseService.getHealth(),
            blockingReleaseService.getStatus(),
        ]);

        const metrics = metricsResult.status === 'fulfilled' ? metricsResult.value : {
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
        const summary = (audit?.summary || {}) as Record<string, number>;
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
        res.json(await blockingReleaseService.getMetrics(String(req.query.range || '24h')));
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
