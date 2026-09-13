const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const windowsDir = path.join(projectRoot, 'sgcg-endpoint-identity-msi', 'tools', 'windows');
const generatedDir = path.join(windowsDir, 'generated');
const agentPath = path.join(windowsDir, 'sgcg-support-notifier.ps1');
const uninstallPath = path.join(windowsDir, 'DESINSTALAR-NOTIFICADOR-CHAMADOS-SGCG.ps1');
const tokenHashPath = path.join(projectRoot, 'data', 'support', 'notifier-token.sha256');

const token = crypto.randomBytes(32).toString('base64url');
const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
const agentBase64 = Buffer.from(fs.readFileSync(agentPath, 'utf8'), 'utf8').toString('base64');
const uninstallScript = fs.readFileSync(uninstallPath, 'utf8');

const installer = String.raw`param(
    [string]$ApiUrl = "https://console.interno.jacarezinho/api/support/agent/notifications",
    [string]$OpenBaseUrl = "https://console.interno.jacarezinho/chamados",
    [int]$PollSeconds = 8,
    [string]$InstallDir = "$env:ProgramData\SGCG\SupportNotifier"
)

$ErrorActionPreference = "Stop"
$TaskName = "SGCG Chamados - Notificador"
$AppId = "Microsoft.Windows.PowerShell"
$StartMenuShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\SGCG Chamados.lnk"
$StartupShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\SGCG Chamados Notificador.lnk"
$AgentFileName = "sgcg-support-notifier.ps1"
$ConfigFileName = "support-notifier.config.json"
$TargetAgent = Join-Path $InstallDir $AgentFileName
$TargetConfig = Join-Path $InstallDir $ConfigFileName
$TargetState = Join-Path $InstallDir "state.json"
$TargetLog = Join-Path $InstallDir "logs\support-notifier.log"
$EmbeddedToken = "__TOKEN__"
$EmbeddedAgentBase64 = "__AGENT_BASE64__"

function Assert-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Execute este instalador em um PowerShell como Administrador."
    }
}

function Register-Shortcut {
    param(
        [string]$ShortcutPath,
        [string]$TargetAgent,
        [string]$TargetConfig
    )

    $shortcutDir = Split-Path -Parent $ShortcutPath
    if (-not (Test-Path $shortcutDir)) {
        New-Item -Path $shortcutDir -ItemType Directory -Force | Out-Null
    }

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = (Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe")
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \`"$TargetAgent\`" -ConfigPath \`"$TargetConfig\`""
    $shortcut.WorkingDirectory = (Split-Path -Parent $TargetAgent)
    $shortcut.IconLocation = "imageres.dll,79"
    $shortcut.Description = "Notificador de novos chamados do SGCG"
    $shortcut.Save()
}

Assert-Admin

if ([string]::IsNullOrWhiteSpace($EmbeddedToken) -or $EmbeddedToken -eq "__TOKEN__") {
    throw "Token embutido ausente."
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
$agentContent = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($EmbeddedAgentBase64))
Set-Content -Path $TargetAgent -Value $agentContent -Encoding UTF8

$config = [ordered]@{
    api_url = $ApiUrl
    open_base_url = $OpenBaseUrl
    token = $EmbeddedToken
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
Register-Shortcut -ShortcutPath $StartMenuShortcut -TargetAgent $TargetAgent -TargetConfig $TargetConfig
Register-Shortcut -ShortcutPath $StartupShortcut -TargetAgent $TargetAgent -TargetConfig $TargetConfig

$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \`"$TargetAgent\`" -ConfigPath \`"$TargetConfig\`""
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
`.replace('__TOKEN__', token).replace('__AGENT_BASE64__', agentBase64);

fs.mkdirSync(generatedDir, { recursive: true });
fs.mkdirSync(path.dirname(tokenHashPath), { recursive: true });
fs.writeFileSync(path.join(generatedDir, 'INSTALAR-NOTIFICADOR-CHAMADOS-SGCG.ps1'), installer, 'utf8');
fs.writeFileSync(path.join(generatedDir, 'DESINSTALAR-NOTIFICADOR-CHAMADOS-SGCG.ps1'), uninstallScript, 'utf8');
fs.writeFileSync(tokenHashPath, `${tokenHash}\n`, { encoding: 'utf8', mode: 0o600 });

console.log(`Pacote gerado em: ${generatedDir}`);
console.log(`Hash do token salvo em: ${tokenHashPath}`);
