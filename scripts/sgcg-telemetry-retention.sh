#!/usr/bin/env bash
# Retencao controlada da telemetria SGCG. Executado pelo systemd como root.
set -Eeuo pipefail

DB_NAME="${DB_NAME:-controlebeckercorp_v8}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
BATCH_SIZE="${BATCH_SIZE:-50000}"
PAUSE_SECONDS="${PAUSE_SECONDS:-0.2}"
LOCK_FILE="/run/lock/sgcg-telemetry-retention.lock"

[[ "$DB_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo 'DB_NAME invalido.' >&2; exit 64; }
[[ "$RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]] || { echo 'RETENTION_DAYS invalido.' >&2; exit 64; }
[[ "$BATCH_SIZE" =~ ^[1-9][0-9]*$ ]] || { echo 'BATCH_SIZE invalido.' >&2; exit 64; }

exec 9>"$LOCK_FILE"
flock -n 9 || { echo 'Retencao ja esta em execucao.'; exit 0; }

delete_batch() {
    local table="$1"
    sudo -u postgres psql --no-psqlrc --quiet --tuples-only --no-align --set ON_ERROR_STOP=on --dbname="$DB_NAME" <<SQL
WITH candidates AS (
    SELECT ctid
    FROM public.${table}
    WHERE occurred_at < clock_timestamp() - interval '${RETENTION_DAYS} days'
    ORDER BY occurred_at ASC
    LIMIT ${BATCH_SIZE}
), deleted AS (
    DELETE FROM public.${table} AS target
    USING candidates
    WHERE target.ctid = candidates.ctid
    RETURNING 1
)
SELECT count(*) FROM deleted;
SQL
}

retain_table() {
    local table="$1" removed=0 batch=0 total=0
    while true; do
        removed="$(delete_batch "$table" | tr -d '[:space:]')"
        [[ "$removed" =~ ^[0-9]+$ ]] || { echo "Resultado invalido ao limpar ${table}: ${removed}" >&2; exit 1; }
        total=$((total + removed))
        batch=$((batch + 1))
        printf '[%s] table=%s batch=%d deleted=%d total_deleted=%d retention_days=%s\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$table" "$batch" "$removed" "$total" "$RETENTION_DAYS"
        (( removed == BATCH_SIZE )) || break
        sleep "$PAUSE_SECONDS"
    done
    sudo -u postgres vacuumdb --dbname="$DB_NAME" --table="public.${table}"
    sudo -u postgres vacuumdb --dbname="$DB_NAME" --table="public.${table}" --analyze-in-stages
    printf '[%s] table=%s maintenance=vacuum_analyze_complete total_deleted=%d\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$table" "$total"
}

retain_table access_events
retain_table dns_policy_events
