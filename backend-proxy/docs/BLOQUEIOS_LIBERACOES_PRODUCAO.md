# Bloqueios & Liberações em Produção

## Arquitetura final
- Source of truth: `blocking_policies`, `release_policies`, `policy_exceptions`, `vlan_policies`, `policy_engine_state`
- Enforcement principal: Unbound via RPZ
- Enforcement complementar: Squid explícito em `3129`
- Modos:
  - `acl-only`
  - `acl-plus-dns`
  - `intercept-selective`

## Precedência
1. `IP/VIP bypass`
2. `DNS bypass VIP`
3. `allow global`
4. `allow por VLAN`
5. `block global`
6. `block por VLAN`

## Artefatos gerados
- Squid:
  - `/etc/squid/squid.conf`
  - `/etc/squid/acl/proxy_whitelist.acl`
  - `/etc/squid/acl/proxy_blocklist.acl`
  - `/etc/squid/acl/proxy_ip_bypass.acl`
  - `/etc/squid/acl/allowlist-vlan-<id>.acl`
  - `/etc/squid/acl/blocklist-vlan-<id>.acl`
- Unbound:
  - `/etc/unbound/becker/allowed.rpz`
  - `/etc/unbound/becker/blocked.rpz`
  - `/etc/unbound/becker/vip-bypass.conf`
  - `/etc/unbound/becker/allowlist-vlan-<id>.rpz`
  - `/etc/unbound/becker/blocklist-vlan-<id>.rpz`
  - `/etc/unbound/unbound.conf.d/becker_policy_compiler.conf`
- Runtime:
  - `backend-proxy/runtime/policy-compiler/manifest.json`
  - `backend-proxy/runtime/backups/bloqueios-liberacoes/<snapshot>/snapshot-meta.json`

## Apply / rollback
- `apply`
  - compila políticas
  - escreve artefatos apenas quando conteúdo muda
  - valida `unbound-checkconf`
  - valida `squid -k parse`
  - evita reload quando manifesto e `squid.conf` já estão convergentes
  - registra auditoria e `no-op apply` quando aplicável
- `rollback`
  - exige snapshot restarável
  - restaura Squid, Unbound, manifesto, ACLs e `before.rules`
  - revalida serviços
  - marca falha parcial se a restauração não ficar saudável

## Health model
- Integridade:
  - manifesto presente
  - manifesto compatível com arquivos em disco
  - include do compiler presente e carregado
  - `module-config: "respip validator iterator"`
  - `allowed.rpz`, `blocked.rpz`, `vip-bypass.conf`
  - snapshot restarável
- Serviços:
  - Policy Compiler
  - Unbound
  - Squid
  - PostgreSQL
  - Apply Engine
  - Rollback Engine
  - Drift Monitor
  - Legacy Risk

## Legado isolado
- Scripts perigosos foram colocados em quarentena:
  - `legacy-quarantine/scripts/panic_on.sh`
  - `legacy-quarantine/scripts/panic_off.sh`
  - `legacy-quarantine/backend/999_vlan_scheduler.sh`
- Os caminhos antigos agora são stubs inertes e não devem ser usados.
- O agendador legado de VLAN no backend principal responde `410 Gone`.

## Compatibilidade
- `proxy_*`, `dns_*` e `net_dns_*` não são source of truth do enforcement principal.
- Artefatos legados continuam só para compatibilidade controlada.
- `DomainPolicyService` não pode mais sobrescrever `allowed.rpz`.

## Troubleshooting objetivo
- `unbound-checkconf`
- `squid -k parse`
- `systemctl is-active unbound`
- `systemctl is-active squid`
- `iptables -t nat -S | rg 'REDIRECT|3128|3130'`
- `jq . backend-proxy/runtime/policy-compiler/manifest.json`
- `jq . backend-proxy/runtime/backups/bloqueios-liberacoes/<snapshot>/snapshot-meta.json`

## Riscos conhecidos
- O parse do Squid continua verboso; isso é normal. Warnings evitáveis devem permanecer zerados.
- O proxy complementar continua usando `Via`, por opção explícita de compatibilidade HTTP.
- Rotas legadas ainda existem no backend antigo, mas o acionamento perigoso foi neutralizado.

## Atualização 2026-04-14 — restauração funcional + contingência DNS + reestilização total

### Restauração do estado funcional esperado
- baseline restaurada diretamente no source of truth:
  - `policy_engine_state`
  - `blocking_policies`
  - `release_policies`
  - `policy_exceptions`
  - `vlan_policies`
- enforcement principal restaurado para `acl-plus-dns`
- `emergency_bypass` global desligado
- exceções antigas desativadas, inclusive o bypass amplo em `192.168.10.0/24`
- matriz restaurada:
  - VLAN 10: `redes_sociais` + `pornografia` bloqueadas
  - VLAN 50: `redes_sociais` + `pornografia` bloqueadas
  - VLAN 30: `redes_sociais` liberadas, `pornografia` bloqueada
  - VLAN 70: `redes_sociais`, `governo` e `bancos` liberados, `pornografia` bloqueada
  - VLAN 40 e 80: sem escopo categórico por VLAN, herdando apenas regras globais mandatórias
  - VLAN 99: removida do escopo operacional do módulo
- regra mandatória preservada:
  - `Pornografia` bloqueada globalmente
  - `WhatsApp` liberado globalmente e protegido

### Ajustes arquiteturais e backend
- novo serviço dedicado: `backend-proxy/src/services/dns-contingency-service.ts`
- novas tabelas:
  - `dns_contingency_state`
  - `dns_contingency_audit`
- novas rotas em `backend-proxy/src/routes/blocking-release-routes.ts`:
  - `POST /api/bloqueios-liberacoes/restore-baseline`
  - `GET /api/bloqueios-liberacoes/contingency/status`
  - `GET /api/bloqueios-liberacoes/contingency/audit`
  - `POST /api/bloqueios-liberacoes/contingency/activate`
  - `POST /api/bloqueios-liberacoes/contingency/deactivate`
  - `POST /api/bloqueios-liberacoes/contingency/renew`
  - `POST /api/bloqueios-liberacoes/contingency/test`
- bootstrap do backend-proxy passou a iniciar o reconciler da contingência DNS
- `PolicyCompilerService` deixou de hardcodar `192.168.99.0/24` e agora gera `access-control` a partir das VLANs persistidas
- `ProxyEngineService` deixou de declarar `acl ip_bypass` quando o arquivo está vazio, eliminando warning evitável do parse do Squid

### Modo de Contingência DNS
- chain dedicada persistida em `before.rules`:
  - `DNS_EMERGENCY_V8`
- comportamento normal:
  - DNS externo bloqueado para VLANs operacionais somente em `UDP/TCP 53`
  - sem NAT
  - sem `3128 intercept`
  - sem `3130`
- comportamento em contingência:
  - libera apenas os resolvedores autorizados:
    - Google: `8.8.8.8`, `8.8.4.4`
    - Cloudflare: `1.1.1.1`, `1.0.0.1`
    - Quad9 Secure: `9.9.9.9`, `149.112.112.112`
  - escopo:
    - global
    - por VLAN
  - duração:
    - `15`
    - `30`
    - `60`
    - manual
  - expiração automática via reconciler
  - trilha de auditoria dedicada
- health suggestion da contingência cruza:
  - `unbound-checkconf`
  - `systemctl is-active unbound`
  - resolução real
  - include RPZ carregado
  - manifesto alinhado

### UI reestilizada
- arquivo principal reestilizado:
  - `frontend/src/pages/BlockingReleases.jsx`
- direção aplicada:
  - dark mode coerente com o sistema
  - hero novo em gradiente escuro
  - tabs premium alinhadas ao padrão enterprise
  - destaque explícito para:
    - Unbound principal
    - Squid explícito complementar
    - drift
    - VLAN 99 não utilizada
    - contingência DNS
- abas expostas ao operador:
  - Visão Geral
  - Bloqueados
  - Liberados
  - VLANs & Políticas
  - Exceções
  - Contingência DNS
  - Motor & Saúde
  - Métricas
  - Auditoria
- nova aba `Contingência DNS` mostra:
  - status
  - escopo
  - resolvedores ativos
  - operador
  - motivo
  - ativado em
  - expira em
  - tempo restante
  - health suggestion
  - auditoria dedicada
- banner forte quando a contingência estiver ativa:
  - política DNS degradada
  - fallback público em uso
  - resolvedores ativos
  - escopo

### Arquivos alterados
- `backend-proxy/src/config/env.ts`
- `backend-proxy/src/routes/blocking-release-routes.ts`
- `backend-proxy/src/server.ts`
- `backend-proxy/src/services/blocking-release-schema-service.ts`
- `backend-proxy/src/services/blocking-release-service.ts`
- `backend-proxy/src/services/dns-contingency-service.ts`
- `backend-proxy/src/services/policy-compiler-service.ts`
- `backend-proxy/src/services/proxy-engine-service.ts`
- `frontend/src/pages/BlockingReleases.jsx`

### Testes e evidências executadas
- runtime:

## Atualização 2026-04-16 — refatoração da UX de VLANs para listagem compacta operacional

### Problema corrigido
- a listagem principal de VLANs estava alta demais e poluída por cápsulas de regras liberadas e bloqueadas
- isso degradava fortemente a leitura em notebook 14" e também piorava a escaneabilidade em monitor compacto

### Direção aplicada
- a listagem principal migrou para um padrão de `card list` compacta
- cada item agora prioriza:
  - identidade da VLAN
  - descrição curta
  - estado operacional resumido
  - contagem de regras
  - contagem de VIPs
  - sinalização resumida de monitoramento e bloqueio
  - informações técnicas secundárias
  - ações principais

