#!/bin/bash
set -euo pipefail

echo ">>> [SQUID] Aplicando interceptação controlada..."

INTERCEPT_NETS=(
  "192.168.10.0/24"
  "192.168.30.0/24"
  "192.168.50.0/24"
  "192.168.70.0/24"
)

EXCLUDED_NETS=(
  "192.168.40.0/24"
  "192.168.80.0/24"
  "192.168.99.0/24"
)

remove_rule() {
  local rule="$1"
  while iptables -t nat -C PREROUTING ${rule} 2>/dev/null; do
    iptables -t nat -D PREROUTING ${rule}
  done
}

remove_filter_rule() {
  local chain="$1"
  shift
  while iptables -C "${chain}" "$@" 2>/dev/null; do
    iptables -D "${chain}" "$@"
  done
}

sysctl -w net.ipv4.ip_forward=1 >/dev/null

# Limpa apenas resíduos de interceptação do Squid, sem derrubar UFW/Docker/libvirt.
for NET in "${INTERCEPT_NETS[@]}" "${EXCLUDED_NETS[@]}"; do
  remove_rule "-s ${NET} ! -d 192.168.0.0/16 -p tcp --dport 80 -j REDIRECT --to-port 3128"
  remove_rule "-s ${NET} ! -d 192.168.0.0/16 -p tcp --dport 443 -j REDIRECT --to-port 3129"
done

# Reaplica somente nas redes autorizadas.
for NET in "${INTERCEPT_NETS[@]}"; do
  iptables -t nat -A PREROUTING -s "${NET}" ! -d 192.168.0.0/16 -p tcp --dport 80 -j REDIRECT --to-port 3128
  iptables -t nat -A PREROUTING -s "${NET}" ! -d 192.168.0.0/16 -p tcp --dport 443 -j REDIRECT --to-port 3129
done

# Força fallback para TCP, sem interferir nas VLANs excluídas.
remove_filter_rule FORWARD -p udp --dport 443 -j REJECT --reject-with icmp-port-unreachable
remove_filter_rule INPUT -p udp --dport 443 -j REJECT --reject-with icmp-port-unreachable
iptables -A FORWARD -p udp --dport 443 -j REJECT --reject-with icmp-port-unreachable
iptables -A INPUT -p udp --dport 443 -j REJECT --reject-with icmp-port-unreachable

if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save >/dev/null 2>&1 || true
fi

echo ">>> [SQUID] Interceptação ativa somente para 10/30/50/70. VLANs 40/80/99 permanecem fora do proxy."
