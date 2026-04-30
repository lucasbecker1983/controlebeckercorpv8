param(
    [Parameter(Mandatory = $true)][string]$InstallDir,
    [Parameter(Mandatory = $true)][string]$ServerUrl,
    [Parameter(Mandatory = $true)][string]$AgentToken,
    [Parameter(Mandatory = $true)][string]$UninstallToken,
    [int]$IntervalMinutes = 5
)

$ErrorActionPreference = "Stop"
$LogDir = Join-Path $InstallDir "logs"
$InstallLog = Join-Path $LogDir "install.log"
$ConfigTemplate = Join-Path $InstallDir "config.template.json"
$ConfigPath = Join-Path $InstallDir "config.json"
$RegPath = "HKLM:\SOFTWARE\JMB Tecnologia\SGCG Endpoint Identity"

function Write-InstallLog {
    param([string]$EventType, [string]$Message)
    if (-not (Test-Path $LogDir)) { New-Item -Path $LogDir -ItemType Directory -Force | Out-Null }
    Add-Content -Path $InstallLog -Value ("{0} {1} {2}" -f (Get-Date).ToString("o"), $EventType, $Message) -Encoding UTF8
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

if ([string]::IsNullOrWhiteSpace($ServerUrl) -or $ServerUrl -eq "__SERVERURL__") {
    throw "SERVERURL e obrigatorio."
}
if ([string]::IsNullOrWhiteSpace($AgentToken) -or $AgentToken -eq "__AGENTTOKEN__") {
    throw "AGENTTOKEN e obrigatorio."
}
if ([string]::IsNullOrWhiteSpace($UninstallToken)) {
    throw "UNINSTALLTOKEN e obrigatorio."
}
if ($IntervalMinutes -lt 1) {
    $IntervalMinutes = 5
}

Write-InstallLog "agent_config_changed" "Gerando config.json e hash administrativo"

$config = Get-Content -Path $ConfigTemplate -Raw -Encoding UTF8 | ConvertFrom-Json
$config.server_url = $ServerUrl
$config.token = $AgentToken
$config.interval_seconds = $IntervalMinutes * 60
$config | ConvertTo-Json -Depth 6 | Set-Content -Path $ConfigPath -Encoding UTF8

if (-not (Test-Path $RegPath)) {
    New-Item -Path $RegPath -Force | Out-Null
}
New-ItemProperty -Path $RegPath -Name "UninstallTokenHash" -Value (Get-Sha256 -Value $UninstallToken) -PropertyType String -Force | Out-Null
New-ItemProperty -Path $RegPath -Name "InstallDir" -Value $InstallDir -PropertyType String -Force | Out-Null
New-ItemProperty -Path $RegPath -Name "Product" -Value "SGCG Endpoint Identity" -PropertyType String -Force | Out-Null

& icacls.exe $InstallDir /inheritance:r | Out-Null
& icacls.exe $InstallDir /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-32-545:(OI)(CI)RX" | Out-Null
& icacls.exe $ConfigPath /inheritance:r | Out-Null
& icacls.exe $ConfigPath /grant:r "*S-1-5-18:F" "*S-1-5-32-544:F" | Out-Null

Write-InstallLog "agent_config_changed" "Configuracao aplicada"
