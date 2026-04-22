import { execCmd } from '../../utils/sys';
import { sendAlert } from '../../utils/mailer';
import { pool } from '../../config/db';

const CRITICAL_SERVICES = [
    'squid', 'postgresql', 'nginx', 'ufw', 'ssh', 
    'fail2ban', 'wg-quick@wg0', 'isc-dhcp-server', 'smbd', 'unbound'
];

const CHECK_INTERVAL = 10 * 60 * 1000;    // 10 Minutos
const REMINDER_INTERVAL = 3 * 60 * 60 * 1000; // 3 Horas

export const startMonitor = async () => {
    console.log(`>>> [IA SENTINEL] Vigilância Iniciada (Check: 10m | Reminder: 3h)`);
    
    // Executa a primeira checagem 30s após o boot para dar tempo dos serviços subirem
    setTimeout(checkServices, 30000);

    // Loop Infinito
    setInterval(checkServices, CHECK_INTERVAL);
};

async function checkServices() {
    console.log(`[IA SENTINEL] Executando varredura de serviços... ${new Date().toISOString()}`);
    
    for (const svc of CRITICAL_SERVICES) {
        try {
            // 1. Checa estado atual
            let currentStatus = 'stopped';
            try {
                const statusRaw = await execCmd(`systemctl is-active ${svc}`);
                currentStatus = statusRaw.trim() === 'active' ? 'running' : 'stopped';
            } catch {}

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
                // Opcional: Mandar email de "Voltou ao normal"
                // await sendAlert(`Serviço Recuperado: ${svc}`, `O serviço voltou a operar normalmente.`);
                await updateStatus(svc, 'running', false);
            }
            
            // CASO D: Tudo normal (Running -> Running), apenas update timestamp
            else {
                await updateStatus(svc, currentStatus, false);
            }

        } catch (e) { console.error(`[IA ERROR] Falha ao checar ${svc}`, e); }
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
