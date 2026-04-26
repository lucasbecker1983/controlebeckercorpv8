# SGCG

Sistema de Governanca e Controle Governamental.

## Escopo

O repositório consolida a operacao institucional do SGCG em dois eixos:

- `Governanca`: politica, excecao, conformidade, auditoria e responsabilizacao
- `Controle`: rede, DNS, proxy, servicos, telemetria e execucao tecnica

## Estrutura principal

- `frontend/`: interface institucional React/Vite
- `backend/`: core operacional e runtime proxy
- `backend-proxy/`: API institucional de proxy, DNS, politicas, auditoria e governanca de dados
- `CODEX.md`: registro obrigatorio de continuidade e estado consolidado do sistema

## Estado atual resumido

- `Centro de Governança` e a pagina padrao de entrada apos login
- `Políticas Institucionais` foi endurecido para nao mascarar falhas como listas vazias
- `Governança de Dados` opera como modulo proprio, com metricas dedicadas e leitura direta das fontes de evento
- `DNS Institucional`, `LGPD`, `Aprovações & Exceções` e trilhas institucionais estao integrados ao fluxo GovTech atual

## Regras operacionais

- toda rodada com `build` exige atualizacao do `CODEX.md`
- toda alteracao estrutural deve deixar o estado atual documentado
- alteracoes operacionais paralelas nao devem ser revertidas sem confirmacao explicita

## Validacao recente

- `frontend`: `npm run build`
- `backend-proxy`: `npm run build`
- processos reiniciados em `PM2` quando necessario para aplicar rotas e bundles atualizados

## Referencia obrigatoria

Leia `CODEX.md` antes de continuar qualquer nova rodada de manutencao, refatoracao ou endurecimento institucional.
