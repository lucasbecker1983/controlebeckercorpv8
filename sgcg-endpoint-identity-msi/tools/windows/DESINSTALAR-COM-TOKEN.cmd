@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%..\.."
set "MSI=%ROOT_DIR%\dist\SGCGEndpointIdentity.msi"
set "LOG=C:\Temp\sgcg-endpoint-identity-uninstall.log"

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo A desinstalacao precisa ser executada como Administrador.
  echo Clique com o botao direito e escolha "Executar como administrador".
  pause
  exit /b 1
)

if not exist "C:\Temp" mkdir "C:\Temp"

if not exist "%MSI%" (
  echo MSI nao encontrado:
  echo %MSI%
  echo.
  echo Use o mesmo MSI usado na instalacao ou coloque SGCGEndpointIdentity.msi na pasta dist.
  pause
  exit /b 2
)

set /p "UNINSTALLTOKEN=Digite o UNINSTALLTOKEN de remocao: "
if "%UNINSTALLTOKEN%"=="" (
  echo UNINSTALLTOKEN obrigatorio.
  pause
  exit /b 3
)

echo.
echo Desinstalando...
msiexec /x "%MSI%" UNINSTALLTOKEN="%UNINSTALLTOKEN%" /qn /L*v "%LOG%"
set "RC=%errorlevel%"

echo.
if "%RC%"=="0" (
  echo Desinstalacao concluida.
) else (
  echo Falha na desinstalacao. Codigo: %RC%
  echo Verifique o log: %LOG%
)

pause
exit /b %RC%
