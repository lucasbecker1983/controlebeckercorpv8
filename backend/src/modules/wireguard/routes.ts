import { Router } from 'express';
import { execCmd } from '../../utils/sys';
import { Pool } from 'pg';

const router = Router();
const pool = new Pool({ connectionString: 'postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8' });

router.post('/create', async (req, res) => {
    const { name } = req.body;
    try {
        const priv = await execCmd("wg genkey");
        const pub = await execCmd(`echo "${priv}" | wg pubkey`);
        const psk = await execCmd("wg genpsk");

        const r = await pool.query(
            "INSERT INTO vpn_wg_peers (name, public_key, private_key_enc, preshared_key) VALUES ($1, $2, $3, $4) RETURNING id",
            [name, pub, priv, psk]
        );
        const nextIp = `10.8.0.${r.rows[0].id + 1}`;

        // Executa comando real
        await execCmd(`sudo wg set wg0 peer ${pub} allowed-ips ${nextIp}/32 preshared-key <(echo ${psk})`);
        await execCmd("sudo wg-quick save wg0");

        res.json({ success: true, ip: nextIp });
    } catch (e) { res.status(500).json({ error: "Erro WireGuard" }); }
});

router.get('/peers', async (req, res) => {
    const r = await pool.query("SELECT * FROM vpn_wg_peers");
    res.json(r.rows);
});

export default router;
