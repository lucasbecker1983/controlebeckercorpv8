# Documentação do Projeto Controle Becker Corp V8

## Visão geral

O projeto `controlebeckercorp-v8` é uma plataforma de operação de infraestrutura composta por múltiplos serviços Node.js, com frontend React e APIs especializadas para:

- monitoramento de servidor e rede
- autenticação e gestão de usuários
- controle de VLAN, QoS e DNS
- operação de proxy transparente com Squid
- segurança operacional com UFW e Fail2Ban
- backups e restauração
- auditoria e coleta de logs

A arquitetura é orientada a serviços locais executando no mesmo host, com forte acoplamento ao sistema operacional Linux, ao PostgreSQL e a ferramentas de infraestrutura como `systemd`, `iptables`, `tc`, `unbound`, `squid`, `fail2ban` e `ufw`.

## Estrutura do repositório

### Diretórios principais

- `frontend/`: aplicação web React/Vite
- `backend/`: API principal em Express/TypeScript
- `backend-proxy/`: microsserviço dedicado ao proxy, DNS auxiliar e motor de interceptação
- `rescue-core/`: backend mínimo de contingência para login emergencial
- `doc_generator/`: gerador de documentação técnica em PDF
- `scripts/`: scripts operacionais e de recuperação
- `backups/`: artefatos de backup do sistema
- `bd/`: dumps SQL manuais
- `public/`: artefatos públicos, incluindo PDF gerado
- `new-proxy/`: código paralelo/experimental relacionado ao proxy

### Arquivos relevantes na raiz

- `DOCUMENTATION_PROXY.md`: documentação resumida do microsserviço proxy
- `public/DOCUMENTACAO_TECNICA_V8.pdf`: documentação técnica gerada anteriormente

## Arquitetura lógica

### 1. Frontend

- stack: React 18 + Vite
- porta de desenvolvimento/preview: `6777`
- base visual: Tailwind CSS v4, `framer-motion`, `lucide-react`
- PWA habilitada via `vite-plugin-pwa`
- endpoint base configurado no código: `https://console.jacarezinho.cloud`

Responsabilidades:

- login
- dashboard operacional
- monitoramento de servidor
- gestão de usuários
- gestão de rede/VLAN/QoS/DNS
- operação de proxy
- controle tático de serviços
- cofre de backups
- painel de segurança

### 2. Backend principal

- stack: Express 5 + TypeScript
- porta: `6778`
- protocolo: HTTP interno
- função: API central do sistema

Responsabilidades:

- autenticação
- métricas do dashboard
- inventário de hardware
- usuários
- rede e telemetria de interfaces
- QoS
- bloqueios de acesso
- controle de serviços
- backups
- segurança
- histórico de indisponibilidade
- DNS/Unbound
- logs de proxy
- agendamento de VLAN

Além das rotas, o backend inicializa monitores em background:

- `startMonitor()`
- `startBackupScanner()`
- `startLinkMonitor()`
- `startCftvRetentionMonitor()`

### 3. Backend Proxy

- stack: Express 4 + TypeScript
- porta: `6779`
- protocolo: HTTPS direto
- certificado lido de:
  - `/etc/letsencrypt/live/console.jacarezinho.cloud/privkey.pem`
  - `/etc/letsencrypt/live/console.jacarezinho.cloud/fullchain.pem`

Responsabilidades:

- gestão de usuários htpasswd do Squid
- gestão de ACLs e listas do proxy
- gestão de IPs VIP
- download de certificado do proxy
- leitura de logs de auditoria
- controle da engine de interceptação
- DNS auxiliar e métricas derivadas do tráfego
- entrega de relatórios SARG

### 4. Rescue Core

- stack: Express
- porta: `6778`
- função: modo de contingência

Esse serviço expõe login emergencial aceitando qualquer credencial e retorna um token fixo. É claramente voltado a cenários de recuperação e não deve rodar em produção junto com o backend principal na mesma porta.

### 5. Gerador de documentação

- stack: Node.js + PDFKit
- saída: `public/DOCUMENTACAO_TECNICA_V8.pdf`

Gera um PDF técnico lendo arquivos do projeto diretamente do disco.

