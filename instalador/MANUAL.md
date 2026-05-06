# Manual do Superinstalador SGCG

Manual oficial do `Superinstalador SGCG JMB TECNOLOGIA`, projetado para implantacao repetivel em `Ubuntu Server 24.04+` ou ambientes compativeis com a base Ubuntu.

Este documento foi escrito para instalacoes em campo, laboratorio, prefeitura, orgao publico ou ambiente institucional privado com variacoes reais de rede, dominios, VLANs e politicas.

## 1. Objetivo

O `Superinstalador SGCG` existe para transformar a implantacao do sistema em um processo previsivel, auditavel e reutilizavel.

Ele foi desenhado para:

- instalar dependencias do sistema operacional
- instalar a stack de aplicacao do SGCG
- detectar placas de rede e sugerir papeis de `WAN`, `LAN` e `TRUNK`
- receber dominio, faixas de rede, VLANs e modulos do cliente
- gerar artefatos de `nginx`, `netplan`, `UFW`, `Unbound`, `PM2` e arquivos `.env`
- manter uma configuracao declarativa do ambiente
- permitir reinstalacao, auditoria e reaplicacao com consistencia

## 2. Stack coberta pelo instalador

O instalador foi preparado para cenarios em que o SGCG precisa provisionar toda a stack tecnica.

Dependencias previstas:

- `Node.js`
- `npm`
- `TypeScript`
- `React`
- `Vite`
- `Tailwind CSS`
- `Python 3`
- `pip`
- `PostgreSQL`
- `Nginx`
- `Unbound`
- `Squid`
- `UFW`
- `PM2`
- ferramentas auxiliares de rede, build e seguranca

## 3. Estrutura da pasta `instalador/`

```text
instalador/
  MANUAL.md
  README.md
  bootstrap.sh
  requirements.txt
  sgcg-installer.py
  core/
  docs/
  profiles/
  templates/
```

Resumo de cada parte:

- `bootstrap.sh`: prepara o servidor e instala as dependencias base
- `sgcg-installer.py`: executa wizard, plano, deteccao e aplicacao
- `core/`: motor em `Python`
- `profiles/`: exemplos declarativos por cenario
- `templates/`: modelos de configuracao
- `docs/`: notas de arquitetura

## 4. Requisitos minimos

Sistema operacional suportado:

- `Ubuntu Server 24.04`
- versoes superiores do Ubuntu Server
- distribuicoes compativeis com base Ubuntu, desde que mantenham as ferramentas necessarias

Requisitos recomendados:

- acesso `root` ou `sudo`
- conectividade com repositorios `apt`
- acesso ao repositorio do projeto SGCG
- no minimo duas interfaces para cenarios gateway
- no minimo tres interfaces quando houver `TRUNK` dedicado

Requisitos funcionais comuns:

- dominio principal do console
- domínios internos adicionais, se houver
- decisao sobre certificado publico, CA interna ou certificado do cliente
- definicao de `WAN`, `LAN` e `VLANs`
- faixas CIDR, gateways e DNS
- escolha dos modulos institucionais

## 5. Perfis previstos

O instalador nasce com perfis basicos para acelerar o provisionamento.

Perfis incluidos:

- `simple-console`
- `gateway-vlans`
- `full-appliance`

Quando usar cada um:

- `simple-console`: console administrativo simples, sem cenarios complexos de VLAN
- `gateway-vlans`: ambiente gateway com sub-redes e politicas por VLAN
- `full-appliance`: implantacao completa do SGCG como appliance institucional

## 6. Fluxo oficial de instalacao

O fluxo operacional recomendado e este:

1. preparar o servidor
2. executar o bootstrap
3. rodar o wizard
4. revisar a configuracao declarativa
5. gerar o plano
6. aplicar os artefatos
7. inicializar banco e deploy, quando aplicavel
8. validar os servicos
9. publicar o ambiente

## 7. Etapa 1: preparar o servidor

Antes de executar o instalador:

- confirmar que o servidor usa `Ubuntu Server 24.04+`
- garantir acesso `root`
- conferir sincronismo de data e hora
- checar se o hostname final ja foi decidido
- identificar se a rede sera simples ou segmentada por VLAN
- definir se o dominio sera publico, interno ou hibrido

## 8. Etapa 2: bootstrap do host

No diretorio raiz do projeto:

```bash
cd /opt/controlebeckercorp-v8/instalador
chmod +x bootstrap.sh
sudo ./bootstrap.sh
```

O `bootstrap.sh` faz o seguinte:

- valida se o sistema e Ubuntu 24.04 ou superior
- instala pacotes base do sistema
- instala `Node.js`
- instala ferramentas globais `npm`
- cria uma `venv` local do instalador
- instala `PyYAML`, `Jinja2`, `rich` e `psutil`

Ao final, ele informa o proximo comando sugerido.

## 9. Etapa 3: ativar a venv

```bash
cd /opt/controlebeckercorp-v8/instalador
source .venv/bin/activate
```

