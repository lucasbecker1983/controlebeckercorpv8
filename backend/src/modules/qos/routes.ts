import { Router } from 'express';
const VlanSchedulerController = require("./controllers/VlanSchedulerController");
import { execCmd } from '../../utils/sys';
import { Pool } from 'pg';

const router = Router();
const pool = new Pool({ connectionString: 'postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8' });

// Aplica Limite Real no Linux via 'tc'
router.post('/apply', async (req, res) => {
    const { interface: iface, download } = req.body; 
    
    try {
        await execCmd(`sudo tc qdisc del dev ${iface} root 2>/dev/null || true`);
        
        if (parseInt(download) > 0) {
            const cmd = `sudo tc qdisc add dev ${iface} root tbf rate ${download}mbit burst 32kbit latency 400ms`;
            await execCmd(cmd);
        }

        await pool.query(
            "INSERT INTO control_qos_policies (interface, download_limit_mbps, upload_limit_mbps) VALUES ($1, $2, 0) ON CONFLICT (id) DO UPDATE SET download_limit_mbps=$2",
            [iface, download]
        );
        
        res.json({ success: true, msg: `Limite de ${download}Mbps aplicado em ${iface}` });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: "Falha ao aplicar QoS no Kernel" }); 
    }
});

router.get('/', async (req, res) => {
    const r = await pool.query("SELECT * FROM control_qos_policies");
    res.json(r.rows);
});

export default router;
