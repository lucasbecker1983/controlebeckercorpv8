# Implementação Proxy & Logs — 2026-04-13 09:04:05 -03

## Escopo entregue

Implementação real no projeto existente para o módulo `Proxy & Logs`, preservando a UI principal em `frontend/src/pages/Proxy.jsx` e reconectando o backend do proxy em `backend-proxy/` para:

- modos reais `off`, `test-http-only`, `test-http+https`
- persistência de estado em banco
- engine com geração/validação de `squid.conf`
- interceptação gerenciada por bloco fixo em `UFW before.rules`
- rollback automático do bloco UFW e do `squid.conf`
- geração real de nova CA do proxy HTTPS
- download real do certificado
- radar persistido em `proxy_radar_events`
- auditoria operacional em `proxy_action_logs`
- estrutura de relatórios pronta para `SARG`
- UI com botão `MODO TESTE`, metadados de certificado e estado real expandido

## Arquivos alterados

### Backend Proxy

- `backend-proxy/src/config/env.ts`
- `backend-proxy/src/ingester.ts`
- `backend-proxy/src/server.ts`
- `backend-proxy/src/routes/engine-routes.ts`
- `backend-proxy/src/routes/proxy-routes.ts`
- `backend-proxy/src/routes/dns-routes.ts`
- `backend-proxy/src/routes/whitelist-routes.ts`
- `backend-proxy/src/routes/vip-routes.ts`
- `backend-proxy/src/utils/process.ts`
- `backend-proxy/src/services/proxy-schema-service.ts`
- `backend-proxy/src/services/action-log-service.ts`
- `backend-proxy/src/services/domain-policy-service.ts`
- `backend-proxy/src/services/certificate-service.ts`
- `backend-proxy/src/services/interception-service.ts`
- `backend-proxy/src/services/report-service.ts`
- `backend-proxy/src/services/dns-logger-service.ts`
- `backend-proxy/src/services/proxy-engine-service.ts`
- `backend-proxy/src/services/proxy-module.ts`

### Frontend

- `frontend/src/pages/Proxy.jsx`

### Migration SQL versionada

- `backend-proxy/sql/2026-04-13_proxy_logs_real.sql`

## Estruturas persistidas

Criadas/garantidas no bootstrap:

- `proxy_engine_state`
- `proxy_vlans`
- `proxy_vips`
- `proxy_blocklist`
- `proxy_whitelist`
- `proxy_radar_events`
- `proxy_action_logs`
- `proxy_certificates`

## Endpoints criados/ajustados

### Engine e estado

- `GET /api/proxy/status`
- `GET /api/proxy/engine`
- `GET /api/proxy/services`
- `GET /api/proxy/engine/status`
- `POST /api/proxy/mode/test-http-only`
- `POST /api/proxy/mode/test-http-https`
- `POST /api/proxy/mode/off`
- `POST /api/proxy/emergency-bypass`
- `POST /api/proxy/engine/start`
- `POST /api/proxy/engine/stop`
- `POST /api/proxy/engine/emergency`
- `POST /api/proxy/engine/mode/test-http-only`
- `POST /api/proxy/engine/mode/test-http-https`
- `POST /api/proxy/engine/mode/off`

### Certificado

- `GET /api/proxy/certificate`
- `POST /api/proxy/certificate/regenerate`
- `GET /api/proxy/certificate/download`
- `GET /api/proxy/cert/download`
- `GET /api/cert/download`
- `GET /cert/download`

### Logger e radar

- `POST /api/proxy/logger/restart`
- `GET /api/proxy/radar`
- `POST /api/proxy/radar/clear`
- `GET /api/dns/stats`
- `GET /api/dns/status`
- `GET /api/dns/radar`
- `POST /api/dns/radar/clear`
- `GET /api/dns/vlan-summary`
- `POST /api/dns/restart-logger`
- `POST /api/dns/cleanup`

### Blocklist / Whitelist / VIP / Reports

- `GET /api/proxy/blocklist`
- `POST /api/proxy/blocklist`
- `DELETE /api/proxy/blocklist/:id`
- `GET /api/proxy/whitelist`
- `POST /api/proxy/whitelist`
- `DELETE /api/proxy/whitelist/:id`
- `GET /api/proxy/vips`
- `POST /api/proxy/vips`
- `PATCH /api/proxy/vips/:id`
- `DELETE /api/proxy/vips/:id`
- `GET /api/proxy/reports`
- `POST /api/proxy/reports/generate`
- `GET /api/proxy/action-logs`

Compatibilidade mantida para a UI atual:

- `GET /api/dns/listas`
- `POST /api/dns/listas/add`
- `POST /api/dns/listas/remove`
- `GET /api/dns/whitelist`
- `POST /api/dns/whitelist/add`
- `POST /api/dns/whitelist/remove`
- `GET /api/dns/vip`
- `POST /api/dns/vip`
- `PATCH /api/dns/vip/:id`
- `DELETE /api/dns/vip/:id`

