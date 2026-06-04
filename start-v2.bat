@echo off
chcp 65001 >nul
title A股仪表盘 v2.0 — 自动修复版
cd /d "%~dp0"

:CHECK
echo.
echo ╔══════════════════════════════════════════════╗
echo ║  📊 A股仪表盘 v2.0 — 自动修复启动器       ║
echo ╚══════════════════════════════════════════════╝
echo.
echo [1] 自动修复并启动 (推荐)
echo [2] 仅启动服务器
echo [3] 启动守护进程 (崩溃自动重启)
echo [4] 刷新市场数据
echo [5] 自动修复 + 守护模式
echo [0] 退出
echo.
set /p choice="请选择 [1]: "
if "%choice%"=="" set choice=1

if "%choice%"=="1" goto AUTO_START
if "%choice%"=="2" goto START_ONLY
if "%choice%"=="3" goto WATCHDOG
if "%choice%"=="4" goto REFRESH
if "%choice%"=="5" goto FULL_AUTO
if "%choice%"=="0" goto END
goto AUTO_START

:AUTO_START
echo.
echo 🔧 运行自动修复...
node scripts/auto-fix.js
echo.
echo 🚀 启动服务器...
start "StockDashboard" /MIN cmd /c "node dashboard/server.js"
timeout /t 3 >nul
start http://localhost:3000
echo ✅ 仪表盘已启动: http://localhost:3000
goto END

:START_ONLY
echo 🚀 启动服务器...
start "StockDashboard" /MIN cmd /c "node dashboard/server.js"
timeout /t 3 >nul
start http://localhost:3000
goto END

:WATCHDOG
echo 🔍 启动守护进程 (崩溃自动重启)...
node scripts/watchdog.js
goto END

:REFRESH
echo 📡 刷新市场数据...
node scripts/fetch-sina-data.js
goto END

:FULL_AUTO
echo 🔧 自动修复...
node scripts/auto-fix.js
echo 🔍 启动守护模式...
node scripts/watchdog.js
goto END

:END
echo.
echo 按任意键关闭...
pause >nul
