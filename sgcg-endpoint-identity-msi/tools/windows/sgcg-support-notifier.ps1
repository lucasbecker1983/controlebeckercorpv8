param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot "support-notifier.config.json"),
    [switch]$Once
)

$ErrorActionPreference = "Stop"
$AppName = "SGCG Chamados"
$AppId = "Microsoft.Windows.PowerShell"
$LogDir = Join-Path $env:ProgramData "SGCG\SupportNotifier\logs"
$StatePath = Join-Path $env:ProgramData "SGCG\SupportNotifier\state.json"
$LogPath = Join-Path $LogDir "support-notifier.log"

function Initialize-Directories {
    $stateDir = Split-Path -Parent $StatePath
    foreach ($dir in @($LogDir, $stateDir)) {
        if (-not (Test-Path $dir)) {
            New-Item -Path $dir -ItemType Directory -Force | Out-Null
        }
    }
}

function Write-AgentLog {
    param([string]$Level, [string]$Message)
    Initialize-Directories
    $line = "{0} [{1}] {2}" -f (Get-Date).ToString("o"), $Level.ToUpperInvariant(), $Message
    Add-Content -Path $LogPath -Value $line -Encoding UTF8
}

function Read-Config {
    if (-not (Test-Path $ConfigPath)) {
        throw "Arquivo de configuracao nao encontrado: $ConfigPath"
    }
    return Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Read-State {
    try {
        return Get-Content -Path $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        return [pscustomobject]@{ notified_ids = @(); initialized = $false }
    }
}

function Write-State {
    param($State)
    Initialize-Directories
    $State | ConvertTo-Json -Depth 6 | Set-Content -Path $StatePath -Encoding UTF8
}

function Get-Notifications {
    param($Config)
    if ([string]::IsNullOrWhiteSpace($Config.api_url)) { throw "api_url nao configurado" }
    if ([string]::IsNullOrWhiteSpace($Config.token)) { throw "token nao configurado" }
    $headers = @{ "X-Agent-Token" = [string]$Config.token }
    return Invoke-RestMethod -Uri $Config.api_url -Headers $headers -Method Get -TimeoutSec 15
}

function Get-TicketUrl {
    param($Config, $Ticket)
    $baseUrl = [string]$Config.open_base_url
    if ([string]::IsNullOrWhiteSpace($baseUrl)) {
        $baseUrl = "https://console.interno.jacarezinho/chamados"
    }
    return "{0}?ticket={1}" -f $baseUrl.TrimEnd('/'), $Ticket.id
}

function ConvertTo-XmlText {
    param([string]$Value)
    return [System.Security.SecurityElement]::Escape([string]$Value)
}

function Set-ProcessAppId {
    try {
        if (-not ("SGCG.NativeMethods" -as [type])) {
            Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

namespace SGCG {
    public static class NativeMethods {
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        public static extern int SetCurrentProcessExplicitAppUserModelID(string AppID);
    }
}
"@
        }
        [SGCG.NativeMethods]::SetCurrentProcessExplicitAppUserModelID($AppId) | Out-Null
    } catch {
        Write-AgentLog "error" ("set_app_id_failed {0}" -f $_.Exception.Message)
    }
}

function Show-BalloonNotification {
    param($Config, $Ticket)

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $notifyIcon = New-Object System.Windows.Forms.NotifyIcon
    $notifyIcon.Icon = [System.Drawing.SystemIcons]::Information
    $notifyIcon.Text = $AppName
    $notifyIcon.Visible = $true

    $title = "Novo chamado no SGCG"
    $body = "{0} - {1}" -f $Ticket.protocol, $Ticket.title
    if ($body.Length -gt 250) { $body = $body.Substring(0, 247) + "..." }
    $url = Get-TicketUrl -Config $Config -Ticket $Ticket

    $openAction = {
        try {
            Start-Process $url | Out-Null
        } catch {
            Write-AgentLog "error" ("notification_open_failed {0}" -f $_.Exception.Message)
        }
    }

    $notifyIcon.add_BalloonTipClicked($openAction)
    $notifyIcon.add_Click($openAction)
    $notifyIcon.ShowBalloonTip(12000, $title, $body, [System.Windows.Forms.ToolTipIcon]::Info)
    Start-Sleep -Seconds 14
    $notifyIcon.Dispose()
}

function Show-DesktopToastNotification {
    param($Config, $Ticket)

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    [System.Windows.Forms.Application]::EnableVisualStyles()

    $title = "Novo chamado no SGCG"
    $body = "{0} - {1}" -f $Ticket.protocol, $Ticket.title
    $requester = "Solicitante: {0}" -f $Ticket.requester_name
    $url = Get-TicketUrl -Config $Config -Ticket $Ticket

    $form = New-Object System.Windows.Forms.Form
    $form.Text = $title
    $form.Width = 420
    $form.Height = 180
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedSingle
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.ShowInTaskbar = $true
    $form.TopMost = $true
    $form.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 252)
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual

    $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    $form.Left = [Math]::Max(0, $area.Right - $form.Width - 18)
    $form.Top = [Math]::Max(0, $area.Bottom - $form.Height - 18)

    $titleLabel = New-Object System.Windows.Forms.Label
    $titleLabel.Text = $title
    $titleLabel.Left = 18
    $titleLabel.Top = 14
    $titleLabel.Width = 360
    $titleLabel.Height = 24
    $titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
    $titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(15, 23, 42)

    $bodyLabel = New-Object System.Windows.Forms.Label
    $bodyLabel.Text = $body
    $bodyLabel.Left = 18
    $bodyLabel.Top = 46
    $bodyLabel.Width = 370
    $bodyLabel.Height = 42
    $bodyLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $bodyLabel.ForeColor = [System.Drawing.Color]::FromArgb(30, 41, 59)

    $requesterLabel = New-Object System.Windows.Forms.Label
    $requesterLabel.Text = $requester
    $requesterLabel.Left = 18
    $requesterLabel.Top = 92
    $requesterLabel.Width = 370
    $requesterLabel.Height = 22
    $requesterLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $requesterLabel.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)

    $openButton = New-Object System.Windows.Forms.Button
    $openButton.Text = "Abrir chamado"
    $openButton.Left = 18
    $openButton.Top = 122
    $openButton.Width = 130
    $openButton.Height = 32

    $closeButton = New-Object System.Windows.Forms.Button
    $closeButton.Text = "Fechar"
    $closeButton.Left = 158
    $closeButton.Top = 122
    $closeButton.Width = 90
    $closeButton.Height = 32

    $openAction = {
        try {
            Start-Process $url | Out-Null
        } catch {
            Write-AgentLog "error" ("desktop_toast_open_failed {0}" -f $_.Exception.Message)
        }
        $form.Close()
    }
    $closeAction = { $form.Close() }

    $openButton.Add_Click($openAction)
    $closeButton.Add_Click($closeAction)
    $form.Add_Click($openAction)
    $titleLabel.Add_Click($openAction)
    $bodyLabel.Add_Click($openAction)
    $requesterLabel.Add_Click($openAction)

    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 20000
    $timer.Add_Tick({
        $timer.Stop()
        $form.Close()
    })

    $form.Controls.AddRange(@($titleLabel, $bodyLabel, $requesterLabel, $openButton, $closeButton))
    $form.Add_Shown({
        $form.Activate()
        $timer.Start()
    })
    $form.ShowDialog() | Out-Null
    $timer.Dispose()
    $form.Dispose()

    Write-AgentLog "info" ("desktop_toast_shown id={0} protocol={1}" -f $Ticket.id, $Ticket.protocol)
}