### O que saiu da listagem principal
- lista explícita de regras liberadas
- lista explícita de regras bloqueadas
- excesso de cápsulas coloridas
- ações destrutivas em destaque principal

### O que ficou na listagem principal
- `VLAN <id>`
- nome/setor
- descrição curta
- status resumido
- `N regra(s)`
- `N VIP(s)`
- resumo de monitoramento e bloqueio
- interface, subnet, DNS e última atividade em nível secundário
- ações principais:
  - `Editar escopo`
  - `Editar VLAN`

### Overflow de ações
- ações secundárias e destrutivas foram movidas para menu de overflow por item:
  - `Ver VIPs`
  - `Entrar no padrão` / `Desligar do padrão`
  - `Excluir VLAN`

### Detalhamento movido para o lugar correto
- o detalhamento operacional continua disponível em `Editar escopo`
- a tela principal deixa de tentar explicar toda a política por cápsulas e passa a mostrar apenas resumo quantitativo e estado

### Ajustes complementares no módulo
- a matriz operacional por VLAN na visão geral deixou de listar explicitamente todas as regras por cápsulas
- o resumo de VLANs dentro de `Escopos de políticas` também passou a mostrar contagens e estado, em vez de listas de liberações e bloqueios

### Arquivo frontend alterado nesta etapa
- `frontend/src/pages/BlockingReleases.jsx`

### Evidência executada
- `frontend`: `npm run build`

## Atualização 2026-04-16 — correção estrutural de altura e scroll do drawer de escopo

### Problema corrigido
- o drawer de `Editar escopo` podia cortar a parte inferior em viewports com menor altura útil
- isso comprometia principalmente notebooks, escondendo conteúdo e ações finais

### Ajuste estrutural aplicado
- `DialogShell` foi corrigido para operar com estrutura consistente por viewport:
  - container com `h-dvh`
  - painel com `min-h-0`
  - altura controlada por viewport
  - fullscreen no mobile
  - altura limitada com margens em telas maiores
- o drawer lateral agora usa:
  - header fixo
  - body central com scroll
  - footer sempre acessível

### Overflow corrigido
- removido o padrão de scroll duplicado entre wrapper do dialog e conteúdo interno
- `Editar escopo` passou a usar `bodyScrollable={false}` no shell
- o scroll vertical fica apenas na área central do drawer
- header e footer permanecem fora da área rolável

### Responsividade resultante
- mobile: fullscreen
- notebook: quase fullscreen com margens pequenas
- desktop: lateral com largura confortável e altura limitada pela viewport
- telas maiores: proporção controlada sem crescimento exagerado

### Arquivos frontend alterados nesta etapa
- `frontend/src/components/ui/primitives.jsx`
- `frontend/src/pages/BlockingReleases.jsx`

### Evidência executada
- `frontend`: `npm run build`

## Atualização 2026-04-16 — correção imediata do drawer de escopo

### Erro corrigido
- ao abrir `Editar escopo`, o frontend quebrava com:
  - `ReferenceError: cx is not defined`

### Causa
- o helper `cx` passou a ser usado dentro de `frontend/src/pages/BlockingReleases.jsx`
- porém ele não estava sendo importado/exportado no caminho consumido pelo módulo

### Correção aplicada
- exportado `cx` em `frontend/src/components/blocking/BlockingUi.jsx`
- importado `cx` em `frontend/src/pages/BlockingReleases.jsx`

### Arquivos alterados nesta correção
- `frontend/src/components/blocking/BlockingUi.jsx`
- `frontend/src/pages/BlockingReleases.jsx`

### Evidência executada
- `frontend`: `npm run build`

## Atualização 2026-04-16 — drawer lateral profissional para Editar escopo

### Refatoração principal
- `Editar escopo` deixou de ser um modal genérico e passou a operar como `side panel` lateral
- comportamento aplicado:
  - mobile: fullscreen
  - notebook: quase fullscreen
  - desktop: drawer lateral com largura controlada
  - telas grandes: limite de largura sem exagero

### Estrutura da nova experiência
- header fixo com:
  - nome do escopo
  - status operacional
  - resumo quantitativo
  - botão fechar
- toolbar fixa com:
  - busca
  - filtros `Todos`, `Liberados`, `Bloqueados`
  - contador de resultados e alterações
- corpo principal com lista compacta de regras
- área de impacto antes de salvar
- footer fixo com:
  - `Cancelar`
  - `Salvar Escopo`

### Lista compacta de regras
- a edição agora usa linhas compactas em vez de cards pesados
- cada item mostra:
  - switch operacional
  - nome da política/regra
  - status da regra
  - descrição curta
  - contagem de domínios
  - escopo da política
- o item alterado recebe destaque visual
- cada alteração pode ser desfeita individualmente antes de salvar

### Agrupamento
- as regras são agrupadas logicamente por tipo:
  - `Liberados`
  - `Bloqueados`

### Impacto antes do salvamento
- o drawer agora mostra:
  - quantas regras foram alteradas
  - quantas regras liberadas ficam aplicadas
  - quantas regras bloqueadas ficam aplicadas
  - quais itens mudaram localmente antes da persistência

### Microinterações e loading
- skeleton compacto ao abrir o drawer
- transições mais suaves no toggle
- destaque imediato de item alterado
- busca com `deferred value` para reduzir ruído de digitação

### Acessibilidade e teclado
- foco inicial direcionado para o drawer
- suporte a `ESC` para fechar
- trap simples de foco com `Tab`/`Shift+Tab` dentro do painel
- switches expostos com `role="switch"` e `aria-checked`

### Infraestrutura alterada
- `DialogShell` passou a suportar:
  - alinhamento lateral
  - conteúdo extra no header
  - foco inicial automático
  - trap de foco básico

### Arquivos frontend alterados nesta etapa
- `frontend/src/components/ui/primitives.jsx`
- `frontend/src/pages/BlockingReleases.jsx`

### Evidência executada
- `frontend`: `npm run build`

## Atualização 2026-04-16 — UX operacional avançada para VLANs e escopo

### Evolução da listagem principal
- a listagem principal de VLANs foi consolidada como visão resumida e escaneável
- cada item agora prioriza:
  - identidade da VLAN
  - setor / descrição curta
  - estado operacional resumido
  - contagem de regras
  - contagem de VIPs
  - monitoramento e bloqueio em formato sintético
  - dados técnicos secundários
  - ações principais

### Detalhe movido para o lugar correto
- `Editar escopo` deixou de ser um modal pequeno e passou a funcionar como experiência lateral ampla
- nessa experiência ficam concentrados:
  - regras liberadas
  - regras bloqueadas
  - políticas herdadas do global
  - busca por política / domínio
  - resumo de impacto antes de salvar

### Busca e filtros de VLANs
- nova busca textual na aba `VLANs`
- novos filtros operacionais:
  - no padrão / fora do padrão
  - com VIP / sem VIP
  - monitoramento on/off
  - bloqueio on/off
  - estado operacional
- contadores da listagem passam a refletir o conjunto filtrado

### Ações principais e overflow
- ações visíveis na linha principal:
  - `Editar escopo`
  - `Editar VLAN`
- ações secundárias e destrutivas foram agrupadas em overflow:
  - `Ver VIPs`
  - `Entrar no padrão` / `Desligar do padrão`
  - `Excluir VLAN`

### Confirmações mais seguras
- ações sensíveis agora exibem impacto antes da confirmação:
  - desligar VLAN do padrão
  - excluir VLAN
- o resumo informa quantidade de regras visíveis, efeito sobre leitura operacional e relação com VIPs / monitoramento

### Estados e feedback
- loading de listagem ganhou skeleton compacto
- empty state da aba `VLANs` diferencia:
  - sem VLAN cadastrada
  - nenhum resultado encontrado com os filtros atuais
- edição de escopo ganhou painel de impacto para leitura rápida antes de salvar

### Responsividade e densidade
- a busca, os filtros e a lista principal foram reorganizados para manter boa operação em notebook 14"
- a densidade continua compacta em monitores menores sem degradar desktop maior

### Arquivos frontend alterados nesta etapa
- `frontend/src/components/ui/primitives.jsx`
- `frontend/src/pages/BlockingReleases.jsx`

### Evidência executada
- `frontend`: `npm run build`
  - `unbound-checkconf`: ok
  - `squid -k parse`: ok
  - `systemctl is-active unbound`: `active`
  - `systemctl is-active squid`: `active`
  - `systemctl is-active postgresql`: `active`
- rede:
  - `ss -ltnp | rg ':3128|:3129|:3130'`: apenas `3129`
  - `iptables -t nat -S | rg 'REDIRECT|3128|3130'`: sem residual
- enforcement real por VLAN com `dig` e IP de origem temporário por subnet:
  - VLAN 10 `facebook.com`: `NXDOMAIN`
  - VLAN 50 `facebook.com`: `NXDOMAIN`
  - VLAN 30 `facebook.com`: `NOERROR`
  - VLAN 70 `facebook.com`: `NOERROR`
  - VLAN 70 `gov.br`: `NOERROR`
  - VLAN 70 `bb.com.br`: `NOERROR`
  - VLAN 30 `pornhub.com`: `NXDOMAIN`
  - VLAN 40 `pornhub.com`: `NXDOMAIN`
  - VLAN 80 `pornhub.com`: `NXDOMAIN`
  - VLAN 99 `facebook.com`: `NOERROR`, sem política ativa por VLAN
