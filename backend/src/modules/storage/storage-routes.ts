import { Router } from 'express';
import { execCmd } from '../../utils/sys';
import { Pool } from 'pg';
import fs from 'fs';

const router = Router();
const pool = new Pool({ connectionString: 'postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8' });
const SMB_CONF = "/etc/samba/smb.conf";

// Sincroniza Banco -> smb.conf
const syncSamba = async () => {
    try {
        const header = `[global]\n   workgroup = WORKGROUP\n   server string = Becker File Server\n   security = user\n   map to guest = Bad User\n\n`;
        const r = await pool.query("SELECT * FROM storage_smb_shares");
        
        let shares = "";
        r.rows.forEach(s => {
            shares += `[${s.name}]\n   path = ${s.path}\n   browsable = yes\n   writable = ${s.writable ? 'yes' : 'no'}\n   guest ok = ${s.public ? 'yes' : 'no'}\n   create mask = 0777\n   directory mask = 0777\n\n`;
        });

        // Só escreve se tiver permissão (evita crash em dev)
        // fs.writeFileSync(SMB_CONF, header + shares);
        // await execCmd("systemctl reload smbd");
    } catch (e) { console.error("Samba Sync Error", e); }
};

router.get('/', async (req, res) => {
    try { const r = await pool.query("SELECT * FROM storage_smb_shares"); res.json(r.rows); } 
    catch { res.json([]); }
});

router.post('/add', async (req, res) => {
    const { name, path, isPublic, isWritable } = req.body;
    try {
        await execCmd(`mkdir -p ${path} && chmod 777 ${path}`); // Cria pasta física
        await pool.query("INSERT INTO storage_smb_shares (name, path, public, writable) VALUES ($1, $2, $3, $4)", [name, path, isPublic, isWritable]);
        await syncSamba();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Erro ao criar share" }); }
});

router.post('/delete', async (req, res) => {
    try {
        await pool.query("DELETE FROM storage_smb_shares WHERE id=$1", [req.body.id]);
        await syncSamba();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Erro ao deletar" }); }
});

export default router;
