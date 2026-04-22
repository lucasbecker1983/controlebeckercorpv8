#!/bin/bash

# ==============================================================================
#  BECKER CORP V8 - RESTAURAR FRONTEND HTTP (CORREÇÃO ERRO 502)
#  Descrição: Remove SSL interno do Vite para permitir que o Nginx gerencie o HTTPS.
# ==============================================================================

FRONTEND_DIR="/opt/controlebeckercorp-v8/frontend"
DOMAIN="console.jacarezinho.cloud"

echo -e "\033[0;34m=== CORRIGINDO ERRO 502 BAD GATEWAY ===\033[0m"

# 1. Voltar vite.config.js para o modo padrão (HTTP)
# Isso permite que o Nginx (que já faz o SSL) consiga conversar com a app.
echo -e "\033[1;33m-> Restaurando configuração HTTP no Vite...\033[0m"

cat <<EOF > $FRONTEND_DIR/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuração padrão HTTP (O Nginx cuidará do SSL externamente)
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
  }
})
EOF

# 2. Recompilar e Reiniciar
echo -e "\033[1;33m-> Recompilando e Reiniciando Serviços...\033[0m"
cd $FRONTEND_DIR
npm run build
pm2 restart bcc-frontend

echo -e "\033[0;32m✅ SISTEMA RESTAURADO!\033[0m"
echo -e "Tente acessar agora: https://$DOMAIN"
echo -e "Nota: Se você usa Nginx, ele já garante o HTTPS. Não ative SSL dentro do Vite."1~#!/bin/bash

# ==============================================================================
#  BECKER CORP V8 - RESTAURAR FRONTEND HTTP (CORREÇÃO ERRO 502)
#  Descrição: Remove SSL interno do Vite para permitir que o Nginx gerencie o HTTPS.
# ==============================================================================

FRONTEND_DIR="/opt/controlebeckercorp-v8/frontend"
DOMAIN="console.jacarezinho.cloud"

echo -e "\033[0;34m=== CORRIGINDO ERRO 502 BAD GATEWAY ===\033[0m"

# 1. Voltar vite.config.js para o modo padrão (HTTP)
# Isso permite que o Nginx (que já faz o SSL) consiga conversar com a app.
echo -e "\033[1;33m-> Restaurando configuração HTTP no Vite...\033[0m"

cat <<EOF > $FRONTEND_DIR/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuração padrão HTTP (O Nginx cuidará do SSL externamente)
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
  }
})
EOF

# 2. Recompilar e Reiniciar
echo -e "\033[1;33m-> Recompilando e Reiniciando Serviços...\033[0m"
cd $FRONTEND_DIR
npm run build
pm2 restart bcc-frontend

echo -e "\033[0;32m✅ SISTEMA RESTAURADO!\033[0m"
echo -e "Tente acessar agora: https://$DOMAIN"
echo -e "Nota: Se você usa Nginx, ele já garante o HTTPS. Não ative SSL dentro do Vite."1~#!/bin/bash

# ==============================================================================
#  BECKER CORP V8 - RESTAURAR FRONTEND HTTP (CORREÇÃO ERRO 502)
#  Descrição: Remove SSL interno do Vite para permitir que o Nginx gerencie o HTTPS.
# ==============================================================================

FRONTEND_DIR="/opt/controlebeckercorp-v8/frontend"
DOMAIN="console.jacarezinho.cloud"

echo -e "\033[0;34m=== CORRIGINDO ERRO 502 BAD GATEWAY ===\033[0m"

# 1. Voltar vite.config.js para o modo padrão (HTTP)
# Isso permite que o Nginx (que já faz o SSL) consiga conversar com a app.
echo -e "\033[1;33m-> Restaurando configuração HTTP no Vite...\033[0m"

cat <<EOF > $FRONTEND_DIR/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuração padrão HTTP (O Nginx cuidará do SSL externamente)
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
  }
})
EOF

# 2. Recompilar e Reiniciar
echo -e "\033[1;33m-> Recompilando e Reiniciando Serviços...\033[0m"
cd $FRONTEND_DIR
npm run build
pm2 restart bcc-frontend

echo -e "\033[0;32m✅ SISTEMA RESTAURADO!\033[0m"
echo -e "Tente acessar agora: https://$DOMAIN"
echo -e "Nota: Se você usa Nginx, ele já garante o HTTPS. Não ative SSL dentro do Vite."
