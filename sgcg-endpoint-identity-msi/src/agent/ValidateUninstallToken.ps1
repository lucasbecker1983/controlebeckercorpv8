param(
    [string]$UninstallToken
)

$ErrorActionPreference = "Stop"
$RegPath = "HKLM:\SOFTWARE\JMB Tecnologia\SGCG Endpoint Identity"
$InstallDir = "C:\Program Files\JMB Tecnologia\SGCG Endpoint Identity"
$LogPath = Join-Path $InstallDir "logs\uninstall.log"

function Write-UninstallLog {
    param([string]$EventType, [string]$Message)
    $dir = Split-Path -Path $LogPath -Parent
    if (-not (Test-Path $dir)) { New-Item -Path $dir -ItemType Directory -Force | Out-Null }
    Add-Content -Path $LogPath -Value ("{0} {1} {2}" -f (Get-Date).ToString("o"), $EventType, $Message) -Encoding UTF8
}

function Get-Sha256 {
    param([string]$Value)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
        return ([BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

Write-UninstallLog "agent_uninstall_requested" "Validando token administrativo"

if (-not (Test-Path $RegPath)) {
    Write-UninstallLog "agent_uninstall_denied" "Registro administrativo nao encontrado"
    throw "Desinstalacao nao autorizada. Token administrativo invalido ou ausente."
}

$storedHash = (Get-ItemProperty -Path $RegPath -Name "UninstallTokenHash" -ErrorAction Stop).UninstallTokenHash
if ([string]::IsNullOrWhiteSpace($UninstallToken) -or [string]::IsNullOrWhiteSpace($storedHash)) {
    Write-UninstallLog "agent_uninstall_denied" "Token ausente"
    throw "Desinstalacao nao autorizada. Token administrativo invalido ou ausente."
}

$providedHash = Get-Sha256 -Value $UninstallToken
if ($providedHash -ne $storedHash) {
    Write-UninstallLog "agent_uninstall_denied" "Token invalido"
    throw "Desinstalacao nao autorizada. Token administrativo invalido ou ausente."
}

Write-UninstallLog "agent_uninstall_requested" "Token administrativo validado"
