import { Router } from 'express';
import { execCmd } from '../../utils/sys';
import { env } from '../../config/env';

const router = Router();

const ALLOWED_SERVICES = [
    'squid', 'postgresql', 'nginx', 'ufw', 'ssh',
    'fail2ban', env.wireguardService, 'isc-dhcp-server', 'smbd', 'unbound'
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
        { name: env.wireguardService, label: 'VPN WireGuard' },
        { name: 'isc-dhcp-server', label: 'Servidor DHCP' },
        { name: 'smbd', label: 'Compartilhamento' },
        { name: 'unbound', label: 'DNS Unbound' }
    ];
    
    const result: any[] = [];
    
    for (const s of svcs) {
        try {
            // Utilizamos 'is-active' com fallback '|| true' para prevenir o lançamento de exceções pelo exit code > 0 do systemctl
            const stdout = await execCmd(`systemctl is-active ${s.name} || echo "inactive"`);
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
        await execCmd(`sudo systemctl ${action} ${service}`);
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
        if (action === 'firewall_reset') { await execCmd('sudo ufw --force reset'); await execCmd('sudo ufw enable'); }
        if (action === 'fail2ban_unlock') await execCmd('sudo fail2ban-client unban --all');
        if (action === 'dhcp_restart') await execCmd('sudo systemctl restart isc-dhcp-server');
        if (action === 'db_restart') await execCmd('sudo systemctl restart postgresql');
        if (action === 'clear_cache') { await execCmd('sync'); await execCmd('sudo sysctl -w vm.drop_caches=3'); }
        res.json({ success: true });
    } catch(e: any) { 
        console.error(`[API CONTROL] Falha na execução tática:`, e.message);
        res.status(500).json({ error: "Comando tático falhou" }); 
    }
});

export default router;