- contingência DNS:
  - ativação global testada com os 6 resolvedores autorizados
  - teste dos resolvedores: `6/6` ok
  - ativação por VLAN testada para VLAN 30 com Cloudflare apenas
  - expiração forçada validada via reconciler
  - retorno ao modo normal validado
  - auditoria dedicada confirmou `activate`, `expired` e `deactivate`
- build:
  - `backend-proxy`: ok
  - `frontend`: ok

### Riscos remanescentes reais
- a aba atual foi reestruturada e reestilizada, mas ainda carrega seções antigas internas de radar/relatórios que não ficaram mais expostas nas tabs principais; uma limpeza posterior pode reduzir complexidade do arquivo.
- a validação de contingência confirmou chain, escopo, resolvers, auditoria e expiração; não foi feita geração de tráfego cliente real para Internet passando pelo host durante a contingência, apenas inspeção do bloco ativo e dos testes de reachability dos resolvedores.

## Atualização 2026-04-15 — refatoração completa de UX/UI do módulo

### O que foi simplificado
- a experiência deixou de separar operação em telas de `Bloqueados` e `Liberados` cheias de colunas e passou a concentrar a operação humana em `Políticas`
- a tela principal agora responde primeiro:
  - modo atual
  - políticas globais ativas
  - VLANs com regra própria
  - VIPs ativos
  - contingência DNS
  - saúde do motor
- a hierarquia operacional ficou explícita na própria interface:
  - VIP
  - global
  - VLAN
  - contingência

### O que foi removido ou escondido
- tabelas longas com excesso de colunas técnicas
- artefatos, precedência interna e metadados de runtime espalhados na área principal
- uso de `prompt` para ações críticas
- repetição de status e blocos redundantes entre visão geral, VLANs e exceções
- detalhes técnicos foram concentrados apenas em `Motor & Saúde` e na parte auditável de `Contingência DNS`

### Nova estrutura do módulo
- `Visão Geral`
  - leitura executiva do estado do módulo
- `Políticas`
  - operação principal por categoria e escopo
- `VLANs`
  - resumo enxuto por VLAN com ação rápida
- `Exceções / VIPs`
  - área explícita de exceções administrativas fortes
- `Motor & Saúde`
  - serviços, drift, integridade e ações operacionais
- `Contingência DNS`
  - ativação, renovação, resumo e auditoria
- `Métricas`
  - listas limpas de domínios, IPs e VLANs mais acionados
- `Auditoria`
  - timeline simples de eventos

### Tema global respeitado
- a nova interface usa superfícies baseadas em tokens globais:
  - `bg-surface`
  - `bg-container`
  - `text-on-surface`
  - `border-outline`
  - `primary`
- o módulo não fixa mais um dark theme próprio
- cards, listas, badges, overlays, modais e banners acompanham automaticamente o tema global definido em `data-theme`
- o resultado visual ficou integrado ao restante do sistema, sem aparência de tela isolada

### Exceções evoluíram para área de VIPs
- a antiga semântica ambígua de exceção foi substituída por semântica explícita de VIP
- a UI comunica de forma direta que:
  - IP cadastrado em Exceções é VIP
  - VIP recebe bypass total
  - VIP recebe bypass DNS
  - VIP pode usar qualquer DNS configurado manualmente no host
  - VIP fica fora da política comum
- o fluxo de criação ficou curto:
  - IP
  - descrição
  - motivo
  - salvar
- o impacto do VIP aparece visualmente por badges:
  - `VIP`
  - `bypass total`
  - `DNS livre`
  - `fora da política comum`
  - `ativo` ou `inativo`

### Ações que ficaram mais rápidas
- editar política global por categoria em fluxo direto
- abrir uma VLAN e ajustar o escopo em uma única modal
- criar VIP sem formulário burocrático
- ativar ou renovar contingência DNS em modal curta
- acessar apply e rollback sem sair da visão principal do módulo

### Decisões de UX adotadas
- menos cards, mas com função clara
- menos densidade visual nas listas
- uso de badges semânticos em vez de textos repetitivos
- foco em ação e estado, não em estrutura técnica de banco
- organização por fluxo humano, tomando `QoS de Redes & IP` como referência de clareza

### Arquivos alterados nesta etapa
- `frontend/src/pages/BlockingReleases.jsx`
- `frontend/src/components/blocking/BlockingUi.jsx`

### Validação executada nesta etapa
- build do frontend:
  - `npm run build`: ok
- coerência visual:
  - a tela passou a usar somente tokens globais de tema
- semântica funcional exposta na UI:
  - VIP = bypass total
  - VIP = bypass DNS
  - VIP = liberdade de DNS manual no host

## Atualização 2026-04-15 — continuação funcional e saneamento de runtime

### O que foi preservado da rodada anterior
- a estrutura em 8 abas foi mantida
- o uso do tema global foi preservado
- a hierarquia visual nova foi mantida
- a base visual de `Visão Geral`, `Políticas`, `VLANs`, `Exceções / VIPs`, `Motor & Saúde`, `Contingência DNS`, `Métricas` e `Auditoria` foi mantida
- a remodelação de `Exceções` como área de `VIPs` foi preservada e refinada, não descartada

### O que foi ajustado nesta rodada
- o escopo real do módulo foi saneado para operar apenas sobre:
  - VLAN 10
  - VLAN 30
  - VLAN 50
  - VLAN 70
- VLAN 40, 80 e 99 saíram do contexto do produto:
  - UI
  - overview
  - listas
  - filtros
  - métricas
  - políticas
  - contingência
  - hints
  - cards
  - auditoria exposta
- a baseline funcional foi corrigida para:
  - VLAN 10 bloquear `redes_sociais` e `pornografia`
  - VLAN 10 liberar `governo`, `bancos` e `sites_google`
  - VLAN 50 seguir a mesma política da VLAN 10
  - VLAN 30 liberar `redes_sociais` e bloquear `pornografia`
  - VLAN 70 liberar `redes_sociais`, `governo` e `bancos`, com `pornografia` bloqueada
- a liberação global ficou explícita como `WhatsApp`
- `Sites Google` passou a existir como categoria operacional própria

### Correções de backend e runtime
- foi criado um escopo central de VLANs gerenciadas com:
  - lista oficial das VLANs do módulo
  - mapeamento de DNS interno por VLAN
  - helpers para IP, VLAN e filtros de escopo
- `listVlans`, `overview`, `metrics`, `audit`, `exceptions` e demais leituras públicas agora filtram o escopo gerenciado
- o compilador de políticas passou a gerar artefatos e tags apenas para VLAN 10, 30, 50 e 70
- políticas globais agora são taggeadas apenas para as VLANs operacionais do módulo
- o Squid complementar passou a aplicar `proxy_whitelist` e `proxy_blocklist` somente aos clientes do módulo, sem vazar a VLAN 40/80
- o modo do motor voltou a expor e operar com:
  - `ACL`
  - `ACL + DNS`
  - `Interceptação Seletiva`
- `POST /api/bloqueios-liberacoes/mode` passou a aplicar o modo no runtime real, e não apenas salvar no banco

### Semântica correta de DNS interno por VLAN
- o módulo passou a tratar como DNS interno válido:
  - VLAN 10 -> `192.168.10.1`
  - VLAN 30 -> `192.168.30.1`
  - VLAN 50 -> `192.168.50.1`
  - VLAN 70 -> `192.168.70.1`
- essa informação passou a existir no payload de status do módulo
- a UI passou a exibir isso explicitamente
- as regras de interceptação deixaram de presumir um único gateway fixo para todo o módulo

### Correção funcional de VIPs
- `Exceções` passou a gravar semanticamente como `vip`
- `upsertException` força `bypass_total = true` para IPs válidos no escopo do módulo
- VIP ativo agora sincroniza:
  - `policy_exceptions`

## Atualização 2026-04-15 — políticas nomeadas, auditoria operacional e PDF

### Políticas viraram CRUD real
- a aba `Políticas` deixou de depender apenas da matriz categórica e passou a expor um gerenciador real de políticas nomeadas
- novo fluxo principal:
  - `Nova Política`
  - nome da política
  - tipo: `Liberar` ou `Bloquear`
  - domínios
  - escopo: `Global` ou `VLAN(s)`
  - descrição/motivo
  - ativa/inativa
- ações disponíveis:
  - criar
  - editar
  - duplicar
  - ativar/inativar
  - excluir
  - buscar
  - filtrar por tipo, escopo e status
- domínios agora podem ser colados em lote, deduplicados e validados antes de salvar
- a matriz de categorias foi preservada como atalho operacional, mas domínio arbitrário passa pelo CRUD novo

### Nova modelagem de políticas nomeadas
- novas tabelas:
  - `domain_policies`
  - `domain_policy_entries`
  - `domain_policy_audit_logs`
- colunas de compatibilidade adicionadas:
  - `blocking_policies.domain_policy_id`
  - `release_policies.domain_policy_id`
  - `release_policies.origin_rule`
- cada política nomeada sincroniza automaticamente para as tabelas legadas usadas pelo compilador:
  - `allow` -> `release_policies`
  - `block` -> `blocking_policies`
- o `PolicyCompilerService` continua sendo o caminho único de geração de ACL/RPZ
- não foi criado motor paralelo
- escopo gerenciado continua limitado a VLAN 10, 30, 50 e 70

### Rotas novas
- `GET /api/bloqueios-liberacoes/domain-policies`
- `GET /api/bloqueios-liberacoes/domain-policies/:id`
- `POST /api/bloqueios-liberacoes/domain-policies`
- `PATCH /api/bloqueios-liberacoes/domain-policies/:id`
- `POST /api/bloqueios-liberacoes/domain-policies/:id/duplicate`
- `POST /api/bloqueios-liberacoes/domain-policies/:id/toggle`
- `DELETE /api/bloqueios-liberacoes/domain-policies/:id`
- `GET /api/bloqueios-liberacoes/audit/events`
- `GET /api/bloqueios-liberacoes/audit/export.pdf`