## Portas e serviços

| Serviço | Diretório | Porta | Protocolo | Observação |
|---|---|---:|---|---|
| Frontend | `frontend/` | 6777 | HTTPS | Vite dev/preview com certificado local |
| Backend Core | `backend/` | 6778 | HTTP | API principal, normalmente atrás de Nginx |
| Backend Proxy | `backend-proxy/` | 6779 | HTTPS | API especializada de proxy |
| Rescue Core | `rescue-core/` | 6778 | HTTP | conflita com o backend principal |

## Fluxo geral

1. O usuário acessa o frontend.
2. O login chama `POST /api/auth/login` no backend principal.
3. O frontend guarda `becker_token` e `becker_user` em `localStorage`.
4. As telas consomem a API principal em `6778` e, para funções de proxy/DNS especializado, usam o serviço em `6779`.
5. Os backends consultam PostgreSQL e executam comandos no host Linux para refletir alterações reais na infraestrutura.

## Frontend

### Tecnologias

- React 18
- Vite
- Tailwind CSS 4
- Axios
- React Router DOM 6
- Framer Motion
- jsPDF

### Configuração

Arquivo: `frontend/.env`

```env
VITE_API_URL=https://console.jacarezinho.cloud
```

Observação importante: apesar do `.env`, o serviço `frontend/src/services/api.js` usa `baseURL` hardcoded para `https://console.jacarezinho.cloud`.

### Rotas de tela

- `/`: Dashboard
- `/network`: Rede e IP
- `/server`: Servidor
- `/users`: Gestão de usuários
- `/proxy`: Proxy e DNS avançado
- `/control`: Controle tático
- `/backups`: Cofre de backup
- `/security`: Segurança
- `/redes/agendamento`: Agendamento de VLAN

### Serviços HTTP do frontend

#### API principal

Arquivo: `frontend/src/services/api.js`

- usa `axios`
- envia `Authorization: Bearer <becker_token>` automaticamente
- base URL fixa: `https://console.jacarezinho.cloud`

#### API do proxy

Arquivo: `frontend/src/services/apiProxy.js`

- usa hostname dinâmico do navegador
- aponta para `https://<host>:6779/api/proxy`

### Principais telas e consumo de API

- `Login.jsx`: `POST /api/auth/login`
- `Dashboard.jsx`: `GET /api/dashboard/metrics`
- `Server.jsx`: `GET /api/server/hardware`
- `Users.jsx`: `GET /api/users`, criação/edição/remoção de usuários
- `Network.jsx`:
  - `GET /api/network/vlans-detail`
  - `GET /api/access`
  - `POST /api/access/block`
  - `POST /api/access/unblock`
  - `GET /api/access/scan`
  - `GET /api/connectivity/list`
  - `POST /api/connectivity/vpn/create`
  - `POST /api/connectivity/vpn/download`
  - `POST /api/connectivity/vpn/delete`
  - `POST /api/connectivity/storage/create`
  - `POST /api/connectivity/storage/delete`
  - `GET /api/dns/stats`
  - `GET /api/dns/latency-breakdown`
  - `GET /api/dns/zones`
  - `POST /api/dns/zones/add`
  - `POST /api/dns/zones/delete`
  - `POST /api/dns/zones/verify`
  - `POST /api/dns/cache/flush`
- `Proxy.jsx`: consome principalmente `backend-proxy` em `6779`, com foco em DNS, radar, whitelist e VIP
- `Control.jsx`: `GET /api/control/services`, `POST /api/control/service-action`, `POST /api/control/tactical`
- `Backups.jsx`: `GET /api/backups`, `POST /api/backups/create`, `POST /api/backups/delete`, `POST /api/backups/download`
- `Security.jsx`: `GET /api/security/dashboard`, ações Fail2Ban/UFW/Cockpit
- `VlanManagerMD3.jsx`: `POST /api/vlans/schedule`

## Backend principal

### Tecnologias

- Express 5
- TypeScript
- PostgreSQL (`pg`)
- JWT
- bcrypt
- nodemailer
- PDFKit
- Socket.IO listado como dependência, mas não aparece como peça central no `server.ts`

