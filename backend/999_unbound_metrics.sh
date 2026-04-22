#!/bin/bash
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}>>> [SÊNIOR] ATIVANDO TELEMETRIA AVANÇADA NO UNBOUND...${NC}"

# 1. Cria o arquivo de configuração focado apenas em métricas e logs
echo -e "${YELLOW}-> Injetando regras de log e estatísticas...${NC}"
cat > /etc/unbound/unbound.conf.d/beckercorp_metrics.conf << 'EOF'
server:
    # Ativa o contador de estatísticas avançadas (Necessário para a aba de status)
    extended-statistics: yes
    
    # Diz ao Unbound para gravar toda consulta DNS no log do sistema (journalctl)
    # Isso é o motor que faz a tabela de "Redes Monitoradas" funcionar
    log-queries: yes
    log-replies: yes
    log-servfail: yes
    
    # Formata o log de um jeito que o Regex do seu Backend consiga ler fácil
    log-time-ascii: yes

remote-control:
    # Ativa o comando 'unbound-control' que o Node.js usa
    control-enable: yes
    control-interface: 127.0.0.1
EOF

# 2. Gera as chaves de segurança para o unbound-control funcionar
echo -e "${YELLOW}-> Gerando certificados de controle interno...${NC}"
unbound-control-setup 2>/dev/null

# 3. Reinicia o Unbound para ele absorver a nova personalidade
echo -e "${YELLOW}-> Reiniciando o motor DNS...${NC}"
systemctl restart unbound

# 4. Faz um teste cego rápido para garantir que o controle ativou
echo -e "${GREEN}-> Teste de telemetria: $(unbound-control stats_noreset | grep 'total.num.queries' || echo 'Falha no controle')${NC}"

echo -e "${CYAN}>>> TELEMETRIA ATIVADA! O SEU PAINEL AGORA VAI LER OS DADOS. <<<${NC}"
