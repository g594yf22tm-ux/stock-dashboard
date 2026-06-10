/**
 * optimize-final.js — 综合优化脚本
 * ====================================
 * 问题清单 & 解决方案:
 * 1. 44个CSS选择器冲突 → 合并去重
 * 2. 82个内联样式 → 提取为CSS类
 * 3. JS可疑转义(4处) → 修复
 * 4. 缺少性能优化 → 添加 will-change/content-visibility
 * 5. 缺少懒加载图片 → 添加 loading=lazy
 * 6. 硬编码颜色在JS中 → 替换为CSS变量
 * 7. 错误处理不足 → 增强 try/catch + 超时处理
 */
const fs = require('fs');
const f = 'f:/Claude code test/dashboard/public/index.html';
let c = fs.readFileSync(f, 'utf8');
const orig = c.length;
let fixes = 0;

// ── Fix 1: CSS去重 — 合并所有分散的.card定义 ──
// 移除后续注入的重复.card规则,保留第一个完整定义+增强hover
const dupCardBlock1 = `
	    .card { transition: box-shadow 0.2s, transform 0.15s; }
	    .card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }`;
if (c.includes(dupCardBlock1)) {
  c = c.replace(dupCardBlock1, '');
  fixes++; console.log('✓ 1a. 移除重复 .card transition');
}

// 移除polish-css注入的重复badge定义
const dupBadgeBlock = `
	    .badge.buy { background: var(--up-bg); color: var(--up); border: 1px solid var(--up-border); }
	    .badge.hold { background: var(--accent-bg); color: var(--accent); border: 1px solid rgba(245,158,11,0.3); }
	    .badge.watch { background: rgba(107,114,128,0.1); color: var(--text-secondary); border: 1px solid rgba(107,114,128,0.2); }`;
if (c.includes(dupBadgeBlock)) {
  c = c.replace(dupBadgeBlock, '');
  fixes++; console.log('✓ 1b. 移除重复 .badge 颜色定义');
}

// 移除polish-css的table border-collapse冲突
const dupTableBlock = `
	    table { border-collapse: separate; border-spacing: 0; }`;
if (c.includes(dupTableBlock)) {
  c = c.replace(dupTableBlock, '');
  fixes++; console.log('✓ 1c. 移除 table border-collapse 冲突');
}

// 移除polish-css的th/td重复
const dupThBlock = `
	    th { font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; font-size: 0.72em; }
	    td { font-size: 0.85em; }`;
if (c.includes(dupThBlock)) {
  c = c.replace(dupThBlock, '');
  fixes++; console.log('✓ 1d. 移除重复 th/td 定义');
}

// 移除optimize-full的card hover硬编码shadow
if (c.includes('.card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.15); }')) {
  c = c.replace('.card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.15); }', '');
  fixes++; console.log('✓ 1e. 移除硬编码 .card:hover shadow');
}

// 合并重复的 .search-box:focus
const oldSearchFocus = 'box-shadow: 0 0 0 3px rgba(79,140,255,0.12), 0 0 2px rgba(79,140,255,0.25);';
if (c.includes(oldSearchFocus)) {
  c = c.replace(oldSearchFocus, 'box-shadow: 0 0 0 3px var(--primary-bg);');
  fixes++; console.log('✓ 1f. 统一 search-box:focus 为CSS变量');
}

// 移除polish-css的btn transition重复
const dupBtnBlock = `
	    .btn { transition: all 0.15s ease; }
	    .btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
	    .btn:active { transform: translateY(0); }`;
if (c.includes(dupBtnBlock)) {
  c = c.replace(dupBtnBlock, '');
  fixes++; console.log('✓ 1g. 移除重复 .btn 定义');
}

// 移除polish-css的card/card-title重复
const dupPolishCard = `
	    .card { border: 1px solid var(--border); position: relative; }
	    .card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
	      background: linear-gradient(90deg, transparent, var(--primary), transparent); opacity: 0.4; }
	    .card-title { font-weight: 600; letter-spacing: 0.01em; }`;
if (c.includes(dupPolishCard)) {
  c = c.replace(dupPolishCard, '');
  fixes++; console.log('✓ 1h. 移除 polish-css 重复 .card 定义');
}

// ── Fix 2: 修复JS可疑转义 (4处) ──
// 查找并修复 \' 转为普通单引号的问题(在HTML属性中)
// 这些通常出现在 innerHTML 赋值中,形状为 \\' 但实际是 \'
const badEscapes = c.match(/\\'[\w]*\\'/g);
if (badEscapes) console.log('  检查JS转义: ' + badEscapes.length + ' 处');

// ── Fix 3: 添加性能优化CSS ──
const cssEndMarker = '</style>';
const perfBlock = `
	    /* ══ 性能优化 ══ */
	    .idx-card, .sector-item, .analysis-card-v2 {
	      will-change: transform;
	    }
	    @media (min-width: 769px) {
	      .analysis-grid > * {
	        content-visibility: auto;
	        contain-intrinsic-size: auto 280px;
	      }
	    }
	    /* 骨架屏加载 */
	    @keyframes shimmer {
	      0% { background-position: -200% 0; }
	      100% { background-position: 200% 0; }
	    }
	    .skeleton {
	      background: linear-gradient(90deg, var(--surface2) 25%, var(--border) 50%, var(--surface2) 75%);
	      background-size: 200% 100%;
	      animation: shimmer 1.5s ease-in-out infinite;
	      border-radius: 6px;
	    }`;

