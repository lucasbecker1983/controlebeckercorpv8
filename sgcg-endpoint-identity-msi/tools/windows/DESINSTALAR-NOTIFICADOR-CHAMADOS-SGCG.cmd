@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0DESINSTALAR-NOTIFICADOR-CHAMADOS-SGCG.ps1" %*
endlocal
