#!/bin/bash
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}>>> [SÊNIOR] INJETANDO LOGS DE FORMA SEGURA (SEM CONFLITO DE PORTAS)...${NC}"

# Cria APENAS o bloco 'server' com logs e acessos
cat > /etc/unbound/unbound.conf.d/beckercorp_logs.conf << 'EOF'
server:
    # 1. Ativa a gravação das consultas para o Node.js ler
    log-queries: yes
    extended-statistics: yes

    # 2. Libera de forma global TODAS as suas redes internas (VLANs 10, 30, 40, 50, 70, 80, 99)
    # Usamos blocos CIDR amplos para não ter chance de erro de sintaxe
    access-control: 192.168.0.0/16 allow
    access-control: 10.0.0.0/8 allow
    access-control: 172.16.0.0/12 allow
EOF

echo -e "${YELLOW}-> Reiniciando Unbound com segurança máxima...${NC}"
systemctl restart unbound

# Validação imediata
if systemctl is-active --quiet unbound; then
    echo -e "${GREEN}>>> SUCESSO ABSOLUTO! O Unbound aceitou a configuração e está rodando! <<<${NC}"
else
    echo -e "${RED}[!] Algo deu errado. Deletando a configuração para manter a rede online...[!]${NC}"
    rm -f /etc/unbound/unbound.conf.d/beckercorp_logs.conf
    systemctl restart unbound
fi
