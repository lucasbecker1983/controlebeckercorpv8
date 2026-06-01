import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { blockingReleaseService } from '../services/blocking-release-service';
import { blockingAuditService } from '../services/blocking-audit-service';
import { dnsContingencyService } from '../services/dns-contingency-service';
import { dnsRadarService } from '../services/dns-radar-service';
import { domainPolicyManagerService } from '../services/domain-policy-manager-service';
import { proxyRadarService } from '../services/proxy-radar-service';
import { runCommand } from '../utils/process';
import { env } from '../config/env';

const router = Router();
const scheduleStorePath = path.join(env.projectRoot, 'data', 'scheduled_policy_windows.json');
const readScheduledPolicyWindows = () => {
    try {
        return JSON.parse(fs.readFileSync(scheduleStorePath, 'utf8'));
    } catch {
        return [];
    }
};
const writeScheduledPolicyWindows = (items: any[]) => {
    fs.mkdirSync(path.dirname(scheduleStorePath), { recursive: true });
    fs.writeFileSync(scheduleStorePath, `${JSON.stringify(items, null, 2)}\n`);
};
const triggerScheduledPolicyReconcile = async () => {
    await runCommand('systemctl', ['start', 'sgcg-policy-window-reconcile.service'], { allowFailure: true });
};
const scheduleCategoryKey = (value: unknown) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const scheduleCategoryIsPornography = (value: unknown) => /(pornograf|adulto|conteudo-adulto)/.test(scheduleCategoryKey(value));
const normalizeScheduleWindow = (payload: any, fallback: any = {}) => {
    const id = String(payload?.id || fallback.id || payload?.name || `schedule-${Date.now()}`)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    const vlanIds = (Array.isArray(payload?.vlan_ids ?? payload?.vlanIds) ? (payload?.vlan_ids ?? payload?.vlanIds) : String(payload?.vlan_ids ?? payload?.vlanIds ?? fallback.vlan_ids ?? '').split(','))
        .map((value: any) => Number(value))
        .filter((value: number) => Number.isFinite(value) && value > 0);
    const categories = Array.from(new Set((Array.isArray(payload?.categories) ? payload.categories : fallback.categories || []).map((value: any) => String(value || '').trim()).filter(Boolean)));
    const weekdays = Array.from(new Set((Array.isArray(payload?.weekdays) ? payload.weekdays : fallback.weekdays || []).map((value: any) => Number(value)).filter((value: number) => Number.isFinite(value) && value >= 0 && value <= 6))).sort();
    if (!id) throw new Error('Identificador do agendamento obrigatório');
    if (!String(payload?.name ?? fallback.name ?? '').trim()) throw new Error('Nome do agendamento obrigatório');
    if (!vlanIds.length) throw new Error('Selecione ao menos uma VLAN');
    if (!categories.length) throw new Error('Selecione ao menos uma categoria');
    if (categories.some(scheduleCategoryIsPornography)) throw new Error('Pornografia nunca pode ser liberada por agendamento.');
    return {
        ...fallback,
        id,
        name: String(payload?.name ?? fallback.name).trim(),
        active: Boolean(payload?.active ?? fallback.active ?? true),
        policy_type: 'allow',
        vlan_ids: vlanIds,
        categories,
        start_time: String(payload?.start_time ?? payload?.startTime ?? fallback.start_time ?? '08:00').slice(0, 5),
        end_time: String(payload?.end_time ?? payload?.endTime ?? fallback.end_time ?? '17:00').slice(0, 5),
        date_mode: ['single', 'range', 'weekly'].includes(String(payload?.date_mode ?? payload?.dateMode ?? fallback.date_mode)) ? String(payload?.date_mode ?? payload?.dateMode ?? fallback.date_mode) : 'weekly',
        weekdays,
        start_date: payload?.start_date ?? payload?.startDate ?? fallback.start_date ?? null,
        end_date: payload?.end_date ?? payload?.endDate ?? fallback.end_date ?? null,
        notes: String(payload?.notes ?? fallback.notes ?? '').trim(),
        updated_at: new Date().toISOString(),
    };
};
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

