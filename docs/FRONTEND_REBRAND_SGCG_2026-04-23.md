# Frontend Rebrand SGCG - Estado Atual

Data: `2026-04-23`
Ambiente: `/opt/controlebeckercorp-v8`

## Objetivo solicitado

Reestruturar a camada visual do frontend para um posicionamento mais institucional/governamental, com:

- troca do nome `Controle Becker Corp - V8` para `SGCG - Sistema de Governança e Controle Governamental da JMB Tecnologia`
- rebrand da tela de login
- rebrand do sidebar
- remocao da secao `Sessão atual`
- mover o usuario logado para o rodape do sidebar com avatar e acao de logout
- criar um modulo inicial de `Configurações`
- incluir toggle de temas e cores

## O que ja foi mapeado

Arquivos principais do frontend envolvidos:

- `frontend/src/App.jsx`
- `frontend/src/pages/Login.jsx`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/components/ui/Sidebar.jsx`
- `frontend/src/components/ui/Topbar.jsx`
- `frontend/src/components/ui/AppShell.jsx`
- `frontend/src/index.css`

## Estado atual encontrado

### Shell do app

- `App.jsx` controla autenticacao, tema e rotas
- o token continua em `localStorage` com a chave `becker_token`
- o usuario continua em `localStorage` com a chave `becker_user`
- o tema atual usa a chave `becker_theme`

### Sidebar

- o menu real vem de `frontend/src/components/Sidebar.jsx`
- a renderizacao visual do sidebar esta em `frontend/src/components/ui/Sidebar.jsx`
- o sidebar atual ainda mostra:
  - `Controle Becker Corp`
  - `V8 Core`
  - secao `Sessão atual`
  - botao de logout separado no rodape

### Login

- a tela atual esta em `frontend/src/pages/Login.jsx`
- ela ainda usa a marca `BeckerCorp - V8`
- ja possui toggle simples de tema
- o layout atual usa uma linguagem mais de datacenter/infraestrutura do que institucional/governamental

### Tema global

- a base visual global esta em `frontend/src/index.css`
- existe suporte atual a `light` e `dark` via `data-theme`
- ainda nao existe suporte estruturado para paleta/cor institucional selecionavel

## Logotipo JMB localizado

Foi encontrado um ativo aproveitavel em outro projeto do host:

- origem: `/opt/dracarla/public/jmb-logo.png`
- dimensao: `220x96`

Esse arquivo ja foi copiado para:

- destino: `frontend/public/jmb-logo.png`

## Decisao de implementacao

A implementacao planejada e esta:

1. Centralizar `theme` e `accent color` no `App.jsx`
2. Passar esse estado para `Login`, `Topbar` e novo modulo `Configurações`
3. Rebrand do `Login.jsx` para `SGCG`
4. Rebrand do `Sidebar.jsx` para identidade JMB/SGCG
5. Remover a caixa `Sessão atual`
6. Criar rodape do sidebar com:
   - avatar
   - nome do usuario logado
   - cargo/descricao curta
   - icone/botao de logout
7. Criar pagina `frontend/src/pages/Settings.jsx`
8. Adicionar rota e item de menu para `Configurações`
9. Expandir `index.css` para suportar tema + selecao de cor institucional
10. Rodar `vite build` para validar

## Implementacao concluida nesta etapa

Arquivos alterados:

- `frontend/src/App.jsx`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/components/ui/Sidebar.jsx`
- `frontend/src/components/ui/Topbar.jsx`
- `frontend/src/pages/Login.jsx`
- `frontend/src/pages/Settings.jsx`
- `frontend/src/index.css`
- `frontend/public/jmb-logo.png`

## Resultado entregue

### Rebrand institucional

- login rebatizado para `SGCG`
- linguagem visual trocada para posicionamento institucional/governamental
- marca `JMB` aplicada na tela de login e no sidebar
- nomenclatura principal atual:
  - `SGCG`
  - `Sistema de Governança e Controle Governamental`
  - `Plataforma institucional da JMB Tecnologia`

### Sidebar

- removida a secao `Sessão atual`
- incluido rodape com usuario logado
- incluido avatar com inicial do usuario
- incluido papel/perfil do usuario
- logout convertido em icone/acao no rodape do sidebar

### Configuracoes

Foi criado o modulo:

- `frontend/src/pages/Settings.jsx`

Com:

- seletor de tema `claro/escuro`
- seletor de cor institucional
- opcoes:
  - `Governamental`
  - `Institucional`
  - `Executivo`

### Shell e estado global

- `App.jsx` agora centraliza:
  - `theme`
  - `accent`
