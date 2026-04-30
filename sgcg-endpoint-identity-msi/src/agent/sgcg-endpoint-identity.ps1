param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot "config.json"),
    [switch]$Once
)

$ErrorActionPreference = "Stop"
$ServiceName = "SGCGEndpointIdentity"
$Source = "sgcg-endpoint-identity-service"
$LogDir = Join-Path $PSScriptRoot "logs"
$LogPath = Join-Path $LogDir "endpoint-identity.log"

function Initialize-Log {
    if (-not (Test-Path $LogDir)) {
        New-Item -Path $LogDir -ItemType Directory -Force | Out-Null
    }
}

function Write-AgentLog {
    param(
        [string]$Level,
        [string]$EventType,
        [string]$Message
    )
    Initialize-Log
    $line = "{0} [{1}] {2} {3}" -f (Get-Date).ToString("o"), $Level.ToUpperInvariant(), $EventType, $Message
    Add-Content -Path $LogPath -Value $line -Encoding UTF8
}

function Read-AgentConfig {
    if (-not (Test-Path $ConfigPath)) {
        throw "Arquivo de configuracao nao encontrado: $ConfigPath"
    }
    return Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-PrimaryAdapter {
    $configs = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled = TRUE" |
        Where-Object {
            $_.IPAddress -and
            ($_.IPAddress | Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' }) -and
            $_.MACAddress
        }

    foreach ($cfg in $configs) {
        $ipv4 = $cfg.IPAddress | Where-Object {
            $_ -match '^\d{1,3}(\.\d{1,3}){3}$' -and
            $_ -notmatch '^127\.' -and
            $_ -notmatch '^169\.254\.'
        } | Select-Object -First 1
        if ($ipv4) {
            return [pscustomobject]@{
                IP = $ipv4
                MAC = ($cfg.MACAddress -replace ':', '-').ToUpperInvariant()
            }
        }
    }

    return [pscustomobject]@{ IP = $null; MAC = $null }
}

function Get-VlanFromIp {
    param([string]$Ip)
    if ([string]::IsNullOrWhiteSpace($Ip)) { return "unknown" }
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
            $display = ($sessionUser -split '\\')[-1]
            return [pscustomobject]@{
                User = $sessionUser
                DisplayUser = $display
                Logged = $true
            }
        }
    } catch {
        Write-AgentLog "warn" "agent_user_detect_failed" $_.Exception.Message
    }

    return [pscustomobject]@{
        User = "$computer\no-user"
        DisplayUser = "no-user"
        Logged = $false
    }
}

function New-AgentPayload {
    param($Config)
    $adapter = Get-PrimaryAdapter
    $userInfo = Get-LoggedOnUser
    $computer = $env:COMPUTERNAME
    $macForId = if ($adapter.MAC) { $adapter.MAC -replace '-', '' } else { "UNKNOWN" }

    return [ordered]@{
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
}

function Send-CheckIn {
    param($Config)

    if ([string]::IsNullOrWhiteSpace($Config.server_url) -or $Config.server_url -eq "__SERVERURL__") {
        throw "server_url nao configurado"
    }
    if ([string]::IsNullOrWhiteSpace($Config.token) -or $Config.token -eq "__AGENTTOKEN__") {
        throw "token do agente nao configurado"
    }

    $payload = New-AgentPayload -Config $Config
    $json = $payload | ConvertTo-Json -Depth 6 -Compress
    $headers = @{ "X-Agent-Token" = [string]$Config.token }

    Invoke-RestMethod -Uri $Config.server_url -Method Post -Headers $headers -Body $json -ContentType "application/json" -TimeoutSec 15 | Out-Null
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
