import { Router } from 'express';
import { pool } from '../../config/db';
import { authSecurityService } from '../auth/auth-security-service';

const router = Router();

// Criar, editar e excluir usuários exige papel de administrador (antes bastava estar logado).
const ADMIN_ROLES = ['admin', 'god'];
const requireAdmin = (req: any, res: any, next: any) => {
    const role = String(req.auth?.role || '').trim().toLowerCase();
    if (!ADMIN_ROLES.includes(role)) return res.status(403).json({ error: 'Apenas administradores podem gerenciar usuários.' });
    return next();
};
const VALID_ROLES = ['admin', 'user', 'viewer'];

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
router.post('/', requireAdmin, async (req, res) => {
    const { name, username, password, role } = req.body;
    
    if (!username || !password) return res.status(400).json({ error: "Dados incompletos" });
    if (String(password).length < 8) return res.status(400).json({ error: "A senha precisa ter pelo menos 8 caracteres." });
    if (role && !VALID_ROLES.includes(String(role).toLowerCase())) return res.status(400).json({ error: "Perfil inválido." });

    try {
        // Gera Hash compatível com o módulo de Auth
        const hash = await authSecurityService.hashPassword(password);
        
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
router.post('/update', requireAdmin, async (req, res) => {
    const { id, name, username, password, role } = req.body;
    if (!id || !username) return res.status(400).json({ error: "Dados incompletos" });
    if (password && String(password).length < 8) return res.status(400).json({ error: "A senha precisa ter pelo menos 8 caracteres." });
    if (role && !VALID_ROLES.includes(String(role).toLowerCase()) && String(role).toLowerCase() !== 'god') return res.status(400).json({ error: "Perfil inválido." });

    try {
        if (password) {
            const hash = await authSecurityService.hashPassword(password);
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
router.post('/delete', requireAdmin, async (req, res) => {
    const { id } = req.body;
    try {
        // Proteção contra auto-exclusão do admin principal (opcional, mas recomendado)
        const check = await pool.query("SELECT username FROM app_users WHERE id=$1", [id]);
        if (Number(id) === Number((req as any).auth?.id)) {
             return res.status(400).json({ error: "Você não pode excluir o próprio usuário." });
        }
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
