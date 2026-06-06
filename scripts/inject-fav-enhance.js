// inject-fav-enhance.js — 增强自选股分析
const fs = require('fs');
const f = 'f:/Claude code test/dashboard/public/index.html';
let c = fs.readFileSync(f, 'utf8');
let changes = 0;

// ── 1. 更新表头：增加「目标价」「潜在空间」「板块」 ──
const oldThead = `<th>代码</th><th>名称</th><th>最新价</th><th>涨跌</th><th>涨跌幅</th>
\t            <th>成交量</th><th>成交额</th><th>当日信号</th><th>操作</th>`;

const newThead = `<th>代码</th><th>名称</th><th>板块</th><th>最新价</th><th>涨跌幅</th>
\t            <th>目标价</th><th>潜在空间</th><th>成交额</th><th>分析信号</th><th>操作</th>`;

if (c.includes(oldThead)) {
  c = c.replace(oldThead, newThead);
  changes++;
  console.log('✓ 表头已扩展');
}

// ── 2. 更新 colspan ──
c = c.replace(/colspan="9"/g, 'colspan="11"');
console.log('✓ colspan 已更新');

// ── 3. 替换整个 loadFavorites 函数 ──
const oldFuncStart = 'async function loadFavorites() {';
const oldFuncEnd = "  } catch(e) { console.error('Fav load error:', e); }\n}";

// 找到函数体
const funcStartIdx = c.indexOf(oldFuncStart);
const funcEndIdx = c.indexOf(oldFuncEnd, funcStartIdx);

