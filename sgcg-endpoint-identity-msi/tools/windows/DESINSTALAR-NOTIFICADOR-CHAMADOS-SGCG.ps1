param(
    [string]$InstallDir = "$env:ProgramData\SGCG\SupportNotifier"
)

$ErrorActionPreference = "Stop"
$TaskName = "SGCG Chamados - Notificador"
$StartMenuShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\SGCG Chamados.lnk"
$StartupShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\SGCG Chamados Notificador.lnk"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Execute este desinstalador em um PowerShell como Administrador."
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*sgcg-support-notifier.ps1*" } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

foreach ($shortcut in @($StartMenuShortcut, $StartupShortcut)) {
    if (Test-Path $shortcut) {
        Remove-Item -Path $shortcut -Force
    }
}

if (Test-Path $InstallDir) {
    Remove-Item -Path $InstallDir -Recurse -Force
}

Write-Host "Notificador de chamados removido." -ForegroundColor Green
