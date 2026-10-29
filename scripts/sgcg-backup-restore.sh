#!/usr/bin/env bash
# Backup e restauração transacional do SGCG. Chamado somente pelo backend autenticado.
set -Eeuo pipefail

MODE="${1:-}"
PROJECT_ROOT="${2:-}"
DB_NAME="${3:-}"
JOB_FILE="${4:-}"
REQUESTED_FILE="${5:-}"
BACKUP_DIR="$PROJECT_ROOT/backups"
SAFETY_DIR="$BACKUP_DIR/restore-safety"
WORK_DIR=""
RESTORE_MUTATED=0
ROLLBACK_AVAILABLE=0
SAFETY_SNAPSHOT=""
SAFETY_DB=""

valid_file='^becker_v8_full_[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z\.tar\.gz$'
valid_db='^[A-Za-z_][A-Za-z0-9_]*$'

if [[ "$MODE" != 'backup' && "$MODE" != 'restore' ]] || [[ "$PROJECT_ROOT" != '/opt/controlebeckercorp-v8' ]] || [[ ! "$DB_NAME" =~ $valid_db ]] || [[ "$JOB_FILE" != "$BACKUP_DIR/.jobs/"*.json ]]; then
    exit 64
fi

JOB_ID="$(basename "$JOB_FILE" .json)"
LOG_FILE="$BACKUP_DIR/.jobs/$JOB_ID.log"
mkdir -p "$BACKUP_DIR/.jobs" "$SAFETY_DIR"
chmod 750 "$BACKUP_DIR/.jobs" "$SAFETY_DIR"

json_escape() {
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e ':a;N;$!ba;s/\n/\\n/g'
}

set_status() {
    local status="$1" step="$2" message="$3"
    local now tmp
    now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    tmp="$JOB_FILE.$$.tmp"
    printf '{\n  "id": "%s",\n  "kind": "%s",\n  "status": "%s",\n  "step": "%s",\n  "message": "%s",\n  "filename": "%s",\n  "updated_at": "%s"%s\n}\n' \
        "$(json_escape "$JOB_ID")" "$(json_escape "$MODE")" "$(json_escape "$status")" "$(json_escape "$step")" "$(json_escape "$message")" "$(json_escape "$REQUESTED_FILE")" "$now" \
        "$([[ "$status" == 'success' || "$status" == 'failed' || "$status" == 'rolled_back' ]] && printf ',\n  "completed_at": "%s"' "$now")" > "$tmp"
    chmod 640 "$tmp"
    mv "$tmp" "$JOB_FILE"
}

log() {
    printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG_FILE"
}

cleanup() {
    [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]] && rm -rf -- "$WORK_DIR"
}

restart_sgcg_services() {
    pm2 restart bcc-backend backend-proxy backend-proxy-ingester bcc-frontend --update-env >> "$LOG_FILE" 2>&1
}

rollback_restore() {
    set +e
    set_status 'running' 'rollback' 'Falha detectada; restaurando o estado anterior protegido.'
    log 'Iniciando rollback automático.'
    if [[ -f "$SAFETY_DB" ]]; then
        sudo -u postgres dropdb --if-exists --force "$DB_NAME" >> "$LOG_FILE" 2>&1
        sudo -u postgres createdb "$DB_NAME" >> "$LOG_FILE" 2>&1
        sudo -u postgres pg_restore --exit-on-error --no-owner --no-privileges --dbname="$DB_NAME" "$SAFETY_DB" >> "$LOG_FILE" 2>&1
    fi
    if [[ -f "$SAFETY_SNAPSHOT" ]]; then
        tar -xzf "$SAFETY_SNAPSHOT" --no-same-owner --no-same-permissions -C "$PROJECT_ROOT" >> "$LOG_FILE" 2>&1
        for component in backend frontend backend-proxy; do
            (cd "$PROJECT_ROOT/$component" && npm ci && npm run build) >> "$LOG_FILE" 2>&1
        done
    fi
    restart_sgcg_services
    curl --fail --silent --show-error --max-time 20 http://127.0.0.1:6778/api/ping >> "$LOG_FILE" 2>&1
    set_status 'rolled_back' 'rollback_complete' 'A restauração falhou; o banco e o código anteriores foram recompostos.'
    log 'Rollback concluído.'
}

on_error() {
    local code="$?"
    log "Falha no passo ${MODE} (código ${code})."
    if [[ "$MODE" == 'restore' && "$RESTORE_MUTATED" == '1' && "$ROLLBACK_AVAILABLE" == '1' ]]; then
        rollback_restore || set_status 'failed' 'rollback_failed' 'A restauração e seu rollback falharam; consulte o log operacional imediatamente.'
    else
        set_status 'failed' 'failed' 'A tarefa falhou sem alterar o sistema. Consulte o log operacional.'
    fi
    cleanup
    exit "$code"
}
trap on_error ERR
trap cleanup EXIT

