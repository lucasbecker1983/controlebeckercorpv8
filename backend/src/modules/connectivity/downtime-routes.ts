import { Router } from 'express';
import { pool } from '../../config/db';

const router = Router();

// Retorna histórico de quedas (últimas 50)
router.get('/history', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id, 
                gateway_ip, 
                start_at, 
                end_at, 
                duration,
                CASE WHEN end_at IS NULL THEN true ELSE false END as is_active
            FROM net_link_downtime 
            ORDER BY start_at DESC 
            LIMIT 50
        `);
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
                COUNT(*) as drops_today,
                COALESCE(SUM(duration), 0) as downtime_seconds_today
            FROM net_link_downtime 
            WHERE start_at >= CURRENT_DATE
        `);
        res.json(result.rows[0]);
    } catch (e) {
        res.status(500).json({ error: "Erro stats" });
    }
});

export default router;
