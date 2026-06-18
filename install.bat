@echo off
echo Installing dependencies...
python -m pip install -r "%~dp0requirements.txt"
echo.
echo Done! Copy env.example.bat to env.bat and configure Supabase, then run: run.bat
pause
