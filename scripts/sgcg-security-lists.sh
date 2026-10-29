#!/usr/bin/env bash
# Atualiza a zona RPZ de segurança do SGCG (malware, phishing, golpes, conteúdo adulto e
# provedores de DNS criptografado) a partir das listas públicas da HaGeZi.
# Vale para a rede inteira, inclusive VIPs. Só troca o arquivo se as três listas forem
# baixadas e validadas; em qualquer falha a lista anterior continua valendo.
set -euo pipefail

DEST_DIR="${SGCG_RPZ_DIR:-/etc/unbound/becker}"
DEST="$DEST_DIR/security.rpz"
ALLOW="$DEST_DIR/security-allow.rpz"
BASE="https://raw.githubusercontent.com/hagezi/dns-blocklists/main/rpz"
WORK="$(mktemp -d /var/tmp/sgcg-security-XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

log() { echo "[sgcg-security-lists] $*"; }

# lista:mínimo de entradas esperado (proteção contra download truncado ou vazio)
LISTS=("tif.mini:100000" "nsfw:50000" "doh:1000")

for item in "${LISTS[@]}"; do
  name="${item%%:*}"
  min="${item##*:}"
  code=$(curl -sS -m 180 --retry 2 -o "$WORK/$name.txt" -w '%{http_code}' "$BASE/$name.txt" || echo "000")
  if [[ "$code" != "200" ]]; then
    log "falha ao baixar $name (HTTP $code); mantendo a lista atual"
    exit 1
  fi
  count=$(grep -cE ' CNAME \.$' "$WORK/$name.txt" || true)
  if (( count < min )); then
    log "lista $name com $count entradas (mínimo $min); mantendo a lista atual"
    exit 1
  fi
  log "$name: $count entradas"
done

{
  echo '$TTL 3600'
  echo "@ SOA localhost. root.localhost. $(date +%s) 3600 600 86400 3600"
  echo '  NS localhost.'
  echo "; SGCG - zona de segurança gerada em $(date -Iseconds)"
  echo '; Fontes: HaGeZi tif.mini, nsfw e doh (https://github.com/hagezi/dns-blocklists)'
  cat "$WORK"/*.txt | grep -E '^[^;$@ ][^ ]* CNAME \.$' | sort -u
} > "$WORK/security.rpz"

total=$(grep -cE ' CNAME \.$' "$WORK/security.rpz")
log "zona consolidada com $total entradas"

install -d -m 755 "$DEST_DIR"
if [[ -f "$DEST" ]]; then cp -p "$DEST" "$DEST.prev"; fi
install -m 644 -o unbound -g unbound "$WORK/security.rpz" "$DEST.new"
mv -f "$DEST.new" "$DEST"

# Exceções: domínios que o SGCG libera mesmo se aparecerem nas listas (editável).
if [[ ! -f "$ALLOW" ]]; then
  {
    echo '$TTL 3600'
    echo "@ SOA localhost. root.localhost. $(date +%s) 3600 600 86400 3600"
    echo '  NS localhost.'
    echo '; SGCG - exceções da zona de segurança: "dominio.com CNAME rpz-passthru." e "*.dominio.com CNAME rpz-passthru."'
  } > "$ALLOW"
  chown unbound:unbound "$ALLOW"
  chmod 644 "$ALLOW"
fi

# Recarrega só a zona de segurança no DNS principal, se ela já estiver ativa.
if unbound-control list_auth_zones 2>/dev/null | grep -q 'rpz.security.becker.local'; then
  unbound-control auth_zone_reload rpz.security.becker.local. >/dev/null && log "DNS principal recarregado"
fi
# Resolvedor dos VIPs (porta 5355): reinicia se a zona estiver configurada nele.
if grep -q 'rpz.security.becker.local' /etc/unbound/sgcg-vip-clean.conf 2>/dev/null; then
  systemctl restart sgcg-vip-dns && log "resolvedor VIP recarregado"
fi
log "concluído"
