/**
 * fetch-sina-data.js — GitHub Actions A股数据抓取
 * ================================================
 * 从新浪财经 API 直接抓取 A股实时行情（服务器端无需 CORS 代理）。
 * 写入 dashboard/data/ 供仪表盘使用。
 *
 * 用法:
 *   node scripts/fetch-sina-data.js
 *
 * GitHub Actions 定时运行此脚本 → 提交更新的 JSON → 自动部署到 Pages。
 */

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

// Paths
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'dashboard', 'data');
const CONFIG_DIR = path.join(ROOT, 'dashboard', 'config');

// Ensure data dir
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── HTTP helper (server-side, no CORS issues) ─────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://finance.sina.com.cn/',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      timeout: 10000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = iconv.decode(buf, 'gbk');
        resolve(text);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── 批量行情 ──────────────────────────────────────────────────────────────
async function getQuotes(tickers) {
  if (!tickers || tickers.length === 0) return [];

  const codes = tickers.map(t => {
    const [num, mkt] = t.split('.');
    return (mkt.toLowerCase() === 'ss' ? 'sh' : 'sz') + num;
  }).join(',');

  const text = await httpGet(`http://hq.sinajs.cn/list=${codes}`);
  const results = [];

  const re = /var hq_str_(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const code = m[1];
    const f = m[2].split(',');
    if (f.length < 32) continue;

    const num = code.replace(/^sh|^sz/, '');
    const mkt = code.startsWith('sh') ? 'SS' : 'SZ';
    const price = parseFloat(f[3]) || 0;
    const prevClose = parseFloat(f[2]) || 0;

    results.push({
      ticker: `${num}.${mkt}`,
      name: f[0],
      open: parseFloat(f[1]) || 0,
      prevClose,
      price,
      high: parseFloat(f[4]) || 0,
      low: parseFloat(f[5]) || 0,
      volume: parseInt(f[8]) || 0,
      amount: parseFloat(f[9]) || 0, // 万元
      change: price - prevClose,
      changePercent: prevClose ? ((price - prevClose) / prevClose * 100) : 0,
      time: f[31] || '',
    });
  }
  return results;
}

// ── 市场状态 ──────────────────────────────────────────────────────────────
function getMarketStatus() {
  const now = new Date();
  // 北京时间
  const bj = new Date(now.getTime() + 8 * 3600 * 1000);
  const h = bj.getUTCHours(), min = bj.getUTCMinutes(), day = bj.getUTCDay();
  const t = h * 60 + min;

  if (day === 0 || day === 6) return { open: false, text: '周末休市' };
  if (t < 9 * 60 + 15) return { open: false, text: '盘前' };
  if (t < 11 * 60 + 30) return { open: true, text: '上午盘交易中' };
  if (t < 13 * 60) return { open: false, text: '午间休市' };
  if (t < 15 * 60) return { open: true, text: '下午盘交易中' };
  return { open: false, text: '已收盘' };
}

// ── 信号分析 ──────────────────────────────────────────────────────────────
function analyzeSignal(q) {
  if (!q || !q.price) return { score: 50, text: '无数据', signal: 'HOLD' };

  const { price, prevClose, high, low, open, changePercent } = q;
  const dayRange = high - low;
  const pos = dayRange > 0 ? (price - low) / dayRange : 0.5;
  let score = 50;

  if (changePercent >= 3) score += 15;
  else if (changePercent >= 1) score += 8;
  else if (changePercent <= -3) score -= 15;
  else if (changePercent <= -1) score -= 8;

  if (pos > 0.7 && changePercent > 0) score += 10;
  else if (pos < 0.3 && changePercent < 0) score -= 10;

  if (price > open && changePercent > 0) score += 5;
  else if (price < open && changePercent < 0) score -= 5;

  score = Math.min(100, Math.max(0, score));

  let text, signal;
  if (score >= 70) { signal = 'BUY'; text = '强势看多'; }
  else if (score >= 60) { signal = 'BUY'; text = '偏多'; }
  else if (score >= 45) { signal = 'HOLD'; text = '震荡观望'; }
  else if (score >= 35) { signal = 'WATCH'; text = '偏弱关注'; }
  else { signal = 'WATCH'; text = '弱势回避'; }

  return { score, text, signal };
}