### Auditoria operacional por IP, hostname e domínio
- novo serviço:
  - `backend-proxy/src/services/blocking-audit-service.ts`
- a auditoria operacional consolida:
  - `dns_policy_events`
  - `proxy_policy_events`
  - políticas nomeadas
  - políticas legadas sincronizadas
  - VIPs/exceções
  - VLANs gerenciadas
- filtros suportados:
  - período
  - IP
  - hostname
  - domínio
  - VLAN
  - ação
  - origem DNS/Squid
  - política
  - categoria
- cada evento tenta exibir:
  - data/hora
  - IP
  - hostname
  - VLAN
  - domínio
  - `blocked`, `allowed` ou `bypassed`
  - política aplicada
  - origem
  - tempo no domínio
- hostname é enriquecido por:
  - `/var/lib/dhcp/dhcpd.leases`
  - DNS reverso quando DHCP não resolve
  - fallback explícito: `hostname não identificado`

### Tempo no domínio
- a duração é calculada por janela de atividade entre eventos consecutivos do mesmo IP/domínio
- limite de correlação adotado:
  - até 30 minutos entre eventos consecutivos
- o campo é marcado como:
  - `estimated` quando há janela de atividade
  - `unavailable` quando não há base suficiente
- DNS puro não recebe precisão falsa
- a UI mostra a duração como estimada ou indisponível

### PDF profissional de auditoria
- dependências adicionadas ao `backend-proxy`:
  - `pdfkit`
  - `@types/pdfkit`
- exportação server-side em:
  - `GET /api/bloqueios-liberacoes/audit/export.pdf`
- o PDF inclui:
  - cabeçalho com identidade do sistema
  - título do relatório
  - filtros aplicados
  - resumo executivo
  - estatísticas principais
  - tabela de eventos
  - paginação
  - rodapé com data de geração
- a UI passou a ter botão:
  - `Exportar PDF`

### UX/UI refinada
- `frontend/src/pages/BlockingReleases.jsx` foi preservado como base visual e evoluído
- nova ordem das abas:
  - Visão Geral
  - Políticas
  - VLANs
  - Exceções / VIPs
  - Auditoria
  - Motor & Saúde
  - Contingência DNS
  - Métricas
- a aba `Políticas` agora prioriza políticas nomeadas com lista limpa, chips e ações diretas
- a aba `Auditoria` passou a suportar o caso `Ponto RH`:
  - buscar por IP ou hostname
  - ver domínios tentados
  - identificar block/pass
  - ver política aplicada
  - criar liberação a partir de domínio bloqueado
  - exportar PDF

### Arquivos alterados nesta etapa
- `backend-proxy/package.json`
- `backend-proxy/package-lock.json`
- `backend-proxy/src/routes/blocking-release-routes.ts`
- `backend-proxy/src/services/blocking-release-schema-service.ts`
- `backend-proxy/src/services/blocking-audit-service.ts`
- `backend-proxy/src/services/domain-policy-manager-service.ts`
- `frontend/src/pages/BlockingReleases.jsx`
- `backend-proxy/docs/BLOQUEIOS_LIBERACOES_PRODUCAO.md`

### Validações executadas
- build backend:
  - `cd backend-proxy && npm run build`: ok
- build frontend:
  - `cd frontend && npm run build`: ok
- consulta real dos serviços novos:
  - `domainPolicyManagerService.list({})`: ok
  - `blockingAuditService.listEvents({ period: '24h', limit: 5 })`: ok
- CRUD real validado com política temporária:
  - criar: ok
  - editar domínios: ok
  - duplicar: ok
  - ativar/inativar: ok
  - excluir política original e duplicada: ok
  - limpeza final: ok
- PDF validado em memória:
  - `blockingAuditService.exportPdf({ period: '24h', limit: 20 })`: ok
  - assinatura `%PDF-`: ok
- runtime sem reaplicar regras:
  - `unbound-checkconf`: ok
  - `squid -k parse`: ok
  - `systemctl is-active unbound squid postgresql`: `active`, `active`, `active`
- processo backend-proxy:
  - `dist/server.js` reiniciado pelo PM2 após encerramento do processo antigo
  - porta `6779` voltou em escuta
  - rota protegida respondeu `401` sem token, confirmando API HTTPS ativa

### Pendências reais
- a exclusão pela UI ainda é ação direta; uma confirmação visual dedicada pode reduzir risco operacional.
- a duração no domínio é estimada por correlação de eventos, não uma medição exata de sessão.
- hostname depende da qualidade dos leases DHCP e do DNS reverso interno.

### Continuação registrada da correção funcional de VIPs
- VIP ativo também sincroniza:
  - `dns_vip`
  - `proxy_vips`
  - `/etc/squid/acl/proxy_ip_bypass.acl`
  - RPZ `vip-bypass.conf`
- a chain `DNS_EMERGENCY_V8` passou a inserir `ACCEPT` por IP VIP antes dos `DROP` gerais de DNS externo
- isso corrige o problema em que a UI prometia `DNS livre`, mas o firewall ainda bloqueava o VIP em runtime

### Refinamento final de UX/UI
- a UI continuou usando o tema global sem tema fixo local
- `Políticas` e `VLANs` agora deixam explícito que o módulo só gerencia VLAN 10, 30, 50 e 70
- a categoria `Sites Google` entrou no fluxo operacional
- a categoria global foi simplificada para `WhatsApp`
- `Motor & Saúde` ganhou uma área própria para seleção clara dos 3 modos do motor
- `Visão Geral` e `Motor & Saúde` passaram a mostrar o DNS interno por VLAN de forma explícita
- a mensagem semântica principal de VIP ficou objetiva:
  - `IPs cadastrados em Exceções são VIPs e recebem bypass total, inclusive de DNS.`

### Testes executados
- build:
  - `backend-proxy`: ok
  - `frontend`: ok
- API real:
  - `status`: ok via HTTPS autenticado
  - `overview`: ok
  - `vlans`: ok com apenas VLAN 10, 30, 50 e 70
  - `exceptions`: ok
- matriz persistida:
  - `release_policies` conferido com:
    - `WhatsApp` global
    - `Bancos`, `Governo` e `Sites Google` em VLAN 10 e 50
    - `Redes Sociais` liberado em VLAN 30 e 70
  - `blocking_policies` conferido com:
    - `Pornografia` global
    - `Redes Sociais` bloqueado em VLAN 10 e 50
- modos do motor:
  - `ACL` validado
  - `ACL + DNS` validado
  - `Interceptação Seletiva` validado
- comportamento observado por modo:
  - `ACL` -> somente `3129`
  - `ACL + DNS` -> somente `3129`
  - `Interceptação Seletiva` -> `3128` e `3129`
- validação de resíduos:
  - sem `3128` fora do modo seletivo
  - sem `3130` fora do modo seletivo
  - chain `V8_PROXY_ENGINE` sem redirecionamento residual ativo
- VIP em runtime:
  - criado VIP técnico temporário `192.168.10.250`
  - `policyResolutionService` confirmou:
    - IP regular em `xvideos.com` -> `blocked`
    - IP VIP em `xvideos.com` -> `bypassed`
    - IP VIP em `maps.google.com` -> `bypassed`
  - arquivos reais regenerados:
    - `proxy_ip_bypass.acl`
    - `vip-bypass.conf`
  - firewall real carregado com `ACCEPT` TCP/UDP 53 para o IP VIP antes dos `DROP`
  - VIP técnico removido ao fim da validação

### Resultados
- o módulo voltou a operar com a matriz correta
- o motor voltou a expor os 3 modos obrigatórios
- a UI continua melhor que a rodada anterior e agora reflete melhor o runtime
- o escopo do produto ficou limpo e coerente
- VIP deixou de ser apenas promessa visual e passou a afetar runtime, RPZ, proxy bypass e firewall

### Pendências reais
- a validação E2E de DNS externo manual a partir de um cliente encaminhado pela própria VLAN não pôde ser reproduzida nesta máquina sem mover o gateway da interface, porque este host é o próprio gateway `192.168.x.1` das VLANs operacionais
- mesmo assim, a correção foi validada em runtime por:
  - sincronização do VIP em `policy_exceptions`, `dns_vip` e `proxy_vips`
  - regeneração real de `vip-bypass.conf`
  - geração e carga real da chain `DNS_EMERGENCY_V8` com `ACCEPT` para TCP/UDP 53 do IP VIP
  - resolução de política em runtime retornando `bypassed` para o IP VIP

## Atualização 2026-04-15 — fechamento de coerência entre código, payload e runtime

### O que foi preservado
- a base visual nova em abas foi mantida
- os componentes semânticos de superfície, badges e cards foram mantidos
- a aba `Exceções / VIPs` continuou como área de VIPs
- o uso do tema global foi preservado
- a organização geral herdada da rodada anterior não foi refeita do zero

### O que foi ajustado
- o backend público passou a filtrar políticas apenas em escopo:
  - `global`
  - VLAN `10`
  - VLAN `30`
  - VLAN `50`
  - VLAN `70`
- operações de produto agora rejeitam explicitamente VLAN fora do módulo em:
  - políticas por VLAN
  - edição de VLAN
  - toggle de VLAN
  - filtros de exceções
  - criação/edição de VIP
