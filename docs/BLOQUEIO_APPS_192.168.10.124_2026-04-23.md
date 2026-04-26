# Bloqueio de Apps - IP 192.168.10.124

Data: 2026-04-23
Ambiente: `/opt/controlebeckercorp-v8`
IP em teste: `192.168.10.124`
VLAN: `10` (`192.168.10.0/24`)

## Objetivo

Validar bloqueio de aplicativos de redes sociais para o celular `192.168.10.124` sem causar efeito colateral em navegação geral e sem bloquear domínios `gov.br`.

## Estado da politica no momento do registro

- `vlan_policies.vlan_id = 10`
- `blocking_enabled = true`
- `monitoring_enabled = true`
- `policy_mode = global`
- `policy_engine_state.enforcement_mode = acl-plus-dns`
- `global_blocking_enabled = true`
- `global_monitoring_enabled = true`
- `emergency_bypass = false`

## O que foi confirmado

### 1. `gov.br` não estava ausente da whitelist

Foi confirmado que `gov.br` e subdominios relevantes estavam presentes nos artefatos ativos:

- `/etc/unbound/becker/allowed.rpz`
- `/etc/squid/acl/proxy_whitelist.acl`

Exemplos encontrados:

- `gov.br`
- `*.gov.br`
- `fazenda.gov.br`
- `receita.fazenda.gov.br`
- `caixa.gov.br`
- `esocial.gov.br`

Nao foram encontrados bloqueios de `gov.br` nos logs DNS durante a verificacao.

### 2. O celular estava sob bloqueio e monitoramento normais da VLAN 10

Antes de qualquer liberacao temporaria, o IP `192.168.10.124`:

- nao estava em `policy_exceptions`
- nao estava em `dns_vip`
- estava sujeito ao bloqueio normal da `VLAN10`

### 3. O DNS estava bloqueando bootstrap DoH

Os logs do IP mostraram bloqueio repetido de:

- `chrome.cloudflare-dns.com`

Isso explicava o sintoma observado de navegacao ruim ou erro do tipo `DNS_PROBE_STARTED`.

### 4. Havia uma camada extra de firewall especifica para esse IP

Foi encontrada uma chain dedicada:

- `BCC_SNI_TEST_10124`

Ela estava sendo chamada no `FORWARD` por uma regra especifica:

- `-A FORWARD -s 192.168.10.124/32 -i enp6s0.10 -o enp8s0 -j BCC_SNI_TEST_10124`

Essa chain continha:

- bloqueio de `udp/443` (QUIC)
- bloqueio por `SNI`
- bloqueio por ranges/IPs observados principalmente de TikTok

Essa camada era separada do bypass DNS/Squid.

## Linha do tempo do que foi feito

### Etapa 1. Diagnostico inicial

Foi verificado que:

- o motor `backend-proxy` estava ativo
- `unbound` estava ativo
- `squid` estava ativo
- a `VLAN10` estava com bloqueio e monitoramento ativos

### Etapa 2. Liberacao temporaria do IP para diagnostico

Foi criada uma excecao temporaria de bypass total para o IP:

- `policy_exceptions.id = 21`
- `dns_vip.id = 384`

E o `apply` do motor foi executado com sucesso.

Depois disso, foi confirmado que o IP aparecia em:

- `/etc/squid/acl/proxy_ip_bypass.acl`
- `/etc/unbound/becker/vip-bypass.conf`

### Etapa 3. Descoberta do bloqueio extra por firewall

Mesmo com o bypass, foi identificado que o IP ainda estava sujeito a uma chain separada de firewall:

- `BCC_SNI_TEST_10124`

O gancho dessa chain no `FORWARD` foi removido temporariamente para isolar a causa.

### Etapa 4. Retorno do IP ao comportamento normal da VLAN 10

Por solicitacao do operador:

- a excecao `policy_exceptions.id = 21` foi removida
- o `dns_vip` do `192.168.10.124` foi desativado
- o IP saiu de `/etc/squid/acl/proxy_ip_bypass.acl`
- o IP voltou ao estado normal da `VLAN10`

### Etapa 5. Validacao de apps apos retorno ao estado normal

Depois da remocao do bypass, foi confirmado que:

- o DNS continuava bloqueando domínios sociais
- varios domínios de TikTok, Facebook e Instagram retornavam `NXDOMAIN` para o IP `192.168.10.124`

Exemplos observados em `journalctl -u unbound`:

- `graph.facebook.com`
- `graph.instagram.com`
- `z-m-gateway.facebook.com`
- `b-graph.facebook.com`
- `edge-mqtt.facebook.com`
- varios `*.tiktokcdn.com`
- varios `*.tiktokv.com`

Conclusao dessa etapa:

- o bloqueio DNS estava funcionando
- os aplicativos ainda conseguiam operar por trafego direto, QUIC e/ou caminhos que nao dependiam apenas de DNS naquele instante

### Etapa 6. Reativacao controlada da camada de transporte

Para voltar a segurar os apps, foi religada a chain:

- `BCC_SNI_TEST_10124`

