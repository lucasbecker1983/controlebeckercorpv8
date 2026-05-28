# Arquitetura proposta - Autenticacao institucional VLAN 50 sem portal

Data: 2026-05-14

## Objetivo

Estruturar a possibilidade de exigir login e senha na `VLAN 50`, com experiencia parecida com rede corporativa/AD, sem portal cativo, mantendo auditoria completa e aderencia a LGPD e ao Marco Civil da Internet.

A recomendacao tecnica e implantar autenticacao de rede por `802.1X` com `FreeRADIUS`, integrada ao SGCG como console de identidade, governanca, auditoria e correlacao forense.

## Decisao recomendada

Usar:

- `802.1X` para autenticar antes de liberar o acesso a rede.
- `FreeRADIUS` como servidor RADIUS institucional.
- SGCG como camada de administracao de usuarios, grupos, dispositivos, sessoes, auditoria, relatorios e governanca.
- APs/switches da `VLAN 50` como clientes RADIUS.
- Accounting RADIUS para registrar inicio, fim, duracao e volume de sessoes quando o equipamento suportar.
- Correlacao com `dns_policy_events`, `navigation_events`, UFW, proxy e relatorios forenses ja existentes.

Essa arquitetura e melhor do que portal para este caso porque autentica no nivel da rede, antes da liberacao efetiva da porta/SSID. O usuario nao depende de navegador, WebView ou redirecionamento HTTP.

## Experiencia do usuario

### Wi-Fi

1. O usuario escolhe o SSID institucional da VLAN 50, preferencialmente `WPA2-Enterprise` ou `WPA3-Enterprise`.
2. O sistema operacional pede usuario e senha.
3. O AP envia a tentativa ao `FreeRADIUS`.
4. O SGCG/FreeRADIUS valida credenciais e politica.
5. Se aprovado, o AP libera a associacao e coloca o usuario na VLAN 50.
6. O DHCP entrega IP.
7. O SGCG registra sessao, usuario, MAC, IP, AP, SSID, horario e resultado.

### Rede cabeada

1. O usuario conecta o cabo na porta do switch.
2. O switch solicita autenticacao `802.1X`.
3. O computador exibe ou reutiliza credencial configurada.
4. O switch consulta o `FreeRADIUS`.
5. Se aprovado, a porta e liberada na VLAN 50.
6. Se reprovado, a porta permanece bloqueada ou cai em VLAN de quarentena, se essa politica for adotada.

## Componentes principais

### FreeRADIUS

Responsabilidades:

- receber requisicoes `Access-Request` dos APs/switches
- validar usuario, senha, status, grupo, horario e dispositivo
- responder `Access-Accept` ou `Access-Reject`
- receber eventos de accounting, quando habilitado
- registrar logs tecnicos de autenticacao
- acionar base/servicos do SGCG para auditoria e correlacao

### SGCG

Responsabilidades:

- modulo administrativo de identidades da VLAN 50
- cadastro e bloqueio de usuarios
- vinculo de usuario com setor, matricula, CPF opcional, perfil e grupo
- politica por grupo
- dispositivo/MAC conhecido
- sessoes ativas e historicas
- auditoria administrativa
- relatorio legal e relatorio forense
- integracao com modulo LGPD
- enriquecimento dos relatorios de navegacao

### APs e switches

Responsabilidades:

- atuar como clientes RADIUS
- aplicar `802.1X`
- enviar NAS-IP, NAS-Identifier, porta, SSID e MAC
- enviar accounting de inicio/fim/interim, se suportado
- opcionalmente aceitar `CoA` ou `Disconnect-Request` para corte imediato de sessoes

### PostgreSQL

Responsabilidades:

- persistir usuarios, dispositivos, grupos, sessoes, eventos e auditoria
- garantir integridade e trilha
- suportar relatorios por periodo, usuario, IP, MAC, equipamento, setor e resultado

## Modulo SGCG proposto

Nome sugerido: `Autenticacao Institucional VLAN 50`

Rotas sugeridas:

- `/vlan50-identidades`
- `/vlan50-sessoes`
- `/vlan50-auditoria`
- `/vlan50-relatorio-legal`

Entradas de menu:

- Governanca:
  - `Auditoria VLAN 50`
  - `Relatorio Legal VLAN 50`
- Controle:
  - `Autenticacao VLAN 50`
  - `Sessoes 802.1X`

