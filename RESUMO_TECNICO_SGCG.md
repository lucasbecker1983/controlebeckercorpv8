# Resumo Tecnico Permanente do SGCG

Este arquivo consolida, em formato de referencia, o que o `CODEX.md` registra de forma cronologica. O `CODEX.md` continua sendo o documento principal e obrigatorio de continuidade: toda rodada de trabalho que altere estrutura, visual, regra funcional, arquitetura, runtime, validacao ou build deve ser registrada nele antes de encerrar.

## Identidade do sistema

- Nome oficial: `SGCG`
- Expansao: `Sistema de Governanca e Controle Governamental`
- Marca/mantenedora tecnica: `JMB Tecnologia`
- Contexto institucional atual: Prefeitura Municipal de Jacarezinho/PR
- Objetivo central: operar uma plataforma GovTech para governanca, controle, seguranca, auditoria, conformidade LGPD e enforcement real de rede.

O SGCG nao e apenas um painel administrativo. Ele e uma superficie operacional integrada que administra decisoes institucionais e aplica efeitos reais no host, na rede, no firewall, no DNS, no proxy, no QoS, nos portais cativos, nas sessoes de usuarios e nos relatorios de auditoria.

## Perfil tecnico esperado do agente

Ao atuar neste projeto, o agente deve assumir postura de engenheiro, arquiteto e desenvolvedor senior de sistemas GovTech, alem de diretor, projetista, analista, desenvolvedor de frontend, UX, UI e backend senior.

Isso significa pensar o SGCG de ponta a ponta: produto, experiencia do operador, interface, acessibilidade, arquitetura, backend, banco de dados, runtime Linux, seguranca, auditoria, governanca publica, continuidade operacional e validacao real no ambiente.

## Contrato inegociavel de continuidade

- O `CODEX.md` e a fonte principal do estado operacional do projeto.
- Toda alteracao estrutural, visual, funcional ou arquitetural deve ser registrada no `CODEX.md` ao final da rodada.
- Toda vez que houver `build`, o `CODEX.md` deve ser atualizado na mesma rodada.
- Se houver documentacao complementar em `docs/`, `README.md`, instalador, portais ou arquivos especificos, o resumo executivo e o estado atual ainda devem aparecer no `CODEX.md`.
- Para trabalhos de runtime, o registro deve conter evidencia real: comandos, servicos reiniciados, portas, rotas, bundles, contadores, estado de iptables/ipset/tc, endpoints HTTP, processos PM2 ou validacoes de banco quando aplicavel.

Regra pratica para qualquer nova sessao:

1. Ler `CODEX.md` antes de agir.
2. Entender se o problema e de codigo, build, Nginx, banco, PM2, Unbound, Squid, UFW, iptables/ipset, DHCP, QoS ou cliente real.
3. Aplicar a correcao no caminho vivo do sistema.
4. Validar no runtime quando a mudanca tiver efeito operacional.
5. Registrar no `CODEX.md` o que mudou, o estado atual e qualquer proximo passo relevante.

## Eixos de produto

O SGCG opera em dois eixos permanentes.

### Governanca

Camada de decisao institucional:

- politicas institucionais
- aprovacoes e excecoes
- governanca de dados
- LGPD e protecao de dados
- auditoria e responsabilizacao
- relatorios forenses
- evidencias de navegacao e operacao
- justificativas, revisoes, vigencias e trilhas formais

Essa camada deve falar com linguagem governamental, clara e auditavel. A interface deve evitar aparencia de ferramenta interna improvisada e privilegiar leitura executiva, tomada de decisao e rastreabilidade.

### Controle

Camada de execucao tecnica:

- DNS institucional
- Unbound, RPZ e resolvedores limpos
- Squid, ACLs e paginas de bloqueio/manutencao
- UFW como firewall oficial
- iptables, ipset, nftables e conntrack como runtime complementar
- QoS com `tc` e `ifb`
- Hotspot VLAN 70
- Portal de Colaboradores VLAN 30
- DHCP, Nginx, PM2, certificados internos e servicos Linux
- ClamAV, observabilidade e operacoes tecnicas

Essa camada e onde as decisoes viram efeito real. Sempre que o comportamento vivo divergir do banco ou da UI, a verdade operacional deve ser confirmada no host.

