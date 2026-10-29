import { Pool } from 'pg';

export const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'controlebeckercorp_v8',
    password: process.env.DB_PASSWORD,
    port: 5432,
});

pool.on('error', (err) => {
    console.error('❌ Erro fatal no pool do PostgreSQL', err);
});
