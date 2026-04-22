import { Router } from 'express';
import { pool } from '../../config/db';
import bcrypt from 'bcrypt';

const router = Router();

// LISTAR (GET /api/users)
router.get('/', async (req, res) => {
    try {
        // Busca da tabela app_users (a mesma do login)
        const result = await pool.query("SELECT id, username, role, display_name as name, created_at FROM app_users ORDER BY id ASC");
        res.json(result.rows);
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: "Erro ao listar usuários" }); 
    }
});

// CRIAR (POST /api/users)
router.post('/', async (req, res) => {
    const { name, username, password, role } = req.body;
    
    if (!username || !password) return res.status(400).json({ error: "Dados incompletos" });

    try {
        // Gera Hash compatível com o módulo de Auth
        const hash = await bcrypt.hash(password, 10);
        
        await pool.query(
            "INSERT INTO app_users (display_name, username, password_hash, role) VALUES ($1, $2, $3, $4)",
            [name || username, username, hash, role || 'user']
        );

        res.json({ success: true });
    } catch (e: any) {
        console.error(e);
        if (e.code === '23505') return res.status(400).json({ error: "Usuário já existe" });
        res.status(500).json({ error: "Erro ao criar usuário" });
    }
});

// ATUALIZAR (POST /api/users/update)
router.post('/update', async (req, res) => {
    const { id, name, username, password, role } = req.body;
    
    try {
        if (password) {
            const hash = await bcrypt.hash(password, 10);
            await pool.query(
                "UPDATE app_users SET display_name=$1, username=$2, password_hash=$3, role=$4 WHERE id=$5",
                [name, username, hash, role, id]
            );
        } else {
            await pool.query(
                "UPDATE app_users SET display_name=$1, username=$2, role=$3 WHERE id=$4",
                [name, username, role, id]
            );
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Erro ao atualizar" });
    }
});

// EXCLUIR (POST /api/users/delete)
router.post('/delete', async (req, res) => {
    const { id } = req.body;
    try {
        // Proteção contra auto-exclusão do admin principal (opcional, mas recomendado)
        const check = await pool.query("SELECT username FROM app_users WHERE id=$1", [id]);
        if (check.rows[0]?.username === 'lucas' || check.rows[0]?.username === 'admin') {
             return res.status(403).json({ error: "Não é permitido excluir o superusuário." });
        }

        await pool.query("DELETE FROM app_users WHERE id = $1", [id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Erro ao excluir" });
    }
});

export default router;