- o payload de status passou a expor `managed_vlan_ids` no estado público do módulo
- a UI ganhou leitura mais explícita de:
  - 3 modos do motor
  - matriz operacional por VLAN
  - sincronização real de runtime para VIP

### O que foi removido do fluxo de produto
- o backend do produto deixou de contar políticas fora do escopo em:
  - overview
  - contagens de políticas ativas
  - contagem de exceções
  - contagem de VLANs isentas
- VLAN `40`, `80` e `99` continuam podendo existir por compatibilidade de banco, mas não entram mais nas leituras públicas do módulo

### O que foi refeito
- a sincronização de VIP deixou de depender apenas de apply posterior
- salvar ou remover VIP agora dispara imediatamente:
  - recompilação do policy compiler no modo atual
  - reload validado do Unbound
  - regravação imediata da chain `DNS_EMERGENCY_V8`
- a operação deixa de falhar silenciosamente:
  - se reload do Unbound ou atualização do firewall falhar, a operação de VIP falha

### Arquivos alterados nesta continuação
- `backend-proxy/src/services/blocking-release-service.ts`
- `frontend/src/pages/BlockingReleases.jsx`
- `backend-proxy/docs/BLOQUEIOS_LIBERACOES_PRODUCAO.md`

### Validação executada nesta continuação
- build:
  - `backend-proxy`: `npm run build` ok
  - `frontend`: `npm run build` ok
- API viva existente em `6779`:
  - `status`: respondeu autenticado
  - `vlans`: respondeu apenas com VLAN `10`, `30`, `50`, `70`
  - `exceptions`: respondeu apenas com VIPs do escopo do módulo
- instância temporária de validação:
  - `backend-proxy` levantado temporariamente em `https://127.0.0.1:6790`
  - `status` confirmou:
    - `available_modes` com `ACL`, `ACL + DNS`, `Interceptação Seletiva`
    - `managed_vlan_ids: [10,30,50,70]`
    - `internal_dns_by_vlan` com `192.168.10.1`, `192.168.30.1`, `192.168.50.1`, `192.168.70.1`
  - `vlans` confirmou novamente apenas VLAN `10`, `30`, `50`, `70`
  - `blocklist` da instância temporária não retornou escopos de VLAN `40`, `80` ou `99`
- VIP técnico temporário para validação:
  - criado IP `192.168.30.250`
  - validado imediatamente em:
    - `/etc/squid/acl/proxy_ip_bypass.acl`
    - `/etc/unbound/becker/vip-bypass.conf`
    - `/etc/ufw/before.rules`
  - evidências reais:
    - `proxy_ip_bypass.acl` passou a conter `192.168.30.250`
    - `vip-bypass.conf` passou a conter `32.250.30.168.192.rpz-client-ip CNAME rpz-passthru.`
    - `before.rules` passou a conter `ACCEPT` TCP/UDP `53` para `192.168.30.250` antes dos `DROP`
  - VIP técnico removido ao fim da validação e confirmado ausente depois
- runtime de portas e NAT:
  - `ss -ltnp | rg ':3128|:3129|:3130'`: apenas `3129` em escuta
  - `iptables-save -t nat | rg 'REDIRECT|3128|3130'`: sem residual

### Resultado objetivo desta continuação
- o código agora impede escopo de produto fora de VLAN `10`, `30`, `50`, `70`
- o payload novo do módulo reflete esse escopo explicitamente
- VIP deixou de depender de apply manual para afetar RPZ, proxy bypass e firewall DNS
- a UI preservou a melhoria visual anterior e ganhou leitura mais curta e mais fiel ao runtime

### Pendência real remanescente
- não foi feito flip destrutivo do serviço produtivo em `6779` durante esta rodada; a validação do código novo foi feita por build e por instância temporária autenticada em `6790`, justamente para validar o runtime novo sem derrubar o processo em produção

## Atualização 2026-04-15 — implementação final do CRUD de políticas e auditoria PDF

### Entrega desta rodada
- a aba `Políticas` passou a ter CRUD real de políticas nomeadas por domínio
- políticas suportam `Liberar` e `Bloquear`, escopo `Global` ou `VLAN(s)`, descrição, status e múltiplos domínios
- domínios arbitrários são sincronizados para `release_policies` ou `blocking_policies`, mantendo o `PolicyCompilerService` como motor único de ACL/RPZ
- a aba `Auditoria` passou a investigar por IP, hostname, domínio, VLAN, ação, origem e política aplicada
- a auditoria exporta PDF server-side com resumo executivo, filtros, estatísticas, tabela, paginação e rodapé
- a UI preservou a base visual anterior e reposicionou `Auditoria` antes de `Motor & Saúde`

### Modelagem e rotas adicionadas
- tabelas:
  - `domain_policies`
  - `domain_policy_entries`
  - `domain_policy_audit_logs`
- vínculo legado:
  - `blocking_policies.domain_policy_id`
  - `release_policies.domain_policy_id`
  - `release_policies.origin_rule`
- rotas principais:
  - `/api/bloqueios-liberacoes/domain-policies`
  - `/api/bloqueios-liberacoes/audit/events`
  - `/api/bloqueios-liberacoes/audit/export.pdf`

### Validação executada nesta entrega
- `backend-proxy`: `npm run build` ok
- `frontend`: `npm run build` ok
- CRUD temporário validado e limpo:
  - criar
  - editar domínios
  - duplicar
  - ativar/inativar
  - excluir
- auditoria operacional retornou eventos reais de DNS/Squid
- PDF gerado em memória com assinatura `%PDF-`
- runtime sem reaplicar regras:
  - `unbound-checkconf`: ok
  - `squid -k parse`: ok
  - `systemctl is-active unbound squid postgresql`: `active`, `active`, `active`

### Pendências reais
- exclusão de política na UI ainda é ação direta; uma confirmação visual dedicada é recomendável
- duração no domínio é estimada por correlação de eventos e não deve ser tratada como medição exata
- hostname depende de DHCP leases e DNS reverso; quando não houver fonte confiável, a UI mostra `hostname não identificado`

## Hotfix 2026-04-15 — aba VLANs sem renderizar

### Causa
- a aba `VLANs` dependia do payload crítico `GET /api/bloqueios-liberacoes/vlans`
- `listVlans()` chamava `syncTelemetry()` antes de consultar `vlan_policies`
- em produção, a importação de telemetria podia passar do timeout de 9s da UI
- quando o timeout estourava, o frontend usava fallback `[]`, deixando a aba sem linhas

### Correção
- `listVlans()` deixou de bloquear a resposta com `syncTelemetry()`
- a rota agora consulta diretamente `vlan_policies` + agregados já indexados em `access_events`
- a telemetria continua disponível pelas rotinas próprias de métricas, overview e reindexação

### Validação
- build backend:
  - `npm run build`: ok
- chamada interna:
  - `blockingReleaseService.listVlans()`: retornou VLAN `10`, `30`, `50`, `70`
- chamada HTTPS real autenticada em `6779`:
  - `GET /api/bloqueios-liberacoes/vlans`: retornou as 4 VLANs em cerca de 2,9s
- processo `backend-proxy/dist/server.js` reiniciado e porta `6779` ativa

## Atualização 2026-04-15 — edição e exclusão de Categorias rápidas

### Entrega
- as categorias rápidas passaram a ter poder administrativo direto:
  - `Pornografia`
  - `Bancos`
  - `WhatsApp`
  - `Governo`
  - `Sites Google`
  - `Redes Sociais`
- cada categoria global agora pode ser:
  - bloqueada
  - liberada
  - excluída do escopo
  - editada com nova lista de domínios
  - excluída pela ação dedicada
- a edição da categoria atualiza as políticas efetivas em `blocking_policies` ou `release_policies`
- a exclusão remove a categoria do escopo global em ambas as listas efetivas
- após editar ou excluir, a UI executa `apply` para refletir no runtime

### Backend
- novas rotas:
  - `PUT /api/bloqueios-liberacoes/category-policies`
  - `DELETE /api/bloqueios-liberacoes/category-policies`
- novos métodos:
  - `updateCategoryPolicy`
  - `deleteCategoryPolicy`
- os métodos trabalham por categoria/aliases e escopo, removendo a versão anterior antes de recriar a lista editada

### Frontend
- `Categorias rápidas` ganhou botões por categoria:
  - `Editar política`
  - `Excluir`
  - `Excluir do escopo`
- nova modal:
  - tipo da política: `Liberar` ou `Bloquear`
  - lista editável de domínios
  - descrição/motivo

### Validação
- build backend:
  - `npm run build`: ok
- build frontend:
  - `npm run build`: ok
- validação temporária via serviço:
  - criar categoria fake: ok
  - editar por lista de domínios: ok
  - excluir categoria fake: ok
  - limpeza final confirmada
- validação HTTP real em `6779`:
  - `PUT /category-policies`: `200`
  - `DELETE /category-policies`: `200`
  - limpeza final de linhas temporárias confirmada
- `backend-proxy/dist/server.js` reiniciado e porta `6779` ativa

## Decisão Arquitetural Oficial — Unificação Segura de Bloqueios & Liberações com Proxy & Logs

### Decisão executiva
- `Bloqueios & Liberações` passa a ser o módulo operacional principal do produto.
- `Proxy & Logs` continua existindo, mas como módulo técnico e complementar.
- enforcement oficial:
  - `Unbound/RPZ` = enforcement principal
  - `Squid explícito` = enforcement complementar
  - `Proxy & Logs` não é dono de política
  - `Bloqueios & Liberações` é dono de política
  - `Proxy & Logs` é fonte técnica de telemetria, evidência e diagnóstico

