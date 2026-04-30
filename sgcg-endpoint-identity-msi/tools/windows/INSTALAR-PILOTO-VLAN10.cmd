@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%..\.."
set "MSI=%ROOT_DIR%\dist\SGCGEndpointIdentity.msi"
set "SERVERURL=http://192.168.10.1/api/identity/checkin"
set "INTERVALMINUTES=5"
set "LOG=C:\Temp\sgcg-endpoint-identity-install.log"

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Este instalador precisa ser executado como Administrador.
  echo Clique com o botao direito e escolha "Executar como administrador".
  pause
  exit /b 1
)

if not exist "C:\Temp" mkdir "C:\Temp"

if not exist "%MSI%" (
  echo MSI nao encontrado:
  echo %MSI%
  echo.
  echo Gere primeiro o MSI com build.ps1 ou coloque SGCGEndpointIdentity.msi na pasta dist.
  pause
  exit /b 2
)

echo.
echo SGCG Endpoint Identity - Instalacao piloto VLAN 10
echo Servidor padrao: %SERVERURL%
echo Intervalo: %INTERVALMINUTES% minutos
echo.

set /p "AGENTTOKEN=Digite o AGENTTOKEN: "
if "%AGENTTOKEN%"=="" (
  echo AGENTTOKEN obrigatorio.
  pause
  exit /b 3
)

set /p "UNINSTALLTOKEN=Digite o UNINSTALLTOKEN de remocao: "
if "%UNINSTALLTOKEN%"=="" (
  echo UNINSTALLTOKEN obrigatorio.
  pause
  exit /b 4
)

echo.
echo Instalando...
msiexec /i "%MSI%" SERVERURL="%SERVERURL%" AGENTTOKEN="%AGENTTOKEN%" UNINSTALLTOKEN="%UNINSTALLTOKEN%" INTERVALMINUTES=%INTERVALMINUTES% /qn /L*v "%LOG%"
set "RC=%errorlevel%"

echo.
if "%RC%"=="0" (
  echo Instalacao concluida.
  echo Log do instalador: %LOG%
  echo.
  sc query SGCGEndpointIdentity
  echo.
  echo Log do agente:
  type "C:\Program Files\JMB Tecnologia\SGCG Endpoint Identity\logs\endpoint-identity.log" 2>nul
) else (
  echo Falha na instalacao. Codigo: %RC%
  echo Verifique o log: %LOG%
)

pause
exit /b %RC%
