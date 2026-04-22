import { Router } from 'express';
import fs from 'fs';
import { execCmd } from '../../utils/sys';
import { pool } from '../../config/db';
import { env } from '../../config/env';

const router = Router();

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
                forwardBlocks += `\nforward-zone:\n    name: "${r.domain}"\n    forward-addr: ${r.target_ip}\n`;
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
        let total = 0, latency = 0;
        
        if (isRunning) {
            try {
                const statsOut = await execCmd("sudo unbound-control stats_noreset");
                const totalMatch = statsOut.match(/total\.num\.queries=([\d\.]+)/);
                if (totalMatch) total = parseInt(totalMatch[1]);
                const latMatch = statsOut.match(/total\.requestlist\.avg=([\d\.]+)/);
                if (latMatch) latency = parseFloat(latMatch[1]);
            } catch(e) {}
        }
        res.json({ is_running: isRunning, stats: { total_queries: total, avg_latency: latency } });
    } catch (e) {
        res.json({ is_running: false, stats: { total_queries: 0, avg_latency: 0 } });
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
    } catch(e) {
        res.json(vlans.map(v => ({ ...v, queries: 0 })));
    }
});

router.get('/zones', async (req, res) => {
    try {
        const r = await pool.query("SELECT * FROM net_dns_rules ORDER BY id DESC");
        res.json(r.rows);
    } catch { res.json([]); }
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
    } catch (e) { res.status(500).json({ error: "Erro" }); }
});

router.post('/zones/verify', async (req, res) => {
    try {
        const stdout = await execCmd(`dig @127.0.0.1 ${req.body.domain} +short`);
        const resolvedIp = stdout.split('\n')[0]?.trim();
        res.json({ match: resolvedIp === req.body.target_ip, resolved_to: resolvedIp || null });
    } catch (e) { res.json({ match: false, resolved_to: null }); }
});

router.post('/cache/flush', async (req, res) => {
    try {
        await execCmd("sudo unbound-control flush_zone .");
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Erro" }); }
});

export default router;
