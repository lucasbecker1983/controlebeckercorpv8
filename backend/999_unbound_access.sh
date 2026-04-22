#!/bin/bash
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}>>> [SÊNIOR] LIBERANDO ACESSO E TELEMETRIA DO UNBOUND...${NC}"

# 1. Reescrevendo o arquivo com as permissões vitais (Access Control)
echo -e "${YELLOW}-> Configurando Interfaces e Regras de Acesso (VLANs)...${NC}"
cat > /etc/unbound/unbound.conf.d/beckercorp_metrics.conf << 'EOF'
server:
    # 1. ESCUTAR TODAS AS PLACAS DE REDE (VLANs e VPN)
    interface: 0.0.0.0
    
    # 2. PERMISSÕES DE ACESSO (ALLOW)
    # Permite que as suas redes conversem com o DNS
    access-control: 127.0.0.0/8 allow
    access-control: 192.168.10.0/24 allow  # Secretaria
    access-control: 192.168.30.0/24 allow  # Celulares
    access-control: 192.168.40.0/24 allow  # CFTV
    access-control: 192.168.50.0/24 allow  # SINE
    access-control: 192.168.70.0/24 allow  # Visitantes
    access-control: 192.168.80.0/24 allow  # VOiP
    access-control: 192.168.99.0/24 allow  # Gerenciamento
    access-control: 10.8.0.0/24 allow      # OpenVPN/Wireguard (se usar)
    access-control: 172.18.0.0/16 allow    # Docker Networks

    # 3. TELEMETRIA E LOGS (O motor do seu Painel)
    extended-statistics: yes
    log-queries: yes
    log-replies: yes
    log-servfail: yes
    log-time-ascii: yes
    # Log level 1 é o padrão, suficiente para queries.
    verbosity: 1

remote-control:
    # Controle via backend Node.js
    control-enable: yes
    control-interface: 127.0.0.1
EOF

# 2. Garante as permissões de chave (Problema clássico do Ubuntu)
echo -e "${YELLOW}-> Corrigindo permissões dos certificados de controle...${NC}"
chown unbound:unbound /etc/unbound/unbound_*
chmod 640 /etc/unbound/unbound_*

# 3. Restart violento
echo -e "${YELLOW}-> Reiniciando o motor DNS com as novas permissões...${NC}"
systemctl restart unbound

# 4. Status de Vida
if systemctl is-active --quiet unbound; then
    echo -e "${GREEN}>>> SUCESSO! O Unbound está VIVO, ESCUTANDO e LOGANDO. <<<${NC}"
    echo -e "${GREEN}-> Teste de telemetria: $(unbound-control stats_noreset | grep 'total.num.queries')${NC}"
else
    echo -e "${RED}[!] O Unbound ainda recusou a inicialização. Pare e rode 'journalctl -u unbound -n 20'.[!]${NC}"
fi
