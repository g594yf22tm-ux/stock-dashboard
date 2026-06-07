
// ── API ──────────────────────────────────────────────────────────────────
const API = {
  market: '/api/market',
  watchlist: '/api/watchlist',
  watchlistLive: '/api/watchlist/live',
  analysis: '/api/analysis',
  reports: '/api/reports',
  search: (q) => `/api/search?q=${encodeURIComponent(q)}`,
  favorites: '/api/favorites',
  favAdd: '/api/favorites/add',
  favRemove: '/api/favorites/remove',
  analyze: '/api/analyze'
};

// 远程模式的静态报告列表
const EMBEDDED_REPORTS = [{"filename":"600036_招商银行_deep_dive_2026-06-03.md","title":"招商银行 深度研报","date":"2026-06-03"},{"filename":"600900_长江电力_deep_dive_2026-05-31.md","title":"长江电力 深度研报","date":"2026-05-31"},{"filename":"600887_伊利股份_deep_dive_2026-06-03.md","title":"伊利股份 深度研报","date":"2026-06-03"},{"filename":"601899_紫金矿业_deep_dive_2026-06-03.md","title":"紫金矿业 深度研报","date":"2026-06-03"},{"filename":"002027_分众传媒_deep_dive_2026-06-03.md","title":"分众传媒 深度研报","date":"2026-06-03"},{"filename":"300015_爱尔眼科_deep_dive_2026-06-03.md","title":"爱尔眼科 深度研报","date":"2026-06-03"},{"filename":"600031_三一重工_deep_dive_2026-06-03.md","title":"三一重工 深度研报","date":"2026-06-03"},{"filename":"600585_海螺水泥_deep_dive_2026-06-03.md","title":"海螺水泥 深度研报","date":"2026-06-03"},{"filename":"600030_中信证券_deep_dive_2026-06-03.md","title":"中信证券 深度研报","date":"2026-06-03"},{"filename":"600438_通威股份_deep_dive_2026-06-03.md","title":"通威股份 深度研报","date":"2026-06-03"}];

// ── 排序状态 ─────────────────────────────────────────────────────────────
let sortState = { col: null, asc: false };
const isRemote = (function(){
  const host = location.hostname;
  if (host==='localhost'||host==='127.0.0.1'||host==='[::1]') return false;
  if (host.startsWith('192.168.')||host.startsWith('10.')||host.startsWith('172.')) return false;
  return true;
})();
const CDN = './dashboard/data'; // 同源加载，绕过 jsDelivr 7天缓存

// ── 预加载扩展行情（确保首次搜索就有实时价格）───────────────────────────
let _extQuotes = {};
if (isRemote) {
  fetchCDN('quotes_ext.json').then(data => {
    if (data && data.quotes) {
      _extQuotes = {};
      data.quotes.forEach(q => { _extQuotes[q.t] = q; });
      console.log('预加载扩展行情:', Object.keys(_extQuotes).length, '只');
      try { loadFavorites(); } catch {}
    }
  }).catch(() => {});
}

async function fetchCDN(file) {
  try { const r = await fetch(CDN+'/'+file, {cache:'no-cache'}); if (r.ok) return r.json(); }
  catch(e) { console.error('CDN:', e.message); }
  return null;
}

async function get(url) {
  // 远程模式: CDN数据
  if (isRemote) {
    if (url===API.market||url===API.watchlist||url===API.watchlistLive||url===API.analysis) {
      const file = url.replace('/api/','').replace('/live','')+'.json';
      const data = await fetchCDN(file);
      if (data) {
        // 转换数据格式兼容现有渲染
        if (url===API.watchlistLive) return { stocks: data.stocks||[], trending: [], source: 'CDN', timestamp: data.timestamp };
        if (url===API.watchlist) return data;
        if (url===API.analysis) return { recommendations: (data.analyses||[]).map(a=>({ticker:a.ticker,name:a.name,fundamentalView:a.fundamental?.view||'',technicalView:a.technical?.view||'',riskView:(a.risks||[]).join('；'),recommendation:a.recommendation?.signal||'HOLD',scores:{fundamental:(a.fundamental?.signalStrength||(a.technical?.signalStrength||0.5))*9,technical:(a.technical?.signalStrength||0.5)*10,risk:((a.technical?.signalStrength||0.5)*9)}}))};
        return data; // market.json as-is
      }
      return null;
    }
    if (url===API.favorites) {
      try { const f=JSON.parse(localStorage.getItem('stock_favs_v2')||'[]'); return {favorites:f,count:f.length}; }
      catch { return {favorites:[],count:0}; }
    }
    if (url===API.reports) return { reports: EMBEDDED_REPORTS||[] };
    return null;
  }
  // 本地模式: Express API
  try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); }
  catch(e) { console.error('Fetch error:', url, e.message); return null; }
}

// ── 工具函数 ────────────────────────────────────────────────────────────

