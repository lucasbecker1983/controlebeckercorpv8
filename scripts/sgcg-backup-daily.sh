#!/usr/bin/env bash
# Backup diário do SGCG com retenção de 30 dias.
# Usa o mesmo gerador do botão "Gerar backup" da tela de Backups (scripts/sgcg-backup-restore.sh):
# dump do PostgreSQL + código, configurações e dados persistentes, com validação do arquivo.
#
# Ordem: confere espaço -> gera o backup -> confere o arquivo (sha256) -> só então aplica a retenção.
# Se qualquer etapa falhar, nada é apagado e o script sai com erro (o systemd registra a falha).
#
# SGCG_SKIP_RETENTION=1  só gera o backup, sem aplicar a retenção.
set -Eeuo pipefail

ROOT="/opt/controlebeckercorp-v8"
DB="${SGCG_DB_NAME:-controlebeckercorp_v8}"
BACKUP_DIR="$ROOT/backups"
JOB_DIR="$BACKUP_DIR/.jobs"
MIN_FREE_GB=10

log() { printf '[backup-diario %s] %s\n' "$(date +%Y-%m-%dT%H:%M:%S%z)" "$*"; }

mkdir -p "$JOB_DIR"
free_gb=$(( $(df --output=avail -k "$BACKUP_DIR" | tail -1) / 1048576 ))
if (( free_gb < MIN_FREE_GB )); then
    log "Só $free_gb GB livres (mínimo $MIN_FREE_GB GB). Backup cancelado e nada foi apagado."
    exit 70
fi

JOB_FILE="$JOB_DIR/daily-$(date -u +%Y%m%dT%H%M%SZ).json"
log "Iniciando backup (banco $DB, $free_gb GB livres)."
if ! /bin/bash "$ROOT/scripts/sgcg-backup-restore.sh" backup "$ROOT" "$DB" "$JOB_FILE" ''; then
    log "O gerador de backup terminou com erro. Veja ${JOB_FILE%.json}.log. Nada foi apagado."
    exit 1
fi

status="$(sed -n 's/.*"status": "\([a-z_]*\)".*/\1/p' "$JOB_FILE" 2>/dev/null | head -1)"
if [[ "$status" != "success" ]]; then
    log "Backup não terminou com sucesso (situação: ${status:-desconhecida}). Nada foi apagado."
    exit 1
fi

newest="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'becker_v8_full_*.tar.gz' -printf '%T@ %f\n' | sort -rn | head -1 | cut -d' ' -f2-)"
if [[ -z "$newest" ]] || ! (cd "$BACKUP_DIR" && sha256sum --status -c "$newest.sha256"); then
    log "Arquivo novo ausente ou com sha256 diferente ($newest). Nada foi apagado."
    exit 1
fi
log "Backup concluído e conferido: $newest ($(du -h "$BACKUP_DIR/$newest" | cut -f1))."

if [[ "${SGCG_SKIP_RETENTION:-0}" == "1" ]]; then
    log "Retenção ignorada (SGCG_SKIP_RETENTION=1)."
    exit 0
fi
/bin/bash "$ROOT/scripts/sgcg-backup-retention.sh"

# Registros dos jobs diários com mais de 30 dias.
find "$JOB_DIR" -maxdepth 1 -type f -name 'daily-*' -mtime +30 -delete
log "Concluído."