### Inicialização

Arquivo principal: `backend/src/server.ts`

Rotas montadas:

- `/api/auth`
- `/api/dashboard`
- `/api/server`
- `/api/backups`
- `/api/control`
- `/api/users`
- `/api/network`
- `/api/qos`
- `/api/access`
- `/api/connectivity`
- `/api/downtime`
- `/api/dns`
- `/api/proxy`
- `/api/security`
- `/api/vlans`

Healthcheck:

- `GET /api/ping`

### Banco de dados

O backend usa PostgreSQL local:

- host: `localhost`
- porta: `5432`
- database: `controlebeckercorp_v8`
- user: `postgres`

Há múltiplos pontos com string de conexão hardcoded:

`postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8`

### Módulos principais

#### Auth

Arquivo: `backend/src/modules/auth/auth-routes.ts`

- `POST /api/auth/login`
- valida usuário na tabela `app_users`
- compara senha com `bcrypt`
- gera JWT com expiração de 12h

#### Dashboard

Arquivo: `backend/src/modules/dashboard/dashboard-routes.ts`

- `GET /api/dashboard/metrics`
- coleta:
  - uso de CPU e RAM
  - uptime
  - status de internet
  - IP WAN/LAN
  - telemetria de tráfego
  - contagem de ameaças em logs do `fail2ban` e `kern.log`
  - status de serviços `isc-dhcp-server`, `unbound`, `squid`, `wg-quick@wg0`

#### Server

Arquivo: `backend/src/modules/server/server-routes.ts`

- `GET /api/server/hardware`
- coleta:
  - hostname, distro, kernel, arquitetura
  - CPU, clock, temperatura
  - uso de memória
  - tráfego WAN/LAN
  - estado das interfaces
  - ocupação dos discos `/`, `/mnt/cftv_storage`, `/mnt/nextcloud_data`
  - insights operacionais

#### Users

Arquivo: `backend/src/modules/users/users-routes.ts`

- `GET /api/users`
- `POST /api/users`
- `POST /api/users/update`
- `POST /api/users/delete`

Tabela principal: `app_users`

#### Network

Arquivo: `backend/src/modules/network/network-routes.ts`

- `GET /api/network/vlans-detail`
- lê `/proc/net/dev`, `ip -o -4 addr show` e `ip -o link show`
- retorna métricas de interfaces reais do host

#### QoS

Arquivo: `backend/src/modules/qos/qos-routes.ts`

- `GET /api/qos`
- `POST /api/qos/apply`

Usa:

- tabela `net_qos_policies`
- tabela `net_qos_vips`
- comando `tc` para moldagem de tráfego no kernel

#### Access

Arquivo: `backend/src/modules/access/access-routes.ts`

Exposto em `/api/access`, usado no frontend para:

- listar bloqueios
- bloquear IP/MAC/dispositivo
- desbloquear
- varrer dispositivos

#### Connectivity

Arquivo observado via uso do frontend e resultados de busca: `backend/src/modules/connectivity/connectivity-routes.ts`

Responsável por:

- criação, remoção e download de VPN
- criação e remoção de acesso a storage
- listagem de conectividade

#### Control

Arquivo: `backend/src/modules/control/control-routes.ts`

- `GET /api/control/services`
- `POST /api/control/service-action`
- `POST /api/control/tactical`

Ações táticas identificadas:

- reset de firewall
- unlock global no Fail2Ban
- restart do DHCP
- restart do PostgreSQL
- limpeza de cache do sistema

#### Backups

Arquivo: `backend/src/modules/backups/backups-routes.ts`

- `GET /api/backups`
- `POST /api/backups/create`
- `POST /api/backups/delete`
- `POST /api/backups/restore`
- `GET|POST /api/backups/download`

Características:

- cria `pg_dump`
- empacota `backend`, `frontend`, `backend-proxy`, `doc_generator`, `scripts`
- exclui `node_modules`, `dist`, `.git`, `backups`, logs
- restauração usa script temporário `restore_process.sh`
- restauração reinicia serviços via `pm2`

#### Security

Arquivo: `backend/src/modules/security/security-routes.ts`

