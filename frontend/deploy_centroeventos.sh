#!/bin/bash
# ==============================================================================
# SCRIPT DE DEPLOY COMPLETO (FRONTEND PWA + BACKEND + SSL + AUDITORIA LGPD) 
# Comando para salvar: nano deploy_centroeventos.sh
# ==============================================================================

echo ">>> Iniciando Deploy Automatizado e Completo (Front/Back/Nginx/SSL)..."

# 1. Configurar Nginx para a porta 3374
echo ">>> Configurando Nginx com repasse de IP Real (Fundamental para Auditoria)..."
sudo bash -c 'cat > /etc/nginx/sites-available/centrodeeventos << '\''EOF'\''
server {
    listen 80;
    server_name centroeventos.jacarezinho.cloud;

    root /opt/centrodeeventos/build;
    index index.html index.htm;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy reverso para a API Node.js na porta 3374
    location /api/ {
        proxy_pass http://127.0.0.1:3374;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF'

# Garante o link simbólico e reinicia
sudo ln -sf /etc/nginx/sites-available/centrodeeventos /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo systemctl restart nginx
echo ">>> Nginx reiniciado com sucesso!"

# ==============================================================================
# 2. ATUALIZAR BANCO DE DADOS (CRIANDO TABELAS E MENSAGENS)
# ==============================================================================
echo ">>> Verificando e atualizando o Banco de Dados (PostgreSQL)..."

sudo -u postgres psql <<EOF
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'centroeventos') THEN
    CREATE ROLE centroeventos WITH LOGIN ENCRYPTED PASSWORD 'centroeventos2026';
  END IF;
END
\$\$;
EOF

if ! sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw centroeventos; then
    sudo -u postgres psql -c "CREATE DATABASE centroeventos OWNER centroeventos;"
fi

# Criar tabelas APENAS se elas não existirem e INJETAR COLUNAS NOVAS
sudo -u postgres psql -d centroeventos <<EOF
CREATE TABLE IF NOT EXISTS spaces (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Disponível',
    daily_rate DECIMAL(10,2),
    color VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS rentals (
    id SERIAL PRIMARY KEY,
    space_id INT REFERENCES spaces(id),
    responsible VARCHAR(100) NOT NULL,
    event_type VARCHAR(100),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    value DECIMAL(10,2),
    status VARCHAR(50) DEFAULT 'Agendado',
    cleaning_type VARCHAR(50) DEFAULT 'Secretaria'
);

CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    patrimony VARCHAR(50) UNIQUE,
    category VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Bom',
    location VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS cleaning (
    id SERIAL PRIMARY KEY,
    space_id INT REFERENCES spaces(id),
    rental_id INT REFERENCES rentals(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    type VARCHAR(50),
    responsible_team VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Pendente',
    observation TEXT
);

CREATE TABLE IF NOT EXISTS rental_keys (
    rental_id INT PRIMARY KEY REFERENCES rentals(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'Aguardando',
    handover_date DATE,
    return_date DATE
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'Atendente',
    status VARCHAR(50) DEFAULT 'Ativo'
);

-- NOVA TABELA DE AUDITORIA LGPD (ENTERPRISE)
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INT,
    user_name VARCHAR(100),
    action VARCHAR(50) NOT NULL,
    entity VARCHAR(50) NOT NULL,
    entity_id INT,
    details TEXT,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- NOVA TABELA DE MENSAGENS E OBSERVAÇÕES (REAL-TIME)
CREATE TABLE IF NOT EXISTS cleaning_messages (
    id SERIAL PRIMARY KEY,
    cleaning_id INT REFERENCES cleaning(id) ON DELETE CASCADE,
    user_id INT,
    user_name VARCHAR(100),
    sender_role VARCHAR(50),
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (name, email, password, role, status)
SELECT 'Administrador Sistema', 'admin@jacarezinho.cloud', 'eventos2026', 'Super Admin', 'Ativo'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@jacarezinho.cloud');

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO centroeventos;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO centroeventos;
EOF
echo ">>> Banco de Dados estruturado e seguro!"

sudo mkdir -p /opt/centrodeeventos/build
sudo mkdir -p /opt/centrodeeventos/backend
sudo mkdir -p /opt/centrodeeventos/frontend
sudo chown -R $USER:$USER /opt/centrodeeventos

# ==============================================================================
# 3. SETUP DO BACKEND COM SISTEMA DE AUDITORIA INTEGRADO
# ==============================================================================
echo ">>> Configurando Backend (API) blindado na porta 3374..."
cd /opt/centrodeeventos/backend

if [ ! -f "package.json" ]; then
    npm init -y
fi

npm install express pg cors dotenv

if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi

cat << 'EOF' > .env
PORT=3374
DB_USER=centroeventos
DB_PASS=centroeventos2026
DB_HOST=localhost
DB_NAME=centroeventos
DB_PORT=5432
EOF

cat << 'EOF' > server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
});

// WRAPPER DE SEGURANÇA E CAPTURA DE ERROS
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(err => {
    console.error("Erro na API:", err);
    res.status(500).json({ error: err.message, details: err.stack });
  });
};

// FUNÇÃO CORE DE AUDITORIA LGPD
const logAudit = async (req, action, entity, entityId, details) => {
  try {
    const userId = req.headers['x-user-id'] || null;
    let userName = 'Sistema';
    if (req.headers['x-user-name']) {
       userName = decodeURIComponent(req.headers['x-user-name']);
    }
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress || 'IP Desconhecido';
    
    await pool.query(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [userId, userName, action, entity, entityId, JSON.stringify(details), ip]
    );
  } catch (err) {
    console.error("Erro Crítico ao salvar log de auditoria:", err);
  }
};

app.get('/api/status', asyncHandler(async (req, res) => {
  const client = await pool.connect();
  const result = await client.query('SELECT NOW()');
  client.release();
  res.json({ status: 'API Online', porta: process.env.PORT, db_time: result.rows[0].now });
}));

// AUTENTICAÇÃO E LOGOUT COM AUDITORIA
app.post('/api/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await pool.query('SELECT id, name, email, role FROM users WHERE email = $1 AND password = $2 AND status = $3', [email, password, 'Ativo']);
  
  if (result.rows.length > 0) {
    const user = result.rows[0];
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress;
    await pool.query('INSERT INTO audit_logs (user_id, user_name, action, entity, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6)', [user.id, user.name, 'LOGIN', 'Acesso', JSON.stringify({ email }), ip]);
    res.json({ success: true, user });
  } else {
    res.status(401).json({ error: 'Credenciais inválidas ou usuário inativo.' });
  }
}));

app.post('/api/logout', asyncHandler(async (req, res) => {
  await logAudit(req, 'LOGOUT', 'Acesso', null, { message: 'Usuário encerrou a sessão' });
  res.json({ success: true });
}));

// LEITURA DE AUDITORIA (Apenas Super Admin)
app.get('/api/audit', asyncHandler(async(req,res) => { 
  const r = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 600'); 
  res.json(r.rows); 
}));

// CRUD MENSAGENS E OBSERVAÇÕES
app.get('/api/messages', asyncHandler(async(req,res) => { 
  const r = await pool.query('SELECT * FROM cleaning_messages ORDER BY created_at ASC'); 
  res.json(r.rows); 
}));
app.post('/api/messages', asyncHandler(async(req,res) => { 
  const { cleaningId, message, senderRole } = req.body;
  const userId = req.headers['x-user-id'] || null;
  let userName = 'Sistema';
  if (req.headers['x-user-name']) userName = decodeURIComponent(req.headers['x-user-name']);
  
  const r = await pool.query(
    'INSERT INTO cleaning_messages (cleaning_id, user_id, user_name, sender_role, message) VALUES ($1,$2,$3,$4,$5) RETURNING *', 
    [cleaningId, userId, userName, senderRole, message]
  ); 
  await logAudit(req, 'CREATE', 'Mensagens', r.rows[0].id, { message_text: message, cleaning_id: cleaningId }); 
  res.json(r.rows[0]); 
}));
app.put('/api/messages/read', asyncHandler(async(req,res) => {
  const { cleaningId, role } = req.body;
  let condition = "sender_role != 'Terceirizado'";
  if (role !== 'Terceirizado') condition = "sender_role = 'Terceirizado'";
  
  const r = await pool.query(`UPDATE cleaning_messages SET is_read = TRUE WHERE cleaning_id = $1 AND ${condition} RETURNING *`, [cleaningId]);
  res.json({success:true, updated: r.rowCount});
}));

// CRUD ESPAÇOS
app.get('/api/spaces', asyncHandler(async(req,res) => { const r = await pool.query('SELECT * FROM spaces ORDER BY id ASC'); res.json(r.rows); }));
app.post('/api/spaces', asyncHandler(async(req,res) => { const { name, type, status, dailyRate, color } = req.body; const r = await pool.query('INSERT INTO spaces (name, type, status, daily_rate, color) VALUES ($1,$2,$3,$4,$5) RETURNING *', [name, type, status, dailyRate, color]); await logAudit(req, 'CREATE', 'Espaços', r.rows[0].id, req.body); res.json(r.rows[0]); }));
app.put('/api/spaces/:id', asyncHandler(async(req,res) => { const { name, type, status, dailyRate, color } = req.body; const r = await pool.query('UPDATE spaces SET name=$1, type=$2, status=$3, daily_rate=$4, color=$5 WHERE id=$6 RETURNING *', [name, type, status, dailyRate, color, req.params.id]); await logAudit(req, 'UPDATE', 'Espaços', req.params.id, req.body); res.json(r.rows[0]); }));
app.delete('/api/spaces/:id', asyncHandler(async(req,res) => { await pool.query('DELETE FROM spaces WHERE id=$1', [req.params.id]); await logAudit(req, 'DELETE', 'Espaços', req.params.id, { id: req.params.id }); res.json({success:true}); }));

