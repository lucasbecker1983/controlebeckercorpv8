param(
    [string]$UninstallToken = ""
)

$ErrorActionPreference = "Stop"
$ServiceName = "SGCGEndpointIdentity"
$InstallDir = "C:\Program Files\JMB Tecnologia\SGCG Endpoint Identity"
$WrapperPath = Join-Path $InstallDir "SGCGEndpointIdentity.exe"
$LogDir = Join-Path $InstallDir "logs"
$UninstallLog = Join-Path $LogDir "uninstall.log"
$RegPath = "HKLM:\SOFTWARE\JMB Tecnologia\SGCG Endpoint Identity"

if ([string]::IsNullOrWhiteSpace($UninstallToken)) {
    throw "UninstallToken obrigatorio. Informe -UninstallToken ou use o desinstalador CMD interativo."
}

function Write-UninstallLog {
    param([string]$EventType, [string]$Message)
    if (-not (Test-Path $LogDir)) { New-Item -Path $LogDir -ItemType Directory -Force | Out-Null }
    Add-Content -Path $UninstallLog -Value ("{0} {1} {2}" -f (Get-Date).ToString("o"), $EventType, $Message) -Encoding UTF8
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

$storedHash = $null
if (Test-Path $RegPath) {
    $storedHash = (Get-ItemProperty -Path $RegPath -Name "UninstallTokenHash" -ErrorAction SilentlyContinue).UninstallTokenHash
}
if ([string]::IsNullOrWhiteSpace($storedHash) -or (Get-Sha256 -Value $UninstallToken) -ne $storedHash) {
    Write-UninstallLog "agent_uninstall_denied" "Token administrativo invalido ou ausente"
    throw "Desinstalacao nao autorizada. Token administrativo invalido ou ausente."
}

Write-UninstallLog "agent_uninstall_requested" "Desinstalacao autorizada"

if (Test-Path $WrapperPath) {
    & $WrapperPath stop | Out-Null
    & $WrapperPath uninstall | Out-Null
} elseif (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    & sc.exe delete $ServiceName | Out-Null
}

Remove-Item -Path $RegPath -Recurse -Force -ErrorAction SilentlyContinue
Write-UninstallLog "agent_uninstalled" "Servico removido"
Write-Host "SGCG Endpoint Identity removido."
