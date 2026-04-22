#!/bin/bash

# ==============================================================================
#  BECKER CORP V8 - RESGATE DO SISTEMA (NGINX + PM2 STABILIZATION)
#  Descrição: Remove conflitos do Nginx, corrige build do Vite e estabiliza PM2.
# ==============================================================================

DOMAIN="console.jacarezinho.cloud"
FRONTEND_DIR="/opt/controlebeckercorp-v8/frontend"
NGINX_AVAILABLE="/etc/nginx/sites-available"
NGINX_ENABLED="/etc/nginx/sites-enabled"

echo -e "\033[0;34m=== INICIANDO OPERAÇÃO DE RESGATE ===\033[0m"

# ------------------------------------------------------------------------------
# 1. LIMPEZA DE CONFLITOS NO NGINX
# ------------------------------------------------------------------------------
echo -e "\033[1;33m-> Removendo configurações conflitantes do Nginx...\033[0m"

# Removemos qualquer config que mencione o domínio para começar do zero
grep -l "$DOMAIN" $NGINX_ENABLED/* | xargs sudo rm -f
# Removemos o default também pois ele costuma capturar tráfego indesejado
sudo rm -f $NGINX_ENABLED/default

echo -e "\033[1;33m-> Criando configuração MESTRE ÚNICA para o Nginx...\033[0m"

cat <<EOF > $NGINX_AVAILABLE/beckercorp_v8_master
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # Otimização SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # --- FRONTEND (Vite Preview) ---
    location / {
        proxy_pass http://127.0.0.1:6777;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # --- BACKEND API (Direto para o Legado 6778 para garantir estabilidade) ---
    location /api/ {
        proxy_pass http://127.0.0.1:6778;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Habilita o site novo
sudo ln -s $NGINX_AVAILABLE/beckercorp_v8_master $NGINX_ENABLED/beckercorp_v8_master

# Testa configuração
echo -e "\033[1;33m-> Testando configuração do Nginx...\033[0m"
sudo nginx -t

if [ $? -eq 0 ]; then
    sudo systemctl restart nginx
    echo -e "\033[0;32m✅ Nginx reiniciado com sucesso (Conflitos resolvidos).\033[0m"
else
    echo -e "\033[0;31m❌ Erro na configuração do Nginx. Verifique os logs.\033[0m"
fi

# ------------------------------------------------------------------------------
# 2. CORREÇÃO DO CRASH LOOP DO VITE (PM2)
# ------------------------------------------------------------------------------
echo -e "\033[1;33m-> Consertando vite.config.js (Modo HTTP Estável)...\033[0m"

cd $FRONTEND_DIR

# Configuração minimalista e à prova de falhas
cat <<EOF > vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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

echo -e "\033[1;33m-> Refazendo Build do zero...\033[0m"
rm -rf node_modules/.vite dist
npm run build

echo -e "\033[1;33m-> Reiniciando PM2 com parâmetros explícitos...\033[0m"
# Deletamos o processo antigo viciado
pm2 delete bcc-frontend

# Iniciamos de forma limpa, forçando a porta
pm2 start npm --name "bcc-frontend" -- run preview -- --port 6777 --host

# Salvamos o estado do PM2
pm2 save

echo -e "\033[0;32m✅ OPERAÇÃO DE RESGATE CONCLUÍDA!\033[0m"
echo -e "1. Atualize a página (Ctrl+F5) em: https://$DOMAIN"
echo -e "2. Verifique se o PM2 parou de reiniciar: 'pm2 status'"
