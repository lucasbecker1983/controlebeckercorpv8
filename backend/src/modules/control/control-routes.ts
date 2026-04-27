import { Router } from 'express';
import { execCmd } from '../../utils/sys';
import { env } from '../../config/env';
import { pool } from '../../config/db';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

const router = Router();

const ALLOWED_SERVICES = [
    'squid', 'postgresql', 'nginx', 'ufw', 'ssh',
    'fail2ban', env.wireguardService, 'isc-dhcp-server', 'smbd', 'unbound',
    'clamav-daemon', 'clamav-freshclam', 'clamav-clamonacc'
];

const CLAMAV_SCAN_PATHS = [
    env.cftvMount,
    env.nextcloudMount,
].filter(Boolean);
const CLAMAV_ALLOWED_SCAN_ROOTS = [
    env.projectRoot,
    env.cftvMount,
    env.nextcloudMount,
].filter(Boolean);
const CLAMAV_QUARANTINE_DIR = '/root/quarantine';
let clamavScanPromise: Promise<void> | null = null;

type ClamExecResult = {
    code: number;
    stdout: string;
    stderr: string;
};

const execClam = (command: string, args: string[]) => new Promise<ClamExecResult>((resolve, reject) => {
    execFile(command, args, { timeout: 30 * 60 * 1000, maxBuffer: 32 * 1024 * 1024 }, (error: any, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
            reject(error);
            return;
        }

        resolve({
            code: typeof error?.code === 'number' ? error.code : 0,
            stdout: String(stdout || ''),
            stderr: String(stderr || ''),
        });
    });
});