### Regra obrigatória de ownership
- regra principal:
  - um módulo escreve
  - vários módulos podem ler
- ownership oficial:
  - quem escreve políticas: `Bloqueios & Liberações`
  - quem compila runtime: `Policy/Runtime Engine`
  - quem aplica RPZ/ACL/firewall: `Runtime Engine`
  - quem escreve eventos DNS: `DNS telemetry / DNS radar ingester`
  - quem escreve eventos proxy: `Proxy / radar ingester`
  - quem consolida auditoria: `Bloqueios & Liberações`
  - quem mostra diagnóstico técnico do proxy: `Proxy & Logs`

### Erros de arquitetura proibidos
- fundir as duas telas em uma tela gigante
- apagar `Proxy & Logs` agora
- deixar dois módulos escreverem nos mesmos artefatos sem coordenação
- deixar código legado sobrescrever RPZ/ACL principal
- transformar radar em relatório histórico apenas
- misturar política, telemetria e diagnóstico no mesmo fluxo de edição
- colocar ownership de política no `Proxy & Logs`

### Estratégia oficial de unificação
- Fase 1: unificar ownership
  - `Bloqueios & Liberações` = dono de políticas
  - `Proxy & Logs` = dono da telemetria/proxy técnico
- Fase 2: unificar contratos
  - runtime status
  - health status
  - audit events
  - radar em tempo real
  - proxy health
  - dns health
  - unified events
- Fase 3: unificar eventos
  - criar `unified_access_events` ou equivalente
  - juntar DNS + proxy + política + VLAN + IP + ação + categoria + origem
  - preservar ingestão existente
- Fase 4: unificar experiência
  - mover a experiência principal para `Bloqueios & Liberações`
  - incluir políticas, VLANs, VIPs, auditoria, radar, saúde, contingência e PDF
- Fase 5: manter `Proxy & Logs` técnico
  - saúde do Squid
  - logs brutos
  - SARG
  - certificado
  - ingestores
  - diagnóstico fino

### Regra para radar em tempo real
- o radar atual deve ser preservado.
- o radar não pode virar apenas relatório histórico.
- o radar deve ser consumido também por `Bloqueios & Liberações`.
- o radar unificado deve mostrar:
  - IP
  - VLAN
  - hostname
  - domínio
  - ação
  - política
  - source = DNS ou Proxy

### Source of truth oficial
- fonte principal de políticas:
  - `domain_policies`
  - `domain_policy_entries`
  - `policy_exceptions`
  - `vlan_policies`
  - `policy_engine_state`
- compatibilidade operacional temporária:
  - `blocking_policies`
  - `release_policies`
  - `proxy_whitelist`
  - `proxy_blocklist`
  - `dns_vip`
  - `proxy_vips`
- estruturas legadas devem ser tratadas como espelho controlado, não como fonte principal.

### Arquitetura final desejada
- `Bloqueios & Liberações`:
  - operação principal
  - políticas
  - VLANs
  - VIPs
  - auditoria
  - radar
  - saúde
  - contingência
  - PDF/relatórios
- `Proxy & Logs`:
  - infraestrutura técnica do proxy
  - saúde do Squid
  - logs brutos
  - SARG
  - ingestão
  - diagnóstico fino
- motores internos:
  - `Policy Engine` = resolve política e precedência
  - `Runtime Engine` = compila e aplica
  - `Telemetry Engine` = consolida eventos DNS + proxy

### Meta oficial
- `Bloqueios & Liberações` será o módulo operacional unificado.
- `Proxy & Logs` continuará existindo como subsistema técnico de telemetria, logs e diagnóstico.
- a evolução deve preservar:
  - estabilidade
  - radar em tempo real
  - logs
  - evidência
  - rastreabilidade
  - compatibilidade
  - segurança de rollout

## Atualização 2026-04-15 - Construção da camada unificada de radar em tempo real

### Objetivo implementado
- iniciar a unificação segura entre `Bloqueios & Liberações` e `Proxy & Logs`.
- promover `Bloqueios & Liberações` como painel operacional principal.
- preservar `Proxy & Logs` como subsistema técnico de telemetria, logs, Squid, SARG e diagnóstico fino.
- preservar o radar em tempo real, sem transformar a funcionalidade em relatório histórico.

### Visão unificada de eventos
- criada a view SQL `unified_access_events`.
- a view consolida eventos de:
  - `dns_policy_events`
  - `proxy_policy_events`
- a view normaliza os campos operacionais:
  - `source`
  - `event_uid`
  - `occurred_at`
  - `client_ip`
  - `vlan_id`
  - `vlan_label`
  - `domain`
  - `url_or_host`
  - `action`
  - `policy_source`
  - `category`
  - `rule_id`
  - `matched_rule`
  - `source_detail`
  - `policy_label`
- a camada consulta políticas legadas e políticas nomeadas sem mudar ownership:
  - `blocking_policies`
  - `release_policies`
  - `domain_policies`

### Ownership preservado
- `Bloqueios & Liberações` passa a consumir o radar unificado como painel operacional.
- `Proxy & Logs` continua alimentando a telemetria de proxy.
- os ingestores existentes não foram substituídos.
- nenhuma escrita de política foi movida para `Proxy & Logs`.
- a view `unified_access_events` é uma camada de leitura e compatibilidade.

### Backend implementado
- serviço de auditoria passou a usar `unified_access_events` como base comum.
- criado método de radar em tempo real:
  - `blockingAuditService.getRealtimeRadar(filters)`
- criada rota:
  - `GET /api/bloqueios-liberacoes/radar/realtime`
- filtros suportados:
  - janela em minutos
  - ação
  - origem (`DNS`, `Proxy` ou todas)
  - VLAN
  - busca por IP, hostname, domínio, política ou origem
  - limite de eventos
- enriquecimento de hostname preservado via resolução já usada pela auditoria.

### Frontend implementado
- criada a aba `Radar em Tempo Real` dentro de `Bloqueios & Liberações`.
- a aba consome a rota unificada do backend.
- atualização automática a cada 5 segundos quando a aba está ativa.
- filtros operacionais:
  - busca livre
  - janela de tempo
  - ação
  - origem
  - VLAN
- resumo operacional exibido:
  - total de eventos
  - eventos DNS
  - eventos Proxy
  - bloqueados
  - permitidos
  - bypass
  - IPs únicos
  - domínios únicos
  - último evento
- cada evento mostra:
  - IP
  - hostname
  - VLAN
  - domínio
  - ação
  - política
  - origem DNS/Proxy
  - horário
  - detalhe da fonte
- ações operacionais:
  - investigar evento na aba `Auditoria`
  - liberar domínio bloqueado criando política de liberação

### Relação com Proxy & Logs
- `Proxy & Logs` continua sendo módulo técnico.
- `Proxy & Logs` mantém logs brutos, saúde do Squid, SARG e ingestores.
- `Bloqueios & Liberações` agora consome eventos de proxy e DNS como observabilidade operacional.
- a política continua pertencendo a `Bloqueios & Liberações`.
- o enforcement continua sob responsabilidade do motor de runtime/política.

### Validação realizada
- build backend executado com sucesso:
  - `cd backend-proxy && npm run build`
- build frontend executado com sucesso:
  - `cd frontend && npm run build`
- schema validado com criação/atualização da view `unified_access_events`.
- consulta direta validou eventos recentes na view.
- serviço `blockingAuditService.getRealtimeRadar({ window_minutes: 10, limit: 5 })` retornou eventos e resumo.
- rota HTTPS autenticada validada:
  - `GET /api/bloqueios-liberacoes/radar/realtime?window_minutes=10&limit=5`
- resultado de validação observado:
  - eventos retornados: 5
  - origem DNS retornada: 5
  - bloqueados: 1
  - permitidos: 4
  - IPs únicos: 3
  - domínios únicos: 5
- backend reiniciado e confirmado escutando novamente na porta `6779`.

### Pendências reais
- ampliar correlação entre eventos DNS e proxy quando houver volume consistente de proxy no ambiente.
- criar indicadores específicos de saúde do ingestor proxy dentro da aba de radar.
- avaliar paginação ou virtualização caso o radar passe a operar com janelas maiores e alto volume.
- evoluir relatórios PDF para incluir a visão consolidada DNS + Proxy quando solicitado pela operação.

## Atualização 2026-04-15 - Migração de whitelists Governo e Bancos do Proxy & Logs

### Objetivo implementado
- copiar os domínios protegidos do `Proxy & Logs` para políticas oficiais do módulo `Bloqueios & Liberações`.
- manter `Proxy & Logs` como origem técnica/compatibilidade.
- manter `Bloqueios & Liberações` como dono operacional das políticas.

### Origem dos dados
- categoria protegida `Bancos` do `Proxy & Logs`.
- categoria protegida `Gov.br / Sensivel` do `Proxy & Logs`.
- ACLs operacionais já presentes no Squid:
  - `/etc/squid/acl/proxy_whitelist.acl`
  - `/etc/squid/splice_whitelist.acl`

### Destino oficial
- política nomeada `Bancos` em `domain_policies`.
- política nomeada `Governo` em `domain_policies`.
- ambas como:
  - `policy_type = allow`
  - `scope_type = global`
  - `scope_value = global`
  - `enabled = true`

### Resultado
- `Bancos` recebeu 19 domínios.
- `Governo` recebeu 22 domínios.
- os domínios foram gravados em `domain_policy_entries`.
- as políticas foram espelhadas para `release_policies` com `origin_rule = domain_policy:<id>`.
- foi registrado log de auditoria em `domain_policy_audit_logs`.

