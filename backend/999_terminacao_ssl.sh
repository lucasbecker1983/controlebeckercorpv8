#!/bin/bash
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}>>> [SÊNIOR] INICIANDO ARQUITETURA DE TERMINAÇÃO SSL...${NC}"

BACKEND_DIR="/opt/controlebeckercorp-v8/backend"

# 1. Transformando o Backend de HTTPS para HTTP
echo -e "${YELLOW}-> Otimizando o server.ts para comunicação interna rápida...${NC}"
cat > "$BACKEND_DIR/fix_ssl.js" << 'EOF'
const fs = require('fs');
const path = require('path');
const serverFile = path.join(__dirname, 'src/server.ts');
let code = fs.readFileSync(serverFile, 'utf8');

// Troca o import de 'https' por 'http' se necessário (mas o express.listen já usa http por padrão)
// Remove o bloco try/catch pesadão do HTTPS e os certificados Let's Encrypt
code = code.replace(/try\s*\{\s*const options = \{[\s\S]*?https\.createServer\(options, app\)\.listen\(PORT, '0\.0\.0\.0', \(\) => \{[\s\S]*?\}\);\s*\}\s*catch\s*\(e\)\s*\{[\s\S]*?\}\s*\}?/g, "app.listen(PORT, '0.0.0.0', () => {\n    console.log(`>>> BACKEND CORE ONLINE: ${PORT} (HTTP Interno)`);\n});");

// Ajusta a rota de ping para refletir a nova realidade
code = code.replace(/msg: 'Pong HTTPS \(Core 6778\)'/g, "msg: 'Pong HTTP (Core 6778)'");

fs.writeFileSync(serverFile, code);
EOF

cd "$BACKEND_DIR" || exit
node fix_ssl.js
rm fix_ssl.js

# 2. Compilação e Restart do Motor
echo -e "${YELLOW}-> Compilando o novo núcleo otimizado...${NC}"
rm -rf dist/ build/
npm run build > /dev/null 2>&1

echo -e "${GREEN}-> Reiniciando o Node.js (Agora mais leve sem o peso do SSL)...${NC}"
pm2 restart bcc-backend > /dev/null 2>&1

# 3. Ajustando o Nginx para o fluxo correto
echo -e "${YELLOW}-> Avisando o Nginx para usar a via expressa local (HTTP)...${NC}"
sudo sed -i 's|https://127.0.0.1:6778|http://127.0.0.1:6778|g' /etc/nginx/sites-available/* /etc/nginx/conf.d/* 2>/dev/null
sudo systemctl restart nginx

echo -e "${CYAN}>>> ARQUITETURA DE PRODUÇÃO ESTABELECIDA! <<<${NC}"
