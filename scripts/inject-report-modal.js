// inject-report-modal.js — 注入报告内嵌弹窗功能到 index.html
const fs = require('fs');
const f = 'f:/Claude code test/dashboard/public/index.html';
let c = fs.readFileSync(f, 'utf8');

let changes = 0;

// ── 1. 添加报告弹窗 CSS ──
const cssInsert = `
    /* 报告内嵌弹窗 */
    .report-overlay {
      display: none; position: fixed; top:0; left:0; right:0; bottom:0;
      background: rgba(0,0,0,0.75); z-index: 600;
      justify-content: center; align-items: flex-start; padding-top: 40px;
    }
    .report-overlay.show { display: flex; }
    .report-panel {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; width: 92%; max-width: 960px; max-height: 88vh;
      overflow-y: auto; padding: 28px; box-shadow: 0 24px 80px rgba(0,0,0,0.7);
    }
    .report-panel h1 { font-size: 1.4em; margin: 0 0 4px 0; }
    .report-panel h2 { font-size: 1.1em; margin: 20px 0 10px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
    .report-panel h3 { font-size: 0.95em; margin: 14px 0 8px; }
    .report-panel table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 0.85em; }
    .report-panel th, .report-panel td { border: 1px solid var(--border); padding: 5px 8px; text-align: left; }
    .report-panel th { background: var(--surface2); font-weight: 600; }
    .report-panel blockquote { border-left: 3px solid var(--accent); margin: 8px 0; padding: 6px 14px; background: var(--surface2); border-radius: 0 6px 6px 0; }
    .report-panel hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
    .report-panel code { background: var(--surface2); padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }
    .report-panel .rp-meta { font-size: 0.8em; color: var(--muted); margin-bottom: 16px; }
    .report-close {
      position: sticky; top: 0; float: right; z-index: 10;
      background: var(--surface2); border: 1px solid var(--border); border-radius: 50%;
      color: var(--muted); font-size: 1.3em; cursor: pointer; width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
    }
    .report-close:hover { color: var(--text); background: var(--border); }
    .report-loading { text-align: center; padding: 40px; color: var(--muted); }
    .report-loading .spinner { display: inline-block; width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .report-news-item { padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 0.85em; }
    .report-news-item:last-child { border-bottom: none; }
    .report-news-item a { color: var(--text); text-decoration: none; }
    .report-news-item a:hover { color: var(--primary); }
    .report-news-item .rn-date { font-size: 0.75em; color: var(--muted); }
    .report-strip { display: flex; gap: 12px; flex-wrap: wrap; margin: 12px 0; padding: 10px 14px; background: var(--surface2); border-radius: 8px; font-size: 0.85em; }
    .report-strip .rs-item { text-align: center; min-width: 60px; }
    .report-strip .rs-item .v { font-weight: 700; font-size: 1.1em; }
    .report-strip .rs-item .l { font-size: 0.7em; color: var(--muted); }
    .report-tabs { display: flex; gap: 0; margin: 12px 0; border-bottom: 2px solid var(--border); }
    .report-tab { padding: 8px 16px; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -2px; font-size: 0.9em; }
    .report-tab.active { color: var(--primary); border-bottom-color: var(--primary); }
    .report-tab:hover { color: var(--text); }
    .report-tab-content { display: none; }
    .report-tab-content.active { display: block; }
`;

const cssEndMarker = '/* 可点击的股票名 */';
if (c.includes(cssEndMarker) && !c.includes('report-overlay')) {
  c = c.replace(cssEndMarker, cssInsert + '\n    ' + cssEndMarker);
  changes++;
  console.log('✓ CSS 已添加');
}

// ── 2. 添加报告弹窗 HTML 容器 ──
const overlayHtml = `
<!-- 报告内嵌弹窗 -->
<div class="report-overlay" id="reportOverlay" onclick="if(event.target===this)closeReportModal()">
  <div class="report-panel" id="reportPanel">
    <div class="report-loading"><div class="spinner"></div><p>加载报告中...</p></div>
  </div>
</div>`;

const htmlMarker = '<div class="detail-overlay" id="detailOverlay"';
if (c.includes(htmlMarker) && !c.includes('reportOverlay')) {
  c = c.replace(htmlMarker, overlayHtml + '\n' + htmlMarker);
  changes++;
  console.log('✓ 弹窗 HTML 已添加');
}