## Fluxo do botão MODO TESTE

Implementado em `frontend/src/pages/Proxy.jsx`:

1. O usuário entra em `MOTOR & CONTROLE`.
2. Clica em `MODO TESTE`.
3. A UI abre um submenu operacional real com:
   - `Ativar Teste HTTP-only`
   - `Ativar Teste HTTP+HTTPS`
4. A ação chama:
   - `POST /api/proxy/mode/test-http-only`
   - `POST /api/proxy/mode/test-http-https`
5. O backend:
   - sincroniza políticas
   - garante CA ativa
   - gera `squid.conf` dinâmico
   - valida com `squid -k parse`
   - instala com backup e rollback
   - aplica bloco UFW gerenciado com backup e rollback
   - reinicia/garante logger
   - persiste `proxy_engine_state`
   - registra auditoria em `proxy_action_logs`
6. A UI reflete:
   - `mode`
   - `active_ports`
   - `last_action`
   - `last_action_by`
   - `last_validation`
   - `last_error`
   - `test_target_ip`

## Download do certificado

Ficou disponível via:

- `GET /api/proxy/certificate/download`
- alias legado: `GET /api/cert/download`

Na UI:

- seção `CERTIFICADO DO PROXY HTTPS`
- botão `BAIXAR CERTIFICADO`
- botão `GERAR NOVA CA`
- metadados exibidos:
  - criação
  - validade
  - fingerprint

Persistência:

- arquivos da CA ficam em `backend-proxy/runtime/certificates/...`
- metadados ficam em `proxy_certificates`

## Restrições operacionais implementadas

- a interceptação foi limitada ao IP `192.168.10.45/32`
- o restante da VLAN 10 ficou fora da interceptação
- o modo `off` mantém Squid e logger, sem redirecionamento
- o modo inicial persistido é seguro: `off` com `bypass_global = true`
- o bloco UFW usa apenas:
  - `# BEGIN V8_PROXY_ENGINE`
  - `# END V8_PROXY_ENGINE`
- o backend edita somente o bloco dele

## squid.conf

Motor implementado em `backend-proxy/src/services/proxy-engine-service.ts`:

- `3129` forward
- `3128` intercept HTTP
- `3130` intercept HTTPS com `ssl-bump`
- ACL restrita a:
  - `127.0.0.1/32`
  - `::1`
  - `192.168.10.45/32`
- whitelist antes da blacklist
- domínios protegidos em splice
- `peek` no início
- `splice` por padrão
- `bump` seletivo
- sem `bump all`

Validação:

- `squid -k parse -f <candidate>`

Rollback:

## Atualização de estado — 2026-04-14

### Novo módulo entregue

Foi criado um novo módulo nativo chamado `Bloqueios e Liberações`, integrado ao projeto existente sem substituir a interface atual.

Frontend:

- `frontend/src/pages/BlockingReleases.jsx`
- `frontend/src/App.jsx`
- `frontend/src/components/Sidebar.jsx`

Backend Proxy:

- `backend-proxy/src/routes/blocking-release-routes.ts`
- `backend-proxy/src/services/blocking-release-schema-service.ts`
- `backend-proxy/src/services/blocking-release-service.ts`
- `backend-proxy/src/server.ts`

Migration SQL:

- `backend-proxy/sql/2026-04-14_bloqueios_liberacoes.sql`

### Estruturas persistidas do novo módulo

Criadas/garantidas no bootstrap:

- `policy_engine_state`
- `blocking_policies`
- `release_policies`
- `vlan_policies`
- `policy_exceptions`
- `access_events`
- `metrics_aggregates`
- `action_audit_logs`
- `report_index`

### Endpoints criados

- `GET /api/bloqueios-liberacoes/status`
- `GET /api/bloqueios-liberacoes/overview`
- `GET /api/bloqueios-liberacoes/health`
- `POST /api/bloqueios-liberacoes/apply`
- `POST /api/bloqueios-liberacoes/rollback`
- `POST /api/bloqueios-liberacoes/emergency-bypass`

- `GET /api/bloqueios-liberacoes/blocklist`
- `POST /api/bloqueios-liberacoes/blocklist`
- `PATCH /api/bloqueios-liberacoes/blocklist/:id`
- `DELETE /api/bloqueios-liberacoes/blocklist/:id`

- `GET /api/bloqueios-liberacoes/allowlist`
- `POST /api/bloqueios-liberacoes/allowlist`
- `PATCH /api/bloqueios-liberacoes/allowlist/:id`
- `DELETE /api/bloqueios-liberacoes/allowlist/:id`

