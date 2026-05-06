# Arquitetura do Superinstalador SGCG

## Objetivo

Fornecer um instalador robusto, reexecutavel e orientado a perfis para provisionar o SGCG em servidores `Ubuntu Server 24.04+`.

## Principios

- `JMB TECNOLOGIA` como identidade do instalador.
- configuracao declarativa em `YAML`.
- wizard de coleta desacoplado do engine de provisionamento.
- `UFW` como firewall oficial.
- suporte nativo a `Node.js`, `TypeScript`, `React`, `Vite`, `Tailwind`, `Python`, `PostgreSQL`, `Nginx`, `Unbound`, `Squid` e `PM2`.
- possibilidade de reexecucao sem depender de scripts historicos do projeto.

## Fluxo operacional

1. `bootstrap.sh`
2. `wizard`
3. `plan`
4. `apply`
5. validacoes de runtime

## Entregas desta primeira versao

- estrutura oficial `instalador/`
- bootstrap com dependencias de sistema
- engine em Python
- perfis de exemplo
- templates de `nginx`, `netplan`, `env`, `pm2`, `ufw` e `unbound`
- script de inicializacao de `PostgreSQL`
- script de deploy base do SGCG
- validacao local de binarios e servicos
- relatorio de instalacao

## Evolucoes recomendadas

- modo `rollback`
- importacao/exportacao de perfis por cliente
- assistente TUI mais rico com `dialog` e selecao multipla de modulos
- assistente web local de primeira inicializacao
- validadores ativos para `postgresql`, `nginx`, `unbound`, `pm2` e `certificados`