// HTML转义 — 防止XSS
function escHTML(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

const F = {
  price(v) { if (v==null) return '—'; const n = +v; return n >= 1000 ? n.toFixed(2) : n.toFixed(2); },
  pct(v) { if (v==null) return '—'; const n = +v; return (n>0?'+':'') + n.toFixed(2) + '%'; },
  vol(v) { if (!v) return '—'; const n = +v; return n>=1e8 ? (n/1e8).toFixed(1)+'亿手' : n>=1e4 ? (n/1e4).toFixed(1)+'万手' : n.toFixed(0)+'手'; },
  cap(v) { if (!v) return '—'; const n = +v; return (n/1e8).toFixed(0); },
  dir(v) { const n = +v; return n>0 ? 'up' : n<0 ? 'down' : ''; },
  t() { return new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'}); },
  d() { return new Date().toLocaleDateString('zh-CN', {year:'numeric',month:'long',day:'numeric',weekday:'long'}); },
  stars(n) { n = Math.max(1, Math.min(5, Math.round(n))); return '★'.repeat(n) + '☆'.repeat(5-n); }
};

// 市场状态（北京时间 UTC+8）
function getMarketStatus() {
  const now = new Date();
  const bj = new Date(now.getTime() + 8*3600*1000); // 转为北京时间
  const day = bj.getUTCDay(), h = bj.getUTCHours(), m = bj.getUTCMinutes();
  if (day === 0 || day === 6) return { status:'CLOSED', text:'周末休市', cls:'closed' };
  const t = h * 60 + m;
  if (t < 9*60+15) return { status:'CLOSED', text:'等待开盘', cls:'closed' };
  if (t < 9*60+30) return { status:'OPEN', text:'集合竞价', cls:'open' };
  if (t < 11*60+30) return { status:'OPEN', text:'交易中', cls:'open' };
  if (t < 13*60) return { status:'CLOSED', text:'午间休市', cls:'closed' };
  if (t < 15*60) return { status:'OPEN', text:'交易中', cls:'open' };
  return { status:'CLOSED', text:'已收盘', cls:'closed' };
}

// ── 渲染 ─────────────────────────────────────────────────────────────────
function renderIndices(indices) {
  const el = document.getElementById('indexCards');
  const vals = indices ? Object.values(indices) : [];
  if (!vals.length) { el.innerHTML = '<div class="no-data">暂无数据</div>'; return; }
  el.innerHTML = vals.map(i => `
    <div class="idx-card">
      <div class="n">${i.name || i.ticker}</div>
      <div class="p">${F.price(i.price)}</div>
      <div class="c ${F.dir(i.changePercent)}">
        ${F.pct(i.changePercent)}
        ${i.change ? ' (' + (i.change>0?'+':'') + F.price(i.change) + ')' : ''}
      </div>
    </div>
  `).join('');
}

function renderSectors(sectors) {
  const el = document.getElementById('sectorGrid');
  if (!sectors?.length) { el.innerHTML = '<div class="no-data">暂无板块数据</div>'; return; }
  el.innerHTML = sectors.map(s => `
    <div class="sector-item">
      <div class="sn">${s.name}</div>
      <div class="sp ${F.dir(s.changePercent)}">${F.pct(s.changePercent)}</div>
    </div>
  `).join('');
}

function renderTrending(trending) {
  const el = document.getElementById('trendingList');
  if (!trending?.length) { el.innerHTML = '<div class="no-data">暂无热门数据</div>'; return; }
  el.innerHTML = '<table><thead><tr><th>代码</th><th>名称</th><th>价格</th><th>涨跌幅</th><th>成交量</th><th>成交额</th></tr></thead><tbody>' +
    trending.map(t => `<tr style="cursor:pointer" onclick="showStockDetail('${t.ticker}')">
      <td><b>${t.ticker}</b></td>
      <td><span class="stock-link">${t.name||''}</span></td>
      <td>¥${F.price(t.price)}</td>
      <td class="${F.dir(t.changePercent)}">${F.pct(t.changePercent)}</td>
      <td>${F.vol(t.volume)}</td>
      <td>${t.amount ? (t.amount/1e8).toFixed(2)+'亿' : '—'}</td>
    </tr>`).join('') + '</tbody></table>';
}

function renderSparkline(data, chgPct) {
  if (!data || data.length < 2) return '—';
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const color = (+chgPct) >= 0 ? 'var(--up-bright)' : 'var(--down-bright)';
  return data.map(v => {
    const h = Math.max(3, ((v-min)/range)*22+5);
    return `<span style="height:${h}px;background:${color}"></span>`;
  }).join('');
}

let _watchlistData = []; // 缓存原始数据用于排序

function renderWatchlist(stocks, source) {
  _watchlistData = stocks || [];
  document.getElementById('watchCount').textContent = _watchlistData.length + (source?.includes('实时') ? ' 🔴实时' : '');
  if (!_watchlistData.length) { document.getElementById('watchlistBody').innerHTML = '<tr><td colspan="12" class="no-data">暂无关注数据</td></tr>'; return; }
  applySortAndRender();
}

function applySortAndRender() {
  const data = [..._watchlistData];
  const { col, asc } = sortState;

  if (col) {
    data.sort((a, b) => {
      let va = a[col], vb = b[col];
      if (va == null) return 1; if (vb == null) return -1;
      if (typeof va === 'string') va = parseFloat(va);
      if (typeof vb === 'string') vb = parseFloat(vb);
      return asc ? va - vb : vb - va;
    });
  }

  const tbody = document.getElementById('watchlistBody');
  tbody.innerHTML = data.map(s => {
    const rating = s.expertRating || (s.signal ? Math.round(s.signal.score/20) : 3);
    const sigType = (s.recommendation?.signal || s.signal?.type || '').toUpperCase();
    const sigMap = { BUY:'买入', HOLD:'持有', WATCH:'关注', SELL:'卖出' };
    const sigText = sigMap[sigType] || s.signal?.text || '—';
    const sigCls = sigType === 'BUY' ? 'buy' : sigType === 'WATCH' ? 'watch' : 'hold';
    const up = +s.changePercent >= 0;
    const peColor = s.pe > 80 ? 'var(--accent)' : s.pe > 40 ? 'var(--info)' : '';
    return `<tr style="cursor:pointer" onclick="showStockDetail('${s.ticker}')">
      <td><b>${s.ticker}</b>${s._live?' <span style="font-size:0.65em;color:var(--up-bright)">●</span>':''}</td>
      <td><span class="stock-link">${s.name||s.ticker}</span>${(function(){let t=s.sector?` <span class="sector-tag">${s.sector}</span>`:'';if(!s.sector&&isRemote&&_watchlistData){const w=_watchlistData.find(function(x){return x.ticker===s.ticker});if(w&&w.sector)t=` <span class="sector-tag">${w.sector}</span>`;}return t;})()}</td>
      <td>¥${F.price(s.price)}</td>
      <td class="${up?'up':'down'}">${(+s.change)>0?'+':''}${F.price(s.change)}</td>
      <td class="${up?'up':'down'}">${F.pct(s.changePercent)}</td>
      <td>${F.vol(s.volume)}</td>
      <td>${s.amount ? (s.amount/1e8).toFixed(2)+'亿' : '—'}</td>
      
      <td>${s.targetPrice ? '¥'+s.targetPrice : '—'}</td>
      <td><span class="star">${F.stars(rating)}</span></td>
      <td><span class="badge ${sigCls}">${sigText}</span></td>
    <td>${s.amount ? (s.amount/1e8).toFixed(2)+'亿' : '—'}</td></tr>`;
  }).join('');

  // 更新排序箭头
  document.querySelectorAll('.sort-arrow').forEach(el => {
    el.textContent = '';
    if (el.dataset.col === col) el.textContent = asc ? ' ▲' : ' ▼';
  });
}

function sortTable(col) {
  if (sortState.col === col) sortState.asc = !sortState.asc;
  else { sortState.col = col; sortState.asc = false; }
  applySortAndRender();
}

function renderAnalysis(recommendations) {
  const el = document.getElementById("analysisGrid");
  if (!recommendations?.length) {
    el.innerHTML = "<div class="no-data" style="grid-column:1/-1">暂无分析数据<br><small>运行 npm run init 生成分析</small></div>";
    return;
  }

  const sorted = [...recommendations].sort((a,b) => {
    const sa = (a.scores?.fundamental||0)+(a.scores?.technical||0)+(a.scores?.risk||0);
    const sb = (b.scores?.fundamental||0)+(b.scores?.technical||0)+(b.scores?.risk||0);
    return sb - sa;
  });

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (r._signalScore == null) {
      const w = _watchlistData && _watchlistData.find(function(x){return x.ticker===r.ticker;});
      r._signalScore = (w && w.signal) ? w.signal.score : (r.recommendation?.confidence || 0.5) * 100;
    }
  }

  const sigLabels = { BUY:"看多", HOLD:"观望", WATCH:"回避", SELL:"看空" };
  const sigIcons = { BUY:"🔴", HOLD:"🟡", WATCH:"🟢", SELL:"⚫" };

  el.innerHTML = sorted.slice(0, 12).map(r => {
    const sig = (r.recommendation?.signal || "HOLD").toUpperCase();
    const sigCls = sig === "BUY" ? "buy" : sig === "WATCH" ? "watch" : "hold";
    const score = r._signalScore || 50;
    const conf = Math.round(score);

    const fd = Math.round((r.scores?.fundamental || 5) * 10) / 10;
    const td = Math.round((r.scores?.technical || 5) * 10) / 10;
    const rd = Math.round((r.scores?.risk || 5) * 10) / 10;
    const total = Math.round((fd + td + rd) / 3 * 10) / 10;

    const barW = v => Math.min(100, Math.max(2, v * 10));
    const barColor = v => v >= 8 ? "var(--up)" : v >= 6 ? "var(--accent)" : v >= 4 ? "var(--info)" : "var(--muted)";

    const fundView = (r.fundamentalView || "").substring(0, 80) + ((r.fundamentalView||"").length > 80 ? "…" : "");
    const techView = (r.technicalView || "").substring(0, 80) + ((r.technicalView||"").length > 80 ? "…" : "");
    const riskView = (r.riskView || "").substring(0, 60) + ((r.riskView||"").length > 60 ? "…" : "");
    const tickerEsc = (r.ticker||"").replace(/'/g, "\'");
    const nameEsc = (r.name||"").replace(/'/g, "\'");

    return "<div class=\"analysis-card-v2 " + sigCls + "\">" +
      "<div class=\"ac-header\">" +
        "<div class=\"ac-title\" onclick=\"showStockDetail('"+r.ticker+"')\" title=\"点击查看实时行情\">" +
          "<span class=\"ac-name\">" + (r.name || r.ticker) + "</span>" +
          "<span class=\"ac-ticker\">" + r.ticker + "</span>" +
        "</div>" +
        "<div class=\"ac-verdict\">" +
          "<span class=\"ac-signal-badge " + sigCls + "\">" + (sigIcons[sig]||"") + " " + (sigLabels[sig]||sig) + "</span>" +
          "<span class=\"ac-total\" style=\"color:" + barColor(total) + "\">" + total.toFixed(1) + "</span>" +
          "<span class=\"ac-total-label\">综合分</span>" +
        "</div>" +
      "</div>" +

      "<div class=\"ac-body\">" +
        (fundView ? "<div class=\"ac-line\"><span class=\"ac-role\">📊 基本面</span><span class=\"ac-text\">" + fundView + "</span></div>" : "") +
        (techView ? "<div class=\"ac-line\"><span class=\"ac-role\">📈 技术面</span><span class=\"ac-text\">" + techView + "</span></div>" : "") +
        (riskView ? "<div class=\"ac-line\"><span class=\"ac-role\">🛡️ 风险</span><span class=\"ac-text\">" + riskView + "</span></div>" : "") +
      "</div>" +

      "<div class=\"ac-scores\">" +
        "<div class=\"ac-score-row\"><span class=\"ac-score-label\">基本面</span><div class=\"ac-bar-track\"><div class=\"ac-bar-fill\" style=\"width:" + barW(fd) + "%;background:" + barColor(fd) + "\"></div></div><span class=\"ac-score-val\" style=\"color:" + barColor(fd) + "\">" + fd.toFixed(1) + "</span></div>" +
        "<div class=\"ac-score-row\"><span class=\"ac-score-label\">技术面</span><div class=\"ac-bar-track\"><div class=\"ac-bar-fill\" style=\"width:" + barW(td) + "%;background:" + barColor(td) + "\"></div></div><span class=\"ac-score-val\" style=\"color:" + barColor(td) + "\">" + td.toFixed(1) + "</span></div>" +
        "<div class=\"ac-score-row\"><span class=\"ac-score-label\">风  险</span><div class=\"ac-bar-track\"><div class=\"ac-bar-fill\" style=\"width:" + barW(rd) + "%;background:" + barColor(rd) + "\"></div></div><span class=\"ac-score-val\" style=\"color:" + barColor(rd) + "\">" + rd.toFixed(1) + "</span></div>" +
      "</div>" +

      "<div class=\"ac-footer\">" +
        "<span class=\"ac-confidence\">置信度 <strong>" + conf + "%</strong></span>" +
        "<div class=\"ac-actions\">" +
          "<button class=\"btn\" style=\"font-size:0.72em;padding:3px 10px\" onclick=\"event.stopPropagation();showStockDetail('"+tickerEsc+"')\">📈 行情</button>" +
          "<button class=\"btn\" style=\"font-size:0.72em;padding:3px 10px\" onclick=\"event.stopPropagation();openReportByTicker('"+tickerEsc+"','"+nameEsc+"')\">📄 研报</button>" +
        "</div>" +
      "</div>" +
    "</div>";
  }).join("");
}
}
}

function renderReports(reports) {
  const el = document.getElementById('reportsList');
  // CDN模式：过滤已隐藏的报告
  const visible = _filterHidden(reports || []);
  const hiddenCount = (reports||[]).length - visible.length;

  if (!visible.length) {
    el.innerHTML = `<div class="no-data">
      📝 暂无分析报告<br><br>
      <small>三种生成方式：<br>
      1️⃣ 搜索股票 → 点 <b>📝分析</b><br>
      2️⃣ 股票详情 → 点 <b>📝 一键分析</b><br>
      3️⃣ 对话输入「深度分析 招商银行」</small>
      ${hiddenCount > 0 ? '<br><br><button class=\"btn\" onclick=\"_unhideAllReports();refreshAll();\" style=\"font-size:0.8em\">🔄 恢复 '+hiddenCount+' 份已隐藏报告</button>' : ''}
    </div>`;
    return;
  }
  // 工具栏
  const delTools = isRemote
    ? '<div style="display:flex;gap:6px"><button class="report-del-all" onclick="deleteSelectedReports()">🗑️ 删除选中</button><button class="report-del-all" onclick="deleteAllReports()">🗑️ 全部隐藏</button>' + (hiddenCount>0 ? '<button class="report-del-all" onclick="_unhideAllReports();refreshAll()" style="color:var(--primary);border-color:var(--primary)">🔄 恢复('+hiddenCount+')</button>' : '') + '</div>'
    : '<div style="display:flex;gap:6px"><button class="report-del-all" onclick="deleteSelectedReports()">🗑️ 删除选中</button><button class="report-del-all" onclick="deleteAllReports()">🗑️ 一键清空</button></div>';
  let toolbar = '<div class="report-toolbar">' +
    '<label class="report-select-all"><input type="checkbox" class="report-check" onclick="toggleSelectAllReports(this)" title="全选/取消"> 全选</label>' +
    '<span class="report-count">📄 '+visible.length+' 份报告' + (hiddenCount>0?' <span style="color:var(--accent)">('+hiddenCount+'已隐藏)</span>':'') + '</span>' +
    delTools +
    '</div>';

  el.innerHTML = toolbar + reports.map(r => {
    const parts = r.filename.replace('.md','').split('_');
    const codePrefix = parts[0] || '';          // 如 '600036'
    const stockShortName = parts[1] || '';      // 如 '招商银行'
    const fullTicker = /^\d{6}$/.test(codePrefix) ? codePrefix + (codePrefix.startsWith('6')||codePrefix.startsWith('5') ? '.SS' : '.SZ') : codePrefix;
    let rawType = parts[2] || '分析';
    let typeLabel = rawType.includes('deep') ? '📊 深度研报' : rawType.includes('分析') ? '📝 快速分析' : '📄 ' + rawType;
    return `
    <div class="report-row" data-file="${encodeURIComponent(r.filename)}">
      <input type="checkbox" class="report-check report-cb" data-file="${encodeURIComponent(r.filename)}" onclick="event.stopPropagation()">
      <span class="report-icon">📄</span>
      <span class="report-link" onclick="openReportInline('${encodeURIComponent(r.filename)}','${fullTicker}','${stockShortName}')" title="点击查看报告+实时行情+新闻" style="cursor:pointer">
	        <span class="report-name">${stockShortName||codePrefix}</span>
	        ${fullTicker ? '<span class="sector-tag" style="font-size:0.68em">'+fullTicker+'</span>' : ''}
	        <span style="color:var(--muted);font-size:0.7em;white-space:nowrap">${typeLabel}</span>
	        <span style="color:var(--muted);font-size:0.7em;white-space:nowrap;margin-left:auto">${r.date||''}</span>
	      </span>
      <button class="report-del" onclick="deleteReport('${encodeURIComponent(r.filename)}', this)" title="${isRemote?'隐藏此报告':'删除此报告'}">🗑️</button>
    </div>`;
  }).join('');
}



// ── 全量A股股票库 ───────────────────────────────────────────────────────
let STOCK_DB = [];
let _stockDBLoaded = false;
async function loadStockDB() {
  if (_stockDBLoaded) return;
  try {
    const r = await fetch(CDN + '/stock_list.json', { cache: 'force-cache' });
    if (r.ok) { const data = await r.json(); STOCK_DB = data; _stockDBLoaded = true; }
  } catch(e) { console.error('Stock DB:', e.message); }
}
const STOCK_FAST = [{c:'600000.SS',n:'浦发银行'},{c:'600009.SS',n:'上海机场'},{c:'600015.SS',n:'华夏银行'},{c:'600016.SS',n:'民生银行'},{c:'600028.SS',n:'中国石化'},{c:'600029.SS',n:'南方航空'},{c:'600030.SS',n:'中信证券'},{c:'600031.SS',n:'三一重工'},{c:'600036.SS',n:'招商银行'},{c:'600048.SS',n:'保利发展'},{c:'600050.SS',n:'中国联通'},{c:'600085.SS',n:'同仁堂'},{c:'600104.SS',n:'上汽集团'},{c:'600111.SS',n:'北方稀土'},{c:'600150.SS',n:'中国船舶'},{c:'600188.SS',n:'兖矿能源'},{c:'600195.SS',n:'中牧股份'},{c:'600196.SS',n:'复星医药'},{c:'600276.SS',n:'恒瑞医药'},{c:'600309.SS',n:'万华化学'},{c:'600406.SS',n:'国电南瑞'},{c:'600436.SS',n:'片仔癀'},{c:'600438.SS',n:'通威股份'},{c:'600519.SS',n:'贵州茅台'},{c:'600547.SS',n:'山东黄金'},{c:'600570.SS',n:'恒生电子'},{c:'600585.SS',n:'海螺水泥'},{c:'600690.SS',n:'海尔智家'},{c:'600809.SS',n:'山西汾酒'},{c:'600837.SS',n:'海通证券'},{c:'600887.SS',n:'伊利股份'},{c:'600900.SS',n:'长江电力'},{c:'600941.SS',n:'中国移动'},{c:'601012.SS',n:'隆基绿能'},{c:'601088.SS',n:'中国神华'},{c:'601111.SS',n:'中国国航'},{c:'601138.SS',n:'工业富联'},{c:'601166.SS',n:'兴业银行'},{c:'601288.SS',n:'农业银行'},{c:'601318.SS',n:'中国平安'},{c:'601398.SS',n:'工商银行'},{c:'601628.SS',n:'中国人寿'},{c:'601633.SS',n:'长城汽车'},{c:'601668.SS',n:'中国建筑'},{c:'601688.SS',n:'华泰证券'},{c:'601728.SS',n:'中国电信'},{c:'601857.SS',n:'中国石油'},{c:'601888.SS',n:'中国中免'},{c:'601899.SS',n:'紫金矿业'},{c:'601919.SS',n:'中远海控'},{c:'601939.SS',n:'建设银行'},{c:'601988.SS',n:'中国银行'},{c:'603259.SS',n:'药明康德'},{c:'603288.SS',n:'海天味业'},{c:'688981.SS',n:'中芯国际'},{c:'000001.SZ',n:'平安银行'},{c:'000002.SZ',n:'万科A'},{c:'000063.SZ',n:'中兴通讯'},{c:'000100.SZ',n:'TCL科技'},{c:'000333.SZ',n:'美的集团'},{c:'000538.SZ',n:'云南白药'},{c:'000568.SZ',n:'泸州老窖'},{c:'000625.SZ',n:'长安汽车'},{c:'000651.SZ',n:'格力电器'},{c:'000725.SZ',n:'京东方A'},{c:'000858.SZ',n:'五粮液'},{c:'000876.SZ',n:'新希望'},{c:'000895.SZ',n:'双汇发展'},{c:'000938.SZ',n:'紫光股份'},{c:'000977.SZ',n:'浪潮信息'},{c:'002007.SZ',n:'华兰生物'},{c:'002027.SZ',n:'分众传媒'},{c:'002049.SZ',n:'紫光国微'},{c:'002142.SZ',n:'宁波银行'},{c:'002195.SZ',n:'岩山科技'},{c:'002230.SZ',n:'科大讯飞'},{c:'002241.SZ',n:'歌尔股份'},{c:'002271.SZ',n:'东方雨虹'},{c:'002304.SZ',n:'洋河股份'},{c:'002352.SZ',n:'顺丰控股'},{c:'002371.SZ',n:'北方华创'},{c:'002415.SZ',n:'海康威视'},{c:'002459.SZ',n:'晶澳科技'},{c:'002460.SZ',n:'赣锋锂业'},{c:'002466.SZ',n:'天齐锂业'},{c:'002475.SZ',n:'立讯精密'},{c:'002594.SZ',n:'比亚迪'},{c:'002714.SZ',n:'牧原股份'},{c:'002736.SZ',n:'国信证券'},{c:'300014.SZ',n:'亿纬锂能'},{c:'300015.SZ',n:'爱尔眼科'},{c:'300033.SZ',n:'同花顺'},{c:'300059.SZ',n:'东方财富'},{c:'300122.SZ',n:'智飞生物'},{c:'300124.SZ',n:'汇川技术'},{c:'300274.SZ',n:'阳光电源'},{c:'300498.SZ',n:'温氏股份'},{c:'300750.SZ',n:'宁德时代'},{c:'300760.SZ',n:'迈瑞医疗'}];

// ── 拼音搜索辅助 ─────────────────────────────────────────────────────────
function pyMatch(name, q) {
  if (!name) return false;
  let py = '';
  const map = {
    '中':'z','牧':'m','股':'g','份':'f','贵':'g','州':'z','茅':'m','台':'t','五':'w','粮':'l','液':'y',
    '招':'z','商':'s','银':'y','行':'h','平':'p','安':'a','浦':'p','发':'f','民':'m','生':'s','兴':'x','业':'y',
    '华':'h','夏':'x','建':'j','设':'s','工':'g','农':'n','交':'j','通':'t','邮':'y','储':'c',
    '海':'h','国':'g','泰':'t','君':'j','光':'g','大':'d','申':'s','万':'w','宏':'h','源':'y','东':'d',
    '方':'f','广':'g','长':'c','江':'j','电':'d','力':'l','三':'s','一':'y','重':'z','工':'g','徐':'x',
    '上':'s','汽':'q','集':'j','团':'t','北':'b','京':'j','车':'c','比':'b','亚':'y','迪':'d',
    '宁':'n','德':'d','时':'s','代':'d','阳':'y','光':'g','隆':'l','基':'j','绿':'l','通':'t','威':'w',
    '药':'y','明':'m','康':'k','恒':'h','瑞':'r','医':'y','复':'f','星':'x','片':'p','仔':'z','癀':'h',
    '同':'t','仁':'r','堂':'t','白':'b','云':'y','山':'s','尔':'e','眼':'y','科':'k','迈':'m','智':'z',
    '飞':'f','生':'s','物':'w','春':'c','高':'g','新':'x','兰':'l','莱':'l','士':'s','原':'y','温':'w','氏':'s',
    '双':'s','汇':'h','金':'j','龙':'l','鱼':'y','天':'t','味':'w','洋':'y','河':'h','泸':'l','老':'l','窖':'j',
    '古':'g','井':'j','贡':'g','山':'s','西':'x','汾':'f','科':'k','万':'w','保':'b','利':'l','蛇':'s',
    '筑':'z','铁':'t','核':'h','石':'s','油':'y','化':'h','神':'s','煤':'m','兖':'y','矿':'k',
    '紫':'z','洛':'l','钼':'m','江':'j','铜':'t','云':'y','铝':'l','南':'n',
    '宝':'b','钢':'g','鞍':'a','首':'s','包':'b','太':'t','马':'m',
    '螺':'l','水':'s','泥':'n','冀':'j','年':'n','伊':'y','蒙':'m','牛':'n','明':'m','元':'y','贝':'b','因':'y','美':'m',
    '分':'f','众':'z','传':'c','媒':'m','芒':'g','果':'g','超':'c','线':'x','谊':'y',
    '顺':'s','花':'h','财':'c','富':'f','慧':'h','网':'w','络':'l','办':'b','公':'g','讯':'x',
    '康':'k','威':'w','视':'s','浪':'l','潮':'c','曙':'s','创':'c','微':'w','尔':'e','兆':'z','易':'y',
    '卓':'z','胜':'s','歌':'g','立':'l','讯':'x','精':'j','密':'m','蓝':'l','思':'s',
    'T':'t','C':'c','L':'l','深':'s','码':'m','维':'w','诺':'n',
    '汇':'h','川':'c','先':'x','导':'d','晶':'j','盛':'s','锦':'j','固':'g',
    '材':'c','料':'l','恩':'e','捷':'j','璞':'p','泰':'t','来':'l','杉':'s','当':'d','升':'s',
    '容':'r','百':'b','碳':'t','翔':'x','丰':'f','鲁':'l',
    '力':'l','荣':'r','虹':'h','卫':'w','学':'x','佰':'b','和':'h','成':'c','浙':'z','龙':'l',
    '阿':'a','胶':'j','应':'y','健':'j','民':'m','九':'j','芝':'z',
    '润':'r','昆':'k','以':'y','岭':'l','人':'r','寿':'s','保':'b','险':'x',
    '移':'y','动':'d','联':'l','信':'x','控':'k','圆':'y','韵':'y','达':'d','邦':'b',
    '航':'h','空':'k','秋':'q','吉':'j','祥':'x','机':'j','场':'c','圳':'z',
    '免':'m','王':'w','府':'f','百':'b','红':'h','旗':'q','连':'l',
    '辉':'h','超':'c','市':'s','家':'j','悦':'y','步':'b',
    '船':'c','舶':'b','发':'f','沈':'s',
    '能':'n','源':'y','伏':'f','风':'f','储':'c',
    '牡':'m','丹':'d','大':'d','连':'l','青':'q','岛':'d',
    '烟':'y','台':'t','日':'r','照':'z','临':'l','沂':'y','德':'d','州':'z',
    '聊':'l','城':'c','滨':'b','菏':'h','泽':'z','济':'j','宁':'n','泰':'t','安':'a',
    '莱':'l','芜':'w','淄':'z','博':'b','枣':'z','庄':'z','东':'d','营':'y',
    '郑':'z','开':'k','封':'f','洛':'l','阳':'y','平':'p','顶':'d','鹤':'h','壁':'b',
    '新':'x','乡':'x','焦':'j','濮':'p','许':'x','漯':'l','河':'h','门':'m','峡':'x',
    '商':'s','丘':'q','周':'z','口':'k','驻':'z','马':'m','店':'d','南':'n','信':'x',
    '武':'w','汉':'h','黄':'h','石':'s','十':'s','堰':'y','宜':'y','昌':'c','襄':'x','樊':'f',
    '鄂':'e','荆':'j','孝':'x','冈':'g','咸':'x','随':'s','恩':'e','施':'s',
    '长':'c','沙':'s','株':'z','湘':'x','潭':'t','衡':'h','邵':'s','岳':'y','常':'c','张':'z',
    '益':'y','郴':'c','永':'y','怀':'h','娄':'l','底':'d',
    '成':'c','都':'d','自':'z','贡':'g','攀':'p','枝':'z','泸':'l','绵':'m',
    '遂':'s','内':'n','乐':'l','眉':'m','宜':'y','雅':'y','巴':'b',
    '资':'z','甘':'g','凉':'l','六':'l','盘':'p','遵':'z','毕':'b',
    '铜':'t','黔':'q','西':'x','昆':'k','曲':'q','玉':'y','昭':'z','丽':'l',
    '普':'p','临':'l','楚':'c','文':'w','怒':'n','迪':'d','股':'g'
  };
  for (const ch of name) { py += map[ch] || ''; }
  const ql = q.toLowerCase();
  return py.startsWith(ql) || py.includes(ql);
}

// ── 客户端搜索 (CDN模式) ─────────────────────────────────────────────────
function clientSearch(q) {
  const seen = new Set();
  const results = [];
  const ql = q.toLowerCase();
  for (const s of [...(_watchlistData||[]), ...(_favData||[])]) {
    if (seen.has(s.ticker)) continue;
    const matchCode = s.ticker.toLowerCase().includes(ql) || s.ticker.replace('.SS','').replace('.SZ','').includes(ql);
    const matchName = (s.name||'').toLowerCase().includes(ql) || (s.name||'').includes(q);
    const matchPy = pyMatch(s.name, q);
    if (matchCode || matchName || matchPy) {
      seen.add(s.ticker);
      results.push({ ticker:s.ticker, name:s.name, price:s.price, changePercent:s.changePercent, sector:s.sector, exchange:s.ticker.endsWith('.SS')?'沪市':'深市', source:'关注列表' });
    }
  }
  for (const s of (_stockDBLoaded ? STOCK_DB : STOCK_FAST)) {
    if (seen.has(s.c) || results.length >= 15) break;
    const matchCode = s.c.toLowerCase().includes(ql) || s.c.replace('.SS','').replace('.SZ','').includes(ql);
    const matchName = (s.n||'').includes(q) || (s.n||'').toLowerCase().includes(ql);
    const matchPy2 = pyMatch(s.n, q);
    if (matchCode || matchName || matchPy2) {
      seen.add(s.c);
      const qq = _extQuotes[s.c];
      results.push({ ticker:s.c, name:s.n, price:qq?qq.p:null, changePercent:qq?qq.c:null, sector:'', exchange:s.c.endsWith('.SS')?'沪市':'深市', source:qq?'实时行情':'股票库' });
    }
  }
  return results.slice(0, 12);
}

function buildSearchItemHTML(r) {
  const up = (+(r.changePercent||0)) >= 0;
  const priceColor = r.price ? (up ? 'var(--up-bright)' : 'var(--down-bright)') : 'var(--muted)';
  return '<div class="result-item" onclick="selectAndView(\''+r.ticker+'\')" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;gap:12px">'+
    '<div style="flex:1;min-width:0">'+
      '<div style="font-weight:600;font-size:0.9em">'+r.name+' <span style="color:var(--muted);font-size:0.75em;font-weight:400">'+r.ticker+'</span></div>'+
      '<div style="font-size:0.72em;color:var(--muted);margin-top:2px">'+
        (r.sector?r.sector+' · ':'')+(r.source||'')+' · '+(r.exchange||'')+
        (r.price ? ' · <b style=color:'+priceColor+'>¥'+r.price.toFixed(2)+'</b>' : ' · ⚡无行情')+
      '</div>'+
    '</div>'+
    '<div style="text-align:right;white-space:nowrap">'+
      (r.price ? '<div style="font-weight:700;font-size:1em;color:'+priceColor+'">'+(up?'+':'')+(r.changePercent||0).toFixed(2)+'%</div>' : '<div style="color:var(--muted);font-size:0.78em">—</div>')+
      '<button class="btn" style="font-size:0.7em;padding:2px 8px;margin-top:4px" onclick="event.stopPropagation();addFav(\''+r.ticker+'\',\''+(r.name||'')+'\')">⭐自选</button>'+
    '</div>'+
  '</div>';
}

function doSearchRetry(q) {
  const box = document.getElementById('searchResults');
  const results = clientSearch(q);
  if (results.length) {
    box.innerHTML = results.map(function(r) { return buildSearchItemHTML(r); }).join('') + '<div class="search-tip">📡 CDN模式 · 实时行情同步中</div>';
  }
}

function hideSearch() {
  document.getElementById('searchResults').classList.remove('show');
  searchIndex = -1;
}

function selectAndView(ticker) {
  hideSearch();
  document.getElementById('searchInput').value = ticker;
  document.getElementById('searchInput').blur();
  showStockDetail(ticker);
}

// ── 搜索（增强版：键盘导航 + 拼音 + 智能建议）─────────────────────────
let searchTimer = null;
let searchIndex = -1;

async function doSearch(q) {
  const box = document.getElementById('searchResults');
  if (q.length < 1) { hideSearch(); return; }
  box.innerHTML = '<div class="loading">🔍 搜索中...</div>';
  box.classList.add('show');

  if (isRemote) {
    const results = clientSearch(q);
    if (!results.length) {
      const dbHint = _stockDBLoaded ? '' : '<div style="font-size:0.78em;color:var(--info);margin-top:6px">⏳ 正在加载全量A股库(5207只)...</div>';
      box.innerHTML = '<div class="search-no-results"><div style="font-size:1em;margin-bottom:8px">未找到"<b>'+q+'</b>"</div><div style="margin-top:8px;font-size:0.75em;color:var(--muted)">支持：代码 / 名称 / 拼音首字母 · 5207只A股全覆盖</div>'+dbHint+'</div>';
      if (!_stockDBLoaded) { loadStockDB().then(function(){ var qq=document.getElementById('searchInput').value.trim(); if(qq===q){ doSearchRetry(q); } }); }
      return;
    }
    box.innerHTML = results.map(function(r) { return buildSearchItemHTML(r); }).join('');
    box.innerHTML += '<div class="search-tip">📡 CDN模式 · '+Object.keys(_extQuotes).length+'只实时行情覆盖</div>';
    return;
  }

  const data = await get(API.search(q));
  if (!data || !data.results?.length) {
    box.innerHTML = '<div class="search-no-results"><div style="font-size:1em;margin-bottom:8px">未找到"<b>'+q+'</b>"相关A股</div><div style="margin-top:8px;font-size:0.75em;color:var(--muted)">支持：代码 / 名称 / 拼音首字母</div></div>';
    return;
  }
  box.innerHTML = data.results.map(function(r, i) {
    return '<div class="result-item" data-index="'+i+'" onclick="selectAndView(\''+r.ticker+'\')" onmouseenter="searchIndex='+i+';updateSearchHighlight(document.querySelectorAll(\'.search-results .result-item\'))">'+
      '<div class="stock-info">'+
        '<span class="stock-name">'+r.name+' · '+r.ticker+' '+(_favTickers.has(r.ticker) ? '<span style=\"color:var(--accent);font-size:0.8em\">⭐已加</span>' : '')+'</span>'+
        '<span class="stock-code">'+(r.sector||'')+' '+(r.exchange||'')+' · '+(r.source||'')+'</span>'+
      '</div>'+
      '<div class="stock-price">'+
        '<div class="p">'+(r.price ? '¥'+F.price(r.price) : '—')+'</div>'+
        '<div class="c '+F.dir(r.changePercent)+'">'+F.pct(r.changePercent)+'</div>'+
        '<button class="btn" style="font-size:0.7em;padding:3px 6px" onclick="event.stopPropagation();addFav(\''+r.ticker+'\',\''+r.name+'\')">⭐自选</button>'+
        '<button class="btn btn-accent" style="font-size:0.7em;padding:3px 6px" onclick="event.stopPropagation();quickAnalyze(\''+r.ticker+'\')">📝分析</button>'+
      '</div>'+
    '</div>';
  }).join('');
  if (data.hasMore) box.innerHTML += '<div class="search-tip">还有更多结果，请细化搜索关键字</div>';
  else box.innerHTML += '<div class="search-tip">🖱️ 点击选择 · ⌨️ ↑↓导航 · ↵查看详情 · '+data.count+'条结果</div>';
}

// 搜索框事件
document.getElementById('searchInput').addEventListener('input', function() {
  clearTimeout(searchTimer);
  var q = this.value.trim();
  searchIndex = -1;
  document.getElementById('searchClear').classList.toggle('show', q.length > 0);
  if (q.length < 1) { hideSearch(); return; }
  searchTimer = setTimeout(function() { loadStockDB(); doSearch(q); }, 250);
});

document.getElementById('searchInput').addEventListener('focus', function() {
  if (this.value.trim().length >= 1) doSearch(this.value.trim());
});

document.getElementById('searchInput').addEventListener('keydown', function(e) {
  var items = document.querySelectorAll('.search-results .result-item');
  if (e.key === 'ArrowDown') { e.preventDefault(); searchIndex = Math.min(searchIndex + 1, items.length - 1); updateSearchHighlight(items); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); searchIndex = Math.max(searchIndex - 1, 0); updateSearchHighlight(items); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (searchIndex >= 0 && items[searchIndex]) { items[searchIndex].click(); }
    else { var q2 = this.value.trim(); if (q2.length >= 2) { hideSearch(); var ticker = q2; if (/^\d{6}$/.test(q2)) ticker = q2.startsWith('6') ? q2 + '.SS' : q2 + '.SZ'; showStockDetail(ticker); } }
  }
  else if (e.key === 'Escape') { hideSearch(); }
});

