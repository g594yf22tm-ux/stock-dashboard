/**
 * visual-check.js — Playwright 可视化验证
 * =========================================
 * 用真实浏览器打开所有页面，截图验证渲染是否正常。
 *
 * 用法: node scripts/visual-check.js
 */

'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(ROOT, 'screenshots', 'visual-check');
const BASE_URL = 'http://localhost:3000';

// ── 工具 ──────────────────────────────────────────────────────────────────
function log(msg, color) { console.log((color||'') + msg + '\x1b[0m'); }

async function checkPage(page, url, name) {
  log('  📸 ' + name + '...', '\x1b[36m');
  try {
    await page.goto(BASE_URL + url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // 截图
    const filePath = path.join(SCREENSHOT_DIR, name.replace(/[\/\s]/g, '_') + '.png');
    await page.screenshot({ path: filePath, fullPage: true });

    // 检测关键元素
    const checks = {};
    checks.hasContent = await page.evaluate(() => {
      const body = document.body.innerText;
      return body.length > 100 && !body.includes('加载中...') && !body.includes('数据加载失败');
    });
    checks.noError = await page.evaluate(() => {
      return !document.body.innerText.includes('Error') &&
             !document.body.innerText.includes('❌') &&
             !document.body.innerText.includes('失败');
    });

    const status = checks.hasContent && checks.noError ? '✅' : '⚠️';
    log('    ' + status + ' 内容:' + checks.hasContent + ' 无错:' + checks.noError + ' → ' + filePath,
      checks.hasContent && checks.noError ? '\x1b[32m' : '\x1b[33m');
    return { name, url, ...checks, filePath, status: checks.hasContent && checks.noError ? 'PASS' : 'WARN' };
  } catch (e) {
    log('    ❌ 错误: ' + e.message, '\x1b[31m');
    return { name, url, hasContent: false, noError: false, status: 'FAIL', error: e.message };
  }
}

// ── 主流程 ──────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  log('\n╔══════════════════════════════════════════╗', '\x1b[36m');
  log('║   🔍 Playwright 可视化验证              ║', '\x1b[36m');
  log('╚══════════════════════════════════════════╝\n', '\x1b[36m');

  // 先确认服务器在运行
  const http = require('http');
  const serverOk = await new Promise(resolve => {
    http.get(BASE_URL + '/api/health', res => resolve(res.statusCode === 200))
      .on('error', () => resolve(false));
  });

  if (!serverOk) {
    log('❌ 服务器未运行，请先启动: npm start', '\x1b[31m');
    process.exit(1);
  }

  log('🚀 启动浏览器 (Edge)...\n', '\x1b[36m');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true
  });

  const results = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: 'zh-CN'
    });
    const page = await context.newPage();

    // 测试所有页面
    const pages = [
      ['/', '主仪表盘'],
      ['/standalone.html', '轻量版仪表盘'],
      ['/reports.html', '报告浏览页'],
      ['/report.html?file=600036_招商银行_deep_dive_2026-05-31.md', '报告查看器(招行)'],
    ];

    for (const [url, name] of pages) {
      const result = await checkPage(page, url, name);
      results.push(result);
    }

    // 测试搜索功能
    log('  🔍 测试搜索...', '\x1b[36m');
    await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
    await page.fill('#searchInput', '600519');
    await page.waitForTimeout(1500);
    const searchResults = await page.evaluate(() => {
      const el = document.querySelector('.search-results');
      return el ? el.innerText.substring(0, 100) : '无搜索结果';
    });
    log('    搜索结果: ' + searchResults, '\x1b[32m');

    // 测试股票详情弹窗
    log('  📋 测试股票详情...', '\x1b[36m');
    await page.evaluate(() => {
      // 点击第一只股票的详情按钮
      const rows = document.querySelectorAll('tbody tr');
      if (rows[0]) rows[0].click();
    });
    await page.waitForTimeout(1500);
    const detailVisible = await page.evaluate(() => {
      const overlay = document.querySelector('.detail-overlay');
      return overlay && window.getComputedStyle(overlay).display !== 'none';
    });
    log('    详情弹窗: ' + (detailVisible ? '✅ 正常打开' : '⚠️ 未打开'), detailVisible ? '\x1b[32m' : '\x1b[33m');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'detail_modal.png') });

    await page.close();
  } finally {
    await browser.close();
  }

  // ── 总结 ──
  const passed = results.filter(r => r.status === 'PASS').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('📊 验证结果: ' + passed + ' 通过, ' + warned + ' 警告, ' + failed + ' 失败');
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️' : '❌';
    log(`  ${icon} ${r.name} → ${r.filePath || r.error}`);
  });
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