- persistencia em:
  - `localStorage.sgcg_theme`
  - `localStorage.sgcg_accent`
- compatibilidade mantida com `becker_theme`

### Topbar

- adicionada referencia textual ao `SGCG`
- toggle de tema mantido

## Validacao executada

Build validado com sucesso:

- `cd frontend && npm run build`

Resultado observado:

- build concluido sem erros
- bundle gerado em `frontend/dist/`

## Atualizacao posterior - preferencia por usuario

Solicitacao adicional registrada:

- retirar os controles de tema e cor da pagina de login
- permitir a escolha de tema somente apos autenticacao
- persistir tema e cor por usuario logado

Decisao funcional para a proxima iteracao:

1. a tela de login deve permanecer neutra, sem toggle de tema ou seletor de paleta
2. o modulo `Configurações` passa a ser a unica origem de alteracao de aparencia
3. a persistencia nao deve mais ser global no navegador
4. tema e paleta devem ser gravados por usuario autenticado
5. o logout nao deve apagar as preferencias visuais do usuario

Status desta solicitacao:

- registrada
- ainda nao aplicada no codigo nesta rodada

## Estado atual consolidado para retomada futura

### O que ja esta aplicado no frontend

- rebrand principal para `SGCG`
- marca `JMB` aplicada no login e no sidebar
- sidebar com topo centralizado:
  - logotipo JMB
  - selo `SGCG`
  - titulo institucional
  - subtitulo institucional
- secao `Sessão atual` removida do sidebar
- usuario logado movido para o rodape do sidebar com avatar e logout
- header simplificado sem avatar e sem nome do usuario
- modulo `Configurações` criado
- modulo `Configurações` com:
  - tema `claro/escuro`
  - paleta institucional
  - estilos visuais de UI

### Estilos de UI ja cadastrados

Atualmente a pagina `Configurações` expoe estes estilos visuais:

- `Glassmorphism`
- `Solid`
- `Minimal`
- `Executive`

Esses estilos hoje atuam principalmente via variaveis globais em `frontend/src/index.css`.

### Ajustes recentes da tela de login

- pagina de login tornada mais responsiva
- cards institucionais reduzidos para melhorar encaixe em telas menores
- card `Aparência inicial` removido
- mencao explicita a `LGPD` incluida no texto institucional

### Problema estrutural identificado

Foi constatado que o frontend ainda esta visualmente fragmentado:

- cada modulo parece seguir uma linguagem visual diferente
- existem niveis distintos de densidade, hierarquia, espacamento e acabamento
- o shell novo do `SGCG` convive com paginas antigas que ainda mantem aparencia de ferramenta interna/legada
- o sistema ja tem tema global, mas ainda nao possui um design system realmente imposto aos modulos

### Decisao de continuidade

Na proxima etapa, o trabalho recomendado nao e mais de ajustes isolados de tela.

O caminho correto passa a ser uma reforma visual e estrutural do frontend, com:

1. definicao de um design system do `SGCG`
2. consolidacao de tokens visuais obrigatorios
3. padronizacao de:
   - headers de pagina
   - cards
   - tabelas
   - formularios
   - dialogs
   - navegacao
4. migracao dos modulos por ondas

### Prioridade sugerida para a reforma futura

1. shell global
   - sidebar
   - topbar
   - dashboard base
   - login
   - configuracoes
2. modulos criticos
   - usuarios

## Atualizacao 2026-04-24 - Fase 1 do roadmap GovTech

Nesta retomada foi iniciada a primeira fase real da reestruturacao do produto para um modelo mais GovTech, com enfase em leitura institucional, separacao entre governanca e controle e reducacao da densidade visual escura.

### Ajustes estruturais aplicados

- o frontend passou a assumir `light` como tema padrao para novos acessos, em vez de iniciar em `dark`
- o estilo visual padrao do shell passou a ser `solid`, favorecendo leitura administrativa e menos fadiga visual
- o `logout` deixou de usar `localStorage.clear()`
- as preferencias visuais deixaram de ser descartadas no logout
- tema, paleta e estilo de UI passam a ser persistidos por usuario quando existe identificador do usuario autenticado

### Persistencia visual

Agora o app grava:

- `sgcg_theme`
- `sgcg_accent`
- `sgcg_ui_style`

E, quando houver usuario identificado, tambem grava chaves com escopo por usuario:

- `sgcg_theme_<usuario>`
- `sgcg_accent_<usuario>`
- `sgcg_ui_style_<usuario>`

Com isso:

