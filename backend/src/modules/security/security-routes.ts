import { Router } from 'express';
import fs from 'fs';
import { execCmd } from '../../utils/sys';
import { ensureSmtpSchema, getStoredSmtpConfig, saveSmtpConfig, testConnection } from '../../utils/mailer';
import { AuthenticatedRequest, requireJwt } from './auth';
import { env } from '../../config/env';

const router = Router();
const UFW_BIN = '/usr/sbin/ufw';

const commandAvailable = (path: string) => fs.existsSync(path);

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

const parseUfwRules = (ufwRaw: string) => {
    const rules: any[] = [];
    ufwRaw.split('\n').forEach((line) => {
        const match = line.match(/^\[\s*(\d+)\]\s+(.*?)\s+(ALLOW|DENY|REJECT)\s+(IN|OUT|FWD)\s+(.*)$/i);
        if (match) {
            rules.push({ id: match[1], to: match[2].trim(), action: match[3].toUpperCase(), dir: match[4].toUpperCase(), from: match[5].trim(), source: 'ufw' });
        } else {
            const simpleMatch = line.match(/^\[\s*(\d+)\]\s+(.*?)\s+(ALLOW|DENY|REJECT)\s+(.*)$/i);
            if (simpleMatch && !line.includes('(v6)')) {
                rules.push({ id: simpleMatch[1], to: simpleMatch[2].trim(), action: simpleMatch[3].toUpperCase(), dir: 'IN', from: simpleMatch[4].trim(), source: 'ufw' });
            }
        }
    });
    return rules;
};

const parseIptablesRules = (raw: string) => raw
    .split('\n')
    .filter((line) => line.startsWith('-A '))
    .slice(0, 80)
    .map((line, index) => {
        const chain = line.match(/^-A\s+(\S+)/)?.[1] || 'filter';
        const runtimeAction = line.match(/\s-j\s+(\S+)/)?.[1] || 'RULE';
        const action = runtimeAction === 'ACCEPT' ? 'ALLOW' : runtimeAction === 'DROP' ? 'DENY' : runtimeAction;
        const source = line.match(/\s-s\s+(\S+)/)?.[1] || 'any';
        const destination = line.match(/\s-d\s+(\S+)/)?.[1] || 'any';
        const port = line.match(/--dport\s+(\S+)/)?.[1];
        const ifaceIn = line.match(/\s-i\s+(\S+)/)?.[1];
        const ifaceOut = line.match(/\s-o\s+(\S+)/)?.[1];
        const target = [chain, port ? `porta ${port}` : null, ifaceIn ? `in ${ifaceIn}` : null, ifaceOut ? `out ${ifaceOut}` : null]
            .filter(Boolean)
            .join(' / ');

        return {
            id: `rt-${index + 1}`,
            to: target,
            action: action.toUpperCase(),
            dir: chain,
            from: source === 'any' && destination !== 'any' ? destination : source,
            source: 'iptables',
            raw: line,
        };
    });

router.get('/dashboard', async (req, res) => {
    try {
        const ufwInstalled = commandAvailable(UFW_BIN);
        const ufwRaw = ufwInstalled ? await execCmd('sudo ufw status numbered').catch(() => '') : '';
        const iptablesRaw = !ufwRaw ? await execCmd('iptables-save -t filter').catch(() => '') : '';
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

        const rules = ufwRaw ? parseUfwRules(ufwRaw) : parseIptablesRules(iptablesRaw);

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
            ufw: {
                active: ufwActive || !!iptablesRaw,
                installed: ufwInstalled,
                runtime_source: ufwRaw ? 'ufw' : 'iptables',
                message: ufwInstalled ? '' : 'UFW não está instalado; leitura feita pelo runtime iptables.',
                rules,
            },
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

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
const RULE_ID_RE = /^\d{1,4}$/;

function validateIp(ip: unknown): string | null {
    if (typeof ip !== 'string') return null;
    const trimmed = ip.trim();
    return IP_RE.test(trimmed) ? trimmed : null;
}

router.post('/f2b/unban', requireJwt, async (req: AuthenticatedRequest, res) => {
    const ip = validateIp(req.body.ip);
    if (!ip) return res.status(400).json({ error: 'IP inválido.' });
    try {
        await execCmd(`sudo fail2ban-client set sshd unbanip ${ip}`);
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro' });
    }
});

router.post('/f2b/ban', requireJwt, async (req: AuthenticatedRequest, res) => {
    const ip = validateIp(req.body.ip);
    if (!ip) return res.status(400).json({ error: 'IP inválido.' });
    try {
        await execCmd(`sudo fail2ban-client set sshd banip ${ip}`);
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro' });
    }
});

router.post('/ufw/delete', requireJwt, async (req: AuthenticatedRequest, res) => {
    if (!commandAvailable(UFW_BIN)) return res.status(503).json({ error: 'UFW não está instalado neste host.' });
    const id = req.body.id;
    if (typeof id !== 'string' && typeof id !== 'number') return res.status(400).json({ error: 'ID inválido.' });
    const idStr = String(id).trim();
    if (!RULE_ID_RE.test(idStr)) return res.status(400).json({ error: 'ID de regra inválido.' });
    try {
        await execCmd(`echo "y" | sudo ufw delete ${idStr}`);
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro' });
    }
});

router.post('/setup-cockpit', requireJwt, async (req: AuthenticatedRequest, res) => {
    if (!commandAvailable(UFW_BIN)) return res.status(503).json({ error: 'UFW não está instalado neste host.' });
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
