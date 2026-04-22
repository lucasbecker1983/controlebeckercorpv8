import { Router } from 'express';
import { pool } from '../config/db';

const router = Router();

// Rota para pegar os dados da View de Permanência
router.get('/permanencia', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM v_auditoria_permanencia');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar auditoria' });
    }
});

export default router;
