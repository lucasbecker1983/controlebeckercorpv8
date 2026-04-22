#!/bin/bash
set -euo pipefail

echo ">>> [PÂNICO] Removendo interceptação do Squid..."

ALL_NETS=(
  "192.168.10.0/24"
  "192.168.30.0/24"
  "192.168.40.0/24"
  "192.168.50.0/24"
  "192.168.70.0/24"
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

for NET in "${ALL_NETS[@]}"; do
  remove_rule "-s ${NET} ! -d 192.168.0.0/16 -p tcp --dport 80 -j REDIRECT --to-port 3128"
  remove_rule "-s ${NET} ! -d 192.168.0.0/16 -p tcp --dport 443 -j REDIRECT --to-port 3129"
done

remove_filter_rule FORWARD -p udp --dport 443 -j REJECT --reject-with icmp-port-unreachable
remove_filter_rule INPUT -p udp --dport 443 -j REJECT --reject-with icmp-port-unreachable

systemctl stop squid || true

if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save >/dev/null 2>&1 || true
fi

echo ">>> [PÂNICO] Interceptação removida sem limpar as tabelas globais do firewall."