- o usuario escolhe a aparencia depois de entrar
- as preferencias nao sao apagadas ao sair
- o sistema pode ter comportamento visual diferente por usuario sem depender apenas de um valor global do navegador

### Ajuste da base visual global

O arquivo `frontend/src/index.css` foi suavizado para uma aparencia mais clara e institucional:

- superficies ficaram mais claras
- sombras foram reduzidas no modo claro
- contraste de bordas ficou menos agressivo
- o fundo do app ficou menos carregado

Objetivo:

- reduzir a sensacao de painel `SOC/dark`
- aproximar a experiencia de uma estacao de governanca, auditoria e decisao institucional

### Migracao do modulo piloto - Bloqueios & Liberacoes

O modulo `frontend/src/pages/BlockingReleases.jsx` passou a ser tratado como modulo piloto da nova arquitetura do produto.

#### Reposicionamento conceitual

O modulo foi reescrito em linguagem mais institucional para refletir:

- governanca de politicas
- escopos de rede
- excecoes VIP
- conformidade LGPD
- enforcement tecnico
- contingencia e telemetria

#### Renomeacoes aplicadas

Tabs do modulo:

- `Visão Geral` -> `Painel Executivo`
- `Políticas` -> `Políticas & Escopos`
- `VLANs` -> `Escopos de Rede`
- `VIPs` -> `Exceções VIP`
- `LGPD` -> `Conformidade LGPD`
- `Radar em Tempo Real` -> `Radar Operacional`
- `Motor & Saúde` -> `Motor de Controle`
- `Métricas` -> `Telemetria`

Hero e secoes internas:

- o hero passou a falar em `politicas, excecoes e enforcement`
- foi removida a ideia de modulo `MD3 dark adaptado`
- a comunicacao passou a destacar `Padrão SGCG` e `Governança + Controle`
- varias secoes internas foram renomeadas para leitura executiva:
  - `Leitura rápida do módulo` -> `Síntese executiva do módulo`
  - `Alertas importantes` -> `Pontos de atenção`
  - `Matriz operacional por VLAN` -> `Matriz por escopo de rede`
  - `Políticas` -> `Políticas nomeadas`
  - `Escopos de políticas` -> `Escopos de aplicação`
  - `VLANs` -> `Escopos de rede`
  - `VIPs` -> `Exceções VIP`
  - `Modos do motor` -> `Modos de enforcement`
  - `Motor & Saúde` -> `Motor de controle`
  - `LGPD` -> `Conformidade LGPD`

### Estado da fase

Esta etapa nao conclui a reforma do frontend inteiro, mas fecha tres fundamentos importantes do roadmap:

1. o shell ficou menos escuro por padrao
2. a preferencia visual deixou de ser descartavel no logout
3. o modulo central de politicas comecou a ser migrado para a linguagem oficial do `SGCG`

### Avanco adicional nesta mesma rodada

O modulo `frontend/src/pages/Network.jsx` tambem recebeu a primeira camada de migracao para o padrao institucional:

- header antigo `REDE & IP / Gestão de Infraestrutura V8` removido
- novo header via `ModuleHeader` com posicionamento `Controle de Rede`
- descricao reescrita para linguagem institucional
- navegacao interna convertida para o mesmo padrao de tabs segmentadas do shell GovTech
- rotulos internos ajustados:
  - `VLAN's` -> `Escopos VLAN`
  - `DNS Unbound` -> `DNS Institucional`
  - `Bloqueios` -> `Controle de Acesso`

Isso ainda nao refatora todos os cards internos do modulo, mas ja unifica a moldura do produto e reduz a sensacao de que cada pagina pertence a um sistema diferente.

### Correcao de consistencia visual - Horarios

O submodulo `frontend/src/pages/VlanManagerMD3.jsx`, usado na aba `Horários` dentro de `Controle de Rede`, estava visualmente isolado do restante do sistema:

- fundo proprio em `slate`
- classes `dark:` locais
- botoes e cards sem obedecer ao shell visual do `SGCG`

Correcao aplicada:

- remocao da base visual propria em `slate`
- adocao de `ModuleHeader`
- adocao de `Surface`
- adocao de `ActionButton`
- inputs e estados visuais migrados para os tokens globais do sistema

Resultado:

- a aba `Horários` agora segue o tema global do frontend
- o modo `light` do sistema nao fica mais quebrado por um bloco escuro isolado

### Avanco adicional - Seguranca Operacional

O modulo `frontend/src/pages/Security.jsx` tambem recebeu a primeira camada de migracao conceitual e visual.

Mudancas aplicadas:

