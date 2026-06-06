// fix-analysis-cards.js — 重写专家分析卡片
const fs = require('fs');
const f = 'f:/Claude code test/dashboard/public/index.html';
let c = fs.readFileSync(f, 'utf8');

// 找到 renderAnalysis 函数并替换
const fnStart = c.indexOf('function renderAnalysis(recommendations) {');
const fnEndMarker = `}).join('');`;

const fnEnd = c.indexOf(fnEndMarker, fnStart) + fnEndMarker.length;

if (fnStart < 0 || fnEnd < fnStart) {
  console.log('✗ 未找到 renderAnalysis');
  process.exit(1);
}

const newFn = `function renderAnalysis(recommendations) {
  const el = document.getElementById('analysisGrid');
  if (!recommendations?.length) {
    el.innerHTML = '<div class="no-data" style="grid-column:1/-1">暂无分析数据<br><small>运行 npm run init 生成分析</small></div>';
    return;
  }

  // 按综合评分排序
  const sorted = [...recommendations].sort((a,b) => {
    const sa = (a.scores?.fundamental||0)+(a.scores?.technical||0)+(a.scores?.risk||0);
    const sb = (b.scores?.fundamental||0)+(b.scores?.technical||0)+(b.scores?.risk||0);
    return sb - sa;
  });

  // 注入真实信号评分
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (r._signalScore == null) {
      const w = _watchlistData && _watchlistData.find(function(x){return x.ticker===r.ticker;});
      r._signalScore = (w && w.signal) ? w.signal.score : (r.recommendation?.confidence || 0.5) * 100;
    }
  }

  const sigLabels = { BUY:'看多', HOLD:'观望', WATCH:'回避', SELL:'看空' };
  const sigIcons = { BUY:'🔴', HOLD:'🟡', WATCH:'🟢', SELL:'⚫' };

  el.innerHTML = sorted.slice(0, 12).map(r => {
    const sig = (r.recommendation?.signal || 'HOLD').toUpperCase();
    const sigCls = sig === 'BUY' ? 'buy' : sig === 'WATCH' ? 'watch' : 'hold';
    const score = r._signalScore || 50;
    const conf = Math.round(score);

    // 分数取整，保留1位
    const fd = Math.round((r.scores?.fundamental || 5) * 10) / 10;
    const td = Math.round((r.scores?.technical || 5) * 10) / 10;
    const rd = Math.round((r.scores?.risk || 5) * 10) / 10;
    const total = Math.round((fd + td + rd) / 3 * 10) / 10;

    const barW = v => Math.min(100, Math.max(2, v * 10));
    const barColor = v => v >= 8 ? 'var(--up)' : v >= 6 ? 'var(--accent)' : v >= 4 ? 'var(--info)' : 'var(--muted)';

    // 精简分析文本
    const fundView = (r.fundamentalView || '').substring(0, 80) + ((r.fundamentalView||'').length > 80 ? '…' : '');
    const techView = (r.technicalView || '').substring(0, 80) + ((r.technicalView||'').length > 80 ? '…' : '');
    const riskView = (r.riskView || '').substring(0, 60) + ((r.riskView||'').length > 60 ? '…' : '');

    return '<div class="analysis-card-v2 ' + sigCls + '">' +
      // 头部：名称 + 信号 + 综合分
      '<div class="ac-header">' +
        '<div class="ac-title" onclick="showStockDetail(\\'' + r.ticker + '\\')" title="点击查看实时行情">' +
          '<span class="ac-name">' + (r.name || r.ticker) + '</span>' +
          '<span class="ac-ticker">' + r.ticker + '</span>' +
        '</div>' +
        '<div class="ac-verdict">' +
          '<span class="ac-signal-badge ' + sigCls + '">' + (sigIcons[sig]||'') + ' ' + (sigLabels[sig]||sig) + '</span>' +
          '<span class="ac-total" style="color:' + barColor(total) + '">' + total.toFixed(1) + '</span>' +
          '<span class="ac-total-label">综合分</span>' +
        '</div>' +
      '</div>' +

      // 分析文本
      '<div class="ac-body">' +
        (fundView ? '<div class="ac-line"><span class="ac-role">📊 基本面</span><span class="ac-text">' + fundView + '</span></div>' : '') +
        (techView ? '<div class="ac-line"><span class="ac-role">📈 技术面</span><span class="ac-text">' + techView + '</span></div>' : '') +
        (riskView ? '<div class="ac-line"><span class="ac-role">🛡️ 风险</span><span class="ac-text">' + riskView + '</span></div>' : '') +
      '</div>' +

      // 分数进度条
      '<div class="ac-scores">' +
        '<div class="ac-score-row"><span class="ac-score-label">基本面</span><div class="ac-bar-track"><div class="ac-bar-fill" style="width:' + barW(fd) + '%;background:' + barColor(fd) + '"></div></div><span class="ac-score-val" style="color:' + barColor(fd) + '">' + fd.toFixed(1) + '</span></div>' +
        '<div class="ac-score-row"><span class="ac-score-label">技术面</span><div class="ac-bar-track"><div class="ac-bar-fill" style="width:' + barW(td) + '%;background:' + barColor(td) + '"></div></div><span class="ac-score-val" style="color:' + barColor(td) + '">' + td.toFixed(1) + '</span></div>' +
        '<div class="ac-score-row"><span class="ac-score-label">风  险</span><div class="ac-bar-track"><div class="ac-bar-fill" style="width:' + barW(rd) + '%;background:' + barColor(rd) + '"></div></div><span class="ac-score-val" style="color:' + barColor(rd) + '">' + rd.toFixed(1) + '</span></div>' +
      '</div>' +

      // 底部：置信度 + 操作
      '<div class="ac-footer">' +
        '<span class="ac-confidence">置信度 <strong>' + conf + '%</strong></span>' +
        '<div class="ac-actions">' +
          '<button class="btn" style="font-size:0.72em;padding:3px 10px" onclick="event.stopPropagation();showStockDetail(\\'' + r.ticker + '\\')">📈 行情</button>' +
          '<button class="btn" style="font-size:0.72em;padding:3px 10px" onclick="event.stopPropagation();openReportByTicker(\\'' + r.ticker + '\\',\\'' + (r.name||'').replace(/'/g,\"\\\\'\") + '\\')">📄 研报</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}`;

