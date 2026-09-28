@echo off
cd /d "%~dp0.."
call run.local.bat
python app.py
