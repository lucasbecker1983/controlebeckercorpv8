#!/bin/bash
# -------------------------------------------------------------------------
# NOME: 005_recovery_master.sh
# DESCRIÇÃO: Restaurador Absoluto do PM2 (Frontend + Backend)
# SISTEMA: Controle Becker Corp V8
# -------------------------------------------------------------------------

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🚀 [BECKER CORP V8] INICIANDO PROTOCOLO DE RECUPERAÇÃO MÁXIMA...${NC}"

# 1. Limpando processos travados no PM2
echo -e "${YELLOW}🧹 Limpando tabela do PM2...${NC}"
pm2 delete all 2>/dev/null
pm2 flush

# 2. Subindo o Motor Backend (TypeScript) usando NPX para bypass de PATH
echo -e "${YELLOW}⏳ Subindo Motor Backend na porta 6778...${NC}"
cd /opt/controlebeckercorp-v8/backend
# O npx garante que o ts-node da própria pasta node_modules seja usado, sem erro de PATH
pm2 start npx --name bcc-backend -- ts-node src/server.ts

# 3. Subindo o Painel Frontend (React/Vite)
echo -e "${YELLOW}⏳ Subindo Painel Frontend...${NC}"
cd /opt/controlebeckercorp-v8/frontend
pm2 start npm --name bcc-frontend -- run dev

# 4. Aguarda para estabilização
echo -e "${YELLOW}⏳ Aguardando os serviços respirarem (3s)...${NC}"
sleep 3

# 5. Salva na Memória do Servidor
echo -e "${YELLOW}💾 Gravando processos no concreto (pm2 save)...${NC}"
pm2 save
pm2 startup | grep "sudo" | bash 2>/dev/null

# 6. Cálculo exato do Uptime do Servidor (Dias, Horas, Minutos)
UPTIME_RAW=$(cat /proc/uptime | awk '{print $1}')
DAYS=$(echo "$UPTIME_RAW / 86400" | bc)
HOURS=$(echo "($UPTIME_RAW % 86400) / 3600" | bc)
MINS=$(echo "($UPTIME_RAW % 3600) / 60" | bc)

echo -e "${CYAN}------------------------------------------------${NC}"
echo -e "${GREEN}✅ SISTEMA TOTALMENTE RESTAURADO E ONLINE!${NC}"
echo -e "${CYAN}⏱️ UPTIME DO SERVIDOR: ${DAYS} dias, ${HOURS} horas e ${MINS} minutos desde o último boot.${NC}"
echo -e "${CYAN}------------------------------------------------${NC}"

# Mostra o status final
pm2 status
