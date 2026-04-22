import { Router } from 'express';
import { pool } from '../../config/db';

const router = Router();

// Listar Logs de Auditoria (Últimos 200)
router.get('/logs', async (req, res) => {
    try {
        // Verifica se a tabela existe antes de consultar para evitar crash
        const tableCheck = await pool.query("SELECT to_regclass('public.proxy_audit_log')");
        if (!tableCheck.rows[0].to_regclass) {
            return res.json([]); // Retorna vazio se a tabela não existir ainda
        }

        const result = await pool.query(`
            SELECT * FROM proxy_audit_log 
            ORDER BY "timestamp" DESC 
            LIMIT 200
        `);
        res.json(result.rows);
    } catch (error) {
        console.error("Proxy Logs Error:", error);
        res.status(500).json({ error: 'Erro ao buscar logs' });
    }
});

// Estatísticas Rápidas
router.get('/stats', async (req, res) => {
    try {
        const tableCheck = await pool.query("SELECT to_regclass('public.proxy_audit_log')");
        if (!tableCheck.rows[0].to_regclass) return res.json({ total: 0, blocked: 0 });

        const total = await pool.query('SELECT COUNT(*) FROM proxy_audit_log');
        const blocked = await pool.query("SELECT COUNT(*) FROM proxy_audit_log WHERE action = 'BLOCK'");
        
        res.json({ 
            total: parseInt(total.rows[0].count),
            blocked: parseInt(blocked.rows[0].count)
        });
    } catch (e) { res.json({ total: 0, blocked: 0 }); }
});

export default router;
