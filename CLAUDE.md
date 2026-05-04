# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Continuidade obrigatória

**Leia `CODEX.md` antes de qualquer rodada de manutenção.** Toda alteração estrutural, visual, funcional ou arquitetural deve ser registrada nele ao final da rodada. Quando houver `build`, o `CODEX.md` deve ser atualizado imediatamente após — nunca antes.

## Comandos de build

```bash
# Backend core
cd backend && npm run build

# Backend proxy
cd backend-proxy && npm run build

# Frontend
cd frontend && npm run build
```

## Desenvolvimento local

```bash
# Backend core (ts-node direto, sem build)
cd backend && npx ts-node src/server.ts

# Frontend (dev server com HMR, porta 6777)
cd frontend && npm run dev
```

> O `vite.config.js` do frontend lê certificados Let's Encrypt em `/etc/letsencrypt/`. Em ambientes sem SSL, comente as `sslOptions` antes de rodar o dev server.

## Publicação em produção (PM2)

Depois de fazer build, reinicie apenas o processo afetado:

```bash
pm2 restart bcc-backend          # backend core — porta 6778
pm2 restart backend-proxy        # backend-proxy API — porta 6779
pm2 restart backend-proxy-ingester  # ingester de logs do proxy
pm2 restart bcc-frontend         # frontend estático — porta 6777
```

O frontend de produção roda como bundle estático (`frontend/dist/`). Qualquer alteração em `.jsx` exige `npm run build` antes de reiniciar.

## Arquitetura

O SGCG é composto por três serviços ativos em produção:

### `backend/` — Core (porta 6778, Node.js/TypeScript)
API principal com autenticação JWT, rate limiting e helmet. Organizado em módulos independentes em `src/modules/`:

- `auth` — login, tokens, segurança de sessão
- `dashboard`, `server`, `network`, `control` — observabilidade e operações de rede/sistema
- `qos` — controle de banda com `tc + ifb` por VLAN
- `hotspot` — portal cativo VLAN 70, confirmação MAC, revogação via `ipset + conntrack`
- `proxy` — encaminha configurações para o `backend-proxy` via runtime middleware
- `unbound` — política RPZ e DNS institucional
- `lgpd` — inventário, titulares, incidentes, exportação PDF
- `reports` — relatórios forenses consolidados em PDF governamental
- `identity` — check-ins de endpoints Windows (enriquecimento de eventos DNS)
- `institutional` — trilha de auditoria e middleware de log institucional

Cada módulo segue o padrão `*-routes.ts` + `*-service.ts` + `*-schema-service.ts` (criação de tabelas).

### `backend-proxy/` — Motor de proxy (porta 6779, Node.js/TypeScript)
Gerencia Squid, DNS (Unbound/RPZ), ACLs e políticas institucionais. Serviços principais em `src/services/`:

- `proxy-engine-service` — orquestra Squid, compila ACLs, aplica modos de engine
- `interception-service` — modos de operação: transparente / SSL bump / bypass
- `blocking-release-service` — bloqueios e liberações por VLAN, IP ou domínio
- `dns-radar-service` + `dns-radar-live` — radar de consultas DNS em tempo real
- `policy-compiler-service` — compila regras de domínio para ACL/RPZ
- `domain-policy-service` — CRUD de políticas por domínio
- `identity-enrichment-service` — enriquece eventos DNS com identidade Windows

Arquivos de regras operacionais ficam em `backend-proxy/regras/` (`.acl`, `.json`). **Não versionar arquivos gerados em `regras/generated/`.**

### `frontend/` — Console institucional (React 18 + Vite + Tailwind v4)
SPA com React Router v6. Rotas públicas especiais:
- `/hotspot/portal` — portal cativo (não exige autenticação, renderiza `<HotspotPortal />`)
- `/manutencao` — página de manutenção sem shell

Preferências de tema/accent/uiStyle são persistidas no `localStorage` com escopo por usuário (`sgcg_theme_<scope>`).

### `backend_core_v9/` e `backend_proxy_v9/`
Portas FastAPI (Python) em desenvolvimento. **Não estão ativos em produção** — não alterar sem orientação explícita.

## Banco de dados

PostgreSQL, banco `controlebeckercorp_v8`. A URL de conexão vem de `DATABASE_URL` no `.env` de cada serviço. Cada módulo cria suas próprias tabelas via `*-schema-service.ts` chamado na inicialização do servidor.

## Regras críticas de infraestrutura

- **UFW é o firewall oficial.** Nunca remover, substituir ou desabilitar. `iptables`, `nftables`, `ipset` e `tc` podem complementar, mas não substituir.
- O Nginx roteia `/api/dns/*` para o `backend-proxy`. Não usar `/api/proxy/dns/*`.
- Rotas públicas do Hotspot ficam em `/api/hotspot/public/*`; todos os demais módulos exigem JWT.
- `data/identity/` contém check-ins de endpoints — não versionar.
- `.env` reais, certificados, dumps, backups e `dist/` não devem ir ao Git.
