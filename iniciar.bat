@echo off
rem Abre o app sem deixar uma janela de terminal presa a ele.
cd /d "%~dp0"
start "" "node_modules\electron\dist\electron.exe" .