c = c.substring(0, fnStart) + newFn + c.substring(fnEnd);
console.log('✓ renderAnalysis 已重写');

// ── 添加新版卡片CSS ──
const cssEnd = '</style>';
const newCardCSS = `
    /* ── 专家分析卡片 v2 ── */
    .analysis-card-v2 {
      background: var(--surface); border-radius: 12px; padding: 18px;
      border: 1px solid var(--border); border-left: 3px solid var(--border);
      transition: all 0.2s;
    }
    .analysis-card-v2:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
    .analysis-card-v2.buy { border-left-color: var(--up); }
    .analysis-card-v2.hold { border-left-color: var(--accent); }
    .analysis-card-v2.watch { border-left-color: var(--muted); }
    .ac-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .ac-title { cursor: pointer; }
    .ac-title:hover .ac-name { color: var(--primary-light); }
    .ac-name { font-weight: 700; font-size: 1em; display: block; }
    .ac-ticker { font-size: 0.7em; color: var(--muted); font-family: 'JetBrains Mono','Consolas',monospace; }
    .ac-verdict { text-align: center; }
    .ac-signal-badge {
      display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.78em; font-weight: 600;
    }
    .ac-signal-badge.buy { background: var(--up-bg); color: var(--up); }
    .ac-signal-badge.hold { background: var(--accent-bg); color: var(--accent); }
    .ac-signal-badge.watch { background: rgba(107,114,128,0.1); color: var(--text-secondary); }
    .ac-total { display: block; font-size: 1.6em; font-weight: 700; line-height: 1; margin-top: 2px; }
    .ac-total-label { font-size: 0.65em; color: var(--muted); }
    .ac-body { margin-bottom: 12px; }
    .ac-line { display: flex; gap: 8px; margin-bottom: 5px; font-size: 0.8em; line-height: 1.5; }
    .ac-role { color: var(--muted); white-space: nowrap; flex-shrink: 0; font-size: 0.9em; }
    .ac-text { color: var(--text-secondary); }
    .ac-scores { margin-bottom: 12px; }
    .ac-score-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; font-size: 0.78em; }
    .ac-score-label { width: 42px; color: var(--muted); text-align: right; flex-shrink: 0; }
    .ac-bar-track { flex: 1; height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden; }
    .ac-bar-fill { height: 100%; border-radius: 2px; transition: width 0.5s ease; }
    .ac-score-val { width: 32px; font-weight: 700; text-align: right; flex-shrink: 0; font-family: 'JetBrains Mono','Consolas',monospace; }
    .ac-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 10px; border-top: 1px solid var(--border); }
    .ac-confidence { font-size: 0.78em; color: var(--muted); }
    .ac-confidence strong { color: var(--text); }
    .ac-actions { display: flex; gap: 6px; }
    /* 旧卡片降级隐藏 */
    .analysis-card { display: none; }
`;

c = c.replace(cssEnd, newCardCSS + '\n  ' + cssEnd);
console.log('✓ 新版卡片CSS已注入');

fs.writeFileSync(f, c);
console.log('文件: ' + c.length + ' 字符');
console.log('✅ 完成');
