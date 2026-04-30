param(
    [string]$InstallDir = $PSScriptRoot
)

$ErrorActionPreference = "Stop"
$ServiceName = "SGCGEndpointIdentity"
$LogDir = Join-Path $InstallDir "logs"
$UninstallLog = Join-Path $LogDir "uninstall.log"
$WrapperExe = Join-Path $InstallDir "SGCGEndpointIdentity.exe"

function Write-UninstallLog {
    param([string]$EventType, [string]$Message)
    if (-not (Test-Path $LogDir)) { New-Item -Path $LogDir -ItemType Directory -Force | Out-Null }
    Add-Content -Path $UninstallLog -Value ("{0} {1} {2}" -f (Get-Date).ToString("o"), $EventType, $Message) -Encoding UTF8
}

Write-UninstallLog "agent_uninstall_requested" "Remocao do servico solicitada"

if (Test-Path $WrapperExe) {
    & $WrapperExe stop | Out-Null
    & $WrapperExe uninstall | Out-Null
} elseif (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    & sc.exe delete $ServiceName | Out-Null
}

Write-UninstallLog "agent_uninstalled" "Servico removido"
