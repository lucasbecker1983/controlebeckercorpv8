# PontoRH

Documento operacional do `PontoRH` no SGCG.

## Regra inegociavel

O aplicativo institucional `PontoRH` usa os resolvedores `208.67.222.222` e `208.67.220.220` hardcoded.

Regra incontestavel: nao mexa mais nesse DNS quando mexer no `Unbound`, em regras, `RPZ` ou em qualquer outra camada relacionada.

Por isso:

- consultas DNS classicas `UDP/53` e `TCP/53` para esses dois IPs devem permanecer liberadas
- essas consultas nao podem ser sequestradas pelo `REDIRECT` geral de DNS para o `Unbound`
- essa excecao vale como compatibilidade operacional institucional, inclusive para usuarios `VIP`
- nenhuma manutencao no `Unbound`, no `UFW`, no `iptables`, no `backend-proxy` ou nas politicas do SGCG pode remover essa excecao
- se houver refatoracao da pilha DNS, a compatibilidade do `PontoRH` deve ser validada antes do fechamento da rodada

## Motivo

Sem essa excecao, colaboradores deixam de conseguir registrar jornada de trabalho no app de ponto. Isso e inadmissivel em producao.

## Implementacao esperada

- `UFW` continua como camada oficial do firewall
- o `before.rules` precisa manter `RETURN` em `nat/PREROUTING` para `208.67.222.222` e `208.67.220.220` antes do `REDIRECT` global de DNS
- o frontend de `Politicas Institucionais` deve exibir essa dependencia como referencia operacional permanente
- `CODEX.md` deve registrar qualquer alteracao que toque a compatibilidade do `PontoRH`

## Validacao minima

- confirmar em `iptables -t nat -S PREROUTING` que os `RETURN` do `PontoRH/OpenDNS` aparecem antes do `REDIRECT` geral de DNS
- confirmar em `ufw status numbered` e no runtime que nao existe bloqueio contraditorio para os dois IPs
- considerar a rodada incompleta se o `PontoRH` ou o registro de ponto institucional voltar a depender de resolucao pelo `Unbound`

## Rodada 2026-05-06

- `before.rules` ativo recebeu o bloco `SGCG_PONTORH_OPENDNS` com excecao para as VLANs `10`, `30`, `40`, `50`, `70`, `80` e `99`
- o runtime `nat/PREROUTING` foi validado com os `RETURN` do `OpenDNS` antes do primeiro `REDIRECT` generico de DNS
- o frontend de `Politicas Institucionais` passou a expor a dependencia do `PontoRH` de forma permanente
- o `backend-proxy` foi corrigido para nao falhar no bootstrap por uso de `sudo` quando ja executa como `root`
