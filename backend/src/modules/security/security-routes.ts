import { Router } from 'express';
import { execCmd } from '../../utils/sys';
import { ensureSmtpSchema, getStoredSmtpConfig, saveSmtpConfig, testConnection } from '../../utils/mailer';
import { AuthenticatedRequest, requireJwt } from './auth';
import { env } from '../../config/env';

const router = Router();

const sanitizeSmtpConfig = (conf: any) => ({
    host: conf.host,
    port: conf.port,
    username: conf.username,
    password: '',
    has_password: !!conf.password,
    from_email: conf.from_email,
    from_name: conf.from_name,
    to_email: conf.to_email,
    use_tls: !!conf.use_tls,
    use_ssl: !!conf.use_ssl,
    requires_auth: !!conf.requires_auth,
    is_active: !!conf.is_active,
});

router.get('/dashboard', async (req, res) => {
    try {
        const ufwRaw = await execCmd('sudo ufw status numbered').catch(() => '');
        const ufwActive = ufwRaw.includes('Status: active');

        const f2bRaw = await execCmd('sudo fail2ban-client status sshd').catch(() => '');
        let f2bBanned = 0;
        let f2bTotal = 0;
        let bannedIps: string[] = [];

        if (f2bRaw) {
            const matchBanned = f2bRaw.match(/Currently banned:\s+(\d+)/);
            if (matchBanned) f2bBanned = parseInt(matchBanned[1]);
            const matchTotal = f2bRaw.match(/Total banned:\s+(\d+)/);
            if (matchTotal) f2bTotal = parseInt(matchTotal[1]);
            const matchIps = f2bRaw.match(/Banned IP list:\s+(.*)/);
            if (matchIps && matchIps[1]) bannedIps = matchIps[1].split(' ').filter((ip) => ip.trim() !== '');
        }

        const lines = ufwRaw.split('\n');
        const rules: any[] = [];
        lines.forEach((line) => {
            const match = line.match(/^\[\s*(\d+)\]\s+(.*?)\s+(ALLOW|DENY|REJECT)\s+(IN|OUT)\s+(.*)$/i);
            if (match) {
                rules.push({ id: match[1], to: match[2].trim(), action: match[3].toUpperCase(), dir: match[4].toUpperCase(), from: match[5].trim() });
            } else {
                const simpleMatch = line.match(/^\[\s*(\d+)\]\s+(.*?)\s+(ALLOW|DENY|REJECT)\s+(.*)$/i);
                if (simpleMatch && !line.includes('(v6)')) {
                    rules.push({ id: simpleMatch[1], to: simpleMatch[2].trim(), action: simpleMatch[3].toUpperCase(), dir: 'IN', from: simpleMatch[4].trim() });
                }
            }
        });

        const publicIps = env.publicIps;
        const ipA = await execCmd('ip a').catch(() => '');

        const ipStatuses = await Promise.all(publicIps.map(async (ip) => {
            if (ipA.includes(ip)) return { ip, online: true };
            const pingOut = await execCmd(`ping -4 -c 1 -W 1 ${ip}`).catch(() => '');
            const isOnline = pingOut.includes('ttl=') || pingOut.includes('bytes from');
            return { ip, online: isOnline };
        }));

        const portsStr = await execCmd("sudo grep 'UFW BLOCK' /var/log/kern.log | tail -n 5000 | grep -o 'DPT=[0-9]*' | cut -d= -f2 | sort | uniq -c | sort -nr | head -n 4").catch(() => '');
        const topPorts = portsStr.split('\n').filter(Boolean).map((line) => {
            const parts = line.trim().split(/\s+/);
            return { port: parts[1], count: parseInt(parts[0]) };
        });

        const ipsStr = await execCmd("sudo grep 'UFW BLOCK' /var/log/kern.log | tail -n 5000 | grep -o 'SRC=[0-9\\.]*' | cut -d= -f2 | sort | uniq -c | sort -nr | head -n 4").catch(() => '');
        const topIps = ipsStr.split('\n').filter(Boolean).map((line) => {
            const parts = line.trim().split(/\s+/);
            return { ip: parts[1], count: parseInt(parts[0]) };
        });

        res.json({
            ufw: { active: ufwActive, rules },
            fail2ban: { active: !!f2bRaw, currently_banned: f2bBanned, total_banned: f2bTotal, banned_ips: bannedIps },
            public_ips: ipStatuses,
            sentinel_metrics: { top_ports: topPorts, top_ips: topIps },
        });
    } catch (error) {
        console.error('Erro no SOC:', error);
        res.status(500).json({ error: 'Erro ao ler dados de seguranca.' });
    }
});

