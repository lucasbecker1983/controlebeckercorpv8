@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR-NOTIFICADOR-CHAMADOS-SGCG.ps1" %*
endlocal
