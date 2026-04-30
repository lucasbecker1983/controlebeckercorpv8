# SGCG

Sistema de Governanca e Controle Governamental da JMB Tecnologia para operacao institucional de governanca, controle, seguranca, rede, auditoria e conformidade.

## Visao Geral

O SGCG opera em dois eixos permanentes:

- `Governanca`: politica institucional, aprovacoes, excecoes, LGPD, auditoria, relatorios forenses e responsabilizacao.
- `Controle`: DNS, proxy, firewall, QoS, Hotspot, ClamAV, observabilidade, rede, servicos e enforcement tecnico.

O registro de continuidade do projeto fica em `CODEX.md`. Leia esse arquivo antes de qualquer nova rodada de manutencao. Toda alteracao estrutural, visual, funcional ou arquitetural deve ser registrada ali ao final da rodada, especialmente quando houver `build`.

## Arquitetura Principal

- `frontend/`: interface React/Vite do console institucional.
- `backend/`: backend core em Node.js/TypeScript, autenticacao, modulos administrativos, Hotspot, LGPD, Relatorios, QoS, Seguranca e Controle.
- `backend-proxy/`: API e motor institucional de DNS, proxy, politicas, RPZ, ACLs, radar, governanca de dados e Bloqueios & Liberacoes.
- `scripts/`: utilitarios operacionais controlados para contingencia, bypass emergencial e manutencao.
- `sgcg-endpoint-identity-msi/`: agente e instaladores Windows para identidade de endpoints.
- `docs/`: documentacao complementar de hardening, politicas e recomendacoes.
- `CODEX.md`: fonte obrigatoria do estado operacional consolidado.

## Modulos Atuais

- Centro de Governanca
- Politicas Institucionais, Bloqueios & Liberacoes
- Governanca de Dados
- LGPD & Protecao de Dados
- Relatorios Forenses
- Hotspot Institucional e Portal Cativo VLAN 70
- DNS Institucional e Radar DNS/Proxy
- QoS com download e upload por IFB
- Seguranca Operacional com UFW como firewall oficial
- Operacoes Tecnicas, ClamAV e observabilidade de servicos
- Identidade Windows de endpoints para enriquecimento de eventos

## Estado Operacional Recente

- Hotspot VLAN 70 endurecido: MAC conhecido precisa confirmar no portal antes de navegar.
- Revogacao do Hotspot remove IP do `ipset`, limpa conexoes via `conntrack` e exige nova confirmacao.
- Relatorios e metricas do Hotspot integram consultas DNS por IP e exibem dominios mais acessados.
- Politica `dns_ignored_domains` remove ruido de hardware, `.local`, VLAN e telemetrias irrelevantes dos relatorios.
- Radar DNS recebe enriquecimento de identidade Windows (`identity_user`, `identity_computer`).
- UFW foi restaurado e permanece como camada oficial de administracao do firewall.
- QoS aplica upload real via `tc + ifb` e reconcilia runtime a partir do banco.
- LGPD possui inventario, titulares, incidentes, auditoria e exportacao PDF institucional.
- Relatorios Forenses consolidam navegacao DNS e auditoria em PDF governamental.

## Regras Criticas

- O `UFW` e o firewall principal oficial do SGCG. Nao remover, substituir ou desabilitar sem autorizacao explicita.
- `iptables`, `nftables`, `ipset`, `tc` e scripts de hardening podem complementar o UFW, mas nao substitui-lo.
- Dados de runtime e identidade coletada nao devem ser publicados no Git.
- Rotas publicas do Hotspot ficam restritas a `/api/hotspot/public/*`; modulos administrativos exigem JWT.
- O frontend de producao roda bundle estatico; qualquer alteracao em `.jsx` exige `npm run build` antes de publicar.
- O Nginx roteia `/api/dns/*` para o `backend-proxy`; nao usar `/api/proxy/dns/*`.

## Comandos de Build

```bash
cd backend && npm run build
cd backend-proxy && npm run build
cd frontend && npm run build
```

## Publicacao Operacional

Os processos de producao rodam via PM2:

```bash
pm2 restart bcc-backend
pm2 restart backend-proxy
pm2 restart backend-proxy-ingester
pm2 restart bcc-frontend
```

Use reinicio apenas quando a alteracao exigir republicacao do runtime. Builds e reinicios devem ser refletidos em `CODEX.md`.

## Dados Sensíveis

Nao versionar:

- `.env` e variantes reais de ambiente
- certificados, chaves, dumps e backups
- `data/identity/` com check-ins de endpoints
- `.codex-checkpoints/`
- artefatos gerados em `dist/`, `build/`, `frontend/dist/`, `backend/dist/` e `backend-proxy/regras/generated/`

## Continuidade

O estado mais atualizado, validacoes, decisoes de firewall, bypasses, normalizacoes de VLAN, historico do Hotspot e proximos passos ficam em `CODEX.md`.
