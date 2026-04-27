import { Router } from 'express';
import { blockingReleaseService } from '../services/blocking-release-service';
import { blockingAuditService } from '../services/blocking-audit-service';
import { dnsContingencyService } from '../services/dns-contingency-service';
import { dnsRadarService } from '../services/dns-radar-service';
import { domainPolicyManagerService } from '../services/domain-policy-manager-service';
import { proxyRadarService } from '../services/proxy-radar-service';

const router = Router();
const clientIp = (req: any) => {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return String(req.headers['x-client-ip'] || forwarded || req.ip || req.socket?.remoteAddress || '').trim();
};
const requestContext = (req: any) => ({
    username: String(req.auth?.username || req.headers['x-user'] || req.body?.requested_by || 'api'),
    userId: req.auth?.id ? Number(req.auth.id) : Number(req.headers['x-user-id'] || 0) || null,
    ipAddress: clientIp(req),
    userAgent: String(req.headers['user-agent'] || ''),
});
const requestedBy = (req: any) => requestContext(req).username;

router.get('/status', async (_req, res) => {
    try {
        res.json(await blockingReleaseService.getStatus());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/overview', async (_req, res) => {
    try {
        res.json(await blockingReleaseService.buildOverview());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/health', async (_req, res) => {
    try {
        res.json(await blockingReleaseService.getHealth());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/restore-baseline', async (req, res) => {
    try {
        await blockingReleaseService.restoreExpectedBaseline(requestedBy(req));
        res.json(await blockingReleaseService.apply(requestedBy(req)));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/apply', async (req, res) => {
    try {
        res.json(await blockingReleaseService.apply(requestedBy(req), req.body || {}));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/rollback', async (req, res) => {
    try {
        res.json(await blockingReleaseService.rollback(requestedBy(req)));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/emergency-bypass', async (req, res) => {
    try {
        res.json(await blockingReleaseService.setEmergencyBypass(Boolean(req.body?.enabled ?? true), requestedBy(req)));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/mode', async (_req, res) => {
    try {
        res.json({ mode: (await blockingReleaseService.getEngineState()).enforcement_mode || 'acl-plus-dns' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/mode', async (req, res) => {
    try {
        const rawMode = String(req.body?.mode || 'acl-plus-dns');
        const mode = rawMode === 'acl-only' || rawMode === 'intercept-selective' ? rawMode : 'acl-plus-dns';
        await blockingReleaseService.setEnforcementMode(mode as any, requestedBy(req));
        if (req.body?.apply_now !== false) {
            await blockingReleaseService.apply(requestedBy(req));
        }
        res.json(await blockingReleaseService.getStatus());
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/ops/:action', async (req, res) => {
    try {
        res.json(await blockingReleaseService.runOperationalAction(String(req.params.action), requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/domain-policies', async (req, res) => {
    try {
        res.json(await domainPolicyManagerService.list(req.query));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/domain-policies/:id', async (req, res) => {
    try {
        res.json(await domainPolicyManagerService.get(Number(req.params.id)));
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
});

router.post('/domain-policies', async (req, res) => {
    try {
        res.json(await domainPolicyManagerService.create(req.body, requestedBy(req), requestContext(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.patch('/domain-policies/:id', async (req, res) => {
    try {
        res.json(await domainPolicyManagerService.update(Number(req.params.id), req.body, requestedBy(req), requestContext(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/domain-policies/:id/duplicate', async (req, res) => {
    try {
        res.json(await domainPolicyManagerService.duplicate(Number(req.params.id), requestedBy(req), requestContext(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/domain-policies/:id/toggle', async (req, res) => {
    try {
        res.json(await domainPolicyManagerService.toggle(Number(req.params.id), requestedBy(req), requestContext(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/domain-policies/:id', async (req, res) => {
    try {
        res.json(await domainPolicyManagerService.delete(Number(req.params.id), requestedBy(req), requestContext(req)));
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
});

router.put('/category-policies', async (req, res) => {
    try {
        res.json(await blockingReleaseService.updateCategoryPolicy(req.body, requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/category-policies', async (req, res) => {
    try {
        res.json(await blockingReleaseService.deleteCategoryPolicy(req.body, requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/blocklist', async (req, res) => {
    try {
        res.json(await blockingReleaseService.listPolicies('block', req.query));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/blocklist', async (req, res) => {
    try {
        res.json(await blockingReleaseService.upsertPolicy('block', req.body, requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.patch('/blocklist/:id', async (req, res) => {
    try {
        res.json(await blockingReleaseService.upsertPolicy('block', req.body, requestedBy(req), Number(req.params.id)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/blocklist/:id', async (req, res) => {
    try {
        res.json(await blockingReleaseService.deletePolicy('block', Number(req.params.id), requestedBy(req)));
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
});

router.get('/allowlist', async (req, res) => {
    try {
        res.json(await blockingReleaseService.listPolicies('allow', req.query));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/allowlist', async (req, res) => {
    try {
        res.json(await blockingReleaseService.upsertPolicy('allow', req.body, requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.patch('/allowlist/:id', async (req, res) => {
    try {
        res.json(await blockingReleaseService.upsertPolicy('allow', req.body, requestedBy(req), Number(req.params.id)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/allowlist/:id', async (req, res) => {
    try {
        res.json(await blockingReleaseService.deletePolicy('allow', Number(req.params.id), requestedBy(req)));
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
});

router.get('/vlans', async (_req, res) => {
    try {
        res.json(await blockingReleaseService.listVlans());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/vlans', async (req, res) => {
    try {
        res.json(await blockingReleaseService.createVlan(req.body, requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.patch('/vlans/:id', async (req, res) => {
    try {
        res.json(await blockingReleaseService.updateVlan(Number(req.params.id), req.body, requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/vlans/:id/toggle-blocking', async (req, res) => {
    try {
        res.json(await blockingReleaseService.toggleVlan(Number(req.params.id), 'blocking_enabled', requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/vlans/:id/toggle-monitoring', async (req, res) => {
    try {
        res.json(await blockingReleaseService.toggleVlan(Number(req.params.id), 'monitoring_enabled', requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/vlans/:id/toggle-exempt', async (req, res) => {
    try {
        res.json(await blockingReleaseService.toggleVlan(Number(req.params.id), 'exempt', requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/vlans/:id', async (req, res) => {
    try {
        res.json(await blockingReleaseService.deleteVlan(Number(req.params.id), requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/exceptions', async (req, res) => {
    try {
        res.json(await blockingReleaseService.listExceptions(req.query));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/contingency/status', async (_req, res) => {
    try {
        res.json(await dnsContingencyService.getStatus());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/contingency/audit', async (_req, res) => {
    try {
        res.json(await dnsContingencyService.listAudit());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/contingency/activate', async (req, res) => {
    try {
        res.json(await dnsContingencyService.activate(req.body, requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/contingency/deactivate', async (req, res) => {
    try {
        res.json(await dnsContingencyService.deactivate(requestedBy(req), String(req.body?.reason || 'Retorno manual ao modo normal')));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/contingency/renew', async (req, res) => {
    try {
        res.json(await dnsContingencyService.renew(req.body, requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/contingency/test', async (_req, res) => {
    try {
        res.json(await dnsContingencyService.testResolvers());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/exceptions', async (req, res) => {
    try {
        res.json(await blockingReleaseService.upsertException(req.body, requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.patch('/exceptions/:id', async (req, res) => {
    try {
        res.json(await blockingReleaseService.upsertException(req.body, requestedBy(req), Number(req.params.id)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/exceptions/:id', async (req, res) => {
    try {
        res.json(await blockingReleaseService.deleteException(Number(req.params.id), requestedBy(req)));
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
});

router.get('/sporadic-exceptions', async (req, res) => {
    try {
        res.json(await blockingReleaseService.listSporadicExceptions(req.query));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/sporadic-exceptions', async (req, res) => {
    try {
        res.json(await blockingReleaseService.createSporadicException(req.body, requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/sporadic-exceptions/:id/revoke', async (req, res) => {
    try {
        res.json(await blockingReleaseService.revokeSporadicException(Number(req.params.id), requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/sporadic-exceptions/:id', async (req, res) => {
    try {
        res.json(await blockingReleaseService.revokeSporadicException(Number(req.params.id), requestedBy(req)));
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
});

router.get('/metrics', async (req, res) => {
    try {
        res.json(await blockingReleaseService.getMetrics(String(req.query.range || '24h')));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/metrics/top-sites', async (req, res) => {
    try {
        const metrics = await blockingReleaseService.getMetrics(String(req.query.range || '24h'));
        res.json(metrics.topSites);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/metrics/top-blocked', async (req, res) => {
    try {
        const metrics = await blockingReleaseService.getMetrics(String(req.query.range || '24h'));
        res.json(metrics.topBlocked);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/metrics/top-ips', async (req, res) => {
    try {
        const metrics = await blockingReleaseService.getMetrics(String(req.query.range || '24h'));
        res.json(metrics.topIps);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/metrics/heatmap', async (req, res) => {
    try {
        const metrics = await blockingReleaseService.getMetrics(String(req.query.range || '24h'));
        res.json(metrics.heatmap);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar/dns/overview', async (req, res) => {
    try {
        res.json(await dnsRadarService.getOverview(String(req.query.range || '24h')));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar/dns/events', async (req, res) => {
    try {
        res.json(await dnsRadarService.getEvents(req.query));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar/dns/domain', async (req, res) => {
    try {
        res.json(await dnsRadarService.getEvents({ ...req.query, domain: String(req.query.q || req.query.domain || '') }));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar/dns/ip', async (req, res) => {
    try {
        res.json(await dnsRadarService.getEvents({ ...req.query, client_ip: String(req.query.client_ip || req.query.ip || '') }));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar/dns/top-blocked-domains', async (req, res) => {
    try {
        const overview = await dnsRadarService.getOverview(String(req.query.range || '24h'));
        res.json(overview.topBlockedDomains);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar/dns/top-blocked-ips', async (req, res) => {
    try {
        const overview = await dnsRadarService.getOverview(String(req.query.range || '24h'));
        res.json(overview.topBlockedIps);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar/dns/timeline', async (req, res) => {
    try {
        res.json(await dnsRadarService.getTimeline(String(req.query.range || '24h')));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar/proxy/overview', async (req, res) => {
    try {
        res.json(await proxyRadarService.getOverview(String(req.query.range || '24h')));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar/proxy/events', async (req, res) => {
    try {
        res.json(await proxyRadarService.getEvents(req.query));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar/proxy/domain', async (req, res) => {
    try {
        res.json(await proxyRadarService.getEvents({ ...req.query, domain: String(req.query.q || req.query.domain || '') }));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar/proxy/ip', async (req, res) => {
    try {
        res.json(await proxyRadarService.getEvents({ ...req.query, client_ip: String(req.query.client_ip || req.query.ip || '') }));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar/proxy/top-blocked-domains', async (req, res) => {
    try {
        const overview = await proxyRadarService.getOverview(String(req.query.range || '24h'));
        res.json(overview.topBlockedDomains);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar/proxy/top-blocked-ips', async (req, res) => {
    try {
        const overview = await proxyRadarService.getOverview(String(req.query.range || '24h'));
        res.json(overview.topBlockedIps);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar/proxy/timeline', async (req, res) => {
    try {
        res.json(await proxyRadarService.getTimeline(String(req.query.range || '24h')));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/audit', async (req, res) => {
    try {
        res.json(await blockingReleaseService.listAudit(req.query));
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

router.get('/audit/export.pdf', async (req, res) => {
    try {
        const pdf = await blockingAuditService.exportPdf(req.query);
        const suffix = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="relatorio-governamental-acessos-${suffix}.pdf"`);
        res.send(pdf);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/reports', async (req, res) => {
    try {
        res.json(await blockingReleaseService.listReports(req.query));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/reports/:reportKey', async (req, res) => {
    try {
        res.json(await blockingReleaseService.parseSargReport(String(req.params.reportKey)));
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
});

export default router;
