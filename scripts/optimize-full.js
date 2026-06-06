// optimize-full.js — 排版设计+功能全面优化
const fs = require('fs');
const f = 'f:/Claude code test/dashboard/public/index.html';
let c = fs.readFileSync(f, 'utf8');
let changes = 0;

// ═══════════════════════════════════════════════════════════════════════════
// 1. 修复热门关注数据行缺少成交额列
// ═══════════════════════════════════════════════════════════════════════════
// 找热门关注行模板：${F.vol(s.volume)}</td></tr>
const oldTrendRow = '${F.vol(s.volume)}</td></tr>';
const newTrendRow = '${F.vol(s.volume)}</td><td>${s.amount ? (s.amount/1e8).toFixed(2)+\'亿\' : \'—\'}</td></tr>';

// 只替换第一个（热门关注），不是关注列表
const firstTrend = c.indexOf(oldTrendRow);
const secondTrend = c.indexOf(oldTrendRow, firstTrend + 1);

if (firstTrend > 0) {
  // 第一个出现的是热门关注
  c = c.substring(0, firstTrend + oldTrendRow.length) + '<td>${s.amount ? (s.amount/1e8).toFixed(2)+\'亿\' : \'—\'}</td>' + c.substring(firstTrend + oldTrendRow.length);
  changes++; console.log('✓ 1. 热门关注数据行成交额已添加');
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. 添加排序指示器样式和逻辑
// ═══════════════════════════════════════════════════════════════════════════
const sortCSS = `
    .sort-arrow { margin-left: 4px; font-size: 0.7em; opacity: 0.4; }
    .sort-arrow.active { opacity: 1; color: var(--primary); }
    .sort-active { background: rgba(79,140,255,0.08); }
`;
const cssEnd = '</style>';
if (c.includes(cssEnd)) {
  c = c.replace(cssEnd, sortCSS + '\n  ' + cssEnd);
  changes++; console.log('✓ 2. 排序CSS已优化');
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. 粘性顶栏 + 数据新鲜度徽章
// ═══════════════════════════════════════════════════════════════════════════
const stickyCSS = `
    .top-bar {
      position: sticky; top: 0; z-index: 100;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 8px 16px;
      display: flex; align-items: center; gap: 12px;
      backdrop-filter: blur(12px);
      margin-bottom: 12px;
    }
    .top-bar .search-wrap { flex: 1; max-width: 500px; position: relative; }
    .top-bar .search-box { width: 100%; }
    .freshness-badge {
      font-size: 0.7em; padding: 3px 8px; border-radius: 10px;
      background: rgba(0,200,100,0.12); color: var(--up);
      white-space: nowrap;
    }
    .freshness-badge.stale { background: rgba(255,180,0,0.12); color: var(--accent); }
    .freshness-badge.old { background: rgba(255,80,80,0.1); color: var(--muted); }
    .quick-filters { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
    .quick-filters .qf-chip {
      font-size: 0.72em; padding: 3px 10px; border-radius: 12px;
      border: 1px solid var(--border); cursor: pointer;
      background: var(--surface2); color: var(--muted);
      transition: all 0.15s;
    }
    .quick-filters .qf-chip:hover { border-color: var(--primary); color: var(--text); }
    .quick-filters .qf-chip.active { background: var(--primary); color: #fff; border-color: var(--primary); }
    .back-to-top {
      position: fixed; bottom: 20px; right: 20px; z-index: 200;
      width: 40px; height: 40px; border-radius: 50%;
      background: var(--primary); color: #fff; border: none;
      cursor: pointer; font-size: 1.2em; display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: transform 0.2s;
    }
    .back-to-top:hover { transform: scale(1.1); }
    .back-to-top.show { display: flex; align-items: center; justify-content: center; }
`;
if (c.includes(cssEnd)) {
  c = c.replace(cssEnd, stickyCSS + '\n  ' + cssEnd);
  changes++; console.log('✓ 3. 粘性顶栏+筛选+回到顶部CSS已添加');
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. 在搜索框上方包裹粘性顶栏
// ═══════════════════════════════════════════════════════════════════════════
const searchBar = '<div class="search-wrap">';
if (c.includes(searchBar)) {
  // 找搜索区域的开始和结束
  const sbStart = c.indexOf('<div class="search-wrap">');
  // 找搜索区域结束（下一个独立元素开始前）
  const sbEnd = c.indexOf('</div>\n\n  <!-- 自选股 -->', sbStart);
  if (sbEnd > sbStart) {
    const searchSection = c.substring(sbStart, sbEnd + 6);
    // 用粘性顶栏包裹搜索 + 刷新按钮 + 新鲜度
    const topBarHTML = `
  <!-- 粘性顶栏 -->
  <div class="top-bar" id="topBar">
    ${searchSection}
    <button class="btn" onclick="refreshAll()" id="refreshBtn">🔄 刷新</button>
    <span class="freshness-badge" id="freshnessBadge">● 实时</span>
    <a href="/report.html" class="btn" style="text-decoration:none;font-size:0.82em">📄 报告</a>
  </div>

  <!-- 快捷筛选 -->
  <div class="quick-filters" id="quickFilters" style="display:none">
    <span style="font-size:0.72em;color:var(--muted);margin-right:4px">筛选:</span>
    <span class="qf-chip active" onclick="_filterWatchlist('all',this)">全部</span>
    <span class="qf-chip" onclick="_filterWatchlist('BUY',this)">🟢 看多</span>
    <span class="qf-chip" onclick="_filterWatchlist('HOLD',this)">🟡 观望</span>
    <span class="qf-chip" onclick="_filterWatchlist('WATCH',this)">🔴 回避</span>
  </div>`;

    c = c.substring(0, sbStart) + topBarHTML + c.substring(sbEnd + 6);
    changes++; console.log('✓ 4. 粘性顶栏+筛选已注入');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. 删除旧的刷新按钮（已移到顶栏）和报告链接
// ═══════════════════════════════════════════════════════════════════════════
// 旧刷新按钮
c = c.replace('<button class="btn" onclick="refreshAll()" id="refreshBtn">🔄 刷新</button>', '');
// 旧报告链接（顶栏已包含）
c = c.replace('<a href="/report.html" class="btn" style="font-size:0.82em;text-decoration:none;margin-left:auto">📄 报告</a>', '');

// ═══════════════════════════════════════════════════════════════════════════
// 6. 注入辅助JS：筛选/回到顶部/新鲜度/排序增强
// ═══════════════════════════════════════════════════════════════════════════
const bodyEnd = '</body>';
if (c.includes(bodyEnd)) {
  const jsBlock = `
<script>
// ── 快捷筛选 ──
function _filterWatchlist(type, el) {
  document.querySelectorAll('.qf-chip').forEach(function(c){c.classList.remove('active');});
  if (el) el.classList.add('active');
  var rows = document.querySelectorAll('#watchlistBody tr');
  rows.forEach(function(r){
    var sigCell = r.querySelector('.badge');
    var sig = sigCell ? sigCell.innerText : '';
    if (type === 'all') { r.style.display = ''; return; }
    if (type === 'BUY' && (sig.includes('看多')||sig.includes('偏多'))) { r.style.display = ''; }
    else if (type === 'HOLD' && sig.includes('震荡')) { r.style.display = ''; }
    else if (type === 'WATCH' && (sig.includes('回避')||sig.includes('偏弱'))) { r.style.display = ''; }
    else { r.style.display = 'none'; }
  });
  // 显示筛选器
  document.getElementById('quickFilters').style.display = 'flex';
}

// ── 回到顶部 ──
(function(){
  var btn = document.createElement('button');
  btn.className = 'back-to-top';
  btn.innerHTML = '↑';
  btn.title = '回到顶部';
  btn.onclick = function(){ window.scrollTo({top:0,behavior:'smooth'}); };
  document.body.appendChild(btn);
  window.addEventListener('scroll', function(){
    btn.classList.toggle('show', window.scrollY > 500);
  });
})();

// ── 数据新鲜度更新 ──
function _updateFreshness() {
  var badge = document.getElementById('freshnessBadge');
  if (!badge) return;
  var now = new Date();
  var mins = now.getMinutes();
  // 周末或盘后: 显示"已收盘"标记
  var day = now.getDay(), h = now.getHours();
  var t = h * 60 + mins;
  var isTrading = (day >= 1 && day <= 5) && ((t >= 9*60+15 && t <= 11*60+30) || (t >= 13*60 && t <= 15*60));
  if (isTrading) {
    badge.textContent = '● 交易中';
    badge.className = 'freshness-badge';
  } else {
    badge.textContent = '○ 已收盘';
    badge.className = 'freshness-badge stale';
  }
}
_updateFreshness();
setInterval(_updateFreshness, 30000);

// ── 增强排序指示器 ──
var _origSortTable = sortTable;
sortTable = function(col) {
  _origSortTable(col);
  // 高亮当前排序列
  document.querySelectorAll('th').forEach(function(th){th.classList.remove('sort-active');});
  var ths = document.querySelectorAll('th');
  var colMap = {price:3, change:4, changePercent:5, volume:6, amount:7};
  var idx = colMap[col] || -1;
  if (idx >= 0 && ths[idx]) ths[idx].classList.add('sort-active');
};
</script>
`;
  c = c.replace(bodyEnd, jsBlock + bodyEnd);
  changes++; console.log('✓ 6. 辅助JS已注入');
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. 卡片悬浮效果和视觉增强
// ═══════════════════════════════════════════════════════════════════════════
const cardCSS = `
    .card { transition: box-shadow 0.2s, transform 0.15s; }
    .card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
    .sector-tag {
      display: inline-block; padding: 1px 6px; border-radius: 4px;
      font-size: 0.75em; background: rgba(79,140,255,0.1);
      color: var(--primary); white-space: nowrap;
      margin: 0 2px;
    }
    /* 市场状态指示器 */
    .market-status {
      font-size: 0.75em; padding: 2px 8px; border-radius: 10px;
      display: inline-block; margin-left: 6px;
    }
    .market-status.open { background: rgba(0,200,100,0.12); color: var(--up); }
    .market-status.closed { background: rgba(255,180,0,0.1); color: var(--accent); }
    /* 表格行斑马纹 */
    #watchlistBody tr:nth-child(even) { background: rgba(255,255,255,0.01); }
    #watchlistBody tr:hover { background: rgba(79,140,255,0.06) !important; }
    /* 信号徽章动画 */
    .badge { transition: all 0.15s; }
    .badge:hover { filter: brightness(1.1); }
    /* 指数卡片 */
    .index-card {
      display: inline-flex; align-items: center; gap: 14px;
      padding: 10px 16px; background: var(--surface2);
      border-radius: 10px; margin: 4px;
      transition: transform 0.15s;
    }
    .index-card:hover { transform: translateY(-1px); }
    .index-card .ic-price { font-size: 1.1em; font-weight: 700; font-family: 'JetBrains Mono','Consolas',monospace; }
    .index-card .ic-change { font-size: 0.85em; font-weight: 600; }
`;
if (c.includes(cssEnd)) {
  c = c.replace(cssEnd, cardCSS + '\n  ' + cssEnd);
  changes++; console.log('✓ 7. 卡片视觉增强CSS已添加');
}

fs.writeFileSync(f, c);
console.log('\n✅ 共 ' + changes + ' 项优化完成');
console.log('文件大小: ' + c.length + ' 字符');
