# V9 Hardening Changeset

## Segurança
- JWT global adicionado no backend core.
- JWT global adicionado no backend-proxy.
- `JWT_SECRET` e expiração migrados para `.env`.

## Configuração
- `DATABASE_URL`, portas, interfaces, domínio e paths migrados para `.env.example`.
- Rotas frontend com `fetch` crítico agora enviam `Authorization: Bearer`.

## Shell
- `backend/src/utils/sys.ts` agora executa somente comandos allowlisted.
- `backend-proxy/src/utils/sys.ts` agora executa somente comandos allowlisted.

## Testes
- Smoke tests adicionados em `tests/smoke/smoke.test.mjs`.
