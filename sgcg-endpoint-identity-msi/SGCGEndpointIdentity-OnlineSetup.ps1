param(
    [string]$ServerUrl = "http://192.168.10.1/api/identity/checkin",
    [string]$AgentToken = "",
    [string]$UninstallToken = "",
    [int]$IntervalMinutes = 5,
    [string]$WinSwUrl = "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe"
)

$ErrorActionPreference = "Stop"
$ServiceName = "SGCGEndpointIdentity"
$InstallDir = "C:\Program Files\JMB Tecnologia\SGCG Endpoint Identity"
$LogDir = Join-Path $InstallDir "logs"
$InstallLog = Join-Path $LogDir "install.log"
$WrapperPath = Join-Path $InstallDir "SGCGEndpointIdentity.exe"
$WrapperXml = Join-Path $InstallDir "SGCGEndpointIdentity.xml"
$AgentPath = Join-Path $InstallDir "sgcg-endpoint-identity.ps1"
$ConfigPath = Join-Path $InstallDir "config.json"
$RegPath = "HKLM:\SOFTWARE\JMB Tecnologia\SGCG Endpoint Identity"

function Write-SetupLog {
    param([string]$EventType, [string]$Message)
    if (-not (Test-Path $LogDir)) { New-Item -Path $LogDir -ItemType Directory -Force | Out-Null }
    Add-Content -Path $InstallLog -Value ("{0} {1} {2}" -f (Get-Date).ToString("o"), $EventType, $Message) -Encoding UTF8
}

function Invoke-LoggedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string]$Arguments = "",
        [string]$WorkingDirectory = $InstallDir,
        [string]$EventType = "process"
    )

    Write-SetupLog $EventType ("Executando: {0} {1}" -f $FilePath, $Arguments)
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.Arguments = $Arguments
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true

    $process = [System.Diagnostics.Process]::Start($psi)
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    if (-not [string]::IsNullOrWhiteSpace($stdout)) {
        Write-SetupLog "$EventType.stdout" ($stdout.Trim())
    }
    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
        Write-SetupLog "$EventType.stderr" ($stderr.Trim())
    }
    Write-SetupLog "$EventType.exit" ("ExitCode={0}" -f $process.ExitCode)

    if ($process.ExitCode -ne 0) {
        throw "Falha ao executar $FilePath $Arguments. ExitCode=$($process.ExitCode). Veja $InstallLog"
    }
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

function Assert-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Execute como Administrador."
    }
}

Assert-Admin

if ([string]::IsNullOrWhiteSpace($AgentToken)) {
    throw "AgentToken obrigatorio. Informe -AgentToken ou use o instalador CMD interativo."
}
if ([string]::IsNullOrWhiteSpace($UninstallToken)) {
    throw "UninstallToken obrigatorio. Informe -UninstallToken ou use o instalador CMD interativo."
}

New-Item -Path $InstallDir -ItemType Directory -Force | Out-Null
New-Item -Path $LogDir -ItemType Directory -Force | Out-Null
Write-SetupLog "agent_install_started" "Instalacao online iniciada"

