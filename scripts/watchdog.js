/**
 * watchdog.js — v2.0 守护进程
 * =============================
 * 监控Express服务器，崩溃自动重启。24/7不中断运行。
 *
 * 用法: node scripts/watchdog.js
 */

'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVER_SCRIPT = path.join(ROOT, 'dashboard', 'server.js');
const CHECK_INTERVAL = 10000; // 每10秒检查一次
const MAX_RESTARTS = 10;      // 每小时最多重启10次
const RESTART_WINDOW = 3600000; // 1小时窗口

let restartHistory = [];
let serverProcess = null;
let running = true;

function log(msg) {
  const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`[${ts}] ${msg}`);
}

function healthCheck() {
  return new Promise(resolve => {
    const req = http.get('http://localhost:3000/api/health', { timeout: 5000 }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function startServer() {
  // 检查重启频率
  const now = Date.now();
  restartHistory = restartHistory.filter(t => now - t < RESTART_WINDOW);
  if (restartHistory.length >= MAX_RESTARTS) {
    log('⚠️  重启次数过多(' + restartHistory.length + '/' + MAX_RESTARTS + ')，暂停5分钟');
    setTimeout(() => {
      restartHistory = [];
      startServer();
    }, 300000);
    return;
  }

  log('🚀 启动Express服务器...');
  restartHistory.push(now);

  serverProcess = spawn('node', [SERVER_SCRIPT], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  serverProcess.on('exit', (code) => {
    log('⚠️  服务器退出 (code: ' + code + ')，3秒后重启...');
    setTimeout(() => {
      if (running) startServer();
    }, 3000);
  });

  serverProcess.on('error', (err) => {
    log('❌ 服务器启动失败: ' + err.message);
  });
}

async function monitor() {
  log('🔍 守护进程已启动，每' + CHECK_INTERVAL/1000 + '秒检查一次');

  // 先启动服务器
  startServer();

  // 等待服务器启动
  await new Promise(r => setTimeout(r, 5000));

  while (running) {
    const healthy = await healthCheck();
    if (!healthy) {
      log('⚠️  服务器无响应，发送SIGTERM...');
      if (serverProcess) {
        try { process.kill(serverProcess.pid, 'SIGTERM'); } catch {}
      }
      await new Promise(r => setTimeout(r, 2000));
      startServer();
    } else {
      // 静默运行，每60秒打印一次状态
      const now = new Date();
      if (now.getSeconds() < 10) {
        log('✅ 服务器正常 (' + restartHistory.length + '次重启/小时)');
      }
    }
    await new Promise(r => setTimeout(r, CHECK_INTERVAL));
  }
}

process.on('SIGINT', () => {
  log('🛑 守护进程已停止');
  running = false;
  if (serverProcess) serverProcess.kill();
  process.exit(0);
});

monitor().catch(err => {
  log('❌ 守护进程错误: ' + err.message);
  process.exit(1);
});
