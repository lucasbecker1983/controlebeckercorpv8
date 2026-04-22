const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8'
});

async function run() {
    try {
        const password = '123';
        const hash = await bcrypt.hash(password, 10);
        
        console.log(`Novo Hash (Length: ${hash.length}): ${hash}`);
        
        // Atualiza LUCAS
        await pool.query("UPDATE app_users SET password_hash = $1 WHERE username = 'lucas'", [hash]);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
