import 'dotenv/config';
import { spawn } from 'child_process';
import { dnsRadarService } from './services/dns-radar-service';

const JOURNAL_ARGS = ['-fu', 'unbound', '-n', '200', '--no-pager', '-o', 'short-iso'];

console.log(`🚀 [DNS RADAR] Ingestão real iniciada via journalctl ${JOURNAL_ARGS.join(' ')}`);

const reader = spawn('journalctl', JOURNAL_ARGS);

reader.stdout.on('data', async (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            await dnsRadarService.ingestLine(line);
        } catch (error) {
            console.error('❌ [DNS RADAR] Erro ao ingerir linha do Unbound:', error);
        }
    }
});

reader.stderr.on('data', (data) => {
    console.error(`[DNS RADAR][stderr] ${data}`);
});

process.on('SIGINT', () => {
    reader.kill();
    process.exit();
});

process.on('SIGTERM', () => {
    reader.kill();
    process.exit();
});
