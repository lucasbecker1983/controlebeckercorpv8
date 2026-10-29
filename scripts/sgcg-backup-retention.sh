#!/usr/bin/env bash
# Retenção dos backups do SGCG: guarda 30 dias.
#
# Regras de segurança:
#  - só mexe em arquivos com o nome padrão becker_v8_full_<data>.tar.gz (e o .sha256 ao lado), na pasta de backups;
#  - só apaga se existir pelo menos um backup recente (dentro do prazo): se os backups pararam de ser feitos,
#    nada é apagado, para nunca ficar sem cópia;
#  - mantém sempre os MIN_KEEP backups mais recentes, mesmo que sejam antigos;
#  - --dry-run só lista o que seria apagado.
#
# Variáveis (opcionais): SGCG_BACKUP_DIR, SGCG_BACKUP_RETENTION_DAYS (padrão 30), SGCG_BACKUP_MIN_KEEP (padrão 3).
set -Eeuo pipefail

BACKUP_DIR="${SGCG_BACKUP_DIR:-/opt/controlebeckercorp-v8/backups}"
RETENTION_DAYS="${SGCG_BACKUP_RETENTION_DAYS:-30}"
MIN_KEEP="${SGCG_BACKUP_MIN_KEEP:-3}"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

valid_file='^becker_v8_full_[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z\.tar\.gz$'
log() { printf '[retencao %s] %s\n' "$(date +%Y-%m-%dT%H:%M:%S%z)" "$*"; }

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( RETENTION_DAYS < 7 )); then
    log "SGCG_BACKUP_RETENTION_DAYS inválido ($RETENTION_DAYS); mínimo 7. Nada foi apagado."
    exit 64
fi
if ! [[ "$MIN_KEEP" =~ ^[0-9]+$ ]] || (( MIN_KEEP < 1 )); then
    log "SGCG_BACKUP_MIN_KEEP inválido ($MIN_KEEP); mínimo 1. Nada foi apagado."
    exit 64
fi
if [[ ! -d "$BACKUP_DIR" ]]; then
    log "Pasta de backups não existe: $BACKUP_DIR. Nada foi apagado."
    exit 0
fi

now="$(date +%s)"
limit=$(( RETENTION_DAYS * 86400 ))

# "<mtime> <nome>" dos backups completos, do mais novo para o mais antigo.
mapfile -t entries < <(
    find "$BACKUP_DIR" -maxdepth 1 -type f -name 'becker_v8_full_*.tar.gz' -printf '%T@ %f\n' \
        | awk '{ sub(/\..*$/, "", $1); print }' \
        | sort -rn
)

files=()
for entry in "${entries[@]}"; do
    name="${entry#* }"
    [[ "$name" =~ $valid_file ]] && files+=("$entry")
done

total="${#files[@]}"
if (( total == 0 )); then
    log "Nenhum backup encontrado. Nada a fazer."
    exit 0
fi

newest_mtime="${files[0]%% *}"
newest_name="${files[0]#* }"
newest_age=$(( now - newest_mtime ))
if (( newest_age > limit )); then
    log "O backup mais recente ($newest_name) tem $(( newest_age / 86400 )) dias, mais que o prazo de $RETENTION_DAYS. Nenhum backup recente: nada foi apagado."
    exit 0
fi

removed=0
freed=0
kept=0
for i in "${!files[@]}"; do
    mtime="${files[$i]%% *}"
    name="${files[$i]#* }"
    age=$(( now - mtime ))
    if (( i < MIN_KEEP || age <= limit )); then
        kept=$(( kept + 1 ))
        continue
    fi
    size="$(stat -c %s "$BACKUP_DIR/$name" 2>/dev/null || echo 0)"
    if (( DRY_RUN )); then
        log "[simulação] apagaria $name ($(( age / 86400 )) dias, $(( size / 1048576 )) MB)"
    else
        rm -f -- "$BACKUP_DIR/$name" "$BACKUP_DIR/$name.sha256"
        log "apagado $name ($(( age / 86400 )) dias, $(( size / 1048576 )) MB)"
    fi
    removed=$(( removed + 1 ))
    freed=$(( freed + size ))
done

if (( DRY_RUN )); then
    log "Resumo (simulação): $removed backup(s) seriam apagados, liberando $(( freed / 1048576 )) MB; $kept ficam (prazo $RETENTION_DAYS dias, mínimo $MIN_KEEP)."
else
    log "Resumo: $removed backup(s) apagado(s), $(( freed / 1048576 )) MB liberados; $kept ficam (prazo $RETENTION_DAYS dias, mínimo $MIN_KEEP)."
fi