function Show-ToastNotification {
    param($Config, $Ticket)

    $title = "Novo chamado no SGCG"
    $line1 = "{0} - {1}" -f $Ticket.protocol, $Ticket.title
    $line2 = "Solicitante: {0}" -f $Ticket.requester_name
    $url = Get-TicketUrl -Config $Config -Ticket $Ticket

    $toastXml = @"
<toast scenario="reminder" launch="$(ConvertTo-XmlText $url)">
  <visual>
    <binding template="ToastGeneric">
      <text>$(ConvertTo-XmlText $title)</text>
      <text>$(ConvertTo-XmlText $line1)</text>
      <text>$(ConvertTo-XmlText $line2)</text>
    </binding>
  </visual>
  <actions>
    <action content="Abrir chamado" activationType="protocol" arguments="$(ConvertTo-XmlText $url)" />
    <action content="Fechar" activationType="system" arguments="dismiss" />
  </actions>
</toast>
"@

    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($toastXml)
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    Set-ProcessAppId
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId)
    $notifier.Show($toast)
    Write-AgentLog "info" ("toast_shown id={0} protocol={1}" -f $Ticket.id, $Ticket.protocol)
}

function Show-SGCGNotification {
    param($Config, $Ticket)

    try {
        Show-ToastNotification -Config $Config -Ticket $Ticket
    } catch {
        Write-AgentLog "error" ("toast_failed {0}" -f $_.Exception.Message)
    }

    try {
        Show-DesktopToastNotification -Config $Config -Ticket $Ticket
    } catch {
        Write-AgentLog "error" ("desktop_toast_failed {0}" -f $_.Exception.Message)
        Show-BalloonNotification -Config $Config -Ticket $Ticket
    }
}

function Invoke-Poll {
    param($Config)
    $state = Read-State
    $known = @{}
    foreach ($id in @($state.notified_ids)) {
        if ($null -ne $id) { $known[[string]$id] = $true }
    }

    $response = Get-Notifications -Config $Config
    $tickets = @($response.notifications)
    $currentIds = @($tickets | ForEach-Object { [string]$_.id })

    if (-not [bool]$state.initialized) {
        $state.initialized = $true
        Write-AgentLog "info" ("initialized unread={0}" -f $response.unread)
    }

    foreach ($ticket in ($tickets | Sort-Object id)) {
        $id = [string]$ticket.id
        if ($known.ContainsKey($id)) { continue }
        Write-AgentLog "info" ("new_ticket id={0} protocol={1} title={2}" -f $ticket.id, $ticket.protocol, $ticket.title)
        Show-SGCGNotification -Config $Config -Ticket $ticket
        $known[$id] = $true
    }

    $state.notified_ids = @($known.Keys | Sort-Object { [int64]$_ } -Descending | Select-Object -First 200)
    Write-State -State $state
}

Initialize-Directories
Write-AgentLog "info" "support_notifier_started"

while ($true) {
    try {
        $config = Read-Config
        Invoke-Poll -Config $config
        $interval = [int]$config.poll_seconds
        if ($interval -lt 5) { $interval = 5 }
    } catch {
        Write-AgentLog "error" $_.Exception.Message
        $interval = 30
    }

    if ($Once) { break }
    Start-Sleep -Seconds $interval
}

Write-AgentLog "info" "support_notifier_stopped"