## Arquitetura de repositorio e runtime

### `frontend/`

Interface React/Vite do console SGCG.

Responsabilidades principais:

- shell institucional do console
- navegacao por Governanca e Controle
- dashboards e modulos administrativos
- paginas publicas sem login, como aviso de privacidade e manutencao
- portais cativos publicos do Hotspot e Colaboradores
- integracao com rotas do backend core e backend-proxy
- bundles publicados e servidos pelo runtime do frontend/Nginx

Depois de alterar paginas, componentes, rotas, assets ou comportamento visual, normalmente e necessario `cd frontend && npm run build` e publicacao/restart do processo aplicavel.

### `backend/`

Backend core em Node.js/TypeScript.

Responsabilidades principais:

- autenticacao administrativa
- usuarios, sessoes e autorizacao de modulos
- Hotspot de visitantes
- Acesso Mobile de Colaboradores
- LGPD
- Relatorios Forenses
- QoS
- Seguranca Operacional
- Operacoes Tecnicas
- Central de Chamados
- Identidade de endpoints
- PDFs institucionais e trilhas de auditoria

O backend core costuma rodar no PM2 como `bcc-backend` e responder internamente na porta `6778`.

### `backend-proxy/`

Motor institucional de politicas e enforcement.

Responsabilidades principais:

- Bloqueios & Liberacoes
- politicas nomeadas
- excecoes VIP
- contingencia DNS
- compilador de politicas para Unbound/Squid/UFW
- DNS Radar e ingester
- RPZ, ACLs, URL ACLs e artefatos gerados
- bypass emergencial por VLAN
- Bloqueio Total por VLAN
- reconciliacao de firewall e runtime
- auditoria tecnica de aplicacao de politica

O `backend-proxy` costuma rodar no PM2 como `backend-proxy` e responder internamente com HTTPS na porta `6779`.

### Nginx

O Nginx publica o console, APIs e portais internos/publicos. Pontos importantes:

- `console.jacarezinho.cloud` e `console.interno.jacarezinho` devem espelhar a mesma superficie SGCG.
- O console interno precisa funcionar em contingencia de link externo.
- Rotas novas no console publico devem existir tambem no console interno quando fizerem parte da superficie SGCG.
- Antes de mexer em `proxy_pass`, validar o upstream real. Neste ambiente, frontend/backend/backend-proxy nao devem ser presumidos como `127.0.0.1:3000`.
- Portais cativos usam vhosts especificos e headers anti-cache; no Hotspot VLAN 70, o gateway operacional e `192.168.70.1`.

### Banco de dados

O SGCG usa PostgreSQL para estado administrativo, politicas, sessoes, auditorias, LGPD, relatorios e configuracoes. Muitas rotas fazem bootstrap idempotente de schema, mas esse bootstrap precisa ser leve, serializado quando necessario e seguro contra concorrencia no caminho quente de leitura.

Tabelas e dominios recorrentes:

- `policy_exceptions`
- `dns_vip`
- `proxy_vips`
- `domain_policies`
- `domain_policy_entries`
- `dns_contingency_state`
- `dns_policy_events`
- `navigation_events`
- `hotspot_visitors`
- `hotspot_sessions`
- `hotspot_devices`
- `collab_users`
- `collab_sessions`
- `collab_access_log`
- `net_qos_policies`
- `net_qos_vips`
- `lgpd_*`
- `action_audit_logs`
- `auth_activity_logs`
- `domain_policy_audit_logs`

Logs de auditoria e evidencias institucionais devem ser preservados. Rotinas administrativas podem ocultar registros da UI, mas nao devem apagar historico de auditoria quando ele sustenta relatorios, LGPD ou investigacao.

## Firewall e enforcement

### UFW como autoridade oficial

Regra inegociavel: o firewall principal do SGCG e o `UFW`.

- Nao remover, substituir ou desabilitar o UFW sem autorizacao explicita.
- `iptables`, `ipset`, `nftables`, `tc`, scripts e regras runtime podem complementar o UFW, mas nao assumir seu papel.
- Qualquer camada complementar precisa ser documentada no `CODEX.md` com motivo, escopo, comandos/servicos, impacto e validacao.

### Runtime complementar

