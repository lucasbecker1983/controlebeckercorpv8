import { Router } from 'express';
import { execCmd } from '../../utils/sys';
import { Pool } from 'pg';
import fs from 'fs';

const router = Router();
const pool = new Pool({ connectionString: 'postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8' });

const WG_IFACE = 'wg0';
const ENDPOINT = 'vpn.beckercorp.com:51820';

// --- ROTAS ---

router.get('/list', async (req, res) => {
    try {
        // VPN Data
        const vpnPeersDB = await pool.query("SELECT * FROM vpn_wg_peers ORDER BY id DESC");
        
        // Tenta ler stats, se falhar, segue sem
        let wgStats: any = {};
        try {
            const raw = await execCmd("sudo wg show  dump");
            const lines = raw.split('\n').slice(1);
            lines.forEach(line => {
                const parts = line.split('\t');
                if (parts.length > 4) {
                    wgStats[parts[0]] = { 
                        handshake: parseInt(parts[4]),
                        rx: parseInt(parts[5]),
                        tx: parseInt(parts[6])
                    };
                }
            });
        } catch {}

        const now = Math.floor(Date.now() / 1000);

        const vpnList = vpnPeersDB.rows.map(peer => {
            const stat = wgStats[peer.public_key] || {};
            const lastHandshake = stat.handshake || 0;
            const isOnline = lastHandshake > 0 && (now - lastHandshake) < 180;
            
            return {
                ...peer,
                is_online: isOnline,
                last_handshake: lastHandshake,
                rx_bytes: stat.rx || 0,
                tx_bytes: stat.tx || 0,
                // Flag para o frontend saber se pode baixar (se tem chave privada salva)
                can_download: peer.private_key_enc && peer.private_key_enc.length > 20
            };
        });

        const storageUsers = await pool.query("SELECT * FROM access_smb_users ORDER BY id DESC");
        
        // Status simples
        const wgStatus = await execCmd("systemctl is-active wg-quick@");
        const smbStatus = await execCmd("systemctl is-active smbd");

        res.json({
            vpn: vpnList,
            storage: storageUsers.rows,
            status: { vpn: wgStatus === 'active', storage: smbStatus === 'active' }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Erro ao carregar lista" });
    }
});

// CRIAÇÃO (Salvando Chave Privada)
router.post('/vpn/create', async (req, res) => {
    const { name } = req.body;
    try {
        const priv = await execCmd("wg genkey");
        const pub = await execCmd(`echo "${priv}" | wg pubkey`);
        const psk = await execCmd("wg genpsk");
        const serverPub = fs.readFileSync('/etc/wireguard/public.key', 'utf-8').trim();

        // AGORA SALVAMOS A PRIV KEY PARA PERMITIR DOWNLOAD FUTURO
        const r = await pool.query(
            "INSERT INTO vpn_wg_peers (name, public_key, private_key_enc) VALUES ($1,$2,$3) RETURNING id", 
            [name, pub, priv] 
        );
        
        const ipSuffix = r.rows[0].id + 1; 
        const clientIp = `10.8.0.${ipSuffix}`;
        await pool.query("UPDATE vpn_wg_peers SET ip=$1 WHERE id=$2", [clientIp, r.rows[0].id]);

        await execCmd(`sudo wg set  peer "${pub}" allowed-ips "${clientIp}/32" preshared-key <(echo "${psk}")`);
        await execCmd("sudo wg-quick save ");

        const config = [
            '[Interface]',
            `PrivateKey = ${priv}`,
            `Address = ${clientIp}/32`,
            'DNS = 10.8.0.1',
            '',
            '[Peer]',
            `PublicKey = ${serverPub}`,
            `PresharedKey = ${psk}`,
            `Endpoint = ${ENDPOINT}`,
            'AllowedIPs = 0.0.0.0/0',
            'PersistentKeepalive = 25'
        ].join('\n');

        res.json({ 
            success: true, 
            config, 
            clientIp,
            qrCodeUrl: `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(config)}`
        });
    } catch (e) { res.status(500).json({ error: "Erro ao criar VPN" }); }
});

// DOWNLOAD DE CONFIGURAÇÃO (NOVA ROTA)
router.post('/vpn/config', async (req, res) => {
    const { id } = req.body;
    try {
        const r = await pool.query("SELECT * FROM vpn_wg_peers WHERE id = $1", [id]);
        if (r.rows.length === 0) return res.status(404).json({ error: "Peer não encontrado" });
        
        const peer = r.rows[0];
        
        // Se for um peer antigo sem chave salva
        if (!peer.private_key_enc || peer.private_key_enc.length < 20) {
            return res.status(400).json({ error: "Chave privada não armazenada para este usuário. Recrie o acesso." });
        }

        const serverPub = fs.readFileSync('/etc/wireguard/public.key', 'utf-8').trim();
        // Nota: PresharedKey não está sendo salva no banco neste modelo simplificado, 
        // então configs regeneradas podem não ter PSK se não salvarmos. 
        // Para v8.1: Adicionar coluna 'preshared_key' no banco.
        // Por hora, geramos sem PSK ou usamos a do banco se existir coluna.
        
        const config = [
            '[Interface]',
            `PrivateKey = ${peer.private_key_enc}`,
            `Address = ${peer.ip}/32`,
            'DNS = 10.8.0.1',
            '',
            '[Peer]',
            `PublicKey = ${serverPub}`,
            `Endpoint = ${ENDPOINT}`,
            'AllowedIPs = 0.0.0.0/0',
            'PersistentKeepalive = 25'
        ].join('\n');

        res.json({ success: true, config, name: peer.name });

    } catch (e) { res.status(500).json({ error: "Erro ao gerar config" }); }
});

// DELETE / REVOGAR
router.post('/vpn/delete', async (req, res) => {
    const { id } = req.body;
    try {
        const r = await pool.query("SELECT public_key FROM vpn_wg_peers WHERE id = $1", [id]);
        if (r.rows.length > 0) {
            const pub = r.rows[0].public_key;
            await execCmd(`sudo wg set  peer "${pub}" remove`);
            await execCmd("sudo wg-quick save ");
            await pool.query("DELETE FROM vpn_wg_peers WHERE id = $1", [id]);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Erro ao remover VPN" }); }
});

// STORAGE ROUTES (Mantidas)
router.post('/storage/create', async (req, res) => {
    const { username, password, path, permission } = req.body; 
    try {
        await execCmd(`sudo useradd -M -s /usr/sbin/nologin ${username}`);
        await execCmd(`echo "${username}:${password}" | sudo chpasswd`);
        await execCmd(`printf "${password}\n${password}\n" | sudo smbpasswd -a -s ${username}`);
        await pool.query("INSERT INTO access_smb_users (username, path, permissions) VALUES ($1, $2, $3)", [username, path, permission]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Erro SMB Create" }); }
});

router.post('/storage/delete', async (req, res) => {
    const { id, username } = req.body;
    try {
        await execCmd(`sudo smbpasswd -x ${username}`);
        await execCmd(`sudo userdel ${username}`);
        await pool.query("DELETE FROM access_smb_users WHERE id = $1", [id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Erro SMB Delete" }); }
});

export default router;