document.addEventListener('click', function(e) { if (!e.target.closest('.search-wrapper')) hideSearch(); });

// ── 股票详情弹窗 ─────────────────────────────────────────────────────────
async function showStockDetail(ticker) {
  const overlay = document.getElementById('detailOverlay');
  const panel = document.getElementById('detailPanel');
  overlay.classList.add('show');
  panel.innerHTML = '<div class="detail-loading">⏳ 正在获取实时行情...</div>';

  // CDN模式：从本地缓存构建详情
  if (isRemote) {
    // 如果完整股票库未加载，等待加载完成
    if (!_stockDBLoaded) await loadStockDB();
    let s = (_watchlistData||[]).find(d=>d.ticker===ticker);
    if (!s) {
      // 先从快速内嵌库查找（100只常用股，始终可用）
      let db = STOCK_FAST.find(x=>x.c===ticker);
      // 再从完整库查找（可能还在加载中）
      if (!db && _stockDBLoaded) db = STOCK_DB.find(x=>x.c===ticker);
      if (db) {
        // 注入扩展行情
        const ext = _extQuotes[db.c];
        s = { ticker: db.c, name: db.n, price: ext?ext.p:null, changePercent: ext?ext.c:null, volume: ext?ext.v:null, open: null, high: null, low: null, amount: null, sector: '' };
      }
    }
    if (!s) {
      panel.innerHTML = '<div class="detail-header"><div><div class="dh-name">未找到</div><div class="dh-code">'+ticker+'</div></div><button class="detail-close" onclick="closeDetail()">✕</button></div><div class="detail-loading">股票库加载中，请稍后再试<br><small>或访问 <b>http://localhost:3000</b> 获取完整数据</small></div>';
      return;
    }
    showStockDetailCDN(s);
    return;
  }

  // 并行获取行情和新闻 (8秒超时防止永久卡住)
  let stock, news;
  try {
    [stock, news] = await Promise.race([
      Promise.all([
        get(`/api/stock/${encodeURIComponent(ticker)}`),
        get(`/api/stock/${encodeURIComponent(ticker)}/news`)
      ]),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
    ]);
  } catch(e) {
    panel.innerHTML = '<div class="detail-header"><div><div class="dh-name">网络超时</div><div class="dh-code">'+ticker+'</div></div><button class="detail-close" onclick="closeDetail()">✕</button></div><div class="detail-loading">⏱️ 请求超时，请检查服务器是否运行<br><small>npm run dashboard 启动本地服务</small></div>';
    return;
  }

  if (!stock || stock.error) {
    panel.innerHTML = `
      <div class="detail-header">
        <div><div class="dh-name">未找到股票</div><div class="dh-code">${ticker}</div></div>
        <button class="detail-close" onclick="closeDetail()">✕</button>
      </div>
      <div class="detail-loading">${stock?.message||'请检查代码格式: 沪市 600xxx.SS, 深市 000xxx.SZ'}</div>`;
    return;
  }

  const up = +stock.changePercent >= 0;
  panel.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="dh-name">${stock.name}</div>
        <div class="dh-code">${stock.ticker} · ${stock.sector||'—'}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-primary" style="font-size:0.8em" onclick="addFav('${stock.ticker}','${stock.name}')">⭐ 加自选</button>
        <button class="btn btn-accent" style="font-size:0.8em" onclick="quickAnalyze('${stock.ticker}')">📝 一键分析</button>
        <button class="detail-close" onclick="closeDetail()">✕</button>
      </div>
    </div>
    <div class="detail-price">
      <span class="dp-main">¥${F.price(stock.price)}</span>
      <span class="dp-change ${up?'up':'down'}">${F.pct(stock.changePercent)} ${up?'📈':'📉'}</span>
    </div>
    <div class="detail-grid">
      <div class="detail-metric"><div class="dm-label">开盘价</div><div class="dm-value">¥${F.price(stock.open)}</div></div>
      <div class="detail-metric"><div class="dm-label">昨收</div><div class="dm-value">¥${F.price(stock.prevClose)}</div></div>
      <div class="detail-metric"><div class="dm-label">最高</div><div class="dm-value" style="color:var(--up-bright)">¥${F.price(stock.high)}</div></div>
      <div class="detail-metric"><div class="dm-label">最低</div><div class="dm-value" style="color:var(--down-bright)">¥${F.price(stock.low)}</div></div>
      <div class="detail-metric"><div class="dm-label">成交量</div><div class="dm-value">${F.vol(stock.volume)}</div></div>
      <div class="detail-metric"><div class="dm-label">成交额</div><div class="dm-value">${(stock.amount/1e8).toFixed(2)}亿</div></div>
      ${stock.pe ? `<div class="detail-metric"><div class="dm-label">市盈率</div><div class="dm-value">${(+stock.pe).toFixed(1)}</div></div>` : ''}
      ${stock.marketCap ? `<div class="detail-metric"><div class="dm-label">总市值</div><div class="dm-value">${(stock.marketCap/1e8).toFixed(0)}亿</div></div>` : ''}
      ${stock.targetPrice ? `<div class="detail-metric"><div class="dm-label">目标价</div><div class="dm-value">¥${stock.targetPrice}</div></div>` : ''}
      <div class="detail-metric"><div class="dm-label">更新时间</div><div class="dm-value" style="font-size:0.8em">${stock.time||stock.date||'—'}</div></div>
    </div>

    ${stock.signal ? `
    <div class="detail-section">
      <div class="ds-title">🎯 当日技术信号</div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <span style="font-size:1.5em;font-weight:700;color:${stock.signal.color}">${stock.signal.signalText}</span>
        <span class="badge ${stock.signal.signal.toLowerCase()}" style="font-size:0.9em">${stock.signal.signal}</span>
        <span style="font-size:1.2em;font-weight:700;color:${stock.signal.color}">${stock.signal.score}分</span>
      </div>
      <!-- 日内价格可视化 -->
      <canvas id="dayChart" width="600" height="80" style="width:100%;max-width:600px;height:80px;margin:8px 0"></canvas>
      <div class="detail-grid">
        <div class="detail-metric"><div class="dm-label">相对昨收</div><div class="dm-value">${stock.signal.details.priceVsClose}</div></div>
        <div class="detail-metric"><div class="dm-label">日内振幅</div><div class="dm-value">${stock.signal.details.dayAmplitude}</div></div>
        <div class="detail-metric"><div class="dm-label">价格位置</div><div class="dm-value">${stock.signal.details.pricePosition}</div></div>
        <div class="detail-metric"><div class="dm-label">开盘方向</div><div class="dm-value">${stock.signal.details.openCloseDirection}</div></div>
        <div class="detail-metric"><div class="dm-label">量能</div><div class="dm-value">${stock.signal.details.volumeLevel}</div></div>
      </div>
      <div style="font-size:0.7em;color:var(--muted);margin-top:4px">${stock.signal.disclaimer}</div>
    </div>
` : ''}
    ${stock.open && stock.high && stock.low && stock.price ? `
    <!-- Canvas由下面的drawDayChart绘制 -->
    ` : ''}

    ${news?.articles?.length ? `
    <div class="detail-section">
      <div class="ds-title">📰 ${news.name||stock.name} 最新新闻 (${news.articles.length}条)</div>
      ${news.articles.slice(0, 8).map(a => `
        <div class="news-item">
          <a href="${a.url}" target="_blank" title="${a.url}">${a.title}</a>
          <div class="news-meta">${a.source||'新浪财经'} ${a.time||''}</div>
        </div>
      `).join('')}
    </div>` : '<div class="detail-section"><div class="ds-title">📰 新闻</div><div style="color:var(--muted);font-size:0.85em">暂未抓取到新闻</div></div>'}

    ${news?.externalLinks ? `
    <div class="detail-section">
      <div class="ds-title">🔗 外部链接</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <a href="${news.externalLinks.sina}" target="_blank" class="btn" style="text-decoration:none;font-size:0.8em">📰 新浪财经</a>
        <a href="${news.externalLinks.eastmoney}" target="_blank" class="btn" style="text-decoration:none;font-size:0.8em">💬 东方财富股吧</a>
        <a href="${news.externalLinks.baidu}" target="_blank" class="btn" style="text-decoration:none;font-size:0.8em">🔍 百度搜索</a>
      </div>
    </div>` : ''}

    <div style="text-align:right;margin-top:12px">
      <span style="font-size:0.75em;color:var(--muted)">数据来源: 新浪财经实时行情 · 仅供参考</span>
    </div>`;

  // 绘制日内K线图（innerHTML后执行）
  if (stock.open && stock.high && stock.low && stock.price) {
    setTimeout(() => drawDayChart(stock), 50);
  }
}

function drawDayChart(stock) {
  const canvas = document.getElementById('dayChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const open = +stock.open, high = +stock.high, low = +stock.low;
  const price = +stock.price, prevClose = +stock.prevClose;
  if (!open || !high || !low || !price) return;
  const range = high - low || 1;
  const pad = 40;
  const y = v => pad + (high - v) / range * (H - pad * 2);
  const up = price >= open;
  const color = up ? '#ec4f5e' : '#22c55e';
  ctx.clearRect(0, 0, W, H);
  const pcY = y(prevClose);
  if (pcY > pad && pcY < H - pad) {
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#8890a8'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, pcY); ctx.lineTo(W - pad, pcY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#8890a8'; ctx.font = '9px sans-serif';
    ctx.fillText('昨收 ' + prevClose.toFixed(2), W - pad - 70, pcY - 3);
  }
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(W / 2, y(high)); ctx.lineTo(W / 2, y(low)); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W / 2 - 10, y(high)); ctx.lineTo(W / 2 + 10, y(high)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W / 2 - 10, y(low)); ctx.lineTo(W / 2 + 10, y(low)); ctx.stroke();
  const barW = 16;
  const oY = y(open), cY = y(price);
  ctx.fillStyle = color;
  ctx.fillRect(W / 2 - barW / 2, Math.min(oY, cY), barW, Math.abs(cY - oY) || 1);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif';
  ctx.fillText('¥' + price.toFixed(2), W / 2 + 14, cY + 4);
  ctx.fillText('开 ¥' + open.toFixed(2), W / 2 - 50, oY + 4);
  ctx.fillStyle = color; ctx.font = '9px sans-serif';
  ctx.fillText('高 ' + high.toFixed(2), W / 2 + 14, y(high) + 4);
  ctx.fillText('低 ' + low.toFixed(2), W / 2 + 14, y(low) + 4);
}

// CDN模式股票详情 (从缓存数据构建)
function showStockDetailCDN(s) {
  const panel = document.getElementById('detailPanel');
  // 尝试从扩展行情获取实时数据
  const ext = _extQuotes[s.ticker];
  if (ext && ext.p) {
    s.price = ext.p;
    s.changePercent = ext.c;
    s.volume = ext.v;
  }
  const hasData = s.price != null && s.price > 0;
  const up = (+s.changePercent||0) >= 0;

  // 实时计算信号
  let sigScore = 50, sigText = '数据不足', sigColor = 'var(--muted)';
  if (hasData && s.changePercent != null) {
    const cp = +s.changePercent;
    if (cp >= 3) { sigScore = 80; sigText = '强势看多'; sigColor = 'var(--up-bright)'; }
    else if (cp >= 1) { sigScore = 65; sigText = '偏多'; sigColor = 'var(--up-bright)'; }
    else if (cp <= -3) { sigScore = 20; sigText = '弱势回避'; sigColor = 'var(--down-bright)'; }
    else if (cp <= -1) { sigScore = 35; sigText = '偏弱关注'; sigColor = 'var(--down-bright)'; }
    else { sigScore = 50; sigText = '震荡观望'; sigColor = 'var(--accent)'; }
  }

  // 新闻链接
  const code = s.ticker.replace('.SS','sh').replace('.SZ','sz');
  const codeNum = s.ticker.replace(/\.\w+$/,'');

  panel.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="dh-name">${s.name||s.ticker}</div>
        <div class="dh-code">${s.ticker} · ${s.sector||'—'}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-primary" style="font-size:0.8em" onclick="addFav('${s.ticker}','${s.name}')">⭐ 加自选</button>
        <button class="detail-close" onclick="closeDetail()">✕</button>
      </div>
    </div>
    ${hasData ? `
    <div class="detail-price">
      <span class="dp-main">¥${F.price(s.price)}</span>
      <span class="dp-change ${up?'up':'down'}">${F.pct(s.changePercent)} ${up?'📈':'📉'}</span>
    </div>
    <div class="detail-grid">
      <div class="detail-metric"><div class="dm-label">开盘价</div><div class="dm-value">¥${F.price(s.open)}</div></div>
      <div class="detail-metric"><div class="dm-label">昨收</div><div class="dm-value">¥${(function(){if(s.changePercent!=null){return F.price(s.price/(1+ +s.changePercent/100));}return F.price(s.price);})()}</div></div>
      <div class="detail-metric"><div class="dm-label">最高</div><div class="dm-value" style="color:var(--up-bright)">¥${F.price(s.high)}</div></div>
      <div class="detail-metric"><div class="dm-label">最低</div><div class="dm-value" style="color:var(--down-bright)">¥${F.price(s.low)}</div></div>
      <div class="detail-metric"><div class="dm-label">成交量</div><div class="dm-value">${F.vol(s.volume)}</div></div>
      <div class="detail-metric"><div class="dm-label">成交额</div><div class="dm-value">${s.amount ? (s.amount/1e8).toFixed(2)+'亿' : '—'}</div></div>
      <div class="detail-metric"><div class="dm-label">日振幅</div><div class="dm-value">${s.high&&s.low&&s.prevClose ? ((s.high-s.low)/s.prevClose*100).toFixed(2)+'%' : '—'}</div></div>
    </div>
    <div class="detail-section" style="margin-top:0">
      <div class="ds-title">📈 日内走势</div>
      <canvas id="detailSparkline" style="width:100%;height:100px;border-radius:8px;background:var(--surface2)"></canvas>
      <div style="display:flex;justify-content:space-between;font-size:0.68em;color:var(--muted);margin-top:4px;padding:0 4px">
        <span>开 ¥${F.price(s.open||s.price)}</span>
        <span>高 ¥${F.price(s.high||s.price)}</span>
        <span>低 ¥${F.price(s.low||s.price)}</span>
        <span>收 ¥${F.price(s.price)}</span>
      </div>
    </div>
    <div class="detail-section">
      <div class="ds-title">🎯 当日技术信号</div>
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:1.5em;font-weight:700;color:${sigColor}">${sigText}</span>
        <span style="font-size:1.2em;font-weight:700;color:${sigColor}">${sigScore}分</span>
      </div>
    </div>
    ` : `<div class="detail-loading" style="padding:20px;text-align:center;color:var(--muted)">该股票暂不在关注列表中，无实时行情数据<br><small>仅显示基本信息</small></div>`}
    <div class="detail-section">
      <div class="ds-title">📰 新闻 & 外部链接</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
        <a href="https://finance.sina.com.cn/realstock/company/${code}/nc.shtml" target="_blank" class="btn" style="text-decoration:none;font-size:0.82em">📰 新浪个股</a>
        <a href="https://guba.eastmoney.com/list,${codeNum}.html" target="_blank" class="btn" style="text-decoration:none;font-size:0.82em">💬 股吧讨论</a>
        <a href="https://www.baidu.com/s?wd=${encodeURIComponent(s.name||'')}+${codeNum}+股票新闻" target="_blank" class="btn" style="text-decoration:none;font-size:0.82em">🔍 百度新闻</a>
        <a href="https://xueqiu.com/S/${code}" target="_blank" class="btn" style="text-decoration:none;font-size:0.82em">❄️ 雪球</a>
      </div>
    </div>
    <div style="text-align:right;margin-top:12px">
      <span style="font-size:0.75em;color:var(--muted)">📡 CDN模式 · 行情≤10分钟延迟 · 仅供参考</span>
    </div>`;
}

