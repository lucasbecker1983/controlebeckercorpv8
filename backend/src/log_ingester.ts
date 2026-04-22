import { spawn } from 'child_process';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: 'postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8',
    max: 10,
    idleTimeoutMillis: 30000
});

const LOG_FILE = '/var/log/squid/access.log';
console.log(`>>> [LOGGER v2] Iniciando leitura PIPE de: ${LOG_FILE}`);

const tail = spawn('tail', ['-F', '-n', '0', LOG_FILE]);

tail.stdout.on('data', async (data) => {
    const lines = data.toString().split('\n');
    
    for (const line of lines) {
        if (!line.trim()) continue;

        try {
            // Formato Novo: TIME|SRC_IP|DST_IP|URL|STATUS|METHOD|USER
            const parts = line.split('|');
            
            if (parts.length < 6) continue;

            const timestamp = new Date(parseFloat(parts[0]) * 1000);
            const client_ip = parts[1]; // IP Interno (Origem)
            const dest_ip = parts[2];   // IP Externo (Destino)
            let url = parts[3];         // Site ou SNI
            const status_raw = parts[4];
            const method = parts[5];
            const username = parts[6] && parts[6] !== '-' ? parts[6] : null;

            // TRATAMENTO DE ERRO DE URL (Lógica Robusta)
            // Se o Squid não conseguiu ler o SNI (error:...), mostramos o IP de destino
            if (url.startsWith('error:') || url === '-' || url.length < 3) {
                url = `IP: ${dest_ip}`; 
            }
            
            // Remove a porta :443 visualmente para ficar mais limpo, se for domínio
            if (url.includes(':443') && !url.startsWith('IP:')) {
                url = url.replace(':443', '');
            }

            const status_code = parseInt(status_raw.split('/')[1]) || 0;
            const action = status_raw.split('/')[0];

            // Salva no Banco
            await pool.query(
                `INSERT INTO proxy_audit_log (timestamp, client_ip, username, url, method, status_code, bytes, action) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [timestamp, client_ip, username, url, method, status_code, 0, action]
            );

        } catch (err) {
            // Ignora erros de parse pontuais para não parar o serviço
        }
    }
});