// ── 3. 修改报告链接从 <a> 改为 onclick ──
const oldLink = `<a href="/report.html?file=\${encodeURIComponent(r.filename)}" target="_blank" class="report-link" title="点击查看完整报告">
\t        <span class="report-name">\${stockName}</span>
\t        \${stockCode ? '<span class="sector-tag" style="font-size:0.68em">'+stockCode+'</span>' : ''}
\t        <span style="color:var(--muted);font-size:0.7em;white-space:nowrap">\${typeLabel}</span>
\t        <span style="color:var(--muted);font-size:0.7em;white-space:nowrap;margin-left:auto">\${r.date||''}</span>
\t      </a>`;

const newLink = `<span class="report-link" onclick="openReportInline('\${encodeURIComponent(r.filename)}','\${stockCode}','\${stockName}')" title="点击查看报告+实时行情+新闻" style="cursor:pointer">
\t        <span class="report-name">\${stockName}</span>
\t        \${stockCode ? '<span class="sector-tag" style="font-size:0.68em">'+stockCode+'</span>' : ''}
\t        <span style="color:var(--muted);font-size:0.7em;white-space:nowrap">\${typeLabel}</span>
\t        <span style="color:var(--muted);font-size:0.7em;white-space:nowrap;margin-left:auto">\${r.date||''}</span>
\t      </span>`;

if (c.includes(oldLink)) {
  c = c.replace(oldLink, newLink);
  changes++;
  console.log('✓ 报告链接已改为弹窗');
} else {
  // 尝试另一种匹配（可能有空格差异）
  const altOld = `<a href="/report.html?file=`;
  if (c.includes(altOld)) {
    console.log('⚠ 找到alt链接但格式不完全匹配，用正则替换');
    const re = /<a href="\/report\.html\?file=\$\{encodeURIComponent\(r\.filename\)\}"[^>]*class="report-link"[^>]*>[\s\S]*?<\/a>/;
    const altNew = `<span class="report-link" onclick="openReportInline('$\{encodeURIComponent(r.filename)}','$\{stockCode}','$\{stockName}')" title="点击查看报告+实时行情+新闻" style="cursor:pointer">
\t        <span class="report-name">$\{stockName}</span>
\t        $\{stockCode ? '<span class="sector-tag" style="font-size:0.68em">'+stockCode+'</span>' : ''}
\t        <span style="color:var(--muted);font-size:0.7em;white-space:nowrap">$\{typeLabel}</span>
\t        <span style="color:var(--muted);font-size:0.7em;white-space:nowrap;margin-left:auto">$\{r.date||''}</span>
\t      </span>`;
    if (re.test(c)) {
      c = c.replace(re, altNew);
      changes++;
      console.log('✓ 报告链接已替换 (正则)');
    }
  }
}