- `GET /api/bloqueios-liberacoes/vlans`
- `PATCH /api/bloqueios-liberacoes/vlans/:id`
- `POST /api/bloqueios-liberacoes/vlans/:id/toggle-blocking`
- `POST /api/bloqueios-liberacoes/vlans/:id/toggle-monitoring`
- `POST /api/bloqueios-liberacoes/vlans/:id/toggle-exempt`

- `GET /api/bloqueios-liberacoes/exceptions`
- `POST /api/bloqueios-liberacoes/exceptions`
- `PATCH /api/bloqueios-liberacoes/exceptions/:id`
- `DELETE /api/bloqueios-liberacoes/exceptions/:id`

- `GET /api/bloqueios-liberacoes/metrics`
- `GET /api/bloqueios-liberacoes/metrics/top-sites`
- `GET /api/bloqueios-liberacoes/metrics/top-blocked`
- `GET /api/bloqueios-liberacoes/metrics/top-ips`
- `GET /api/bloqueios-liberacoes/metrics/heatmap`
- `GET /api/bloqueios-liberacoes/audit`
- `GET /api/bloqueios-liberacoes/reports`
- `GET /api/bloqueios-liberacoes/reports/:reportKey`

### Estado real atual

Já funcional:

- persistência real em PostgreSQL
- UI nativa com abas de visão geral, listas, VLANs, exceções, métricas, auditoria, saúde e relatórios
- ingestão de telemetria de `proxy_radar_events` para `access_events`
- auditoria própria em `action_audit_logs`
- indexação e leitura real de relatórios SARG
- apply com snapshot real em `backend-proxy/runtime/backups/bloqueios-liberacoes`
- rollback do último snapshot
- geração de artefatos em `backend-proxy/regras/generated/bloqueios-liberacoes`
- atualização dos arquivos consumidos pelo engine atual:
  - `proxy_whitelist.acl`
  - `proxy_blocklist.acl`
  - `proxy_protected_ssl.acl`
  - `proxy_bump_ssl.acl`
  - `bypassed_vlans.json`

### VLANs 40 e 80

Regra inicial implantada no schema:

- VLAN `40` = `isenta` por padrão
- VLAN `80` = `isenta` por padrão

Validação executada localmente após build do backend:

- `exemptVlans = [40, 80]`

### O que está realmente bloqueando hoje

Se um domínio for adicionado à blacklist do novo módulo e o operador executar `Apply`:

- o domínio é persistido no banco
- o arquivo real `proxy_blocklist.acl` é regenerado
- o engine atual do proxy é recarregado
- o bloqueio efetivo acontece no escopo global do engine atual

Whitelist continua com precedência:

- se o domínio estiver liberado/protegido, o bloqueio não deve prevalecer

### Atualização importante: bypass por IP

O bypass por IP foi conectado ao enforcement real.

Implementação:

- exceções ativas dos tipos
  - `bypass total`
  - `bypass de bloqueio`
  - `liberação específica`
  são convertidas em ACL real de IPs

Arquivos gerados/sincronizados:

- `backend-proxy/regras/generated/proxy_ip_bypass.acl`
- `backend-proxy/regras/generated/bloqueios-liberacoes/ip-bypass.acl`
- `/etc/unbound/becker/vip-bypass.conf`
- bloco VIP dentro de `blocked.rpz`

Efeito operacional:

- no Squid, o ACL `ip_bypass` é liberado antes da blacklist
- no fluxo HTTPS, o `ssl_bump` faz `splice` para `ip_bypass`
- no Unbound, os IPs entram em RPZ client-ip passthrough
- mudanças em exceções já sincronizam bypass por IP sem depender apenas do `Apply`

Validação executada:

- criada exceção temporária para `192.168.10.254`
- confirmado `aclContainsTestIp = true`
- confirmado `vipConfContainsTestIp = true`
- exceção removida após o teste

### Atualização importante: enforcement por VLAN no motor

O enforcement por VLAN foi conectado ao caminho real do engine atual.

Implementação:

- o interceptador passou a ler `bypassed_vlans.json`
- VLANs não isentas e com bloqueio/monitoramento ativos entram no redirecionamento real por interface
- o `squid.conf` agora renderiza ACLs por subnet/VLAN
- foram gerados arquivos por VLAN em:
  - `backend-proxy/regras/generated/bloqueios-liberacoes/allowlist-vlan-<id>.acl`
  - `backend-proxy/regras/generated/bloqueios-liberacoes/blocklist-vlan-<id>.acl`

Regras efetivas no Squid:

- `acl vlan_<id>_src src <subnet>`
- `acl vlan_<id>_allow dstdomain "<arquivo>"`
- `acl vlan_<id>_block dstdomain "<arquivo>"`
- `http_access allow vlan_<id>_src vlan_<id>_allow`
- `http_access deny vlan_<id>_src vlan_<id>_block`

Regras efetivas no interceptador:

