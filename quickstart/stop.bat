@echo off
REM Quick stop launcher for Windows
REM Double-click or run: stop.bat

cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0stop.ps1"
pause