- cabecalho antigo com linguagem de `SOC` removido
- novo `ModuleHeader` com posicionamento `Segurança Operacional`
- botoes principais migrados para `ActionButton`
- cards principais migrados para `Surface`
- linguagem ajustada para leitura mais institucional e menos militarizada/operacionalista

Alguns textos reposicionados:

- `Seguranca (SOC)` -> `Segurança Operacional`
- `SMTP da Sentinela` -> `SMTP institucional`
- `Sentinela: vetores de ataque` -> `Sentinela: vetores observados`
- `VULNERAVEL` -> `Requer atenção`
- `IPS PRESOS` -> `IPs bloqueados`

### Avanco adicional - Observabilidade DNS/Proxy

O modulo `frontend/src/pages/Proxy.jsx` tambem foi trazido para a arquitetura institucional do `SGCG`.

Mudancas aplicadas:

- cabecalho antigo `PROXY & LOGS` removido como elemento isolado
- novo `ModuleHeader` com posicionamento `Observabilidade DNS/Proxy`
- chips de estado migrados para `StatusChip`
- navegacao principal migrada para `SegmentedTabs`
- CTA de retorno para `Bloqueios & Liberações` migrado para `ActionButton`
- palette clara do modulo suavizada para ficar coerente com o shell claro do sistema

Reposicionamento conceitual:

- o modulo deixou de se apresentar como tela principal de operacao de politica
- passa a se assumir como camada de controle tecnico e observabilidade
- a politica institucional continua centralizada em `Bloqueios & Liberações`

Rotulos ajustados:

- `RADAR` -> `Radar Técnico`
- `MOTOR & CONTROLE` -> `Motor de Controle`
- bloco explicativo passou a destacar `Módulo de Controle Técnico`

### Fechamento da primeira rodada

Com a sequencia desta rodada, a primeira grande onda da reforma pode ser considerada concluida em nivel estrutural.

#### Modulos alcançados

Shell e base:

- `App.jsx`
- `Sidebar`
- `Topbar`
- `Login`
- `Settings`
- `index.css`

Governança:

- `Dashboard` como `Centro de Governança`
- `Users` como `Identidades & Perfis`
- `BlockingReleases` como modulo central de politica, excecao e conformidade

Controle:

- `Network` como `Controle de Rede`
- `VlanManagerMD3` como `Horários de Rede` integrado ao shell
- `Server` como `Controle de Infraestrutura`
- `Security` como `Segurança Operacional`
- `Proxy` como `Observabilidade DNS/Proxy`
- `Control` como `Operações Técnicas`
- `Backups` como `Continuidade & Backup`

#### O que foi concluido nesta primeira rodada

- separacao informacional entre `Governança` e `Controle`
- rebrand institucional do produto para `SGCG`
- base visual global mais clara e menos `dark`
- persistencia visual por usuario sem descarte no logout
- padronizacao progressiva de:
  - headers de modulo
  - superficies
  - tabs segmentadas
  - actions
  - linguagem institucional
- remocao dos elementos mais gritantes de visual legado ou de produto paralelo

#### O que fica para a segunda rodada

A proxima etapa deixa de ser reforma estrutural e passa a ser refinamento fino:

- revisar cada modulo tela por tela
- alinhar espacamentos e densidade
- suavizar ainda mais componentes isolados
- revisar textos, labels e microcopy
- corrigir eventuais restos visuais legados internos
- refinar responsividade e acabamento de tabelas, formularios e dialogs

### Atualizacao posterior - padrao de cards baseado no QoS

Foi definida uma diretriz adicional para o design system:

- todos os cards do sistema devem seguir o padrao visual observado em `Controle de Rede -> QoS`

Esse padrao foi propagado na base compartilhada em `frontend/src/components/ui/primitives.jsx` por meio do componente `Surface`.

Padrao aplicado:

- radius de `24px`
- borda semantica limpa
- sombra leve por padrao
- hover com elevacao suave
- faixa horizontal superior de acento
- visual mais compacto e legivel

Excecao aplicada:

- `ModuleHeader` nao recebe a faixa superior para nao competir com o papel de hero do modulo

Resultado pratico:

- os cards reutilizados pelos modulos migrados agora seguem uma leitura mais proxima do QoS
- a segunda rodada podera refinar casos internos restantes sem precisar redefinir o padrao base novamente

### Atualizacao posterior - segunda rodada visual

Foi iniciada uma segunda rodada com foco exclusivamente visual, sem reabrir a reforma estrutural da primeira fase.

#### Diretriz adotada