O sistema usa camadas complementares para comportamentos que o UFW sozinho nao expressa bem:

- `iptables nat` para redirects de DNS, portais cativos, Squid e excecoes de precedencia.
- `iptables FORWARD` para bloqueios ou accepts em ordem especifica.
- `ipset` para VIPs, sessoes autenticadas, redes sociais e allowlists dinamicas.
- `conntrack` para derrubar sessoes persistentes apos revogacao ou mudanca de politica.
- `tc` e `ifb` para QoS de download/upload.

Precedencia importa. Um VIP, uma excecao do PontoRH, um bloqueio total por VLAN ou uma sessao autenticada precisam aparecer na ordem correta do runtime, nao apenas existir no banco.

## DNS, RPZ, DoH, DoT e OpenDNS

O DNS institucional e central para o SGCG. O sistema usa Unbound/RPZ para aplicar bloqueios, allowlists, auditoria e comportamento por VLAN.

Pontos permanentes:

- DNS classico das VLANs gerenciadas deve ser redirecionado ao Unbound local.
- RPZ e ACLs sao parte do enforcement institucional.
- DoH, DoT e QUIC podem burlar RPZ e precisam de tratamento proprio quando a politica exigir.
- Falhas globais de Unbound podem derrubar navegacao mesmo com link externo funcionando; diagnosticar com `dig` contra `127.0.0.1` e gateways das VLANs.
- O modo safe do compilador existe para evitar que um include RPZ quebre a recursao global.

### PontoRH e OpenDNS

Regra inegociavel: `208.67.222.222` e `208.67.220.220` devem permanecer livres para o PontoRH.

- O app institucional PontoRH usa esses resolvedores de forma hardcoded.
- Consultas `UDP/53` e `TCP/53` para esses IPs nao podem ser capturadas pelo redirect global ao Unbound.
- A excecao vale inclusive para usuarios VIP.
- Qualquer rodada que toque Unbound, RPZ, UFW, iptables, contingencia DNS ou politicas relacionadas deve preservar e, quando aplicavel, validar essa excecao.
- Referencia complementar: `pontorh.md`.

## VLANs e portais cativos

### VLAN 70 - Hotspot de visitantes

A VLAN 70 e rede de saida para internet de visitantes. Ela nao deve ter entrada roteada para demais VLANs internas, mas continua sujeita ao controle institucional de saida.

O Hotspot da VLAN 70 envolve:

- portal publico `/hotspot/portal`
- API publica `/api/hotspot/public/*`
- Nginx captive em `192.168.70.1`
- CAPPORT
- probes nativos de Android, iOS, Windows e Firefox
- `ipset` `sgcg_hotspot_v70_auth`
- sessoes em `hotspot_sessions`
- visitantes em `hotspot_visitors`
- dispositivos/MAC em `hotspot_devices`
- runtime authorization antes do handoff final

Regra de comportamento atual:

- MAC conhecido pode ser reconhecido, mas a navegacao nao deve ser liberada silenciosamente quando a regra pedir confirmacao.
- `authenticated=true` nao basta; confirmar `session.runtime_authorized=true` e presenca no ipset quando o assunto for liberacao real.
- O handoff final deve priorizar probes nativos, como `generate_204` no Android, e evitar prender o usuario em uma segunda tela cativa local.
- O frontend nao deve redirecionar silenciosamente se o backend nao confirmar autorizacao runtime.

### VLAN 30 - Acesso Mobile de Colaboradores

A VLAN 30 possui portal e modulo administrativo separados do Hotspot.

Componentes principais:

- modulo `/colaboradores-mobile`
- portal publico `/collab/portal`
- rotas publicas `/api/collaborators/public/*`
- usuarios locais em `collab_users`
- sessoes em `collab_sessions`
- log/auditoria em `collab_access_log`
- `ipset` `sgcg_collab_v30_auth`
- modo `auth_required` ou `Somente DNS/ACL`

Regra importante: login de colaborador libera o fluxo de acesso, mas nao e bypass das politicas institucionais. DNS/RPZ/ACL/firewall continuam valendo apos autenticar.

### VLAN 50 - DHCP e SINE

