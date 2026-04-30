import { EventEmitter } from 'events';
import { Client } from 'pg';
import { env } from '../config/env';

export const radarLiveBus = new EventEmitter();
radarLiveBus.setMaxListeners(256);

const CHANNEL = 'dns_radar_live';

async function connect(): Promise<Client> {
    const client = new Client({ connectionString: env.databaseUrl });
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    client.on('notification', (msg) => {
        if (msg.channel !== CHANNEL || !msg.payload) return;
        try {
            radarLiveBus.emit('event', JSON.parse(msg.payload));
        } catch {
            // payload malformado — ignorar
        }
    });
    client.on('error', (err) => {
        console.error('[RADAR LIVE] Conexão PG perdida, reconectando...', err.message);
        scheduleReconnect();
    });
    client.on('end', () => scheduleReconnect());
    return client;
}

let _client: Client | null = null;

function scheduleReconnect() {
    _client = null;
    setTimeout(() => {
        connect().then((c) => { _client = c; }).catch(() => scheduleReconnect());
    }, 3000);
}

export async function startLiveListener() {
    try {
        _client = await connect();
        console.log('[RADAR LIVE] LISTEN ativo no canal dns_radar_live');
    } catch (err: any) {
        console.error('[RADAR LIVE] Falha ao iniciar, tentando em 3s...', err.message);
        scheduleReconnect();
    }
}
