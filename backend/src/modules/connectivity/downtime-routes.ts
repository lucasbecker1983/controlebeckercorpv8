import { Router } from 'express';
import { pool } from '../../config/db';
import { env } from '../../config/env';
import { getLinkSentinelSnapshot } from './downtime-monitor';

const router = Router();

// Retorna histórico de quedas (últimas 50)
router.get('/history', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id, 
                gateway_ip, 
                COALESCE(target_key, 'provider_gateway') AS target_key,
                COALESCE(target_label, gateway_ip) AS target_label,
                COALESCE(path_label, 'Secretaria -> Provedor') AS path_label,
                COALESCE(wan_interface, $1) AS wan_interface,
                start_at, 
                end_at, 
                COALESCE(duration, EXTRACT(EPOCH FROM (NOW() - start_at))) AS duration,
                packets_lost,
                reason,
                CASE WHEN end_at IS NULL THEN true ELSE false END as is_active
            FROM net_link_downtime 
            ORDER BY start_at DESC 
            LIMIT 50
        `, [env.wanInterface]);
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Erro ao buscar histórico" });
    }
});

// Estatísticas Rápidas (Uptime hoje, Total de Quedas hoje)
router.get('/summary', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COALESCE(target_key, 'provider_gateway') AS target_key,
                COALESCE(target_label, gateway_ip) AS target_label,
                COALESCE(path_label, 'Secretaria -> Provedor') AS path_label,
                COUNT(*)::int AS drops_today,
                COALESCE(SUM(COALESCE(duration, EXTRACT(EPOCH FROM (NOW() - start_at)))), 0)::float AS downtime_seconds_today,
                BOOL_OR(end_at IS NULL) AS has_active_incident,
                MAX(CASE WHEN end_at IS NULL THEN start_at ELSE NULL END) AS active_since
            FROM net_link_downtime 
            WHERE start_at >= CURRENT_DATE
            GROUP BY 1, 2, 3
            ORDER BY target_key
        `);
        const snapshot = await getLinkSentinelSnapshot();
        res.json({
            provider: env.wanProviderName,
            interface: env.wanInterface,
            targets: result.rows,
            sentinel: snapshot,
        });
    } catch (e) {
        res.status(500).json({ error: "Erro stats" });
    }
});

export default router;
