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

## Proximo passo recomendado

Transformar os novos blocos de governanca em modulos com funcionalidade propria:

1. consolidar `Governança de Dados e Conformidade` como centro de evidencia, base legal, retencao e exportacao institucional
2. aprofundar `Aprovações & Exceções` com timeline institucional propria, filtros por vigencia e trilha de workflow separada da auditoria operacional
3. aprofundar `Trilha Institucional` para incorporar incidentes e correlacao entre decisao administrativa e efeito tecnico
4. revisar os modulos restantes para mover decisao institucional para a governanca e manter a camada de controle focada em execucao tecnica

## Ultima validacao registrada

- `cd backend-proxy && npm run build`
- compilacao TypeScript concluida sem quebra de contrato observada
- `cd backend && npm run build`
- compilacao TypeScript concluida com a nova camada de sessao institucional, ajuste de emissao de cookies por protocolo e fallback bearer
- `cd frontend && npm run build`
- `✓ built in 2.43s`
