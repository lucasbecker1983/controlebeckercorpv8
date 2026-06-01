<#
.SYNOPSIS
  Instala a CA raiz interna do SGCG no Windows.

.DESCRIPTION
  Baixa o certificado raiz do portal interno do SGCG e instala em
  LocalMachine\Root, permitindo que o Windows e navegadores que usam o
  repositorio do sistema confiem em https://suporte.jacarezinho.interno/.

  Execute em PowerShell como Administrador.

.EXAMPLE
  powershell.exe -ExecutionPolicy Bypass -File .\INSTALAR-CA-SGCG.ps1

.EXAMPLE
  powershell.exe -ExecutionPolicy Bypass -File .\INSTALAR-CA-SGCG.ps1 -CertificateUrl "http://192.168.10.1/sgcg-root-ca.crt"
#>

[CmdletBinding()]
param(
    [string]$CertificateUrl = "http://suporte.jacarezinho.interno/sgcg-root-ca.crt",
    [string]$ExpectedSubject = "CN=SGCG Jacarezinho Internal Root CA",
    [switch]$CurrentUserOnly
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[SGCG] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-WarningLine {
    param([string]$Message)
    Write-Host "[AVISO] $Message" -ForegroundColor Yellow
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Ensure-Tls12 {
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    } catch {
        # Windows antigo pode nao expor todas as constantes; seguir com o padrao do sistema.
    }
}

$storeLocation = if ($CurrentUserOnly) { "CurrentUser" } else { "LocalMachine" }
$storePath = if ($CurrentUserOnly) { "Cert:\CurrentUser\Root" } else { "Cert:\LocalMachine\Root" }

if (-not $CurrentUserOnly -and -not (Test-IsAdministrator)) {
    Write-WarningLine "Este instalador precisa ser executado como Administrador para instalar em LocalMachine\Root."
    Write-WarningLine "Clique com o botao direito no PowerShell e selecione 'Executar como administrador'."
    exit 1
}

Ensure-Tls12

$workDir = Join-Path $env:ProgramData "SGCG\Certificates"
$certFile = Join-Path $workDir "sgcg-root-ca.crt"

Write-Step "Preparando diretorio $workDir"
New-Item -ItemType Directory -Path $workDir -Force | Out-Null

Write-Step "Baixando certificado de $CertificateUrl"
try {
    Invoke-WebRequest -Uri $CertificateUrl -OutFile $certFile -UseBasicParsing
} catch {
    Write-WarningLine "Falha ao baixar pelo endereco principal: $($_.Exception.Message)"
    Write-WarningLine "Tentando fallback http://192.168.10.1/sgcg-root-ca.crt"
    Invoke-WebRequest -Uri "http://192.168.10.1/sgcg-root-ca.crt" -OutFile $certFile -UseBasicParsing
}

if (-not (Test-Path $certFile)) {
    throw "Certificado nao foi baixado."
}

$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certFile)

Write-Step "Validando certificado baixado"
if ($cert.Subject -notlike "*$ExpectedSubject*") {
    throw "Certificado inesperado. Subject encontrado: $($cert.Subject). Esperado conter: $ExpectedSubject"
}

if ($cert.NotAfter -lt (Get-Date)) {
    throw "Certificado expirado em $($cert.NotAfter)."
}

if ($cert.Subject -ne $cert.Issuer) {
    Write-WarningLine "O certificado baixado nao parece autoassinado. Subject: $($cert.Subject) | Issuer: $($cert.Issuer)"
}

$existing = Get-ChildItem -Path $storePath -ErrorAction SilentlyContinue |
    Where-Object { $_.Thumbprint -eq $cert.Thumbprint } |
    Select-Object -First 1

if ($existing) {
    Write-Success "CA SGCG ja estava instalada em $storePath."
} else {
    Write-Step "Instalando CA SGCG em $storePath"
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", $storeLocation)
    try {
        $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
        $store.Add($cert)
    } finally {
        $store.Close()
    }
}

$installed = Get-ChildItem -Path $storePath -ErrorAction SilentlyContinue |
    Where-Object { $_.Thumbprint -eq $cert.Thumbprint } |
    Select-Object -First 1

if (-not $installed) {
    throw "Falha na verificacao: CA SGCG nao encontrada em $storePath."
}

Write-Success "CA SGCG instalada e verificada."
Write-Host ""
Write-Host "Subject    : $($installed.Subject)"
Write-Host "Issuer     : $($installed.Issuer)"
Write-Host "Thumbprint : $($installed.Thumbprint)"
Write-Host "Validade   : $($installed.NotBefore) ate $($installed.NotAfter)"
Write-Host ""
Write-Success "Agora o navegador deve confiar em https://suporte.jacarezinho.interno/ e https://chamados.jacarezinho.interno/."
Write-WarningLine "Se o navegador ja estava aberto, feche e abra novamente para recarregar a confianca do sistema."
