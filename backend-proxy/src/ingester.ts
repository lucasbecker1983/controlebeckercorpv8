import 'dotenv/config';
import { spawn } from 'child_process';
import { DnsLoggerService } from './services/dns-logger-service';

const LOG_FILE = '/var/log/squid/access.log';
const dnsLoggerService = new DnsLoggerService();

console.log(`🚀 [RADAR V8] Motor de Auditoria iniciado. Lendo: ${LOG_FILE}`);

// Executa o tail para ler o log em tempo real
const tail = spawn('tail', ['-F', '-n', '0', LOG_FILE]);

tail.stdout.on('data', async (data) => {
    const lines = data.toString().split('\n');

    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            await dnsLoggerService.ingestLine(line);
        } catch (err) {
            console.error('❌ Erro ao ingerir linha do squid:', err);
        }
    }
});

tail.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
});

process.on('SIGINT', () => {
    tail.kill();
    process.exit();
});
