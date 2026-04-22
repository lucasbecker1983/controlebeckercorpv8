#!/bin/bash
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}>>> [SÊNIOR] INJETANDO DOWNLOAD UNIVERSAL NO MÓDULO CORRETO...${NC}"

BACKEND_DIR="/opt/controlebeckercorp-v8/backend"
REAL_ROUTE_FILE="$BACKEND_DIR/src/modules/backups/backups-routes.ts"

if [ ! -f "$REAL_ROUTE_FILE" ]; then
    echo -e "\033[0;31m[!] ERRO FATAL: Arquivo real $REAL_ROUTE_FILE não encontrado.\033[0m"
    exit 1
fi

# Script Node para fazer o parse e injetar o código sem quebrar nada
cat > "$BACKEND_DIR/inject_real_route.js" << 'EOF'
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
let code = fs.readFileSync(file, 'utf8');

console.log("[*] Lendo o arquivo original...");

// 1. Garante que os módulos necessários do Node estão importados
if (!code.includes("import fs ")) {
    code = "import fs from 'fs';\n" + code;
    console.log("[+] Import 'fs' adicionado.");
}
if (!code.includes("import path ")) {
    code = "import path from 'path';\n" + code;
    console.log("[+] Import 'path' adicionado.");
}

// 2. O Bloco Universal de Download da Becker Corp (Aceita GET e POST)
const universalDownloadBlock = `
// =========================================================================
// INJEÇÃO SÊNIOR: DOWNLOAD UNIVERSAL COM TRADUTOR DE DATAS
// =========================================================================
router.all(['/download', '/download/:filename'], (req, res) => {
    try {
        const reqFilename = req.params.filename || req.body.filename || req.body.file || req.body.name || req.query.file;
        
        if (!reqFilename) return res.status(400).json({ error: 'Nome do arquivo não especificado.' });
        if (reqFilename.includes('..') || reqFilename.includes('/')) return res.status(403).json({ error: 'Bloqueado por segurança.' });

        const BACKUP_DIR = '/opt/controlebeckercorp-v8/backups';
        
        // 1. Tenta achar o exato
        const exactPath = path.join(BACKUP_DIR, reqFilename);
        if (fs.existsSync(exactPath)) {
            console.log(\`[DOWNLOAD] Arquivo exato: \${reqFilename}\`);
            return res.download(exactPath, reqFilename);
        }

        // 2. Tradução Mágica (sql.gz -> tar.gz do dia)
        const dateMatch = reqFilename.match(/_(\\d{4})(\\d{2})(\\d{2})_/);
        if (dateMatch) {
            const searchPrefix = \`becker_v8_full_\${dateMatch[1]}-\${dateMatch[2]}-\${dateMatch[3]}\`;
            if (fs.existsSync(BACKUP_DIR)) {
                const files = fs.readdirSync(BACKUP_DIR);
                const dayFiles = files.filter(f => f.startsWith(searchPrefix) && f.endsWith('.tar.gz'));
                
                if (dayFiles.length > 0) {
                    // Pega o mais recente
                    dayFiles.sort((a, b) => fs.statSync(path.join(BACKUP_DIR, b)).mtimeMs - fs.statSync(path.join(BACKUP_DIR, a)).mtimeMs);
                    console.log(\`[DOWNLOAD] Entregando real: \${dayFiles[0]}\`);
                    return res.download(path.join(BACKUP_DIR, dayFiles[0]), dayFiles[0]);
                }
            }
        }
        
        console.log(\`[DOWNLOAD] Arquivo não encontrado fisicamente.\`);
        return res.status(404).json({ error: 'Arquivo não encontrado no disco.' });
    } catch (error) {
        console.error('[DOWNLOAD] Erro Fatal:', error);
        return res.status(500).json({ error: 'Erro interno.' });
    }
});
// =========================================================================

`;

// 3. Injeta apenas se já não tivermos injetado antes
if (!code.includes('DOWNLOAD UNIVERSAL')) {
    // Procura o export default router e injeta antes dele
    code = code.replace(/export default router;/g, universalDownloadBlock + 'export default router;');
    fs.writeFileSync(file, code);
    console.log("\033[0;32m[+] INJEÇÃO REALIZADA COM SUCESSO!\033[0m");
} else {
    console.log("\033[1;33m[*] A injeção já estava presente neste arquivo.\033[0m");
}
EOF

# Executa o script de injeção
cd $BACKEND_DIR
node inject_real_route.js "$REAL_ROUTE_FILE"

# Limpa o rastro
rm inject_real_route.js

echo -e "\n${YELLOW}>>> RECOMPILANDO O MOTOR TYPESCRIPT...${NC}"
npm run build > /dev/null 2>&1

echo -e "${YELLOW}>>> REINICIANDO O CÉREBRO NO PM2...${NC}"
pm2 restart bcc-backend > /dev/null 2>&1

echo -e "${GREEN}>>> CIRCUITO FECHADO DEFINITIVAMENTE! <<<${NC}"
echo -e "O módulo de backups real agora possui o endpoint universal."
