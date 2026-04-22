// =============================================================================
// BeckerCorp v8 — dns-routes.ts
// =============================================================================
import { Router } from 'express';
import { Pool } from 'pg';
import { execSync } from 'child_process';
import fs from 'fs';

const router = Router();

const pool = new Pool({
    database: 'controlebeckercorp_v8',
    user: 'postgres',
    password: 'becker_admin_secure',
    host: 'localhost',
});

const RPZ_FILE = '/etc/unbound/becker/blocked.rpz';

// ---------------------------------------------------------------------------
// GET /api/dns/radar
// ---------------------------------------------------------------------------
router.get('/radar', async (req, res) => {
    const { vlan, blocked, limit = 100 } = req.query;
    try {
        let q = `
            SELECT timestamp, client_ip, vlan, domain, query_type, blocked, block_reason
            FROM dns_logs
            WHERE timestamp > NOW() - INTERVAL '10 minutes'
        `;
        const params: any[] = [];
        if (vlan && vlan !== 'todas') { params.push(vlan); q += ` AND vlan = $${params.length}`; }
        if (blocked === 'true') q += ` AND blocked = TRUE`;
        q += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit as string));
        const { rows } = await pool.query(q, params);
        res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// GET /api/dns/vlan-summary
// ---------------------------------------------------------------------------
router.get('/vlan-summary', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM v_dns_vlan_summary`);
        res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// GET /api/dns/top-blocked
// ---------------------------------------------------------------------------
router.get('/top-blocked', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM v_dns_top_blocked`);
        res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// GET /api/dns/top-accessed
// ---------------------------------------------------------------------------
router.get('/top-accessed', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM v_dns_top_accessed`);
        res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// GET /api/dns/stats
// ---------------------------------------------------------------------------
router.get('/stats', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                COUNT(*) as total_hoje,
                COUNT(*) FILTER (WHERE blocked) as bloqueados_hoje,
                COUNT(DISTINCT client_ip) as ips_ativos,
                COUNT(DISTINCT domain) as dominios_unicos,
                COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '5 minutes') as queries_5min
            FROM dns_logs
            WHERE timestamp > NOW() - INTERVAL '24 hours'
        `);
        res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// GET /api/dns/listas
// ---------------------------------------------------------------------------
router.get('/listas', async (req, res) => {
    try {
        if (!fs.existsSync(RPZ_FILE)) return res.json([]);
        const content = fs.readFileSync(RPZ_FILE, 'utf8');
        const domains = content.split('\n')
            .filter(l => l.includes('CNAME') && !l.startsWith('*') && !l.startsWith(';')
                      && !l.startsWith('$') && !l.startsWith('@') && l.trim()
                      && !l.includes('rpz-client-ip') && !l.includes('rpz-passthru'))
            .map(l => l.split(/\s+/)[0]);
        res.json(domains);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// POST /api/dns/listas/add
// ---------------------------------------------------------------------------
router.post('/listas/add', async (req, res) => {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'domain obrigatório' });
    try {
        execSync(`/usr/local/bin/becker-dns-manage add ${domain}`);
        res.json({ success: true, message: `${domain} adicionado e Unbound recarregado` });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// POST /api/dns/listas/remove
// ---------------------------------------------------------------------------
router.post('/listas/remove', async (req, res) => {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'domain obrigatório' });
    try {
        execSync(`/usr/local/bin/becker-dns-manage remove ${domain}`);
        res.json({ success: true, message: `${domain} removido` });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// GET /api/dns/status
// ---------------------------------------------------------------------------
router.get('/status', async (req, res) => {
    try {
        const unboundActive = execSync('systemctl is-active unbound 2>/dev/null').toString().trim() === 'active';
        const loggerActive  = execSync('systemctl is-active becker-dns-logger 2>/dev/null').toString().trim() === 'active';
        let stats = '';
        try { stats = execSync('unbound-control stats_noreset 2>/dev/null | grep "total.num.queries"').toString().trim(); } catch {}
        res.json({ unbound_active: unboundActive, logger_active: loggerActive, stats });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// POST /api/dns/restart-unbound
// ---------------------------------------------------------------------------
router.post('/restart-unbound', async (req, res) => {
    try {
        execSync('systemctl restart unbound');
        res.json({ success: true, message: 'Unbound reiniciado com sucesso' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// POST /api/dns/reload-rules
// ---------------------------------------------------------------------------
router.post('/reload-rules', async (req, res) => {
    try {
        execSync('unbound-control reload');
        res.json({ success: true, message: 'Regras RPZ recarregadas' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// POST /api/dns/restart-logger
// ---------------------------------------------------------------------------
router.post('/restart-logger', async (req, res) => {
    try {
        execSync('systemctl restart becker-dns-logger');
        res.json({ success: true, message: 'Logger reiniciado com sucesso' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// POST /api/dns/cleanup
// ---------------------------------------------------------------------------
router.post('/cleanup', async (req, res) => {
    try {
        const result = await pool.query(
            `DELETE FROM dns_logs WHERE timestamp < NOW() - INTERVAL '30 days'`
        );
        res.json({ success: true, message: `Logs com mais de 30 dias removidos` });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
