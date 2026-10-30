#!/usr/bin/env bash
# Verifica se o WhatsApp está 100% liberado no DNS de cada VLAN gerenciada.
# Cada consulta sai com o endereço do servidor na própria VLAN como origem, então o Unbound aplica as regras
# daquela VLAN (o mesmo que um aparelho dela veria). Só lê: não altera nada.
#
# Uso:  scripts/sgcg-whatsapp-check.sh            (VLANs 10 30 40 50 70)
#       scripts/sgcg-whatsapp-check.sh 30 70      (só estas VLANs)
# Saída: tabela domínio x VLAN (ok / BLOQ / ?) e código 1 se algum endereço estiver bloqueado.
set -uo pipefail

VLANS="${*:-10 30 40 50 70}"

# Endereços do WhatsApp (app, web, mídia, chamadas) e da infraestrutura Meta que ele usa (regra
# "WhatsApp Web - dependencias Meta"). Não inclui o que é só de Facebook/Instagram.
DOMAINS='
whatsapp.com
www.whatsapp.com
web.whatsapp.com
api.whatsapp.com
business.whatsapp.com
faq.whatsapp.com
graph.whatsapp.com
whatsapp.net
g.whatsapp.net
v.whatsapp.net
mmg.whatsapp.net
mmx-ds.cdn.whatsapp.net
pps.whatsapp.net
static.whatsapp.net
cdn.whatsapp.net
chat.cdn.whatsapp.net
crashlogs.whatsapp.net
dit.whatsapp.net
media-gru2-1.cdn.whatsapp.net
media.fldb7-1.fna.whatsapp.net
wa.me
graph.facebook.com
api.facebook.com
b-graph.facebook.com
graph-fallback.facebook.com
edge-mqtt.facebook.com
edge-mqtt-fallback.facebook.com
star.c10r.facebook.com
star.fallback.c10r.facebook.com
chat-e2ee-mini.facebook.com
dgw-mini.c10r.facebook.com
mqtt.c10r.facebook.com
mqtt.fallback.c10r.facebook.com
gateway.facebook.com
z-m-gateway.facebook.com
ep7.facebook.com
connect.facebook.net
z-p42-chat-e2ee-ig.facebook.com
'

printf '%-34s' "dominio"
for v in $VLANS; do printf '%-8s' "VLAN$v"; done
echo

bad=0
while read -r d; do
  [ -z "$d" ] && continue
  printf '%-34s' "$d"
  for v in $VLANS; do
    s="$(dig +time=3 +tries=2 -b "192.168.$v.1" "@192.168.$v.1" "$d" A +noall +comments 2>/dev/null | grep -oE 'status: [A-Z]+' | cut -d' ' -f2)"
    case "$s" in
      NOERROR) mark="ok" ;;
      NXDOMAIN) mark="BLOQ"; bad=$((bad + 1)) ;;
      "") mark="?" ;;
      *) mark="$s" ;;
    esac
    printf '%-8s' "$mark"
  done
  echo
done <<< "$DOMAINS"

echo "bloqueados: $bad"
[ "$bad" -eq 0 ]
