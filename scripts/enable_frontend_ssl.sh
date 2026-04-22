#!/bin/bash

# ==============================================================================
#  BECKER CORP V8 - HABILITAR SSL NO FRONTEND (VITE)
#  Descrição: Configura o Vite para usar os certificados do LetsEncrypt.
# ==============================================================================

FRONTEND_DIR="/opt/controlebeckercorp-v8/frontend"
DOMAIN="console.jacarezinho.cloud"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"

echo -e "\033[0;34m=== HABILITANDO SSL/HTTPS NO FRONTEND ===\033[0m"

# 1. Verificar se os certificados existem
if [ ! -f "$CERT_PATH/privkey.pem" ]; then
    echo -e "\033[0;31m❌ ERRO: Certificados SSL não encontrados em $CERT_PATH\033[0m"
    echo -e "Certifique-se de que o domínio possui SSL gerado (Certbot)."
    exit 1
fi

# 2. Configurar vite.config.js com suporte a HTTPS e FileSystem (fs)
echo -e "\033[1;33m-> Atualizando vite.config.js com chaves SSL...\033[0m"

cat <<EOF > $FRONTEND_DIR/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

// Tenta carregar os certificados SSL
let httpsConfig = false;
try {
    httpsConfig = {
        key: fs.readFileSync('$CERT_PATH/privkey.pem'),
        cert: fs.readFileSync('$CERT_PATH/fullchain.pem'),
    }
    console.log('✅ SSL Carregado para o Frontend');
} catch (e) {
    console.warn('⚠️  Não foi possível ler os certificados SSL. Verifique permissões.');
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 6777,
    allowedHosts: ['$DOMAIN', 'all'],
    https: httpsConfig
  },
  preview: {
    host: '0.0.0.0',
    port: 6777,
    allowedHosts: ['$DOMAIN', 'all'],
    https: httpsConfig
  }
})
EOF

# 3. Ajustar permissões de leitura (Para o usuário do Node ler os certs)
# Nota: Isso é necessário se o PM2 não estiver rodando como root
echo -e "\033[1;33m-> Ajustando permissões de leitura dos certificados...\033[0m"
sudo chmod 755 /etc/letsencrypt/live
sudo chmod 755 /etc/letsencrypt/archive
sudo chmod 644 $CERT_PATH/privkey.pem
sudo chmod 644 $CERT_PATH/fullchain.pem

# 4. Recompilar e Reiniciar
echo -e "\033[1;33m-> Recompilando e Reiniciando...\033[0m"
cd $FRONTEND_DIR
npm run build
pm2 restart bcc-frontend

echo -e "\033[0;32m✅ FRONTEND AGORA ESTÁ SEGURO (HTTPS)!\033[0m"
echo -e "Acesse: https://$DOMAIN:6777"
