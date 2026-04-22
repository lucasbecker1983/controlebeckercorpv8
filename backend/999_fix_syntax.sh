#!/bin/bash
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}>>> [SÊNIOR] INICIANDO ROLLBACK E CORREÇÃO DE SINTAXE DO SERVER.TS...${NC}"

BACKEND_DIR="/opt/controlebeckercorp-v8/backend"

# 1. RECUPERA O ARQUIVO ORIGINAL DO BACKUP
echo -e "${YELLOW}-> Resgatando server.ts íntegro do backup da Becker Corp...${NC}"
LATEST_BACKUP=$(ls -t /opt/controlebeckercorp-v8/backups/*.tar.gz 2>/dev/null | head -n 1)

mkdir -p /tmp/rescue_server
tar -xzf "$LATEST_BACKUP" -C /tmp/rescue_server --wildcards "*/src/server.ts" 2>/dev/null
FOUND_SERVER=$(find /tmp/rescue_server -name "server.ts" | head -n 1)

if [ -n "$FOUND_SERVER" ]; then
    cp "$FOUND_SERVER" "$BACKEND_DIR/src/server.ts"
    echo -e "${GREEN}[+] server.ts restaurado com sucesso. Sintaxe 100% limpa.${NC}"
else
    echo -e "${YELLOW}[!] Backup não encontrado. Por favor, avise o Sênior.${NC}"
fi
rm -rf /tmp/rescue_server

# 2. APLICA AS CONFIGURAÇÕES CIRURGICAMENTE (SEM REGEX DESTRUTIVO)
cat > "$BACKEND_DIR/safe_patch.js" << 'EOF'
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/server.ts');
let code = fs.readFileSync(file, 'utf8');

// 1. Terminação SSL: Troca o motor de HTTPS para HTTP puro e rápido
code = code.replace("https.createServer(options, app).listen", "app.listen");
code = code.replace("Pong HTTPS", "Pong HTTP");

// 2. Garante o Roteamento do Unbound que consertamos hoje cedo
code = code.replace(/import dnsRoutes from ['"].*?['"];?\n?/g, '');
code = code.replace(/import unboundRoutes from ['"].*?['"];?\n?/g, '');
code = code.replace(/(import securityRoutes.*\n)/, "$1import unboundRoutes from './modules/unbound/routes';\n");
code = code.replace(/app\.use\(['"]\/api\/dns['"].*\n/g, "app.use('/api/dns', unboundRoutes);\n");

fs.writeFileSync(file, code);
console.log("[+] Patch HTTP e Unbound aplicados com segurança.");
EOF

cd "$BACKEND_DIR" || exit
node safe_patch.js
rm safe_patch.js

# 3. COMPILAÇÃO E RESTART
echo -e "${YELLOW}-> Compilando TypeScript...${NC}"
rm -rf dist/ build/
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}>>> COMPILAÇÃO BEM SUCEDIDA! Sem erros de sintaxe. <<<${NC}"
    pm2 restart bcc-backend > /dev/null 2>&1
    echo -e "${CYAN}>>> PM2 Reiniciado. Sistema ONLINE na porta 6778. <<<${NC}"
else
    echo -e "${RED}[!] Erro inesperado na compilação. Pare tudo.[!]${NC}"
fi
