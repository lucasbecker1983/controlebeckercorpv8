import { Router } from 'express';
import fs from 'fs';
import { execCmd } from '../../utils/sys';
import { pool } from '../../config/db';
import { env } from '../../config/env';

const router = Router();

const respondUnboundError = (res: any, area: string, error: unknown) => {
    console.error(`[UNBOUND MODULE] Falha em ${area}:`, error);
    return res.status(500).json({ error: `Falha ao processar ${area}.` });
};

const splitForwardAddrs = (value: string) => value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

// --- GERAÇÃO DE ARQUIVO DE CONFIGURAÇÃO ---
const syncUnboundConfig = async () => {
    try {
        const res = await pool.query("SELECT * FROM net_dns_rules ORDER BY id ASC");
        let serverBlock = "server:\n";
        let forwardBlocks = "";
        
        res.rows.forEach(r => {
            const type = r.type || 'A';
            if (type === 'A') {
                serverBlock += `    local-zone: "${r.domain}" redirect\n    local-data: "${r.domain} A ${r.target_ip}"\n`;
            } else if (type === 'FWD') {
                const forwardAddrs = splitForwardAddrs(String(r.target_ip || ''));
                if (!forwardAddrs.length) return;
                forwardBlocks += `\nforward-zone:\n    name: "${r.domain}"\n`;
                forwardAddrs.forEach((addr) => {
                    forwardBlocks += `    forward-addr: ${addr}\n`;
                });
            }
        });

        fs.writeFileSync('/etc/unbound/unbound.conf.d/custom-zones.conf', serverBlock + forwardBlocks);
        await execCmd('sudo systemctl reload unbound');
    } catch (e) {}
};

// --- ROTAS BLINDADAS (SEM QUEBRAR O NODE) ---
router.get('/stats', async (req, res) => {
    try {
        const stdout = await execCmd("systemctl is-active unbound || echo inactive");
        const isRunning = stdout.trim() === 'active';
        let isResolving = false;
        let total = 0, latency = 0;

        try {
            const digOut = await execCmd("dig @127.0.0.1 localhost +short");
            isResolving = digOut.split('\n').map(line => line.trim()).filter(Boolean).length > 0;
        } catch (e) {}
        
        if (isRunning) {
            try {
                const statsOut = await execCmd("sudo unbound-control stats_noreset");
                const totalMatch = statsOut.match(/total\.num\.queries=([\d\.]+)/);
                if (totalMatch) total = parseInt(totalMatch[1]);
                const latMatch = statsOut.match(/total\.requestlist\.avg=([\d\.]+)/);
                if (latMatch) latency = parseFloat(latMatch[1]);
            } catch(e) {}
        }
        res.json({ is_running: isRunning, is_resolving: isResolving, stats: { total_queries: total, avg_latency: latency } });
    } catch (error) {
        respondUnboundError(res, 'estatísticas do Unbound', error);
    }
});

router.get('/latency-breakdown', async (req, res) => {
    const vlans = [
        { id: 'vlan10', name: 'VLAN 10 (Secretaria)', ip: '192.168.10.1/24', prefix: '192.168.10.' },
        { id: 'vlan30', name: 'VLAN 30 (Celulares)', ip: '192.168.30.1/24', prefix: '192.168.30.' },
        { id: 'vlan40', name: 'VLAN 40 (CFTV)', ip: '192.168.40.1/24', prefix: '192.168.40.' },
        { id: 'vlan50', name: 'VLAN 50 (SINE)', ip: '192.168.50.1/24', prefix: '192.168.50.' },
        { id: 'vlan70', name: 'VLAN 70 (Visitantes)', ip: '192.168.70.1/24', prefix: '192.168.70.' },
        { id: 'vlan80', name: 'VLAN 80 (VOiP)', ip: '192.168.80.1/24', prefix: '192.168.80.' }
    ];

    try {
        const rawLog = await execCmd("sudo journalctl -u unbound --no-pager -n 5000");
        const breakdown = vlans.map(v => {
            const regex = new RegExp(v.prefix.replace(/\./g, '\\.'), "g");
            const count = (rawLog.match(regex) || []).length;
            return { ...v, queries: count };
        });
        res.json(breakdown);
    } catch(error) {
        respondUnboundError(res, 'telemetria por VLAN do Unbound', error);
    }
});

router.get('/zones', async (req, res) => {
    try {
        const r = await pool.query("SELECT * FROM net_dns_rules ORDER BY id DESC");
        res.json(r.rows);
    } catch (error) {
        respondUnboundError(res, 'zonas do Unbound', error);
    }
});

router.post('/zones/add', async (req, res) => {
    const { domain, ip, type } = req.body;
    try {
        await pool.query("DELETE FROM net_dns_rules WHERE domain=$1", [domain]);
        await pool.query("INSERT INTO net_dns_rules (domain, target_ip, type) VALUES ($1, $2, $3)", [domain, ip, type || 'A']);
        await syncUnboundConfig();
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/zones/delete', async (req, res) => {
    try {
        await pool.query("DELETE FROM net_dns_rules WHERE id=$1", [req.body.id]);
        await syncUnboundConfig();
        res.json({ success: true });
    } catch (error) {
        respondUnboundError(res, 'remoção de zona do Unbound', error);
    }
});

router.post('/zones/verify', async (req, res) => {
    try {
        const stdout = await execCmd(`dig @127.0.0.1 ${req.body.domain} +short`);
        const resolvedIp = stdout.split('\n')[0]?.trim();
        res.json({ match: resolvedIp === req.body.target_ip, resolved_to: resolvedIp || null });
    } catch (error) {
        respondUnboundError(res, 'verificação de zona do Unbound', error);
    }
});

router.post('/cache/flush', async (req, res) => {
    try {
        await execCmd("sudo unbound-control flush_zone .");
        res.json({ success: true });
    } catch (error) {
        respondUnboundError(res, 'limpeza de cache do Unbound', error);
    }
});

export default router;
