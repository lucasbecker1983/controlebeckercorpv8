@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "SETUP_PS1=%SCRIPT_DIR%SGCGEndpointIdentity-OnlineSetup.ps1"
set "STAGE_DIR=%ProgramData%\SGCGEndpointIdentitySetup"

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Solicitando permissao de Administrador...
  if not exist "%STAGE_DIR%" mkdir "%STAGE_DIR%"
  copy /Y "%~f0" "%STAGE_DIR%\SGCGEndpointIdentity-OnlineSetup.cmd" >nul
  copy /Y "%SETUP_PS1%" "%STAGE_DIR%\SGCGEndpointIdentity-OnlineSetup.ps1" >nul
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%STAGE_DIR%\SGCGEndpointIdentity-OnlineSetup.cmd' -Verb RunAs"
  exit /b
)

set /p "AGENTTOKEN=Digite o AGENTTOKEN: "
if "%AGENTTOKEN%"=="" (
  echo AGENTTOKEN obrigatorio.
  pause
  exit /b 1
)

set /p "UNINSTALLTOKEN=Digite o UNINSTALLTOKEN de remocao: "
if "%UNINSTALLTOKEN%"=="" (
  echo UNINSTALLTOKEN obrigatorio.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SETUP_PS1%" -AgentToken "%AGENTTOKEN%" -UninstallToken "%UNINSTALLTOKEN%"
set "RC=%errorlevel%"
echo.
if "%RC%"=="0" (
  echo Instalacao finalizada.
) else (
  echo Instalacao falhou. Codigo: %RC%
)
pause
exit /b %RC%
