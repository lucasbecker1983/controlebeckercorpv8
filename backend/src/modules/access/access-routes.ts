import { Router } from 'express';
import { execCmd } from '../../utils/sys';
import { pool } from '../../config/db';

const router = Router();

// DEFINIÇÃO EXPLÍCITA DAS REDES (CIDR)
const TARGET_SUBNETS = [
    '192.168.10.0/24', // VLAN 10
    '192.168.30.0/24', // VLAN 30
    '192.168.50.0/24', // VLAN 50
    '192.168.70.0/24'  // VLAN 70
];

// --- HELPER DE BLOQUEIO ---
const enforceBlock = async (type: string, value: string, add: boolean) => {
    const action = add ? '-I' : '-D'; 
    try {
        if (type === 'ip') {
            await execCmd(`sudo iptables ${action} FORWARD -s ${value} -j DROP`);
            await execCmd(`sudo iptables ${action} FORWARD -d ${value} -j DROP`);
        } else if (type === 'mac') {
            await execCmd(`sudo iptables ${action} FORWARD -m mac --mac-source ${value} -j DROP`);
        }
    } catch (e) {}
};

// --- ROTAS CRUD (MANTER IGUAL) ---
router.get('/', async (req, res) => {
    try { const r = await pool.query("SELECT * FROM net_blocklist ORDER BY created_at DESC"); res.json(r.rows); } catch { res.json([]); }
});

router.post('/block', async (req, res) => {
    const { type, value, vendor, reason } = req.body;
    try {
        await pool.query("INSERT INTO net_blocklist (target_type, target_value, vendor, reason) VALUES ($1, $2, $3, $4) ON CONFLICT (target_value) DO NOTHING", [type, value, vendor || 'Manual', reason || 'Admin']);
        await enforceBlock(type, value, true);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Erro Block" }); }
});

router.post('/unblock', async (req, res) => {
    const { id, type, value } = req.body;
    try {
        await pool.query("DELETE FROM net_blocklist WHERE id=$1", [id]);
        await enforceBlock(type, value, false);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Erro Unblock" }); }
});

// --- SCANNER NMAP (AGRESSIVO E PRECISO) ---
router.get('/scan', async (req, res) => {
    console.log("[RADAR] Iniciando varredura NMAP nas subnets...");
    
    try {
        // Monta o comando Nmap
        // -sn: Ping Scan (Não scaneia portas, só descobre hosts) - MUITO RÁPIDO
        // -n: Não resolve DNS (acelera muito)
        // --min-rate 1000: Força envio rápido de pacotes
        const subnetsStr = TARGET_SUBNETS.join(' ');
        const cmd = `sudo nmap -sn -n --min-rate 1000 ${subnetsStr}`;
        
        console.log(`[RADAR] Executando: ${cmd}`);
        const output = await execCmd(cmd);
        
        // Processa a saída do Nmap
        const devices = [];
        const lines = output.split('\n');
        
        let currentIp = null;

        for (const line of lines) {
            // Linha de IP: "Nmap scan report for 192.168.10.50"
            const ipMatch = line.match(/Nmap scan report for (\d+\.\d+\.\d+\.\d+)/);
            if (ipMatch) {
                currentIp = ipMatch[1];
                continue;
            }

            // Linha de MAC: "MAC Address: AA:BB:CC:DD:EE:FF (Samsung Electronics)"
            // Só aparece se tiver root (sudo) e estiver na mesma rede local
            if (currentIp) {
                const macMatch = line.match(/MAC Address: ([0-9A-F:]{17}) \((.*)\)/i);
                if (macMatch) {
                    const mac = macMatch[1];
                    const vendor = macMatch[2];
                    
                    // Identifica a VLAN pelo IP
                    let vlan = 'LAN';
                    if (currentIp.includes('.10.')) vlan = 'VLAN 10';
                    else if (currentIp.includes('.30.')) vlan = 'VLAN 30';
                    else if (currentIp.includes('.50.')) vlan = 'VLAN 50';
                    else if (currentIp.includes('.70.')) vlan = 'VLAN 70';

                    devices.push({
                        ip: currentIp,
                        mac: mac,
                        vendor: vendor,
                        vlan: vlan
                    });
                    currentIp = null; // Reset para próximo host
                }
            }
        }

        // Verifica bloqueios no banco para marcar na lista
        const blockedRes = await pool.query("SELECT target_value FROM net_blocklist");
        const blockedSet = new Set(blockedRes.rows.map(r => r.target_value));

        const result = devices.map(d => ({
            ...d,
            is_blocked: blockedSet.has(d.ip) || blockedSet.has(d.mac)
        }));

        console.log(`[RADAR] Encontrados: ${result.length} dispositivos.`);
        res.json(result);

    } catch (e) {
        console.error("[RADAR] Erro Fatal:", e);
        res.status(500).json({ error: "Falha ao executar Nmap. Verifique se está instalado." });
    }
});

export default router;
