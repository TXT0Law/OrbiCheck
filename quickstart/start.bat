@echo off
REM Quick start launcher for Windows
REM Double-click or run: start.bat

cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1"
pause
