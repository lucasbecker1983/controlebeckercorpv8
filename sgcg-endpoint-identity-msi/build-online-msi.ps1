$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Project = Join-Path $RootDir "src\online-msi\SGCGEndpointIdentityOnlineSetup.wixproj"
$DistDir = Join-Path $RootDir "dist"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw ".NET SDK nao encontrado. Instale .NET SDK 8 ou superior."
}

New-Item -Path $DistDir -ItemType Directory -Force | Out-Null
dotnet restore $Project
dotnet build $Project -c Release

$Msi = Get-ChildItem -Path (Join-Path $RootDir "src\online-msi\bin") -Filter "SGCGEndpointIdentity-OnlineSetup.msi" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if (-not $Msi) {
    throw "Build concluiu sem localizar SGCGEndpointIdentity-OnlineSetup.msi."
}

Copy-Item -Path $Msi -Destination (Join-Path $DistDir "SGCGEndpointIdentity-OnlineSetup.msi") -Force
Write-Host (Join-Path $DistDir "SGCGEndpointIdentity-OnlineSetup.msi")
