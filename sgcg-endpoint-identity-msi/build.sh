#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$ROOT_DIR/src/msi/SGCGEndpointIdentity.wixproj"
AGENT_DIR="$ROOT_DIR/src/agent"
DIST_DIR="$ROOT_DIR/dist"
MSI_SOURCE="$ROOT_DIR/src/msi/bin/x64/Release/SGCGEndpointIdentity.msi"
MSI_FALLBACK="$ROOT_DIR/src/msi/bin/Release/SGCGEndpointIdentity.msi"

if ! command -v dotnet >/dev/null 2>&1; then
  echo "ERRO: dotnet nao encontrado."
  echo "Requisito: .NET SDK 8 ou superior recomendado."
  echo "Build Windows/CI: dotnet build src/msi/SGCGEndpointIdentity.wixproj -c Release"
  exit 10
fi

if [ ! -f "$AGENT_DIR/SGCGEndpointIdentity.exe" ]; then
  echo "ERRO: wrapper WinSW nao encontrado em src/agent/SGCGEndpointIdentity.exe."
  echo "Substitua src/agent/SGCGEndpointIdentity.exe.placeholder pelo binario oficial x64 do WinSW, renomeado para SGCGEndpointIdentity.exe."
  exit 11
fi

mkdir -p "$DIST_DIR"
dotnet restore "$PROJECT"
dotnet build "$PROJECT" -c Release

if [ -f "$MSI_SOURCE" ]; then
  cp "$MSI_SOURCE" "$DIST_DIR/SGCGEndpointIdentity.msi"
elif [ -f "$MSI_FALLBACK" ]; then
  cp "$MSI_FALLBACK" "$DIST_DIR/SGCGEndpointIdentity.msi"
else
  FOUND="$(find "$ROOT_DIR/src/msi/bin" -name 'SGCGEndpointIdentity.msi' -type f | head -n 1 || true)"
  if [ -n "$FOUND" ]; then
    cp "$FOUND" "$DIST_DIR/SGCGEndpointIdentity.msi"
  else
    echo "ERRO: build concluiu sem localizar SGCGEndpointIdentity.msi."
    exit 12
  fi
fi

echo "$DIST_DIR/SGCGEndpointIdentity.msi"
