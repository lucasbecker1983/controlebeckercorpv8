const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const PORT = 6779;

app.use(cors());
app.use(express.json());

// Helpers
const runCmd = (cmd) => new Promise((resolve) => {
    exec(cmd, (error, stdout) => resolve(error ? '' : stdout.trim()));
});

const readFileList = (filePath) => {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
};

// --- ROTAS REAIS ---

// 1. Interfaces (VLANs e Físicas)
app.get('/api/proxy/interfaces', async (req, res) => {
    try {
        // Lê diretório de interfaces do Linux
        const ifaces = fs.readdirSync('/sys/class/net');
        const realIfaces = ifaces.map(name => {
            let type = 'ethernet';
            let label = 'Interface';
            
            // Tenta adivinhar o tipo pelo nome
            if (name.includes('tun') || name.includes('wg')) { type = 'vpn'; label = 'VPN Tunnel'; }
            else if (name.includes('br')) { type = 'bridge'; label = 'Bridge'; }
            else if (name.includes('docker')) { type = 'docker'; label = 'Docker'; }
            else if (name.includes('.') || name.includes('vlan')) { type = 'vlan'; label = 'VLAN'; }
            
            // Verifica se está UP
            const operstate = fs.existsSync(`/sys/class/net/${name}/operstate`) 
                ? fs.readFileSync(`/sys/class/net/${name}/operstate`, 'utf8').trim() 
                : 'unknown';

            return {
                name: name,
                label: label,
                type: type,
                enabled: operstate === 'up' || operstate === 'unknown'
            };
        });
        res.json(realIfaces);
    } catch (e) {
        res.json([]);
    }
});

// 2. Usuários (Lê arquivo htpasswd)
app.get('/api/proxy/users', (req, res) => {
    const passwdFile = '/etc/squid/passwd';
    if (!fs.existsSync(passwdFile)) return res.json([]);
    
    const content = fs.readFileSync(passwdFile, 'utf8');
    const users = content.split('\n')
        .filter(line => line.trim() !== '')
        .map((line, index) => {
            const [username] = line.split(':');
            return { id: index, username, type: 'local' };
        });
    res.json(users);
});

// Adicionar Usuário
app.post('/api/proxy/users', (req, res) => {
    const { username, password } = req.body;
    if(!username || !password) return res.status(400).json({error: 'Dados inválidos'});
    
    exec(`htpasswd -b /etc/squid/passwd "${username}" "${password}"`, (err) => {
        if(err) return res.status(500).json({error: 'Erro ao criar usuário'});
        exec('squid -k reconfigure');
        res.json({success: true});
    });
});

// Deletar Usuário
app.post('/api/proxy/users/delete', (req, res) => {
    const { username } = req.body;
    exec(`htpasswd -D /etc/squid/passwd "${username}"`, (err) => {
        exec('squid -k reconfigure');
        res.json({success: true});
    });
});

// 3. VIP Bypass (IPs Liberados)
const VIP_FILE = '/etc/squid/vips.acl';

app.get('/api/proxy/vips', (req, res) => {
    if (!fs.existsSync(VIP_FILE)) return res.json([]);
    
    const content = fs.readFileSync(VIP_FILE, 'utf8');
    const vips = content.split('\n')
        .filter(line => line.trim() !== '' && !line.startsWith('#'))
        .map((line, index) => {
            // Formato esperado: IP # Descrição
            const parts = line.split('#');
            return {
                id: index,
                ip: parts[0].trim(),
                description: parts[1] ? parts[1].trim() : 'Sem descrição'
            };
        });
    res.json(vips);
});

app.post('/api/proxy/vips', (req, res) => {
    const { ip, desc } = req.body;
    const line = `${ip} # ${desc || ''}\n`;
    fs.appendFile(VIP_FILE, line, () => {
        exec('squid -k reconfigure');
        res.json({success: true});
    });
});

app.post('/api/proxy/vips/delete', (req, res) => {
    // Simples: Lê tudo, filtra o ID (ou IP) e salva de novo.
    // Implementação simplificada por IP para este exemplo
    // (Num sistema real, usaríamos IDs persistentes)
    res.json({success: true, message: "Delete implementado na próxima versão"}); 
});

// 4. Clientes Ativos (Real via ARP)
app.get('/api/proxy/active-clients', async (req, res) => {
    const arp = await runCmd('arp -a');
    const clients = arp.split('\n').map(line => {
        const parts = line.split(' ');
        const ip = parts[1] ? parts[1].replace(/[()]/g, '') : null;
        return ip ? { client_ip: ip } : null;
    }).filter(c => c && c.client_ip.includes('.')); 
    res.json(clients);
});

// 5. Logs (Real)
app.get('/api/proxy/logs', (req, res) => {
    exec('tail -n 50 /var/log/squid/access.log', (err, stdout) => {
        if (!stdout) return res.json([]);
        const logs = stdout.split('\n').filter(l => l).map(line => {
            const p = line.split('::|::');
            if (p.length < 5) return null;
            return {
                timestamp: parseFloat(p[0]) * 1000,
                client_ip: p[1],
                url: p[4] !== '-' ? p[4] : (p[3] || 'Site'),
                action: p[5]?.split('/')[0] || 'INFO'
            };
        }).filter(Boolean).reverse();
        res.json(logs);
    });
});

// 6. Regras (ACLs)
const RULES = {
    bloqueados: '/etc/squid/bloqueados.acl',
    permitidos: '/etc/squid/permitidos.acl',
    bancos: '/etc/squid/splice_whitelist.acl'
};

app.get('/api/rules/:type', (req, res) => {
    const f = RULES[req.params.type];
    if(f && fs.existsSync(f)) 
        res.json(fs.readFileSync(f, 'utf8').split('\n').filter(l=>l.trim()));
    else res.json([]);
});

app.post('/api/rules/:type', (req, res) => {
    const f = RULES[req.params.type];
    if(f) {
        fs.writeFile(f, req.body.domains.join('\n'), () => {
            exec('squid -k reconfigure');
            res.json({success: true});
        });
    } else res.status(400).json({});
});

// 7. Certificado
app.get('/api/cert/download', (req, res) => {
    const f = '/root/certificado_becker_proxy.der';
    if(fs.existsSync(f)) res.download(f); else res.status(404).send('404');
});

// Outros
app.get('/api/proxy/status', (req, res) => res.json({status: 'running'}));

// PING
app.get('/api/ping', (req, res) => res.json({status:'OK'}));

app.listen(PORT, '0.0.0.0', () => console.log('🚀 Backend REAL rodando na 6779'));
