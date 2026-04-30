# SGCG Endpoint Identity

Instalador MSI do agente Windows institucional **SGCG Endpoint Identity**, do **SGCG by JMB Tecnologia**.

O componente cria um servico Windows transparente e auditavel para identificar estacao, usuario logado, IP, MAC, VLAN e horario, enviando check-ins ao backend do SGCG para correlacao com eventos DNS/Unbound/RPZ.

## O que o agente faz

- Le `config.json`.
- Executa em loop continuo como servico Windows.
- Coleta identidade operacional da estacao: usuario logado, display_user, hostname, IPv4 principal, MAC principal, VLAN inferida, agent_id, versao e timestamp local.
- Envia `POST` para o backend com header `X-Agent-Token`.
- Registra logs locais em `C:\Program Files\JMB Tecnologia\SGCG Endpoint Identity\logs\`.
- Continua operando sem travar se o backend estiver indisponivel.

## O que o agente nao faz

- Nao altera DNS.
- Nao altera proxy.
- Nao instala certificado.
- Nao intercepta HTTPS.
- Nao altera firewall.
- Nao captura tela.
- Nao captura teclado.
- Nao coleta arquivos pessoais.
- Nao coleta senhas.
- Nao altera navegacao dos usuarios.

## Requisitos

- .NET SDK 8 ou superior recomendado.
- WiX Toolset SDK-style via `WixToolset.Sdk/7.0.0`.
- Windows PowerShell nas estacoes cliente.
- WinSW x64 verificado, salvo como `src/agent/SGCGEndpointIdentity.exe` antes do build funcional.

Este repositorio inclui `src/agent/SGCGEndpointIdentity.exe.placeholder` apenas como orientacao. O build nao baixa WinSW automaticamente, para evitar dependencia silenciosa de binario externo durante a construcao institucional.

## Como compilar no Linux

```bash
chmod +x build.sh
./build.sh
```

Saida esperada quando todos os requisitos estiverem presentes:

```text
dist/SGCGEndpointIdentity.msi
```

Neste ambiente Linux atual, `dotnet --info` falhou com:

```text
dotnet: command not found
```

Portanto o MSI nao foi gerado localmente. Instale o .NET SDK 8+ e inclua o WinSW em `src/agent/SGCGEndpointIdentity.exe` antes de repetir o build.

## Como compilar no Windows

```powershell
.\build.ps1
```

Comando direto equivalente:

```powershell
dotnet build src\msi\SGCGEndpointIdentity.wixproj -c Release
```

O MSI final deve ser copiado para:

```text
dist\SGCGEndpointIdentity.msi
```

## Instalacao silenciosa

```cmd
msiexec /i SGCGEndpointIdentity.msi SERVERURL="http://192.168.10.1/api/identity/checkin" AGENTTOKEN="TOKEN_DO_AGENTE" UNINSTALLTOKEN="TOKEN_DE_REMOCAO" INTERVALMINUTES=5 /qn /L*v C:\Temp\sgcg-install.log
```

## Instalacao facilitada para piloto VLAN 10

No PC Windows de teste, abra como Administrador:

```text
tools\windows\INSTALAR-PILOTO-VLAN10.cmd
```

O script ja usa:

```text
SERVERURL=http://192.168.10.1/api/identity/checkin
INTERVALMINUTES=5
```

Ele pergunta apenas:

- `AGENTTOKEN`
- `UNINSTALLTOKEN`

Depois da instalacao, valide com:

```text
tools\windows\VALIDAR-PILOTO.cmd
```

Para remover, abra como Administrador:

```text
tools\windows\DESINSTALAR-COM-TOKEN.cmd
```

Para gerar o MSI no Windows com menos digitação:

```text
tools\windows\GERAR-MSI.cmd
```

## Instalador unico online EXE

Para o piloto mais simples, gere um executavel unico no Windows:

```powershell
.\build-online-exe.ps1
```

Saida:

```text
dist\SGCGEndpointIdentity-OnlineSetup.exe
```

Esse EXE empacota:

- `SGCGEndpointIdentity-OnlineSetup.cmd`
- `SGCGEndpointIdentity-OnlineSetup.ps1`

Durante a instalacao, ele baixa automaticamente o WinSW x64 de:

```text
https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe
```

Depois cria `C:\Program Files\JMB Tecnologia\SGCG Endpoint Identity\`, gera `config.json`, instala o servico `SGCGEndpointIdentity` e inicia o agente.

Valores esperados pelo instalador online:

```text
SERVERURL=http://192.168.10.1/api/identity/checkin
AGENTTOKEN=<token fornecido pelo administrador>
UNINSTALLTOKEN=<token de remocao fornecido pelo administrador>
INTERVALMINUTES=5
```

O instalador CMD solicita os tokens de forma interativa. O script PowerShell tambem aceita `-AgentToken` e `-UninstallToken` para automacao controlada.

Para remover quando instalado pelo instalador online:

```text
SGCGEndpointIdentity-OnlineUninstall.cmd
```

Ou diretamente:

```powershell
.\SGCGEndpointIdentity-OnlineUninstall.ps1
```

## Instalador online MSI

Tambem existe um projeto MSI que empacota o instalador online:

```powershell
.\build-online-msi.ps1
```

Saida:

```text
dist\SGCGEndpointIdentity-OnlineSetup.msi
```

Esse caminho exige .NET SDK 8+ e WiX Toolset via `WixToolset.Sdk/7.0.0`.

O instalador gera:

```text
C:\Program Files\JMB Tecnologia\SGCG Endpoint Identity\config.json
```

As propriedades publicas aceitas sao:

- `SERVERURL`
- `AGENTTOKEN`
- `UNINSTALLTOKEN`
- `INTERVALMINUTES`

O token de remocao nao e salvo em texto puro. O instalador grava apenas SHA-256 em:

```text
HKLM\SOFTWARE\JMB Tecnologia\SGCG Endpoint Identity\UninstallTokenHash
```

## Desinstalacao com token

```cmd
msiexec /x SGCGEndpointIdentity.msi UNINSTALLTOKEN="TOKEN_DE_REMOCAO" /qn /L*v C:\Temp\sgcg-uninstall.log
```

Tentativas sem token ou com token invalido devem falhar com:

```text
Desinstalacao nao autorizada. Token administrativo invalido ou ausente.
```

Essa protecao e administrativa, nao absoluta. Colaboradores nao devem possuir privilegio de administrador local nas estacoes. Se o usuario for administrador local, nenhuma protecao de agente e absoluta.

## Validar o servico

```cmd
sc query SGCGEndpointIdentity
```

Nome interno:

```text
SGCGEndpointIdentity
```

Nome de exibicao:

```text
SGCG Endpoint Identity Service
```

Conta:

```text
LocalSystem
```

## Validar logs

```cmd
type "C:\Program Files\JMB Tecnologia\SGCG Endpoint Identity\logs\endpoint-identity.log"
```

Logs auxiliares:

```text
C:\Program Files\JMB Tecnologia\SGCG Endpoint Identity\logs\install.log
C:\Program Files\JMB Tecnologia\SGCG Endpoint Identity\logs\uninstall.log
```

## Validar check-in no backend

No SGCG, confirmar:

- dispositivo online;
- hostname correto;
- IP correto;
- MAC correto;
- VLAN correta;
- usuario logado correto;
- ultimo check-in atualizado;
- evento DNS enriquecido com identidade.

Payload esperado:

```json
{
  "agent_id": "PC-FINANCEIRO-01-A4B1C2D3E4F5",
  "user": "PC-FINANCEIRO-01\\maria",
  "display_user": "maria",
  "computer": "PC-FINANCEIRO-01",
  "ip": "192.168.10.45",
  "mac": "A4-B1-C2-D3-E4-F5",
  "vlan": "10",
  "logged": true,
  "source": "sgcg-endpoint-identity-service",
  "agent_version": "0.1.0",
  "checked_at": "2026-04-29T10:35:00-03:00"
}
```

## Teste na VLAN 10

Instale primeiro em uma maquina da VLAN 10:

```cmd
msiexec /i SGCGEndpointIdentity.msi SERVERURL="http://192.168.10.1/api/identity/checkin" AGENTTOKEN="TOKEN_FORTE_AQUI" UNINSTALLTOKEN="TOKEN_REMOCAO_AQUI" INTERVALMINUTES=5 /qn /L*v C:\Temp\sgcg-endpoint-identity-install.log
```

A deteccao de VLAN segue:

- `192.168.10.*` -> `10`
- `192.168.30.*` -> `30`
- `192.168.40.*` -> `40`
- `192.168.50.*` -> `50`
- `192.168.70.*` -> `70`
- `192.168.80.*` -> `80`
- `192.168.99.*` -> `99`
- outros -> `unknown`

## Permissoes

O script `ConfigureAgent.ps1` aplica permissao na pasta de instalacao:

- `SYSTEM`: Full Control
- `Administrators`: Full Control
- `Users`: Read & Execute

O `config.json` fica restrito a `SYSTEM` e `Administrators`.

## Eventos de auditoria

Os scripts registram, sempre que possivel:

- `agent_install_started`
- `agent_installed`
- `agent_uninstall_requested`
- `agent_uninstall_denied`
- `agent_uninstalled`
- `agent_service_started`
- `agent_service_stopped`
- `agent_config_changed`
- `agent_checkin_success`
- `agent_checkin_failed`

## Politica de privacidade operacional

O agente coleta apenas identidade operacional necessaria para governanca de uso da rede. Ele nao coleta conteudo pessoal, nao captura credenciais, nao monitora digitacao e nao inspeciona trafego HTTPS.
