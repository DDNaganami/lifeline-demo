@echo off
chcp 65001 >nul
setlocal

set PORT=8080
if not "%~1"=="" set PORT=%~1

echo.
echo   ==========================================
echo    LifeLine 演示站 · 启动
echo   ==========================================
echo.

REM ---------- 1. 检查 Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
  echo   [缺少运行环境] 这台服务器上没有装 Node.js
  echo.
  echo   请按下面步骤装一次（只需一次，约 3 分钟）：
  echo     1^) 打开 https://nodejs.org/zh-cn/download
  echo     2^) 下载 Windows 安装包 ^(LTS 版本，.msi^)
  echo     3^) 双击安装，一路点"下一步"即可
  echo     4^) 装完后【关闭本窗口再重新双击本文件】
  echo.
  echo   如果服务器不能上网，就选 portable 的 zip 版本：
  echo     解压后把 node.exe 复制到本文件夹，再双击本文件。
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODEVER=%%v
echo   [1/3] Node.js 已就绪：%NODEVER%

REM ---------- 2. 检查静态文件 ----------
if not exist "out\index.html" (
  echo.
  echo   [缺少网页文件] 当前文件夹里没有 out 目录。
  echo   请确认本文件和 out 文件夹在同一个目录下。
  echo.
  pause
  exit /b 1
)
echo   [2/3] 网页文件已就绪

REM ---------- 3. 启动 ----------
echo   [3/3] 正在启动，端口 %PORT% ...
echo.
echo   保持本窗口开着不要关，关掉窗口 = 停止服务。
echo   按 Ctrl + C 可以停止。
echo.

node server.js %PORT%

echo.
echo   服务已停止。
pause