Mas antes disso foram removidas as entradas de YouTube, para estreitar o escopo:

- `youtube.com`
- `googlevideo.com`
- `ytimg.com`
- `youtu.be`
- `youtubei.googleapis.com`

Depois disso, a regra foi recolocada no `FORWARD`:

- `-A FORWARD -s 192.168.10.124/32 -i enp6s0.10 -o enp8s0 -j BCC_SNI_TEST_10124`

## Estado atual no momento do registro

### Bypass / VIP

- nao existe `policy_exceptions` ativa para `192.168.10.124`
- o registro `dns_vip` de `192.168.10.124` esta `ativo = false`
- o IP nao esta em `/etc/squid/acl/proxy_ip_bypass.acl`

### Firewall especifico para o IP

A chain `BCC_SNI_TEST_10124` esta novamente ligada ao `FORWARD` para esse IP.

Ela contem, entre outros:

- bloqueio de `udp/443`
- bloqueio SNI para:
  - `facebook.com`
  - `fbcdn.net`
  - `fbsbx.com`
  - `instagram.com`
  - `cdninstagram.com`
  - `threads.net`
  - `tiktok.com`
  - `tiktokcdn.com`
  - `tiktokv.com`
  - varios hostnames especificos de TikTok observados no teste

As entradas de YouTube foram removidas antes da religacao.

### DNS / ACL

Continuam ativos:

- `/etc/squid/acl/blocklist-vlan-10.acl`
- `/etc/unbound/becker/blocklist-vlan-10.rpz`
- `/etc/squid/acl/proxy_blocklist.acl`
- `/etc/unbound/becker/blocked.rpz`

Quantidade observada no momento:

- `blocklist-vlan-10.acl`: `88` linhas
- `blocklist-vlan-10.rpz`: `186` linhas
- `proxy_blocklist.acl`: `47` linhas
- `blocked.rpz`: `104` linhas

## Leitura tecnica resumida

O teste mostrou que:

1. Bloqueio apenas por DNS nao e suficiente para segurar completamente apps sociais modernos.
2. O bloqueio por `udp/443` e por `SNI` para esse IP complementa o bloqueio DNS.
3. A chain antiga estava agressiva demais porque continha itens fora do escopo desejado, como YouTube.
4. `gov.br` nao apareceu como causa real do problema durante esta trilha; a whitelist estava presente.

## Proximo passo recomendado

Testar novamente os apps no `192.168.10.124` com o estado atual e observar:

- se TikTok, Instagram, Facebook e Threads deixam de funcionar
- se a navegacao geral continua normal
- se aparece algum novo dominio/IP escapando da camada atual

Se houver escape, a proxima acao recomendada e registrar os novos destinos observados e incorporar apenas o necessario na chain especifica do IP, sem ampliar o escopo para dominios nao relacionados.

## Atualizacao 2026-04-23 15:20 - VIP completo para prova final

Por solicitacao do operador, o IP `192.168.10.124` foi colocado novamente em modo VIP para remover a duvida sobre interferencia do gateway no fluxo do `gov.br`.

Medidas aplicadas:

- criado `policy_exceptions.id = 23` com `exception_type = bypass total` e `active = true`
- reativado `dns_vip.id = 384` para `192.168.10.124`
- IP presente em `/etc/squid/acl/proxy_ip_bypass.acl`
- IP presente em `backend-proxy/regras/generated/proxy_ip_bypass.acl`
- IP presente em `/etc/unbound/becker/vip-bypass.conf`
- familia `cloudflare-dns.com` removida da blocklist global para evitar o sintoma `DNS_PROBE_FINISHED_NO_INTERNET`
- remocao do gancho `FORWARD` para `BCC_SNI_TEST_10124`, deixando o teste sem a camada extra de firewall/SNI dedicada ao IP

Interpretacao desta etapa:

- neste estado, o `192.168.10.124` fica sem o bloqueio de proxy, sem o bloqueio RPZ por client-ip e sem a chain dedicada de transporte/SNI
- se o `gov.br` continuar falhando nesse estado, a evidencia fica fortemente a favor de problema fora do gateway local

## Atualizacao 2026-04-23 15:30 - retorno ao bloqueio do teste

Depois do teste em VIP completo, o operador confirmou que o `gov.br` continuou falhando sem mudanca perceptivel.

Por isso, o IP `192.168.10.124` foi devolvido ao estado de bloqueio usado no teste:

- `policy_exceptions.id = 23` desativado
- `dns_vip.id = 384` desativado novamente
- IP removido de `/etc/squid/acl/proxy_ip_bypass.acl`
- IP removido de `backend-proxy/regras/generated/proxy_ip_bypass.acl`
- IP removido de `/etc/unbound/becker/vip-bypass.conf`
- chain `BCC_SNI_TEST_10124` religada no `FORWARD` para esse IP

Conclusao desta etapa:

- o teste VIP completo nao alterou o comportamento do `gov.br`
- a falha do `gov.br` permanece com forte indicio de causa fora do gateway local
- o bloqueio controlado de apps sociais no celular pode ser mantido sem usar o caso `gov.br` como impeditivo
