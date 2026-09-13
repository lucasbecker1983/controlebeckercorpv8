#!/usr/bin/env bash
# Reclamacao fisica unica, usada somente em janela de manutencao aprovada.
set -Eeuo pipefail

DB_NAME="${DB_NAME:-controlebeckercorp_v8}"
RETENTION_UNIT="sgcg-telemetry-retention.service"

while true; do
    retention_state="$(systemctl show --property=ActiveState --value "$RETENTION_UNIT")"
    case "$retention_state" in
        active|activating)
            sleep 10
            ;;
        inactive)
            break
            ;;
        failed)
            echo "A retencao falhou; VACUUM FULL nao sera executado." >&2
            exit 1
            ;;
        *)
            echo "Estado inesperado da retencao: ${retention_state}" >&2
            exit 1
            ;;
    esac
done

reclaim_table() {
    local table="$1"
    printf '[%s] table=%s maintenance=vacuum_full_start\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$table"
    sudo -u postgres vacuumdb --dbname="$DB_NAME" --table="public.${table}" --full --analyze
    curl --fail --silent --show-error --max-time 10 http://127.0.0.1:6778/api/ping >/dev/null
    printf '[%s] table=%s maintenance=vacuum_full_complete\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$table"
}

reclaim_table access_events
reclaim_table dns_policy_events
