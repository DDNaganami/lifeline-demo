@echo off
setlocal

set PORT=8080
if not "%~1"=="" set PORT=%~1

echo.
echo   ==========================================
echo    LifeLine Demo Server
echo   ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [ERROR] Node.js not found on this server.
  echo.
  echo   Please install Node.js once ^(about 3 minutes^):
  echo     1^) Open https://nodejs.org/en/download
  echo     2^) Download the Windows Installer ^(.msi, LTS^)
  echo     3^) Run it and click Next all the way
  echo     4^) Close this window, then double-click this file again
  echo.
  echo   Offline server? Use the portable .zip instead:
  echo     Unzip it and copy node.exe into this folder.
  echo.
  echo   See ????.md for full instructions in Chinese.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODEVER=%%v
echo   [1/3] Node.js ready: %NODEVER%

if not exist "out\index.html" (
  echo.
  echo   [ERROR] out\index.html not found.
  echo   Make sure this file and the "out" folder are in the same directory.
  echo.
  pause
  exit /b 1
)
echo   [2/3] Web files ready

echo   [3/3] Starting on port %PORT% ...
echo.
echo   KEEP THIS WINDOW OPEN. Closing it stops the server.
echo   Press Ctrl + C to stop.
echo.

node server.js %PORT%

echo.
echo   Server stopped.
pause