## Estrutura funcional do modulo

### Identidades

Campos sugeridos:

- nome completo
- usuario/login
- setor
- matricula funcional
- CPF opcional, se houver fundamento institucional
- telefone/e-mail institucional opcional
- grupo/perfil
- status: ativo, suspenso, revogado, expirado
- validade do acesso
- obrigar troca de senha
- data de criacao
- responsavel pela criacao
- ultima alteracao

### Grupos e perfis

Exemplos:

- `SINE`
- `Administrativo`
- `Tecnico`
- `Acesso restrito`
- `Visitante autorizado`

Cada grupo pode definir:

- permissao de acesso a VLAN 50
- horario permitido
- necessidade de dispositivo previamente conhecido
- politica de expiracao
- observacao de base legal/finalidade
- integracao futura com politicas de DNS/ACL/QoS

### Dispositivos

Campos sugeridos:

- MAC address
- hostname, quando conhecido
- fabricante, quando inferido
- usuario vinculado
- status: confiavel, pendente, bloqueado, expirado
- primeiro acesso
- ultimo acesso
- ultimo IP
- observacao administrativa

### Sessoes 802.1X

Campos sugeridos:

- usuario
- MAC
- IP
- VLAN
- SSID
- NAS-IP
- NAS-Identifier
- porta do switch ou AP
- metodo EAP
- inicio
- fim
- duracao
- bytes in/out
- resultado: aceito, recusado, encerrado, expirado
- motivo da recusa ou encerramento
- origem do encerramento: usuario, equipamento, administrador, timeout, CoA

### Auditoria administrativa

Eventos sugeridos:

- criacao de usuario
- alteracao de usuario
- bloqueio/desbloqueio
- troca/reset de senha
- criacao de grupo
- alteracao de politica
- vinculo/desvinculo de dispositivo
- revogacao de sessao
- exportacao de relatorio
- tentativa de acesso administrativo negada

### Auditoria de autenticacao

Eventos sugeridos:

- login aceito
- login recusado por senha invalida
- login recusado por usuario inativo
- login recusado por dispositivo bloqueado
- login recusado por horario/grupo
- login recusado por NAS nao autorizado
- inicio de sessao
- fim de sessao
- accounting interim
- erro de RADIUS

## Modelo de banco sugerido

Tabelas novas possiveis:

- `vlan50_radius_users`
- `vlan50_radius_groups`
- `vlan50_radius_devices`
- `vlan50_radius_sessions`
- `vlan50_radius_auth_events`
- `vlan50_radius_admin_audit`
- `vlan50_radius_nas_clients`
- `vlan50_radius_settings`

Regras:

- tabelas de auditoria devem ser imutaveis contra `UPDATE` e `DELETE`, seguindo padrao ja usado pelo SGCG
- tabelas sensiveis devem receber `REVOKE ALL FROM PUBLIC`
- senha nunca deve ser armazenada em texto claro
- quando possivel, usar hash forte compativel com o metodo RADIUS escolhido
- se o metodo escolhido exigir segredo reversivel ou formato especifico, documentar o risco e preferir EAP seguro

## Metodo de autenticacao

### Opcao recomendada para producao

`EAP-TTLS/PAP` ou `PEAP/MSCHAPv2`, avaliando compatibilidade dos clientes.

Recomendacao tecnica:

- usar certificado do servidor RADIUS
- orientar instalacao/confianca da CA institucional quando necessario
- evitar redes abertas com portal
- evitar PAP puro fora de tunel TLS
- estudar evolucao futura para certificado de dispositivo/usuario quando o ambiente estiver maduro

### Integracao futura com AD

O desenho deve nascer preparado para tres fontes de identidade:

1. base local SGCG
2. AD/LDAP externo
3. Samba AD/FreeIPA, se a prefeitura optar por diretorio proprio

Na primeira fase, a base local do SGCG e suficiente para entregar o fluxo parecido com AD sem exigir implantacao imediata de dominio Windows.

## Politica sem portal

Nao usar portal cativo na VLAN 50 para esse objetivo.

Motivos:

- portal autentica depois que o dispositivo ja recebeu algum nivel de acesso
- portal depende de navegador e captive WebView
- portal e menos parecido com AD
- portal e mais sujeito a cache, redirecionamento e falhas de UX
- portal nao protege a porta/SSID antes da entrada na rede

