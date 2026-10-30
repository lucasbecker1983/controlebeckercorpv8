#!/usr/bin/env bash
# Vigia independente do bcc-backend. O Sentinela mora dentro do backend, então se o backend cair ninguém avisa;
# este script roda fora dele (timer do systemd, a cada minuto) e avisa pelo Telegram quando o backend para de
# responder, lembra a cada 3 h e avisa quando volta. O token vem só do backend/.env (modo 600, lido como root).
#
# Variáveis para teste: SGCG_WATCHDOG_URL, SGCG_ENV_FILE, SGCG_WATCHDOG_STATE, TELEGRAM_API_BASE, SGCG_WATCHDOG_MIN_UPTIME.
set -uo pipefail

URL="${SGCG_WATCHDOG_URL:-http://127.0.0.1:6778/api/health}"
ENV_FILE="${SGCG_ENV_FILE:-/opt/controlebeckercorp-v8/backend/.env}"
STATE="${SGCG_WATCHDOG_STATE:-/run/sgcg-watchdog}"
API="${TELEGRAM_API_BASE:-https://api.telegram.org}"
MIN_UPTIME="${SGCG_WATCHDOG_MIN_UPTIME:-180}"   # logo após o boot o backend ainda está subindo
REMINDER=$((3 * 60 * 60))
FAILS_TO_ALERT=2                                  # duas checagens seguidas...
MIN_DOWN_SECONDS=100                              # ...e pelo menos 100 s fora: um restart do pm2 (ts-node) leva até ~70 s
NAME="bcc-backend"

mkdir -p "$STATE"; chmod 700 "$STATE"
now="$(date +%s)"

uptime_s="$(cut -d. -f1 /proc/uptime)"
[[ "${uptime_s:-0}" -ge "$MIN_UPTIME" ]] || exit 0

env_value() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'"'"'\r'; }

notify() {
  logger -t sgcg-watchdog -- "$1"
  local token chat
  token="$(env_value TELEGRAM_BOT_TOKEN)"; chat="$(env_value TELEGRAM_CHAT_ID)"
  [[ -n "$token" && -n "$chat" ]] || return 0
  # curl -K - lê a URL da entrada padrão: o token não aparece em `ps`.
  printf 'url = "%s/bot%s/sendMessage"\n' "$API" "$token" \
    | curl -sS -m 15 -o /dev/null -K - --data-urlencode "chat_id=$chat" \
        --data-urlencode "text=$1"$'\n\n'"— $(hostname) · $(date '+%d/%m/%Y %H:%M:%S')" || true
}

code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$URL" 2>/dev/null || true)"

if [[ -n "$code" && "$code" != "000" ]]; then
  # Respondeu (mesmo que seja 401): o processo está de pé.
  if [[ -f "$STATE/down_since" ]]; then
    since="$(cat "$STATE/down_since")"; mins=$(( (now - since) / 60 ))
    if [[ -f "$STATE/alerted" ]]; then
      notify "✅ RECUPERADO: $NAME voltou a responder (ficou fora por cerca de ${mins} min)."
    fi
  fi
  rm -f "$STATE/fails" "$STATE/down_since" "$STATE/alerted" "$STATE/last_alert"
  exit 0
fi

fails=$(( $(cat "$STATE/fails" 2>/dev/null || echo 0) + 1 )); echo "$fails" > "$STATE/fails"
[[ -f "$STATE/down_since" ]] || echo "$now" > "$STATE/down_since"
[[ "$fails" -ge "$FAILS_TO_ALERT" ]] || exit 0

since="$(cat "$STATE/down_since")"; mins=$(( (now - since) / 60 ))
(( now - since >= MIN_DOWN_SECONDS )) || exit 0
if [[ ! -f "$STATE/alerted" ]]; then
  notify "🚨 FALHA DETECTADA: $NAME não responde. O Sentinela do sistema roda dentro dele e também está parado. Verifique com: sudo pm2 list"
  touch "$STATE/alerted"; echo "$now" > "$STATE/last_alert"
elif (( now - $(cat "$STATE/last_alert" 2>/dev/null || echo 0) > REMINDER )); then
  notify "⏳ FALHA PERSISTENTE: $NAME continua sem responder há cerca de ${mins} min. Ação manual necessária."
  echo "$now" > "$STATE/last_alert"
fi
exit 0
