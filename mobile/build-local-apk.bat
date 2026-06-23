@echo off
REM Local Android APK build (requires JDK 17 and Android SDK)
cd /d "%~dp0"

REM Prefer JDK 17 for Gradle / Android builds
if exist "C:\Program Files\Java\jdk-17.0.18" (
  set "JAVA_HOME=C:\Program Files\Java\jdk-17.0.18"
) else if exist "C:\Program Files\Java\jdk-17" (
  set "JAVA_HOME=C:\Program Files\Java\jdk-17"
)
if defined JAVA_HOME set "PATH=%JAVA_HOME%\bin;%PATH%"

echo.
echo SSIES Mobile - Local APK Build
echo ==============================
echo.
echo JAVA_HOME: %JAVA_HOME%
echo Requires: JDK 17, Android SDK, ANDROID_HOME set
echo.

if not exist node_modules call npm install

if not exist android (
  echo Running expo prebuild...
  call npx expo prebuild --platform android --no-install
)

echo Building release APK...
cd android
call gradlew.bat assembleRelease --no-daemon
if errorlevel 1 (
  echo.
  echo Build failed. Try EAS cloud build instead:  build-apk.bat
  cd ..
  pause
  exit /b 1
)

cd ..
set APK=android\app\build\outputs\apk\release\app-release.apk
if exist "%APK%" (
  copy /Y "%APK%" "SSIES-Schedule-release.apk" >nul
  echo.
  echo Success! APK copied to:
  echo   %CD%\SSIES-Schedule-release.apk
) else (
  echo APK not found at expected path.
)
echo.
pause