function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('show');
}

// ── 自选股 ──────────────────────────────────────────────────────────────
async function addFav(ticker, name) {
  if (isRemote) {
    // 查找名称（如果未传入）
    if (!name) {
      const wl = (_watchlistData||[]).find(s=>s.ticker===ticker);
      if (wl) name = wl.name;
      else { const db = STOCK_DB.find(s=>s.c===ticker); if (db) name = db.n; }
      if (!name) name = ticker;
    }
    let favs = JSON.parse(localStorage.getItem('stock_favs_v2')||'[]');
    if (!favs.find(f=>f.ticker===ticker)) {
      favs.push({ticker, name, addedAt: new Date().toISOString()});
      localStorage.setItem('stock_favs_v2', JSON.stringify(favs));
      showToast('⭐ 已加入自选: '+name);
      loadFavorites();
    } else { showToast('💡 已在自选中'); }
    return;
  }
  try {
    const resp = await fetch(API.favAdd, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker })
    });
    const r = await resp.json();
    if (r.status === 'added') { showToast('✅ ' + r.message); loadFavorites(); }
    else if (r.status === 'exists') showToast('💡 已在自选中');
  } catch(e) { showToast('❌ 添加失败'); }
}

async function removeFav(ticker) {
  if (isRemote) {
    let favs = JSON.parse(localStorage.getItem('stock_favs_v2')||'[]');
    favs = favs.filter(f=>f.ticker!==ticker);
    localStorage.setItem('stock_favs_v2', JSON.stringify(favs));
    showToast('已移出自选');
    loadFavorites();
    return;
  }
  try {
    const resp = await fetch(API.favRemove, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker })
    });
    const r = await resp.json();
    if (r.status === 'removed') { showToast('🗑️ ' + r.message); loadFavorites(); }
  } catch(e) { showToast('❌ 移除失败'); }
}

