import { Router } from 'express';
import fs from 'fs';
import { pool } from '../config/db';
import { proxyEngineService } from '../services/proxy-module';
import { ensureBlockingReleaseSchema } from '../services/blocking-release-schema-service';
import { dnsIgnoredService } from '../services/dns-ignored-service';
import { radarLiveBus } from '../services/dns-radar-live';
import { runCommand } from '../utils/process';

const router = Router();
const policyWriteMoved = (_req: any, res: any) => res.status(410).json({
    error: 'Operação movida para Bloqueios & Liberações.',
    owner: 'bloqueios-liberacoes',
});

const DNS_HEALTH_DOMAIN = 'gov.br';
const DNS_LATENCY_PROBE_DOMAINS = [
    'gov.br',
    'www.gov.br',
    'planalto.gov.br',
    'receita.fazenda.gov.br',
    'dados.gov.br',
];
const VLAN_META = new Map<number, { name: string; ip: string }>([
    [10, { name: 'VLAN 10 (Secretaria)', ip: '192.168.10.1/24' }],
    [30, { name: 'VLAN 30 (Celulares)', ip: '192.168.30.1/24' }],
    [40, { name: 'VLAN 40 (CFTV)', ip: '192.168.40.1/24' }],
    [50, { name: 'VLAN 50 (SINE)', ip: '192.168.50.1/24' }],
    [70, { name: 'VLAN 70 (Visitantes)', ip: '192.168.70.1/24' }],
    [80, { name: 'VLAN 80 (VOiP)', ip: '192.168.80.1/24' }],
]);

const splitForwardAddrs = (value: string) => value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const ensureNetDnsRulesSchema = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS net_dns_rules (
            id BIGSERIAL PRIMARY KEY,
            domain TEXT NOT NULL UNIQUE,
            target_ip TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'A',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
};

const syncUnboundCustomZones = async () => {
    await ensureNetDnsRulesSchema();
    const { rows } = await pool.query('SELECT * FROM net_dns_rules ORDER BY id ASC');
    let serverBlock = 'server:\n';
    let forwardBlocks = '';

    rows.forEach((row: any) => {
        const type = String(row.type || 'A').toUpperCase();
        const domain = String(row.domain || '').trim();
        const targetIp = String(row.target_ip || '').trim();
        if (!domain || !targetIp) return;

        if (type === 'FWD') {
            const forwardAddrs = splitForwardAddrs(targetIp);
            if (!forwardAddrs.length) return;
            forwardBlocks += `\nforward-zone:\n    name: "${domain}"\n`;
            forwardAddrs.forEach((addr) => {
                forwardBlocks += `    forward-addr: ${addr}\n`;
            });
            return;
        }

        serverBlock += `    local-zone: "${domain}" redirect\n    local-data: "${domain} A ${targetIp}"\n`;
    });

    fs.writeFileSync('/etc/unbound/unbound.conf.d/custom-zones.conf', serverBlock + forwardBlocks);
    await runCommand('systemctl', ['reload', 'unbound'], { elevated: true, allowFailure: true });
};

const parseUnboundCounter = (raw: string, metric: string) => {
    const match = raw.match(new RegExp(`${metric}=([\\d.]+)`));
    return match ? Number(match[1]) : 0;
};

const getUnboundHealth = async () => {
    const [service, probe] = await Promise.all([
        runCommand('systemctl', ['is-active', 'unbound'], { elevated: true, allowFailure: true }),
        runCommand('dig', ['+time=2', '+tries=1', '@127.0.0.1', DNS_HEALTH_DOMAIN, 'A', '+short'], {
            elevated: true,
            allowFailure: true,
        }),
    ]);

    const isRunning = service.stdout.trim() === 'active';
    const answers = probe.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    return {
        is_running: isRunning,
        is_resolving: answers.length > 0,
        health_domain: DNS_HEALTH_DOMAIN,
        probe_answers: answers,
    };
};

