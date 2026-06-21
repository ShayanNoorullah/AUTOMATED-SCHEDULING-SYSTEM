@echo off
REM Build SSIES Android APK via Expo EAS (cloud — no Android Studio needed)
cd /d "%~dp0"
echo.
echo SSIES Mobile - Cloud APK Build
echo ==============================
echo.

if not exist node_modules (
  echo Installing dependencies...
  call npm install
)

echo.
echo Step 1: Log in to Expo (opens browser — free account)
echo        If already logged in, this step is quick.
echo.
call npm run eas:login
if errorlevel 1 (
  echo Login failed or cancelled.
  pause
  exit /b 1
)

echo.
echo Step 2: Starting cloud build (5-15 minutes)...
echo        You will get a download link for the APK when done.
echo.
call npm run eas:build
echo.
pause
