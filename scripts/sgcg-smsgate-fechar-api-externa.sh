#!/usr/bin/env bash
# Fecha para a internet a API de ENVIO do SMSGate (/smsgate/api/3rdparty/), mantendo aberta a parte do
# celular (/smsgate/api/mobile/). Motivo: usuário e senha antigos da API vazaram no histórico do Git (29/10/2026).
# O backend do SGCG já fala direto com 127.0.0.1:3010 (HOTSPOT_SMS_BASE_URL no backend/.env), então nada quebra.
#
# Uso: sudo bash /opt/controlebeckercorp-v8/scripts/sgcg-smsgate-fechar-api-externa.sh
# Desfazer: as cópias ficam em /opt/controlebeckercorp-v8/backups/arquivo/ (nginx-*.antes-fechar-smsgate_*).
set -Eeuo pipefail

FILES=(
    /etc/nginx/snippets/sgcg-console-app-mirror.conf
    /etc/nginx/sites-available/console.jacarezinho.cloud
)
BACKUP_DIR=/opt/controlebeckercorp-v8/backups/arquivo
TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

for f in "${FILES[@]}"; do
    [[ -f "$f" ]] || { echo "não existe: $f (ignorado)"; continue; }
    cp -p "$f" "$BACKUP_DIR/nginx-$(basename "$f").antes-fechar-smsgate_$TS"
    python3 -I - "$f" <<'PY'
import sys
path = sys.argv[1]
block = '''# API de envio do SMSGate: só o próprio servidor (o backend chama 127.0.0.1:3010 direto).
# As credenciais antigas vazaram no Git (29/10/2026); de fora, só o celular (api/mobile) fala com o SMSGate.
location ^~ /smsgate/api/3rdparty/ {
    allow 127.0.0.1;
    allow 186.251.14.26;
    allow 186.251.14.27;
    allow 186.251.14.28;
    deny all;
    proxy_pass http://127.0.0.1:3010/api/3rdparty/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
}
'''
s = open(path, encoding='utf-8').read()
if 'location ^~ /smsgate/api/3rdparty/' in s:
    print(f'{path}: já estava fechado')
    sys.exit(0)
line = next((l for l in s.splitlines(True) if l.strip().startswith('location ^~ /smsgate/ {')), None)
if not line:
    print(f'{path}: rota /smsgate/ não encontrada (ignorado)')
    sys.exit(0)
indent = line[:len(line) - len(line.lstrip())]
s = s.replace(line, ''.join((indent + l if l.strip() else l) for l in block.splitlines(True)) + line, 1)
open(path, 'w', encoding='utf-8').write(s)
print(f'{path}: API de envio fechada para a internet')
PY
done

if ! nginx -t; then
    echo "Configuração inválida: restaurando as cópias e saindo sem recarregar."
    for f in "${FILES[@]}"; do
        b="$BACKUP_DIR/nginx-$(basename "$f").antes-fechar-smsgate_$TS"
        [[ -f "$b" ]] && cp -p "$b" "$f"
    done
    exit 1
fi
systemctl reload nginx
echo "nginx recarregado."

echo "--- teste ---"
echo "API de envio vista de uma VLAN (deve dar 403): HTTP $(curl -sk -o /dev/null -m 10 --interface 192.168.10.1 -w '%{http_code}' https://console.jacarezinho.app.br/smsgate/api/3rdparty/v1/messages || true)"
echo "Parte do celular (deve continuar 200):        HTTP $(curl -sk -o /dev/null -m 10 -w '%{http_code}' https://console.jacarezinho.app.br/smsgate/api/mobile/v1/device || true)"
echo "API direta usada pelo backend (deve dar 401): HTTP $(curl -s -o /dev/null -m 10 -w '%{http_code}' http://127.0.0.1:3010/api/3rdparty/v1/messages || true)"
