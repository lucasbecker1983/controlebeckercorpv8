import { Router } from 'express';
import { execCmd } from '../../utils/sys';
import { Pool } from 'pg';

const router = Router();
const pool = new Pool({ connectionString: 'postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8' });

const respondVpnError = (res: any, area: string, error: unknown) => {
    console.error(`[VPN MODULE] Falha em ${area}:`, error);
    return res.status(500).json({ error: `Falha ao processar ${area}.` });
};

// Listar Peers
router.get('/', async (req, res) => {
    try {
        const r = await pool.query("SELECT * FROM vpn_wg_peers ORDER BY id ASC");
        res.json(r.rows);
    } catch (error) {
        respondVpnError(res, 'peers VPN', error);
    }
});

// Criar Peer
router.post('/create', async (req, res) => {
    const { name } = req.body;
    try {
        // Gera chaves (Simulado via comando Linux)
        const priv = await execCmd("wg genkey");
        const pub = await execCmd(`echo "${priv}" | wg pubkey`);
        
        // Salva e pega ID para IP sequencial
        const r = await pool.query("INSERT INTO vpn_wg_peers (name, public_key, private_key_enc) VALUES ($1, $2, $3) RETURNING id", [name, pub, priv]);
        const id = r.rows[0].id;
        const ip = `10.8.0.${id + 1}`; // IPs a partir do .2
        
        await pool.query("UPDATE vpn_wg_peers SET ip=$1 WHERE id=$2", [ip, id]);
        
        // Gera Config Cliente
        const config = `[Interface]\nPrivateKey = ${priv}\nAddress = ${ip}/32\nDNS = 10.8.0.1\n\n[Peer]\nPublicKey = SERVER_PUB_KEY_AQUI\nEndpoint = vpn.beckercorp.com:51820\nAllowedIPs = 0.0.0.0/0, ::/0`;
        
        // Aqui deveria rodar script para adicionar peer no wg0.conf
        // await execCmd(`wg set wg0 peer ${pub} allowed-ips ${ip}/32`);

        res.json({ success: true, config });
    } catch (error) {
        respondVpnError(res, 'criação de peer VPN', error);
    }
});

// Remover Peer
router.post('/delete', async (req, res) => {
    try {
        await pool.query("DELETE FROM vpn_wg_peers WHERE id=$1", [req.body.id]);
        res.json({ success: true });
    } catch (error) {
        respondVpnError(res, 'remoção de peer VPN', error);
    }
});

export default router;
