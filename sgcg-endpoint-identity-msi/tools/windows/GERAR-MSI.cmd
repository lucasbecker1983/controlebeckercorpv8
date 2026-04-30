@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%..\.."

cd /d "%ROOT_DIR%"

echo SGCG Endpoint Identity - Build MSI
echo.

where dotnet >nul 2>&1
if not "%errorlevel%"=="0" (
  echo .NET SDK nao encontrado.
  echo Instale .NET SDK 8 ou superior e execute novamente.
  pause
  exit /b 1
)

if not exist "src\agent\SGCGEndpointIdentity.exe" (
  echo WinSW nao encontrado em:
  echo src\agent\SGCGEndpointIdentity.exe
  echo.
  echo Baixe o WinSW x64 verificado, renomeie para SGCGEndpointIdentity.exe e coloque nessa pasta.
  pause
  exit /b 2
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\build.ps1"
set "RC=%errorlevel%"

echo.
if "%RC%"=="0" (
  echo MSI gerado em dist\SGCGEndpointIdentity.msi
) else (
  echo Falha ao gerar MSI. Codigo: %RC%
)

pause
exit /b %RC%