- consolidar uma unica tipografia principal
- elevar contraste de leitura
- reduzir excesso de caixa alta
- alinhar menus, chips, tabs e botoes para uma mesma hierarquia textual
- substituir microcopy excessivamente tecnica ou agressiva por linguagem institucional de governanca sem perder o contexto de TI

#### Ajustes aplicados nesta rodada

Base global:

- `IBM Plex Sans` consolidada como tipografia principal do sistema
- campos, botoes e controles passam a herdar a mesma fonte
- classes `font-mono` passaram a seguir a mesma familia para reduzir fragmentacao visual
- contraste e legibilidade de textos leves foram elevados

Componentes compartilhados:

- `StatusChip` deixou de usar caixa alta como padrao
- `ActionButton` deixou de usar caixa alta como padrao
- `SegmentedTabs` deixaram de usar caixa alta como padrao
- `ModuleHeader` e `FormField` ganharam hierarquia textual mais discreta e legivel
- `BlockingUi` herdou esse mesmo ajuste para metricas e estatisticas internas

Navegacao e shell:

- topbar ganhou contraste mais alto
- textos de chips da topbar ficaram mais legiveis
- identificacao institucional no topo ficou menos apagada
- sidebar teve secoes, subtitulo e papel do usuario com melhor contraste e menos formalismo visual cansativo
- rodape institucional do app deixou de usar caixa alta excessiva

Modulos com limpeza adicional:

- `Settings`
- `QosLimiter`
- `Network`
- `Security`

Nesses pontos foram ajustados:

- rotulos
- botoes
- estados
- titulos secundarios
- descricoes operacionais

#### Efeito esperado

- leitura menos massante
- menos choque entre modulos
- linguagem mais adequada a ambiente governamental e gestao institucional
- melhor leitura para operadores e gestores sem perder contexto tecnico

#### Validacao final desta rodada

Build executado com sucesso ao final da consolidacao:

- `cd frontend && npm run build`

Resultado:

- `✓ built in 2.36s`

### Validacao desta rodada

Build executado com sucesso:

- `cd frontend && npm run build`

Resultado:

- `✓ built in 2.36s`

### Proximo passo recomendado

Continuar a reforma modulo a modulo, mantendo a divisao entre `Governança` e `Controle`, nesta ordem:

1. aprofundar `BlockingReleases` como referencia do design system institucional
2. aprofundar a refatoracao interna de `Network`
3. migrar `Security`
4. migrar `Proxy`
5. voltar em `Users`, `Server`, `Backups` e `Control` para refinamento fino e eliminacao de restos visuais legados
   - rede
   - seguranca
   - bloqueios e liberacoes
3. modulos legados restantes

### Observacao importante

O sistema ja saiu da fase de simples retoques cosméticos.

A partir deste ponto, continuar ajustando pagina por pagina sem uma base comum tende a aumentar a divergencia visual do produto. A proxima sessao deve tratar o frontend como uma frente formal de unificacao visual e arquitetural.

### Normalizacao de estados visuais

Nesta passada foi concluida uma varredura especifica para remover discrepancias de leitura em estados positivos e de atencao:

- estados positivos foram consolidados em azul, inclusive nos pontos executivos de `Pontos de atenção` e `Políticas & Exceções`
- estados de atencao foram consolidados em laranja mais forte para melhorar leitura em tema claro
- hardcodes antigos em verde foram removidos de modulos como `BlockingReleases`, `Security`, `Network`, `Horários de Rede`, `Operações Técnicas`, `Continuidade & Backup` e `QoS`
- o objetivo foi alinhar tokens globais e implementacoes locais para deixar o sistema visualmente coerente antes da proxima rodada de refinamento fino

Validacao:

- `cd frontend && npm run build`
- `✓ built in 2.45s`

### Governanca de dados e responsividade

Nova passada aplicada para consolidar o sistema em um patamar mais institucional:

- topbar reestruturada para melhor alinhamento dos cards, leitura mais clara e comportamento mais estável em larguras intermediarias
- dashboard e cards executivos compactados para reduzir vazio estrutural e melhorar aproveitamento do espaco
- `Políticas & Exceções` deixou de tratar a leitura de dados como uma aba isolada de `LGPD` e passou a operar como `Relatório de Dados`, em contexto direto de governanca, evidencia e responsabilizacao
- mensagens, exportacoes e microcopy da trilha de acesso foram elevadas para uma linguagem mais aderente a governanca digital
- grades internas com duas colunas forçadas foram revistas em pontos criticos de `Security`, `Network`, `QoS` e `Horários de Rede` para evitar estrangulamento em telas menores

Validacao:

- `cd frontend && npm run build`
- `✓ built in 2.51s`