`802.1X` autentica antes da liberacao da rede e entrega experiencia nativa de sistema operacional.

## Auditoria e correlacao forense

O SGCG deve correlacionar:

- sessao RADIUS
- IP via DHCP
- MAC
- usuario
- VLAN
- AP/switch
- DNS consultado
- acao aplicada: permitido, bloqueado, bypassado
- regra/politica acionada
- evento UFW/proxy quando existir

Com isso, o relatorio forense consegue mostrar:

- `quem`
- `quando`
- `de onde`
- `em qual dispositivo`
- `por qual equipamento de rede`
- `qual IP recebeu`
- `quais dominios consultou`
- `quais politicas bloquearam ou liberaram`

O SGCG nao deve capturar conteudo privado de paginas HTTPS. O foco correto e metadado de conexao, DNS, politica e evidencia tecnica necessaria para seguranca e responsabilizacao institucional.

## Novo modulo de auditoria ou reaproveitamento

Recomendacao:

- criar auditoria especifica de `Autenticacao VLAN 50` para eventos RADIUS e administrativos
- integrar essa auditoria ao modulo `Relatorios Forenses` como uma fonte adicional
- integrar resumo legal ao modulo `LGPD & Protecao de Dados`

Assim, a operacao diaria tem um modulo proprio, mas a governanca institucional continua com visao consolidada.

## LGPD

A arquitetura deve respeitar:

- finalidade: seguranca da rede, controle de acesso, auditoria e prestacao de contas
- adequacao: dados coerentes com a operacao da rede institucional
- necessidade: coletar apenas o necessario
- livre acesso e transparencia: explicar no aviso de privacidade e termos internos
- seguranca: proteger credenciais, logs e relatorios
- prevencao: reduzir risco de uso indevido
- responsabilizacao: manter trilhas e evidencias de decisoes administrativas

Referencias legais oficiais:

- LGPD, Lei 13.709/2018: https://www.planalto.gov.br/ccivil_03/_Ato2015-2018/2018/Lei/L13709compilado.htm
- Pontos especialmente relevantes: arts. 6, 37 e 46.

Dados pessoais tratados:

- nome
- login
- setor/matricula
- CPF, se houver decisao institucional fundamentada
- MAC
- IP
- horario de conexao
- equipamento de rede
- eventos de autenticacao
- metadados de navegacao institucional

Dados que nao devem ser tratados:

- conteudo de comunicacoes privadas
- corpo de paginas HTTPS
- senhas em texto claro
- coleta excessiva sem finalidade

## Marco Civil da Internet

O desenho deve tratar registros de conexao com sigilo, controle de acesso e ambiente seguro.

Referencia oficial:

- Marco Civil da Internet, Lei 12.965/2014: https://www.planalto.gov.br/ccivil_03/_Ato2011-2014/2014/Lei/L12965.htm
- Ponto especialmente relevante: art. 13, sobre guarda de registros de conexao pelo prazo de 1 ano na provisao de conexao a internet, sob sigilo e em ambiente controlado e seguro.

Regra de projeto:

- preservar logs de conexao suficientes para auditoria legal
- proteger acesso aos logs
- registrar exportacoes e consultas sensiveis
- nao misturar auditoria tecnica com exposicao indevida de dados pessoais
- criar politica de retencao clara e documentada

## Retencao sugerida

Proposta inicial:

- sessoes RADIUS e registros de conexao: minimo de 1 ano
- auditoria administrativa: minimo de 5 anos, se a governanca municipal desejar preservar historico decisorio
- eventos DNS detalhados: alinhar com politica atual de relatorios forenses e capacidade de armazenamento
- relatorios exportados: registrar evento de exportacao, mas evitar duplicar PDFs sensiveis sem necessidade

A retencao definitiva deve ser formalizada no modulo LGPD e no aviso de privacidade.

## Seguranca operacional

Requisitos minimos:

- segredo RADIUS forte por NAS/AP/switch
- cadastro explicito de NAS autorizados
- certificado do servidor RADIUS
- logs protegidos
- senhas com politica minima
- bloqueio por tentativas
- desativacao imediata de usuario
- revogacao de sessao quando houver suporte a CoA
- backup da configuracao FreeRADIUS
- healthcheck do servico RADIUS no SGCG
- alerta se RADIUS parar

