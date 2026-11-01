#!/usr/bin/env bash
# Desliga o clamd (cerca de 1 GB de memória) quando ninguém o usa. Ele volta sozinho: o socket
# clamav-daemon.socket fica de pé e o systemd sobe o daemon na próxima verificação (clamdscan).
# Só desliga se estiver ligado há mais de IDLE_MIN minutos, sem clamdscan/clamonacc rodando e sem conexão aberta no socket.
set -uo pipefail
IDLE_MIN="${IDLE_MIN:-10}"

systemctl is-active --quiet clamav-daemon.service || exit 0

since="$(systemctl show clamav-daemon.service -p ActiveEnterTimestampMonotonic --value 2>/dev/null || echo 0)"
now_us="$(awk '{printf "%d", $1 * 1000000}' /proc/uptime)"
age_min=$(( (now_us - since) / 60000000 ))
[ "$age_min" -ge "$IDLE_MIN" ] || exit 0

if pgrep -x clamdscan >/dev/null || pgrep -x clamscan >/dev/null || pgrep -x clamonacc >/dev/null; then exit 0; fi
if ss -xH state connected 2>/dev/null | grep -q "clamd.ctl"; then exit 0; fi

logger -t sgcg-clamd-idle "clamd ocioso há mais de ${IDLE_MIN} min: desligando (volta sob demanda pelo socket)"
systemctl stop clamav-daemon.service
