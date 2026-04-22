# V9 Hardening Rollback

## Backend Core
- Restaurar `.env` anterior.
- Reiniciar o serviço do backend core.
- Se o JWT global bloquear sessões, remover `app.use(globalJwtGuard)` em `backend/src/server.ts`.
- Se a allowlist bloquear operação legítima, restaurar `backend/src/utils/sys.ts`.

## Backend Proxy
- Restaurar `.env` anterior do proxy.
- Reiniciar o serviço `backend-proxy`.
- Se o JWT global bloquear `/proxy`, remover `app.use(requireJwt)` em `backend-proxy/src/server.ts`.
- Se a allowlist bloquear o motor DNS, restaurar `backend-proxy/src/utils/sys.ts`.

## Frontend
- Se `/proxy` ou `/redes/agendamento` falharem por autenticação, restaurar `frontend/src/pages/Proxy.jsx`, `frontend/src/pages/VlanManagerMD3.jsx` e remover `frontend/src/services/authFetch.js`.
- Reexecutar build do frontend.

## SMTP
- Restaurar `backend/src/modules/security/security-routes.ts` e `backend/src/utils/mailer.ts`.
- As colunas extras em `sys_smtp_config` são backward-compatible e não exigem rollback de schema para restaurar operação.