## 10. Etapa 4: detectar o servidor

Para gerar um inventario rapido do host:

```bash
python3 sgcg-installer.py detect
```

Essa saida ajuda a confirmar:

- hostname
- FQDN
- versao do sistema
- kernel
- arquitetura
- timezone
- interfaces de rede detectadas
- sugestao inicial de `WAN`
- sugestao inicial de `LAN`

## 11. Etapa 5: executar o wizard

```bash
python3 sgcg-installer.py wizard
```

Durante o wizard, o operador informa:

- perfil de implantacao
- hostname final
- timezone
- dominio principal
- dominios internos
- interface `WAN`
- interface `LAN`
- interface `TRUNK`, se aplicavel
- VLANs, gateways, politicas e portal cativo, se necessario

O wizard grava a configuracao em:

```text
/etc/sgcg/installer/sgcg-config.yaml
```

Esse arquivo passa a ser a verdade declarativa do ambiente.

## 12. Estrutura da configuracao declarativa

A configuracao e organizada em blocos logicos:

- `profile`
- `hostname`
- `timezone`
- `domains`
- `interfaces`
- `vlans`
- `database`
- `stack`
- `firewall`
- `branding`
- `modules`

Isso permite parametrizar:

- `PostgreSQL`
- dominio e `HTTPS`
- modulos do SGCG
- servicos habilitados
- comportamento de firewall
- branding institucional

## 13. Etapa 6: gerar o plano

```bash
python3 sgcg-installer.py plan
```

Esse comando exibe:

- perfil escolhido
- interfaces e papeis
- VLANs cadastradas
- pacotes `apt` previstos
- ferramentas globais `npm` previstas
- artefatos que serao gerados

Essa etapa e importante para auditoria antes de aplicar alteracoes.

## 14. Etapa 7: aplicar os artefatos

```bash
sudo python3 sgcg-installer.py apply
```

A aplicacao gera artefatos em:

```text
/etc/sgcg/installer/generated/
```

Arquivos previstos:

- `00-sgcg-installer.yaml`
- `sgcg-nginx.conf`
- `backend.env`
- `frontend.env`
- `ecosystem.config.cjs`
- `ufw-baseline.sh`
- `unbound-sgcg.conf`
- `postgres-init.sql`
- `setup-postgresql.sh`
- `deploy-sgcg.sh`
- `validate-sgcg.sh`
- `install-stack.sh`
- `install-report.txt`

## 15. O que cada artefato faz

### `00-sgcg-installer.yaml`

Arquivo base de `netplan` para interfaces e VLANs.

### `sgcg-nginx.conf`

Modelo inicial de `nginx` com:

- host principal
- domínios internos
- proxy para frontend
- proxy para backend
- proxy para `backend-proxy`

### `backend.env`

Variaveis iniciais do backend:

- `PGHOST`
- `PGPORT`
- `PGDATABASE`
- `PGUSER`
- `PGPASSWORD`
- `APP_URL`

### `frontend.env`

Variaveis iniciais do frontend:

- `VITE_API_BASE_URL`
- `VITE_PUBLIC_DOMAIN`
- `VITE_VENDOR_NAME`

### `ecosystem.config.cjs`

Modelo base do `PM2` para:

- `bcc-backend`
- `backend-proxy`
- `bcc-frontend`

### `ufw-baseline.sh`

Baseline inicial de `UFW`, mantendo o `UFW` como firewall oficial.

### `unbound-sgcg.conf`

Include inicial para `Unbound`, com `access-control` por sub-rede e encaminhamento base.

### `install-stack.sh`

Script utilitario que materializa a instalacao base de pacotes previstos no plano.

### `postgres-init.sql`

Script SQL idempotente para criacao de role e banco do SGCG.

### `setup-postgresql.sh`

Script de inicializacao do `PostgreSQL`, com criacao idempotente de role e banco.

### `deploy-sgcg.sh`

Script base de deploy do projeto, com:

- `npm install`
- `npm run build`
- inicializacao ou restart do `PM2`

### `validate-sgcg.sh`

Script local de validacao operacional do servidor apos a instalacao.

### `install-report.txt`

Relatorio resumido do provisionamento.

## 16. Rede: boas praticas de parametrizacao

Ao configurar rede no wizard:

- nao assuma automaticamente qual interface e `WAN`; confirme fisicamente quando necessario
- use `TRUNK` apenas quando a rede estiver realmente segmentada por VLAN
- registre CIDR e gateway com precisao
- mantenha um padrao de nomes previsivel para VLANs
- trate `VLAN 70`, `Hotspot`, `Colaboradores` e redes administrativas como perfis separados quando fizer sentido

## 17. Firewall: regra operacional

O instalador segue a regra institucional do projeto:

- o `UFW` e a camada oficial de firewall
- complementos runtime podem existir, mas nao substituem o `UFW`

O baseline gerado:

- aplica `deny incoming`
- aplica `allow outgoing`
- aplica `deny routed`
- libera `SSH`
- libera `HTTP` e `HTTPS` quando previsto
- libera `DNS` quando o SGCG atuar como resolvedor