- `GET /api/security/dashboard`
- `POST /api/security/f2b/unban`
- `POST /api/security/f2b/ban`
- `POST /api/security/ufw/delete`
- `POST /api/security/setup-cockpit`

Coleta:

- status e regras do UFW
- status do Fail2Ban
- IPs banidos
- IPs públicos monitorados
- portas e origens mais atacadas com base em `kern.log`

#### Downtime

Arquivo: `backend/src/modules/connectivity/downtime-routes.ts`

- `GET /api/downtime/history`
- `GET /api/downtime/summary`

Tabela principal: `net_link_downtime`

#### DNS / Unbound

Arquivo: `backend/src/modules/unbound/routes.ts`

- `GET /api/dns/stats`
- `GET /api/dns/latency-breakdown`
- `GET /api/dns/zones`
- `POST /api/dns/zones/add`
- `POST /api/dns/zones/delete`
- `POST /api/dns/zones/verify`
- `POST /api/dns/cache/flush`

Tabela principal: `net_dns_rules`

Arquivo gerado:

- `/etc/unbound/unbound.conf.d/custom-zones.conf`

#### Proxy

Arquivo: `backend/src/modules/proxy/proxy-routes.ts`

- `GET /api/proxy/logs`
- `GET /api/proxy/stats`

Tabela principal: `proxy_audit_log`

#### Agendamento de VLAN

Arquivos:

- `backend/src/modules/network/vlan-schedule-routes.ts`
- `backend/src/modules/network/vlan-schedule-controller.ts`

Rota:

- `POST /api/vlans/schedule`

Scripts acionados:

- `/opt/controlebeckercorp-v8/backend/999_sync_cron.sh`
- `/opt/controlebeckercorp-v8/backend/999_vlan_scheduler.sh`

## Backend Proxy

### Tecnologias

- Express 4
- TypeScript
- PostgreSQL
- execução de comandos shell
- acesso direto a arquivos ACL e certificados

### Inicialização

Arquivo principal: `backend-proxy/src/server.ts`

Rotas montadas:

- `/api/proxy`
- `/api/backups`
- `/api/proxy/audit`
- `/api/proxy/engine`
- `/api/dns/vip`
- `/api/dns`

Recursos estáticos:

- `/sarg` serve `backend-proxy/public/sarg`

Download de certificado:

- `/api/proxy/cert/download`
- `/api/cert/download`
- `/cert/download`

### Módulos principais

#### Proxy routes

Arquivo: `backend-proxy/src/routes/proxy-routes.ts`

Funções:

- usuários do Squid via `htpasswd`
- leitura/escrita de listas ACL
- VIPs persistidos em banco e exportados para arquivo
- status do Squid
- clientes ativos
- logs recentes
- interfaces de rede
- botão de pânico
- geração de relatório SARG
- bypass global ou por VLAN com `iptables`

Arquivos e diretórios relevantes:

- `backend-proxy/regras/`
- `backend-proxy/regras/listas/`
- `backend-proxy/regras/passwd`
- `backend-proxy/regras/bloqueados.acl`
- `backend-proxy/regras/permitidos.acl`
- `backend-proxy/regras/splice_whitelist.acl`
- `backend-proxy/regras/vips.acl`
- `backend-proxy/regras/whitelist_ssl.acl`
- `backend-proxy/regras/social_media.acl`
- `backend-proxy/regras/bypassed_vlans.json`

#### Engine routes

Arquivo: `backend-proxy/src/routes/engine-routes.ts`

Função: controle seguro da interceptação transparente do Squid.

Rotas:

- `GET /api/proxy/engine/status`
- `POST /api/proxy/engine/start`
- `POST /api/proxy/engine/stop`
- `POST /api/proxy/engine/restore`
- `POST /api/proxy/engine/emergency`

Lógica central:

- sobe e valida o Squid antes de aplicar `REDIRECT`
- remove `REDIRECT` antes de parar o Squid
- persiste regras com `netfilter-persistent`
- mantém estado de bypass em arquivo JSON

VLANs controladas na engine:

- `enp6s0.10`
- `enp6s0.30`
- `enp6s0.50`
- `enp6s0.70`

#### DNS routes do proxy

