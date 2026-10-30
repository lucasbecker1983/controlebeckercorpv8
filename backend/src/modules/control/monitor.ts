import { execCmd } from '../../utils/sys';
import { sendAlert } from '../../utils/mailer';
import { sendTelegram } from '../../utils/telegram';
import { pool } from '../../config/db';

// Serviços do systemd. O postgresql@18-main é a instância do banco: o "postgresql" puro é só uma casca que
// continua "ativa" mesmo com o banco caído.
const CRITICAL_SERVICES = [
    'squid', 'postgresql@18-main', 'nginx', 'ufw', 'ssh',
    'fail2ban', 'wg-quick@wg0', 'isc-dhcp-server', 'unbound',
    'clamav-daemon', 'clamav-freshclam', 'clamav-clamonacc',
    'redis-server', 'docker', 'tailscaled', 'NetworkManager', 'sgcg-vip-dns',
];

// Processos do pm2 que fazem parte do SGCG. O bcc-backend não entra: se ele cair, quem avisa é o vigia
// independente (scripts/sgcg-watchdog.sh), porque o próprio Sentinela morre junto.
const PM2_SERVICES = ['backend-proxy', 'backend-proxy-ingester', 'bcc-frontend'];
const PM2_PREFIX = 'pm2:';

const CHECK_INTERVAL = 2 * 60 * 1000;     // 2 Minutos
const REMINDER_INTERVAL = 3 * 60 * 60 * 1000; // 3 Horas

export const startMonitor = async () => {
    console.log(`>>> [IA SENTINEL] Vigilância Iniciada (Check: 2m | Reminder: 3h)`);
    
    // Executa a primeira checagem 30s após o boot para dar tempo dos serviços subirem
    setTimeout(checkServices, 30000);

    // Loop Infinito
    setInterval(checkServices, CHECK_INTERVAL);
};

async function checkServices() {
    console.log(`[IA SENTINEL] Executando varredura de serviços... ${new Date().toISOString()}`);
    
    const pm2Online = await readPm2Online();

    for (const svc of [...CRITICAL_SERVICES, ...PM2_SERVICES.map((name) => `${PM2_PREFIX}${name}`)]) {
        try {
            // 1. Checa estado atual
            let currentStatus = 'stopped';
            if (svc.startsWith(PM2_PREFIX)) {
                // Se não deu para ler o pm2, não afirma nada: mantém o estado anterior em vez de dar alarme falso.
                if (!pm2Online) continue;
                currentStatus = pm2Online.has(svc.slice(PM2_PREFIX.length)) ? 'running' : 'stopped';
            } else {
                try {
                    const statusRaw = await execCmd(`systemctl is-active ${svc}`);
                    currentStatus = statusRaw.trim() === 'active' ? 'running' : 'stopped';
                } catch {}
            }

            // 2. Busca estado anterior no banco
            const dbRes = await pool.query("SELECT last_status, last_alert_sent FROM sys_service_status WHERE service_name=$1", [svc]);
            
            const lastStatus = dbRes.rows[0]?.last_status || 'running'; // Assume running se não existir para evitar falso positivo no boot
            const lastAlert = dbRes.rows[0]?.last_alert_sent ? new Date(dbRes.rows[0].last_alert_sent).getTime() : 0;
            const now = Date.now();

            // 3. Lógica de Decisão
            
            // CASO A: Serviço acabou de cair
            if (currentStatus === 'stopped' && lastStatus === 'running') {
                console.log(`[IA SENTINEL] 🚨 FALHA DETECTADA: ${svc}`);
                await sendAlert(
                    `FALHA DETECTADA: ${svc}`, 
                    `O serviço ${svc} parou de responder inesperadamente.\nVerifique os logs imediatamente.`
                );
                
                // Atualiza banco com status parado e hora do alerta
                await updateStatus(svc, 'stopped', true);
            }
            
            // CASO B: Serviço continua parado por muito tempo (Reminder 3h)
            else if (currentStatus === 'stopped' && lastStatus === 'stopped') {
                if ((now - lastAlert) > REMINDER_INTERVAL) {
                    console.log(`[IA SENTINEL] ⏳ FALHA PERSISTENTE: ${svc}`);
                    await sendAlert(
                        `FALHA PERSISTENTE: ${svc}`, 
                        `ATENÇÃO: O serviço ${svc} continua parado há mais de 3 horas.\nAção manual urgente necessária.`,
                        true // isReminder
                    );
                    
                    // Atualiza apenas a hora do alerta
                    await updateStatus(svc, 'stopped', true);
                }
            }
            
            // CASO C: Serviço voltou (Recuperação)
            else if (currentStatus === 'running' && lastStatus === 'stopped') {
                console.log(`[IA SENTINEL] ✅ RECUPERADO: ${svc}`);
                await sendTelegram(`✅ RECUPERADO: ${svc}\n\nO serviço ${svc} voltou a operar normalmente.`);
                await updateStatus(svc, 'running', false);
            }
            
            // CASO D: Tudo normal (Running -> Running), apenas update timestamp
            else {
                await updateStatus(svc, currentStatus, false);
            }

        } catch (e) { console.error(`[IA ERROR] Falha ao checar ${svc}`, e); }
    }
}

/** Nomes dos processos do pm2 que estão "online"; null se não foi possível ler a lista. */
async function readPm2Online(): Promise<Set<string> | null> {
    try {
        const raw = await execCmd('pm2 jlist');
        const start = raw.indexOf('[');
        if (start < 0) return null;
        const list = JSON.parse(raw.slice(start)) as Array<{ name: string; pm2_env?: { status?: string } }>;
        return new Set(list.filter((p) => p.pm2_env?.status === 'online').map((p) => p.name));
    } catch {
        return null;
    }
}

async function updateStatus(svc: string, status: string, updateAlertTime: boolean) {
    if (updateAlertTime) {
        await pool.query(
            "INSERT INTO sys_service_status (service_name, last_status, last_checked, last_alert_sent) VALUES ($1, $2, NOW(), NOW()) ON CONFLICT (service_name) DO UPDATE SET last_status=$2, last_checked=NOW(), last_alert_sent=NOW()", 
            [svc, status]
        );
    } else {
        await pool.query(
            "INSERT INTO sys_service_status (service_name, last_status, last_checked) VALUES ($1, $2, NOW()) ON CONFLICT (service_name) DO UPDATE SET last_status=$2, last_checked=NOW()", 
            [svc, status]
        );
    }
}