try {
    Invoke-LoggedProcess -FilePath "takeown.exe" -Arguments "/F `"$InstallDir`" /R /D S" -EventType "acl_takeown_install_dir"
} catch {
    Write-SetupLog "acl_takeown_install_dir_warn" $_.Exception.Message
}
try {
    Invoke-LoggedProcess -FilePath "icacls.exe" -Arguments "`"$InstallDir`" /grant:r `"*S-1-5-18:(OI)(CI)F`" `"*S-1-5-32-544:(OI)(CI)F`" /T /C" -EventType "acl_pre_grant_install_dir"
} catch {
    Write-SetupLog "acl_pre_grant_install_dir_warn" $_.Exception.Message
}

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Write-SetupLog "agent_service_stopped" "Servico existente sera parado"
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Write-SetupLog "dependency_download_started" "Baixando WinSW de $WinSwUrl"
Invoke-WebRequest -Uri $WinSwUrl -OutFile $WrapperPath -UseBasicParsing
if (-not (Test-Path $WrapperPath)) {
    throw "Falha ao baixar WinSW."
}
$wrapperSize = (Get-Item $WrapperPath).Length
Write-SetupLog "dependency_downloaded" "WinSW salvo em $WrapperPath bytes=$wrapperSize"
if ($wrapperSize -lt 1000000) {
    throw "WinSW baixado parece invalido ou incompleto. Tamanho=$wrapperSize bytes."
}

$agentContent = @'
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot "config.json"),
    [switch]$Once
)

$ErrorActionPreference = "Stop"
$Source = "sgcg-endpoint-identity-service"
$LogDir = Join-Path $PSScriptRoot "logs"
$LogPath = Join-Path $LogDir "endpoint-identity.log"

function Initialize-Log {
    if (-not (Test-Path $LogDir)) {
        New-Item -Path $LogDir -ItemType Directory -Force | Out-Null
    }
}

function Write-AgentLog {
    param([string]$Level, [string]$EventType, [string]$Message)
    Initialize-Log
    Add-Content -Path $LogPath -Value ("{0} [{1}] {2} {3}" -f (Get-Date).ToString("o"), $Level.ToUpperInvariant(), $EventType, $Message) -Encoding UTF8
}

function Read-AgentConfig {
    Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-PrimaryAdapter {
    $configs = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled = TRUE" |
        Where-Object { $_.IPAddress -and $_.MACAddress }
    foreach ($cfg in $configs) {
        $ipv4 = $cfg.IPAddress | Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' -and $_ -notmatch '^127\.' -and $_ -notmatch '^169\.254\.' } | Select-Object -First 1
        if ($ipv4) {
            return [pscustomobject]@{ IP = $ipv4; MAC = ($cfg.MACAddress -replace ':', '-').ToUpperInvariant() }
        }
    }
    [pscustomobject]@{ IP = $null; MAC = $null }
}

function Get-VlanFromIp {
    param([string]$Ip)
    switch -Regex ($Ip) {
        '^192\.168\.10\.' { return "10" }
        '^192\.168\.30\.' { return "30" }
        '^192\.168\.40\.' { return "40" }
        '^192\.168\.50\.' { return "50" }
        '^192\.168\.70\.' { return "70" }
        '^192\.168\.80\.' { return "80" }
        '^192\.168\.99\.' { return "99" }
        default { return "unknown" }
    }
}

function Get-LoggedOnUser {
    $computer = $env:COMPUTERNAME
    try {
        $sessionUser = (Get-CimInstance Win32_ComputerSystem).UserName
        if (-not [string]::IsNullOrWhiteSpace($sessionUser)) {
            return [pscustomobject]@{ User = $sessionUser; DisplayUser = ($sessionUser -split '\\')[-1]; Logged = $true }
        }
    } catch {
        Write-AgentLog "warn" "agent_user_detect_failed" $_.Exception.Message
    }
    [pscustomobject]@{ User = "$computer\no-user"; DisplayUser = "no-user"; Logged = $false }
}

function Send-CheckIn {
    param($Config)
    $adapter = Get-PrimaryAdapter
    $userInfo = Get-LoggedOnUser
    $computer = $env:COMPUTERNAME
    $macForId = if ($adapter.MAC) { $adapter.MAC -replace '-', '' } else { "UNKNOWN" }
    $payload = [ordered]@{
        agent_id = "$computer-$macForId"
        user = $userInfo.User
        display_user = $userInfo.DisplayUser
        computer = $computer
        ip = $adapter.IP
        mac = $adapter.MAC
        vlan = Get-VlanFromIp -Ip $adapter.IP
        logged = [bool]$userInfo.Logged
        source = $Source
        agent_version = $Config.agent_version
        checked_at = (Get-Date).ToString("o")
    }
    Invoke-RestMethod -Uri $Config.server_url -Method Post -Headers @{ "X-Agent-Token" = [string]$Config.token } -Body ($payload | ConvertTo-Json -Depth 6 -Compress) -ContentType "application/json" -TimeoutSec 15 | Out-Null
    Write-AgentLog "info" "agent_checkin_success" ("computer={0} ip={1} vlan={2} user={3}" -f $payload.computer, $payload.ip, $payload.vlan, $payload.user)
}

Initialize-Log
Write-AgentLog "info" "agent_service_started" "SGCG Endpoint Identity iniciado"
while ($true) {
    try {
        $config = Read-AgentConfig
        Send-CheckIn -Config $config
        $interval = [int]$config.interval_seconds
        if ($interval -lt 60) { $interval = 60 }
    } catch {
        Write-AgentLog "error" "agent_checkin_failed" $_.Exception.Message
        $interval = 300
    }
    if ($Once) { break }
    Start-Sleep -Seconds $interval
}
Write-AgentLog "info" "agent_service_stopped" "SGCG Endpoint Identity finalizado"
'@

Set-Content -Path $AgentPath -Value $agentContent -Encoding UTF8

foreach ($file in @($ConfigPath, $WrapperXml)) {
    if (Test-Path $file) {
        try {
            Invoke-LoggedProcess -FilePath "takeown.exe" -Arguments "/F `"$file`"" -EventType "acl_takeown_file"
            Invoke-LoggedProcess -FilePath "icacls.exe" -Arguments "`"$file`" /grant:r `"*S-1-5-18:F`" `"*S-1-5-32-544:F`"" -EventType "acl_pre_grant_file"
            Remove-Item -Path $file -Force
            Write-SetupLog "old_file_removed" $file
        } catch {
            Write-SetupLog "old_file_remove_failed" ("{0} {1}" -f $file, $_.Exception.Message)
            throw
        }
    }
}

