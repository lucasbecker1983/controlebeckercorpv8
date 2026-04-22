const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8'
});

async function run() {
    try {
        const password = '123'; // Senha simples para teste
        const hash = await bcrypt.hash(password, 10);
        
        console.log(`Gerando hash para senha: ${password}`);
        
        // Atualiza LUCAS
        const resLucas = await pool.query(
            "UPDATE app_users SET password_hash = $1 WHERE username = 'lucas'",
            [hash]
        );
        
        // Atualiza ADMIN (Backup)
        const resAdmin = await pool.query(
            "UPDATE app_users SET password_hash = $1 WHERE username = 'admin'",
            [hash]
        );

        console.log(`Usuário 'lucas' atualizado: ${resLucas.rowCount}`);
        console.log(`Usuário 'admin' atualizado: ${resAdmin.rowCount}`);
        
        process.exit(0);
    } catch (e) {
        console.error("Erro:", e);
        process.exit(1);
    }
}

run();
