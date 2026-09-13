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

---

## Pausa operacional — retenção/compactação PostgreSQL — 2026-08-10

- Backup pré-limpeza concluído e validado antes de qualquer exclusão:
  - `backups/becker_v8_full_2026-08-10T18-41-04-806Z.tar.gz`
  - SHA-256 confirmado; arquivo não contém `node_modules`, `dist`, `.git`, backups internos ou logs.
- Retenção de 30 dias foi implementada em `scripts/sgcg-telemetry-retention.sh`, com unidades-fonte em `systemd/sgcg-telemetry-retention.{service,timer}`.
- Exclusões já confirmadas antes da pausa:
  - `access_events`: `1.100.000` linhas removidas.
  - `dns_policy_events`: `1.870.201` linhas removidas.
- A execução foi parada por término do expediente; `sgcg-telemetry-retention.timer` está deliberadamente `disabled` e o serviço foi interrompido. Não existe `VACUUM FULL` em execução e nenhuma compactação física foi iniciada.
- Para retomar em uma nova janela:
  1. validar PostgreSQL, API `http://127.0.0.1:6778/api/ping`, espaço livre e o backup acima;
  2. validar `bash -n scripts/sgcg-telemetry-retention.sh`;
  3. instalar as unidades-fonte em `/etc/systemd/system/`, executar `systemctl daemon-reload`, `enable --now sgcg-telemetry-retention.timer` e iniciar o serviço de forma monitorada;
  4. aguardar a conclusão da retenção, executar/confirmar `VACUUM` e só então, com janela explícita, executar `VACUUM FULL` uma tabela por vez para devolver espaço ao filesystem.

## Janela de manutenção aprovada — 2026-08-11

- Janela explicitamente autorizada para a compactação física.
- Retenção de 30 dias retomada às 08:10 BRT com `sgcg-telemetry-retention.timer` ativo; limpeza em lotes permanece em execução.
- `sgcg-telemetry-full-reclaim.service` foi instalado como unidade única de manutenção: aguarda a conclusão bem-sucedida da retenção e então executa `VACUUM FULL --analyze` sequencialmente em `access_events` e `dns_policy_events`, validando a API entre as duas etapas.
- O primeiro disparo transitório foi cancelado antes de conclusão por não tratar o estado systemd `activating`; a unidade persistente corrige essa condição. Nenhuma compactação física foi concluída até este registro.

## Conclusão da janela de manutenção — 2026-08-11

- Retenção concluída com sucesso: `68.048.468` exclusões em `access_events` e `7.633.807` em `dns_policy_events` nesta execução.
- Os `VACUUM FULL --analyze` sequenciais foram concluídos com sucesso: `access_events` às 15:46 BRT e `dns_policy_events` às 15:50 BRT.
- Espaço livre no filesystem passou de 369 GB para 430 GB; as tabelas passaram de 55 GB para 1.688 MB (`access_events`) e de 13 GB para 2.725 MB (`dns_policy_events`).
- Validação pós-manutenção: timer diário ativo/habilitado, API `http://127.0.0.1:6778/api/ping` respondeu `Pong`, e os registros mais antigos das duas tabelas ficaram em 12/07/2026, respeitando a retenção de 30 dias.
