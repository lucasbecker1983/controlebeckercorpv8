import { Router } from 'express';
import { execCmd } from '../../utils/sys';
import { env } from '../../config/env';
import { pool } from '../../config/db';

const router = Router();

const ALLOWED_SERVICES = [
    'squid', 'postgresql', 'nginx', 'ufw', 'ssh',
    'fail2ban', env.wireguardService, 'isc-dhcp-server', 'smbd', 'unbound',
    'clamav-daemon', 'clamav-freshclam', 'clamav-clamonacc'
];

const CLAMAV_SCAN_PATHS = [
    env.projectRoot,
    env.cftvMount,
    env.nextcloudMount,
].filter(Boolean);

async function ensureAntimalwareSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS control_antimalware_runs (
            id BIGSERIAL PRIMARY KEY,
            action TEXT NOT NULL,
            target_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
            success BOOLEAN NOT NULL DEFAULT FALSE,
            infected_files INTEGER NOT NULL DEFAULT 0,
            output TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_control_antimalware_runs_created_at
            ON control_antimalware_runs(created_at DESC);
    `);
}

async function recordAntimalwareRun(payload: {
    action: string;
    targetPaths?: string[];
    success: boolean;
    infectedFiles?: number;
    output?: string;
}) {
    await ensureAntimalwareSchema();
    await pool.query(
        `INSERT INTO control_antimalware_runs (action, target_paths, success, infected_files, output)
         VALUES ($1, $2::jsonb, $3, $4, $5)`,
        [
            payload.action,
            JSON.stringify(payload.targetPaths || []),
            payload.success,
            payload.infectedFiles || 0,
            payload.output || null,
        ],
    );
}

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
        { name: 'unbound', label: 'DNS Unbound' },
        { name: 'clamav-daemon', label: 'ClamAV Daemon' },
        { name: 'clamav-freshclam', label: 'Assinaturas ClamAV' },
        { name: 'clamav-clamonacc', label: 'Monitor de Acesso' }
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

router.get('/clamav', async (_req, res) => {
    try {
        await ensureAntimalwareSchema();
        const daemon = await execCmd('systemctl is-active clamav-daemon || echo "inactive"');
        const freshclam = await execCmd('systemctl is-active clamav-freshclam || echo "inactive"');
        const clamonacc = await execCmd('systemctl is-active clamav-clamonacc || echo "inactive"');
        const recentRuns = await pool.query(
            `SELECT id, action, target_paths, success, infected_files, output, created_at
             FROM control_antimalware_runs
             ORDER BY created_at DESC
             LIMIT 8`,
        );

        res.json({
            services: {
                daemon: daemon.trim(),
                freshclam: freshclam.trim(),
                clamonacc: clamonacc.trim(),
            },
            coverage: [
                { label: 'VLAN 10', subnet: '192.168.10.0/24', scope: 'borda e serviços vinculados ao gateway' },
                { label: 'VLAN 30', subnet: '192.168.30.0/24', scope: 'borda e serviços vinculados ao gateway' },
                { label: 'VLAN 50', subnet: '192.168.50.0/24', scope: 'borda e serviços vinculados ao gateway' },
                { label: 'VLAN 70', subnet: '192.168.70.0/24', scope: 'borda e serviços vinculados ao gateway' },
            ],
            scan_paths: CLAMAV_SCAN_PATHS,
            recent_runs: recentRuns.rows,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Falha ao consultar ClamAV.' });
    }
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
        if (action === 'clamav_update') {
            const output = await execCmd('sudo freshclam --stdout');
            await recordAntimalwareRun({
                action,
                success: true,
                targetPaths: [],
                output,
            });
        }
        if (action === 'clamav_scan') {
            const targetPaths = CLAMAV_SCAN_PATHS;
            const output = await execCmd(`sudo clamscan -ri --max-filesize=256M --max-scansize=512M ${targetPaths.join(' ')}`);
            const infectedMatch = output.match(/Infected files:\s*(\d+)/i);
            const infectedFiles = Number(infectedMatch?.[1] || 0);
            await recordAntimalwareRun({
                action,
                success: infectedFiles === 0,
                infectedFiles,
                targetPaths,
                output,
            });
        }
        res.json({ success: true });
    } catch(e: any) { 
        console.error(`[API CONTROL] Falha na execução tática:`, e.message);
        if (action === 'clamav_update' || action === 'clamav_scan') {
            await recordAntimalwareRun({
                action,
                success: false,
                targetPaths: action === 'clamav_scan' ? CLAMAV_SCAN_PATHS : [],
                output: e.message,
            }).catch(() => null);
        }
        res.status(500).json({ error: "Comando tático falhou" }); 
    }
});

export default router;