async function loadFavorites() {
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
      if (isRemote) {
        const wl = (_watchlistData||[]).find(x=>x.ticker===s.ticker);
        if (wl && wl.price) { price = wl.price; change = wl.change; changePercent = wl.changePercent; volume = wl.volume; amount = wl.amount; }
        else if (_extQuotes[s.ticker]) { const q=_extQuotes[s.ticker]; price = q.p; changePercent = q.c; volume = q.v; amount = q.a; change = q.p ? (q.p * q.c / 100) : null; }
      }
      const cp2 = +(changePercent || 0);
      let sigScore2 = 50, sigText2 = '震荡观望', sigColor2 = 'var(--accent)', sigBg2 = 'var(--accent-bg)', sigBdr2 = 'rgba(245,158,11,0.35)';
      if (cp2 >= 3) { sigScore2 = 80; sigText2 = '强势看多'; sigColor2 = 'var(--up-bright)'; sigBg2 = 'var(--up-bg)'; sigBdr2 = 'var(--up-border)'; }
      else if (cp2 >= 1) { sigScore2 = 65; sigText2 = '偏多'; sigColor2 = 'var(--up-bright)'; sigBg2 = 'var(--up-bg)'; sigBdr2 = 'var(--up-border)'; }
      else if (cp2 <= -3) { sigScore2 = 20; sigText2 = '弱势回避'; sigColor2 = 'var(--down-bright)'; sigBg2 = 'var(--down-bg)'; sigBdr2 = 'var(--down-border)'; }
      else if (cp2 <= -1) { sigScore2 = 35; sigText2 = '偏弱关注'; sigColor2 = 'var(--down-bright)'; sigBg2 = 'var(--down-bg)'; sigBdr2 = 'var(--down-border)'; }
      const up = +(changePercent || 0) >= 0;
      return `<tr style="cursor:pointer" onclick="showStockDetail('${s.ticker}')">
        <td><b>${s.ticker}</b></td>
        <td><span class="stock-link">${s.name||s.ticker}</span>${s.sector?` <span class="sector-tag">${s.sector}</span>`:''}</td>
        <td>${price ? '¥'+F.price(price) : '—'}</td>
        <td class="${up?'up':'down'}">${change != null ? (change>0?'+':'')+(+change).toFixed(2) : '—'}</td>
        <td class="${up?'up':'down'}">${F.pct(changePercent)}</td>
        <td>${F.vol(volume)}</td>
        <td>${amount ? (amount/1e8).toFixed(2)+'亿' : '—'}</td>
        <td>${changePercent!=null?'<span class="badge" style="font-size:0.78em;background:'+sigBg2+';color:'+sigColor2+';border:1px solid '+sigBdr2+'">'+sigText2+' · '+sigScore2+'分</span>':'—'}</td>
        <td><button class="btn" style="font-size:0.7em;padding:2px 8px;color:var(--down-bright)" onclick="event.stopPropagation();removeFav('${s.ticker}')">✕ 移除</button></td>
      </tr>`;
    }).join('');
  } catch(e) { console.error('Fav load error:', e); }
}

