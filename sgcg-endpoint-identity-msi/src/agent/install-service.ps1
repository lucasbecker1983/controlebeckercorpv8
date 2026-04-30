param(
    [string]$InstallDir = $PSScriptRoot
)

$ErrorActionPreference = "Stop"
$ServiceName = "SGCGEndpointIdentity"
$DisplayName = "SGCG Endpoint Identity Service"
$Description = "Servico institucional do SGCG by JMB Tecnologia responsavel pela identificacao da estacao, correlacao de usuario, IP, VLAN e eventos de governanca de uso da rede."
$LogDir = Join-Path $InstallDir "logs"
$InstallLog = Join-Path $LogDir "install.log"
$WrapperExe = Join-Path $InstallDir "SGCGEndpointIdentity.exe"

function Write-InstallLog {
    param([string]$EventType, [string]$Message)
    if (-not (Test-Path $LogDir)) { New-Item -Path $LogDir -ItemType Directory -Force | Out-Null }
    Add-Content -Path $InstallLog -Value ("{0} {1} {2}" -f (Get-Date).ToString("o"), $EventType, $Message) -Encoding UTF8
}

Write-InstallLog "agent_install_started" "Instalacao do servico iniciada"

if (-not (Test-Path $WrapperExe)) {
    Write-InstallLog "agent_install_failed" "WinSW wrapper nao encontrado: $WrapperExe"
    throw "WinSW wrapper nao encontrado. Inclua SGCGEndpointIdentity.exe antes de instalar o MSI."
}

& $WrapperExe install | Out-Null
& sc.exe description $ServiceName $Description | Out-Null
& sc.exe failure $ServiceName reset= 86400 actions= restart/60000/restart/60000/""/60000 | Out-Null
& $WrapperExe start | Out-Null

Write-InstallLog "agent_installed" "Servico instalado e iniciado"
