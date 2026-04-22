#!/bin/bash
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}>>> [SÊNIOR] CORRIGINDO O MOTOR DE STATUS DE SERVIÇOS...${NC}"

BACKEND_DIR=$(node -e "try { const p = require('child_process').execSync('pm2 jlist', {encoding:'utf8', stdio:'pipe'}); const app = JSON.parse(p).find(a => a.name === 'bcc-backend'); if(app) console.log(app.pm2_env.pm_cwd); } catch(e) {}")
if [[ "$BACKEND_DIR" == *"/dist"* ]] || [[ "$BACKEND_DIR" == *"/build"* ]]; then BACKEND_DIR=$(dirname "$BACKEND_DIR"); fi
if [ -z "$BACKEND_DIR" ]; then BACKEND_DIR=$(find /opt /var/www /root -maxdepth 3 -type d -name "bcc-backend" | head -n 1); fi

CONTROL_FILE="$BACKEND_DIR/src/modules/control/control-routes.ts"

echo -e "${YELLOW}>>> REESCREVENDO control-routes.ts...${NC}"

cat > "$CONTROL_FILE" << 'EOF'
import { Router } from 'express';
import { execCmd } from '../../utils/sys';
import { Pool } from 'pg';

const router = Router();
const pool = new Pool({ connectionString: 'postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8' });

const ALLOWED_SERVICES = [
    'squid', 'postgresql', 'nginx', 'ufw', 'ssh',
    'fail2ban', 'wg-quick@wg0', 'isc-dhcp-server', 'smbd', 'unbound'
];

// --- STATUS DOS SERVIÇOS (REFATORADO PADRÃO OURO) ---
router.get('/services', async (req, res) => {
    const svcs = [
        { name: 'squid', label: 'Proxy Squid' },
        { name: 'postgresql', label: 'Banco de Dados' },
        { name: 'nginx', label: 'Servidor Web' },
        { name: 'ufw', label: 'Firewall UFW' },
        { name: 'ssh', label: 'Acesso SSH' },
        { name: 'fail2ban', label: 'Intrusion Prev.' },
        { name: 'wg-quick@wg0', label: 'VPN WireGuard' },
        { name: 'isc-dhcp-server', label: 'Servidor DHCP' },
        { name: 'smbd', label: 'Compartilhamento' },
        { name: 'unbound', label: 'DNS Unbound' }
    ];
    
    const result: any[] = [];
    
    for (const s of svcs) {
        try {
            // Comando cirúrgico: Retorna 'active', 'inactive', 'failed' sem dar exit code de erro
            const rawOutput = await execCmd(`systemctl show -p ActiveState --value ${s.name}`);
            
            // .trim() remove o \n fantasma que quebrava a lógica do React
            const state = rawOutput.trim().toLowerCase();
            
            result.push({ 
                ...s, 
                // O Frontend visual do MD3 geralmente espera a palavra "active" para ficar verde
                status: state === 'active' ? 'active' : 'stopped' 
            });
        } catch (error) { 
            console.error(`Erro ao ler status de ${s.name}:`, error);
            // Se o comando em si falhar, forçamos 'stopped' para não bugar a tela
            result.push({ ...s, status: 'stopped' }); 
        }
    }
    res.json(result);
});

// --- AÇÕES INDIVIDUAIS NOS SERVIÇOS ---
router.post('/service-action', async (req, res) => {
    const { service, action } = req.body;

    if (!ALLOWED_SERVICES.includes(service)) {
        return res.status(403).json({ error: "Acesso negado a este serviço." });
    }
    if (!['start', 'stop', 'restart'].includes(action)) {
        return res.status(400).json({ error: "Ação inválida." });
    }

    try {
        await execCmd(`sudo systemctl ${action} ${service}`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: `Falha ao executar ${action} em ${service}` });
    }
});

// --- COMANDOS TÁTICOS GLOBAIS ---
router.post('/tactical', async (req, res) => {
    const { action } = req.body;
    try {
        if (action === 'firewall_reset') await execCmd("ufw reset && ufw enable");
        if (action === 'fail2ban_unlock') await execCmd("fail2ban-client unban --all");
        if (action === 'dhcp_restart') await execCmd("systemctl restart isc-dhcp-server");
        if (action === 'db_restart') await execCmd("systemctl restart postgresql");
        if (action === 'clear_cache') await execCmd("sync && sysctl -w vm.drop_caches=3");
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: "Comando tático falhou" }); }
});

export default router;
EOF

echo -e "${YELLOW}>>> LIMPANDO CACHE E COMPILANDO TYPESCRIPT...${NC}"
cd "$BACKEND_DIR" || exit
rm -rf dist/ build/
npm run build > /dev/null 2>&1

echo -e "${YELLOW}>>> REINICIANDO O MOTOR NO PM2...${NC}"
pm2 restart bcc-backend > /dev/null 2>&1

echo -e "${GREEN}>>> STATUS EM TEMPO REAL ATIVADO! NUNCA MAIS O PAINEL VAI MENTIR. <<<${NC}"
