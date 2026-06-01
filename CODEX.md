# CODEX

Documento principal de continuidade do SGCG.

## Regra inegociável

Toda alteracao estrutural, visual, funcional ou arquitetural do sistema deve ser registrada neste arquivo ao final de cada rodada.

Toda vez que houver `build`, este arquivo deve ser atualizado na mesma rodada, sem excecao.

Esta regra vale para:

- frontend
- backend
- governanca de dados
- identidade institucional
- navegacao
- modulos
- seguranca
- auditoria
- responsividade
- integracoes

Se houver documentacao complementar em `docs/`, o resumo executivo e o estado atual ainda assim devem ser refletidos aqui.

## Perfil tecnico esperado do agente

- ao atuar neste projeto, o agente deve assumir postura de engenheiro, arquiteto e desenvolvedor senior de sistemas GovTech
- tambem deve atuar como diretor, projetista, analista, desenvolvedor de frontend, UX, UI e backend senior
- essa responsabilidade exige olhar o SGCG de ponta a ponta: produto, experiencia do operador, interface, acessibilidade, arquitetura, backend, banco de dados, runtime Linux, seguranca, auditoria, governanca publica, continuidade operacional e validacao real no ambiente

## Regra inegociavel de firewall

- o firewall principal do servidor SGCG e o `UFW`
- o `UFW` deve permanecer instalado, habilitado e ativo como camada oficial de administracao do firewall
- nenhuma alteracao operacional, pacote, script, rotina automatica ou decisao arquitetural pode remover, substituir ou desabilitar o `UFW` sem autorizacao explicita
- se o `UFW` nao for capaz de atender uma necessidade tecnica especifica, a solucao deve trabalhar em paralelo com ele
- camadas complementares como `iptables`, `nftables`, `tc`, scripts de hardening ou regras runtime podem existir, mas devem complementar o `UFW`, nunca assumir o papel de firewall principal
- qualquer uso complementar fora do `UFW` deve ser documentado neste arquivo, incluindo:
  - motivo tecnico
  - escopo
  - comandos ou servicos envolvidos
  - impacto esperado
  - forma de validacao

## Regra inegociavel — PontoRH e OpenDNS

- o aplicativo institucional `PontoRH` usa `208.67.222.222` e `208.67.220.220` como DNS hardcoded
- consultas DNS classicas `UDP/53` e `TCP/53` para esses dois IPs devem permanecer liberadas em todas as VLANs gerenciadas
- essas consultas nao podem ser capturadas pelo `REDIRECT` global para o `Unbound`
- a compatibilidade do `PontoRH` vale inclusive para usuarios `VIP`
- nenhuma manutencao em `Unbound`, `UFW`, `iptables`, `backend-proxy` ou politicas do SGCG pode remover essa excecao
- qualquer rodada que toque DNS institucional deve validar explicitamente o funcionamento do `PontoRH` antes do fechamento
- bloquear ou quebrar o registro institucional de jornada por regressao nessa excecao e inadmissivel em producao
- regra incontestavel: nao mexa mais nesse DNS quando mexer no `Unbound`, em regras, `RPZ` ou em qualquer outra camada relacionada
- referencia operacional detalhada: `pontorh.md`

## Regra inegociavel — VLAN 70

- a `VLAN 70` e rede de saida para internet e nao pode ter entrada roteada para as demais VLANs internas da prefeitura
- isso nao exime a `VLAN 70` das politicas de seguranca do SGCG
- toda navegacao da `VLAN 70` continua sujeita a `DNS`, `ACL`, `enforcement`, `RPZ`, portal cativo, autenticacao, sanitizacao de `DoH/DoT/QUIC` e demais controles institucionais
- em qualquer ajuste de firewall, `Unbound`, `RPZ`, `iptables`, `UFW` ou compilador de politicas, essa distincao deve ser preservada:
  - sem entrada da `VLAN 70` para a rede interna
  - com politicas de seguranca do SGCG plenamente ativas sobre a saida para internet

## Incidente de politicas SGCG aparentemente desligadas nas VLANs - 2026-05-28

- sintoma reportado:
  - redes sociais abriam em IP nao VIP, indicando falha em `RPZ`, `DNS`, `ACL` e enforcement por VLAN
- causa raiz confirmada no runtime:
  - o compilador do Unbound estava com `UNBOUND_TAGGED_RPZ_SUSPENDED=true`, mantendo o modo seguro antigo e gerando apenas RPZ global, sem `access-control-tag` e sem RPZ por VLAN/VIP
  - regras emergenciais amplas `FORWARD -i enp6s0.<vlan> -o enp8s0 -s 192.168.<vlan>.0/24 -j ACCEPT` estavam antes do `SGCG_GUARD`, `ufw-before-forward` e cadeias UFW, permitindo saida direta antes das politicas
  - nao havia bypass emergencial ativo no banco (`emergency_vlan_bypass active=true` retornou `0`)
- correcao aplicada:
  - `backend-proxy/src/services/policy-compiler-service.ts` voltou a gerar RPZ tagged por VLAN/VIP (`UNBOUND_TAGGED_RPZ_SUSPENDED=false`)
  - o compilador foi executado para `acl-plus-dns`, gerando `/etc/unbound/unbound.conf.d/becker_policy_compiler.conf` com `define-tag`, `access-control-tag`, `rpz.vippass` e zonas `blocklist-vlan-10/30/40/50/70`
  - `unbound-checkconf /etc/unbound/unbound.conf` validou sem erros, o Unbound foi recarregado e o cache foi limpo
  - as regras amplas de `ACCEPT` por subnet foram removidas das VLANs `10`, `30`, `40`, `50`, `70`, `80` e `99`, com limpeza de `conntrack`
  - `iptables-save` foi persistido em `/etc/iptables/rules.v4`
  - `backend-proxy` foi recompilado (`npm run build`) e reiniciado via PM2
- validacao em producao:
  - `ufw`, `unbound`, `postgresql`, `nginx`, `squid` e `isc-dhcp-server` ativos
  - `backend-proxy` e `backend-proxy-ingester` online no PM2
  - `iptables-save -t filter` e `iptables-save -t nat` sem duplicatas (`duplicates=0`)
  - nenhuma regra ampla `FORWARD` por subnet VLAN para WAN permaneceu presente
  - consultas DNS vindas dos gateways `192.168.50.1` e `192.168.70.1` para `facebook.com`, `instagram.com`, `tiktok.com`, `youtube.com` e `x.com` retornaram sem IP; `whatsapp.com`, `pontorh.com.br` e `gov.br` continuaram resolvendo
  - na `VLAN 30`, `facebook.com`, `instagram.com`, `tiktok.com` e `x.com` ainda resolvem porque a politica cadastrada `Redes Sociais` esta escopada para `10,40,50,70`, nao para `30`
  - a politica `Bloquear YouTube` tambem esta escopada para `10,40,50,70`
  - `Pornografia` permanece como bloqueio global ativo
- regra operacional:
  - se a `VLAN 30` tambem deve bloquear redes sociais, ajustar o escopo das politicas no banco/UI para incluir `30`; nao tratar esse comportamento como falha de firewall enquanto o escopo cadastrado permanecer `10,40,50,70`
  - a excecao inegociavel do PontoRH/OpenDNS foi preservada

## Revisao de escopo das politicas institucionais e remocao do gateway VLAN 10 do VIP - 2026-05-28

- contexto:
  - revisao solicitada apos confirmar que o SGCG deve bloquear permanentemente `Redes Sociais`, `YouTube`, `Lista Negra`, `Streaming` e `Pornografia`
  - a `VLAN 30` possui liberacoes por dia/horario para `YouTube` e `Redes Sociais`, portanto a politica base deve bloquear a VLAN 30 e o agendamento deve abrir somente a janela autorizada
- correcao de escopo:
  - `Redes Sociais` passou de `scope_value=10,40,50,70` para `10,30,40,50,70`
  - `Bloquear YouTube` passou de `scope_value=10,40,50,70` para `10,30,40,50,70`
  - as tabelas legadas `blocking_policies` foram resincronizadas a partir de `domain_policy_entries`
  - resultado confirmado:
    - `Redes Sociais`: `78` dominios ativos em cada VLAN `10`, `30`, `40`, `50` e `70`
    - `Bloquear YouTube`: `10` dominios ativos em cada VLAN `10`, `30`, `40`, `50` e `70`
    - `Lista Negra`: bloqueio global ativo
    - `Streaming`: bloqueio global ativo
    - `Pornografia`: bloqueio global ativo
- agendamentos:
  - `data/scheduled_policy_windows.json` contem duas janelas ativas para a `VLAN 30`:
    - sexta-feira `08:00-17:00` para `YouTube` e `Redes Sociais`
    - segunda a sexta `11:30-13:00` para `YouTube` e `Redes Sociais`
  - em `2026-05-28 08:xx -03`, o reconciliador retornou `vlan30_media_active=false`
  - `release_policies` com `origin_rule='scheduled-window'` retornou `0`, confirmando que nao havia liberacao agendada ativa no momento
- remocao de VIP indevido:
  - `192.168.10.1` foi removido do VIP porque e gateway/DNS da `VLAN 10`, nao endpoint usuario
  - `dns_vip.id=1840` (`192.168.10.1`, `VLAN_10`) foi desativado
  - `policy_exceptions.id=39` (`192.168.10.1`, `VLAN_10`) foi desativado
  - apos reaplicar o motor, `/etc/unbound/unbound.conf.d/becker_policy_compiler.conf` deixou de gerar `access-control-tag: 192.168.10.1 "vip_bypass"`
- aplicacao e validacao:
  - `blockingReleaseService.apply('codex-scope-review')` reaplicou o motor e derrubou sessoes recentes de redes sociais
  - `blockingReleaseService.apply('codex-remove-gateway-vip')` reaplicou o runtime apos remover o gateway da lista VIP
  - `unbound-checkconf /etc/unbound/unbound.conf` sem erros
  - `iptables-save -t filter` e `iptables-save -t nat` sem duplicatas
  - `ufw`, `unbound`, `postgresql`, `nginx`, `squid` e `isc-dhcp-server` ativos
  - `backend-proxy` e `backend-proxy-ingester` online no PM2
  - `/etc/iptables/rules.v4` atualizado com o estado validado
  - validacao DNS usando os resolvedores/gateways `192.168.10.1`, `192.168.30.1`, `192.168.40.1`, `192.168.50.1` e `192.168.70.1`:
    - `facebook.com`, `youtube.com`, `x.com`, `spotify.com` e `pornhub.com` retornaram sem IP
    - `whatsapp.com`, `pontorh.com.br` e `gov.br` continuaram resolvendo
  - observacao: `netflix.com` continua resolvendo por desenho da politica de `Streaming`, que preserva Netflix/Fast.com para teste de velocidade conforme regra historica do SGCG

## Performance do DNS recursivo Unbound - 2026-05-28

- contexto:
  - o resolvedor local respondia cache quente em `0-1 ms`, mas o Unbound principal e o resolvedor VIP limpo estavam usando apenas `1` thread em servidor com `12` CPUs
  - o SGCG mantem `log-queries` e `log-replies` ativos para alimentar o Radar DNS, portanto o ajuste priorizou paralelismo/cache sem cegar a auditoria
- alteracoes aplicadas:
  - criado `/etc/unbound/unbound.conf.d/98-sgcg-performance.conf`
  - Unbound principal passou a usar:
    - `num-threads: 12`
    - `so-reuseport: yes`
    - `msg-cache-size: 128m`
    - `rrset-cache-size: 256m`
    - `key-cache-size: 64m`
    - `neg-cache-size: 32m`
    - slabs em `16`
    - `outgoing-range: 8192`
    - `num-queries-per-thread: 4096`
    - buffers socket `4m`
    - `cache-min-ttl: 60`
    - `cache-max-ttl: 86400`
    - `prefetch: yes`
    - `prefetch-key: yes`
    - `serve-expired: yes`
    - `serve-expired-ttl: 86400`
    - `serve-expired-client-timeout: 1800`
  - `/etc/unbound/unbound.conf.d/99-ratelimit.conf` deixou de forcar `cache-min-ttl: 0` e passou para `cache-min-ttl: 60`
  - `/etc/unbound/sgcg-vip-clean.conf` recebeu perfil equivalente com `num-threads: 12`, caches menores e `prefetch/serve-expired`
- aplicacao:
  - `unbound-checkconf /etc/unbound/unbound.conf` sem erros
  - `unbound-checkconf /etc/unbound/sgcg-vip-clean.conf` sem erros
  - reiniciados `unbound` e `sgcg-vip-dns.service`
  - `unbound-control status` confirmou `threads: 12`
  - `ps -C unbound` confirmou `NLWP=12` no Unbound principal e `NLWP=12` no resolvedor VIP limpo
- validacao:
  - `unbound` e `sgcg-vip-dns.service` ativos
  - portas `53` e `5355` expostas com `SO_REUSEPORT` em 12 sockets UDP/TCP
  - primeira consulta apos restart ainda depende de rede externa/forwarders e ficou na faixa comum de `15-27 ms`
  - segunda/terceira consulta para os mesmos nomes ficou em `0-1 ms`
  - nas VLANs `10`, `30`, `40`, `50` e `70`, `facebook.com`, `youtube.com` e `pornhub.com` continuaram bloqueados
  - `whatsapp.com`, `pontorh.com.br` e `gov.br` continuaram resolvendo
  - amostra do journal apos ajuste: `777` respostas, media `9.97 ms`, maximo `127.87 ms`, `37` acima de `50 ms`
- observacao operacional:
  - em `2026-05-28`, o encaminhamento raiz do Unbound principal foi revisado para `9.9.9.9`, `149.112.112.112`, `1.1.1.1` e `1.0.0.1`, com `forward-first: yes`; portanto a primeira consulta fria depende desses forwarders e pode cair para recursao plena se todos falharem
  - para consultas ja em cache, a meta operacional e `0-1 ms`

## Ajuste de navegacao lenta nas VLANs - 2026-05-28

- sintoma reportado:
  - navegacao nas VLANs extremamente lenta ou falhando em alguns dominios
- achado runtime:
  - DNS local e HTTPS comum estavam funcionais nos testes por gateway das VLANs `10`, `30`, `40`, `50` e `70`
  - havia bloqueios silenciosos `DROP` em caminhos que navegadores modernos tentam antes do HTTPS/TCP normal:
    - `UDP/443` (`QUIC`/HTTP3)
    - `TCP/853` (`DoT`)
    - `TCP/443` para resolvedores DoH externos conhecidos (`1.1.1.1`, `1.0.0.1`, `8.8.8.8`, `8.8.4.4`, `9.9.9.9`, `149.112.112.112`, `94.140.14.14`, `94.140.15.15`)
  - esse tipo de `DROP` preserva a seguranca, mas pode causar espera por timeout antes do navegador cair para o caminho permitido, gerando sensacao de site travando ou lento
- correcao aplicada:
  - `backend-proxy/src/services/dns-contingency-service.ts` agora gera o bloco antecipado `BECKERCORP_EARLY_FORWARD` com `REJECT` para `QUIC`, `DoH` e `DoT`, mantendo `ACCEPT` dos VIPs antes dos bloqueios
  - `/etc/ufw/before.rules` foi atualizado com os mesmos `REJECT` antecipados
  - `scripts/sanitize_doh_vlans.py` passou a criar regras UFW `route reject` em vez de `route deny` para `DoH`, `DoT` e `QUIC`
  - regras antigas da `VLAN 70` para `TCP/5222`, `TCP/5223` e `TCP/5228` foram removidas do UFW porque conflitam com dependencias de WhatsApp/Web WhatsApp
  - `ufw-user-forward` foi normalizado para mostrar `REJECT FWD` nas regras de sanitizacao, nao mais `DENY FWD` silencioso
  - `backend-proxy` foi recompilado e reiniciado via PM2 para o SGCG manter o comportamento em futuros reconciles
  - duplicatas NAT residuais foram limpas e `/etc/iptables/rules.v4` foi persistido novamente
- validacao:
  - `npm run build` em `backend-proxy` concluido com sucesso
  - `python3 -m py_compile scripts/sanitize_doh_vlans.py scripts/update_whatsapp_allowlist.py` sem erro
  - `iptables-restore --test < /etc/ufw/before.rules` sem erro
  - `ufw`, `unbound`, `sgcg-vip-dns.service`, `squid`, `isc-dhcp-server`, `nginx` e `postgresql` ativos
  - `backend-proxy` e `backend-proxy-ingester` online no PM2
  - `iptables-save -t filter`: `623` regras, `duplicates=0`
  - `iptables-save -t nat`: `142` regras, `duplicates=0`
  - `iptables -S ufw-before-forward` confirmou `REJECT --reject-with icmp-port-unreachable` para `UDP/443` e `REJECT --reject-with tcp-reset` para `DoH`/`DoT`
  - `ufw status numbered` mostrou `REJECT FWD` para as regras `SANITIZE VLAN* BLOCK DOT/QUIC/DOH`
  - cache local do Unbound respondeu `0-1 ms` em `127.0.0.1` e nos gateways `192.168.10.1`, `192.168.30.1`, `192.168.40.1`, `192.168.50.1`, `192.168.70.1`
  - testes HTTPS usando origem dos gateways das VLANs abriram `google.com`, `gov.br`, `pontorh.com.br`, `whatsapp.com`, `web.whatsapp.com`, `microsoft.com`, `uol.com.br` e `cloudflare.com`
  - `facebook.com`, `instagram.com`, `youtube.com` e `pornhub.com` continuaram sem IP nas VLANs `10`, `30`, `40`, `50` e `70`
  - `whatsapp.com` e `web.whatsapp.com` continuaram resolvendo nas VLANs `10`, `30`, `40`, `50` e `70`
- observacao operacional:
  - bloquear `QUIC` continua correto para forcar a navegacao auditavel por HTTPS/TCP e evitar bypass de politicas; o ponto corrigido foi trocar timeout silencioso por falha rapida

## Revisao DNS gov.br e WhatsApp em todas as VLANs - 2026-05-28

- sintoma reportado:
  - `VLAN 40` e `VLAN 50` com lentidao forte na resolucao de nomes, especialmente `globo.com` e portais `gov.br`
  - todas as VLANs reclamando de instabilidade no WhatsApp, incluindo WhatsApp Web
  - requisito operacional: `gov.br` e todos os subdominios `*.gov.br` nao devem seguir o recursivo institucional padrao; devem ter bypass DNS total via `1.1.1.1` no modulo `Controle de Rede > DNS Institucional`
- achados runtime:
  - as VLANs `10`, `30`, `40`, `50`, `70`, `80` e `99` estavam respondendo DNS para `gov.br`, `www.gov.br`, `sso.acesso.gov.br`, `globo.com`, `whatsapp.com`, `web.whatsapp.com` e `static.whatsapp.net`
  - a regra persistida em `net_dns_rules` e o arquivo `/etc/unbound/unbound.conf.d/custom-zones.conf` ainda encaminhavam `gov.br` para `9.9.9.9`, divergindo do contrato solicitado
  - o `ipset sgcg_whatsapp_allowed` existia e as regras `SGCG WHATSAPP ALLOW`, `SGCG WHATSAPP CALL TCP ALLOW` e `SGCG WHATSAPP CALL UDP ALLOW` estavam no `FORWARD`, mas o conjunto estava vazio
  - o conjunto `sgcg_social_blocked` nao estava carregado; por isso o script antigo so resolvia os dominios do WhatsApp, mas nao adicionava nenhum IP quando nao havia overlap contra esse ipset
- correcao aplicada:
  - `net_dns_rules.id=7` (`gov.br`) foi atualizado para `target_ip='1.1.1.1'` e `type='FWD'`, mantendo a regra visivel em `DNS Institucional`
  - `/etc/unbound/unbound.conf.d/custom-zones.conf` passou a conter `forward-zone name: "gov.br"` com `forward-addr: 1.1.1.1`
  - `/etc/unbound/sgcg-vip-clean.conf` recebeu a mesma zona especifica para `gov.br -> 1.1.1.1`, antes do forwarder raiz, cobrindo tambem o resolvedor VIP limpo
  - `scripts/update_whatsapp_allowlist.py` foi ajustado para usar allowlist completa resolvida quando `sgcg_social_blocked` estiver ausente ou vazio, evitando que o WhatsApp fique sem IPs liberados por falha de estado do ipset social
  - `unbound` foi recarregado, `sgcg-vip-dns.service` reiniciado, caches do Unbound limpos e a allowlist dinamica do WhatsApp foi executada
  - `/etc/iptables/rules.v4` e `/etc/ipset.conf` foram persistidos apos a correcao
- validacao:
  - `unbound-checkconf /etc/unbound/unbound.conf` e `unbound-checkconf -f /etc/unbound/sgcg-vip-clean.conf` sem erros
  - `python3 -m py_compile scripts/update_whatsapp_allowlist.py scripts/sanitize_doh_vlans.py` sem erro
  - `ufw`, `unbound`, `sgcg-vip-dns.service`, `squid`, `isc-dhcp-server`, `nginx` e `postgresql` ativos
  - `sgcg_whatsapp_allowed` passou de `0` para `34` IPs atuais, incluindo dependencias de WhatsApp Web como `graph.whatsapp.com`, `chat.cdn.whatsapp.net`, `mmx-ds.cdn.whatsapp.net` e `edge-mqtt.facebook.com`
  - `tcpdump` em `enp8s0` confirmou consultas de `sso.acesso.gov.br` e `receita.fazenda.gov.br` saindo para `1.1.1.1:53`
  - nas VLANs `10`, `30`, `40`, `50`, `70`, `80` e `99`, os dominios `gov.br`, `www.gov.br`, `sso.acesso.gov.br`, `receita.fazenda.gov.br`, `globo.com`, `whatsapp.com`, `web.whatsapp.com`, `static.whatsapp.net`, `graph.whatsapp.com` e `chat.cdn.whatsapp.net` retornaram `NOERROR`
  - depois do cache aquecido, as VLANs `40`, `50`, `70`, `80` e `99` responderam os nomes principais em `0-1 ms`; a primeira consulta fria na `VLAN 10` ficou na faixa de `16-22 ms`, compatível com forward externo
  - nas VLANs de politica `10`, `30`, `40`, `50` e `70`, os bloqueios de controle para `facebook.com`, `instagram.com`, `youtube.com` e `pornhub.com` continuaram retornando `NXDOMAIN`
- observacao operacional:
  - `VLAN 80` e `VLAN 99` resolvem os dominios de controle social porque nao estao nas tags de bloqueio por VLAN do compilador atual; isso foi observado, mas nao alterado nesta rodada porque o pedido era estabilizar resolucao e WhatsApp em todas as VLANs

## Confirmacao urgente de bypass gov.br e Empresa Facil - 2026-05-28

- contexto:
  - confirmacao solicitada para garantir que `gov.br` e todos os subdominios `*.gov.br` tenham bypass DNS total pelos resolvedores Cloudflare `1.1.1.1` e `1.0.0.1`
  - exemplos sensiveis informados: `https://www.gov.br/govbrportal/inicializacao-autenticacao-openid.html` e `https://autenticacao.empresafacil.pr.gov.br/`
- correcao/persistencia:
  - `net_dns_rules.id=7` (`gov.br`) foi atualizado para `target_ip='1.1.1.1,1.0.0.1'` e `type='FWD'`, mantendo a regra visivel em `Controle de Rede > DNS Institucional`
  - `/etc/unbound/unbound.conf.d/custom-zones.conf` passou a conter `forward-zone name: "gov.br"` com dois `forward-addr`: `1.1.1.1` e `1.0.0.1`
  - `/etc/unbound/sgcg-vip-clean.conf` recebeu a mesma zona especifica `gov.br -> 1.1.1.1 + 1.0.0.1`
  - os geradores `backend-proxy/src/routes/dns-routes.ts`, `backend/src/modules/unbound/routes.ts` e `backend/src/modules/network/dns-routes.ts` passaram a aceitar multiplos forwarders separados por virgula/espaco e escrever uma linha `forward-addr` por resolvedor, evitando regressao futura pelo painel
  - `unbound` foi recarregado, `sgcg-vip-dns.service` reiniciado e `backend-proxy`/`bcc-backend` reiniciados via PM2 apos build
- validacao DNS/forwarder:
  - `unbound-checkconf /etc/unbound/unbound.conf` e `unbound-checkconf -f /etc/unbound/sgcg-vip-clean.conf` sem erros
  - `npm run build` em `backend-proxy` e `backend` concluiu sem erro
  - `tcpdump -i enp8s0 '(host 1.1.1.1 or host 1.0.0.1) and port 53'` confirmou consultas `*.gov.br` saindo para os dois resolvedores Cloudflare:
    - `1.1.1.1`: `gov.br`, `www.gov.br`, `sso.acesso.gov.br`, `receita.fazenda.gov.br`, `dados.gov.br`, `barra.sistema.gov.br`, `contas.acesso.gov.br`, `servicos.acesso.gov.br`, `autenticacao.empresafacil.ro.gov.br`
    - `1.0.0.1`: consultas `A` e `HTTPS` para familia `*.gov.br` tambem apareceram na captura, confirmando que o segundo forwarder esta ativo
  - nas VLANs `10`, `30`, `40`, `50`, `70`, `80` e `99`, `gov.br`, `www.gov.br`, `sso.acesso.gov.br`, `receita.fazenda.gov.br`, `dados.gov.br`, `barra.sistema.gov.br`, `contas.acesso.gov.br` e `servicos.acesso.gov.br` retornaram `NOERROR`, em cache quente entre `0-1 ms`
- validacao das URLs informadas:
  - `https://www.gov.br/govbrportal/inicializacao-autenticacao-openid.html` retornou `HTTP 200` em todas as VLANs testadas, com DNS em cerca de `17-19 ms` na primeira ida e TLS em cerca de `90-95 ms`
  - a dependencia principal `https://barra.sistema.gov.br/v1/barra-govbr-wc.js` retornou `HTTP 200` em todas as VLANs, com download de `260564` bytes
  - `autenticacao.empresafacil.pr.gov.br`, `empresafacil.pr.gov.br` e `www.empresafacil.pr.gov.br` resolveram via `1.1.1.1` e `1.0.0.1`
  - `https://autenticacao.empresafacil.pr.gov.br/` sem cookie retorna `302` para `/selected-system/sigfacil-pr` em todas as VLANs; seguindo redirects sem cookie pode parecer carregamento infinito
  - com cookie jar normal, o fluxo do Empresa Facil retornou `HTTP 200` e HTML de aproximadamente `30 KB`; na VLAN 50 o teste validado retornou `HTTP 200`, `redirects=2`, `total=1.276s`, `final=https://autenticacao.empresafacil.pr.gov.br/`
  - dependencias do Empresa Facil (`sigfacil.staticvox.com.br`, `www.googletagmanager.com`, `js-agent.newrelic.com`, `bam.nr-data.net`) resolveram e carregaram por HTTPS nas VLANs `10`, `30`, `40`, `50`, `70`, `80` e `99`
- conclusao operacional:
  - o bypass DNS da familia `gov.br` esta ativo para todas as VLANs e pelos dois resolvedores `1.1.1.1` e `1.0.0.1`
  - para o Empresa Facil, o comportamento de "ficar carregando" nao foi reproduzido como bloqueio de DNS/rede no gateway; o padrao observado foi loop de redirecionamento quando a sessao/cookie `security` nao se fixa no cliente
  - se um navegador especifico continuar travando, validar no endpoint cache/cookies do site `autenticacao.empresafacil.pr.gov.br`, extensoes do navegador ou WebView, pois a rota de rede e as dependencias externas abriram nos testes de gateway

## Bypass de dependencias gov.br, SSO e Empresa Facil - 2026-05-28

- decisao operacional:
  - tudo que as paginas criticas `gov.br`, `sso.acesso.gov.br` e `autenticacao.empresafacil.pr.gov.br` pedirem como dependencia externa deve seguir o mesmo contrato de bypass, mesmo quando o dominio nao terminar em `gov.br`
  - o objetivo e evitar que CSS, JS, captcha, telemetria, assets de CDN ou componentes de acessibilidade caiam em Unbound recursivo padrao, captive, bloqueio social, UFW/ACL ou proxy complementar
- alteracoes aplicadas:
  - `scripts/update_govbr_allowlist.py` passou a manter automaticamente os dominios criticos e dependencias em `net_dns_rules` como `FWD` para `1.1.1.1,1.0.0.1`
  - a rotina regenera `/etc/unbound/unbound.conf.d/custom-zones.conf` a partir de `net_dns_rules`, preservando o contrato visivel em `Controle de Rede > DNS Institucional`
  - `sgcg_govbr_allowed` passou a incluir IPs atuais de gov.br, SSO, Empresa Facil, hCaptcha/reCAPTCHA, Google/Gstatic/Fonts/Maps, CDNJS, VLibras, SERPRO/estaleiro, StaticVox, New Relic e Google Analytics/Tag Manager
  - as regras `SGCG GOVBR EMPRESAFACIL ALLOW` no `FORWARD` e `SGCG GOVBR EMPRESAFACIL NAT BYPASS` no `PREROUTING` continuam antes de captive/bloqueios/UFW para esses destinos
  - `sgcg-govbr-allowlist.timer` permanece ativo para renovar IPs periodicamente; execucao manual em `2026-05-28 10:02 -03` retornou `ok members=107`
  - `/etc/squid/acl/proxy_whitelist.acl` e `/etc/squid/acl/proxy_protected_ssl.acl` receberam tambem as dependencias criticas, cobrindo clientes que usam proxy explicito
- dominios adicionados ao bypass institucional:
  - `certificado.sso.acesso.gov.br`, `cadastro.acesso.gov.br`, `estruturaorganizacional.dados.gov.br`
  - `sigfacil.staticvox.com.br`, `js-agent.newrelic.com`, `bam.nr-data.net`
  - `hcaptcha.com`, `js.hcaptcha.com`, `newassets.hcaptcha.com`
  - `www.googletagmanager.com`, `www.google-analytics.com`, `ssl.google-analytics.com`, `www.google.com`, `www.gstatic.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, `maps.googleapis.com`
  - `cdnjs.cloudflare.com`, `vlibras.gov.br`, `www.vlibras.gov.br`, `dicionario2.vlibras.gov.br`, `traducao2.vlibras.gov.br`, `cdn-dsgovserprodesign.estaleiro.serpro.gov.br`, `serprobots.estaleiro.serpro.gov.br`, `cdp.cloud.unity3d.com`, `config.uca.cloud.unity3d.com`
  - `apps.apple.com`, `play.google.com`
- validacao:
  - `unbound-checkconf /etc/unbound/unbound.conf` sem erros
  - `squid -k parse` sem erro fatal e `systemctl reload squid` executado; `squid`, `unbound`, `ufw` e `sgcg-govbr-allowlist.timer` ativos
  - `tcpdump` em `enp8s0` confirmou consultas para dependencias como `newassets.hcaptcha.com`, `www.gstatic.com`, `cdnjs.cloudflare.com`, `cdn-dsgovserprodesign.estaleiro.serpro.gov.br`, `sigfacil.staticvox.com.br`, `js-agent.newrelic.com` e `bam.nr-data.net` saindo para `1.1.1.1` ou `1.0.0.1`
  - nas VLANs `10`, `30`, `40`, `50`, `70`, `80` e `99`, dependencias do SSO/Empresa Facil resolveram com respostas `A`
  - `https://sso.acesso.gov.br/authorize?...` retornou `HTTP 302` em todas as VLANs, com TLS em cerca de `60-95 ms`, apontando para `/login`
  - `https://autenticacao.empresafacil.pr.gov.br/` retornou `HTTP 200`, `redirects=2`, `remote=200.155.79.202` em todas as VLANs; na `VLAN 50`, `total=1.574s`
  - o mesmo fluxo via Squid explicito retornou `HTTP 200`, `redirects=2`, `size=30690`, e as dependencias principais retornaram `TCP_TUNNEL/200` no `access.log`
  - conexoes antigas em `conntrack` para IPs de Empresa Facil/SSO/StaticVox foram limpas apos a liberacao ampliada

## Incidente pos-merge/reboot - VLAN 50, UFW e reload indevido do Unbound - 2026-05-27

- contexto:
  - apos troca de 2 HDs por 2 SSDs, merge e reboot do servidor, as VLANs ficaram sem navegacao para usuarios comuns e maquinas em `VIP` continuavam funcionando
  - durante a emergencia, regras foram liberadas diretamente no `iptables` e o UFW foi desabilitado
- achados runtime:
  - interfaces e rotas estavam presentes: `enp6s0.50` com `192.168.50.1/24`, WAN `enp8s0` com rota default via `186.251.14.25`
  - `net.ipv4.ip_forward=1`
  - havia `MASQUERADE` para `192.168.50.0/24` em `POSTROUTING`
  - `FORWARD` tinha trafego real aceito para `enp6s0.50 -> enp8s0` e retorno `enp8s0 -> enp6s0.50`
  - `conntrack` mostrou sessoes estabelecidas da VLAN 50 para destinos externos em `443`, `5222`, `5228` e UDP
  - captura em `enp6s0.50` confirmou trafego bidirecional de `192.168.50.12`, `192.168.50.26` e `192.168.50.30`, incluindo HTTPS externo e check-in interno `HTTP 200`
  - DNS da VLAN 50 respondeu `NOERROR` em `dig @192.168.50.1 google.com A`
- causa operacional identificada:
  - o UFW estava com `/etc/ufw/ufw.conf` em `ENABLED=no`, apesar do servico systemd aparecer como `active (exited)`
  - `ufw status` falhava por `ip6tables`, pois a carga IPv6 impedia o UFW de listar/recarregar corretamente
  - o timer `sgcg-policy-window-reconcile.timer` executava a cada minuto e `scripts/reconcile_scheduled_policy_windows.js` reescrevia `/etc/unbound/becker/allowed.rpz` e recarregava o `unbound` mesmo quando o conteudo nao mudava
  - isso causava reload DNS recorrente e desnecessario durante o periodo de instabilidade
- correcao aplicada:
  - `scripts/reconcile_scheduled_policy_windows.js` agora compara o conteudo calculado de `allowed.rpz` com o conteudo original e so grava/recarrega o Unbound quando existe alteracao real
  - `/etc/default/ufw` foi ajustado temporariamente para `IPV6=no`, isolando a falha de `ip6tables` sem impedir a protecao IPv4 das VLANs
  - `ufw --force enable` reativou o UFW como camada oficial; `/etc/ufw/ufw.conf` voltou para `ENABLED=yes`
- validacao:
  - `node --check scripts/reconcile_scheduled_policy_windows.js` concluiu sem erro
  - `systemctl start sgcg-policy-window-reconcile.service` retornou `ok=true`, `schedules=2`, `changed=0`, `vlan30_media_active=true`
  - apos nova execucao do timer, `journalctl -u unbound --since '2026-05-27 12:17:00'` nao mostrou novo `Reloading`, `Restart`, `service stopped` ou `start of service`
  - `ufw status verbose` voltou a responder `Status: active`, `Default: deny (incoming), allow (outgoing), allow (routed)`
  - `systemctl is-active ufw unbound sgcg-vip-dns.service squid isc-dhcp-server nginx` retornou `active` para todos
  - `dig @192.168.50.1 google.com A` retornou `NOERROR`
  - `ping -4 -c 3 -W 1 -I 192.168.50.1 8.8.8.8` teve `0% packet loss`
  - `iptables -L FORWARD -n -v` confirmou counters ativos para `192.168.50.0/24`
  - `iptables -t nat -L POSTROUTING -n -v` confirmou `MASQUERADE` ativo para `192.168.50.0/24`
- pendencias:
  - reconstruir com calma o caminho IPv6 do UFW antes de voltar `IPV6=yes`
  - revisar e remover os bypasses emergenciais de `iptables` quando a rede estiver confirmada pelos usuarios
  - auditar o restante do reconciliador/firewall para reduzir dependencia de regras runtime aplicadas fora do UFW

## Retorno das regras de seguranca apos estabilizacao - 2026-05-27

- contexto:
  - apos confirmacao operacional de estabilidade, foi auditado se o `iptables` ja estava em condicao de voltar ao enforcement institucional completo
  - o UFW permaneceu como firewall oficial (`Status: active`, `Default: deny (incoming), allow (outgoing), allow (routed)`)
- achados:
  - `ufw.conf` estava em `ENABLED=yes`
  - `/etc/default/ufw` permaneceu temporariamente com `IPV6=no`, ainda como pendencia controlada do incidente de `ip6tables`
  - `/run/sgcg-firewall.lock` estava limpo
  - `iptables-save -t nat` mediu `rules=150`, `duplicates=0`
  - `iptables-save -t filter` mediu `rules=653`, `duplicates=0`
  - havia bypass emergencial ainda ativo em banco para VLAN 10 e VLAN 30; a VLAN 10 ja estava vencida e foi expirada pelo fluxo do SGCG, e a VLAN 30 foi desativada como retorno manual ao enforcement
- correcao aplicada:
  - criado snapshot antes da limpeza em `/root/sgcg-firewall-backups/iptables-before-security-restore-20260527-125847.rules`
  - VLAN 10 (`emergency_vlan_bypass.id=6`) ficou `active=false`, `deactivated_by=system-expiry`
  - VLAN 30 (`emergency_vlan_bypass.id=8`) ficou `active=false`, `deactivated_by=codex-runtime-audit`
  - removidos residuos runtime `sgcg-emergency-bypass` do `FORWARD` para `192.168.30.0/24`
  - removida a excecao DoT nft residual da `enp6s0.30`
- validacao:
  - `SELECT count(*) FROM emergency_vlan_bypass WHERE active = TRUE AND (expires_at IS NULL OR expires_at >= NOW())` retornou `0`
  - `iptables-save | rg "sgcg-emergency-bypass"` nao retornou regras
  - `nft -a list chain ip filter FORWARD` nao mostrou excecao DoT residual para `enp6s0.30`
  - `iptables-restore --test` sobre o snapshot atual retornou `iptables_restore_test_ok`
  - `systemctl is-active ufw unbound sgcg-vip-dns.service squid isc-dhcp-server nginx postgresql` retornou `active` para todos
  - `dig @192.168.50.1 google.com A` retornou endereco valido
  - `ping -4 -c 3 -W 1 -I 192.168.50.1 8.8.8.8` teve `0% packet loss`
- estado final:
  - `iptables` ficou consistente para retomada das regras de seguranca, sem duplicatas e sem bypass emergencial aberto
  - mantida a pendencia separada de reconstruir o caminho IPv6 do UFW antes de voltar `IPV6=yes`

## Ajuste do timer de agendamentos por VLAN - 2026-05-27

- contexto:
  - apos validar que os agendamentos por VLAN estavam funcionando, foi reduzida a frequencia do `sgcg-policy-window-reconcile.timer` para evitar execucoes desnecessarias a cada minuto
  - a precisao de inicio/fim dos agendamentos continua suficiente para janelas operacionais como horario de almoco e sexta-feira
- alteracao aplicada:
  - `/etc/systemd/system/sgcg-policy-window-reconcile.timer` passou de `OnUnitActiveSec=60s` para `OnUnitActiveSec=5min`
  - `AccuracySec` passou de `5s` para `30s`
  - a descricao da unit foi atualizada para `a cada 5 minutos`
  - executados `systemctl daemon-reload` e `systemctl restart sgcg-policy-window-reconcile.timer`
- validacao:
  - `systemctl status sgcg-policy-window-reconcile.timer` mostrou `active (waiting)` e proximo disparo em aproximadamente 5 minutos
  - `node --check scripts/reconcile_scheduled_policy_windows.js` concluiu sem erro
  - `node scripts/reconcile_scheduled_policy_windows.js` retornou `ok=true`, `schedules=2`, `changed=0`, `vlan30_media_active=false`
  - `journalctl -u unbound --since '5 minutes ago'` nao mostrou novo `Reloading`, `Restart`, `stopped`, `start of service`, `error`, `failed` ou `fatal`
- impacto esperado:
  - reducao de carga e ruido operacional sem perder confiabilidade pratica dos agendamentos
  - atraso maximo esperado para aplicar ou remover uma janela passa a ser de cerca de 5 minutos

## Hotspot VLAN 70 - correcao de sessao ativa sem MAC momentaneo - 2026-05-25

- sintoma relatado:
  - aparelhos conectavam normalmente na rede `VISITANTES` da `VLAN 70`, mas o sistema operacional voltava a exibir `conectado sem acesso a internet`
- causa raiz validada em runtime:
  - o login publico do Hotspot criava sessao ativa e autorizava o IP no `ipset` `sgcg_hotspot_v70_auth`
  - em seguida, consultas de contexto/CAPPORT podiam ocorrer quando a vizinhanca ARP/neighbor do Linux ainda estava `INCOMPLETE`, `FAILED` ou sem MAC resolvido
  - o endpoint `GET /api/hotspot/public/context` tratava a ausencia momentanea de MAC como falha dura e revogava sessoes ativas por IP com motivo `context_without_mac`
  - isso removia o IP do `sgcg_hotspot_v70_auth`, fazia o `generate_204` voltar a servir o portal e o Android/iOS classificava a rede como sem internet
- correcao aplicada:
  - `backend/src/modules/hotspot/hotspot-routes.ts` agora procura sessao ativa pelo IP antes de exigir MAC em `context`, `capport` e `probe`
  - quando existe sessao ativa valida por IP, o backend preserva a autorizacao runtime mesmo sem MAC momentaneo na tabela de vizinhanca
  - a revogacao automatica por `context_without_mac` foi removida desse caminho; sem MAC e sem sessao ativa, o portal apenas retorna `requires_login=true`
  - a consulta de sessao passou a expor tambem `session_mac_address`, permitindo responder com o MAC gravado na sessao quando o MAC nao foi inferido ao vivo
- reparo operacional da rodada:
  - as sessoes ainda validas `135` (`192.168.70.54`) e `137` (`192.168.70.35`), derrubadas durante o diagnostico pelo comportamento antigo, foram restauradas para `status=active`
  - os IPs `192.168.70.54` e `192.168.70.35` foram recolocados em `sgcg_hotspot_v70_auth` com timeout ativo
  - conexoes conntrack desses IPs foram limpas para evitar estado antigo apos a restauracao
- validacao:
  - `cd backend && npm run build` concluiu com sucesso
  - `pm2 restart bcc-backend --update-env` executado e `bcc-backend` ficou `online`
  - `GET /api/hotspot/public/context` com `X-Forwarded-For: 192.168.70.35` retornou `authenticated=true`, `session.runtime_authorized=true`, `mac_inferred=false`
  - `GET /api/hotspot/public/capport` com `X-Forwarded-For: 192.168.70.35` retornou `{"captive":false}`
  - `GET /generate_204` com `Host: connectivitycheck.gstatic.com` e `X-Forwarded-For: 192.168.70.35` retornou `204 No Content`
  - `GET /api/hotspot/public/context` com `X-Forwarded-For: 192.168.70.54` retornou `authenticated=true`, `session.runtime_authorized=true`, `mac_inferred=false`
  - `GET /api/hotspot/public/capport` com `X-Forwarded-For: 192.168.70.54` retornou `{"captive":false}`
  - `ipset list sgcg_hotspot_v70_auth` confirmou `192.168.70.35` e `192.168.70.54` presentes com timeout ativo

## Observabilidade Grafana/Prometheus - 2026-05-18

- objetivo:
  - instalar e deixar operacional uma camada Grafana baseada na rede real do SGCG
  - complementar o Netdata existente com dashboards persistentes, Prometheus, node_exporter e blackbox_exporter
- instalacao:
  - pacote `grafana 13.0.1-01` instalado a partir do repositorio oficial Grafana OSS ja configurado no host
  - pacote `prometheus-blackbox-exporter 0.24.0-2ubuntu0.3` instalado pelos repositorios Ubuntu Noble
  - `prometheus` e `prometheus-node-exporter` ja existiam, mas estavam mascarados; foram desmascarados, habilitados e reiniciados
- seguranca de exposicao:
  - `grafana-server` escuta apenas em `127.0.0.1:3000`
  - `prometheus` escuta apenas em `127.0.0.1:9090`
  - `prometheus-node-exporter` escuta apenas em `127.0.0.1:9100`
  - `prometheus-blackbox-exporter` escuta apenas em `127.0.0.1:9115`
  - acesso HTTP externo direto a essas portas nao foi aberto
  - Nginx publica apenas no console interno:
    - `https://console.interno.jacarezinho/grafana/`
    - `https://192.168.10.1/grafana/`
    - `https://console.interno.jacarezinho/prometheus/`
    - `https://192.168.10.1/prometheus/`
  - a senha administrativa do Grafana foi resetada e armazenada fora do repositorio em `/root/.sgcg-grafana-admin-password`
- arquivos de runtime alterados:
  - `/etc/grafana/grafana.ini`
  - `/etc/grafana/provisioning/datasources/sgcg-prometheus.yml`
  - `/etc/grafana/provisioning/datasources/sinturs-prom.yml`
  - `/etc/grafana/provisioning/dashboards/sinturs.yml`
  - `/etc/prometheus/prometheus.yml`
  - `/etc/default/prometheus-node-exporter`
  - `/etc/default/prometheus-blackbox-exporter`
  - `/etc/systemd/system/prometheus.service.d/override.conf`
  - `/etc/nginx/sites-available/console.interno.jacarezinho`
  - `/var/lib/grafana/dashboards/legacy/sgcg-gateway-rede.json`
- dashboards/probes configurados:
  - dashboard `SGCG - Gateway e Rede`
  - datasource padrao `SGCG Prometheus`
  - metricas de CPU, memoria, disco e trafego por interface
  - interfaces contempladas: `enp8s0`, `enp6s0`, `enp6s0.10`, `enp6s0.30`, `enp6s0.40`, `enp6s0.50`, `enp6s0.70`, `enp6s0.80`, `enp6s0.99`, `wg0`, `ifb10`, `ifb30`, `ifb40`, `ifb50`, `ifb70`, `ifb80`
  - probes ICMP dos gateways/enderecos:
    - `192.168.10.1`, `192.168.30.1`, `192.168.40.1`, `192.168.50.1`, `192.168.70.1`, `192.168.80.1`, `192.168.99.1`, `10.8.0.1`, `186.251.14.26`
  - probes HTTP de servicos locais:
    - Netdata `127.0.0.1:19999`
    - backend core `127.0.0.1:6778/health`
    - frontend interno `127.0.0.1:6777`
    - backend-proxy `127.0.0.1:6779/health`
  - probes HTTP das cameras VLAN 40:
    - `192.168.40.102` a `192.168.40.107`
- ajuste operacional:
  - `prometheus-blackbox-exporter` recebeu capability `cap_net_raw=ep` para permitir probes ICMP sem executar o servico como root
  - dashboards legados foram separados em `/var/lib/grafana/dashboards/legacy` para evitar conflito de resource manager do Grafana 13
- validacao:
  - `promtool check config /etc/prometheus/prometheus.yml` concluido com sucesso
  - `nginx -t` concluido com sucesso; apenas avisos preexistentes de vhosts duplicados/protocol options foram exibidos
  - `grafana-server`, `prometheus`, `prometheus-node-exporter`, `prometheus-blackbox-exporter` e `nginx` ficaram `active`
  - `ss -lntup` confirmou todas as portas do stack de observabilidade presas a `127.0.0.1`
  - `curl http://127.0.0.1:3000/grafana/api/health` retornou `database=ok`
  - `curl http://127.0.0.1:9090/prometheus/-/ready` retornou `Prometheus Server is Ready`
  - Nginx interno retornou `302` para `/grafana/` e `200` para `/prometheus/-/ready`
  - API do Grafana confirmou datasource `SGCG Prometheus` como padrao e dashboard `SGCG - Gateway e Rede`
  - API do Prometheus confirmou todos os targets ativos como `up`

## RAG operacional local - 2026-05-18

- objetivo:
  - implementar a primeira camada RAG do SGCG sobre a base local de conhecimento e sinais vivos do ambiente
  - permitir perguntas operacionais com resposta auditavel e fontes recuperadas, sem depender inicialmente de provider externo de IA
- decisao de arquitetura:
  - a primeira versao e `local-extractive-rag`
  - nao envia documentos, logs, IPs, politicas ou evidencias sensiveis para fora do SGCG
  - usa recuperacao lexical local sobre documentos e configuracoes, somada a snapshot ao vivo do Prometheus
  - a resposta e deliberadamente baseada em trechos recuperados e fontes, nao em geracao livre
  - um LLM externo pode ser plugado depois, desde que haja politica explicita de dados e mascaramento
- backend:
  - criado `backend/src/modules/control/rag-service.ts`
  - adicionadas rotas autenticadas no modulo `Operacoes Tecnicas`:
    - `GET /api/control/ai-rag/status`
    - `POST /api/control/ai-rag/ask`
    - `POST /api/control/ai-rag/reindex`
  - o indice local contempla:
    - `CODEX.md`
    - `RESUMO_TECNICO_SGCG.md`, quando existente
    - `DOCUMENTACAO_PROJETO.md`
    - `pontorh.md`, quando existente
    - `docs/`
    - `backend-proxy/docs/`
    - `instalador/docs/`
    - `/etc/prometheus/prometheus.yml`
    - `/etc/grafana/provisioning/datasources/sgcg-prometheus.yml`
    - snapshot runtime `runtime://prometheus-targets`
  - o indice e mantido em memoria com TTL curto e pode ser reindexado sob demanda pela rota autenticada
  - cada resposta retorna:
    - `mode`
    - `question`
    - `answer`
    - `confidence`
    - `sources`
    - estado runtime do Prometheus
- frontend:
  - `frontend/src/pages/Control.jsx` recebeu a secao `RAG operacional`
  - a tela permite:
    - ver quantidade de trechos e fontes indexadas
    - ver readiness/targets do Prometheus
    - reindexar a base local
    - perguntar sobre VLAN, Prometheus, Grafana, Hotspot, DNS, QoS, bloqueios ou sintomas operacionais
    - visualizar resposta e fontes recuperadas
- validacao:
  - `cd backend && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend --update-env` executado e processo ficou `online`
  - `pm2 restart bcc-frontend --update-env` executado e processo ficou `online`
  - `GET /api/control/ai-rag/status` autenticado retornou:
    - `chunks=388`
    - `sources=17`
    - `prometheus_ready=true`
    - `prometheus_targets_up=22`
    - `prometheus_targets_down=0`
  - `POST /api/control/ai-rag/ask` autenticado com a pergunta `Como está a observabilidade Grafana e Prometheus do SGCG?` retornou:
    - `mode=local-extractive-rag`
    - `confidence=medium`
    - `source_count=6`
    - resposta com fontes locais, incluindo `CODEX.md` e datasource Grafana/Prometheus
  - `https://127.0.0.1:6777/control` retornou HTTP `200`

## RAG operacional - conector Gemini opcional - 2026-05-18

- objetivo:
  - preparar o RAG operacional para usar `gemini-2.5-flash` como IA externa sem quebrar o fallback local
- backend:
  - `backend/src/config/env.ts` passou a ler:
    - `AI_PROVIDER`
    - `GEMINI_MODEL`
    - `GEMINI_API_KEY` ou `GOOGLE_API_KEY`
  - `backend/src/modules/control/rag-service.ts` passou a:
    - tentar chamada REST oficial do Gemini quando `AI_PROVIDER=gemini` e houver chave
    - enviar apenas contexto recuperado e mascarado por `maskSensitive`
    - limitar temperatura e tamanho de resposta
    - retornar `provider`, `model`, `external_ai_used` e `external_ai_error`
    - manter fallback automatico para `local-extractive-rag` em caso de erro, cota, permissao ou timeout
  - `backend/.env.example` recebeu as variaveis sem segredo
- frontend:
  - a secao `RAG operacional` em `frontend/src/pages/Control.jsx` passou a indicar se a IA externa foi usada ou se a resposta veio do fallback local
  - quando o Gemini falha, a interface mostra o motivo resumido e preserva a resposta local
- runtime:
  - `backend/.env` local foi configurado com `AI_PROVIDER=gemini`, `GEMINI_MODEL=gemini-2.5-flash` e a chave informada pelo operador
  - a chave nao foi registrada neste documento e deve permanecer fora do Git
- validacao:
  - documentacao oficial Google consultada para endpoint REST `generateContent` com `gemini-2.5-flash`
  - `cd backend && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend --update-env` executado e processo ficou `online`
  - `pm2 restart bcc-frontend --update-env` executado e processo ficou `online`
  - chamada autenticada ao RAG tentou Gemini e retornou fallback local com:
    - `external_ai_used=false`
    - `external_ai_error=Gemini HTTP 403`
    - `prometheus_ready=true`
    - `prometheus_targets_up=22`
    - `prometheus_targets_down=0`
  - teste direto contra `generativelanguage.googleapis.com` retornou:
    - `status=403`
    - `PERMISSION_DENIED`
    - mensagem `The caller does not have permission`
- pendencia operacional:
  - habilitar/autorizar a Gemini API no projeto da chave ou gerar nova chave valida no Google AI Studio
  - apos a correcao da chave, repetir `POST /api/control/ai-rag/ask` e confirmar `external_ai_used=true`

## RAG operacional - Gemini validado - 2026-05-18

- objetivo:
  - substituir a chave Gemini sem registrar segredo em Git ou documentacao
  - validar uso real do `gemini-2.5-flash` no RAG operacional
- runtime:
  - `backend/.env` teve `GEMINI_API_KEY` substituida pela nova chave informada pelo operador
  - `AI_PROVIDER=gemini` e `GEMINI_MODEL=gemini-2.5-flash` foram preservados
  - `pm2 restart bcc-backend --update-env` aplicado para carregar o novo ambiente
- validacao:
  - chamada direta REST para `generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` retornou:
    - `status=200`
    - texto `ok`
  - chamada autenticada ao RAG com a pergunta `Resuma o estado do Prometheus e Grafana do SGCG em uma resposta curta.` retornou:
    - `mode=gemini-rag`
    - `provider=gemini`
    - `model=gemini-2.5-flash`
    - `external_ai_used=true`
    - `external_ai_error=null`
    - `prometheus_ready=true`
    - `prometheus_targets_up=22`
    - `prometheus_targets_down=0`
  - a resposta do Gemini citou evidencias de Prometheus/Grafana e manteve o proximo passo em modo seguro/observacional
- seguranca:
  - a chave nao foi escrita no `CODEX.md`
  - `backend/.env` permanece fora do fluxo de commit e com permissao restrita
  - o RAG continua com fallback local se a API externa falhar

## Assistente IA em chat - 2026-05-18

- objetivo:
  - transformar o RAG operacional em uma experiencia clara de chat no SGCG
  - evitar que o operador precise localizar a pergunta/resposta apenas dentro de `Operacoes Tecnicas`
- frontend:
  - criada pagina `frontend/src/pages/AiAssistant.jsx`
  - adicionada rota autenticada `/assistente-ia`
  - adicionado item `Assistente IA` no menu `Controle`
  - o chat mantem historico local curto no navegador em `sgcg_ai_assistant_thread_v1`
  - cada resposta exibe:
    - conteudo da resposta
    - provider/modelo usado
    - estado de fallback local ou Gemini
    - confianca
    - targets Prometheus up quando disponivel
    - fontes recuperadas em painel expansivel
  - perguntas rapidas foram adicionadas para temas comuns como Prometheus/Grafana, VLAN 70, RAG e Hotspot
- backend:
  - a tela usa as rotas ja existentes:
    - `GET /api/control/ai-rag/status`
    - `POST /api/control/ai-rag/ask`
- validacao:
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-frontend --update-env` executado e processo ficou `online`
  - `https://127.0.0.1:6777/assistente-ia` retornou HTTP `200`
  - chamada autenticada ao RAG pelo endpoint usado pelo chat retornou em uma tentativa:
    - `mode=gemini-rag`
    - `provider=gemini`
    - `model=gemini-2.5-flash`
    - `external_ai_used=true`
  - outra tentativa retornou `Gemini HTTP 503` e caiu corretamente no fallback:
    - `mode=local-extractive-rag`
    - `provider=local`
    - `external_ai_used=false`
  - conclusao operacional: o chat esta publicado e resiliente a oscilacao da API externa Gemini

## VIP auditado por DNS - 2026-05-13

- objetivo:
  - manter o usuario `VIP` com bypass real de bloqueios, RPZ e proxy, mas registrar a navegacao DNS classica para auditoria forense
  - caso validado inicialmente: `192.168.10.45`
- arquivos alterados:
  - `backend-proxy/src/services/blocking-release-schema-service.ts`
  - `backend-proxy/src/services/blocking-release-service.ts`
  - `backend-proxy/src/services/dns-contingency-service.ts`
  - `backend-proxy/src/dns-radar-ingester.ts`
  - `backend-proxy/src/services/dns-radar-service.ts`
  - `frontend/src/pages/BlockingReleases.jsx`
  - `/etc/unbound/sgcg-vip-clean.conf`
- schema e persistencia:
  - `policy_exceptions` ganhou `dns_audit_enabled BOOLEAN NOT NULL DEFAULT TRUE`
  - `dns_vip` ganhou `dns_audit_enabled BOOLEAN NOT NULL DEFAULT TRUE`
  - novas excecoes VIP passam a nascer com auditoria DNS ativa por padrao
  - a tela `Bloqueios e Liberacoes` passou a exibir e permitir alternar `Auditoria DNS do VIP`
- runtime:
  - VIP com auditoria ativa continua fora de RPZ/proxy/bloqueios comuns
  - consultas DNS classicas `UDP/53` e `TCP/53` do VIP sao redirecionadas para o resolvedor limpo `sgcg-vip-dns.service` na porta `5355`
  - `sgcg-vip-dns.service` foi ajustado com `log-queries: yes` e `log-replies: yes`
  - `dns-radar-ingester` passou a ler dois fluxos:
    - `journalctl -fu unbound`
    - `journalctl -fu sgcg-vip-dns.service`
  - eventos vindos do resolvedor VIP limpo entram em `dns_policy_events.resolver = 'unbound-vip-clean'`
  - para evitar fuga silenciosa da auditoria, `DoT TCP/853` e rejeitado para VIP auditado antes do ACCEPT geral
  - `DoH` sobre `443` permanece indistinguivel de HTTPS comum sem proxy/endpoint agent, portanto nao e bloqueado para nao quebrar navegacao VIP
- PontoRH/OpenDNS preservado:
  - a excecao hardcoded `208.67.222.222` e `208.67.220.220` continua antes da captura DNS do VIP
  - validacao runtime mostrou, para `192.168.10.45`, `RETURN` especifico para OpenDNS nas linhas 20-23 do `iptables-save -t nat`, antes do `REDIRECT --to-ports 5355` nas linhas 24-25
- validacao:
  - `cd backend-proxy && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso
  - `unbound-checkconf -f /etc/unbound/sgcg-vip-clean.conf` concluido com sucesso
  - `systemctl restart sgcg-vip-dns.service` executado e servico ficou ativo
  - `pm2 restart backend-proxy --update-env` executado e processo ficou `online`
  - `pm2 restart bcc-frontend --update-env` executado e processo ficou `online`
  - banco validado:
    - `policy_exceptions.id=34`, `ip=192.168.10.45`, `dns_audit_enabled=t`
    - `dns_vip.id=73`, `dns_audit_enabled=t`
  - `journalctl -u sgcg-vip-dns.service` registrou consultas reais de `192.168.10.45`, incluindo `www.gstatic.com`
  - `dns_policy_events` ja recebeu eventos `resolver='unbound-vip-clean'` nos ultimos 30 minutos

## Relatorios Forenses - agrupamento por site principal - 2026-05-13

- objetivo:
  - reduzir poluicao visual nos relatorios sem perder evidencia tecnica
  - aplicar o agrupamento para todos os usuarios e fontes de navegacao, nao apenas para VIPs
- decisao funcional:
  - o relatorio passa a separar:
    - `site principal`: dominio normalizado para leitura humana, exemplo `simepar.br`
    - `evidencia tecnica`: dominio real consultado, exemplo `produtos.simepar.br` ou `lb01.simepar.br`
  - a visao padrao de navegacao virou `Por site`
  - a visao `Eventos tecnicos` continua disponivel para investigacao forense detalhada
  - a visao `Agrupado por IP` passou a contar `Sites unicos`, preservando a contagem tecnica no backend
- arquivos alterados:
  - `backend/src/modules/reports/reports-service.ts`
  - `backend/src/modules/reports/reports-routes.ts`
  - `frontend/src/pages/Reports.jsx`
- backend:
  - criada funcao PostgreSQL `sgcg_site_domain(raw_domain TEXT)`
  - a funcao normaliza subdominios comuns para o site principal:
    - `www.simepar.br` -> `simepar.br`
    - `produtos.simepar.br` -> `simepar.br`
    - `lb01.simepar.br` -> `simepar.br`
    - `www.google.com.br` -> `google.com.br`
    - `api.jacarezinho.pr.gov.br` -> `jacarezinho.pr.gov.br`
  - novo endpoint interno:
    - `GET /api/reports/navigation/by-site`
  - `GET /api/reports/navigation` agora retorna `site_domain` e `technical_domain`
  - filtros por dominio passam a procurar tanto no dominio tecnico quanto no site principal
  - exportacao PDF de navegacao passa a exibir `Site principal`
- frontend:
  - `Relatorios Forenses` passou a abrir por padrao na visao `Por site`
  - adicionada tabela com:
    - site principal
    - total de eventos
    - bloqueados/liberados
    - IPs envolvidos
    - dominios tecnicos associados
    - fontes DNS/Proxy/UFW
    - ultimo acesso
  - a tabela de eventos tecnicos mostra o site principal em destaque e o dominio tecnico em linha secundaria
- validacao:
  - `cd backend && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend --update-env` executado e processo ficou `online`
  - `pm2 restart bcc-frontend --update-env` executado e processo ficou `online`
  - `reportsService.ensureSchema()` executado com sucesso no backend compilado
  - consulta de validacao confirmou:
    - `www.simepar.br`, `produtos.simepar.br` e `lb01.simepar.br` normalizam para `simepar.br`
    - no periodo de 24h, `simepar.br` agrupou 8 eventos, 1 IP e 3 dominios tecnicos
    - evento tecnico preservou `technical_domain=produtos.simepar.br` e exibiu `site_domain=simepar.br`

## Relatorios Forenses - correcao de PDF sem paginas em branco - 2026-05-13

- arquivo alterado:
  - `backend/src/modules/reports/reports-service.ts`
- problema:
  - ao exportar PDF de relatorios, o documento podia alternar uma pagina com conteudo e uma pagina em branco
  - causa provavel: o rodape escrevia texto muito proximo da margem inferior; o PDFKit criava uma nova pagina automaticamente, e em seguida o codigo criava outra pagina manualmente
- correcao:
  - o rodape dos PDFs de navegacao e auditoria foi reposicionado para dentro da area util da pagina
  - as linhas do rodape passaram a usar `lineBreak: false`, evitando quebra automatica que empurre conteudo para uma pagina nova
  - a imagem/logo da JMB foi removida dos PDFs
  - o rodape agora mantem apenas o texto `JMB Tecnologia`
- validacao:
  - `cd backend && npm run build` concluido com sucesso
  - PDF de navegacao gerado em `/tmp/relatorio-navegacao-test.pdf`
    - `pdfinfo`: `Pages: 46`
    - `pdftotext`: `text_pages=46`, sem paginas em branco
  - PDF de auditoria gerado em `/tmp/relatorio-auditoria-test.pdf`
    - `pdfinfo`: `Pages: 28`
    - `pdftotext`: `text_pages=28`, sem paginas em branco

## Relatorios Forenses - PDF limpo e PDF forense - 2026-05-13

- objetivo:
  - permitir PDF personalizado e limpo para leitura humana, sem perder o PDF tecnico de evidencia
- arquivos alterados:
  - `backend/src/modules/reports/reports-service.ts`
  - `backend/src/modules/reports/reports-routes.ts`
  - `frontend/src/pages/Reports.jsx`
- backend:
  - criada exportacao `exportNavigationCleanPdf`
  - criada rota `GET /api/reports/navigation/export-clean.pdf`
  - o PDF limpo agrupa por:
    - IP
    - usuario/identidade
    - site principal normalizado
  - o PDF limpo exibe:
    - acessos
    - sites
    - IPs
    - bloqueados
    - dominios tecnicos
    - primeiro acesso
    - ultimo acesso
    - evidencia tecnica resumida
  - o PDF forense tecnico permanece em `GET /api/reports/navigation/export.pdf`
- frontend:
  - o botao unico `Exportar PDF` foi separado em:
    - `PDF limpo`
    - `PDF forense`
  - `PDF limpo` usa `/api/reports/navigation/export-clean.pdf`
  - `PDF forense` usa `/api/reports/navigation/export.pdf`
- validacao:
  - `cd backend && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso
  - `git diff --check` concluido sem alertas
  - PDF limpo de teste gerado em `/tmp/relatorio-navegacao-limpo-test.pdf`
    - `pdfinfo`: `Pages: 39`
    - `pdftotext`: `text_pages=39`, sem paginas em branco
    - texto validado: `Relatório Limpo de Navegação` e `JMB Tecnologia`
  - PDF forense de teste gerado em `/tmp/relatorio-navegacao-forense-test.pdf`
    - `pdfinfo`: `Pages: 46`
    - `pdftotext`: `text_pages=46`, sem paginas em branco
    - texto validado: `Relatório Forense de Navegação` e `JMB Tecnologia`

## Contingencia DNS - Google e OpenDNS nos resolvedores autorizados - 2026-05-13

- objetivo:
  - incluir Google DNS e OpenDNS na lista de resolvedores publicos autorizados da contingencia, junto dos provedores ja existentes
- arquivos alterados:
  - `backend-proxy/src/services/dns-contingency-service.ts`
  - `frontend/src/pages/BlockingReleases.jsx`
- backend:
  - `DEFAULT_PROVIDERS` passou a incluir:
    - `google`
    - `cloudflare`
    - `quad9`
    - `opendns`
  - catalogo efetivo validado:
    - Google DNS: `8.8.8.8`, `8.8.4.4`
    - Cloudflare: `1.1.1.1`, `1.0.0.1`
    - Quad9: `9.9.9.9`, `149.112.112.112`
    - OpenDNS: `208.67.222.222`, `208.67.220.220`
- frontend:
  - a tela `Contingencia DNS` passou a exibir `OpenDNS` como provedor selecionavel em `Resolvedores publicos autorizados`
  - a selecao padrao do dialogo de ativacao/renovacao agora vem com `Google DNS`, `Cloudflare`, `Quad9` e `OpenDNS`
- banco/runtime:
  - `dns_contingency_state.providers` foi atualizado para `["google","cloudflare","quad9","opendns"]`
  - `dns_contingency_state.resolvers` foi atualizado com os oito IPs publicos correspondentes
  - o estado atual estava `expired`, portanto a mudanca nao abriu contingencia ativa nem alterou o bloqueio vigente de DNS
  - a excecao permanente PontoRH/OpenDNS continua separada em `permanent_work_dns_resolvers`
- validacao:
  - `cd backend-proxy && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso
  - `git diff --check` concluido sem alertas
  - `pm2 restart backend-proxy --update-env` executado e `backend-proxy` ficou `online`
  - `pm2 restart bcc-frontend --update-env` executado e `bcc-frontend` ficou `online`
  - `dnsContingencyService.getStatus()` confirmou:
    - `providers=["google","cloudflare","quad9","opendns"]`
    - `resolvers=["8.8.8.8","8.8.4.4","1.1.1.1","1.0.0.1","9.9.9.9","149.112.112.112","208.67.222.222","208.67.220.220"]`
    - `permanent_work_dns_resolvers=["208.67.222.222","208.67.220.220"]`
  - `https://127.0.0.1:6777/bloqueios-liberacoes` passou a servir o bundle `dist/assets/index-BN91Vkrh.js`

## Governanca - reducao de poluicao visual sem perda funcional - 2026-05-13

- arquivos alterados:
  - `frontend/src/components/Sidebar.jsx`
  - `frontend/src/components/ui/Sidebar.jsx`
  - `frontend/src/App.jsx`
  - `frontend/src/pages/Dashboard.jsx`
  - `frontend/src/pages/GovernancePolicies.jsx`
  - `frontend/src/pages/GovernanceCompliance.jsx`
  - `frontend/src/pages/GovernanceAudit.jsx`
- decisao de produto:
  - a area de `Governanca` deixou de expor todos os modulos como itens equivalentes na primeira camada da sidebar
  - a navegacao principal foi reorganizada por intencao de uso, preservando as rotas e funcionalidades antigas
  - novas portas de entrada:
    - `Painel Executivo`
    - `Politicas e Excecoes`
    - `Conformidade e Dados`
    - `Auditoria e Evidencias`
- funcionalidades preservadas:
  - `Governanca Visual` continua acessivel pelo painel executivo e pela rota `/governanca-visual`
  - `Politicas Institucionais`, `Aprovacoes & Excecoes`, `Excecoes VIP`, `Excecoes Temporarias`, `Contingencia DNS` e `Telemetria` continuam acessiveis por atalhos internos
  - `LGPD & Protecao de Dados` e `Governanca de Dados` continuam completos, agora agrupados em `Conformidade e Dados`
  - `Relatorios Forenses`, `Central de Chamados`, `Identidades & Perfis` e `Configuracoes Institucionais` continuam acessiveis por `Auditoria e Evidencias`
- ajuste tecnico:
  - o componente base da sidebar passou a aceitar `matchPaths`, permitindo que uma rota antiga mantenha o agrupamento visual ativo no novo menu
  - foram criadas tres paginas-guia novas:
    - `/governanca-politicas`
    - `/governanca-conformidade`
    - `/governanca-auditoria`
  - o `Centro de Governanca` ganhou atalhos para as quatro frentes, reduzindo dependencia da sidebar como indice de todos os modulos
- validacao:
  - `git diff --check` concluido sem alertas
  - `cd frontend && npm run build` concluido com sucesso
  - bundle gerado:
    - `dist/assets/index-BCSHdG3X.js`
    - `dist/assets/index-CG-AepbR.css`
  - `pm2 restart bcc-frontend --update-env` executado com sucesso e `bcc-frontend` ficou `online`
  - `curl -sk https://127.0.0.1:6777/governanca-politicas` serviu o HTML do app com o novo bundle
  - `curl -sk https://127.0.0.1:6777/governanca-conformidade` serviu o HTML do app com o novo bundle
  - `curl -sk https://127.0.0.1:6777/governanca-auditoria` serviu o HTML do app com o novo bundle
- correcao imediata apos publicacao:
  - identificado erro runtime `Uncaught ReferenceError: LayoutDashboard is not defined`
  - causa: o item `Continuidade & Backup` da secao `Controle` continuava usando o icone `LayoutDashboard`, mas o import havia sido removido durante a limpeza da sidebar
  - correcao aplicada em `frontend/src/components/Sidebar.jsx`, restaurando o import de `LayoutDashboard`
  - `git diff --check` concluido sem alertas
  - `cd frontend && npm run build` concluido com sucesso
  - novo bundle gerado: `dist/assets/index-Ch0VvhYO.js`
  - `pm2 restart bcc-frontend --update-env` executado com sucesso
  - `https://console.jacarezinho.cloud/` passou a referenciar `/assets/index-Ch0VvhYO.js`

## LGPD - linguagem de gestao governamental e auditoria humana - 2026-05-13

- arquivos alterados:
  - `frontend/src/pages/Lgpd.jsx`
  - `backend/src/modules/lgpd/lgpd-service.ts`
- decisao de produto:
  - o modulo deixou de se apresentar como uma tela juridica centrada em artigos da LGPD
  - a experiencia passou a falar como governanca de gestores publicos:
    - `Painel de Gestao`
    - `Dados sob Responsabilidade`
    - `Pedidos de Pessoas`
    - `Incidentes e Riscos`
    - `Evidencias e Auditoria`
  - a base legal continua visivel, mas como sustentacao discreta, nao como linguagem principal da operacao
- correcao do painel executivo:
  - o painel passou a calcular resumo local a partir de atividades, pedidos e incidentes carregados, alem do resumo vindo do backend
  - se o endpoint de dashboard vier zerado, mas as listas tiverem registros, a tela usa o maior valor entre resumo do servidor e dados locais
  - quando nao houver registros reais, o painel exibe estado vazio orientado a acao, com atalhos para `Mapear dados` e `Registrar pedido`, evitando a sensacao de modulo quebrado
  - KPIs passaram a usar linguagem de gestao:
    - `Areas com dados pessoais`
    - `Riscos relevantes`
    - `Pedidos em andamento`
    - `Incidentes em aberto`
- auditoria aprimorada:
  - `Tipo` virou `Area afetada`
  - `Acao` virou `O que aconteceu`
  - valores tecnicos como `processing`, `request`, `incident`, `create`, `update` passaram a ser traduzidos para linguagem humana:
    - `Dados sob responsabilidade`
    - `Pedido de pessoa`
    - `Incidente ou risco`
    - `Estrutura de governanca`
    - `Registro criado`
    - `Registro atualizado`
    - `Estrutura institucional atualizada`
  - o codigo tecnico da acao continua aparecendo como detalhe secundario para auditoria
  - a aba de acesso passou a traduzir eventos como `auth.login` para `Entrada no sistema`
- ajuste backend:
  - atualizacao da estrutura institucional LGPD passou a registrar `entityType=program`, em vez de cair como `processing`
  - isso melhora as novas evidencias daqui para frente, exibindo a area afetada correta como `Estrutura de governanca`
- validacao:
  - `cd backend && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso
  - bundle gerado: `dist/assets/index-CMmZy8V7.js`
  - `pm2 restart bcc-backend --update-env` executado e `bcc-backend` ficou `online`
  - `pm2 restart bcc-frontend --update-env` executado e `bcc-frontend` ficou `online`
  - `curl -s http://127.0.0.1:6778/api/ping` respondeu `{"msg":"Pong HTTP (Core 6778)"}`
  - `https://console.jacarezinho.cloud/` passou a referenciar `/assets/index-CMmZy8V7.js`
  - `git diff --check` concluido sem alertas

## Aviso de Privacidade publico do SGCG - 2026-05-13

- arquivos alterados:
  - `frontend/src/pages/PrivacyNotice.jsx`
  - `frontend/src/App.jsx`
  - `frontend/src/pages/Login.jsx`
  - `frontend/src/pages/Lgpd.jsx`
- publicacao:
  - criada pagina publica em `/aviso-de-privacidade`
  - URL publicada:
    - `https://console.jacarezinho.cloud/aviso-de-privacidade`
  - a pagina nao exige login e e renderizada antes do bloqueio de autenticacao do console
- conteudo institucional:
  - identifica a Prefeitura Municipal de Jacarezinho/PR como controladora
  - identifica a JMB Tecnologia como mantenedora tecnica da plataforma
  - explica, em linguagem direta, categorias de dados tratados pelo SGCG:
    - dados cadastrais
    - autenticacao
    - CPF quando necessario
    - telefone
    - IP
    - MAC
    - VLAN
    - sessoes
    - chamados
    - evidencias de auditoria
    - metadados tecnicos de navegacao institucional
  - descreve finalidades de uso:
    - seguranca da rede
    - controle governamental
    - atendimento
    - auditoria
    - investigacao de incidentes
    - prestacao de contas
  - cita LGPD, Lei nº 13.709/2018, e Marco Civil da Internet como base de responsabilidade publica
- atualizacao do frontend:
  - a tela de login passou a exibir link publico `Aviso de privacidade`
  - o modulo `Protecao de Dados e Responsabilidade Publica` passou a apontar para `/aviso-de-privacidade` como aviso publicado, mesmo se o campo ainda estiver vazio no banco
  - o formulario de estrutura de governanca tambem passa a sugerir `/aviso-de-privacidade` como URL padrao
- validacao:
  - `cd frontend && npm run build` concluido com sucesso
  - bundle gerado:
    - `dist/assets/index-B5seWAr-.js`
    - `dist/assets/index-DDNUdMS7.css`
  - `pm2 restart bcc-frontend --update-env` executado com sucesso
  - `curl -sk https://console.jacarezinho.cloud/aviso-de-privacidade` serviu o HTML do app com o novo bundle
  - `rg` no bundle confirmou presenca do texto `Aviso de Privacidade do Sistema de Governança e Controle Governamental`
  - `git diff --check` concluido sem alertas

## LGPD - populacao inicial de governanca publica - 2026-05-13

- arquivo criado:
  - `backend/src/scripts/342_seed_lgpd_governance.ts`
- objetivo:
  - popular o modulo `Protecao de Dados e Responsabilidade Publica` com dados institucionais plausiveis para deixar o painel, inventario, pedidos, incidentes e evidencias auditaveis utilizaveis imediatamente
  - evitar dados ficticios genericos e alinhar o conteudo ao SGCG real, incluindo Hotspot, Acesso Mobile, Relatorios Forenses, Observabilidade DNS/Proxy/Firewall, Usuarios e Continuidade
- estrategia:
  - script idempotente por nome/titulo
  - se um registro ja existe, o script atualiza
  - se nao existe, o script cria
  - a auditoria registra cada criacao/atualizacao como evidencia institucional
- estrutura institucional populada:
  - controlador: `Prefeitura Municipal de Jacarezinho/PR`
  - unidade: `Governanca de Dados e Controle Institucional`
  - operador/mantenedor tecnico nos tratamentos: `JMB Tecnologia`
  - aviso de privacidade: `/aviso-de-privacidade`
- dados populados:
  - `8` areas/tratamentos de dados pessoais:
    - `Acesso ao Console SGCG`
    - `Hotspot Institucional de Visitantes`
    - `Acesso Mobile de Colaboradores`
    - `Relatorios Forenses de Navegacao`
    - `Central de Chamados Institucional`
    - `Gestao de Usuarios e Perfis`
    - `Observabilidade DNS, Proxy e Firewall`
    - `Backups e Continuidade Operacional`
  - `4` pedidos de pessoas:
    - acesso aos dados
    - correcao de dados
    - confirmacao de tratamento
    - informacao sobre compartilhamento
  - `3` incidentes/riscos:
    - tentativas de login recusadas
    - revisao de relatorio com dados tecnicos de navegacao
    - correcao de cadastro de visitante no Hotspot
- validacao:
  - `cd backend && npx ts-node src/scripts/342_seed_lgpd_governance.ts` executado com sucesso
  - saida validada:
    - `processing=8`
    - `requests=4`
    - `incidents=3`
    - `audit=80`
  - `cd backend && npm run build` concluido com sucesso apos mover o script para `src/scripts`
  - `cd frontend && npm run build` ja havia concluido com sucesso no bundle vigente
  - `git diff --check` concluido sem alertas

## Commit de coerencia com producao - pendencias incorporadas - 2026-05-12

- arquivos incluidos junto da rodada de auditoria:
  - `backend/src/config/env.ts`
  - `backend/src/modules/collaborators/collaborators-routes.ts`
  - `backend/src/modules/qos/qos-routes.ts`
  - `backend/340_set_smsgate_credentials.sh`
  - `backend/341_autobind_smsgate_sender.sh`
- revisao de coerencia:
  - as variaveis `HOTSPOT_SMS_*` seguem o runtime ja usado pelo Hotspot/SMSGate e nao carregam segredo hardcoded no codigo
  - `340_set_smsgate_credentials.sh` recebe usuario/senha por argumento e atualiza apenas o `.env` local, reiniciando `bcc-backend`
  - `341_autobind_smsgate_sender.sh` le `/etc/sgcg/smsgate/config.yml`, vincula `HOTSPOT_SMS_USER_ID`, `HOTSPOT_SMS_DEVICE_ID`, `HOTSPOT_SMS_JWT_SECRET` e `HOTSPOT_SMS_JWT_ISSUER` no `.env` local e nao publica esses valores no repositorio
  - o Colaborador passou a garantir o `ipset` `sgcg_collab_v30_auth` reutilizando o set existente quando houver diferenca de timeout, seguindo o endurecimento ja validado no Hotspot
  - o QoS passou a preservar a classe default real retornada pelo `tc`, sem converter `0xNN` para decimal e divergir da nomenclatura do kernel
- validacao:
  - `git diff --check` concluido sem alertas
  - `cd backend && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend --update-env` e `pm2 restart bcc-frontend --update-env` ja executados na rodada

## Governanca Visual - cockpit executivo com graficos investigaveis - 2026-05-12

- arquivos alterados:
  - `backend/src/modules/reports/reports-service.ts`
  - `backend/src/modules/reports/reports-routes.ts`
  - `frontend/src/pages/GovernanceVisual.jsx`
  - `frontend/src/pages/Reports.jsx`
  - `frontend/src/App.jsx`
  - `frontend/src/components/Sidebar.jsx`
- ajuste aplicado:
  - mantida a divisao entre `Governanca` e `Controle`, com nova ponte visual para investigacao tecnica
  - criado o endpoint `GET /api/reports/governance-visual`, que consolida indicadores executivos a partir de `navigation_events`
  - criado o menu `Governanca Visual` dentro da secao de Governanca
  - a nova tela apresenta cards executivos, linha do tempo, donut de fontes, grafico por VLAN, categorias bloqueadas, dominios bloqueados/liberados, clientes que exigem atencao, regras acionadas, origem institucional das sessoes e picos/anomalias
  - todos os graficos principais sao clicaveis e encaminham para `Relatorios Forenses` com filtros de periodo, fonte, VLAN, dominio, IP ou acao
  - `Relatorios Forenses` passou a inicializar seus filtros a partir da URL, permitindo que a Governanca Visual abra a investigacao ja filtrada
- objetivo de produto:
  - entregar uma camada visual para gestores baterem o olho em graficos e questionarem pontos concretos sem perder a rastreabilidade tecnica
  - transformar os graficos em entrada de investigacao, nao apenas ornamento de dashboard
- validacao:
  - `cd backend && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso e gerou o bundle `index-ClyBChx_.js`
  - `pm2 restart bcc-backend --update-env` e `pm2 restart bcc-frontend --update-env` executados com sucesso
  - chamada direta ao servico compilado `reportsService.getGovernanceVisual({ period: '24h' })` retornou `122406` eventos, `16325` bloqueios, `121910` eventos DNS/RPZ, `478` eventos UFW, `25` buckets horarios e anomalias calculadas
  - `https://127.0.0.1:6777/governanca-visual` serviu os assets `index-ClyBChx_.js` e `index-IATdg7vs.css`
  - `https://127.0.0.1:6777/relatorios?tab=navigation&source=ufw&period=24h` serviu o mesmo bundle, validando a rota de investigacao filtrada

## Relatorios Forenses - auditoria unificada de navegacao - 2026-05-12

- arquivos alterados:
  - `backend/src/modules/reports/reports-service.ts`
  - `backend/src/modules/reports/reports-routes.ts`
  - `frontend/src/pages/Reports.jsx`
- ajuste aplicado:
  - o modulo de Relatorios passou a consolidar evidencias de navegacao na tabela imutavel `navigation_events`
  - o consolidado registra `source_type`, `source_event_id`, horario, IP, VLAN, MAC quando disponivel, identidade, sessao vinculada, dominio/URL, metodo, status, bytes, acao, categoria, regra aplicada, politica, confianca e evidencia bruta em `jsonb`
  - as fontes ativas nesta rodada sao:
    - `dns`: eventos de `dns_policy_events`, cobrindo DNS/RPZ, categoria, regra e politica aplicada
    - `proxy`: eventos de `proxy_audit_log`, cobrindo ACL/proxy, URL/SNI, metodo, status, bytes e acao
    - `ufw`: eventos internos de `/var/log/ufw.log`, filtrados para origem em redes privadas do SGCG para evitar poluir auditoria de navegacao com varreduras externas de WAN
  - eventos DNS/proxy/UFW passam a tentar vinculo automatico com `hotspot_sessions` e `collab_sessions` pelo IP e janela temporal da sessao
  - quando nao ha sessao, o resultado ainda e enriquecido por `identityEnrichment`, preservando usuario/estacao do agente endpoint quando disponivel
  - `GET /api/reports/navigation` e `GET /api/reports/navigation/by-ip` agora leem o consolidado unificado em vez de depender somente de `dns_policy_events`
  - `POST /api/reports/navigation/sync` foi adicionado para forcar sincronizacao do consolidado com os mesmos filtros de navegacao
  - o frontend de `Relatorios Forenses` ganhou filtro por fonte (`DNS/RPZ`, `Proxy/ACL`, `UFW`), coluna de fonte, coluna de sessao vinculada e cards de contagem por fonte
- impacto operacional:
  - a auditoria deixa de responder apenas `qual dominio apareceu no DNS` e passa a cruzar fonte de evidencia, politica aplicada, bloqueio/liberacao, identidade e sessao
  - os relatorios de navegacao preservam o escopo LGPD: dominio/SNI/IP/porta e metadados tecnicos, sem capturar conteudo de paginas HTTPS
  - a tabela `navigation_events` possui trigger de imutabilidade contra `UPDATE` e `DELETE`, reaproveitando a funcao institucional `prevent_audit_record_modification()`
- validacao:
  - `cd backend && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso e gerou o bundle `index-CUYGbZMG.js`
  - `pm2 restart bcc-backend --update-env` e `pm2 restart bcc-frontend --update-env` executados com sucesso
  - chamada direta ao servico compilado `reportsService.getNavigation({ period: '1h' })` criou/populou `navigation_events` e retornou `8980` eventos no periodo, sendo `8937` DNS/RPZ, `43` UFW e `259` vinculados a sessao
  - `reportsService.getNavigation({ period: '1h', source: 'ufw' })` retornou `43` eventos UFW internos, incluindo bloqueio de `192.168.50.12` para `192.168.10.1:80` com identidade endpoint enriquecida
  - `reportsService.exportNavigationPdf({ period: '1h' })` gerou PDF valido com `208371` bytes
  - `https://127.0.0.1:6777/relatorios` serviu os assets `index-CUYGbZMG.js` e `index-DsshXmxW.css`

## Hotspot - destaque da palavra CADASTRO no timeout de identificacao - 2026-05-11

- arquivo alterado:
  - `frontend/src/pages/HotspotPortal.jsx`
- ajuste visual aplicado:
  - na mensagem `A identificação automática demorou demais. Faça login ou cadastro para continuar a navegação.`, a palavra `cadastro` passou a aparecer como `CADASTRO` em negrito
  - o ajuste foi limitado ao fallback de timeout da identificacao automatica no portal publico do Hotspot
- validacao:
  - `cd frontend && npm run build` concluido com sucesso e gerou o bundle `index-Q2ygoGj0.js`
  - `pm2 restart bcc-frontend --update-env` executado com sucesso
  - `GET http://192.168.70.1/hotspot/portal` passou a servir o bundle `index-Q2ygoGj0.js` com headers anti-cache e `Captive-Portal`

## Hotspot - pos-login alinhado ao Portal do Colaborador - 2026-05-11

- arquivos alterados:
  - `frontend/src/pages/HotspotPortal.jsx`
  - `backend/src/modules/hotspot/hotspot-routes.ts`
  - `backend/src/utils/sys.ts`
- ajuste aplicado:
  - o pos-login do `Hotspot` deixou de usar a rotina propria de handoff por probe nativo com multiplas tentativas e tela fallback `Finalizar conexao`
  - o fluxo apos credenciais, confirmacao por MAC, cadastro com sessao imediata e recuperacao de senha passou a seguir a mesma logica do `Portal do Colaborador`:
    - grava o contexto autenticado retornado pelo backend
    - mostra mensagem de sucesso
    - redireciona uma unica vez via `window.location.assign(...)` depois de `800ms`
  - a protecao operacional foi preservada: se o backend retornar `session.runtime_authorized=false`, o frontend nao redireciona silenciosamente e exibe erro recuperavel
  - por decisao operacional do usuario, o redirecionamento para `https://www.jacarezinho.pr.gov.br/` foi removido do Hotspot
  - o `redirect_url` publico de sucesso do Hotspot voltou a apontar para `http://connectivitycheck.gstatic.com/generate_204`, para priorizar o fechamento da janela cativa no Android
- ajuste complementar durante validacao em aparelho real:
  - no Android WebView, o login do IP `192.168.70.24` autorizou a rede, mas a tela cativa nao fechou porque o redirecionamento para o site da Prefeitura nao refazia o probe nativo que havia aberto a janela
  - o frontend foi ajustado para continuar fazendo apenas um redirecionamento, mas priorizar `document.referrer` ou a URL atual quando forem probes cativos conhecidos, como `connectivitycheck.gstatic.com/generate_204`
  - com isso, quando o captive WebView do Android abrir pelo probe nativo, o pos-login volta para o proprio probe; o gateway ja responde `204 No Content` quando a sessao esta autorizada
- ajuste complementar de runtime:
  - durante o teste real, o Android ainda podia classificar a rede como ruim porque o HTTP autorizado da VLAN 70 seguia para a regra geral de redirecionamento ao Squid `3128`
  - o backend passou a manter uma regra NAT `RETURN` para `-m set --match-set sgcg_hotspot_v70_auth src` em `tcp/80`, antes do redirecionamento geral da VLAN 70 para o Squid
  - visitantes nao autorizados continuam capturados pela regra `DNAT` do Hotspot; visitantes autorizados passam pelo probe HTTP nativo sem serem interceptados pelo proxy
  - a allowlist interna de comandos foi atualizada para permitir essa regra de `iptables` no reconciliador do Hotspot
- objetivo operacional:
  - eliminar travamentos percebidos apos informar credenciais e clicar em `Navegar na Internet`
  - reduzir divergencia entre os portais cativos, usando no Hotspot o comportamento ja validado no Portal do Colaborador
- validacao:
  - `cd backend && npm run build` concluido com sucesso em `2026-05-11`
  - `cd frontend && npm run build` concluido com sucesso em `2026-05-11`
  - `pm2 restart bcc-backend --update-env` executado com sucesso
  - `pm2 restart bcc-frontend --update-env` executado com sucesso
  - `GET http://192.168.70.1/hotspot/portal` serviu o bundle novo `index-DqA4vn9n.js` com headers `no-store` e `Captive-Portal`
  - `GET http://192.168.70.1/api/hotspot/public/context` com `X-Forwarded-For: 192.168.70.103` retornou `session.runtime_authorized=true`
  - `POST http://192.168.70.1/api/hotspot/public/continue` com `X-Forwarded-For: 192.168.70.103` criou a sessao `84` com `runtime_authorized=true`
  - `GET http://192.168.70.1/api/hotspot/public/capport` com `X-Forwarded-For: 192.168.70.103` retornou `{"captive":false}`
  - `ipset list sgcg_hotspot_v70_auth` confirmou `192.168.70.103` presente com timeout ativo
  - em validacao acompanhada, `POST /api/hotspot/public/login` do IP `192.168.70.24` retornou `200`, criou sessao `85` com `auth_method=cpf_password` e `runtime_authorized=true`
  - `GET http://192.168.70.1/generate_204` com `Host: connectivitycheck.gstatic.com` e `X-Forwarded-For: 192.168.70.24` retornou `204 No Content`
  - `cd frontend && npm run build` concluido novamente com sucesso apos o ajuste do redirecionamento por probe
  - `pm2 restart bcc-frontend --update-env` executado com sucesso
  - `GET http://192.168.70.1/hotspot/portal` serviu o bundle novo `index-mB798rei.js`
  - apos remocao do redirecionamento para o site da Prefeitura, `cd backend && npm run build` e `cd frontend && npm run build` concluiram com sucesso
  - `pm2 restart bcc-backend --update-env` e `pm2 restart bcc-frontend --update-env` executados com sucesso
  - `GET http://192.168.70.1/hotspot/portal` passou a servir o bundle novo `index-hL0rzQLc.js`
  - em novo teste acompanhado com a sessao revogada, `POST /api/hotspot/public/login` do Android `192.168.70.24` retornou `200` as `15:04:19`, criou a sessao `87` com `auth_method=cpf_password` e `runtime_authorized=true`
  - em seguida, `GET /generate_204` para o mesmo IP retornou `204 No Content`, e `GET /api/hotspot/public/capport` retornou `{"captive":false}`
  - `iptables -t nat -L PREROUTING -n -v --line-numbers` mostrou a regra `RETURN` para `sgcg_hotspot_v70_auth` recebendo pacotes antes do redirecionamento geral para o Squid

## Portais cativos - atualizacao do logotipo JMB - 2026-05-11

- arquivo alterado: `frontend/public/jmb-logo-clean.png`
- ajuste visual aplicado:
  - o asset compartilhado dos portais cativos foi substituido por uma versao melhor a partir de `/opt/Imagens/JMB_TECNOLOGIA_LOGOTIPO.png`
  - o fundo opaco anterior da arte nova foi removido para manter transparencia real no portal
  - a exportacao final foi centralizada no mesmo quadro `220x96` do asset anterior, preservando a proporcao visual usada pelos componentes
- impacto:
  - a nova arte passa a refletir automaticamente em `frontend/src/pages/HotspotPortal.jsx`, `frontend/src/pages/CollaboratorPortal.jsx` e no header institucional que consome `/jmb-logo-clean.png`
- validacao:
  - `identify frontend/public/jmb-logo-clean.png` confirmou `220x96` e canal `RGBA`
  - validado que os quatro cantos do PNG final ficaram transparentes
  - `cd frontend && npm run build` concluido com sucesso em `2026-05-11`

## Hotspot - limpeza de sessoes antigas e endurecimento de nome com CPF - 2026-05-11

- arquivos alterados:
  - `frontend/src/pages/Hotspot.jsx`
  - `backend/src/modules/hotspot/hotspot-routes.ts`
- ajustes aplicados no modulo administrativo do Hotspot:
  - a tabela `Sessoes recentes` ganhou botao para limpar sessoes ja `revogadas` ou `expiradas`
  - criada rota administrativa `POST /api/hotspot/sessions/cleanup-stale` para remover essas sessoes do modulo e revogar `runtime IPs` residuais quando existirem
  - os estados da tabela passaram a ficar em `pt-BR`, com exibicao explicita de `Ativa`, `Revogada` e `Expirada`
  - os metodos de autenticacao do Hotspot tambem passaram a aparecer com rotulos operacionais em `pt-BR`
- ajustes aplicados nos visitantes:
  - os nomes exibidos no modulo passaram a ser normalizados com inicial maiuscula
  - o backend do Hotspot passou a normalizar o `full_name` antes de gravar
  - a validacao agora exige `nome e sobrenome reais`, rejeitando cadastros de palavra unica ou nome claramente insuficiente
  - o CPF passou a ser validado pelo algoritmo completo de digitos verificadores, nao apenas por tamanho
  - o endurecimento vale para:
    - cadastro publico
    - login por CPF
    - recuperacao de senha
    - criacao/edicao administrativa de visitantes
- objetivo operacional:
  - reduzir lixo cadastral no Hotspot
  - evitar casos de visitante usando `CPF` valido com nome inconsistente ou simplificado demais no portal
- validacao:
  - `cd backend && npm run build` concluido com sucesso em `2026-05-11`
  - `cd frontend && npm run build` concluido com sucesso em `2026-05-11`

## Hotspot portal - cadastro publico com validacao guiada - 2026-05-11

- arquivo alterado:
  - `frontend/src/pages/HotspotPortal.jsx`
- ajustes aplicados na experiencia do portal publico:
  - mantido o fluxo operacional com `nome completo`, `CPF`, `celular` e `senha`
  - o campo `nome completo` passou a normalizar a capitalizacao ao sair do campo
  - o formulario ganhou placeholders mais claros para `CPF`, `celular` e `senha`
  - o portal passou a exibir um checklist visual de preenchimento minimo antes do envio
  - o botao `Realizar cadastro` fica bloqueado ate que nome, `CPF`, celular, senha e aceite `LGPD` atinjam o minimo esperado
  - mensagens de erro locais foram endurecidas para reduzir preenchimento errado antes mesmo de chegar ao backend
  - apos o cadastro concluido, o `CPF` informado e reaproveitado automaticamente na tela de login para reduzir retrabalho do visitante
- objetivo operacional:
  - reduzir cadastros incompletos ou incoerentes no portal cativo
  - deixar o primeiro acesso mais claro para visitantes sem abrir mao da validacao ja existente no backend
- validacao:
  - `cd frontend && npm run build` concluido com sucesso em `2026-05-11`

## Hotspot - correcao da limpeza de sessoes antigas no modulo administrativo - 2026-05-11

- arquivo alterado:
  - `backend/src/modules/hotspot/hotspot-routes.ts`
- causa raiz:
  - a rota dinamica `POST /api/hotspot/sessions/:id/revoke` estava declarada antes da rota fixa `POST /api/hotspot/sessions/cleanup-stale`
  - com isso, o Express tentava interpretar `cleanup-stale` como se fosse `:id`, impedindo a acao do botao de limpeza no frontend
- correcao aplicada:
  - a rota fixa `cleanup-stale` foi movida para antes da rota parametrizada de revogacao por `id`
  - o backend do `Hotspot` foi rebuildado e o processo `bcc-backend` reiniciado para a correcao entrar em runtime
- validacao:
  - `cd backend && npm run build` concluido com sucesso em `2026-05-11`
  - `pm2 restart bcc-backend --update-env` executado com sucesso em `2026-05-11`

## Hotspot - limpeza administrativa sem apagar historico de auditoria - 2026-05-11

- arquivos alterados:
  - `backend/src/modules/hotspot/hotspot-routes.ts`
  - `frontend/src/pages/Hotspot.jsx`
- ajuste de regra de negocio aplicado:
  - a acao de `cleanup-stale` deixou de apagar registros de `hotspot_sessions`
  - agora as sessoes `expiradas` ou `revogadas` sao apenas ocultadas da grade `Sessoes recentes` por meio da coluna `admin_hidden_at`
  - o endpoint administrativo continua revogando `runtime IPs` residuais quando existirem, mas preserva o historico para `Relatorio`, `Auditoria` e contexto `LGPD`
  - as consultas do modulo administrativo que alimentam `Visao Geral` e `Sessoes recentes` passaram a ignorar apenas os registros ocultados
- ajuste de UX aplicado:
  - o botao e as mensagens do frontend passaram a deixar explicito que a acao apenas oculta da grade administrativa, sem apagar o historico institucional
- objetivo operacional:
  - manter a tabela administrativa enxuta para operacao diaria
  - preservar integralmente a trilha institucional usada em `Relatorio`, `Auditoria` e conformidade `LGPD`

## Hotspot portal - conclusao visual de login em janela cativa - 2026-05-11

- arquivo alterado:
  - `frontend/src/pages/HotspotPortal.jsx`
- diagnostico validado em runtime:
  - em `2026-05-11 11:31:51 -03`, o login `POST /api/hotspot/public/login` do IP `192.168.70.18` concluiu com `200`
  - o banco registrou sessao `cpf_password` ativa para o mesmo IP
  - `ipset list sgcg_hotspot_v70_auth` confirmou o IP autorizado em runtime
  - o problema percebido ficou concentrado no pos-login do captive WebView, que abria `https://www.jacarezinho.pr.gov.br/` dentro da propria janela do Hotspot, dando impressao de que o processo nao havia terminado
- ajuste aplicado:
  - o portal passou a detectar host/path de janela cativa, como `generate_204`, `hotspot-detect.html`, `connectivitycheck.gstatic.com`, `captive.apple.com` e equivalentes
  - quando a autenticacao termina dentro desse contexto, o frontend deixa de fazer redirecionamento automatico silencioso
  - a ideia de abrir `https://www.jacarezinho.pr.gov.br/` ao final foi abandonada por decisao operacional do usuario
  - no lugar, o portal tenta fechar automaticamente a janela cativa assim que a autenticacao da rede `VISITANTES` conclui
  - tambem passou a oferecer botao `Navegar na Internet` com acao de fechamento da janela cativa e rechecagem manual do status da rede quando o WebView cativo insistir em permanecer aberto
  - depois, o fechamento automatico foi endurecido para ocorrer com contagem regressiva visivel de `3 segundos` e nova tentativa logo em seguida, sem depender de clique do visitante
  - ao surgir no Android o aviso de que a rede estaria tentando abrir outro app, a rotina de fechamento foi simplificada para usar apenas `window.close()`, sem `about:blank` nem troca forçada de janela
- objetivo operacional:
  - evitar a falsa impressao de login incompleto
  - reduzir casos em que o celular continua exibindo a propria janela do captive portal mesmo apos a liberacao da rede

## Hotspot - restauracao da confirmacao por MAC no contexto publico - 2026-05-11

- arquivo alterado:
  - `backend/src/modules/hotspot/hotspot-routes.ts`
- causa raiz validada em runtime:
  - o `GET /api/hotspot/public/context` havia voltado a criar sessoes `mac_auto` para MAC conhecido
  - isso revogava a sessao `cpf_password` anterior do mesmo dispositivo/IP e mantinha o visitante em looping na janela cativa
  - em `2026-05-11`, o IP `192.168.70.18` apareceu autorizado no `ipset`, mas com a sessao de login ja revogada e substituida repetidamente por `mac_auto`
- correcao aplicada:
  - o contexto publico agora procura primeiro por sessao ativa valida do dispositivo/IP e, quando encontra, preserva essa sessao e a autorizacao runtime
  - se o MAC for conhecido mas nao houver sessao ativa valida, o backend volta a responder `recognized=true` e `requires_confirm=true`, sem recriar `mac_auto`
  - o IP atual volta a ser retirado do runtime enquanto o usuario ainda nao confirmou a navegacao pelo portal
- objetivo operacional:
  - impedir que a consulta de contexto derrube ou substitua a sessao autenticada do visitante
  - restaurar o comportamento endurecido anteriormente para evitar looping no portal cativo

## Hotspot portal - endurecimento do fechamento da janela cativa - 2026-05-11

- arquivo alterado:
  - `frontend/src/pages/HotspotPortal.jsx`
- diagnostico validado em runtime:
  - na tela `Acesso institucional identificado`, alguns Android WebView mantinham a janela cativa aberta mesmo apos a sessao estar valida
  - o backend e o runtime continuavam corretos quando o dispositivo confirmava retorno por `MAC`, criando sessao `mac_confirm` e recolocando o IP no `sgcg_hotspot_v70_auth`
  - em validacao controlada com o IP `192.168.70.24`, o `POST /api/hotspot/public/continue` criou a sessao `72` com `runtime_authorized=true`
  - no mesmo fluxo, `GET /generate_204` voltou a responder `204 No Content`, confirmando que a camada de rede estava liberada e que o gargalo restante era o encerramento visual da janela cativa
- ajuste aplicado:
  - o portal deixou de depender apenas de `window.close()` para sair da janela cativa
  - ao concluir a autenticacao em contexto cativo, o frontend agora tenta:
    - encerrar a janela
    - se ela insistir em permanecer aberta, navegar para `/generate_204`
    - em seguida, usar `/hotspot-detect.html` como fallback adicional compatvel com clientes que ignoram o primeiro encerramento
  - o botao `Fechar agora e navegar` passou a usar esse fluxo endurecido, e nao apenas o fechamento direto da janela
  - depois da validacao em aparelho Android real, a rotina foi acelerada para iniciar o encerramento em menos de `1 segundo`, com novas tentativas rapidas em seguida, reduzindo o tempo parado na tela `Acesso institucional identificado`
- objetivo operacional:
  - reduzir casos em que o Android continua exibindo o captive portal mesmo apos a rede `VISITANTES` ja estar liberada em backend e `ipset`
- validacao:
  - `cd frontend && npm run build` concluido com sucesso em `2026-05-11`

## Hotspot - revisao estrutural do handoff final da janela cativa - 2026-05-11

- arquivos alterados:
  - `frontend/src/pages/HotspotPortal.jsx`
  - `backend/src/modules/hotspot/hotspot-routes.ts`
  - `/etc/nginx/sites-available/sgcg-hotspot-captive`
- diagnostico consolidado:
  - o problema residual nao estava apenas no clique do botao final
  - o Hotspot ainda misturava:
    - payload legado com `redirect_url` externo
    - `CAPPORT` estatico retornando `captive=true` mesmo com sessao ativa
    - fallback de fechamento que podia navegar para um probe relativo fora do gateway e acabar em `404`
  - isso explicava o comportamento de o usuario autenticar, ver a tela `Acesso institucional identificado`, cair em handoff inconsistente e em alguns casos voltar a nao concluir corretamente a rede `VISITANTES`
- correcao aplicada:
  - o backend do Hotspot passou a publicar `redirect_url` alinhado ao proprio gateway `http://192.168.70.1/generate_204`, removendo do fluxo publico o legado da Prefeitura
  - o endpoint `GET /api/hotspot/public/capport` passou a ser dinamico:
    - retorna `captive=false` quando existe sessao ativa com `runtime_authorized=true`
    - retorna `captive=true` com `user-portal-url` apenas quando o dispositivo ainda depende de autenticacao/confirmacao
  - o Nginx da VLAN 70 deixou de responder `CAPPORT` estatico e passou a encaminhar `/api/hotspot/public/capport` para o backend
  - o frontend deixou de usar fallback relativo que podia escapar para host errado e gerar `404`
  - o encerramento da janela cativa passou a usar somente o probe absoluto do proprio gateway `http://192.168.70.1/generate_204`
  - o probe `/canonical.html` tambem passou a ser tratado explicitamente pelo gateway para evitar desvios em clientes Android/Chrome
- validacao de runtime:
  - `GET /api/hotspot/public/context` para `192.168.70.24` confirmou `authenticated=true` e `session.runtime_authorized=true`
  - `GET /api/hotspot/public/capport` direto no backend para `192.168.70.24` confirmou `{"captive":false}`
  - `GET /api/hotspot/public/capport` pelo Nginx para `192.168.70.24` tambem confirmou `{"captive":false}`
  - `GET /generate_204` pelo gateway para `192.168.70.24` confirmou `204 No Content`
  - `GET /canonical.html` pelo gateway para `192.168.70.24` confirmou `204 No Content`
- validacao:
  - `cd backend && npm run build` concluido com sucesso em `2026-05-11`
  - `cd frontend && npm run build` concluido com sucesso em `2026-05-11`
  - `pm2 restart bcc-backend --update-env` executado com sucesso em `2026-05-11`
  - `nginx -t` e `systemctl reload nginx` concluidos com sucesso em `2026-05-11`

## Hotspot portal - ajustes de rotulagem e foco - 2026-05-06

- arquivo alterado: `frontend/src/pages/HotspotPortal.jsx`
- ajustes aplicados no portal publico de visitantes:
  - aba `Primeiro acesso` alterada para `Cadastrar`
  - aba `Ja tenho cadastro` alterada para `Fazer Login`
  - modo inicial do portal alterado para `login`
  - `focus` inicial direcionado para o botao `Fazer Login`
  - acao `Identificar dispositivo` alterada para `Navegar na Internet`
  - icone do botao de login trocado de cadeado para icone de entrada
- validacao:
  - `cd frontend && npm run build` concluido com sucesso em `2026-05-06`

## Hotspot portal - login primeiro, cadastro secundario e LGPD no cadastro - 2026-05-06

- arquivo alterado: `frontend/src/pages/HotspotPortal.jsx`
- fluxo visual reorganizado:
  - o portal abre com o `header` institucional em destaque e o card principal de `Fazer Login`
  - o login dos usuarios ja cadastrados fica como primeira acao visivel do portal
  - abaixo do card de login foi incluido um botao com icone para o usuario que ainda nao possui cadastro
  - o card `Termo de uso da rede` foi reposicionado para aparecer abaixo da area de login/cadastro
- cadastro:
  - o aviso da `LGPD` saiu do bloco geral e foi transportado para dentro do card de cadastro
  - o cadastro agora exige `checkbox` de aceite com o texto `Ao se cadastrar voce aceita os termos e concorda com a Lei Geral de Protecao de Dados 13.709/2018 - LGPD`
  - ao concluir o cadastro, o portal retorna automaticamente para a tela de login em vez de navegar direto para fora
- reconhecimento por MAC:
  - o reconhecimento automatico por `MAC` conhecido foi preservado
  - quando o gateway identificar um dispositivo conhecido que ainda depende de confirmacao, o portal exibe a tela `Bem-vindo VISITANTE`
  - essa tela agora reforca novamente o aviso sobre a `LGPD` e oferece o botao `Navegar na Internet` com icone de entrar
- validacao:
  - `cd frontend && npm run build` concluido com sucesso em `2026-05-06`

## Hotspot portal - botao de cadastro em vermelho - 2026-05-06

- arquivo alterado: `frontend/src/pages/HotspotPortal.jsx`
- ajuste visual aplicado:
  - o botao `Ainda nao sou cadastrado` passou a usar fundo vermelho com texto branco em negrito
- validacao:
  - `cd frontend && npm run build` concluido com sucesso em `2026-05-06`

## Mitigacao emergencial Unbound - navegacao parada em todas as VLANs - 2026-05-06

- sintoma observado:
  - a navegacao parou simultaneamente em todas as VLANs
  - `ping 8.8.8.8` e `curl https://www.google.com` no gateway continuavam funcionando
  - o `DNS` institucional em `127.0.0.1`, `192.168.10.1` e `192.168.70.1` respondia `SERVFAIL` ate para `google.com`
- diagnostico confirmado:
  - o problema nao era link externo, `nginx` ou `squid`
  - a causa ficou concentrada no `Unbound`
  - a camada compilada `RPZ`/VIP em `/etc/unbound/unbound.conf.d/becker_policy_compiler.conf` passou a produzir falha local de resolucao
  - o comportamento era imediato, sem depender de upstream publico, indicando erro de processamento local da politica compilada
- mitigacao aplicada para restaurar a navegacao:
  - backup do compilado anterior em `/etc/unbound/unbound.conf.d/becker_policy_compiler.conf.bak_20260506_1340`
  - substituido temporariamente o conteudo do compilado por uma versao minima com:
    - `module-config: "respip validator iterator"`
    - `access-control` das VLANs gerenciadas
  - as `RPZ` compiladas por VLAN e por `VIP` foram desligadas temporariamente nesta mitigacao
  - `systemctl reload unbound` executado com sucesso
- validacao apos a mitigacao:
  - `dig @127.0.0.1 google.com A` -> `NOERROR`
  - `dig @192.168.10.1 google.com A` -> `NOERROR`
  - `dig @192.168.70.1 google.com A` -> `NOERROR`
  - `journalctl -u unbound` voltou a registrar respostas `NOERROR` para dominios externos comuns
- observacao operacional:
  - a navegacao voltou porque a recursao geral foi restaurada
  - a investigacao do item exato dentro da camada compilada `RPZ` que gerou o `SERVFAIL` global ainda precisa ser feita antes de religar esse bloco por completo

## Correcao imediata do RPZ no Unbound - 2026-05-06

- objetivo desta rodada:
  - corrigir o `RPZ` sem voltar ao estado de `SERVFAIL` global que derrubou a navegacao em todas as VLANs
- ajuste aplicado:
  - `backend-proxy/src/services/policy-compiler-service.ts` passou a gerar `safe-mode` para o include do `Unbound`
  - nesse `safe-mode`, o `RPZ` global permanece ativo
  - as amarracoes `RPZ` por `tag` de VLAN e por `VIP` ficam suspensas ate que a causa raiz do `SERVFAIL` seja isolada
- include runtime consolidado em:
  - `/etc/unbound/unbound.conf.d/becker_policy_compiler.conf`
  - o arquivo agora mantem:
    - `module-config: "respip validator iterator"`
    - `access-control` das VLANs gerenciadas
    - `rpz.allow.becker.local` com `/etc/unbound/becker/allowed.rpz`
    - `rpz.block.becker.local` com `/etc/unbound/becker/blocked.rpz`
  - e nao anexa temporariamente:
    - `vip-bypass.conf`
    - `allowlist-vlan-*.rpz`
    - `blocklist-vlan-*.rpz`
- validacao:
  - `cd backend-proxy && npm run build` concluido com sucesso
  - `pm2 restart backend-proxy --update-env`
  - `unbound-checkconf` sem erros
  - `systemctl reload unbound` executado com sucesso
  - `dig @192.168.10.1 google.com A` -> `NOERROR`
  - `dig @192.168.10.1 console.interno.jacarezinho A` -> `NOERROR`
- estado operacional resultante:
  - navegacao geral restaurada
  - nomes internos preservados
  - compilador nao deve mais recriar automaticamente o bloco `RPZ` que derrubou a recursao global

## Reforco de codigo contra novo SERVFAIL global - 2026-05-06

- arquivos alterados:
  - `backend-proxy/src/services/policy-compiler-service.ts`
  - `backend-proxy/src/services/blocking-release-service.ts`
- reforcos aplicados:
  - o compilador passou a publicar o include do `Unbound` em `safe-mode`
  - nesse `safe-mode`, o `RPZ` global continua ativo, mas `RPZ` por `tag` de VLAN e por `VIP` nao e anexado automaticamente ao `Unbound`
  - o fluxo `validateCompiledState()` passou a executar probes reais de resolucao apos `reload` do `Unbound`
  - probes atuais:
    - `google.com A` em `192.168.10.1`
    - `console.interno.jacarezinho A` em `192.168.10.1`
  - se um apply futuro voltar a produzir `SERVFAIL`, o probe falha e o problema passa a ser detectado no proprio ciclo de aplicacao
- validacao:
  - `cd backend-proxy && npm run build` concluido com sucesso
  - `pm2 restart backend-proxy --update-env`
  - `dig @192.168.10.1 google.com A` -> `NOERROR`
  - `dig @192.168.10.1 console.interno.jacarezinho A` -> `NOERROR`

## Compatibilidade SSL interna sem instalacao manual em clientes - 2026-05-06

- objetivo operacional desta rodada: restaurar o comportamento historico em que `console.interno.jacarezinho` funcionava sem exigir nova instalacao manual de CA nas estacoes
- diagnostico:
  - o `nginx` e o `HTTPS` estavam tecnicamente corretos, mas a cadeia ativa estava presa a `SGCG Jacarezinho Internal Root CA 2026`
  - isso mantinha validacao tecnica com `curl` e `openssl` usando a raiz `2026`, porem nao atendia o requisito operacional de compatibilidade sem nova acao nas maquinas
  - a aplicacao nao estava gerando `mixed content`; o ponto residual era compatibilidade de confianca entre a raiz servida e a raiz ja existente nos clientes
- backup completo antes da troca:
  - `/etc/sgcg/backups/internal-console-legacy-compat-20260506-122127/pki/`
  - `/etc/sgcg/backups/internal-console-legacy-compat-20260506-122127/www/`
- artefatos `2026` preservados explicitamente:
  - `/etc/sgcg/pki/sgcg-internal-root-ca-2026.crt`
  - `/etc/sgcg/pki/sgcg-internal-root-ca-2026.key`
  - `/etc/sgcg/pki/console-interno-jacarezinho-2026.crt`
  - `/etc/sgcg/pki/console-interno-jacarezinho-2026.key`
- compatibilidade legada aplicada nos caminhos canonicos:
  - `/etc/sgcg/pki/sgcg-internal-root-ca.crt`
  - `/etc/sgcg/pki/sgcg-internal-root-ca.key`
  - `/etc/sgcg/pki/console-interno-jacarezinho.crt`
  - `/etc/sgcg/pki/console-interno-jacarezinho.key`
  - `/var/www/sgcg-pki/sgcg-root-ca.crt`
  - `/var/www/sgcg-pki/sgcg-root-ca.cer`
- raiz legada agora publicada:
  - `CN=SGCG Jacarezinho Internal Root CA`
  - fingerprint SHA-256: `1F:72:0A:30:44:0F:0B:8C:0C:BE:08:9F:22:51:53:D2:22:D1:17:98:06:F2:95:23:70:A4:61:9D:76:77:54:94`
- certificado do site reemitido na mesma rodada com todos os SANs institucionais:
  - `DNS:console.interno.jacarezinho`
  - `DNS:console.jacarezinho.interno`
  - `DNS:suporte.interno.jacarezinho`
  - `DNS:suporte.jacarezinho.interno`
  - `DNS:chamados.interno.jacarezinho`
  - `DNS:chamados.jacarezinho.interno`
  - `DNS:console.local.jacarezinho`
  - `DNS:console.jacarezinho.local`
  - `IP:192.168.10.1`
- validacoes apos reinicio completo do `nginx`:
  - `openssl s_client -connect 192.168.10.1:443 -servername console.interno.jacarezinho -CAfile /etc/sgcg/pki/sgcg-internal-root-ca.crt` -> `Verify return code: 0 (ok)`
  - `openssl s_client -connect 192.168.10.1:443 -servername suporte.jacarezinho.interno -CAfile /etc/sgcg/pki/sgcg-internal-root-ca.crt` -> `Verify return code: 0 (ok)`
  - `curl --cacert /etc/sgcg/pki/sgcg-internal-root-ca.crt --resolve console.interno.jacarezinho:443:192.168.10.1 -I https://console.interno.jacarezinho` -> `HTTP/2 200`
  - `curl --cacert /etc/sgcg/pki/sgcg-internal-root-ca.crt --resolve suporte.jacarezinho.interno:443:192.168.10.1 -I https://suporte.jacarezinho.interno` -> `HTTP/2 200`
  - `curl --cacert /etc/sgcg/pki/sgcg-internal-root-ca.crt --resolve chamados.jacarezinho.interno:443:192.168.10.1 -I https://chamados.jacarezinho.interno` -> `HTTP/2 200`
- observacao operacional:
  - esta rodada foi orientada a compatibilidade com clientes que provavelmente ja confiavam na raiz antiga `SGCG Jacarezinho Internal Root CA`

## Superinstalador SGCG JMB TECNOLOGIA - 2026-05-06

- novo diretorio versionado: `instalador/`
- objetivo desta rodada:
  - iniciar uma base oficial de instalacao repetivel do SGCG para `Ubuntu Server 24.04+`
  - cobrir explicitamente a stack `Node.js`, `TypeScript`, `Vite`, `React`, `Tailwind CSS`, `Python`, `PostgreSQL`, `Nginx`, `Unbound`, `Squid`, `UFW` e `PM2`
- estrutura criada:
  - `instalador/bootstrap.sh`
  - `instalador/sgcg-installer.py`
  - `instalador/core/`
  - `instalador/profiles/`
  - `instalador/templates/`
  - `instalador/docs/ARQUITETURA.md`
  - `instalador/MANUAL.md`
  - `instalador/README.md`
- capacidades entregues nesta primeira versao:
  - bootstrap do host com preparacao de dependencias de sistema e `venv`
  - wizard interativo para dominio, hostname, `WAN`, `LAN`, `TRUNK` e `VLANs`
  - configuracao declarativa salva em `/etc/sgcg/installer/sgcg-config.yaml`
  - geracao de artefatos base de `netplan`, `nginx`, `env`, `PM2`, `UFW` e `Unbound`
  - perfis declarativos `simple-console`, `gateway-vlans` e `full-appliance`
  - manual operacional completo do superinstalador dentro de `instalador/MANUAL.md`
- validacao desta rodada:
  - `python3 -m compileall instalador` concluido com sucesso
  - `bash -n instalador/bootstrap.sh` concluido com sucesso
- observacao operacional:
  - esta entrega estabelece a fundacao do instalador robusto solicitado, mas ainda deve evoluir em rodadas futuras para `rollback`, `deploy` transacional completo, emissao automatica de certificados e validadores ativos fim a fim

## Evolucao operacional do superinstalador SGCG JMB TECNOLOGIA - 2026-05-06

- diretorio consolidado: `instalador/`
- evolucoes implementadas nesta rodada:
  - `instalador/core/wizard.py` passou a suportar `whiptail` ou `dialog` quando disponiveis, com fallback para prompt textual
  - `instalador/core/app.py` ganhou o comando `validate`
  - `instalador/core/validate.py` foi criado para validar binarios, servicos, `nginx`, `unbound` e `pm2`
  - `instalador/core/provisioner.py` passou a gerar scripts adicionais de operacao
- novos artefatos gerados pelo `apply`:
  - `postgres-init.sql`
  - `setup-postgresql.sh`
  - `deploy-sgcg.sh`
  - `validate-sgcg.sh`
- documentacao atualizada:
  - `instalador/README.md`
  - `instalador/MANUAL.md`
  - `instalador/docs/ARQUITETURA.md`
- validacoes executadas nesta rodada:
  - `python3 -m compileall instalador`
  - `bash -n instalador/bootstrap.sh`
  - `python3 instalador/sgcg-installer.py --config instalador/profiles/full-appliance.yaml plan`
  - `python3 instalador/sgcg-installer.py --config instalador/profiles/full-appliance.yaml validate`
  - `python3 instalador/sgcg-installer.py --config instalador/profiles/full-appliance.yaml apply`
- observacao operacional:
  - o instalador agora ja sai da fase apenas estrutural e entra em fase de provisionamento guiado com `wizard` TUI, inicializacao de `PostgreSQL`, deploy base do SGCG e validacao local reutilizavel

## Superinstalador SGCG - instalacao real ponta a ponta - 2026-05-06

- evolucao central desta rodada:
  - o `instalador/` deixou de ser apenas gerador de artefatos e passou a oferecer o comando `install` para provisionamento real do host
- arquivos principais evoluidos:
  - `instalador/core/app.py`
  - `instalador/core/config.py`
  - `instalador/core/provisioner.py`
  - `instalador/core/wizard.py`
  - `instalador/templates/nginx/sgcg-nginx.conf.j2`
  - `instalador/templates/pm2/ecosystem.config.cjs.j2`
  - `instalador/templates/deploy/deploy-sgcg.sh.j2`
  - `instalador/templates/validate/validate-sgcg.sh.j2`
  - `instalador/templates/env/backend.env.j2`
  - `instalador/templates/env/backend-proxy.env.j2`
  - `instalador/README.md`
  - `instalador/MANUAL.md`
  - `instalador/docs/ARQUITETURA.md`
- comportamento novo do `install`:
  - persiste o `sgcg-config.yaml` em `/etc/sgcg/installer/sgcg-config.yaml`
  - cria backup em `/etc/sgcg/installer/backups/<timestamp>/`
  - instala dependencias base
  - materializa `.env` do `backend`, `backend-proxy` e `frontend`
  - aplica `hostname` e `timezone`
  - publica `nginx`
  - publica include do `Unbound`
  - gera certificado interno utilitario para o `backend-proxy` quando necessario
  - pode aplicar `UFW`
  - inicializa `PostgreSQL`
  - pode aplicar `netplan`
  - executa build do projeto e publica processos reais via `PM2`
  - aguarda o runtime responder nas portas internas antes da validacao final
  - executa validacao local no fechamento
- endurecimento adicional para suportar instalacao em servidores novos:
  - `frontend/vite.config.js` deixou de depender obrigatoriamente de certificados fixos em tempo de `build`
  - o `build` agora continua funcional mesmo em hosts que ainda nao possuem os caminhos antigos de `Let's Encrypt`
  - o frontend de producao do instalador passa a ser servido estaticamente pelo `nginx`, em vez de depender de `vite preview`
  - o `backend-proxy` preserva seu `HTTPS` interno sem exigir certificado publico preexistente
  - o `nginx` do instalador passou a fazer `proxy_pass` seguro para o `backend-proxy` em `https://127.0.0.1:<porta>` com `proxy_ssl_verify off` apenas nessa camada interna
- validacoes desta rodada:
  - `cd frontend && npm run build`
  - `python3 -m compileall instalador`
  - `python3 instalador/sgcg-installer.py --config instalador/profiles/full-appliance.yaml apply`
  - `python3 instalador/sgcg-installer.py --config instalador/profiles/full-appliance.yaml install --dry-run`
  - `python3 instalador/sgcg-installer.py --config instalador/profiles/full-appliance.yaml validate`
- observacao operacional:
  - ainda ha espaco para evoluir `rollback` transacional completo e emissao automatica de certificados, mas o instalador ja passou a cobrir o fluxo real de preparacao do host, publicacao da stack e validacao final
  - se alguma estacao continuar exibindo `Nao seguro`, a discrepancia mais provavel passa a ser uma estacao sem essa raiz legada ou com outra raiz antiga conflitando no cache local
  - a raiz `2026` foi preservada para rollback controlado, mas deixou de ser a cadeia canonica publicada pelos nomes internos nesta rodada

## SSL interno SGCG validado em modo bruto - 2026-05-06

- objetivo validado no servidor `controlebeckercorp-v8` para HTTPS interno dos dominios:
  - `suporte.jacarezinho.interno`
  - `chamados.jacarezinho.interno`
  - `console.interno.jacarezinho`
- diagnostico bruto executado antes de qualquer alteracao:
  - `nginx`, `sgcg-vip-dns` e `unbound` estavam `active`
  - `pm2 describe bcc-frontend` confirmou que o frontend real do SGCG roda em `0.0.0.0:6777`
  - `ss -ltnp` confirmou `bcc-backend` em `6778`, `backend-proxy` em `6779` e `bcc-frontend` em `6777`
  - a correcao nao usou `127.0.0.1:3000`; o upstream real validado para o frontend foi `127.0.0.1:6777`
- backups formais criados antes da rodada em:
  - `/etc/sgcg/backups/ssl-interno-20260506-121315`
  - conteudo salvo:
    - `/etc/nginx/sites-available/console.interno.jacarezinho`
    - `/etc/nginx/snippets/sgcg-console-app-mirror.conf`
    - `/etc/unbound/unbound.conf.d/10-console-interno-jacarezinho.conf`
    - `/etc/unbound/sgcg-vip-clean.conf`
    - `/etc/sgcg/pki`
    - `CODEX.md`
- DNS interno reaproveitado e validado, sem quebra de nomes existentes:
  - `dig +short @192.168.10.1 suporte.jacarezinho.interno` -> `192.168.10.1`
  - `dig +short @192.168.10.1 chamados.jacarezinho.interno` -> `192.168.10.1`
  - `dig +short @192.168.10.1 console.interno.jacarezinho` -> `192.168.10.1`
  - `nslookup` para os tres dominios no resolvedor interno `192.168.10.1` retornou `192.168.10.1`
- CA interna reaproveitada:
  - `/etc/sgcg/pki/sgcg-internal-root-ca.crt`
  - `/etc/sgcg/pki/sgcg-internal-root-ca.key`
- certificado interno reaproveitado e validado:
  - `/etc/sgcg/pki/console-interno-jacarezinho.crt`
  - `/etc/sgcg/pki/console-interno-jacarezinho.key`
  - SANs confirmados no certificado servido:
    - `console.interno.jacarezinho`
    - `console.jacarezinho.interno`
    - `suporte.interno.jacarezinho`
    - `suporte.jacarezinho.interno`
    - `chamados.interno.jacarezinho`
    - `chamados.jacarezinho.interno`
    - `console.local.jacarezinho`
    - `console.jacarezinho.local`
    - `IP:192.168.10.1`
- configuracao Nginx validada e preservada:
  - vhost: `/etc/nginx/sites-available/console.interno.jacarezinho`
  - certificado:
    - `ssl_certificate /etc/sgcg/pki/console-interno-jacarezinho.crt;`
    - `ssl_certificate_key /etc/sgcg/pki/console-interno-jacarezinho.key;`
  - roteamento de aplicacao compartilhado via `/etc/nginx/snippets/sgcg-console-app-mirror.conf`
  - upstream real usado pelo frontend: `https://127.0.0.1:6777`
  - upstreams de API preservados:
    - `http://127.0.0.1:6778`
    - `https://127.0.0.1:6779`
- validacoes finais:
  - `nginx -t` -> sintaxe OK e teste bem-sucedido
  - `systemctl reload nginx` -> `Reloaded nginx.service`
  - `openssl s_client -connect 192.168.10.1:443 -servername suporte.jacarezinho.interno -CAfile /etc/sgcg/pki/sgcg-internal-root-ca.crt` -> `Verify return code: 0 (ok)`
  - `openssl s_client -connect 192.168.10.1:443 -servername chamados.jacarezinho.interno -CAfile /etc/sgcg/pki/sgcg-internal-root-ca.crt` -> `Verify return code: 0 (ok)`
  - `openssl s_client -connect 192.168.10.1:443 -servername console.interno.jacarezinho -CAfile /etc/sgcg/pki/sgcg-internal-root-ca.crt` -> `Verify return code: 0 (ok)`
  - `curl --cacert /etc/sgcg/pki/sgcg-internal-root-ca.crt --resolve suporte.jacarezinho.interno:443:192.168.10.1 -I https://suporte.jacarezinho.interno` -> `HTTP/2 200`
  - `curl --cacert /etc/sgcg/pki/sgcg-internal-root-ca.crt --resolve chamados.jacarezinho.interno:443:192.168.10.1 -I https://chamados.jacarezinho.interno` -> `HTTP/2 200`
  - `curl --cacert /etc/sgcg/pki/sgcg-internal-root-ca.crt --resolve console.interno.jacarezinho:443:192.168.10.1 -I https://console.interno.jacarezinho` -> `HTTP/2 200`
- renovacao/validacao futura:
  - validar certificado atual:
    - `openssl x509 -in /etc/sgcg/pki/console-interno-jacarezinho.crt -noout -subject -issuer -dates -ext subjectAltName`
  - validar certificado servido:
    - `openssl s_client -connect 192.168.10.1:443 -servername console.interno.jacarezinho -CAfile /etc/sgcg/pki/sgcg-internal-root-ca.crt </dev/null | openssl x509 -noout -subject -issuer -ext subjectAltName`
  - validar resposta HTTP:
    - `curl --cacert /etc/sgcg/pki/sgcg-internal-root-ca.crt --resolve console.interno.jacarezinho:443:192.168.10.1 -I https://console.interno.jacarezinho`
  - se um novo certificado precisar ser emitido, reutilizar a CA interna SGCG em `/etc/sgcg/pki/sgcg-internal-root-ca.*` e manter exatamente os SANs acima
- orientacao para remover o aviso `Nao seguro` nos clientes:
  - instalar `/etc/sgcg/pki/sgcg-internal-root-ca.crt` nas estacoes como `Autoridade de Certificacao Raiz Confiavel`
  - no Firefox:
    - `about:config`
    - `security.enterprise_roots.enabled = true`
  - alternativa:
    - importar a CA diretamente no Firefox em `Autoridades`

## PontoRH e OpenDNS - 2026-05-06

- problema recorrente confirmado novamente:
  - o `PontoRH` voltou a falhar porque o app usa `208.67.222.222` e `208.67.220.220` hardcoded
  - o `before.rules` ativo havia perdido a excecao de `RETURN` no `nat/PREROUTING` e mantinha apenas o `REDIRECT` global de DNS para o `Unbound`
  - isso fazia a resolucao do `PontoRH` voltar a depender do `Unbound`, o que contraria a regra operacional do app
  - o usuario reportou que ate mesmo `VIPs` nao estavam conseguindo registrar o ponto, elevando a severidade da correcao
- correcoes aplicadas nesta rodada:
  - `/etc/ufw/before.rules` voltou a materializar a excecao permanente `SGCG_PONTORH_OPENDNS` antes do `REDIRECT` global
  - a excecao cobre `TCP/53` e `UDP/53` para `208.67.222.222` e `208.67.220.220` nas VLANs `10`, `30`, `40`, `50`, `70`, `80` e `99`
  - `backend-proxy/src/services/dns-contingency-service.ts` passou a regravar essa excecao como bloco gerenciado, evitando que futuras reconciliacoes do firewall removam a compatibilidade do `PontoRH`
  - `backend-proxy/src/utils/process.ts` deixou de depender de `sudo` quando o processo ja roda como `root`, removendo a falha estrutural que impedia o bootstrap do reconciliador de firewall neste host
  - `frontend/src/pages/BlockingReleases.jsx` passou a exibir a regra do `PontoRH` dentro de `Politicas Institucionais` como referencia operacional permanente
  - criado `pontorh.md` como documento dedicado da regra institucional e do criterio minimo de validacao
- validacoes executadas:
  - `ufw reload` concluido com `Firewall reloaded`
  - `cd backend-proxy && npm run build` concluiu sem erros
  - `cd frontend && npm run build` concluiu sem erros
  - `pm2 restart backend-proxy --update-env` e `pm2 restart bcc-frontend --update-env` deixaram os processos online
  - `iptables -t nat -S PREROUTING | nl -ba` confirmou os `RETURN` de `208.67.222.222` e `208.67.220.220` nas primeiras linhas da chain, antes do primeiro `REDIRECT` generico de DNS
  - `iptables -S FORWARD` confirmou que os `VIPs` continuam com liberacao de saida para `TCP/53`, `UDP/53`, `TCP/443`, `UDP/443` e `TCP/853`
- referencia de continuidade:
  - ver `pontorh.md` para a regra operacional consolidada do app, validacao minima e criterio de nao regressao

## Central de Chamados Institucional - 2026-05-06

- criada a primeira versao da `Central de Chamados` como modulo de governanca operacional de rede:
  - backend novo em `backend/src/modules/support/support-routes.ts`
  - registro em `backend/src/server.ts` sob `/api/support`
  - rotas publicas sob `/api/support/public/*`, liberadas no `globalJwtGuard` apenas para o portal do colaborador
  - rotas administrativas protegidas por JWT para o SGCG
- regra de arquitetura definida nesta rodada:
  - o portal de chamados deve operar pela VLAN 10/intranet, usando `console.interno.jacarezinho/suporte` ou `https://192.168.10.1/suporte`
  - a VLAN 30 nao deve hospedar o portal de chamados nem misturar chamado com portal cativo
  - a VLAN 30 deve ser compartilhada somente como origem de identidade: o usuario e senha sao os mesmos do `Portal do Colaborador`, persistidos em `collab_users`
  - o vhost cativo `sgcg-collab-captive` foi mantido sem rota `/api/support/public/*`
- persistencia criada pelo modulo:
  - `support_portal_sessions`
  - `support_tickets`
  - `support_ticket_comments`
  - `support_ticket_events`
  - protocolos no formato `SGCG-CH-AAAAMMDD-00000`
  - classificacao automatica inicial por impacto e urgencia em prioridade `Baixa`, `Media`, `Alta` ou `Urgente`
- portal publico React/Vite/Tailwind criado em `frontend/src/pages/SupportPortal.jsx`:
  - rota `/suporte`
  - linguagem sem termos tecnicos para o colaborador
  - identidade visual com logotipo da Prefeitura Municipal de Jacarezinho
  - referencia institucional a Secretaria Municipal de Comercio, Industria, Servicos e Inovacao
  - login com usuario e senha do Portal do Colaborador
  - abertura e acompanhamento de chamados
  - categorias orientadas ao usuario: site ou sistema nao abre, pedir acesso, internet lenta, Wi-Fi, sistema de trabalho e outro atendimento
- modulo administrativo React/Vite/Tailwind criado em `frontend/src/pages/SupportTickets.jsx`:
  - rota `/chamados`
  - item `Central de Chamados` adicionado ao bloco `Governanca` da sidebar
  - lista por prioridade, status, solicitante, protocolo e categoria
  - detalhe com conversa, classificacao, origem, linha do tempo e atualizacao de status/prioridade
  - pedidos de acesso ficam marcados como solicitacao que exige autorizacao antes de virar liberacao tecnica
- sino de chamados criado em `frontend/src/components/SupportBell.jsx`:
  - aparece no topbar do SGCG e aponta para `/chamados`
  - aparece no portal de chamados do colaborador
  - consome contadores de `/api/support/notifications` e `/api/support/public/notifications`
- validacoes executadas:
  - `npm run build` do backend concluiu sem erros
  - `npm run build` do frontend concluiu sem erros
  - `pm2 restart bcc-backend --update-env` e `pm2 restart bcc-frontend --update-env` deixaram os processos online
  - `nginx -t` concluiu com sintaxe OK e teste bem-sucedido apos remover a rota de chamados do vhost cativo da VLAN 30
  - `systemctl reload nginx` aplicado sem erro
  - `GET https://console.interno.jacarezinho/suporte` validado localmente via `Host: console.interno.jacarezinho` retornou `200 text/html`
  - `GET https://console.interno.jacarezinho/chamados` validado localmente via `Host: console.interno.jacarezinho` retornou `200 text/html`
  - `GET https://192.168.10.1/suporte` retornou `200 text/html`
  - `GET /api/support/public/me` sem token retornou `401` com mensagem para entrar com usuario e senha do Portal do Colaborador
  - `GET /api/support/notifications` sem JWT retornou `401 Token ausente`, preservando separacao entre portal publico e administracao SGCG
- correcao operacional de resolucao no Firefox:
  - usuario relatou que `https://192.168.10.1/suporte` abria, mas `console.interno.jacarezinho` retornava `Servidor nao encontrado` no Firefox
  - validado que o Unbound ja resolvia `console.interno.jacarezinho` para `192.168.10.1` em `127.0.0.1` e `192.168.10.1`
  - logs do Unbound mostraram clientes da VLAN 10 consultando provedores de DNS seguro como `dns.google` e `chrome.cloudflare-dns.com`, confirmando tentativa de DoH/DNS seguro fora do resolvedor institucional
  - criado `/etc/unbound/unbound.conf.d/11-sgcg-internal-support-and-firefox-doh.conf`
  - adicionada zona canaria `use-application-dns.net.` como `always_nxdomain`, mecanismo reconhecido pelo Firefox para desativar DNS-over-HTTPS automatico em rede gerenciada
  - aliases `suporte.interno.jacarezinho` e `chamados.interno.jacarezinho` chegaram a ser testados, mas foram removidos por nao estarem cobertos pelo certificado interno atual; o nome oficial permanece `console.interno.jacarezinho`
  - `unbound-checkconf` concluiu sem erros
  - `systemctl reload unbound` aplicado sem erro
  - `unbound-control flush_zone .` removeu entradas em cache
  - `nslookup console.interno.jacarezinho 192.168.10.1` retornou `192.168.10.1`
  - `nslookup use-application-dns.net 192.168.10.1` retornou `NXDOMAIN`
  - `GET https://console.interno.jacarezinho/suporte` validado localmente via header `Host` retornou `200 text/html`
- reforco posterior apos Chrome/Windows ainda retornar `DNS_PROBE_FINISHED_NXDOMAIN`:
  - nova validacao confirmou novamente que `console.interno.jacarezinho` resolve corretamente quando a consulta passa por `192.168.10.1`
  - logs do Unbound no mesmo periodo nao mostraram consulta do cliente ao nome `console.interno.jacarezinho`, mas mostraram tentativas repetidas a `dns.google` e `chrome.cloudflare-dns.com`
  - confirmado em runtime que a VLAN 10 possui redirect de DNS `TCP/UDP 53` para o Unbound e bloqueios de DoH/DoT/QUIC para resolvedores externos conhecidos
  - adicionadas variantes de resolucao para Windows com sufixo de conexao local:
    - `console.interno.jacarezinho.vlan10.local. 300 IN A 192.168.10.1`
    - `console.interno.jacarezinho.local. 300 IN A 192.168.10.1`
  - `unbound-checkconf` concluiu sem erros
  - `systemctl reload unbound` aplicado sem erro
  - `unbound-control flush_zone .` executado
  - `nslookup console.interno.jacarezinho 192.168.10.1` retornou `192.168.10.1`
  - `nslookup console.interno.jacarezinho.vlan10.local 192.168.10.1` retornou `192.168.10.1`
  - `nslookup console.interno.jacarezinho.local 192.168.10.1` retornou `192.168.10.1`
- reforco adicional apos persistencia do erro no Chrome mesmo com DNS Seguro desativado:
  - consultas recentes do Unbound mostraram clientes nas VLANs 10 e 30 usando o resolvedor institucional normalmente para outros dominios, mas sem consulta do cliente ao nome `console.interno.jacarezinho` no momento do erro informado
  - reescrito `/etc/unbound/unbound.conf.d/10-console-interno-jacarezinho.conf` para manter o nome oficial e cobrir sufixos locais comuns do Windows nas VLANs 10, 30, 40, 50 e 70
  - nomes cobertos:
    - `console.interno.jacarezinho`
    - `console.local.jacarezinho`
    - `console.jacarezinho.local`
    - `console.interno.jacarezinho.vlan10.local`
    - `console.interno.jacarezinho.vlan30.local`
    - `console.interno.jacarezinho.vlan40.local`
    - `console.interno.jacarezinho.vlan50.local`
    - `console.interno.jacarezinho.vlan70.local`
    - `console.interno.jacarezinho.local`
  - tentativa de adicionar registro HTTPS/SVCB explicito foi rejeitada pela versao atual do Unbound; o arquivo foi imediatamente corrigido e o servico restaurado
  - `unbound-checkconf` concluiu sem erros
  - `systemctl restart unbound` deixou o servico `active`
  - `nslookup console.interno.jacarezinho 192.168.10.1` retornou `192.168.10.1`
  - `nslookup console.interno.jacarezinho 192.168.30.1` retornou `192.168.10.1`
  - `nslookup console.interno.jacarezinho.vlan30.local 192.168.30.1` retornou `192.168.10.1`
- correcao do nome operacional legado informado pelo usuario:
  - usuario esclareceu que o nome usado na rede era `console.jacarezinho.interno`, nao apenas `console.interno.jacarezinho`
  - escopo aplicado foi limitado a DNS local estatico do console, Nginx interno e certificado interno
  - nao houve alteracao intencional em regras de bloqueio, politicas, RPZ, `blocked.rpz`, `allowed.rpz` ou `becker_policy_compiler.conf`
  - backup criado em `/etc/sgcg/backups/internal-console-alias-20260506-100420`
  - `/etc/unbound/unbound.conf.d/10-console-interno-jacarezinho.conf` recebeu zona local `jacarezinho.interno.` com `console.jacarezinho.interno. 300 IN A 192.168.10.1`
  - vhost `/etc/nginx/sites-available/console.interno.jacarezinho` passou a aceitar `console.jacarezinho.interno` em `server_name`
  - certificado interno `/etc/sgcg/pki/console-interno-jacarezinho.crt` foi reemitido pela CA interna SGCG incluindo `DNS:console.jacarezinho.interno` no SAN
  - `unbound-checkconf` concluiu sem erros
  - `systemctl restart unbound` deixou o servico ativo
  - `nginx -t` concluiu com sintaxe OK e `systemctl reload nginx` foi aplicado
  - `nslookup console.jacarezinho.interno 192.168.10.1` retornou `192.168.10.1`
  - `nslookup console.jacarezinho.interno 192.168.30.1` retornou `192.168.10.1`
  - `GET https://console.jacarezinho.interno/suporte` validado localmente com `--resolve` retornou `200 text/html`
  - certificado validado com SANs: `console.interno.jacarezinho`, `console.jacarezinho.interno`, `console.local.jacarezinho`, `console.jacarezinho.local` e `IP:192.168.10.1`
- correcao emergencial de NXDOMAIN para dominios internos do console e da Central de Chamados:
  - usuario relatou falha geral de resolucao interna em Firefox e Chrome com `DNS_PROBE_FINISHED_NXDOMAIN`
  - escopo mantido estritamente em resolucao local interna, vhost do console, certificado interno e reconhecimento do portal no frontend
  - nenhuma regra de bloqueio, RPZ ou catalogo de politica foi alterada nesta correcao
  - `/etc/unbound/unbound.conf.d/10-console-interno-jacarezinho.conf` deixou as zonas internas `interno.jacarezinho.`, `jacarezinho.interno.`, `local.jacarezinho.` e `jacarezinho.local.` como `transparent`, evitando NXDOMAIN local imediato para nomes internos ainda nao cadastrados
  - adicionados aliases internos apontando para `192.168.10.1`:
    - `suporte.interno.jacarezinho`
    - `chamados.interno.jacarezinho`
    - `suporte.jacarezinho.interno`
    - `chamados.jacarezinho.interno`
  - vhost `/etc/nginx/sites-available/console.interno.jacarezinho` passou a aceitar os aliases `suporte` e `chamados` em ambos os formatos internos
  - certificado interno `/etc/sgcg/pki/console-interno-jacarezinho.crt` foi reemitido pela CA interna SGCG incluindo os novos SANs dos aliases
  - `frontend/src/App.jsx` passou a reconhecer `suporte.jacarezinho.interno` e `chamados.jacarezinho.interno` como entrada direta do portal de chamados
  - `npm run build` do frontend concluiu sem erros
  - `systemctl restart unbound`, `systemctl reload nginx` e `pm2 restart bcc-frontend --update-env` aplicados com servicos online
  - `nslookup` validou todos os nomes abaixo com resposta `192.168.10.1` consultando `192.168.10.1` e `192.168.30.1`:
    - `console.jacarezinho.interno`
    - `console.interno.jacarezinho`
    - `suporte.jacarezinho.interno`
    - `chamados.jacarezinho.interno`
    - `suporte.interno.jacarezinho`
    - `chamados.interno.jacarezinho`
    - `console.local.jacarezinho`
    - `console.jacarezinho.local`
  - `curl --resolve` validou `200 text/html` em HTTPS para `console`, `suporte` e `chamados` nos dois formatos internos
  - arquivos RPZ e de compilador de politicas foram conferidos por timestamp e permaneceram sem alteracao nesta rodada
- investigacao e correcao do cliente `192.168.10.45` sem acesso aos dominios internos:
  - `ip neigh` confirmou `192.168.10.45` ativo na VLAN 10 com MAC `04:ec:d8:bd:1e:e7`
  - logs do Unbound principal nao mostravam consultas recentes desse IP aos dominios internos
  - regras runtime `sgcg-vip-bypass` mostraram que o IP `192.168.10.45` e VIP e tem consultas DNS destinadas a `192.168.10.1:53` redirecionadas para o resolvedor limpo na porta `5355`
  - validado que o Unbound principal na porta `53` resolvia `console`, `suporte` e `chamados`, mas o resolvedor VIP limpo na porta `5355` nao conhecia esses dominios internos e retornava vazio/NXDOMAIN
  - corrigido `/etc/unbound/sgcg-vip-clean.conf` para tambem conter as zonas internas transparentes e os registros locais do console e da Central de Chamados
  - `unbound-checkconf -f /etc/unbound/sgcg-vip-clean.conf` concluiu sem erros
  - `systemctl restart sgcg-vip-dns.service` aplicado e o servico ficou `active`
  - validado que a porta `5355` agora resolve:
    - `console.jacarezinho.interno -> 192.168.10.1`
    - `suporte.jacarezinho.interno -> 192.168.10.1`
    - `chamados.jacarezinho.interno -> 192.168.10.1`
    - `suporte.interno.jacarezinho -> 192.168.10.1`
    - `chamados.interno.jacarezinho -> 192.168.10.1`
  - escopo da correcao: apenas resolvedor VIP limpo da porta `5355`; nenhuma RPZ, regra de bloqueio ou catalogo de politica foi alterado
- consolidacao do acesso HTTPS da Central de Chamados em todas as VLANs:
  - usuario confirmou a grafia correta dos dominios institucionais como `suporte.jacarezinho.interno` e `chamados.jacarezinho.interno`
  - qualquer alias temporario com grafia incorreta foi removido antes da publicacao final
  - o DNS interno principal e o resolvedor VIP limpo da porta `5355` foram mantidos alinhados com os hostnames:
    - `suporte.jacarezinho.interno`
    - `chamados.jacarezinho.interno`
    - `suporte.interno.jacarezinho`
    - `chamados.interno.jacarezinho`
  - o vhost `/etc/nginx/sites-available/console.interno.jacarezinho` permaneceu aceitando os hostnames corretos de `suporte` e `chamados`
  - o certificado interno `/etc/sgcg/pki/console-interno-jacarezinho.crt` foi reemitido somente com os SANs corretos e sem nomes com erro de digitacao
  - `frontend/src/App.jsx` permaneceu reconhecendo entrada direta pelos hostnames corretos do portal de chamados
  - `npm run build` do frontend concluiu sem erros
  - `systemctl restart unbound sgcg-vip-dns.service`, `systemctl reload nginx` e `pm2 restart bcc-frontend --update-env` aplicados com servicos online
  - validacao DNS executada consultando os gateways das VLANs `10`, `30`, `40`, `50`, `70`, `80` e `99`
  - em todas elas:
    - `suporte.jacarezinho.interno -> 192.168.10.1`
    - `chamados.jacarezinho.interno -> 192.168.10.1`
  - validacao HTTPS executada a partir das interfaces `192.168.10.1`, `192.168.30.1`, `192.168.40.1`, `192.168.50.1`, `192.168.70.1`, `192.168.80.1` e `192.168.99.1`
  - em todas elas:
    - `https://suporte.jacarezinho.interno/` respondeu `200` com verificacao SSL `0`
    - `https://chamados.jacarezinho.interno/` respondeu `200` com verificacao SSL `0`
  - escopo da rodada: acesso institucional ao portal de chamados em todas as VLANs internas, sem alterar RPZ, bloqueios ou catalogo de politicas

## Portal cativo Hotspot VLAN 70 - 2026-05-05

- correcao aplicada para clientes Android/WebView que chegavam ao Nginx mas nao abriam o portal:
  - logs reais em `/var/log/nginx/sgcg-hotspot-captive.access.log` mostraram IPs da VLAN 70 repetindo `GET /generate_204` com `200`, sem avancar para `/hotspot/portal`
  - a resposta curta anterior com `meta refresh` e JavaScript ainda podia ser ignorada pelo WebView de portal cativo
  - o vhost `/etc/nginx/sites-available/sgcg-hotspot-captive` passou a servir o proprio bundle do portal nos endpoints de deteccao e em qualquer URL HTTP capturada, usando proxy interno para `/hotspot/portal`
  - o HTML proxied recebe o sinal `window.__SGCG_FORCE_PORTAL="hotspot"` para forcar a renderizacao do portal Hotspot mesmo quando o navegador permanece na URL `connectivitycheck.gstatic.com/generate_204` ou em outro host capturado
  - `frontend/src/App.jsx` passou a reconhecer esse sinal antes da heuristica de portal de colaboradores, evitando conflito entre hosts comuns de deteccao cativa
- validacoes executadas:
  - `nginx -t` concluiu com sintaxe OK e teste bem-sucedido
  - `npm run build` do frontend concluiu sem erros
  - `pm2 restart bcc-frontend` deixou o processo online
  - `systemctl reload nginx` aplicado sem erro
  - `GET http://192.168.70.1/generate_204` com `Host: connectivitycheck.gstatic.com` retornou `200 OK text/html` contendo `window.__SGCG_FORCE_PORTAL="hotspot"` e os assets do bundle atual
  - `GET http://192.168.70.1/qualquer` com host externo capturado retornou o mesmo app do portal Hotspot
  - `GET http://192.168.70.1/api/hotspot/public/context` com `Host: connectivitycheck.gstatic.com` e `X-Forwarded-For: 192.168.70.250` retornou `authenticated=false`, `requires_login=true`
  - `GET /assets/index-DNn_MS7V.js` pelo host de conectividade retornou `200 OK text/javascript`
- endurecimento adicional apos teste com o cliente real `192.168.70.96`:
  - o IP `192.168.70.96` nao estava no `ipset` `sgcg_hotspot_v70_auth`, portanto nao havia liberacao indevida
  - a tabela de vizinhanca confirmou o MAC `82:76:f5:5d:5e:3d` em `enp6s0.70`
  - `GET /api/hotspot/public/context` com `X-Forwarded-For: 192.168.70.96` retornou `authenticated=false`, `mac=82:76:f5:5d:5e:3d`, `requires_login=true`
  - logs reais mostraram o Android do IP `192.168.70.96` repetindo `GET /generate_204` sem solicitar os assets do portal
  - os endpoints classicos de deteccao passaram a responder `511 Network Authentication Required` com HTML minimo e link direto para `http://192.168.70.1/hotspot/portal`
  - conexoes rastreadas do IP `192.168.70.96` foram limpas com `conntrack -D -s 192.168.70.96` e `conntrack -D -d 192.168.70.96`
  - `nginx -t` concluiu com sintaxe OK e `systemctl reload nginx` foi aplicado
  - validado que `GET http://192.168.70.1/generate_204` com `Host: 192.168.70.1` retorna `511` com botao `Abrir portal`
  - validado que `GET http://connectivitycheck.gstatic.com/generate_204` resolvido para `192.168.70.1` tambem retorna `511` com botao `Abrir portal`
- observacao em tempo real apos nova tentativa do cliente:
  - o IP `192.168.70.96` continuou fora do `ipset` de autorizados e o MAC permaneceu visivel inicialmente na vizinhanca
  - o cliente ainda gerou tentativas `POST /chat` de WhatsApp capturadas pelo portal
  - o fallback de `location /` foi alterado para responder a mesma pagina cativa minima `511`, em vez de encaminhar requisicoes arbitrarias ao app React
  - validado que `GET /chat` e `POST /chat` em `192.168.70.1` retornam `511` com `Portal Hotspot` e botao `Abrir portal`
  - `nginx -t` concluiu com sintaxe OK e `systemctl reload nginx` foi aplicado
  - durante a observacao, o IP `192.168.70.96` deixou de responder na vizinhanca e passou por estados `STALE`, `DELAY`, `FAILED` e `INCOMPLETE`, indicando perda de presenca L2/associacao na VLAN 70
  - no mesmo intervalo, um cliente Android registrado como `192.168.10.103` carregou `/hotspot/portal`, assets do bundle e `/api/hotspot/public/context` com sucesso
  - o usuario confirmou em tempo real que o portal apareceu e a conexao foi concluida
  - o log do portal mostrou `POST /api/hotspot/public/login` retornando primeiro `401` em tentativa invalida e depois `200`, confirmando autenticacao bem-sucedida
- regra funcional consolidada para retorno de visitante:
  - se o MAC do dispositivo ja existir em `hotspot_devices`, `GET /api/hotspot/public/context` deve autenticar automaticamente, criar sessao `mac_auto`, autorizar o IP no `sgcg_hotspot_v70_auth` e retornar `authenticated=true`
  - a tela publica passa a exibir `Bem-vindo de volta, visitante` para retorno automatico antes do redirecionamento
  - removida a exigencia anterior de confirmacao manual `requires_confirm` para MAC reconhecido
  - `npm run build` do backend concluiu sem erros
  - `npm run build` do frontend concluiu sem erros
  - `bcc-backend` e `bcc-frontend` foram reiniciados no PM2 e ficaram online
  - sessoes ativas vinculadas ao teste foram revogadas antes da nova validacao, e o IP `192.168.70.96` foi removido do `ipset`
  - durante o reteste, o DHCP mostrou o aparelho `NOTE-40-5G` alternando MACs aleatorios ao esquecer/reconectar a rede (`82:76:f5:5d:5e:3d`, `be:20:8b:93:5f:08`, `f8:6b:fa:9f:f6:99`)
  - como esses MACs novos ainda nao existiam em `hotspot_devices`, o contexto retornou corretamente `context_unknown_mac`; a autenticacao automatica so se aplica ao mesmo MAC ja cadastrado

- corrigido o vhost Nginx real `/etc/nginx/sites-available/sgcg-hotspot-captive` para reduzir falhas de abertura do portal cativo em Android/Windows que ficavam exibindo `data:text/html` ou repetindo apenas checks de conectividade
- endpoints classicos de deteccao agora estao declarados explicitamente na VLAN 70 e entregam uma pagina curta `200 text/html` com `meta refresh`, JavaScript e link manual para `http://192.168.70.1/hotspot/portal`:
  - `/generate_204`
  - `/connecttest.txt`
  - `/ncsi.txt`
  - `/hotspot-detect.html`
  - `/library/test/success.html`
  - `/success.txt`
  - `/kindle-wifi/wifistub.html`
  - `/redirect`
- motivo do endurecimento adicional:
  - logs reais mostraram clientes Android presos em repeticoes de `/generate_204` sem seguir para `/hotspot/portal`
  - a resposta anterior `302` ainda deixava alguns WebViews exibindo o corpo HTML padrao do redirect em vez de abrir o portal
  - a pagina curta no proprio check evita depender apenas do comportamento de redirect do captive WebView
- adicionados headers anti-cache no vhost do Hotspot:
  - `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0`
  - `Pragma: no-cache`
  - `Expires: 0`
  - headers de cache do upstream sao ocultados para evitar HTML/JS antigo em WebView de portal cativo
- validacoes executadas:
  - `nginx -t` concluiu com sintaxe OK e teste bem-sucedido
  - `systemctl reload nginx` aplicado sem erro
  - `GET http://192.168.70.1/generate_204` com `Host: connectivitycheck.gstatic.com` retornou `200 OK text/html` com encaminhamento para `http://192.168.70.1/hotspot/portal`
  - `GET http://192.168.70.1/qualquer` retornou `200 OK text/html` com encaminhamento para o portal
  - `GET http://192.168.70.1/hotspot/portal` retornou `200 OK text/html`
  - `GET http://192.168.70.1/api/hotspot/public/context` com `X-Forwarded-For: 192.168.70.250` retornou `authenticated=false`, `requires_login=true`
  - `iptables -t nat -S PREROUTING` confirmou DNAT cativo da VLAN 70 antes do redirect de proxy `3128`
  - `iptables -S FORWARD` confirmou o `REJECT` da VLAN 70 antes dos allows gerais e do bloqueio social
- endurecimento CAPPORT aplicado apos o usuario relatar tela branca `data:text/html` e ausencia de botao no captive WebView:
  - a tentativa intermediaria com `302` direto para `http://192.168.70.1/hotspot/portal` foi considerada insuficiente para Android/WebView, pois ainda podia resultar em tela branca local
  - `/etc/nginx/sites-available/sgcg-hotspot-captive` passou a responder os endpoints de deteccao e o fallback raiz com `200 text/html`, pagina curta visivel, botao `Abrir portal`, `meta refresh` e JavaScript apontando para `http://192.168.70.1/hotspot/portal`
  - a resposta cativa passou a incluir `Captive-Portal: http://192.168.70.1/api/hotspot/public/capport`
  - a resposta cativa passou a incluir `Link: <http://192.168.70.1/api/hotspot/public/capport>; rel="captive-portal"`
  - criado endpoint CAPPORT JSON em `backend/src/modules/hotspot/hotspot-routes.ts` para `/api/hotspot/public/capport`, retornando `application/captive+json` com `user-portal-url` para o portal Hotspot
  - o mesmo endpoint tambem foi materializado no Nginx do portal cativo para garantir resposta imediata mesmo antes do proxy backend
  - `/etc/dhcp/dhcpd.conf` recebeu `option captive-portal code 114 = text;`
  - a subnet `192.168.70.0/24` passou a anunciar `option captive-portal "http://192.168.70.1/api/hotspot/public/capport";`
  - leases da VLAN 70 foram encurtados para `default-lease-time 60` e `max-lease-time 300`, acelerando a renovacao da URL CAPPORT nos celulares
- validacoes CAPPORT/DHCP executadas:
  - `dhcpd -t -cf /etc/dhcp/dhcpd.conf` concluiu sem erro
  - `systemctl restart isc-dhcp-server` aplicado e o servico ficou `active`
  - logs do DHCP apos o restart confirmaram `DHCPACK` na VLAN 70 para `realme-Note-50` em `192.168.70.97` e `NOTE-40-5G` em `192.168.70.101`
  - `nginx -t` concluiu com sintaxe OK e `systemctl reload nginx` foi aplicado
  - `GET http://192.168.70.1/generate_204` com `Host: connectivitycheck.gstatic.com` retornou `200 OK text/html`, `Content-Length: 912`, botao `Abrir portal`, header `Captive-Portal` e header `Link` do CAPPORT
  - `GET http://192.168.70.1/api/hotspot/public/capport` retornou `200 OK application/captive+json` com `captive=true` e `user-portal-url=http://192.168.70.1/hotspot/portal`
  - `bcc-backend`, `bcc-frontend`, `nginx` e `isc-dhcp-server` ficaram online/active apos as alteracoes
- observacao operacional:
  - clientes que receberam lease antes da opcao DHCP 114 podem precisar desligar e religar o Wi-Fi ou esquecer/conectar novamente para receber o CAPPORT novo
  - se o WebView do Android ainda estiver preso em cache de `data:text/html`, acessar `http://192.168.70.1/` na propria rede deve exibir a mesma pagina curta com botao e encaminhar para o portal
- ajuste final apos o usuario relatar que o botao `Abrir portal` apareceu, mas o clique nao navegou:
  - confirmado por log que o clique nao chegava como `GET /hotspot/portal`, indicando bloqueio da navegacao pelo captive WebView
  - removidos `listen 80`, `listen [::]:80` e nomes publicos de conectividade do `server_name` do vhost Hotspot, deixando a captura da VLAN 70 vinculada ao IP `192.168.70.1`
  - mantida a interceptacao de `connectivitycheck.gstatic.com` apenas como comportamento natural do Android quando o trafego chega ao gateway da VLAN 70; o vhost nao usa mais esse dominio como identidade propria
  - endpoints de deteccao e fallback raiz deixaram de entregar a pagina intermediaria com botao e passaram a entregar diretamente o app do portal Hotspot via `@hotspot_portal_app`
  - o HTML do app continua recebendo `window.__SGCG_FORCE_PORTAL="hotspot"` para renderizar o portal correto mesmo quando a URL visivel do WebView ainda for `/generate_204`
  - `nginx -t` concluiu com sintaxe OK e `systemctl reload nginx` foi aplicado
  - `GET http://192.168.70.1/generate_204` com `Host: connectivitycheck.gstatic.com` retornou `200 OK text/html`, headers CAPPORT e HTML do app com asset `/assets/index-XN-mZyPJ.js`
  - `GET http://192.168.70.1/` retornou o mesmo app do portal Hotspot com `window.__SGCG_FORCE_PORTAL="hotspot"`
  - `GET http://192.168.70.1/assets/index-XN-mZyPJ.js` retornou `200 OK text/javascript`
  - `GET http://192.168.70.1/api/hotspot/public/context` para `192.168.70.101` retornou JSON valido com MAC `ee:95:01:1a:a9:a4`, `requires_login=true` e motivo `context_unknown_mac`
- validacao final pelo usuario:
  - o usuario confirmou que, apos o ajuste final do vhost da VLAN 70, o portal Hotspot foi validado em cliente real
  - a validacao confirma que o fluxo saiu do estado anterior em que o captive WebView mostrava botao sem navegar e passou a carregar o app do portal diretamente
  - estado consolidado: Hotspot VLAN 70 usa o gateway `192.168.70.1` como identidade operacional do portal, com checks Android tratados apenas como trafego de deteccao capturado pela propria VLAN
- ajuste visual no portal Hotspot:
  - `frontend/src/pages/HotspotPortal.jsx` teve o estado ativo da aba `Primeiro acesso` alterado de fundo branco para `bg-emerald-50`, igual ao verde claro usado no aviso LGPD do proprio portal
  - a cor do texto ativo da aba passou para `text-emerald-950`, mantendo contraste com o novo fundo claro
  - `npm run build` do frontend concluiu sem erros
  - `pm2 restart bcc-frontend --update-env` aplicado e `bcc-frontend` ficou online
  - validado pelo caminho real da VLAN 70 que `GET http://192.168.70.1/generate_204` retorna o app com o bundle novo `/assets/index-BKWdmnXw.js`
- ajuste visual no portal de Colaboradores:
  - `frontend/src/pages/CollaboratorPortal.jsx` teve a aba `Login` ajustada para deixar o texto explicitamente em negrito com `font-black`
  - o icone da aba `Login` foi alterado de cadeado para sinal de Wi-Fi (`Wifi` do `lucide-react`)
  - o botao de envio `Entrar e liberar navegacao` manteve o icone de cadeado, pois representa a acao de autenticacao
  - `npm run build` do frontend concluiu sem erros
  - `pm2 restart bcc-frontend --update-env` aplicado e `bcc-frontend` ficou online
  - validado pelo caminho real da VLAN 30 que `GET http://192.168.30.1/generate_204` retorna o app com o bundle novo `/assets/index-PSMIxyZj.js`

## Registro operacional de firewall - 2026-05-05

- auditoria operacional do UFW confirmou que o firewall oficial do SGCG permanece instalado, habilitado e ativo, com politica padrao `deny incoming`, `allow outgoing` e `allow routed`
- corrigida divergencia entre VIPs ativos do sistema e regras efetivas de firewall:
  - `backend-proxy/src/services/dns-contingency-service.ts` passou a reconciliar VIPs ativos tanto de `policy_exceptions` quanto da tabela legada `dns_vip`
  - o VIP ativo `192.168.10.171` voltou a ser materializado em `/etc/ufw/before.rules` e no bypass runtime `sgcg-vip-bypass`
- corrigido risco de explosao de fila de processos `iptables`:
  - `applyRuntimeVipBypassRules()` passou a ser serializado por trava em memoria
  - `ensureOrderedIptablesRule()` passou a ser idempotente, sem apagar e reinserir regras ja existentes
  - a aplicacao runtime passou a carregar snapshot das regras existentes para evitar chamadas repetidas de `iptables -C`
- corrigida precedencia dos bloqueios mobile da VLAN 70:
  - portas TCP `5222`, `5223` e `5228` agora entram no bloco antecipado `ufw-before-forward`
  - essas regras precedem o allow geral de roteamento do UFW para impedir que o allow amplo neutralize os bloqueios
- saneamento operacional aplicado em runtime:
  - backups gerados de `/etc/ufw/before.rules`, `/etc/ufw/user.rules` e do `iptables-save` antes da correcao
  - regras NAT duplicadas exatas foram deduplicadas via `iptables-save -t nat` validado com `iptables-restore --test` e reaplicado com `iptables-restore`
- validacoes executadas:
  - `npm run build` em `backend-proxy`
  - `iptables-restore --test < /etc/ufw/before.rules`
  - `ufw status verbose`
  - `iptables -S` e `iptables -t nat -S` para confirmar VIP, bloqueios VLAN 70 e ausencia de duplicatas exatas
  - `pm2 restart backend-proxy` com processo online apos a correcao
- limpeza posterior do modulo VIP:
  - removidas entradas de teste/QA associadas ao Codex em `policy_exceptions`: `192.168.10.250/32`, `192.168.10.251/32` e `192.168.10.252/32`
  - removidas entradas legadas de teste/temporarias associadas ao Codex em `dns_vip`: `192.168.10.254`, `192.168.10.250`, `192.168.10.124`, `192.168.10.251` e `192.168.10.252`
  - consulta de verificacao confirmou ausencia de registros restantes com assinatura simultanea de Codex e teste/temporario no modulo VIP
  - VIPs reais ativos foram preservados
- refinamento visual do modulo VIP:
  - aba `Excecoes VIP` em `frontend/src/pages/BlockingReleases.jsx` foi reduzida para leitura operacional compacta
  - removido painel narrativo grande de impacto tecnico que poluia a primeira dobra da tela
  - badges repetidos foram consolidados em tres sinais: `Firewall livre`, `DNS sem RPZ` e `Sem proxy`
  - lista de VIPs passou a renderizar linhas compactas com IP, status, descricao, motivo, responsavel, VLAN, revisao e acoes
  - editor de VIP manteve o alerta tecnico, mas com texto e peso visual reduzidos
  - `npm run build` do frontend concluiu sem erros e `bcc-frontend` foi reiniciado no PM2
- refinamento visual de `Politicas Institucionais`:
  - hero interno da aba foi substituido por cabecalho compacto de catalogo operacional
  - removido texto promocional/longo sobre fluxo de governanca
  - contadores foram reduzidos para `Total`, `Ativas` e `Inativas` em linha
  - titulo da secao passou para `Politicas Institucionais` com subtitulo direto sobre regras de bloqueio/liberacao por dominio
  - `npm run build` do frontend concluiu sem erros e `bcc-frontend` foi reiniciado no PM2
- refinamento profundo de `Acoes rapidas`:
  - painel lateral do hero deixou de ser uma lista plana vertical de botoes
  - `Acoes rapidas` passou para uma faixa horizontal propria abaixo do hero principal
  - acoes passaram a ser agrupadas por intencao: `Governanca`, `Operacao` e `Contingencia`
  - estado atual do modulo passou a aparecer no topo como `Normal`, `Contingencia` ou `Emergencia`
  - indicadores de `Motor`, `VIPs` e `Escopo` foram compactados em linha para leitura de comando
  - acao emergencial foi isolada no grupo de contingencia e recebeu hierarquia visual de risco
  - `npm run build` do frontend concluiu sem erros e `bcc-frontend` foi reiniciado no PM2
- correcao de indisponibilidade da aba `Observabilidade`:
  - a refatoracao de `Acoes rapidas` removeu indevidamente o import de `QuickActionBar`
  - outras secoes da pagina, incluindo `Observabilidade`, ainda dependiam desse componente
  - a falha causava queda no `RootErrorBoundary` com a mensagem `Portal indisponivel no navegador`
  - import restaurado em `frontend/src/pages/BlockingReleases.jsx`
  - `npm run build` do frontend concluiu sem erros, `bcc-frontend` foi reiniciado no PM2 e a URL publica passou a servir o bundle corrigido
- correcao do atalho `Auditoria` em `Acoes rapidas`:
  - o botao apenas abria a aba `Observabilidade`, deixando o operador no topo do `Radar operacional`
  - adicionada acao dedicada para abrir `Observabilidade` e rolar automaticamente ate `Relatorio de Dados`
  - bloco de auditoria recebeu ancora `observability-audit`
  - `npm run build` do frontend concluiu sem erros, `bcc-frontend` foi reiniciado no PM2 e a URL publica passou a servir o bundle corrigido
- correcao operacional do VIP `192.168.10.45`:
  - cadastro estava ativo em `policy_exceptions`, `dns_vip` e `proxy_vips`
  - regras `FORWARD` do runtime `sgcg-vip-bypass` estavam antes dos bloqueios sociais e aceitavam trafego WAN
  - causa encontrada no NAT: regras antigas de `RETURN` para DNS do VIP apareciam antes do redirecionamento para o DNS limpo `5355`
  - isso fazia consultas para `192.168.10.1:53` escaparem para o Unbound normal, onde dominios como `cloudflare-dns.com` e `chrome.cloudflare-dns.com` ainda eram bloqueados
  - runtime do IP foi normalizado: REDIRECT do DNS local para `5355` passou a preceder os `RETURN`
  - `backend-proxy/src/services/dns-contingency-service.ts` passou a detectar VIPs ativos com NAT legado fora de ordem e recriar apenas essas regras, evitando churn global de iptables
  - validado que `cloudflare-dns.com` e `chrome.cloudflare-dns.com` resolvem no DNS limpo `5355`
  - `npm run build` do `backend-proxy` concluiu sem erros e `backend-proxy` foi reiniciado no PM2

## Regra inegociavel do console interno

- `console.interno.jacarezinho` deve ser espelho operacional de `console.jacarezinho.cloud`
- em contingencia de link externo, o acesso administrativo deve continuar pela LAN usando `console.interno.jacarezinho`
- toda rota, pagina, API, endpoint e contrato HTTP(S) da superficie SGCG deve bater no mesmo upstream em ambos os consoles
- qualquer novo endpoint publicado no console publico deve ser publicado simultaneamente no console interno
- qualquer novo endpoint publicado no console interno deve ser publicado simultaneamente no console publico
- a unica diferenca aceitavel entre os consoles e infraestrutura de acesso:
  - nome DNS
  - certificado TLS
  - download da CA interna (`/sgcg-root-ca.crt` e `/sgcg-root-ca.cer`)
  - excecao operacional HTTP da identidade interna, quando necessaria para agentes na LAN
- o roteamento HTTPS da aplicacao deve ser compartilhado por configuracao comum do Nginx, para evitar divergencia manual entre os vhosts
- se houver alteracao em Nginx, frontend, API ou proxy que afete o console, a validacao deve comparar explicitamente:
  - `console.jacarezinho.cloud`
  - `console.interno.jacarezinho`
  - rotas de frontend
  - rotas `/api/`
  - rotas do `backend-proxy`
  - rotas publicas e administrativas adicionadas na rodada

## Condicional obrigatoria de build

Se qualquer modulo, pagina, componente, rota, ativo ou configuracao passar por validacao com `build`, o `CODEX.md` deve ser atualizado imediatamente depois.

Ordem obrigatoria:

1. executar o `build`
2. validar o resultado
3. atualizar o `CODEX.md`
4. somente depois encerrar a rodada

## Identidade do sistema

- Nome oficial: `SGCG`
- Expansao: `Sistema de Governanca e Controle Governamental`
- Marca institucional: `JMB Tecnologia`

## Direcao de produto

O sistema deve operar em dois eixos permanentes:

1. `Governanca`
2. `Controle`

### Governanca

Camada de decisao, politica, conformidade, excecao, autorizacao, auditoria e responsabilizacao.

### Controle

Camada de execucao tecnica, enforcement, observabilidade, monitoramento, servicos, rede, proxy, DNS, firewall e operacao.

## Principios de evolucao

- linguagem institucional, clara e objetiva
- interface adequada a contexto GovTech
- menos aparencia de ferramenta interna isolada
- mais rastreabilidade, evidencia e responsabilizacao
- governanca de dados centralizada
- responsividade real em desktop e mobile
- design system unico e coerente

## O que deve entrar no sistema

- governanca de dados centralizada
- trilha institucional unica
- aprovacoes e excecoes com justificativa
- perfis institucionais claros
- painel executivo com risco, disponibilidade, conformidade e excecoes
- politicas institucionais separadas da execucao tecnica
- historico de mudancas com diff, autor, motivo e rollback
- catalogo de ativos criticos
- centro de incidentes com linha do tempo e impacto

## O que deve sair ou ser reduzido

- linguagem de debug exposta no fluxo principal
- duplicidade entre modulos
- mistura de acao administrativa com operacao tecnica no mesmo contexto
- componentes visuais inconsistentes
- excesso de caixa alta
- cards sem funcao real
- acoes sensiveis sem justificativa e trilha

## Estado atual consolidado

- shell institucional do SGCG aplicado
- separacao `Governanca` vs `Controle` aplicada na navegacao
- identidade visual reestruturada para um padrao GovTech
- topbar, sidebar, dashboard, login e configuracoes reposicionados
- estados positivos padronizados em azul
- estados de atencao padronizados em laranja mais forte
- `Políticas & Exceções` evoluido para leitura institucional de politicas, escopos, excecoes e relatorio de dados
- `Relatório de Dados` substitui a leitura isolada de `LGPD` no fluxo principal
- favicon e titulo do navegador atualizados para a nova identidade
- nova fase da arquitetura aberta na navegacao com tres blocos formais:
  - `Governança de Dados e Conformidade`
  - `Aprovações & Exceções`
  - `Trilha Institucional`
- `BlockingReleases` agora aceita deep link por aba via query string, permitindo que a arquitetura nova navegue para fluxos reais sem duplicar logica
- sidebar atualizada para refletir a nova organizacao institucional da camada de governanca
- os tres novos blocos deixaram de ser paginas introdutorias e passaram a renderizar visoes operacionais focadas do nucleo institucional:
  - `Governança de Dados` usa foco em `Relatório de Dados`, `Radar` e `Telemetria`
  - `Aprovações & Exceções` usa foco em `Políticas`, `VIPs`, `Contingência` e `Motor`
  - `Trilha Institucional` usa foco em `Relatório de Dados`, `Radar` e `Telemetria`
- `BlockingReleases` passou a aceitar contexto e conjunto de abas permitidas, permitindo derivar visoes especializadas sem duplicar codigo ou perder rastreabilidade
- as visoes especializadas ganharam densidade institucional:
  - `Governança de Dados` agora expõe um regime institucional de dados com foco em evidencia, fontes correlacionadas, recorte operacional e exportacao formal
  - `Aprovações & Exceções` agora expõe um quadro decisorio institucional com criterio minimo, revisao periodica e aplicacao formal
  - `Trilha Institucional` agora expõe linha do tempo unificada com acoes administrativas, contingencias e evidencias de acesso
  - `Radar` dentro da trilha ganhou leitura de correlacao institucional para apoiar investigacao sem cair em visual de debug
- workflow formal de governanca incorporado aos fluxos principais sem depender de backend novo:
  - politicas, VIPs e contingencia agora capturam `base legal`, `solicitante`, `alcada de aprovacao` e `revisao prevista`
  - esses metadados sao serializados de forma estruturada nos campos ja existentes da API, preservando compatibilidade
  - as leituras principais do modulo agora exibem esses metadados como badges institucionais, reforcando decisao formal, prazo e responsabilizacao
- ciclo decisorio institucional aprofundado na interface:
  - politicas, VIPs e contingencia agora capturam `status institucional`
  - os estados previstos incluem `Em análise`, `Aprovado`, `Em vigor`, `Em revisão`, `Revogado` e `Expirado`
  - a leitura das listas agora exibe status, fundamento, autoria, aprovacao e revisao como elementos visiveis da governanca
- validacao de compatibilidade e encaixe governamental aplicada:
  - frontend continuou compilando com as novas rotas e visoes especializadas
  - backend continuou compilando com `tsc` sem necessidade de alterar contrato das APIs
  - a exportacao PDF de auditoria passou a emitir relatorio governamental com cabecalho institucional da `Secretaria de Comércio, Indústria, Serviços e Inovação` da `Prefeitura Municipal de Jacarezinho - PR`
  - a rota existente `GET /api/bloqueios-liberacoes/audit/export.pdf` foi preservada
  - o nome do arquivo exportado foi atualizado para padrao governamental sem quebrar a integracao da UI
  - as trilhas continuam suportadas pelas tabelas e logs dedicados ja existentes no banco, especialmente `action_audit_logs`, `domain_policy_audit_logs` e `dns_contingency_audit`
- estabilizacao do modulo `BlockingReleases` aplicada:
  - corrigido `ReferenceError` em `Políticas Institucionais` por uso de `managedVlanIds` e `contingencyActive` antes da inicializacao
  - corrigido `ReferenceError` em `Aprovações & Exceções` por uso de `runEngineAction` antes da inicializacao
  - a composicao de badges e quick actions foi reordenada para respeitar o ciclo de declaracao do React sem alterar payloads ou rotas
  - o frontend voltou a compilar com bundle limpo apos essa correcao
  - corrigido looping entre `Políticas & Escopos` e `Exceções VIP` em `Aprovações & Exceções`
  - a sincronizacao entre aba ativa e query string foi centralizada em um unico fluxo para eliminar disputa entre `activeTab` e `searchParams`
  - a navegacao interna do modulo agora troca abas e atualiza a URL de forma atomica
- endurecimento da autenticacao institucional iniciado na camada core:
  - login passou a emitir sessao por cookies `HttpOnly`, `Secure` e `SameSite=Lax`
  - access token agora opera com 30 minutos e refresh token com 7 dias
  - refresh token rotation com invalidacao do token anterior e deteccao de reuso foi implantado no backend
  - reuso de refresh token agora revoga todas as sessoes ativas do usuario
  - senhas novas e alteradas passaram a ser geradas em `Argon2id`
  - logins antigos com hash `bcrypt` sao migrados para `Argon2id` no primeiro login valido
  - criadas tabelas persistentes `auth_refresh_sessions` e `auth_activity_logs` com `REVOKE ALL FROM PUBLIC`
  - trilha institucional de autenticacao passou a registrar login, refresh, logout e falhas com IP, user agent, rota, metodo e status
  - `backend core` passou a aceitar autenticacao via cookie e manter compatibilidade com bearer token
  - `backend-proxy` passou a aceitar o cookie institucional `sgcg_access`
  - o runtime proxy passou a encaminhar cookies para o `backend-proxy`
  - o frontend deixou de depender de `localStorage` para tokens e passou a operar com sessao por cookie
  - `axios` e `authFetch` agora usam `withCredentials` e tentam `refresh` automatico em `401`
  - o carregamento inicial da aplicacao passou a resolver a sessao via `GET /api/auth/me`
  - o `logout` institucional passou a encerrar a sessao no backend e limpar os cookies
  - o core recebeu `helmet`, `HSTS`, `CSP` e `rate limiting` nas rotas de autenticacao
- modulo central de `LGPD & Proteção de Dados` incorporado ao frontend:
  - nova rota `/lgpd` adicionada na camada de governanca
  - leitura centralizada de autenticacoes, falhas, IPs e trilha institucional consumindo `auth_activity_logs`
  - o modulo assume a camada oficial de evidencias de acesso e responsabilizacao administrativa
- `ClamAV` incorporado a `Operações Técnicas`:
  - servicos `clamav-daemon`, `clamav-freshclam` e `clamav-clamonacc` passaram a ser monitorados no backend
  - o sentinela de servicos do core agora considera o `ClamAV` como servico critico
  - novas acoes taticas de atualizacao de assinaturas e varredura antimalware foram adicionadas
  - novas execucoes sao persistidas em `control_antimalware_runs`
  - a UI de `Operações Técnicas` agora mostra cobertura institucional, superficies verificadas e historico recente do antimalware
- `Observabilidade DNS/Proxy` refatorado para o padrao SGCG:
  - a pagina foi reescrita com os primitives institucionais do sistema
  - o modulo passou a assumir explicitamente o papel de telemetria, saude e evidencia operacional
  - a UI antiga em estilo isolado foi substituida por quatro visoes:
    - `Visão Consolidada`
    - `Radar DNS`
    - `Motor Complementar`
    - `Relatórios`
  - o modulo preserva os endpoints existentes e continua sem assumir decisoes de politica administrativa
  - a relacao com `Bloqueios & Liberações` ficou explicita: politica decide, observabilidade comprova e sustenta diagnostico
- `Aprovações & Exceções` aprofundado para workflow institucional persistido:
  - `domain_policies` e `policy_exceptions` passaram a persistir campos formais de governanca, sem depender apenas de serializacao em texto
  - o ciclo institucional agora suporta persistencia explicita de:
    - `resumo de governanca`
    - `base legal`
    - `solicitante`
    - `alcada de aprovacao`
    - `status institucional`
    - `revisao prevista`
    - `aprovado por`
    - `aprovado em`
    - `vigencia inicial`
    - `vigencia final`
    - `revogado por`
    - `revogado em`
  - o frontend passou a ler primeiro os campos persistidos e manter fallback para o texto legado em `description`, `notes` e `reason`
  - os formularios de `Políticas nomeadas` e `Exceções VIP` foram ampliados para capturar aprovacao, vigencia e revogacao de forma estruturada
  - os cards do modulo passaram a exibir badges institucionais de aprovacao, vigencia, expiracao e revogacao
  - a compatibilidade com os contratos e endpoints existentes foi preservada
- bootstrap de autenticacao do frontend corrigido:
  - removido o comportamento que fazia `reload` automatico na rota `/` quando a sessao estava ausente ou o refresh falhava
  - o interceptor passou a tratar `GET /api/auth/me` sem redirecionamento agressivo, evitando loop infinito na tela de login
  - o fallback continua redirecionando para `/` quando a sessao expira fora da tela de login
- fluxo real de sessao entre login e modulos corrigido:
  - `authFetch` deixou de depender de URL relativa implicita e passou a resolver requests pela mesma base de API usada no login institucional
  - isso elimina divergencia entre `frontend` em `6777` e API institucional em `443/6778`, especialmente nos modulos que operavam via `authFetch`
  - a emissao e limpeza dos cookies de autenticacao passou a respeitar o protocolo efetivo da requisicao (`HTTPS` via proxy ou acesso direto), em vez de forcar `Secure` incondicionalmente
  - com isso, o login deixa de aparentar sucesso sem sessao persistida quando o ambiente estiver sendo acessado fora do fluxo HTTPS esperado
  - o objetivo operacional agora fica consistente:
    - login autentica
    - `/api/auth/me` reconhece a sessao
    - modulos autenticados deixam de derrubar o usuario de volta para a tela de login por perda de cookie
- compatibilidade de autenticacao reforcada por token de acesso no frontend:
  - `login` e `refresh` passaram a devolver `accessToken` tambem no corpo da resposta
  - o frontend voltou a aceitar fallback por `Bearer` para conviver com ambientes em que o cookie institucional nao esteja sendo persistido corretamente
  - `api` e `authFetch` agora anexam `Authorization: Bearer` quando `becker_token` estiver presente
  - o token de fallback e limpo no `logout` e em redirecionamentos de sessao invalida
  - a sessao institucional por cookie continua existindo; o fallback por bearer entra para evitar quebra operacional imediata
- bootstrap da tela de login refinado:
  - `GET /api/auth/me` deixou de acionar tentativa automatica de `refresh`
  - em aba anonima ou sessao inexistente, o comportamento correto agora passa a ser apenas permanecer na tela de login com `401` simples
  - isso reduz ruido de console e evita falsa sensacao de falha em cascata antes mesmo do usuario autenticar
- revisao estrutural da sessao identificou conflito na politica de cookie:
  - o ajuste anterior de cookies ainda ficava neutralizado por uma heuristica baseada em `APP_BASE_URL`
- endurecimento do modulo de acesso aplicado para prevenir bloqueio acidental de VLAN inteira:
  - a rota `POST /api/access/block` agora aceita apenas `IP` unico ou `MAC` unico
  - entradas em formato `CIDR` ou subnet passaram a ser rejeitadas com `400` antes de qualquer chamada ao `iptables`
  - a rota `POST /api/access/unblock` tambem valida o alvo antes de tentar remover a regra
  - o objetivo operacional e impedir que um bloqueio administrativo destinado a um host isolado derrube a navegacao de uma VLAN inteira por erro de entrada
  - na pratica, `Secure=true` continuava sendo aplicado mesmo quando a requisicao nao estava sendo percebida corretamente como HTTPS pelo app
  - a logica foi simplificada para usar apenas o protocolo efetivo da requisicao (`req.secure` ou `x-forwarded-proto=https`)
  - isso remove o conflito entre endurecimento da seguranca e persistencia funcional da sessao
- endurecimento corretivo do frontend no fluxo de autenticacao:
  - o sistema deixou de promover o usuario a logado apenas porque o `login` devolveu `user`
  - o `login` agora exige comprovacao de sessao funcional via `GET /api/auth/me` antes de concluir a autenticacao na UI
  - se a sessao nao persistir, o frontend limpa `becker_token` e `becker_user` e exibe erro explicito de persistencia
  - foi adicionada invalidacao global de sessao no frontend para desmontar a aplicacao autenticada assim que ocorrer o primeiro `401` terminal
  - isso elimina o efeito de `login falso` com dashboard em loop
  - `api` e `authFetch` passaram a compartilhar um sinal de sessao invalidada para conter tempestade de requests e refresh em cascata
- consolidacao do modelo de autenticacao por boas praticas:
  - o fallback improvisado de `accessToken` em corpo de resposta e `localStorage` foi removido
  - o frontend voltou a operar de forma coerente com sessao por cookie `HttpOnly`
  - `login` e `refresh` deixam de expor token de acesso no payload JSON
  - a autenticacao no cliente passa a depender de:
    - `POST /api/auth/login`
    - persistencia do cookie de sessao
    - confirmacao por `GET /api/auth/me`
  - isso reduz superficie de exposicao e elimina o modelo hibrido inseguro e inconsistente entre cookie e bearer
- autenticacao revertida para modo simples e operacional:
  - o frontend voltou a usar `Bearer` em `localStorage` como mecanismo primario de sessao
  - a dependencia operacional de `refresh token rotation` e de persistencia por cookie foi removida da UI
  - `login` volta a exigir `accessToken` explicito no payload para concluir autenticacao
  - `GET /api/auth/me` continua sendo usado para validar token existente na inicializacao
  - ao primeiro `401`, a sessao local e descartada e a aplicacao retorna ao login sem novas tentativas de refresh
  - o objetivo desta reversao e restaurar estabilidade antes de um novo endurecimento de autenticacao mais maduro
- compatibilidade aplicada com o backend legado em producao:
  - o frontend passou a aceitar `token` no payload de `login`, alem de `accessToken`
  - o bootstrap inicial deixou de depender de `GET /api/auth/me`, porque o runtime real ainda responde no contrato antigo de sessao bearer simples
  - a sessao local agora sobe a partir de `becker_token` + `becker_user`, alinhando a UI ao backend atualmente em execucao
  - isso restaura operacao com o contrato real sem manter o frontend preso a um fluxo de autenticacao mais novo que ainda nao esta refletido no runtime
- consolidacao recente da refatoracao institucional:
  - o travamento do login no frontend foi corrigido:
    - `POST /api/auth/login` deixou de ser bloqueado pelo estado global de sessao invalidada
    - a tela de login passou a limpar estado e token legados antes de nova autenticacao
    - o frontend manteve compatibilidade com payloads que retornam `token` no lugar de `accessToken`
  - `Operações Técnicas` e `Segurança Operacional` foram estabilizados:
    - os daemons do sistema nao desaparecem mais da UI quando a leitura de `ClamAV` falha
    - a configuracao `SMTP` voltou a aparecer como card proprio e visivel na tela de seguranca
    - o estado padrao de `SMTP` deixou de sinalizar falso positivo de notificacoes habilitadas
- rodada de endurecimento institucional e eliminacao de fachada aplicada:
  - `Políticas Institucionais` deixou de sumir quando uma rota critica falhava ou excedia timeout
  - `BlockingReleases` agora usa `Promise.allSettled` na carga e preserva os dados anteriores em caso de falha parcial
  - o frontend passou a acusar falha parcial explicitamente, em vez de substituir `VLANs`, `ACLs` e `VIPs` por listas vazias
  - a rotina `ensureBlockingReleaseSchema` deixou de executar DDL pesado sem necessidade no caminho quente de leitura
  - o bootstrap de schema agora verifica existencia previa das estruturas e usa `pg_advisory_lock` para serializar criacao residual
  - o risco de deadlock no bootstrap do modulo institucional foi reduzido sem abrir mao da autoprotecao do schema
- fluxo institucional de sessao refinado:
  - o `login` agora fixa a URL para `/`, garantindo entrada sempre em `Centro de Governança`
  - o `logout` passou a limpar a sessao local imediatamente e a revogacao no backend roda em paralelo
  - a interface deixa de aparentar travamento no ciclo `logout -> login`
- `Governança de Dados` promovido a modulo proprio de verdade:
  - a rota `GET /api/data-governance/metrics` deixou de herdar a telemetria consolidada pesada de `Políticas Institucionais`
  - o modulo agora calcula metricas diretamente de `dns_policy_events` e `proxy_policy_events`
  - o `overview` do modulo passou a ler sumarios e destaques a partir dessa leitura dedicada
  - `90d` deixou de ser truncado silenciosamente para `30d`
  - falha parcial em `Governança de Dados` nao oculta mais toda a superficie da pagina
  - o modulo preserva as abas `Painel Executivo`, `Relatório de Acessos` e `Telemetria` mesmo com degradacao parcial de uma fonte
- endurecimento da sincronizacao de telemetria:
  - `syncTelemetry()` passou a operar com janela de reaproveitamento temporal e suporte a execucao em background
  - leituras institucionais deixaram de disparar reimportacao massiva a cada refresh
  - a sincronizacao forcada continua disponivel por acao operacional dedicada quando for necessaria reindexacao

## Validacao mais recente

- `frontend`: `npm run build` validado
- `backend-proxy`: `npm run build` validado
- `backend-proxy` reiniciado no `PM2`
- `bcc-frontend` reiniciado no `PM2`
- rotas verificadas manualmente:
  - `GET /api/data-governance/overview?period=24h`
  - `GET /api/data-governance/audit/events?period=24h&limit=10`
  - `GET /api/data-governance/metrics?range=24h`
  - `GET /api/data-governance/metrics?range=90d`
  - `GET /api/data-governance/radar/realtime?window_minutes=10&limit=10`

## Observacao operacional atual

- `backend-proxy/regras/listas/blocked_domains.txt` permaneceu fora deste registro porque nao compoe a rodada documental atual e pode conter alteracao operacional paralela ao trabalho de codigo
  - a navegacao lateral foi refinada para o padrao institucional atual:
    - o logotipo da `JMB Tecnologia` foi incorporado ao sidebar
    - o header do sidebar foi compactado
    - a divisao visual entre `Governanca` e `Controle` foi reforcada
    - o modulo ativo passou a permanecer claramente marcado pela rota corrente
  - a arquitetura de modulos foi desduplicada:
    - `Governança de Dados` deixou de repetir `Radar Operacional`
    - `Trilha Institucional` deixou de reutilizar a mesma leitura de `Relatório de Dados` e `Radar`
    - a divisao institucional passou a operar assim:
      - `Políticas Institucionais`: decisao, excecoes, contingencia e enforcement
      - `Governança de Dados`: evidencia e indicadores
      - `Trilha Institucional`: responsabilizacao administrativa, autenticacao e operacoes sensiveis
      - `Radar Operacional & Observabilidade`: telemetria operacional
  - o modulo `LGPD & Proteção de Dados` foi ampliado para escopo institucional real:
    - backend novo em `/api/lgpd` com persistencia dedicada de:
      - atividades de tratamento
      - requisicoes do titular
      - incidentes
      - auditoria LGPD
    - as tabelas `lgpd_*` foram criadas com `REVOKE ALL FROM PUBLIC`
    - o frontend passou a consumir dashboard, cadastros, incidentes e auditoria LGPD
    - a trilha institucional de acesso foi incorporada ao modulo com leitura explicita de:
      - quem acessou
      - quando
      - de qual IP
      - em qual rota
      - por qual metodo
      - com qual resultado
      - data e hora
  - a leitura de `DNS Institucional` foi corrigida para refletir operacao real:
    - o status principal passou a diferenciar `RESOLVENDO`, `DEGRADADO` e `PARADO`
    - a verificacao considera resposta real de resolucao, nao apenas `systemctl is-active`
    - `Redes Monitoradas` deixou de usar uma leitura artificial de latencia e passou a consumir `/api/dns/vlan-summary`
    - o resumo por VLAN no `backend-proxy` agora consolida eventos reais do radar por:
      - VLAN observada
      - total de consultas
      - total de bloqueios
      - quantidade de IPs unicos
    - a UI de `Controle de Rede > DNS Institucional` agora mostra as VLANs monitoradas com as consultas realizadas ao `Unbound`
  - o relatorio governamental de dados passou a excluir domínios internos no padrao `*.vlan<number>.local`, evitando poluicao institucional por nomes internos de host
- varredura de coerencia institucional aplicada em nova rodada:
  - o contrato do `DNS Institucional` foi unificado no `backend-proxy`:
    - `/api/dns/stats` passou a devolver simultaneamente telemetria operacional e saude real do `Unbound`
    - o estado de DNS agora considera:
      - `systemctl is-active unbound`
      - prova de resolucao real via `dig @127.0.0.1 gov.br`
    - isso corrige a situacao em que a UI marcava o DNS como parado por receber um payload de telemetria que nao continha `is_running` e `is_resolving`
  - o modulo `LGPD & Proteção de Dados` foi reposicionado para uma leitura aderente ao uso governamental:
    - a trilha de acesso deixou de ser o centro do modulo e passou a atuar como evidencia complementar
    - o modulo agora se organiza sobre cinco pilares:
      - estrutura institucional do programa LGPD
      - registro de operacoes de tratamento
      - direitos do titular
      - incidentes com dados pessoais
      - auditoria dedicada do proprio modulo
    - a modelagem nova foi alinhada aos eixos normativos mais relevantes da LGPD:
      - `art. 18`: direitos do titular
      - `art. 37`: registro das operacoes de tratamento
      - `art. 41`: encarregado
      - `art. 48`: comunicacao de incidentes
  - o backend do modulo LGPD foi ampliado:
    - criada a tabela protegida `lgpd_program_settings` com `REVOKE ALL FROM PUBLIC`
    - adicionados endpoints:
      - `GET /api/lgpd/program-settings`
      - `POST /api/lgpd/program-settings`
    - o dashboard LGPD passou a consolidar:
      - configuracao institucional do programa
      - lacunas de conformidade no inventario
      - solicitacoes vencidas
      - incidentes graves ainda sem comunicacao formal
      - distribuicao das solicitacoes por direito do titular
  - o frontend do modulo LGPD foi refeito para o contexto GovTech:
    - nova secao de `Programa Institucional LGPD` com:
      - controlador
      - unidade responsavel
      - encarregado
      - canal do titular
      - aviso de privacidade
      - frequencia e ultima revisao do programa
    - nova leitura de `Direitos do Titular` com contagem por tipo de requerimento
    - nova leitura de `Lacunas de conformidade` para orientar decisao administrativa
    - a secao de acesso institucional foi mantida como evidencia complementar e nao como representacao indevida da LGPD inteira
  - limpeza estrutural aplicada no codigo-fonte:
    - removidos arquivos mortos de backup dentro da aplicacao:
      - `frontend/src/pages/Network.jsx.bak`
      - `frontend/src/services/api.js.bak`
      - `frontend/index.html.bak`
      - `backend/src/server.ts.bak`
    - essa limpeza reduz ambiguidade entre versoes antigas e o runtime efetivo do sistema

## Proximo passo recomendado

- corrigir a classificacao de VLAN na origem do logger/radar para eliminar eventos ainda carimbados como `VLAN10` por default e garantir que toda consulta ao `Unbound` ja nasca vinculada a VLAN real no banco
- depois disso, validar o fluxo em ambiente real com verificacao ponta a ponta de:
  - `DNS Institucional` resolvendo e refletindo estado correto na UI
  - `LGPD` persistindo configuracao institucional, titulares, inventario e incidentes com dados reais

## Atualizacao complementar de classificacao VLAN

- a origem do radar `DNS/Proxy` deixou de gravar eventos sempre como `VLAN10`
- o `backend-proxy` agora infere a VLAN real do cliente pela sub-rede/IP no momento da ingestao do `proxy_radar_events`
- a leitura do radar tambem passou a preferir a VLAN inferida pelo IP quando houver divergencia no dado historico gravado
- o resumo `Redes Monitoradas` e o filtro por VLAN deixam de depender do carimbo fixo legado e passam a refletir a origem real do cliente
- a heuristica de `clientes reais` no `engine-control` foi alinhada a essa mesma inferencia, evitando reconhecer apenas um subconjunto antigo de VLANs

## Atualizacao operacional LGPD - 2026-04-26

- corrigida falha parcial no modulo `LGPD & Proteção de Dados` que afetava `painel LGPD`, `estrutura institucional` e `atividades de tratamento`
- causa confirmada: concorrencia no `ensureSchema()` do backend LGPD quando a tela disparava varias requisicoes simultaneas no carregamento inicial
- erro reproduzido via HTTP local como `tuple concurrently updated`
- `backend/src/modules/lgpd/lgpd-service.ts` passou a inicializar o schema LGPD em modo `single-flight`, compartilhando a mesma promise entre chamadas concorrentes
- isso impede DDL simultaneo no caminho quente de leitura e estabiliza os endpoints:
  - `GET /api/lgpd/dashboard`
  - `GET /api/lgpd/program-settings`
  - `GET /api/lgpd/processing-activities`
  - `GET /api/lgpd/requests`
  - `GET /api/lgpd/incidents`
  - `GET /api/lgpd/audit`
- `npm run build` do backend foi executado com sucesso
- `bcc-backend` foi reiniciado no `PM2`
- validacao paralela pos-restart confirmou `200` em todos os endpoints LGPD listados
- alteracoes paralelas existentes em `backend-proxy/regras/listas/blocked_domains.txt`, `backend/src/modules/control/control-routes.ts` e `frontend/src/pages/Control.jsx` foram preservadas e nao fizeram parte desta correcao

## Atualizacao operacional DNS Institucional - 2026-04-26

- corrigida falha parcial no modulo `DNS Institucional` dentro de `Controle de Rede`
- causa confirmada: o frontend chamava `/api/dns/zones`, mas o Nginx encaminha `/api/dns/*` para o `backend-proxy`, que ainda nao expunha as rotas legadas de zonas DNS
- `backend-proxy/src/routes/dns-routes.ts` passou a expor compatibilidade para:
  - `GET /api/dns/zones`
  - `POST /api/dns/zones/add`
  - `POST /api/dns/zones/delete`
  - `POST /api/dns/zones/verify`
  - `POST /api/dns/cache/flush`
- as rotas usam a tabela `net_dns_rules`, sincronizam `/etc/unbound/unbound.conf.d/custom-zones.conf` e recarregam o `Unbound` quando necessario
- `npm run build` do `backend-proxy` foi executado com sucesso
- `backend-proxy` foi reiniciado no `PM2`
- validacao local no backend-proxy confirmou `200` para:
  - `GET /api/dns/stats`
  - `GET /api/dns/vlan-summary`
  - `GET /api/dns/zones`
- corrigida tambem a leitura de latencia do card do modulo:
  - `/api/dns/stats` passou a calcular `stats.avg_latency` a partir de probes reais com `dig @127.0.0.1`
  - quando o `dig` retorna `Query time: 0 msec` por resposta em cache local, o backend usa o tempo real decorrido da probe como fallback
  - isso impede o card de latencia de permanecer artificialmente em `0 ms`
  - validacao pos-restart confirmou `avg_latency` retornando valor positivo e `latency_samples_ms` populado

## Proximo passo recomendado

- executar validacao em ambiente real com eventos novos do `Squid` e do `Unbound` para confirmar:
  - entradas recentes do radar aparecendo na VLAN correta
  - `Redes Monitoradas` consolidando consultas por VLAN real
  - `DNS Institucional` mostrando `RESOLVENDO` quando houver resposta efetiva do `Unbound`

## Regra operacional para proximas sessoes

Ao final de cada sessao:

1. atualizar este `CODEX.md`
2. registrar o que mudou
3. registrar o estado atual
4. registrar o proximo passo recomendado

## Atualizacao operacional de enforcement - 2026-04-27

- sistema versionado nesta rodada:
  - `frontend`: `8.2.0`
  - `backend`: `1.2.0`
  - `backend-proxy`: `1.2.0`
- regra institucional consolidada: `VIP` e `Exceção Esporádica` sao excecoes especiais e nao devem ser apagadas nem afetadas por expurgos automaticos de conexao
- clientes fora de `VIP` e fora de `Exceção Esporádica` ativa passam a compor o `oceano` operacional
- o `backend-proxy` passou a filtrar clientes com bypass ativo antes de derrubar conexoes persistentes
- o expurgo automatico de sessoes sociais atua somente no `oceano` e remove estados `conntrack` de:
  - `TCP/80`
  - `TCP/443`
  - `UDP/443` para QUIC/HTTP3
  - `TCP/853` para DoT
- o objetivo e impedir que apps Android mantenham sessoes abertas de Instagram, Facebook, TikTok e CDNs correlatas apos a politica bloquear o DNS
- o fluxo de aplicacao de politicas passou a executar fechamento automatico de sessoes sociais recentes, salvo quando explicitamente desativado por opcao tecnica
- a revogacao de `VIP` e `Exceção Esporádica` passou a derrubar sessoes persistentes do IP revogado depois da remocao formal do bypass
- a remocao de VIP foi endurecida para exclusao logica com auditoria:
  - `active = false`
  - `lifecycle_status = revoked`
  - `revoked_by`
  - `revoked_at`
- o `DELETE /api/bloqueios-liberacoes/exceptions/:id` passou a ser idempotente, retornando sucesso quando o registro ja estiver ausente para evitar erro falso na UI
- a rota `POST /api/bloqueios-liberacoes/sporadic-exceptions` foi validada no `backend-proxy` e deixou de responder `404` apos rebuild/restart
- a regra operacional do `PontoRH` foi preservada:
  - OpenDNS `208.67.220.220` e `208.67.222.222` liberados para DNS classico `TCP/UDP 53` na VLAN 10
  - DoH/DoT e demais DNS externos continuam bloqueados
- `sso.acesso.gov.br`, `acesso.gov.br`, `gov.br` e subdominios `*.gov.br` foram protegidos contra bloqueio por politica institucional
- o diagnostico do IP `192.168.10.134` confirmou que a falha no Chrome vinha de `DNS Seguro` apontando para `chrome.cloudflare-dns.com`
- `chrome.cloudflare-dns.com` permanece bloqueado por seguranca, pois representa DoH externo capaz de burlar RPZ, LGPD e politicas institucionais
- VLANs `30` e `70` tiveram escopo corrigido para remover `redes_sociais` da allowlist antiga
- VLANs `10`, `30`, `50` e `70` agora convergem para a regra: redes sociais somente via `VIP` ou `Exceção Esporádica`
- saneamento do enforcement DNS aplicado para evitar indisponibilidade por firewall legado:
  - `dns_contingency_state` estava `expired` em `2026-04-27 14:26:40 -03`, mas a chain `DNS_EMERGENCY_V8` ainda mantinha `DROP` de `TCP/UDP 53`
  - o `backend-proxy` passou a remover o bloco de contingencia quando o estado nao estiver `active`, devolvendo o enforcement normal para `ACL + DNS` via `Unbound` e `Squid`
  - consultas a `policy_exceptions` usadas por contingencia, interceptacao e resolucao agora aceitam apenas entradas `masklen(ip) = 32`, impedindo que uma subnet como `192.168.10.0/24` vire bypass amplo por erro de cadastro
  - o host foi alinhado para redirecionar `DNS 53` das VLANs internas ao `Unbound` local em vez de derrubar as consultas no `FORWARD`
  - os `DROP` legados de `53` em `ufw-user-forward` foram removidos dos arquivos persistentes `user.rules` e `user6.rules`
  - os bloqueios de `DoT` (`TCP/853`) e `DoH/QUIC` observados na VLAN 10 permaneceram ativos para evitar bypass das politicas de RPZ e ACL
  - a inconsistência operacional do `ufw` foi corrigida: `/etc/ufw/ufw.conf` voltou para `ENABLED=yes`
  - com isso, `ufw reload` voltou a funcionar e o ciclo de aplicacao persistente do firewall deixou de depender apenas do runtime herdado
- `Operações Técnicas` passou a concentrar a `Liberação emergencial por VLAN` como acao de controle, sem confundir esse fluxo com governanca nem com `VIP`:
  - foi criada trilha propria `emergency_vlan_bypass` no `backend-proxy`, com `vlan_id`, motivo, solicitante, ativacao, expiracao, desativacao e estado ativo
  - a ativacao opera como bypass temporario real por VLAN e nao como excecao individual
  - `VIP` permaneceu restrito a host individual, preservando o endurecimento que impede subnet ampla em `policy_exceptions`
  - ao ativar o bypass de uma VLAN, o sistema suspende contingencia DNS conflitante para evitar sobreposicao de modos
  - a expiracao automatica do bypass recompila os artefatos e reaplica o enforcement institucional
- o runtime institucional passou a respeitar bypass emergencial por VLAN em todas as camadas relevantes:
  - `Policy Compiler` exclui a VLAN emergencial do conjunto tagueado de RPZ e injeta sua subnet como bypass tecnico
  - o `Unbound` deixa de aplicar `RPZ` a essa rede enquanto o bypass estiver ativo
  - o `Squid` deixa de impor ACL categórica a essa rede ao receber a subnet no arquivo de bypass por IP/rede
  - a `Interceptação Seletiva` deixa de redirecionar a VLAN emergencial
  - a resolucao institucional marca consultas dessa rede como `bypassed` por fonte `emergency-vlan`
  - filtros que derrubam sessoes ativas agora preservam clientes pertencentes a VLAN em bypass emergencial
- a interface de `Operações Técnicas` ganhou quadro operacional dedicado para `Liberação emergencial por VLAN`:
  - foco em `VLAN 10`, `30`, `50` e `70`
  - leitura imediata de status, motivo e expiracao
  - acao direta para ativar bypass com duracao de `15`, `30`, `60`, `120` minutos ou modo manual
  - acao direta para encerrar bypass e restaurar o enforcement institucional
- as ACLs do modulo passaram a aceitar `dominios` e `URLs` no fluxo de politicas nomeadas:
  - `domain_policy_entries` ganhou tipagem explicita de entrada com `entry_type`
  - entradas `domain` continuam alimentando `RPZ` e `ACL` por dominio
  - entradas `url` passam a ser persistidas separadamente, com host normalizado para contexto tecnico e valor bruto preservado para interface e auditoria
  - a sincronizacao legada para `blocking_policies` e `release_policies` continua projetando apenas dominios, evitando prometer enforcement DNS para regra de URL
- o motor complementar do `Squid` passou a respeitar ACLs por URL para bloquear e liberar:
  - arquivos globais `proxy_whitelist_url.acl` e `proxy_blocklist_url.acl` passaram a ser gerados pelo `Policy Compiler`
  - cada VLAN agora pode receber tambem `allowlist-vlan-<id>-url.acl` e `blocklist-vlan-<id>-url.acl`
  - o `squid.conf` institucional passou a declarar ACLs `url_regex -i` para essas listas
  - a ordem de precedencia foi ampliada para permitir `allow` por URL antes de `deny` por URL e antes do bloqueio por dominio correspondente
  - com isso, o modulo consegue liberar ou bloquear caminhos especificos sem perder o enforcement atual por dominio
- a interface de `Políticas` em `Bloqueios & Liberações` foi ajustada para refletir o novo contrato:
  - o editor agora orienta o operador a informar `dominios e URLs`
  - a pre-visualizacao e a reabertura da politica preservam o valor bruto digitado, inclusive URLs completas
- validacao operacional executada:
  - `cd backend-proxy && npm run build`
  - `pm2 restart backend-proxy --update-env`
  - recompilacao de politicas via `policyCompilerService.compile`
  - `unbound-control reload`
  - `systemctl reload squid`
  - expurgo manual inicial de sessoes sociais recentes do `oceano`
  - confirmacao de que VIPs ativos permaneceram preservados

## Atualizacao operacional Relatorios Forenses — 2026-04-28

- campo `Acao` na aba `Auditoria do Sistema` passou a exibir descricao humanizada em portugues
  - mapeamento explicito de acoes tecnicas brutas (`login`, `compile_policy`, `emergency_bypass`, etc.) para texto institucional legivel
  - fallback automatico para acoes desconhecidas: substituicao de `_` por espaco com capitalizacao
  - humanizacao aplicada tanto na interface web (`Reports.jsx`) quanto no PDF de auditoria exportado (`reports-service.ts`)
- eventos gerados pelo operador `codex` excluidos de todas as fontes de auditoria do sistema:
  - `action_audit_logs` — filtro por `requested_by`
  - `auth_activity_logs` — filtro por `username`
  - `lgpd_audit_logs` — filtro por `actor_username`
  - `domain_policy_audit_logs` — filtro por `requested_by`
  - exclusao aplicada diretamente no SQL com `LOWER(COALESCE(...)) <> 'codex'`

### Build

- `cd backend && npm run build` — compilacao TypeScript concluida sem erros
- `cd frontend && npm run build` — `✓ built in 2.74s`
- `pm2 restart bcc-backend bcc-frontend` — ambos `online`

## Correcao barra legal LGPD em Relatorios Forenses — 2026-04-28

- corrigida invisibilidade da barra de fundamento legal no tema Light
- causa: Tailwind v4 processa `dark:` via `@media (prefers-color-scheme: dark)` (preferencia do OS), nao pelo `data-theme` do SGCG
  - quando OS esta em dark e SGCG em Light, `dark:text-white` aplicava texto branco sobre fundo claro
- solucao: removidos todos os `dark:` da barra e substituidos por tokens do design system
  - `text-on-surface` — adapta automaticamente ao `data-theme`
  - `bg-surface-high` — superficie correta em qualquer tema
  - `border-outline/20` — borda proporcional ao tema
  - `bg-primary/8` e `text-primary` nas pills — destaque institucional correto em ambos os temas
- sidebar LGPD revertido ao estilo padrao (remocao do highlight emerald aplicado em rodada anterior)

## Reestruturacao de navegacao e identidade LGPD — 2026-04-28

### Decisao arquitetural

`Trilha Institucional` foi removida da navegacao lateral porque sua funcao foi integralmente absorvida por dois modulos mais maduros:
- `Relatórios Forenses`: evidencia forense real com 4 fontes de auditoria, imutabilidade por trigger e exportacao PDF institucional
- `LGPD & Proteção de Dados`: trilha de acesso com contexto normativo, programa institucional, titulares, incidentes e auditoria LGPD dedicada

A remocao elimina redundancia navegacional e reduz ambiguidade para gestores e operadores.

Qualquer acesso antigo a `/trilha-institucional` e redirecionado automaticamente para `/relatorios`.

### LGPD como modulo de destaque institucional

O item `LGPD & Proteção de Dados` passou a ter tratamento visual diferenciado na barra lateral:
- fundo e borda em verde esmeralda permanente, mesmo sem estar ativo
- icone em verde esmeralda com glow ao ficar ativo
- badge `LEI 13.709` visivel ao lado do nome do modulo
- sublabel `Conformidade & Proteção de Dados` sempre visivel
- sinaliza de forma inequivoca que o sistema opera sob a Lei 13.709/2018 (LGPD)

### Build

- `cd frontend && npm run build` — `✓ built in 2.60s`
- `pm2 restart bcc-frontend` — `online`

## Proximo passo recomendado

Se houver demanda de gestores ou auditores externos, criar modulo dedicado de `Histórico de Decisões de Governança`:
- linha do tempo de criacao, aprovacao, vigencia e revogacao de politicas
- consumindo `domain_policy_audit_logs` e campos institucionais ja persistidos em `domain_policies`
- identidade clara e distinta de Relatórios Forenses (que mostra eventos tecnicos) e de LGPD (que mostra tratamento de dados pessoais)

## Modulo Relatorios Forenses - 2026-04-27

- novo modulo `Relatorios Forenses` adicionado ao frontend na rota `/relatorios`
- o modulo opera em dois eixos:
  - `Relatorio de Navegacao`: dados SARG-like consumindo `proxy_radar_events`, com visao por evento e visao agrupada por IP
  - `Auditoria do Sistema`: consolidacao de quatro fontes em um unico painel — `action_audit_logs`, `auth_activity_logs`, `lgpd_audit_logs`, `domain_policy_audit_logs`
- filtros disponiveis para navegacao: periodo, IP de origem, VLAN, dominio/URL, acao (block/allow), intervalo personalizado
- filtros disponiveis para auditoria: periodo, operador, IP, fonte, acao/modulo, resultado (sucesso/falha), intervalo personalizado
- exportacao em PDF institucional para ambos os relatorios (geracao server-side com PDFKit, landscape para navegacao, portrait para auditoria)
- os PDFs incluem cabecalho institucional, barra de fundamento legal LGPD e resumo executivo
- imutabilidade dos logs garantida por triggers PostgreSQL em quatro tabelas:
  - `trg_immutable_action_audit` -> `action_audit_logs`
  - `trg_immutable_auth_activity` -> `auth_activity_logs`
  - `trg_immutable_lgpd_audit` -> `lgpd_audit_logs`
  - `trg_immutable_domain_policy_audit` -> `domain_policy_audit_logs`
- qualquer tentativa de UPDATE ou DELETE nessas tabelas dispara excecao com mensagem: `SGCG: Registros de auditoria sao imutaveis. Fundamento: Lei 13.709/2018 (LGPD), Art. 46.`
- fundamento legal exibido no modulo: Lei 13.709/2018 (LGPD) Art. 6 I, Art. 37, Art. 46, Art. 48
- `Relatorios Forenses` adicionado ao sidebar na secao `Governanca` apos `Trilha Institucional`
- `@types/pdfkit` instalado no `backend`
- indices adicionados em `proxy_radar_events` para otimizar queries de relatorios por VLAN, IP e status de bloqueio

## Ultima validacao registrada

- `cd backend && npm run build`
- compilacao TypeScript concluida com o novo modulo de relatorios forenses
- `cd frontend && npm run build`
- `✓ built in 2.73s`
- `pm2 restart bcc-backend bcc-frontend`
- ambos voltaram `online`
- `GET /api/reports/navigation?period=24h&limit=3` -> `200` com sumario correto
- `GET /api/reports/audit?period=24h&limit=3` -> `200` com eventos de autenticacao reais
- `UPDATE action_audit_logs SET message = 'teste' WHERE id = 1` -> `ERROR: SGCG: Registros de auditoria sao imutaveis...` (trigger funcional)

## Correcao fonte de dados do relatorio de navegacao - 2026-04-27

- confirmado que o sistema usa DNS + ACL (Unbound + RPZ), nao Squid como proxy transparente
- `proxy_audit_log` tinha apenas registros antigos (14/04); dados reais estavam em `dns_policy_events`
- relatorio de navegacao migrado para `dns_policy_events` como fonte principal
- `dns_policy_events` contem: 2,4 milhoes de registros, atualizado em tempo real pelo ingester do backend-proxy
- campos utilizados: `occurred_at`, `client_ip` (inet, convertido com `host()`), `vlan_id` (integer ja resolvido), `query_name` (dominio consultado), `query_type` (A/AAAA), `response_code`, `action` (allowed/blocked/bypassed), `category`, `matched_rule`
- acoes possiveis: `allowed`, `blocked`, `bypassed` (VIP ou excecao esporadica)
- filtros de exclusao: loopback (`127.0.0.1`, `::1`), dominios `.local` e `.arpa`
- colunas da tabela frontend atualizadas: `Dominio consultado`, `Tipo` (query_type), `Resposta DNS` (response_code), `Categoria`; removidos `URL`, `Metodo`, `Volume`
- barra de fundamento legal LGPD alterada para cor preta com suporte dark mode
- validacao: `GET /api/reports/navigation?period=24h` retorna 429.043 eventos, 15.741 bloqueados, 413.302 liberados, 1.884 IPs unicos, 3.697 dominios unicos

## Proximo passo recomendado

- `cd backend-proxy && npm run build`
- compilacao TypeScript concluida apos o ajuste da contingencia DNS e filtragem de VIPs `/32`
- `pm2 restart backend-proxy --update-env`
- bootstrap voltou `online` e reescreveu `/etc/ufw/before.rules` sem reativar a contingencia expirada
- `unbound-checkconf`
- sem erros
- `systemctl is-active unbound`
- `active`
- `ufw reload`
- `Firewall reloaded`
- `squid -k parse`
- parsing concluido sem erro fatal
- `systemctl is-active squid`
- `active`
- `dig @127.0.0.1 cloudflare.com +short`
- resposta valida recebida
- `dig @127.0.0.1 gov.br +short`
- resposta valida recebida
- `cd backend-proxy && npm run build`
- compilacao TypeScript concluida sem quebra de contrato observada
- `cd backend && npm run build`
- compilacao TypeScript concluida com a nova camada de sessao institucional, ajuste de emissao de cookies por protocolo e fallback bearer
- `cd frontend && npm run build`
- `✓ built in 2.43s`
- `cd backend-proxy && npm run build`
- compilacao TypeScript concluida com o novo bypass emergencial por VLAN
- `cd frontend && npm run build`
- `✓ built in 3.10s`
- `cd backend-proxy && npm run build`
- compilacao TypeScript concluida com suporte a ACL por URL no motor complementar
- `cd frontend && npm run build`
- `✓ built in 2.83s`

## Hardening Preventivo de Rede — 2026-04-27

### Objetivo
Endurecer toda a infraestrutura contra: sniffing, DoS, SYN flood, port scan, ARP spoofing, DNS amplificação, brute force, e acesso não autenticado a endpoints sensíveis.

### Arquivos criados/modificados

#### Sistema operacional
- `/etc/sysctl.d/99-sgcg-hardening.conf` — parâmetros de kernel: rp_filter, TCP syncookies, timeouts, ICMP rate limit, ARP announce/ignore, desabilita source routing/redirects, log_martians, ASLR
- `/etc/sgcg/hardening-rules.sh` — script iptables com chain `SGCG_GUARD`: DROP NULL/XMAS/FIN scan, SYN flood (>20/s por IP via hashlimit), ICMP flood (>5/s), UDP flood (>50/s), connlimit >100, smurf/broadcast ICMP, pacotes fragmentados, bloqueio WAN direto às portas internas 6778/6777/8901
- `/etc/systemd/system/sgcg-hardening.service` — service oneshot que aplica o script acima no boot, inserido antes do fail2ban

#### DNS
- `/etc/unbound/unbound.conf.d/99-ratelimit.conf` — rate limiting DNS: 1000 req/s global, 200/s por IP, 200/s por domínio NXDOMAIN, max UDP 3072, hide-identity/version, QNAME minimisation, caps-for-id

#### Fail2ban
- `/etc/fail2ban/filter.d/sgcg-api.conf` — detecta 401/403 em /api/auth/login e /api/security/*
- `/etc/fail2ban/jail.d/sgcg-api.conf` — dois jails: `sgcg-api` (5 falhas/2min → ban 1h) e `sgcg-api-aggressive` (15 falhas/5min → ban 24h), logs: beckercorp-access.log + beckercorp_access.log

#### ARP spoofing
- `arpwatch` instalado via apt
- `arpwatch@enp6s0.10/30/40/50/70/80/99.service` — monitoramento por VLAN, usando unit template oficial do pacote, arquivos .dat em /var/lib/arpwatch/

#### Backend SGCG
- `backend/src/server.ts` — adicionado `express-rate-limit`: global 300 req/min por IP, auth 10 req/2min por IP
- `backend/src/modules/security/security-routes.ts` — corrigido: `/f2b/ban`, `/f2b/unban`, `/ufw/delete`, `/setup-cockpit` agora exigem `requireJwt`; adicionada validação de IP (regex IPv4 + CIDR) e validação de ID de regra UFW (somente dígitos)

### Validações executadas
- `sysctl -p /etc/sysctl.d/99-sgcg-hardening.conf` — OK
- `unbound-checkconf` — OK (sem erros)
- `systemctl start sgcg-hardening.service` — OK (`active (exited)`)
- `systemctl restart unbound` — `active (running)`
- `fail2ban-client reload` — OK, jails ativos: cockpit-becker, sgcg-api, sgcg-api-aggressive, sshd, vsftpd
- `arpwatch@enp6s0.{10,30,40,50,70,80,99}` — todos `active`
- `npm run build` (backend) — compilação TypeScript sem erros
- `pm2 restart bcc-backend` — `online`

### Build
- `cd backend && npm run build` — compilação TypeScript concluída com rate limiting e correção de endpoints sem auth

## Conformidade LGPD — Filtro de eventos sem VLAN — 2026-04-28

### Fundamento
Lei 13.709/2018 (LGPD), Art. 6º, III (necessidade): só é lícito tratar dados pessoais na medida mínima necessária à finalidade.
IPs sem VLAN identificada não são rastreáveis a nenhum usuário da rede institucional, portanto não há base legal para o tratamento.

### Alterações

**`backend-proxy/src/services/dns-radar-service.ts`**
- Adicionado guard em `ingestLine()`: se `resolved.vlan_id === null`, o evento é descartado antes do INSERT
- Comentário cita explicitamente LGPD Art. 6º III

**PostgreSQL — tabela `dns_policy_events`**
- Adicionada constraint `chk_vlan_id_not_null CHECK (vlan_id IS NOT NULL)`
- Garante conformidade na camada de dados independentemente do código

**Registros pré-existentes**
- 959.584 registros com `vlan_id IS NULL` removidos via DELETE + VACUUM ANALYZE
- Restam 1.534.290 registros — todos com VLAN identificada

### Build
- `cd backend-proxy && npm run build` — compilação TypeScript concluída sem erros
- `pm2 restart backend-proxy-ingester` — online

## Refatoração do módulo LGPD & Proteção de Dados — 2026-04-28

### Motivação

O layout anterior do módulo era um formulário longo e sem estrutura navegacional. Para o contexto GovTech a leitura de conformidade, inventário, titulares e auditoria precisam de densidade separada.

### Alterações no frontend

**`frontend/src/pages/Lgpd.jsx`** — reescrita completa:

- Estrutura de 5 abas via `SegmentedTabs` (primitive existente):
  1. **Painel Executivo** — 4 KPI cards (2×2 mobile / 4×1 lg) + card de programa institucional (6 campos em grid) + lacunas de conformidade (semáforo de 3 itens) + direitos do titular (9 slots) + lista de atividades de alto risco
  2. **Inventário (Art. 37)** — FilterBar (pesquisa + risco + status) + botão Export PDF + tabela paginada de atividades de tratamento
  3. **Titulares (Art. 18)** — FilterBar (pesquisa + tipo + status) + tabela com highlight de vencidos
  4. **Incidentes (Art. 48)** — FilterBar (severidade + status) + tabela de incidentes
  5. **Auditoria LGPD** — sub-abas: "Alterações LGPD" (lgpd_audit_logs) e "Evidência de Acesso" (auth_activity_logs)

- Filtros client-side com `useMemo` por aba (sem round-trips desnecessários)
- Todos os diálogos preservados: `ProgramDialog`, `ProcessingDialog`, `RequestDialog`, `IncidentDialog`
- Função `exportInventoryPdf()` com autenticação Bearer — baixa PDF da rota `/api/lgpd/processing-activities/export.pdf`

### Alterações no backend

**`backend/src/modules/lgpd/lgpd-service.ts`**:
- Adicionado `import PDFDocument from 'pdfkit'`
- Novo método `exportInventoryPdf(activities, program)`:
  - PDF A4 portrait
  - Cabeçalho institucional escuro com SGCG, entidade e Art. 37
  - Barra LGPD verde com referências normativas
  - Linha de metadados do programa (controlador, unidade, DPO, data)
  - Linha de estatísticas (total, aprovadas, alto risco)
  - Tabela: Processo/Finalidade | Base Legal | Risco | Status | Retenção | Controlador
  - Linha vermelha em atividades de alto risco
  - Rodapé com data de geração e aviso de confidencialidade

**`backend/src/modules/lgpd/lgpd-routes.ts`**:
- Nova rota `GET /api/lgpd/processing-activities/export.pdf` adicionada ANTES da rota geral para evitar conflito de path no Express
- Retorna `Content-Type: application/pdf` com nome de arquivo datado

### Build

- `cd backend && npm run build` — compilação TypeScript concluída sem erros
- `cd frontend && npm run build` — `✓ built in 2.60s`
- `pm2 restart bcc-backend bcc-frontend` — ambos `online`

## Cabeçalho institucional e branding JMB nos PDFs — 2026-04-28

### Alterações

Todos os três geradores de PDF (LGPD inventário, Relatório de Navegação, Relatório de Auditoria) foram atualizados:

**Cabeçalho** — reestruturado de 3 para 4 linhas com hierarquia institucional explícita:
1. `PREFEITURA MUNICIPAL DE JACAREZINHO — PARANÁ` (branco, negrito, destaque máximo)
2. `Secretaria de Comércio, Indústria, Serviços e Inovação` (cinza claro, 8.5pt)
3. `SGCG — Sistema de Governança e Controle Governamental` (cinza médio, 7.5pt)
4. Título do relatório (cor de acento por módulo — verde para LGPD, azul para Relatórios Forenses)

**Rodapé** — reestruturado com branding institucional JMB Tecnologia:
- Esquerda: data de geração + aviso de uso institucional restrito
- Direita: logotipo `jmb-logo-clean.png` (46×20pt, fundo transparente) + "JMB Tecnologia" em negrito + número de página
- O logotipo é carregado do filesystem local; falha silenciosa (try/catch) caso arquivo seja movido

**Arquivos alterados:**
- `backend/src/modules/lgpd/lgpd-service.ts` — `exportInventoryPdf()`
- `backend/src/modules/reports/reports-service.ts` — `exportNavigationPdf()` e `exportAuditPdf()`

### Build

- `cd backend && npm run build` — compilação TypeScript concluída sem erros
- `pm2 restart bcc-backend` — online

## Atualização operacional do módulo QoS - 2026-04-28

- revisão corretiva aplicada no módulo `QoS` em `Controle de Rede`
- o diagnóstico confirmou divergência entre persistência e runtime:
  - `net_qos_policies` e `net_qos_vips` continham dados válidos
  - o kernel estava com `tc` legado em parte das VLANs, sem refletir exatamente o que a UI mostrava
- o backend `backend/src/modules/qos/qos-routes.ts` foi reescrito para endurecimento operacional:
  - passou a garantir schema próprio com `net_qos_policies` e `net_qos_vips`
  - passou a validar interfaces gerenciadas e IPs IPv4 de VIP antes de qualquer aplicação
  - deixou de tratar falha de `tc` como sucesso silencioso no fluxo de QoS
  - agora expõe o estado real do kernel por interface, incluindo:
    - modo `managed`
    - modo `legacy`
    - modo `absent`
    - contagem de filtros VIP aplicados
    - sincronização entre banco e runtime
  - foi adicionada a ação `POST /api/qos/reconcile` para reaplicar no kernel tudo o que já está persistido no banco
- o utilitário `backend/src/utils/sys.ts` recebeu `execCmdStrict` para permitir que o QoS falhe corretamente quando um comando do kernel não aplicar
- a interface `frontend/src/components/QosLimiter.jsx` foi revisada:
  - o módulo agora mostra quando a VLAN está fora de sincronia com o runtime real
  - foi adicionada ação explícita de `Reconciliar runtime`
  - o campo de `upload` deixou de prometer shaping ativo e passou a ficar visível apenas como referência histórica
  - a área de `VIPs do QoS` passou a deixar claro que a exceção só é válida quando o `tc` real está aplicado
- validação operacional desta rodada:
  - inspeção do PostgreSQL confirmou políticas e VIPs persistidos em `net_qos_policies` e `net_qos_vips`
  - inspeção do `tc` real confirmou drift entre banco e kernel em VLANs com runtime legado
  - `cd backend && npm run build` validado
  - `cd frontend && npm run build` validado
  - `pm2 restart bcc-backend` executado com sucesso
  - `pm2 restart bcc-frontend` executado com sucesso

## Próximo passo recomendado

- executar `Reconciliar runtime` no módulo QoS ou reaplicar as VLANs diretamente na UI para substituir o `tc` legado pelas regras novas do SGCG
- validar em ambiente real com teste de banda:
  - um host comum da VLAN deve obedecer ao `down_limit`
  - um VIP do QoS da mesma VLAN deve sair da classe limitada
- se houver necessidade institucional de limitar `upload`, a próxima rodada deve implementar shaping real de uplink com arquitetura própria em vez de manter semântica ambígua no formulário

## Continuação corretiva do módulo QoS - 2026-04-28

- corrigida falha `500` ao abrir o módulo `QoS`
- causa confirmada:
  - o banco em produção possuía schema legado de `net_qos_policies` e `net_qos_vips`
  - faltavam as colunas `updated_at` e `created_at` que a nova leitura do módulo passou a consultar
  - a tabela `net_qos_vips` também permanece com `ip` em `VARCHAR`, e não `INET`, no schema legado
- correção aplicada no backend:
  - `backend/src/modules/qos/qos-routes.ts` passou a executar `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para compatibilizar o schema legado sem migração manual
  - a leitura e escrita de VIPs do QoS passaram a aceitar `ip::text`, preservando compatibilidade com o tipo atual do banco
  - o serviço de schema do QoS passou a inicializar no boot do backend, sem depender do primeiro acesso autenticado ao módulo
  - `backend/src/server.ts` agora garante `qosSchemaService.ensureSchema()` na subida da aplicação
- validação desta continuação:
  - `cd backend && npm run build` validado
  - `pm2 restart bcc-backend` executado com sucesso
  - confirmação no PostgreSQL:
    - `net_qos_policies.updated_at` criado
    - `net_qos_vips.created_at` criado

## Bloqueio Total por VLAN em Operações Técnicas - 2026-04-30

- implementado o fluxo institucional de `Bloqueio Total por VLAN` no módulo `Operações Técnicas`
- escopo operacional restrito às VLANs geridas do SGCG:
  - `10`
  - `30`
  - `50`
  - `70`
- criada persistência dedicada no `backend-proxy`:
  - tabela `total_vlan_blocks`
  - índice `idx_total_vlan_blocks_active`
  - campos de motivo, solicitante, ativação, desativação, responsável pela desativação, estado ativo e notas
- adicionados endpoints autenticados no contrato de `Bloqueios & Liberações`:
  - `GET /api/bloqueios-liberacoes/total-vlan-blocks`
  - `POST /api/bloqueios-liberacoes/total-vlan-blocks/activate`
  - `POST /api/bloqueios-liberacoes/total-vlan-blocks/:vlanId/deactivate`
- ao ativar o Bloqueio Total:
  - o motivo institucional passa a ser obrigatório
  - qualquer `Liberação emergencial por VLAN` ativa para a mesma VLAN é encerrada para evitar conflito de modo
  - os artefatos institucionais de política são regenerados
  - o runtime de Squid/Unbound/UFW é revalidado pelo fluxo existente
  - sessões recentes da VLAN são derrubadas via `conntrack` em modo tolerante a falha
  - a ação é registrada em auditoria como `total-vlan-block:activate`
- ao desativar o Bloqueio Total:
  - a VLAN retorna ao enforcement institucional vigente
  - os artefatos são recompilados
  - a ação é registrada em auditoria como `total-vlan-block:deactivate`
- o gerador de configuração do `Squid` passou a reconhecer VLANs em Bloqueio Total:
  - cria ACL dedicada por VLAN bloqueada
  - aplica `deny_info ERR_SGCG_MAINTENANCE`
  - nega a VLAN antes de bypasses, allowlists e blocklists categóricas
  - instala template institucional de manutenção em `/etc/squid/errors/sgcg/ERR_SGCG_MAINTENANCE`
  - copia os templates padrão do Squid para preservar páginas auxiliares de erro
- a interceptação seletiva foi ampliada para o caso de Bloqueio Total:
  - redireciona `TCP/80` da VLAN bloqueada ao Squid mesmo quando o modo geral do proxy estiver `off`
  - preserva DNS `TCP/UDP 53` para o resolver local
  - aplica rejeição no `ufw-before-forward` para impedir navegação direta durante o modo manutenção
  - o `UFW` permanece como camada oficial de firewall; as regras geradas seguem complementando o bloco gerenciado em `/etc/ufw/before.rules`
- criada a página pública `/manutencao` no frontend:
  - header com `Prefeitura Municipal de Jacarezinho`
  - subheader com `Secretaria de Comércio, Indústria, Serviços e Inovação`
  - identidade visual institucional do SGCG
  - leitura criativa de modo manutenção, continuidade operacional e intervenção autorizada
  - acessível sem sessão autenticada
- a página institucional também foi embutida como template HTML do Squid para o caso real de bloqueio por HTTP
- a interface de `Operações Técnicas` ganhou quadro próprio de `Bloqueio Total por VLAN`:
  - status por VLAN
  - motivo e horário de ativação
  - ação para bloquear
  - ação para restaurar
  - diálogo com justificativa institucional obrigatória
- corrigido o helper de execução elevada do `backend-proxy` para chamar o `UFW` pelo caminho absoluto `/usr/sbin/ufw`
  - motivo: o runtime retornava `sudo: ufw: command not found` porque o PATH do `sudo` não localizava `/usr/sbin`
  - validação operacional confirmou que o `UFW` continua instalado, habilitado e ativo

### Build e validação

- `cd backend-proxy && npm run build` executado com sucesso
- `cd frontend && npm run build` executado com sucesso
- `pm2 restart backend-proxy --update-env` executado; processo voltou `online`
- `pm2 restart bcc-frontend` executado; processo voltou `online`
- `ufw status` confirmou `Status: active`
- `systemctl status ufw --no-pager` confirmou `ufw.service` carregado, habilitado e `active (exited)`
- `which ufw` confirmou `/usr/sbin/ufw`
- PostgreSQL confirmou que `public.total_vlan_blocks` foi criada pelo bootstrap do schema
- `curl -sk https://127.0.0.1:6777/manutencao` confirmou entrega do bundle da página pública
- `curl -sk https://127.0.0.1:6779/api/bloqueios-liberacoes/total-vlan-blocks` confirmou que a rota existe atrás da autenticação institucional, retornando `Token ausente` sem credencial
- validação complementar solicitada em seguida confirmou:
  - `backend-proxy` online no PM2
  - `bcc-frontend` online no PM2
  - tabela `total_vlan_blocks` existente e sem bloqueios ativos no momento da validação
  - `/manutencao` respondendo `200 text/html`
  - bundle do frontend contendo `Prefeitura Municipal de Jacarezinho`, `Secretaria de Comércio, Indústria, Serviços e Inovação` e `Rede em manutenção`
  - template `/etc/squid/errors/sgcg/ERR_SGCG_MAINTENANCE` existente
  - `UFW` validado fora do sandbox como `Status: active`
  - `iptables v1.8.10 (nf_tables)` disponível

## Próximo passo recomendado

- testar em janela operacional controlada a ativação do Bloqueio Total para uma VLAN de baixo impacto, validando:
  - página institucional exibida em navegação HTTP
  - HTTPS bloqueado sem promessa indevida de página injetada
  - retorno da VLAN ao enforcement normal ao restaurar
  - ausência de conflito com `Liberação emergencial por VLAN`
  - persistência da trilha em `action_audit_logs`

## Implementação de shaping real de upload no QoS - 2026-04-28

- o módulo `QoS` deixou de tratar `upload` como campo apenas histórico
- o backend passou a aplicar controle real de subida por VLAN com arquitetura Linux `tc + ifb`
  - cada interface gerenciada agora pode usar uma `ifb` dedicada derivada da VLAN, como `ifb10`, `ifb30`, `ifb40`, `ifb50`, `ifb70` e `ifb80`
  - o tráfego de ingresso da VLAN é redirecionado com `mirred` para a `ifb`, onde o shaping de upload é aplicado com `htb`
  - os VIPs do QoS continuam fora da classe limitada:
    - no download, por filtro `dst` na interface da VLAN
    - no upload, por filtro `src` na `ifb`
- o runtime do QoS foi aprofundado:
  - `backend/src/modules/qos/qos-routes.ts` agora inspeciona separadamente estado de download e upload
  - a sincronização entre banco e kernel passou a considerar:
    - qdisc raiz da VLAN
    - redirecionamento de `ingress`
    - qdisc e classes da `ifb`
    - quantidade de filtros VIP nas duas direções
- o utilitário `backend/src/utils/sys.ts` recebeu novas entradas de allowlist para suportar:
  - `sudo modprobe ifb`
  - `sudo ip link add ... type ifb`
  - `sudo ip link set dev ... up`
- a interface `frontend/src/components/QosLimiter.jsx` voltou a permitir edição do campo de upload
- o texto operacional do módulo foi atualizado para refletir o modelo real:
  - download moldado na própria VLAN
  - upload moldado por `IFB`

### Build

- `cd backend && npm run build` — compilação TypeScript concluída sem erros
- `cd frontend && npm run build` — `✓ built in 3.70s`

### Observação operacional

- a inspeção não intrusiva do host confirmou suporte do kernel ao driver `ifb`
- esta rodada validou compilação e leitura do `tc`, mas não aplicou regras novas em produção durante a sessão

## Consolidação operacional do módulo QoS - 2026-04-28

- o módulo `QoS` foi ajustado para ficar operacional mesmo após restart do backend
- o backend agora reconcilia automaticamente o runtime de QoS no boot:
  - `backend/src/modules/qos/qos-routes.ts` passou a expor `qosRuntimeService.reconcileAllPolicies()`
  - `backend/src/server.ts` agora executa a reconciliação automática logo após garantir o schema
- isso elimina o cenário em que:
  - o banco contém `down_limit`, `up_limit` e VIPs válidos
  - mas o kernel volta sem as regras de `tc` e `ifb` após reinício do serviço
- publicação operacional concluída:
  - `pm2 restart bcc-backend`
  - `pm2 restart bcc-frontend`
- validação real no host após o restart:
  - todas as VLANs gerenciadas ficaram com `qdisc ingress`
  - todas as VLANs gerenciadas passaram a redirecionar ingresso para `ifb10`, `ifb30`, `ifb40`, `ifb50`, `ifb70` e `ifb80`
  - todas as `ifb` receberam `htb` com os limites de upload persistidos no banco
  - a VLAN `enp6s0.10` manteve filtros VIP também na `ifb`, preservando prioridade no upload
- efeito prático:
  - download segue moldado na própria VLAN
  - upload passa a ser moldado de verdade no kernel
  - reinício do backend não volta mais o módulo para estado inconsistente entre banco e runtime

### Build

- `cd backend && npm run build` — compilação TypeScript concluída sem erros

## Refino visual do módulo QoS - 2026-04-28

- removido dos cards de VLAN o alerta textual:
  - `O kernel não está refletindo exatamente o que foi salvo neste módulo. Reaplique esta VLAN ou use "Reconciliar runtime".`
- o estado operacional do QoS foi preservado:
  - badges de `Ativa/Inativa`
  - badge de `QoS aplicado/Runtime legado/Sem runtime`
  - warnings técnicos continuam disponíveis na área de avisos do card quando necessários
- objetivo do ajuste:
  - reduzir ruído visual recorrente nos cards
  - manter a interface mais limpa sem alterar a lógica de reconciliação do runtime

### Build

- `cd frontend && npm run build` — `✓ built in 2.77s`

## Liberação operacional de Google Workspace - 2026-04-28

- adicionadas liberações globais para:
  - `docs.google.com`
  - `drive.google.com`
- complemento conservador aplicado para anexos e conteúdo hospedado do Workspace:
  - `googleusercontent.com`
- a liberação foi persistida em `release_policies` com escopo `global`
- efeito operacional:
  - os dois domínios passam a valer para todas as VLANs gerenciadas pelo módulo (`10`, `30`, `50` e `70`)
  - a allowlist compilada do proxy e do enforcement institucional passou a incluir os três domínios
- validação executada:
  - confirmação no PostgreSQL em `release_policies`
  - confirmação nos artefatos compilados:
    - `backend-proxy/regras/generated/proxy_whitelist.acl`
    - `backend-proxy/regras/generated/proxy_protected_ssl.acl`
    - `backend-proxy/regras/generated/bloqueios-liberacoes/allowlist-global.acl`
    - `backend-proxy/regras/generated/bloqueios-liberacoes/export.json`
- observação:
  - a aplicação do motor retornou `success: true` e `no_op: true`, indicando convergência do runtime compilado sem necessidade de alterar modo do Squid
  - o catálogo-base `Sites Google` em `backend-proxy/src/services/blocking-release-service.ts` também foi ampliado com `docs.google.com`, `drive.google.com` e `googleusercontent.com`

### Build

- `cd backend-proxy && npm run build` — compilação TypeScript concluída sem erros
- `pm2 restart backend-proxy` — processo republicado com o catálogo-base atualizado

## Estabilização da contingência DNS no módulo Bloqueios & Liberações - 2026-04-28

- endurecido o bootstrap da contingência DNS em `backend-proxy/src/services/dns-contingency-service.ts`
- a reconciliação de firewall passou a usar retry curto antes de falhar:
  - `3` tentativas
  - `1500ms` entre tentativas
- objetivo do ajuste:
  - absorver falhas transitórias de `iptables-restore` durante bootstrap/reload
  - evitar degradação desnecessária do módulo por corrida momentânea no firewall
- validação operacional:
  - `dnsContingencyService.ensureFirewallState()` executado manualmente com sucesso
  - `cd backend-proxy && npm run build` concluído sem erros
  - logs do `backend-proxy` foram limpos e o processo foi reiniciado
  - novo bootstrap do `backend-proxy` subiu limpo:
    - log de saída apenas com `Rodando com HTTPS na porta 6779`
    - log de erro vazio após a reinicialização limpa

### Build

- `cd backend-proxy && npm run build` — compilação TypeScript concluída sem erros
- `pm2 restart backend-proxy` — bootstrap republicado e validado sem novo erro no log

## Liberação operacional de serviço governamental do Paraná - 2026-04-28

- liberado o host `interno.empresafacil.pr.gov.br`
- a liberação foi persistida em `release_policies` com escopo `global`, cobrindo todas as VLANs gerenciadas do módulo
- o catálogo-base `Governo` em `backend-proxy/src/services/blocking-release-service.ts` também foi ampliado com esse host
- validação executada:
  - confirmação no PostgreSQL em `release_policies`
  - confirmação nos artefatos compilados:
    - `backend-proxy/regras/generated/proxy_whitelist.acl`
    - `backend-proxy/regras/generated/proxy_protected_ssl.acl`
    - `backend-proxy/regras/generated/bloqueios-liberacoes/allowlist-global.acl`
    - `backend-proxy/regras/generated/bloqueios-liberacoes/export.json`
- observação operacional:
  - a liberação foi aplicada no nível de domínio/host, que é o escopo real suportado pelo motor de enforcement do módulo

## Correção do upgrade de URL em políticas nomeadas - 2026-04-28

- validado que o código do módulo já tinha suporte a entradas do tipo `url`, inclusive com `entry_type` e `normalized_host_domain` em `domain_policy_entries`
- identificado o descompasso real:
  - o bootstrap do schema encerrava cedo demais quando a tabela já existia
  - por isso, os `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` do upgrade não rodavam em bases legadas
- correção aplicada em `backend-proxy/src/services/blocking-release-schema-service.ts`:
  - `ensureBlockingReleaseSchema()` agora sempre executa o bloco idempotente de schema/migração sob lock advisory
- endurecimento de bootstrap em `backend-proxy/src/server.ts`:
  - o serviço de Bloqueios & Liberações agora chama `blockingReleaseService.ensureReady()` antes de iniciar `syncTelemetry()`
- reconciliação de dados executada no PostgreSQL:
  - preenchido `normalized_host_domain` para entradas legadas do tipo domínio
  - inseridos nas políticas nomeadas:
    - `docs.google.com`
    - `drive.google.com`
    - `googleusercontent.com`
    - `interno.empresafacil.pr.gov.br`
- validações executadas:
  - `cd backend-proxy && npm run build`
  - `pm2 restart backend-proxy`
  - confirmação de novas colunas em `domain_policy_entries`
  - confirmação do novo índice único `(policy_id, entry_type, normalized_domain)`
  - `domainPolicyManagerService.get(10)` voltou a responder sem erro

## Liberação ampliada de portais governamentais e correlatos - 2026-04-28

- ampliado o catálogo-base `Governo` em `backend-proxy/src/services/blocking-release-service.ts` com os hosts:
  - `fomentonet.pr.gov.br`
  - `www8.receita.fazenda.gov.br`
  - `cadin.pr.gov.br`
  - `sebrae.com.br`
  - `consulta-crf.caixa.gov.br`
  - `salas-apps-pr.sebrae.com.br`
  - `receita.pr.gov.br`
  - `webapp1-jacarezinho.cidade360.cloud`
  - `cidade360.cloud`
  - `governancabrasil.com.br`
  - `pncp.gov.br`
  - `jacarezinho.pr.leg.br`
- persistidas liberações globais em `release_policies` para esses hosts, cobrindo todas as VLANs gerenciadas
- adicionadas URLs exatas na política nomeada global `Governo`:
  - `cadin.pr.gov.br/publico/pendencia/consultar`
  - `sebrae.com.br/empreendedor`
  - `gov.br/receitafederal`
- durante a ativação das URLs, identificado e corrigido bug real no compilador:
  - `backend-proxy/src/services/policy-compiler-service.ts` gerava regex com sintaxe `(?:...)`, incompatível com o `url_regex` do Squid nesta instalação
  - o compilador passou a gerar regex compatível com POSIX/Squid para URLs liberadas
- validações executadas:
  - `cd backend-proxy && npm run build`
  - `blockingReleaseService.apply('codex')` concluído com sucesso
  - `pm2 restart backend-proxy`
  - confirmação nos artefatos:
    - `backend-proxy/regras/generated/proxy_whitelist.acl`
    - `backend-proxy/regras/generated/proxy_protected_ssl.acl`
    - `backend-proxy/regras/generated/proxy_whitelist_url.acl`
    - `backend-proxy/regras/generated/bloqueios-liberacoes/allowlist-global.acl`
    - `backend-proxy/regras/generated/bloqueios-liberacoes/allowlist-global-url.acl`

## Bypass emergencial total de internet para VLANs - 2026-04-28

- medida aplicada em carater emergencial para restaurar saida de internet de todas as VLANs, de forma independente do `Unbound`
- causa operacional observada no host:
  - `FORWARD` estava historicamente preso a combinacao de politica restritiva no `UFW` com regras seletivas em `ufw-user-forward`
  - o `nat` ainda mantinha redirecionamentos legados de `DNS 53` para o `Unbound`, o que impedia um bypass realmente total
- mudancas aplicadas no host:
  - `/etc/default/ufw` ficou com `DEFAULT_FORWARD_POLICY="ACCEPT"`
  - `/etc/ufw/before.rules` teve o bloco `BECKERCORP_EARLY_FORWARD` alterado para `-A ufw-before-forward -i enp6s0+ -j ACCEPT`
  - os redirecionamentos `PREROUTING` de `TCP/UDP 53` das VLANs para o `Unbound` foram removidos do arquivo persistente
  - os redirects antigos ainda carregados em runtime no `nat` foram limpos manualmente do `iptables`
- estado final validado no host:
  - `net.ipv4.ip_forward = 1`
  - chain `FORWARD` em `ACCEPT`
  - `nat` sem redirects de `DNS 53` para as VLANs
  - `MASQUERADE` de saida pela `WAN enp8s0` preservado
- trilha de seguranca e rollback:
  - backup salvo em `/opt/controlebeckercorp-v8/backups/bypass-total-20260428-122936`
  - utilitarios operacionais criados para esta acao:
    - `scripts/bypass_total_ufw.py`
    - `scripts/flush_dns_redirects_runtime.py`
- observacao obrigatoria:
  - esta liberacao foi assumida explicitamente como medida emergencial
  - depois sera necessario normalizar o ambiente, reinstalando o enforcement institucional de `UFW`, `Unbound`, `RPZ`, `ACL` e interceptacao seletiva conforme a politica operacional vigente

## Bypass total confirmado e diagnostico - 2026-04-28

### O que estava bloqueando a navegacao

Tres problemas encadeados impediam a navegacao mesmo com `FORWARD policy ACCEPT` e `nftables forward chain` com ACCEPT para VLANs:

1. **`before.rules` revertia a cada `ufw reload`** — o bloco `BECKERCORP_EARLY_FORWARD` voltava com regras VIP-only e DROPs do Telegram, sem ACCEPT geral para as VLANs
2. **DNS REDIRECT quebrava resolucao** — o `PREROUTING REDIRECT` mudava o destino de `8.8.8.8:53` para `192.168.10.1:53`, mas a resposta voltava com origem `192.168.10.1`, e o cliente rejeitava por nao bater com o servidor consultado
3. **`INPUT policy DROP` bloqueava TCP porta 53** — queries DNS via TCP (usadas por dispositivos modernos para respostas grandes e DoT fallback) chegavam na `192.168.10.1:53` mas nao recebiam SYN-ACK porque o INPUT chain nao tinha regra explicita para porta 53 vinda das VLANs

### Estado atual do bypass (runtime — nao persiste apos reboot)

Regras aplicadas em runtime via `iptables`:

```bash
# FORWARD — ACCEPT para cada VLAN antes de SGCG_GUARD e UFW chains
iptables -I FORWARD 1 -i enp6s0.10 -o enp8s0 -j ACCEPT
iptables -I FORWARD 2 -i enp8s0 -o enp6s0.10 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
# (idem para VLANs 30, 40, 50, 70, 80, 99)

# INPUT — DNS TCP e UDP das VLANs chegam ao Unbound
iptables -I INPUT 1 -i enp6s0+ -p udp --dport 53 -j ACCEPT
iptables -I INPUT 2 -i enp6s0+ -p tcp --dport 53 -j ACCEPT
```

Unbound RPZ suspenso via `/etc/unbound/unbound.conf.d/becker_policy_compiler.conf` (sem zonas rpz ativas).

### Como reverter — passo a passo

**Passo 1: Remover regras de bypass do FORWARD chain**

```bash
# Remover os ACCEPT inseridos em runtime para cada VLAN
for vlan in 10 30 40 50 70 80 99; do
  iptables -D FORWARD -i enp6s0.$vlan -o enp8s0 -j ACCEPT 2>/dev/null
  iptables -D FORWARD -i enp8s0 -o enp6s0.$vlan -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null
done
```

**Passo 2: Remover regras de DNS do INPUT chain**

```bash
iptables -D INPUT -i enp6s0+ -p udp --dport 53 -j ACCEPT 2>/dev/null
iptables -D INPUT -i enp6s0+ -p tcp --dport 53 -j ACCEPT 2>/dev/null
```

**Passo 3: Restaurar `before.rules` com enforcement institucional**

Editar `/etc/ufw/before.rules` e substituir o bloco `BECKERCORP_EARLY_FORWARD` de volta para as regras institucionais (VIPs + bloqueios por VLAN). Remover as linhas de `PREROUTING REDIRECT` de DNS da secao `*nat` se nao quiser mais o redirect.

```bash
ufw reload
```

**Passo 4: Reativar RPZ no Unbound**

Editar `/etc/unbound/unbound.conf.d/becker_policy_compiler.conf` e reintroduzir as zonas `rpz:` geradas pelo `Policy Compiler` do SGCG via interface `Bloqueios & Liberacoes > Politicas Institucionais > Aplicar`.

```bash
unbound-control reload
```

**Passo 5: Validar enforcement restaurado**

```bash
dig @127.0.0.1 instagram.com +short     # deve retornar NXDOMAIN se VLAN bloqueada
iptables -L FORWARD -n | head -5        # nao deve ter ACCEPT amplo para enp6s0.x
ufw status                              # deve mostrar regras ativas
```

**Passo 6: Limpar sessoes ativas que ficaram abertas durante o bypass**

```bash
conntrack -D --src-nat 2>/dev/null || true
# ou especifico por VLAN:
conntrack -D -s 192.168.10.0/24 2>/dev/null || true
```

### Proximos passos para normalizacao

- reativar enforcement VLAN por VLAN, validando conectividade essencial antes de cada etapa
- reintroduzir bloqueio de redes sociais via RPZ para VLANs 10, 30, 50, 70 (exceto VIPs e excecoes esporadicas)
- reativar bloqueio de DoT (`TCP 853`) e QUIC social (`UDP 443`) apenas apos confirmar que WhatsApp e gov.br continuam funcionando
- testar PontoRH e portais governamentais antes de fechar o enforcement

## Recuperacao de regra SSH IPv4 na VLAN 10 — 2026-04-28

- identificada assimetria nas regras UFW: a porta `22/tcp` IPv4 na interface interna `enp6s0.10` estava ausente
- a regra IPv6 `22/tcp (v6) on enp6s0.10 ALLOW IN` existia, mas o equivalente IPv4 havia sido perdido
- causa provavel: `ufw reset` executado em 2026-03-09 entre 10:39 e 11:07 que reconstruiu o `user.rules` sem reincluir a regra IPv4 da VLAN 10
- efeito: SSH via porta 22 funcionava apenas externamente via porta `18122/tcp on enp8s0`; conexoes internas da VLAN 10 (192.168.10.x) eram derrubadas pelo `deny (incoming)` padrao
- correcao aplicada:
  - `ufw allow in on enp6s0.10 to any port 22 proto tcp comment "SSH Padrão - VLAN 10 (Admin)"` — regra `[48]`
  - `ufw allow in on enp6s0.10 to any port 18122 proto tcp comment "SSH Custom - VLAN 10 (Admin)"` — regra `[49]`
- IPv4 e IPv6 agora simetricos na VLAN 10 para as duas portas SSH

## Normalizacao do bypass emergencial — VLAN 70 — 2026-04-28

### Contexto

O bypass emergencial total ativado anteriormente mantinha regras de ACCEPT direto no chain `FORWARD` do iptables para todas as VLANs, com RPZ do Unbound suspenso. Esta rodada inicia a normalizacao pela VLAN 70 (`192.168.70.0/24`, interface `enp6s0.70`).

### Diagnostico pre-normalizacao

- `FORWARD` chain: politica `ACCEPT`, com regras `ACCEPT` diretas por VLAN adicionadas em runtime
- `nat PREROUTING` em runtime: vazio (redirects de DNS sem efeito em runtime apesar de presentes no `before.rules`)
- `before.rules`: redirects de DNS para `enp6s0+` ja presentes nas linhas 17-18; block de Telegram para todas VLANs em BECKERCORP_EARLY_FORWARD
- Unbound RPZ: suspenso globalmente; arquivos compilados para VLAN 70 (`blocklist-vlan-70.rpz` 186 linhas, `allowlist-vlan-70.rpz`) existentes e atualizados

### Alteracoes aplicadas

**Runtime (iptables — imediato, nao persiste apos reboot sem before.rules):**
- `nat PREROUTING`: adicionado redirect `enp6s0.70 UDP/53 → :53` e `enp6s0.70 TCP/53 → :53`
- `FORWARD`: inserido `DROP enp6s0.70 TCP/853` (bloqueio DoT) na posicao 6
- `FORWARD`: removido `ACCEPT enp6s0.70 → enp8s0` (bypass de emergencia da VLAN 70)

**`/etc/ufw/before.rules`** (persistencia apos reboot/ufw reload):
- adicionado `-A ufw-before-forward -i enp6s0.70 -p tcp --dport 853 -j DROP` no bloco BECKERCORP_EARLY_FORWARD
- redirects DNS (`enp6s0+`) ja estavam presentes, cobrem VLAN 70 automaticamente

**`/etc/unbound/unbound.conf.d/becker_policy_compiler.conf`**:
- removida linha de bypass global do RPZ
- adicionadas zonas RPZ com `tags: "vlan_70"` para isolar enforcement apenas na VLAN 70:
  - `rpz.vippass.becker.local.` — bypass por client-ip para VIPs
  - `rpz.allow.vlan70.becker.local.` — allowlist especifica da VLAN 70
  - `rpz.block.vlan70.becker.local.` com `rpz-action-override: nxdomain` — blocklist (88 dominios de redes sociais e pornografia)
  - `rpz.allow.becker.local.` com `tags: "vlan_70"` — allowlist global aplicada apenas a VLAN 70
  - `rpz.block.becker.local.` com `tags: "vlan_70"` — blocklist global aplicada apenas a VLAN 70

### Estado apos normalizacao da VLAN 70

- VLANs 10, 30, 50: ainda em bypass de emergencia (regras ACCEPT no FORWARD chain, RPZ suspenso)
- VLAN 70: normalizada — DNS interceptado pelo Unbound, RPZ ativo, DoT bloqueado, Telegram bloqueado por IP
- `unbound-checkconf`: sem erros
- `unbound-control reload`: executado com sucesso
- logs do Unbound confirmam queries de `192.168.70.x` passando pelo Unbound

### Observacao operacional

- o redirect DNS em runtime para VLAN 70 foi adicionado diretamente por `iptables -t nat`
- o `before.rules` ja tinha `PREROUTING -i enp6s0+ REDIRECT :53` que cobre todas as VLANs, mas esse bloco nao estava ativo em runtime (nat PREROUTING estava vazio)
- ao normalizar as demais VLANs, o `ufw reload` podera ser executado para ativar o bloco `*nat` do before.rules para todas as VLANs simultaneamente

## Normalizacao VLAN 10 e correcao RPZ VLAN 70 — 2026-04-29

### Diagnostico pre-normalizacao (Passo 2 — validacao)

- Unbound: `active`
- PREROUTING runtime: redirect DNS apenas para VLAN 70 (VLAN 10 ainda sem redirect no runtime)
- FORWARD runtime: VLAN 10 com bypass `ACCEPT enp6s0.10 → enp8s0` ativo
- `becker_policy_compiler.conf`: sem zonas RPZ (comentario de bypass emergencial no lugar)
- Arquivos RPZ de VLAN 10 existentes e atualizados:
  - `/etc/unbound/becker/blocklist-vlan-10.rpz` — 186 linhas (redes sociais, adulto)
  - `/etc/unbound/becker/allowlist-vlan-10.rpz` — 28 linhas (Netflix, Akamai)
- Identificado: VLAN 70 parcialmente normalizada (iptables OK, RPZ ausente do config)

### Alteracoes aplicadas (Passo 1 — fechar VLAN 10)

**`/etc/unbound/unbound.conf.d/becker_policy_compiler.conf`**:
- Removido comentario de bypass emergencial
- Adicionadas zonas RPZ para VLAN 10 e VLAN 70:
  - `rpz.vippass.becker.local.` com `tags: "vlan_10 vlan_70"` — VIP client-ip passthrough
  - `rpz.allow.vlan10.becker.local.` com `tags: "vlan_10"` — allowlist especifica VLAN 10
  - `rpz.block.vlan10.becker.local.` com `tags: "vlan_10"` + `rpz-action-override: nxdomain`
  - `rpz.allow.vlan70.becker.local.` com `tags: "vlan_70"` — allowlist especifica VLAN 70
  - `rpz.block.vlan70.becker.local.` com `tags: "vlan_70"` + `rpz-action-override: nxdomain`
  - `rpz.allow.becker.local.` com `tags: "vlan_10 vlan_70"` — allowlist global
  - `rpz.block.becker.local.` com `tags: "vlan_10 vlan_70"` — blocklist global

**`/etc/ufw/before.rules`**:
- Adicionado no bloco `BECKERCORP_EARLY_FORWARD`:
  - `-A ufw-before-forward -i enp6s0.10 -p tcp --dport 853 -j DROP` — DoT bloqueado VLAN 10
  - `-A ufw-before-forward -i enp6s0.70 -p tcp --dport 853 -j DROP` — DoT bloqueado VLAN 70 (faltava)

**iptables runtime (PREROUTING nat)**:
- Adicionado: `-I PREROUTING 1 -i enp6s0.10 -p udp --dport 53 -j REDIRECT --to-port 53`
- Adicionado: `-I PREROUTING 2 -i enp6s0.10 -p tcp --dport 53 -j REDIRECT --to-port 53`

**iptables runtime (FORWARD)**:
- Adicionado: `DROP enp6s0.10 tcp dpt:853` (posicao 2, antes do bypass)
- Removido: `ACCEPT enp6s0.10 → enp8s0` (bypass emergencial da VLAN 10)

**Unbound**:
- `unbound-checkconf`: sem erros
- `unbound-control reload`: executado com sucesso

### Estado apos normalizacao

- VLAN 10: **normalizada** — DNS interceptado pelo Unbound, RPZ ativo, DoT bloqueado, bypass removido
- VLAN 70: **normalizada** — iptables OK (sessao anterior), RPZ agora ativo (corrigido nesta sessao)
- VLANs 30, 50: ainda em bypass emergencial (ACCEPT direto no FORWARD chain, sem RPZ)
- VLANs 40, 80, 99: em bypass (sem enforcement institucional)
- VIPs da VLAN 10 (IPs: .127, .143, .187, .26, .40, .49): bypass via RPZ client-ip passthrough

### Validacao executada

- `unbound-checkconf` — sem erros
- `unbound-control reload` — ok
- PREROUTING: redirect VLAN 10 UDP+TCP 53 confirmado em runtime
- FORWARD: DoT DROP VLAN 10 na posicao 2, bypass ACCEPT removido
- `dig @127.0.0.1 google.com` → resolve (127.0.0.1 sem tag = comportamento esperado)
- Clientes VLAN 10 receberao NXDOMAIN para dominios bloqueados (instagram.com, tiktok.com, etc.)

## Proximo passo recomendado

- validar em ambiente real na VLAN 10:
  - navegacao normal (Google, gov.br, WhatsApp, PontoRH) deve funcionar
  - redes sociais (Instagram, TikTok, Facebook) devem retornar falha de resolucao DNS
  - VIPs cadastrados devem continuar acessando redes sociais normalmente
- apos confirmacao, prosseguir com normalizacao das VLANs 30 e 50 na mesma sequencia
- ao normalizar VLANs 30 e 50, adicionar suas zonas RPZ ao `becker_policy_compiler.conf` e fazer `unbound-control reload`

---

## Auditoria e Correcao do Modulo QoS — 2026-04-29

### Problemas identificados e corrigidos

**`backend/src/modules/qos/routes.ts` — arquivo morto removido**
- Arquivo legado sem importacao em nenhum ponto do sistema
- Usava TBF (token bucket filter) em vez de HTB — sem suporte a VIP
- Credencial hardcoded: `postgres://postgres:becker_admin_secure@...`
- Tabela errada `control_qos_policies` (tabela real: `net_qos_policies`)
- `ON CONFLICT (id)` incoerente (tabela nao tem `id` unico)
- Arquivo deletado

**`backend/src/modules/qos/qos-routes.ts` — correcoes aplicadas**

1. `POST /apply` — warnings sempre retornavam `[]`
   - Warnings (modo legado, IFB redirect nao ativo) eram computados em `loadPolicies` mas nunca no apply
   - Corrigido: agora o `POST /apply` computa e retorna warnings reais baseados no runtime apos aplicacao
   - Antes: usuario via "QoS aplicado com sucesso" mesmo com divergencias de runtime
   - Depois: alert exibe warnings reais se existirem

2. `reconcileAllPolicies` — nao limpava interfaces gerenciadas sem politica no DB
   - Se tc estava ativo manualmente em uma interface sem entrada em `net_qos_policies`, o reconcile ignorava
   - Corrigido: reconcile agora itera sobre `MANAGED_INTERFACES union DB policies` e aplica 0/0 nas que nao tem entrada (limpando o tc)

### Logica dos VIPs (validada, sem alteracao)

- Classe default `1:10`: `rate downLim ceil downLim` — trafico regular com teto duro
- Classe VIP `1:20`: `rate 1000mbit ceil 1000mbit` — VIP sem teto (bypass do limite)
- Download: filtro `u32 match ip dst vip.ip/32 flowid 1:20` — VIP recebe sem restricao
- Upload (IFB): filtro `u32 match ip src vip.ip/32 flowid 1:20` — idem para egress
- `runtime_synced` verifica: default class `1:10`, contagem de filtros VIP = contagem no DB, IFB redirect ativo
- Logica esta correta e sem alteracoes

### Build

- `npm run build` (backend): sem erros de TypeScript
- Arquivo `dist/modules/qos/routes.js` (legado) removido junto com o source

---

## Scripts de Bypass Emergencial — 2026-04-29

### Contexto

Em 2026-04-28 a rede ficou inoperante sem mecanismo rapido de recuperacao.
Os scripts existentes (bypass_total_ufw.py) editam arquivos e fazem `ufw reload`,
criando janela de instabilidade e risco de corrupcao de estado.

### Abordagem adotada: runtime-only (sem reload, sem restart)

Injecao direta de regras no kernel via iptables/tc.
- Efeito em milissegundos
- Sessao SSH instavel nao desfaz o que ja foi aplicado
- Reboot restaura o estado UFW persistente automaticamente (failsafe natural)
- --undo reverte sem reboot

### Camadas afetadas pelo bypass

1. iptables FORWARD: injeta ACCEPT antes de todos os DROPs por VLAN
2. NAT PREROUTING: remove redirect DNS (libera resolucao sem Unbound/RPZ)
3. QoS (tc): limpa limitacao de banda por interface

Squid: opera em modo explicito (sem intercept transparente), nao e afetado.

### Scripts criados

**`scripts/bypass_vlan.py`** — bypass por VLAN especifica
```
sudo python3 scripts/bypass_vlan.py <vlan_id>           # ativa
sudo python3 scripts/bypass_vlan.py <vlan_id> --undo    # restaura
```
VLANs: 10, 30, 40, 50, 70, 80, 99

**`scripts/bypass_all_vlans.py`** — bypass de todas as VLANs de uma vez
```
sudo python3 scripts/bypass_all_vlans.py           # ativa tudo
sudo python3 scripts/bypass_all_vlans.py --undo    # restaura tudo
```

### Pos-bypass (ao restaurar)

- QoS NAO e restaurado automaticamente pelo --undo (estado vem do banco)
- Apos restaurar enforcement, re-aplicar QoS via SGCG > Controle de Rede > QoS > Reconciliar runtime
- Log das operacoes em: /var/log/sgcg-bypass.log

---

## Acesso Interno/Offline ao Console — 2026-04-29

### Objetivo

Garantir acesso administrativo ao SGCG pela rede interna mesmo se o link externo ou a resolucao publica de `console.jacarezinho.cloud` cair.

### Nomes internos configurados

- `https://console.interno.jacarezinho` — nome operacional recomendado
- `https://console.local.jacarezinho` — alias interno alternativo
- `https://console.jacarezinho.local` — alias `.local` solicitado, com ressalva de possivel conflito com mDNS/Bonjour em alguns clientes

Todos resolvem internamente para:

```
192.168.10.1
```

### DNS interno

O Unbound local passou a responder zonas internas estaticas:

- `interno.jacarezinho.`
- `local.jacarezinho.`
- `jacarezinho.local.`

Arquivo de configuracao:

```
/etc/unbound/unbound.conf.d/10-console-interno-jacarezinho.conf
```

O DHCP da VLAN 10 ja entrega `192.168.10.1` como DNS:

```
/etc/dhcp/dhcpd.conf
```

### Nginx interno

Foi criado um virtual host dedicado para os nomes internos:

```
/etc/nginx/sites-available/console.interno.jacarezinho
/etc/nginx/sites-enabled/console.interno.jacarezinho
```

As rotas preservam a arquitetura atual:

- `/` -> frontend em `https://127.0.0.1:6777`
- `/api/` -> backend core em `http://127.0.0.1:6778`
- `/api/proxy`, `/api/rules`, `/api/cert`, `/api/dns`, `/api/bloqueios-liberacoes`, `/api/data-governance` -> backend-proxy em `https://127.0.0.1:6779`

### Certificado interno

Foi criada uma CA interna SGCG e um certificado TLS para os nomes internos.

CA raiz:

```
/etc/sgcg/pki/sgcg-internal-root-ca.crt
/etc/sgcg/pki/sgcg-internal-root-ca.key
```

Certificado do console interno:

```
/etc/sgcg/pki/console-interno-jacarezinho.crt
/etc/sgcg/pki/console-interno-jacarezinho.key
```

SANs do certificado:

- `DNS:console.interno.jacarezinho`
- `DNS:console.local.jacarezinho`
- `DNS:console.jacarezinho.local`
- `IP:192.168.10.1`

Validade atual:

- inicio: `2026-04-29`
- fim: `2028-08-01`

Para remover aviso de certificado nos navegadores, instalar a CA raiz nos clientes como autoridade confiavel:

```
/etc/sgcg/pki/sgcg-internal-root-ca.crt
```

Download interno disponibilizado pelo Nginx:

```
http://console.interno.jacarezinho/sgcg-root-ca.crt
http://console.interno.jacarezinho/sgcg-root-ca.cer
```

Fingerprint SHA-256 da CA raiz para conferencia no cliente:

```
D4:4E:F0:B6:A8:13:D6:E6:7E:95:34:04:11:DD:C4:48:2C:B5:EB:62:20:94:13:CB:C6:FA:6A:19:38:14:26:29
```

Observacao para Firefox: em alguns ambientes o Firefox nao usa automaticamente a loja de certificados do Windows/Linux. Nesses casos, importar a CA em `Configurações > Privacidade e Segurança > Certificados > Ver certificados > Autoridades > Importar` e marcar confianca para identificar sites.

Observacao para Chrome/Edge: usam a loja de certificados do sistema operacional. No Windows, importar a CA em `Certificados - Computador Local > Autoridades de Certificacao Raiz Confiaveis`. Importar em `Pessoal` ou apenas abrir o arquivo nao remove o alerta de seguranca.

Em 2026-04-29 a CA e o certificado interno foram regenerados com extensoes explicitas para navegadores modernos:

- CA raiz: `Basic Constraints CA:TRUE`, `Key Usage Certificate Sign, CRL Sign`
- certificado do console: `Basic Constraints CA:FALSE`, `Key Usage Digital Signature, Key Encipherment`, `Extended Key Usage TLS Web Server Authentication`
- backup anterior: `/etc/sgcg/backups/internal-console-cert-hardening-20260429-100150`

Ainda em 2026-04-29, apos erro `SEC_ERROR_BAD_SIGNATURE` no Firefox, a CA foi reemitida com CN versionado para evitar colisao com CA antiga ja importada/cacheada no cliente:

- CA nova: `SGCG Jacarezinho Internal Root CA 2026`
- certificado do console emitido por essa CA nova
- fingerprint SHA-256 da CA nova: `D4:4E:F0:B6:A8:13:D6:E6:7E:95:34:04:11:DD:C4:48:2C:B5:EB:62:20:94:13:CB:C6:FA:6A:19:38:14:26:29`
- fingerprint SHA-256 do certificado do site: `3B:82:45:8D:B9:05:AF:72:39:B5:ED:BC:0D:42:60:9F:F8:83:DF:AF:78:8B:A2:57:04:DF:72:65:95:42:E1:EE`
- backup anterior: `/etc/sgcg/backups/internal-console-ca-versioned-20260429-100318`
- acao necessaria nos clientes: remover CAs antigas `SGCG Jacarezinho Internal Root CA` e instalar novamente a CA baixada de `http://console.interno.jacarezinho/sgcg-root-ca.crt`

### Ajuste no frontend

O service legado `frontend/src/services/apiProxy.js` deixou de montar URL direta para `https://<hostname>:6779/api/proxy`.

Agora usa:

```
/api/proxy
```

Motivo: evitar quebra em acesso interno por porta direta, mismatch de certificado ou dependencia do dominio publico. A comunicacao passa sempre pelo mesmo origin do console e pelo Nginx.

Em 2026-04-29 foi corrigido tambem o login pelo acesso interno:

- problema observado: ao abrir `https://console.interno.jacarezinho`, o frontend ainda tentava autenticar em `https://console.jacarezinho.cloud/api/auth/login`
- efeito: navegador bloqueava a requisicao por CORS e a UI exibia `Sessão não iniciada. Verifique backend/proxy.`
- causa: `frontend/.env` tinha `VITE_API_BASE_URL=https://console.jacarezinho.cloud`, valor embutido no bundle do Vite
- correcao aplicada: `VITE_API_BASE_URL=` para forcar chamadas de API pelo mesmo origin do navegador
- validacao: bundle novo nao contem mais `console.jacarezinho.cloud/api`; `POST https://console.interno.jacarezinho/api/auth/login` chegou ao backend e retornou `401 Credenciais invalidas` com payload ficticio, comprovando ausencia de CORS
- deploy: `npm run build` no frontend e `pm2 restart bcc-frontend --update-env`
- observacao para clientes: se o navegador ainda chamar `console.jacarezinho.cloud`, limpar cache/hard reload porque esta carregando JS antigo

### Validacoes realizadas

```
nginx -t
unbound-checkconf
systemctl reload nginx
systemctl reload unbound
dig +short @127.0.0.1 console.interno.jacarezinho
dig +short @127.0.0.1 console.local.jacarezinho
dig +short @127.0.0.1 console.jacarezinho.local
curl --cacert /etc/sgcg/pki/sgcg-internal-root-ca.crt -I --resolve console.interno.jacarezinho:443:192.168.10.1 https://console.interno.jacarezinho
curl --cacert /etc/sgcg/pki/sgcg-internal-root-ca.crt -I --resolve console.jacarezinho.local:443:192.168.10.1 https://console.jacarezinho.local
npm run build
pm2 restart bcc-frontend --update-env
```

Resultados:

- DNS interno retornou `192.168.10.1`
- HTTPS interno retornou `HTTP/2 200`
- rotas de API internas responderam pelo Nginx; sem token retornam `401 Token ausente`, comportamento esperado
- build do frontend concluido com sucesso
- processo `bcc-frontend` reiniciado via PM2

### Backup

Backup dos arquivos de infraestrutura antes da alteracao:

```
/etc/sgcg/backups/internal-console-20260429-095107
```

## Correção de revogação de sessão do Hotspot — 2026-04-30

- corrigido o comportamento em que uma sessão revogada do hotspot voltava a navegar livremente ao reconectar na rede
- causa confirmada no backend:
  - `GET /api/hotspot/public/context` reconhecia qualquer dispositivo previamente cadastrado e ativo pelo MAC
  - esse fluxo criava automaticamente uma nova sessão `mac_auto`
  - na prática, a revogação removia o IP do `ipset`, mas o próximo acesso ao portal recriava a autorização sem exigir novo login
- `backend/src/modules/hotspot/hotspot-routes.ts` foi ajustado:
  - `POST /api/hotspot/sessions/:id/revoke` agora revoga também sessões ativas correlatas por `device_id`, `mac_address` ou `client_ip`
  - os IPs correlatos são removidos do `ipset` `sgcg_hotspot_v70_auth`
  - o vínculo automático por MAC em `hotspot_devices` foi preservado por decisão operacional
  - dispositivo conhecido e ativo continua fazendo `login automático por MAC` quando acessa o portal cativo
- efeito operacional esperado:
  - ao revogar uma sessão, o cliente perde a autorização runtime
  - ao reconectar na VLAN 70, a navegação direta não deve ficar livre sem passar pelo fluxo do portal
  - ao abrir o portal cativo, se o MAC já estiver cadastrado e ativo, o backend cria nova sessão `mac_auto` e libera o acesso sem exigir CPF e senha
  - se o MAC não estiver cadastrado, o portal exige cadastro ou login por CPF e senha
- validação:
  - `cd backend && npm run build` concluído sem erros de TypeScript

### Recomendacao operacional

Usar `https://console.interno.jacarezinho` como endereco principal dentro da prefeitura/rede institucional.

Manter `https://console.jacarezinho.cloud` para acesso publico/externo.

---

## Normalizacao VLANs 50 e 30 — 2026-04-29

### Contexto

Continuacao da sequencia de normalizacao iniciada nas VLANs 70 e 10. As VLANs 50 (SINE) e 30 ainda estavam em bypass emergencial: regra `ACCEPT` direta no `ip filter FORWARD` do nftables, sem enforcement institucional de DNS/RPZ ativo para elas.

### Diagnostico pre-normalizacao

- `ip filter FORWARD` (nftables runtime):
  - `iifname "enp6s0.50" oifname "enp8s0" ... accept` — handle 188 (bypass ativo)
  - `iifname "enp6s0.30" oifname "enp8s0" ... accept` — handle 186 (bypass ativo)
- DNS redirect `enp6s0*` UDP+TCP/53 ja ativo no `ip nat PREROUTING` (cobre VLANs 50 e 30)
- `becker_policy_compiler.conf`: zonas RPZ para `vlan_30` e `vlan_50` ja presentes (compiladas pelo Policy Compiler em sessao anterior)
- `blocklist-vlan-50.rpz` e `blocklist-vlan-30.rpz`: 180 entradas cada
- `allowlist-vlan-50.rpz` e `allowlist-vlan-30.rpz`: ativas
- Sem VIPs ativos em nenhuma das duas VLANs
- `before.rules`: DoT global `enp6s0+ -p tcp --dport 853 -j DROP` ja cobre ambas

### Correcao aplicada — reloadUnbound() com flush de cache

Identificado que `systemctl reload unbound` (SIGHUP) preserva o cache DNS. Ao adicionar um VIP e recompilar, entradas NXDOMAIN em cache persistiam por ate 300s antes de o passthru do RPZ ser aplicado. Correcao aplicada em `blocking-release-service.ts` linha 2574:

```typescript
async reloadUnbound() {
    await runCommand('systemctl', ['reload', 'unbound'], { elevated: true });
    // ...status check...
    // Purga cache para que regras RPZ/VIP entrem em vigor imediatamente
    await runCommand('unbound-control', ['flush_zone', '.'], { elevated: true, allowFailure: true });
    return status;
}
```

Rebuild e reinicio do `backend-proxy` via PM2 executados.

### Alteracoes aplicadas — VLAN 50

**nftables runtime:**
- Removido: `iifname "enp6s0.50" oifname "enp8s0" accept` (handle 188)
- Adicionado: `iifname "enp6s0.50" tcp dport 853 counter drop` (DoT block)

**Unbound:**
- `unbound-control flush_zone .` executado — cache purgado
- `systemctl reload unbound` executado

**Conntrack:**
- Sessoes ESTABLISHED da VLAN 50 limpas via `conntrack -D -s 192.168.50.0/24`

### Alteracoes aplicadas — VLAN 30

**nftables runtime:**
- Removido: `iifname "enp6s0.30" oifname "enp8s0" accept` (handle 186)
- Adicionado: `iifname "enp6s0.30" tcp dport 853 counter drop` (DoT block)

**Unbound:**
- `unbound-control flush_zone .` executado — 7 rrsets removidos do cache
- `systemctl reload unbound` executado

**Conntrack:**
- Sessoes ESTABLISHED da VLAN 30 limpas via `conntrack -D -s 192.168.30.0/24`

### Estado apos normalizacao

- VLAN 10: normalizada (sessao anterior)
- VLAN 30: **normalizada** — DNS interceptado pelo Unbound, RPZ ativo, DoT bloqueado, bypass removido
- VLAN 40: bypass livre (sem enforcement institucional — por design)
- VLAN 50: **normalizada** — DNS interceptado pelo Unbound, RPZ ativo, DoT bloqueado, bypass removido
- VLAN 70: normalizada (sessao anterior)
- VLANs 80 e 99: bypass livre (sem enforcement institucional — por design)

### Observacao arquitetural

O `/etc/nftables.conf` define `iifname $lan_vlans oifname $wan_if accept` para todas as VLANs — isso e intencional. O enforcement nao e por bloqueio IP/firewall, mas por DNS/RPZ: o Unbound retorna NXDOMAIN para dominios bloqueados pela politica da VLAN. O firewall IP permite o encaminhamento; o Unbound impede a resolucao.

### Validacao executada

- `nft list chain ip filter FORWARD` — sem `accept` para enp6s0.30 ou enp6s0.50
- DoT DROP ativo para ambas as VLANs
- `becker_policy_compiler.conf` — 8 zonas RPZ por VLAN (vippass, allow/block por VLAN, allow/block global)
- Squid blocklist: 88 dominios para cada VLAN
- Cache DNS purgado apos reload

Em contingencia de link, desde que o servidor `192.168.10.1`, Nginx, Unbound e DHCP estejam ativos, a administracao deve continuar acessivel pela LAN sem depender de DNS publico ou internet.

## Correcao do modulo Seguranca Operacional - 2026-04-29

- corrigida falha operacional do modulo `Seguranca Operacional` quando o host nao possui mais o binario `ufw`
- diagnostico confirmado:
  - o backend registrava repetidamente `sudo: ufw: command not found`
  - `systemctl status ufw` ainda exibia estado residual `active (exited)`, mas a unit estava `Loaded: not-found`
  - o runtime real de firewall permanecia ativo via `iptables/nftables`, com regras institucionais presentes
- o backend `backend/src/modules/security/security-routes.ts` passou a:
  - detectar explicitamente a ausencia de `/usr/sbin/ufw`
  - evitar chamada a `sudo ufw status numbered` quando o UFW nao estiver instalado
  - usar `iptables-save -t filter` como leitura de fallback para o dashboard
  - devolver `installed`, `runtime_source` e mensagem operacional no payload de `/api/security/dashboard`
  - bloquear acoes dependentes de UFW com `503` explicito quando o binario estiver ausente
- o utilitario `backend/src/utils/sys.ts` passou a permitir leitura controlada de `iptables-save -t filter`
- a interface `frontend/src/pages/Security.jsx` passou a:
  - exibir a fonte real do firewall (`ufw` ou `iptables`)
  - mostrar aviso institucional quando a leitura vier do runtime `iptables`
  - preservar a listagem de regras em modo somente leitura quando o UFW nao estiver disponivel
  - propagar mensagens reais de erro em acoes de blindagem/remocao
- validacao executada:
  - `cd backend && npm run build` concluido sem erros
  - `cd frontend && npm run build` concluido com sucesso

  - `pm2 restart bcc-backend`
  - `pm2 restart bcc-frontend`
  - `GET /api/security/dashboard` autenticado retornou `200`, `runtime_source=iptables`, `installed=false`, regras reais do runtime e Fail2Ban ativo

## Proximo passo recomendado

- decidir institucionalmente se o SGCG deve reinstalar e voltar a operar UFW como camada de administracao, ou se o modulo `Seguranca Operacional` deve evoluir formalmente para gerenciamento nativo de `nftables/iptables`
- enquanto o UFW estiver ausente, manter a tela de firewall como observabilidade somente leitura para evitar alteracoes destrutivas em runtime sem contrato administrativo claro

## Restauracao oficial do UFW - 2026-04-29

- decisao operacional revisada: o UFW deve permanecer como camada oficial de administracao do firewall no SGCG
- auditoria confirmou a origem da remocao:
  - em `2026-04-28 16:03:01`, foi executado `apt-get install -y iptables-persistent netfilter-persistent`
  - `apt history` registrou `Requested-By: sinturs (1000)`
  - a instalacao de `iptables-persistent` e `netfilter-persistent` removeu `ufw 0.36.2-6` por conflito de pacote
  - `dpkg.log` confirmou `remove ufw:all 0.36.2-6` em `2026-04-28 16:03:02`
  - o `etckeeper` em `/etc` registrou commit com autor `sinturs <sinturs@invovacaoserver>` para essa transacao
- restauracao executada:
  - `apt-get install -y ufw`
  - isso reinstalou `ufw 0.36.2-6` e removeu `iptables-persistent` e `netfilter-persistent`
  - os arquivos existentes em `/etc/ufw` foram preservados
  - `ufw reload` executado com sucesso
- validacao operacional:
  - `ufw status numbered` retornou `Status: active`
  - 121 regras numeradas foram listadas pelo UFW
  - os arquivos persistidos contem regras adicionais nas camadas base:
    - `/etc/ufw/before.rules`: 36 regras `ufw-*`
    - `/etc/ufw/before6.rules`: 68 regras `ufw6-*`
    - `/etc/ufw/user.rules`: 55 regras `ufw-*`
    - `/etc/ufw/user6.rules`: 80 regras `ufw6-*`
  - `iptables-save -t filter` confirmou chains `ufw-*` carregadas no runtime IPv4
  - `ip6tables-save -t filter` confirmou chains `ufw6-*` carregadas no runtime IPv6
- correcao complementar no backend:
  - o parser de `backend/src/modules/security/security-routes.ts` passou a reconhecer regras `FWD`, alem de `IN` e `OUT`
  - isso garante que o modulo `Seguranca Operacional` exiba corretamente as regras de encaminhamento do UFW
- validacao do SGCG:
  - `cd backend && npm run build` concluido sem erros
  - `pm2 restart bcc-backend`
  - `GET /api/security/dashboard` autenticado retornou:
    - `ufw.active=true`
    - `ufw.installed=true`
    - `ufw.runtime_source=ufw`
    - `121` regras expostas para a interface

## Proximo passo recomendado

- impedir novas instalacoes de `iptables-persistent` e `netfilter-persistent` sem aprovacao, pois esses pacotes removem o UFW neste host
- se for necessario persistir regras manuais fora do UFW, documentar antes a arquitetura para nao substituir a camada oficial de firewall do SGCG

## Modulo Hotspot institucional - 2026-04-29

- criado o modulo administrativo `Hotspot` no SGCG, acessivel pela navegacao principal em `/hotspot`
- criado o portal publico `/hotspot/portal` para visitantes, com foco 100% mobile-first e tom institucional/governamental
- identidade visual/textual do portal:
  - `Hotspot Institucional`
  - `Prefeitura Municipal de Jacarezinho`
  - `Secretaria do Comercio, Industria, Servicos e Inovacao`
  - termo de uso da rede e aviso de identificacao obrigatoria
- fluxo publico implementado:
  - primeiro acesso com cadastro de `Nome completo`, `CPF`, `Data de nascimento`, `Nome da mae` e `Senha`
  - login posterior com `CPF` e `Senha`
  - tentativa de identificacao automatica do MAC pelo gateway via `ip neigh show <ip>`
  - associacao do MAC ao cadastro quando o gateway conseguir inferir o dispositivo
  - login automatico futuro quando o MAC ja estiver cadastrado e ativo
- persistencia criada no backend:
  - `hotspot_visitors`
  - `hotspot_devices`
  - `hotspot_sessions`
- auditoria institucional:
  - todos os eventos publicos e administrativos do Hotspot sao registrados em `action_audit_logs`
  - eventos humanizados nos relatorios: MAC ausente/desconhecido, login automatico, cadastro, login e revogacao de sessao
- regra arquitetural da VLAN 70:
  - o Hotspot identifica visitantes e registra sessoes
  - o Hotspot nao substitui nem enfraquece enforcement, DNS, ACL ou RPZ
  - a VLAN 70 permanece sujeita aos bloqueios institucionais ja existentes
  - qualquer pivot futuro da VLAN 30 para Hotspot deve preservar a mesma regra
- regra de firewall preservada:
  - o UFW continua sendo o firewall principal e inegociavel do servidor
  - iptables/nftables/tc podem atuar apenas em paralelo/complemento documentado, nunca como substituto silencioso do UFW
- ajustes tecnicos:
  - `backend/src/modules/hotspot/hotspot-routes.ts`
  - `backend/src/middleware/auth.ts` liberando apenas `/api/hotspot/public/*` sem JWT
  - `backend/src/server.ts` registrando rotas e schema do Hotspot
  - `backend/src/utils/sys.ts` permitindo leitura controlada de `ip neigh show <ip>`
  - `frontend/src/pages/Hotspot.jsx`
  - `frontend/src/pages/HotspotPortal.jsx`
  - `frontend/src/services/api.js` tratando `/api/hotspot/public/*` como rota publica independente da sessao administrativa
  - `frontend/src/App.jsx` e `frontend/src/components/Sidebar.jsx`
- validacao executada:
  - `cd backend && npm run build`
  - `cd frontend && npm run build`
  - `pm2 restart bcc-backend`
  - `pm2 restart bcc-frontend`
  - `GET /api/hotspot/public/context` retornou contexto publico sem exigir JWT
  - `GET https://127.0.0.1:6777/hotspot/portal` retornou `200` e carregou os assets de producao do frontend
  - `POST /api/hotspot/public/register` com payload vazio retornou validacao em portugues
  - `GET /api/hotspot/overview` autenticado retornou totais iniciais do modulo
- observacao de validacao visual:
  - nao havia Playwright/Chromium instalado no ambiente para screenshot automatizado
  - o portal publico foi estruturado como mobile-first: layout de uma coluna, inputs/botoes com altura adequada ao toque, textos curtos, largura responsiva e sem tabelas ou paineis largos na jornada do visitante

## Fechamento do Hotspot cativo VLAN 70 - 2026-04-29

- implantado vhost Nginx `/etc/nginx/sites-available/sgcg-hotspot-captive`
  - HTTP institucional em `192.168.70.1`
  - rota publica `/hotspot/portal`
  - proxy de `/api/hotspot/public/*` para o backend core `127.0.0.1:6778`
  - assets do frontend servidos via proxy interno para `127.0.0.1:6777`
  - hosts comuns de deteccao de portal cativo redirecionados para `http://192.168.70.1/hotspot/portal`
- enforcement complementar do portal cativo:
  - `ipset` `sgcg_hotspot_v70_auth` com timeout de 12 horas
  - `iptables -t nat PREROUTING` redireciona HTTP de nao autenticados da `enp6s0.70` para `192.168.70.1:80`
  - `iptables FORWARD` rejeita saida WAN de nao autenticados na VLAN 70
  - login/cadastro/auto-login autorizam o IP do visitante no `ipset`
  - revogacao de sessao remove o IP do runtime quando aplicavel
- regra institucional preservada:
  - UFW continua sendo o firewall principal
  - `ipset`/`iptables` foram usados somente como camada complementar de runtime para captive portal
  - DNS, ACL, RPZ, DoT block e demais politicas da VLAN 70 continuam ativos depois da autenticacao
- modulo administrativo `Hotspot` passou a exibir estado do enforcement:
  - interface
  - gateway
  - quantidade de IPs liberados
  - acao `Reconciliar`
- validacao executada:
  - `nginx -t` com sucesso
  - `systemctl reload nginx`
  - `ipset list sgcg_hotspot_v70_auth` confirmou o conjunto criado
  - `iptables -t nat -S PREROUTING` confirmou DNAT cativo da VLAN 70
  - `iptables -S FORWARD` confirmou rejeicao WAN para nao autenticados
  - `GET http://127.0.0.1/hotspot/portal` com `Host: 192.168.70.1` retornou `200`
  - `GET http://127.0.0.1/generate_204` com host de captive check retornou `302` para `http://192.168.70.1/hotspot/portal`
  - `cd backend && npm run build`
  - `cd frontend && npm run build`
  - `pm2 restart bcc-backend`
  - `pm2 restart bcc-frontend`

## Correção do bypass emergencial por VLAN — 2026-04-29

Três problemas identificados e corrigidos no fluxo de `Liberação emergencial por VLAN` em `Operações Táticas`.

### Problema 1 — Firewall UFW não isentava VLAN emergencial do DROP global de DoT

**`backend-proxy/src/services/dns-contingency-service.ts`**

- `buildEarlyFirewallBlock()` passou a aceitar `emergencyVlans: VlanRow[]`
- Para cada VLAN em bypass emergencial, gera `-A ufw-before-forward -i <iface> -p tcp --dport 853 -j ACCEPT` **antes** do DROP global `enp6s0+`
- Isso garante que DoT não seja bloqueado pelo UFW em VLANs que estão com enforcement suspenso

- `applyRuntimeVipBypassRules()` passou a aceitar `emergencyVlans: VlanRow[]`
- Gerencia regras iptables runtime com comentário `sgcg-emergency-bypass`:
  - Adiciona `FORWARD ACCEPT src <subnet> → WAN` e `FORWARD ACCEPT dst <subnet> RELATED,ESTABLISHED`
  - Adiciona `FORWARD ACCEPT iifname <iface> tcp dport 853` (DoT liberado em runtime)
  - Remove regras stale de VLANs que saíram do bypass

- `applyFirewallBlock()` passou a aceitar e propagar `emergencyVlans` para ambos os métodos acima

- `ensureFirewallState()` passou a buscar VLANs em bypass emergencial via `listEmergencyVlanRows()` e passá-las para `applyFirewallBlock()`

- `listEmergencyVlanRows()` — novo helper que consulta `emergency_vlan_bypass WHERE active = TRUE` e faz join com `vlan_policies` para retornar `interface_name` e `subnet_cidr` das VLANs afetadas

### Problema 2 — Camada nftables de DoT não era gerenciada pelo sistema

**`backend-proxy/src/services/blocking-release-service.ts`**

- `activateEmergencyVlanBypass()` passou a chamar `applyNftablesDotExemption(vlanId, true)` após `ensureFirewallState()`:
  - Insere regra nftables `ACCEPT` para DoT na chain `ip filter FORWARD` para a interface da VLAN, com comentário `sgcg-emergency-bypass`
  - Essa regra precede qualquer DROP existente na chain, liberando DoT em runtime

- `deactivateEmergencyVlanBypass()` passou a chamar `applyNftablesDotExemption(vlanId, false)` após `ensureFirewallState()`:
  - Lista `nft -a list chain ip filter FORWARD`, localiza handles de regras com comentário `sgcg-emergency-bypass` para a interface da VLAN, e as remove via `nft delete rule`

- `applyNftablesDotExemption()` — novo método privado que executa as operações nftables acima

### Problema 3 — Comentário contraditório no compilador

**`backend-proxy/src/services/policy-compiler-service.ts`**

- Corrigido comentário nas linhas 308-310 que afirmava que VLANs em bypass emergencial não teriam bypass DNS total
- O código as inclui em `dnsBypassEntries` → zona VIP passthru → passthru total no Unbound/RPZ
- Comentário atualizado para descrever o comportamento real

### Problema 4 — Unbound não era recarregado automaticamente ao ativar/desativar bypass

**`backend-proxy/src/services/blocking-release-service.ts`**

- `activateEmergencyVlanBypass()` passou a chamar `this.reloadUnbound()` imediatamente após `writeGeneratedArtifacts()`
- `deactivateEmergencyVlanBypass()` recebeu o mesmo ajuste
- `reloadUnbound()` já executa `systemctl reload unbound` seguido de `unbound-control flush_zone .`, garantindo que:
  - As novas zonas RPZ (com o passthru da VLAN) entrem em vigor imediatamente
  - Entradas NXDOMAIN em cache sejam purgas sem esperar o TTL de 300s
- O operador não precisa de acesso ao terminal para que o bypass DNS tenha efeito imediato

### Build

- `cd backend-proxy && npm run build` — compilação TypeScript concluída sem erros
- `pm2 restart backend-proxy --update-env` — online (duas rodadas de build/restart nesta sessão)

## CRUD administrativo de visitantes do Hotspot - 2026-04-29

- o painel `Hotspot -> Visitantes` deixou de ser somente leitura e passou a ter CRUD administrativo
- backend:
  - `POST /api/hotspot/visitors`
  - `GET /api/hotspot/visitors/:id`
  - `PUT /api/hotspot/visitors/:id`
  - `DELETE /api/hotspot/visitors/:id`
- exclusao e desativacao sao logicas:
  - preservam historico e auditoria
  - desativam dispositivos associados
  - revogam sessoes ativas
  - removem IPs autorizados do `ipset` quando aplicavel
- frontend:
  - modal responsivo para criar/editar visitante
  - campos: nome completo, CPF, data de nascimento, nome da mae, senha e cadastro ativo
  - acoes de editar/excluir aparecem no `mouse hover` da linha em desktop
  - no mobile as acoes ficam visiveis, pois toque nao possui hover confiavel
- auditoria:
  - `hotspot_visitor_created`
  - `hotspot_visitor_create_failed`
  - `hotspot_visitor_updated`
  - `hotspot_visitor_update_failed`
  - `hotspot_visitor_deleted`
- validacao executada:
  - `cd backend && npm run build`
  - `cd frontend && npm run build`
  - `pm2 restart bcc-backend`

## Correcao ClamAV e limpeza de historico — 2026-04-29

### Problema diagnosticado

- a acao `Atualizar ClamAV` (sincronizar assinaturas antimalware) falhava com o erro `Failed to lock the log file /var/log/clamav/freshclam.log: Resource temporarily unavailable`
- causa raiz: o backend chamava `freshclam --stdout` diretamente, mas o daemon `clamav-freshclam` ja mantinha o lock exclusivo do arquivo de log
- chamar uma segunda instancia de `freshclam` enquanto o daemon esta rodando e invalido pelo design do proprio ClamAV

### Correcao aplicada

- `backend/src/modules/control/control-routes.ts`:
  - acao `clamav_update` deixou de chamar `execClam('sudo', ['freshclam', '--stdout'])`
  - passou a usar `sudo systemctl restart clamav-freshclam`, que forca a nova instancia a verificar e sincronizar assinaturas imediatamente na inicializacao
  - apos o restart, o backend verifica `systemctl is-active clamav-freshclam` e registra o resultado no historico `control_antimalware_runs` normalmente
  - isso elimina o conflito de lock sem alterar a semantica da operacao
- novo endpoint `DELETE /api/control/clamav/runs`:
  - limpa todo o historico de execucoes do ClamAV, exceto varreduras com status `running`
  - `control_antimalware_findings` associados sao removidos em cascata pelo `ON DELETE CASCADE`
- `frontend/src/pages/Control.jsx`:
  - botao `Limpar historico` adicionado ao lado do titulo `Ultimas execucoes` na secao `ClamAV institucional`
  - o botao aparece somente quando houver registros no historico
  - exige confirmacao antes de executar
  - recarrega os dados apos a limpeza

### Estado do ClamAV confirmado

- `clamav-daemon`: `active`
- `clamav-freshclam`: `active` — assinaturas `daily 27986 / 2026-04-29`
- `clamav-clamonacc`: `active`
- superficies de varredura acessiveis: `/mnt/cftv_storage`, `/mnt/nextcloud_data`

### Build

- `cd backend && npm run build` — compilacao TypeScript concluida sem erros
- `pm2 restart bcc-backend` — online
  - `pm2 restart bcc-frontend`

## Hotspot — Metricas e Relatorio Institucional — 2026-04-29

### O que foi adicionado

O modulo Hotspot ganhou tres abas: **Visao Geral** (existente), **Metricas** e **Relatorio**.

#### Aba Metricas

- cards de resumo: sessoes do mes, usuarios unicos do mes, dias com acesso, top usuario
- grafico de barras: usuarios unicos por dia (ultimos 7 dias)
- grafico de distribuicao horaria (24h, acumulado 30 dias)
- ranking de usuarios por numero de sessoes (barra de progresso + cpf mascarado)
- breakdown de metodos de autenticacao com barra de porcentagem
- distribuicao por VLAN
- nota informativa sobre integracao com log DNS para "sites mais visitados"

#### Aba Relatorio

- filtros: periodo (De / Ate), usuario (select populado da lista de visitantes), VLAN
- botao `Gerar Relatorio` — carrega ate 200 registros na tela
- botao `Sincronizar Log` — popula a tabela imutavel `hotspot_access_log` a partir das sessoes encerradas
- botao `Imprimir / Salvar PDF` — gera janela de impressao com layout governamental
- cards de metricas do periodo: sessoes, usuarios unicos, tempo total acumulado
- tabela com: data, hora, usuario, cpf mascarado, ip, vlan, metodo auth, duracao, site, banda

#### Relatorio PDF — layout governamental

- **Cabecalho**: logotipo da Prefeitura Municipal de Jacarezinho (carregado de `jacarezinho.pr.gov.br`), nome da prefeitura em azul `#003087`, estado do Parana, secretaria, titulo do relatorio
- **Fallback de logo**: se a imagem nao carregar, exibe circulo "PMJ PARANA"
- **Bloco meta**: periodo, total de sessoes, usuarios unicos, data/hora de emissao
- **Tabela**: todas as colunas, fundo alternado, cabecalho azul governo
- **Rodape**: identificacao do sistema SGCG, data de geracao, nota de validade institucional, numero de documento unico (`SGCG-HS-<hex>`)
- Formato A4 paisagem, `window.print()` dispara automaticamente ao abrir a janela

### Novos endpoints de backend

| Metodo | Rota | Auth | Descricao |
|--------|------|------|-----------|
| GET | `/api/hotspot/metrics` | JWT | Metricas de uso: diario, mensal, top usuarios, auth methods, vlan, horario |
| POST | `/api/hotspot/access-log/sync` | JWT | Sincroniza sessoes encerradas para a tabela imutavel `hotspot_access_log` |
| GET | `/api/hotspot/report` | JWT | Relatorio paginado com filtros de periodo, usuario e vlan |

### Nova tabela de banco de dados

```sql
CREATE TABLE hotspot_access_log (
    id BIGSERIAL PRIMARY KEY,
    logged_at TIMESTAMPTZ DEFAULT NOW(),
    session_id BIGINT,          -- referencia a hotspot_sessions (sem FK para manter imutabilidade)
    visitor_id BIGINT,
    visitor_name TEXT,
    cpf_masked TEXT,
    client_ip INET,
    mac_address TEXT,
    vlan_id INTEGER,
    auth_method TEXT,
    session_started_at TIMESTAMPTZ,
    session_ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    bytes_up BIGINT DEFAULT 0,
    bytes_down BIGINT DEFAULT 0,
    top_domain TEXT,
    notes TEXT
);
-- IMUTAVEL: apenas INSERT. REVOKE DELETE, UPDATE FROM PUBLIC executado no ensureAccessLogSchema.
```

Indices: `idx_hotspot_access_log_date`, `idx_hotspot_access_log_visitor`, `idx_hotspot_access_log_vlan`

### Arquivos alterados

- `backend/src/modules/hotspot/hotspot-routes.ts` — funcao `ensureAccessLogSchema()` + 3 novos routes + export `hotspotSchemaService` atualizado
- `frontend/src/pages/Hotspot.jsx` — reescrito com TabBar + MetricsTab + ReportTab; aba Visao Geral preservada sem alteracoes

### Build

- `cd backend && npm run build` — TypeScript compilado sem erros
- `pm2 restart bcc-backend` — online (confirmado via `pm2 list`)
- endpoints verificados: `/api/hotspot/metrics`, `/api/hotspot/access-log/sync`, `/api/hotspot/report` retornam 401 (JWT obrigatorio) — correto

---

## Sessão 2026-04-29 — Módulo Hotspot: Métricas, Relatório Institucional e PDF

### Visão geral

Expansão completa do módulo Hotspot com sistema de abas (3 tabs), painel de métricas com gráficos CSS, relatório institucional com filtros e impressão PDF em layout A4 landscape com identidade visual da Prefeitura Municipal de Jacarezinho.

---

### Backend — `backend/src/modules/hotspot/hotspot-routes.ts`

#### Nova tabela imutável `hotspot_access_log`

Criada via `ensureAccessLogSchema()`, chamada antes de `ensureSchema()` na inicialização:

```sql
CREATE TABLE IF NOT EXISTS hotspot_access_log (
    id BIGSERIAL PRIMARY KEY,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_id BIGINT,
    visitor_id BIGINT,
    visitor_name TEXT,
    cpf_masked TEXT,
    client_ip INET,
    mac_address TEXT,
    vlan_id INTEGER,
    auth_method TEXT,
    session_started_at TIMESTAMPTZ,
    session_ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    bytes_up BIGINT DEFAULT 0,
    bytes_down BIGINT DEFAULT 0,
    top_domain TEXT,
    notes TEXT
);
-- Imutabilidade: REVOKE DELETE, UPDATE ON hotspot_access_log FROM PUBLIC
```

Índices: `idx_hotspot_access_log_date`, `idx_hotspot_access_log_visitor`, `idx_hotspot_access_log_vlan`

#### Novos endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/hotspot/metrics` | JWT | Métricas: diário (30d), mensal, top 10 usuários, auth methods (%), VLAN, distribuição horária (24h) |
| POST | `/api/hotspot/access-log/sync` | JWT | Sincroniza sessões encerradas para `hotspot_access_log` (dedup por `session_id`) |
| GET | `/api/hotspot/report` | JWT | Relatório paginado; filtros: `from`, `to`, `visitor_id`, `vlan_id`, `page`, `limit` (máx 1000) |

**Padrão de SQL dinâmico no `/report`:**
- Condições montadas com `params.length + 1` para evitar conflito de índice
- `baseParams = [...params]` snapshot antes de adicionar LIMIT/OFFSET — reusado em `COUNT` e `summary`
- CPF mascarado via `REGEXP_REPLACE(v.cpf, '(\\d{3})(\\d{3})(\\d{3})(\\d{2})', '\\1.***.***-\\4')` (duplo escape TypeScript)

**Export atualizado:**
```typescript
export const hotspotSchemaService = { ensureSchema, ensureHotspotEnforcement, ensureAccessLogSchema };
```

---

### Frontend — `frontend/src/pages/Hotspot.jsx`

Arquivo reescrito completamente (~875 linhas). Aba **Visão Geral** preservada sem alterações funcionais.

#### Novos imports

```javascript
import { BarChart2, Clock, FileText, Filter, Printer, Users } from 'lucide-react';
```

#### Helpers adicionados

| Função | Descrição |
|--------|-----------|
| `formatDuration(seconds)` | Converte segundos em `Xh Ym` / `Xm Ys` |
| `formatBytes(bytes)` | Formata bytes em B / KB / MB |

#### Novo componente `TabBar`

3 abas com indicador ativo (`bg-primary text-on-primary`). Rótulos ocultos em mobile (`hidden sm:inline`).

| Key | Label | Ícone |
|-----|-------|-------|
| `overview` | Visão Geral | `Wifi` |
| `metrics` | Métricas | `BarChart2` |
| `report` | Relatório | `FileText` |

#### Novo componente `SelectField`

Select estilizado com label uppercase, mesmo visual dos `Field` inputs.

#### Novo componente `MetricsTab`

- **Loading**: spinner `Activity` animado
- **Empty state**: botão "Carregar Métricas"
- **4 cards de métrica**: sessões mês, usuários únicos mês, dias com acesso, top usuário
- **Gráfico de barras CSS** — últimos 7 dias (usuários únicos por dia, altura proporcional ao máximo)
- **Gráfico de barras CSS** — distribuição horária 0–23h
- **Ranking de usuários** com barra de progresso percentual (top 10)
- **Métodos de autenticação**: barras coloridas (`bg-primary`, `bg-info`, `bg-orange-500`) com %
- **Distribuição por VLAN**: chips coloridos
- Nota sobre `top_domain` (requer integração com dnsmasq/unbound por IP)

#### Novo componente `ReportTab`

**Estado:** `filters` (from, to, visitor_id, vlan_id), `reportData`, `loading`, `syncing`, `printing`

**Funções:**
- `buildParams()` — monta query string a partir dos filtros ativos
- `loadReport()` — busca até 200 linhas em `/api/hotspot/report`
- `syncLog()` — chama `POST /access-log/sync` e exibe contagem inserida
- `printReport()` — busca até 1000 linhas, abre janela com HTML institucional e `setTimeout(window.print, 500)`

**Filtros disponíveis:** período (de/até), visitante (select), VLAN (select)

**Colunas da tabela de resultados:**
`Data`, `Hora`, `IP`, `MAC`, `Usuário`, `CPF`, `VLAN`, `Método Auth`, `Duração`, `Site`

#### Função `printReport` — template HTML institucional

- **Formato:** A4 landscape, margens `1.2cm 1.5cm 2.2cm`
- **Logo:** `https://www.jacarezinho.pr.gov.br/uploads/siteDescricao/logoprincipal493_(107).png` com fallback `onerror` para bloco estilizado "PMJ PARANÁ"
- **Cabeçalho:**
  ```
  H1 — Prefeitura Municipal de Jacarezinho        (cor #003087)
  H2 — Estado do Paraná
  H3 — Secretaria do Comércio, Indústria, Serviços e Inovação
  H4 — Relatório Oficial do Hotspot Institucional  ← título oficial
  p  — Relatório de Acesso ao Hotspot Municipal    ← subtítulo descritivo
  ```
- **Bloco meta:** Período, Total de Sessões, Usuários Únicos, Emissão (data/hora)
- **Tabela:** cabeçalho azul `#003087`, linhas alternadas
- **Rodapé:** "Sistema de Governança e Controle Governamental (SGCG)", número único `SGCG-HS-<hex>` (`Date.now().toString(36).toUpperCase()`), nota de validade institucional
- **Auto-print:** `setTimeout(window.print, 500)` ao abrir a janela

#### Componente principal `Hotspot`

Novo estado: `tab` (default `'overview'`), `metrics`, `metricsLoading`

`useEffect` auto-carrega métricas ao mudar para a aba `metrics` (apenas se `metrics` ainda nulo).

Renderização condicional por `tab`:
```jsx
{tab === 'overview' && <...visão geral...>}
{tab === 'metrics' && <MetricsTab ... />}
{tab === 'report'  && <ReportTab ... />}
```

---

### Ajuste de cabeçalho do relatório PDF (2026-04-29)

- `<h4>` alterado de `"Relatório de Acesso ao Hotspot Municipal"` → `"Relatório Oficial do Hotspot Institucional"`
- Adicionado `<p>` com subtítulo descritivo abaixo do H4

---

### Build e deploy

```bash
cd backend && npm run build   # sem erros TypeScript
pm2 restart bcc-backend       # online — porta 6778
```

Endpoints verificados: retornam `401` sem JWT válido (comportamento correto).

## Remoção do campo Nome da Mãe no Hotspot - 2026-04-29

- removido o campo `Nome da mãe` do cadastro público do portal `/hotspot/portal`
- removido o campo `Nome da mãe` do CRUD administrativo de visitantes em `Hotspot -> Visitantes`
- backend do Hotspot deixou de exigir, inserir, listar ou atualizar `mother_name`
- a tabela `hotspot_visitors` foi alterada no PostgreSQL para remover fisicamente a coluna `mother_name`
- `ensureSchema()` do Hotspot passou a executar `ALTER TABLE hotspot_visitors DROP COLUMN IF EXISTS mother_name`, garantindo que bases legadas sejam saneadas em novas subidas
- mensagens de validação do cadastro público e administrativo foram atualizadas para exigir apenas:
  - nome completo
  - CPF
  - data de nascimento
  - senha

### Validação

- `ALTER TABLE hotspot_visitors DROP COLUMN IF EXISTS mother_name` executado com sucesso no banco `controlebeckercorp_v8`
- conferência em `information_schema.columns` confirmou ausência da coluna `mother_name`
- `cd backend && npm run build` — compilação TypeScript concluída sem erros
- `cd frontend && npm run build` — `✓ built in 2.75s`
- `pm2 restart bcc-backend bcc-frontend --update-env` — ambos `online`
- `POST /api/hotspot/public/register` com senha inválida retornou mensagem nova sem referência a nome da mãe
- `GET https://127.0.0.1:6777/hotspot/portal` retornou `200`

---

## Sessão 2026-04-30 — Exportação de Queries DNS por IP no Módulo Hotspot

### Objetivo

Ativar a integração entre o `DnsRadarService` (que já ingeria consultas DNS do Unbound em `dns_policy_events`) e o módulo Hotspot, populando automaticamente o campo `top_domain` e exibindo os sites mais visitados por usuários da VLAN 70.

### Contexto técnico

- `backend-proxy` e `backend` compartilham o mesmo banco `controlebeckercorp_v8`
- `dns_policy_events` já é populada pelo `DnsRadarService` via `journalctl -fu unbound`
- IPs da VLAN 70 (hotspot) seguem o padrão `192.168.70.x`
- `hotspot_access_log.top_domain` existia mas nunca era populado

---

### Backend — `backend/src/modules/hotspot/hotspot-routes.ts`

#### 1. `GET /metrics` — novo campo `top_domains`

Adicionada query ao `Promise.all` existente:

```sql
SELECT query_name AS domain,
       COUNT(*)::int AS total,
       COUNT(DISTINCT host(client_ip))::int AS unique_ips
FROM dns_policy_events
WHERE occurred_at >= NOW() - INTERVAL '30 days'
  AND client_ip::text LIKE '192.168.70.%'
  AND action != 'blocked'
  AND query_name IS NOT NULL
  AND query_name != '-'
GROUP BY query_name
ORDER BY total DESC
LIMIT 10
```

Usando `.catch(() => ({ rows: [] }))` para não quebrar quando `dns_policy_events` estiver vazia.

Resposta do endpoint passa a incluir `top_domains: [{ domain, total, unique_ips }]`.

#### 2. `POST /access-log/sync` — população de `top_domain`

Após o INSERT das sessões, executa UPDATE correlacionado para preencher `top_domain`:

```sql
UPDATE hotspot_access_log hal
SET top_domain = (
    SELECT dpe.query_name
    FROM dns_policy_events dpe
    WHERE dpe.client_ip = hal.client_ip
      AND dpe.occurred_at >= hal.session_started_at
      AND dpe.occurred_at <= COALESCE(hal.session_ended_at, hal.session_started_at + INTERVAL '12 hours')
      AND dpe.action != 'blocked'
      AND dpe.query_name IS NOT NULL
      AND dpe.query_name != '-'
    GROUP BY dpe.query_name
    ORDER BY COUNT(*) DESC
    LIMIT 1
)
WHERE hal.top_domain IS NULL
  AND hal.client_ip IS NOT NULL
  AND hal.session_started_at IS NOT NULL
```

Usa `.catch(() => null)` para tolerar `top_domain` já preenchido ou ausência de dados DNS.

#### 3. `GET /report` — `top_domain` ao vivo via subquery correlacionada

Substituído `al.top_domain` por:

```sql
COALESCE(al.top_domain, (
    SELECT dpe.query_name
    FROM dns_policy_events dpe
    WHERE dpe.client_ip = s.client_ip
      AND dpe.occurred_at >= s.started_at
      AND dpe.action != 'blocked'
      AND dpe.query_name IS NOT NULL
      AND dpe.query_name != '-'
    GROUP BY dpe.query_name
    ORDER BY COUNT(*) DESC
    LIMIT 1
)) AS top_domain
```

Garante que sessões ainda não sincronizadas já mostrem o site mais visitado em tempo real.

---

### Frontend — `frontend/src/pages/Hotspot.jsx`

#### `MetricsTab` — painel "Sites mais visitados"

Substituído o aviso estático de "requer integração DNS" por painel real:

- Título: **Sites mais visitados (VLAN 70 — últimos 30 dias)**
- Lista de até 10 domínios com barra de progresso proporcional ao primeiro da lista (`bg-info/70`)
- Cada linha exibe: domínio, total de consultas, número de IPs únicos
- Estado vazio: mensagem orientando verificar se `DnsRadarService` está ativo

`top_domains` desestruturado do objeto `metrics` recebido do backend.

---

### Correção prévia nesta sessão — índice IMMUTABLE

Erro PostgreSQL `functions in index expression must be marked IMMUTABLE` causado por:

```sql
CREATE INDEX IF NOT EXISTS idx_hotspot_access_log_date
    ON hotspot_access_log (DATE(session_started_at));
```

`DATE(TIMESTAMPTZ)` é `STABLE` (depende do timezone de sessão), não `IMMUTABLE`.

**Fix:** índice alterado para `(session_started_at)` diretamente — cobre os mesmos filtros por intervalo de data.

---

### Build e deploy

```bash
cd backend && npm run build    # sem erros TypeScript
cd frontend && npm run build   # ✓ 1919 módulos, built in 2.60s
pm2 restart bcc-backend bcc-frontend
```

Ambos online. Endpoints verificados: `GET /api/hotspot/metrics` retorna `top_domains`, `POST /api/hotspot/access-log/sync` popula `top_domain` no banco.

---

## Sessão 2026-04-29 — Política de Domínios Ignorados, Identidade Windows no Radar DNS e Correções

### Contexto

Após ativar a exportação de queries DNS por IP no módulo Hotspot, identificou-se que os relatórios e métricas de radar DNS estavam sendo contaminados por domínios de hardware (câmeras, APs, switches) que consultam repetidamente domínios internos e de telemetria sem qualquer relevância para governança de usuários.

---

### Fase 1 — Filtro hardcoded removido → Política DB-backed `dns_ignored_domains`

#### Problema

Domínios reportados como ruído:
- `brwc894021a6f3c.vlan70.local`, `wpad.vlan70.local` — hostnames de hardware consultando WPAD
- `api-cronos.intelbras.com.br` — telemetria de câmeras Intelbras
- `neverssl.com` — teste de conectividade de APs
- `tp-link.com` — telemetria de APs TP-Link
- Qualquer domínio contendo `vlan` no nome (`*vlan*`)

#### Solução implementada

Nova tabela `dns_ignored_domains` gerenciada via UI, com seed inicial automático.

**Schema adicionado em `blocking-release-schema-service.ts`:**

```sql
CREATE TABLE IF NOT EXISTS dns_ignored_domains (
    id          SERIAL PRIMARY KEY,
    pattern     TEXT        NOT NULL,
    match_type  TEXT        NOT NULL DEFAULT 'contains'
                            CHECK (match_type IN ('exact','contains','suffix','prefix')),
    description TEXT,
    active      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_dns_ignored_pattern UNIQUE (pattern)
);
```

Também adicionadas colunas de identidade Windows:

```sql
ALTER TABLE dns_policy_events ADD COLUMN IF NOT EXISTS identity_user     TEXT;
ALTER TABLE dns_policy_events ADD COLUMN IF NOT EXISTS identity_computer TEXT;
```

---

### Novo serviço — `backend-proxy/src/services/dns-ignored-service.ts`

Serviço com cache TTL de 30 segundos para não bater no banco a cada evento DNS.

**Seeds iniciais (5 regras):**

| pattern | match_type | descrição |
|---------|-----------|-----------|
| `vlan` | `contains` | Hostnames de hardware com VLAN no nome |
| `.local` | `suffix` | Domínios mDNS/NetBIOS internos |
| `api-cronos.intelbras.com.br` | `exact` | Telemetria câmeras Intelbras |
| `neverssl.com` | `exact` | Teste de conectividade de APs |
| `tp-link.com` | `exact` | Telemetria APs TP-Link |

**Interface pública:**

```typescript
loadActive(): Promise<PatternRow[]>          // com cache 30s
buildSqlFilter(patterns, col): string        // gera cláusulas AND NOT LIKE / NOT IN
invalidateCache(): void                      // chamado em add/remove/toggle
seed(): Promise<void>                        // idempotente, chamado no boot
list(): Promise<PatternRow[]>
add(pattern, match_type, description): Promise<PatternRow>
remove(id): Promise<void>
toggle(id, active): Promise<PatternRow>
```

`buildSqlFilter` gera SQL com escape adequado de `%` e `_` para cláusulas LIKE:

```typescript
const esc = pattern.replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_');
```

---

### Melhoria do radar DNS — identidade Windows em `dns-radar-service.ts`

O agente de identidade Windows (`sgcg-identity-checkin`) já estava rodando como serviço em todas as máquinas de todas as VLANs, enviando checkins para `POST /api/identity/checkin`. Os dados ficavam em `data/identity/latest.json` indexados por IP.

**Wiring adicionado em `DnsRadarService.ingestLine()`:**

```typescript
const identityByIp = identityEnrichmentService.loadLatestByIp();
const identity = identityByIp.get(parsed.clientIp) || null;
```

Campos novos no INSERT de `dns_policy_events`:
- `identity_user` — `identity.display_user` (ex: `PREFEITURA\joao.silva`)
- `identity_computer` — `identity.computer` (ex: `PC-FINANCAS-01`)
- `raw_payload.identity` — objeto completo com `user`, `display_user`, `computer`, `agent_id`, `checked_at`

**Filtros novos em `getEvents()`:**

```typescript
if (filters.identity_user) {
    where.push(`LOWER(COALESCE(identity_user, '')) LIKE $${params.length}`);
}
if (filters.identity_computer) {
    where.push(`LOWER(COALESCE(identity_computer, '')) LIKE $${params.length}`);
}
```

**Filtro dinâmico de ruído em `getOverview()` e `getEvents()`:**

Substituído o antigo SQL hardcoded por chamada dinâmica ao serviço:

```typescript
const ignoredPatterns = await dnsIgnoredService.loadActive().catch(() => []);
const noiseFilter = dnsIgnoredService.buildSqlFilter(ignoredPatterns, 'query_name');
```

---

### Novas rotas CRUD — `backend-proxy/src/routes/dns-routes.ts`

Montadas em `/api/dns` (proxy na porta 6779):

```
GET    /api/dns/ignored              → lista todas as políticas
POST   /api/dns/ignored              → adiciona nova política
PATCH  /api/dns/ignored/:id/toggle   → ativa/desativa política
DELETE /api/dns/ignored/:id          → remove política
```

Boot do serviço adicionado em `backend-proxy/src/server.ts`:

```typescript
dnsIgnoredService.seed().catch((error) => {
    console.error('[PROXY API] Falha no seed de domínios ignorados:', error);
});
```

---

### Integração no módulo Hotspot — `backend/src/modules/hotspot/hotspot-routes.ts`

Função auxiliar adicionada para consultar a tabela de políticas diretamente do backend principal (compartilha o mesmo banco):

```typescript
async function loadDnsIgnoreFilter(col: string): Promise<string> {
    const { rows } = await pool.query(
        `SELECT pattern, match_type FROM dns_ignored_domains WHERE active = TRUE`,
    );
    // gera cláusulas AND NOT IN / AND NOT LIKE dinamicamente
}
```

Aplicada em todos os três endpoints Hotspot:
- `GET /metrics` → `noiseFilter = await loadDnsIgnoreFilter('query_name')`
- `POST /access-log/sync` → `noiseFilterDpe = await loadDnsIgnoreFilter('dpe.query_name')`
- `GET /report` → `noiseFilterDpe` na subquery correlacionada de `top_domain`

---

### Frontend — `DnsIgnoredTab` em `BlockingReleases.jsx`

Nova aba **"Domínios Ignorados"** adicionada à seção **"Políticas Institucionais"** com ícone `EyeOff` (lucide-react).

**Funcionalidades:**
- Tabela com todas as políticas (pattern, tipo, descrição, status ativo/inativo)
- Badges coloridos por `match_type`: exact (azul), contains (amarelo), suffix (roxo), prefix (verde)
- Toggle ativo/inativo por linha
- Botão de exclusão por linha
- Formulário inline para adicionar nova política (pattern, tipo, descrição opcional)
- Estado vazio com mensagem orientativa

**Rotas utilizadas:**

```javascript
GET    /api/dns/ignored
POST   /api/dns/ignored
PATCH  /api/dns/ignored/${id}/toggle
DELETE /api/dns/ignored/${id}
```

---

### Correção crítica — JSON.parse: unexpected character

#### Sintoma

Aba "Domínios Ignorados" retornava erro `JSON.parse: unexpected character at line 1 column 1` ao carregar.

#### Causa raiz — arquitetura Nginx

O Nginx roteia requisições para dois backends distintos:

| Padrão | Backend | Porta |
|--------|---------|-------|
| `/api/(proxy\|rules\|cert\|dns)/` | backend-proxy | 6779 |
| `/api/` (demais) | bcc-backend | 6778 |

O `dns-routes.ts` é montado em `/api/dns` no **backend-proxy** (porta 6779).

O componente `DnsIgnoredTab` estava chamando `/api/proxy/dns/ignored` → esse caminho não existe no backend-proxy → Nginx roteava para o bcc-backend → que não conhece a rota → retornava o `index.html` do SPA → JSON.parse falhava ao tentar parsear HTML.

#### Fix

Todos os 4 `authFetch` do componente corrigidos de `/api/proxy/dns/ignored` → `/api/dns/ignored`.

**Módulos afetados:** somente a nova aba "Domínios Ignorados" em `BlockingReleases.jsx`. Nenhum módulo pré-existente foi impactado.

---

### Lição aprendida — rebuild frontend obrigatório

O serviço `bcc-frontend` (PM2) roda em modo `preview`, que serve o **build estático**. Qualquer alteração em arquivos `.jsx` exige rebuild antes de ficar visível:

```bash
cd /opt/controlebeckercorp-v8/frontend && npm run build
pm2 restart bcc-frontend
```

---

### Build e deploy desta sessão

```bash
cd backend && npm run build          # sem erros TypeScript
cd backend-proxy && npm run build    # sem erros TypeScript
cd frontend && npm run build         # módulos compilados com DnsIgnoredTab
pm2 restart bcc-backend backend-proxy bcc-frontend
```

Serviços verificados: `dns_ignored_domains` populada com 5 seeds, aba visível no frontend, rotas CRUD respondendo em `/api/dns/ignored`.

---

## Melhoria do Termo de Uso do Portal Cativo Hotspot — 2026-04-30

- o portal público `/hotspot/portal` da VLAN 70 recebeu tela dedicada de `Termo de Uso da Rede Pública de Visitantes`
- o card resumido de termo passou a abrir o texto institucional completo dentro do próprio portal, com botão destacado `Voltar e se conectar`
- o texto foi redigido em linguagem governamental formal, mas direta para o cidadão, cobrindo:
  - finalidade do Hotspot Institucional
  - identificação pessoal e responsabilidade do usuário
  - proteção de dados pessoais conforme a Lei Federal nº 13.709/2018, Lei Geral de Proteção de Dados Pessoais (LGPD)
  - observância da Lei Federal nº 12.965/2014, Marco Civil da Internet
  - gravação dos dados necessários à segurança, auditoria e rastreabilidade institucional
  - uso permitido, restrições e aceite formal
- logo abaixo da mensagem `Identifique-se para uso da rede pública de visitantes. No primeiro acesso, realize o cadastro institucional.`, foi adicionado aviso com ícone de escudo verde:
  - `Ao se conectar você aceita os termos e concorda com a Lei Geral de Proteção de Dados 13.709/2018 - LGPD.`
- a alteração ficou restrita ao frontend do portal cativo:
  - `frontend/src/pages/HotspotPortal.jsx`
- validação e publicação executadas:
  - `cd frontend && npm run build` — `✓ built in 2.71s`
  - `pm2 restart bcc-frontend` — processo voltou `online`

## Próximo passo recomendado

- validar visualmente o fluxo em um celular conectado à VLAN 70:
  - abertura do portal cativo
  - leitura do termo completo
  - retorno pelo botão `Voltar e se conectar`
  - cadastro ou login após o aceite informativo

## Redirecionamento pós-login do Portal Cativo Hotspot — 2026-04-30

- após autenticação bem-sucedida no portal público `/hotspot/portal`, o usuário passa a ser encaminhado para o site oficial da Prefeitura Municipal de Jacarezinho:
  - `https://www.jacarezinho.pr.gov.br/`
- o backend do hotspot agora devolve `redirect_url` nas respostas autenticadas de:
  - `GET /api/hotspot/public/context` quando o dispositivo já é reconhecido por MAC
  - `POST /api/hotspot/public/register` após cadastro inicial
  - `POST /api/hotspot/public/login` após login por CPF e senha
- o frontend do portal usa o `redirect_url` retornado pelo backend e mantém fallback local para o mesmo endereço oficial
- o redirecionamento ocorre com pequeno atraso operacional para permitir que a sessão seja registrada e que o status de sucesso seja renderizado antes da navegação externa
- arquivos alterados:
  - `backend/src/modules/hotspot/hotspot-routes.ts`
  - `frontend/src/pages/HotspotPortal.jsx`
- validação executada:
  - `cd backend && npm run build` — compilação TypeScript concluída sem erros
  - `cd frontend && npm run build` — `✓ built in 2.90s`
  - `pm2 restart bcc-backend` — processo voltou `online`
  - `pm2 restart bcc-frontend` — processo voltou `online`

## Próximo passo recomendado

- validar em um dispositivo real da VLAN 70:
  - cadastro novo no hotspot
  - login de usuário já cadastrado
  - reconhecimento automático por MAC
  - confirmação de abertura de `https://www.jacarezinho.pr.gov.br/` após autenticação

## Endurecimento do portal cativo Hotspot VLAN 70 — 2026-04-30

- corrigido o fluxo em que dispositivo conhecido por MAC era autorizado automaticamente ao acessar `GET /api/hotspot/public/context`
- o contexto público do Hotspot deixou de criar sessão `mac_auto` e deixou de inserir o IP no `ipset` automaticamente
- dispositivo já cadastrado agora recebe resposta de reconhecimento sem navegação liberada:
  - `authenticated=false`
  - `recognized=true`
  - `requires_confirm=true`
  - mensagem `Bem-vindo de volta`
- criada a rota pública `POST /api/hotspot/public/continue`
  - exige que o MAC esteja novamente identificado pelo gateway
  - revoga sessões ativas correlatas do mesmo dispositivo/IP antes de criar nova sessão
  - cria sessão com método `mac_confirm`
  - só então adiciona o IP ao `ipset` `sgcg_hotspot_v70_auth`
  - mantém redirecionamento posterior para `https://www.jacarezinho.pr.gov.br/`
- o portal `/hotspot/portal` passou a exibir card de retorno para dispositivo reconhecido:
  - `Bem-vindo de volta`
  - nome do visitante
  - botão `Clique aqui para navegar`
- a navegação por MAC deixou de ser silenciosa: mesmo dispositivo conhecido precisa passar pelo portal e confirmar o acesso
- o enforcement complementar foi endurecido:
  - `GET /api/hotspot/public/context` remove o IP atual do `ipset` enquanto o usuário ainda não confirmou
  - o bootstrap do enforcement revoga sessões legadas `mac_auto` ainda ativas
  - IPs presentes no `ipset` sem sessão ativa válida são podados automaticamente
  - sessões `mac_auto` deixaram de ser consideradas autorização válida para permanência no runtime
- estado operacional validado após publicação:
  - `sgcg_hotspot_v70_auth` ficou com `0` IPs autorizados
  - não havia sessões ativas remanescentes em `hotspot_sessions`
  - `GET /api/hotspot/public/context` local retornou `authenticated=false`
  - `POST /api/hotspot/public/continue` local sem MAC retornou erro esperado de dispositivo não identificado
- validação e publicação executadas:
  - `cd backend && npm run build`
  - `cd frontend && npm run build`
  - `pm2 restart bcc-backend`
  - `pm2 restart bcc-frontend`

## Próximo passo recomendado

- testar diretamente em um celular/notebook na rede `MEI-VISITANTES`:
  - revogar sessão no SGCG
  - desconectar e reconectar na rede
  - confirmar que a navegação externa fica bloqueada
  - abrir qualquer página HTTP ou o portal cativo
  - verificar a tela `Bem-vindo de volta`
  - clicar em `Clique aqui para navegar`
  - confirmar que a navegação só libera após esse clique

## Validação e endurecimento final de revogação do Hotspot — 2026-04-30

- revisado novamente o fluxo do botão administrativo `Revogar` em `Hotspot`
- corrigido ponto crítico de normalização de IP:
  - campos PostgreSQL `inet` podem retornar `client_ip::text` como `192.168.70.x/32`
  - o backend agora normaliza IPs removendo sufixo CIDR antes de qualquer ação de `ipset`, VLAN ou `conntrack`
  - consultas de revogação passaram a retornar `host(client_ip)` quando precisam agir no runtime
- o corte imediato foi endurecido:
  - revogação remove o IP do `ipset` `sgcg_hotspot_v70_auth`
  - revogação também executa limpeza complementar de conexões com `conntrack -D -s <ip>` e `conntrack -D -d <ip>`
  - isso impede que conexões já estabelecidas continuem navegando após a remoção do `ipset`
- adicionada allowlist controlada em `backend/src/utils/sys.ts` para:
  - `conntrack -D -s 192.168.70.x`
  - `conntrack -D -d 192.168.70.x`
- sessões expiradas por tempo agora são encerradas automaticamente:
  - rotina `expireExpiredSessions()` marca sessões `active` vencidas como `expired`
  - preenche `revoked_at`
  - remove IPs do `ipset`
  - limpa conexões via `conntrack`
  - poda IPs autorizados sem sessão ativa válida
- o backend passou a executar varredura automática de expiração do Hotspot a cada `60` segundos
- a resposta do endpoint de revogação deixou de informar `mac_auto_preserved=true`
  - agora retorna `mac_auto_preserved=false`
  - retorna também `confirmation_required=true`, alinhado ao novo fluxo em que MAC conhecido precisa confirmar no portal
- validação operacional executada:
  - criada sessão expirada artificial para `192.168.70.250`
  - IP foi inserido temporariamente no `sgcg_hotspot_v70_auth`
  - restart/reconciliação do backend marcou a sessão como `expired`
  - IP `192.168.70.250` foi removido do `ipset`
  - criada sessão ativa artificial para `192.168.70.250`
  - chamada real ao endpoint `POST /api/hotspot/sessions/9/revoke` retornou `success=true` e `runtime_revoked=true`
  - banco confirmou sessão `9` como `revoked`
  - `ipset list sgcg_hotspot_v70_auth` confirmou ausência do IP de teste
- estado runtime observado após validação:
  - permaneceu apenas `192.168.70.46` no `ipset`
  - esse IP possui sessão real `mac_confirm` ativa e ainda não expirada, portanto foi preservado corretamente
- validação e publicação:
  - `cd backend && npm run build`
  - `pm2 restart bcc-backend`
  - `GET /api/ping` retornou `Pong HTTP (Core 6778)`

## Próximo passo recomendado

- repetir no dispositivo real conectado à rede `MEI-VISITANTES`:
  - clicar `Revogar` no SGCG
  - confirmar que o IP desaparece imediatamente de `sgcg_hotspot_v70_auth`
  - confirmar que navegação externa cai na hora
  - abrir o portal e verificar que a liberação só volta após `Clique aqui para navegar`

## Atualizacao documental e preparacao de versionamento Git — 2026-04-30

- realizada nova leitura consolidada do projeto antes de publicar no Git:
  - estrutura raiz
  - frontend React/Vite
  - backend core TypeScript
  - backend-proxy TypeScript
  - scripts operacionais
  - agente de identidade Windows
  - documentacao complementar em `docs/`
- `README.md` foi atualizado para refletir o estado atual do SGCG:
  - arquitetura principal
  - eixos `Governanca` e `Controle`
  - modulos atuais
  - estado operacional recente
  - regras criticas de UFW, Hotspot, DNS, frontend estatico e dados sensiveis
  - comandos de build e publicacao operacional
- `.gitignore` foi reforcado para impedir publicacao acidental de:
  - `.codex-checkpoints/`
  - `data/identity/`, que contem check-ins reais de endpoints e nao deve ir para o repositorio remoto
- endurecimento pre-versionamento aplicado no agente de identidade:
  - removidos tokens hardcoded do backend `identity-routes`
  - removido token default do servidor standalone `scripts/sgcg-identity-checkin-server.js`
  - instaladores online do agente Windows passaram a exigir tokens informados por parametro ou prompt interativo
  - README do agente substituiu valores reais por placeholders administrativos
- decisao de versionamento:
  - codigo, scripts, documentacao e templates do agente de identidade devem ser incluidos no Git
  - dados coletados de runtime, checkpoints locais, certificados, chaves, backups, dumps e builds gerados permanecem fora do Git
- validacao executada antes do versionamento:
  - `cd backend && npm run build` — compilacao TypeScript concluida sem erros
  - `cd backend-proxy && npm run build` — compilacao TypeScript concluida sem erros
  - `cd frontend && npm run build` — `✓ built in 2.76s`
  - `cd backend && npm run build` — revalidado sem erros apos remover token hardcoded do modulo de identidade

## 2026-04-30 — Sanitização DoH/DoT/QUIC em todas as VLANs gerenciadas

### Diagnóstico

- IP `192.168.50.14` (VLAN 50 — SINE) navegava livremente em Instagram, Facebook e TikTok apesar da política de bloqueio de redes sociais ativa
- Causa raiz: o Unbound com RPZ retornava `NXDOMAIN` para DNS porta 53 corretamente, mas os apps usavam **DoH (DNS over HTTPS)** via porta 443/tcp para resolvedores externos como `1.1.1.1` e `8.8.8.8`, contornando o RPZ por completo
- Agravante: o `engine_mode.json` estava em `"off"`, sem intercepção Squid ativa
- VLANs 30, 50, 70 não tinham bloqueio de QUIC (UDP/443) nem de DoH (TCP/443 por servidor)
- VLAN 10 tinha bloqueio de DoT e QUIC, mas bloqueava incorretamente o OpenDNS (que deve ser livre)

### Política de resolvedores externos (regra institucional)

Resolvedores DNS externos só são permitidos em três casos:
1. O IP do usuário está registrado como **VIP** (`policy_exceptions` + `dns_vip`)
2. O sistema está em **modo de contingência DNS** ativo (`dns_contingency_state.status = 'active'`)
3. A VLAN está com **bypass total** ativo (`total_vlan_blocks` / `emergency_vlan_bypass`)

### Exceção permanente — OpenDNS (Ponto RH)

Os IPs `208.67.222.222` e `208.67.220.220` (OpenDNS) **devem permanecer livres** em todas as VLANs gerenciadas, em todas as portas (53, 443, 853).

**Motivo técnico:** o app **Ponto RH** (ponto eletrônico institucional) tem esses dois IPs hardcoded como resolvedores internos do app. Bloquear esses endereços impede o funcionamento do registro de ponto dos servidores.

Esta exceção não pode ser removida sem substituição do app de ponto ou reconfiguração do fornecedor.

### Alterações aplicadas em 2026-04-30

- Removidos os bloqueios incorretos de OpenDNS (208.67.x.x) na VLAN 10 (eram equivocados)
- Adicionadas regras `ALLOW FWD` para todos os IPs VIP (`policy_exceptions` + `dns_vip`) nas portas 443/tcp, 443/udp, 853/tcp antes das regras de bloqueio
- Adicionadas regras `DENY FWD` para VLANs 30, 50, 70:
  - DoT: `TCP/853` via `enp8s0`
  - QUIC: `UDP/443` via `enp8s0`
  - DoH por servidor: `TCP/443` para Cloudflare (1.1.1.1, 1.0.0.1), Google (8.8.8.8, 8.8.4.4), Quad9 (9.9.9.9, 149.112.112.112), AdGuard (94.140.14.14, 94.140.15.15)
- Adicionados os mesmos bloqueios de DoH por servidor para VLAN 10 (que já tinha DoT/QUIC)
- Script de aplicação e reaplicação: `scripts/sanitize_doh_vlans.py`
- Backup do estado anterior: `backups/firewall/before_sanitize_doh_2026-04-30T13-23-09.rules`

### Camadas de bloqueio ativas pós-aplicação (por VLAN gerenciada)

| Camada | VLAN 10 | VLAN 30 | VLAN 50 | VLAN 70 |
|--------|---------|---------|---------|---------|
| DNS porta 53 → Unbound (iptables REDIRECT) | ✅ | ✅ | ✅ | ✅ |
| RPZ por VLAN (Unbound) | ✅ | ✅ | ✅ | ✅ |
| DoT bloqueado (TCP/853) | ✅ | ✅ | ✅ | ✅ |
| QUIC bloqueado (UDP/443) | ✅ | ✅ | ✅ | ✅ |
| DoH Cloudflare bloqueado | ✅ | ✅ | ✅ | ✅ |
| DoH Google bloqueado | ✅ | ✅ | ✅ | ✅ |
| DoH Quad9 bloqueado | ✅ | ✅ | ✅ | ✅ |
| DoH AdGuard bloqueado | ✅ | ✅ | ✅ | ✅ |
| OpenDNS (208.67.x.x) livre | ✅ | ✅ | ✅ | ✅ |
| VIPs com bypass de DoH/DoT/QUIC | ✅ (7 IPs) | — | — | — |

### Nota sobre engine mode

O `engine_mode.json` permanece em `"off"`. O bloqueio das redes sociais agora funciona pelas camadas DNS + IP. Para intercepção de HTTPS (SSL bump via Squid), o engine precisaria estar em `test-http+https`.

## 2026-04-30 — Bloqueio por range de IP (Layer 3) para redes sociais

### Problema adicional descoberto

Mesmo com DNS RPZ, DoH/DoT/QUIC bloqueados, os apps do Instagram, Facebook e TikTok continuavam funcionando. Diagnóstico via `conntrack -L`:

- O celular `192.168.50.14` mantinha **conexões HTTPS persistentes com TTL de ~5 dias** diretamente com:
  - Facebook/Meta (AS32934): `157.240.x.x`, `57.144.x.x`, `31.13.x.x`
  - TikTok/ByteDance (AS396986, AS138699): `71.18.x.x`
- Os apps armazenam IPs em cache e reconectam **sem precisar de DNS**
- O DNS bloqueado impede novas resoluções, mas não afeta conexões existentes ou IPs hardcoded

### Solução aplicada — ipset + iptables FORWARD DROP

Criado ipset `sgcg_social_blocked` com os ranges conhecidos:

| Range | AS | Serviço |
|-------|-----|---------|
| `157.240.0.0/16` | AS32934 | Meta principal |
| `31.13.64.0/18` | AS32934 | Meta Ireland |
| `57.144.0.0/14` | AS32934 | Meta CDN |
| `179.60.192.0/22` | AS32934 | Meta Brasil |
| `185.89.216.0/22` | AS32934 | Meta infra |
| `163.70.128.0/17` | AS32934 | Meta |
| `129.134.0.0/17` | AS32934 | Meta |
| `71.18.0.0/16` | AS396986/AS138699 | TikTok/ByteDance (range completo, confirmado via conntrack) |

Regras iptables FORWARD DROP adicionadas para VLANs 10, 30, 50, 70 → ipset.
VIPs recebem ACCEPT **antes** dos DROP (ordem: VIP ACCEPT posições 1-N, DROP a seguir).

### Flush de conntrack

70 sessões ativas derrubadas em todas as VLANs gerenciadas na aplicação inicial.
Sessões do celular `192.168.50.14` zeradas por flush direto via `conntrack -D -s`.

### Persistência

- ipset salvo em `/etc/ipset.conf`
- Serviço `sgcg-ipset-restore.service` habilitado via systemd (restaura o ipset no boot, antes do UFW)
- Script de reaplicação: `scripts/block_social_media_ips.py`

### Exceção obrigatória — WhatsApp

O WhatsApp (Meta) compartilha os mesmos ranges de IP com Facebook e Instagram (AS32934). Não é possível bloquear Facebook/Instagram por range de IP sem impactar o WhatsApp. A solução é um ipset separado `sgcg_whatsapp_allowed` com os IPs específicos dos domínios do WhatsApp, com ACCEPT na posição 1 do FORWARD antes de qualquer DROP.

**Os IPs do WhatsApp mudam** conforme o load balancing da Meta. O script `scripts/update_whatsapp_allowlist.py` roda via cron a cada 6h para manter o allowlist atualizado (resolve os domínios e atualiza o ipset). Log em `/var/log/sgcg_whatsapp_allowlist.log`.

### Camadas de bloqueio completas pós 2026-04-30

```
App Android tenta acessar Instagram/TikTok/Facebook:

1. DNS (porta 53)     → Unbound RPZ → NXDOMAIN                        ✅ bloqueado
2. DoH (443/tcp)      → Cloudflare/Google/Quad9/AdGuard → DROP (UFW)  ✅ bloqueado
3. DoT (853/tcp)      → qualquer servidor → DROP (UFW)                 ✅ bloqueado
4. QUIC (443/udp)     → qualquer servidor → DROP (UFW)                 ✅ bloqueado
5. IP cache/hardcoded → ranges Meta/TikTok → DROP (ipset sgcg_social_blocked) ✅ bloqueado

WhatsApp é tratado separadamente:
  DNS (porta 53)      → Unbound → resposta real (não está no RPZ)      ✅ permitido
  IP do WhatsApp      → ipset sgcg_whatsapp_allowed → ACCEPT (posição 1) ✅ permitido

OpenDNS (208.67.x)    → LIVRE em todas as VLANs (Ponto RH)            ✅ permitido
VIPs                  → ACCEPT antes de qualquer DROP                  ✅ bypass ativo
```

### Ordem das regras no iptables FORWARD (camada de redes sociais)

```
[1]  ACCEPT  → match-set sgcg_whatsapp_allowed dst   # WhatsApp primeiro, sempre
[2-N] ACCEPT → VIP SOCIAL ALLOW <ip>                 # VIPs de cada VLAN
[N+1..N+4] DROP → match-set sgcg_social_blocked dst  # VLAN 70, 50, 30, 10
```

## Proximo passo recomendado

- concluir commit e push para o remoto `origin/main`
- apos o push, revisar no GitHub se o README renderiza corretamente e se nenhum dado operacional sensivel foi publicado

## 2026-04-30 — Correção emergencial WhatsApp / WhatsApp Web / chamadas de voz

### Diagnóstico

- O WhatsApp estava liberado corretamente na camada de DNS/RPZ e nas ACLs globais (`whatsapp.net`, `whatsapp.com`, `web.whatsapp.com`, `wa.me`, `static.whatsapp.net`).
- A falha estava na camada nova de bloqueio por IP:
  - `sgcg_social_blocked` bloqueia ranges compartilhados da Meta (`57.144.0.0/14`, `157.240.0.0/16`, `31.13.64.0/18`, etc.).
  - `sgcg_whatsapp_allowed` existia antes dos DROPs, mas era alimentado por uma lista curta de domínios.
  - Chamadas de voz e mídia usam domínios adicionais de CDN, nós regionais e portas próprias de sinalização/STUN/TURN que não estavam cobertos.
- O radar DNS confirmou tráfego real recente para domínios como:
  - `dit.whatsapp.net`
  - `chat.cdn.whatsapp.net`
  - `mmg.whatsapp.net`
  - `webtp.whatsapp.net`
  - `media-*.cdn.whatsapp.net`
  - `*.fna.whatsapp.net`
  - `*.snr.whatsapp.net`
- Resultado operacional: texto e web podiam funcionar parcialmente, mas voz/mídia eram derrubadas quando caíam em IPs Meta fora da allowlist.

### Correção aplicada

- `scripts/update_whatsapp_allowlist.py` foi ampliado para:
  - resolver uma lista institucional mais completa de domínios WhatsApp;
  - consultar `dns_policy_events` dos últimos 7 dias e incluir domínios reais observados no radar;
  - adicionar ao `sgcg_whatsapp_allowed` apenas IPs que também pertencem ao `sgcg_social_blocked`;
  - manter IPs anteriores por padrão para evitar quebra por rotação/CDN;
  - aceitar limpeza agressiva apenas com `PRUNE_WHATSAPP_ALLOWLIST=1`;
  - garantir regra `SGCG WHATSAPP ALLOW` sem duplicar;
  - inserir antes dos DROPs sociais regras específicas para chamadas:
    - TCP `4244,5222,5223,5228,5242,50318,59234`
    - UDP `3478,34784,45395,50318,59234`
- `scripts/block_social_media_ips.py` foi alinhado para preservar as exceções do WhatsApp e as portas de chamada quando o bloqueio social for reaplicado.

### Aplicação operacional

- `python3 /opt/controlebeckercorp-v8/scripts/update_whatsapp_allowlist.py` executado com sucesso.
- Foram adicionados 16 IPs atuais de WhatsApp/mídia ao `sgcg_whatsapp_allowed`, incluindo IPs em ranges Meta antes bloqueados.
- Regra duplicada de `SGCG WHATSAPP ALLOW` foi removida do `FORWARD`.
- Ordem final validada no `iptables FORWARD`:
  - `SGCG WHATSAPP ALLOW`
  - `SGCG WHATSAPP CALL UDP ALLOW`
  - `SGCG WHATSAPP CALL TCP ALLOW`
  - `VIP SOCIAL ALLOW`
  - `SGCG SOCIAL BLOCK VLAN70/50/30/10`
- `/etc/ipset.conf` validado com `sgcg_whatsapp_allowed` persistido.
- `python3 -m py_compile scripts/update_whatsapp_allowlist.py scripts/block_social_media_ips.py` concluído sem erros.

### Estado atual

- WhatsApp, WhatsApp Web, mídia e chamadas de voz passam a ter exceção explícita antes do bloqueio por range social.
- O bloqueio de Facebook/Instagram/TikTok por DNS, DoH/DoT/QUIC e ranges sociais permanece ativo.
- A cron existente a cada 6 horas continua atualizando a allowlist dinâmica do WhatsApp.

### Próximo passo recomendado

- Testar em um cliente real de cada VLAN gerenciada:
  - abrir WhatsApp Web;
  - enviar/receber mídia;
  - realizar ligação de voz;
  - realizar chamada de vídeo;
  - confirmar que Instagram/Facebook/TikTok continuam bloqueados fora de VIP ou exceção formal.

## 2026-04-30 — Roadmap futuro: Catálogo de Serviços e Policy Engine

- ideia estratégica documentada em `docs/ROADMAP_CATALOGO_SERVICOS_POLICY_ENGINE_2026-04-30.md`
- objetivo: evoluir o SGCG para uma camada declarativa de serviços digitais, com diagnóstico e simulação antes de aplicar mudanças em DNS, proxy, firewall, ipset, QoS e auditoria
- decisão da rodada: não implementar agora, pois não haverá janela de validação nos próximos dias
- abordagem recomendada de menor impacto:
  - começar por catálogo somente-leitura
  - criar diagnóstico de conflito entre política institucional e runtime
  - simular políticas antes de aplicar
  - limitar o primeiro escopo a WhatsApp, redes sociais e Ponto RH/OpenDNS
  - preservar UFW como firewall oficial e manter iptables/ipset como camada complementar documentada

## 2026-05-02 — Acesso Mobile de Colaboradores VLAN 30

- criado o modulo administrativo `Acesso Mobile de Colaboradores` no SGCG, acessivel em `/colaboradores-mobile`
- objetivo operacional:
  - exigir usuario e senha para liberar navegacao de dispositivos conectados na VLAN 30
  - atender mobiles de colaboradores sem implantar Active Directory
  - manter separacao conceitual do Hotspot de visitantes da VLAN 70
- backend criado/ativado:
  - `backend/src/modules/collaborators/collaborators-routes.ts`
  - tabelas `collab_users` e `collab_sessions`
  - senhas locais com `Argon2`
  - rotas publicas:
    - `GET /api/collaborators/public/context`
    - `POST /api/collaborators/public/login`
  - rotas administrativas com JWT:
    - `GET /api/collaborators/overview`
    - `GET /api/collaborators/users`
    - `POST /api/collaborators/users`
    - `PUT /api/collaborators/users/:id`
    - `DELETE /api/collaborators/users/:id`
    - `GET /api/collaborators/sessions`
    - `POST /api/collaborators/sessions/:id/revoke`
    - `GET /api/collaborators/enforcement/status`
    - `POST /api/collaborators/enforcement/setup`
- portal publico criado:
  - rota frontend `/collab/portal`
  - pagina `frontend/src/pages/CollaboratorPortal.jsx`
  - login simples por usuario/senha institucional local
  - retorno informativo quando o cliente nao estiver na VLAN 30
- administracao frontend criada:
  - pagina `frontend/src/pages/Collaborators.jsx`
  - cadastro, edicao e desativacao de usuarios
  - leitura de sessoes ativas
  - revogacao de sessao com corte runtime do IP
  - botao `Aplicar Portal` para gerar vhost Nginx e reconciliar enforcement
  - toggle `Exigir login` para alternar o modo operacional da VLAN 30
- modos operacionais da VLAN 30:
  - `Login obrigatório`: clientes nao autenticados sao direcionados ao portal `/collab/portal` e ficam sem saida WAN ate login valido
  - `Somente DNS/ACL`: o portal deixa de capturar o colaborador, as regras complementares de autenticacao sao removidas e a navegacao segue sujeita apenas as restricoes institucionais de DNS/RPZ/ACL/firewall
- persistencia do modo:
  - criada tabela `collab_settings`
  - chave `access_mode` armazena `auth_required`
  - rota administrativa `PUT /api/collaborators/settings/access-mode`
- enforcement complementar:
  - `ipset` `sgcg_collab_v30_auth` com timeout de 8 horas
  - `iptables -t nat PREROUTING` redireciona HTTP de nao autenticados da `enp6s0.30` para `192.168.30.1:80`
  - `iptables FORWARD` rejeita saida WAN de nao autenticados na VLAN 30
  - login adiciona o IP autenticado ao `ipset`
  - revogacao/expiracao remove o IP do `ipset` e limpa conexoes via `conntrack`
  - ao desligar o toggle, o backend remove as regras complementares de DNAT e REJECT da VLAN 30
- integracao no backend core:
  - `backend/src/server.ts` passou a registrar `/api/collaborators`
  - schema e enforcement da VLAN 30 sao reconciliados no boot
  - sessoes vencidas sao expiradas automaticamente a cada 60 segundos
  - `backend/src/middleware/auth.ts` liberou apenas `/api/collaborators/public/*` sem JWT
  - `backend/src/utils/sys.ts` recebeu allowlist restrita para comandos `ipset`, `iptables` e `conntrack` da VLAN 30
- integracao no frontend:
  - `frontend/src/App.jsx` registra `/collab/portal` como rota publica e `/colaboradores-mobile` como rota administrativa
  - `frontend/src/components/Sidebar.jsx` adiciona o item `Acesso Mobile`
  - `frontend/src/services/api.js` trata `/api/collaborators/public/*` como rota publica, sem refresh/token administrativo
- regra institucional preservada:
  - UFW permanece firewall oficial
  - `ipset`/`iptables` sao usados apenas como camada complementar de runtime para autenticacao da VLAN 30
  - DNS/RPZ/ACL/DoH/DoT/QUIC e demais politicas institucionais seguem aplicaveis apos o login
- validacao executada:
  - `cd backend && npm run build` concluido sem erros
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend`
  - `pm2 restart bcc-frontend`
  - vhost `/etc/nginx/sites-available/sgcg-collab-captive` habilitado em `/etc/nginx/sites-enabled/sgcg-collab-captive`
  - `nginx -t` validou sintaxe com sucesso e `systemctl reload nginx` foi executado
  - `GET /api/collaborators/public/context` retornou `auth_required=true` sem exigir JWT
  - `/colaboradores-mobile` retornou `200` pelo frontend de producao

### Proximo passo recomendado

- reiniciar os processos afetados em producao:
  - `pm2 restart bcc-backend`
  - `pm2 restart bcc-frontend`
- acessar `/colaboradores-mobile`, criar ao menos uma conta de colaborador e clicar em `Aplicar Portal`
- testar em um celular conectado a VLAN 30:
  - abrir uma pagina HTTP ou `http://192.168.30.1/collab/portal`
  - autenticar com usuario e senha criados no SGCG
  - confirmar navegacao liberada apos login
  - revogar a sessao no modulo e confirmar corte imediato de navegacao externa

## 2026-05-02 — Ajuste de retorno por MAC no Hotspot VLAN 70

- mantido o reconhecimento automatico de dispositivo conhecido por MAC na VLAN 70
- o fluxo permanece sem liberacao silenciosa:
  - `GET /api/hotspot/public/context` identifica MAC conhecido e retorna `recognized=true` e `requires_confirm=true`
  - o IP ainda e removido do `ipset` enquanto o visitante nao confirma
  - a navegacao so e liberada apos `POST /api/hotspot/public/continue`
- ajuste de experiencia no portal `/hotspot/portal`:
  - titulo para dispositivo reconhecido passou a exibir `Bem-vindo, <nome>`
  - botao de confirmacao passou de `Clique aqui para navegar` para `Entrar na Internet`
  - mensagem do backend passou a orientar o clique em `Entrar na Internet`
- arquivos alterados:
  - `backend/src/modules/hotspot/hotspot-routes.ts`
  - `frontend/src/pages/HotspotPortal.jsx`
- validacao executada:
  - `cd backend && npm run build` concluido sem erros
  - `cd frontend && npm run build` concluido com sucesso

## 2026-05-02 — Métricas, Auditoria e Relatório do Acesso Mobile VLAN 30

- o modulo `Acesso Mobile de Colaboradores` foi alinhado ao padrao operacional do Hotspot da VLAN 70
- backend ampliado em `backend/src/modules/collaborators/collaborators-routes.ts`:
  - criada tabela imutavel `collab_access_log` para registrar sessoes sincronizadas da VLAN 30
  - adicionados indices por data, usuario e VLAN
  - aplicado `REVOKE ALL FROM PUBLIC` na tabela de log
  - novo endpoint `GET /api/collaborators/metrics`
  - novo endpoint `POST /api/collaborators/access-log/sync`
  - novo endpoint `GET /api/collaborators/report`
- metricas implementadas para a VLAN 30:
  - sessoes do mes
  - usuarios unicos
  - dias com acesso
  - ranking de colaboradores
  - distribuicao horaria
  - distribuicao por VLAN
  - sites mais visitados usando `dns_policy_events`
  - filtro dinamico de ruido usando `dns_ignored_domains`, no mesmo padrao do Hotspot
- relatorio institucional implementado:
  - filtros por periodo, colaborador e VLAN
  - sincronizacao manual para o log imutavel
  - consulta paginada para tela
  - impressao/salvamento em PDF via frontend com layout governamental A4 paisagem
  - cabecalho com Prefeitura Municipal de Jacarezinho, Estado do Parana e Secretaria do Comercio, Industria, Servicos e Inovacao
  - rodape institucional SGCG com identificador `SGCG-CM-*`
- frontend `frontend/src/pages/Collaborators.jsx` foi refeito para operar em tres abas:
  - `Visao Geral`
  - `Metricas`
  - `Relatorio`
- a aba `Metricas` replica o padrao visual do Hotspot:
  - cards executivos
  - graficos CSS de usuarios por dia e acessos por hora
  - ranking de colaboradores
  - metodos de autenticacao
  - sites mais visitados da VLAN 30
- a aba `Relatorio` replica e adapta o PDF do Hotspot para `Relatorio Oficial do Acesso Mobile de Colaboradores`
- regra institucional preservada:
  - UFW permanece firewall oficial
  - `ipset`/`iptables` continuam apenas como camada complementar de runtime da autenticacao VLAN 30
  - DNS/RPZ/ACL/DoH/DoT/QUIC permanecem aplicaveis apos o login
- validacao executada:
  - `cd backend && npm run build` concluido sem erros
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend bcc-frontend --update-env` executado; ambos voltaram `online`
  - `GET /api/collaborators/metrics` sem JWT retornou `401`, comportamento esperado
  - `GET /api/collaborators/report` sem JWT retornou `401`, comportamento esperado
  - `GET https://127.0.0.1:6777/colaboradores-mobile` retornou `200 text/html`

## Proximo passo recomendado

- acessar `/colaboradores-mobile` com usuario administrativo e validar:
  - aba `Metricas`
  - aba `Relatorio`
  - `Sincronizar Log`
  - `Imprimir / Salvar PDF`
- testar em dispositivo real da VLAN 30 com login obrigatorio ativo para confirmar que novas sessoes aparecem no ranking, no relatorio e nos dominios mais acessados

## 2026-05-02 — Validador de Relatórios de Auditoria VLAN 70 e VLAN 30

- criado validador institucional para os relatórios de auditoria do Hotspot e do Acesso Mobile
- decisão de posicionamento:
  - o validador fica na aba `Relatorio` de cada modulo
  - motivo: e o ponto natural do fluxo de auditoria, antes de emitir ou salvar o PDF
  - sequencia operacional recomendada: `Sincronizar Log` -> `Validar Relatorio` -> `Imprimir / Salvar PDF`
- backend Hotspot VLAN 70:
  - novo endpoint `GET /api/hotspot/report/validate`
  - valida o mesmo escopo de filtros do relatório: periodo, visitante e VLAN
  - verifica:
    - sessoes fora do log imutavel `hotspot_access_log`
    - duplicidade de sessao no log imutavel
    - sessao sem visitante/CPF integro
    - sessao sem IP de origem
    - duracao incoerente
    - duracao divergente entre sessao e log
    - DNS disponivel sem `top_domain` consolidado
- backend Acesso Mobile VLAN 30:
  - novo endpoint `GET /api/collaborators/report/validate`
  - valida o mesmo escopo de filtros do relatório: periodo, colaborador e VLAN
  - verifica:
    - sessoes fora do log imutavel `collab_access_log`
    - duplicidade de sessao no log imutavel
    - sessao sem colaborador/usuario integro
    - sessao sem IP de origem
    - duracao incoerente
    - duracao divergente entre sessao e log
    - DNS disponivel sem `top_domain` consolidado
- resposta dos validadores:
  - `valid`
  - `status`: `valid`, `warning` ou `invalid`
  - resumo de sessoes, registros logados, usuarios/visitantes unicos, criticos e avisos
  - lista de checks com severidade e amostras
  - recomendacao operacional para emissao auditavel
- frontend:
  - botao `Validar Relatório` adicionado na aba `Relatorio` do Hotspot
  - botao `Validar Relatório` adicionado na aba `Relatorio` do Acesso Mobile
  - painel de resultado exibe estado `Consistente`, `Com avisos` ou `Inconsistente`
  - resumo visual mostra total de sessoes, inconsistencias criticas e avisos
  - cada check aparece como item individual com contagem e severidade
- regra institucional preservada:
  - os validadores apenas leem banco e nao alteram enforcement, UFW, iptables, ipset ou sessoes
  - a sincronizacao do log permanece uma acao explicita separada
- validacao executada:
  - `cd backend && npm run build` concluido sem erros
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend bcc-frontend --update-env` executado; ambos voltaram `online`
  - `GET /api/hotspot/report/validate` sem JWT retornou `401`, comportamento esperado
  - `GET /api/collaborators/report/validate` sem JWT retornou `401`, comportamento esperado

## Proximo passo recomendado

- acessar as abas de relatorio dos dois modulos com usuario administrativo e executar:
  - `Sincronizar Log`
  - `Validar Relatorio`
  - revisar criticos/avisos
  - emitir PDF apenas apos estado consistente ou apos aceitar formalmente os avisos

## 2026-05-02 — Brasão de Jacarezinho nos Relatórios PDF

- os relatórios PDF gerados pelo frontend passaram a usar o brasão local de Jacarezinho no lugar do logotipo remoto anterior
- arquivo de origem informado:
  - `/opt/controlebeckercorp-v8/public/LOGO-JACAREZINHO.png`
- para o Vite servir o ativo no bundle de produção, o brasão foi disponibilizado também em:
  - `frontend/public/LOGO-JACAREZINHO.png`
- relatórios ajustados:
  - `Relatório Oficial do Hotspot Institucional`
  - `Relatório Oficial do Acesso Mobile de Colaboradores`
- redimensionamento aplicado no template de impressão:
  - área do logotipo: `58x64`
  - imagem renderizada: `54x60`
  - `object-fit: contain` para preservar proporção do brasão
- arquivos alterados:
  - `frontend/src/pages/Hotspot.jsx`
  - `frontend/src/pages/Collaborators.jsx`
  - `frontend/public/LOGO-JACAREZINHO.png`
- validação executada:
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-frontend --update-env` executado; processo voltou `online`
  - `GET https://127.0.0.1:6777/LOGO-JACAREZINHO.png` retornou `200 image/png`

## Observação sobre solicitação de usuário e senha — VLAN 30

- o portal publico `/collab/portal` solicita apenas:
  - `Usuário`
  - `Senha`
- o texto exibido orienta: `Informe seu usuário e senha institucional para liberar a navegação deste dispositivo.`
- o botão principal exibe: `Entrar e liberar navegação`
- apos login válido, o backend libera o IP atual no `ipset` da VLAN 30 e redireciona o usuário para `https://www.jacarezinho.pr.gov.br/`
- se o dispositivo não estiver na VLAN 30, o portal informa que a liberação é permitida apenas pela rede interna VLAN 30 e desabilita a ação

## 2026-05-02 — Refinamento visual do Portal Mobile de Colaboradores

- o portal publico `/collab/portal` foi refinado visualmente em React + Vite + Tailwind
- aplicado o brasao de Jacarezinho no cabecalho do portal:
  - imagem: `/LOGO-JACAREZINHO.png`
  - renderizacao responsiva com `object-contain`
- identidade institucional atualizada:
  - `Prefeitura Municipal de Jacarezinho`
  - `Secretaria Municipal de Comércio, Indústria, Serviços e Inovação`
  - `Acesso Mobile de Colaboradores`
  - `Autenticação institucional da VLAN 30`
- formulario publico mantido simples:
  - `Usuário institucional`
  - `Senha`
  - botao `Entrar e liberar navegação`
- leitura operacional adicionada ao card:
  - rede `VLAN 30`
  - sessao de `8 horas`
- rodape reforcado para segurança, auditoria e responsabilizacao institucional
- arquivo alterado:
  - `frontend/src/pages/CollaboratorPortal.jsx`
- validacao executada:
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-frontend --update-env` executado; processo voltou `online`
  - bundle de producao contem `LOGO-JACAREZINHO.png`, `Prefeitura Municipal de Jacarezinho` e `Secretaria Municipal de Comércio, Indústria, Serviços e Inovação`

## 2026-05-02 — Auto Cadastro e Confirmação Explícita na VLAN 30 e Hotspot

- o portal publico `/collab/portal` foi ampliado para fluxo semelhante ao Hotspot, com auto cadastro e reconhecimento por MAC
- novo fluxo publico da VLAN 30:
  - `GET /api/collaborators/public/context`
  - `POST /api/collaborators/public/register`
  - `POST /api/collaborators/public/login`
  - `POST /api/collaborators/public/continue`
- auto cadastro de colaborador criado com:
  - nome completo
  - CPF
  - setor
  - usuario
  - senha
- backend da VLAN 30 ampliado:
  - `collab_users` recebeu coluna `cpf`
  - criada tabela `collab_devices` para vinculo entre usuario e MAC
  - `collab_sessions` recebeu `device_id` e `auth_method`
  - login/cadastro associam o MAC ao colaborador quando o gateway consegue identificar o dispositivo
- retorno por MAC na VLAN 30:
  - se o MAC existir em `collab_devices`, o portal exibe `Bem-vindo, <nome do colaborador>`
  - a navegacao nao e liberada automaticamente
  - o botao `Entrar na Internet` chama `POST /api/collaborators/public/continue`
  - somente apos essa confirmacao o IP entra no `ipset` `sgcg_collab_v30_auth`
- bloqueio antes de autenticacao reforcado:
  - `GET /api/collaborators/public/context` remove o IP atual do `ipset`
  - antes de cadastro, login ou confirmacao por MAC, a VLAN 30 permanece sem saida WAN para o IP nao autenticado
  - isso inclui WhatsApp, portais governamentais e qualquer outro destino externo
- portal `/collab/portal` recebeu aviso LGPD:
  - aceite de tratamento de dados conforme Lei Geral de Proteção de Dados nº 13.709/2018
  - termo com dados tratados, finalidade, bloqueio antes da autenticacao e responsabilizacao institucional
- Hotspot VLAN 70 tambem foi reforcado visualmente:
  - cabecalho com brasao de Jacarezinho
  - `Prefeitura Municipal de Jacarezinho`
  - `Secretaria Municipal de Comércio, Indústria, Serviços e Inovação`
  - mensagem explicita de que sem cadastro, login ou confirmacao do dispositivo reconhecido a navegacao externa permanece bloqueada
- regra institucional preservada:
  - UFW permanece firewall oficial
  - `ipset`/`iptables` seguem apenas como camada complementar de runtime dos portais cativos
  - DNS/RPZ/ACL/DoH/DoT/QUIC continuam aplicaveis apos a autenticacao
- validacao executada:
  - `cd backend && npm run build` concluido sem erros
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend bcc-frontend --update-env` executado; ambos voltaram `online`
  - `GET /api/collaborators/public/context` retornou `200 application/json`
  - `GET /api/hotspot/public/context` retornou `200 application/json`
  - `GET /collab/portal` retornou `200 text/html`
  - `GET /hotspot/portal` retornou `200 text/html`

## Proximo passo recomendado

- em dispositivo real da VLAN 30:
  - confirmar que antes do cadastro/login nao abre WhatsApp, gov.br ou qualquer destino externo
  - realizar auto cadastro
  - confirmar redirecionamento apos liberacao
  - desconectar/reconectar e verificar tela `Bem-vindo, <nome>` com botao `Entrar na Internet`
- em dispositivo real da VLAN 70:
  - repetir a validacao de que MAC reconhecido nao libera silenciosamente
  - confirmar que somente `Entrar na Internet`, cadastro ou login devolve navegacao

## 2026-05-02 — Texto Oficial Validado nos PDFs de Auditoria

- relatórios PDF ajustados em:
  - Hotspot VLAN 70
  - Mobile Colaboradores VLAN 30
- rodape dos PDFs alterado de `Documento oficial sujeito à verificação.` para `Relatório oficial validado.`
- nome institucional corrigido em ambos os relatórios para:
  - `Secretaria Municipal de Comércio, Indústria, Serviços e Inovação`
- arquivos alterados:
  - `frontend/src/pages/Hotspot.jsx`
  - `frontend/src/pages/Collaborators.jsx`
- validacao executada:
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-frontend --update-env` executado; processo voltou `online`
  - bundle de producao contem `Relatório oficial validado.` e `Secretaria Municipal de Comércio, Indústria, Serviços e Inovação`

## 2026-05-02 — Recuperação do Token do Agente Windows por Hash

- identificado que os agentes Windows continuavam enviando `POST /api/identity/checkin`, mas o backend respondia `503 agent_token_not_configured`
- o processo PM2 legado `sgcg-identity-checkin` havia recebido check-ins até 2026-05-01 e depois foi parado; o backend principal não tinha `SGCG_AGENT_TOKEN` carregado
- como o token real não era gravado nos check-ins antigos nem nos logs, o endpoint foi ajustado para recuperação controlada:
  - se `SGCG_AGENT_TOKEN` ou `SGCG_AGENT_TOKEN_SHA256` existirem, continuam sendo a fonte oficial
  - se não houver token configurado, o primeiro check-in plausível vindo da LAN grava apenas o hash SHA-256 do token em `data/identity/agent-token.sha256`
  - o token em texto puro não é exibido nem persistido
  - os próximos check-ins são validados comparando o SHA-256 do header recebido
- arquivo alterado:
  - `backend/src/modules/identity/identity-routes.ts`
- validação executada:
  - `cd backend && npm run build` concluido sem erros
  - `pm2 restart bcc-backend --update-env` executado; processo voltou `online`
  - `GET /api/identity/health` retornou `200`
  - check-in real da estação `192.168.10.10` em 2026-05-02 14:06 criou `data/identity/agent-token.sha256`
  - `data/identity/checkins.jsonl` voltou a receber `user`, `display_user`, `computer`, `ip`, `mac` e `vlan`

## 2026-05-02 — Correlação de Identidade e Botão Investigar

- investigado o caso em que apenas `192.168.10.10` aparecia com usuário e hostname nos eventos recentes
- validação operacional:
  - `data/identity/latest.json` possui identidades históricas de 17 IPs
  - logs do Nginx mostram que, após a recuperação do token, somente `192.168.10.10` enviou check-ins recentes com HTTP `200`
  - demais estações permanecem com identidade histórica, mas sem check-in ativo no período observado
- melhoria aplicada na correlação de identidade:
  - `loadLatestByIp()` agora escolhe a identidade mais recente por IP quando há múltiplos agentes/entradas para o mesmo endereço
  - isso evita que uma entrada antiga, duplicada ou `no-user` sobrescreva a identidade mais recente
- botão `Investigar` no Radar em Tempo Real corrigido:
  - antes apenas preenchia o campo de busca da trilha de auditoria
  - agora carrega efetivamente `/api/bloqueios-liberacoes/audit/events` usando IP/domínio do evento selecionado
  - filtros de ação e origem são abertos para `all`, preservando VLAN quando disponível
- ajuste TypeScript complementar:
  - handlers de WhatsApp allowlist em `backend-proxy/src/routes/blocking-release-routes.ts` tipados como `req: any` para permitir build com `req.auth`
- arquivos alterados:
  - `backend/src/modules/identity/identity-enrichment.ts`
  - `backend-proxy/src/services/identity-enrichment-service.ts`
  - `backend-proxy/src/routes/blocking-release-routes.ts`
  - `frontend/src/pages/BlockingReleases.jsx`
- validação executada:
  - `cd backend && npm run build` concluido sem erros
  - `cd backend-proxy && npm run build` concluido sem erros
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend backend-proxy bcc-frontend --update-env` executado; processos voltaram `online`
  - `pm2 restart backend-proxy-ingester --update-env` executado para carregar a correlação nova no ingester

## 2026-05-02 — Ciência LGPD Obrigatória no Cadastro da VLAN 30

- portal `/collab/portal` ajustado para exigir ciência explícita da Lei Geral de Proteção de Dados - LGPD no auto cadastro de colaboradores
- todos os campos do cadastro da VLAN 30 agora são obrigatórios no frontend:
  - nome completo
  - CPF
  - setor
  - usuário
  - senha
  - aceite/ciencia LGPD
- backend reforçado em `POST /api/collaborators/public/register`:
  - recusa cadastro sem `lgpd_accepted`
  - retorna erro específico quando a ciência LGPD não é confirmada
  - registra `lgpd_accepted: true` na auditoria de cadastro bem-sucedido
- arquivos alterados:
  - `frontend/src/pages/CollaboratorPortal.jsx`
  - `backend/src/modules/collaborators/collaborators-routes.ts`
- validação executada:
  - `cd backend && npm run build` concluido sem erros
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend bcc-frontend --update-env` executado; processos voltaram `online`
  - `/collab/portal` retornou `200 text/html`
  - bundle de produção contém o texto de ciência LGPD e a validação `lgpd_accepted`

## 2026-05-04 — Validação do Bypass Emergencial por VLAN

- retomada a tarefa pendente de correção do bypass emergencial por VLAN indicada em `continuar.md`
- confirmado que `dns-contingency-service.ts` já contém as proteções necessárias para o modo:
  - `applyRuntimeVipBypassRules()` adiciona `ACCEPT` em `FORWARD` para sub-rede da VLAN em bypass e retorno `RELATED,ESTABLISHED`
  - VLANs em bypass emergencial recebem `ACCEPT` para DoT `tcp/853` antes do bloqueio global
  - `buildEarlyFirewallBlock()` injeta exceção por interface antes do `DROP` global de DoT em `ufw-before-forward`
- confirmado que `policy-compiler-service.ts` inclui sub-redes de VLANs em bypass na zona VIP/passthru DNS e as remove do escopo categórico durante o bypass
- validação executada:
  - `cd backend-proxy && npm run build` concluido sem erros

## 2026-05-04 — Estabilização do Portal do Colaborador VLAN 30

- corrigido o fluxo de contexto público do portal `/collab/portal`
- causa operacional identificada:
  - `GET /api/collaborators/public/context` removia o IP do `ipset` antes de verificar se já havia sessão ativa
  - reaberturas automáticas do captive portal por Windows/Android podiam derrubar a liberação existente e devolver o colaborador ao cadastro/login
  - WebViews de captive portal também reutilizavam HTML/JS em cache, mantendo bundles antigos durante a verificação de conectividade
- backend ajustado em `backend/src/modules/collaborators/collaborators-routes.ts`:
  - criado reconhecimento de sessão ativa por IP antes de qualquer revogação runtime
  - quando há sessão ativa, o contexto retorna `authenticated=true`, renova a autorização no `ipset` e preserva o redirecionamento institucional
  - a revogação runtime continua aplicada apenas quando não há sessão ativa
- vhost Nginx do portal cativo atualizado:
  - `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0`
  - `Pragma: no-cache`
  - `Expires: 0`
  - remoção de `ETag` e `Last-Modified` repassados pelo frontend
- frontend ajustado em `frontend/src/pages/CollaboratorPortal.jsx`:
  - valida que o contexto recebido é JSON antes de interpretar a resposta
  - mensagem de falha orienta abrir pela rede Wi-Fi da VLAN 30 ou tentar novamente
- validação executada:
  - `cd backend && npm run build` concluido sem erros
  - `cd frontend && npm run build` concluido com sucesso
  - `nginx -t` concluido com sucesso
  - `systemctl reload nginx` executado
  - `pm2 restart bcc-backend bcc-frontend --update-env` executado; ambos voltaram `online`
  - `GET http://192.168.30.1/generate_204` retornou HTML do portal com bundle novo e headers anti-cache
  - `GET http://192.168.30.1/api/collaborators/public/context` retornou `200 application/json`

## 2026-05-04 — Fallback Visual do Portal do Colaborador

- após nova validação em dispositivo Android, o WebView ainda permanecia exibindo `Verificando conexão...` mesmo com `/api/collaborators/public/context` retornando `200`
- logs do Nginx confirmaram que o cliente `192.168.30.29` carregava o bundle novo e recebia JSON do contexto, mas a experiência continuava presa no estado visual de carregamento
- ajuste aplicado no frontend:
  - o formulário de cadastro/login passou a aparecer imediatamente
  - a verificação de contexto roda em segundo plano com timeout de 4 segundos
  - falha ou atraso no contexto não bloqueia mais o colaborador
  - o texto bloqueante `Verificando conexão...` foi removido
  - permanece apenas um aviso discreto de `Atualizando identificação do dispositivo...` enquanto o contexto carrega
- arquivo alterado:
  - `frontend/src/pages/CollaboratorPortal.jsx`
- validação executada:
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-frontend --update-env` executado; processo voltou `online`
  - `systemctl reload nginx` executado
  - `GET http://192.168.30.1/generate_204` passou a servir o bundle `index-DXQO4Y1D.js`
  - `GET http://192.168.30.1/api/collaborators/public/context` retornou `200 application/json` em aproximadamente 50ms

## 2026-05-04 — Correção da Exclusão no Módulo Hotspot

- investigado o botão `Excluir` da lista de visitantes do módulo Hotspot
- causa identificada:
  - `DELETE /api/hotspot/visitors/:id` funcionava e desativava o visitante com `active = FALSE`
  - as sessões ativas eram revogadas corretamente
  - porém `GET /api/hotspot/visitors` continuava listando visitantes inativos, dando a impressão de que a exclusão não funcionava
- backend ajustado em `backend/src/modules/hotspot/hotspot-routes.ts`:
  - listagem de visitantes agora retorna apenas `active = TRUE` por padrão
  - mantido suporte a `include_inactive=true` ou `includeInactive=true` para diagnósticos administrativos futuros
- frontend ajustado em `frontend/src/pages/Hotspot.jsx`:
  - exclusão passou a capturar falhas e exibir alerta objetivo ao usuário
- validação executada:
  - banco confirmou visitante `id=2` como `active=false`
  - banco confirmou sessões do visitante `id=2` revogadas/expiradas
  - query de visitantes ativos não retorna mais o visitante excluído
  - `cd backend && npm run build` concluido sem erros
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend bcc-frontend --update-env` executado; ambos voltaram `online`
  - frontend passou a servir o bundle `index-Dm-7O9h0.js`

## 2026-05-04 — Recadastro após Exclusão no Hotspot

- corrigido o fluxo público de cadastro do Hotspot após exclusão lógica
- causa identificada:
  - excluir visitante no SGCG desativa o registro com `active = FALSE`
  - o CPF permanece na tabela por integridade/auditoria e pela restrição única
  - ao tentar novo cadastro, o portal tratava qualquer CPF existente como duplicado, mesmo inativo
- backend ajustado em `backend/src/modules/hotspot/hotspot-routes.ts`:
  - se o CPF existir e estiver ativo, a mensagem de duplicidade permanece
  - se o CPF existir inativo, o cadastro público reativa o visitante
  - na reativação são atualizados nome, data de nascimento, senha, estado ativo e vínculo de MAC quando disponível
  - uma nova sessão é criada com `auth_method = reactivated_register`
  - auditoria registra `hotspot_register_reactivated`
- validação executada:
  - `cd backend && npm run build` concluido sem erros
  - `pm2 restart bcc-backend --update-env` executado; processo voltou `online`
  - cadastro CPF `04048640909` confirmado como `active=false` antes do recadastro, sem alterar senha manualmente
  - `GET /api/hotspot/public/context` retornou `200 application/json`

## 2026-05-04 — Correção do Bloqueio Total por VLAN

- corrigido o fluxo de `Operações Técnicas > Bloqueio Total por VLAN`
- causa identificada:
  - quando o motor do proxy estava em modo `off`, o `bypassGlobal` impedia a aplicação das regras de interceptação mesmo com `total_vlan_blocks.active = TRUE`
  - regras runtime de portais cativos podiam ficar antes das regras geradas pelo bloco institucional, permitindo que usuários já autenticados continuassem navegando ou fossem enviados ao portal errado
- backend-proxy ajustado:
  - bloqueios totais ativos agora forçam a interceptação HTTP mesmo com o modo geral do proxy desligado
  - o Squid mantém `http_port 3128 intercept` e ACL `deny_info ERR_SGCG_MAINTENANCE` para VLAN em manutenção
  - na ativação do Bloqueio Total são inseridas regras runtime no topo do iptables com comentário `sgcg-total-vlan-block`
  - HTTP `TCP/80` da VLAN bloqueada é redirecionado ao Squid antes de portais cativos e sessões autorizadas
  - tráfego direto da VLAN é rejeitado no `FORWARD` durante a manutenção
  - na desativação, as regras runtime `sgcg-total-vlan-block` da VLAN são removidas
- decisão operacional:
  - o `UFW` permanece como firewall oficial do SGCG
  - `iptables` é usado aqui como camada complementar runtime para garantir precedência imediata do bloqueio total sobre regras já existentes de portal/captura
- validação executada:
  - `cd backend-proxy && npm run build` concluido sem erros
  - `pm2 restart backend-proxy --update-env` executado; processo voltou `online`
  - ativação controlada da VLAN 70 criou bloqueio ativo e regras `sgcg-total-vlan-block` no topo de `nat/PREROUTING`, `filter/INPUT` e `filter/FORWARD`
  - `/etc/squid/squid.conf` confirmou `error_directory /etc/squid/errors/sgcg`, `http_port 3128 intercept`, ACL da VLAN 70 e `deny_info ERR_SGCG_MAINTENANCE`
  - teste controlado encerrado em seguida; banco ficou sem bloqueios ativos e `iptables-save` não lista mais regras `sgcg-total-vlan-block`

## 2026-05-04 — Correção do Bypass Total de Exceções VIP

- investigado o caso em que um IP inserido em `Exceções VIP` não recebia bypass total efetivo
- causa confirmada no runtime:
  - a exceção era persistida em `policy_exceptions`
  - o IP era sincronizado em `dns_vip`
  - o arquivo RPZ `/etc/unbound/becker/vip-bypass.conf` continha o `rpz-client-ip`
  - porém as regras complementares `sgcg-vip-bypass` no `iptables` ficavam depois de regras runtime de portal cativo e bloqueio social
  - como o `iptables` aplica a primeira regra correspondente, o VIP podia cair antes em `SGCG SOCIAL BLOCK VLAN*` ou em `REJECT` de portal cativo
- backend-proxy ajustado em `backend-proxy/src/services/dns-contingency-service.ts`:
  - `applyFirewallBlock()` passou a reconciliar o bypass VIP runtime mesmo quando o `UFW` está instalado e ativo
  - regras antigas `sgcg-vip-bypass` passam a ser removidas e reinseridas em posição operacional correta
  - regras de VIP no `FORWARD` entram antes de portal cativo e bloqueios sociais
  - foi adicionada regra `nat/PREROUTING -s <VIP> -j RETURN` com comentário `sgcg-vip-bypass`, impedindo que VIP seja capturado por DNAT de portal cativo antes do bypass
  - a ordem preserva o `Bloqueio Total por VLAN`: regras `sgcg-total-vlan-block`, quando ativas, continuam com precedência sobre VIP
- decisão operacional preservada:
  - o `UFW` continua sendo o firewall oficial do SGCG
  - `iptables` é usado apenas como camada complementar runtime para garantir precedência imediata diante de regras de portal, bloqueio social e bypass
- validação executada:
  - `cd backend && npm run build` concluido sem erros
  - `cd backend-proxy && npm run build` concluido sem erros
  - `cd frontend && npm run build` concluido com sucesso
  - `dnsContingencyService.ensureFirewallState()` executado com sucesso
  - `pm2 restart backend-proxy --update-env` executado; processo voltou `online`
  - VIP recente `192.168.10.119` confirmado em `policy_exceptions`, `dns_vip`, `proxy_ip_bypass.acl` e `/etc/unbound/becker/vip-bypass.conf`
  - `iptables -S FORWARD` confirmou `192.168.10.119` com `sgcg-vip-bypass` antes de portal cativo e antes de `SGCG SOCIAL BLOCK VLAN10`
  - `iptables -t nat -S PREROUTING` confirmou `RETURN` para `192.168.10.119` antes dos DNATs de portal cativo
  - `ufw status` confirmou `Status: active`

## Próximo passo recomendado

- testar no dispositivo real do VIP `192.168.10.119`:
  - navegação comum
  - acesso a redes sociais antes bloqueadas
  - DNS externo/DoH/DoT quando necessário
  - confirmar que o bypass não se aplica durante `Bloqueio Total por VLAN`, caso esse modo seja ativado em janela controlada

## 2026-05-04 — Espelhamento Obrigatório dos Consoles Público e Interno

- instituída regra inegociável: `console.interno.jacarezinho` deve ser espelho operacional de `console.jacarezinho.cloud`
- objetivo:
  - garantir acesso administrativo pela LAN quando o link externo estiver indisponível
  - impedir divergência entre rotas, APIs, endpoints e contratos HTTP(S) dos dois consoles
- diagnóstico confirmado:
  - ambos os vhosts estavam ativos no Nginx
  - ambos entregavam o frontend em `https://127.0.0.1:6777`
  - ambos encaminhavam `/api/` padrão ao backend core `127.0.0.1:6778`
  - o console interno já encaminhava `/api/bloqueios-liberacoes` e `/api/data-governance` ao `backend-proxy`
  - o console público ainda não incluía esses dois prefixos no bloco do `backend-proxy`, criando risco de divergência operacional
- Nginx ajustado:
  - criado snippet comum `/etc/nginx/snippets/sgcg-console-app-mirror.conf`
  - `console.jacarezinho.cloud` passou a incluir esse snippet no servidor HTTPS
  - `console.interno.jacarezinho` passou a incluir o mesmo snippet no servidor HTTPS
  - o roteamento compartilhado agora define:
    - `/` -> frontend `https://127.0.0.1:6777`
    - `/api/proxy/stats` -> backend core `http://127.0.0.1:6778`
    - `/api/proxy/logs` -> backend core `http://127.0.0.1:6778`
    - `/api/(proxy|rules|cert|dns|bloqueios-liberacoes|data-governance)` -> backend-proxy `https://127.0.0.1:6779`
    - `/api/` restante -> backend core `http://127.0.0.1:6778`
- diferenças preservadas por necessidade de infraestrutura:
  - certificado público Let's Encrypt para `console.jacarezinho.cloud`
  - certificado interno emitido pela CA SGCG para `console.interno.jacarezinho`
  - download da CA interna em `/sgcg-root-ca.crt` e `/sgcg-root-ca.cer`
  - rota HTTP interna de `/api/identity/` para agentes LAN antes do redirect HTTPS
- backups dos vhosts anteriores:
  - `/etc/nginx/sites-available/console.jacarezinho.cloud.bak-sgcg-mirror-20260504-131238`
  - `/etc/nginx/sites-available/console.interno.jacarezinho.bak-sgcg-mirror-20260504-131238`
- validação executada:
  - `nginx -t` concluiu com sucesso
  - `systemctl reload nginx` executado
  - `GET /` retornou `200 text/html` em ambos os hosts via resolução local
  - `GET /api/ping` retornou `Pong HTTP (Core 6778)` em ambos os hosts
  - `GET /api/dns/stats` retornou `Token ausente` em ambos os hosts, comprovando contrato protegido igual
  - `GET /api/bloqueios-liberacoes/health` retornou `Token ausente` em ambos os hosts
  - `GET /api/data-governance/metrics?range=24h` retornou `Token ausente` em ambos os hosts
  - `GET /api/proxy/stats` e `GET /api/proxy/logs` retornaram `Token ausente` em ambos os hosts

## Próximo passo recomendado

- toda nova rota do SGCG deve ser validada simultaneamente nos dois nomes:
  - `https://console.jacarezinho.cloud`
  - `https://console.interno.jacarezinho`
- evitar editar diretamente apenas um dos vhosts; alterar o snippet comum quando a mudança pertencer à superfície da aplicação

## 2026-05-04 — Liberação Governo appjacarezinho.govbr.cloud

- adicionada a URL/host `appjacarezinho.govbr.cloud` à política institucional `Governo`
- persistência aplicada:
  - `release_policies` recebeu liberação global com categoria `Governo`
  - `domain_policy_entries` da política nomeada `Governo` recebeu entrada `domain`
- catálogo-base `Governo` em `backend-proxy/src/services/blocking-release-service.ts` foi ampliado com o host para preservar a liberação em futuras restaurações/baselines
- compilação e aplicação executadas:
  - `cd backend-proxy && npm run build` concluído sem erros
  - `blockingReleaseService.apply('codex')` concluído com `success=true`
  - `unbound-checkconf` retornou sem erros durante a validação do apply
  - `backend-proxy` reiniciado via `pm2 restart backend-proxy --update-env` e voltou `online`
- validação de artefatos confirmou `appjacarezinho.govbr.cloud` em:
  - `backend-proxy/regras/generated/proxy_whitelist.acl`
  - `backend-proxy/regras/generated/proxy_protected_ssl.acl`
  - `backend-proxy/regras/generated/bloqueios-liberacoes/allowlist-global.acl`
  - `backend-proxy/regras/generated/bloqueios-liberacoes/export.json`
  - `/etc/unbound/becker/allowed.rpz`
- o RPZ permitido passou a conter também `*.appjacarezinho.govbr.cloud` como passthru

## Próximo passo recomendado

- testar acesso real ao portal `appjacarezinho.govbr.cloud` em uma estação sujeita às políticas institucionais, confirmando DNS, navegação HTTPS e ausência de bloqueio por camada social/DoH/ACL

## 2026-05-04 — Revisão dos Portais Cativos Após Mudança dos VIPs

- revisados os portais cativos de Colaboradores VLAN30 e Hotspot VLAN70 após a nova estratégia de `sgcg-vip-bypass`
- diagnóstico confirmado:
  - os vhosts Nginx dos portais respondiam corretamente em `192.168.30.1:80` e `192.168.70.1:80`
  - os ipsets `sgcg_collab_v30_auth` e `sgcg_hotspot_v70_auth` estavam ativos e referenciados
  - o DNAT HTTP dos cativos estava presente
  - o `REJECT` do Hotspot VLAN70 estava ficando depois das permissões globais de WhatsApp/redes sociais, permitindo caminho indevido para cliente não autenticado
- estratégia corrigida:
  - os módulos `backend/src/modules/collaborators/collaborators-routes.ts` e `backend/src/modules/hotspot/hotspot-routes.ts` passaram a remover duplicatas da própria regra e reinserir os cativos em posição calculada
  - ordem incontestável de runtime:
    - `sgcg-total-vlan-block`, quando ativo
    - `sgcg-vip-bypass`
    - portais cativos VLAN30/VLAN70
    - permissões WhatsApp/redes sociais/políticas gerais
  - a leitura da ordem passou a usar `iptables -S ... | grep -- "--comment ..."` para evitar estouro de buffer em `iptables-save -t nat`
- allowlist do shell ajustada em `backend/src/utils/sys.ts`:
  - leitura leve por comentário das cadeias `PREROUTING` e `FORWARD`
  - deleção das regras Hotspot
  - inserção numerada dinâmica das regras Colaboradores/Hotspot
- aplicação executada:
  - `cd backend && npm run build` concluído sem erros
  - `ensureHotspotEnforcement()` executado no runtime compilado
  - `ensureCollabEnforcement()` executado no runtime compilado
  - `pm2 restart bcc-backend --update-env` concluído e processo voltou `online`
- validação de firewall:
  - `nat/PREROUTING` ficou com todos os `sgcg-vip-bypass` antes dos DNATs dos portais
  - DNAT VLAN30 ficou na posição 9 e DNAT VLAN70 na posição 10 da listagem filtrada
  - `filter/FORWARD` ficou com todos os `sgcg-vip-bypass` antes dos `REJECT` dos portais
  - `REJECT` VLAN30 ficou antes de `SGCG WHATSAPP ALLOW`
  - `REJECT` VLAN70 ficou antes de `SGCG WHATSAPP ALLOW`
- validação HTTP:
  - `GET http://192.168.30.1/api/collaborators/public/context` com `X-Forwarded-For: 192.168.30.250` retornou `authenticated=false`, `auth_required=true`, `requires_login=true`
  - `HEAD http://192.168.30.1/generate_204` retornou `200 OK text/html`, servindo o portal
  - `GET http://192.168.70.1/api/hotspot/public/context` com `X-Forwarded-For: 192.168.70.250` retornou `authenticated=false`, `requires_login=true`
  - `HEAD http://192.168.70.1/generate_204` retornou `302` para `http://192.168.70.1/hotspot/portal`

## Próximo passo recomendado

- testar em um cliente real não autenticado nas VLANs 30 e 70:
  - acesso HTTP deve cair no portal
  - tentativa de WhatsApp/redes sociais antes do login deve ser barrada
  - após autenticação, o IP deve entrar no ipset correto e navegar conforme a política da VLAN

## 2026-05-04 — Política Institucional de Bloqueio Streaming

- criada a política nomeada `Streaming` em `Políticas Institucionais`
- tipo: `block`
- escopo: `global`
- status: ativa
- objetivo:
  - bloquear serviços de streaming de filmes, vídeos e músicas em redes institucionais
  - preservar Netflix/Fast.com conforme regra operacional solicitada
- domínios cadastrados na política:
  - `amazonvideo.com`
  - `crunchyroll.com`
  - `deezer.com`
  - `disneyplus.com`
  - `dzcdn.net`
  - `globoplay.com`
  - `googlevideo.com`
  - `hbomax.com`
  - `hbo.com`
  - `hulu.com`
  - `max.com`
  - `music.amazon.com`
  - `music.apple.com`
  - `pandora.com`
  - `paramountplus.com`
  - `peacocktv.com`
  - `playplus.com`
  - `pluto.tv`
  - `primevideo.com`
  - `qobuz.com`
  - `scdn.co`
  - `sndcdn.com`
  - `soundcloud.com`
  - `spotify.com`
  - `spotifycdn.com`
  - `starplus.com`
  - `tidal.com`
  - `tunein.com`
  - `twitch.tv`
  - `ttvnw.net`
  - `youtube.com`
  - `youtube-nocookie.com`
  - `youtubei.googleapis.com`
  - `youtu.be`
  - `ytimg.com`
- domínios propositalmente não cadastrados:
  - `fast.com`
  - `netflix.com`
  - `nflxvideo.net`
  - `nflximg.net`
- persistência aplicada:
  - `domain_policies` recebeu `Streaming` com `policy_type = block`, `scope_type = global`, `enabled = true`
  - `domain_policy_entries` recebeu 35 entradas
  - `blocking_policies` recebeu 35 linhas ativas vinculadas ao `domain_policy_id`
- catálogo-base ampliado:
  - `backend-proxy/src/services/blocking-release-service.ts` ganhou a categoria `Streaming` em `BASELINE_BLOCK_CATALOG`
  - a restauração de baseline passa a recriar o bloqueio global de `Streaming` sem incluir Netflix/Fast.com
- aplicação executada:
  - `blockingReleaseService.apply('codex', { restart_squid: true })` retornou `success=true`
  - `cd backend-proxy && npm run build` concluído sem erros
  - `pm2 restart backend-proxy --update-env` executado e processo voltou `online`
- validação:
  - PostgreSQL confirmou política `Streaming` ativa com 35 entradas
  - PostgreSQL confirmou 35 bloqueios legados ativos vinculados à política
  - validação confirmou ausência de `fast.com`, `netflix.com`, `nflxvideo.net` e `nflximg.net` nas entradas da política
  - `proxy_blocklist.acl`, `proxy_bump_ssl.acl`, `blocklist-global.acl` e `/etc/unbound/becker/blocked.rpz` contêm domínios de streaming como `spotify.com`, `youtube.com`, `googlevideo.com`, `primevideo.com` e `disneyplus.com`
  - `unbound-checkconf` concluiu sem erros
  - rota protegida `/api/bloqueios-liberacoes/health` respondeu `Token ausente`, confirmando backend-proxy ativo atrás da autenticação

## Próximo passo recomendado

- testar em estação sujeita às políticas institucionais:
  - `fast.com` deve continuar acessível
  - Netflix deve continuar sem bloqueio por esta política
  - Spotify/YouTube/Prime Video/Disney+/Twitch devem cair no bloqueio DNS/Proxy conforme a VLAN

## 2026-05-04 — Política Institucional Plataformas de Reunião

- criada a política nomeada `Plataformas de Reunião` em `Políticas Institucionais`
- tipo: `allow`
- escopo: `global`
- status: ativa
- objetivo:
  - garantir liberação integral de Google Meet, Zoom e Microsoft Teams em todas as VLANs gerenciadas
  - dar precedência operacional a reuniões institucionais sobre bloqueios categóricos de streaming
- domínios cadastrados na política:
  - `meet.google.com`
  - `googlevideo.com`
  - `gvt1.com`
  - `zoom.us`
  - `zoom.com`
  - `zoomcdn.com`
  - `zoomgov.com`
  - `teams.microsoft.com`
  - `teams.live.com`
  - `teams.cdn.office.net`
  - `statics.teams.cdn.office.net`
  - `skype.com`
  - `skypeassets.com`
  - `lync.com`
  - `microsoft.com`
  - `microsoftonline.com`
  - `office.com`
  - `office365.com`
  - `msecnd.net`
- decisão operacional importante:
  - `googlevideo.com` foi removido da lista consolidada de bloqueio porque é dependência de mídia/WebRTC do Google Meet
  - a liberação de `googlevideo.com` pode permitir parte da infraestrutura de vídeo do Google/YouTube, mas é necessária para cumprir a regra de Meet 100% funcional
- persistência aplicada:
  - `domain_policies` recebeu `Plataformas de Reunião` com `policy_type = allow`, `scope_type = global`, `enabled = true`
  - `domain_policy_entries` recebeu 19 entradas
  - `release_policies` recebeu 19 linhas ativas vinculadas ao `domain_policy_id`
  - as 19 linhas em `release_policies` foram marcadas como `protected = TRUE`
- catálogo-base ampliado:
  - `backend-proxy/src/services/blocking-release-service.ts` ganhou a categoria `Plataformas de Reunião` em `BASELINE_ALLOW_CATALOG`
  - a restauração de baseline passa a recriar a liberação global protegida de Google Meet, Zoom e Microsoft Teams
- aplicação executada:
  - `blockingReleaseService.apply('codex', { restart_squid: true })` retornou `success=true`
  - `cd backend-proxy && npm run build` concluído sem erros
  - `pm2 restart backend-proxy --update-env` executado e processo voltou `online`
- validação:
  - PostgreSQL confirmou política ativa com 19 entradas
  - PostgreSQL confirmou 19 liberações legadas ativas e protegidas
  - `proxy_whitelist.acl`, `proxy_protected_ssl.acl`, `allowlist-global.acl` e `/etc/unbound/becker/allowed.rpz` contêm domínios como `meet.google.com`, `googlevideo.com`, `zoom.us`, `teams.microsoft.com`, `teams.cdn.office.net`, `microsoftonline.com` e `office365.com`
  - os mesmos domínios não aparecem nos artefatos finais de bloqueio gerados
  - `dig @127.0.0.1 meet.google.com`, `zoom.us`, `teams.microsoft.com` e `googlevideo.com` retornaram resolução real
  - `unbound-checkconf` concluiu sem erros
  - rota protegida `/api/bloqueios-liberacoes/health` respondeu `Token ausente`, confirmando backend-proxy ativo atrás da autenticação

## Próximo passo recomendado

- testar chamadas reais em uma estação comum da rede:
  - Google Meet com áudio, vídeo e compartilhamento de tela
  - Zoom com áudio, vídeo e compartilhamento de tela
  - Microsoft Teams com áudio, vídeo e compartilhamento de tela

## 2026-05-05 — Diagnóstico DHCP da VLAN 50

- investigada a queixa de que a VLAN 50 não estaria recebendo DHCP automático
- estado verificado do serviço:
  - `isc-dhcp-server` está instalado, habilitado e ativo
  - o processo `dhcpd` está escutando em `enp6s0.50`, junto das demais VLANs
  - a interface `enp6s0.50` está `UP` com `192.168.50.1/24`
  - `/etc/dhcp/dhcpd.conf` possui subnet da VLAN 50 com range `192.168.50.10 192.168.50.140`
  - `dhcpd -t -cf /etc/dhcp/dhcpd.conf` validou a sintaxe da configuração
  - o `UFW` possui regra `ALLOW IN 67/udp on enp6s0.50`
- evidência observada nos logs:
  - o `dhcpd` recebeu tráfego em `enp6s0.50`
  - houve `DHCPDISCOVER`, `DHCPOFFER`, `DHCPREQUEST` e `DHCPACK` recentes para clientes da VLAN 50
  - portanto não foi identificado bloqueio total do serviço DHCP nem falha geral da interface VLAN 50
- problema identificado:
  - existe uma automação local fora do código principal do SGCG: `dhcp-autobind.service`
  - o serviço executa `/usr/local/sbin/dhcp_autobind_reservations.sh`
  - a lógica desse script define `ALWAYS=("10" "50")`, ou seja, a VLAN 50 sempre é convertida em reserva estática
  - o script gerou `/etc/dhcp/static_hosts.conf` com reservas da VLAN 50 em `192.168.50.10` até `192.168.50.19`
  - essas reservas estão dentro do mesmo range dinâmico `192.168.50.10-192.168.50.140`
  - o próprio `dhcpd` passou a registrar avisos repetidos como `Dynamic and static leases present` e `uid lease ... is duplicate on 192.168.50.0/24`
- estado anômalo adicional:
  - `dhcp-autobind.service` está em `activating (start)` desde `2026-05-01 20:52:34 -03`
  - o processo ficou preso em `apt-get update -y`
  - como é `Type=oneshot` acionado por timer, o timer fica impedido de concluir novas rodadas enquanto a execução antiga permanece presa
- conclusão operacional:
  - o SGCG aplicação não foi identificado como causa direta da falha
  - o serviço principal de entrega DHCP está ativo e respondendo na VLAN 50
  - o risco real está na automação auxiliar `dhcp-autobind`, que transforma leases da VLAN 50 em reservas fixas dentro do pool automático e permanece travada
- validação adicional:
  - captura curta com `tcpdump` em `enp6s0.50` não recebeu novos pacotes DHCP durante a janela observada
  - se um cliente específico falhar e nenhum `DHCPDISCOVER` aparecer no servidor, a causa provável passa a ser entrega de VLAN/switch/AP/cabo até o servidor, não o `dhcpd`

## Próximo passo recomendado

- corrigir a arquitetura do `dhcp-autobind` antes de reiniciar ou reexecutar a automação:
  - remover `50` de `ALWAYS` se a VLAN 50 deve ser dinâmica
  - ou mover reservas estáticas da VLAN 50 para fora do pool automático, preferencialmente acima de `.141`
  - remover `apt-get update` e `apt-get install` do caminho quente do oneshot
  - definir timeout no service para impedir execução presa por dias
- depois da correção, reiniciar `isc-dhcp-server` e validar com um cliente real da VLAN 50 enquanto se observa:
  - `journalctl -u isc-dhcp-server -f`
  - `tcpdump -ni enp6s0.50 'udp and (port 67 or port 68)'`

## 2026-05-05 — Correção DHCP Automático da VLAN 50

- correção aplicada na automação local `dhcp-autobind`
- backups criados antes da alteração em:
  - `/etc/sgcg/backups/dhcp-fix-20260505-084725`
- `dhcp-autobind.timer` e `dhcp-autobind.service` foram parados antes da edição para impedir reexecução concorrente
- `dhcp-autobind.service` estava preso em `apt-get update -y`; a execução antiga foi encerrada de forma controlada
- `/usr/local/sbin/dhcp_autobind_reservations.sh` foi ajustado:
  - `ALWAYS=("10" "50")` passou para `ALWAYS=("10")`
  - `NEVER=("70")` passou para `NEVER=("50" "70")`
  - a VLAN 50 deixou de gerar reservas fixas automáticas
  - removidas chamadas a `apt-get update` e `apt-get install` do caminho quente do timer
  - removida verificação lenta por `arping` em cada IP durante a geração das reservas
  - cabeçalho gerado em `static_hosts.conf` atualizado para `VLAN10 sempre; VLAN30 condicional; VLAN50/70 nunca`
- `/etc/systemd/system/dhcp-autobind.service` foi ajustado:
  - adicionado `TimeoutStartSec=90`
  - permissões do service/timer normalizadas para `0644`
  - executado `systemctl daemon-reload`
- aplicação executada:
  - `systemctl start dhcp-autobind.service`
  - a execução concluiu com sucesso em aproximadamente `1.2s`
  - o script regenerou `/etc/dhcp/static_hosts.conf`
  - `isc-dhcp-server` foi reiniciado pelo fluxo existente do script
  - `dhcp-autobind.timer` foi reativado
- validação:
  - `static_hosts.conf` não contém mais entradas `v50_`
  - `static_hosts.conf` não contém mais reservas `192.168.50.*`
  - `dhcpd -t -cf /etc/dhcp/dhcpd.conf` concluiu sem erro
  - `isc-dhcp-server` voltou `active`
  - `dhcp-autobind.timer` voltou `active`
  - `ufw` permaneceu `active`
  - regra `67/udp on enp6s0.50 ALLOW` permaneceu presente
  - logs pós-restart confirmaram `dhcpd` escutando e enviando em `enp6s0.50`
- observação:
  - ainda existem avisos de lease dinâmico versus reserva estática na VLAN 10, pois essa VLAN continua configurada como reserva automática permanente
  - a correção desta rodada foi restrita à falha operacional da VLAN 50

## Próximo passo recomendado

- testar em um cliente real da VLAN 50:
  - renovar o DHCP
  - confirmar recebimento de IP dentro de `192.168.50.10-192.168.50.140`
  - observar `journalctl -u isc-dhcp-server -f`
  - se não aparecer `DHCPDISCOVER` no servidor durante o teste, revisar tagueamento VLAN 50 no switch/AP/caminho físico
- em rodada futura, revisar se a VLAN 10 também deve sair do modelo de reservas dentro do pool dinâmico para eliminar os avisos remanescentes do `dhcpd`

## 2026-05-05 — Estabilização complementar do DHCP da VLAN 50

- após a correção inicial, a VLAN 50 voltou a apresentar instabilidade percebida
- nova investigação confirmou:
  - `isc-dhcp-server` permaneceu `active`
  - `enp6s0.50` permaneceu `UP` com `192.168.50.1/24`
  - `/etc/dhcp/static_hosts.conf` continuou sem entradas `v50_` e sem reservas `192.168.50.*`
  - logs recentes mostraram a VLAN 50 recebendo DHCP normalmente, com `DHCPDISCOVER`, `DHCPOFFER`, `DHCPREQUEST` e `DHCPACK`
  - exemplos observados:
    - `192.168.50.24`
    - `192.168.50.25`
    - `192.168.50.20`
    - renovações de `192.168.50.11`, `.12`, `.15`, `.16` e `.19`
- causa adicional identificada:
  - `dhcp-autobind.timer` executa a cada 5 minutos
  - o script ainda reiniciava `isc-dhcp-server` toda vez que rodava, mesmo quando as reservas não tinham mudança semântica
  - além disso, a geração de `static_hosts.conf` usava ordem não determinística de array associativo, fazendo o arquivo parecer diferente entre execuções
  - esse comportamento criava reinícios desnecessários do serviço DHCP em ciclos curtos
- correção aplicada em `/usr/local/sbin/dhcp_autobind_reservations.sh`:
  - geração de `mac_ip_db.csv` passou a ordenar chaves antes de gravar
  - geração de `static_hosts.conf` passou a ordenar chaves antes de gravar
  - o script passou a comparar o novo arquivo com o existente usando `cmp`
  - se não houver alteração real em `static_hosts.conf`, o script remove o temporário e preserva o DHCP ativo
  - `isc-dhcp-server` agora só é reiniciado quando `static_hosts.conf` realmente mudar
- validação:
  - primeira execução após normalizar a ordem ainda atualizou o arquivo e reiniciou o DHCP uma última vez
  - segunda execução consecutiva retornou `Reservas sem alteração; DHCP preservado`
  - `isc-dhcp-server` permaneceu `active`
  - a VLAN 50 continuou sem reservas estáticas conflitantes
- conclusão operacional:
  - o DHCP da VLAN 50 está funcional no servidor
  - a fonte local de oscilação por reinício periódico foi removida
  - se o problema persistir em um ponto específico, a próxima investigação deve separar:
    - ausência de `DHCPDISCOVER` no servidor: caminho físico/switch/AP/tagueamento da VLAN 50
    - DHCP concluído com IP válido, mas sem navegação: DNS, firewall, RPZ, QoS ou enforcement de saída

## Próximo passo recomendado

- testar no ponto afetado da VLAN 50 com captura simultânea:
  - `journalctl -u isc-dhcp-server -f`
  - `tcpdump -ni enp6s0.50 'udp and (port 67 or port 68)'`
- anotar MAC, porta/switch/AP e horário do cliente afetado para distinguir problema de entrega VLAN de problema posterior ao DHCP

## 2026-05-06 - Ajuste de exposicao Telnet 23/18123

- solicitacao operacional:
  - verificar se a porta `23/tcp` estava aberta para o mundo
  - fechar `23/tcp` para WAN se necessario
  - manter `23/tcp` somente na rede interna
  - usar `18123/tcp` como porta externa
- verificacao inicial:
  - `ss -ltnp '( sport = :23 or sport = :18123 )'` nao mostrou processo escutando em `23` nem em `18123`
  - `ufw status verbose` nao tinha liberacao explicita de `23/tcp` na WAN
  - `iptables-save` e `iptables-legacy-save` nao tinham regras especificas para `23` ou `18123`
  - WAN identificada como `enp8s0`
  - redes internas identificadas nas VLANs `enp6s0.10`, `.30`, `.40`, `.50`, `.70`, `.80`, `.99` e VPN `wg0`
- regras aplicadas via UFW:
  - `23/tcp` liberada em `enp6s0.10`, `enp6s0.30`, `enp6s0.40`, `enp6s0.50`, `enp6s0.70`, `enp6s0.80`, `enp6s0.99` e `wg0`
  - `23/tcp` negada em `enp8s0`
  - `18123/tcp` liberada em `enp8s0`
- validacao:
  - `ufw status numbered` confirmou as regras persistentes de Telnet interno, bloqueio WAN da `23/tcp` e liberacao WAN da `18123/tcp`
  - `iptables-save` confirmou as regras efetivas em `ufw-user-input`
  - `iptables-legacy-save` continuou sem regras para essas portas
  - nova checagem com `ss` confirmou que ainda nao havia processo escutando em `23` ou `18123`
- observacao:
  - a politica de firewall ficou pronta para o acesso externo em `18123/tcp`, mas o servico precisa estar configurado para escutar nessa porta para responder conexoes

## 2026-05-06 - Restricao SNMP 161 para rede interna

- decisao operacional:
  - `161/udp` e SNMP e nao deve ficar exposta para o mundo
  - manter acesso somente por rede interna/VPN
  - bloquear explicitamente na WAN
- verificacao inicial:
  - `ufw status numbered` nao mostrou regra especifica de SNMP/`161/udp`
  - `iptables-save` e `iptables-legacy-save` nao mostraram regras especificas para `161/udp`
  - `ss -lunp '( sport = :161 )'` nao mostrou processo escutando em `161/udp`
  - WAN identificada como `enp8s0`
  - redes internas/VPN consideradas: `enp6s0.10`, `enp6s0.30`, `enp6s0.40`, `enp6s0.50`, `enp6s0.70`, `enp6s0.80`, `enp6s0.99` e `wg0`
- regras aplicadas via UFW:
  - `161/udp` liberada em `enp6s0.10`, `enp6s0.30`, `enp6s0.40`, `enp6s0.50`, `enp6s0.70`, `enp6s0.80`, `enp6s0.99` e `wg0`
  - `161/udp` negada em `enp8s0`
- validacao:
  - `ufw status numbered` confirmou as regras persistentes de SNMP interno e bloqueio WAN da `161/udp`
  - `iptables-save` confirmou as regras efetivas em `ufw-user-input`
  - `iptables-legacy-save` continuou sem regras para `161/udp`
  - nova checagem com `ss` confirmou que ainda nao havia processo escutando em `161/udp`
- observacao:
  - a politica de firewall ficou preparada para SNMP interno/VPN; se houver monitor externo, liberar apenas o IP publico especifico do coletor, nao `Anywhere` na WAN

## 2026-05-08 - Hotspot com expiracao reduzida para 4 horas

- arquivos alterados:
  - `backend/src/modules/hotspot/hotspot-routes.ts`
- ajuste aplicado:
  - o tempo de expiracao padrao das sessoes do `Hotspot` foi reduzido de `12 horas` para `4 horas`
  - o TTL runtime do `ipset` `sgcg_hotspot_v70_auth` passou a acompanhar as mesmas `4 horas`
  - o `DEFAULT` de `expires_at` em `hotspot_sessions` passou a ser atualizado tambem via `ALTER TABLE`, para valer em bases ja existentes
  - a janela de correlacao do relatorio/auditoria do Hotspot foi ajustada para `4 horas` quando a sessao ainda nao tiver `session_ended_at`
- validacao:
  - busca de codigo confirmou a troca dos pontos do Hotspot que ainda estavam fixos em `12 hours`
  - `backend/src/utils/sys.ts` foi alinhado para aceitar o novo timeout `14400` do `ipset` do Hotspot, evitando `SHELL BLOCKED` no boot apos a reducao para `4 horas`

## 2026-05-08 - QoS herdando VIPs institucionais e limpeza do legado FireQOS

- sintoma operacional:
  - o QoS aparentava `nao funcionar com os VIPs`
  - em incidente real, foi preciso elevar temporariamente a banda da VLAN inteira para atender um usuario VIP
- causa-raiz confirmada:
  - o SGCG mantinha dois conceitos separados:
    - `Excecoes VIP` institucionais em `policy_exceptions` e `dns_vip`
    - `VIPs do QoS` em `net_qos_vips`
  - o runtime de `tc` respeitava apenas `net_qos_vips`, entao um IP podia ser `VIP` no bypass institucional e continuar limitado no QoS
  - diferencas confirmadas antes da correcao:
    - `enp6s0.10`: VIPs institucionais ativos ausentes do QoS em `192.168.10.26`, `192.168.10.143`, `192.168.10.187`, `192.168.10.212` e `192.168.10.171`
    - `enp6s0.50`: VIP institucional ativo ausente do QoS em `192.168.50.26`
  - havia ainda um legado paralelo `fireqos.service` habilitado no host, criando risco de sobrescrita futura fora do SGCG
- arquivos alterados:
  - `backend/src/modules/qos/qos-routes.ts`
  - `frontend/src/components/QosLimiter.jsx`
  - `backend/src/utils/sys.ts`
- correcao aplicada:
  - o backend do QoS passou a herdar automaticamente, por VLAN, os VIPs ativos vindos de `policy_exceptions` e da tabela legada `dns_vip`
  - o runtime efetivo agora aplica a uniao de:
    - VIPs manuais do QoS em `net_qos_vips`
    - VIPs institucionais ativos herdados automaticamente
  - a resposta de `/api/qos` passou a expor:
    - `vips` manuais
    - `inherited_vips`
    - `effective_vips`
  - a UI de QoS passou a mostrar os VIPs herdados automaticamente do SGCG e o total efetivo priorizado no runtime
  - o parser do `defaultClass` foi corrigido para reconhecer `default 0x10` como classe `1:10`, eliminando falso estado de `runtime_synced=false`
  - o servico legado `fireqos.service` foi desabilitado e parado para evitar divergencia futura com o runtime oficial do SGCG
- validacao:
  - `cd backend && npm run build` concluido com sucesso em `2026-05-08`
  - `cd frontend && npm run build` concluido com sucesso em `2026-05-08`
  - `pm2 restart bcc-backend --update-env`
  - `pm2 restart bcc-frontend --update-env`
  - `systemctl is-enabled fireqos` -> `disabled`
  - `systemctl is-active fireqos` -> `inactive`
  - `POST /api/qos/reconcile` validado com token administrativo local
  - `GET /api/qos` passou a refletir runtime sincronizado:
    - `enp6s0.10` com `vip_count=11`, `manual_vip_count=6`, `inherited_vip_count=9`, `runtime_synced=true`
    - `enp6s0.50` com `vip_count=1`, `inherited_vip_count=1`, `runtime_synced=true`
  - `tc filter show dev enp6s0.10 parent 1:` e `tc filter show dev ifb10 parent 1:` confirmaram `11` filtros `flowid 1:20`
  - `tc filter show dev enp6s0.50 parent 1:` e `tc filter show dev ifb50 parent 1:` confirmaram o VIP herdado `192.168.50.26`

## 2026-05-08 - QoS voltou ao modo manual e bypass reaplicado

- decisao operacional:
  - o QoS deve trabalhar apenas com os VIPs cadastrados manualmente no proprio modulo
  - VIP institucional de `policy_exceptions` e `dns_vip` nao deve entrar automaticamente no `tc`
- arquivos alterados:
  - `backend/src/modules/qos/qos-routes.ts`
  - `frontend/src/components/QosLimiter.jsx`
- ajuste aplicado:
  - removida a heranca automatica de VIPs no backend do QoS
  - removidos da resposta de `/api/qos` os campos `inherited_vips` e `effective_vips`
  - a UI do QoS voltou a exibir apenas os VIPs cadastrados manualmente
  - mantida a correcao do parser de `defaultClass` para leitura fiel do runtime `tc`
- bypass reaplicado:
  - `POST /api/qos/reconcile` executado apos a remocao da heranca automatica
  - o kernel voltou a respeitar apenas os IPs manuais cadastrados
- validacao:
  - `cd backend && npm run build` concluido com sucesso em `2026-05-08`
  - `cd frontend && npm run build` concluido com sucesso em `2026-05-08`
  - `pm2 restart bcc-backend --update-env`
  - `pm2 restart bcc-frontend --update-env`
  - `GET /api/qos` confirmou:
    - `enp6s0.10` com `vip_count=6` e `runtime_synced=true`
    - `enp6s0.50` com `vip_count=0` e `runtime_synced=true`
  - `tc filter show dev enp6s0.10 parent 1:` e `tc filter show dev ifb10 parent 1:` confirmaram `6` filtros `flowid 1:20`
  - `tc filter show dev enp6s0.50 parent 1:` e `tc filter show dev ifb50 parent 1:` confirmaram ausencia de VIP manual nessa VLAN

## 2026-05-08 - Hotspot sem data de nascimento, com celular e login por codigo SMS

- decisao operacional:
  - o cadastro do Hotspot nao deve mais pedir `data de nascimento`
  - o identificador principal continua sendo o `CPF`
  - o contato para recuperacao passa a ser `celular` com entrada apenas de `DDD + numero`
  - o SGCG deve assumir `+55` automaticamente no envio do SMS
  - como a senha do Hotspot fica armazenada em `hash argon2`, o sistema nao consegue reenviar a senha atual em texto puro
  - para resolver o problema real de esquecimento sem forcar troca de senha, o portal agora faz `CPF -> codigo SMS -> entrar`
- arquivos alterados:
  - `backend/src/config/env.ts`
  - `backend/src/modules/hotspot/hotspot-routes.ts`
  - `frontend/src/pages/HotspotPortal.jsx`
  - `frontend/src/pages/Hotspot.jsx`
- ajuste aplicado:
  - removido `birth_date` do schema do Hotspot com `ALTER TABLE hotspot_visitors DROP COLUMN IF EXISTS birth_date`
  - adicionada coluna `phone` em `hotspot_visitors`
  - criado o armazenamento de codigos temporarios em `hotspot_password_resets`
  - o cadastro publico e o cadastro administrativo agora exigem:
    - `nome completo`
    - `CPF`
    - `celular`
    - `senha`
  - o portal publico ganhou `Esqueci minha senha` na tela de login
  - o fluxo final de recuperacao ficou assim:
    - usuario informa apenas o `CPF`
    - o backend busca o celular ja cadastrado
    - o SGCG envia uma `senha provisoria` por SMS com validade configuravel
    - o portal abre o segundo passo com:
      - `senha provisoria`
      - `nova senha`
      - `confirmar nova senha`
    - a nova senha so e salva quando os dois campos coincidirem
    - a senha provisoria e de uso unico e deixa de valer apos o uso ou expiracao
  - a integracao do SGCG ficou preparada para gateway SMS autohospedado via `SMSGate`
- variaveis de ambiente preparadas:
  - `HOTSPOT_SMS_PROVIDER`
  - `HOTSPOT_SMS_BASE_URL`
  - `HOTSPOT_SMS_USERNAME`
  - `HOTSPOT_SMS_PASSWORD`
  - `HOTSPOT_OTP_MINUTES`
- validacao:
  - `cd backend && npm run build` concluido com sucesso em `2026-05-08`
  - `cd frontend && npm run build` concluido com sucesso em `2026-05-08`
  - `pm2 restart bcc-backend --update-env`
  - `pm2 restart bcc-frontend --update-env`
  - `curl http://127.0.0.1:6778/api/hotspot/public/context` respondeu normalmente apos o restart
  - o banco confirmou o novo estado estrutural:
    - `hotspot_visitors` agora possui a coluna `phone`
    - `birth_date` nao existe mais na tabela
    - `hotspot_password_resets` foi criada
  - retrato do cadastro validado no banco nesta data:
    - `18` visitantes no total no primeiro snapshot
    - `18` visitantes ativos no primeiro snapshot
    - `0` visitantes ainda com celular preenchido no legado
- observacao operacional importante:
  - o fluxo `Esqueci minha senha` ja esta no sistema, mas os cadastros antigos do Hotspot ainda precisam receber celular para que o SMS funcione na pratica
  - sem configurar o `SMSGate` no ambiente, o backend respondera falha de envio ao tentar mandar SMS
  - por seguranca, o SGCG nao envia a senha atual do usuario porque ela nao existe em texto puro no banco; o que vai por SMS e apenas a senha provisoria descartavel

## 2026-05-08 - SMSGate privado publicado no console e cadastro do Jhoelber removido para recadastro validado

- decisao operacional:
  - para viabilizar o teste de hoje sem depender de DNS/certificado novo, o `SMSGate` privado foi publicado por prefixo dentro do dominio ja valido `console.jacarezinho.cloud`
  - o caminho escolhido para o app Android foi `https://console.jacarezinho.cloud/smsgate/api/mobile/v1`
- infraestrutura aplicada:
  - stack do SMSGate criada em `/etc/sgcg/smsgate`
  - configuracao oficial baseada em `private mode`
  - banco do SMSGate aproveitando o `MariaDB` local do host em `127.0.0.1:3306`
  - subida validada com Docker em `host network`, evitando conflito com a cadeia `DOCKER-FORWARD` do host
  - o worker do SMSGate mostrou-se suficiente para expor a API HTTP e executar as tarefas de manutencao, entao o contêiner extra do `server` foi removido
- publicacao aplicada:
  - `nginx` do console passou a encaminhar `^~ /smsgate/` para `http://127.0.0.1:3010/`
  - o backend do SGCG foi alinhado para o endpoint oficial atual do SMSGate:
    - rota `POST /3rdparty/v1/messages`
    - payload `textMessage: { text: ... }`
  - o texto institucional do SMS do Hotspot ficou padronizado como:
    - `Prefeitura de Jacarezinho - Hotspot Institucional: sua senha provisoria e <codigo>. Validade: 5 minutos. Nao compartilhe este codigo.`
- operacao para o Android:
  - URL do app:
    - `https://console.jacarezinho.cloud/smsgate/api/mobile/v1`
  - token privado:
    - `49db4c8e12959f5f1329cf0caea92ae438cddab64807f028`
  - apos o primeiro pareamento, o app vai mostrar `username` e `password`
  - para plugar isso no SGCG sem editar arquivo manualmente:
    - `bash /opt/controlebeckercorp-v8/backend/340_set_smsgate_credentials.sh <username> <password>`
- limpeza solicitada:
  - o cadastro `Jhoelber lopes Pinheiro` foi removido de `hotspot_visitors`
  - isso libera o recadastro completo com celular pelo portal publico
- validacao:
  - `docker compose -f /etc/sgcg/smsgate/docker-compose.yml up -d --remove-orphans`
  - `curl http://127.0.0.1:3010/health` respondeu `{"status":"pass","version":"1.41.0"...}`
  - `curl https://console.jacarezinho.cloud/smsgate/health` respondeu `{"status":"pass","version":"1.41.0"...}`
  - `docker ps` confirmou `sgcg-smsgate-worker` como `healthy`
  - `psql ... select count(*) ... Jhoelber ...` retornou `0`

## 2026-05-08 - Hotspot com auto-login na recuperacao e SMSGate com autobind do emissor

- ajustes funcionais do portal de recuperacao:
  - o fluxo `Esqueci minha senha` passou a concluir com sessao imediata no `Hotspot`
  - depois de validar `CPF + senha provisoria + nova senha + confirmar nova senha`, o backend agora:
    - atualiza a senha
    - associa o `MAC` ao visitante
    - cria/atualiza o dispositivo
    - abre a sessao do `Hotspot`
    - devolve `redirect_url` para o frontend concluir o `ok -> conectado`
  - o pedido inicial de recuperacao deixou de vazar existencia de cadastro ou telefone:
    - tanto para `CPF` inexistente quanto para cadastro sem celular valido, a resposta publica fica padronizada em `Se os dados conferirem, o código será enviado por SMS.`
- ajuste estrutural do `SMSGate`:
  - a stack foi consolidada com dois processos:
    - `sgcg-smsgate-server` em `127.0.0.1:3010`
    - `sgcg-smsgate-worker` em `127.0.0.1:3011`
  - isso substitui a leitura anterior de que apenas o `worker` bastaria para a API HTTP
- nova estrategia de integracao do `Hotspot` com `SMSGate`:
  - o backend ganhou suporte a envio por `JWT Bearer` assinado localmente com o `jwt.secret` do proprio `SMSGate`
  - o envio usa escopo `messages:send` e pode apontar diretamente para `HOTSPOT_SMS_DEVICE_ID`
  - o fallback por `Basic` com `HOTSPOT_SMS_USERNAME` e `HOTSPOT_SMS_PASSWORD` foi preservado
- automacao criada para o emissor:
  - novo script `backend/341_autobind_smsgate_sender.sh`
  - novo `systemd timer` `sgcg-smsgate-autobind.timer`
  - a cada `60 segundos`, o host:
    - consulta o banco `sms`
    - identifica o dispositivo Android emissor mais recente
    - atualiza `backend/.env` com:
      - `HOTSPOT_SMS_USER_ID`
      - `HOTSPOT_SMS_DEVICE_ID`
      - `HOTSPOT_SMS_JWT_SECRET`
      - `HOTSPOT_SMS_JWT_ISSUER`
    - reinicia `bcc-backend` apenas se houver mudanca
  - isso elimina a necessidade de copiar manualmente o `username/password` gerado pelo app Android para o backend do `Hotspot`
- emissor tecnico preparado nesta rodada:
  - usuario tecnico confirmado no `SMSGate`: `SGCGGW`
  - senha tecnica registrada para compatibilidade: `SgcgSms@2026`
  - dispositivo emissor atualmente vinculado no `backend/.env`:
    - `HOTSPOT_SMS_USER_ID=SGCGGW`
    - `HOTSPOT_SMS_DEVICE_ID=sROhMPL9Oc8fy3k1hpC_f`
  - o usuario/dispositivo experimental `SO_M07` criado durante a investigacao foi removido do banco `sms`
- validacao:
  - `cd backend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend --update-env` executado com sucesso
  - `systemctl enable --now sgcg-smsgate-autobind.timer` executado com sucesso
  - `systemctl status sgcg-smsgate-autobind.timer` confirmou `active (waiting)`
  - `curl http://127.0.0.1:3010/health` respondeu `status=pass`
  - `curl http://127.0.0.1:3011/health` respondeu `status=pass`
  - envio de teste direto para `POST /api/3rdparty/v1/messages` com `Bearer JWT` local retornou `202 Accepted`
  - teste controlado de ponta a ponta no `Hotspot` com cadastro temporario validou:
    - `POST /api/hotspot/public/password-recovery/request` respondeu `200`
    - a mensagem na fila do `SMSGate` trouxe o texto institucional com codigo de `6` digitos
    - `POST /api/hotspot/public/password-recovery/reset` respondeu `authenticated=true`
    - a sessao do `Hotspot` foi criada com `auth_method=password_recovery`
- observacao operacional:
  - o SMS fisico continua dependendo do aparelho Android com o chip emissor ficar `Online` no app `SMSGate`
  - depois que esse aparelho conectar com:
    - `API URL = https://console.jacarezinho.cloud/smsgate/api/mobile/v1`
    - `Private Token = 49db4c8e12959f5f1329cf0caea92ae438cddab64807f028`
  - o host passa a absorver automaticamente o emissor real para o `Hotspot`, sem nova edicao manual do `.env`

## Hotspot - preservacao do nono digito no celular e saneamento dos cadastros SMS - 2026-05-08

- arquivos alterados:
  - `backend/src/modules/hotspot/hotspot-routes.ts`
  - `frontend/src/pages/HotspotPortal.jsx`
  - `frontend/src/pages/Hotspot.jsx`
- correcao aplicada:
  - o `Hotspot` passou a tratar o campo de telefone explicitamente como `celular movel` para o fluxo de `SMS`
  - numeros com `DDD + 8 digitos` que claramente representam celular salvo sem o nono digito agora sao corrigidos para o formato canonico `DDD + 9 + numero`
  - exemplos cobertos pela nova normalizacao:
    - `4388233543` -> `43988233543`
    - `5543988233543` -> `43988233543`
  - numeros de perfil tipico de telefone fixo, como `DDD + 8 digitos` iniciando em `2` a `5`, deixaram de ser aceitos como celular para o fluxo do `Hotspot`
- saneamento aplicado no banco:
  - `hotspot_visitors.phone` passou por correcao imediata para reinserir o nono digito em registros de `10` digitos com perfil de celular movel
  - o cadastro validado durante a rodada, que estava salvo como `4396619529`, foi corrigido para `43996619529`
- ajustes de interface:
  - o portal publico e o modulo administrativo passaram a orientar o preenchimento como `DDD + celular com 9 digitos`
  - a mascara de telefone continua exibindo o formato brasileiro, mas agora tolera entrada com `+55` sem propagar o prefixo para a base local
- validacao:
  - teste sintetico da regra confirmou:
    - `43988233543` permanece `43988233543`
    - `4388233543` passa a `43988233543`
    - `4335261234` retorna invalido como celular
  - `cd backend && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend --update-env` executado com sucesso

## Hotspot - fail-safe para nao prender em "Verificando dispositivo..." - 2026-05-08

- arquivo alterado:
  - `frontend/src/pages/HotspotPortal.jsx`
- sintoma observado:
  - em aparelho real o portal podia ficar preso apenas em `Verificando dispositivo...`
  - no runtime da VLAN 70, os logs do vhost cativo mostravam entrega normal do app e de `GET /api/hotspot/public/context` com `200`, entao o travamento perceptivel ficou concentrado na espera do frontend pela identificacao automatica
- correcao aplicada:
  - o carregamento inicial do `HotspotPortal` ganhou timeout explicito de `8 segundos` para a consulta `GET /api/hotspot/public/context`
  - se a checagem automatica nao responder nesse prazo, o portal:
    - abandona o spinner
    - assume estado manual de `requires_login`
    - libera a tela de `login/cadastro`
    - informa ao usuario que a identificacao automatica demorou demais
  - isso evita que o WebView do captive portal fique indefinidamente preso em `Verificando dispositivo...`
- observacoes de runtime confirmadas na rodada:
  - `GET http://192.168.70.1/hotspot/portal` retornou `200 OK` com o bundle atual do frontend
  - `GET http://192.168.70.1/generate_204` com `Host: connectivitycheck.gstatic.com` retornou o app do portal com `window.__SGCG_FORCE_PORTAL="hotspot"`
  - `GET http://192.168.70.1/api/hotspot/public/context` com `X-Forwarded-For: 192.168.70.101` retornou `200` com JSON valido
  - o access log dedicado `/var/log/nginx/sgcg-hotspot-captive.access.log` mostrou clientes reais carregando:
    - HTML do captive portal
    - assets do bundle
    - `GET /api/hotspot/public/context`
- validacao:
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-frontend --update-env` executado com sucesso

## Hotspot - correcao da liberacao runtime apos autenticacao reconhecida - 2026-05-08

- arquivos alterados:
  - `backend/src/modules/hotspot/hotspot-routes.ts`
  - `backend/src/modules/collaborators/collaborators-routes.ts`
  - `frontend/src/pages/HotspotPortal.jsx`
- sintoma observado:
  - no portal do `Hotspot`, alguns dispositivos reconhecidos ou autenticados ficavam presos em loading ao tentar navegar
  - a consulta real `GET /api/hotspot/public/context` para cliente da `VLAN 70` retornava `authenticated=true`, mas com `session.runtime_authorized=false`
  - com isso, o frontend seguia para o redirecionamento externo, porém a camada de rede nao havia incluido o IP no set de liberacao
- causa raiz validada:
  - o host ja possuia o `ipset` `sgcg_hotspot_v70_auth` criado com `timeout 43200`
  - o backend tentava recriar esse mesmo set com `timeout 14400` usando `ipset create ... -exist`
  - neste `ipset v7.19`, a diferenca de timeout fazia o comando falhar com `Set cannot be created: set with the same name already exists`
  - a falha abortava a autorizacao runtime do IP, mesmo quando o portal reconhecia corretamente o usuario/dispositivo
- correcao aplicada:
  - `Hotspot` e `Collaborators` passaram a verificar primeiro se o `ipset` de autorizacao ja existe e, nesse caso, apenas reutilizam o set existente
  - a criacao do set agora so ocorre quando ele realmente nao esta presente no host
  - se a criacao do `ipset` falhar por corrida ou diferenca de estado no host, o backend agora reconsulta o set antes de tratar a situacao como erro real
  - o `HotspotPortal` deixou de redirecionar silenciosamente quando a resposta de autenticacao vier com `session.runtime_authorized=false`
  - nesses casos, o portal passa a informar explicitamente que a liberacao da navegacao nao foi confirmada na camada de rede e oferece nova tentativa de liberacao
- validacao:
  - `cd backend && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend --update-env` executado com sucesso
  - `pm2 restart bcc-frontend --update-env` executado com sucesso
  - `ipset list sgcg_hotspot_v70_auth` confirmou reaproveitamento normal do set existente
  - `curl -H 'Host: 192.168.70.1' -H 'X-Forwarded-For: 192.168.70.103' http://192.168.70.1/api/hotspot/public/context` passou a retornar `session.runtime_authorized=true`

## Hotspot - handoff direto apos Navegar na Internet - 2026-05-11

- arquivos alterados:
  - `backend/src/modules/hotspot/hotspot-routes.ts`
  - `frontend/src/pages/HotspotPortal.jsx`
- sintoma observado:
  - apos informar credenciais e clicar em `Navegar na Internet`, o portal ainda podia renderizar uma segunda tela de `dispositivo identificado`
  - em celulares reais essa segunda tela podia travar ou demorar a executar o handoff do captive portal, deixando o usuario visualmente preso mesmo apos autenticacao
  - o caminho critico de autorizacao tambem fazia reconciliacao pesada de `iptables` dentro do clique, em um host com tabela NAT muito grande, aumentando o risco de atraso perceptivel
- correcao aplicada:
  - o frontend passou a tratar login, confirmacao de MAC, cadastro com sessao imediata e recuperacao de senha como `handoff direto`
  - quando o backend retorna `authenticated=true` e `session.runtime_authorized=true`, a UI nao cai mais na tela intermediaria de detalhes do dispositivo; ela chama diretamente `http://192.168.70.1/generate_204?sgcg_handoff=...`
  - se o WebView nao fechar sozinho, a tela fallback agora mostra `Internet liberada` com botao `Continuar para a internet`, sem repetir a tela de dispositivo identificado
  - o frontend agora exige `session.runtime_authorized === true` para handoff; respostas sem confirmacao runtime continuam como erro recuperavel
  - o backend deixou de executar `ensureHotspotEnforcement()` dentro de `authorizeHotspotIp()` e `revokeHotspotIp()` no caminho publico
  - a autorizacao runtime do clique passou a ser caminho rapido:
    - garantir o `ipset` existente
    - executar `ipset add sgcg_hotspot_v70_auth <ip> timeout 14400 -exist`
    - confirmar a presenca do IP via `ipset list`, que ja e permitido pela allowlist interna
  - a tentativa de verificacao por `ipset test` foi evitada porque o `execCmd` do backend bloqueia esse comando pela allowlist
- validacao:
  - `cd backend && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend --update-env` executado com sucesso
  - `pm2 restart bcc-frontend --update-env` executado com sucesso
  - `GET http://192.168.70.1/hotspot/portal` serviu o bundle novo `index-XOzi48X0.js` com headers `no-store` e `Captive-Portal`
  - `POST http://192.168.70.1/api/hotspot/public/continue` com `X-Forwarded-For: 192.168.70.24` retornou em `0.074s` com `session.runtime_authorized=true`
  - `GET http://192.168.70.1/api/hotspot/public/context` com `X-Forwarded-For: 192.168.70.24` retornou em `0.085s` com `session.runtime_authorized=true`
  - `GET http://192.168.70.1/generate_204?sgcg_handoff=final` com `Host: connectivitycheck.gstatic.com` e `X-Forwarded-For: 192.168.70.24` retornou `204 No Content` em `0.079s`
  - `ipset list sgcg_hotspot_v70_auth` confirmou `192.168.70.24` presente no set de liberacao

## Hotspot - handoff por probe nativo do aparelho - 2026-05-11

- arquivos alterados:
  - `backend/src/modules/hotspot/hotspot-routes.ts`
  - `frontend/src/pages/HotspotPortal.jsx`
- ajuste aplicado:
  - o sucesso padrao do backend deixou de apontar para URL local do gateway e passou a usar `http://connectivitycheck.gstatic.com/generate_204`
  - o frontend passou a inferir o probe nativo a partir de `window.location`, `document.referrer` e `User-Agent`
  - destinos de handoff por sistema:
    - Android/Chrome: `http://connectivitycheck.gstatic.com/generate_204`
    - iPhone/iPad: `http://captive.apple.com/hotspot-detect.html`
    - Windows: `http://www.msftconnecttest.com/connecttest.txt`
    - Firefox: `http://detectportal.firefox.com/canonical.html`
  - quando a tela ja estiver aberta exatamente na URL do probe, como `captive.apple.com/hotspot-detect.html`, o portal agora executa `window.location.reload()` apos liberar o IP; isso forca o aparelho a buscar a mesma URL novamente, mas ja fora da interceptacao cativa
  - a tela `Internet liberada` saiu do caminho normal; so existe fallback `Finalizar conexao` se a navegacao automatica nao trocar de pagina
  - o fallback manual tambem aponta para o probe nativo do aparelho, nao para uma segunda pagina local do gateway
- validacao:
  - `cd backend && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend --update-env` executado com sucesso
  - `pm2 restart bcc-frontend --update-env` executado com sucesso
  - `GET http://192.168.70.1/hotspot/portal` serviu o bundle novo `index-BaNqBi1t.js`
  - `POST http://192.168.70.1/api/hotspot/public/continue` com `X-Forwarded-For: 192.168.70.103` retornou em `0.086s` com `session.runtime_authorized=true`
  - `GET http://192.168.70.1/api/hotspot/public/context` com `X-Forwarded-For: 192.168.70.103` retornou em `0.032s` com `session.runtime_authorized=true`
  - `GET http://192.168.70.1/api/hotspot/public/capport` com `X-Forwarded-For: 192.168.70.103` retornou `{"captive":false}`
  - `ipset list sgcg_hotspot_v70_auth` confirmou `192.168.70.103` presente no set de liberacao

## VIP 192.168.10.40 - bypass UFW/DNS/ACL/RPZ e QoS VLAN 10 - 2026-05-12

- arquivos alterados:
  - `backend-proxy/src/services/dns-contingency-service.ts`
  - `backend-proxy/src/services/proxy-engine-service.ts`
- sintoma observado:
  - o IP `192.168.10.40` estava cadastrado como VIP total em `policy_exceptions`, `dns_vip` e `proxy_vips`
  - o mesmo IP tambem estava como VIP manual do QoS em `net_qos_vips` para `enp6s0.10`
  - apesar disso, o runtime de NAT tinha acumulado dezenas de milhares de regras duplicadas vindas de reaplicacoes de UFW/before.rules, deixando a leitura de precedencia e reconciliacao do bypass fragil
- correcao aplicada:
  - adicionada deduplicacao automatica da tabela `nat` no reconciliador de contingencia/firewall do `backend-proxy`
  - a deduplicacao preserva a primeira ocorrencia de cada regra, valida com `iptables-restore --test`, limpa as cadeias base da tabela `nat` e restaura o snapshot completo ja deduplicado
  - isso evita que novos `ufw reload` feitos pelo motor acumulem copias de `PREROUTING`, `POSTROUTING`, DNS redirect, FTP 18121 e MASQUERADE
- endurecimento complementar aplicado:
  - o reconciliador de firewall passou a usar lock global em `/run/sgcg-firewall.lock`, com timeout e limpeza de lock stale, impedindo reconciliacoes simultaneas do motor
  - VIP ativo que aparecer depois do redirect DNS global ou depois dos bloqueios comuns de `FORWARD` passa a ser considerado runtime invalido; o motor remove e reinsere as regras `sgcg-vip-bypass` na precedencia correta
  - a deduplicacao automatica passou a registrar auditoria `runtime-dedupe` em `dns_contingency_audit` quando remover regras duplicadas
  - o modulo `Proxy & Logs` passou a chamar `dnsContingencyService.ensureFirewallState()` apos aplicar modo/interceptacao ou bypass emergencial, fechando a janela em que outro `ufw reload` poderia recriar duplicatas apos a contingencia DNS ja ter reconciliado
  - quando o `/etc/ufw/before.rules` gerado e identico ao arquivo atual, o reconciliador valida a configuracao mas nao regrava o arquivo nem executa `ufw reload`; ele apenas reconcilia Pontorh, VIPs e deduplicacao runtime, evitando recriar duplicatas pequenas em ciclos normais de 60 segundos
- correcao runtime:
  - backup salvo em `/opt/controlebeckercorp-v8/backups/runtime-firewall-20260512-131704`
  - removidas `58062` regras duplicadas da tabela `nat`
  - apos reinicio do `backend-proxy`, a tabela estabilizou com `nat_rules=114` e `duplicates=0`
- validacao:
  - `192.168.10.40` confirmado ativo em `policy_exceptions`, `dns_vip`, `proxy_vips` e `/etc/squid/acl/proxy_ip_bypass.acl`
  - `/etc/unbound/becker/vip-bypass.conf` contem `32.40.10.168.192.rpz-client-ip CNAME rpz-passthru.`
  - `iptables -t nat -S PREROUTING` confirmou o VIP antes do redirect DNS global `enp6s0+ --dport 53`
  - `iptables -S FORWARD` confirmou `sgcg-vip-bypass` do `192.168.10.40` antes de `SGCG SOCIAL BLOCK VLAN10` e antes do DROP global de DoT da VLAN 10
  - `tc filter show dev enp6s0.10 parent 1:` confirmou `c0a80a28` em `flowid 1:20` para download
  - `tc filter show dev ifb10 parent 1:` confirmou `c0a80a28` em `flowid 1:20` para upload
  - `unbound-checkconf` sem erros, `unbound` e `squid` ativos
  - `dig @127.0.0.1 -p 5355 prefeitura.sp.gov.br A +short` respondeu `34.144.201.80`
  - `cd backend-proxy && npm run build` concluido com sucesso
  - `pm2 restart backend-proxy --update-env` executado com sucesso
  - apos uma rodada completa do reconciliador automatico, `/run/sgcg-firewall.lock` estava liberado, `backend-proxy` online e `iptables-save -t nat` manteve `nat_rules=114` e `duplicates=0`
  - apos nova rodada sem mudanca de configuracao, a auditoria `runtime-dedupe` nao recebeu novas entradas depois de `2026-05-12 13:49:12`, confirmando que o reconciliador deixou de recriar duplicatas recorrentes quando nao ha alteracao no `before.rules`

## Resumo tecnico permanente do SGCG - 2026-05-14

- arquivo criado:
  - `RESUMO_TECNICO_SGCG.md`
- objetivo:
  - consolidar em um arquivo novo uma leitura tecnica permanente do SGCG para futuras sessoes entenderem rapidamente o que o sistema e, como opera e quais regras nao podem ser quebradas
  - transformar o historico cronologico do `CODEX.md` em referencia por arquitetura, runtime, modulos, VLANs, firewall, DNS, portais, auditoria, LGPD, QoS, instalador e validacao
- regra reforcada:
  - o `CODEX.md` continua sendo o documento principal e inegociavel de continuidade
  - toda rodada que altere estrutura, visual, funcionalidade, arquitetura, runtime, build ou validacao deve registrar o fechamento neste arquivo
  - documentos complementares podem existir, mas nao substituem o registro obrigatorio no `CODEX.md`
- escopo do resumo:
  - identidade do sistema `SGCG - Sistema de Governanca e Controle Governamental`
  - eixos permanentes `Governanca` e `Controle`
  - papeis de `frontend`, `backend`, `backend-proxy`, Nginx, PostgreSQL e runtime Linux
  - regras de UFW como firewall oficial e uso complementar de `iptables`, `ipset`, `tc`, `conntrack`, Unbound e Squid
  - contratos criticos de PontoRH/OpenDNS, VLAN 70, Hotspot, Colaboradores VLAN 30, VIPs, Relatorios Forenses, LGPD, QoS, Bloqueio Total, contingencia DNS, WhatsApp, SMSGate, console interno, instalador e identidade de endpoints
- validacao:
  - alteracao documental apenas
  - nenhum build foi necessario

## Perfil tecnico do agente registrado nos documentos principais - 2026-05-14

- arquivos alterados:
  - `CODEX.md`
  - `RESUMO_TECNICO_SGCG.md`
- ajuste aplicado:
  - registrado que, ao atuar no SGCG, o agente deve assumir postura de engenheiro, arquiteto e desenvolvedor senior de sistemas GovTech
  - registrado tambem o papel de diretor, projetista, analista, desenvolvedor de frontend, UX, UI e backend senior
  - o texto foi refletido tanto no documento principal de continuidade quanto no resumo tecnico permanente
- validacao:
  - alteracao documental apenas
  - nenhum build foi necessario

## Arquitetura de autenticacao VLAN 50 sem portal - 2026-05-14

- arquivo criado:
  - `docs/ARQUITETURA_AUTENTICACAO_VLAN50_8021X_RADIUS.md`
- objetivo:
  - registrar a arquitetura recomendada para exigir login e senha na `VLAN 50` sem portal cativo, com experiencia semelhante a rede corporativa/AD
  - preservar auditoria completa, correlacao forense e aderencia a LGPD e ao Marco Civil da Internet
- decisao arquitetural proposta:
  - usar `802.1X` com `FreeRADIUS`
  - manter o SGCG como console de identidade, grupos, dispositivos, sessoes, auditoria, relatorios e governanca
  - configurar APs/switches da `VLAN 50` como clientes RADIUS
  - usar accounting RADIUS para registrar inicio, fim, duracao e volume de sessoes quando suportado pelo equipamento
  - correlacionar sessoes RADIUS com `DHCP`, `dns_policy_events`, `navigation_events`, UFW/proxy e Relatorios Forenses
- regra funcional:
  - nao usar portal cativo para este objetivo na `VLAN 50`
  - a autenticacao deve ocorrer antes da liberacao da rede, via prompt nativo do sistema operacional em Wi-Fi Enterprise ou porta cabeada 802.1X
  - a navegacao autenticada continua sujeita as politicas institucionais existentes de DNS, RPZ, UFW, proxy, QoS e auditoria
- conformidade:
  - o documento registra os fundamentos de desenho para LGPD, incluindo finalidade, adequacao, necessidade, seguranca, transparencia e responsabilizacao
  - o documento registra o Marco Civil da Internet como referencia para guarda sigilosa e segura de registros de conexao
  - o desenho evita captura de conteudo privado de paginas HTTPS e foca em metadados necessarios para seguranca e prestacao de contas
- validacao:
  - alteracao documental apenas
  - nenhum build foi necessario

## Hotspot SMS - integracao inicial com Integrax - 2026-05-14

- arquivos alterados:
  - `backend/src/config/env.ts`
  - `backend/src/modules/hotspot/hotspot-routes.ts`
  - `backend/.env.example`
  - `backend/341_autobind_smsgate_sender.sh`
  - `backend/.env` local nao versionado
- objetivo:
  - permitir que a recuperacao de senha do Hotspot envie SMS por API profissional da Integrax, sem depender obrigatoriamente do aparelho Android/SMSGate
  - preservar o SMSGate como provider configuravel/fallback
- implementacao:
  - `HOTSPOT_SMS_PROVIDER=integrax` passa a acionar a API externa da Integrax
  - endpoint usado: `POST https://sms.aresfun.com/v1/integration/{TOKEN}/send-sms`
  - payload enviado pelo SGCG:
    - `to`: numero brasileiro em formato `55DDDNONODIGITO`
    - `from`: remetente/shortcode configurado em `HOTSPOT_SMS_FROM`
    - `message`: texto institucional ja gerado pelo fluxo do Hotspot
  - `HOTSPOT_SMS_API_KEY` passa a armazenar o token local da Integrax no `.env` nao versionado
  - `HOTSPOT_SMS_FROM` foi adicionado ao `env.ts` e ao `.env.example`
  - o `SMSGate` antigo continua suportado quando `HOTSPOT_SMS_PROVIDER=smsgate`
- protecao operacional:
  - o script `backend/341_autobind_smsgate_sender.sh` agora respeita provider diferente de `smsgate`
  - se o `.env` estiver com `HOTSPOT_SMS_PROVIDER=integrax`, o autobind do SMSGate sai sem reescrever provider/base/token e sem reiniciar o backend
  - isso evita que o timer do SMSGate reverta automaticamente o teste da Integrax
- validacao:
  - documentacao externa consultada em `https://www.integrax.app/dashboard/external/docs`
  - `cd backend && npm run build` concluido com sucesso
  - chamada de saldo `GET /v1/integration/{TOKEN}/consult/credits` retornou `404`, indicando que essa rota nao esta disponivel para este token/base ou escopo
  - chamada controlada ao endpoint real de SMS com `to=[]` retornou `400` com `NO_PHONE_NUMBER`, confirmando que base URL, token e rota `send-sms` foram reconhecidos pela API sem disparar SMS real
  - `bash backend/341_autobind_smsgate_sender.sh` retornou `autobind do SMSGate ignorado: HOTSPOT_SMS_PROVIDER=integrax`
  - `pm2 restart bcc-backend --update-env` executado e `bcc-backend` ficou `online`
  - `curl http://127.0.0.1:6778/api/ping` respondeu `{"msg":"Pong HTTP (Core 6778)"}`
- pendencia de teste real:
  - falta informar um numero de telefone ou CPF de visitante autorizado para disparar um SMS real de recuperacao e validar recebimento no aparelho
  - o token da Integrax nao foi registrado neste arquivo por seguranca

## Hotspot SMS - teste real de recuperacao via Integrax - 2026-05-14

- objetivo:
  - validar o fluxo real de recuperacao de senha do Hotspot usando `HOTSPOT_SMS_PROVIDER=integrax`
- teste executado:
  - usado CPF de visitante autorizado informado pelo operador, registrado aqui apenas de forma mascarada
  - o cadastro ativo foi localizado com celular mascarado `41*******22`
  - chamada executada contra o backend local:
    - `POST http://127.0.0.1:6778/api/hotspot/public/password-recovery/request`
    - `X-Forwarded-For: 192.168.70.250`
  - resposta HTTP:
    - `200`
    - `{"success":true,"message":"Se os dados conferirem, o código será enviado por SMS."}`
- validacao no banco:
  - criada entrada recente em `hotspot_password_resets`
  - telefone registrado de forma mascarada: `41*******22`
  - janela de validade: 5 minutos
  - `used_at=null` apos o disparo, aguardando uso do codigo
- resultado:
  - o fluxo do SGCG aceitou a recuperacao e nao recebeu erro da Integrax no disparo
  - a validacao final depende de confirmacao fisica do recebimento do SMS no aparelho do visitante
- seguranca:
  - CPF completo, codigo OTP e token Integrax nao foram registrados neste arquivo

## Hotspot SMS - correcao de telefone do visitante e novo disparo Integrax - 2026-05-14

- diagnostico:
  - o painel da Integrax indicava entrega, mas o operador nao recebeu o SMS
  - a primeira verificacao no SGCG mostrou que o visitante estava cadastrado com telefone de destino em `DDD 41`, final `0422`
  - o operador esclareceu que o telefone correto do visitante deveria ser `DDD 43`, final `2342`
  - portanto a falha percebida nao estava no backend nem necessariamente na Integrax: o SGCG estava usando um telefone cadastrado incorreto para o visitante
- correcao aplicada:
  - cadastro ativo do visitante foi atualizado para telefone com `DDD 43`, final `2342`
  - o reset gerado para o telefone antigo `DDD 41`, final `0422`, foi invalidado com `used_at`
  - novo disparo de recuperacao foi executado pelo fluxo oficial:
    - `POST http://127.0.0.1:6778/api/hotspot/public/password-recovery/request`
    - resposta `200`
- validacao:
  - `hotspot_visitors` confirmou o visitante ativo com `DDD 43`, final `2342`
  - `hotspot_password_resets` criou novo registro ativo com `DDD 43`, final `2342`
  - o registro antigo com `DDD 41`, final `0422`, ficou com `used_at` preenchido para nao permanecer utilizavel
- seguranca:
  - CPF completo, telefone completo, codigo OTP e token Integrax nao foram registrados neste arquivo
- pendencia:
  - confirmar fisicamente se o SMS chegou ao aparelho correto apos o novo disparo para `DDD 43`, final `2342`

## Hotspot SMS - rollback para SMSGate e remocao da Integrax - 2026-05-14

- decisao operacional:
  - a Integrax nao possui numero/remetente proprio adequado para o fluxo testado
  - o usuario solicitou rollback para `SMSGate` e exclusao da integracao Integrax
- rollback aplicado:
  - o codigo do backend voltou a suportar apenas o provider `smsgate` no fluxo de recuperacao de senha do Hotspot
  - referencias a `Integrax`, `aresfun`, `send-sms` e `HOTSPOT_SMS_FROM` foram removidas dos arquivos versionaveis do backend
  - o `.env` local voltou para:
    - `HOTSPOT_SMS_PROVIDER=smsgate`
    - `HOTSPOT_SMS_BASE_URL=https://console.jacarezinho.cloud/smsgate/api`
  - o token de teste da Integrax foi removido do `.env` local
  - o `backend/341_autobind_smsgate_sender.sh` voltou a operar normalmente para manter o emissor Android vinculado ao Hotspot
- validacao:
  - `bash backend/341_autobind_smsgate_sender.sh` confirmou emissor SMSGate ja vinculado ao Hotspot
  - `cd backend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend --update-env` executado
  - `curl http://127.0.0.1:6778/api/ping` respondeu `{"msg":"Pong HTTP (Core 6778)"}`
  - `curl https://console.jacarezinho.cloud/smsgate/health` respondeu `status=pass`
  - busca em `backend/src`, `backend/.env.example`, `backend/341_autobind_smsgate_sender.sh` e `backend/.env` nao encontrou mais referencias a Integrax, `aresfun`, `HOTSPOT_SMS_FROM`, token de teste ou endpoint `send-sms`
- observacao:
  - os registros anteriores no `CODEX.md` permanecem como historico da tentativa e do diagnostico, mas o runtime atual do Hotspot voltou para `SMSGate`

## Hotspot SMS - teste apos rollback para SMSGate - 2026-05-14

- objetivo:
  - testar o mesmo CPF informado pelo operador apos o rollback da Integrax para `SMSGate`
- estado antes do disparo:
  - visitante ativo localizado com telefone mascarado `DDD 43`, final `2342`
  - `SMSGate` publicado em `https://console.jacarezinho.cloud/smsgate/health` respondeu `status=pass`
  - containers `sgcg-smsgate-server` e `sgcg-smsgate-worker` estavam `healthy`
- teste executado:
  - `POST http://127.0.0.1:6778/api/hotspot/public/password-recovery/request`
  - `X-Forwarded-For: 192.168.70.250`
  - resposta HTTP `200`
  - resposta JSON: `{"success":true,"message":"Se os dados conferirem, o código será enviado por SMS."}`
- validacao no banco:
  - novo registro ativo em `hotspot_password_resets`
  - telefone mascarado: `DDD 43`, final `2342`
  - validade de 5 minutos
  - `used_at=null` apos o disparo
  - reset anterior para o mesmo telefone foi marcado como usado no momento da nova solicitacao, preservando apenas um codigo ativo
- pendencia:
  - confirmar fisicamente se o SMS enviado pelo `SMSGate` chegou ao aparelho correto
- seguranca:
  - CPF completo, telefone completo e codigo OTP nao foram registrados neste arquivo

## IA em Operacoes Tecnicas - insights operacionais acionaveis - 2026-05-17

- objetivo:
  - criar uma camada inicial de `IA em Operacoes Tecnicas` dentro do modulo `Operacoes Tecnicas`
  - entregar diagnostico acionavel, com causa provavel, impacto, evidencias e acao recomendada, sem aplicar mudancas automaticamente no runtime
  - manter a IA como leitura operacional orientada por evidencias reais do SGCG, nao como chat generico
- arquivos alterados nesta rodada:
  - `backend/src/modules/control/control-routes.ts`
  - `frontend/src/pages/Control.jsx`
  - `CODEX.md`
- backend:
  - adicionada rota autenticada `GET /api/control/ai-insights`
  - a rota cruza sinais de:
    - estado systemd de servicos tecnicos essenciais
    - tabela `nat` via `iptables-save -t nat`
    - bloqueios recentes em `access_events`
    - bypass emergencial em `emergency_vlan_bypass`
    - Bloqueio Total em `total_vlan_blocks`
    - sessoes Hotspot ativas/vencidas em `hotspot_sessions`
    - achados pendentes em `control_antimalware_findings`
    - ultima auditoria `runtime-dedupe` em `dns_contingency_audit`
  - o retorno e explicitamente `mode=read-only`
  - os insights sao classificados como `critical`, `warning`, `info` ou `success`
  - cada insight inclui:
    - `title`
    - `probable_cause`
    - `impact`
    - `evidence`
    - `recommendation`
    - `action`
- frontend:
  - adicionada secao `IA em Operações Técnicas` no topo do modulo `Operações Técnicas`
  - a secao mostra resumo de NAT, bloqueios 24h/5min, servicos lidos e ultima analise
  - cada card de insight apresenta severidade, causa provavel, impacto, acao recomendada e evidencias tecnicas
  - adicionada acao visual `Atualizar`, reaproveitando o carregamento do modulo
  - a interface deixa claro que a camada e somente leitura e nao executa automacao sem operador
- validacao:
  - `cd backend && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend --update-env` executado; processo ficou `online`
  - `pm2 restart bcc-frontend --update-env` executado; processo ficou `online`
  - `curl http://127.0.0.1:6778/api/ping` respondeu `{"msg":"Pong HTTP (Core 6778)"}`
  - chamada sem JWT para `GET /api/control/ai-insights` respondeu `{"error":"Token ausente."}`, confirmando protecao pela guarda global
  - chamada autenticada localmente com JWT temporario de validacao retornou HTTP `200`
  - payload validado na chamada autenticada:
    - `model=SGCG IA operacional heurística v1`
    - `mode=read-only`
    - `services_checked=8`
    - `nat_rules=129`
    - `nat_duplicates=0`
    - `blocked_24h=0`
    - `blocked_5m=0`
    - insight retornado: `Operação técnica sem anomalia crítica`
- decisao operacional:
  - esta primeira versao nao usa provider externo de IA e nao envia dados sensiveis para fora do SGCG
  - a classificacao atual e heuristica, local e auditavel
  - proxima evolucao natural: botao `Investigar` abrir o recorte exato no modulo relacionado, por exemplo daemon, NAT, Hotspot, ClamAV, Bloqueios/Liberacoes ou Relatorios Forenses

## IA em Operacoes Tecnicas - correcao da acao de observacao - 2026-05-17

- problema identificado:
  - o insight de estado normal retornava a acao `Manter observação`
  - na interface, o botao de acao do card era apenas visual e nao executava nenhuma abertura de diagnostico
  - isso gerava uma experiencia errada: parecia uma opcao operacional, mas nao fazia nada
- correcao aplicada:
  - o backend passou a retornar `Ver observação` para o insight `steady-state`
  - o frontend passou a tratar o clique de qualquer acao de insight
  - ao clicar, abre um modal de investigacao/observacao com:
    - severidade
    - horario da analise
    - causa provavel
    - impacto
    - evidencias lidas
    - proximo passo operacional
  - para o insight `steady-state`, o modal explica explicitamente que a observacao serve como ponto de controle dos sinais lidos, sem reiniciar servicos, sem liberar politicas e sem substituir validacao quando houver reclamacao real de usuario
  - insights de daemon, excecao de VLAN e ClamAV tambem direcionam a rolagem para a secao operacional relacionada quando aplicavel
- arquivos alterados nesta correcao:
  - `backend/src/modules/control/control-routes.ts`
  - `frontend/src/pages/Control.jsx`
  - `CODEX.md`
- validacao:
  - `cd backend && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend --update-env` executado; processo ficou `online`
  - `pm2 restart bcc-frontend --update-env` executado; processo ficou `online`
  - chamada autenticada para `GET /api/control/ai-insights` retornou HTTP `200`
  - payload validado retornou `action="Ver observação"` no insight `steady-state`
  - payload manteve `mode=read-only`, `nat_rules=129`, `nat_duplicates=0`, `services_checked=8`, `blocked_24h=0` e `blocked_5m=0`

## IA em Operacoes Tecnicas - reanalise de sinais funcional no modal - 2026-05-17

- problema corrigido:
  - o botao `Reanalisar sinais` dentro do modal de insight chamava o carregamento geral do modulo, mas podia manter o modal com o insight antigo em tela
  - isso fazia a acao parecer executada sem atualizar as evidencias exibidas ao operador
- correcao aplicada:
  - adicionados estados dedicados de reanalise no frontend:
    - `aiReanalysisLoading`
    - `aiReanalysisError`
  - adicionada funcao dedicada `reanalyzeSelectedInsight`
  - ao clicar em `Reanalisar sinais`, a tela chama novamente `GET /api/control/ai-insights`
  - o payload novo atualiza `aiInsights`
  - o modal procura o insight novo pelo mesmo `id` do insight aberto
  - se o insight anterior desaparecer porque a condicao operacional mudou, o modal passa a mostrar o primeiro insight atual retornado pela IA
  - durante a reanalise, o modal mostra `Reanalisando...` e bloqueia novo clique ate terminar
  - se a chamada falhar, o erro aparece dentro do proprio modal, sem fechar o diagnostico
- arquivo alterado nesta correcao:
  - `frontend/src/pages/Control.jsx`
  - `CODEX.md`
- validacao:
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-frontend --update-env` executado; processo ficou `online`
- regra operacional reforcada:
  - acoes visiveis em insights de IA devem alterar estado real da interface ou abrir diagnostico rastreavel
  - nenhum botao do painel de IA deve permanecer como acao apenas decorativa

## Hotspot e Acesso Mobile - pesquisa com autocomplete e filtros - 2026-05-22

- objetivo:
  - facilitar a localizacao administrativa de visitantes no modulo `Hotspot`
  - facilitar a localizacao administrativa de colaboradores no modulo `Acesso Mobile de Colaboradores`
  - reduzir tempo de operacao quando houver muitos cadastros ativos/inativos
- frontend:
  - `frontend/src/pages/Hotspot.jsx` recebeu bloco `Pesquisa de visitantes` antes da tabela de visitantes
  - o campo de pesquisa do Hotspot usa autocomplete via `datalist` com nomes, CPF, celular e MAC ja carregados
  - a tabela de visitantes passou a ser filtrada em memoria por nome, CPF, celular, MAC, estado do cadastro e vinculo de dispositivo
  - `frontend/src/pages/Collaborators.jsx` recebeu bloco `Pesquisa de colaboradores` antes da tabela de colaboradores
  - o campo de pesquisa do Acesso Mobile usa autocomplete via `datalist` com nome, usuario, departamento e cargo/funcao ja carregados
  - a tabela de colaboradores passou a ser filtrada em memoria por nome, usuario, departamento, cargo/funcao, estado da conta e departamento
  - os contadores das listas indicam quantos registros estao visiveis em relacao ao total carregado
- escopo:
  - ajuste limitado ao frontend administrativo
  - nenhuma rota, schema, ipset, firewall, UFW, DNS, RPZ, ACL ou enforcement runtime foi alterado
- validacao:
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-frontend --update-env` executado; processo ficou `online`
  - `curl -sk -I https://127.0.0.1:6777/hotspot` retornou HTTP `200`
  - `curl -sk -I https://127.0.0.1:6777/colaboradores-mobile` retornou HTTP `200`

## VLAN 30 - liberacao temporaria de YouTube e Redes Sociais - 2026-05-22

- solicitacao:
  - liberar somente hoje, `2026-05-22`, YouTube e redes sociais para a `VLAN 30`
  - manter reversao automatica no fim do dia
- aplicacao:
  - criado `scripts/apply_vlan30_social_youtube_20260522.js`
  - criado `scripts/revoke_vlan30_social_youtube_20260522.js`
  - o motor `Bloqueios e Liberacoes` recebeu allowlist por VLAN 30 para:
    - categoria `YouTube`
    - categoria `Redes Sociais`
  - `release_policies` ficou com:
    - `9` dominios ativos na categoria `YouTube`
    - `50` dominios ativos na categoria `Redes Sociais`
  - o backend-proxy recompilou os artefatos e atualizou `/etc/squid/acl/allowlist-vlan-30.acl`
  - inserida regra runtime temporaria antes do DROP social da VLAN 30:
    - comentario `SGCG TEMP VLAN30 SOCIAL ALLOW 20260522`
    - origem `192.168.30.0/24`
    - interface `enp6s0.30`
    - destino `ipset sgcg_social_blocked`
    - acao `ACCEPT`
  - por causa do safe-mode atual do Unbound, com RPZ por VLAN/tag suspensa, foi adicionada excecao temporaria marcada em `/etc/unbound/becker/allowed.rpz` para nomes do YouTube necessarios a resolucao
- reversao automatica:
  - timer systemd criado:
    - `sgcg-revoke-vlan30-social-youtube-20260522.timer`
    - execucao prevista: `2026-05-22 23:59:00 -03`
  - a reversao remove:
    - allowlists temporarias `YouTube` e `Redes Sociais` da VLAN 30 em `release_policies`
    - regra runtime `SGCG TEMP VLAN30 SOCIAL ALLOW 20260522`
    - bloco temporario `SGCG TEMP VLAN30 YOUTUBE ALLOW 20260522` da RPZ allow
    - recompila/reaplica o motor de bloqueios e recarrega o Unbound se a configuracao validar
- validacao:
  - `node scripts/apply_vlan30_social_youtube_20260522.js` concluiu com `ok=true`
  - regra temporaria apareceu imediatamente antes de `SGCG SOCIAL BLOCK VLAN30` no `iptables-save -t filter`
  - `systemctl list-timers sgcg-revoke-vlan30-social-youtube-20260522.timer` confirmou proxima execucao em `2026-05-22 23:59:00 -03`
  - `unbound-checkconf` retornou sem erros
  - `systemctl is-active unbound squid` retornou `active`
  - `pm2 describe backend-proxy` confirmou processo `online`
  - `dig @127.0.0.1 youtube.com A +short` retornou IP publico
  - `dig @127.0.0.1 instagram.com A +short` retornou IP publico
  - `dig @127.0.0.1 pornhub.com A +short` permaneceu sem resposta, preservando bloqueio adulto de controle
  - excecao PontoRH/OpenDNS preservada: `iptables-save -t nat` manteve `RETURN` para `208.67.222.222` e `208.67.220.220` na interface `enp6s0.30` antes do redirect DNS global
  - consulta direta `dig @208.67.222.222 pontorh.com.br A +short` retornou IP publico

## Bloqueios e Liberacoes - UX por VLAN e global restrito - 2026-05-22

- motivo:
  - a operacao para liberar/bloquear uma categoria em uma VLAN estava burocratica e espalhada
  - o sistema induzia escopo global como caminho facil, contrariando a regra operacional desejada
- regra institucional aplicada:
  - novas politicas devem nascer por VLAN
  - politica global so e permitida para `Bloquear Pornografia`
  - liberacoes globais novas passam a ser recusadas pelo backend, mesmo se chamadas fora da UI
- frontend:
  - `frontend/src/pages/BlockingReleases.jsx` ganhou painel direto no topo: `Aplicar regra em VLAN`
  - o painel concentra `Liberar/Bloquear`, `Categoria`, `VLANs`, observacao opcional e botao `Aplicar`
  - o operador pode selecionar VLANs individualmente, `Todas` ou `Limpar`, sem navegar por abas/escopos
  - o editor de politica agora abre com escopo `VLAN(s)` por padrao
  - a opcao `Global` aparece desabilitada salvo quando a politica for bloqueio de pornografia/adulto
  - os textos da tela passaram a reforcar que global e excecao, nao fluxo normal
- backend:
  - `backend-proxy/src/services/domain-policy-manager-service.ts` agora recusa politica global fora de `block + pornografia/adulto`
  - `backend-proxy/src/services/blocking-release-service.ts` agora usa VLAN como padrao para politicas simples/categorias rapidas quando o escopo nao e informado
  - `blocking-release-service` tambem recusa categoria/politica global que nao seja bloqueio de pornografia/adulto
- validacao:
  - `cd backend-proxy && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart backend-proxy --update-env` e `pm2 restart bcc-frontend --update-env` executados; ambos ficaram `online`
  - `curl -k https://127.0.0.1:6777/bloqueios-liberacoes` retornou HTTP `200`
  - tentativa programatica de criar allowlist global de teste retornou: `Politica global permitida apenas para Bloquear Pornografia. Selecione uma ou mais VLANs.`

## VLAN 30 - janela semanal YouTube e Redes Sociais - 2026-05-22

- regra:
  - toda sexta-feira, das `08:00` as `17:00`, a `VLAN 30` fica com `YouTube` e `Redes Sociais` liberados
  - fora da janela, a liberacao semanal e removida e volta a prevalecer o bloqueio operacional
  - `Pornografia` permanece como bloqueio global mandatorio
- implementacao:
  - criado `scripts/vlan30_friday_social_youtube_window.js`
  - criado `systemd/sgcg-vlan30-social-youtube-open.service`
  - criado `systemd/sgcg-vlan30-social-youtube-open.timer`
  - criado `systemd/sgcg-vlan30-social-youtube-close.service`
  - criado `systemd/sgcg-vlan30-social-youtube-close.timer`
  - as unidades foram instaladas em `/etc/systemd/system/`
  - timers habilitados:
    - abertura: `Fri *-*-* 08:00:00 America/Sao_Paulo`
    - fechamento: `Fri *-*-* 17:00:00 America/Sao_Paulo`
  - o script `open` tambem valida a janela de horario, evitando abrir fora de sexta-feira 08-17 se o timer persistente executar apos reboot
  - o script `close` remove a allowlist semanal de `YouTube` e `Redes Sociais`, remove a regra runtime e limpa o bloco temporario de RPZ do YouTube
- runtime:
  - por hoje ser sexta-feira `2026-05-22` e estar dentro da janela, a abertura foi aplicada imediatamente
  - timer transiente antigo `sgcg-revoke-vlan30-social-youtube-20260522.timer` foi parado para a regra nova assumir o fechamento as `17:00`
  - regra runtime ativa antes do DROP social:
    - comentario `SGCG FRIDAY VLAN30 SOCIAL ALLOW 0800-1700`
    - origem `192.168.30.0/24`
    - interface `enp6s0.30`
    - destino `ipset sgcg_social_blocked`
    - acao `ACCEPT`
  - RPZ allow temporaria marcada:
    - `SGCG FRIDAY VLAN30 YOUTUBE ALLOW START`
    - `SGCG FRIDAY VLAN30 YOUTUBE ALLOW END`
- validacao:
  - `node --check scripts/vlan30_friday_social_youtube_window.js` concluido sem erro
  - `systemd-analyze calendar` validou os calendarios de abertura e fechamento
  - `systemctl list-timers 'sgcg-vlan30-social-youtube-*'` mostrou:
    - proximo fechamento: `2026-05-22 17:00:00 -03`
    - proxima abertura: `2026-05-29 08:00:00 -03`
  - timers `sgcg-vlan30-social-youtube-open.timer` e `sgcg-vlan30-social-youtube-close.timer` ficaram `enabled` e `active`
  - `node scripts/vlan30_friday_social_youtube_window.js open` retornou `ok=true`
  - banco confirmou `50` dominios em `Redes Sociais` e `9` dominios em `YouTube` para `scope_type='vlan'`, `scope_value='30'`, `created_by='sgcg-friday-vlan30-window'`
  - `iptables-save -t filter` mostrou `SGCG FRIDAY VLAN30 SOCIAL ALLOW 0800-1700` imediatamente antes de `SGCG SOCIAL BLOCK VLAN30`
  - `unbound-checkconf` retornou sem erros
  - `systemctl is-active unbound squid` retornou `active`
  - `pm2 describe backend-proxy` confirmou processo `online`
  - `dig @127.0.0.1 youtube.com A +short` retornou IP publico
  - `dig @127.0.0.1 instagram.com A +short` retornou IP publico
  - `dig @127.0.0.1 pornhub.com A +short` permaneceu sem resposta

## Bloqueios e Liberacoes - agendamentos visuais por VLAN - 2026-05-22

- motivo:
  - a liberacao por VLAN precisava deixar de depender de pedido manual e virar fluxo visual direto
  - a regra desejada e escolher VLAN, categorias, horario inicial, horario final e validade em cards
- frontend:
  - `frontend/src/pages/BlockingReleases.jsx` ganhou o bloco `Agendamentos por VLAN` na aba `Politicas & Escopos`
  - o operador cria cards com nome, VLANs, categorias, hora inicial, hora final e validade
  - modos de validade: `Toda semana`, `Somente um dia` e `Varios dias`
  - cards existentes podem ser editados, pausados/ativados ou excluidos sem procurar a politica espalhada
  - a antiga acao rapida por VLAN tambem foi corrigida para usar `PUT /category-policies`
- backend:
  - `backend-proxy/src/routes/blocking-release-routes.ts` agora expoe:
    - `GET /api/bloqueios-liberacoes/scheduled-policy-windows`
    - `POST /api/bloqueios-liberacoes/scheduled-policy-windows`
    - `PATCH /api/bloqueios-liberacoes/scheduled-policy-windows/:id`
    - `DELETE /api/bloqueios-liberacoes/scheduled-policy-windows/:id`
  - os agendamentos ficam em `data/scheduled_policy_windows.json`
  - ao salvar/editar/remover um card, o backend tenta acionar `sgcg-policy-window-reconcile.service` para aplicar imediatamente
- runtime:
  - criado `scripts/reconcile_scheduled_policy_windows.js`
  - criado `systemd/sgcg-policy-window-reconcile.service`
  - criado `systemd/sgcg-policy-window-reconcile.timer`
  - timer instalado em `/etc/systemd/system/` e habilitado a cada minuto
  - os timers antigos especificos da VLAN 30 (`sgcg-vlan30-social-youtube-open.timer` e `sgcg-vlan30-social-youtube-close.timer`) foram desabilitados; a regra agora mora no card visual
  - o reconciliador tambem limpa os marcadores antigos `SGCG FRIDAY VLAN30 ...` para evitar liberacao fora da agenda visual
- regra cadastrada:
  - `VLAN 30 - YouTube e Redes Sociais na sexta`
  - `VLAN 30`
  - categorias `YouTube` e `Redes Sociais`
  - toda sexta-feira, das `08:00` as `17:00`
- validacao:
  - `cd frontend && npm run build` concluido com sucesso
  - `cd backend-proxy && npm run build` concluido com sucesso
  - `node --check scripts/reconcile_scheduled_policy_windows.js` concluido sem erro
  - `node scripts/reconcile_scheduled_policy_windows.js` retornou `ok=true`, `schedules=1`, `changed=0`, `vlan30_media_active=true` apos estabilizar
  - `systemctl is-enabled sgcg-policy-window-reconcile.timer` retornou `enabled`
  - `systemctl is-active sgcg-policy-window-reconcile.timer` retornou `active`
  - `systemctl is-enabled sgcg-vlan30-social-youtube-open.timer sgcg-vlan30-social-youtube-close.timer` retornou `disabled`
  - `iptables-save -t filter` mostrou `SGCG SCHEDULED VLAN30 SOCIAL ALLOW` antes de `SGCG SOCIAL BLOCK VLAN30`
  - `/etc/unbound/becker/allowed.rpz` contem `SGCG SCHEDULED VLAN30 YOUTUBE ALLOW START/END`
  - banco confirmou `Redes Sociais=50` e `YouTube=9` para `scope_type='vlan'`, `scope_value='30'`, `notes='SGCG-SCHEDULE:vlan30-friday-social-youtube'`, `origin_rule='scheduled-window'`
  - `unbound-checkconf` retornou sem erros
  - `dig @127.0.0.1 youtube.com A +short` e `dig @127.0.0.1 instagram.com A +short` retornaram IP publico
  - `dig @127.0.0.1 pornhub.com A +short` permaneceu sem resposta
  - `curl -k https://127.0.0.1:6777/bloqueios-liberacoes` retornou HTTP `200`

## Bloqueios e Liberacoes - correcao de erro runtime no bundle - 2026-05-22

- problema:
  - o navegador reportou `ReferenceError: Cannot access 'Zn' before initialization` no bundle `index-BSr12SgS.js`
  - o erro ocorria ao carregar a pagina `Bloqueios e Liberacoes`, no componente minificado correspondente a `frontend/src/pages/BlockingReleases.jsx`
- causa:
  - o painel `Agendamentos por VLAN` era montado antes da inicializacao da constante `saveScheduleWindow`
  - como o JSX passava `onClick={saveScheduleWindow}` diretamente, o bundle podia acessar a constante ainda dentro da zona morta temporal do JavaScript
- correcao:
  - `saveScheduleWindow` foi convertida de arrow function atribuida a `const` para declaracao `async function saveScheduleWindow()`
  - a funcao passa a ser hoistable e fica disponivel quando o JSX do painel e criado
- escopo:
  - ajuste limitado ao frontend administrativo
  - nenhuma rota, schema, ipset, UFW, DNS, RPZ, Squid, Unbound ou regra de firewall foi alterada
- validacao:
  - `cd frontend && npm run build` concluido com sucesso
  - bundle gerado: `dist/assets/index-2FkmNol0.js`
  - `pm2 restart bcc-frontend --update-env` executado; processo ficou `online`
  - `curl -sk https://127.0.0.1:6777/bloqueios-liberacoes` serviu o HTML do app referenciando `/assets/index-2FkmNol0.js`
  - `curl -sk -I https://127.0.0.1:6777/assets/index-2FkmNol0.js` retornou HTTP `200`

## Bloqueios e Liberacoes - pornografia nunca liberavel - 2026-05-22

- regra institucional:
  - `Pornografia` e bloqueio mandatorio permanente
  - a categoria nao deve ter opcao de liberacao em nenhuma superficie operacional
  - qualquer tentativa direta por API ou rotina de criar `allow` para pornografia deve ser recusada
- frontend:
  - `frontend/src/pages/BlockingReleases.jsx` passou a remover `Pornografia` da lista de categorias quando a acao escolhida for `Liberar`
  - `Pornografia` permanece disponivel apenas quando a acao for `Bloquear`
  - `Agendamentos por VLAN` deixou de oferecer `Pornografia`, pois agendamentos visuais sao janelas de liberacao
  - a tela passou a bloquear tambem tentativas de salvar politica nomeada `allow` com texto ou dominios relacionados a pornografia
- backend:
  - `backend-proxy/src/services/blocking-release-service.ts` passou a recusar `updateCategoryPolicy` com `policy_type='allow'` para categoria, chave, descricao, notas ou dominios de pornografia/adulto
  - `backend-proxy/src/services/domain-policy-manager-service.ts` passou a recusar politicas nomeadas `allow` que mencionem pornografia/adulto no nome, descricao, governanca ou entradas
  - `backend-proxy/src/routes/blocking-release-routes.ts` passou a recusar agendamentos visuais com categoria `Pornografia`
- reconciliador:
  - `scripts/reconcile_scheduled_policy_windows.js` removeu `Pornografia` do catalogo de liberacoes agendadas
  - se um agendamento legado ou manual contiver pornografia/adulto, o reconciliador fecha/removera a janela ao inves de abrir liberacao
- validacao:
  - `cd frontend && npm run build` concluido com sucesso
  - bundle gerado: `dist/assets/index-BLjgPlcl.js`
  - `cd backend-proxy && npm run build` concluido com sucesso
  - `node --check scripts/reconcile_scheduled_policy_windows.js` concluido sem erro
  - `pm2 restart backend-proxy --update-env` e `pm2 restart bcc-frontend --update-env` executados; ambos ficaram `online`
  - teste direto no servico compilado `blockingReleaseService.updateCategoryPolicy` tentando `policy_type='allow'` para `Pornografia` retornou erro esperado: `Pornografia nunca pode ser liberada. Use apenas política de bloqueio.`
  - teste direto no servico compilado `domainPolicyManagerService.create` tentando politica nomeada `allow` para `pornhub.com` retornou o mesmo erro esperado
  - `node scripts/reconcile_scheduled_policy_windows.js` retornou `ok=true`, `schedules=1`, `changed=0`, `vlan30_media_active=true`
  - `data/scheduled_policy_windows.json` permanece somente com `YouTube` e `Redes Sociais` na agenda da `VLAN 30`
  - `curl -sk https://127.0.0.1:6777/bloqueios-liberacoes` serviu o HTML do app referenciando `/assets/index-BLjgPlcl.js`

## Bloqueios e Liberacoes - cards mais compactos nos agendamentos - 2026-05-22

- objetivo:
  - reduzir o peso visual dos cards da tela `Bloqueios e Liberacoes`
  - deixar `Aplicar regra em VLAN` e `Agendamentos por VLAN` mais agradaveis, densos e operacionais
  - corrigir excesso de fontes grandes, padding alto, botoes largos e cards com aparencia exagerada
- frontend:
  - `frontend/src/pages/BlockingReleases.jsx` reduziu os titulos dos paineis de `text-xl` para leitura mais compacta
  - os cards principais desses blocos passaram a usar `rounded-lg`, menos padding e sombras mais discretas
  - botoes de VLAN, categoria, dias da semana e acoes do card passaram para altura menor, texto menor e espaçamento reduzido
  - os cards de agendamento existentes agora exibem titulo, badges, horario, recorrencia e acoes em formato mais enxuto
  - os controles continuam com foco visivel e area clicavel suficiente para uso operacional
- escopo:
  - ajuste apenas visual no frontend administrativo
  - nenhuma rota, schema, ipset, UFW, DNS, RPZ, Squid, Unbound, agendamento systemd ou politica runtime foi alterado
- validacao:
  - `cd frontend && npm run build` concluido com sucesso
  - bundle gerado: `dist/assets/index-D5X2Qp4E.js`
  - `pm2 restart bcc-frontend --update-env` executado; processo ficou `online`
  - `curl -sk https://127.0.0.1:6777/bloqueios-liberacoes` serviu o HTML do app referenciando `/assets/index-D5X2Qp4E.js`

## Sentinela do link Nicknetwork com contra-prova externa - 2026-05-25

- objetivo:
  - separar a leitura `Secretaria -> Provedor` da leitura real `Secretaria -> Provedor -> Internet`
  - evitar falso positivo quando o gateway da Nicknetwork responde, mas a internet externa caiu
- backend:
  - `backend/src/modules/connectivity/downtime-monitor.ts` passou a monitorar dois alvos ICMP via `enp8s0`:
    - gateway Nicknetwork `186.251.14.25` como caminho `Secretaria -> Provedor`
    - Google DNS `8.8.8.8` como caminho `Secretaria -> Provedor -> Internet`
  - a sentinela grava indisponibilidade em `net_link_downtime` somente apos 10 falhas consecutivas, com amostragem a cada 2 segundos
  - a tabela `net_link_downtime` recebeu campos de classificacao do alvo, caminho, interface WAN e ultima verificacao
  - no boot do backend, incidentes abertos legados sao hidratados e fechados automaticamente se o ping voltar a responder
  - `GET /api/dashboard/metrics` passou a considerar `internet.online` pelo ping externo, mantendo `provider_gateway_online` separado
  - `GET /api/downtime/summary` passou a expor snapshot da sentinela e metricas por alvo
- frontend:
  - o topo agora mostra `Nicknetwork` e `Internet` como sinais separados
  - o alerta visual de internet passa a disparar quando o ping externo ao Google DNS falhar, mesmo que o gateway do provedor responda
  - o modulo `Controle de Rede` recebeu a aba `Link Nicknetwork`, com:
    - estado atual da internet externa
    - estado atual do gateway Nicknetwork
    - quedas e tempo fora do ar no dia
    - historico de indisponibilidade por alvo
- limpeza operacional:
  - a tabela `net_link_downtime` foi limpa com `TRUNCATE TABLE net_link_downtime RESTART IDENTITY` para remover dados legados incorretos
  - nenhum reboot foi executado
- validacao:
  - `ping -4 -c 1 -W 1 -I enp8s0 186.251.14.25` respondeu com `0% packet loss`
  - `ping -4 -c 1 -W 1 -I enp8s0 8.8.8.8` respondeu com `0% packet loss`
  - `cd backend && npm run build` concluido com sucesso
  - `cd frontend && npm run build` concluido com sucesso
  - `pm2 restart bcc-backend --update-env` e `pm2 restart bcc-frontend --update-env` executados; ambos ficaram `online`
  - `GET /api/downtime/summary` autenticado retornou `provider=Nicknetwork`, `interface=enp8s0`, gateway `online=true` e externo `online=true`
  - `GET /api/dashboard/metrics` autenticado retornou `internet.online=true`, `provider_gateway_online=true`, `external_online=true`, `alert=false`
  - `SELECT COUNT(*) FROM net_link_downtime` retornou `0`
  - `curl -k https://127.0.0.1:6777/network` retornou HTTP `200` servindo o bundle `dist/assets/index-BTr-M4KN.js`

## Auditoria runtime de seguranca - DNS/RPZ/ACL/UFW - 2026-05-25

- objetivo:
  - validar se as camadas de seguranca do SGCG estavam operacionais em runtime, incluindo `RPZ`, `DNS`, `ACL`, `Firewall/UFW`, proxy complementar e precedencia real de regras
- estado validado:
  - `ufw`, `unbound`, `squid`, `clamav-daemon` e `fail2ban` estavam `active`
  - PM2 confirmou `backend-proxy`, `backend-proxy-ingester`, `bcc-backend` e `bcc-frontend` `online`
  - `unbound-checkconf` retornou `ok`
  - `squid -k parse` retornou `ok`
  - `UFW` permaneceu ativo como firewall oficial, com politica `deny incoming`, `allow outgoing` e `allow routed`
  - `iptables-legacy-save` mostrou tabelas legacy vazias, sem regra operacional residual
- DNS/RPZ:
  - Unbound principal responde em `0.0.0.0:53`
  - resolvedor limpo de VIP responde em `0.0.0.0:5355`
  - `dig @127.0.0.1 google.com A` retornou `NOERROR`
  - `dig @127.0.0.1 console.interno.jacarezinho A` retornou `192.168.10.1`
  - `dig @127.0.0.1 pornhub.com A` retornou `NXDOMAIN`
  - `dig @127.0.0.1 youtube.com A` retornou `NXDOMAIN`
  - `dig @127.0.0.1 chrome.cloudflare-dns.com A` retornou `NXDOMAIN`
  - `dig @127.0.0.1 -p 5355 console.interno.jacarezinho A` retornou `192.168.10.1`, preservando nomes internos tambem para VIP
- PontoRH/OpenDNS:
  - `iptables-save -t nat` confirmou `RETURN` para `208.67.222.222` e `208.67.220.220` em VLANs gerenciadas antes do redirect global de DNS
  - a excecao permanente PontoRH/OpenDNS foi preservada
- ACL/Squid:
  - Squid opera explicitamente em `3129`
  - listas ACL existem e foram carregadas:
    - `/etc/squid/acl/proxy_blocklist.acl`
    - `/etc/squid/acl/proxy_whitelist.acl`
    - `/etc/squid/acl/blocklist-vlan-10.acl`
    - `/etc/squid/acl/blocklist-vlan-50.acl`
    - `/etc/squid/acl/blocklist-vlan-70.acl`
  - `curl` via proxy `127.0.0.1:3129` para `example.com` retornou HTTP `200`
  - `curl` via proxy `127.0.0.1:3129` para `pornhub.com` retornou bloqueio/falha controlada HTTP `503`, coerente com DNS/RPZ bloqueado
- correcao aplicada:
  - havia uma regra NAT residual:
    - `-A PREROUTING -s 192.168.70.0/24 -i enp6s0.70 -p tcp --dport 80 -j REDIRECT --to-ports 3128`
  - essa regra era incoerente com o estado atual do motor (`interception_active=false`, `active_ports=[3129]`) e com o Squid ouvindo apenas `3129`
  - a regra residual foi removida em runtime com `iptables -t nat -D PREROUTING -s 192.168.70.0/24 -i enp6s0.70 -p tcp --dport 80 -j REDIRECT --to-ports 3128`
  - `backend-proxy/src/services/interception-service.ts` passou a limpar tambem os redirects antigos com `-s <subnet>` por VLAN, evitando que esse residual fique fora da reconciliacao
- validacao pos-correcao:
  - `cd backend-proxy && npm run build` concluiu com sucesso
  - `pm2 restart backend-proxy --update-env` e `pm2 restart backend-proxy-ingester --update-env` executados; ambos ficaram `online`
  - `iptables-save -t nat | rg '3128|3129|sgcg-total-vlan-block'` nao mostrou mais redirect `3128`
  - `ss -lntup` confirmou Squid ouvindo em `3129`
  - `curl -sk -i https://127.0.0.1:6779/health` retornou `401 Token ausente`, confirmando backend-proxy vivo atras de autenticacao
  - log de erro do backend-proxy nao foi atualizado na rodada; ultimos erros sobre `ufw command not found` eram historicos de `2026-05-21`

## DNS Institucional - Gov.BR via Quad9 e remocao de VIP indevido - 2026-05-26

- objetivo:
  - remover o IP publico `161.148.164.31` da lista de `Excecoes VIP`, pois VIP no SGCG representa cliente interno gerenciado, nao destino publico
  - fazer a familia `gov.br` sair pelo DNS Quad9 `9.9.9.9`
  - garantir que dominios `gov.br` e subdominios nao sofram bloqueio por politica institucional
- alteracoes aplicadas:
  - `policy_exceptions` id `38` (`161.148.164.31`, descricao `Gov.BR`) foi marcado como `active=false`, com `revoked_by=codex`
  - `net_dns_rules` para `gov.br` foi atualizado de `1.1.1.1` para `9.9.9.9`, tipo `FWD`
  - `/etc/unbound/unbound.conf.d/custom-zones.conf` passou a conter:
    - `forward-zone name: "gov.br"`
    - `forward-addr: 9.9.9.9`
  - todos os registros ativos de `release_policies` com `domain='gov.br'` ou `domain LIKE '%.gov.br'` foram marcados como `protected=true`
  - consulta de conflito confirmou `0` bloqueios ativos em `blocking_policies` para `gov.br` e subdominios
- estado preservado:
  - `allowed.rpz` ja continha `gov.br CNAME rpz-passthru.` e `*.gov.br CNAME rpz-passthru.`
  - a excecao permanente PontoRH/OpenDNS foi preservada: `iptables-save -t nat` confirmou `RETURN` para `208.67.222.222` e `208.67.220.220` antes do redirect global de DNS nas VLANs gerenciadas
- validacao:
  - `unbound-checkconf` retornou sem erros
  - `systemctl reload unbound` executado e `systemctl is-active unbound` retornou `active`
  - `unbound-control flush_zone gov.br` e `unbound-control flush_zone .` executados
  - `dig @127.0.0.1 gov.br A` retornou `NOERROR` com `161.148.164.31`
  - `dig @127.0.0.1 www.gov.br A` retornou `NOERROR` com `161.148.164.31`
  - `dig @127.0.0.1 acesso.gov.br A` retornou `NOERROR`
  - `dig @127.0.0.1 receita.fazenda.gov.br A` retornou `NOERROR`
  - `tcpdump -ni enp8s0 host 9.9.9.9 and port 53 -c 2` durante consulta nova `codex-forward-test-20260526.gov.br` capturou ida para `9.9.9.9.53` e resposta `NXDomain` vinda de `9.9.9.9.53`, provando o encaminhamento da zona `gov.br` pelo Quad9
  - `dig @127.0.0.1 codex-forward-test-20260526.gov.br A` e `dig @9.9.9.9 codex-forward-test-20260526.gov.br A` retornaram `NXDOMAIN` coerente para nome inexistente, sem indicio de bloqueio SGCG
  - `dig @127.0.0.1 app.pontorh.com.br A` e `dig @208.67.222.222 app.pontorh.com.br A` retornaram `NXDOMAIN` igualmente, indicando resposta autoritativa externa e nao bloqueio local do SGCG

## DNS Institucional - correcao do teste de resolucao FWD - 2026-05-26

- problema:
  - na tela `Controle de Rede > DNS Institucional`, o botao `Testar Resolucao` mostrava `OFF` para `gov.br`
  - a regra estava correta como `FWD` para `9.9.9.9`, mas a verificacao comparava a resposta final do dominio com o IP do resolvedor
  - para `FWD`, `target_ip=9.9.9.9` e o servidor consultado, nao o IP esperado de `gov.br`
- correcao:
  - `backend-proxy/src/routes/dns-routes.ts` passou a tratar `type='FWD'` separadamente em `POST /api/dns/zones/verify`
  - a verificacao agora consulta `@127.0.0.1` e tambem `@<target_ip>` e considera ativo quando as respostas coincidem
  - regras estaticas tipo `A` continuam usando comparacao direta entre resposta e IP configurado
- validacao:
  - `cd backend-proxy && npm run build` concluiu com sucesso
  - `pm2 restart backend-proxy --update-env` executado; processo ficou `online`
  - chamada autenticada para `/api/dns/zones/verify` com `{"domain":"gov.br","target_ip":"9.9.9.9","type":"FWD"}` retornou:
    - `match=true`
    - `resolved_to=161.148.164.31`
    - `expected_resolver=9.9.9.9`
    - `resolver_answer=161.148.164.31`
    - `verification_mode=forward-zone`

## Hotspot - limpeza horaria de sessoes expiradas/revogadas - 2026-05-26

- objetivo:
  - garantir que a grade administrativa do Hotspot nao acumule sessoes com estado expirado
  - manter a expiracao runtime ja existente e adicionar limpeza automatica horaria dos registros vencidos/revogados visiveis
  - preservar historico institucional e relatorios, ocultando da grade via `admin_hidden_at` em vez de apagar linhas
- backend:
  - `backend/src/modules/hotspot/hotspot-routes.ts` recebeu a funcao reutilizavel `cleanupStaleSessions`
  - a limpeza primeiro executa `expireExpiredSessions`, marcando como `expired` sessoes `active` com `expires_at <= NOW()` e removendo IPs do runtime quando necessario
  - depois oculta da grade administrativa sessoes com:
    - `status='revoked'`
    - `status='expired'`
    - ou `expires_at <= NOW()`
  - o endpoint manual `POST /api/hotspot/sessions/cleanup-stale` passou a usar a mesma funcao da rotina automatica
  - `revokeRuntimeIps` passou a remover do `ipset` apenas IPs que ainda estejam presentes em `sgcg_hotspot_v70_auth`, evitando ruido de erro esperado quando o timeout do proprio ipset ja removeu o IP
- agendamento runtime:
  - `backend/src/server.ts` manteve o sweeper de expiracao a cada 1 minuto
  - foi adicionado um segundo sweeper com `setInterval(..., 60 * 60 * 1000)` para executar `cleanupStaleSessions({ requestedBy: 'system:hourly-hotspot-cleanup' })`
  - a rotina horaria possui trava simples `hotspotCleanupRunning` para evitar sobreposicao caso uma execucao anterior ainda esteja rodando
- validacao:
  - antes da limpeza manual havia `5` sessoes expiradas ainda visiveis na grade e `0` sessoes ativas vencidas
  - `cd backend && npm run build` concluiu com sucesso
  - `pm2 restart bcc-backend --update-env` executado; processo ficou `online`
  - chamada autenticada para `POST /api/hotspot/sessions/cleanup-stale` retornou `hidden_total=5`, `hidden_expired=5`, `runtime_revoked=5`
  - apos a limpeza, consulta SQL confirmou:
    - `visible_expired=0`
    - `visible_revoked=0`
    - `active_expired=0`
  - `ipset list sgcg_hotspot_v70_auth` confirmou `Number of entries: 0`
  - segunda chamada autenticada ao endpoint retornou todos os contadores zerados, validando idempotencia

## Infraestrutura - armazenamento fisico ROOT e placa mae - 2026-05-27

- objetivo:
  - ajustar `Infraestrutura > Armazenamento Fisico` para refletir o ROOT real do servidor: 4 SSDs unidos no volume do sistema
  - remover da tela os cards separados de `CFTV` e `Dados`
  - exibir os SSDs fisicos separadamente dentro do conjunto do ROOT
  - incluir `Placa Mae` junto de Sistema Operacional, Processador e Memoria RAM, com cards menores na mesma linha em desktop
- backend:
  - `backend/src/modules/server/server-routes.ts` passou a expor `motherboard` lendo DMI local em `/sys/devices/virtual/dmi/id`
  - a resposta de hardware passou a expor `storage.root` com `label='Disco ROOT (SISTEMA)'` e `layout='4 SSDs em volume unificado'`
  - `storage.physical_ssds` agora lista os membros reais do volume ROOT a partir de `/sys/block/dm-0/slaves`, sem usar `lsblk` via shell
  - a leitura atual detecta:
    - `SSD 1` `/dev/sda` `HUSKY SSD 128GB` serial `GSMB2230380404`
    - `SSD 2` `/dev/sdb` `KINGSTON SA400S3` serial `50026B7782F25F8A`
    - `SSD 3` `/dev/sdc` `KINGSTON SA400S3` serial `50026B7685FB9364`
    - `SSD 4` `/dev/sdd` `KEEPDATA M2 NGFF` serial `2022102002444`
- frontend:
  - `frontend/src/pages/Server.jsx` passou a mostrar quatro cards compactos no topo: Sistema Operacional, Processador, Memoria RAM e Placa Mae
  - a secao de armazenamento passou a mostrar apenas `Disco ROOT (SISTEMA)` como volume consolidado e abaixo os quatro SSDs individuais
  - os textos antigos `Storage (CFTV)` e `Storage (Dados)` foram removidos dessa tela
- validacao:
  - `cd backend && npm run build` concluiu com sucesso
  - `cd frontend && npm run build` concluiu com sucesso
  - `pm2 restart bcc-backend --update-env` e `pm2 restart bcc-frontend --update-env` executados; ambos ficaram `online`
  - chamada autenticada para `GET /api/server/hardware` retornou:
    - `motherboard.vendor='Gigabyte Technology Co., Ltd.'`
    - `motherboard.model='A320M-S2H V2-CF'`
    - `storage.root.label='Disco ROOT (SISTEMA)'`
    - `storage.root.layout='4 SSDs em volume unificado'`
    - `storage.physical_ssds` com 4 itens (`sda`, `sdb`, `sdc`, `sdd`)
  - bundle gerado em `frontend/dist` contem `Disco ROOT (SISTEMA)` e `Placa Mae`

## Rede/DNS - bypass emergencial gov.br, Empresa Facil e Conectividade Social - 2026-05-28

- contexto:
  - usuarios de VLANs nao VIP reportaram lentidao extrema de DNS e falhas em `gov.br`, SSO gov.br, Empresa Facil e WhatsApp/Web WhatsApp
  - o IP acompanhado durante a correcao foi `192.168.10.131`
  - no VIP os portais fluem porque a politica cria caminho amplo de ida e retorno antes dos guardrails UFW/SGCG
- DNS institucional:
  - `gov.br` e dependencias criticas foram migrados para forwarders Cloudflare `1.1.1.1,1.0.0.1`
  - `scripts/update_govbr_allowlist.py` sincroniza `net_dns_rules`, regenera `/etc/unbound/unbound.conf.d/custom-zones.conf` e mantém RPZ `rpz-passthru` nas allowlists por VLAN
  - dominios cobertos incluem `gov.br`, `acesso.gov.br`, `sso.acesso.gov.br`, `servicos.gov.br`, `serpro.gov.br`, `estaleiro.serpro.gov.br`, `caixa.gov.br`, Conectividade Social, eSocial, Empresa Facil PR e dependencias observadas como `go-mpulse.net`, Akamai, hCaptcha, Google assets, New Relic e StaticVox
- firewall/runtime:
  - criado/atualizado o ipset `sgcg_govbr_allowed`
  - mantidas regras de ida no `FORWARD` para `enp6s0+ -> enp8s0` TCP/UDP 80,443 com destino no ipset
  - mantido bypass NAT em `PREROUTING` para destinos do ipset, evitando DNAT/captive/proxy local
  - adicionada regra de retorno antes do `SGCG_GUARD`: `enp8s0 -> enp6s0+`, `ESTABLISHED,RELATED`, origem no ipset, comentario `SGCG GOVBR EMPRESAFACIL RETURN ALLOW`
  - a ausencia dessa regra de retorno deixava conexoes de `192.168.10.131` para Empresa Facil em `SYN_RECV`: o SYN saia pela WAN e o SYN-ACK voltava, mas nao completava na VLAN
- persistencia:
  - `scripts/update_govbr_allowlist.py` passou a recriar tambem a regra de retorno
  - runtime persistido em `/etc/iptables/rules.v4` e `/etc/ipset.conf`
  - timer `sgcg-govbr-allowlist.timer` mantem a allowlist atualizada a cada 10 minutos
- validacao:
  - `python3 scripts/update_govbr_allowlist.py` executou com sucesso e reportou `ok members=215`
  - `dig @127.0.0.1 gov.br A +short` retornou `161.148.164.31`
  - `dig @127.0.0.1 www.gov.br A +short` retornou `161.148.164.31`
  - `dig @127.0.0.1 sso.acesso.gov.br A +short` retornou `189.9.168.40`
  - `dig @127.0.0.1 autenticacao.empresafacil.pr.gov.br A +short` retornou `200.155.79.202`
  - `unbound-control list_forwards` confirmou `gov.br`, `www.gov.br`, `acesso.gov.br`, `sso.acesso.gov.br`, `autenticacao.empresafacil.pr.gov.br`, `caixa.gov.br`, `conectividade.caixa.gov.br`, `esocial.gov.br`, `serpro.gov.br`, `go-mpulse.net` e dependencias relacionadas como `forward 1.1.1.1 1.0.0.1`
  - `conntrack` passou a mostrar conexoes de `192.168.10.131` para `200.155.79.200:443` e `161.148.164.31:443` como `[ASSURED]`, em vez de ficarem travadas em `SYN_RECV`
  - `tcpdump -ni any` confirmou pacote de retorno `161.148.164.31.443 > 192.168.10.131` saindo por `enp6s0.10`

## WhatsApp/Web WhatsApp - estabilizacao da allowlist dinamica - 2026-05-28

- sintoma reportado:
  - WhatsApp intermitente nas VLANs, incluindo dependencias do WhatsApp Web
- achados runtime:
  - `ufw`, `unbound`, `sgcg-vip-dns.service`, `squid`, `isc-dhcp-server`, `nginx`, `postgresql`, `backend-proxy`, `backend-proxy-ingester`, `bcc-backend` e `bcc-frontend` estavam ativos/online
  - o cron do WhatsApp estava configurado para executar `scripts/update_whatsapp_allowlist.py` a cada 6 horas
  - a allowlist `sgcg_whatsapp_allowed` existia, mas a coleta anterior usava somente `208.67.222.222`; isso podia divergir dos IPs entregues pelo Unbound local aos clientes
  - durante refresh manual, uma resposta de erro textual do `dig` foi interpretada como IP, mostrando fragilidade no parser
  - `edge-mqtt.facebook.com` e `mqtt.c10r.facebook.com`, dependencias de sessao/push do WhatsApp Web, resolviam nos gateways para IPs como `57.144.66.144` e `157.240.12.9`, que nao estavam garantidos pela coleta antiga
- correcao aplicada:
  - `scripts/update_whatsapp_allowlist.py` passou a validar respostas com `ipaddress.IPv4Address`, ignorando qualquer linha que nao seja IPv4 valido
  - a coleta agora consulta `127.0.0.1`, `208.67.222.222` e `1.1.1.1`, cobrindo o mesmo Unbound usado pelos clientes e rotacoes externas de CDN/Meta
  - refresh manual executado apos a correcao elevou `sgcg_whatsapp_allowed` para `55` IPs atuais, incluindo dependencias Meta do WhatsApp Web como `57.144.66.144`, `157.240.12.9`, `157.240.226.19`, `157.240.226.1`, `157.240.226.61`, `57.145.6.141` e outros IPs rotacionados
  - `/etc/ipset.conf` foi persistido pelo proprio script e verificado sem linhas de erro `dig`
- validacao:
  - `python3 -m py_compile scripts/update_whatsapp_allowlist.py` sem erro
  - `python3 scripts/update_whatsapp_allowlist.py` concluiu com sucesso
  - `unbound-checkconf /etc/unbound/unbound.conf` sem erros
  - `ufw status verbose` confirmou `Status: active`, com UFW como firewall oficial
  - `ipset list sgcg_whatsapp_allowed` confirmou `Number of entries: 55`
  - nas VLANs `10`, `30`, `40`, `50`, `70`, `80` e `99`, `web.whatsapp.com`, `static.whatsapp.net`, `graph.whatsapp.com`, `chat.cdn.whatsapp.net`, `mmx-ds.cdn.whatsapp.net` e `edge-mqtt.facebook.com` resolveram via seus gateways
  - `https://web.whatsapp.com/` retornou `HTTP 200` usando origem dos gateways `192.168.10.1`, `192.168.30.1`, `192.168.40.1`, `192.168.50.1`, `192.168.70.1`, `192.168.80.1` e `192.168.99.1`, com tempo total aproximado entre `0.29s` e `0.52s`

## Conectividade Social v2 Caixa - liberacao do cadastro de maquina - 2026-05-28

- sintoma reportado:
  - `https://conectividadesocialv2.caixa.gov.br/cad-maquina` nao abria para usuarios
- achados runtime:
  - a URL resolvia para `200.201.160.54` e respondia `301` para `/cad-maquina/`
  - seguindo o redirecionamento, o HTML da pagina `Cadastro de Maquina` retornava `HTTP 200`
  - o dominio novo `conectividadesocialv2.caixa.gov.br` nao estava semeado explicitamente em `scripts/update_govbr_allowlist.py`
  - antes da correcao, `ipset test sgcg_govbr_allowed 200.201.160.54` retornava que o IP nao estava no conjunto, deixando o destino sem o bypass institucional de Caixa/gov.br
- correcao aplicada:
  - `scripts/update_govbr_allowlist.py` passou a incluir `conectividadesocialv2.caixa.gov.br` e `www.conectividadesocialv2.caixa.gov.br` nos dominios criticos da Caixa
  - `python3 scripts/update_govbr_allowlist.py` executou com sucesso (`ok members=215`)
  - `/etc/unbound/unbound.conf.d/custom-zones.conf` passou a conter forwards explicitos para `conectividadesocialv2.caixa.gov.br` e `www.conectividadesocialv2.caixa.gov.br` via `1.1.1.1,1.0.0.1`
  - `/etc/squid/acl/proxy_whitelist.acl` e `/etc/squid/acl/proxy_protected_ssl.acl` receberam os dois dominios
  - `/etc/ipset.conf` persistiu `200.201.160.54` com comentario `conectividadesocialv2.caixa.gov.br`
- validacao:
  - `python3 -m py_compile scripts/update_govbr_allowlist.py scripts/update_whatsapp_allowlist.py` sem erro
  - `unbound-checkconf /etc/unbound/unbound.conf` e `unbound-checkconf -f /etc/unbound/sgcg-vip-clean.conf` sem erros
  - `squid -k parse` sem erro fatal; avisos de IPv6/ACL vazia ja conhecidos no ambiente
  - `ipset test sgcg_govbr_allowed 200.201.160.54` confirmou o IP dentro do conjunto
  - DNS nos gateways `192.168.10.1`, `192.168.30.1`, `192.168.40.1`, `192.168.50.1`, `192.168.70.1`, `192.168.80.1` e `192.168.99.1` retornou `200.201.160.54`
  - `https://conectividadesocialv2.caixa.gov.br/cad-maquina` retornou `HTTP 200` apos `1` redirect em todas as VLANs testadas, com tempo total aproximado entre `0.18s` e `0.20s`
  - via Squid explicito `127.0.0.1:3129`, a mesma URL retornou `HTTP 200`
  - asset principal `main.3f2c4d4f75a7c75ce527.js` retornou `HTTP 200` com `Content-Length: 1006240`
  - `ufw`, `unbound`, `sgcg-vip-dns.service`, `squid`, `isc-dhcp-server`, `nginx` e `postgresql` permaneceram ativos

## SGCG frontend - visibilidade de servicos criticos liberados - 2026-05-28

- objetivo:
  - expor no frontend do SGCG o estado operacional das liberacoes criticas corrigidas nesta rodada, incluindo WhatsApp/Web WhatsApp, Conectividade Social v2 Caixa e SSO gov.br
- backend:
  - adicionado `GET /api/bloqueios-liberacoes/critical-services` em `backend-proxy/src/routes/blocking-release-routes.ts`
  - o endpoint e autenticado pelo mesmo stack do modulo e retorna `updated_at`, gateways de VLAN, totais dos ipsets `sgcg_whatsapp_allowed` e `sgcg_govbr_allowed`, DNS local por VLAN, cobertura dos IPs nos ipsets, teste HTTPS por gateway, forwards Unbound e status consolidado por servico
  - servicos monitorados inicialmente:
    - `Conectividade Social v2` com URL `https://conectividadesocialv2.caixa.gov.br/cad-maquina`
    - `WhatsApp Web` com URL `https://web.whatsapp.com/`
    - `WhatsApp sessao/push` cobrindo `edge-mqtt.facebook.com`
    - `SSO gov.br` com URL `https://sso.acesso.gov.br/`
- frontend:
  - em `frontend/src/pages/Network.jsx`, a aba DNS agora mostra o painel `Servicos criticos liberados`, com resumo OK/total, totais dos ipsets, cards por servico, DNS por VLAN, bypass ipset, HTTPS por VLAN, tempo, IPs resolvidos e link externo quando aplicavel
  - o painel de DNS atualiza a telemetria normal a cada `2s` e os servicos criticos a cada `30s`, evitando testes HTTPS pesados em loop curto
  - em `frontend/src/pages/BlockingReleases.jsx`, a sintese executiva do modulo passou a exibir a linha `Servicos criticos`, com badges `OK`/`atencao` por servico e resumo `X/Y servico(s) com DNS, bypass e HTTPS validados`
- validacao:
  - `cd backend-proxy && npm run build` concluiu com sucesso
  - `pm2 restart backend-proxy --update-env` deixou o processo online
  - `curl -sk https://127.0.0.1:6779/api/bloqueios-liberacoes/critical-services` retornou `401 Token ausente`, confirmando rota publicada atras da autenticacao esperada
  - `cd frontend && npm run build` concluiu com sucesso e gerou `dist/assets/index-Dm50-AIw.js`
  - `pm2 restart bcc-frontend --update-env` deixou o frontend online em `0.0.0.0:6777`
  - `curl -sk https://127.0.0.1:6777/controle-rede` e `curl -sk https://127.0.0.1:6777/bloqueios-liberacoes` retornaram HTML `200`
  - `rg` confirmou `Servicos criticos liberados` no bundle `frontend/dist/assets/index-Dm50-AIw.js`
  - `git diff --check` sem erros

## SSO gov.br - refresh da rotacao detectada pelo frontend - 2026-05-28

- sintoma reportado no SGCG:
  - card `SSO gov.br` apareceu como `Atencao`
  - DNS por VLAN estava `OK`, HTTPS estava `7/7`, mas `Bypass ipset` aparecia `Fora`
  - IP exibido: `189.9.176.13`
- achado runtime:
  - `dig @127.0.0.1 sso.acesso.gov.br A +time=2 +tries=1 +short` retornou `189.9.176.13`
  - `ipset test sgcg_govbr_allowed 189.9.176.13` confirmou inicialmente que o IP nao estava no conjunto
  - isso indica rotacao recente do SSO gov.br entre execucoes do timer da allowlist
- acao executada:
  - `python3 scripts/update_govbr_allowlist.py` executado manualmente
  - resultado: `ok members=225`
- validacao:
  - `ipset test sgcg_govbr_allowed 189.9.176.13` passou a confirmar o IP dentro do conjunto
  - `ipset list sgcg_govbr_allowed` mostra `189.9.176.13 comment "sso.acesso.gov.br"`
  - o alerta do frontend foi util para apontar exatamente a camada faltante: DNS e HTTPS funcionavam, mas o bypass institucional ainda nao tinha acompanhado a nova resolucao

## Politica SGCG - sites e aplicativos de relacionamento - 2026-05-28

- solicitacao:
  - criar nova ACL/politica para sites e aplicativos de relacionamento, incluindo Tinder, Timo/Taimi, Badoo, Alii-Streamers Legais, Vibe, Crush Live, SuperLive, Chatta e similares
  - bloquear em todas as VLANs operacionais do modulo e exibir em `Politicas e Excecoes -> Politicas & Escopos`
- implementacao:
  - criado script idempotente `scripts/create_relationship_acl_policy_20260528.js`
  - criada/atualizada a politica nomeada `Sites e aplicativos de relacionamento` em `domain_policies`
  - `policy_type=block`, `scope_type=vlan`, `scope_value=10,30,40,50,70`, `enabled=true`
  - VLANs `80` e `99` permaneceram fora porque estao cadastradas como isentas/fora do padrao no SGCG (`exempt=true`, `blocking_enabled=false`, `monitoring_enabled=false`)
  - a politica recebeu `59` dominios, incluindo `tinder.com`, `gotinder.com`, `badoo.com`, `badoocdn.com`, `taimi.com`, `web-timo.vercel.app`, `aliiparty.com`, `alii.global`, `vibedate.io`, `vibedating.net`, `vibebe.app`, `vybe.dating`, `vibematchapp.com`, `crushfun.live`, `superlive.chat`, `superlivetv.com`, `chatta.com`, `chatta.it`, `chattalive.com`, alem de Bumble, Hinge, Happn, OkCupid, POF, Match, Grindr, HER, Tantan, Lovoo, Mamba, Boo, Coffee Meets Bagel, Feeld, Pure, Hily, Jaumo, Waplog, Skout, MeetMe, Tagged, Yubo, Fruitz e Flava
  - `domainPolicyManagerService` sincronizou a politica para `blocking_policies`, gerando `59` linhas ativas para cada VLAN `10`, `30`, `40`, `50` e `70`
  - `blockingReleaseService.apply('codex-relationship-acl-20260528')` reaplicou o motor `ACL + DNS`
- validacao:
  - consulta em `domain_policies` confirmou `id=19`, `name='Sites e aplicativos de relacionamento'`, `policy_type='block'`, `scope_type='vlan'`, `scope_value='10,30,40,50,70'`, `enabled=true`
  - consulta em `blocking_policies` confirmou `59` entradas por VLAN `10`, `30`, `40`, `50` e `70`
  - `rg` confirmou dominios como `tinder.com`, `badoo.com`, `superlive.chat`, `crushfun.live`, `aliiparty.com`, `chatta.com`, `web-timo.vercel.app` e `taimi.com` nos arquivos `/etc/squid/acl/blocklist-vlan-10.acl`, `blocklist-vlan-30.acl`, `blocklist-vlan-40.acl`, `blocklist-vlan-50.acl` e `blocklist-vlan-70.acl`
  - `unbound-checkconf /etc/unbound/unbound.conf` sem erros
  - `squid -k parse` sem erro fatal; avisos de IPv6/ACL vazia seguem conhecidos no ambiente
  - `/bloqueios-liberacoes?tab=policies` respondeu HTML `200`
  - `dig @192.168.10.1 tinder.com A` retornou `NXDOMAIN`
  - `dig @192.168.30.1 badoo.com A` retornou `NXDOMAIN`
  - `dig @192.168.40.1 crushfun.live A` retornou `NXDOMAIN`
  - `dig @192.168.50.1 superlive.chat A +short` retornou vazio
  - `dig @192.168.70.1 aliiparty.com A` retornou `NXDOMAIN`
  - `pm2 list` confirmou `backend-proxy`, `backend-proxy-ingester`, `bcc-backend` e `bcc-frontend` online

## WhatsApp sessao/push - ajuste de dependencia Meta na VLAN 30 - 2026-05-28

- sintoma reportado no SGCG:
  - card `WhatsApp sessao/push` apareceu como `Atencao`
- achado runtime:
  - `dig @127.0.0.1 edge-mqtt.facebook.com A +short` retornava `mqtt.c10r.facebook.com` e IP Meta atual
  - o IP atual estava presente no `sgcg_whatsapp_allowed`
  - nas VLANs `10`, `40`, `50`, `70`, `80` e `99`, `edge-mqtt.facebook.com` resolvia normalmente
  - na VLAN `30`, `dig @192.168.30.1 edge-mqtt.facebook.com A` retornava `NXDOMAIN`
  - causa: `mqtt.c10r.facebook.com` estava liberado na VLAN `30`, mas `edge-mqtt.facebook.com` nao tinha sido sincronizado para `release_policies`/allowlist da VLAN `30`; como `facebook.com` e bloqueado por `Redes Sociais`, o CNAME era bloqueado antes de chegar no destino permitido
- correcao aplicada:
  - ressincronizada a politica nomeada `id=18` (`WhatsApp Web - dependencias Meta`) via `domainPolicyManagerService.update`
  - `blockingReleaseService.apply('codex-whatsapp-push-vlan30')` reaplicou o motor `ACL + DNS`
  - `release_policies` passou a conter `edge-mqtt.facebook.com` nas VLANs `10`, `30`, `40`, `50` e `70`
- validacao:
  - `/etc/unbound/becker/allowlist-vlan-30.rpz` contem `edge-mqtt.facebook.com CNAME rpz-passthru.` e wildcard correspondente
  - `/etc/squid/acl/allowlist-vlan-30.acl` contem `edge-mqtt.facebook.com` e `mqtt.c10r.facebook.com`
  - `dig @192.168.30.1 edge-mqtt.facebook.com A` passou a retornar `NOERROR`, CNAME `mqtt.c10r.facebook.com` e IP `57.144.66.144`
  - `dig` nos gateways `192.168.10.1`, `192.168.30.1`, `192.168.40.1`, `192.168.50.1`, `192.168.70.1`, `192.168.80.1` e `192.168.99.1` retornou `57.144.66.144`
  - `ipset test sgcg_whatsapp_allowed 57.144.66.144` confirmou o IP dentro do conjunto
  - `unbound-checkconf /etc/unbound/unbound.conf` sem erros
  - `pm2 list` confirmou os servicos SGCG online

## WhatsApp Web - carregamento lento por dependencias Meta faltantes - 2026-05-28

- sintoma reportado:
  - `WhatsApp Web esta um lixo para abrir`
- achados runtime:
  - servicos base `unbound`, `sgcg-vip-dns.service`, `squid`, `postgresql`, `nginx` e `isc-dhcp-server` ativos
  - `backend-proxy`, `backend-proxy-ingester`, `bcc-backend` e `bcc-frontend` online no PM2
  - DNS de `web.whatsapp.com` nos gateways `192.168.10.1`, `192.168.30.1`, `192.168.40.1`, `192.168.50.1`, `192.168.70.1`, `192.168.80.1` e `192.168.99.1` respondia `NOERROR` em `0-1 ms`
  - `curl -k -L --interface <gateway> https://web.whatsapp.com/` retornava `HTTP 200`, mas o radar DNS mostrava bloqueios recentes de dependencias Meta usadas pelo WhatsApp Web/sessao:
    - `gateway.facebook.com`
    - `chat-e2ee-mini.facebook.com`
    - `edge-mqtt-fallback.facebook.com`
    - `ep7.facebook.com`
    - `api.facebook.com`
    - `connect.facebook.net`
    - `z-p42-chat-e2ee-ig.facebook.com`
  - esses nomes resolvem para endpoints `*.c10r.facebook.com`, `scontent.xx.fbcdn.net` ou IPs Meta compartilhados; bloquear `facebook.com` amplo sem essas excecoes causa carregamento ruim, reconexao ou fallback lento no WhatsApp Web
- correcao aplicada:
  - a politica nomeada `id=18` (`WhatsApp Web - dependencias Meta`) foi ampliada para incluir as dependencias estritamente necessarias sem liberar `facebook.com` amplo
  - dominios adicionados na politica protegida: `api.facebook.com`, `chat-e2ee-mini.facebook.com`, `connect.facebook.net`, `edge-mqtt-fallback.facebook.com`, `ep7.facebook.com`, `gateway.facebook.com`, `mqtt.fallback.c10r.facebook.com`, `z-p42-chat-e2ee-ig.facebook.com`
  - `domainPolicyManagerService.update(18, ...)` ressincronizou `release_policies` para VLANs `10`, `30`, `40`, `50` e `70`
  - `blockingReleaseService.apply('codex-whatsapp-web-slow-20260528')` reaplicou o motor `ACL + DNS`
  - `scripts/update_whatsapp_allowlist.py` passou a resolver tambem essas dependencias Meta e seus fallbacks, usando `127.0.0.1`, `208.67.222.222` e `1.1.1.1`
  - `python3 scripts/update_whatsapp_allowlist.py` elevou `sgcg_whatsapp_allowed` para `81` entradas, adicionando IPs atuais como `57.144.66.8`, `57.144.66.145`, `57.145.6.144`, `157.240.12.1`, `157.240.12.175`, `157.240.226.13`, `31.13.91.21`, `31.13.94.52` e outros IPs rotacionados
  - `unbound-control flush_zone` foi executado para `whatsapp.com`, `whatsapp.net`, `facebook.com` e `fbcdn.net`
- validacao:
  - `/etc/unbound/becker/allowlist-vlan-10.rpz`, `allowlist-vlan-30.rpz` e `allowlist-vlan-50.rpz` passaram a conter `chat-e2ee-mini.facebook.com`, `connect.facebook.net`, `edge-mqtt-fallback.facebook.com` e `gateway.facebook.com` com `rpz-passthru`
  - `/etc/squid/acl/allowlist-vlan-10.acl`, `allowlist-vlan-30.acl` e `allowlist-vlan-50.acl` passaram a conter os mesmos hosts
  - `gateway.facebook.com`, `chat-e2ee-mini.facebook.com`, `edge-mqtt-fallback.facebook.com`, `ep7.facebook.com`, `connect.facebook.net` e `z-p42-chat-e2ee-ig.facebook.com` resolveram nos gateways testados das VLANs `10`, `30`, `50` e `70`
  - `https://web.whatsapp.com/` retornou `HTTP 200` em todas as VLANs testadas, com tempo total aproximado entre `0.28s` e `0.37s`
  - consulta ao radar DNS nos 3 minutos apos a correcao retornou `[]` para bloqueios de `whatsapp`, `facebook`, `c10r` e `fbcdn`
  - `unbound-checkconf /etc/unbound/unbound.conf` sem erros
  - `squid -k parse` sem erro fatal; avisos de IPv6/ACL vazia ja conhecidos no ambiente

## WhatsApp Web - WebSocket 443/5222 e regra explicita de retorno - 2026-05-28

- sintoma reportado:
  - WhatsApp Web voltou a falhar apos abrir temporariamente
  - console do navegador mostrava falhas em:
    - `wss://web.whatsapp.com/ws/chat?ED=CAgIEggF`
    - `wss://web.whatsapp.com:5222/ws/chat?ED=CAgIEggF`
- achados runtime:
  - testes sinteticos de WebSocket com `Upgrade: websocket` nos gateways das VLANs retornaram `HTTP/1.1 101 Switching Protocols` em `443` e `5222`
  - `openssl s_client -connect web.whatsapp.com:443 -servername web.whatsapp.com` e porta `5222` negociaram TLS corretamente com certificado Meta/WhatsApp valido
  - os IPs atuais de `web.whatsapp.com` estavam dentro do `sgcg_whatsapp_allowed`
  - havia conexoes reais de clientes para IPs Meta/WhatsApp presas em `SYN_RECV`, por exemplo `192.168.10.131 -> 57.144.67.32:443/5222`, sinal de retorno incompleto para o cliente mesmo com a saida permitida
  - regra existente permitia saida para `sgcg_whatsapp_allowed`, mas nao havia uma regra explicita de retorno equivalente a que ja existe para `sgcg_govbr_allowed`
- correcao aplicada:
  - `scripts/update_whatsapp_allowlist.py` passou a garantir a regra:
    - `SGCG WHATSAPP RETURN ALLOW`
    - `-i enp8s0 -o enp6s0+ -m conntrack --ctstate ESTABLISHED,RELATED -m set --match-set sgcg_whatsapp_allowed src -j ACCEPT`
  - `python3 scripts/update_whatsapp_allowlist.py` executado apos a mudanca
  - regra inserida e persistida em `/etc/iptables/rules.v4`
  - `ipset save > /etc/ipset.conf` executado apos o refresh
  - entradas antigas `SYN_RECV` para IPs `57.144.*` e `157.240.*` foram removidas seletivamente do conntrack para forcar reconexao limpa
- validacao:
  - `iptables -S FORWARD` confirmou `SGCG WHATSAPP RETURN ALLOW` antes do `SGCG_GUARD`
  - `iptables -vnL FORWARD` mostrou a regra de retorno com contador ativo (`4525` pacotes / `3253K` no momento da validacao)
  - novas conexoes WebSocket por gateway continuaram retornando `HTTP/1.1 101 Switching Protocols` em `5222`
  - apos a limpeza seletiva, `conntrack -L | rg 'SYN_RECV.*(57.144|157.240)'` nao retornou entradas
  - radar DNS recente mostrou apenas bloqueios esperados de `facebook.com` e `web.facebook.com`; dependencias WhatsApp/Meta protegidas aparecem como `allowed`
  - `unbound-checkconf /etc/unbound/unbound.conf` sem erros
  - `squid -k parse` sem erro fatal; avisos de IPv6/ACL vazia ja conhecidos no ambiente
  - PM2 confirmou `backend-proxy`, `backend-proxy-ingester`, `bcc-backend` e `bcc-frontend` online

## Receita Federal, hCaptcha, PGFN e SEBRAE PR - conectividade da maquina 192.168.10.118 - 2026-05-28

- sintoma reportado:
  - maquina `192.168.10.118` na `VLAN 10` nao conseguia concluir fluxo de emissao de parcelamento no portal da Receita Federal
  - o mesmo endpoint tambem nao conseguia acessar `https://salas-apps.pr.sebrae.com.br/painelcontrole/administrador.php`
- achados runtime:
  - o endpoint esta na interface `enp6s0.10`, com ARP ativo `cc:47:40:0c:e0:55`
  - `ping` a partir do gateway nao respondeu, mas havia ARP e conexoes reais no `conntrack`, indicando host ativo com ICMP provavelmente bloqueado no Windows
  - logs do Unbound mostraram o proprio `192.168.10.118` consultando `www8.receita.fazenda.gov.br`, `api.hcaptcha.com`, subdominios dinamicos `*.w.hcaptcha.com`, `newassets.hcaptcha.com` e `salas-apps.pr.sebrae.com.br`
  - nao havia `NXDOMAIN` para esses dominios no endpoint; o problema era cobertura incompleta da allowlist/bypass persistente para dependencias dinamicas de emissao e para o dominio correto do SEBRAE
  - o catalogo baseline tinha `salas-apps-pr.sebrae.com.br` com hifen, mas o dominio real e `salas-apps.pr.sebrae.com.br` com ponto
- correcao aplicada:
  - `scripts/update_govbr_allowlist.py` passou a cobrir `cav.receita.fazenda.gov.br`, `api.hcaptcha.com`, `imgs.hcaptcha.com`, `accounts.hcaptcha.com`, wildcard relacionado `w.hcaptcha.com`, `pgfn.gov.br`, `regularize.pgfn.gov.br`, `www.regularize.pgfn.gov.br`, `salas-apps.pr.sebrae.com.br`, `sebrae.com.br` e `www.sebrae.com.br`
  - a rotina tambem passou a coletar dominios recentes contendo `hcaptcha`, `sebrae` e `pgfn` a partir dos logs/tabelas operacionais
  - `backend-proxy/src/services/blocking-release-service.ts` corrigiu o seed institucional de `salas-apps-pr.sebrae.com.br` para `salas-apps.pr.sebrae.com.br`
  - executado `DATABASE_URL=postgres://postgres:change_me@127.0.0.1:5432/controlebeckercorp_v8 python3 scripts/update_govbr_allowlist.py`, com resultado `ok members=232`
  - `backend-proxy` foi recompilado e reiniciado via PM2
  - entradas antigas de `conntrack` do `192.168.10.118` para Receita/hCaptcha/SEBRAE/PGFN foram removidas seletivamente para forcar reconexao limpa
- validacao:
  - `python3 -m py_compile scripts/update_govbr_allowlist.py` sem erro
  - `cd backend-proxy && npm run build` concluiu com sucesso
  - `pm2 restart backend-proxy --update-env` deixou `backend-proxy` online
  - `unbound-checkconf /etc/unbound/unbound.conf` e `unbound-checkconf -f /etc/unbound/sgcg-vip-clean.conf` sem erros
  - `squid -k parse` sem erro fatal
  - `net_dns_rules` confirmou `FWD` via `1.1.1.1,1.0.0.1` para `cav.receita.fazenda.gov.br`, `api.hcaptcha.com`, `imgs.hcaptcha.com`, `accounts.hcaptcha.com`, `regularize.pgfn.gov.br`, `www.regularize.pgfn.gov.br` e `salas-apps.pr.sebrae.com.br`
  - `sgcg_govbr_allowed` passou a conter IPs atuais como `189.9.84.33` (`www8.receita.fazenda.gov.br`), `161.148.116.86` (`cav.receita.fazenda.gov.br`), `104.19.229.21/104.19.230.21` (`newassets.hcaptcha.com`), `104.18.12.205/104.18.13.205` (`*.w.hcaptcha.com`), `189.9.113.*` (`regularize.pgfn.gov.br`) e `201.44.246.153` (`salas-apps.pr.sebrae.com.br`)
  - rotas de `192.168.10.118` para os IPs de Receita, e-CAC, hCaptcha, PGFN e SEBRAE saem por `enp8s0` via `186.251.14.25`
  - `https://www8.receita.fazenda.gov.br/simplesnacional/servicos/grupo.aspx?grp=14` retornou `HTTP 200`
  - `https://cav.receita.fazenda.gov.br/autenticacao/login` retornou `HTTP 200`
  - `https://sso.acesso.gov.br/` retornou `HTTP 200` apos `1` redirect
  - `https://api.hcaptcha.com/` retornou `HTTP 200` apos `1` redirect
  - `https://newassets.hcaptcha.com/` retornou `HTTP 200`
  - `https://regularize.pgfn.gov.br/` retornou `HTTP 200` apos `2` redirects
  - `https://salas-apps.pr.sebrae.com.br/painelcontrole/administrador.php` retornou `HTTP 200`
  - `ufw`, `unbound`, `sgcg-vip-dns.service`, `squid`, `isc-dhcp-server`, `nginx`, `postgresql` e `sgcg-govbr-allowlist.timer` estavam ativos
  - `iptables-save -t filter` e `iptables-save -t nat` sem duplicatas

## Politica de Lista Branca - liberacao do Reddit - 2026-05-28

- solicitacao:
  - colocar `https://www.reddit.com/` na lista branca/permitida
- achados:
  - `reddit.com` e `redditmedia.com` faziam parte da politica ativa `Redes Sociais`, bloqueada nas VLANs `10`, `30`, `40`, `50` e `70`
  - o SGCG nao permite politica global generica fora do caso especial de bloqueio de pornografia; portanto a liberacao foi aplicada como politica nomeada por VLAN nas VLANs operacionais
- correcao aplicada:
  - criada politica nomeada `Liberacao Reddit` (`domain_policies.id=20`)
  - `policy_type='allow'`, `scope_type='vlan'`, `scope_value='10,30,40,50,70'`, `enabled=true`
  - dominios cobertos:
    - `reddit.com`
    - `www.reddit.com`
    - `old.reddit.com`
    - `redd.it`
    - `redditstatic.com`
    - `www.redditstatic.com`
    - `redditmedia.com`
    - `www.redditmedia.com`
    - `redditinc.com`
    - `reddit.map.fastly.net`
  - o motor `blockingReleaseService.apply('codex-reddit-allowlist-20260528')` reaplicou `ACL + DNS`
  - a politica gerou `35` linhas ativas em `release_policies` (`7` dominios normalizados por VLAN nas VLANs `10`, `30`, `40`, `50` e `70`)
- observacao de precedencia:
  - as linhas de bloqueio herdadas de `Redes Sociais` continuam no banco como politica base, mas a politica de lista branca do Reddit entrou nos artefatos de allowlist por VLAN e o compilador removeu o bloqueio efetivo dos artefatos gerados para esses dominios
- validacao:
  - `/etc/unbound/becker/allowlist-vlan-10.rpz`, `allowlist-vlan-30.rpz`, `allowlist-vlan-40.rpz`, `allowlist-vlan-50.rpz` e `allowlist-vlan-70.rpz` contem `reddit.com`, `old.reddit.com`, `redd.it`, `redditstatic.com`, `redditmedia.com`, `redditinc.com` e `reddit.map.fastly.net` como `rpz-passthru`
  - `/etc/squid/acl/allowlist-vlan-10.acl`, `allowlist-vlan-30.acl`, `allowlist-vlan-40.acl`, `allowlist-vlan-50.acl` e `allowlist-vlan-70.acl` contem os mesmos dominios de Reddit
  - os artefatos efetivos de blocklist por VLAN deixaram de conter `reddit.com` e `redditmedia.com`
  - DNS para `www.reddit.com`, `reddit.com`, `redd.it`, `redditstatic.com` e `redditmedia.com` resolveu nos gateways `192.168.10.1`, `192.168.30.1`, `192.168.40.1`, `192.168.50.1` e `192.168.70.1`
  - `https://www.reddit.com/` retornou `HTTP 200` usando origem dos gateways das VLANs `10`, `30`, `40`, `50` e `70`, com tempo total aproximado entre `0.06s` e `0.07s`
  - `unbound-checkconf /etc/unbound/unbound.conf` sem erros
  - `squid -k parse` sem erro fatal
  - `ufw`, `unbound`, `squid`, `postgresql`, `nginx` e `isc-dhcp-server` ativos
  - `iptables-save -t filter` e `iptables-save -t nat` sem duplicatas

## Revisao de conectividade generica, Unbound e SGCG_GUARD - 2026-05-28

- sintoma reportado:
  - apos ajustes no Unbound, dominios nao previamente conhecidos pareciam nao abrir; exemplo informado: `dcc.godaddy.com` com `ERR_CONNECTION_TIMED_OUT`
- achados runtime:
  - `dcc.godaddy.com` resolvia corretamente no Unbound como `dcc.godaddy.com.edgekey.net` -> `e6001.x.akamaiedge.net` -> `23.201.216.12`
  - o HTTPS a partir dos gateways das VLANs abria com `HTTP 200`, indicando que o problema nao era `NXDOMAIN` nem falta de cache local
  - o `conntrack` de clientes reais mostrava varias conexoes TCP em `SYN_RECV`, e o `SGCG_GUARD` aplicava `connlimit >100` antes da regra stateful geral do UFW
  - o encaminhamento raiz do Unbound principal ainda usava `1.1.1.2`, resolvedor Cloudflare filtrado, o que podia reduzir funcionalidade para dominios frios/genericos
- correcao aplicada:
  - `/etc/sgcg/hardening-rules.sh` passou a remover e recriar uma regra explicita `SGCG:stateful-return-before-guard` em `FORWARD`, permitindo somente retorno `RELATED,ESTABLISHED` de `enp8s0` para `enp6s0+` antes do `SGCG_GUARD`
  - `SGCG_GUARD` agora faz `RETURN` para pacotes `RELATED,ESTABLISHED` logo apos descartar `INVALID`, impedindo que conexoes ja rastreadas caiam nos limites de novas conexoes
  - `SGCG:connlimit` passou de `>100` em todo TCP para `>300` apenas em novos SYN TCP, preservando protecao contra abuso sem derrubar navegacao moderna com muitas conexoes paralelas
  - o script passou a limpar previamente os bloqueios WAN das portas internas `6778`, `6777` e `8901` para nao gerar duplicatas ao reiniciar o servico
  - `/etc/unbound/unbound.conf.d/beckercorp_v8.conf` e `/etc/unbound/sgcg-vip-clean.conf` tiveram o encaminhamento raiz revisado para resolvedores normais: `9.9.9.9`, `149.112.112.112`, `1.1.1.1` e `1.0.0.1`
  - adicionado `forward-first: yes` no encaminhamento raiz para manter performance por forwarder e permitir fallback para recursao plena se todos os forwarders falharem
  - reiniciados `sgcg-hardening.service`, `unbound` e `sgcg-vip-dns.service`
- validacao:
  - `bash -n /etc/sgcg/hardening-rules.sh` sem erro
  - `sgcg-hardening.service` ativo e persistiu `/etc/iptables/rules.v4`
  - `iptables -vnL FORWARD` confirmou `SGCG:stateful-return-before-guard` na posicao `1`, com contador ativo
  - `iptables -vnL SGCG_GUARD` confirmou `RETURN RELATED,ESTABLISHED` antes de scans/flood/connlimit e `SGCG:connlimit` como SYN `>300`
  - `iptables-save -t filter` retornou `duplicates=0`; `iptables-save -t nat` retornou `duplicates=0`
  - `unbound-checkconf /etc/unbound/unbound.conf` e `unbound-checkconf -f /etc/unbound/sgcg-vip-clean.conf` sem erros
  - `dcc.godaddy.com`, `www.reddit.com`, `pontorh.com.br`, `gov.br` e `salas-apps.pr.sebrae.com.br` resolveram via `192.168.10.1`
  - `facebook.com`, `youtube.com` e `pornhub.com` continuaram sem IP via `192.168.10.1`
  - `https://dcc.godaddy.com/` retornou `HTTP 200` usando origem dos gateways `192.168.10.1`, `192.168.30.1`, `192.168.50.1` e `192.168.70.1`
  - consultas diretas do PontoRH para OpenDNS `208.67.222.222` e `208.67.220.220` continuaram resolvendo `pontorh.com.br`
  - `ufw`, `unbound`, `sgcg-vip-dns.service`, `squid`, `isc-dhcp-server`, `nginx` e `postgresql` ativos

## SSL interno da Central de Chamados - 2026-06-01

- solicitacao:
  - aplicar HTTPS interno para a parte do colaborador na Central de Chamados do SGCG
- estado aplicado:
  - vhost `/etc/nginx/sites-available/console.interno.jacarezinho` ja atende `80` com redirecionamento para `443` e `443 ssl http2`
  - certificado interno em uso: `/etc/sgcg/pki/console-interno-jacarezinho.crt`
  - chave interna em uso: `/etc/sgcg/pki/console-interno-jacarezinho.key`
  - CA raiz interna em uso: `/etc/sgcg/pki/sgcg-internal-root-ca.crt`
  - SANs confirmados no certificado:
    - `console.interno.jacarezinho`
    - `console.jacarezinho.interno`
    - `suporte.interno.jacarezinho`
    - `suporte.jacarezinho.interno`
    - `chamados.interno.jacarezinho`
    - `chamados.jacarezinho.interno`
    - `console.local.jacarezinho`
    - `console.jacarezinho.local`
    - `192.168.10.1`
- URLs operacionais:
  - colaborador: `https://suporte.jacarezinho.interno/`
  - colaborador: `https://chamados.jacarezinho.interno/`
  - caminho alternativo: `https://console.interno.jacarezinho/suporte`
  - admin SGCG: `https://console.interno.jacarezinho/chamados`
- distribuicao da CA:
  - `http://suporte.jacarezinho.interno/sgcg-root-ca.crt` entrega a CA raiz interna como `application/x-x509-ca-cert`
  - `http://suporte.jacarezinho.interno/` redireciona para `https://suporte.jacarezinho.interno/`
- validacao executada:
  - `nginx -t` concluiu com sintaxe OK e teste bem-sucedido
  - `systemctl reload nginx` aplicado sem erro
  - `openssl x509 -in /etc/sgcg/pki/console-interno-jacarezinho.crt -noout -subject -issuer -dates -ext subjectAltName` confirmou emissor `SGCG Jacarezinho Internal Root CA`
  - `dig +short @127.0.0.1 suporte.jacarezinho.interno` -> `192.168.10.1`
  - `dig +short @127.0.0.1 chamados.jacarezinho.interno` -> `192.168.10.1`
  - `curl --cacert /etc/sgcg/pki/sgcg-internal-root-ca.crt --resolve suporte.jacarezinho.interno:443:127.0.0.1 -I https://suporte.jacarezinho.interno` -> `HTTP/2 200`
  - `curl --cacert /etc/sgcg/pki/sgcg-internal-root-ca.crt --resolve chamados.jacarezinho.interno:443:127.0.0.1 -I https://chamados.jacarezinho.interno` -> `HTTP/2 200`
  - `curl --cacert /etc/sgcg/pki/sgcg-internal-root-ca.crt --resolve console.interno.jacarezinho:443:127.0.0.1 -I https://console.interno.jacarezinho/suporte` -> `HTTP/2 200`
  - `curl -sSI -H 'Host: suporte.jacarezinho.interno' http://127.0.0.1/sgcg-root-ca.crt` -> `HTTP/1.1 200 OK`
- observacao operacional:
  - para o navegador do colaborador nao exibir alerta, instalar a CA raiz interna `sgcg-root-ca.crt` como Autoridade de Certificacao Raiz Confiavel nas estacoes/dispositivos

## Portal de Atendimento ao Colaborador - correcao do pos-login - 2026-06-01

- sintoma reportado:
  - ao informar usuario e senha no Portal de Atendimento ao Colaborador e clicar em `Entrar`, aparecia `Entrada confirmada. Voce ja pode abrir e acompanhar chamados.`, mas a tela permanecia no formulario de login
  - era necessario clicar em `Entrar` mais de uma vez para acessar efetivamente o portal
- correcao aplicada:
  - `frontend/src/pages/SupportPortal.jsx` passou a criar o cabecalho `X-SGCG-Support-Token` por funcao utilitaria, evitando depender de estado React ainda nao atualizado no mesmo ciclo do login
  - `loadTickets()` agora aceita o token recem-retornado pela API e carrega os chamados imediatamente apos autenticar
  - `submitLogin()` valida a presenca do token, grava usuario/token, limpa a senha, fixa a view inicial em `Novo chamado` e ja executa o carregamento com o token novo
- validacao:
  - `npm run build` em `frontend/` concluiu com sucesso
  - `pm2 restart bcc-frontend --update-env` aplicado e `bcc-frontend` ficou `online`
  - `https://suporte.jacarezinho.interno/` respondeu `HTTP/2 200` via Nginx interno com a CA SGCG
  - bundle publicado contem a nova protecao `missing_support_token` e o fluxo atualizado do token de suporte

## Central de Chamados - sino bidirecional com previa e abertura direta - 2026-06-01

- solicitacao:
  - atualizar automaticamente o fluxo entre Portal de Atendimento ao Colaborador e SGCG
  - quando o colaborador abrir chamado, o sino do SGCG deve mostrar notificacao quase imediata
  - ao clicar no sino, deve aparecer a mensagem ou parte dela; ao clicar na mensagem, abrir a pagina de chamados diretamente no chamado
  - o mesmo comportamento deve existir no portal do colaborador quando a equipe SGCG responder
- backend:
  - `/api/support/notifications` agora retorna `unread`, `active` e `notifications[]` com `id`, `protocol`, `title`, `requester_name`, `priority_label`, `status_label`, `snippet` e metadados do ultimo comentario relevante
  - no SGCG, a previa prioriza o ultimo comentario do colaborador; se nao houver comentario, usa a descricao do chamado
  - `/api/support/public/notifications` agora retorna `unread` e `notifications[]` para o colaborador autenticado pelo `X-SGCG-Support-Token`
  - no portal publico, a previa prioriza o ultimo comentario da equipe SGCG; se nao houver comentario, usa a descricao do chamado
  - `GET /api/support/public/tickets` deixou de limpar `requester_unread`; a notificacao do colaborador agora so e limpa ao abrir o detalhe do chamado
- frontend:
  - `frontend/src/components/SupportBell.jsx` passou de contador simples para menu de notificacoes com polling a cada `3s` e refresh ao focar a janela
  - o menu exibe protocolo, prioridade, titulo, trecho da mensagem e solicitante quando aplicavel
  - no SGCG, clicar na previa navega para `/chamados?ticket=<id>`
  - `frontend/src/pages/SupportTickets.jsx` passou a ler `ticket` na query string e abrir diretamente o chamado, marcando `admin_unread=false` apenas ao abrir o detalhe
  - no Portal de Atendimento ao Colaborador, clicar na previa do sino abre diretamente o chamado no detalhe; clicar em `Ver central de chamados` abre a lista sem limpar as notificacoes
- validacao:
  - `npm run build` em `backend/` concluiu com sucesso
  - `npm run build` em `frontend/` concluiu com sucesso
  - `pm2 restart bcc-backend --update-env` e `pm2 restart bcc-frontend --update-env` aplicados; ambos ficaram `online`
  - `GET http://127.0.0.1:6778/api/support/notifications` sem JWT retornou `401`
  - `GET http://127.0.0.1:6778/api/support/public/notifications` sem token de suporte retornou `401`
  - `https://suporte.jacarezinho.interno/` respondeu `HTTP/2 200`
  - `https://console.interno.jacarezinho/chamados` respondeu `HTTP/2 200`

## CA interna SGCG - instalador PowerShell Windows - 2026-06-01

- solicitacao:
  - criar um instalador Windows em `.ps1` para instalar a CA raiz interna do SGCG nos dispositivos
- artefato criado:
  - `sgcg-endpoint-identity-msi/tools/windows/INSTALAR-CA-SGCG.ps1`
- comportamento:
  - baixa a CA raiz por padrao de `http://suporte.jacarezinho.interno/sgcg-root-ca.crt`
  - usa fallback automatico para `http://192.168.10.1/sgcg-root-ca.crt`
  - valida o subject esperado `CN=SGCG Jacarezinho Internal Root CA`
  - valida expiracao antes de instalar
  - instala em `Cert:\LocalMachine\Root` por padrao, exigindo PowerShell como Administrador
  - aceita `-CurrentUserOnly` para instalacao em `Cert:\CurrentUser\Root` quando nao houver privilegio administrativo
  - verifica a instalacao pelo thumbprint e imprime subject, issuer, thumbprint e validade
- uso recomendado no Windows:
  - abrir PowerShell como Administrador
  - executar `powershell.exe -ExecutionPolicy Bypass -File .\INSTALAR-CA-SGCG.ps1`
- observacao:
  - apos instalar a CA, fechar e reabrir o navegador para que ele recarregue a confianca do sistema

## Central de Chamados - alerta visual no SGCG - 2026-06-01

- solicitacao:
  - no SGCG, exibir algo mais visivel quando houver solicitacao de chamado aberto
  - desejado: popup, aba do navegador piscando ou ambos
- implementacao:
  - `frontend/src/components/SupportBell.jsx` agora, no modo administrativo do SGCG, exibe um popup flutuante quando detecta chamado nao lido novo
  - o popup mostra `Novo chamado recebido`, protocolo, titulo, trecho da mensagem e solicitante
  - clicar no popup abre diretamente o chamado pela mesma acao do sino
  - enquanto existir chamado nao lido no SGCG, o titulo da aba alterna entre o titulo normal e `(<quantidade>) Chamado novo - SGCG`
  - a piscada da aba e limitada ao SGCG administrativo; o portal publico do colaborador nao altera o titulo da aba
- validacao:
  - `npm run build` em `frontend/` concluiu com sucesso
  - `pm2 restart bcc-frontend --update-env` aplicado e `bcc-frontend` ficou `online`
  - `https://console.interno.jacarezinho/chamados` respondeu `HTTP/2 200`

## Central de Chamados - criacao no Portal e contagem real do sino - 2026-06-01

- sintomas reportados:
  - ao abrir chamado pelo Portal de Atendimento ao Colaborador, a tela permanecia com todas as informacoes preenchidas, dando a impressao de que o chamado nao foi criado
  - a aba do navegador indicava chamado novo, mas o sino nao exibia o chamado e a Central de Chamados parecia nao listar a solicitacao
- causa identificada:
  - havia erros `tuple concurrently updated` nas rotas de chamados, causados por concorrencia entre polling/notificacoes e a rotina de garantia de schema
  - a notificacao administrativa contava chamados ativos como `unread`, mas o menu do sino listava apenas chamados com `admin_unread = TRUE`; isso fazia a aba piscar mesmo sem item novo no sino
- backend:
  - `ensureSchema()` passou a reutilizar uma promessa compartilhada (`schemaReady`), evitando DDL concorrente em requisicoes simultaneas
  - `/api/support/notifications` agora separa corretamente `unread` de `active`; o contador do sino passa a refletir apenas `admin_unread = TRUE`
- frontend:
  - ao criar chamado com sucesso, o Portal limpa o formulario, adiciona o chamado retornado na lista local e abre diretamente o detalhe do chamado criado
  - o envio do chamado usa o token atual de suporte diretamente em `X-SGCG-Support-Token`, evitando cabecalho antigo
  - mensagens de erro/sucesso tambem aparecem perto do botao `Abrir chamado`, alem do topo da tela
- evidencias:
  - consulta ao banco mostrou o chamado `SGCG-CH-20260601-00003` criado em `2026-06-01 11:04:55-03`
  - estado atual da contagem administrativa: `unread=0`, `active=1`; assim chamado ativo antigo nao deve mais piscar a aba como se fosse novo
- validacao:
  - `npm run build` em `backend/` concluiu com sucesso
  - `npm run build` em `frontend/` concluiu com sucesso
  - `pm2 restart bcc-backend --update-env` e `pm2 restart bcc-frontend --update-env` aplicados; ambos ficaram `online`
  - `https://suporte.jacarezinho.interno/` respondeu `HTTP 200` via resolve interno para `192.168.10.1`
  - `https://console.interno.jacarezinho/chamados` respondeu `HTTP 200` via resolve interno para `192.168.10.1`
  - `GET http://127.0.0.1:6778/api/support/notifications` sem JWT retornou `401`
  - `GET http://127.0.0.1:6778/api/support/public/notifications` sem token de suporte retornou `401`

## Portal do Colaborador - atalhos de categoria e limpar formulario - 2026-06-01

- solicitacao:
  - ao clicar em um card pre-pronto de `Novo chamado`, preencher automaticamente `Titulo curto` com o nome do card
  - adicionar botao `Limpar` ao lado de `Abrir chamado`
- implementacao:
  - `frontend/src/pages/SupportPortal.jsx` ganhou `selectCategory(item)`, que define a categoria e preenche o titulo com `item.label`
  - criado `clearTicketForm()`, que restaura o formulario para o estado inicial e limpa mensagens exibidas
  - os botoes finais do formulario agora ficam em linha no desktop: `Abrir chamado` como acao principal e `Limpar` como acao secundaria
- validacao:
  - `npm run build` em `frontend/` concluiu com sucesso
  - `pm2 restart bcc-frontend --update-env` aplicado; `bcc-frontend` ficou `online`
  - `https://127.0.0.1:6777/` respondeu `HTTP 200`

## Central de Chamados - arquivamento de chamados resolvidos - 2026-06-01

- decisao:
  - chamados resolvidos nao serao apagados; serao guardados por arquivamento logico
  - o historico permanece no banco para consulta, auditoria e recorrencia de problemas
- backend:
  - `support_tickets` recebeu a coluna `archived_at TIMESTAMPTZ`
  - criado indice `idx_support_tickets_archive`
  - `publicTicket()` agora retorna `archived`
  - `/api/support/tickets` ganhou filtros administrativos:
    - `active`: chamados nao arquivados e ainda em atendimento
    - `closed`: chamados nao arquivados com status final (`resolved`, `denied`, `canceled`)
    - `archived`: chamados com `archived_at IS NOT NULL`
    - `all`: todos nao arquivados
  - `/api/support/tickets/:id/archive` marca `archived_at`, limpa `admin_unread` e registra evento/auditoria
  - `/api/support/tickets/:id/unarchive` remove `archived_at` e registra evento/auditoria
  - sino/notificacoes administrativas ignoram chamados arquivados
  - se colaborador ou equipe responder em um chamado arquivado, o chamado sai do arquivo automaticamente (`archived_at = NULL`) para voltar ao fluxo normal
  - Portal do Colaborador continua listando o historico dos chamados do proprio usuario, inclusive arquivados
- frontend:
  - Central de Chamados agora inicia em `Abertos`
  - filtros principais: `Abertos`, `Resolvidos`, `Arquivados`, `Todos`
  - chamados arquivados exibem badge `Arquivado`
  - detalhe de chamado resolvido/negado/cancelado mostra botao `Arquivar chamado`
  - detalhe de chamado arquivado mostra botao `Restaurar chamado` e data de arquivamento
- validacao:
  - `npm run build` em `backend/` concluiu com sucesso
  - `npm run build` em `frontend/` concluiu com sucesso
  - `pm2 restart bcc-backend --update-env` e `pm2 restart bcc-frontend --update-env` aplicados; ambos ficaram `online`
  - `GET http://127.0.0.1:6778/api/support/public/notifications` sem token retornou `401`, executando tambem a garantia de schema
  - `information_schema.columns` confirmou `support_tickets.archived_at` como `timestamp with time zone`
  - contagem atual: `visible=5`, `archived=0`
  - `https://127.0.0.1:6777/` respondeu `HTTP 200`
  - `git diff --check` sem erros