async function ensureAntimalwareSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS control_antimalware_runs (
            id BIGSERIAL PRIMARY KEY,
            action TEXT NOT NULL,
            target_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
            status TEXT NOT NULL DEFAULT 'completed',
            success BOOLEAN NOT NULL DEFAULT FALSE,
            infected_files INTEGER NOT NULL DEFAULT 0,
            output TEXT,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            finished_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_control_antimalware_runs_created_at
            ON control_antimalware_runs(created_at DESC);
        ALTER TABLE control_antimalware_runs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';
        ALTER TABLE control_antimalware_runs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
        ALTER TABLE control_antimalware_runs ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

        CREATE TABLE IF NOT EXISTS control_antimalware_findings (
            id BIGSERIAL PRIMARY KEY,
            run_id BIGINT NOT NULL REFERENCES control_antimalware_runs(id) ON DELETE CASCADE,
            file_path TEXT NOT NULL,
            signature TEXT,
            decision_status TEXT NOT NULL DEFAULT 'pending',
            decided_action TEXT,
            decided_by TEXT,
            decision_notes TEXT,
            quarantined_path TEXT,
            decided_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_control_antimalware_findings_created_at
            ON control_antimalware_findings(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_control_antimalware_findings_status
            ON control_antimalware_findings(decision_status, created_at DESC);
    `);
}

async function recordAntimalwareRun(payload: {
    action: string;
    targetPaths?: string[];
    status?: string;
    success: boolean;
    infectedFiles?: number;
    output?: string;
    findings?: Array<{ filePath: string; signature: string | null }>;
    startedAt?: string | Date;
    finishedAt?: string | Date | null;
}) {
    await ensureAntimalwareSchema();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const runResult = await client.query(
            `INSERT INTO control_antimalware_runs (action, target_paths, status, success, infected_files, output, started_at, finished_at)
             VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
                payload.action,
                JSON.stringify(payload.targetPaths || []),
                payload.status || 'completed',
                payload.success,
                payload.infectedFiles || 0,
                payload.output || null,
                payload.startedAt || new Date().toISOString(),
                payload.finishedAt || null,
            ],
        );
        const runId = Number(runResult.rows[0]?.id || 0);
        for (const finding of payload.findings || []) {
            await client.query(
                `INSERT INTO control_antimalware_findings (run_id, file_path, signature)
                 VALUES ($1, $2, $3)`,
                [runId, finding.filePath, finding.signature || null],
            );
        }
        await client.query('COMMIT');
        return runId;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function updateAntimalwareRun(runId: number, payload: {
    status: string;
    success: boolean;
    infectedFiles?: number;
    output?: string;
    findings?: Array<{ filePath: string; signature: string | null }>;
}) {
    await ensureAntimalwareSchema();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `UPDATE control_antimalware_runs
             SET status = $2,
                 success = $3,
                 infected_files = $4,
                 output = $5,
                 finished_at = NOW()
             WHERE id = $1`,
            [runId, payload.status, payload.success, payload.infectedFiles || 0, payload.output || null],
        );
        await client.query(`DELETE FROM control_antimalware_findings WHERE run_id = $1`, [runId]);
        for (const finding of payload.findings || []) {
            await client.query(
                `INSERT INTO control_antimalware_findings (run_id, file_path, signature)
                 VALUES ($1, $2, $3)`,
                [runId, finding.filePath, finding.signature || null],
            );
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

const parseInfectedFiles = (output: string) => Number(output.match(/Infected files:\s*(\d+)/i)?.[1] || 0);
const parseScannedFiles = (output: string) => Number(output.match(/Scanned files:\s*(\d+)/i)?.[1] || 0);
const parseFindings = (output: string) => output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('FOUND'))
    .map((line) => {
        const match = line.match(/^(.*?):\s+(.+?)\s+FOUND$/);
        return {
            filePath: match?.[1]?.trim() || line,
            signature: match?.[2]?.trim() || null,
        };
    });

const moveToQuarantine = async (filePath: string) => {
    await fs.promises.mkdir(CLAMAV_QUARANTINE_DIR, { recursive: true });
    const safeName = `${Date.now()}-${path.basename(filePath)}`;
    const targetPath = path.join(CLAMAV_QUARANTINE_DIR, safeName);
    try {
        await fs.promises.rename(filePath, targetPath);
    } catch (error: any) {
        if (error?.code !== 'EXDEV') throw error;
        await fs.promises.copyFile(filePath, targetPath);
        await fs.promises.unlink(filePath);
    }
    return targetPath;
};

const resolveRequestedScanPaths = (rawPaths: unknown) => {
    const requested = Array.isArray(rawPaths)
        ? rawPaths.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
    if (!requested.length) return CLAMAV_SCAN_PATHS;
    return requested.filter((candidate) => CLAMAV_ALLOWED_SCAN_ROOTS.some((allowed) => candidate === allowed || candidate.startsWith(`${allowed}/`)));
};

async function hasRunningClamdscanProcess() {
    const result = await execClam('bash', ['-lc', "pgrep -fa 'clamdscan --multiscan --fdpass'"]);
    return result.code === 0 && Boolean(result.stdout.trim());
}

async function getRunningAntimalwareRun() {
    await ensureAntimalwareSchema();
    const result = await pool.query(
        `SELECT id, action, target_paths, status, success, infected_files, output, started_at, finished_at, created_at
         FROM control_antimalware_runs
         WHERE status = 'running'
         ORDER BY started_at DESC
         LIMIT 1`,
    );
    return result.rows[0] || null;
}

async function reconcileRunningAntimalwareRun() {
    const runningRun = await getRunningAntimalwareRun();
    if (!runningRun) return null;
    if (clamavScanPromise) return runningRun;
    const processRunning = await hasRunningClamdscanProcess();
    if (processRunning) return runningRun;

    await updateAntimalwareRun(Number(runningRun.id), {
        status: 'failed',
        success: false,
        infectedFiles: Number(runningRun.infected_files || 0),
        output: String(runningRun.output || 'Varredura anterior interrompida antes da conclusão.'),
        findings: [],
    });
    return null;
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
            `SELECT id, action, target_paths, status, success, infected_files, output, started_at, finished_at, created_at
             FROM control_antimalware_runs
             ORDER BY created_at DESC
             LIMIT 8`,
        );
        const findings = await pool.query(
            `SELECT id, run_id, file_path, signature, decision_status, decided_action, decided_by, decision_notes, quarantined_path, decided_at, created_at, updated_at
             FROM control_antimalware_findings
             ORDER BY created_at DESC
             LIMIT 30`,
        );
        const runningRun = await reconcileRunningAntimalwareRun();

        res.json({
            services: {
                daemon: daemon.trim(),
                freshclam: freshclam.trim(),
                clamonacc: clamonacc.trim(),
            },
            healthy: [daemon, freshclam, clamonacc].every((item) => item.trim() === 'active'),
            coverage: [
                { label: 'VLAN 10', subnet: '192.168.10.0/24', scope: 'borda e serviços vinculados ao gateway' },
                { label: 'VLAN 30', subnet: '192.168.30.0/24', scope: 'borda e serviços vinculados ao gateway' },
                { label: 'VLAN 50', subnet: '192.168.50.0/24', scope: 'borda e serviços vinculados ao gateway' },
                { label: 'VLAN 70', subnet: '192.168.70.0/24', scope: 'borda e serviços vinculados ao gateway' },
            ],
            scan_paths: CLAMAV_SCAN_PATHS,
            recent_runs: recentRuns.rows,
            findings: findings.rows,
            running_scan: runningRun,
            supported_decisions: ['quarantine', 'delete'],
            unsupported_decisions: [{ action: 'clean', reason: 'ClamAV não oferece desinfecção genérica confiável para esta superfície operacional.' }],
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Falha ao consultar ClamAV.' });
    }
});