- `PREROUTING -i <iface> --dport 80 -> REDIRECT`
- `PREROUTING -i <iface> --dport 443 -> REDIRECT`
- bypass por VLAN continua respeitado via `bypassed_vlans.json`

Validação local executada:

- configuração renderizada contendo:
  - `acl vlan_10_src src 192.168.10.0/24`
  - `http_access allow vlan_10_src vlan_10_allow`
  - `http_access deny vlan_10_src vlan_10_block`
- arquivos gerados confirmados:
  - `allowlist-vlan-10.acl`
  - `blocklist-vlan-10.acl`

### Estado real consolidado agora

- blacklist global: real
- whitelist global: real
- blacklist por VLAN no motor: implementada
- whitelist por VLAN no motor: implementada
- apply/rollback: real
- estado e auditoria por VLAN: real
- bypass por IP individual: real

### Observação para teste corporativo

Apesar do enforcement por VLAN já estar conectado no motor, a validação final precisa ser feita com tráfego real no ambiente corporativo para confirmar:

- redirecionamento por interface/VLAN no host
- comportamento HTTP e HTTPS por VLAN
- precedência entre whitelist global, whitelist por VLAN, blacklist global e blacklist por VLAN

### Atualização de publicação frontend — correção de carregamento do módulo

Foi identificada uma divergência entre o módulo novo e o padrão real já usado pelo sistema:

- `Proxy.jsx` utiliza chamadas relativas na mesma origem publicada
- `BlockingReleases.jsx` havia sido publicado usando `https://<host>:6779`

Isso gerava dependência desnecessária de CORS no ambiente publicado.

Correção aplicada:

- `frontend/src/pages/BlockingReleases.jsx`
- constante `API` alterada de URL absoluta para caminho relativo:
  - antes: `https://${window.location.hostname}:6779`
  - agora: `''`

Motivo:

- alinhar o novo módulo ao mesmo padrão do sistema já funcional
- evitar falhas de carregamento mascaradas como erro CORS no navegador
- usar a mesma origem publicada do frontend/reverse proxy

Publicação executada após a correção:

- `frontend: npm run build`
- `pm2 restart bcc-frontend`

Observação operacional:

- toda alteração futura deve continuar sendo registrada neste `.md`

### Atualização de sessão/autorização frontend

Foi identificado um cenário em que o frontend permanecia montado com token antigo no `localStorage`, mas o backend já respondia `401`.

Sintoma:

- módulos carregavam parcialmente
- chamadas como `/api/dashboard/metrics` ou `/api/bloqueios-liberacoes/*` passavam a responder `401`
- a UI ficava quebrada ao invés de retornar ao login

Correção aplicada:

- `frontend/src/services/api.js`
- `frontend/src/services/authFetch.js`

Comportamento novo:

- qualquer resposta `401` limpa:
  - `becker_token`
  - `becker_user`
- em seguida o frontend faz `reload`
- o usuário volta ao fluxo normal de login

Publicação executada:

- `frontend: npm run build`
- `pm2 restart bcc-frontend`

### Atualização de UX de cadastro por categoria

Foi alterada a forma de entrada de políticas de bloqueio e liberação.

Antes:

- cadastro por prompts soltos de domínio/descrição/motivo

Agora:

- cadastro orientado por categoria no módulo `Bloqueios e Liberações`
- o operador escolhe a categoria e trabalha a lista de domínios dentro dela

Categorias adicionadas na interface:

- `Sites Liberados`
- `Bancos`
- `Governo`
- `Conectividade Social`
- `Categoria Customizada`

Comportamento novo:

- tanto em `Bloqueados` quanto em `Liberados`, a entrada passou a ser por categoria
- cada categoria exibe domínios sugeridos
- o operador pode revisar a lista, ajustar escopo e observações
- criação em lote por categoria passa a persistir múltiplos domínios de uma vez

Backend ajustado:

- `release_policies` agora suporta `category`
- filtros e persistência de allowlist passaram a considerar categoria também

Arquivos alterados:

- `frontend/src/pages/BlockingReleases.jsx`
- `backend-proxy/src/services/blocking-release-service.ts`
- `backend-proxy/src/services/blocking-release-schema-service.ts`
- `backend-proxy/sql/2026-04-14_bloqueios_liberacoes.sql`

### Atualização de roteamento no backend core

Foi identificado que o frontend, ao usar caminho relativo na mesma origem, chamava:

- `/api/bloqueios-liberacoes/*`

Porém o backend core ainda não encaminhava esse prefixo para o `backend-proxy`, o que gerava `404`.

Correção aplicada:

- `backend/src/modules/proxy/runtime-proxy.ts`

Prefixo adicionado à lista de rotas proxyadas:

- `/api/bloqueios-liberacoes`

Publicação executada:

- `backend: npm run build`
- `pm2 restart bcc-backend`

Validação após publicação:

