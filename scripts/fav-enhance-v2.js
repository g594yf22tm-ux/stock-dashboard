// fav-enhance-v2.js — 精确替换自选区域
const fs = require('fs');
const f = 'f:/Claude code test/dashboard/public/index.html';
let c = fs.readFileSync(f, 'utf8');

// ── Fix 1: 表头替换 ──
const thOld = '<th>代码</th><th>名称</th><th>最新价</th><th>涨跌</th><th>涨跌幅</th>\n\t            <th>成交量</th><th>成交额</th><th>当日信号</th><th>操作</th>';
const thNew = '<th>代码</th><th>名称</th><th>板块</th><th>最新价</th><th>涨跌幅</th>\n\t            <th>目标价</th><th>潜在空间</th><th>成交额</th><th>分析信号</th><th>操作</th>';

if (c.includes(thOld)) {
  c = c.replace(thOld, thNew);
  console.log('✓ 表头已替换');
} else {
  // try without leading spaces
  const thAlt = c.match(/<th>代码<\/th>[\s\S]{0,200}<th>操作<\/th>/);
  if (thAlt) {
    c = c.replace(thAlt[0], thNew.replace(/\n\t            /g, '\n\t            '));
    console.log('✓ 表头已替换 (alt)');
  } else {
    console.log('✗ 未找到表头');
  }
}

// ── Fix 2: colspan ──
c = c.replace(/colspan="9" class="no-data"/g, 'colspan="11" class="no-data"');
c = c.replace(/colspan="9" style="padding:0"/g, 'colspan="11" style="padding:0"');

// ── Fix 3: 查找并替换整个 loadFavorites 函数 ──
const fnMarker = 'async function loadFavorites() {';
const errMarker = "Fav load error:";
const fnStart = c.indexOf(fnMarker);
const errIdx = c.indexOf(errMarker, fnStart);

if (fnStart >= 0 && errIdx > fnStart) {
  // 找函数结束 (下一个顶级函数或 } catch 之后的 })
  let scanPos = errIdx;
  let depth = 0;
  let foundStart = false;
  for (let i = errIdx; i < c.length; i++) {
    if (c[i] === '{') { depth++; foundStart = true; }
    if (c[i] === '}') { depth--; }
    if (foundStart && depth === 0) {
      // 找到了 catch块的结束，后面可能是函数的结束
      // 继续找下一个 }
      for (let j = i+1; j < c.length; j++) {
        if (c[j] === '}') {
          const fnEnd = j + 1;
          const before = c.substring(0, fnStart);
          const after = c.substring(fnEnd);

          const newFn = buildNewFavoritesFunction();
          c = before + newFn + after;
          console.log('✓ loadFavorites 已替换 (' + newFn.length + ' 字符)');
          break;
        } else if (c[j] !== ' ' && c[j] !== '\n' && c[j] !== '\r' && c[j] !== '\t') {
          break;
        }
      }
      break;
    }
  }
}

fs.writeFileSync(f, c);
console.log('✅ 文件已保存 (' + c.length + ' 字符)');

