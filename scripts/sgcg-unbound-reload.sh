#!/usr/bin/env bash
# Recarrega o Unbound principal do jeito mais leve possível, sem derrubar o DNS à toa.
#
# O `systemctl reload unbound` (SIGHUP) reinicia o processo inteiro e, com a lista de segurança de 618 mil entradas,
# deixa o DNS de todas as VLANs sem responder por ~4 s. Este utilitário compara o que mudou desde o último reload:
#   - nada mudou                              -> não faz nada;
#   - só zonas RPZ pequenas (<= 3 MB) mudaram -> `unbound-control auth_zone_reload` só dessas zonas (~20 ms, sem queda);
#   - mudou configuração, zona grande ou algo não mapeado, ou a recarga da zona falhou -> reload completo (o de sempre).
# O hash dos arquivos já carregados fica em /var/lib/sgcg/unbound-reload.sha.
#
# Uso:  sgcg-unbound-reload.sh            decide sozinho
#       sgcg-unbound-reload.sh --full     força o reload completo
#       sgcg-unbound-reload.sh --init     só registra o estado atual (use quando o Unbound já carregou tudo)
set -uo pipefail

STATE_DIR=/var/lib/sgcg
STATE="$STATE_DIR/unbound-reload.sha"
NOW="$STATE_DIR/unbound-reload.now"
LOCK=/run/sgcg-unbound-reload.lock
MAX_ZONE_BYTES=$((3 * 1024 * 1024))
MODE="${1:-auto}"
mkdir -p "$STATE_DIR"
exec 9>"$LOCK"
flock -w 60 9 || { echo "sgcg-unbound-reload: outro reload em andamento" >&2; exit 1; }

log() { logger -t sgcg-unbound-reload "$*"; echo "sgcg-unbound-reload: $*"; }

# zona<TAB>arquivo de todas as zonas RPZ declaradas na configuração
zone_map() {
  cat /etc/unbound/unbound.conf /etc/unbound/unbound.conf.d/*.conf 2>/dev/null | awk '
    /^[[:space:]]*rpz:[[:space:]]*$/ { inrpz = 1; name = ""; next }
    /^[a-z-]+:[[:space:]]*$/         { inrpz = 0 }
    inrpz && /^[[:space:]]*name:/     { n = $0; gsub(/^[^"]*"|".*$/, "", n); name = n }
    inrpz && /^[[:space:]]*zonefile:/ { f = $0; gsub(/^[^"]*"|".*$/, "", f); if (name != "" && f != "") print name "\t" f }'
}

snapshot() {
  { ls /etc/unbound/unbound.conf /etc/unbound/unbound.conf.d/*.conf 2>/dev/null
    zone_map | cut -f2; } | sort -u | while read -r f; do
      [ -f "$f" ] && sha256sum "$f"
    done
}

full_reload() {
  if ! unbound-checkconf >/dev/null 2>&1; then log "unbound-checkconf falhou: reload cancelado"; return 1; fi
  systemctl reload unbound || return 1
  # a recarga é assíncrona (type=notify): espera o serviço voltar a ficar ativo
  for _ in $(seq 1 40); do [ "$(systemctl is-active unbound)" = "active" ] && return 0; sleep 0.5; done
  log "unbound não voltou a ficar ativo depois do reload"; return 1
}

snapshot > "$NOW"

if [ "$MODE" = "--init" ]; then cp "$NOW" "$STATE"; log "estado registrado ($(wc -l < "$NOW") arquivos)"; exit 0; fi
if [ "$MODE" = "--full" ] || [ ! -s "$STATE" ]; then
  log "reload completo ($([ "$MODE" = "--full" ] && echo pedido || echo 'primeira execução'))"
  full_reload && cp "$NOW" "$STATE"; exit $?
fi

# arquivos novos, mudados ou que sumiram desde o último reload
CHANGED="$(diff <(sort -k2 "$STATE") <(sort -k2 "$NOW") | grep -E '^[<>]' | awk '{print $3}' | sort -u)"
if [ -z "$CHANGED" ]; then log "nada mudou: sem reload"; exit 0; fi

NEED_FULL=0
declare -a ZONES=()
MAP="$(zone_map)"
while read -r f; do
  [ -z "$f" ] && continue
  zone="$(printf '%s\n' "$MAP" | awk -F'\t' -v f="$f" '$2 == f {print $1; exit}')"
  if [ -z "$zone" ] || [ ! -f "$f" ] || [ "$(stat -c %s "$f")" -gt "$MAX_ZONE_BYTES" ]; then NEED_FULL=1; break; fi
  ZONES+=("$zone")
done <<< "$CHANGED"

if [ "$NEED_FULL" = 0 ] && [ "${#ZONES[@]}" -gt 0 ]; then
  ok=1
  for z in "${ZONES[@]}"; do
    out="$(unbound-control auth_zone_reload "$z" 2>&1)"
    [ "$out" = "ok" ] || { log "auth_zone_reload $z falhou ($out): usando reload completo"; ok=0; break; }
  done
  if [ "$ok" = 1 ]; then log "zona(s) recarregada(s) sem derrubar o DNS: ${ZONES[*]}"; cp "$NOW" "$STATE"; exit 0; fi
fi

log "reload completo (mudou configuração, zona grande ou arquivo não mapeado)"
full_reload && cp "$NOW" "$STATE"
exit $?
