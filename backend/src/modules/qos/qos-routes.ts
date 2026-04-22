import { Router } from 'express';
import { execCmd } from '../../utils/sys';
import { pool } from '../../config/db';

const router = Router();

// LISTAR (GET /)
router.get('/', async (req, res) => {
    try {
        const policies = await pool.query("SELECT * FROM net_qos_policies");
        const vips = await pool.query("SELECT * FROM net_qos_vips");
        
        const result: any = {};
        
        policies.rows.forEach(p => {
            result[p.interface] = { 
                ...p, 
                vips: vips.rows.filter(v => v.interface === p.interface) 
            };
        });
        
        res.json(result);
    } catch (e) { 
        console.error("QoS List Error:", e);
        res.json({}); 
    }
});

// APLICAR (POST /apply)
router.post('/apply', async (req, res) => {
    const { interface: iface, download, upload, vips } = req.body;
    const downLim = parseInt(download) || 0;
    const upLim = parseInt(upload) || 0; // Reservado para futuro (ingress shaping)
    
    console.log(`[QoS] Aplicando em ${iface}: Down=${downLim}, VIPs=${vips?.length || 0}`);

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Aplica QoS no Kernel (Linux)
        // Limpa anterior
        await execCmd(`sudo tc qdisc del dev ${iface} root 2>/dev/null || true`);
        
        if (downLim > 0) {
            // Cria Raiz HTB
            await execCmd(`sudo tc qdisc add dev ${iface} root handle 1: htb default 10`);
            await execCmd(`sudo tc class add dev ${iface} parent 1: classid 1:1 htb rate 1000mbit`);
            
            // Classe 1:10 -> Limitada (Padrão)
            await execCmd(`sudo tc class add dev ${iface} parent 1:1 classid 1:10 htb rate ${downLim}mbit ceil ${downLim}mbit`);
            
            // Classe 1:20 -> Ilimitada (VIP)
            await execCmd(`sudo tc class add dev ${iface} parent 1:1 classid 1:20 htb rate 1000mbit ceil 1000mbit`);
            
            // Filtros para VIPs
            if (vips && Array.isArray(vips)) {
                // Remove duplicatas de IP para o comando TC não falhar
                const uniqueIPs = [...new Set(vips.map((v:any) => v.ip))];
                
                for (const ip of uniqueIPs) {
                    await execCmd(`sudo tc filter add dev ${iface} protocol ip parent 1:0 prio 1 u32 match ip dst ${ip} flowid 1:20`);
                }
            }
        }

        // 2. Persistência no Banco
        
        // Salva/Atualiza Política da Interface
        await client.query(
            "INSERT INTO net_qos_policies (interface, down_limit, up_limit, active) VALUES ($1, $2, $3, true) ON CONFLICT (interface) DO UPDATE SET down_limit=$2, up_limit=$3, active=true",
            [iface, downLim, upLim]
        );

        // Remove VIPs antigos desta interface
        await client.query("DELETE FROM net_qos_vips WHERE interface=$1", [iface]);

        // Insere Novos VIPs (filtrando duplicados de IP)
        if (vips && Array.isArray(vips)) {
            const seen = new Set();
            for (const v of vips) {
                if (!seen.has(v.ip)) {
                    seen.add(v.ip);
                    await client.query(
                        "INSERT INTO net_qos_vips (interface, ip, label) VALUES ($1, $2, $3)", 
                        [iface, v.ip, v.label || 'VIP']
                    );
                }
            }
        }

        await client.query('COMMIT');
        res.json({ success: true });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("QoS Apply Error:", e);
        res.status(500).json({ error: "Erro ao aplicar regras de QoS" });
    } finally {
        client.release();
    }
});

export default router;