function buildNewFavoritesFunction() {
  return `async function loadFavorites() {
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
      if (signalScore === 50) {
        const cp2 = +(changePercent || 0);
        if (cp2 >= 3) { signalScore = 80; signalText = '强势看多'; signalCls = 'buy'; }
        else if (cp2 >= 1) { signalScore = 65; signalText = '偏多'; signalCls = 'buy'; }
        else if (cp2 <= -3) { signalScore = 20; signalText = '弱势回避'; signalCls = 'watch'; }
        else if (cp2 <= -1) { signalScore = 35; signalText = '偏弱关注'; signalCls = 'watch'; }
      }
      const up = +(changePercent || 0) >= 0;
      const upside = (targetPrice && price) ? ((targetPrice/price - 1)*100) : null;
      const upsideHtml = upside !== null
        ? '<span style="font-weight:700;color:'+(upside>=20?'var(--up)':upside>=0?'var(--accent)':'var(--down)')+'">'+(upside>=0?'+':'')+upside.toFixed(1)+'%</span>'
        : '<span style="color:var(--muted)">—</span>';
      const sigBg = signalCls==='buy'?'var(--up-bg)':signalCls==='watch'?'var(--down-bg)':'rgba(245,158,11,0.12)';
      const sigColor = signalCls==='buy'?'var(--up)':signalCls==='watch'?'var(--down)':'var(--accent)';
      const sigBdr = signalCls==='buy'?'var(--up-border)':signalCls==='watch'?'var(--down-border)':'rgba(245,158,11,0.3)';
      const amountStr = amount ? (amount/1e8).toFixed(2)+'亿' : '—';
      const sectorTag = sector ? '<span class="sector-tag">'+sector.replace(/^[^一-龥]+/,'')+'</span>' : '<span style="color:var(--muted)">—</span>';
      const expandId = 'fav-expand-' + s.ticker.replace(/\\./g,'_');
      const tickerEsc = s.ticker.replace(/'/g,"\\\\'");
      const nameEsc = (s.name||'').replace(/'/g,"\\\\'");
      return '<tbody class="fav-group">' +
        '<tr style="cursor:pointer" onclick="toggleFavDetail(\\\\''+expandId+'\\\\',\\\\''+tickerEsc+'\\\\')" class="fav-main-row">' +
        '<td style="font-family:JetBrains Mono,Consolas,monospace;font-size:0.85em">'+s.ticker+'</td>' +
        '<td><span class="stock-link">'+(s.name||s.ticker)+'</span></td>' +
        '<td>'+sectorTag+'</td>' +
        '<td style="font-family:JetBrains Mono,Consolas,monospace">'+(price ? '¥'+F.price(price) : '—')+'</td>' +
        '<td class="'+(up?'up':'down')+'" style="font-weight:600">'+F.pct(changePercent)+'</td>' +
        '<td>'+(targetPrice ? '¥'+targetPrice : '<span style="color:var(--muted)">—</span>')+'</td>' +
        '<td>'+upsideHtml+'</td>' +
        '<td style="font-size:0.85em">'+amountStr+'</td>' +
        '<td><span class="badge" style="font-size:0.78em;background:'+sigBg+';color:'+sigColor+';border:1px solid '+sigBdr+'">'+signalText+' · '+signalScore+'分</span></td>' +
        '<td><button class="btn" style="font-size:0.7em;padding:2px 8px;color:var(--muted)" onclick="event.stopPropagation();removeFav(\\\\''+tickerEsc+'\\\\')">✕</button></td>' +
        '</tr>' +
        '<tr class="fav-detail-row" id="'+expandId+'" style="display:none">' +
        '<td colspan="11" style="padding:0">' +
        '<div class="fav-detail-card" style="background:var(--surface2);border-radius:8px;margin:4px 0;padding:14px 18px;border-left:3px solid '+sigColor+'">' +
        '<div style="display:flex;gap:24px;flex-wrap:wrap;font-size:0.85em">' +
          '<div style="flex:1;min-width:200px">' +
            '<div style="font-weight:700;margin-bottom:6px;color:var(--primary)">投资分析</div>' +
            '<div style="line-height:1.7;color:var(--text)">'+(reason||'暂无详细分析数据')+'</div>' +
          '</div>' +
          '<div style="min-width:160px">' +
            '<div style="font-weight:700;margin-bottom:6px;color:var(--accent)">关键指标</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:0.85em">' +
              '<span style="color:var(--muted)">现价</span><span style="font-family:JetBrains Mono,Consolas,monospace">'+(price?'¥'+F.price(price):'—')+'</span>' +
              '<span style="color:var(--muted)">目标价</span><span>'+(targetPrice?'¥'+targetPrice:'—')+'</span>' +
              '<span style="color:var(--muted)">潜在空间</span>'+upsideHtml +
              '<span style="color:var(--muted)">成交量</span><span>'+F.vol(volume)+'</span>' +
              '<span style="color:var(--muted)">成交额</span><span>'+amountStr+'</span>' +
              '<span style="color:var(--muted)">信号评分</span><span style="font-weight:700;color:'+sigColor+'">'+signalScore+'/100</span>' +
            '</div>' +
          '</div>' +
          '<div style="min-width:120px;display:flex;flex-direction:column;gap:6px;justify-content:center">' +
            '<button class="btn" style="font-size:0.8em;white-space:nowrap" onclick="event.stopPropagation();showStockDetail(\\\\''+tickerEsc+'\\\\')">实时行情</button>' +
            '<button class="btn" style="font-size:0.8em;white-space:nowrap" onclick="event.stopPropagation();openReportByTicker(\\\\''+tickerEsc+'\\\\',\\\\''+nameEsc+'\\\\')">查看研报</button>' +
          '</div>' +
        '</div>' +
        (upside !== null ? '<div style="margin-top:10px;display:flex;align-items:center;gap:8px;font-size:0.78em">' +
          '<span style="color:var(--muted);white-space:nowrap">目标空间</span>' +
          '<div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">' +
            '<div style="height:100%;width:'+Math.min(Math.abs(upside)*2,100)+'%;background:'+(upside>=20?'var(--up)':upside>=0?'var(--accent)':'var(--down)')+';border-radius:3px"></div>' +
          '</div>' +
          '<span style="font-weight:700;color:'+(upside>=20?'var(--up)':upside>=0?'var(--accent)':'var(--down)')+'">'+(upside>=0?'+':'')+upside.toFixed(1)+'%</span>' +
        '</div>' : '') +
        '</div></td></tr>' +
        '</tbody>';
    }).join('');
  } catch(e) { console.error('Fav load error:', e); }
}`;
}
