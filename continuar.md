# Estado do Sistema SGCG — 2026-04-29

## Serviços PM2 ativos

| ID | Nome | Porta | Status |
|----|------|-------|--------|
| 0 | bcc-backend | 6778 | online |
| 5 | backend-proxy | 6779 | online |
| 6 | backend-proxy-ingester | — | online |
| 7 | bcc-frontend | 4173 | online |
| 9 | sgcg-identity-checkin | — | online |

---

## O que foi feito nesta sessão (2026-04-29)

### 1. Política de Domínios Ignorados (`dns_ignored_domains`)

- Nova tabela no banco com campos: `id`, `pattern`, `match_type`, `description`, `active`, `created_at`
- Seed automático no boot do backend-proxy com 5 domínios de hardware (vlan/contains, .local/suffix, intelbras/neverssl/tp-link exatos)
- Novo serviço: `backend-proxy/src/services/dns-ignored-service.ts` com cache TTL 30s
- CRUD completo: `GET/POST /api/dns/ignored`, `PATCH /api/dns/ignored/:id/toggle`, `DELETE /api/dns/ignored/:id`
- Frontend: nova aba "Domínios Ignorados" com ícone EyeOff em `BlockingReleases.jsx` → seção Políticas Institucionais

### 2. Melhoria do Radar DNS

- `DnsRadarService.ingestLine()` agora captura identidade Windows (user + computer) do `identityEnrichmentService` no momento do evento
- Colunas `identity_user` e `identity_computer` adicionadas à `dns_policy_events`
- `getOverview()` e `getEvents()` usam filtro dinâmico via `dnsIgnoredService` em vez de SQL hardcoded
- `getEvents()` aceita filtros `identity_user` e `identity_computer`

### 3. Módulo Hotspot — integração DNS

- `GET /metrics` retorna `top_domains` (domínios mais consultados da VLAN 70)
- `POST /access-log/sync` popula `top_domain` nas sessões via UPDATE correlacionado com `dns_policy_events`
- `GET /report` usa subquery COALESCE para `top_domain` ao vivo
- Todos os três endpoints aplicam filtro de domínios ignorados dinamicamente

### 4. Correção de índice PostgreSQL (IMMUTABLE)

- Índice `DATE(session_started_at)` em `hotspot_access_log` causava erro IMMUTABLE
- Fix: índice alterado para `(session_started_at)` diretamente

### 5. Correção JSON.parse no frontend

- `DnsIgnoredTab` chamava `/api/proxy/dns/ignored` → Nginx não roteava para backend-proxy → retornava HTML
- Fix: todos os 4 authFetch corrigidos para `/api/dns/ignored`

---

## Estado do banco de dados

Tabelas relevantes em `controlebeckercorp_v8`:

- `dns_policy_events` — eventos DNS do unbound (ingested por DnsRadarService)
  - Colunas novas: `identity_user`, `identity_computer`
- `dns_ignored_domains` — política de domínios ignorados (5 seeds ativos)
- `hotspot_access_log` — sessões do hotspot com `top_domain` (VARCHAR 255)
- `hotspot_sessions` — visão de sessões ativas
- `blocking_releases`, `policy_exceptions`, `vip_entries` — controle de bloqueios

---

## Arquitetura de roteamento Nginx (crítico)

```
/api/(proxy|rules|cert|dns)/  →  backend-proxy  :6779
/api/                         →  bcc-backend     :6778
```

`dns-routes.ts` está montado em `/api/dns` no **backend-proxy**.
Nunca usar `/api/proxy/dns/...` para as rotas de DNS — não existe esse caminho.

---

## Próximas tarefas identificadas

1. **Correção do bypass emergencial de VLAN** (investigado em sessão anterior):
   - `applyRuntimeVipBypassRules()` não adiciona regra FORWARD ACCEPT para subnet da VLAN em bypass
   - `buildEarlyFirewallBlock()` bloqueia DoT (TCP/853) globalmente, inclusive para VLANs em bypass
   - `activateEmergencyVlanBypass()` precisa remover regras de DoT DROP da VLAN e adicionar FORWARD ACCEPT
   - Comentário contraditório em `policy-compiler-service.ts` linha 308-310

2. **Expandir filtros de identidade** no frontend do Radar DNS (input de busca por usuário/computador)

3. **Relatório de governança** com identidade Windows integrada ao PDF do Hotspot
