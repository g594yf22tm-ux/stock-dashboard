/**
 * auto-fix.js — v2.0 自动修复系统
 * =================================
 * 检查所有组件、自动修复问题，无需人工干预。
 *
 * 检查项:
 *   1. 依赖模块是否可加载
 *   2. 数据文件是否存在且有效
 *   3. 新浪API连通性
 *   4. 页面JS语法是否正确
 *   5. 自动修复检测到的问题
 *
 * 用法: node scripts/auto-fix.js [--watch]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'dashboard', 'data');
const PUBLIC_DIR = path.join(ROOT, 'dashboard', 'public');
const CONFIG_DIR = path.join(ROOT, 'dashboard', 'config');

// ── 日志 ──────────────────────────────────────────────────────────────────
const colors = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', reset: '\x1b[0m' };
function ok(msg) { console.log(colors.green + '  ✅ ' + msg + colors.reset); }
function warn(msg) { console.log(colors.yellow + '  ⚠️  ' + msg + colors.reset); }
function fail(msg) { console.log(colors.red + '  ❌ ' + msg + colors.reset); }
function info(msg) { console.log(colors.cyan + '  ℹ️  ' + msg + colors.reset); }
function section(msg) { console.log('\n' + colors.cyan + '━━━ ' + msg + ' ━━━' + colors.reset); }

let fixCount = 0;
let issueCount = 0;

// ── 工具函数 ──────────────────────────────────────────────────────────────
function loadJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ── 检查1: 依赖模块 ─────────────────────────────────────────────────────
function checkDependencies() {
  section('依赖模块检查');
  const deps = ['express', 'iconv-lite', 'pinyin-pro', 'compression'];
  let allOk = true;
  for (const dep of deps) {
    try {
      require.resolve(dep);
      ok(dep);
    } catch {
      fail(dep + ' — 正在安装...');
      try {
        execSync('npm install ' + dep + ' --no-save', { cwd: ROOT, stdio: 'pipe' });
        ok(dep + ' — 已安装');
        fixCount++;
      } catch (e) {
        fail(dep + ' — 安装失败: ' + e.message);
        issueCount++;
        allOk = false;
      }
    }
  }
  return allOk;
}

// ── 检查2: 数据文件 ─────────────────────────────────────────────────────
function checkDataFiles() {
  section('数据文件检查');
  const required = ['market.json', 'watchlist.json', 'analysis.json'];
  let allOk = true;

  for (const file of required) {
    const fp = path.join(DATA_DIR, file);
    if (!fs.existsSync(fp)) {
      fail(file + ' — 缺失，正在重新抓取...');
      regenerateData();
      fixCount++;
      if (fs.existsSync(fp)) ok(file + ' — 已重新生成');
      else { fail(file + ' — 生成失败'); issueCount++; allOk = false; }
    } else {
      const data = loadJSON(fp);
      if (!data) {
        fail(file + ' — JSON无效，重新生成...');
        regenerateData();
        fixCount++;
      } else {
        ok(file + ' (' + JSON.stringify(data).length + ' bytes)');
      }
    }
  }
  return allOk;
}

function regenerateData() {
  try {
    const script = path.join(ROOT, 'scripts', 'fetch-sina-data.js');
    execSync('node "' + script + '"', { cwd: ROOT, stdio: 'pipe', timeout: 30000 });
    ok('数据已刷新');
  } catch (e) {
    fail('数据刷新失败: ' + e.message);
  }
}

// ── 检查3: 新浪API连通性 ────────────────────────────────────────────────
function checkSinaAPI() {
  section('新浪API连通性');
  try {
    const sinaApi = require('../dashboard/services/sinaApi');
    return sinaApi.getQuote('000001.SS').then(q => {
      if (q && q.name) { ok('新浪API连接正常 (' + q.name + ' ¥' + q.price + ')'); return true; }
      else { warn('新浪API返回空数据'); return false; }
    }).catch(e => {
      fail('新浪API不可达: ' + e.message);
      issueCount++;
      return false;
    });
  } catch (e) {
    fail('sinaApi模块加载失败: ' + e.message);
    issueCount++;
    return Promise.resolve(false);
  }
}

// ── 检查4: 页面JS语法 ──────────────────────────────────────────────────
function checkPageSyntax() {
  section('页面JS语法检查');
  const pages = ['index.html', 'standalone.html', 'report.html', 'reports.html'];
  let allOk = true;

  for (const page of pages) {
    const fp = path.join(PUBLIC_DIR, page);
    if (!fs.existsSync(fp)) {
      fail(page + ' — 文件缺失!');
      issueCount++;
      allOk = false;
      continue;
    }
    const html = fs.readFileSync(fp, 'utf8');
    const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    let pageOk = true;
    scripts.forEach((s, i) => {
      const content = s.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
      if (content.length > 50) {
        try {
          new Function(content);
        } catch (e) {
          fail(page + ' 脚本块' + (i+1) + ': ' + e.message.substring(0, 60));
          pageOk = false;
          issueCount++;
        }
      }
    });
    if (pageOk) ok(page);
    else allOk = false;
  }
  return allOk;
}

// ── 检查5: 服务端口 ─────────────────────────────────────────────────────
function checkPort() {
  section('服务端口检查');
  const http = require('http');
  return new Promise(resolve => {
    const req = http.get('http://localhost:3000/api/health', res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          ok('服务器运行中 (uptime: ' + j.uptime + 's, Sina: ' + j.dataSources.sina + ')');
          resolve(true);
        } catch { ok('服务器运行中 (非JSON响应)'); resolve(true); }
      });
    });
    req.on('error', () => {
      warn('服务器未运行，正在启动...');
      startServer();
      resolve(false);
    });
    req.setTimeout(3000, () => { req.destroy(); warn('服务器响应超时'); resolve(false); });
  });
}

function startServer() {
  try {
    const serverScript = path.join(ROOT, 'dashboard', 'server.js');
    const child = spawn('node', [serverScript], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
    ok('服务器已启动 (PID: ' + child.pid + ')');
    fixCount++;
  } catch (e) {
    fail('服务器启动失败: ' + e.message);
    issueCount++;
  }
}

// ── 检查6: 报告文件 ─────────────────────────────────────────────────────
function checkReports() {
  section('分析报告检查');
  const reportsDir = path.join(ROOT, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
    warn('reports目录已创建（空）');
    return false;
  }
  const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.md'));
  ok(files.length + ' 份报告');
  return files.length > 0;
}

// ── 主流程 ──────────────────────────────────────────────────────────────
async function main() {
  console.log(colors.cyan + '╔══════════════════════════════════════════╗');
  console.log('║   🔧 A股仪表盘 v2.0 自动修复系统        ║');
  console.log('║   ' + new Date().toLocaleString('zh-CN') + '            ║');
  console.log('╚══════════════════════════════════════════╝' + colors.reset);

  const watch = process.argv.includes('--watch');

  do {
    fixCount = 0;
    issueCount = 0;

    checkDependencies();
    checkDataFiles();
    await checkSinaAPI();
    checkPageSyntax();
    checkReports();
    await checkPort();

    // ── 总结 ──
    console.log('\n' + '━'.repeat(50));
    if (issueCount === 0) {
      console.log(colors.green + '✅ 系统状态: 完全正常' + colors.reset);
    } else {
      console.log(colors.yellow + '⚠️  系统状态: ' + issueCount + ' 个问题, ' + fixCount + ' 个已自动修复' + colors.reset);
    }
    console.log('━'.repeat(50) + '\n');

    if (watch) {
      info('守护模式: 60秒后重新检查...');
      await new Promise(r => setTimeout(r, 60000));
    }
  } while (watch);
}

main().catch(err => {
  console.error(colors.red + '致命错误:', err.message + colors.reset);
  process.exit(1);
});
