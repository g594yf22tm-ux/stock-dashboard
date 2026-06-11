/**
 * enhanced-analysis.js — 专家分析引擎 v3.0
 * ==========================================
 * 基于东方财富历史K线数据，计算真实技术指标:
 * - RSI(14), MACD(12/26/9), MA(5/20/60)
 * - 布林带(20), 波动率, 52周高低, 成交量趋势
 * - 个股风险评估
 *
 * 用法: node scripts/enhanced-analysis.js
 * 输出: dashboard/data/analysis.json
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'dashboard', 'data');
const CONFIG_DIR = path.join(ROOT, 'dashboard', 'config');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// GBK 解码
let iconv;
try { iconv = require('iconv-lite'); } catch(e) { iconv = null; }

// ── HTTP helper (支持GBK) ──────────────────────────────────────────────
function httpGet(url, gbk) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.sina.com.cn/' },
      timeout: 15000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (gbk && iconv) {
          try { resolve(JSON.parse(iconv.decode(buf, 'gbk'))); }
          catch(e) { reject(e); }
        } else {
          try { resolve(JSON.parse(buf.toString())); }
          catch(e) { reject(e); }
        }
      });
    }).on('error', reject);
  });
}

// ── 获取90天K线（新浪财经）────────────────────────────────────────────
async function getKline(ticker) {
  const parts = ticker.split('.');
  const mkt = parts[1] === 'SS' ? 'sh' : 'sz';
  const code = parts[0];
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${mkt}${code}&scale=240&ma=no&datalen=90`;
  try {
    const data = await httpGet(url, true);
    if (!Array.isArray(data)) return [];
    return data.map(d => ({
      date: d.day,
      open: parseFloat(d.open),
      close: parseFloat(d.close),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
      volume: parseInt(d.volume) * 100 // Sina返回手，转股
    })).filter(d => d.close > 0);
  } catch(e) { return []; }
}

// ── EMA计算 ─────────────────────────────────────────────────────────────
function ema(data, period) {
  const k = 2 / (period + 1);
  let result = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

// ── SMA计算 ─────────────────────────────────────────────────────────────
function sma(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j];
    result.push(sum / period);
  }
  return result;
}

// ── 标准差 ──────────────────────────────────────────────────────────────
function stddev(data, period) {
  const smaVals = sma(data, period);
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1 || smaVals[i] == null) { result.push(null); continue; }
    let sumSq = 0;
    for (let j = 0; j < period; j++) sumSq += Math.pow(data[i - j] - smaVals[i], 2);
    result.push(Math.sqrt(sumSq / period));
  }
  return result;
}

// ── 技术分析 ─────────────────────────────────────────────────────────────
function analyze(klineData, currentPrice, currentChangePct) {
  const closes = klineData.map(d => d.close);
  const highs = klineData.map(d => d.high);
  const lows = klineData.map(d => d.low);
  const volumes = klineData.map(d => d.volume);
  const n = closes.length;
  if (n < 30) return null;

  const last = idx => idx >= 0 ? closes[n - 1 - idx] : null;

  // RSI(14)
  let gains = 0, losses = 0;
  for (let i = n - 14; i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses += Math.abs(diff);
  }
  const avgGain = gains / 14, avgLoss = losses / 14;
  const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  // MACD (12, 26, 9)
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = ema(macdLine.slice(25), 9); // start from valid ema26
  const macdVal = macdLine[n - 1];
  const macdSignal = signal[signal.length - 1];
  const macdHist = macdVal - macdSignal;

  // MA
  const ma5 = sma(closes, 5);
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);

  // 布林带(20)
  const bbMid = ma20[n - 1];
  const bbStd = stddev(closes, 20)[n - 1] || (bbMid * 0.02);
  const bbUpper = bbMid + 2 * bbStd;
  const bbLower = bbMid - 2 * bbStd;

  // 52周高低 (用90天近似)
  const high52w = Math.max(...highs);
  const low52w = Math.min(...lows);
  const position52w = currentPrice ? ((currentPrice - low52w) / (high52w - low52w) * 100) : 50;

  // 波动率 (20日年化)
  const returns = [];
  for (let i = n - 21; i < n; i++) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  const avgRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - avgRet, 2), 0) / returns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(252);

  // 成交量趋势
  const vol5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const vol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  let volTrend = 'stable';
  if (vol5 > vol20 * 1.5) volTrend = '放量';
  else if (vol5 > vol20 * 1.2) volTrend = '温和放量';
  else if (vol5 < vol20 * 0.7) volTrend = '缩量';
  else if (vol5 < vol20 * 0.85) volTrend = '温和缩量';

  // ── 综合评分 ──
  let techScore = 50;

  // RSI 评分
  if (rsi >= 30 && rsi <= 40) techScore += 15;
  else if (rsi >= 60 && rsi <= 70) techScore -= 5;
  else if (rsi < 30) techScore += 10; // 超卖反弹
  else if (rsi > 80) techScore -= 15; // 超买回调

  // MACD 评分
  if (macdHist > 0 && macdHist > (macdHist - (macdVal - macdSignal) * 0.5)) techScore += 10;
  else if (macdHist < 0) techScore -= 10;

  // MA 评分
  const priceVsMa5 = currentPrice ? (currentPrice / ma5[n - 1] - 1) * 100 : 0;
  const priceVsMa20 = currentPrice ? (currentPrice / ma20[n - 1] - 1) * 100 : 0;
  if (priceVsMa5 > 1 && priceVsMa20 > 1) techScore += 10;
  else if (priceVsMa5 < -1 && priceVsMa20 < -1) techScore -= 10;

  // 波动率惩罚
  if (volatility > 0.5) techScore -= 10;
  else if (volatility < 0.2) techScore += 5;

  // 当日涨跌
  if (currentChangePct > 3) techScore += 5;
  else if (currentChangePct < -3) techScore -= 5;

  techScore = Math.min(100, Math.max(0, techScore));

  // 信号判断
  let techSignal, techIcon;
  if (techScore >= 70) { techSignal = '强势'; techIcon = '🔴'; }
  else if (techScore >= 60) { techSignal = '偏强'; techIcon = '🟠'; }
  else if (techScore >= 45) { techSignal = '震荡'; techIcon = '🟡'; }
  else if (techScore >= 35) { techSignal = '偏弱'; techIcon = '🟢'; }
  else { techSignal = '弱势'; techIcon = '🔵'; }

  // 生成技术面描述
  let techView = '';
  if (rsi < 30) techView += `RSI ${rsi.toFixed(1)} 超卖区域，`;
  else if (rsi > 70) techView += `RSI ${rsi.toFixed(1)} 超买区域，`;
  else techView += `RSI ${rsi.toFixed(1)} 中性，`;
  if (macdHist > 0) techView += 'MACD红柱，';
  else techView += 'MACD绿柱，';
  if (currentPrice > ma5[n - 1] && currentPrice > ma20[n - 1]) techView += '站上5/20日均线。';
  else if (currentPrice < ma5[n - 1] && currentPrice < ma20[n - 1]) techView += '跌破5/20日均线。';
  else techView += '均线交织。';

  return {
    rsi, macdVal, macdSignal, macdHist,
    ma5: ma5[n - 1], ma20: ma20[n - 1], ma60: ma60[n - 1] || 0,
    bbUpper, bbMid: bbMid || 0, bbLower,
    high52w, low52w, position52w,
    volatility, volTrend, vol5, vol20,
    priceVsMa5, priceVsMa20,
    techScore, techSignal, techIcon, techView
  };
}

// ── 基本面分析（基于实时数据+目标价）────────────────────────────────────
function analyzeFundamental(stock) {
  const price = stock.price || 0;
  const target = stock.targetPrice || 0;
  const potential = target && price ? ((target / price - 1) * 100) : null;

  let fundScore = 50;
  let view = stock.reason || '';

  if (potential != null) {
    if (potential > 30) { fundScore += 20; view += ` 目标价¥${target}，潜在空间${potential.toFixed(1)}%。`; }
    else if (potential > 10) { fundScore += 10; view += ` 目标价¥${target}，空间${potential.toFixed(1)}%。`; }
    else if (potential < -10) { fundScore -= 15; view += ` 目标价¥${target}，已高于目标${Math.abs(potential).toFixed(1)}%。`; }
    else if (potential < 0) { fundScore -= 5; view += ` 接近目标价¥${target}。`; }
    else { view += ` 目标价¥${target}，空间有限(${potential.toFixed(1)}%)。`; }
  } else {
    view += ' 暂无目标价参考。';
  }

  // 行业属性加分
  const sector = stock.sector || '';
  if (sector.includes('银行') || sector.includes('电力') || sector.includes('高股息')) fundScore += 5;
  if (sector.includes('科技') || sector.includes('半导体')) fundScore -= 5;

  fundScore = Math.min(100, Math.max(0, fundScore));

  let fundSignal = fundScore >= 60 ? '低估' : fundScore >= 45 ? '合理' : '偏贵';

  return { fundScore, fundSignal, potential, view };
}

// ── 个股风险评估 ─────────────────────────────────────────────────────────
function analyzeRisk(stock, tech) {
  // 行业风险映射
  const sectorRiskMap = {
    '银行': ['净息差收窄', '不良贷款风险', '地产风险敞口', '经济周期下行'],
    '电力': ['电价改革风险', '来水量波动', '碳交易政策'],
    '机械': ['海外需求波动', '原材料成本', '汇率风险'],
    '新能源': ['产能过剩', '补贴退坡', '技术路线变更'],
    '消费': ['消费复苏不及预期', '原材料涨价', '竞争加剧'],
    '有色': ['大宗商品价格波动', '海外政策风险', '环保限产'],
    '建材': ['地产需求下行', '产能过剩', '环保政策'],
    '传媒': ['广告市场波动', '监管风险', '流量成本上升'],
    '医药': ['集采降价', '研发失败风险', '监管审批'],
    '券商': ['市场成交量萎缩', '监管政策变化', '自营风险'],
  };

  let risks = ['市场系统性风险', '宏观经济不确定性'];
  const sector = stock.sector || '';
  for (const [key, sectorRisks] of Object.entries(sectorRiskMap)) {
    if (sector.includes(key)) {
      risks = [...risks, ...sectorRisks.slice(0, 2)];
      break;
    }
  }
  if (risks.length < 3) risks.push('个股流动性风险', '政策监管风险');

  // 波动率风险
  const vol = tech?.volatility || 0.3;
  if (vol > 0.5) risks.unshift('高波动风险⚠️');
  if (vol < 0.15) risks.unshift('低波动(防御型)✅');

  // 量能风险
  if (tech?.volTrend === '缩量') risks.push('成交量萎缩');

  return risks.slice(0, 5);
}

// ── 高级指标计算 ─────────────────────────────────────────────────────────
function calcAdvanced(kline, tech, stockPrice) {
  const closes = kline.map(d => d.close);
  const n = closes.length;
  if (n < 20) return {};

  // 动量 (多周期收益率)
  const momentum = {
    d5: n >= 5 ? ((closes[n-1] - closes[n-6]) / closes[n-6] * 100) : null,
    d20: n >= 20 ? ((closes[n-1] - closes[n-21]) / closes[n-21] * 100) : null,
    d60: n >= 60 ? ((closes[n-1] - closes[n-61]) / closes[n-61] * 100) : null
  };

  // 最大回撤
  let peak = closes[0], maxDD = 0;
  for (let i = 1; i < n; i++) {
    if (closes[i] > peak) peak = closes[i];
    const dd = (peak - closes[i]) / peak * 100;
    if (dd > maxDD) maxDD = dd;
  }

  // 夏普比率 (无风险利率取2%)
  const rf = 0.02;
  const dailyRf = rf / 252;
  const returns = [];
  for (let i = n - 60; i < n; i++) returns.push((closes[i] - closes[i-1]) / closes[i-1] - dailyRf);
  const avgRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const retStd = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgRet, 2), 0) / returns.length);
  const sharpe = retStd > 0 ? (avgRet * 252) / (retStd * Math.sqrt(252)) : 0;

  // 换手率估算 (成交量/流通股本 — 粗略)
  const avgVol = kline.slice(-20).reduce((s, d) => s + d.volume, 0) / 20;
  const turnover = stockPrice > 0 && avgVol > 0 ? (avgVol / 100000000 * 100).toFixed(1) : null;

  // 涨跌比率
  let upDays = 0;
  for (let i = n - 20; i < n; i++) { if (closes[i] > closes[i-1]) upDays++; }
  const upRatio = upDays / 20;

  return { momentum, maxDrawdown: Math.round(maxDD * 10) / 10, sharpe: Math.round(sharpe * 100) / 100, turnover, upRatio: Math.round(upRatio * 100) };
}

// ── 股票分类 ─────────────────────────────────────────────────────────────
function classify(tech, adv, fund) {
  const classes = [];
  const scores = {};

  // 价值型: 低波动 + 目标价空间大
  if (tech.volatility < 0.25 && fund.potential > 20) {
    classes.push('价值洼地');
    scores.value = Math.min(10, Math.round((fund.potential || 0) / 5 + (0.3 - tech.volatility) * 20));
  }

  // 成长型: 高动量 + 高波动
  if (adv.momentum?.d20 > 5 && tech.volatility > 0.2) {
    classes.push('成长动能');
    scores.growth = Math.min(10, Math.round((adv.momentum.d20 || 0) / 3 + adv.upRatio * 5));
  }

  // 防御型: 低波动 + 低回撤
  if (tech.volatility < 0.2 && adv.maxDrawdown < 15) {
    classes.push('防御稳健');
    scores.defensive = Math.min(10, Math.round(10 - tech.volatility * 30 - adv.maxDrawdown / 10));
  }

  // 动量型: 短期强势
  if (adv.momentum?.d5 > 3 && adv.upRatio > 0.55) {
    classes.push('动量强势');
    scores.momentum = Math.min(10, Math.round((adv.momentum.d5 || 0) + adv.upRatio * 8));
  }

  // 高波动型
  if (tech.volatility > 0.35) {
    classes.push('高波动');
    scores.highBeta = Math.round(tech.volatility * 20);
  }

  // 超跌反弹: 52周低位 + RSI<35
  if (tech.position52w < 20 && tech.rsi < 35) {
    classes.push('超跌反弹');
  }

  if (!classes.length) classes.push('震荡整理');

  return { classes, scores };
}

// ── 主流程 ────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔬 专家分析引擎 v3.0');
  console.log('='.repeat(50));

  const configPath = path.join(CONFIG_DIR, 'watchlist.json');
  if (!fs.existsSync(configPath)) { console.error('❌ 未找到关注列表'); process.exit(1); }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const stocks = (config.stocks || []).filter(s => s.active !== false);

  // 读取实时行情
  const watchPath = path.join(DATA_DIR, 'watchlist.json');
  const watchData = JSON.parse(fs.readFileSync(watchPath, 'utf8'));
  const quotes = watchData.stocks || [];

  const analyses = [];
  for (const cfg of stocks) {
    const q = quotes.find(x => x.ticker === cfg.ticker);
    if (!q || !q.price) continue;

    const name = q.name || cfg.name;
    process.stdout.write(`  📊 ${cfg.ticker} ${name}...`);

    // 获取历史K线
    const kline = await getKline(cfg.ticker);
    if (kline.length < 30) { console.log(' K线不足'); continue; }

    // 技术分析
    const tech = analyze(kline, q.price, q.changePercent || 0);
    if (!tech) { console.log(' 技术分析失败'); continue; }

    // 基本面分析
    const fund = analyzeFundamental({ ...q, ...cfg });

    // 风险评估
    const risks = analyzeRisk({ ...q, ...cfg }, tech);

    // 高级指标
    const adv = calcAdvanced(kline, tech, q.price);

    // 股票分类
    const clf = classify(tech, adv, fund);

    // 综合建议 (含动量调整)
    let totalScore = Math.round((tech.techScore + fund.fundScore) / 2);
    if (adv.momentum?.d20 > 10) totalScore += 5;
    else if (adv.momentum?.d20 < -10) totalScore -= 5;
    if (adv.sharpe > 1) totalScore += 5;
    else if (adv.sharpe < -0.5) totalScore -= 5;
    totalScore = Math.min(95, Math.max(10, totalScore));

    let signal, confidence;
    if (totalScore >= 65) { signal = 'BUY'; confidence = Math.round(totalScore * 0.8 + 5); }
    else if (totalScore >= 50) { signal = 'HOLD'; confidence = Math.round(totalScore * 0.7 + 10); }
    else { signal = 'WATCH'; confidence = Math.round((100 - totalScore) * 0.7 + 5); }
    confidence = Math.min(95, Math.max(25, confidence));

    analyses.push({
      ticker: cfg.ticker,
      name,
      technical: {
        overallSignal: tech.techScore >= 60 ? 'bullish' : tech.techScore >= 45 ? 'neutral' : 'bearish',
        signalStrength: tech.techScore / 100,
        rsi: Math.round(tech.rsi * 10) / 10,
        macd: { value: Math.round(tech.macdVal * 100) / 100, signal: Math.round(tech.macdSignal * 100) / 100, histogram: Math.round(tech.macdHist * 100) / 100 },
        ma5: Math.round(tech.ma5 * 100) / 100, ma20: Math.round(tech.ma20 * 100) / 100,
        ma60: Math.round(tech.ma60 * 100) / 100,
        bollinger: { upper: Math.round(tech.bbUpper * 100) / 100, middle: Math.round(tech.bbMid * 100) / 100, lower: Math.round(tech.bbLower * 100) / 100 },
        volatility: Math.round(tech.volatility * 1000) / 10,
        momentum: { d5: adv.momentum?.d5 ? Math.round(adv.momentum.d5*10)/10 : null, d20: adv.momentum?.d20 ? Math.round(adv.momentum.d20*10)/10 : null, d60: adv.momentum?.d60 ? Math.round(adv.momentum.d60*10)/10 : null },
        sharpe: adv.sharpe,
        maxDrawdown: adv.maxDrawdown,
        upRatio: adv.upRatio,
        volumeTrend: tech.volTrend,
        fiftyTwoWeek: { high: tech.high52w, low: tech.low52w, position: Math.round(tech.position52w) },
        view: tech.techView
      },
      fundamental: {
        overallSignal: fund.fundScore >= 55 ? 'undervalued' : fund.fundScore >= 45 ? 'fair' : 'overvalued',
        signalStrength: fund.fundScore / 100,
        targetPrice: q.targetPrice || cfg.targetPrice || null,
        potential: fund.potential,
        view: fund.view
      },
      risk: {
        volatility: tech.volatility ? Math.round(tech.volatility * 1000) / 10 : null,
        sharpe: adv.sharpe,
        maxDrawdown: adv.maxDrawdown,
        volumeTrend: tech.volTrend,
        specificRisks: risks,
        view: `波动率${tech.volatility ? (tech.volatility*100).toFixed(1)+'%' : 'N/A'}，最大回撤${adv.maxDrawdown}%，夏普${adv.sharpe}。`
      },
      classification: {
        labels: clf.classes,
        scores: clf.scores,
        primary: clf.classes[0] || '震荡整理'
      },
      recommendation: {
        signal,
        confidence,
        totalScore,
        view: signal === 'BUY' ? '多维度偏多，建议重点关注' : signal === 'HOLD' ? '多空交织，观望为宜' : '信号偏弱，注意风险'
      }
    });

    console.log(` ✅ ${totalScore}分 ${signal} [${clf.classes.join(',')}]`);
  }

  // 按综合分排序
  analyses.sort((a, b) => b.recommendation.totalScore - a.recommendation.totalScore);

  const output = {
    timestamp: new Date().toISOString(),
    source: '分析引擎 v3.0 — 东方财富K线 + 新浪实时行情',
    engine: {
      indicators: ['RSI(14)', 'MACD(12,26,9)', 'MA(5,20,60)', 'Bollinger(20,2)', 'Volatility(20d)'],
      dataSource: '东方财富 90日K线 + 新浪财经 实时行情',
      updateFrequency: '每30分钟'
    },
    analyses
  };

  fs.writeFileSync(path.join(DATA_DIR, 'analysis.json'), JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n✅ 分析完成: ${analyses.length} 只股票`);
  console.log('='.repeat(50));
  analyses.slice(0, 3).forEach(a => {
    console.log(`  ${a.ticker} ${a.name}: 技术${a.recommendation.totalScore}分 RSI${a.technical.rsi} ${a.recommendation.signal}(${a.recommendation.confidence}%)`);
  });
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
