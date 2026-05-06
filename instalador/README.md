# Superinstalador SGCG JMB TECNOLOGIA

Instalador declarativo e reexecutavel do `SGCG` para `Ubuntu Server 24.04+` ou distribuicoes compativeis com a base Ubuntu, mantido integralmente dentro da pasta `instalador/`.

O objetivo desta pasta e permitir provisionar o SGCG em cenarios diferentes sem depender de scripts antigos espalhados pelo projeto. O instalador parte da stack real do sistema:

- `Node.js`
- `npm`
- `TypeScript`
- `React`
- `Vite`
- `Tailwind CSS`
- `Python 3`
- `PostgreSQL`
- `Nginx`
- `Unbound`
- `Squid`
- `UFW`
- `PM2`

## Componentes

- `bootstrap.sh`: prepara o host, instala dependencias do sistema e cria a `venv` do instalador.
- `sgcg-installer.py`: ponto de entrada do wizard, plano de execucao e aplicacao de artefatos.
- `MANUAL.md`: manual completo de implantacao, parametrizacao, validacao e operacao.
- `core/`: motor do instalador, deteccao de ambiente, perfis, renderizacao e provisionamento.
- `profiles/`: perfis declarativos de exemplo para ambientes simples, gateway e full appliance.
- `templates/`: modelos de `nginx`, `netplan`, `env`, `systemd`, `ufw` e `pm2`.
- `docs/`: fluxo operacional e decisoes de arquitetura.

## Fluxo recomendado

1. Executar `bootstrap.sh` no servidor-alvo.
2. Rodar `python3 sgcg-installer.py wizard`.
3. Revisar o arquivo gerado em `/etc/sgcg/installer/sgcg-config.yaml`.
4. Gerar o plano com `python3 sgcg-installer.py plan`.
5. Aplicar com `python3 sgcg-installer.py apply`.
6. Validar `nginx`, `postgresql`, `pm2`, `unbound`, `ufw` e o dominio configurado.

## Modos do instalador

- `wizard`: coleta interativa de dados do cliente e gera a configuracao declarativa.
- `plan`: mostra o que sera instalado e quais artefatos serao gerados.
- `apply`: escreve artefatos, scripts auxiliares e relatorio de implantacao.
- `detect`: imprime o inventario do servidor para diagnostico rapido.

## Observacoes

- O instalador foi desenhado para ser `idempotente`, `versionavel` e `auditavel`.
- A configuracao fica separada do codigo.
- Templates e perfis podem ser estendidos sem alterar o wizard principal.
- O firewall oficial continua sendo o `UFW`; qualquer complemento runtime deve continuar paralelo a ele.
