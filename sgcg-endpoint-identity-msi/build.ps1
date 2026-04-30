$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Project = Join-Path $RootDir "src\msi\SGCGEndpointIdentity.wixproj"
$AgentDir = Join-Path $RootDir "src\agent"
$Wrapper = Join-Path $AgentDir "SGCGEndpointIdentity.exe"
$DistDir = Join-Path $RootDir "dist"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw ".NET SDK nao encontrado. Instale .NET SDK 8 ou superior."
}

if (-not (Test-Path $Wrapper)) {
    throw "Wrapper WinSW nao encontrado em src\agent\SGCGEndpointIdentity.exe. Baixe uma versao x64 assinada/verificada do WinSW e renomeie para SGCGEndpointIdentity.exe."
}

New-Item -Path $DistDir -ItemType Directory -Force | Out-Null
dotnet restore $Project
dotnet build $Project -c Release

$Candidates = @(
    (Join-Path $RootDir "src\msi\bin\x64\Release\SGCGEndpointIdentity.msi"),
    (Join-Path $RootDir "src\msi\bin\Release\SGCGEndpointIdentity.msi")
)

$Msi = $Candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Msi) {
    $Msi = Get-ChildItem -Path (Join-Path $RootDir "src\msi\bin") -Filter "SGCGEndpointIdentity.msi" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Msi) {
    throw "Build concluiu sem localizar SGCGEndpointIdentity.msi."
}

Copy-Item -Path $Msi -Destination (Join-Path $DistDir "SGCGEndpointIdentity.msi") -Force
Write-Host (Join-Path $DistDir "SGCGEndpointIdentity.msi")
