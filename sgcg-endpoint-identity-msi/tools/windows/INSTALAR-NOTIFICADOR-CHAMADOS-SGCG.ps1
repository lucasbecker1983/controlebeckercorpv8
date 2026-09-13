param(
    [string]$Token = "",
    [string]$ApiUrl = "https://console.interno.jacarezinho/api/support/agent/notifications",
    [string]$OpenBaseUrl = "https://console.interno.jacarezinho/chamados",
    [int]$PollSeconds = 8,
    [string]$InstallDir = "$env:ProgramData\SGCG\SupportNotifier"
)

$ErrorActionPreference = "Stop"
$TaskName = "SGCG Chamados - Notificador"
$AgentFileName = "sgcg-support-notifier.ps1"
$ConfigFileName = "support-notifier.config.json"
$SourceAgent = Join-Path $PSScriptRoot $AgentFileName
$TargetAgent = Join-Path $InstallDir $AgentFileName
$TargetConfig = Join-Path $InstallDir $ConfigFileName
$TargetState = Join-Path $InstallDir "state.json"
$TargetLog = Join-Path $InstallDir "logs\support-notifier.log"

function Assert-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Execute este instalador em um PowerShell como Administrador."
    }
}

function Read-Token {
    param([string]$Value)
    if (-not [string]::IsNullOrWhiteSpace($Value)) { return $Value }
    $secure = Read-Host "Informe o token X-Agent-Token do SGCG" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

Assert-Admin

if (-not (Test-Path $SourceAgent)) {
    throw "Agente nao encontrado: $SourceAgent"
}

$Token = Read-Token -Value $Token
if ([string]::IsNullOrWhiteSpace($Token)) {
    throw "Token obrigatorio."
}
if ($PollSeconds -lt 5) { $PollSeconds = 5 }

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*sgcg-support-notifier.ps1*" } |
    ForEach-Object {
        try {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
        } catch {
            Write-Host ("Aviso: nao foi possivel encerrar processo antigo PID {0}: {1}" -f $_.ProcessId, $_.Exception.Message) -ForegroundColor Yellow
        }
    }

New-Item -Path $InstallDir -ItemType Directory -Force | Out-Null
Copy-Item -Path $SourceAgent -Destination $TargetAgent -Force

$config = [ordered]@{
    api_url = $ApiUrl
    open_base_url = $OpenBaseUrl
    token = $Token
    poll_seconds = $PollSeconds
}
$config | ConvertTo-Json -Depth 5 | Set-Content -Path $TargetConfig -Encoding UTF8
if (Test-Path $TargetState) {
    Remove-Item -Path $TargetState -Force
}
if (Test-Path $TargetLog) {
    Remove-Item -Path $TargetLog -Force
}

$acl = Get-Acl $InstallDir
$acl.SetAccessRuleProtection($true, $false)
$adminsSid = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")
$systemSid = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")
$currentUserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$admins = New-Object System.Security.AccessControl.FileSystemAccessRule($adminsSid, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
$system = New-Object System.Security.AccessControl.FileSystemAccessRule($systemSid, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
$currentUserRule = New-Object System.Security.AccessControl.FileSystemAccessRule($currentUserSid, "Modify", "ContainerInherit,ObjectInherit", "None", "Allow")
$acl.SetAccessRule($admins)
$acl.SetAccessRule($system)
$acl.SetAccessRule($currentUserRule)
Set-Acl -Path $InstallDir -AclObject $acl

$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$TargetAgent`" -ConfigPath `"$TargetConfig`""
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 365) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Notificador de novos chamados do SGCG para administradores." | Out-Null
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2
$taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -eq $taskInfo -or $taskInfo.LastTaskResult -ne 0) {
    Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $TargetAgent, "-ConfigPath", $TargetConfig) -WindowStyle Hidden | Out-Null
}

Write-Host "Notificador de chamados instalado." -ForegroundColor Green
Write-Host "Tarefa: $TaskName"
Write-Host "Diretorio: $InstallDir"
Write-Host "Logs: $InstallDir\logs"
