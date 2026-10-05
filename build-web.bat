@echo off
rem Double-click to build the Quantum Sculptor interface (web\) so the service can serve it.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-web.ps1" %*
if errorlevel 1 pause
