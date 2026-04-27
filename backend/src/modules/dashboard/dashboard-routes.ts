import { Router } from 'express';
import { execCmd } from '../../utils/sys';
import fs from 'fs';
import { env } from '../../config/env';
import { pool } from '../../config/db';

const router = Router();

const formatMemory = (mb: number) => {
    if (!Number.isFinite(mb) || mb <= 0) return '0 MB';
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${Math.round(mb)} MB`;
};

const formatGhz = (mhz: number) => {
    if (!Number.isFinite(mhz) || mhz <= 0) return '0.0 GHz';
    return `${(mhz / 1000).toFixed(1)} GHz`;
};

const getCpuCapacityText = () => {
    try {
        const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf-8');
        const speeds = cpuInfo
            .split('\n')
            .map((line) => line.match(/^cpu MHz\s*:\s*([0-9.]+)/)?.[1])
            .filter(Boolean)
            .map((value) => Number(value));

        const threadCount = speeds.length;
        if (!threadCount) return 'Threads indisponíveis';

        const totalMhz = speeds.reduce((sum, value) => sum + value, 0);
        const avgMhz = totalMhz / threadCount;
        return `${threadCount} threads • ${formatGhz(totalMhz)} total • ${formatGhz(avgMhz)} média`;
    } catch {
        return 'Threads indisponíveis';
    }
};

// --- VARIÁVEIS GLOBAIS PARA CÁLCULO DE BANDA (TEMPO REAL) ---
let lastTime = Date.now();
let lastWanRx = 0;
let lastLanTx = 0;

const getNetStats = () => {
    try {
        const dev = fs.readFileSync('/proc/net/dev', 'utf-8');
        let wanRx = 0, lanTx = 0;
        dev.split('\n').forEach(line => {
            if(line.includes(`${env.wanInterface}:`)) {
                wanRx = parseInt(line.split(':')[1].trim().split(/\s+/)[0]) || 0;
            }
            if(line.includes(`${env.lanInterface}:`)) {
                lanTx = parseInt(line.split(':')[1].trim().split(/\s+/)[8]) || 0; // TX do servidor = Download da LAN
            }
        });
        return { wanRx, lanTx };
    } catch(e) { return { wanRx: 0, lanTx: 0 }; }
};

router.get('/metrics', async (req, res) => {
    try {
        // --- IA SENTINELA: Análise de Logs ---
        const lastBan = await execCmd("sudo grep 'Ban ' /var/log/fail2ban.log | tail -n 1").catch(() => "");
        const totalBansStr = await execCmd("sudo grep 'Ban ' /var/log/fail2ban.log | wc -l").catch(() => "0");
        const ufwBlocksStr = await execCmd("sudo grep 'UFW BLOCK' /var/log/kern.log | wc -l").catch(() => "0");
        
        const totalBans = parseInt(totalBansStr) || 0;
        const ufwBlocks = parseInt(ufwBlocksStr) || 0;
        const [blocked24h, blocked5m, topBlocked, topThreatType, lastBlocked] = await Promise.all([
            pool.query(`
                SELECT COUNT(*)::int AS total
                FROM access_events
                WHERE occurred_at >= NOW() - INTERVAL '24 hours'
                  AND action = 'blocked'
            `).catch(() => ({ rows: [{ total: 0 }] })),
            pool.query(`
                SELECT COUNT(*)::int AS total
                FROM access_events
                WHERE occurred_at >= NOW() - INTERVAL '5 minutes'
                  AND action = 'blocked'
            `).catch(() => ({ rows: [{ total: 0 }] })),
            pool.query(`
                SELECT domain, COUNT(*)::int AS total
                FROM access_events
                WHERE occurred_at >= NOW() - INTERVAL '24 hours'
                  AND action = 'blocked'
                  AND domain IS NOT NULL
                GROUP BY domain
                ORDER BY total DESC
                LIMIT 1
            `).catch(() => ({ rows: [] as any[] })),
            pool.query(`
                SELECT
                    COALESCE(
                        NULLIF(raw_payload #>> '{resolved,category}', ''),
                        NULLIF(raw_payload #>> '{parsed,resolved,category}', ''),
                        NULLIF(evidence, ''),
                        NULLIF(policy_origin, ''),
                        NULLIF(source, ''),
                        'Sem classificação'
                    ) AS type,
                    COUNT(*)::int AS total
                FROM access_events
                WHERE occurred_at >= NOW() - INTERVAL '24 hours'
                  AND action = 'blocked'
                GROUP BY type
                ORDER BY total DESC, type ASC
                LIMIT 1
            `).catch(() => ({ rows: [] as any[] })),
            pool.query(`
                SELECT host(client_ip) AS client_ip, domain, vlan_id, occurred_at
                FROM access_events
                WHERE occurred_at >= NOW() - INTERVAL '24 hours'
                  AND action = 'blocked'
                ORDER BY occurred_at DESC
                LIMIT 1
            `).catch(() => ({ rows: [] as any[] })),
        ]);
        const totalThreats = Number(blocked24h.rows[0]?.total || 0);
        const recentThreats = Number(blocked5m.rows[0]?.total || 0);
        const topThreatDomain = topBlocked.rows[0]?.domain || null;
        const mostReceivedThreatType = topThreatType.rows[0]?.type || null;

        let lastIp = "Nenhum";
        let lastService = "Seguro";
        if (lastBlocked.rows[0]?.client_ip) {
            lastIp = lastBlocked.rows[0].client_ip;
            lastService = lastBlocked.rows[0].domain || `VLAN ${lastBlocked.rows[0].vlan_id || '-'}`;
        } else if (lastBan) {
            const matchIp = lastBan.match(/Ban\s+([0-9.]+)/);
            const matchService = lastBan.match(/\[(.*?)\]/);
            if (matchIp) lastIp = matchIp[1];
            if (matchService) lastService = matchService[1];
        }

        // --- SISTEMA E HARDWARE ---
        const uptimeSeconds = await execCmd("cat /proc/uptime | awk '{print $1}'").then(r => parseFloat(r)).catch(() => 0);
        
        // CPU: vmstat é infalível para pegar o uso imediato de processo (100 - idle)
        let cpu = 0;
        const cpuText = getCpuCapacityText();
        try {
            const cpuRaw = await execCmd("vmstat 1 2 | tail -1 | awk '{print 100-$15}'");
            cpu = Math.round(parseFloat(cpuRaw)) || 0;
        } catch(e) {}

        // RAM: sem vírgula (cravada com Math.round)
        let ram = 0;
        let ramText = 'Sem leitura';
        try {
            const ramRaw = await execCmd("free -m | awk '/^Mem:/ {print $3, $2, $3/$2 * 100}'");
            const [usedMbRaw, totalMbRaw, percentRaw] = ramRaw.trim().split(/\s+/);
            const usedMb = Number(usedMbRaw || 0);
            const totalMb = Number(totalMbRaw || 0);
            ram = Math.round(parseFloat(percentRaw)) || 0;
            if (usedMb > 0 && totalMb > 0) {
                ramText = `Usado ${formatMemory(usedMb)} de ${formatMemory(totalMb)}`;
            }
        } catch(e) {}

        // --- STATUS DE INTERNET E MÓDULOS ---
        const isOnline = await execCmd(`ping -c 1 -W 1 ${env.gatewayIp} > /dev/null 2>&1 && echo true || echo false`).then(r => r.trim() === 'true').catch(() => false);
        const checkSvc = async (svc: string) => await execCmd(`systemctl is-active ${svc}`).then(r => r.trim() === 'active').catch(() => false);

        // --- REDE: IPs ---
        const wanIp = await execCmd(`ip -4 addr show ${env.wanInterface}`).then(r => r.match(/inet\s+([0-9.]+)/)?.[1] || 'Desconhecido').catch(() => 'Desconhecido');
        const lanIp = await execCmd(`ip -4 addr show ${env.lanInterface}`).then(r => r.match(/inet\s+([0-9.]+)/)?.[1] || 'Desconhecido').catch(() => 'Desconhecido');

        // --- TRÁFEGO EM TEMPO REAL (MÁGICA DOS GRÁFICOS) ---
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000 || 1;
        const net = getNetStats();
        
        // Mbps = (bytes * 8) / (segundos * 1000000)
        const wanDownMbps = lastWanRx > 0 && net.wanRx >= lastWanRx ? ((net.wanRx - lastWanRx) * 8) / timeDiff / 1000000 : 0;
        const lanDownMbps = lastLanTx > 0 && net.lanTx >= lastLanTx ? ((net.lanTx - lastLanTx) * 8) / timeDiff / 1000000 : 0;

        lastTime = now;
        lastWanRx = net.wanRx;
        lastLanTx = net.lanTx;

        // --- MONTAGEM DO PAYLOAD COMPLETO ---
        res.json({
            system: {
                uptime: uptimeSeconds,
                cpu: cpu,
                cpu_text: cpuText,
                ram: ram,
                ram_text: ramText
            },
            internet: {
                online: isOnline
            },
            threats: {
                total: totalThreats,
                window: '24h',
                recent_5m: recentThreats,
                last_ip: lastIp,
                last_service: lastService,
                top_domain: topThreatDomain,
                top_type: mostReceivedThreatType,
                severity: recentThreats > 20 ? 'Crítica' : totalThreats > 0 ? 'Monitorada' : 'Sem bloqueios',
                firewall_blocks: ufwBlocks,
                fail2ban_bans: totalBans,
                source: 'access_events'
            },
            modules: {
                dhcp_active: await checkSvc('isc-dhcp-server'),
                dns_active: await checkSvc('unbound'),
                proxy_active: await checkSvc('squid'),
                vpn_active: await checkSvc(env.wireguardService),
                threats_blocked: totalThreats
            },
            network: {
                wan: { ip: wanIp.trim(), down: wanDownMbps },
                lan: { ip: lanIp.trim(), down: lanDownMbps }
            }
        });
    } catch (error) {
        console.error("Dashboard Metrics Error:", error);
        res.status(500).json({ error: "Erro na API de Metrics" });
    }
});

export default router;
