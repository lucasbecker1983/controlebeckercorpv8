import { Router } from 'express';
import { pool } from '../../config/db';
import { env } from '../../config/env';
import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';

const router = Router();

router.post('/login', async (req, res) => {
    console.log(`[LOGIN REQUEST] User: ${req.body.username}`);
    const { username, password } = req.body;

    if (!username || !password) return res.status(400).json({ error: "Dados incompletos" });

    try {
        const result = await pool.query('SELECT * FROM app_users WHERE username = $1', [username]);
        
        if (result.rows.length === 0) {
            console.log("-> Usuario nao encontrado");
            return res.status(401).json({ error: "Credenciais invalidas" });
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            console.log("-> Senha incorreta");
            return res.status(401).json({ error: "Credenciais invalidas" });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            env.jwtSecret,
            { expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'] }
        );
        
        console.log("-> Login SUCESSO");
        return res.status(200).json({
            success: true,
            token: token,
            user: { username: user.username, role: user.role }
        });

    } catch (err) {
        console.error("-> ERRO NO SERVIDOR:", err);
        return res.status(500).json({ error: "Erro interno" });
    }
});

export default router;
