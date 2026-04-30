import 'dotenv/config';
import { Pool } from 'pg';
import { env } from './env';

export const pool = new Pool({
    connectionString: env.databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    maxUses: 750,
});

pool.on('error', (err) => {
    console.error('❌ Erro fatal no pool do PostgreSQL', err);
});