A VLAN 50 ja teve incidentes em que foi necessario separar falha do servico DHCP, automacao local e entrega da VLAN. Validacoes relevantes incluem `isc-dhcp-server`, `dhcp-autobind`, interfaces VLAN, arquivos de reservas e logs do servico.

### VLAN 10 - rede administrativa/servidores

VLAN critica onde aparecem consoles, VIPs administrativos, QoS e acesso interno. Alteracoes de firewall, VIP, DNS ou QoS nessa VLAN precisam validar precedencia com cuidado.

## VIPs, excecoes e bypass

VIP no SGCG e excecao especial, normalmente individual por IP `/32`.

O VIP pode envolver:

- `policy_exceptions`
- `dns_vip`
- `proxy_vips`
- `/etc/squid/acl/proxy_ip_bypass.acl`
- `/etc/unbound/becker/vip-bypass.conf`
- regras `sgcg-vip-bypass`
- QoS manual em `net_qos_vips`
- auditoria DNS opcional/ativa

Regras recorrentes:

- VIP deve ficar antes de bloqueios comuns no `FORWARD`.
- VIP deve ficar antes de redirects/bloqueios que neutralizem seu bypass, exceto quando houver auditoria DNS desenhada para capturar DNS classico no resolvedor limpo.
- Excecoes amplas por subnet em campos de VIP sao perigosas e devem ser rejeitadas quando o contrato exigir host unico.
- Revogar VIP ou excecao deve remover acesso runtime e derrubar sessoes persistentes quando necessario.

## Relatorios Forenses e auditoria

O modulo `Relatorios Forenses` consolida evidencias de navegacao e auditoria.

Fontes principais:

- `dns_policy_events`
- `proxy_audit_log` / eventos de proxy quando disponiveis
- `/var/log/ufw.log` filtrado para redes internas
- `navigation_events` como consolidado unificado
- `action_audit_logs`
- `auth_activity_logs`
- `lgpd_audit_logs`
- `domain_policy_audit_logs`

O relatorio de navegacao deve responder:

- quem acessou
- de qual IP/MAC/VLAN
- qual identidade endpoint ou sessao foi vinculada
- qual dominio ou site principal apareceu
- qual dominio tecnico sustentou a evidencia
- se foi bloqueado, liberado ou bypassado
- qual regra/politica/fonte gerou a evidencia

O sistema separa leitura humana de evidencia tecnica:

- `site principal`, como `simepar.br`
- `dominio tecnico`, como `produtos.simepar.br`

PDFs devem ser institucionais, sem paginas em branco, com cabecalho/rodape adequados e, quando aplicavel, versoes limpas e forenses.

## LGPD e governanca de dados

O SGCG possui modulo proprio de `LGPD & Protecao de Dados`, com linguagem de gestao publica em vez de tela juridica pura.

Escopo do modulo:

- programa institucional LGPD
- controlador, unidade, encarregado, canal do titular e aviso publico
- inventario de tratamentos
- pedidos de titulares
- incidentes e riscos
- auditoria dedicada do modulo
- evidencia complementar de acessos
- exportacao PDF institucional

O aviso publico de privacidade deve ficar acessivel sem login em `/aviso-de-privacidade` e explicar, em linguagem clara, os dados tratados pelo SGCG: cadastro, autenticacao, CPF quando necessario, telefone, IP, MAC, VLAN, sessoes, chamados, evidencias e metadados tecnicos de navegacao institucional.

## QoS

O QoS do SGCG atua sobre runtime real do kernel.

Componentes:

- `net_qos_policies`
- `net_qos_vips`
- `tc`
- `ifb`
- filtros por VLAN e VIP
- reconciliacao automatica no boot do backend
- acao manual `POST /api/qos/reconcile`

Modelo atual:

- download moldado na interface VLAN
- upload moldado em `ifbXX`
- VIPs manuais do QoS saem da classe limitada
- o modulo deve mostrar drift entre banco e kernel quando existir

Regra recente importante: VIPs institucionais de bloqueio/liberacao nao devem ser automaticamente convertidos em VIPs de QoS. QoS VIP e contrato manual do modulo QoS.

## Bloqueio Total, bypass emergencial e contingencia

O SGCG diferencia modos operacionais:

- politica institucional normal
- VIP individual
- excecao esporadica
- contingencia DNS
- bypass emergencial por VLAN
- Bloqueio Total por VLAN