### Validação realizada
- consulta em `domain_policies` confirmou:
  - `Bancos`: 19 domínios.
  - `Governo`: 22 domínios.
- consulta em `release_policies` confirmou espelho global:
  - `Bancos`: 19 entradas globais.
  - `Governo`: 22 entradas globais.
- artefatos foram recompilados para:
  - `/etc/unbound/becker/allowed.rpz`
  - `/etc/squid/acl/proxy_whitelist.acl`
- `unbound-checkconf` retornou sem erros.
- `unbound.service` permaneceu ativo.
- segunda execução de apply retornou `no_op`, indicando artefatos convergentes.

### Observação técnica
- a linha `gas Tecnologia.com.br` encontrada em ACL legado não foi importada porque contém espaço e não é um domínio válido no modelo de políticas.

## Atualização 2026-04-15 - Unificação visual e técnica das políticas Bancos e Governo

### Correção aplicada
- `Bancos` e `Governo` não devem aparecer duplicados como política nomeada e categoria rápida ao mesmo tempo.
- a representação operacional única dessas duas listas passou a ser a política nomeada em `domain_policies`.
- a seção `Categorias rápidas` continua existindo para as demais categorias, mas oculta categorias que já foram promovidas para política nomeada ativa.

### Fonte oficial
- `Proxy & Logs` passou a ler categorias protegidas a partir de `domain_policies`.
- quando a base oficial existir, o fallback hardcoded do proxy não é usado como fonte principal.
- resposta da API técnica do proxy passou a indicar:
  - `source_of_truth = bloqueios-liberacoes`

### Resultado validado
- política `Bancos` consolidada com 19 domínios.
- política `Governo` consolidada com 22 domínios.
- `warsaw.com.br` foi restaurado na política `Bancos` por ser domínio válido presente na whitelist operacional anterior.
- rota validada:
  - `GET /api/proxy/whitelist`
- retorno observado:
  - `Bancos`: 19 domínios, origem `bloqueios-liberacoes`
  - `Governo`: 22 domínios, origem `bloqueios-liberacoes`
  - total: 41 domínios

### Validação técnica
- build backend executado com sucesso.
- build frontend executado com sucesso.
- backend reiniciado na porta `6779`.
- runtime reaplicado com sucesso.
- `unbound-checkconf` sem erros.
- `unbound.service` ativo.

## Atualização 2026-04-15 - Limpeza do Proxy & Logs como módulo técnico

### Decisão aplicada
- `Proxy & Logs` deixou de apresentar fluxos operacionais de política.
- políticas, bloqueios, liberações e VIPs ficam somente em `Bloqueios & Liberações`.
- `Proxy & Logs` permanece como módulo técnico de:
  - radar técnico
  - logs brutos
  - SARG
  - certificado do proxy
  - saúde do Squid
  - controle técnico do motor do proxy

### Remoção de confusão na UI
- removidas da navegação do `Proxy & Logs`:
  - `Regras`
  - `Whitelist`
  - `VIP`
- removido o código morto dessas abas na página `frontend/src/pages/Proxy.jsx`.
- removidas as chamadas frontend antigas para:
  - `/api/dns/listas`
  - `/api/dns/whitelist`
  - `/api/dns/vip`
- adicionado aviso visual no topo do módulo informando que operação de políticas deve ser feita em `Bloqueios & Liberações`.
- adicionada ação direta para abrir `Bloqueios & Liberações`.

### Rotas legadas de escrita bloqueadas
- rotas antigas de escrita passaram a responder `410 Gone`:
  - `POST /api/dns/listas/add`
  - `POST /api/dns/listas/remove`
  - `POST /api/dns/whitelist/add`
  - `POST /api/dns/whitelist/remove`
  - `POST /api/dns/vip`
  - `PATCH /api/dns/vip/:id`
  - `DELETE /api/dns/vip/:id`
  - `POST /api/proxy/blocklist`
  - `DELETE /api/proxy/blocklist/:id`
  - `POST /api/proxy/whitelist`
  - `DELETE /api/proxy/whitelist/:id`
  - `POST /api/proxy/vips`
  - `PATCH /api/proxy/vips/:id`
  - `DELETE /api/proxy/vips/:id`
- resposta padronizada:
  - `Operação movida para Bloqueios & Liberações`
  - `owner = bloqueios-liberacoes`
- os blocos antigos de escrita foram removidos dos handlers dessas rotas; os endpoints ficam apenas como trava de compatibilidade.

### Compatibilidade preservada
- leituras técnicas e rotas de diagnóstico continuam disponíveis.
- radar, logger, SARG, certificado e saúde do Squid não foram removidos.
- rotas legadas de leitura podem continuar existindo como compatibilidade/evidência, mas não escrevem política.

### Validação realizada
- build frontend executado com sucesso.
- build backend executado com sucesso.
- backend reiniciado na porta `6779`.
- validação HTTP confirmou `410` nas rotas antigas de escrita.
- validação de saúde confirmou:
  - `squid_active = true`
  - `logger_active = true`
  - `source_of_truth = compiled-policy-runtime`

## Atualização 2026-04-15 - Escopos Dinâmicos e Fluxo LGPD para Políticas Existentes

### Decisão aplicada
- A matriz de escopo deixou de usar categorias fixas/hardcoded no frontend.
- O editor de escopo global e por VLAN agora lista políticas nomeadas criadas na UI (`domain_policies`).
- Cada política nomeada pode ser aplicada ou removida do escopo da VLAN pela própria UI.
- Políticas globais aparecem na VLAN como herdadas do global, para evitar a leitura errada de que uma VLAN isolada desligaria uma regra global.

### Fluxo LGPD corrigido
- A ação que antes abria direto `Criar liberação` foi substituída por `Adicionar à política`.
- Ao clicar em um domínio bloqueado na LGPD/Radar, o operador agora escolhe:
  - incluir o domínio em uma política existente de whitelist ou blacklist;
  - ou criar uma nova política nomeada quando ainda não existir política adequada.
- O fluxo evita criar uma política separada para cada domínio visto na auditoria.
- Ao anexar em política existente, a UI preserva nome, tipo, escopo, VLANs, descrição e estado da política, adicionando apenas o novo domínio normalizado.

### Sincronização operacional
- O fluxo continua usando `domain_policies` como source of truth.
- Atualizações em políticas nomeadas seguem sincronizando as tabelas legadas usadas pelo runtime:
  - `release_policies`
  - `blocking_policies`
- A alteração de escopo de VLAN pela UI chama `PATCH /api/bloqueios-liberacoes/domain-policies/:id` e reusa o sincronizador existente do backend.

### Validação realizada
- build frontend executado com sucesso.
- build backend executado com sucesso.
- frontend reiniciado via PM2.
- bundle ativo validado em `https://127.0.0.1:6777/`:
  - `index-Dscy76aQ.js`
  - `index-CNu1iLZ2.css`
- teste API criou uma política temporária nomeada.
- teste API anexou o domínio `codex-lgpd.example.com` a uma política existente via `PATCH /domain-policies/:id`.
- teste API alterou o escopo da política para `VLAN 10`.
- validação SQL confirmou 2 linhas sincronizadas em `release_policies` para `domain_policy_id` temporário e `scope_value = 10`.
- política temporária removida ao final do teste.
- validação SQL final confirmou `0` resíduos em `release_policies` para o `domain_policy_id` temporário.

## Correção 2026-04-15 - Políticas Padrão Promovidas e UX de Escopo Refeita

### Problema encontrado
- A primeira remoção do hardcoded no frontend deixou `Pornografia`, `Redes Sociais`, `WhatsApp` e `Sites Google` fora da lista de políticas nomeadas.
- Essas regras ainda existiam nas tabelas legadas (`blocking_policies` e `release_policies`), o que causava leitura ruim na UI e risco de duplicidade conceitual.
- O editor de escopo de VLAN misturava políticas globais herdadas com políticas locais editáveis, piorando a UX.

### Correção de dados
- As políticas padrão foram promovidas para políticas normais em `domain_policies`:
  - `Pornografia` como blacklist global com 38 domínios.
  - `Redes Sociais` como blacklist por VLAN para `10,50` com 40 domínios.
  - `WhatsApp` como whitelist global com 5 domínios.
  - `Sites Google` como whitelist global com 8 domínios.
  - `Bancos` mantida como whitelist global com 19 domínios.
  - `Governo` mantida como whitelist global com 22 domínios.
  - `Lista_Branca` preservada como política criada/normal existente.
- As sobras legadas sem `domain_policy_id` dessas categorias foram removidas para evitar duplicidade.
- As tabelas legadas continuam sendo apenas artefato sincronizado para o runtime.

### Nova UX de escopo
- O editor de escopo global agora mostra apenas políticas globais editáveis.
- O editor de escopo de VLAN agora mostra:
  - políticas globais herdadas como leitura, separadas no topo;
  - políticas específicas de VLAN como checklist simples `Aplicada` / `Fora deste escopo`.
- A tela de escopos lista no bloco global apenas políticas globais, não todas as políticas misturadas.
- A ação de VLAN continua disponível na própria linha da VLAN, mas agora opera sobre políticas normais por VLAN.

### Validação realizada
- build frontend executado com sucesso.
- frontend reiniciado via PM2.
- bundle ativo validado:
  - `index-C0w7GxpX.js`
  - `index-BfW1udE3.css`
- API `GET /domain-policies` validou 7 políticas nomeadas sem duplicidade visual esperada:
  - `Bancos`
  - `Governo`
  - `Lista_Branca`
  - `Pornografia`
  - `Redes Sociais`
  - `Sites Google`
  - `WhatsApp`