Arquivo: `backend-proxy/src/routes/dns-routes.ts`

Rotas observadas:

- `GET /api/dns/zones`
- `GET /api/dns/stats`
- `GET /api/dns/latency-breakdown`

Essas rotas operam sobre `dns_zones` e `proxy_audit_log`.

#### VIP routes

Arquivo: `backend-proxy/src/routes/vip-routes.ts`

Rotas:

- `GET /api/dns/vip`
- `POST /api/dns/vip`
- `PATCH /api/dns/vip/:id`
- `DELETE /api/dns/vip/:id`

Tabela principal:

- `dns_vip`

Arquivos manipulados:

- `/etc/unbound/becker/vip-bypass.conf`
- `/etc/unbound/becker/blocked.rpz`

Essa parte converte CIDR para entradas `rpz-client-ip` e recarrega o Unbound.

#### Audit routes

Arquivo: `backend-proxy/src/routes/audit-routes.ts`

- `GET /api/proxy/audit/permanencia`

Consulta a view:

- `v_auditoria_permanencia`

#### Backup routes do proxy

Arquivo: `backend-proxy/src/routes/backup-routes.ts`

- `GET /api/backups/download/:filename`

Procura backups em múltiplos diretórios locais conhecidos.

### Ingestão de logs

Arquivo: `backend-proxy/src/ingester.ts`

Função:

- executa `tail -F -n 0 /var/log/squid/access.log`
- faz parse das linhas
- grava em `proxy_audit_log`

## Rescue Core

Arquivo: `rescue-core/server.js`

Rotas:

- `POST /api/auth/login`
- `GET /api/auth/me`

Comportamento:

- aceita qualquer login
- responde com token fixo `emergency_token_123`
- usuário padrão `Admin Rescue`

Uso recomendado:

- apenas contingência e manutenção

## Gerador de documentação

Arquivo: `doc_generator/generate.js`

Script:

- gera PDF técnico com PDFKit
- lê arquivos de código e insere no documento
- salva em `public/DOCUMENTACAO_TECNICA_V8.pdf`

Execução:

```bash
cd /opt/controlebeckercorp-v8/doc_generator
npm start
```

## Scripts operacionais encontrados

### Backend

- `000_ultimate_server.sh`
- `102_reconstruct_auth_system.sh`
- `103_read_app_structure.sh`
- `104_fix_token_keys.sh`
- `300_fix_real_backups.sh`
- `303_fix_services_status.sh`
- `305_fix_services_telemetry.sh`
- `306_rollback_dns.sh`
- `307_fix_network_native.sh`
- `308_fix_dns_module.sh`
- `999_fix_syntax.sh`
- `999_safe_logs.sh`
- `999_sync_cron.sh`
- `999_terminacao_ssl.sh`
- `999_unbound_access.sh`
- `999_unbound_metrics.sh`
- `999_vlan_scheduler.sh`
- `fix_backend_users.sh`
- `reset_pass.js`
- `reset_pass_final.js`

### Scripts gerais

- `scripts/debug_white_screen.sh`
- `scripts/enable_frontend_ssl.sh`
- `scripts/fix_dashboard_lan_calc.sh`
- `scripts/fix_tailwind_v4_build.sh`
- `scripts/fix_visuals.sh`
- `scripts/panic_off.sh`
- `scripts/panic_on.sh`
- `scripts/rescue_system_final.sh`
- `scripts/restore_http_frontend.sh`

## Banco de dados

O esquema completo não foi inferido automaticamente, mas as tabelas/views referenciadas no código incluem:

- `app_users`
- `proxy_audit_log`
- `proxy_vips`
- `net_qos_policies`
- `net_qos_vips`
- `net_dns_rules`
- `net_link_downtime`
- `sys_smtp_config`
- `dns_zones`
- `dns_vip`
- `v_auditoria_permanencia`

## Dependências de infraestrutura do host

O sistema depende de vários componentes externos ao Node.js:

- PostgreSQL
- Nginx ou outro terminador SSL para a API principal
- Squid
- Unbound
- Fail2Ban
- UFW
- `tc`/iproute2
- `iptables`
- `netfilter-persistent`
- `htpasswd`
- `sarg`
- PM2
- certificados válidos em `/etc/letsencrypt/live/console.jacarezinho.cloud/`

