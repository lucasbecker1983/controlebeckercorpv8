#!/bin/bash
set -e

# --- CONFIGURAÇÃO ---
DB_NAME="controlebeckercorp_v8"
DB_USER="postgres"
# Senha temporária para o psql (ajuste conforme seu ambiente se necessário)
export PGPASSWORD='becker_admin_secure' 
PROJECT_DIR="/opt/controlebeckercorp-v8/backend"

echo ">>> [BECKER CORP v8] Iniciando Refatoração do Módulo de Usuários..."
cd $PROJECT_DIR

# 1. INSTALAÇÃO DE DEPENDÊNCIAS DE SEGURANÇA
echo ">>> 1. Instalando bcryptjs (Hash de senhas)..."
if [ ! -d "node_modules/bcryptjs" ]; then
    npm install bcryptjs
    npm install @types/bcryptjs --save-dev
else
    echo "   + bcryptjs já instalado."
fi

# 2. CONFIGURAÇÃO DO BANCO DE DADOS (Postgres)
echo ">>> 2. Criando Tabela de Usuários da Aplicação..."

SQL_CMD="
-- Tabela de Usuários do Sistema (Não Linux)
CREATE TABLE IF NOT EXISTS app_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'OPERATOR',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inserir Admin Padrão (Senha: admin123) se a tabela estiver vazia
-- Hash gerado para 'admin123'
INSERT INTO app_users (username, password_hash, role)
SELECT 'admin', '\$2a\$10\$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'ADMIN'
WHERE NOT EXISTS (SELECT 1 FROM app_users WHERE username = 'admin');
"

if command -v psql &> /dev/null; then
    psql -h localhost -U $DB_USER -d $DB_NAME -c "$SQL_CMD"
    echo "   + Tabela SQL configurada."
else
    echo "!!! ERRO: 'psql' não encontrado. Verifique se o postgres-client está instalado."
fi

# 3. REESCREVENDO O MÓDULO DE ROTAS (src/modules/users/routes.ts)
echo ">>> 3. Atualizando src/modules/users/routes.ts para usar SQL..."

mkdir -p src/modules/users

cat << 'EOF' > src/modules/users/routes.ts
import { Router } from 'express';
import { Pool } from 'pg';
import { genSalt, hash, compare } from 'bcryptjs';

const router = Router();
const pool = new Pool({
    connectionString: 'postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8'
});

// --- LISTAR USUÁRIOS ---
router.get('/', async (req, res) => {
    try {
        // Retorna apenas dados seguros (sem hash de senha)
        const result = await pool.query("SELECT id, username, role, created_at FROM app_users ORDER BY id ASC");
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json([]);
    }
});

// --- CRIAR USUÁRIO ---
router.post('/add', async (req, res) => {
    const { username, password, role } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: "Usuário e senha são obrigatórios" });
    }

    try {
        // Verifica duplicidade
        const check = await pool.query("SELECT id FROM app_users WHERE username = $1", [username]);
        if (check.rows.length > 0) return res.status(409).json({ error: "Usuário já existe" });

        // Gera Hash Seguro
        const salt = await genSalt(10);
        const passwordHash = await hash(password, salt);

        await pool.query(
            "INSERT INTO app_users (username, password_hash, role) VALUES ($1, $2, $3)", 
            [username, passwordHash, role || 'OPERATOR']
        );
        
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Erro interno ao criar usuário" });
    }
});

// --- DELETAR USUÁRIO ---
router.post('/delete', async (req, res) => {
    const { username } = req.body;

    if (username === 'admin') {
        return res.status(403).json({ error: "Não é permitido remover o Admin Principal" });
    }

    try {
        await pool.query("DELETE FROM app_users WHERE username = $1", [username]);
        res.json({ success: true });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: "Erro ao deletar" }); 
    }
});

export default router;
EOF

# 4. ATUALIZANDO O SERVER.TS (Registrar a nova rota)
# O seu server.ts original NÃO tinha o import de users, vamos adicionar.
echo ">>> 4. Registrando rota /api/users no server.ts..."

cat << 'EOF' > src/server.ts
import proxyRoutes from './modules/proxy/routes';
import express from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/routes';
import dashRoutes from './modules/dashboard/routes';
import networkRoutes from './modules/network/routes';
import securityRoutes from './modules/security/routes';
import accessRoutes from './modules/access/routes';
import serverRoutes from './modules/server/routes';
import controlRoutes from './modules/control/routes';
import usersRoutes from './modules/users/routes'; // Módulo Refatorado
import { startMonitor } from './modules/control/monitor';

const app = express();
app.use(cors());
app.use(express.json());

// Rotas
app.use('/api/proxy', proxyRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/access', accessRoutes);
app.use('/api/server', serverRoutes);
app.use('/api/control', controlRoutes);
app.use('/api/users', usersRoutes); // Registro da nova rota

// Inicia a IA
startMonitor();

app.listen(6778, '0.0.0.0', () => console.log('BECKER V8 + IA INSIGHT: 6778'));
EOF

echo ">>> Backend Refatorado! Reiniciando PM2..."
pm2 restart bcc-backend
echo ">>> Sucesso."
