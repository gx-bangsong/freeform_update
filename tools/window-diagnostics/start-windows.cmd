@echo off
cd /d "%~dp0"
echo Starting FreeForm USB Lab using built-in Windows PowerShell...
echo No Python, Node.js or administrator rights required.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-windows.ps1"
pause