// ── 主流程 ────────────────────────────────────────────────────────────────
async function main() {
  console.log('📊 新浪财经 A股数据抓取');
  console.log('='.repeat(50));

  const configPath = path.join(CONFIG_DIR, 'watchlist.json');
  if (!fs.existsSync(configPath)) {
    console.error('❌ 未找到关注列表配置:', configPath);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const stocks = (config.stocks || []).filter(s => s.active !== false);
  const indices = config.indices || [];

  if (stocks.length === 0) {
    console.error('❌ 关注列表为空');
    process.exit(1);
  }

  const allTickers = indices.map(i => i.ticker).concat(stocks.map(s => s.ticker));

  console.log(`📡 获取 ${allTickers.length} 只标的行情...`);
  let quotes;
  try {
    quotes = await getQuotes(allTickers);
    console.log(`✅ 获取到 ${quotes.length} 只标的数据`);
  } catch (err) {
    console.error('❌ 行情获取失败:', err.message);
    process.exit(1);
  }

  // 构建索引数据
  const indexData = {};
  for (const idx of indices) {
    const q = quotes.find(x => x.ticker === idx.ticker);
    if (q) {
      indexData[idx.ticker] = {
        ticker: idx.ticker,
        name: idx.displayName || q.name,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        volume: q.volume,
      };
    }
  }

  // 构建股票数据（含信号 + 配置信息）
  const stockData = stocks.map(cfg => {
    const q = quotes.find(x => x.ticker === cfg.ticker);
    const signal = q ? analyzeSignal(q) : null;
    return {
      ticker: cfg.ticker,
      name: q?.name || cfg.name,
      price: q?.price || null,
      change: q?.change || null,
      changePercent: q?.changePercent || null,
      open: q?.open || null,
      high: q?.high || null,
      low: q?.low || null,
      volume: q?.volume || null,
      amount: q?.amount || null,
      prevClose: q?.prevClose || null,
      sector: cfg.sector || '',
      targetPrice: cfg.targetPrice || null,
      reason: cfg.reason || '',
      signal: signal ? { score: signal.score, text: signal.text, signal: signal.signal } : null,
      time: q?.time || '',
    };
  });

  // 按涨跌幅绝对值排序
  stockData.sort((a, b) => Math.abs(b.changePercent || 0) - Math.abs(a.changePercent || 0));

  const ms = getMarketStatus();

  // 从股票数据构建板块表现（按sector字段聚合）
  const sectorMap = {};
  for (const s of stockData) {
    if (!s.sector || !s.changePercent) continue;
    const name = s.sector.replace(/^[^一-龥]+/, ''); // 去掉emoji前缀
    if (!sectorMap[name]) sectorMap[name] = { name, sum: 0, count: 0 };
    sectorMap[name].sum += +s.changePercent;
    sectorMap[name].count++;
  }
  const sectors = Object.values(sectorMap)
    .map(s => ({ name: s.name, changePercent: +(s.sum / s.count).toFixed(2) }))
    .sort((a, b) => b.changePercent - a.changePercent);

  // 热门关注（成交量最大的前8只）
  const trending = [...stockData]
    .filter(s => s.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 8)
    .map(s => ({
      ticker: s.ticker, name: s.name,
      price: s.price, changePercent: s.changePercent,
      volume: s.volume
    }));

  // 涨跌统计
  const advancers = stockData.filter(s => +s.changePercent > 0).length;
  const decliners = stockData.filter(s => +s.changePercent < 0).length;

  // 写入市场数据
  const marketData = {
    timestamp: new Date().toISOString(),
    source: '新浪财经',
    indices: indexData,
    sectors,
    trending,
    marketBreadth: {
      advancers,
      decliners,
      unchanged: stockData.length - advancers - decliners,
    },
    marketStatus: ms,
  };
  fs.writeFileSync(
    path.join(DATA_DIR, 'market.json'),
    JSON.stringify(marketData, null, 2),
    'utf8'
  );
  console.log(`✅ 市场数据已保存 (${Object.keys(indexData).length} 指数)`);

  // 写入关注列表数据
  const watchlistData = {
    timestamp: new Date().toISOString(),
    source: '新浪财经 (GitHub Actions)',
    stocks: stockData,
    marketStatus: ms,
    liveCount: stockData.filter(s => s.price != null).length,
  };
  fs.writeFileSync(
    path.join(DATA_DIR, 'watchlist.json'),
    JSON.stringify(watchlistData, null, 2),
    'utf8'
  );
  console.log(`✅ 关注列表已保存 (${stockData.length} 只)`);

  // 生成简单的分析摘要
  const analysisData = {
    timestamp: new Date().toISOString(),
    source: '新浪财经实时信号',
    analyses: stockData.map(s => ({
      ticker: s.ticker,
      name: s.name,
      technical: {
        overallSignal: s.signal?.signal === 'BUY' ? 'bullish' : s.signal?.signal === 'WATCH' ? 'bearish' : 'neutral',
        signalStrength: (s.signal?.score || 50) / 100,
        view: `当日信号: ${s.signal?.text || '无数据'} (评分 ${s.signal?.score || 'N/A'}/100)。价格 ¥${s.price || 'N/A'}，${(s.changePercent || 0) >= 0 ? '上涨' : '下跌'} ${(s.changePercent || 0).toFixed(2)}%。`,
      },
      fundamental: {
        overallSignal: 'insufficient_data',
        signalStrength: 0.5,
        view: s.reason || '暂无详细基本面数据。',
      },
      insider: {
        overallSignal: 'insufficient_data',
        signalStrength: 0.5,
      },
      recommendation: s.signal ? {
        signal: s.signal.signal,
        confidence: s.signal.score / 100,
      } : { signal: 'HOLD', confidence: 0.5 },
      risks: ['市场系统性风险', '个股波动风险'],
    })),
  };
  fs.writeFileSync(
    path.join(DATA_DIR, 'analysis.json'),
    JSON.stringify(analysisData, null, 2),
    'utf8'
  );
  console.log(`✅ 分析数据已保存`);

  // 打印摘要
  console.log('\n📊 行情摘要:');
  console.log('─'.repeat(50));
  for (const s of stockData) {
    const chg = s.changePercent || 0;
    const arrow = chg >= 0 ? '🔴' : '🟢';
    const sig = s.signal ? ` [${s.signal.text}]` : '';
    console.log(`  ${arrow} ${s.ticker} ${s.name}: ¥${(s.price || 0).toFixed(2)} (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%)${sig}`);
  }

  console.log(`\n🕐 市场状态: ${ms.text}`);
  console.log(`📅 更新时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log('✅ 完成');
}

main().catch(err => {
  console.error('❌ 致命错误:', err.message);
  process.exit(1);
});