if (funcStartIdx > 0 && funcEndIdx > funcStartIdx) {
  const newFunc = `async function loadFavorites() {
  try {
    const data = await get(API.favorites);
    document.getElementById('favCount').textContent = data?.count || 0;
    document.getElementById('favSource').textContent = data?.source ? '(' + data.source + ')' : '';
    const tbody = document.getElementById('favBody');
    if (!data?.favorites?.length) {
      tbody.innerHTML = '<tr><td colspan="11" class="no-data">点击搜索结果的 ⭐ 或详情页的「加自选」来添加</td></tr>';
      return;
    }
    tbody.innerHTML = data.favorites.map(s => {
      // CDN模式: 从扩展行情/关注列表注入实时价格
      let price = s.price, change = s.change, changePercent = s.changePercent, volume = s.volume, amount = s.amount;
      let sector = s.sector || '', targetPrice = s.targetPrice || null, reason = s.reason || '';
      let signalScore = 50, signalText = '震荡观望', signalCls = 'hold';
      if (isRemote) {
        const wl = (_watchlistData||[]).find(x=>x.ticker===s.ticker);
        if (wl) {
          if (wl.price) { price = wl.price; change = wl.change; changePercent = wl.changePercent; volume = wl.volume; amount = wl.amount; }
          if (wl.sector) sector = wl.sector;
          if (wl.targetPrice) targetPrice = wl.targetPrice;
          if (wl.reason) reason = wl.reason;
          if (wl.signal) { signalScore = wl.signal.score; signalText = wl.signal.text; signalCls = wl.signal.signal === 'BUY' ? 'buy' : wl.signal.signal === 'WATCH' ? 'watch' : 'hold'; }
        }
        else if (_extQuotes[s.ticker]) { const q=_extQuotes[s.ticker]; price = q.p; changePercent = q.c; volume = q.v; amount = q.a; change = q.p ? (q.p * q.c / 100) : null; }
      }
      // 补充：如果 watchlist 没找到，用原来的简单算法
      if (signalScore === 50) {
        const cp2 = +(changePercent || 0);
        if (cp2 >= 3) { signalScore = 80; signalText = '强势看多'; signalCls = 'buy'; }
        else if (cp2 >= 1) { signalScore = 65; signalText = '偏多'; signalCls = 'buy'; }
        else if (cp2 <= -3) { signalScore = 20; signalText = '弱势回避'; signalCls = 'watch'; }
        else if (cp2 <= -1) { signalScore = 35; signalText = '偏弱关注'; signalCls = 'watch'; }
      }
      const up = +(changePercent || 0) >= 0;

      // 潜在空间计算
      const upside = (targetPrice && price) ? ((targetPrice/price - 1)*100) : null;
      const upsideHtml = upside !== null
        ? '<span style="font-weight:700;color:'+(upside>=20?'var(--up)':upside>=0?'var(--accent)':'var(--down)')+'">'+(upside>=0?'+':'')+upside.toFixed(1)+'%</span>'
        : '<span style="color:var(--muted)">—</span>';

      // 信号badge
      const sigBg = signalCls==='buy'?'var(--up-bg)':signalCls==='watch'?'var(--down-bg)':'rgba(245,158,11,0.12)';
      const sigColor = signalCls==='buy'?'var(--up)':signalCls==='watch'?'var(--down)':'var(--accent)';
      const sigBdr = signalCls==='buy'?'var(--up-border)':signalCls==='watch'?'var(--down-border)':'rgba(245,158,11,0.3)';

      // 成交额（亿元）
      const amountStr = amount ? (amount/1e8).toFixed(2)+'亿' : '—';

      // 板块标签
      const sectorTag = sector ? '<span class="sector-tag">'+sector.replace(/^[^\\u4e00-\\u9fff]+/,'')+'</span>' : '<span style="color:var(--muted)">—</span>';

      // 展开按钮
      const expandId = 'fav-expand-' + s.ticker.replace(/\\./g,'_');

      return '<tbody class="fav-group">' +
        '<tr style="cursor:pointer" onclick="toggleFavDetail(\\''+expandId+'\\',\\''+s.ticker+'\\')" class="fav-main-row">' +
        '<td style="font-family:JetBrains Mono,Consolas,monospace;font-size:0.85em">'+s.ticker+'</td>' +
        '<td><span class="stock-link">'+(s.name||s.ticker)+'</span></td>' +
        '<td>'+sectorTag+'</td>' +
        '<td style="font-family:JetBrains Mono,Consolas,monospace">'+(price ? '¥'+F.price(price) : '—')+'</td>' +
        '<td class="'+(up?'up':'down')+'" style="font-weight:600">'+F.pct(changePercent)+'</td>' +
        '<td>'+(targetPrice ? '¥'+targetPrice : '<span style="color:var(--muted)">—</span>')+'</td>' +
        '<td>'+upsideHtml+'</td>' +
        '<td style="font-size:0.85em">'+amountStr+'</td>' +
        '<td><span class="badge" style="font-size:0.78em;background:'+sigBg+';color:'+sigColor+';border:1px solid '+sigBdr+'">'+signalText+' · '+signalScore+'分</span></td>' +
        '<td><button class="btn" style="font-size:0.7em;padding:2px 8px;color:var(--muted)" onclick="event.stopPropagation();removeFav(\\''+s.ticker+'\\')">✕</button></td>' +
        '</tr>' +
        // 展开的详情行
        '<tr class="fav-detail-row" id="'+expandId+'" style="display:none">' +
        '<td colspan="11" style="padding:0">' +
        '<div class="fav-detail-card" id="'+expandId+'-card" style="background:var(--surface2);border-radius:8px;margin:4px 0;padding:14px 18px;border-left:3px solid '+sigColor+'">' +
        '<div style="display:flex;gap:24px;flex-wrap:wrap;font-size:0.85em">' +
          // 基本面分析
          '<div style="flex:1;min-width:200px">' +
            '<div style="font-weight:700;margin-bottom:6px;color:var(--primary)">📊 投资分析</div>' +
            '<div style="line-height:1.7;color:var(--text)">'+(reason||'暂无详细分析数据')+'</div>' +
          '</div>' +
          // 关键指标
          '<div style="min-width:160px">' +
            '<div style="font-weight:700;margin-bottom:6px;color:var(--accent)">📈 关键指标</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:0.85em">' +
              '<span style="color:var(--muted)">现价</span><span style="font-family:JetBrains Mono,Consolas,monospace">'+(price?'¥'+F.price(price):'—')+'</span>' +
              '<span style="color:var(--muted)">目标价</span><span>'+(targetPrice?'¥'+targetPrice:'—')+'</span>' +
              '<span style="color:var(--muted)">潜在空间</span>'+upsideHtml +
              '<span style="color:var(--muted)">成交量</span><span>'+F.vol(volume)+'</span>' +
              '<span style="color:var(--muted)">成交额</span><span>'+amountStr+'</span>' +
              '<span style="color:var(--muted)">信号评分</span><span style="font-weight:700;color:'+sigColor+'">'+signalScore+'/100</span>' +
            '</div>' +
          '</div>' +
          // 操作按钮
          '<div style="min-width:120px;display:flex;flex-direction:column;gap:6px;justify-content:center">' +
            '<button class="btn" style="font-size:0.8em;white-space:nowrap" onclick="event.stopPropagation();showStockDetail(\\''+s.ticker+'\\')">🔍 实时行情</button>' +
            '<button class="btn" style="font-size:0.8em;white-space:nowrap" onclick="event.stopPropagation();openReportByTicker(\\''+s.ticker+'\\',\\''+(s.name||'')+'\\')">📄 查看研报</button>' +
            '<button class="btn" style="font-size:0.8em;white-space:nowrap;color:var(--down)" onclick="event.stopPropagation();removeFav(\\''+s.ticker+'\\')">✕ 移出自选</button>' +
          '</div>' +
        '</div>' +
        // 潜在空间进度条
        (upside !== null ? '<div style="margin-top:10px;display:flex;align-items:center;gap:8px;font-size:0.78em">' +
          '<span style="color:var(--muted);white-space:nowrap">目标空间</span>' +
          '<div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">' +
            '<div style="height:100%;width:'+Math.min(Math.abs(upside)*2,100)+'%;background:'+(upside>=20?'var(--up)':upside>=0?'var(--accent)':'var(--down)')+';border-radius:3px;transition:width 0.6s"></div>' +
          '</div>' +
          '<span style="font-weight:700;color:'+(upside>=20?'var(--up)':upside>=0?'var(--accent)':'var(--down)')+'">'+(upside>=0?'+':'')+upside.toFixed(1)+'%</span>' +
        '</div>' : '') +
        '</div></td></tr>' +
        '</tbody>';
    }).join('');
  } catch(e) { console.error('Fav load error:', e); }
}`;

  const before = c.substring(0, funcStartIdx);
  const after = c.substring(funcEndIdx + oldFuncEnd.length);
  c = before + newFunc + after;
  changes++;
  console.log('✓ loadFavorites 函数已替换');
}