router.post('/clamav/findings/:id/decision', async (req, res) => {
    try {
        await ensureAntimalwareSchema();
        const findingId = Number(req.params.id);
        const action = String(req.body?.action || '').trim().toLowerCase();
        const decidedBy = String(req.body?.decided_by || req.body?.requested_by || 'operador');
        const decisionNotes = String(req.body?.notes || '').trim() || null;

        if (!Number.isFinite(findingId) || findingId <= 0) {
            return res.status(400).json({ error: 'Achado inválido.' });
        }

        if (action === 'clean') {
            return res.status(400).json({ error: 'Limpeza automática indisponível: o ClamAV não oferece desinfecção genérica confiável neste fluxo. Use quarentena ou exclusão.' });
        }

        if (!['quarantine', 'delete'].includes(action)) {
            return res.status(400).json({ error: 'Ação de decisão inválida.' });
        }

        const findingResult = await pool.query(
            `SELECT * FROM control_antimalware_findings WHERE id = $1`,
            [findingId],
        );
        const finding = findingResult.rows[0];
        if (!finding) {
            return res.status(404).json({ error: 'Achado não encontrado.' });
        }
        if (finding.decision_status !== 'pending') {
            return res.status(409).json({ error: 'Este achado já recebeu decisão.' });
        }

        const currentPath = String(finding.file_path || '');
        const exists = currentPath ? fs.existsSync(currentPath) : false;
        if (!exists) {
            await pool.query(
                `UPDATE control_antimalware_findings
                 SET decision_status = 'missing',
                     decided_action = $2,
                     decided_by = $3,
                     decision_notes = $4,
                     decided_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $1`,
                [findingId, action, decidedBy, decisionNotes || 'Arquivo não encontrado no momento da decisão.'],
            );
            return res.status(410).json({ error: 'Arquivo não encontrado para decisão.' });
        }

        let quarantinedPath: string | null = null;
        if (action === 'quarantine') {
            quarantinedPath = await moveToQuarantine(currentPath);
        }
        if (action === 'delete') {
            await fs.promises.unlink(currentPath);
        }

        await pool.query(
            `UPDATE control_antimalware_findings
             SET decision_status = $2,
                 decided_action = $3,
                 decided_by = $4,
                 decision_notes = $5,
                 quarantined_path = $6,
                 decided_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [findingId, action === 'quarantine' ? 'quarantined' : 'deleted', action, decidedBy, decisionNotes, quarantinedPath],
        );

        return res.json({
            success: true,
            finding_id: findingId,
            action,
            quarantined_path: quarantinedPath,
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Falha ao decidir sobre o achado antimalware.' });
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
            const result = await execClam('sudo', ['freshclam', '--stdout']);
            const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
            if (result.code > 1) {
                throw new Error(output || 'Falha ao atualizar assinaturas do ClamAV.');
            }
            await recordAntimalwareRun({
                action,
                success: result.code === 0,
                targetPaths: [],
                output,
            });
            return res.json({ success: true, action, output });
        }
        if (action === 'clamav_scan') {
            const targetPaths = resolveRequestedScanPaths(req.body?.target_paths);
            if (!targetPaths.length) {
                return res.status(400).json({ error: 'Nenhum caminho autorizado foi informado para a varredura.' });
            }
            const runningRun = await reconcileRunningAntimalwareRun();
            if (clamavScanPromise || runningRun) {
                return res.status(409).json({
                    error: 'Já existe uma varredura antimalware em execução.',
                    running: true,
                    run_id: Number(runningRun?.id || 0) || null,
                });
            }
            const runId = await recordAntimalwareRun({
                action,
                status: 'running',
                success: false,
                infectedFiles: 0,
                targetPaths,
                output: 'Varredura em execução.',
                startedAt: new Date().toISOString(),
                finishedAt: null,
            });
            clamavScanPromise = (async () => {
                try {
                    const result = await execClam('sudo', ['clamdscan', '--multiscan', '--fdpass', ...targetPaths]);
                    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
                    const infectedFiles = parseInfectedFiles(output);
                    const findings = parseFindings(output);
                    const commandFailed = result.code > 1;
                    await updateAntimalwareRun(runId, {
                        status: commandFailed ? 'failed' : infectedFiles > 0 ? 'completed-with-findings' : 'completed',
                        success: !commandFailed,
                        infectedFiles,
                        output,
                        findings,
                    });
                } catch (error: any) {
                    await updateAntimalwareRun(runId, {
                        status: 'failed',
                        success: false,
                        infectedFiles: 0,
                        output: error?.message || 'Falha ao executar varredura antimalware.',
                        findings: [],
                    }).catch(() => null);
                } finally {
                    clamavScanPromise = null;
                }
            })();
            return res.status(202).json({
                success: true,
                queued: true,
                run_id: runId,
                action,
                target_paths: targetPaths,
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