## Corte imediato de sessao

Ha duas formas:

1. `CoA` / `Disconnect-Request`, quando AP/switch suportar.
2. Bloqueio complementar no SGCG, removendo acesso do usuario/dispositivo e derrubando conexoes por `conntrack` quando o IP for conhecido.

O ideal e suportar os dois:

- CoA para cortar a associacao/porta na origem
- conntrack/firewall para cortar fluxos restantes no gateway

## Fases de implantacao

### Fase 1 - Desenho e base

- criar modulo SGCG
- criar schema
- cadastrar usuarios/grupos/dispositivos/NAS
- criar auditoria imutavel
- criar tela de sessoes
- criar relatorio legal
- documentar LGPD/Marco Civil

### Fase 2 - FreeRADIUS em modo laboratorio

- instalar FreeRADIUS
- integrar com banco/servico SGCG
- validar usuario local
- validar logs de autenticacao
- validar accounting
- nao bloquear a VLAN inteira ainda

### Fase 3 - Piloto com um AP ou switch

- selecionar um ponto da VLAN 50
- configurar cliente RADIUS
- testar login aceito
- testar login recusado
- testar usuario bloqueado
- testar accounting
- testar DHCP
- testar correlacao DNS/relatorio

### Fase 4 - Auditoria e relatorios

- cruzar sessao com DNS
- cruzar sessao com UFW/proxy
- gerar PDF por usuario/IP/MAC/periodo
- validar acesso ao relatorio por perfil administrativo
- registrar exportacoes

### Fase 5 - Producao gradual

- ativar para grupo pequeno
- manter fallback operacional temporario
- expandir por setor/local
- registrar incidentes e ajustes no `CODEX.md`
- so entao tornar obrigatorio em toda a VLAN 50

## Riscos e mitigacoes

### Risco: equipamento de rede nao suporta 802.1X

Mitigacao:

- inventariar APs/switches
- comecar por equipamentos compativeis
- usar VLAN de fallback apenas temporaria

### Risco: usuario nao consegue autenticar

Mitigacao:

- fase piloto
- usuario de emergencia com prazo curto
- helpdesk com reset de senha auditado

### Risco: RADIUS indisponivel derrubar acessos

Mitigacao:

- healthcheck
- alerta
- backup de configuracao
- segundo servidor RADIUS no futuro
- politica clara de fallback nos APs/switches

### Risco: coleta excessiva de dados

Mitigacao:

- coletar metadados necessarios
- nao capturar conteudo
- registrar base/finalidade
- publicar no aviso de privacidade
- usar controles de acesso e trilha de consulta

### Risco: divergencia entre login e navegacao auditada

Mitigacao:

- correlacionar RADIUS + DHCP + DNS por IP/MAC/janela temporal
- registrar inicio/fim de sessao
- enriquecer `navigation_events`
- expor incerteza quando a correlacao nao for perfeita

## Caminho tecnico inicial no SGCG

Arquivos/modulos provaveis em uma implementacao futura:

- `backend/src/modules/vlan50-auth/`
- `frontend/src/pages/Vlan50Auth.jsx`
- `frontend/src/pages/Vlan50Sessions.jsx`
- `backend/src/modules/reports/` para integrar fonte RADIUS
- `backend/src/modules/lgpd/` para registrar tratamento e relatorio
- `backend/src/utils/sys.ts` se houver comandos controlados de RADIUS/CoA/conntrack
- `instalador/` para provisionar FreeRADIUS em novas instalacoes

Servicos provaveis:

- `freeradius`
- `bcc-backend`
- `bcc-frontend`
- `backend-proxy`, apenas se houver correlacao direta com politicas/radar

## Decisao final sugerida

Implementar a autenticacao da VLAN 50 como `802.1X + FreeRADIUS + SGCG`, sem portal.

O SGCG deve administrar identidades e auditoria, enquanto APs/switches fazem a decisao de entrada na rede. A navegacao continua sujeita as politicas existentes de DNS, RPZ, UFW, proxy, QoS e relatorios forenses.

Essa abordagem entrega:

- experiencia parecida com AD
- sem portal cativo
- autenticacao antes da rede
- auditoria forte
- caminho para AD/LDAP futuro
- conformidade por desenho com LGPD e Marco Civil
- integracao natural com o que o SGCG ja faz em governanca e controle