router.get('/smtp', requireJwt, async (req, res) => {
    try {
        await ensureSmtpSchema();
        const conf = await getStoredSmtpConfig();
        res.json(sanitizeSmtpConfig(conf));
    } catch (error) {
        console.error('[SMTP] Falha ao carregar configuracao:', error);
        res.status(500).json({ error: 'Erro ao carregar configuracao SMTP.' });
    }
});

router.post('/smtp', requireJwt, async (req: AuthenticatedRequest, res) => {
    try {
        const next = await saveSmtpConfig({
            host: req.body.host,
            port: req.body.port,
            username: req.body.username,
            password: req.body.password,
            from_email: req.body.from_email,
            from_name: req.body.from_name,
            to_email: req.body.to_email,
            use_tls: req.body.use_tls,
            use_ssl: req.body.use_ssl,
            requires_auth: req.body.requires_auth,
            is_active: req.body.is_active,
        });
        res.json({ success: true, config: sanitizeSmtpConfig(next) });
    } catch (error) {
        console.error('[SMTP] Falha ao salvar configuracao:', error);
        res.status(500).json({ error: 'Erro ao salvar configuracao SMTP.' });
    }
});

router.post('/smtp/test', requireJwt, async (req: AuthenticatedRequest, res) => {
    try {
        await testConnection({
            host: req.body.host,
            port: req.body.port,
            username: req.body.username,
            password: req.body.password,
            from_email: req.body.from_email,
            from_name: req.body.from_name,
            to_email: req.body.to_email,
            use_tls: req.body.use_tls,
            use_ssl: req.body.use_ssl,
            requires_auth: req.body.requires_auth,
            is_active: req.body.is_active,
        });
        res.json({ success: true, message: 'Teste SMTP enviado com sucesso.' });
    } catch (error: any) {
        console.error('[SMTP] Falha no teste:', error);
        res.status(500).json({ error: error?.message || 'Erro ao testar SMTP.' });
    }
});

router.post('/f2b/unban', async (req, res) => {
    try {
        await execCmd(`sudo fail2ban-client set sshd unbanip ${req.body.ip}`);
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro' });
    }
});

router.post('/f2b/ban', async (req, res) => {
    try {
        await execCmd(`sudo fail2ban-client set sshd banip ${req.body.ip}`);
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro' });
    }
});

router.post('/ufw/delete', async (req, res) => {
    try {
        await execCmd(`echo "y" | sudo ufw delete ${req.body.id}`);
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro' });
    }
});

router.post('/setup-cockpit', async (req, res) => {
    try {
        await execCmd(`sudo ufw allow ${env.sshExternalPort}/tcp`);
        await execCmd(`sudo ufw allow in on ${env.lanInterface} to any port ${env.sshLanAllowPort}`);
        await execCmd(`sudo ufw allow in on ${env.wireguardInterface} to any port ${env.sshLanAllowPort}`);
        await execCmd(`sudo ufw deny in on ${env.wanInterface} to any port ${env.sshLanAllowPort}`);
        await execCmd(`echo 'y' | sudo ufw enable`);
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro' });
    }
});

export default router;
