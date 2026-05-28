import 'dotenv/config';
import { spawn } from 'child_process';
import { dnsRadarService } from './services/dns-radar-service';

const JOURNAL_SOURCES = [
    { resolver: 'unbound', args: ['-fu', 'unbound', '-n', '200', '--no-pager', '-o', 'short-iso'] },
    { resolver: 'unbound-vip-clean', args: ['-fu', 'sgcg-vip-dns.service', '-n', '200', '--no-pager', '-o', 'short-iso'] },
];

console.log(`🚀 [DNS RADAR] Ingestão real iniciada para ${JOURNAL_SOURCES.map((source) => source.resolver).join(', ')}`);

const readers = JOURNAL_SOURCES.map((source) => {
    const reader = spawn('journalctl', source.args);

    reader.stdout.on('data', async (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                await dnsRadarService.ingestLine(line, source.resolver);
            } catch (error) {
                console.error(`❌ [DNS RADAR] Erro ao ingerir linha do ${source.resolver}:`, error);
            }
        }
    });

    reader.stderr.on('data', (data) => {
        console.error(`[DNS RADAR][${source.resolver}][stderr] ${data}`);
    });

    return reader;
});

process.on('SIGINT', () => {
    readers.forEach((reader) => reader.kill());
    process.exit();
});

process.on('SIGTERM', () => {
    readers.forEach((reader) => reader.kill());
    process.exit();
});
