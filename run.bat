@echo off
REM ── Optional: connect to cloud PostgreSQL for multi-device sync ──
REM Copy env.example.bat to env.bat and fill in your values, then it loads here.
if exist "%~dp0env.bat" call "%~dp0env.bat"

echo Starting WhatsApp Schedule Sender...
echo Open your browser at: http://localhost:5000
python "%~dp0app.py"
pause
