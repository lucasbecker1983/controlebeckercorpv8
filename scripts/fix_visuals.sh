#!/bin/bash

# ==============================================================================
#  BECKER CORP V8 - RESTAURAÇÃO VISUAL (FIX CSS/TAILWIND)
#  Descrição: Restaura configurações do Tailwind e PostCSS para corrigir tela branca.
# ==============================================================================

FRONTEND_DIR="/opt/controlebeckercorp-v8/frontend"

echo -e "\033[0;34m=== RESTAURANDO MOTORES VISUAIS (CSS) ===\033[0m"

cd $FRONTEND_DIR

# 1. Restaurar tailwind.config.js (Define as cores e caminhos)
echo -e "\033[1;33m-> Recriando tailwind.config.js...\033[0m"
cat <<EOF > tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
EOF

# 2. Restaurar postcss.config.js (Processador de CSS)
echo -e "\033[1;33m-> Recriando postcss.config.js...\033[0m"
cat <<EOF > postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

# 3. Garantir que o CSS principal tenha as diretivas do Tailwind
echo -e "\033[1;33m-> Verificando src/index.css...\033[0m"
cat <<EOF > src/index.css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-slate-950 text-white;
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

# 4. Forçar Reinstalação do Tailwind (caso tenha sumido dos node_modules)
echo -e "\033[1;33m-> Garantindo dependências de estilo...\033[0m"
npm install -D tailwindcss postcss autoprefixer

# 5. Recompilar
echo -e "\033[1;33m-> Compilando estilos...\033[0m"
npm run build

# 6. Reiniciar
pm2 restart bcc-frontend

echo -e "\033[0;32m✅ VISUAL RESTAURADO!\033[0m"
echo -e "Acesse o painel e dê um Ctrl+F5 para limpar o cache."