Depois disso, o operador pode evoluir o ambiente com regras especificas por modulo.

## 18. Banco de dados

O instalador foi preparado para cenarios com `PostgreSQL`.

O bloco `database` define:

- host
- porta
- nome do banco
- usuario
- senha

Boas praticas:

- trocar a senha padrao antes da entrada em producao
- restringir o acesso ao banco a `localhost` quando possivel
- versionar a estrutura do schema do SGCG separadamente

## 19. Frontend e backend

A stack real contemplada e:

- frontend em `React + Vite + Tailwind`
- backend principal em `Node.js + TypeScript`
- backend-proxy em `Node.js + TypeScript`
- orquestracao em `PM2`

O instalador gera os arquivos base, mas o fluxo de publicacao continua exigindo:

```bash
cd backend && npm run build
cd backend-proxy && npm run build
cd frontend && npm run build
```

Depois:

```bash
pm2 restart bcc-backend
pm2 restart backend-proxy
pm2 restart bcc-frontend
```

## 20. Certificados e HTTPS

O modelo inicial suporta o conceito de:

- `internal_ca`
- certificado publico
- certificado fornecido pelo cliente

Recomendacoes:

- para domínios internos, manter uma CA institucional consistente
- para domínios publicos, preferir emissao automatizavel
- registrar no ambiente qual estrategia foi adotada

## 21. Validacoes obrigatorias apos a implantacao

Depois de aplicar e antes de entregar ao cliente, validar:

```bash
nginx -t
systemctl status nginx
systemctl status postgresql
systemctl status unbound
systemctl status squid
pm2 list
python3 sgcg-installer.py validate
```

Em seguida, testar:

- resolucao DNS
- acesso ao dominio principal
- resposta do frontend
- resposta das rotas `/api`
- conectividade com o banco
- comportamento de firewall

## 22. Validacoes de rede recomendadas

```bash
ip addr
ip route
ss -ltnp
dig @127.0.0.1 google.com
curl -I http://127.0.0.1
curl -I https://SEU-DOMINIO
```

Se houver VLANs:

- validar interfaces `tagged`
- validar gateways
- validar DNS por rede
- validar NAT e forward quando o host for gateway

## 23. Modo de reexecucao

Uma das vantagens do superinstalador e a reexecucao controlada.

Fluxo recomendado para ajustar um ambiente ja existente:

1. editar `/etc/sgcg/installer/sgcg-config.yaml`
2. rodar `plan`
3. revisar diferencas
4. rodar `apply`
5. validar novamente os servicos

## 24. Fluxo recomendado apos `apply`

Em uma implantacao nova, a sequencia mais segura e:

```bash
cd /etc/sgcg/installer/generated
sudo ./install-stack.sh
sudo ./setup-postgresql.sh
sudo ./deploy-sgcg.sh
sudo ./validate-sgcg.sh
```

## 25. O que este instalador ainda nao deve prometer sozinho

Esta primeira versao entrega a estrutura profissional e os artefatos base, mas ainda deve evoluir em pontos como:

- rollback automatizado por etapa
- aplicacao direta de `netplan` em modo transacional
- criacao automatica de banco e extensoes com validacao fim a fim
- emissao automatica de certificados conforme cenario
- deploy transacional completo dos tres runtimes do SGCG
- importacao/exportacao de perfis de cliente

## 26. Procedimento recomendado de entrega

Ao concluir uma implantacao:

1. arquivar o `sgcg-config.yaml`
2. arquivar o `install-report.txt`
3. documentar dominios, interfaces e VLANs finais
4. registrar a politica de certificados adotada
5. registrar credenciais iniciais em cofre seguro
6. documentar quaisquer regras adicionais fora do baseline

## 27. Identidade da solucao

Nome recomendado para uso comercial e operacional:

`Superinstalador SGCG JMB TECNOLOGIA`

Descricao curta recomendada:

`Instalador declarativo, auditavel e reexecutavel para implantacao completa do SGCG em ambientes Ubuntu Server com console, proxy, DNS, firewall, politicas, VLANs e servicos institucionais.`

## 28. Proximos passos recomendados

As evolucoes mais valiosas para a proxima rodada sao:

1. criar modo `rollback`
2. criar modo `deploy` totalmente transacional
3. ampliar o wizard `dialog/whiptail` para selecao modular e revisao final
4. criar templates de `systemd` e `postgresql` mais detalhados
5. adicionar validadores ativos de SSL, DNS, banco e portas

## 29. Conclusao

O diretorio `instalador/` agora serve como base oficial para transformar o SGCG em uma plataforma instalavel com padrao profissional.

Ele ainda pode crescer bastante, mas ja estabelece os pilares corretos:

- configuracao declarativa
- provisioning em camadas
- foco em repetibilidade
- suporte a rede complexa
- stack completa do SGCG
- identidade `JMB TECNOLOGIA`
