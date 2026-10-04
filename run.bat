@echo off
rem Double-click to start the Quantum cup app.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
if errorlevel 1 pause
