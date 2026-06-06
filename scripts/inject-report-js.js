// inject-js.js — 注入报告弹窗 JS 函数
const fs = require('fs');
const f = 'f:/Claude code test/dashboard/public/index.html';
let c = fs.readFileSync(f, 'utf8');

const jsFunctions = `
<script>
// ═══════════════════════════════════════════════════════════════════════════
// 报告内嵌弹窗引擎 (v1.0)
// ═══════════════════════════════════════════════════════════════════════════

function closeReportModal() {
  var ov = document.getElementById('reportOverlay');
  if (ov) ov.classList.remove('show');
  document.body.style.overflow = '';
}

function openReportInline(filename, stockCode, stockName) {
  var overlay = document.getElementById('reportOverlay');
  var panel = document.getElementById('reportPanel');
  if (!overlay || !panel) return;
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
  panel.innerHTML = '<div class=\"report-loading\"><div class=\"spinner\"></div><p>正在加载报告…</p></div>';

  // 并行加载：报告 + 行情数据 + 新闻
  Promise.all([
    _loadReportFile(filename),
    _getStockSnapshot(stockCode),
    _fetchNewsForStock(stockCode, stockName)
  ]).then(function(results) {
    var reportMd = results[0];
    var stockInfo = results[1];
    var newsData = results[2];
    _renderReportContent(panel, filename, stockCode, stockName, reportMd, stockInfo, newsData);
  }).catch(function(err) {
    panel.innerHTML = '<div style=\"text-align:center;padding:40px;color:var(--down)\">' +
      '<p style=\"font-size:1.5em\">⚠️</p><p>加载失败</p>' +
      '<p style=\"font-size:0.85em;color:var(--muted)\">' + (err.message||'未知错误') + '</p>' +
      '<button onclick=\"closeReportModal()\" style=\"margin-top:12px;padding:8px 20px;background:var(--primary);color:#fff;border:none;border-radius:6px;cursor:pointer\">关闭</button></div>';
  });
}

// ── 加载报告 Markdown 文件 ──
async function _loadReportFile(filename) {
  var base = isRemote ? './reports/' : '/reports/';
  var url = base + decodeURIComponent(filename);
  var r = await fetch(url);
  if (!r.ok) throw new Error('报告文件不存在 (HTTP ' + r.status + ')');
  var text = await r.text();
  if (!text || text.length < 50) throw new Error('报告内容为空');
  return text;
}

// ── 获取股票实时数据 ──
function _getStockSnapshot(code) {
  // 从 _watchlistData 获取完整数据
  if (typeof _watchlistData !== 'undefined' && _watchlistData && _watchlistData.length) {
    var s = _watchlistData.find(function(x) { return x.ticker === code; });
    if (s) return Promise.resolve(s);
  }
  // 从 _extQuotes 获取基本价格
  if (typeof _extQuotes !== 'undefined' && _extQuotes && _extQuotes[code]) {
    var q = _extQuotes[code];
    return Promise.resolve({
      ticker: code,
      name: '',
      price: q.p,
      changePercent: q.c,
      volume: q.v,
      amount: q.a
    });
  }
  return Promise.resolve(null);
}

// ── 获取新闻 ──
async function _fetchNewsForStock(code, name) {
  if (!isRemote) {
    try {
      var r = await fetch('/api/news/' + encodeURIComponent(code));
      if (r.ok) {
        var data = await r.json();
        if (data && data.news && data.news.length) return data.news.slice(0, 8);
      }
    } catch(e) { /* CDN模式下回退 */ }
  }
  return null;
}

// ── Markdown → HTML 渲染器 ──
function markdownToHtml(md) {
  if (!md) return '';
  var lines = md.split('\\n');
  var out = [];
  var inTable = false, inThead = false;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();

    // 水平线
    if (/^---+$/.test(trimmed)) { if (inTable) { out.push('</tbody></table>'); inTable = false; } out.push('<hr>'); continue; }

    // 标题
    var h3 = trimmed.match(/^### (.+)/);
    if (h3) { if (inTable) { out.push('</tbody></table>'); inTable = false; } out.push('<h3>' + _mdInline(h3[1]) + '</h3>'); continue; }
    var h2 = trimmed.match(/^## (.+)/);
    if (h2) { if (inTable) { out.push('</tbody></table>'); inTable = false; } out.push('<h2>' + _mdInline(h2[1]) + '</h2>'); continue; }
    var h1 = trimmed.match(/^# (.+)/);
    if (h1) { if (inTable) { out.push('</tbody></table>'); inTable = false; } out.push('<h1>' + _mdInline(h1[1]) + '</h1>'); continue; }

    // 引用
    var bq = trimmed.match(/^> (.+)/);
    if (bq) { out.push('<blockquote>' + _mdInline(bq[1]) + '</blockquote>'); continue; }

    // 表格分隔行
    if (/^\|[-:| ]+\|$/.test(trimmed)) {
      if (inTable) { out.push('</thead><tbody>'); inThead = false; }
      continue;
    }

    // 表格行
    if (/^\|.+\|$/.test(trimmed)) {
      if (!inTable) { out.push('<table>'); inTable = true; inThead = true; }
      var cells = trimmed.replace(/^\||\|$/g, '').split('|');
      var tag = inThead ? 'th' : 'td';
      var row = '<tr>' + cells.map(function(c) { return '<' + tag + '>' + _mdInline(c.trim()) + '</' + tag + '>'; }).join('') + '</tr>';
      out.push(row);
      continue;
    }

    // 空行
    if (trimmed === '') { if (inTable) { out.push('</tbody></table>'); inTable = false; } out.push('<br>'); continue; }

    // 普通段落
    if (inTable) { out.push('</tbody></table>'); inTable = false; }
    out.push('<p>' + _mdInline(trimmed) + '</p>');
  }

  if (inTable) out.push('</tbody></table>');
  return out.join('\\n');
}

// Markdown 行内格式化
function _mdInline(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>\$1</strong>')
    .replace(/`([^\`]+)`/g, '<code>\$1</code>')
    .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href=\"\$2\" target=\"_blank\">\$1</a>');
}

