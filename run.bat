@echo off
REM Loads git-ignored local config (secrets + run settings).
if exist "%~dp0run.local.bat" (
  call "%~dp0run.local.bat"
) else if exist "%~dp0env.bat" (
  echo [run.bat] Using legacy env.bat — copy run.local.example.bat to run.local.bat
  call "%~dp0env.bat"
) else (
  echo.
  echo ERROR: run.local.bat not found.
  echo Copy run.local.example.bat to run.local.bat and fill in your Supabase values.
  echo.
  pause
  exit /b 1
)

if not defined PORT set PORT=5000
if not defined HOST set HOST=0.0.0.0

echo.
echo Starting SSIES WhatsApp Schedule Sender...
echo   URL:      http://localhost:%PORT%
echo   Host:     %HOST%
echo   Waitress: %USE_WAITRESS%
echo   Supabase: %SUPABASE_URL%
echo.

if "%USE_WAITRESS%"=="1" (
  python "%~dp0app.py"
) else (
  python "%~dp0app.py"
)
pause