Também há forte dependência dos nomes de interfaces:

- `enp6s0`
- `enp8s0`
- subinterfaces `enp6s0.*`
- `wg0`

## Como executar os serviços

### Frontend

```bash
cd /opt/controlebeckercorp-v8/frontend
npm install
npm run dev
```

Ou build:

```bash
cd /opt/controlebeckercorp-v8/frontend
npm install
npm run build
```

### Backend principal

```bash
cd /opt/controlebeckercorp-v8/backend
npm install
npm start
```

Build:

```bash
cd /opt/controlebeckercorp-v8/backend
npm run build
```

### Backend Proxy

```bash
cd /opt/controlebeckercorp-v8/backend-proxy
npm install
npm run build
node dist/server.js
```

Ingestor:

```bash
cd /opt/controlebeckercorp-v8/backend-proxy
node dist/ingester.js
```

### Rescue Core

```bash
cd /opt/controlebeckercorp-v8/rescue-core
npm install
npm start
```

## PM2

Existe configuração explícita em `backend-proxy/ecosystem.config.js` para:

- app name: `backend-proxy`
- script: `./dist/server.js`

O módulo de backup/restauração também assume uso de `pm2 stop all` e `pm2 restart all`.

## Pontos de atenção técnicos

### 1. Segredos hardcoded

Há credenciais e segredos fixos em código:

- senha do PostgreSQL
- segredo JWT `BECKER_SUPER_SECRET`
- certificados e caminhos absolutos

Isso é um risco de segurança e dificulta portabilidade.

### 2. Acoplamento ao ambiente

O sistema depende de:

- caminhos absolutos em `/opt/controlebeckercorp-v8`
- interfaces de rede com nomes específicos
- diretórios e serviços Linux específicos

Sem esse ambiente, várias rotas não funcionam.

### 3. Pouco desacoplamento entre frontend e backend

Há URLs hardcoded no frontend e chamadas diretas a portas específicas. Isso limita deploy em outros domínios ou ambientes.

### 4. Conflito potencial de porta

`backend` e `rescue-core` usam a porta `6778`. Eles não podem operar simultaneamente na mesma máquina sem mudança de porta ou orquestração externa.

### 5. Permissões elevadas

Muitas rotas executam comandos `sudo`. O usuário do processo Node precisa de permissões cuidadosamente configuradas para evitar falhas ou exposição excessiva.

### 6. Código legado/paralelo

Há indícios de evolução incremental:

- `server.ts.bak`
- `*.bak`
- `new-proxy/`
- `backend-proxy/server.js` legado

Antes de grandes mudanças, convém definir quais caminhos são oficiais e quais são históricos.

## Arquivos-chave para manutenção

- `backend/src/server.ts`
- `backend/src/modules/auth/auth-routes.ts`
- `backend/src/modules/dashboard/dashboard-routes.ts`
- `backend/src/modules/server/server-routes.ts`
- `backend/src/modules/unbound/routes.ts`
- `backend/src/modules/backups/backups-routes.ts`
- `backend-proxy/src/server.ts`
- `backend-proxy/src/routes/proxy-routes.ts`
- `backend-proxy/src/routes/engine-routes.ts`
- `backend-proxy/src/routes/vip-routes.ts`
- `frontend/src/App.jsx`
- `frontend/src/pages/Network.jsx`
- `frontend/src/pages/Proxy.jsx`
- `frontend/src/services/api.js`

## Resumo executivo

O projeto é uma console operacional full-stack voltada para administração de infraestrutura local, com forte integração ao host Linux e aos serviços de rede reais. A base funcional está dividida entre:

- uma API principal para operação geral
- um microsserviço específico para proxy e DNS avançado
- um frontend React para operação
- um modo de resgate para contingência

É um sistema funcionalmente rico, mas com alto acoplamento ao ambiente, presença de segredos em código e múltiplos caminhos legados. Para evolução segura, o primeiro passo recomendado é padronizar configuração por ambiente, consolidar serviços oficiais e documentar o schema do banco.