// ── 渲染报告面板 ──
function _renderReportContent(panel, filename, code, name, reportMd, stockInfo, newsData) {
  var title = name || code || '报告';
  var reportHtml = markdownToHtml(reportMd);

  // 实时行情条
  var stripHtml = '';
  if (stockInfo && stockInfo.price) {
    var chg = stockInfo.changePercent || 0;
    var up = chg >= 0;
    var sig = stockInfo.signal;
    stripHtml = '<div class=\"report-strip\">' +
      '<div class=\"rs-item\"><div class=\"l\">最新价</div><div class=\"v\" style=\"color:' + (up ? 'var(--up)' : 'var(--down)') + '\">¥' + (stockInfo.price||0).toFixed(2) + '</div></div>' +
      '<div class=\"rs-item\"><div class=\"l\">涨跌幅</div><div class=\"v\" style=\"color:' + (up ? 'var(--up)' : 'var(--down)') + '\">' + (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%</div></div>' +
      (stockInfo.volume ? '<div class=\"rs-item\"><div class=\"l\">成交量</div><div class=\"v\">' + (stockInfo.volume / 1e8).toFixed(1) + '亿手</div></div>' : '') +
      (sig ? '<div class=\"rs-item\"><div class=\"l\">当日信号</div><div class=\"v\"><span class=\"badge ' + (sig.signal === 'BUY' ? 'buy' : sig.signal === 'WATCH' ? 'watch' : 'hold') + '\">' + sig.text + '</span></div></div>' : '') +
      '</div>';
  }

  // 新闻列表
  var newsHtml = '';
  if (newsData && newsData.length) {
    newsHtml = newsData.map(function(n) {
      var dateStr = n.date || n.publishedAt || n.pubDate || '';
      var sourceStr = n.source || n.publisher || '';
      var link = n.link || n.url || '#';
      return '<div class=\"report-news-item\"><a href=\"' + link + '\" target=\"_blank\" rel=\"noopener\">📰 ' + (n.title || '') + '</a><div class=\"rn-date\">' + dateStr + (sourceStr ? ' | ' + sourceStr : '') + '</div></div>';
    }).join('');
  } else {
    newsHtml = '<div style=\"text-align:center;padding:30px;color:var(--muted)\">' +
      '<p style=\"font-size:2em\">📭</p>' +
      '<p>CDN 模式暂不加载实时新闻</p>' +
      '<p style=\"font-size:0.8em\">本地模式 (localhost:3000) 可获取实时新闻数据</p></div>';
  }

  var html = '' +
    '<button class=\"report-close\" onclick=\"closeReportModal()\" title=\"关闭 (Esc)\">✕</button>' +
    '<h1>📊 ' + title + ' 深度分析报告</h1>' +
    '<div class=\"rp-meta\">代码: ' + (code || '—') + ' | 文件: ' + decodeURIComponent(filename) + '</div>' +
    stripHtml +
    '<div class=\"report-tabs\">' +
      '<div class=\"report-tab active\" onclick=\"_switchRptTab(this,\\'content\\')\">📄 分析报告</div>' +
      '<div class=\"report-tab\" onclick=\"_switchRptTab(this,\\'news\\')\">📰 最新消息</div>' +
    '</div>' +
    '<div class=\"report-tab-content active\" id=\"rptTabContent\">' + reportHtml + '</div>' +
    '<div class=\"report-tab-content\" id=\"rptTabNews\">' + newsHtml + '</div>';

  panel.innerHTML = html;
  panel.scrollTop = 0;
}

// Tab 切换
function _switchRptTab(el, tabName) {
  document.querySelectorAll('.report-tab').forEach(function(t) { t.classList.remove('active'); });
  el.classList.add('active');
  document.querySelectorAll('.report-tab-content').forEach(function(c) { c.classList.remove('active'); });
  var target = document.getElementById(tabName === 'content' ? 'rptTabContent' : 'rptTabNews');
  if (target) target.classList.add('active');
}

// ESC 关闭
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeReportModal();
});
</script>
`;

// 在 </body> 前注入
const bodyEnd = '</body>';
if (c.includes(bodyEnd)) {
  c = c.replace(bodyEnd, jsFunctions + '\n' + bodyEnd);
  console.log('✓ JS 函数已注入 (' + jsFunctions.length + ' 字符)');
} else {
  console.log('✗ 未找到 </body>');
}

fs.writeFileSync(f, c);
console.log('✅ 文件已保存 (' + c.length + ' 字符)');