// ── 快速分析 ────────────────────────────────────────────────────────────
async function quickAnalyze(ticker) {

  showToast('📝 正在生成分析报告...');
  try {
    const resp = await fetch(API.analyze, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker })
    });
    const r = await resp.json();
    if (r.status === 'generated') {
      showToast('✅ 报告已生成: ' + r.name);
      refreshAll(); // 刷新报告列表
    }
  } catch(e) { showToast('❌ 分析失败'); }
}

// ── CSV 导出 ────────────────────────────────────────────────────────────
function exportCSV() {
  const rows = document.querySelectorAll('#watchlistBody tr');
  const data = [];
  data.push(['代码','名称','最新价','涨跌','涨跌幅%','成交量','成交额(亿)','市盈率','目标价','专家评分','信号']);
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 8) return;
    const ticker = cells[0]?.textContent?.trim() || '';
    const name = cells[1]?.textContent?.trim() || '';
    // Extract numbers from formatted text
    const price = cells[2]?.textContent?.replace('¥','').trim() || '';
    const change = cells[3]?.textContent?.replace(/[＋+]/,'').trim() || '';
    const changePct = cells[4]?.textContent?.replace('%','').trim() || '';
    const volume = cells[5]?.textContent?.trim() || '';
    const amount = cells[6]?.textContent?.replace('亿','').trim() || '';
    const pe = cells[7]?.textContent?.trim() || '';
    const target = cells[8]?.textContent?.replace('¥','').trim() || '';
    const stars = cells[9]?.textContent?.trim() || '';
    const sig = cells[10]?.textContent?.trim() || '';
    data.push([ticker,name,price,change,changePct,volume,amount,pe,target,stars,sig]);
  });
  const BOM = '﻿'; // Excel UTF-8 BOM
  const csv = BOM + data.map(r => r.map(c => '"'+(c||'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `A股关注列表_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('📥 CSV已导出');
}

// ── 客户端报告隐藏 (CDN模式删除用localStorage) ───────────────────────────
function _getHiddenReports() {
  try { return new Set(JSON.parse(localStorage.getItem('hidden_reports')||'[]')); }
  catch { return new Set(); }
}
function _hideReport(filename) {
  const s = _getHiddenReports(); s.add(filename);
  localStorage.setItem('hidden_reports', JSON.stringify([...s]));
}
function _unhideAllReports() {
  localStorage.removeItem('hidden_reports');
}
function _filterHidden(reports) {
  if (isRemote) { const h = _getHiddenReports(); return reports.filter(r => !h.has(r.filename)); }
  return reports;
}

// ── 批量选择 + 删除选中 ──────────────────────────────────────────────────
function toggleSelectAllReports(btn) {
  document.querySelectorAll('.report-cb').forEach(cb => { cb.checked = btn.checked; });
}
async function deleteSelectedReports() {
  const checked = document.querySelectorAll('.report-cb:checked');
  if (checked.length === 0) { showToast('💡 请先勾选要删除的报告'); return; }
  if (!confirm('⚠️ 确认删除已选中的 '+checked.length+' 份报告？')) return;

  if (isRemote) {
    // CDN模式：客户端隐藏
    for (const cb of checked) { _hideReport(cb.dataset.file); }
    showToast('✅ 已隐藏 '+checked.length+' 份报告'); refreshAll(); return;
  }
  showToast('🗑️ 正在删除 '+checked.length+' 份...');
  let done = 0, fail = 0;
  for (const cb of checked) {
    const fn = cb.dataset.file, row = cb.closest('.report-row');
    if (row) row.classList.add('deleting');
    try {
      const resp = await fetch('/api/reports/' + fn, { method: 'DELETE' });
      if (resp.ok) { const r = await resp.json(); if (r.status==='deleted') { done++; if (row) row.remove(); continue; } }
      fail++; if (row) row.classList.remove('deleting');
    } catch(e) { fail++; if (row) row.classList.remove('deleting'); }
  }
  showToast(done>0 ? '✅ 已删除 '+done+'/'+(done+fail)+' 份' : '❌ 删除失败'); if (done>0) refreshAll();
}

// ── 一键删除全部报告 ────────────────────────────────────────────────────
async function deleteAllReports() {
  if (!confirm('⚠️ 确认删除所有分析报告？')) return;
  if (isRemote) {
    // CDN模式：隐藏全部
    const rows = document.querySelectorAll('.report-row');
    rows.forEach(r => { const f = r.dataset.file; if (f) _hideReport(f); });
    showToast('✅ 已隐藏全部报告'); refreshAll(); return;
  }
  showToast('🗑️ 正在批量删除...');
  try {
    const resp = await fetch('/api/reports/all', { method: 'DELETE' });
    if (!resp.ok) throw new Error('HTTP '+resp.status);
    const r = await resp.json();
    if (r.status === 'deleted') { showToast('✅ 已删除 ' + r.count + ' 份报告'); refreshAll(); }
  } catch(e) { showToast('❌ 批量删除失败: ' + e.message); }
}

// ── 删除报告 ────────────────────────────────────────────────────────────
async function deleteReport(filename, btnEl) {
  if (!confirm('确认删除此分析报告？')) return;
  let row = btnEl ? btnEl.closest('.report-row') : document.querySelector('[data-file="'+filename+'"]');
  if (row) row.classList.add('deleting');

  if (isRemote) {
    // CDN模式：客户端隐藏（localStorage持久化）
    _hideReport(filename);
    showToast('🗑️ 已隐藏（刷新后不再显示）');
    if (row) { row.style.maxHeight = row.offsetHeight+'px'; setTimeout(()=>row.style.maxHeight='0', 50); setTimeout(()=>row.remove(), 400); }
    return;
  }
  try {
    const resp = await fetch('/api/reports/' + encodeURIComponent(filename), { method: 'DELETE' });
    if (!resp.ok) throw new Error('HTTP '+resp.status);
    const r = await resp.json();
    if (r.status === 'deleted') {
      showToast('🗑️ 已删除');
      if (row) { row.style.maxHeight = row.offsetHeight+'px'; setTimeout(()=>row.style.maxHeight='0', 50); setTimeout(()=>row.remove(), 400); }
    }
  } catch(e) { showToast('❌ 删除失败'); if(row) row.classList.remove('deleting'); }
}

// Toast 提示
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.style.cssText = 'position:fixed;top:70px;right:20px;background:var(--surface);border:1px solid var(--border);padding:10px 20px;border-radius:8px;z-index:9999;font-size:0.9em;transition:opacity 0.3s'; document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._tid); t._tid = setTimeout(() => t.style.opacity = '0', 2000);
}

