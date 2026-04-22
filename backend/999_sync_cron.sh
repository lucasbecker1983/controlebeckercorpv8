#!/bin/bash
echo "[LEGACY QUARANTINED] 999_sync_cron.sh foi removido do fluxo operacional."
echo "O agendamento legado por DROP/NAT não é mais compatível com a arquitetura de produção."
echo "Use o módulo Bloqueios & Liberações com apply/rollback auditados."
exit 1
