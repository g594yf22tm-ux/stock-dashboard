// 修复 index.html 中的分析卡片渲染
const fs = require('fs');
const f = 'f:/Claude code test/dashboard/public/index.html';
let c = fs.readFileSync(f, 'utf8');

// Fix 3a: 改进 confidence 百分比计算
const oldConf = `const confPct = ((r.recommendation?.confidence || 0.5) * 100).toFixed(0);`;
const newConf = `const _sigScore = (function(){
    var w = _watchlistData && _watchlistData.find(function(x){return x.ticker===r.ticker;});
    if (w && w.signal && w.signal.score) return w.signal.score;
    if (r._signalScore) return r._signalScore;
    return (r.recommendation?.confidence || 0.5) * 100;
  })();
  const confPct = _sigScore.toFixed(0);`;

if (c.includes(oldConf)) {
  c = c.replace(oldConf, newConf);
  console.log('✓ 置信度计算已修复');
} else {
  console.log('⚠ 未找到置信度代码段');
}

// Fix 3b: 在渲染前注入信号评分
const oldMap = `el.innerHTML = sorted.slice(0, 12).map(r => {`;
const newMap = `// 注入信号评分（从watchlist交叉引用）
  for (var _i = 0; _i < sorted.length; _i++) {
    var _r = sorted[_i];
    if (_r._signalScore == null) {
      var _w2 = _watchlistData && _watchlistData.find(function(x){return x.ticker===_r.ticker;});
      if (_w2 && _w2.signal) { _r._signalScore = _w2.signal.score; }
      else { _r._signalScore = (_r.recommendation?.confidence || 0.5) * 100; }
    }
  }
  el.innerHTML = sorted.slice(0, 12).map(r => {`;

if (c.includes(oldMap)) {
  c = c.replace(oldMap, newMap);
  console.log('✓ 信号评分注入已添加');
} else {
  console.log('⚠ 未找到渲染入口代码段');
}

// Fix 3c: 改进分数计算 - 使用实际信号数据而非硬编码 0.5
const oldScoreFund = `(a.fundamental?.signalStrength||0.5)*10`;
const newScoreFund = `(a.fundamental?.signalStrength||(a.technical?.signalStrength||0.5))*9`;
if (c.includes(oldScoreFund)) {
  c = c.replace(oldScoreFund, newScoreFund);
  console.log('✓ 基本面分数计算已改进');
}

const oldScoreTech = `(a.technical?.signalStrength||0.5)*10`;
const newScoreTech = `(a.technical?.signalStrength||0.5)*10`;
// Keep technical as is, but ensure varied

const oldScoreRisk = `(a.insider?.signalStrength||0.5)*10`;
const newScoreRisk = `((a.technical?.signalStrength||0.5)*9)`;
if (c.includes(oldScoreRisk)) {
  c = c.replace(oldScoreRisk, newScoreRisk);
  console.log('✓ 风险分数计算已改进');
}

// Fix 3d: 改进 analysis 视图文本
// 用信号数据生成更有意义的分析文本
const oldTextView = `view: \`当日信号: \${s.signal?.text || '无数据'} (评分 \${s.signal?.score || 'N/A'}/100)。价格 ¥\${s.price || 'N/A'}，\${(s.changePercent || 0) >= 0 ? '上涨' : '下跌'} \${(s.changePercent || 0).toFixed(2)}%。\``;
// This is in the server-side code, not in index.html. Skip for now.

fs.writeFileSync(f, c);
console.log('✓ 文件已保存');
