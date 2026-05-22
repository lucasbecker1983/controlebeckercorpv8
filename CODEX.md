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