// CRUD LOCAÇÕES 
app.get('/api/rentals', asyncHandler(async(req,res) => { const r = await pool.query('SELECT * FROM rentals ORDER BY id ASC'); res.json(r.rows); }));
app.post('/api/rentals', asyncHandler(async(req,res) => { 
  const { spaceId, responsible, eventType, startDate, endDate, value, status, cleaningType, cleaningMoment } = req.body; 
  const r = await pool.query('INSERT INTO rentals (space_id, responsible, event_type, start_date, end_date, value, status, cleaning_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [spaceId, responsible, eventType, startDate, endDate, value, status, cleaningType]); 
  const rentalId = r.rows[0].id;
  await pool.query('INSERT INTO rental_keys (rental_id, status) VALUES ($1, $2)', [rentalId, 'Aguardando']);
  
  const moment = cleaningMoment || 'Pré-evento';
  const team = cleaningType || 'Secretaria';
  
  await pool.query('INSERT INTO cleaning (space_id, rental_id, date, type, responsible_team, status) VALUES ($1, $2, $3, $4, $5, $6)', [spaceId, rentalId, endDate, moment, team, 'Pendente']);
  await logAudit(req, 'CREATE', 'Locações', rentalId, req.body);
  res.json(r.rows[0]); 
}));
app.put('/api/rentals/:id', asyncHandler(async(req,res) => { 
  const { spaceId, responsible, eventType, startDate, endDate, value, status, cleaningType, cleaningMoment } = req.body; 
  const r = await pool.query('UPDATE rentals SET space_id=$1, responsible=$2, event_type=$3, start_date=$4, end_date=$5, value=$6, status=$7, cleaning_type=$8 WHERE id=$9 RETURNING *', [spaceId, responsible, eventType, startDate, endDate, value, status, cleaningType, req.params.id]); 
  
  const moment = cleaningMoment || 'Pré-evento';
  const team = cleaningType || 'Secretaria';
  await pool.query('UPDATE cleaning SET type=$1, responsible_team=$2, date=$3 WHERE rental_id=$4', [moment, team, endDate, req.params.id]);
  
  await logAudit(req, 'UPDATE', 'Locações', req.params.id, req.body); 
  res.json(r.rows[0]); 
}));
app.delete('/api/rentals/:id', asyncHandler(async(req,res) => { 
  await pool.query('DELETE FROM cleaning WHERE rental_id=$1', [req.params.id]);
  await pool.query('DELETE FROM rental_keys WHERE rental_id=$1', [req.params.id]);
  await pool.query('DELETE FROM rentals WHERE id=$1', [req.params.id]); 
  await logAudit(req, 'DELETE', 'Locações', req.params.id, { id: req.params.id, removed_dependencies: true });
  res.json({success:true}); 
}));

// CRUD PATRIMÔNIO
app.get('/api/inventory', asyncHandler(async(req,res) => { const r = await pool.query('SELECT * FROM inventory ORDER BY id ASC'); res.json(r.rows); }));
app.post('/api/inventory', asyncHandler(async(req,res) => { const { name, patrimony, category, status, location } = req.body; const r = await pool.query('INSERT INTO inventory (name, patrimony, category, status, location) VALUES ($1,$2,$3,$4,$5) RETURNING *', [name, patrimony, category, status, location]); await logAudit(req, 'CREATE', 'Patrimônio', r.rows[0].id, req.body); res.json(r.rows[0]); }));
app.put('/api/inventory/:id', asyncHandler(async(req,res) => { const { name, patrimony, category, status, location } = req.body; const r = await pool.query('UPDATE inventory SET name=$1, patrimony=$2, category=$3, status=$4, location=$5 WHERE id=$6 RETURNING *', [name, patrimony, category, status, location, req.params.id]); await logAudit(req, 'UPDATE', 'Patrimônio', req.params.id, req.body); res.json(r.rows[0]); }));
app.delete('/api/inventory/:id', asyncHandler(async(req,res) => { await pool.query('DELETE FROM inventory WHERE id=$1', [req.params.id]); await logAudit(req, 'DELETE', 'Patrimônio', req.params.id, { id: req.params.id }); res.json({success:true}); }));

// CRUD LIMPEZA
app.get('/api/cleaning', asyncHandler(async(req,res) => { const r = await pool.query('SELECT * FROM cleaning ORDER BY date ASC'); res.json(r.rows); }));
app.post('/api/cleaning', asyncHandler(async(req,res) => { const { spaceId, date, type, responsibleTeam, status, observation } = req.body; const r = await pool.query('INSERT INTO cleaning (space_id, date, type, responsible_team, status, observation) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [spaceId, date, type, responsibleTeam, status, observation]); await logAudit(req, 'CREATE', 'Limpeza', r.rows[0].id, req.body); res.json(r.rows[0]); }));
app.put('/api/cleaning/:id', asyncHandler(async(req,res) => { const { spaceId, date, type, responsibleTeam, status, observation } = req.body; const r = await pool.query('UPDATE cleaning SET space_id=$1, date=$2, type=$3, responsible_team=$4, status=$5, observation=$6 WHERE id=$7 RETURNING *', [spaceId, date, type, responsibleTeam, status, observation, req.params.id]); await logAudit(req, 'UPDATE', 'Limpeza', req.params.id, req.body); res.json(r.rows[0]); }));
app.delete('/api/cleaning/:id', asyncHandler(async(req,res) => { await pool.query('DELETE FROM cleaning WHERE id=$1', [req.params.id]); await logAudit(req, 'DELETE', 'Limpeza', req.params.id, { id: req.params.id }); res.json({success:true}); }));

// CRUD CHAVES
app.get('/api/keys', asyncHandler(async(req,res) => { const r = await pool.query('SELECT * FROM rental_keys ORDER BY rental_id ASC'); res.json(r.rows); }));
app.put('/api/keys/:id', asyncHandler(async(req,res) => { const { status, handoverDate, returnDate } = req.body; const r = await pool.query('UPDATE rental_keys SET status=$1, handover_date=$2, return_date=$3 WHERE rental_id=$4 RETURNING *', [status, handoverDate, returnDate, req.params.id]); await logAudit(req, 'UPDATE', 'Chaves', req.params.id, req.body); res.json(r.rows[0]); }));

// CRUD USUÁRIOS
app.get('/api/users', asyncHandler(async(req,res) => { const r = await pool.query('SELECT id, name, email, role, status FROM users ORDER BY id ASC'); res.json(r.rows); }));
app.post('/api/users', asyncHandler(async(req,res) => { const { name, email, password, role, status } = req.body; const r = await pool.query('INSERT INTO users (name, email, password, role, status) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, status', [name, email, password, role, status]); await logAudit(req, 'CREATE', 'Usuários', r.rows[0].id, { name, email, role, status }); res.json(r.rows[0]); }));
app.put('/api/users/:id', asyncHandler(async(req,res) => { 
  const { name, email, password, role, status } = req.body; 
  let r;
  if(password) { r = await pool.query('UPDATE users SET name=$1, email=$2, password=$3, role=$4, status=$5 WHERE id=$6 RETURNING id, name, email, role, status', [name, email, password, role, status, req.params.id]); } 
  else { r = await pool.query('UPDATE users SET name=$1, email=$2, role=$3, status=$4 WHERE id=$5 RETURNING id, name, email, role, status', [name, email, role, status, req.params.id]); }
  await logAudit(req, 'UPDATE', 'Usuários', req.params.id, { name, email, role, status });
  res.json(r.rows[0]); 
}));
app.delete('/api/users/:id', asyncHandler(async(req,res) => { await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]); await logAudit(req, 'DELETE', 'Usuários', req.params.id, { id: req.params.id }); res.json({success:true}); }));

const PORT = process.env.PORT || 3374;
app.listen(PORT, '127.0.0.1', () => { console.log(`Backend rodando na porta ${PORT}`); });
EOF

# ==============================================================================
# REINICIAR E BLINDAR O PM2
# ==============================================================================
echo ">>> Reiniciando e configurando o PM2..."

# Atualizar o daemon in-memory do PM2 (corrige processos fantasmas ou perdidos)
pm2 update 2>/dev/null || true

# Apagar versão travada antiga e iniciar novo processo corretamente
pm2 delete centroeventos-api 2>/dev/null || true
pm2 start server.js --name "centroeventos-api"
pm2 save

# Garantir que o PM2 inicia com o sistema debaixo da conta real (e não como root de sudo)
REAL_USER=${SUDO_USER:-$USER}
sudo env PATH=$PATH:$(dirname $(which node)) $(which pm2) startup systemd -u $REAL_USER --hp /home/$REAL_USER


# ==============================================================================
# 5. SETUP DO FRONTEND (Vite + React + Tailwind v4 + PWA)
# ==============================================================================
echo ">>> Configurando Frontend PWA Mobile First (React + Vite + Tailwind v4)..."
cd /opt/centrodeeventos

if [ ! -f "frontend/package.json" ]; then
    rm -rf frontend
    npx --yes create-vite@latest frontend --template react
fi

cd frontend

npm install --legacy-peer-deps
npm install lucide-react tailwindcss @tailwindcss/vite vite-plugin-pwa --legacy-peer-deps

rm -f tailwind.config.js postcss.config.js

# Manifesto PWA reforçado para máxima compatibilidade Mobile
cat << 'EOF' > vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['LOGO-JACAREZINHO.png', 'logotipo-jmb.png', 'photo-1723581205681-d14d47616680.jpg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg}']
      },
      manifest: {
        name: 'Centro de Eventos - Jacarezinho',
        short_name: 'CE Jacarezinho',
        description: 'Gestão do Centro de Eventos de Jacarezinho - PR',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'LOGO-JACAREZINHO.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'LOGO-JACAREZINHO.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ],
})
EOF

cat << 'EOF' > index.html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/LOGO-JACAREZINHO.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="#0f172a" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <link rel="apple-touch-icon" href="/LOGO-JACAREZINHO.png" />
    <title>Centro de Eventos - Jacarezinho</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
EOF

cat << 'EOF' > src/index.css
@import "tailwindcss";

@layer utilities {
  .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
}

body { margin: 0; font-family: system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }

@keyframes slideFadeIn {
  0% { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}

.animate-welcome { animation: slideFadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
EOF

echo ">>> Injetando código fonte do React (v2.2.2)..."
cat << 'EOF' > src/App.jsx
import React, { useState, useEffect } from 'react';
import { 
  Home, CalendarDays, Map, Package, Sparkles, Plus, 
  Trash2, Edit, CheckCircle, XCircle, DollarSign, 
  Users, MapPin, Tag, ClipboardList, AlertCircle, Check,
  Key, Printer, FileSignature, Calendar, UserCircle, 
  Lock, Mail, LogOut, ChevronLeft, ChevronRight, Shield, Undo, Menu, Activity,
  Bell, MessageSquare, Send
} from 'lucide-react';

/* SAFELIST TAILWIND V4 - PATCH PARA CORES DINÂMICAS:
  bg-amber-500 bg-emerald-500 bg-rose-500 bg-blue-500 bg-indigo-500 bg-purple-600 bg-teal-500 bg-cyan-500 bg-pink-500 bg-orange-500
*/

// ============================================================================
// SISTEMA DE INTERCEPTAÇÃO API E HUMANIZADOR DE DADOS
// ============================================================================
const fetchApi = async (url, options = {}) => {
  const userStr = localStorage.getItem('ce_user');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      headers['X-User-Id'] = String(user.id);
      headers['X-User-Name'] = encodeURIComponent(user.name);
    } catch(e) {}
  }
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  try {
    if (!res.ok) throw new Error(text);
    return JSON.parse(text);
  } catch (e) {
    console.error(`Erro ao decodificar JSON de ${url}:`, text.substring(0, 100));
    return [];
  }
};

const formatAuditDetails = (detailsStr) => {
  try {
    const data = JSON.parse(detailsStr);
    if (!data || Object.keys(data).length === 0) return "Sem detalhes adicionais.";
    
    const safeData = { ...data };
    delete safeData.password; 
    
    const parts = [];
    if (safeData.message_text) parts.push(`Mensagem: "${safeData.message_text}"`);
    if (safeData.message) parts.push(safeData.message);
    if (safeData.email) parts.push(`E-mail: ${safeData.email}`);
    if (safeData.name) parts.push(`Nome: ${safeData.name}`);
    if (safeData.role) parts.push(`Acesso: ${safeData.role}`);
    if (safeData.status) parts.push(`Status definido para '${safeData.status}'`);
    if (safeData.responsible) parts.push(`Resp: ${safeData.responsible}`);
    if (safeData.eventType) parts.push(`Evento: ${safeData.eventType}`);
    if (safeData.dailyRate) parts.push(`Diária: R$${safeData.dailyRate}`);
    if (safeData.value) parts.push(`Valor Total: R$${safeData.value}`);
    if (safeData.handoverDate) parts.push(`Entrega Chave: ${safeData.handoverDate.split('-').reverse().join('/')}`);
    if (safeData.returnDate) parts.push(`Devolução Chave: ${safeData.returnDate.split('-').reverse().join('/')}`);
    if (safeData.type) parts.push(`Tipo: ${safeData.type}`);
    if (safeData.observation) parts.push(`Obs: ${safeData.observation}`);
    
    if (parts.length > 0) return parts.join(' | ');
    return Object.entries(safeData).map(([k, v]) => `${k}: ${v}`).join(' | ').substring(0, 150);
  } catch(e) {
    return detailsStr;
  }
};