// ── 4. 添加辅助函数 (toggleFavDetail, openReportByTicker) ──
const bodyEnd = '</body>';
if (c.includes(bodyEnd) && !c.includes('toggleFavDetail')) {
  const helperJs = `
<script>
// ── 自选详情展开 ──
function toggleFavDetail(id, ticker) {
  var row = document.getElementById(id);
  if (!row) return;
  var isVisible = row.style.display !== 'none';
  // 关闭所有其他展开行
  document.querySelectorAll('.fav-detail-row').forEach(function(r) {
    if (r.id !== id) r.style.display = 'none';
  });
  row.style.display = isVisible ? 'none' : 'table-row';
}

// 通过ticker查找并打开报告
function openReportByTicker(ticker, name) {
  // 从 EMBEDDED_REPORTS 查找匹配的报告
  if (typeof EMBEDDED_REPORTS !== 'undefined' && EMBEDDED_REPORTS.length) {
    var found = EMBEDDED_REPORTS.find(function(r) {
      return r.filename.indexOf(ticker.replace('.SS','').replace('.SZ','')) === 0;
    });
    if (found) {
      openReportInline(encodeURIComponent(found.filename), ticker, name);
      return;
    }
  }
  // 没找到，直接显示行情
  showStockDetail(ticker);
}
</script>
`;

  c = c.replace(bodyEnd, helperJs + '\n' + bodyEnd);
  changes++;
  console.log('✓ 辅助函数已注入');
}

// ── 5. 添加CSS（详情行样式） ──
const detailCss = `
    /* 自选详情展开 */
    .fav-main-row:hover { background: var(--surface2); }
    .fav-detail-card { animation: fadeIn 0.2s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
    .fav-group { border-bottom: 1px solid var(--border); }
`;

const cssEnd2 = '</style>';
if (c.includes(cssEnd2) && !c.includes('fav-main-row')) {
  c = c.replace(cssEnd2, detailCss + '\n  ' + cssEnd2);
  changes++;
  console.log('✓ 详情CSS已添加');
}

fs.writeFileSync(f, c);
console.log('\n✅ 共 ' + changes + ' 项修改完成');