- `https://console.jacarezinho.cloud/api/bloqueios-liberacoes/status`
- deixou de responder `404`
- passou a responder `401` quando testado com token inválido, confirmando que o roteamento até o `backend-proxy` está funcional

### Atualização de UX de carregamento do módulo

Foi identificado que a tela de `Bloqueios e Liberações` ficava tempo demais em:

- `Carregando módulo`
- `Sincronizando telemetria, SARG e políticas reais`

Causa:

- a página aguardava todos os endpoints antes de renderizar qualquer conteúdo
- endpoints mais pesados como `metrics`, `audit`, `health` e `reports` retardavam a primeira pintura

Correção aplicada:

- `frontend/src/pages/BlockingReleases.jsx`

Novo comportamento:

- carga crítica primeiro:
  - `status`
  - `overview`
  - `blocklist`
  - `allowlist`
  - `vlans`
  - `exceptions`
- carga secundária em segundo plano:
  - `metrics`
  - `audit`
  - `health`
  - `reports`
- timeout por endpoint para evitar bloqueio prolongado
- a tela passa a renderizar o módulo antes de completar toda a telemetria secundária

Publicação executada:

- `frontend: npm run build`
- `pm2 restart bcc-frontend`

### Testes já executados

Builds executados com sucesso:

- `backend-proxy: npm run build`
- `frontend: npm run build`

Verificação funcional executada no backend:

- `blockingReleaseService.getStatus()` OK
- `blockingReleaseService.buildOverview()` OK
- VLANs isentas padrão confirmadas: `40` e `80`

### Próximo passo no ambiente corporativo

Prioridade operacional para a próxima sessão:

1. validar bloqueio real de domínio no motor com `Apply`
2. validar precedência da whitelist sobre blacklist
3. implementar e testar bypass real por IP
4. validar comportamento por VLAN com tráfego real
5. confirmar leitura útil do SARG com dados corporativos reais

- backup do `squid.conf`
- cópia da candidate
- restart do squid
- restauração automática do backup em falha

## UFW / rollback

Motor implementado em `backend-proxy/src/services/interception-service.ts`:

- lê `/etc/ufw/before.rules`
- gera backup versionado em `backend-proxy/runtime/backups/ufw`
- substitui somente o bloco gerenciado
- valida candidate com `iptables-restore --test`
- aplica `ufw reload`
- se falhar:
  - restaura o arquivo original
  - recarrega UFW novamente

## Validações executadas

Executadas nesta sessão:

```bash
cd /opt/controlebeckercorp-v8/backend-proxy
npm run build
```

```bash
cd /opt/controlebeckercorp-v8/frontend
npm run build
```

Resultados:

- `backend-proxy`: `tsc` concluído com sucesso
- `frontend`: `vite build` concluído com sucesso

## Observações finais

- o repositório local não estava inicializado como `git`, então o inventário foi registrado manualmente
- não executei mudanças reais em `/etc/ufw`, `/etc/squid` ou serviços do host nesta sessão; o código de produção para isso foi implementado e validado por build
- a lógica de rollback existe tanto para `UFW before.rules` quanto para `squid.conf`
- o logger agora possui gerenciamento por PID em `backend-proxy/runtime/dns-logger.pid`

## Atualização 2026-04-14 01:xx - input por categoria em bloqueio e liberação

Alteração registrada por exigência operacional: toda mudança do módulo `Bloqueios e Liberações` deve permanecer documentada neste `.md`.

### Objetivo entregue

- o cadastro de `bloqueios` e `liberações` deixou de ser apenas por domínio solto
- o fluxo principal agora é orientado por `categoria`
- a UI passou a oferecer listas temáticas prontas para acelerar operação e padronizar imputação

### Categorias entregues na UI

- `Sites Liberados`
- `Bancos`
- `Governo`
- `Conectividade Social`
- `Categoria Customizada`

### Como ficou o novo input

- os botões `Novo Bloqueio` e `Nova Liberação` agora abrem um composer modal
- o operador escolhe a categoria primeiro
- a lista de domínios sugeridos da categoria é carregada no textarea
- o operador pode revisar, remover, acrescentar ou substituir domínios antes de salvar
- o escopo continua suportando:
  - `global`
  - `VLAN específica`
- no fluxo de liberação continua existindo a marcação de `protegido`

### Comportamento salvo no backend

- `blocking_policies.category` já era persistido e continua sendo usado
- `release_policies.category` passou a ser persistido de forma real
- filtros/listagens do allowlist agora também aceitam `category`
- criação e edição de regras de liberação agora gravam `category` junto com `reason`

### Arquivos alterados nesta rodada

- `frontend/src/pages/BlockingReleases.jsx`
- `backend-proxy/src/services/blocking-release-service.ts`
- `backend-proxy/src/services/blocking-release-schema-service.ts`
- `backend-proxy/sql/2026-04-14_bloqueios_liberacoes.sql`

