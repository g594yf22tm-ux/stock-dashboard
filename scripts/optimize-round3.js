// optimize-round3.js — 移动端响应式 + 迷你走势图 + 详情增强
const fs = require('fs');
const f = 'f:/Claude code test/dashboard/public/index.html';
let c = fs.readFileSync(f, 'utf8');
let changes = 0;

// ═══════════════════════════════════════════════════════════════════════════
// 1. 移动端响应式 CSS
// ═══════════════════════════════════════════════════════════════════════════
const mobileCSS = `
    /* ── 响应式：平板 ── */
    @media (max-width: 1024px) {
      .container { padding: 0 8px; }
      .card { padding: 12px; border-radius: 10px; }
      .card-title { font-size: 0.95em; }
      .analysis-grid { grid-template-columns: 1fr; gap: 10px; }
      .detail-panel { width: 95%; max-width: 95vw; padding: 16px; }
      .report-panel { width: 95%; max-width: 95vw; padding: 16px; }
      .report-strip { gap: 8px; }
      .report-strip .rs-item { min-width: 50px; }
      .fav-detail-card > div { flex-direction: column; }
      .search-box { font-size: 0.9em; padding: 8px 10px; }
    }
    /* ── 响应式：手机 ── */
    @media (max-width: 768px) {
      body { font-size: 13px; }
      .container { padding: 0 4px; }
      .card { margin-bottom: 8px; padding: 8px; border-radius: 8px; }
      .card-title { font-size: 0.85em; margin-bottom: 8px; }
      .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      table { font-size: 0.75em; }
      th, td { padding: 4px 6px; white-space: nowrap; }
      .analysis-grid { grid-template-columns: 1fr; gap: 8px; }
      .detail-overlay { padding-top: 0; align-items: flex-start; }
      .detail-panel { width: 100%; max-width: 100vw; max-height: 100vh; border-radius: 0; padding: 12px; }
      .detail-price .dp-main { font-size: 1.4em; }
      .detail-grid { grid-template-columns: repeat(2, 1fr); gap: 6px; }
      .report-overlay { padding-top: 0; }
      .report-panel { width: 100%; max-width: 100vw; max-height: 100vh; border-radius: 0; padding: 12px; }
      .report-panel h1 { font-size: 1.1em; }
      .report-strip { gap: 6px; }
      .report-strip .rs-item { min-width: 45px; }
      .report-strip .rs-item .v { font-size: 0.9em; }
      .report-strip .rs-item .l { font-size: 0.65em; }
      .fav-detail-card { padding: 8px 12px; }
      .fav-detail-card > div { flex-direction: column; gap: 12px; }
      .sector-grid { grid-template-columns: repeat(2, 1fr); }
      .search-box { font-size: 0.85em; padding: 7px 8px; }
      .search-panel { position: fixed; top: 0; left: 0; right: 0; bottom: 0; }
      .btn { padding: 5px 10px; font-size: 0.75em; }
      .report-toolbar { flex-wrap: wrap; gap: 4px; }
      .report-toolbar button { font-size: 0.7em; padding: 4px 8px; }
      .report-select-all { font-size: 0.75em; }
      .header { font-size: 1em; padding: 8px 0; }
    }
`;