$config = [ordered]@{
    server_url = $ServerUrl
    token = $AgentToken
    interval_seconds = $IntervalMinutes * 60
    agent_version = "0.1.0"
    vendor = "JMB Tecnologia"
    product = "SGCG Endpoint Identity"
    site = "Prefeitura de Jacarezinho"
    log_level = "info"
}
$config | ConvertTo-Json -Depth 6 | Set-Content -Path $ConfigPath -Encoding UTF8

$xmlContent = @"
<service>
  <id>SGCGEndpointIdentity</id>
  <name>SGCG Endpoint Identity Service</name>
  <description>Servico institucional do SGCG by JMB Tecnologia responsavel pela identificacao da estacao, correlacao de usuario, IP, VLAN e eventos de governanca de uso da rede.</description>
  <executable>powershell.exe</executable>
  <arguments>-NoProfile -ExecutionPolicy Bypass -File "%BASE%\sgcg-endpoint-identity.ps1"</arguments>
  <log mode="roll-by-size">
    <sizeThreshold>10485760</sizeThreshold>
    <keepFiles>5</keepFiles>
  </log>
  <onfailure action="restart" delay="60 sec" />
  <startmode>Automatic</startmode>
</service>
"@
Set-Content -Path $WrapperXml -Value $xmlContent -Encoding UTF8

if (-not (Test-Path $RegPath)) {
    New-Item -Path $RegPath -Force | Out-Null
}
New-ItemProperty -Path $RegPath -Name "UninstallTokenHash" -Value (Get-Sha256 -Value $UninstallToken) -PropertyType String -Force | Out-Null
New-ItemProperty -Path $RegPath -Name "InstallDir" -Value $InstallDir -PropertyType String -Force | Out-Null
New-ItemProperty -Path $RegPath -Name "InstallMode" -Value "OnlineSetup" -PropertyType String -Force | Out-Null

Invoke-LoggedProcess -FilePath "icacls.exe" -Arguments "`"$InstallDir`" /inheritance:r" -EventType "acl_install_dir_inheritance"
Invoke-LoggedProcess -FilePath "icacls.exe" -Arguments "`"$InstallDir`" /grant:r `"*S-1-5-18:(OI)(CI)F`" `"*S-1-5-32-544:(OI)(CI)F`" `"*S-1-5-32-545:(OI)(CI)RX`"" -EventType "acl_install_dir_grant"
Invoke-LoggedProcess -FilePath "icacls.exe" -Arguments "`"$ConfigPath`" /inheritance:r" -EventType "acl_config_inheritance"
Invoke-LoggedProcess -FilePath "icacls.exe" -Arguments "`"$ConfigPath`" /grant:r `"*S-1-5-18:F`" `"*S-1-5-32-544:F`"" -EventType "acl_config_grant"

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Invoke-LoggedProcess -FilePath $WrapperPath -Arguments "uninstall" -EventType "winsw_uninstall_existing"
}

Invoke-LoggedProcess -FilePath $WrapperPath -Arguments "install" -EventType "winsw_install"
Invoke-LoggedProcess -FilePath "sc.exe" -Arguments "description $ServiceName `"Servico institucional do SGCG by JMB Tecnologia responsavel pela identificacao da estacao, correlacao de usuario, IP, VLAN e eventos de governanca de uso da rede.`"" -EventType "service_description"
Invoke-LoggedProcess -FilePath "sc.exe" -Arguments "failure $ServiceName reset= 86400 actions= restart/60000/restart/60000/`"`"/60000" -EventType "service_failure"
Invoke-LoggedProcess -FilePath $WrapperPath -Arguments "start" -EventType "winsw_start"

if (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) {
    throw "Servico $ServiceName nao foi encontrado apos instalacao."
}

Write-SetupLog "agent_installed" "Servico instalado e iniciado"
Write-Host "SGCG Endpoint Identity instalado."
Write-Host "Servico: $ServiceName"
Write-Host "Log: $LogDir\endpoint-identity.log"