const getUnboundOperationalStats = async () => {
    const result = await runCommand('unbound-control', ['stats_noreset'], {
        elevated: true,
        allowFailure: true,
    });

    const raw = result.stdout || '';

    return {
        total_queries: parseUnboundCounter(raw, 'total\\.num\\.queries'),
        cache_hits: parseUnboundCounter(raw, 'total\\.num\\.cachehits'),
        avg_latency: parseUnboundCounter(raw, 'total\\.requestlist\\.avg'),
    };
};

const probeLatency = async (domain: string) => {
    const startedAt = Date.now();
    const result = await runCommand('dig', ['+time=2', '+tries=1', '@127.0.0.1', domain, 'A', '+stats'], {
        elevated: true,
        allowFailure: true,
    });
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    const combined = `${result.stdout}\n${result.stderr}`;
    const match = combined.match(/Query time:\s*(\d+)\s*msec/i);
    if (!match) return result.code === 0 ? elapsedMs : null;

    const queryTime = Number(match[1]);
    return queryTime > 0 ? queryTime : elapsedMs;
};

router.get('/stats', async (_req, res) => {
    try {
        const [telemetryResult, unboundResult, statsResult, latencyResult] = await Promise.allSettled([
            proxyEngineService.dnsLoggerService.stats(),
            getUnboundHealth(),
            getUnboundOperationalStats(),
            Promise.allSettled(DNS_LATENCY_PROBE_DOMAINS.map((domain) => probeLatency(domain))),
        ]);
        const telemetry = telemetryResult.status === 'fulfilled' ? telemetryResult.value : null;
        const unbound = unboundResult.status === 'fulfilled' ? unboundResult.value : {
            is_running: false,
            is_resolving: false,
            health_domain: DNS_HEALTH_DOMAIN,
        };
        const operational = statsResult.status === 'fulfilled' ? statsResult.value : {
            total_queries: 0,
            cache_hits: 0,
            avg_latency: 0,
        };
        const latencySamples = latencyResult.status === 'fulfilled'
            ? latencyResult.value
                .map((result) => (result.status === 'fulfilled' ? result.value : null))
                .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
            : [];
        const measuredLatency = latencySamples.length
            ? Math.round(latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length)
            : 0;
        const telemetryTotal = Number(telemetry?.total_hoje || telemetry?.totalQueries || 0);

        res.json({
            ...(telemetry || {}),
            is_running: unbound.is_running,
            is_resolving: unbound.is_resolving,
            health_domain: unbound.health_domain,
            stats: {
                total_queries: telemetryTotal || operational.total_queries || 0,
                cache_hits: operational.cache_hits || 0,
                avg_latency: measuredLatency || operational.avg_latency || Number(telemetry?.avgLatency || 0),
            },
            latency_samples_ms: latencySamples,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/latency-breakdown', async (_req, res) => {
    try {
        const probeResults = await Promise.allSettled(
            DNS_LATENCY_PROBE_DOMAINS.map((domain) => probeLatency(domain)),
        );

        const samples = probeResults
            .map((result) => (result.status === 'fulfilled' ? result.value : null))
            .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

        const payload = [
            { name: '< 10ms', value: samples.filter((value) => value < 10).length },
            { name: '10ms - 50ms', value: samples.filter((value) => value >= 10 && value <= 50).length },
            { name: '> 50ms', value: samples.filter((value) => value > 50).length },
        ];

        res.json({
            generated_at: new Date().toISOString(),
            probe_domains: DNS_LATENCY_PROBE_DOMAINS,
            samples_ms: samples,
            buckets: payload,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/status', async (_req, res) => {
    try {
        const [services, unbound] = await Promise.all([
            proxyEngineService.getServicesStatus(),
            getUnboundHealth(),
        ]);
        res.json({
            unbound_active: unbound.is_running,
            unbound_resolving: unbound.is_resolving,
            logger_active: services.dns_logger_active,
            health_domain: unbound.health_domain,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar', async (req, res) => {
    try {
        const payload = await proxyEngineService.dnsLoggerService.getRadar(
            parseInt(String(req.query.limit || '200'), 10) || 200,
            String(req.query.vlan || 'todas'),
            String(req.query.blocked || '').toLowerCase() === 'true',
        );
        res.json(payload);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/radar/clear', async (req, res) => {
    try {
        const result = await proxyEngineService.dnsLoggerService.clear(
            String(req.body?.scope || 'noise').toLowerCase() === 'all' ? 'all' : 'noise',
        );
        res.json({ success: true, message: result.message, deleted_rows: result.deleted });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/vlan-summary', async (_req, res) => {
    try {
        await ensureBlockingReleaseSchema();
        const ignoredPatterns = await dnsIgnoredService.loadActive().catch(() => []);
        const noiseFilter = dnsIgnoredService.buildSqlFilter(ignoredPatterns, 'query_name');
        const { rows } = await pool.query(`
            SELECT
                vlan_id,
                COUNT(*)::int AS total_queries,
                COUNT(*) FILTER (WHERE action = 'blocked')::int AS blocked_queries,
                COUNT(DISTINCT client_ip)::int AS unique_ips
            FROM dns_policy_events
            WHERE occurred_at >= NOW() - INTERVAL '24 hours'
              AND client_ip IS NOT NULL
              AND vlan_id IS NOT NULL
              ${noiseFilter}
            GROUP BY vlan_id
            ORDER BY vlan_id ASC
        `);

        const rowByVlan = new Map<number, any>(
            rows.map((row: any) => [Number(row.vlan_id), row]),
        );

        const payload = Array.from(VLAN_META.entries())
            .map(([vlanId, meta]) => {
                const row = rowByVlan.get(vlanId) || {};
                const totalQueries = Number(row.total_queries || 0);
                const blockedQueries = Number(row.blocked_queries || 0);

                return {
                    id: `vlan${vlanId}`,
                    vlan: `VLAN${vlanId}`,
                    name: meta.name,
                    ip: meta.ip,
                    queries: totalQueries,
                    total_queries: totalQueries,
                    blocked_queries: blockedQueries,
                    unique_ips: Number(row.unique_ips || 0),
                    block_pct: totalQueries > 0 ? ((blockedQueries / totalQueries) * 100).toFixed(1) : '0.0',
                };
            });

        res.json(payload);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/listas', async (_req, res) => {
    try {
        const rows = await proxyEngineService.domainPolicyService.listBlocklist();
        res.json(rows.map((row) => row.domain));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/zones', async (_req, res) => {
    try {
        await ensureNetDnsRulesSchema();
        const { rows } = await pool.query('SELECT * FROM net_dns_rules ORDER BY id DESC');
        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Falha ao listar zonas DNS.' });
    }
});

router.post('/zones/add', async (req, res) => {
    const domain = String(req.body?.domain || '').trim();
    const ip = String(req.body?.ip || req.body?.target_ip || '').trim();
    const type = String(req.body?.type || 'A').trim().toUpperCase();

    if (!domain || !ip) {
        return res.status(400).json({ error: 'Domínio e IP de destino são obrigatórios.' });
    }

    try {
        await ensureNetDnsRulesSchema();
        await pool.query('DELETE FROM net_dns_rules WHERE domain = $1', [domain]);
        await pool.query(
            'INSERT INTO net_dns_rules (domain, target_ip, type) VALUES ($1, $2, $3)',
            [domain, ip, type || 'A'],
        );
        await syncUnboundCustomZones();
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Falha ao criar zona DNS.' });
    }
});

router.post('/zones/delete', async (req, res) => {
    try {
        await ensureNetDnsRulesSchema();
        await pool.query('DELETE FROM net_dns_rules WHERE id = $1', [Number(req.body?.id || 0)]);
        await syncUnboundCustomZones();
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Falha ao remover zona DNS.' });
    }
});

router.post('/zones/verify', async (req, res) => {
    const domain = String(req.body?.domain || '').trim();
    const targetIp = String(req.body?.target_ip || req.body?.ip || '').trim();
    const type = String(req.body?.type || 'A').trim().toUpperCase();

    if (!domain) {
        return res.status(400).json({ error: 'Domínio é obrigatório.' });
    }

    try {
        const localResult = await runCommand('dig', ['+time=2', '+tries=1', '@127.0.0.1', domain, 'A', '+short'], {
            elevated: true,
            allowFailure: true,
        });
        const localAnswers = localResult.stdout
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        const resolvedIp = localAnswers.find(Boolean) || null;

        if (type === 'FWD' && targetIp) {
            const forwardResult = await runCommand('dig', ['+time=2', '+tries=1', `@${targetIp}`, domain, 'A', '+short'], {
                elevated: true,
                allowFailure: true,
            });
            const forwardAnswers = forwardResult.stdout
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean);
            const localSet = new Set(localAnswers);
            const hasSameAnswer = forwardAnswers.some((answer) => localSet.has(answer));

            return res.json({
                match: localResult.code === 0 && forwardResult.code === 0 && hasSameAnswer,
                resolved_to: resolvedIp,
                expected_resolver: targetIp,
                resolver_answer: forwardAnswers.find(Boolean) || null,
                verification_mode: 'forward-zone',
            });
        }

        res.json({
            match: targetIp ? resolvedIp === targetIp : Boolean(resolvedIp),
            resolved_to: resolvedIp,
            verification_mode: 'static-record',
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Falha ao verificar zona DNS.' });
    }
});

router.post('/cache/flush', async (_req, res) => {
    try {
        await runCommand('unbound-control', ['flush_zone', '.'], { elevated: true, allowFailure: true });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Falha ao limpar cache DNS.' });
    }
});

router.post('/listas/add', policyWriteMoved);

router.post('/listas/remove', policyWriteMoved);

router.get('/top-blocked', async (_req, res) => {
    try {
        res.json(await proxyEngineService.dnsLoggerService.topBlocked());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/restart-unbound', async (_req, res) => {
    try {
        const restart = await runCommand('systemctl', ['restart', 'unbound'], {
            elevated: true,
            allowFailure: true,
        });
        const health = await getUnboundHealth();

        if (restart.code !== 0 || !health.is_running) {
            return res.status(500).json({
                success: false,
                error: restart.stderr || restart.stdout || 'Falha ao reiniciar o Unbound.',
                health,
            });
        }

        res.json({
            success: true,
            message: 'Unbound reiniciado.',
            health,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/reload-rules', async (_req, res) => {
    try {
        await proxyEngineService.domainPolicyService.syncPolicyFiles();
        res.json({ success: true, message: 'Políticas sincronizadas.' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/restart-logger', async (_req, res) => {
    try {
        const logger = await proxyEngineService.dnsLoggerService.restart();
        res.json({ success: true, message: 'Logger reiniciado.', logger });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/cleanup', async (_req, res) => {
    try {
        const deleted = await proxyEngineService.dnsLoggerService.cleanup(30);
        res.json({ success: true, message: 'Logs antigos limpos.', deleted_rows: deleted });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Radar em tempo real (SSE) ─────────────────────────────────────────────────

router.get('/radar/live', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

    const onEvent = (data: any) => {
        try {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch {
            // cliente desconectou
        }
    };

    radarLiveBus.on('event', onEvent);

    req.on('close', () => {
        clearInterval(heartbeat);
        radarLiveBus.off('event', onEvent);
    });
});

// ── Domínios ignorados ────────────────────────────────────────────────────────

router.get('/ignored', async (_req, res) => {
    try {
        const list = await dnsIgnoredService.list();
        res.json({ patterns: list });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/ignored', async (req, res) => {
    const pattern = String(req.body?.pattern || '').trim().toLowerCase();
    const match_type = String(req.body?.match_type || 'contains');
    const reason = req.body?.reason ? String(req.body.reason).trim() : undefined;

    if (!pattern) return res.status(400).json({ error: 'pattern é obrigatório.' });
    if (!['exact', 'contains', 'suffix', 'prefix'].includes(match_type)) {
        return res.status(400).json({ error: 'match_type inválido. Use: exact, contains, suffix, prefix.' });
    }

    try {
        const created = await dnsIgnoredService.add(pattern, match_type, reason);
        res.status(201).json({ success: true, pattern: created });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.patch('/ignored/:id/toggle', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido.' });
    try {
        const updated = await dnsIgnoredService.toggle(id);
        if (!updated) return res.status(404).json({ error: 'Padrão não encontrado.' });
        res.json({ success: true, pattern: updated });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/ignored/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido.' });
    try {
        await dnsIgnoredService.remove(id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
