#!/bin/bash
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}>>> [Engenharia] INJETANDO TELEMETRIA NO CONTROLLER DE SERVIÇOS...${NC}"

BACKEND_DIR=$(node -e "try { const p = require('child_process').execSync('pm2 jlist', {encoding:'utf8', stdio:'pipe'}); const app = JSON.parse(p).find(a => a.name === 'bcc-backend'); if(app) console.log(app.pm2_env.pm_cwd); } catch(e) {}")
if [[ "$BACKEND_DIR" == *"/dist"* ]] || [[ "$BACKEND_DIR" == *"/build"* ]]; then BACKEND_DIR=$(dirname "$BACKEND_DIR"); fi
if [ -z "$BACKEND_DIR" ]; then BACKEND_DIR=$(find /opt /var/www /root -maxdepth 3 -type d -name "bcc-backend" | head -n 1); fi

CONTROL_FILE="$BACKEND_DIR/src/modules/control/control-routes.ts"

cat > "$CONTROL_FILE" << 'EOF'
import { Router } from 'express';
import { exec } from 'child_process';
import util from 'util';
import { Pool } from 'pg';

const router = Router();
const execAsync = util.promisify(exec);
const pool = new Pool({ connectionString: 'postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8' });

const ALLOWED_SERVICES = [
    'squid', 'postgresql', 'nginx', 'ufw', 'ssh',
    'fail2ban', 'wg-quick@wg0', 'isc-dhcp-server', 'smbd', 'unbound'
];

// --- STATUS DOS SERVIÇOS EM TEMPO REAL COM TELEMETRIA ---
router.get('/services', async (req, res) => {
    console.log(`[API CONTROL] Interceptada requisição GET /services a partir do IP: ${req.ip}`);
    
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
            // Utilizamos 'is-active' com fallback '|| true' para prevenir o lançamento de exceções pelo exit code > 0 do systemctl
            const { stdout } = await execAsync(`systemctl is-active ${s.name} || echo "inactive"`);
            const state = stdout.trim().toLowerCase();
            
            // Log de auditoria para cada iteração do loop
            console.log(`[TELEMETRIA] systemctl status [${s.name}]: stdout -> '${state}'`);
            
            // Mapeamento do payload. Garantimos as chaves 'status' e 'active' para suportar diferentes schemas de frontend
            const isActive = state === 'active';
            result.push({ 
                ...s, 
                status: isActive ? 'active' : 'stopped',
                active: isActive,
                state: state
            });
        } catch (error: any) { 
            console.error(`[CRÍTICO] Falha no processamento do subprocesso para ${s.name}:`, error.message);
            result.push({ ...s, status: 'error', active: false }); 
        }
    }
    
    console.log(`[API CONTROL] Payload de resposta construído com sucesso. Transmitindo ${result.length} nós.`);
    res.json(result);
});

// --- AÇÕES INDIVIDUAIS ---
router.post('/service-action', async (req, res) => {
    const { service, action } = req.body;

    if (!ALLOWED_SERVICES.includes(service)) return res.status(403).json({ error: "Acesso negado." });
    if (!['start', 'stop', 'restart'].includes(action)) return res.status(400).json({ error: "Ação inválida." });

    try {
        await execAsync(`sudo systemctl ${action} ${service}`);
        res.json({ success: true });
    } catch (e: any) {
        console.error(`[API CONTROL] Falha na execução da mutation:`, e.message);
        res.status(500).json({ error: `Falha ao executar ${action} em ${service}` });
    }
});

// --- COMANDOS TÁTICOS GLOBAIS ---
router.post('/tactical', async (req, res) => {
    const { action } = req.body;
    try {
        if (action === 'firewall_reset') await execAsync("sudo ufw --force reset && sudo ufw enable");
        if (action === 'fail2ban_unlock') await execAsync("sudo fail2ban-client unban --all");
        if (action === 'dhcp_restart') await execAsync("sudo systemctl restart isc-dhcp-server");
        if (action === 'db_restart') await execAsync("sudo systemctl restart postgresql");
        if (action === 'clear_cache') await execAsync("sync && sudo sysctl -w vm.drop_caches=3");
        res.json({ success: true });
    } catch(e: any) { 
        console.error(`[API CONTROL] Falha na execução tática:`, e.message);
        res.status(500).json({ error: "Comando tático falhou" }); 
    }
});

export default router;
EOF

echo -e "${YELLOW}>>> INICIANDO PIPELINE DE BUILD...${NC}"
cd "$BACKEND_DIR" || exit
rm -rf dist/ build/
npm run build > /dev/null 2>&1

echo -e "${YELLOW}>>> RESTARTANDO INSTÂNCIA NO PM2...${NC}"
pm2 restart bcc-backend > /dev/null 2>&1

echo -e "${GREEN}>>> DEPLOY CONCLUÍDO. TELEMETRIA ATIVADA. <<<${NC}"
