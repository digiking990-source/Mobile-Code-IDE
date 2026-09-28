@echo off
setlocal EnableExtensions EnableDelayedExpansion
title CodeStudio - Build and Install

set "PROJECT_DIR="
if exist "%~dp0..\MobileCodeStudio\package.json" set "PROJECT_DIR=%~dp0..\MobileCodeStudio"
if not defined PROJECT_DIR if exist "%~dp0..\package.json" set "PROJECT_DIR=%~dp0.."
if not defined PROJECT_DIR if exist "%~dp0MobileCodeStudio\package.json" set "PROJECT_DIR=%~dp0MobileCodeStudio"
if not defined PROJECT_DIR if exist "%USERPROFILE%\OneDrive\Desktop\MobileCodeStudio\package.json" set "PROJECT_DIR=%USERPROFILE%\OneDrive\Desktop\MobileCodeStudio"
if not defined PROJECT_DIR if exist "%USERPROFILE%\Desktop\MobileCodeStudio\package.json" set "PROJECT_DIR=%USERPROFILE%\Desktop\MobileCodeStudio"

if not defined PROJECT_DIR (
  echo CodeStudio source project could not be found.
  echo Keep this installer inside CodeStudio-Phone-Install next to MobileCodeStudio,
  echo or copy it into the Desktop folder containing MobileCodeStudio.
  pause
  exit /b 1
)

set "DESKTOP=%USERPROFILE%\OneDrive\Desktop"
if not exist "%DESKTOP%" set "DESKTOP=%USERPROFILE%\Desktop"
if not exist "%DESKTOP%" set "DESKTOP=%USERPROFILE%"
set "OUTPUT_DIR=%DESKTOP%\CodeStudio-Phone-Install"
set "APK=%PROJECT_DIR%\android\app\build\outputs\apk\debug\app-debug.apk"
set "ANDROID_SDK=%LOCALAPPDATA%\Android\Sdk"
set "ADB=%ANDROID_SDK%\platform-tools\adb.exe"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 20 or newer, then run this file again.
  pause
  exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Repair the Node.js installation, then run this file again.
  pause
  exit /b 1
)

if not defined JAVA_HOME if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
if not defined JAVA_HOME if exist "%ProgramFiles(x86)%\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=%ProgramFiles(x86)%\Android\Android Studio\jbr"
if not defined JAVA_HOME (
  echo Java was not found. Install Android Studio with its bundled JDK, then run again.
  echo You can set JAVA_HOME to Android Studio's jbr folder.
  pause
  exit /b 1
)
if not exist "%JAVA_HOME%\bin\java.exe" (
  echo JAVA_HOME does not point to a working JDK: %JAVA_HOME%
  pause
  exit /b 1
)
set "PATH=%JAVA_HOME%\bin;%PATH%"

if not exist "%ANDROID_SDK%\platform-tools\adb.exe" (
  if defined ANDROID_HOME set "ANDROID_SDK=%ANDROID_HOME%"
  if not defined ANDROID_HOME if defined ANDROID_SDK_ROOT set "ANDROID_SDK=%ANDROID_SDK_ROOT%"
  set "ADB=%ANDROID_SDK%\platform-tools\adb.exe"
)
if not exist "%ANDROID_SDK%" if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_SDK=%LOCALAPPDATA%\Android\Sdk"
set "ADB=%ANDROID_SDK%\platform-tools\adb.exe"

echo.
echo [1/5] Building and syncing the latest offline web app...
pushd "%PROJECT_DIR%"
if errorlevel 1 (
  echo Could not open project folder: %PROJECT_DIR%
  pause
  exit /b 1
)
call npm.cmd run sync:android
if errorlevel 1 goto build_failed

echo.
echo [2/5] Building Android APK...
pushd "%PROJECT_DIR%\android"
call gradlew.bat --no-daemon assembleDebug
set "BUILD_RESULT=!errorlevel!"
popd
if not "!BUILD_RESULT!"=="0" goto build_failed
if not exist "%APK%" (
  echo Android build finished but the APK was not created:
  echo %APK%
  goto build_failed
)

echo.
echo [3/5] Preparing fresh APK and cloud-upload files...
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
if errorlevel 1 goto build_failed
copy /y "%APK%" "%OUTPUT_DIR%\CodeStudio.apk" >nul
if errorlevel 1 goto build_failed
if exist "%PROJECT_DIR%\release\INSTALL-HI.txt" copy /y "%PROJECT_DIR%\release\INSTALL-HI.txt" "%OUTPUT_DIR%\INSTALL-HI.txt" >nul
if /i not "%~dp0"=="%OUTPUT_DIR%\" copy /y "%~f0" "%OUTPUT_DIR%\Install-CodeStudio.bat" >nul

echo.
echo [4/5] Creating the cloud-upload ZIP...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\tools\Create-Phone-Install-Package.ps1" -OutputDirectory "%OUTPUT_DIR%" -ZipPath "%DESKTOP%\CodeStudio-Phone-Install.zip"
if errorlevel 1 goto build_failed

echo.
echo [5/5] Checking for an authorized USB phone...
if not exist "%ADB%" goto no_adb
set /a DEVICE_COUNT=0
set "DEVICE_SERIAL="
set "UNAUTHORIZED=0"
for /f "skip=1 tokens=1,2" %%A in ('"%ADB%" devices') do (
  if "%%B"=="device" (
    set /a DEVICE_COUNT+=1
    set "DEVICE_SERIAL=%%A"
  )
  if "%%B"=="unauthorized" set "UNAUTHORIZED=1"
)
if "!DEVICE_COUNT!"=="1" goto install_phone
if !DEVICE_COUNT! GTR 1 goto multiple_phones
if "!UNAUTHORIZED!"=="1" goto unauthorized_phone
goto no_phone

:install_phone
echo Installing CodeStudio 1.7 on !DEVICE_SERIAL!...
"%ADB%" -s "!DEVICE_SERIAL!" install -r "%OUTPUT_DIR%\CodeStudio.apk"
if errorlevel 1 goto install_failed
echo.
echo Launching CodeStudio on the phone...
"%ADB%" -s "!DEVICE_SERIAL!" shell monkey -p com.sachin.codestudio 1 >nul 2>nul
echo.
echo SUCCESS: CodeStudio 1.7 was installed.
goto done

:multiple_phones
echo More than one authorized phone is connected.
echo Disconnect the extra devices and run this installer again.
goto ready

:unauthorized_phone
echo The phone is connected but has not authorized USB debugging.
echo Unlock the phone, accept the "Allow USB debugging" prompt, then run again.
goto ready

:no_adb
echo Android SDK platform-tools were not found. The APK was built and copied.
echo Open Android Studio once and install Android SDK Platform-Tools if needed.
goto ready

:no_phone
echo No authorized USB phone is connected. The APK was built and copied.
echo Copy CodeStudio.apk to your phone, open it from Downloads, and tap Install.
goto ready

:install_failed
echo Automatic installation failed.
echo For INSTALL_FAILED_UPDATE_INCOMPATIBLE, first back up/export local files.
echo Then uninstall the old app manually and install the new APK.
goto ready

:build_failed
echo.
echo BUILD FAILED. Read the error above; no old APK was presented as a new build.
popd
pause
exit /b 1

:ready
echo.
echo APK folder: %OUTPUT_DIR%
echo APK file:   %OUTPUT_DIR%\CodeStudio.apk
goto done

:done
if exist "%OUTPUT_DIR%" start "" "%OUTPUT_DIR%"
popd
echo.
pause
exit /b 0
