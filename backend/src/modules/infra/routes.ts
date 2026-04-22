import { Router } from 'express';
import { execCmd } from '../../utils/sys';
import { Pool } from 'pg';
const router = Router();
const pool = new Pool({ connectionString: 'postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8' });

// WireGuard
router.post('/vpn/create', async (req, res) => {
    const { name } = req.body;
    
    const privKey = await execCmd("wg genkey");
    const pubKey = await execCmd(`echo "${privKey}" | wg pubkey`);
    const psk = await execCmd("wg genpsk");

    const r = await pool.query(
        "INSERT INTO vpn_wg_peers (name, public_key, private_key_enc, allowed_ips) VALUES ($1, $2, $3, $4) RETURNING id",
        [name, pubKey, privKey, '10.8.0.x']
    );
    const ip = `10.8.0.${r.rows[0].id + 1}`; 
    
    await pool.query("UPDATE vpn_wg_peers SET allowed_ips=$1 WHERE id=$2", [`${ip}/32`, r.rows[0].id]);

    await execCmd(`sudo wg set wg0 peer ${pubKey} allowed-ips ${ip}/32 preshared-key <(echo "${psk}")`);
    
    // Config do Cliente (Template string limpa)
    const clientConf = `[Interface]
PrivateKey = ${privKey}
Address = ${ip}/32
DNS = 10.8.0.1

[Peer]
PublicKey = $(sudo wg show wg0 public-key)
Endpoint = console.jacarezinho.cloud:51820
AllowedIPs = 0.0.0.0/0
PresharedKey = ${psk}`;

    res.json({ success: true, config: clientConf, ip });
});

router.get('/vpn/peers', async (req, res) => {
    const r = await pool.query("SELECT id, name, public_key, allowed_ips, is_active FROM vpn_wg_peers");
    res.json(r.rows);
});

router.post('/vpn/revoke', async (req, res) => {
    const { id, pubKey } = req.body;
    await execCmd(`sudo wg set wg0 peer ${pubKey} remove`);
    await pool.query("DELETE FROM vpn_wg_peers WHERE id=$1", [id]);
    res.json({ success: true });
});

// SMB
router.post('/smb/share', async (req, res) => {
    const { name, path, compatWin } = req.body;
    
    await execCmd(`sudo mkdir -p ${path}`);
    await execCmd(`sudo chown -R nobody:nogroup ${path}`);
    await execCmd(`sudo chmod -R 0775 ${path}`);

    let block = `
[${name}]
   path = ${path}
   browsable = yes
   read only = no
   guest ok = no
   create mask = 0775
`;
    if (compatWin) {
        block += "   server min protocol = NT1\n   ntlm auth = yes\n";
    }

    await execCmd(`echo "${block}" | sudo tee -a /etc/samba/smb.conf`);
    await execCmd("sudo systemctl reload smbd");

    await pool.query("INSERT INTO storage_smb_shares (name, path, compat_win) VALUES ($1, $2, $3)", [name, path, compatWin || false]);
    res.json({ success: true });
});

router.get('/smb/shares', async (req, res) => {
    const r = await pool.query("SELECT * FROM storage_smb_shares");
    res.json(r.rows);
});

export default router;
