import { Router } from 'express';
import { execCmd } from '../../utils/sys';
import fs from 'fs';
import { pool } from '../../config/db';
import { env } from '../../config/env';

const router = Router();

const respondConnectivityError = (res: any, area: string, error: unknown) => {
    console.error(`[CONNECTIVITY MODULE] Falha em ${area}:`, error);
    return res.status(500).json({ error: `Falha ao processar ${area}.` });
};

// VPN
router.post('/vpn/create', async (req, res) => {
    const { name } = req.body;
    try {
        const clientPriv = (await execCmd("wg genkey")).trim();
        const clientPub = (await execCmd(`echo "${clientPriv}" | wg pubkey`)).trim();
        const psk = (await execCmd("wg genpsk")).trim();

        const r = await pool.query(
            "INSERT INTO vpn_wg_peers (name, public_key, private_key_enc, preshared_key) VALUES ($1, $2, $3, $4) RETURNING id",
            [name, clientPub, clientPriv, psk]
        );
        const ip = `10.8.0.${parseInt(r.rows[0].id) + 10}`;
        await pool.query("UPDATE vpn_wg_peers SET ip=$1 WHERE id=$2", [ip, r.rows[0].id]);

        await execCmd(`sudo wg set ${env.wireguardInterface} peer ${clientPub} allowed-ips ${ip}/32 preshared-key <(echo "${psk}")`);
        await execCmd(`sudo wg-quick save ${env.wireguardInterface}`);

        const serverPub = fs.readFileSync('/etc/wireguard/public.key', 'utf-8').trim();
        const config = `[Interface]
PrivateKey = ${clientPriv}
Address = ${ip}/24
DNS = 10.8.0.1

[Peer]
PublicKey = ${serverPub}
PresharedKey = ${psk}
Endpoint = ${env.appDomain}:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`;

        res.json({ success: true, config });
    } catch (error) {
        respondConnectivityError(res, 'criação de credencial VPN', error);
    }
});

router.post('/vpn/delete', async (req, res) => {
    const { id } = req.body;
    try {
        const r = await pool.query("SELECT public_key FROM vpn_wg_peers WHERE id=$1", [id]);
        if(r.rows.length > 0) {
             await execCmd(`sudo wg set ${env.wireguardInterface} peer ${r.rows[0].public_key} remove`).catch(()=>{});
             await execCmd(`sudo wg-quick save ${env.wireguardInterface}`).catch(()=>{});
        }
        await pool.query("DELETE FROM vpn_wg_peers WHERE id=$1", [id]);
        res.json({ success: true });
    } catch (error) {
        respondConnectivityError(res, 'remoção de credencial VPN', error);
    }
});

router.post('/vpn/download', async (req, res) => {
    const { id } = req.body;
    try {
        const r = await pool.query("SELECT * FROM vpn_wg_peers WHERE id=$1", [id]);
        const p = r.rows[0];
        const serverPub = fs.readFileSync('/etc/wireguard/public.key', 'utf-8').trim();
        const config = `[Interface]
PrivateKey = ${p.private_key_enc}
Address = ${p.ip}/24
DNS = 10.8.0.1

[Peer]
PublicKey = ${serverPub}
PresharedKey = ${p.preshared_key}
Endpoint = ${env.appDomain}:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`;
        res.json({ success: true, config, filename: `vpn-${p.name}.conf` });
    } catch (error) {
        respondConnectivityError(res, 'download de credencial VPN', error);
    }
});

// STORAGE
router.post('/storage/create', async (req, res) => {
    const { username, password, path, has_smb } = req.body;
    try {
        await execCmd(`sudo useradd -M -d "${path}" -s /usr/sbin/nologin -g ${env.storageGroup} "${username}"`);
        await execCmd(`echo "${username}:${password}" | sudo chpasswd`);
        await execCmd(`sudo mkdir -p "${path}"`);
        await execCmd(`sudo chown :${env.storageGroup} "${path}"`);
        await execCmd(`sudo chmod 775 "${path}"`);
        await execCmd(`sudo chmod g+s "${path}"`);
        
        if (has_smb) {
            await execCmd(`(echo "${password}"; echo "${password}") | sudo smbpasswd -a -s "${username}"`);
            await execCmd(`sudo smbpasswd -e "${username}"`);
        }
        await pool.query("INSERT INTO sys_ftp_users (username, path, has_smb) VALUES ($1, $2, $3)", [username, path, has_smb]);
        res.json({ success: true });
    } catch (error) {
        respondConnectivityError(res, 'criação de usuário de storage', error);
    }
});

router.post('/storage/delete', async (req, res) => {
    const { id, username } = req.body;
    try {
        await execCmd(`sudo smbpasswd -x "${username}"`).catch(()=>{});
        await execCmd(`sudo userdel "${username}"`).catch(()=>{});
        await pool.query("DELETE FROM sys_ftp_users WHERE id=$1", [id]);
        res.json({ success: true });
    } catch (error) {
        respondConnectivityError(res, 'remoção de usuário de storage', error);
    }
});

router.get('/list', async (req, res) => {
    try {
        const [v, s, vpnStatusRaw, storageStatusRaw] = await Promise.all([
            pool.query("SELECT * FROM vpn_wg_peers ORDER BY id DESC"),
            pool.query("SELECT * FROM sys_ftp_users ORDER BY id DESC"),
            execCmd(`systemctl is-active ${env.wireguardService}`),
            execCmd("systemctl is-active smbd"),
        ]);
        const vs = vpnStatusRaw.trim() === 'active';
        const ss = storageStatusRaw.trim() === 'active';
        res.json({ vpn: v.rows, storage: s.rows, status: { vpn: vs, storage: ss } });
    } catch (error) {
        respondConnectivityError(res, 'inventário de conectividade', error);
    }
});

export default router;
