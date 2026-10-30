#!/usr/bin/env bash
# Configura o Telegram do Sentinela: pede o token do bot (sem aparecer na tela), descobre o chat, grava no backend/.env
# (modo 600) e manda uma mensagem de teste. O token nunca vai para a linha de comando nem para o histórico.
#
# Antes: no Telegram, fale com @BotFather, crie o bot (/newbot) e copie o token; depois abra o bot e envie "/start".
# Uso:   sudo bash scripts/sgcg-telegram-setup.sh
# Depois: sudo pm2 restart bcc-backend
set -euo pipefail

ENV_FILE="${SGCG_ENV_FILE:-/opt/controlebeckercorp-v8/backend/.env}"
API="${TELEGRAM_API_BASE:-https://api.telegram.org}"

[[ $EUID -eq 0 ]] || { echo "Rode com sudo: o .env só é legível pelo root." >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Arquivo $ENV_FILE não encontrado." >&2; exit 1; }

read -rsp "Token do bot (colado do @BotFather, não aparece na tela): " TOKEN; echo
[[ "$TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]{30,}$ ]] || { echo "Isso não parece um token de bot." >&2; exit 1; }

# curl -K - lê a URL da entrada padrão: o token não aparece em `ps`.
tg() { printf 'url = "%s/bot%s/%s"\n' "$API" "$TOKEN" "$1" | curl -sS -m 20 -K - "${@:2}"; }

echo "Procurando seu chat (você já enviou /start ao bot?)..."
UPDATES="$(tg getUpdates)"
CHAT_ID="$(python3 -c '
import json, sys
d = json.load(sys.stdin)
if not d.get("ok"):
    sys.exit(2)
ids = [u["message"]["chat"]["id"] for u in d.get("result", []) if u.get("message", {}).get("chat", {}).get("type") == "private"]
print(ids[-1] if ids else "")
' <<< "$UPDATES")" || { echo "O Telegram recusou o token." >&2; exit 1; }
[[ -n "$CHAT_ID" ]] || { echo "Nenhuma conversa encontrada. Abra o bot no Telegram, envie /start e rode de novo." >&2; exit 1; }

# Grava as duas variáveis, trocando as antigas; mantém dono e modo do .env.
TMP="$(mktemp "${ENV_FILE}.XXXXXX")"
grep -vE '^(TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID)=' "$ENV_FILE" > "$TMP" || true
printf 'TELEGRAM_BOT_TOKEN=%s\nTELEGRAM_CHAT_ID=%s\n' "$TOKEN" "$CHAT_ID" >> "$TMP"
chmod --reference="$ENV_FILE" "$TMP"; chown --reference="$ENV_FILE" "$TMP"
mv "$TMP" "$ENV_FILE"

RESP="$(tg sendMessage --data-urlencode "chat_id=$CHAT_ID" --data-urlencode "text=✅ Sentinela do SGCG conectado ao Telegram. A partir de agora, falhas e recuperações chegam aqui.")"
grep -q '"ok":true' <<< "$RESP" && echo "Mensagem de teste enviada. Agora rode: sudo pm2 restart bcc-backend" || { echo "Salvei no .env, mas o envio de teste falhou." >&2; exit 1; }
