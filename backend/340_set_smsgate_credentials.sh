#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ] || [ "${2:-}" = "" ]; then
  echo "uso: $0 <username> <password>"
  exit 1
fi

ENV_FILE="/opt/controlebeckercorp-v8/backend/.env"
USERNAME="$1"
PASSWORD="$2"

python3 - <<'PY' "$ENV_FILE" "$USERNAME" "$PASSWORD"
from pathlib import Path
import sys

env_path = Path(sys.argv[1])
username = sys.argv[2]
password = sys.argv[3]
text = env_path.read_text()

def replace_or_add(text: str, key: str, value: str) -> str:
    line = f"{key}={value}"
    if f"{key}=" in text:
        import re
        return re.sub(rf"^{key}=.*$", line, text, flags=re.M)
    return text.rstrip() + "\n" + line + "\n"

text = replace_or_add(text, "HOTSPOT_SMS_PROVIDER", "smsgate")
text = replace_or_add(text, "HOTSPOT_SMS_BASE_URL", "https://console.jacarezinho.cloud/smsgate/api")
text = replace_or_add(text, "HOTSPOT_SMS_USERNAME", username)
text = replace_or_add(text, "HOTSPOT_SMS_PASSWORD", password)
env_path.write_text(text)
PY

pm2 restart bcc-backend --update-env
echo "Credenciais do SMSGate atualizadas e backend reiniciado."