// ── 4. 在 </body> 前注入核心 JS 函数 ──
const bodyEnd = '</body>';
if (c.includes(bodyEnd) && !c.includes('openReportInline')) {
  const jsCode = `
<script>
// ── 报告内嵌弹窗引擎 ──────────────────────────────────────────────────────
function closeReportModal() {
  document.getElementById('reportOverlay').classList.remove('show');
  document.body.style.overflow = '';
}

function openReportInline(filename, stockCode, stockName) {
  const overlay = document.getElementById('reportOverlay');
  const panel = document.getElementById('reportPanel');
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
  panel.innerHTML = '<div class="report-loading"><div class="spinner"></div><p>加载报告中...</p></div>';

  // 并行加载：报告 + 行情数据 + 新闻
  Promise.all([
    fetchReport(filename),
    getStockData(stockCode),
    fetchStockNews(stockCode, stockName)
  ]).then(function(results) {
    var reportHtml = results[0];
    var stockInfo = results[1];
    var newsHtml = results[2];
    renderReportPanel(panel, filename, stockCode, stockName, reportHtml, stockInfo, newsHtml);
  }).catch(function(err) {
    panel.innerHTML = '<div style="text-align:center;padding:40px;color:var(--down)"><p>⚠️ 加载失败</p><p style="font-size:0.85em">'+err.message+'</p><button onclick="closeReportModal()" style="margin-top:12px;padding:8px 20px;background:var(--primary);color:#fff;border:none;border-radius:6px;cursor:pointer">关闭</button></div>';
  });
}

// 获取报告 markdown 文件
async function fetchReport(filename) {
  // CDN模式: 同源路径；本地模式: /reports/
  var base = isRemote ? './reports/' : '/reports/';
  var r = await fetch(base + decodeURIComponent(filename));
  if (!r.ok) throw new Error('报告文件不存在 (' + r.status + ')');
  return r.text();
}

// 从 watchlist 获取实时行情
function getStockData(code) {
  if (_watchlistData && _watchlistData.length) {
    var s = _watchlistData.find(function(x) { return x.ticker === code; });
    if (s) return Promise.resolve(s);
  }
  // fallback: 从 _extQuotes 获取
  if (_extQuotes && _extQuotes[code]) {
    var q = _extQuotes[code];
    return Promise.resolve({ ticker: code, name: q.n||'', price: q.p, changePercent: q.c, volume: q.v });
  }
  return Promise.resolve(null);
}

// 获取新闻（本地: yfinance API / CDN: 嵌入数据）
async function fetchStockNews(code, name) {
  // 尝试从新闻API获取
  if (!isRemote) {
    try {
      var r = await fetch('/api/news/' + encodeURIComponent(code));
      if (r.ok) {
        var data = await r.json();
        if (data && data.news && data.news.length) return data.news;
      }
    } catch(e) { /* fall through */ }
  }
  // CDN模式：返回null，显示无新闻状态
  return null;
}

// 简易 Markdown → HTML 渲染器
function markdownToHtml(md) {
  if (!md) return '';
  var html = md;
  // 转义 HTML
  html = html.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // 粗体 **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // 表格 |...|
  html = html.replace(/^\\|(.+)\\|$/gm, function(line) {
    var cells = line.replace(/^\\||\\|$/g,'').split('|');
    var isHeader = line.indexOf('|---') >= 0 || line.indexOf('|--') >= 0;
    if (isHeader) return '<!-- sep -->';
    var tag = 'td';
    var row = cells.map(function(c) { return '<'+tag+'>'+c.trim()+'</'+tag+'>'; }).join('');
    return '<tr>'+row+'</tr>';
  });
  // 包装表格
  html = html.replace(/((?:<tr>.*?<\/tr>\\s*)+)/g, function(m) {
    return '<table>' + m.replace('<!-- sep -->\\n','').replace(/<tr>.*?<\/tr>\\s*/, function(h) {
      return '<thead>'+h.replace(/<td>/g,'<th>').replace(/<\/td>/g,'</th>')+'</thead><tbody>';
    }) + '</tbody></table>';
  });
  // 标题 ### / ## / #
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // 水平线 ---
  html = html.replace(/^---$/gm, '<hr>');
  // 引用 >
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  // 行内代码
  html = html.replace(/\\\$(.+?)\\\$/g, '<code>$1</code>');
  // 段落：双换行
  html = html.replace(/\\n\\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  // 清理空段落
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[123]|<\/?t[ah]|<\/?hr|<!--)/g, '$1');
  html = html.replace(/(<\/h[123]>|<\/table>|<\/blockquote>|<\/hr>)<\/p>/g, '$1');
  return html;
}

// 渲染报告面板
function renderReportPanel(panel, filename, code, name, reportMd, stockInfo, news) {
  var title = name || code;
  var reportHtml = markdownToHtml(reportMd);

  // 实时行情条
  var stripHtml = '';
  if (stockInfo && stockInfo.price) {
    var chg = stockInfo.changePercent || 0;
    var up = chg >= 0;
    var sig = stockInfo.signal;
    stripHtml = '<div class="report-strip">' +
      '<div class="rs-item"><div class="l">最新价</div><div class="v" style="color:'+(up?'var(--up)':'var(--down)')+'">¥'+(stockInfo.price||'—').toFixed(2)+'</div></div>' +
      '<div class="rs-item"><div class="l">涨跌幅</div><div class="v" style="color:'+(up?'var(--up)':'var(--down)')+'">'+(chg>=0?'+':'')+chg.toFixed(2)+'%</div></div>' +
      (stockInfo.volume ? '<div class="rs-item"><div class="l">成交量</div><div class="v">'+(stockInfo.volume/1e8).toFixed(1)+'亿手</div></div>' : '') +
      (sig ? '<div class="rs-item"><div class="l">信号</div><div class="v"><span class="badge '+(sig.signal==='BUY'?'buy':sig.signal==='WATCH'?'watch':'hold')+'">'+sig.text+'</span></div></div>' : '') +
      '<div class="rs-item"><div class="l">刷新</div><div class="v" style="font-size:0.7em;color:var(--muted)">实时</div></div>' +
      '</div>';
  }

  // Tab切换：报告 | 新闻
  var newsSection = '';
  if (news && news.length) {
    newsSection = '<div class="report-news-item" style="display:flex;gap:8px;align-items:flex-start">' +
      '<span style="color:var(--accent);flex-shrink:0">📰</span>' +
      '<div><a href="'+(news.link||'#')+'" target="_blank">'+news.title+'</a>' +
      '<div class="rn-date">'+news.date+'</div></div></div>';
  }

  var html = '' +
    '<button class="report-close" onclick="closeReportModal()" title="关闭">✕</button>' +
    '<h1>📊 ' + title + ' 深度分析报告</h1>' +
    '<div class="rp-meta">代码: ' + (code||'—') + ' | 文件: ' + decodeURIComponent(filename) + '</div>' +
    stripHtml +
    '<div class="report-tabs">' +
      '<div class="report-tab active" onclick="switchReportTab(this,\'content\')">📄 分析报告</div>' +
      '<div class="report-tab" onclick="switchReportTab(this,\'news\')">📰 最新消息</div>' +
    '</div>' +
    '<div class="report-tab-content active" id="reportTabContent">' + reportHtml + '</div>' +
    '<div class="report-tab-content" id="reportTabNews">' +
      (news && news.length
        ? news.map(function(n) {
            return '<div class="report-news-item"><a href="'+(n.link||'#')+'" target="_blank" rel="noopener">📰 '+n.title+'</a><div class="rn-date">'+(n.date||'')+' | '+(n.source||'')+'</div></div>';
          }).join('')
        : '<div style="text-align:center;padding:30px;color:var(--muted)">' +
            '<p style="font-size:2em">📭</p>' +
            '<p>CDN模式下暂不加载实时新闻</p>' +
            '<p style="font-size:0.8em">本地模式 (localhost:3000) 可以获取实时新闻</p>' +
            '<p style="font-size:0.75em">切换至 <a href="javascript:void(0)" onclick="loadNewsForCode(\''+code+'\',\''+(name||'').replace(/'/g,"\\'")+'\')" style="color:var(--primary)">🔄 尝试加载</a></p>' +
          '</div>') +
    '</div>';

  panel.innerHTML = html;
  panel.scrollTop = 0;
}

function switchReportTab(el, tabName) {
  document.querySelectorAll('.report-tab').forEach(function(t) { t.classList.remove('active'); });
  el.classList.add('active');
  document.querySelectorAll('.report-tab-content').forEach(function(c) { c.classList.remove('active'); });
  var target = document.getElementById(tabName === 'content' ? 'reportTabContent' : 'reportTabNews');
  if (target) target.classList.add('active');
}

// 尝试加载新闻（CDN模式用户主动触发）
function loadNewsForCode(code, name) {
  var tab = document.getElementById('reportTabNews');
  if (!tab) return;
  tab.innerHTML = '<div style="text-align:center;padding:20px"><div class="spinner"></div><p>加载新闻中...</p></div>';
  fetchStockNews(code, name).then(function(news) {
    if (news && news.length) {
      tab.innerHTML = news.map(function(n) {
        return '<div class="report-news-item"><a href="'+(n.link||'#')+'" target="_blank" rel="noopener">📰 '+n.title+'</a><div class="rn-date">'+(n.date||'')+' | '+(n.source||'')+'</div></div>';
      }).join('');
    } else {
      tab.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)"><p style="font-size:2em">📭</p><p>暂无相关新闻</p></div>';
    }
  }).catch(function() {
    tab.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)"><p style="font-size:2em">📭</p><p>新闻加载失败，请稍后重试</p></div>';
  });
}
</script>
`;

  c = c.replace(bodyEnd, jsCode + '\n' + bodyEnd);
  changes++;
  console.log('✓ JS 函数已注入');
}

// ── 5. 保存 ──
fs.writeFileSync(f, c);
console.log('\n✅ 全部完成，共 ' + changes + ' 项修改');
console.log('文件大小: ' + c.length + ' 字符');
