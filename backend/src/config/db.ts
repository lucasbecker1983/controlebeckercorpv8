import 'dotenv/config';
import { Pool } from 'pg';
import { env } from './env';

export const pool = new Pool({
    connectionString: env.databaseUrl,
});

pool.on('error', (err) => {
    console.error('❌ Erro fatal no pool do PostgreSQL', err);
});