### Publicação e validação

Executado nesta rodada:

```bash
cd /opt/controlebeckercorp-v8/backend-proxy
npm run build
```

```bash
cd /opt/controlebeckercorp-v8/frontend
npm run build
```

```bash
pm2 restart backend-proxy bcc-frontend
```

Resultado:

- `backend-proxy` build OK
- `frontend` build OK
- `backend-proxy` reiniciado e online
- `bcc-frontend` reiniciado e online

### Impacto operacional esperado

- o cadastro por categoria reduz erro manual na digitação de listas
- o operador passa a trabalhar com blocos temáticos reutilizáveis
- bloqueio e liberação ficam com o mesmo padrão de entrada, reduzindo inconsistência de operação

## Atualização 2026-04-14 01:4x - bloqueio de Redes Sociais e WhatsApp liberado

Correção operacional registrada:

- o pedido inicial de liberar `WhatsApp` apenas na `VLAN 30` foi substituído por uma regra global
- o `WhatsApp` ficou liberado em **todas as VLANs**
- a categoria `Redes Sociais` foi cadastrada com blacklist ampliada

### Lista aplicada em Redes Sociais

Bloqueio global ativo para:

- `facebook.com`
- `fb.com`
- `fbcdn.net`
- `facebook.net`
- `messenger.com`
- `messengercdn.com`
- `instagram.com`
- `cdninstagram.com`
- `ig.me`
- `threads.net`
- `tiktok.com`
- `tiktokcdn.com`
- `tiktokv.com`
- `byteoversea.com`
- `ibytedtos.com`
- `musical.ly`
- `twitter.com`
- `x.com`
- `twimg.com`
- `t.co`
- `snapchat.com`
- `snap.com`
- `sc-cdn.net`
- `pinterest.com`
- `pinimg.com`
- `reddit.com`
- `redd.it`
- `redditmedia.com`
- `linkedin.com`
- `licdn.com`
- `tumblr.com`
- `tumblr.co`
- `kwai.com`
- `kuaishou.com`
- `kwimgs.com`
- `discord.com`
- `discord.gg`
- `discordapp.com`
- `discordapp.net`
- `beacons.ai`

### WhatsApp liberado globalmente

Whitelist protegida ativa para:

- `whatsapp.com`
- `web.whatsapp.com`
- `whatsapp.net`
- `wa.me`
- `static.whatsapp.net`

### Correção de enforcement realizada

Foi identificada uma falha real:

- o `apply` do engine reutilizava o fluxo legado do módulo `Proxy`
- esse fluxo regravava `proxy_whitelist.acl` e `proxy_blocklist.acl`
- com isso, o módulo enterprise gerava os arquivos corretos, mas o motor antigo podia sobrescrevê-los

Correção aplicada em:

- `backend-proxy/src/services/domain-policy-service.ts`

Comportamento novo:

- os ACLs legados agora são mesclados com os ACLs gerados por `Bloqueios e Liberações`
- o Squid passa a enxergar, ao mesmo tempo:
  - domínios sensíveis/protegidos do módulo legado
  - whitelist global do enterprise
  - blacklist global do enterprise

### Testes executados nesta rodada

Persistência de políticas:

- 40 domínios inseridos/atualizados na blacklist `Redes Sociais`
- 5 domínios do `WhatsApp` inseridos/atualizados na whitelist protegida global

Arquivos gerados e validados:

- `backend-proxy/regras/generated/proxy_whitelist.acl` com 5 entradas de WhatsApp
- `backend-proxy/regras/generated/proxy_blocklist.acl` com 40 entradas de redes sociais
- `backend-proxy/regras/generated/proxy_protected_ssl.acl` contendo os domínios do WhatsApp
- `backend-proxy/regras/generated/proxy_bump_ssl.acl` contendo a blacklist social

Bypass por IP:

- exceção temporária de teste criada para `192.168.30.250`
- `proxy_ip_bypass.acl` recebeu o IP
- `/etc/unbound/becker/vip-bypass.conf` recebeu a entrada RPZ correspondente
- registro em `dns_vip` confirmado com `motivo = policy_exception`
- exceção temporária removida ao final do teste

Ativação do motor:

- modo final ativado: `test-http+https`
- `Squid`: `active`
- `Unbound`: `active`
- `dns_logger`: `active`
- `policy_engine`: `test-http+https`
- `interception_active`: `true`
- portas ativas: `3129`, `3128`, `3130`

### Arquivos alterados nesta rodada

- `frontend/src/pages/BlockingReleases.jsx`
- `backend-proxy/src/services/domain-policy-service.ts`

### Publicação executada

```bash
cd /opt/controlebeckercorp-v8/frontend
npm run build
```

```bash
cd /opt/controlebeckercorp-v8/backend-proxy
npm run build
```

