@echo off
setlocal

echo SGCG Endpoint Identity - Validacao local
echo.

echo [1/4] Servico
sc query SGCGEndpointIdentity

echo.
echo [2/4] Pasta de instalacao
dir "C:\Program Files\JMB Tecnologia\SGCG Endpoint Identity"

echo.
echo [3/4] Configuracao criada
if exist "C:\Program Files\JMB Tecnologia\SGCG Endpoint Identity\config.json" (
  echo config.json encontrado.
) else (
  echo config.json NAO encontrado.
)

echo.
echo [4/4] Ultimas linhas do log
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path 'C:\Program Files\JMB Tecnologia\SGCG Endpoint Identity\logs\endpoint-identity.log') { Get-Content 'C:\Program Files\JMB Tecnologia\SGCG Endpoint Identity\logs\endpoint-identity.log' -Tail 30 } else { Write-Host 'Log ainda nao encontrado.' }"

echo.
pause