archive_is_safe() {
    local archive="$1" entries has_db has_backend has_frontend has_proxy
    entries="$(mktemp "$BACKUP_DIR/.jobs/.archive-list.XXXXXX")"
    gzip -t "$archive"
    tar -tzf "$archive" > "$entries"
    has_db=0; has_backend=0; has_frontend=0; has_proxy=0
    while IFS= read -r entry; do
        case "$entry" in
            /*|../*|*/../*|..|*'/..') log "Entrada insegura no arquivo: $entry"; rm -f "$entries"; return 1 ;;
        esac
        case "$entry" in
            */node_modules|*/node_modules/*|*/dist|*/dist/*|*/.git|*/.git/*|*/backups|*/backups/*|*.log)
                log "Artefato reconstruível/proibido no backup: $entry"; rm -f "$entries"; return 1 ;;
        esac
        case "$entry" in
            backend/package.json) has_backend=1 ;;
            frontend/package.json) has_frontend=1 ;;
            backend-proxy/package.json) has_proxy=1 ;;
            db_dump.sql|recovery/database.dump) has_db=1 ;;
        esac
    done < "$entries"
    rm -f "$entries"
    [[ "$has_db" == '1' && "$has_backend" == '1' && "$has_frontend" == '1' && "$has_proxy" == '1' ]]
}

create_backup() {
    local timestamp filename work archive_tmp manifest dump payload=()
    timestamp="$(date -u +%Y-%m-%dT%H-%M-%S-%3NZ)"
    filename="becker_v8_full_${timestamp}.tar.gz"
    WORK_DIR="$(mktemp -d "$BACKUP_DIR/.backup-work.XXXXXX")"
    mkdir -p "$WORK_DIR/recovery"
    chown root:postgres "$WORK_DIR"
    chmod 750 "$WORK_DIR"
    chown postgres:postgres "$WORK_DIR/recovery"
    chmod 700 "$WORK_DIR/recovery"
    dump="$WORK_DIR/recovery/database.dump"
    manifest="$WORK_DIR/recovery/backup-manifest.json"
    archive_tmp="$BACKUP_DIR/.${filename}.partial"
    payload=(backend frontend backend-proxy doc_generator scripts)
    [[ -d "$PROJECT_ROOT/data" ]] && payload+=(data)

    # Telemetria de alto volume (consultas DNS e acessos do proxy, ~5,5 GB): só a estrutura entra no backup.
    # Sem isso cada backup passa de 2 GB; com isso fica em dezenas de MB. As tabelas de auditoria e LGPD continuam completas.
    local telemetry_tables=(dns_policy_events access_events dns_logs navigation_events) skip_data=() tbl
    for tbl in "${telemetry_tables[@]}"; do skip_data+=("--exclude-table-data=public.$tbl"); done

    set_status 'running' 'database_dump' 'Gerando dump consistente do PostgreSQL (sem os dados de telemetria DNS/proxy, só a estrutura).'
    log "Iniciando dump custom do banco $DB_NAME sem os dados de: ${telemetry_tables[*]}."
    sudo -u postgres pg_dump --format=custom --compress=zstd:3 --no-owner --no-privileges "${skip_data[@]}" --file="$dump" "$DB_NAME" >> "$LOG_FILE" 2>&1
    sudo -u postgres pg_restore --list "$dump" > /dev/null

    set_status 'running' 'packing' 'Empacotando código, configurações e dados persistentes sem artefatos reconstruíveis.'
    printf '{\n  "format": 2,\n  "database": "%s",\n  "database_dump": "recovery/database.dump",\n  "database_sha256": "%s",\n  "created_at": "%s",\n  "excluded": ["node_modules", "dist", ".git", "backups", "logs", "cache", "coverage"],\n  "excluded_table_data": ["dns_policy_events", "access_events", "dns_logs", "navigation_events"]\n}\n' \
        "$DB_NAME" "$(sha256sum "$dump" | awk '{print $1}')" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$manifest"
    tar -czf "$archive_tmp" \
        --exclude='node_modules' --exclude='dist' --exclude='.git' --exclude='backups' --exclude='*.log' --exclude='.cache' --exclude='coverage' \
        -C "$PROJECT_ROOT" "${payload[@]}" \
        -C "$WORK_DIR" recovery
    archive_is_safe "$archive_tmp"
    mv "$archive_tmp" "$BACKUP_DIR/$filename"
    sha256sum "$BACKUP_DIR/$filename" > "$BACKUP_DIR/$filename.sha256"
    set_status 'success' 'complete' 'Backup validado e concluído; ele exclui dependências e builds reconstruíveis.'
    log "Backup concluído: $filename"
}

restore_backup() {
    local archive dump source_dump payload
    [[ "$REQUESTED_FILE" =~ $valid_file ]] || { set_status 'failed' 'validation' 'Nome de backup inválido.'; exit 64; }
    archive="$BACKUP_DIR/$REQUESTED_FILE"
    [[ -f "$archive" ]] || { set_status 'failed' 'validation' 'Arquivo de backup não encontrado.'; exit 66; }

    set_status 'running' 'validating' 'Validando integridade, conteúdo e exclusões do backup selecionado.'
    log "Validando $REQUESTED_FILE antes de qualquer alteração."
    archive_is_safe "$archive" || { set_status 'failed' 'validation' 'Backup inválido, corrompido ou contém artefatos reconstruíveis.'; exit 65; }
    WORK_DIR="$(mktemp -d "$BACKUP_DIR/.restore-work.XXXXXX")"
    tar -xzf "$archive" --no-same-owner --no-same-permissions -C "$WORK_DIR"
    if [[ -f "$WORK_DIR/recovery/database.dump" ]]; then
        source_dump="$WORK_DIR/recovery/database.dump"
        sudo -u postgres pg_restore --list "$source_dump" > /dev/null
    else
        source_dump="$WORK_DIR/db_dump.sql"
        [[ -s "$source_dump" ]] || { set_status 'failed' 'validation' 'Dump do banco ausente no backup.'; exit 65; }
    fi

    set_status 'running' 'safety_snapshot' 'Criando snapshot local do estado atual para rollback automático.'
    SAFETY_SNAPSHOT="$SAFETY_DIR/${JOB_ID}-code-before.tar.gz"
    SAFETY_DB="$SAFETY_DIR/${JOB_ID}-database-before.dump"
    payload=(backend frontend backend-proxy doc_generator scripts)
    [[ -d "$PROJECT_ROOT/data" ]] && payload+=(data)
    tar -czf "$SAFETY_SNAPSHOT" --exclude='node_modules' --exclude='dist' --exclude='.git' --exclude='backups' --exclude='*.log' --exclude='.cache' --exclude='coverage' -C "$PROJECT_ROOT" "${payload[@]}"
    : > "$SAFETY_DB"
    chown postgres:postgres "$SAFETY_DB"
    chmod 600 "$SAFETY_DB"
    sudo -u postgres pg_dump --format=custom --compress=zstd:3 --no-owner --no-privileges --file="$SAFETY_DB" "$DB_NAME" >> "$LOG_FILE" 2>&1
    sudo -u postgres pg_restore --list "$SAFETY_DB" > /dev/null
    ROLLBACK_AVAILABLE=1

    set_status 'running' 'database_restore' 'Restaurando banco e executando análise de consistência.'
    pm2 stop bcc-backend backend-proxy backend-proxy-ingester bcc-frontend >> "$LOG_FILE" 2>&1
    RESTORE_MUTATED=1
    sudo -u postgres dropdb --if-exists --force "$DB_NAME" >> "$LOG_FILE" 2>&1
    sudo -u postgres createdb "$DB_NAME" >> "$LOG_FILE" 2>&1
    if [[ "$source_dump" == *.dump ]]; then
        sudo -u postgres pg_restore --exit-on-error --no-owner --no-privileges --dbname="$DB_NAME" "$source_dump" >> "$LOG_FILE" 2>&1
    else
        sudo -u postgres psql --set ON_ERROR_STOP=on --dbname="$DB_NAME" --file="$source_dump" >> "$LOG_FILE" 2>&1
    fi
    sudo -u postgres vacuumdb --analyze-in-stages --dbname="$DB_NAME" >> "$LOG_FILE" 2>&1
    sudo -u postgres psql --set ON_ERROR_STOP=on --dbname="$DB_NAME" --command='SELECT 1' >> "$LOG_FILE" 2>&1

    set_status 'running' 'rebuild' 'Recompondo código, dependências e builds de todos os componentes.'
    tar -xzf "$archive" --no-same-owner --no-same-permissions --exclude='db_dump.sql' --exclude='recovery/*' -C "$PROJECT_ROOT" >> "$LOG_FILE" 2>&1
    for component in backend frontend backend-proxy; do
        (cd "$PROJECT_ROOT/$component" && npm ci && npm run build) >> "$LOG_FILE" 2>&1
    done

    set_status 'running' 'service_validation' 'Reiniciando somente os serviços SGCG e validando a API.'
    restart_sgcg_services
    curl --fail --silent --show-error --max-time 20 http://127.0.0.1:6778/api/ping >> "$LOG_FILE" 2>&1
    curl --insecure --fail --silent --show-error --max-time 20 https://127.0.0.1:6777/ > /dev/null
    local proxy_status
    proxy_status="$(curl --insecure --silent --show-error --max-time 20 --output /dev/null --write-out '%{http_code}' https://127.0.0.1:6779/api/bloqueios-liberacoes/health)"
    [[ "$proxy_status" =~ ^(200|401|403)$ ]]
    set_status 'success' 'complete' 'Restauração concluída: banco analisado, dependências reconstruídas e serviços SGCG validados.'
    log "Restauração concluída: $REQUESTED_FILE"
}

case "$MODE" in
    backup) create_backup ;;
    restore) restore_backup ;;
esac
