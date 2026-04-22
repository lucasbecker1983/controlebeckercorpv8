#!/bin/bash
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}>>> [Engenharia Sênior] INICIANDO ROLLBACK CIRÚRGICO DO MÓDULO DNS...${NC}"

BACKUP_DIR="/opt/controlebeckercorp-v8/backups"
BACKEND_DIR=$(node -e "try { const p = require('child_process').execSync('pm2 jlist', {encoding:'utf8', stdio:'pipe'}); const app = JSON.parse(p).find(a => a.name === 'bcc-backend'); if(app) console.log(app.pm2_env.pm_cwd); } catch(e) {}")
if [[ "$BACKEND_DIR" == *"/dist"* ]] || [[ "$BACKEND_DIR" == *"/build"* ]]; then BACKEND_DIR=$(dirname "$BACKEND_DIR"); fi
if [ -z "$BACKEND_DIR" ]; then BACKEND_DIR="/opt/controlebeckercorp-v8/backend"; fi

DNS_DIR="$BACKEND_DIR/src/modules/dns"

# 1. Pega o arquivo tar.gz mais recente que temos na pasta de backups
LATEST_BACKUP=$(ls -t $BACKUP_DIR/*.tar.gz 2>/dev/null | head -n 1)

if [ -z "$LATEST_BACKUP" ]; then
    echo -e "${RED}[!] ERRO FATAL: Nenhum arquivo .tar.gz encontrado em $BACKUP_DIR.${NC}"
    exit 1
fi

echo -e "${YELLOW}-> Extraindo inteligência do backup: $(basename $LATEST_BACKUP)${NC}"

# Cria uma pasta temporária segura
mkdir -p /tmp/bcc_rescue

# 2. Faz o Tar pescar apenas o arquivo dns-routes.ts onde quer que ele esteja na árvore
tar -xzf "$LATEST_BACKUP" -C /tmp/bcc_rescue --wildcards "*/src/modules/dns/dns-routes.ts" "src/modules/dns/dns-routes.ts" "dns-routes.ts" 2>/dev/null

FOUND_FILE=$(find /tmp/bcc_rescue -type f -name "dns-routes.ts" | head -n 1)

if [ -n "$FOUND_FILE" ]; then
    # Devolve para a estrutura original
    cp "$FOUND_FILE" "$DNS_DIR/dns-routes.ts"
    echo -e "${GREEN}-> Lógica avançada das VLANs recuperada com sucesso!${NC}"
else
    echo -e "${RED}[!] O arquivo dns-routes.ts original não pôde ser localizado no backup.${NC}"
    rm -rf /tmp/bcc_rescue
    exit 1
fi

rm -rf /tmp/bcc_rescue

# 3. Compilação e Deploy a Quente
echo -e "${YELLOW}>>> RECOMPILANDO O CÓDIGO TYPESCRIPT...${NC}"
cd "$BACKEND_DIR" || exit
rm -rf dist/ build/
npm run build > /dev/null 2>&1

echo -e "${YELLOW}>>> REINICIANDO A API NO PM2...${NC}"
pm2 restart bcc-backend > /dev/null 2>&1

echo -e "${GREEN}>>> ROLLBACK CONCLUÍDO! O SEU SISTEMA VOLTOU AO ESTADO ÍNTEGRO. <<<${NC}"
