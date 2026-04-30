@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "UNINSTALL_PS1=%SCRIPT_DIR%SGCGEndpointIdentity-OnlineUninstall.ps1"
set "STAGE_DIR=%ProgramData%\SGCGEndpointIdentitySetup"

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Solicitando permissao de Administrador...
  if not exist "%STAGE_DIR%" mkdir "%STAGE_DIR%"
  copy /Y "%~f0" "%STAGE_DIR%\SGCGEndpointIdentity-OnlineUninstall.cmd" >nul
  copy /Y "%UNINSTALL_PS1%" "%STAGE_DIR%\SGCGEndpointIdentity-OnlineUninstall.ps1" >nul
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%STAGE_DIR%\SGCGEndpointIdentity-OnlineUninstall.cmd' -Verb RunAs"
  exit /b
)

set /p "UNINSTALLTOKEN=Digite o UNINSTALLTOKEN de remocao: "
if "%UNINSTALLTOKEN%"=="" (
  echo UNINSTALLTOKEN obrigatorio.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%UNINSTALL_PS1%" -UninstallToken "%UNINSTALLTOKEN%"
set "RC=%errorlevel%"
echo.
if "%RC%"=="0" (
  echo Desinstalacao finalizada.
) else (
  echo Desinstalacao falhou. Codigo: %RC%
)
pause
exit /b %RC%
