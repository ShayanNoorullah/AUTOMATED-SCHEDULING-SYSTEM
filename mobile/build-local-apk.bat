@echo off
REM Local Android APK build (requires JDK 17 and Android SDK)
cd /d "%~dp0"
echo.
echo SSIES Mobile - Local APK Build
echo ==============================
echo.
echo Requires: JDK 17 (not JDK 21+), Android SDK, ANDROID_HOME set
echo Tip: Use Android Studio's bundled JBR:
echo   set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
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