// ── 时钟 ─────────────────────────────────────────────────────────────────
function updateClock() {
  document.getElementById('clock').innerHTML = `<div>${F.d()}</div><div style="font-weight:600;color:var(--text)">${F.t()}</div>`;
  const ms = getMarketStatus();
  document.getElementById('marketBadge').innerHTML = `<span class="dot ${ms.cls==='open'?'live':'off'}"></span>${ms.text}`;
  document.getElementById('marketBadge').className = `market-badge ${ms.cls}`;
}

// ── 主刷新 ───────────────────────────────────────────────────────────────

async function refreshAll() {
  const btn = document.getElementById('refreshBtn');
  btn.textContent = '⏳ ...';
  btn.disabled = true;

  // CDN模式: 加载扩展行情数据
  if (isRemote) {
    fetchCDN('quotes_ext.json').then(data => {
      if (data && data.quotes) {
        _extQuotes = {};
        data.quotes.forEach(q => { _extQuotes[q.t] = q; });
        console.log('扩展行情加载:', Object.keys(_extQuotes).length, '只');
        // 更新自选显示（注入实时价格）
        try { loadFavorites(); } catch {}
      }
    }).catch(() => {});
  }

  const start = Date.now();
  // 使用 allSettled 避免单个API失败导致全部卡住
  const results = await Promise.allSettled([
    get(API.market),
    get(API.watchlistLive),
    get(API.analysis),
    get(API.reports)
  ]);
  const elapsed = Date.now() - start;

  const [market, live, analysis, reports] = results.map(r => r.status === 'fulfilled' ? r.value : null);

  if (market) {
    renderIndices(market.indices);
    renderSectors(market.sectors);
  }

  if (live?.stocks) {
    renderWatchlist(live.stocks, live.source);
  } else {
    try {
      const cached = await get(API.watchlist);
      if (cached?.stocks) renderWatchlist(cached.stocks, '缓存');
    } catch {}
  }

  if (live?.trending?.length) {
    renderTrending(live.trending);
  } else if (market?.trending) {
    renderTrending(market.trending);
  }

  if (analysis?.recommendations) renderAnalysis(analysis.recommendations);
  if (reports?.reports) renderReports(reports.reports);

  try { loadFavorites(); refreshFavTickers(); } catch {}
  updateFooterTime();
  updateClock();
  btn.textContent = '✅ ' + elapsed + 'ms';
  btn.disabled = false;
  setTimeout(() => updateRefreshBadge(), 2000);
}