- validação SQL confirmou somente linhas vinculadas por `domain_policy_id` para as categorias promovidas.
- teste de escopo alterou `Redes Sociais` temporariamente para `VLAN 10,50,70` e restaurou para `VLAN 10,50`, validando o caminho `PATCH /domain-policies/:id`.
- runtime reaplicado com sucesso.
- saúde validada:
  - `compiler_manifest = true`
  - `allowed_rpz = true`
  - `manifest_matches_files = true`
  - `alerts = []`
  - `unbound = active`
  - `squid = active`
  - `unbound-checkconf` sem erros.

## Correção 2026-04-15 - Card Ameaças da Visão Geral

### Problema encontrado
- O card `Ameaças` da página `Visão Geral` não era mock no frontend, mas usava contadores acumulados de logs do sistema:
  - total histórico de `fail2ban.log`;
  - total histórico de `UFW BLOCK` em `kern.log`.
- Como esses números são acumulados e não uma janela operacional, o card parecia estático.

### Correção aplicada
- O backend core (`/api/dashboard/metrics`) passou a calcular `Ameaças` a partir de bloqueios reais no banco:
  - tabela `access_events`;
  - janela móvel de 24h;
  - `action = 'blocked'`.
- O payload agora também retorna:
  - `threats.window = 24h`;
  - `threats.recent_5m`;
  - `threats.last_ip`;
  - `threats.last_service`;
  - `threats.top_domain`;
  - `threats.source = access_events`.
- `fail2ban` e firewall continuam no payload como detalhe (`fail2ban_bans`, `firewall_blocks`), mas não alimentam mais o número principal do card.
- O frontend passou a exibir o subtítulo `Bloqueios 24h` e, quando houver, o total dos últimos 5 minutos.
- Criado índice para sustentar a consulta:
  - `idx_access_events_action_occurred_at ON access_events (action, occurred_at DESC)`.

### Validação realizada
- build backend executado com sucesso.
- build frontend executado com sucesso.
- `bcc-backend` e `bcc-frontend` reiniciados via PM2.
- endpoint validado:
  - `GET /api/dashboard/metrics`
- retorno observado no momento do teste:
  - `modules.threats_blocked = 9539`
  - `threats.window = 24h`
  - `threats.recent_5m = 2`
  - `threats.last_ip = 192.168.10.126`
  - `threats.last_service = graph.facebook.com`
  - `threats.top_domain = z-m-gateway.facebook.com`
  - `threats.source = access_events`
- frontend ativo validado:
  - `index-DSZOxjnD.js`
  - `index-BfW1udE3.css`

## Atualização 2026-04-16 — simplificação operacional do drawer de Editar escopo

### Ajuste solicitado
- o drawer de `Editar escopo` ainda parecia um modal adaptado:
  - estreito demais;
  - excesso de blocos e bordas internas;
  - área útil da lista de regras pequena;
  - bloco de impacto ocupando altura demais.

### Refatoração aplicada
- o painel lateral foi alargado para ganhar área operacional real:
  - largura do conteúdo aumentada para até `1080px`;
  - shell lateral com limite ampliado para uso confortável em notebook e desktop.
- o cabeçalho interno foi mantido compacto:
  - identificação curta da VLAN;
  - resumo discreto;
  - sem excesso de subtítulos e cápsulas.
- a toolbar ficou mais enxuta:
  - busca;
  - filtros `Todos / Liberados / Bloqueados`;
  - contador simples de resultados ou alterações.
- a lista de regras passou a dominar a área útil:
  - linhas compactas;
  - menos containers pesados;
  - menos sensação de `card dentro de card`.
- o bloco de impacto foi reduzido para uma faixa mínima no rodapé da área rolável:
  - só aparece quando existem alterações;
  - exibe apenas total pendente, liberadas e bloqueadas.
- footer mantido limpo e sempre acessível:
  - `Cancelar`;
  - `Salvar escopo`.

### Correção estrutural incluída
- a árvore JSX do drawer foi corrigida após a refatoração visual, eliminando o erro de fechamento incorreto que quebrava o build do frontend.

### Validação realizada
- build frontend executado com sucesso:
  - `npm run build`

## Atualização 2026-04-16 — auditoria estrutural do produto (frontend)

### Escopo da leitura
- auditoria estrutural realizada sobre o frontend do sistema para mapear:
  - rotas;
  - shell global;
  - páginas reais;
  - componentes reutilizáveis;
  - padrões de modal/dialog;
  - sinais de inconsistência de UX, arquitetura de informação e responsividade.

### Base inspecionada
- arquivos centrais lidos:
  - `frontend/src/App.jsx`
  - `frontend/src/components/ui/AppShell.jsx`
  - `frontend/src/components/ui/Sidebar.jsx`
  - `frontend/src/components/ui/Topbar.jsx`
  - `frontend/src/components/ui/primitives.jsx`
  - `frontend/src/components/blocking/BlockingUi.jsx`
  - `frontend/src/pages/*.jsx`
  - `frontend/src/services/api.js`
  - `frontend/src/services/authFetch.js`

### Observação de produto
- a leitura confirma que o sistema não é um app simples de 1 ou 2 módulos;
- há um conjunto relevante de áreas operacionais:
  - dashboard;
  - rede e conectividade;
  - servidor;
  - usuários;
  - proxy técnico;
  - bloqueios e liberações;
  - controle operacional;
  - backups;
  - segurança / SOC.
- também existem sinais claros de convivência entre:
  - camadas mais maduras de produto;
  - telas antigas ou mais técnicas;
  - fluxos ainda com perfil de ferramenta interna.

## Atualização 2026-04-16 — checkpoint da auditoria de produto e UX

### Status do levantamento
- auditoria estrutural do frontend concluída até este ponto;
- mapeamento realizado com base em rotas, páginas, shell global, componentes reutilizáveis e fluxos operacionais reais do sistema;
- foco especial aplicado em:
  - responsividade em notebook 14" e monitor 19";
  - módulos operacionais;
  - clareza de edição;
  - equilíbrio entre densidade técnica e experiência de produto.

### Diagnóstico consolidado
- o sistema hoje se comporta como uma ferramenta interna robusta em evolução para produto;
- `Bloqueios & Liberações` é o módulo mais maduro em linguagem de produto, componentização e direção UX;
- `Network`, `Security`, `Proxy` e `Control` ainda carregam traços fortes de painel técnico;
- existe inconsistência real entre módulos em:
  - densidade visual;
  - modais/dialogs;
  - hierarquia da informação;
  - responsividade;
  - linguagem e maturidade de interação.

### Parecer atual
- diagnóstico franco registrado:
  - o sistema parece hoje um `MVP promissor / ferramenta interna forte`, não um produto plenamente unificado;
  - há valor real e profundidade funcional;
  - falta ainda consolidação de arquitetura de informação, consistência visual e refinamento operacional entre módulos.

### Próximo passo sugerido para continuidade
- retomar a partir de um plano de redesign por ondas, com prioridade para:
  - `Network`;
  - `Security`;
  - relação entre `Proxy & Logs` e `Bloqueios & Liberações`;
  - padronização de dialogs, feedbacks e layouts compactos para notebook.

## Atualização 2026-04-16 — correção de scroll do modal central Editar escopo

### Problema encontrado
- o modal central estava melhor posicionado, mas a rolagem interna não funcionava corretamente;
- parte do conteúdo ficava inacessível em telas com menor altura útil, principalmente notebook;
- a causa estrutural era:
  - dialog central com `max-height`, mas sem altura útil suficientemente definida para o conteúdo `flex`;
  - área interna dependente de `overflow-hidden` no shell sem uma altura resolvida corretamente;
  - ausência de bloqueio explícito do scroll da página ao fundo.

### Correção aplicada
- o shell central do dialog passou a ter altura efetiva baseada em viewport:
  - mobile: `calc(100dvh - margem)`;
  - telas maiores: limite por `88dvh`, com altura útil resolvida para o layout flex.
- a estrutura foi mantida no padrão correto:
  - header `shrink-0`;
  - body `flex-1 min-h-0 overflow-y-auto`;
  - footer `shrink-0`.
- o body scrollável ganhou `overscroll-contain` para isolar melhor a rolagem.
- o `document.body` agora fica com `overflow: hidden` enquanto o modal está aberto, evitando scroll no fundo.

### Resultado esperado
- header continua visível;
- footer continua acessível;
- somente a área central rola;
- todo o conteúdo do modal pode ser percorrido sem perder a centralização.

### Validação realizada
- build frontend executado com sucesso:
  - `npm run build`

## Atualização 2026-04-16 — recentralização do Editar escopo como dialog premium

### Correção solicitada
- o componente de `Editar escopo` não deveria parecer um drawer lateral;
- o enquadramento precisava ser claramente de dialog central, com melhor equilíbrio visual e margens consistentes.

### Ajuste aplicado
- `Editar escopo` deixou de usar alinhamento lateral e voltou a operar como modal centralizado;
- o shell do dialog foi ajustado para:
  - centralização horizontal real;
  - centralização vertical com margens equilibradas;
  - comportamento quase fullscreen no mobile;
  - largura controlada em notebook e desktop;
  - altura máxima baseada na viewport, sem encostar de forma ruim nas bordas.
- o modal agora usa:
  - largura até `94vw`, com `max-width` de `1120px`;
  - `max-height` adaptado por viewport;
  - bordas e respiro mais equilibrados no modo central.

### Estrutura preservada
- header continua fixo;
- toolbar e filtros continuam no topo da composição;
- apenas o body rola;
- footer permanece fixo e acessível.

### Validação realizada
- build frontend executado com sucesso:
  - `npm run build`