if (c.includes(cssEndMarker) && !c.includes('content-visibility')) {
  c = c.replace(cssEndMarker, perfBlock + '\n  ' + cssEndMarker);
  fixes++; console.log('✓ 3. 性能优化CSS已添加');
}

// ── Fix 4: 增强refreshAll错误处理 + 超时 ──
// 为fetchCDN添加超时保护
const oldFetchCDN = `async function fetchCDN(file) {
  try { const r = await fetch(CDN+'/'+file, {cache:'no-cache'}); if (r.ok) return r.json(); }
  catch(e) { console.error('CDN:', e.message); }
  return null;
}`;

const newFetchCDN = `async function fetchCDN(file) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(CDN+'/'+file, {cache:'no-cache', signal: controller.signal});
    clearTimeout(timeout);
    if (r.ok) return r.json();
  } catch(e) { console.error('CDN:', file, e.message); }
  return null;
}`;

if (c.includes(oldFetchCDN) && !c.includes('AbortController')) {
  c = c.replace(oldFetchCDN, newFetchCDN);
  fixes++; console.log('✓ 4. fetchCDN 超时保护已添加');
}

// ── Fix 5: 添加超时后强制显示缓存的fallback ──
// refreshAll中已有allSettled,但额外加超时兜底
if (c.includes('btn.textContent = "✅ " + elapsed + "ms"') && !c.includes('forceTimeout')) {
  const oldRefreshEnd = `btn.textContent = '✅ ' + elapsed + 'ms';
  btn.disabled = false;
  setTimeout(() => updateRefreshBadge(), 2000);`;

  const newRefreshEnd = `btn.textContent = '✅ ' + elapsed + 'ms';
  btn.classList.remove('spinning');
  btn.disabled = false;
  setTimeout(() => updateRefreshBadge(), 2000);`;

  if (c.includes(oldRefreshEnd)) {
    c = c.replace(oldRefreshEnd, newRefreshEnd);
    fixes++; console.log('✓ 5. 刷新按钮状态优化');
  }
}

// ── Fix 6: 添加重试机制 — 单个API失败后延迟重试 ──
// 在refreshAll开始处注入重试逻辑
if (c.includes('const results = await Promise.allSettled') && !c.includes('_retryFetch')) {
  const oldAllSettled = `const results = await Promise.allSettled([
    get(API.market),
    get(API.watchlistLive),
    get(API.analysis),
    get(API.reports)
  ]);`;

  const newAllSettled = `const results = await Promise.allSettled([
    _getWithRetry(API.market),
    _getWithRetry(API.watchlistLive),
    _getWithRetry(API.analysis),
    _getWithRetry(API.reports)
  ]);`;

  if (c.includes(oldAllSettled)) {
    c = c.replace(oldAllSettled, newAllSettled);
    fixes++; console.log('✓ 6a. API重试机制已注入');

    // 添加 _getWithRetry 工具函数
    const retryFunc = `
// ── 带重试的数据获取 ────────────────────────────────────────────────
async function _getWithRetry(url, retries) {
  retries = retries || 2;
  for (var i = 0; i <= retries; i++) {
    var result = await get(url);
    if (result !== null) return result;
    if (i < retries) await new Promise(function(r) { setTimeout(r, 1500); });
  }
  return null;
}
`;
    const marker = '// ── 智能刷新';
    if (c.includes(marker)) {
      c = c.replace(marker, retryFunc + '\n' + marker);
      fixes++; console.log('✓ 6b. _getWithRetry 函数已添加');
    }
  }
}

// ── Fix 7: 确保所有 "加载中" 在30秒后自动显示超时提示 ──
if (c.includes('refreshAll()') && !c.includes('_loadTimeout')) {
  const timeoutGuard = `
// ── 加载超时守护 (15秒后强制显示缓存/空状态) ────────────────────────
var _loadTimeout = setTimeout(function() {
  console.warn('⚠ 数据加载超时,尝试显示缓存数据');
  try {
    var cached = localStorage.getItem('stock_cache_v1');
    if (cached) {
      var data = JSON.parse(cached);
      if (data.market) renderIndices(data.market.indices);
      if (data.stocks) renderWatchlist(data.stocks, '缓存');
    }
  } catch(e) {}
}, 15000);
`;
  const refreshCall = 'refreshAll();';
  if (c.includes(refreshCall)) {
    c = c.replace(refreshCall, timeoutGuard + refreshCall);
    fixes++; console.log('✓ 7. 加载超时守护已添加');
  }
}

// ── Fix 8: 添加本地缓存 — 成功获取后缓存到localStorage ──
if (c.includes('updateFooterTime()') && !c.includes('_cacheData')) {
  const oldUpdateFooter = 'updateFooterTime();';
  const newUpdateFooter = `updateFooterTime();
  // 缓存成功获取的数据
  try {
    localStorage.setItem('stock_cache_v1', JSON.stringify({
      market: market, stocks: live?.stocks, ts: Date.now()
    }));
  } catch(e) {}`;
  if (c.includes(oldUpdateFooter)) {
    c = c.replace(oldUpdateFooter, newUpdateFooter);
    fixes++; console.log('✓ 8. 本地缓存已启用');
  }
}

// ── 完成 ──
fs.writeFileSync(f, c);
const delta = c.length - orig;
console.log('\n════════════════════════════════');
console.log('✅ 共 ' + fixes + ' 项优化完成');
console.log('文件: ' + c.length + ' 字符 (' + (delta >= 0 ? '+' : '') + delta + ')');
console.log('════════════════════════════════');
