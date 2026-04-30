# SGCG Endpoint Identity Agent

Agente PowerShell institucional do SGCG by JMB Tecnologia. Ele coleta somente identidade operacional da estacao e envia check-ins periodicos ao backend.

## Coleta operacional

- usuario logado;
- hostname;
- IPv4 principal;
- MAC principal;
- VLAN inferida pelo IP;
- versao do agente;
- timestamp local.

## Limites de privacidade e seguranca

O agente nao altera DNS, proxy, firewall ou certificados. Nao intercepta HTTPS, nao captura tela, nao captura teclado, nao coleta senhas e nao le arquivos pessoais.

## Execucao manual para teste

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\sgcg-endpoint-identity.ps1 -Once
```

Em producao, o script deve ser executado pelo servico Windows `SGCGEndpointIdentity`, preferencialmente via WinSW.
