#!/usr/bin/env bash
# Dá a um VIP da VLAN 10 um IP fixo fora da faixa automática do DHCP (.28-.100), para ele não perder o VIP
# quando o aparelho reconectar com outro IP.
#   1. troca o IP do cadastro VIP pela API do SGCG (fica na auditoria);
#   2. aponta o histórico do DHCP (mac_ip_db.csv) para o novo IP e roda o gerador de reservas, que grava a
#      reserva em /etc/dhcp/static_hosts.conf e reinicia o DHCP (o gerador ignora IPs da faixa automática,
#      por isso o IP precisa estar fora dela);
#   3. reaplica as políticas.
# Uso: sudo bash scripts/sgcg-vip-ip-fixo.sh <id do VIP> <novo IP> <MAC>
# Ex.: sudo bash scripts/sgcg-vip-ip-fixo.sh 55 192.168.10.119 ee:f8:7a:a2:9b:e2   (iPhone do Secretário Leandro)
set -Eeuo pipefail
ID="${1:?id do VIP}"; NEWIP="${2:?novo IP}"; MAC="$(echo "${3:?MAC}" | tr 'A-F' 'a-f')"
DB=/var/lib/dhcp/mac_ip_db.csv
STATIC=/etc/dhcp/static_hosts.conf
GEN=/usr/local/sbin/dhcp_autobind_reservations.sh
BK=/opt/controlebeckercorp-v8/backups/arquivo
TS="$(date -u +%Y%m%dT%H%M%SZ)"
NODE="$(command -v node || echo /root/.nvm/versions/node/v20.20.0/bin/node)"

[[ "$NEWIP" =~ ^192\.168\.10\.([0-9]+)$ ]] || { echo "O novo IP precisa ser da VLAN 10."; exit 64; }
last="${BASH_REMATCH[1]}"
(( last >= 101 && last <= 254 )) || { echo "O novo IP precisa estar fora da faixa automática (.28-.100)."; exit 64; }
[[ "$MAC" =~ ^([0-9a-f]{2}:){5}[0-9a-f]{2}$ ]] || { echo "MAC inválido."; exit 64; }
if grep -q "fixed-address $NEWIP;" "$STATIC" && ! grep -q "hardware ethernet $MAC; fixed-address $NEWIP;" "$STATIC"; then
    echo "$NEWIP já está reservado para outro aparelho."; exit 65
fi
if ip -4 neigh show "$NEWIP" | grep -q lladdr && ! ip -4 neigh show "$NEWIP" | grep -qi "$MAC"; then
    echo "$NEWIP está em uso por outro aparelho agora."; exit 65
fi
grep -qi "^$MAC,.*,10," "$DB" || { echo "MAC $MAC não aparece no histórico do DHCP da VLAN 10."; exit 65; }

mkdir -p "$BK"
cp -p "$DB" "$BK/mac_ip_db.csv.antes-vip-ip-fixo_$TS"
cp -p "$STATIC" "$BK/static_hosts.conf.antes-vip-ip-fixo_$TS"

echo "1. Cadastro VIP $ID -> $NEWIP"
VIP_ID="$ID" NEWIP="$NEWIP" "$NODE" - <<'JS'
require('/opt/controlebeckercorp-v8/backend/node_modules/dotenv').config({ path: '/opt/controlebeckercorp-v8/backend/.env', quiet: true });
const jwt = require('/opt/controlebeckercorp-v8/backend/node_modules/jsonwebtoken');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const token = jwt.sign({ id: -1, username: `${process.env.SUDO_USER || 'admin'} (IP fixo do VIP fora da faixa automática)`, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
fetch(`https://127.0.0.1:6779/api/bloqueios-liberacoes/exceptions/${process.env.VIP_ID}`, {
  method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: process.env.NEWIP }),
}).then(async (r) => { const t = await r.text(); if (!r.ok) { console.error(`ERRO HTTP ${r.status}: ${t.slice(0, 300)}`); process.exit(1); } console.log('   cadastro atualizado'); });
JS

echo "2. Reserva no DHCP"
awk -F, -v OFS=, -v mac="$MAC" -v ip="$NEWIP" 'tolower($1)==mac && $3=="10" {$2=ip} {print}' "$DB" > "$DB.tmp" && cat "$DB.tmp" > "$DB" && rm -f "$DB.tmp"
bash "$GEN" | sed 's/^/   /'
grep -q "hardware ethernet $MAC; fixed-address $NEWIP;" "$STATIC" || { echo "ERRO: a reserva não entrou em $STATIC (cópias em $BK)."; exit 1; }
systemctl is-active --quiet isc-dhcp-server || { echo "ERRO: o DHCP não está rodando; restaure $BK/static_hosts.conf.antes-vip-ip-fixo_$TS"; exit 1; }
echo "   reserva gravada e DHCP no ar"

echo "3. Reaplicando políticas"
"$NODE" - <<'JS'
require('/opt/controlebeckercorp-v8/backend/node_modules/dotenv').config({ path: '/opt/controlebeckercorp-v8/backend/.env', quiet: true });
const jwt = require('/opt/controlebeckercorp-v8/backend/node_modules/jsonwebtoken');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const token = jwt.sign({ id: -1, username: `${process.env.SUDO_USER || 'admin'} (IP fixo do VIP)`, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
fetch('https://127.0.0.1:6779/api/bloqueios-liberacoes/apply', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' })
  .then(async (r) => { if (!r.ok) { console.error('ERRO ao reaplicar:', r.status, (await r.text()).slice(0, 200)); process.exit(1); } console.log('   políticas reaplicadas'); });
JS
echo "Pronto. O aparelho recebe $NEWIP na próxima vez que conectar (ou ao desligar e ligar o Wi-Fi)."