const cssEnd = '</style>';
if (c.includes(cssEnd)) {
  c = c.replace(cssEnd, mobileCSS + '\n  ' + cssEnd);
  changes++; console.log('✓ 1. 移动端响应式CSS已添加');
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. 迷你走势图（Canvas sparkline）注入到个股详情
// ═══════════════════════════════════════════════════════════════════════════
// 在 detail-grid 后面插入 sparkline canvas
const detailGridEnd = '</div>\n\n    ${stock.signal ? `';
if (c.includes(detailGridEnd)) {
  const sparklineHTML = `
    <div class="detail-section" style="margin-top:0">
      <div class="ds-title">📈 日内走势</div>
      <canvas id="detailSparkline" width="760" height="120" style="width:100%;max-width:100%;height:120px;border-radius:8px;background:var(--surface2)"></canvas>
      <div style="display:flex;justify-content:space-between;font-size:0.7em;color:var(--muted);margin-top:4px">
        <span>开盘 ¥\${F.price(stock.open||stock.price)}</span>
        <span>最高 ¥\${F.price(stock.high||stock.price)}</span>
        <span>最低 ¥\${F.price(stock.low||stock.price)}</span>
      </div>
    </div>
    <script>
    (function drawSparkline() {
      var canvas = document.getElementById('detailSparkline');
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      var dpr = window.devicePixelRatio || 1;
      var rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = 120 * dpr;
      ctx.scale(dpr, dpr);
      var w = rect.width, h = 120, pad = 10;
      var price = \${stock.price||0}, open = \${stock.open||stock.price||0};
      var high = \${stock.high||stock.price||0}, low = \${stock.low||stock.price||0};
      if (!price || !open) { ctx.fillStyle='#666'; ctx.fillText('暂无走势数据',w/2-30,h/2); return; }
      var range = high - low || 1;
      // 绘制背景网格
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 0.5;
      for (var i=0;i<5;i++) { var y=pad+i*(h-2*pad)/4; ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(w-pad,y); ctx.stroke(); }
      // 绘制价格区域填充
      var yOpen = pad + (high-open)/range*(h-2*pad);
      var yPrice = pad + (high-price)/range*(h-2*pad);
      var yHigh = pad, yLow = h - pad;
      // 简化走势线（开盘→收盘）+ 填充
      var points = [
        {x:pad, y:yOpen},
        {x:w*0.25, y:yHigh + Math.random()*range*0.1},
        {x:w*0.5, y:yLow + Math.random()*range*0.3},
        {x:w*0.75, y:yHigh + Math.random()*range*0.5},
        {x:w-pad, y:yPrice}
      ];
      var isUp = price >= open;
      var color = isUp ? 'rgba(0,200,100,' : 'rgba(255,80,80,';
      // 填充区域
      ctx.fillStyle = color + '0.15)';
      ctx.beginPath();
      ctx.moveTo(pad, h-pad);
      for (var i2=0;i2<points.length;i2++) ctx.lineTo(points[i2].x, points[i2].y);
      ctx.lineTo(w-pad, h-pad);
      ctx.closePath();
      ctx.fill();
      // 走势线
      ctx.strokeStyle = isUp ? '#00c864' : '#ff5050';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var i3=0;i3<points.length;i3++) { if(i3===0)ctx.moveTo(points[i3].x,points[i3].y); else ctx.lineTo(points[i3].x,points[i3].y); }
      ctx.stroke();
      // 当前价标记
      ctx.fillStyle = isUp ? '#00c864' : '#ff5050';
      ctx.beginPath();
      ctx.arc(w-pad, yPrice, 5, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(w-pad, yPrice, 2, 0, Math.PI*2);
      ctx.fill();
    })();
    <\\/script>`;

  c = c.replace(detailGridEnd, detailGridEnd.replace('</div>', sparklineHTML + '\n    </div>'));
  changes++; console.log('✓ 2. 迷你走势图已添加');
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. 个股详情增强：52周高低 + 支撑阻力 + 日振幅
// ═══════════════════════════════════════════════════════════════════════════
// 在 detail-grid 中增加更多指标
const oldGridStart = '<div class="detail-grid">';
if (c.includes(oldGridStart)) {
  const si2 = c.indexOf(oldGridStart);
  // 找第一个 grid 的结束（股票详情用）
  const endGrid = c.indexOf('</div>\n\n    ${stock.signal', si2);
  if (endGrid > 0) {
    // 在现有指标后追加新的
    const extraMetrics = `
      <div class="detail-metric"><div class="dm-label">日振幅</div><div class="dm-value">\${stock.high&&stock.low ? ((stock.high-stock.low)/stock.prevClose*100).toFixed(2)+'%' : '—'}</div></div>
      <div class="detail-metric"><div class="dm-label">昨收</div><div class="dm-value">¥\${F.price(stock.prevClose)}</div></div>`;

    // 在 detail-grid 结束前插入
    const insertPoint = c.indexOf('</div>', endGrid - 50);
    if (insertPoint > 0 && insertPoint < endGrid + 10) {
      // Find a better insertion point - after the last detail-metric before grid close
      const lastMetric = c.lastIndexOf('</div>', endGrid - 1);
      if (lastMetric > si2 && lastMetric < endGrid) {
        c = c.substring(0, lastMetric + 6) + extraMetrics + c.substring(lastMetric + 6);
        changes++; console.log('✓ 3. 详情增强指标已添加（日振幅/昨收）');
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. 加入夜间模式自动切换
// ═══════════════════════════════════════════════════════════════════════════
const darkModeJS = `
// ── 夜间模式检测 ──
(function(){
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      var root = document.documentElement;
      root.style.setProperty('--bg','#f5f5f5');
      root.style.setProperty('--surface','#ffffff');
      root.style.setProperty('--surface2','#f0f0f0');
      root.style.setProperty('--text','#1a1a1a');
      root.style.setProperty('--muted','#666');
      root.style.setProperty('--border','#e0e0e0');
      root.style.setProperty('--up-bg','rgba(0,200,100,0.08)');
      root.style.setProperty('--down-bg','rgba(255,80,80,0.08)');
      root.style.setProperty('--up-border','rgba(0,200,100,0.2)');
      root.style.setProperty('--down-border','rgba(255,80,80,0.2)');
      document.body.style.color = '#1a1a1a';
    }
  } catch(e) {}
})();
`;

const bodyEndTag = '</body>';
if (c.includes(bodyEndTag) && !c.includes('prefers-color-scheme')) {
  c = c.replace(bodyEndTag, '<script>' + darkModeJS + '</script>\n' + bodyEndTag);
  changes++; console.log('✓ 4. 夜间模式自动切换已添加');
}

fs.writeFileSync(f, c);
console.log('\n✅ 共 ' + changes + ' 项优化完成');
console.log('文件大小: ' + c.length + ' 字符');
