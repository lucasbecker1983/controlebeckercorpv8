#!/bin/bash
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FRONT_DIR="/opt/controlebeckercorp-v8/frontend/src"

echo -e "${YELLOW}>>> LENDO ESTRUTURA DO FRONTEND (PARA CORRIGIR O LOOP DE LOGIN)...${NC}"

# 1. Tenta achar o arquivo principal
echo -e "\n1. Conteúdo do App.jsx (ou App.tsx):"
if [ -f "$FRONT_DIR/App.jsx" ]; then
    cat "$FRONT_DIR/App.jsx"
elif [ -f "$FRONT_DIR/App.tsx" ]; then
    cat "$FRONT_DIR/App.tsx"
else
    echo "App.jsx/tsx não encontrado na raiz de src."
fi

# 2. Tenta achar arquivo de Rotas (se houver)
echo -e "\n2. Conteúdo de Routes.jsx (se existir):"
ls "$FRONT_DIR/routes"* 2>/dev/null | xargs cat 2>/dev/null || echo "Arquivo de rotas separado não encontrado."

# 3. Lista de arquivos na pasta src (para eu me localizar)
echo -e "\n3. Lista de arquivos em src:"
ls -F "$FRONT_DIR"
