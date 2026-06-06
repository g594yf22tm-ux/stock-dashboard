// fix-all-issues.js — 修复浏览测试发现的全部问题
const fs = require('fs');
const f = 'f:/Claude code test/dashboard/public/index.html';
let c = fs.readFileSync(f, 'utf8');
let fixes = 0;

// ── Fix 1: "185只有" → "185只 · 包含" ──
const oldTip = '📡 CDN模式 · 185只有实时行情';
const newTip = '📡 CDN模式 · 185只实时行情覆盖';
if (c.includes(oldTip)) {
  c = c.replace(new RegExp(oldTip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newTip);
  fixes++; console.log('✓ Fix 1: 语法错误已修复');
}

// ── Fix 2: 恢复 deleteReport 函数 ──
if (!c.includes('async function deleteReport(')) {
  const insertAfter = 'async function removeFav(ticker) {';
  const idx = c.indexOf(insertAfter);
  if (idx > 0) {
    // Find the end of removeFav function
    let depth = 0, end = idx;
    for (let i = idx; i < c.length; i++) {
      if (c[i] === '{') depth++;
      if (c[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    const deleteReportFn = `
async function deleteReport(filename, btn) {
  if (isRemote) {
    _hideReport(decodeURIComponent(filename));
    if (btn) { const row = btn.closest('.report-row'); if (row) row.style.display = 'none'; }
    showToast('已隐藏（可恢复）');
    refreshAll();
  } else {
    try {
      const r = await fetch('/api/reports/' + filename, { method: 'DELETE' });
      if (r.ok) { if (btn) { const row = btn.closest('.report-row'); if (row) row.remove(); } showToast('已删除'); refreshAll(); }
      else { const t = await r.text(); showToast('删除失败: ' + t); }
    } catch(e) { showToast('删除失败: ' + e.message); }
  }
}
`;
    c = c.substring(0, end) + '\n' + deleteReportFn + c.substring(end);
    fixes++; console.log('✓ Fix 2: deleteReport 函数已恢复');
  }
}

// ── Fix 3: 修复 quotes_ext.json 重复加载 ──
// 问题：预加载和 fetchCDN 都在加载，把预加载改为使用 fetchCDN 的结果
const dupLoad = `if (isRemote) {
  fetchCDN('quotes_ext.json').then(data => {
    if (data && data.quotes) {
      _extQuotes = {};
      data.quotes.forEach(q => { _extQuotes[q.t] = q; });
      console.log('预加载扩展行情:', Object.keys(_extQuotes).length, '只');
      try { loadFavorites(); } catch {}
    }
  }).catch(() => {});
}`;

const fixedLoad = `if (isRemote) {
  // 单次加载扩展行情（避免重复请求）
  _loadExtQuotes().then(() => {
    try { loadFavorites(); } catch {}
  });
}`;

if (c.includes(dupLoad)) {
  c = c.replace(dupLoad, fixedLoad);
  // Add helper function before fetchCDN
  const helperFn = `
// 扩展行情加载（仅加载一次）
let _extQuotesLoaded = false;
async function _loadExtQuotes() {
  if (_extQuotesLoaded) return;
  _extQuotesLoaded = true;
  try {
    const data = await fetchCDN('quotes_ext.json');
    if (data && data.quotes) {
      _extQuotes = {};
      data.quotes.forEach(q => { _extQuotes[q.t] = q; });
      console.log('扩展行情:', Object.keys(_extQuotes).length, '只');
    }
  } catch(e) { console.error('扩展行情加载失败'); }
}
`;
  const fetchCDNIdx = c.indexOf('async function fetchCDN(');
  if (fetchCDNIdx > 0) {
    c = c.substring(0, fetchCDNIdx) + helperFn + '\n' + c.substring(fetchCDNIdx);
  }
  fixes++; console.log('✓ Fix 3: quotes_ext.json 重复加载已修复');
}

// ── Fix 4: 隐藏PE列（全"—"无数据） ──
// 在关注列表表头中移除市盈率，并在数据行中移除对应td
// 表头
const oldPEth = '<th>市盈率</th>';
if (c.includes(oldPEth)) {
  c = c.replace(oldPEth, '');
  fixes++; console.log('✓ Fix 4a: PE表头已移除');
}
// 数据行中 PE 的 td（显示"—"的那列）
const oldPEtd = '<td style="color:${peColor}">${s.pe ? (+s.pe).toFixed(1) : \'—\'}</td>';
if (c.includes(oldPEtd)) {
  c = c.replace(oldPEtd, '');
  fixes++; console.log('✓ Fix 4b: PE列数据已移除');
}

// ── Fix 5: 热门关注添加成交额列 ──
// 热门关注目前5列：代码 | 名称 | 价格 | 涨跌幅 | 成交量
// 添加成交额
const trendThead = '<th>成交量</th>';
const trendTheadNew = '<th>成交量</th><th>成交额</th>';
// 只在热门关注区域修改（第一个表格）
const firstTrend = c.indexOf(trendThead);
const lastTrend = c.indexOf(trendThead, firstTrend + 1);
// 热门关注的表头是第一个出现"成交量"的地方
if (firstTrend > 0) {
  // 只改第一个（热门关注表格）
  c = c.substring(0, firstTrend + trendThead.length) + '<th>成交额</th>' + c.substring(firstTrend + trendThead.length);
  fixes++; console.log('✓ Fix 5a: 热门关注表头已添加成交额');
}

// 热门关注数据行添加成交额td
// 找 trending 渲染代码
const trendVol = 'F.vol(s.volume)';
if (c.includes(trendVol)) {
  // 在成交量后面加成交额
  const trendAmountCol = '<td>${s.amount ? (s.amount/1e8).toFixed(2)+\'亿\' : \'—\'}</td>';
  // 找热门关注行模板（第一个 F.vol 在热门关心里）
  const firstVol = c.indexOf(trendVol);
  // 找这行结束 </tr>
  const trEnd = c.indexOf('</tr>', firstVol);
  if (trEnd > firstVol) {
    c = c.substring(0, trEnd) + trendAmountCol + c.substring(trEnd);
    fixes++; console.log('✓ Fix 5b: 热门关注数据行已添加成交额');
  }
}

// ── Fix 6: 添加 getStockNews 函数 ──
if (!c.includes('function getStockNews(')) {
  const fnBodyEnd = '</body>';
  const newsFn = `
<script>
// CDN模式新闻获取（报告弹窗使用）
async function getStockNews(code, name) {
  if (!isRemote) {
    try {
      const r = await fetch('/api/news/' + encodeURIComponent(code));
      if (r.ok) { const d = await r.json(); return d.news || []; }
    } catch(e) {}
  }
  return [];
}
</script>
`;
  c = c.replace(fnBodyEnd, newsFn + '\n' + fnBodyEnd);
  fixes++; console.log('✓ Fix 6: getStockNews 函数已添加');
}

// ── Fix 7: chart.js 同源加载（可选，不影响功能） ──
// chart.js 从 jsDelivr 加载是正常的，但可以改为同源
// 暂不修改，因为 chart.js 体积大且版本固定

fs.writeFileSync(f, c);
console.log('\n✅ 共修复 ' + fixes + ' 处问题');
console.log('文件大小: ' + c.length + ' 字符');
