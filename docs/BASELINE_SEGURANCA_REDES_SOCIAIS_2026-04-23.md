# Baseline de Seguranca - Redes Sociais

Data: `2026-04-23 15:37:01 -0300`
Ambiente: `/opt/controlebeckercorp-v8`

## Decisao operacional

Fica mantido o reforco de seguranca pelo caminho estavel do sistema:

- bloqueio oficial por VLAN via `Squid ACL` e `Unbound RPZ`
- sem dependencia de ajuste no frontend
- sem promover a chain ad hoc do celular para todas as redes

## VLANs gerenciadas com bloqueio ativo

- VLAN `10` -> `enp6s0.10`
- VLAN `30` -> `enp6s0.30`
- VLAN `70` -> `enp6s0.70`

Estado confirmado:

- `blocking_enabled = true`
- `monitoring_enabled = true`
- `exempt = false`
- `policy_engine_state.global_blocking_enabled = true`
- `policy_engine_state.global_monitoring_enabled = true`
- `policy_engine_state.emergency_bypass = false`
- `policy_engine_state.enforcement_mode = acl-plus-dns`

## Artefatos ativos

Cada VLAN gerenciada possui os artefatos oficiais ativos:

- `/etc/squid/acl/blocklist-vlan-10.acl`
- `/etc/squid/acl/blocklist-vlan-30.acl`
- `/etc/squid/acl/blocklist-vlan-70.acl`
- `/etc/unbound/becker/blocklist-vlan-10.rpz`
- `/etc/unbound/becker/blocklist-vlan-30.rpz`
- `/etc/unbound/becker/blocklist-vlan-70.rpz`

Os `ACLs` das VLANs `10`, `30` e `70` estao alinhados entre si no baseline atual.

## Escopo de bloqueio observado

As listas atuais incluem, entre outros:

- `facebook.com`, `fbcdn.net`, `fbsbx.com`
- `instagram.com`, `cdninstagram.com`
- `threads.net`
- `tiktok.com`, `tiktokcdn.com`, `tiktokv.com`
- outros domínios sociais ja catalogados pela politica atual

Observacao importante:

- as listas atuais tambem incluem plataformas fora do escopo estrito de redes sociais, como `youtube.com`, `discord.com`, `telegram.org`, `x.com`, `reddit.com` e correlatos

## Posicionamento de governanca tecnica

Por ora, o reforco de seguranca deve permanecer:

- na camada oficial de politica por VLAN
- auditavel por artefatos gerados
- sem transformar excecoes tecnicas observadas em um controle de frontend prematuro

## Proxima etapa futura

Quando houver tempo para a reestruturacao maior, separar formalmente o sistema em dois eixos:

- Governanca: politica, escopo, aprovacao, auditoria e operacao
- Tecnica: enforcement DNS, proxy, transporte e excecoes temporarias