```bash
pm2 restart bcc-frontend
pm2 restart backend-proxy
```

## Atualização 2026-04-14 01:47 - exceção por VLAN 30 para Instagram e Facebook

Ajuste operacional solicitado:

- manter o bloqueio global de `Redes Sociais`
- liberar somente `Instagram` e `Facebook` na `VLAN 30`
- manter `WhatsApp` liberado

### Regras aplicadas

Whitelist por `VLAN 30`:

- `instagram.com`
- `cdninstagram.com`
- `facebook.com`
- `fb.com`
- `fbcdn.net`

Whitelist global mantida:

- `whatsapp.com`
- `web.whatsapp.com`
- `whatsapp.net`
- `wa.me`
- `static.whatsapp.net`

### Validação executada

- registros confirmados em `release_policies` com `scope_type = vlan` e `scope_value = 30`
- `apply` executado com sucesso
- arquivo `backend-proxy/regras/generated/bloqueios-liberacoes/allowlist-vlan-30.acl` validado com entradas de Instagram e Facebook
- `proxy_whitelist.acl` global validado com entradas de WhatsApp
- `squid.conf` validado com:
  - `acl vlan_30_allow`
  - `acl vlan_30_block`
  - `http_access allow vlan_30_src vlan_30_allow`
  - `http_access deny vlan_30_src vlan_30_block`

## Atualização 2026-04-14 01:5x - correção de cache do PWA / Service Worker

Falha reportada no navegador:

- `Falha ao carregar 'https://console.jacarezinho.cloud/assets/index-BStuLMKx.js'`
- erro de `ServiceWorker` / `workbox`

Correção aplicada:

- `frontend/vite.config.js`
- o `VitePWA` foi colocado em modo `selfDestroying`
- `cleanupOutdatedCaches`, `clientsClaim` e `skipWaiting` foram habilitados

Objetivo da correção:

- forçar o Service Worker legado a se autodestruir
- limpar o cache antigo que estava referenciando bundles inválidos
- impedir que a aplicação continue presa a assets antigos após publicação

Publicação executada:

```bash
cd /opt/controlebeckercorp-v8/frontend
npm run build
```

```bash
pm2 restart bcc-frontend
```

## Atualização 2026-04-14 02:4x - blacklist de pornografia e simplificação de UX

Solicitações executadas:

- bloquear a maioria dos sites pornográficos conhecidos
- reduzir o excesso visual da UI nas telas de bloqueio/liberação

### Blacklist de pornografia aplicada

Categoria adicionada:

- `Pornografia`

Blacklist global cadastrada e aplicada com exemplos:

- `pornhub.com`
- `phncdn.com`
- `xvideos.com`
- `xnxx.com`
- `xhamster.com`
- `redtube.com`
- `youporn.com`
- `tube8.com`
- `beeg.com`
- `spankbang.com`
- `youjizz.com`
- `porntrex.com`
- `eporner.com`
- `tnaflix.com`
- `sunporno.com`
- `drtuber.com`
- `hqporner.com`
- `txxx.com`
- `thumbzilla.com`
- `nuvid.com`
- `porn.com`
- `brazzers.com`
- `realitykings.com`
- `bangbros.com`
- `fakehub.com`
- `mofos.com`
- `adultdvdempire.com`
- `evilangel.com`
- `teamskeet.com`
- `julesjordan.com`

Validação real:

- `30` domínios ativos na categoria `Pornografia`
- `apply` executado com sucesso
- domínios confirmados em:
  - `backend-proxy/regras/generated/bloqueios-liberacoes/blocklist-global.acl`
  - `backend-proxy/regras/generated/proxy_blocklist.acl`

### Ajuste de UX

Arquivo alterado:

- `frontend/src/pages/BlockingReleases.jsx`

Simplificações aplicadas:

- remoção dos blocos decorativos de categorias nas listagens de bloqueio/liberação
- filtros agrupados em uma única faixa mais compacta
- subtítulos mais diretos e operacionais
- redução da poluição visual nas abas de `Bloqueados` e `Liberados`

Publicação executada:

```bash
cd /opt/controlebeckercorp-v8/frontend
npm run build
```

```bash
pm2 restart bcc-frontend
```

## Atualização 2026-04-14 02:3x - correção de loop no login

Problema identificado:

- a aplicação entrava em loop na tela de login
- a causa era o bootstrap do header em `App.jsx`, que chamava `/api/dashboard/metrics` mesmo sem token
- essa chamada retornava `401`
- os interceptors de `api.js` e `authFetch.js` reagiam com `reload()`
- o navegador reiniciava a tela de login em ciclo

Correções aplicadas:

- `frontend/src/App.jsx`
- `frontend/src/services/api.js`
- `frontend/src/services/authFetch.js`

Mudanças:

