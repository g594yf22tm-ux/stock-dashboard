// 迷你走势图绘制
function drawSparkline(canvasId, price, open, high, low) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || !price) return;
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  var w = rect.width, h = 100;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  var pad = 2;
  var hi = high || price, lo = low || price;
  var range = hi - lo || price * 0.02;
  // 背景网格
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  for (var i = 0; i < 4; i++) {
    var y = pad + i * (h - 2 * pad) / 3;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
  }
  // 模拟日内走势
  var o = open || price, p = price;
  var pts = [
    {x: pad, y: pad + (hi - o) / range * (h - 2 * pad)},
    {x: w * 0.3, y: pad + (hi - (o + (p - o) * 0.3 + range * 0.05)) / range * (h - 2 * pad)},
    {x: w * 0.5, y: pad + (hi - (lo + range * 0.15)) / range * (h - 2 * pad)},
    {x: w * 0.7, y: pad + (hi - (o + (p - o) * 0.6 + range * 0.02)) / range * (h - 2 * pad)},
    {x: w - pad, y: pad + (hi - p) / range * (h - 2 * pad)}
  ];
  var up = p >= o;
  var clr = up ? '0,200,100' : '255,80,80';
  // 填充区域
  ctx.fillStyle = 'rgba(' + clr + ',0.12)';
  ctx.beginPath(); ctx.moveTo(pad, h - pad);
  for (var j = 0; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
  ctx.lineTo(w - pad, h - pad); ctx.closePath(); ctx.fill();
  // 走势线
  ctx.strokeStyle = up ? '#00c864' : '#ff5050';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (var k = 0; k < pts.length; k++) {
    if (k === 0) ctx.moveTo(pts[k].x, pts[k].y);
    else ctx.lineTo(pts[k].x, pts[k].y);
  }
  ctx.stroke();
  // 收盘价圆点
  ctx.fillStyle = up ? '#00c864' : '#ff5050';
  ctx.beginPath(); ctx.arc(w - pad, pts[4].y, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(w - pad, pts[4].y, 1.5, 0, Math.PI * 2); ctx.fill();
}

// 自动查找并绘制 sparkline
setTimeout(function() {
  var cvs = document.getElementById('detailSparkline');
  if (!cvs) return;
  // 从页面元素获取价格数据
  var priceEl = document.querySelector('.dp-main');
  var price = priceEl ? parseFloat(priceEl.innerText.replace('¥','')) : 0;
  // 从 detail-metric 中获取
  var metrics = document.querySelectorAll('.dm-value');
  var open = 0, high = 0, low = 0;
  for (var i = 0; i < metrics.length; i++) {
    var txt = metrics[i].innerText;
    var prev = metrics[i].previousElementSibling;
    var label = prev ? prev.innerText : '';
    if (label.includes('开盘')) open = parseFloat(txt.replace('¥',''));
    if (label.includes('最高')) high = parseFloat(txt.replace('¥',''));
    if (label.includes('最低')) low = parseFloat(txt.replace('¥',''));
  }
  if (price) drawSparkline('detailSparkline', price, open, high, low);
}, 100);
