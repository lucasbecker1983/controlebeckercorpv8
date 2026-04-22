import { Router } from 'express';
import { execCmd } from '../../utils/sys';
import { Pool } from 'pg';
const router = Router();
const pool = new Pool({ connectionString: 'postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8' });

router.post('/create', async (req, res) => {
    const { name } = req.body;
    const priv = await execCmd("wg genkey");
    const pub = await execCmd(`echo "${priv}" | wg pubkey`);
    const r = await pool.query("INSERT INTO vpn_wg_peers (name, public_key, private_key_enc) VALUES ($1,$2,$3) RETURNING id", [name, pub, priv]);
    const ip = `10.8.0.${r.rows[0].id + 1}`;
    await pool.query("UPDATE vpn_wg_peers SET ip=$1 WHERE id=$2", [ip, r.rows[0].id]);
    const config = `[Interface]\nPrivateKey = ${priv}\nAddress = ${ip}/32\nDNS = 10.8.0.1\n\n[Peer]\nPublicKey = SERVER_PUB_KEY\nEndpoint = vpn.beckercorp.com:51820\nAllowedIPs = 0.0.0.0/0`;
    res.json({ success: true, config, clientIp: ip, qrCode: 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(config) });
});
router.get('/list', async (req, res) => {
    const r = await pool.query("SELECT * FROM vpn_wg_peers");
    res.json(r.rows);
});
export default router;
