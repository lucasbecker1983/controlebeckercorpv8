#!/bin/bash

# ==============================================================================
#  BECKER CORP V8 - DEBUG TELA BRANCA (WHITE SCREEN)
#  Descrição: Limpa caches, injeta depurador visual e verifica integridade.
# ==============================================================================

FRONTEND_DIR="/opt/controlebeckercorp-v8/frontend"
HTML_FILE="$FRONTEND_DIR/index.html"

echo -e "\033[0;34m=== INICIANDO DIAGNÓSTICO DE TELA BRANCA ===\033[0m"

# 1. LIMPEZA PROFUNDA (Deep Clean)
echo -e "\033[1;33m-> Limpando cache do Vite e Node Modules...\033[0m"
cd $FRONTEND_DIR
rm -rf node_modules/.vite
rm -rf dist

# 2. INJEÇÃO DE RASTREADOR VISUAL (Global Error Trap)
# Isso faz com que erros de JavaScript apareçam escritos na tela, ignorando o console.
echo -e "\033[1;33m-> Injetando Rastreador de Erros Visual no index.html...\033[0m"

# Restaura index.html original se existir backup
if [ -f "$HTML_FILE.bak" ]; then
    cp "$HTML_FILE.bak" "$HTML_FILE"
else
    cp "$HTML_FILE" "$HTML_FILE.bak"
fi

# Injeta script de erro antes do fechamento do head
DEBUG_SCRIPT="<script>window.addEventListener('error', function(e) { document.body.innerHTML += '<div style=\"position:fixed;top:0;left:0;width:100%;background:red;color:white;z-index:99999;padding:20px;font-size:20px;font-weight:bold;\">ERRO CRÍTICO JS: ' + e.message + '</div>'; }); window.addEventListener('unhandledrejection', function(e) { document.body.innerHTML += '<div style=\"position:fixed;top:50px;left:0;width:100%;background:orange;color:black;z-index:99999;padding:20px;font-size:20px;font-weight:bold;\">PROMISE REJEITADA: ' + e.reason + '</div>'; });</script>"

sed -i "s|</head>|$DEBUG_SCRIPT</head>|g" "$HTML_FILE"

# 3. RECOMPILAR (Build Limpo)
echo -e "\033[1;33m-> Recompilando Frontend (Build Limpo)...\033[0m"
npm run build

# 4. VERIFICAÇÃO DE NGINX (Logs de Acesso)
echo -e "\033[1;33m-> Verificando últimas 10 linhas de erro do Nginx (Buscando 404/500)...\033[0m"
echo "--- LOGS DE ERRO NGINX ---"
sudo tail -n 10 /var/log/nginx/error.log
echo "--- FIM LOGS ---"

# 5. REINICIAR
echo -e "\033[1;33m-> Reiniciando serviço...\033[0m"
pm2 restart bcc-frontend

echo -e "\033[0;32m=== MODO DEBUG ATIVADO ===\033[0m"
echo -e "1. Acesse o painel agora."
echo -e "2. Se aparecer uma FAIXA VERMELHA ou LARANJA no topo, me mande o erro escrito nela."
echo -e "3. Se continuar BRANCO, o problema é configuração do Nginx (SPA Routing)."
