#!/bin/bash

# ==============================================================================
#  BECKER CORP V8 - FIX TAILWIND V4 BUILD
#  Descrição: Configura corretamente o Tailwind v4 usando o plugin Vite nativo.
# ==============================================================================

FRONTEND_DIR="/opt/controlebeckercorp-v8/frontend"
DOMAIN="console.jacarezinho.cloud"

echo -e "\033[0;34m=== AJUSTANDO PARA TAILWIND CSS V4 (NATIVO) ===\033[0m"

cd $FRONTEND_DIR

# 1. Instalar o plugin oficial do Vite para Tailwind v4
echo -e "\033[1;33m-> Instalando @tailwindcss/vite...\033[0m"
npm install -D tailwindcss @tailwindcss/vite

# 2. Remover configurações legadas da v3 que causam conflito
echo -e "\033[1;33m-> Removendo configs antigas (PostCSS/Tailwind v3)...\033[0m"
rm -f postcss.config.js tailwind.config.js

# 3. Atualizar o CSS para a sintaxe v4 (@import)
echo -e "\033[1;33m-> Atualizando src/index.css para sintaxe v4...\033[0m"
cat <<EOF > src/index.css
@import "tailwindcss";

/* Customizações Globais Becker Corp */
body {
  background-color: #0f172a; /* bg-slate-950 */
  color: #ffffff;
  margin: 0;
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* Scrollbar Personalizada */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: #0f172a; }
::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #475569; }
EOF

# 4. Atualizar o Vite Config para carregar o Tailwind v4
# Mantemos o allowedHosts para não quebrar o acesso externo
echo -e "\033[1;33m-> Atualizando vite.config.js com plugin Tailwind V4...\033[0m"
cat <<EOF > vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // O novo plugin v4 faz a mágica aqui
  ],
  server: {
    host: '0.0.0.0',
    port: 6777,
    allowedHosts: ['$DOMAIN', 'all']
  },
  preview: {
    host: '0.0.0.0',
    port: 6777,
    allowedHosts: ['$DOMAIN', 'all']
  },
  build: {
    chunkSizeWarningLimit: 1600
  }
})
EOF

# 5. Recompilar
echo -e "\033[1;33m-> Compilando Frontend (Build V4)...\033[0m"
npm run build

# 6. Reiniciar
echo -e "\033[1;33m-> Reiniciando serviço...\033[0m"
pm2 restart bcc-frontend

echo -e "\033[0;32m✅ MIGRAÇÃO TAILWIND V4 CONCLUÍDA!\033[0m"
echo -e "O erro de PostCSS deve ter desaparecido."
