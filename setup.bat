@echo off
chcp 65001 >nul
title 股票仪表盘 - 一键启动

echo.
echo   ╔══════════════════════════════════════════════╗
echo   ║     📊 股票分析仪表盘 — 一键安装启动         ║
echo   ╚══════════════════════════════════════════════╝
echo.

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   ❌ 未安装 Node.js
    echo   📥 请先下载: https://nodejs.org
    pause
    exit /b 1
)
echo   ✅ Node.js: %node_version%

:: 安装依赖
if not exist "node_modules" (
    echo   📦 安装依赖中...
    call npm install
)
echo   ✅ 依赖已就绪

:: 初始化数据
echo   📊 初始化数据...
node scripts\init-dashboard-data.js

:: 防火墙
echo   🔓 网络配置...
netsh advfirewall firewall add rule name="Dashboard 3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
powershell -Command "Get-NetConnectionProfile | Set-NetConnectionProfile -NetworkCategory Private" >nul 2>&1
echo   ✅ 防火墙已放行

:: IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr "IPv4" ^| findstr "192.168."') do set IP=%%a
set IP=%IP: =%

echo.
echo   ╔══════════════════════════════════════════════╗
echo   ║  🟢 启动成功                                 ║
echo   ║                                              ║
echo   ║  💻 本机: http://localhost:3000               ║
echo   ║  📱 手机: http://%IP%:3000    ║
echo   ║                                              ║
echo   ║  📦 换电脑: git clone + setup.bat            ║
echo   ║  ⚠️  关闭此窗口 = 停止                       ║
echo   ╚══════════════════════════════════════════════╝
echo.

node dashboard\server.js
pause