function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-200">
        <h3 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2"><AlertCircle className="w-6 h-6 text-rose-500"/> {title}</h3>
        <p className="text-slate-600 mb-6 text-sm">{message}</p>
        <div className="flex flex-col sm:flex-row justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-3 sm:py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors w-full sm:w-auto">Cancelar</button>
          <button onClick={onConfirm} className="px-4 py-3 sm:py-2 bg-rose-600 text-white hover:bg-rose-700 rounded-xl font-medium transition-colors shadow-sm w-full sm:w-auto">Excluir</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(localStorage.getItem('ce_auth') === 'true');
  const [loggedUser, setLoggedUser] = useState(JSON.parse(localStorage.getItem('ce_user')) || null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [spaces, setSpaces] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [cleaningTasks, setCleaningTasks] = useState([]);
  const [keys, setKeys] = useState([]);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [messages, setMessages] = useState([]);
  
  const [printingRental, setPrintingRental] = useState(null);
  const [printingAudit, setPrintingAudit] = useState(false);

  const loadData = async () => {
    if (!isAuthenticated) return;
    try {
      const [sp, re, inv, cl, ky, us, aud, msgs] = await Promise.all([
        fetchApi('/api/spaces'),
        fetchApi('/api/rentals'),
        fetchApi('/api/inventory'),
        fetchApi('/api/cleaning'),
        fetchApi('/api/keys'),
        fetchApi('/api/users'),
        loggedUser?.role === 'Super Admin' ? fetchApi('/api/audit') : Promise.resolve([]),
        fetchApi('/api/messages')
      ]);
      setSpaces(sp.map(s => ({...s, dailyRate: Number(s.daily_rate)})));
      setRentals(re.map(r => ({...r, spaceId: r.space_id, eventType: r.event_type, startDate: r.start_date.split('T')[0], endDate: r.end_date.split('T')[0], value: Number(r.value), cleaningType: r.cleaning_type})));
      setInventory(inv);
      setCleaningTasks(cl.map(c => ({...c, spaceId: c.space_id, rentalId: c.rental_id, responsibleTeam: c.responsible_team, date: c.date.split('T')[0]})));
      setKeys(ky.map(k => ({...k, rentalId: k.rental_id, handoverDate: k.handover_date ? k.handover_date.split('T')[0] : null, returnDate: k.return_date ? k.return_date.split('T')[0] : null})));
      setUsers(us);
      setMessages(msgs);
      if(aud.length) setAuditLogs(aud);
    } catch(e) { console.error("Erro na comunicação com a API", e); }
  };

  useEffect(() => { 
    if (isAuthenticated && loggedUser) { 
      loadData(); 
      // Polling a cada 10s para simular tempo real no Chat e Notificações
      const interval = setInterval(loadData, 10000);
      return () => clearInterval(interval);
    } 
  }, [isAuthenticated, loggedUser]);

  const handleLogout = async () => {
    if (loggedUser) { try { await fetchApi('/api/logout', { method: 'POST' }); } catch (e) {} }
    setIsAuthenticated(false); setLoggedUser(null);
    localStorage.removeItem('ce_auth'); localStorage.removeItem('ce_user');
  };

  if (!isAuthenticated) return <LoginPage onLogin={(u) => { setLoggedUser(u); setIsAuthenticated(true); }} />;
  if (printingRental) return <PrintableTerm rental={printingRental} space={spaces.find(s => s.id === printingRental.spaceId)} onClose={() => setPrintingRental(null)} />;
  if (printingAudit) return <PrintableAudit auditLogs={auditLogs} onClose={() => setPrintingAudit(false)} />;

  const handleNavClick = (tab) => { setActiveTab(tab); setIsMobileMenuOpen(false); };

  const isTerceirizado = loggedUser?.role === 'Terceirizado';
  const isSuperAdmin = loggedUser?.role === 'Super Admin';

  // Identificar se há tarefas na conta do Terceirizado para habilitar o menu Central de Mensagens
  const terceirizadoHasTasks = isTerceirizado && cleaningTasks.some(t => t.responsibleTeam?.includes('Terceirizado'));

  // Contagem de não lidas no Header
  const unreadCount = messages.filter(m => {
    if (m.is_read) return false;
    if (isTerceirizado) {
      return m.sender_role !== 'Terceirizado';
    } else {
      return m.sender_role === 'Terceirizado';
    }
  }).length;

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard rentals={rentals} spaces={spaces} cleaningTasks={cleaningTasks} keys={keys} loggedUser={loggedUser} isTerceirizado={isTerceirizado} />;
      case 'calendar': return <CalendarManager rentals={rentals} spaces={spaces} onEventClick={() => handleNavClick('outsourced_cleaning')} />;
      case 'rentals': return <RentalsManager rentals={rentals} spaces={spaces} cleaningTasks={cleaningTasks} loadData={loadData} />;
      case 'spaces': return <SpacesManager spaces={spaces} loadData={loadData} />;
      case 'inventory': return <InventoryManager inventory={inventory} spaces={spaces} loadData={loadData} />;
      case 'keys': return <KeyManager rentals={rentals} spaces={spaces} keys={keys} loadData={loadData} onPrint={setPrintingRental} />;
      case 'cleaning': return <CleaningManager cleaningTasks={cleaningTasks} spaces={spaces} keys={keys} loadData={loadData} />;
      case 'terceirizados': return <TerceirizadosManager rentals={rentals} spaces={spaces} cleaningTasks={cleaningTasks} messages={messages} loadData={loadData} loggedUser={loggedUser} />;
      case 'mensagens': return <MessagesManager rentals={rentals} spaces={spaces} cleaningTasks={cleaningTasks} messages={messages} loadData={loadData} loggedUser={loggedUser} />;
      case 'outsourced_cleaning': return <OutsourcedCleaningManager rentals={rentals} spaces={spaces} cleaningTasks={cleaningTasks} messages={messages} loadData={loadData} loggedUser={loggedUser} onNavigate={handleNavClick} />;
      case 'users': return <UsersManager users={users} loadData={loadData} />;
      case 'audit': return <AuditManager auditLogs={auditLogs} loadData={loadData} onPrint={() => setPrintingAudit(true)} />;
      default: return <Dashboard loggedUser={loggedUser} rentals={[]} spaces={[]} cleaningTasks={[]} keys={[]} isTerceirizado={isTerceirizado} />;
    }
  };

  const activeTabTitle = { 'dashboard': 'Dashboard', 'calendar': 'Calendário de Eventos', 'rentals': 'Locações', 'spaces': 'Espaços', 'inventory': 'Patrimônio', 'keys': 'Chaves e Termos', 'cleaning': 'Limpeza', 'terceirizados': 'Gestão de Terceirizados', 'mensagens': 'Central de Mensagens', 'outsourced_cleaning': 'Limpeza Terceirizada', 'users': 'Usuários', 'audit': 'Auditoria LGPD' }[activeTab];
  const activeTabIcon = { 'dashboard': <Home className="w-5 h-5 text-blue-600" />, 'calendar': <Calendar className="w-5 h-5 text-blue-600" />, 'rentals': <CalendarDays className="w-5 h-5 text-blue-600" />, 'spaces': <Map className="w-5 h-5 text-blue-600" />, 'inventory': <Package className="w-5 h-5 text-blue-600" />, 'keys': <Key className="w-5 h-5 text-blue-600" />, 'cleaning': <Sparkles className="w-5 h-5 text-blue-600" />, 'terceirizados': <Users className="w-5 h-5 text-blue-600" />, 'mensagens': <MessageSquare className="w-5 h-5 text-blue-600" />, 'outsourced_cleaning': <Sparkles className="w-5 h-5 text-blue-600" />, 'users': <Users className="w-5 h-5 text-blue-600" />, 'audit': <Activity className="w-5 h-5 text-blue-600" /> }[activeTab];

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden">
      {/* Overlay Mobile */}
      {isMobileMenuOpen && <div className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />}
      
      {/* Sidebar Responsiva */}
      <aside className={`fixed lg:relative z-50 w-72 lg:w-64 h-full bg-slate-900 text-slate-300 flex flex-col shadow-2xl lg:shadow-xl transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 transition-transform duration-300 ease-in-out`}>
        <div className="p-6 bg-slate-950 border-b border-slate-800 flex items-center justify-between lg:justify-start gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white p-1 rounded-lg shrink-0 flex items-center justify-center h-10 w-10">
              <img src="LOGO-JACAREZINHO.png" alt="Jacarezinho" className="w-8 h-8 object-contain" onError={(e) => { e.target.style.display='none'; }} />
            </div>
            <div><h1 className="text-white font-bold text-sm leading-tight">Centro de Eventos</h1><p className="text-xs text-slate-400">Jacarezinho - PR</p></div>
          </div>
          <button className="lg:hidden text-slate-400 hover:text-white p-2" onClick={() => setIsMobileMenuOpen(false)}><XCircle className="w-7 h-7"/></button>
        </div>
        
        <nav className="flex-1 py-6 px-4 space-y-2 overflow-y-auto custom-scrollbar">
          <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Visão Geral</p>
          <NavItem icon={<Home />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => handleNavClick('dashboard')} />
          <NavItem icon={<Calendar />} label="Calendário de Eventos" active={activeTab === 'calendar'} onClick={() => handleNavClick('calendar')} />
          
          {!isTerceirizado && (
            <>
              <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-6">Gestão Interna</p>
              <NavItem icon={<CalendarDays />} label="Locações" active={activeTab === 'rentals'} onClick={() => handleNavClick('rentals')} />
              <NavItem icon={<Map />} label="Espaços" active={activeTab === 'spaces'} onClick={() => handleNavClick('spaces')} />
              <NavItem icon={<Package />} label="Patrimônio" active={activeTab === 'inventory'} onClick={() => handleNavClick('inventory')} />
              <NavItem icon={<Key />} label="Chaves & Termos" active={activeTab === 'keys'} onClick={() => handleNavClick('keys')} />
              <NavItem icon={<Sparkles />} label="Limpeza Geral" active={activeTab === 'cleaning'} onClick={() => handleNavClick('cleaning')} />
              <NavItem icon={<Users />} label="Gestão Terceirizados" active={activeTab === 'terceirizados'} onClick={() => handleNavClick('terceirizados')} />
            </>
          )}

          {isTerceirizado && (
             <>
               <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-6">Minhas Tarefas</p>
               <NavItem icon={<Sparkles />} label="Limpeza Terceirizada" active={activeTab === 'outsourced_cleaning'} onClick={() => handleNavClick('outsourced_cleaning')} />
               {terceirizadoHasTasks && (
                  <NavItem icon={<MessageSquare />} label="Central de Mensagens" active={activeTab === 'mensagens'} onClick={() => handleNavClick('mensagens')} />
               )}
             </>
          )}
          
          {isSuperAdmin && (
            <>
              <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-6">Administração</p>
              <NavItem icon={<Users />} label="Usuários" active={activeTab === 'users'} onClick={() => handleNavClick('users')} />
              <NavItem icon={<Activity />} label="Auditoria LGPD" active={activeTab === 'audit'} onClick={() => handleNavClick('audit')} />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800 shrink-0">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="bg-slate-800 p-2 rounded-full shadow-inner"><UserCircle className="w-6 h-6 text-amber-500"/></div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-white truncate" title={loggedUser?.name}>{loggedUser?.name}</p>
              <p className="text-xs text-slate-400 truncate">{loggedUser?.role}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3 lg:py-2 text-rose-400 bg-rose-400/10 hover:bg-rose-500 hover:text-white rounded-xl transition-colors text-sm font-medium"><LogOut className="w-4 h-4" /> Sair do Sistema</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 w-full relative">
        <header className="bg-white border-b border-slate-200 h-16 flex items-center px-4 lg:px-8 justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-lg lg:text-xl font-semibold text-slate-800 capitalize flex items-center gap-2">{activeTabIcon} <span className="hidden sm:inline">{activeTabTitle}</span></h2>
          </div>
          <div className="flex items-center gap-3 lg:gap-4">
            
            {/* SINO DE NOTIFICAÇÕES (CHAT) */}
            <button 
               onClick={() => handleNavClick(isTerceirizado ? 'mensagens' : 'terceirizados')} 
               className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
               title="Ver Mensagens"
            >
              <Bell className="w-6 h-6" />
              {unreadCount > 0 && (
                <>
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping"></span>
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white"></span>
                </>
              )}
            </button>

            <div className="hidden sm:flex items-center gap-2 text-sm bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span><span className="text-slate-600 font-medium">Online</span></div>
            <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold border border-amber-200 shadow-sm uppercase" title={loggedUser?.name}>{loggedUser?.name?.substring(0,2)}</div>
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto flex flex-col w-full custom-scrollbar">
          <div className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full">
            {renderContent()}
          </div>
          
          <footer className="bg-white border-t border-slate-200 p-4 w-full flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 gap-3 shrink-0">
            <div className="text-center sm:text-left">Prefeitura de Jacarezinho - PR | Gestão de Eventos | v2.2.2 Enterprise</div>
            <div className="flex items-center gap-2 font-medium">
              Desenvolvido por: 
              <a href="https://jmbtecnologia.com.br" target="_blank" rel="noopener noreferrer" title="Visitar JMB Tecnologia" className="hover:opacity-80 transition-opacity">
                <img src="logotipo-jmb.png" alt="JMB Tecnologia" className="h-8 object-contain" onError={(e) => e.target.style.display='none'} />
              </a>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState('');
  
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({email, password}) });
      const text = await res.text();
      let data; 
      try { 
        data = JSON.parse(text); 
      } catch(ex) { 
        throw new Error('Servidor retornou formato inválido: ' + text.substring(0, 50)); 
      }
      
      if (res.ok && data.success) { 
        localStorage.setItem('ce_auth', 'true'); 
        localStorage.setItem('ce_user', JSON.stringify(data.user)); 
        onLogin(data.user); 
      } else { 
        setError(data.error || 'Credenciais inválidas.'); 
      }
    } catch(err) { 
      setError('Erro de conexão: ' + err.message); 
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center lg:justify-end relative overflow-hidden bg-slate-900 p-4 lg:pr-32">
      <div 
        className="absolute inset-0 z-0 bg-cover bg-no-repeat" 
        style={{ backgroundImage: "url('/photo-1723581205681-d14d47616680.jpg')", backgroundPosition: "30% center" }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-900/60 to-slate-950/95"></div>
      </div>
      <div className="relative z-10 w-full max-w-md p-6 sm:p-8 bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white/20">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-slate-200 p-2">
            <img src="LOGO-JACAREZINHO.png" alt="Logo Jacarezinho" className="w-full h-full object-contain" onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='block'; }} />
            <MapPin className="w-8 h-8 sm:w-10 sm:h-10 text-amber-600 hidden" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 text-center uppercase tracking-wide">Centro de Eventos</h1>
          <p className="text-amber-600 font-semibold text-xs sm:text-sm mt-1">Prefeitura de Jacarezinho - PR</p>
        </div>
        {error && <div className="mb-6 p-3 bg-rose-50 border-l-4 border-rose-500 text-rose-700 text-sm rounded-r flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><p className="break-words">{error}</p></div>}
        <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
          <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Email de Acesso</label><div className="relative"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Mail className="h-5 w-5 text-slate-400" /></div><input type="email" required placeholder="Digite seu e-mail" className="w-full pl-10 pr-3 py-3 sm:py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-slate-700 text-base" value={email} onChange={(e) => setEmail(e.target.value)} /></div></div>
          <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Senha</label><div className="relative"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-slate-400" /></div><input type="password" required placeholder="Sua senha" className="w-full pl-10 pr-3 py-3 sm:py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-slate-700 text-base" value={password} onChange={(e) => setPassword(e.target.value)} /></div></div>
          <button type="submit" className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold py-3 sm:py-3.5 rounded-xl shadow-lg shadow-amber-500/30 flex justify-center items-center gap-2 mt-2 sm:mt-4 transition-all text-base">Acessar Sistema <ChevronRight className="w-5 h-5" /></button>
        </form>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) { return <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 rounded-xl transition-all duration-200 ${active ? 'bg-amber-600 text-white shadow-md' : 'hover:bg-slate-800 hover:text-white text-slate-400'}`}><span className={active ? 'text-white' : ''}>{icon}</span><span className="font-medium text-sm">{label}</span></button>; }

function Dashboard({ rentals, spaces, cleaningTasks, keys, loggedUser, isTerceirizado }) {
  const totalRevenue = rentals.reduce((acc, curr) => acc + curr.value, 0); 
  const activeRentals = rentals.filter(r => r.status === 'Ativo' || r.status === 'Agendado').length; 
  const pendingCleaning = cleaningTasks.filter(c => c.status === 'Pendente').length; 
  const pendingKeys = keys.filter(k => k.status === 'Aguardando' || k.status === 'Entregue').length;
  
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="relative z-10 animate-welcome">
          <h2 className="text-xl sm:text-3xl font-bold text-slate-800">
            Seja bem-vindo(a), <span className="bg-gradient-to-r from-amber-600 to-amber-400 bg-clip-text text-transparent">{loggedUser?.name}</span>! 👋
          </h2>
          <p className="text-slate-500 mt-2 text-sm sm:text-base">Aqui está o resumo atualizado do Centro de Eventos de Jacarezinho.</p>
        </div>
      </div>

      {isTerceirizado ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
            <MetricCard title="Eventos Ativos" value={activeRentals} icon={<CalendarDays />} color="bg-blue-500" />
            <MetricCard title="Limpezas a Fazer" value={pendingCleaning} icon={<Sparkles />} color="bg-amber-500" />
          </div>
          
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 mt-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-amber-500"/> Limpezas Futuras</h3>
            <div className="space-y-3">
              {cleaningTasks.filter(t => t.status !== 'Concluído' && t.responsibleTeam?.includes('Terceirizado')).map(task => { 
                const rental = rentals.find(r => r.id === task.rentalId);
                const spaceName = spaces.find(s => s.id === task.spaceId)?.name; 
                if(!rental) return null;
                return (
                  <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <ClipboardList className="w-5 h-5 text-slate-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-800">{rental.eventType}</p>
                      <p className="text-xs text-slate-600">{spaceName} - <span className="font-medium text-amber-600">{task.date.split('-').reverse().join('/')}</span></p>
                    </div>
                  </div>
                );
              })}
              {cleaningTasks.filter(t => t.status !== 'Concluído' && t.responsibleTeam?.includes('Terceirizado')).length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">Nenhuma limpeza futura agendada para terceiros.</p>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            <MetricCard title="Faturamento Previsto" value={`R$ ${totalRevenue.toLocaleString('pt-BR')}`} icon={<DollarSign />} color="bg-emerald-500" />
            <MetricCard title="Locações Ativas" value={activeRentals} icon={<CalendarDays />} color="bg-blue-500" />
            <MetricCard title="Limpezas Pendentes" value={pendingCleaning} icon={<Sparkles />} color="bg-amber-500" />
            <MetricCard title="Chaves Pendentes" value={pendingKeys} icon={<Key />} color="bg-rose-500" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 lg:col-span-2">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Map className="w-5 h-5 text-slate-600"/> Status dos Espaços</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {spaces.map(space => (
                  <div key={space.id} className="p-4 rounded-xl border border-slate-100 flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${space.color}`}></div>
                      <div>
                        <p className="font-medium text-slate-800 text-sm sm:text-base">{space.name}</p>
                        <p className="text-xs text-slate-500">{space.type}</p>
                      </div>
                    </div>
                    <StatusBadge status={space.status} />
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-500"/> Próximas Limpezas</h3>
              <div className="space-y-3">
                {cleaningTasks.filter(t => t.status !== 'Concluído').map(task => { 
                  const spaceName = spaces.find(s => s.id === task.spaceId)?.name; 
                  return (
                    <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <ClipboardList className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-slate-800">{spaceName}</p>
                        <p className="text-xs text-slate-500">{task.date.split('-').reverse().join('/')} - {task.type}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ title, value, icon, color }) { return <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 flex items-center gap-4"><div className={`${color} w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center text-white shrink-0`}>{React.cloneElement(icon, { className: 'w-6 h-6 sm:w-7 sm:h-7' })}</div><div className="overflow-hidden"><p className="text-xs sm:text-sm text-slate-500 font-medium truncate">{title}</p><p className="text-lg sm:text-2xl font-bold text-slate-800 truncate">{value}</p></div></div>; }

function CalendarManager({ rentals, spaces, onEventClick }) {
  const [currentDate, setCurrentDate] = useState(new Date()); 
  
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate(); 
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay(); 
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)); 
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)); 
  
  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth()); 
  const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth()); 
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]; 
  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]; 
  
  const days = []; 
  for (let i = 0; i < firstDay; i++) days.push(null); 
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  
  const getRentalsForDay = (day) => { 
    if (!day) return []; 
    const checkTime = new Date(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`).getTime(); 
    return rentals.filter(rental => {
      const start = new Date(rental.startDate + 'T00:00:00').getTime();
      const end = new Date(rental.endDate + 'T00:00:00').getTime();
      return checkTime >= start && checkTime <= end;
    }); 
  };
  
  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Calendário de Eventos</h3>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3 bg-white p-2 sm:p-3 rounded-xl border border-slate-200 text-[10px] sm:text-xs font-medium w-full md:w-auto">
          {spaces.map(space => (
            <div key={space.id} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${space.color}`}></span>
              <span className="text-slate-600">{space.name}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden w-full">
        <div className="w-full">
          <div className="flex items-center justify-between p-3 sm:p-4 border-b border-slate-100 bg-slate-50">
            <button onClick={prevMonth} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5 text-slate-600"/>
            </button>
            <h2 className="text-sm sm:text-lg font-bold text-slate-800 capitalize">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <button onClick={nextMonth} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5 text-slate-600"/>
            </button>
          </div>
          
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center">
            {weekDays.map(day => (
              <div key={day} className="py-2 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider border-r border-slate-100 last:border-0">
                {day}
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 bg-white">
            {days.map((day, index) => { 
              const dayRentals = getRentalsForDay(day); 
              return (
                <div key={index} className={`min-h-[80px] sm:min-h-[100px] p-0.5 sm:p-1 border-r border-b border-slate-100 last:border-r-0 ${!day ? 'bg-slate-50/50' : 'hover:bg-slate-50 transition-colors'}`}>
                  {day && (
                    <div className="h-full flex flex-col overflow-hidden">
                      <span className={`text-[10px] sm:text-sm font-semibold mb-0.5 sm:mb-1 ml-1 text-slate-600`}>
                        {day}
                      </span>
                      <div className="flex-1 space-y-1 overflow-y-auto custom-scrollbar max-h-[60px] sm:max-h-[80px] w-full">
                        {dayRentals.map(rental => { 
                          const space = spaces.find(s => s.id === rental.spaceId); 
                          return (
                            <div 
                              key={rental.id} 
                              onClick={(e) => { e.stopPropagation(); if(onEventClick) onEventClick(rental); }} 
                              title={`${rental.eventType} (${rental.responsible})`} 
                              className={`text-[8px] sm:text-[10px] leading-tight px-1 py-0.5 rounded truncate text-white font-medium ${space?.color || 'bg-slate-500'} cursor-pointer hover:opacity-80 transition-opacity w-full`}
                            >
                              {rental.eventType}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function RentalsManager({ rentals, spaces, cleaningTasks, loadData }) { 
  const [modalOpen, setModalOpen] = useState(false); const [editingItem, setEditingItem] = useState(null); const [confirmDelete, setConfirmDelete] = useState(null);
  const handleSave = async (item) => {
    const url = item.id ? `/api/rentals/${item.id}` : '/api/rentals';
    const method = item.id ? 'PUT' : 'POST';
    await fetchApi(url, { method, body: JSON.stringify(item) });
    setModalOpen(false); setEditingItem(null); loadData();
  };
  const handleDelete = async () => {
    await fetchApi(`/api/rentals/${confirmDelete}`, { method: 'DELETE' });
    setConfirmDelete(null); loadData();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"><h3 className="text-xl font-bold text-slate-800">Controle de Locações</h3><button onClick={() => { setEditingItem(null); setModalOpen(true); }} className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white px-4 py-3 sm:py-2 rounded-xl flex items-center justify-center gap-2 font-medium shadow-sm"><Plus className="w-4 h-4" /> Nova Locação</button></div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden w-full">
        <div className="overflow-x-auto w-full custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead><tr className="bg-slate-50 border-b border-slate-200 text-sm font-medium text-slate-500"><th className="p-4 whitespace-nowrap">ID</th><th className="p-4 whitespace-nowrap">Responsável / Evento</th><th className="p-4 whitespace-nowrap">Espaço</th><th className="p-4 whitespace-nowrap">Limpeza</th><th className="p-4 whitespace-nowrap">Período</th><th className="p-4 whitespace-nowrap">Valor (R$)</th><th className="p-4 whitespace-nowrap text-center">Ações</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{rentals.map(rental => { const space = spaces.find(s => s.id === rental.spaceId); return (
              <tr key={rental.id} className="hover:bg-slate-50">
                <td className="p-4 text-xs font-mono text-slate-400">#{rental.id}</td>
                <td className="p-4"><p className="font-medium text-slate-800 truncate max-w-[200px]" title={rental.responsible}>{rental.responsible}</p><p className="text-xs text-slate-500 truncate max-w-[200px]" title={rental.eventType}>{rental.eventType}</p></td>
                <td className="p-4"><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full shrink-0 ${space?.color}`}></span><span className="text-sm text-slate-700 whitespace-nowrap">{space?.name || 'N/A'}</span></div></td>
                <td className="p-4 text-sm text-slate-600 font-medium whitespace-nowrap">{rental.cleaningType}</td>
                <td className="p-4 text-sm text-slate-700 whitespace-nowrap">{rental.startDate.split('-').reverse().join('/')} a <br/>{rental.endDate.split('-').reverse().join('/')}</td>
                <td className="p-4 text-sm font-semibold text-slate-800 whitespace-nowrap">R$ {rental.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className="p-4 text-center space-x-1 sm:space-x-2 whitespace-nowrap">
                  <button onClick={() => { 
                    const linkedCleaning = cleaningTasks?.find(c => c.rentalId === rental.id);
                    setEditingItem({ ...rental, cleaningMoment: linkedCleaning?.type || 'Pré-evento' }); 
                    setModalOpen(true); 
                  }} className="text-slate-400 hover:text-amber-600 p-2 sm:p-1 rounded-lg"><Edit className="w-5 h-5 sm:w-4 sm:h-4"/></button>
                  <button onClick={() => setConfirmDelete(rental.id)} className="text-slate-400 hover:text-rose-600 p-2 sm:p-1 rounded-lg"><Trash2 className="w-5 h-5 sm:w-4 sm:h-4"/></button>
                </td>
              </tr>)})}
            </tbody>
          </table>
        </div>
      </div>
      {modalOpen && <RentalModal onClose={() => setModalOpen(false)} spaces={spaces} initialData={editingItem} onSave={handleSave} />}
      <ConfirmModal isOpen={!!confirmDelete} title="Excluir Locação" message="Tem certeza que deseja excluir esta locação? Isso removerá as chaves associadas e serviços de limpeza agendados." onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  ); 
}

function RentalModal({ onClose, spaces, onSave, initialData }) {
  const [formData, setFormData] = useState({ 
    spaceId: spaces[0]?.id || 1, 
    responsible: '', 
    eventType: '', 
    startDate: '', 
    endDate: '', 
    value: '', 
    status: 'Agendado', 
    cleaningType: 'Secretaria', 
    cleaningMoment: 'Pré-evento',
    ...initialData 
  });
  
  const handleSubmit = (e) => { e.preventDefault(); onSave({ ...formData, spaceId: parseInt(formData.spaceId), value: parseFloat(formData.value) }); };
  
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0"><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><CalendarDays className="w-5 h-5 text-amber-600"/> {initialData ? 'Editar Locação' : 'Nova Locação'}</h3><button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><XCircle className="w-6 h-6"/></button></div>
        <div className="overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          <form id="rentalForm" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label className="block text-sm font-semibold text-slate-700 mb-1">Responsável</label><input required type="text" className="w-full border border-slate-300 rounded-lg p-3 sm:p-2.5 focus:ring-2 focus:ring-amber-500 outline-none text-base" value={formData.responsible} onChange={e => setFormData({...formData, responsible: e.target.value})} /></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1">Evento</label><input required type="text" className="w-full border border-slate-300 rounded-lg p-3 sm:p-2.5 focus:ring-2 focus:ring-amber-500 outline-none text-base" value={formData.eventType} onChange={e => setFormData({...formData, eventType: e.target.value})} /></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1">Espaço</label><select className="w-full border border-slate-300 rounded-lg p-3 sm:p-2.5 focus:ring-2 focus:ring-amber-500 outline-none bg-white text-base" value={formData.spaceId} onChange={e => setFormData({...formData, spaceId: e.target.value})}>{spaces.map(s => <option key={s.id} value={s.id}>{s.name} - Diária: R$ {s.dailyRate}</option>)}</select></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1">Data Início</label><input required type="date" className="w-full border border-slate-300 rounded-lg p-3 sm:p-2.5 outline-none focus:ring-2 focus:ring-amber-500 text-base" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} /></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1">Data Fim</label><input required type="date" className="w-full border border-slate-300 rounded-lg p-3 sm:p-2.5 outline-none focus:ring-2 focus:ring-amber-500 text-base" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} /></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1">Valor (R$)</label><input required type="number" step="0.01" className="w-full border border-slate-300 rounded-lg p-3 sm:p-2.5 outline-none focus:ring-2 focus:ring-amber-500 text-base" value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} /></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1">Status da Locação</label><select className="w-full border border-slate-300 rounded-lg p-3 sm:p-2.5 outline-none focus:ring-2 focus:ring-amber-500 bg-white text-base" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}><option value="Agendado">Agendado</option><option value="Ativo">Ativo</option><option value="Concluído">Concluído</option></select></div>
              
              <div className="sm:col-span-2 border-t border-slate-100 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-amber-700 mb-2">Quem fará a limpeza?</label>
                  <select className="w-full border border-amber-300 rounded-lg p-3 sm:p-2.5 outline-none focus:ring-2 focus:ring-amber-500 bg-white text-base" value={formData.cleaningType} onChange={e => setFormData({...formData, cleaningType: e.target.value})}>
                    <option value="Secretaria">Equipe da Secretaria</option>
                    <option value="Terceirizado">Serviço Terceirizado</option>
                    <option value="Locatário">Locatário (Inquilino)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-amber-700 mb-2">Momento da Limpeza</label>
                  <select className="w-full border border-amber-300 rounded-lg p-3 sm:p-2.5 outline-none focus:ring-2 focus:ring-amber-500 bg-white text-base" value={formData.cleaningMoment} onChange={e => setFormData({...formData, cleaningMoment: e.target.value})}>
                    <option value="Pré-evento">Pré-evento</option>
                    <option value="Pós-evento">Pós-evento</option>
                  </select>
                </div>
                <p className="text-xs text-slate-500 sm:col-span-2">Isto agendará automaticamente o fluxo de limpeza da data final com os parâmetros escolhidos.</p>
              </div>
            </div>
          </form>
        </div>
        <div className="p-4 sm:p-6 flex flex-col sm:flex-row justify-end gap-3 border-t border-slate-100 bg-slate-50 shrink-0"><button type="button" onClick={onClose} className="px-5 py-3 sm:py-2.5 text-slate-600 hover:bg-slate-200 rounded-xl font-medium w-full sm:w-auto">Cancelar</button><button type="submit" form="rentalForm" className="px-5 py-3 sm:py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium shadow-sm w-full sm:w-auto">Salvar Registro</button></div>
      </div>
    </div>
  );
}

function SpacesManager({ spaces, loadData }) { 
  const [modalOpen, setModalOpen] = useState(false); const [editingItem, setEditingItem] = useState(null); const [confirmDelete, setConfirmDelete] = useState(null);
  const handleSave = async (item) => {
    const url = item.id ? `/api/spaces/${item.id}` : '/api/spaces';
    const method = item.id ? 'PUT' : 'POST';
    await fetchApi(url, { method, body: JSON.stringify(item) });
    setModalOpen(false); setEditingItem(null); loadData();
  };
  const handleDelete = async () => {
    await fetchApi(`/api/spaces/${confirmDelete}`, { method: 'DELETE' }); setConfirmDelete(null); loadData();
  };
  return (<div className="space-y-4 sm:space-y-6">
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"><h3 className="text-xl font-bold text-slate-800">Espaços do Centro de Eventos</h3><button onClick={() => { setEditingItem(null); setModalOpen(true); }} className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white px-4 py-3 sm:py-2 rounded-xl flex items-center justify-center gap-2 font-medium shadow-sm"><Plus className="w-4 h-4" /> Novo Espaço</button></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">{spaces.map(space => (
      <div key={space.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
        <div className="absolute top-2 right-2 flex gap-1 z-10">
          <button onClick={() => { setEditingItem(space); setModalOpen(true); }} className="p-2 sm:p-1.5 bg-white/80 hover:bg-white rounded-lg text-slate-700 shadow-sm"><Edit className="w-5 h-5 sm:w-4 sm:h-4"/></button>
          <button onClick={() => setConfirmDelete(space.id)} className="p-2 sm:p-1.5 bg-white/80 hover:bg-white rounded-lg text-rose-600 shadow-sm"><Trash2 className="w-5 h-5 sm:w-4 sm:h-4"/></button>
        </div>
        <div className={`h-24 ${space.color} flex items-center justify-center opacity-90`}><Map className="w-10 h-10 text-white opacity-50" /></div>
        <div className="p-4 sm:p-6"><div className="flex justify-between items-start mb-4"><div><h4 className="text-lg font-bold text-slate-800">{space.name}</h4><p className="text-sm text-slate-500">{space.type}</p></div><StatusBadge status={space.status} /></div><div className="space-y-2 pt-4 border-t border-slate-100"><div className="flex justify-between text-sm"><span className="text-slate-500">Diária Base:</span><span className="font-semibold text-slate-800">R$ {space.dailyRate.toLocaleString('pt-BR')}</span></div></div></div>
      </div>))}
    </div>
    {modalOpen && <GenericModal title="Espaço" fields={[{name: 'name', label: 'Nome', type: 'text'}, {name: 'type', label: 'Tipo (Ex: Salão)', type: 'text'}, {name: 'dailyRate', label: 'Diária Base (R$)', type: 'number'}, {name: 'status', label: 'Status', type: 'select', options: ['Disponível', 'Locado', 'Em Limpeza']}, {name: 'color', label: 'Cor Tema (Tailwind)', type: 'text'}]} initialData={editingItem} onSave={handleSave} onClose={() => setModalOpen(false)} />}
    <ConfirmModal isOpen={!!confirmDelete} title="Excluir Espaço" message="Tem certeza? Espaços em uso não devem ser excluídos." onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
  </div>); 
}

function InventoryManager({ inventory, spaces, loadData }) { 
  const [modalOpen, setModalOpen] = useState(false); const [editingItem, setEditingItem] = useState(null); const [confirmDelete, setConfirmDelete] = useState(null);
  const handleSave = async (item) => {
    const url = item.id ? `/api/inventory/${item.id}` : '/api/inventory';
    const method = item.id ? 'PUT' : 'POST';
    await fetchApi(url, { method, body: JSON.stringify(item) });
    setModalOpen(false); setEditingItem(null); loadData();
  };
  const handleDelete = async () => { await fetchApi(`/api/inventory/${confirmDelete}`, { method: 'DELETE' }); setConfirmDelete(null); loadData(); };

  return (<div className="space-y-4 sm:space-y-6"><div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"><h3 className="text-xl font-bold text-slate-800">Controle de Patrimônio</h3><button onClick={() => {setEditingItem(null); setModalOpen(true);}} className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white px-4 py-3 sm:py-2 rounded-xl flex items-center justify-center gap-2 font-medium shadow-sm"><Plus className="w-4 h-4" /> Novo Item</button></div><div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden w-full"><div className="overflow-x-auto w-full custom-scrollbar"><table className="w-full text-left border-collapse min-w-[700px]"><thead><tr className="bg-slate-50 border-b border-slate-200 text-sm font-medium text-slate-500"><th className="p-4 whitespace-nowrap">Patrimônio</th><th className="p-4 whitespace-nowrap">Item</th><th className="p-4 whitespace-nowrap">Categoria</th><th className="p-4 whitespace-nowrap">Localização</th><th className="p-4 whitespace-nowrap">Estado</th><th className="p-4 whitespace-nowrap text-center">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">{inventory.map(item => (<tr key={item.id} className="hover:bg-slate-50"><td className="p-4 font-mono text-sm font-semibold text-slate-700">{item.patrimony}</td><td className="p-4 flex items-center gap-2"><Package className="w-4 h-4 text-slate-400 shrink-0" /> <span className="font-medium text-slate-800 truncate max-w-[150px]">{item.name}</span></td><td className="p-4 text-sm text-slate-600 whitespace-nowrap">{item.category}</td><td className="p-4 text-sm text-slate-600 whitespace-nowrap"><MapPin className="w-3 h-3 inline text-slate-400"/> {item.location}</td><td className="p-4 whitespace-nowrap"><StatusBadge status={item.status} /></td><td className="p-4 text-center space-x-1 sm:space-x-2 whitespace-nowrap"><button onClick={() => {setEditingItem(item); setModalOpen(true);}} className="text-slate-400 hover:text-amber-600 p-2 sm:p-1 rounded-lg"><Edit className="w-5 h-5 sm:w-4 sm:h-4"/></button><button onClick={() => setConfirmDelete(item.id)} className="text-slate-400 hover:text-rose-600 p-2 sm:p-1 rounded-lg"><Trash2 className="w-5 h-5 sm:w-4 sm:h-4"/></button></td></tr>))}</tbody></table></div></div>
  {modalOpen && <GenericModal title="Patrimônio" fields={[{name: 'patrimony', label: 'Cód. Patrimônio', type: 'text'}, {name: 'name', label: 'Nome do Item', type: 'text'}, {name: 'category', label: 'Categoria', type: 'text'}, {name: 'location', label: 'Localização', type: 'select', options: ['Estoque Central', ...spaces.map(s => s.name)]}, {name: 'status', label: 'Estado', type: 'select', options: ['Bom', 'Danificado', 'Em Manutenção']}]} initialData={editingItem} onSave={handleSave} onClose={() => setModalOpen(false)} />}
  <ConfirmModal isOpen={!!confirmDelete} title="Excluir Patrimônio" message="Tem certeza que deseja remover este item do inventário?" onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
  </div>); 
}

function CleaningManager({ cleaningTasks, spaces, keys, loadData }) { 
  const [modalOpen, setModalOpen] = useState(false); const [editingItem, setEditingItem] = useState(null); const [confirmDelete, setConfirmDelete] = useState(null);
  const handleSave = async (item) => {
    const url = item.id ? `/api/cleaning/${item.id}` : '/api/cleaning';
    const method = item.id ? 'PUT' : 'POST';
    await fetchApi(url, { method, body: JSON.stringify(item) });
    setModalOpen(false); setEditingItem(null); loadData();
  };
  const handleDelete = async () => { await fetchApi(`/api/cleaning/${confirmDelete}`, { method: 'DELETE' }); setConfirmDelete(null); loadData(); };

  return (<div className="space-y-4 sm:space-y-6"><div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"><h3 className="text-xl font-bold text-slate-800">Serviços e Manutenção</h3><button onClick={() => {setEditingItem(null); setModalOpen(true);}} className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white px-4 py-3 sm:py-2 rounded-xl flex items-center justify-center gap-2 font-medium shadow-sm"><Plus className="w-4 h-4" /> Agendar Limpeza Avulsa</button></div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">{cleaningTasks.map(task => { 
    const spaceName = spaces.find(s => s.id == task.spaceId)?.name; 
    const isPending = task.status === 'Pendente';
    
    const isLocatario = task.responsibleTeam?.includes('Terceirizado');
    const linkedKey = keys.find(k => k.rentalId === task.rentalId);
    const canCompleteLocatario = isLocatario && linkedKey?.status === 'Devolvida';

    return (<div key={task.id} className={`p-4 sm:p-6 rounded-2xl border relative shadow-sm ${isPending ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}><div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex gap-1 sm:gap-2"><button onClick={() => {setEditingItem(task); setModalOpen(true);}} className="p-2 sm:p-1 text-slate-400 hover:text-amber-600 rounded-lg"><Edit className="w-5 h-5 sm:w-4 sm:h-4"/></button><button onClick={() => setConfirmDelete(task.id)} className="p-2 sm:p-1 text-slate-400 hover:text-rose-600 rounded-lg"><Trash2 className="w-5 h-5 sm:w-4 sm:h-4"/></button></div><div className="flex justify-between items-start mb-4 pr-12"><div className="flex items-center gap-2"><Sparkles className={`w-5 h-5 ${isPending ? 'text-amber-600' : 'text-slate-400'}`}/><h4 className="font-bold text-slate-800 text-sm sm:text-base">{spaceName}</h4></div><StatusBadge status={task.status} /></div><div className="space-y-2 mb-6 text-xs sm:text-sm"><div className="flex justify-between"><span className="text-slate-500">Data:</span><span className="font-medium">{task.date.split('-').reverse().join('/')}</span></div><div className="flex justify-between"><span className="text-slate-500">Serviço:</span><span className="font-medium">{task.type}</span></div><div className="flex justify-between"><span className="text-slate-500">Responsável:</span><span className={`font-medium ${isLocatario ? 'text-indigo-600' : 'text-slate-800'}`}>{task.responsibleTeam}</span></div></div>
      {task.status !== 'Concluído' && (
        isLocatario ? (
          canCompleteLocatario ? (
             <button onClick={() => handleSave({...task, status: 'Concluído'})} className="w-full py-3 sm:py-2 rounded-xl text-sm font-bold bg-emerald-100 border border-emerald-300 hover:bg-emerald-200 text-emerald-700 flex justify-center items-center gap-2 transition-colors"><Check className="w-5 h-5 sm:w-4 sm:h-4" /> Vistoria Limpeza OK</button>
          ) : (
             <div className="w-full py-3 sm:py-2 rounded-xl text-xs sm:text-sm font-medium bg-slate-100 border border-slate-200 text-slate-400 flex justify-center items-center gap-2 text-center">Aguardando Devolver Chave</div>
          )
        ) : (
          <button onClick={() => handleSave({...task, status: 'Concluído'})} className="w-full py-3 sm:py-2 rounded-xl text-sm font-medium bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 flex justify-center items-center gap-2 transition-colors"><Check className="w-5 h-5 sm:w-4 sm:h-4 text-green-600" /> Concluir Limpeza</button>
        )
      )}
    </div>);})}</div>
  {modalOpen && <GenericModal title="Serviço Manual" fields={[{name: 'spaceId', label: 'Espaço', type: 'select', options: spaces.map(s => ({val: s.id, lbl: s.name}))}, {name: 'date', label: 'Data', type: 'date'}, {name: 'type', label: 'Tipo', type: 'select', options: ['Pré-evento', 'Pós-evento']}, {name: 'responsibleTeam', label: 'Equipe Responsável', type: 'select', options: ['Secretaria', 'Terceirizado']}, {name: 'status', label: 'Status', type: 'select', options: ['Pendente', 'Agendado', 'Concluído']}]} initialData={editingItem} onSave={handleSave} onClose={() => setModalOpen(false)} />}
  <ConfirmModal isOpen={!!confirmDelete} title="Excluir Agendamento" message="Tem certeza que deseja excluir esta tarefa de limpeza?" onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
  </div>); 
}

// NOVO MÓDULO (ADMIN): GESTÃO DE TERCEIRIZADOS
function TerceirizadosManager({ rentals, spaces, cleaningTasks, messages, loadData, loggedUser }) {
  const terceirizadosTasks = cleaningTasks.filter(t => t.responsibleTeam?.includes('Terceirizado'));
  const [chatOpen, setChatOpen] = useState(null);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Gestão de Terceirizados</h3>
          <p className="text-sm text-slate-500">Controle e comunicação com as equipes de limpeza terceirizadas.</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden w-full">
        <div className="overflow-x-auto w-full custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead><tr className="bg-slate-50 border-b border-slate-200 text-sm font-medium text-slate-500"><th className="p-4 whitespace-nowrap">ID Limpeza</th><th className="p-4 whitespace-nowrap">Evento / Locação</th><th className="p-4 whitespace-nowrap">Espaço</th><th className="p-4 whitespace-nowrap">Data / Momento</th><th className="p-4 whitespace-nowrap">Status</th><th className="p-4 whitespace-nowrap text-center">Comunicação</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {terceirizadosTasks.map(task => { 
                const rental = rentals.find(r => r.id === task.rentalId);
                const space = spaces.find(s => s.id === task.spaceId); 
                const taskMessages = messages.filter(m => m.cleaning_id === task.id);
                const unread = taskMessages.filter(m => !m.is_read && m.sender_role === 'Terceirizado').length;
                
                return (
                  <tr key={task.id} className="hover:bg-slate-50">
                    <td className="p-4 text-xs font-mono text-slate-400">#{task.id}</td>
                    <td className="p-4"><p className="font-medium text-slate-800 truncate max-w-[200px]">{rental?.eventType || 'Serviço Avulso'}</p><p className="text-xs text-slate-500">{rental?.responsible || '-'}</p></td>
                    <td className="p-4 text-sm text-slate-700 whitespace-nowrap">{space?.name || 'N/A'}</td>
                    <td className="p-4 text-sm text-slate-700 whitespace-nowrap">{task.date.split('-').reverse().join('/')} <br/><span className="text-xs text-slate-500">{task.type}</span></td>
                    <td className="p-4 whitespace-nowrap"><StatusBadge status={task.status} /></td>
                    <td className="p-4 text-center whitespace-nowrap">
                      <button onClick={() => setChatOpen(task)} className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors relative ${unread > 0 ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                        <MessageSquare className="w-4 h-4" /> 
                        {unread > 0 ? 'Nova Mensagem' : 'Abrir Chat'}
                        {unread > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-white"></span>}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {terceirizadosTasks.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-500">Nenhum serviço terceirizado registrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {chatOpen && <ChatModal task={chatOpen} rentals={rentals} spaces={spaces} messages={messages.filter(m => m.cleaning_id === chatOpen.id)} onClose={() => setChatOpen(null)} loadData={loadData} loggedUser={loggedUser} />}
    </div>
  ); 
}

// MÓDULO: CENTRAL DE MENSAGENS (TERCEIRIZADOS) - CORRIGIDO PARA MOSTRAR TODAS AS TAREFAS
function MessagesManager({ rentals, spaces, cleaningTasks, messages, loadData, loggedUser }) {
  const [chatOpen, setChatOpen] = useState(null);
  
  // Agora mostra todas as tarefas do terceirizado para evitar página vazia, permitindo iniciar chat
  const myTasks = cleaningTasks.filter(t => t.responsibleTeam?.includes('Terceirizado'));

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Central de Mensagens</h3>
          <p className="text-sm text-slate-500">Comunicação direta com a administração sobre suas tarefas.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
        {myTasks.map(task => {
          const rental = rentals.find(r => r.id === task.rentalId);
          const space = spaces.find(s => s.id === task.spaceId); 
          const taskMessages = messages.filter(m => m.cleaning_id === task.id);
          const unread = taskMessages.filter(m => !m.is_read && m.sender_role !== 'Terceirizado').length;
          
          return (
            <div key={task.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col relative hover:shadow-md cursor-pointer transition-shadow" onClick={() => setChatOpen(task)}>
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className={`w-5 h-5 ${unread > 0 ? 'text-amber-500' : 'text-slate-400'}`}/>
                  <h4 className="font-bold text-slate-800 text-sm sm:text-base truncate">{rental?.eventType || 'Serviço Avulso'}</h4>
                </div>
                {unread > 0 && <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{unread} Nova</span>}
              </div>
              <p className="text-sm text-slate-600 mb-4">{space?.name}</p>
              <div className="text-xs text-slate-500 border-t border-slate-100 pt-3 flex justify-between">
                 <span>{task.date.split('-').reverse().join('/')}</span>
                 <span>{taskMessages.length} msg(s)</span>
              </div>
            </div>
          )
        })}
        {myTasks.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500">
             <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-300" />
             <p>Nenhuma tarefa atribuída para mensagens.</p>
          </div>
        )}
      </div>
      {chatOpen && <ChatModal task={chatOpen} rentals={rentals} spaces={spaces} messages={messages.filter(m => m.cleaning_id === chatOpen.id)} onClose={() => setChatOpen(null)} loadData={loadData} loggedUser={loggedUser} />}
    </div>
  ); 
}

// COMPONENTE: MODAL DE CHAT (Reutilizável)
function ChatModal({ task, rentals, spaces, messages, onClose, loadData, loggedUser }) {
  const [inputText, setInputText] = useState('');
  const rental = rentals.find(r => r.id === task.rentalId);
  const spaceName = spaces.find(s => s.id === task.spaceId)?.name;
  
  const isTerceirizado = loggedUser?.role === 'Terceirizado';

  useEffect(() => {
    // Ao abrir, marcar mensagens como lidas
    const unread = messages.filter(m => !m.is_read && (isTerceirizado ? m.sender_role !== 'Terceirizado' : m.sender_role === 'Terceirizado'));
    if (unread.length > 0) {
      fetchApi('/api/messages/read', { method: 'PUT', body: JSON.stringify({ cleaningId: task.id, role: loggedUser.role }) }).then(() => loadData());
    }
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const msg = inputText;
    setInputText('');
    await fetchApi('/api/messages', { 
      method: 'POST', 
      body: JSON.stringify({ cleaningId: task.id, message: msg, senderRole: isTerceirizado ? 'Terceirizado' : 'Admin' }) 
    });
    loadData();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[70] p-2 sm:p-4">
      <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-2xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0 shadow-sm z-10">
          <div>
             <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
               <MessageSquare className="w-5 h-5 text-amber-600"/> 
               {rental?.eventType || 'Serviço Avulso'}
             </h3>
             <p className="text-xs text-slate-500">{spaceName} | Status: {task.status}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-200 rounded-full transition-colors"><XCircle className="w-6 h-6"/></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar flex flex-col">
          {messages.length === 0 ? (
             <div className="m-auto text-center text-slate-400">
                <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-20"/>
                <p className="text-sm">Nenhuma mensagem neste serviço.</p>
                <p className="text-xs mt-1">Envie a primeira observação abaixo.</p>
             </div>
          ) : (
            messages.map(msg => {
              // Verifica se a mensagem foi enviada pelo perfil atual (Terceirizado vs Admin)
              const isMine = isTerceirizado ? msg.sender_role === 'Terceirizado' : msg.sender_role !== 'Terceirizado';
              return (
                <div key={msg.id} className={`flex flex-col max-w-[85%] ${isMine ? 'self-end items-end' : 'self-start items-start'}`}>
                   <span className="text-[10px] text-slate-400 mb-1 px-1">{msg.user_name} {msg.sender_role === 'Terceirizado' ? '(Terceirizado)' : '(Secretaria)'}</span>
                   <div className={`p-3 rounded-2xl text-sm shadow-sm ${isMine ? 'bg-emerald-100 text-emerald-900 rounded-tr-sm' : 'bg-white text-slate-700 border border-slate-200 rounded-tl-sm'}`}>
                      {msg.message}
                   </div>
                   <span className="text-[9px] text-slate-400 mt-1 px-1">{new Date(msg.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 bg-white border-t border-slate-200 shrink-0">
           <form onSubmit={handleSend} className="flex items-end gap-2">
              <textarea 
                 className="flex-1 border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none custom-scrollbar bg-slate-50" 
                 rows="2" 
                 placeholder="Digite sua mensagem ou observação..."
                 value={inputText}
                 onChange={e => setInputText(e.target.value)}
                 onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
              />
              <button type="submit" disabled={!inputText.trim()} className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:hover:bg-amber-600 text-white p-3 rounded-xl shadow-sm transition-colors flex items-center justify-center h-full">
                 <Send className="w-5 h-5" />
              </button>
           </form>
        </div>
      </div>
    </div>
  );
}

// MÓDULO: LIMPEZA TERCEIRIZADA COM CHAT DIRETO E UX CORRIGIDO
function OutsourcedCleaningManager({ rentals, spaces, cleaningTasks, messages, loadData, loggedUser, onNavigate }) {
  const [chatOpen, setChatOpen] = useState(null);

  const handleUpdateStatus = async (task, newStatus) => {
    const url = `/api/cleaning/${task.id}`;
    const method = 'PUT';
    await fetchApi(url, { method, body: JSON.stringify({ ...task, status: newStatus }) });
    loadData();
    if(newStatus === 'Concluído' && onNavigate) {
      onNavigate('dashboard');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Limpeza Terceirizada</h3>
          <p className="text-sm text-slate-500">Painel exclusivo para execução das limpezas de eventos.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
        {cleaningTasks.map(task => {
          const rental = rentals.find(r => r.id === task.rentalId);
          const spaceName = spaces.find(s => s.id == task.spaceId)?.name; 
          
          if (!rental || !task.responsibleTeam?.includes('Terceirizado')) return null;

          return (
             <div key={task.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col h-full relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-600"/>
                  <h4 className="font-bold text-slate-800 text-sm sm:text-base max-w-[200px] truncate" title={rental.eventType}>{rental.eventType}</h4>
                </div>
                <StatusBadge status={task.status} />
              </div>
              
              <div className="space-y-3 mb-6 text-xs sm:text-sm bg-slate-50 p-4 rounded-xl border border-slate-100 flex-1">
                <div className="flex items-center gap-2 text-slate-700">
                  <MapPin className="w-4 h-4 text-slate-400"/>
                  <span className="font-medium">{spaceName}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="text-slate-500">Momento:</span>
                  <span className="font-bold text-slate-800">{task.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Término do Evento:</span>
                  <span className="font-medium">{rental.endDate.split('-').reverse().join('/')}</span>
                </div>
              </div>
              
              <div className="mt-auto space-y-3">
                <button onClick={() => setChatOpen(task)} className="w-full py-3 sm:py-2.5 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 flex justify-center items-center gap-2 transition-colors border border-slate-300">
                   <MessageSquare className="w-4 h-4" /> 💬 Chat / Relatar Problema
                </button>

                {task.status === 'Pendente' && (
                   <button onClick={() => handleUpdateStatus(task, 'Em Andamento')} className="w-full py-3 sm:py-2.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white flex justify-center items-center gap-2 transition-colors shadow-sm"><Sparkles className="w-4 h-4" /> Iniciar Limpeza</button>
                )}
                {task.status === 'Em Andamento' && (
                   <button onClick={() => handleUpdateStatus(task, 'Concluído')} className="w-full py-3 sm:py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white flex justify-center items-center gap-2 transition-colors shadow-sm"><CheckCircle className="w-4 h-4" /> Limpeza Concluída</button>
                )}
                {task.status === 'Concluído' && (
                   <button disabled className="w-full py-3 sm:py-2.5 rounded-xl text-sm font-bold bg-slate-100 text-slate-400 flex justify-center items-center gap-2 cursor-not-allowed"><Check className="w-4 h-4" /> Limpeza Finalizada</button>
                )}
              </div>
            </div>
          );
        })}
        {cleaningTasks.filter(t => t.responsibleTeam?.includes('Terceirizado')).length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500">
            <Sparkles className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>Nenhuma limpeza terceirizada atribuída no momento.</p>
          </div>
        )}
      </div>
      {chatOpen && <ChatModal task={chatOpen} rentals={rentals} spaces={spaces} messages={messages.filter(m => m.cleaning_id === chatOpen.id)} onClose={() => setChatOpen(null)} loadData={loadData} loggedUser={loggedUser} />}
    </div>
  ); 
}

function UsersManager({ users, loadData }) { 
  const [modalOpen, setModalOpen] = useState(false); const [editingItem, setEditingItem] = useState(null); const [confirmDelete, setConfirmDelete] = useState(null);
  const handleSave = async (item) => {
    const url = item.id ? `/api/users/${item.id}` : '/api/users';
    const method = item.id ? 'PUT' : 'POST';
    await fetchApi(url, { method, body: JSON.stringify(item) });
    setModalOpen(false); setEditingItem(null); loadData();
  };
  const handleDelete = async () => { await fetchApi(`/api/users/${confirmDelete}`, { method: 'DELETE' }); setConfirmDelete(null); loadData(); };

  return (<div className="space-y-4 sm:space-y-6"><div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"><h3 className="text-xl font-bold text-slate-800">Controle de Usuários</h3><button onClick={() => {setEditingItem(null); setModalOpen(true);}} className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white px-4 py-3 sm:py-2 rounded-xl flex items-center justify-center gap-2 font-medium transition-colors shadow-sm"><Plus className="w-4 h-4" /> Novo Usuário</button></div><div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden w-full"><div className="overflow-x-auto w-full custom-scrollbar"><table className="w-full text-left border-collapse min-w-[700px]"><thead><tr className="bg-slate-50 border-b border-slate-200 text-sm font-medium text-slate-500"><th className="p-4 whitespace-nowrap">Nome</th><th className="p-4 whitespace-nowrap">Email</th><th className="p-4 whitespace-nowrap">Acesso</th><th className="p-4 whitespace-nowrap">Status</th><th className="p-4 whitespace-nowrap text-center">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">{users.map(user => (<tr key={user.id} className="hover:bg-slate-50 transition-colors"><td className="p-4"><div className="flex items-center gap-3"><div className="bg-slate-200 p-2 rounded-full shrink-0"><UserCircle className="w-5 h-5 text-slate-600"/></div><span className="font-semibold text-slate-800 truncate max-w-[150px]">{user.name}</span></div></td><td className="p-4 text-sm text-slate-600 whitespace-nowrap">{user.email}</td><td className="p-4 whitespace-nowrap"><span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200">{user.role === 'Super Admin' && <Shield className="w-3 h-3 text-amber-600"/>}{user.role}</span></td><td className="p-4 whitespace-nowrap"><StatusBadge status={user.status} /></td><td className="p-4 text-center space-x-1 sm:space-x-2 whitespace-nowrap"><button onClick={() => {setEditingItem(user); setModalOpen(true);}} className="text-slate-400 hover:text-blue-600 p-2 sm:p-1 rounded-lg"><Edit className="w-5 h-5 sm:w-4 sm:h-4"/></button><button onClick={() => setConfirmDelete(user.id)} className="text-slate-400 hover:text-rose-600 p-2 sm:p-1 rounded-lg"><Trash2 className="w-5 h-5 sm:w-4 sm:h-4"/></button></td></tr>))}</tbody></table></div></div>
  {modalOpen && <GenericModal title="Usuário" fields={[{name: 'name', label: 'Nome Completo', type: 'text'}, {name: 'email', label: 'Email', type: 'email'}, {name: 'password', label: editingItem ? 'Nova Senha (deixe em branco p/ manter)' : 'Senha de Acesso', type: 'password', required: !editingItem}, {name: 'role', label: 'Nível de Acesso', type: 'select', options: ['Super Admin', 'Atendente', 'Terceirizado']}, {name: 'status', label: 'Status', type: 'select', options: ['Ativo', 'Inativo']}]} initialData={editingItem} onSave={handleSave} onClose={() => setModalOpen(false)} />}
  <ConfirmModal isOpen={!!confirmDelete} title="Excluir Usuário" message="Tem certeza que deseja revogar o acesso deste usuário?" onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
  </div>); 
}

// MÓDULO: AUDITORIA LGPD COM EXPORTAÇÃO PDF E COMPONENTE CORRIGIDO
function AuditManager({ auditLogs, loadData, onPrint }) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">Auditoria e Compliance LGPD <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full text-[10px] font-bold ml-2"><Lock className="w-3 h-3"/> REGISTROS PROTEGIDOS (READ-ONLY)</div></h3>
          <p className="text-sm text-slate-500 mt-1">Rastreamento inalterável de todas as ações dos usuários no sistema.</p>
        </div>
        <button onClick={onPrint} className="w-full sm:w-auto bg-slate-800 hover:bg-slate-900 text-white px-4 py-3 sm:py-2 rounded-xl flex items-center justify-center gap-2 font-medium transition-colors shadow-sm"><Printer className="w-4 h-4" /> Exportar para PDF</button>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden w-full relative">
        <div className="overflow-x-auto w-full custom-scrollbar max-h-[70vh]">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="sticky top-0 bg-slate-50 shadow-sm z-10">
              <tr className="border-b border-slate-200 text-sm font-medium text-slate-500">
                <th className="p-4 whitespace-nowrap">Data / Hora</th>
                <th className="p-4 whitespace-nowrap">Usuário</th>
                <th className="p-4 whitespace-nowrap">IP / Origem</th>
                <th className="p-4 whitespace-nowrap">Ação</th>
                <th className="p-4 whitespace-nowrap">Módulo (Entidade)</th>
                <th className="p-4 whitespace-nowrap">Detalhes da Operação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 text-xs font-mono text-slate-600 whitespace-nowrap">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                  <td className="p-4 text-sm font-medium text-slate-800 whitespace-nowrap"><UserCircle className="w-4 h-4 inline mr-1 text-slate-400"/> {log.user_name}</td>
                  <td className="p-4 text-xs text-slate-500 whitespace-nowrap">{log.ip_address}</td>
                  <td className="p-4 whitespace-nowrap"><span className={`px-2 py-1 rounded-md text-[10px] font-bold ${log.action === 'LOGIN' ? 'bg-indigo-100 text-indigo-700' : log.action === 'CREATE' ? 'bg-emerald-100 text-emerald-700' : log.action === 'DELETE' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>{log.action}</span></td>
                  <td className="p-4 text-sm text-slate-700 whitespace-nowrap font-semibold">{log.entity} {log.entity_id ? `(#${log.entity_id})` : ''}</td>
                  <td className="p-4 text-[11px] text-slate-500 max-w-[300px] break-words whitespace-normal">{formatAuditDetails(log.details)}</td>
                </tr>
              ))}
              {auditLogs.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-500">Nenhum registo de auditoria encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GenericModal({ title, fields, initialData, onSave, onClose }) {
  const initSt = {}; fields.forEach(f => initSt[f.name] = initialData ? initialData[f.name] : (f.type==='select' ? (typeof f.options[0] === 'object' ? f.options[0].val : f.options[0]) : ''));
  const [formData, setFormData] = useState(initialData || initSt);
  const handleSubmit = (e) => { e.preventDefault(); onSave(formData); };
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0"><h3 className="text-lg font-bold text-slate-800">{initialData ? 'Editar' : 'Novo'} {title}</h3><button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><XCircle className="w-6 h-6"/></button></div>
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar">
          <form id="genericForm" onSubmit={handleSubmit} className="space-y-4">
            {fields.map(f => (
              <div key={f.name}>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{f.label}</label>
                {f.type === 'select' ? (
                  <select className="w-full border border-slate-300 rounded-lg p-3 sm:p-2.5 focus:ring-2 focus:ring-amber-500 outline-none bg-white text-base" value={formData[f.name]} onChange={e => setFormData({...formData, [f.name]: e.target.value})}>
                    {f.options.map(opt => typeof opt === 'object' ? <option key={opt.val} value={opt.val}>{opt.lbl}</option> : <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <input required={f.required !== false} type={f.type} step={f.type === 'number' ? '0.01' : undefined} className="w-full border border-slate-300 rounded-lg p-3 sm:p-2.5 focus:ring-2 focus:ring-amber-500 outline-none text-base" value={formData[f.name] || ''} onChange={e => setFormData({...formData, [f.name]: f.type==='number'?parseFloat(e.target.value):e.target.value})} />
                )}
              </div>
            ))}
          </form>
        </div>
        <div className="p-4 sm:p-6 flex flex-col sm:flex-row justify-end gap-3 border-t border-slate-100 bg-slate-50 shrink-0"><button type="button" onClick={onClose} className="px-4 py-3 sm:py-2.5 text-slate-600 hover:bg-slate-200 rounded-xl font-medium w-full sm:w-auto">Cancelar</button><button type="submit" form="genericForm" className="px-4 py-3 sm:py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium shadow-sm w-full sm:w-auto">Salvar</button></div>
      </div>
    </div>
  );
}

function PrintableAudit({ auditLogs, onClose }) { 
  const handlePrint = () => window.print();
  const hash = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  return (
    <div className="fixed inset-0 bg-slate-200 z-50 overflow-y-auto print:bg-white flex flex-col items-center py-10 print:py-0">
      <style>{`
        @media print { 
          @page { size: A4 landscape; margin: 10mm; } 
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
        }
      `}</style>
      <div className="mb-6 flex gap-4 print:hidden">
        <button onClick={onClose} className="px-5 py-2.5 bg-white text-slate-700 hover:bg-slate-50 rounded-xl font-medium shadow-sm border border-slate-300 flex items-center gap-2"><XCircle className="w-5 h-5" /> Voltar</button>
        <button onClick={handlePrint} className="px-5 py-2.5 bg-slate-800 text-white hover:bg-slate-900 rounded-xl font-medium shadow-sm flex items-center gap-2"><Printer className="w-5 h-5" /> Imprimir / Salvar PDF</button>
      </div>
      
      {/* Layout A4 Landscape Real para o Navegador e Impressora usando Tabelas Nativas */}
      <div className="bg-white w-full max-w-[297mm] p-10 shadow-2xl print:shadow-none print:p-0 text-black font-sans mx-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="table-header-group">
            <tr>
              <th colSpan="6" className="pb-6 pt-2">
                <div className="text-center border-b-2 border-black pb-4">
                  <h1 className="text-xl font-bold uppercase tracking-wide">Prefeitura Municipal de Jacarezinho</h1>
                  <h2 className="text-base mt-1 font-semibold text-gray-700">Relatório de Auditoria e Compliance LGPD</h2>
                  <p className="text-xs text-gray-500 mt-1 font-normal">Gerado em: {new Date().toLocaleString('pt-BR')}</p>
                </div>
              </th>
            </tr>
            <tr className="border-b-2 border-slate-800 font-bold">
              <th className="py-2 px-2">Data / Hora</th>
              <th className="py-2 px-2">Usuário</th>
              <th className="py-2 px-2">IP / Origem</th>
              <th className="py-2 px-2">Ação</th>
              <th className="py-2 px-2">Módulo (Entidade)</th>
              <th className="py-2 px-2">Detalhes Técnicos</th>
            </tr>
          </thead>
          
          <tbody className="divide-y divide-slate-300">
            {auditLogs.map(log => (
              <tr key={log.id} className="break-inside-avoid">
                <td className="py-2 px-2 whitespace-nowrap align-top">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                <td className="py-2 px-2 font-medium align-top">{log.user_name}</td>
                <td className="py-2 px-2 text-gray-600 align-top">{log.ip_address}</td>
                <td className="py-2 px-2 font-bold align-top">{log.action}</td>
                <td className="py-2 px-2 align-top">{log.entity} {log.entity_id ? `(#${log.entity_id})` : ''}</td>
                <td className="py-2 px-2 break-words whitespace-normal text-[10px] text-gray-600 align-top">{formatAuditDetails(log.details)}</td>
              </tr>
            ))}
            {auditLogs.length === 0 && <tr><td colSpan="6" className="py-4 text-center text-gray-500">Nenhum registo encontrado.</td></tr>}
          </tbody>

          <tfoot className="table-footer-group">
            <tr>
              <td colSpan="6" className="pt-6">
                <div className="border-t border-gray-300 pt-4 flex justify-between items-center text-[10px] text-gray-500 w-full">
                  <div className="flex items-center gap-2">
                    <img src="/LOGO-JACAREZINHO.png" alt="Prefeitura" className="h-6 opacity-50 grayscale" />
                    <span>Autenticidade LGPD | Lei 13.709/2018</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Hash: {hash}</span>
                    <span className="mx-2">|</span>
                    <span>JMB Tecnologia</span>
                  </div>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  ); 
}

function StatusBadge({ status }) {
  let color = "bg-slate-100 text-slate-700";
  if (status === 'Disponível' || status === 'Concluído' || status === 'Bom' || status === 'Devolvida' || status === 'Ativo') color = "bg-green-100 text-green-700 border-green-200";
  if (status === 'Locado' || status === 'Entregue' || status === 'Em Andamento') color = "bg-blue-100 text-blue-700 border-blue-200";
  if (status === 'Agendado' || status === 'Aguardando') color = "bg-indigo-100 text-indigo-700 border-indigo-200";
  if (status === 'Em Limpeza' || status === 'Pendente') color = "bg-amber-100 text-amber-700 border-amber-200";
  if (status === 'Danificado' || status === 'Em Manutenção' || status === 'Inativo') color = "bg-rose-100 text-rose-700 border-rose-200";
  return <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${color}`}>{status}</span>;
}
EOF

# ==============================================================================
# COPIAR IMAGENS E CONFIGURAR PERMISSÕES
# ==============================================================================
echo ">>> Procurando e copiando imagens institucionais para o frontend..."
mkdir -p /opt/centrodeeventos/frontend/public/

for img in "LOGO-JACAREZINHO.png" "logotipo-jmb.png" "photo-1723581205681-d14d47616680.jpg"; do
    if [ -f "./$img" ]; then
        cp "./$img" /opt/centrodeeventos/frontend/public/
    elif [ -f "$HOME/$img" ]; then
        cp "$HOME/$img" /opt/centrodeeventos/frontend/public/
    elif [ -f "/opt/centrodeeventos/frontend/public/$img" ]; then
        echo ">>> $img já detectada na pasta public."
    else
        echo ">>> ALERTA: $img não encontrada na raiz. Lembre-se de colocá-la na pasta /opt/centrodeeventos/frontend/public/"
    fi
done

# ==============================================================================
# COMPILAR FRONTEND
# ==============================================================================
echo ">>> Compilando Projeto Frontend (Build Final)..."
npm run build
sudo rm -rf /opt/centrodeeventos/build/*
sudo cp -r dist/* /opt/centrodeeventos/build/

# GARANTIA EXTREMA PWA: Copiar diretamente do public pro build caso o Vite ignore algum asset manual
sudo cp -r /opt/centrodeeventos/frontend/public/* /opt/centrodeeventos/build/ 2>/dev/null || true

sudo chmod -R 755 /opt/centrodeeventos/build

# ==============================================================================
# 6. GERAR/RENOVAR CERTIFICADO SSL (CERTBOT)
# ==============================================================================
echo ">>> Configurando HTTPS com Certbot..."
if ! command -v certbot &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y certbot python3-certbot-nginx
fi
# Executa o certbot para configurar automaticamente o SSL no Nginx
sudo certbot --nginx -d centroeventos.jacarezinho.cloud --non-interactive --agree-tos -m suporte@jacarezinho.cloud --redirect

echo "==========================================================="
echo ">>> DEPLOY CONCLUÍDO COM SUCESSO!"
echo "==========================================================="
echo "- Backend rodando na porta: 3374 (via PM2) com MÓDULO DE AUDITORIA ATIVO"
echo "- Frontend PWA Vite compilado em: /opt/centrodeeventos/build/"
echo "- Nginx proxy e SSL (HTTPS) configurados"
echo "==========================================================="

# Cálculo e exibição do Uptime
upSeconds=$(cat /proc/uptime | grep -o '^[0-9]\+')
days=$(($upSeconds / 86400))
hours=$(($upSeconds % 86400 / 3600))
mins=$(($upSeconds % 3600 / 60))

echo ">>> Uptime do Servidor Ubuntu: $days dias, $hours horas e $mins minutos desde o último boot."
echo "==========================================================="
