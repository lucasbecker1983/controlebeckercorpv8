import { Pool } from 'pg';

export const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'controlebeckercorp_v8',
    password: 'becker_admin_secure',
    port: 5432,
});

pool.on('error', (err) => {
    console.error('❌ Erro fatal no pool do PostgreSQL', err);
});