`Bloqueio Total por VLAN`:

- escopo controlado em VLANs gerenciadas, especialmente `10`, `30`, `50`, `70`
- persiste em `total_vlan_blocks`
- exige motivo institucional
- encerra bypass emergencial conflitante
- recompila artefatos
- aciona pagina publica `/manutencao`
- aplica Squid/UFW/iptables de forma complementar

`Bypass emergencial por VLAN`:

- e runtime temporario por VLAN
- nao deve ser confundido com VIP individual
- deve preservar trilha, motivo, solicitante e expiracao

`Contingencia DNS`:

- controla resolvedores publicos autorizados em modo especial
- estado expirado nao deve deixar regras antigas derrubando DNS
- provedores atuais incluem Google DNS, Cloudflare, Quad9 e OpenDNS, com PontoRH/OpenDNS como excecao permanente separada.

## Politicas, ACLs e catalogos

O SGCG trabalha com politicas nomeadas, allowlists, blocklists, entradas de dominio e entradas de URL.

Camadas:

- `domain_policies`
- `domain_policy_entries`
- `release_policies`
- `blocking_policies`
- RPZ para dominios
- ACLs do Squid para dominios
- ACLs `url_regex` para URLs
- artefatos gerados em `backend-proxy/regras/generated/`

Politicas institucionais relevantes ja registradas:

- bloqueio de redes sociais
- liberacao de Google Workspace
- liberacao de servicos governamentais
- plataformas de reuniao protegidas
- WhatsApp com allowlist dinamica de IPs/dominios
- PontoRH/OpenDNS como excecao incontestavel

## WhatsApp, redes sociais e bloqueio por IP

O bloqueio de redes sociais nao depende apenas de DNS. Apps podem usar:

- DNS cacheado
- IP hardcoded
- DoH
- DoT
- QUIC
- conexoes persistentes longas

Por isso o SGCG combinou:

- RPZ/Unbound
- bloqueio de DoH/DoT/QUIC
- ipset de ranges sociais
- conntrack flush
- allowlist dinamica do WhatsApp

WhatsApp exige cuidado porque compartilha infraestrutura Meta com Facebook/Instagram. O `sgcg_whatsapp_allowed` deve preceder drops sociais e ser atualizado por script/cron conforme DNS real observado.

## SMSGate e recuperacao de senha do Hotspot

O Hotspot usa SMS para recuperacao de senha/codigo.

Componentes conhecidos:

- SMSGate server em `127.0.0.1:3010`
- SMSGate worker em `127.0.0.1:3011`
- publicacao por `https://console.jacarezinho.cloud/smsgate/...`
- integracao do backend por JWT Bearer local ou fallback Basic
- `HOTSPOT_SMS_*` no `.env` local, sem publicar segredos no repositorio
- script `backend/341_autobind_smsgate_sender.sh`
- timer `sgcg-smsgate-autobind.timer`

Fluxo de recuperacao atual:

- solicitar codigo sem vazar se CPF existe
- enviar SMS institucional
- validar codigo/senha provisoria
- atualizar senha
- associar MAC/dispositivo
- criar sessao Hotspot
- retornar autenticado com runtime liberado quando aplicavel

## Console interno e SSL

O console interno e parte obrigatoria da continuidade operacional.

Contrato:

- `console.interno.jacarezinho` espelha `console.jacarezinho.cloud`
- o acesso LAN deve continuar em contingencia externa
- rotas, paginas, APIs e backend-proxy precisam bater no mesmo upstream
- diferencas aceitaveis: DNS, certificado TLS, CA interna e excecoes de identidade interna

PKI interna:

- CA interna SGCG publicada localmente
- certificados com SANs para console, suporte, chamados e IP `192.168.10.1`
- download da CA por caminhos publicados quando necessario

Ao mexer em Nginx/SSL/console, validar:

- `nginx -t`
- reload do Nginx
- `openssl s_client`
- `curl` com `--resolve` e CA correta
- console publico e interno
- rotas frontend e `/api/*`

## Instalador e publicacao

O diretorio `instalador/` evoluiu de gerador de artefatos para base de provisionamento real do SGCG.

Ele cobre:

- Ubuntu Server 24.04+
- Node.js, TypeScript, Vite, React, Tailwind
- Python
- PostgreSQL
- Nginx
- Unbound
- Squid
- UFW
- PM2
- perfis `simple-console`, `gateway-vlans` e `full-appliance`
- wizard TUI/textual
- `plan`, `validate`, `apply`, `install`
- geracao de envs, Nginx, PM2, Unbound, UFW, deploy e validacao

Ainda ha espaco para rollback transacional completo e emissao automatica de certificados, mas o instalador ja representa o caminho de publicacao repetivel do SGCG.

## Identidade de endpoints

O SGCG possui agente Windows de identidade para enriquecer auditorias.

Componentes:

- `sgcg-endpoint-identity-msi/`
- servico Windows `SGCGEndpointIdentity`
- instalacao em `C:\Program Files\JMB Tecnologia\SGCG Endpoint Identity\`
- check-in por rota integrada ao backend core
- token de agente com hash/fallback
- enriquecimento de eventos DNS/relatorios com usuario e computador

Regra: dados runtime de identidade, check-ins e tokens reais nao devem ser publicados no Git.

## Processos e portas importantes

Portas/processos citados no estado operacional:

- frontend SGCG: `bcc-frontend`, porta interna `6777`
- backend core: `bcc-backend`, porta interna `6778`
- backend-proxy: `backend-proxy`, HTTPS interno `6779`
- SMSGate server: `127.0.0.1:3010`
- SMSGate worker: `127.0.0.1:3011`
- DNS VIP limpo: `sgcg-vip-dns.service`, porta `5355`
- Unbound institucional: DNS local/gateways das VLANs
- Squid: motor complementar de ACL/proxy
- UFW: firewall oficial
- ISC DHCP: entrega DHCP das VLANs

Sempre validar o processo/porta real antes de alterar vhost, proxy ou healthcheck.

## Comandos de validacao frequentes

Builds:

```bash
cd backend && npm run build
cd backend-proxy && npm run build
cd frontend && npm run build
```

PM2:

```bash
pm2 restart bcc-backend --update-env
pm2 restart backend-proxy --update-env
pm2 restart bcc-frontend --update-env
pm2 status
```

Rede/firewall/DNS:

```bash
ufw status verbose
iptables-save -t nat
iptables -S
iptables -t nat -S
ipset list
unbound-checkconf
dig @127.0.0.1 gov.br A
systemctl is-active unbound
systemctl is-active squid
nginx -t
```

QoS:

```bash
tc qdisc show
tc filter show dev enp6s0.10 parent 1:
tc filter show dev ifb10 parent 1:
```

Portais:

```bash
curl -I http://192.168.70.1/generate_204
curl http://192.168.70.1/api/hotspot/public/context
curl http://192.168.70.1/api/hotspot/public/capport
curl http://192.168.30.1/api/collaborators/public/context
```

## Como pensar ao diagnosticar

Quando algo "nao funciona", separar camadas:

1. O frontend esta servindo o bundle certo?
2. A rota publica ou administrativa bate no backend correto?
3. A API responde com o contrato esperado?
4. O banco tem o registro correto?
5. O runtime realmente aplicou ipset/iptables/UFW/tc/Unbound/Squid?
6. O Nginx ou o captive WebView esta interceptando de forma diferente do navegador comum?
7. Ha cache, conntrack ou sessao persistente mantendo comportamento antigo?
8. A evidencia aparece nos logs/auditoria?

O SGCG e sensivel a diferenca entre "persistido" e "aplicado". Um cadastro ativo no banco nao garante navegacao liberada; uma regra gerada em arquivo nao garante ordem correta no kernel; um build bem-sucedido nao garante que o PM2/Nginx esteja servindo o bundle novo.

## Estado mental para futuras rodadas

Tratar o SGCG como um appliance governamental em producao:

- preservar continuidade
- validar caminho vivo
- respeitar UFW como autoridade
- preservar PontoRH/OpenDNS
- preservar isolamento da VLAN 70
- nao apagar auditoria
- nao publicar segredos/runtime
- registrar tudo no `CODEX.md`
- preferir correcao objetiva com evidencia a mudanca cosmetica sem validacao

Este resumo e auxiliar. A fonte principal e sempre o `CODEX.md`.