- o header só busca métricas quando existe token válido
- o interceptor não dispara limpeza/reload para `/api/auth/login`
- o `401` só provoca limpeza de sessão quando realmente já existe token salvo
- o redirecionamento após `401` passou a preferir `window.location.href = '/'` em vez de recarregar cegamente em qualquer contexto

Publicação executada:

```bash
cd /opt/controlebeckercorp-v8/frontend
npm run build
```

```bash
pm2 restart bcc-frontend
```

## Atualização 2026-04-14 02:1x - remoção do resquício operacional do IP 192.168.10.45

Solicitação executada:

- remover o vestígio do `192.168.10.45` como alvo operacional do motor

### Correções aplicadas

Arquivos alterados:

- `backend-proxy/src/services/interception-service.ts`
- `backend-proxy/src/services/proxy-engine-service.ts`
- `backend-proxy/src/services/dns-logger-service.ts`

Mudanças:

- o reset de `conntrack` deixou de usar `192.168.10.45`
- o reset agora percorre os CIDRs ativos das VLANs interceptadas
- a ACL `test_target` foi removida do `squid.conf`
- `allowed_clients` passou a listar apenas `localhost` e as subnets das VLANs observadas
- o status do engine deixou de expor `test_target_ip`
- o status do engine agora expõe `observed_scopes`
- o radar/logger deixou de marcar o cliente especial como `test-client`
- o resumo do radar deixou de exibir `observed_target_ip`

### Validação executada

```bash
cd /opt/controlebeckercorp-v8/backend-proxy
npm run build
```

```bash
pm2 restart backend-proxy
```

```bash
proxyEngineService.setMode('test-http+https', 'codex', 'remove-test-target')
```

Resultado validado:

- `observed_scopes` retornando subnets reais por VLAN:
  - `192.168.10.0/24`
  - `192.168.30.0/24`
  - `192.168.50.0/24`
  - `192.168.70.0/24`
- `has_test_target_ip = false` no status exposto
- `monitored_scope = null` no status exposto
- `squid.conf` sem `acl test_target`
- `squid.conf` com `allowed_clients` baseado em subnets
- `conntrack_reset` executado por CIDR de VLAN, não por host único

### Observação de compatibilidade

- referências históricas em `env` e em campos antigos de banco foram mantidas apenas para compatibilidade estrutural
- o fluxo operacional atual deixou de depender desse IP fixo

## Atualização 2026-04-14 02:2x - modal de bloqueio/liberação ajustado para telas pequenas

Correção solicitada:

- em notebooks de 14", o botão `Salvar categoria` ainda podia ficar fora da área visível

Correção aplicada em:

- `frontend/src/pages/BlockingReleases.jsx`

Mudança de layout:

- o modal passou a usar estrutura em coluna com:
  - cabeçalho fixo
  - conteúdo central rolável
  - rodapé fixo interno
- o botão `Salvar categoria` ficou no rodapé do modal
- a rolagem agora acontece apenas no corpo do modal, sem empurrar o rodapé para fora da viewport

Publicação executada:

```bash
cd /opt/controlebeckercorp-v8/frontend
npm run build
```

```bash
pm2 restart bcc-frontend
```

## Atualização 2026-04-14 02:0x - confirmação de interceptação por VLAN e ajustes de UX

### Estado real da interceptação

Foi confirmada a situação do motor:

- a interceptação **não** está limitada somente ao `192.168.10.45`
- o redirecionamento NAT está sendo aplicado por `interface/VLAN` em `backend-proxy/src/services/interception-service.ts`
- as VLANs elegíveis são interceptadas conforme o arquivo `bypassed_vlans.json`
- `VLAN 40` e `VLAN 80` permanecem fora por padrão quando isentas

Detalhe importante:

- o único ponto ainda preso ao `192.168.10.45` é o método `resetTestTargetConntrack()`
- isso afeta apenas a limpeza de conexões de teste, não a interceptação principal do tráfego

Validação operacional confirmada:

- `policy_engine: test-http+https`
- `squid: active`
- `unbound: active`
- `dns_logger: active`
- `degraded: false`

### Ajustes de UX entregues

Arquivo alterado:

- `frontend/src/pages/BlockingReleases.jsx`

Melhorias aplicadas:

- o modal de bloqueio/liberação agora possui rolagem vertical interna
- o container do modal passou a respeitar a altura da viewport
- o botão `Salvar categoria` volta a ficar acessível mesmo em telas mais baixas
- foram adicionados filtros na listagem de `Bloqueados`
- foram adicionados filtros na listagem de `Liberados`

Filtros entregues:

- busca textual
- filtro por categoria
- filtro por escopo (`global` ou `VLAN`)
- filtro por status
- no allowlist, filtro adicional por `protegido / não protegido`

Publicação executada:

```bash
cd /opt/controlebeckercorp-v8/frontend
npm run build
```

```bash
pm2 restart bcc-frontend
```
