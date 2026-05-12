#!/usr/bin/env bash
set -euo pipefail

SMSGATE_CONFIG="/etc/sgcg/smsgate/config.yml"
ENV_FILE="/opt/controlebeckercorp-v8/backend/.env"
DB_QUERY="select user_id,id,name from devices where deleted_at is null order by last_seen desc, created_at desc limit 1;"

if [ ! -f "$SMSGATE_CONFIG" ]; then
  echo "configuração do SMSGate não encontrada em $SMSGATE_CONFIG"
  exit 1
fi

readarray -t CFG < <(python3 - <<'PY' "$SMSGATE_CONFIG"
from pathlib import Path
import sys

text = Path(sys.argv[1]).read_text().splitlines()
section = None
values = {}
for raw in text:
    line = raw.rstrip()
    if not line.strip() or line.lstrip().startswith('#'):
        continue
    if not line.startswith(' ') and line.endswith(':'):
        section = line[:-1].strip()
        continue
    if section not in {'database', 'jwt'}:
        continue
    stripped = line.strip()
    if ':' not in stripped:
        continue
    key, value = stripped.split(':', 1)
    values[f'{section}.{key.strip()}'] = value.strip().strip('"').strip("'")

for key in ['database.host', 'database.port', 'database.user', 'database.password', 'database.database', 'jwt.secret', 'jwt.issuer']:
    print(values.get(key, ''))
PY
)

DB_HOST="${CFG[0]}"
DB_PORT="${CFG[1]}"
DB_USER="${CFG[2]}"
DB_PASSWORD="${CFG[3]}"
DB_NAME="${CFG[4]}"
JWT_SECRET="${CFG[5]}"
JWT_ISSUER="${CFG[6]}"

if [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_NAME" ] || [ -z "$JWT_SECRET" ] || [ -z "$JWT_ISSUER" ]; then
  echo "não foi possível extrair parâmetros do SMSGate"
  exit 1
fi

SENDER_LINE="$(mysql -N -B -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -D"$DB_NAME" -e "$DB_QUERY" | head -n1)"
if [ -z "$SENDER_LINE" ]; then
  echo "nenhum dispositivo emissor cadastrado ainda no SMSGate"
  exit 0
fi

IFS=$'\t' read -r USER_ID DEVICE_ID DEVICE_NAME <<< "$SENDER_LINE"

STATE="$(python3 - <<'PY' "$ENV_FILE" "$USER_ID" "$DEVICE_ID" "$JWT_SECRET" "$JWT_ISSUER"
from pathlib import Path
import re
import sys

env_path = Path(sys.argv[1])
user_id = sys.argv[2]
device_id = sys.argv[3]
jwt_secret = sys.argv[4]
jwt_issuer = sys.argv[5]
text = env_path.read_text()

def replace_or_add(content: str, key: str, value: str) -> str:
    line = f"{key}={value}"
    if re.search(rf"^{re.escape(key)}=", content, flags=re.M):
        return re.sub(rf"^{re.escape(key)}=.*$", line, content, flags=re.M)
    return content.rstrip() + "\n" + line + "\n"

updated = text
updated = replace_or_add(updated, "HOTSPOT_SMS_PROVIDER", "smsgate")
updated = replace_or_add(updated, "HOTSPOT_SMS_BASE_URL", "https://console.jacarezinho.cloud/smsgate/api")
updated = replace_or_add(updated, "HOTSPOT_SMS_USER_ID", user_id)
updated = replace_or_add(updated, "HOTSPOT_SMS_DEVICE_ID", device_id)
updated = replace_or_add(updated, "HOTSPOT_SMS_JWT_SECRET", jwt_secret)
updated = replace_or_add(updated, "HOTSPOT_SMS_JWT_ISSUER", jwt_issuer)

if updated != text:
    env_path.write_text(updated)
    print("changed")
else:
    print("unchanged")
PY
)"

if [ "$STATE" = "changed" ]; then
  pm2 restart bcc-backend --update-env >/dev/null
  echo "emissor SMS vinculado ao Hotspot: user=$USER_ID device=$DEVICE_ID name=$DEVICE_NAME"
else
  echo "emissor SMS já vinculado ao Hotspot: user=$USER_ID device=$DEVICE_ID name=$DEVICE_NAME"
fi