// ── 快捷键 + 回到顶部 ──────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('searchInput').focus();
    document.getElementById('searchInput').select();
  }
});
window.addEventListener('scroll', function() {
  const btn = document.getElementById('backTop');
  btn.classList.toggle('show', window.scrollY > 600);
});
function updateFooterTime() {
  const el = document.getElementById('footerTime');
  if (el) el.textContent = '| 最后刷新: ' + new Date().toLocaleTimeString('zh-CN');
}
let _favTickers = new Set();
let _favData = [];
async function refreshFavTickers() {
  try { const data = await get(API.favorites); _favTickers = new Set((data?.favorites||[]).map(f => f.ticker)); _favData = data?.favorites||[]; } catch {}
}

// ── 智能刷新：盘中60秒 / 盘后5分钟 ──────────────────────────────────────
let refreshInterval = null;
let refreshCountdown = 0;
function getRefreshSeconds() {
  const now = new Date(), day = now.getDay(), h = now.getHours(), m = now.getMinutes();
  if (day === 0 || day === 6) return 300; // 周末5分钟
  const t = h * 60 + m;
  if (t >= 9*60+15 && t <= 11*60+30 || t >= 13*60 && t <= 15*60) return 60; // 盘中60秒
  return 120; // 盘前/盘后/午休2分钟
}
function startSmartRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  const secs = getRefreshSeconds();
  refreshCountdown = secs;
  refreshInterval = setInterval(() => {
    refreshCountdown--;
    updateRefreshBadge();
    if (refreshCountdown <= 0) {
      refreshAll();
      const newSecs = getRefreshSeconds();
      refreshCountdown = newSecs;
      // 如果频率变了，重建定时器
      if (newSecs !== secs) startSmartRefresh();
    }
  }, 1000);
}
function updateRefreshBadge() {
  const btn = document.getElementById('refreshBtn');
  const secs = refreshCountdown;
  if (secs <= 10) btn.textContent = '🔄 ' + secs + 's';
  else btn.textContent = '🔄 ' + Math.floor(secs/60) + ':' + String(secs%60).padStart(2,'0');
}

updateClock();
setInterval(updateClock, 1000);
refreshAll();
startSmartRefresh();
