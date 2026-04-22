import { Router } from 'express';
import { exec } from 'child_process';
import { Pool } from 'pg';
import fs from 'fs';

const router = Router();
const pool = new Pool({ connectionString: 'postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8' });

// Helper local para evitar erro de import
const execCmd = (cmd: string): Promise<string> => {
    return new Promise((resolve) => {
        exec(cmd, (err, stdout) => resolve(err ? '' : stdout.trim()));
    });
};

const CMD_CTL = "sudo /bin/systemctl";
const CMD_HTPASSWD = "sudo /usr/bin/htpasswd";

// Status
router.get('/status', async (req, res) => {
    const s = await execCmd(`${CMD_CTL} is-active squid || echo inactive`);
    res.json({ status: s === 'active' ? 'running' : 'stopped' });
});

// Interfaces
router.get('/interfaces', async (req, res) => {
    try { const r = await pool.query("SELECT * FROM net_interface_config ORDER BY iface_name"); res.json(r.rows.map(x=>({name:x.iface_name, label:x.alias, enabled:x.squid_enabled, type:x.type||'vlan'}))); } catch { res.json([]); }
});

// Logs
router.get('/logs', async (req, res) => {
    try { const r = await pool.query("SELECT * FROM proxy_audit_log ORDER BY timestamp DESC LIMIT 50"); res.json(r.rows); } catch { res.json([]); }
});

// Active Clients
router.get('/active-clients', async (req, res) => {
    try { const r = await pool.query("SELECT DISTINCT client_ip FROM proxy_audit_log LIMIT 50"); res.json(r.rows); } catch { res.json([]); }
});

// Users
router.get('/users', async (req, res) => { try { const r = await pool.query("SELECT * FROM proxy_users"); res.json(r.rows); } catch { res.json([]); } });
router.post('/users', async (req, res) => {
    const { username, password } = req.body;
    try {
        await pool.query("INSERT INTO proxy_users (username, term_accepted) VALUES ($1, true) ON CONFLICT (username) DO NOTHING", [username]);
        if(password) execCmd(`${CMD_HTPASSWD} -b -c /etc/squid/passwd ${username} ${password} 2>/dev/null || ${CMD_HTPASSWD} -b /etc/squid/passwd ${username} ${password}`);
        res.json({ success: true });
    } catch { res.status(500).json({ error: "Erro" }); }
});
router.post('/users/delete', async (req, res) => { await pool.query("DELETE FROM proxy_users WHERE username=$1", [req.body.username]); execCmd(`${CMD_HTPASSWD} -D /etc/squid/passwd ${req.body.username}`); res.json({success:true}); });

// VIPs
router.get('/vips', async (req, res) => { try { const r = await pool.query("SELECT * FROM proxy_vips"); res.json(r.rows); } catch { res.json([]); } });
router.post('/vips', async (req, res) => { await pool.query("INSERT INTO proxy_vips (ip, description) VALUES ($1, $2)", [req.body.ip, req.body.desc]); res.json({success:true}); });
router.post('/vips/delete', async (req, res) => { await pool.query("DELETE FROM proxy_vips WHERE id=$1", [req.body.id]); res.json({success:true}); });

// Regras (Arquivos)
const RULES: any = { bloqueados: '/etc/squid/bloqueados.acl', permitidos: '/etc/squid/permitidos.acl', bancos: '/etc/squid/splice_whitelist.acl' };
router.get('/rules/:type', (req, res) => { 
    const f = RULES[req.params.type];
    if(f && fs.existsSync(f)) res.json(fs.readFileSync(f, 'utf8').split('\n').filter(l=>l.trim())); 
    else res.json([]); 
});
router.post('/rules/:type', (req, res) => {
    const f = RULES[req.params.type];
    if(f) { fs.writeFileSync(f, req.body.domains.join('\n')); execCmd('squid -k reconfigure'); res.json({success:true}); }
    else res.status(400).json({});
});

export default router;
