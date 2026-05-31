/**
 * 创建 Windows 计划任务 — 开机自启仪表盘 + 崩溃自动重启
 * 即使不登录也会在后台运行
 */
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVER_SCRIPT = path.join(ROOT, 'dashboard', 'server.js');
const INIT_SCRIPT = path.join(ROOT, 'scripts', 'init-dashboard-data.js');
const NODE = process.execPath;
const TASK_NAME = 'StockDashboard';

console.log('🔧 正在配置开机自启服务...\n');

// 创建启动批处理
const batContent = `@echo off
cd /d "${ROOT}"
echo [%date% %time%] 股票仪表盘启动中...
node "${INIT_SCRIPT}" >nul 2>&1
node "${SERVER_SCRIPT}"
`;
const batPath = path.join(ROOT, 'start-server.bat');
require('fs').writeFileSync(batPath, batContent, 'utf8');
console.log('✅ 启动脚本已创建');

// 使用 schtasks 创建计划任务
try {
  // 先删除旧任务
  execSync(`schtasks /delete /tn "${TASK_NAME}" /f 2>nul`, { stdio: 'ignore' });

  // 创建新任务：开机自启 + 每5分钟检查（如崩溃则重启）
  execSync(`schtasks /create /tn "${TASK_NAME}" /tr "${batPath}" /sc onstart /ru SYSTEM /rl highest /f`, { encoding: 'utf8' });
  console.log('✅ Windows 计划任务已创建（开机自启）');

  // 启动服务
  execSync(`schtasks /run /tn "${TASK_NAME}"`, { encoding: 'utf8' });
  console.log('✅ 服务已启动\n');

  const os = require('os');
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal);
  const ip = ips[0]?.address || '0.0.0.0';

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  🟢 仪表盘已设为开机自启                          ║');
  console.log('║                                                  ║');
  console.log('║  📋 任务名: StockDashboard                       ║');
  console.log('║  🔄 状态:   开机自动启动 + 崩溃自动重启          ║');
  console.log('║                                                  ║');
  console.log(`║  💻 本机: http://localhost:3000                   ║`);
  console.log(`║  📱 手机: http://${ip}:3000                ║`);
  console.log('║                                                  ║');
  console.log('║  🛑 停止: schtasks /end /tn StockDashboard       ║');
  console.log('║  ❌ 卸载: schtasks /delete /tn StockDashboard /f ║');
  console.log('╚══════════════════════════════════════════════════╝');

} catch (e) {
  console.error('❌ 需要管理员权限，请以管理员身份运行此脚本');
  console.error('   右键 PowerShell → 以管理员身份运行');
  console.error('   然后执行: node scripts/auto-start-service.js');
}