router.get('/scheduled-policy-windows', async (_req, res) => {
    try {
        res.json(readScheduledPolicyWindows());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/scheduled-policy-windows', async (req, res) => {
    try {
        const items = readScheduledPolicyWindows();
        const next = normalizeScheduleWindow(req.body);
        if (items.some((item: any) => item.id === next.id)) throw new Error('Ja existe um agendamento com esse identificador');
        items.push({ ...next, created_by: requestedBy(req), created_at: new Date().toISOString() });
        writeScheduledPolicyWindows(items);
        await triggerScheduledPolicyReconcile();
        res.json(next);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.patch('/scheduled-policy-windows/:id', async (req, res) => {
    try {
        const items = readScheduledPolicyWindows();
        const index = items.findIndex((item: any) => item.id === req.params.id);
        if (index < 0) throw new Error('Agendamento nao encontrado');
        const next = normalizeScheduleWindow({ ...items[index], ...req.body, id: req.params.id }, items[index]);
        items[index] = next;
        writeScheduledPolicyWindows(items);
        await triggerScheduledPolicyReconcile();
        res.json(next);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/scheduled-policy-windows/:id', async (req, res) => {
    try {
        const items = readScheduledPolicyWindows();
        const next = items.filter((item: any) => item.id !== req.params.id);
        if (next.length === items.length) throw new Error('Agendamento nao encontrado');
        writeScheduledPolicyWindows(next);
        await triggerScheduledPolicyReconcile();
        res.json({ ok: true });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
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

router.get('/emergency-vlan-bypass', async (_req, res) => {
    try {
        res.json(await blockingReleaseService.listEmergencyVlanBypasses());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/emergency-vlan-bypass/activate', async (req, res) => {
    try {
        res.json(await blockingReleaseService.activateEmergencyVlanBypass(req.body, requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/emergency-vlan-bypass/:vlanId/deactivate', async (req, res) => {
    try {
        res.json(await blockingReleaseService.deactivateEmergencyVlanBypass(
            Number(req.params.vlanId),
            requestedBy(req),
            String(req.body?.reason || 'Retorno manual ao enforcement institucional'),
        ));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/total-vlan-blocks', async (_req, res) => {
    try {
        res.json(await blockingReleaseService.listTotalVlanBlocks());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/total-vlan-blocks/activate', async (req, res) => {
    try {
        res.json(await blockingReleaseService.activateTotalVlanBlock(req.body, requestedBy(req)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/total-vlan-blocks/:vlanId/deactivate', async (req, res) => {
    try {
        res.json(await blockingReleaseService.deactivateTotalVlanBlock(
            Number(req.params.vlanId),
            requestedBy(req),
            String(req.body?.reason || 'Retorno manual da VLAN ao enforcement institucional'),
        ));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
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

// ── WhatsApp Allowlist (ipset sgcg_whatsapp_allowed) ──────────────────────────
// WhatsApp compartilha ranges de IP com Facebook/Instagram (AS32934).
// O ipset separado com ACCEPT na posição 1 do FORWARD garante que o WhatsApp
// nunca seja bloqueado pelas regras de redes sociais.

const WHATSAPP_IPSET = 'sgcg_whatsapp_allowed';
const WHATSAPP_UPDATE_SCRIPT = `${env.projectRoot}/scripts/update_whatsapp_allowlist.py`;
const GOVBR_IPSET = 'sgcg_govbr_allowed';
const CRITICAL_VLAN_GATEWAYS = [
    { vlan_id: 10, gateway: '192.168.10.1' },
    { vlan_id: 30, gateway: '192.168.30.1' },
    { vlan_id: 40, gateway: '192.168.40.1' },
    { vlan_id: 50, gateway: '192.168.50.1' },
    { vlan_id: 70, gateway: '192.168.70.1' },
    { vlan_id: 80, gateway: '192.168.80.1' },
    { vlan_id: 99, gateway: '192.168.99.1' },
];
const CRITICAL_SERVICES = [
    {
        key: 'conectividade-social-v2',
        label: 'Conectividade Social v2',
        domain: 'conectividadesocialv2.caixa.gov.br',
        url: 'https://conectividadesocialv2.caixa.gov.br/cad-maquina',
        ipset: GOVBR_IPSET,
        expectedPath: '/cad-maquina/',
    },
    {
        key: 'whatsapp-web',
        label: 'WhatsApp Web',
        domain: 'web.whatsapp.com',
        url: 'https://web.whatsapp.com/',
        ipset: WHATSAPP_IPSET,
        expectedPath: '/',
    },
    {
        key: 'whatsapp-push',
        label: 'WhatsApp sessão/push',
        domain: 'edge-mqtt.facebook.com',
        url: null,
        ipset: WHATSAPP_IPSET,
        expectedPath: null,
    },
    {
        key: 'govbr-sso',
        label: 'SSO gov.br',
        domain: 'sso.acesso.gov.br',
        url: 'https://sso.acesso.gov.br/',
        ipset: GOVBR_IPSET,
        expectedPath: '/',
    },
];

const parseIpsetMembers = (output: string): Array<{ ip: string; comment: string }> => {
    const lines = output.split('\n');
    const inMembers = lines.findIndex((l) => l.trim() === 'Members:');
    if (inMembers === -1) return [];
    return lines
        .slice(inMembers + 1)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
            const [ip, , comment] = l.split(' ');
            return { ip, comment: comment?.replace(/"/g, '') || '' };
        });
};

const resolveDomain = async (server: string, domain: string) => {
    const result = await runCommand('dig', [`@${server}`, domain, 'A', '+time=2', '+tries=1', '+short'], { allowFailure: true });
    return result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.split('.').length === 4 && line.split('.').every((part) => /^\d+$/.test(part)));
};

const testIpset = async (setName: string, ip: string) => {
    if (!ip) return false;
    const result = await runCommand('ipset', ['test', setName, ip], { allowFailure: true });
    return result.code === 0;
};

const probeUrlFromGateway = async (gateway: string, url: string) => {
    const result = await runCommand(
        'curl',
        [
            '-k',
            '-sS',
            '-L',
            '--interface',
            gateway,
            '-o',
            '/dev/null',
            '-w',
            'code=%{http_code} redirects=%{num_redirects} dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} total=%{time_total} remote=%{remote_ip} final=%{url_effective}',
            '--max-time',
            '10',
            url,
        ],
        { allowFailure: true },
    );
    const text = `${result.stdout} ${result.stderr}`.trim();
    const read = (name: string) => text.match(new RegExp(`${name}=([^\\s]+)`))?.[1] || null;
    return {
        ok: result.code === 0 && Number(read('code') || 0) >= 200 && Number(read('code') || 0) < 400,
        code: read('code'),
        redirects: read('redirects'),
        dns_seconds: read('dns'),
        connect_seconds: read('connect'),
        tls_seconds: read('tls'),
        total_seconds: read('total'),
        remote_ip: read('remote'),
        final_url: read('final'),
        error: result.code === 0 ? null : text || 'Falha no teste HTTPS',
    };
};

const readForwardDomains = async () => {
    const result = await runCommand('unbound-control', ['list_forwards'], { allowFailure: true });
    return result.stdout
        .split('\n')
        .map((line) => line.trim().split(/\s+/)[0]?.replace(/\.$/, ''))
        .filter(Boolean);
};

router.get('/critical-services', async (_req, res) => {
    try {
        const [whatsappSet, govbrSet, forwardDomains] = await Promise.all([
            runCommand('ipset', ['list', WHATSAPP_IPSET], { allowFailure: true }),
            runCommand('ipset', ['list', GOVBR_IPSET], { allowFailure: true }),
            readForwardDomains(),
        ]);
        const ipsetTotals = {
            whatsapp: whatsappSet.code === 0 ? parseIpsetMembers(whatsappSet.stdout).length : 0,
            govbr_caixa: govbrSet.code === 0 ? parseIpsetMembers(govbrSet.stdout).length : 0,
        };

        const services = await Promise.all(CRITICAL_SERVICES.map(async (service) => {
            const localIps = await resolveDomain('127.0.0.1', service.domain);
            const vlanDns = await Promise.all(CRITICAL_VLAN_GATEWAYS.map(async (vlan) => ({
                ...vlan,
                ips: await resolveDomain(vlan.gateway, service.domain),
            })));
            const uniqueIps = Array.from(new Set([...localIps, ...vlanDns.flatMap((item) => item.ips)]));
            const ipsetCoverage = await Promise.all(uniqueIps.map(async (ip) => ({ ip, in_ipset: await testIpset(service.ipset, ip) })));
            const https = service.url
                ? await Promise.all(CRITICAL_VLAN_GATEWAYS.map(async (vlan) => ({
                    vlan_id: vlan.vlan_id,
                    gateway: vlan.gateway,
                    ...(await probeUrlFromGateway(vlan.gateway, service.url as string)),
                })))
                : [];
            const dnsOk = vlanDns.length > 0 && vlanDns.every((item) => item.ips.length > 0);
            const ipsetOk = uniqueIps.length > 0 && ipsetCoverage.every((item) => item.in_ipset);
            const httpsOk = !service.url || https.every((item) => item.ok);
            const forwardOk = forwardDomains.includes(service.domain) || forwardDomains.some((domain) => service.domain.endsWith(`.${domain}`));
            return {
                ...service,
                local_ips: localIps,
                unique_ips: uniqueIps,
                dns_by_vlan: vlanDns,
                ipset_coverage: ipsetCoverage,
                https_by_vlan: https,
                forward_configured: forwardOk,
                status: dnsOk && ipsetOk && httpsOk ? 'ok' : 'attention',
                checks: {
                    dns_ok: dnsOk,
                    ipset_ok: ipsetOk,
                    https_ok: httpsOk,
                    forward_ok: forwardOk,
                },
            };
        }));

        res.json({
            updated_at: new Date().toISOString(),
            vlan_gateways: CRITICAL_VLAN_GATEWAYS,
            ipsets: {
                whatsapp: { name: WHATSAPP_IPSET, total: ipsetTotals.whatsapp, active: whatsappSet.code === 0 },
                govbr_caixa: { name: GOVBR_IPSET, total: ipsetTotals.govbr_caixa, active: govbrSet.code === 0 },
            },
            services,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/whatsapp-allowlist', async (_req, res) => {
    try {
        const result = await runCommand('ipset', ['list', WHATSAPP_IPSET], { allowFailure: true });
        if (result.code !== 0) {
            return res.json({ active: false, ips: [], error: 'ipset não encontrado ou não inicializado' });
        }
        const ips = parseIpsetMembers(result.stdout);
        const logResult = await runCommand('tail', ['-5', '/var/log/sgcg_whatsapp_allowlist.log'], { allowFailure: true });
        const lastLog = logResult.stdout.trim() || null;
        const lastUpdate = lastLog?.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] || null;
        res.json({ active: true, ips, total: ips.length, last_update: lastUpdate, last_log: lastLog });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/whatsapp-allowlist/refresh', async (req: any, res) => {
    const actor = String(req.auth?.username || req.headers['x-user'] || 'api');
    try {
        const result = await runCommand('python3', [WHATSAPP_UPDATE_SCRIPT], {
            elevated: false,
            allowFailure: true,
        });
        const success = result.code === 0;
        const ipsetResult = await runCommand('ipset', ['list', WHATSAPP_IPSET], { allowFailure: true });
        const ips = parseIpsetMembers(ipsetResult.stdout);
        res.json({
            success,
            actor,
            ips,
            total: ips.length,
            stdout: result.stdout.trim(),
            stderr: result.stderr.trim() || null,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/whatsapp-allowlist/schedule', async (_req, res) => {
    try {
        const result = await runCommand(
            'bash',
            ['-c', 'crontab -l 2>/dev/null | grep "update_whatsapp_allowlist.py"'],
            { allowFailure: true },
        );
        const cronLine = result.stdout.trim();
        const enabled = cronLine.length > 0;
        const hoursMatch = cronLine.match(/\*\/(\d+)/);
        const interval_hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 6;
        res.json({ enabled, interval_hours, cron_line: cronLine || null });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/whatsapp-allowlist/schedule', async (req: any, res) => {
    const actor = String(req.auth?.username || req.headers['x-user'] || 'api');
    const enabled = req.body?.enabled !== false;
    const interval_hours = Math.max(1, Math.min(24, parseInt(req.body?.interval_hours ?? 6, 10)));
    try {
        const cronEntry = `0 */${interval_hours} * * * python3 ${WHATSAPP_UPDATE_SCRIPT} >> /var/log/sgcg_whatsapp_allowlist.log 2>&1`;
        let shellCmd: string;
        if (enabled) {
            shellCmd = `(crontab -l 2>/dev/null | grep -v "update_whatsapp_allowlist.py"; echo "${cronEntry}") | crontab -`;
        } else {
            shellCmd = `crontab -l 2>/dev/null | grep -v "update_whatsapp_allowlist.py" | crontab -`;
        }
        const result = await runCommand('bash', ['-c', shellCmd], { allowFailure: true });
        const success = result.code === 0;
        res.json({ success, actor, enabled, interval_hours, cron_line: enabled ? cronEntry : null });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
