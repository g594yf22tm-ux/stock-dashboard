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
      volume: s.volume, amount: s.amount
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

  // 生成分析摘要（v2：基于信号和目标价的多样化评分）
  const analysisData = {
    timestamp: new Date().toISOString(),
    source: '信号分析引擎 v2.0',
    analyses: stockData.map(s => {
      const sigScore = s.signal?.score || 50;
      const techStrength = sigScore / 100;
      // 基本面：基于目标价与现价的偏离度（上限1.0，下限0.3）
      const fundScore = s.targetPrice && s.price
        ? Math.min(1.0, Math.max(0.3, ((s.targetPrice / s.price) - 0.8) * 2))
        : 0.5;
      // 风险/内部交易：基于信号波动模拟
      const riskScore = 0.4 + (techStrength * 0.3);
      // 多样化风险列表
      const riskPool = [
        '市场系统性风险', '个股波动风险', '行业周期风险',
        '流动性风险', '政策监管风险', '汇率波动风险',
        '竞争加剧风险', '原材料价格风险', '技术变革风险'
      ];
      const nRisks = 2 + Math.floor((100 - sigScore) / 30); // 分数越低风险越多
      const risks = riskPool.sort(() => Math.random() - 0.5).slice(0, Math.min(nRisks, 4));

      return {
        ticker: s.ticker,
        name: s.name,
        technical: {
          overallSignal: sigScore >= 70 ? 'bullish' : sigScore >= 50 ? 'neutral' : 'bearish',
          signalStrength: techStrength,
          view: `当日信号: ${s.signal?.text || '无数据'} (评分 ${sigScore}/100)。价格 ¥${s.price || 'N/A'}，${(s.changePercent || 0) >= 0 ? '上涨' : '下跌'} ${(s.changePercent || 0).toFixed(2)}%。`,
        },
        fundamental: {
          overallSignal: fundScore >= 0.6 ? 'bullish' : fundScore >= 0.45 ? 'neutral' : 'bearish',
          signalStrength: fundScore,
          view: `${s.reason || ''} 目标价 ¥${s.targetPrice || 'N/A'}，潜在空间 ${s.targetPrice && s.price ? ((s.targetPrice/s.price-1)*100).toFixed(1)+'%' : '待评估'}。`,
        },
        insider: {
          overallSignal: riskScore >= 0.55 ? 'positive' : 'neutral',
          signalStrength: riskScore,
        },
        recommendation: s.signal ? {
          signal: s.signal.signal,
          confidence: sigScore / 100,
        } : { signal: 'HOLD', confidence: 0.5 },
        risks,
      };
    }),
  };
  fs.writeFileSync(
    path.join(DATA_DIR, 'analysis.json'),
    JSON.stringify(analysisData, null, 2),
    'utf8'
  );
  console.log(`✅ 分析数据已保存`);

  // 扩展行情：获取常用股票的实时价格（优先沪深主板前150只+关注列表）
  const stockListPath = path.join(DATA_DIR, 'stock_list.json');
  if (fs.existsSync(stockListPath)) {
    try {
      const stockList = JSON.parse(fs.readFileSync(stockListPath, 'utf8'));
      // 常用150只A股（涵盖各板块最活跃标的）
      const priorityCodes = new Set(stocks.map(s => s.ticker));
      const top150 = [
        // 沪市主板 60只
        '600000.SS','600004.SS','600009.SS','600010.SS','600011.SS','600015.SS','600016.SS','600018.SS','600019.SS','600021.SS',
        '600025.SS','600028.SS','600029.SS','600030.SS','600031.SS','600036.SS','600048.SS','600050.SS','600085.SS','600089.SS',
        '600104.SS','600111.SS','600115.SS','600150.SS','600176.SS','600188.SS','600195.SS','600196.SS','600276.SS','600309.SS',
        '600346.SS','600406.SS','600436.SS','600438.SS','600519.SS','600547.SS','600570.SS','600585.SS','600588.SS','600690.SS',
        '600809.SS','600837.SS','600887.SS','600893.SS','600900.SS','600941.SS','600958.SS','600999.SS','601006.SS','601012.SS',
        '601066.SS','601088.SS','601111.SS','601138.SS','601166.SS','601211.SS','601288.SS','601318.SS','601328.SS','601398.SS',
        '601628.SS','601633.SS','601668.SS','601688.SS','601728.SS','601766.SS','601857.SS','601888.SS','601899.SS','601919.SS',
        '601939.SS','601985.SS','601988.SS','603019.SS','603259.SS','603288.SS','603501.SS','603799.SS','603986.SS','688012.SS',
        // 深市主板+中小板 40只
        '000001.SZ','000002.SZ','000063.SZ','000100.SZ','000157.SZ','000166.SZ','000333.SZ','000338.SZ','000425.SZ','000538.SZ',
        '000568.SZ','000596.SZ','000625.SZ','000651.SZ','000661.SZ','000725.SZ','000776.SZ','000792.SZ','000858.SZ','000876.SZ',
        '000895.SZ','000938.SZ','000963.SZ','000977.SZ','001979.SZ','002001.SZ','002007.SZ','002027.SZ','002049.SZ','002050.SZ',
        '002074.SZ','002129.SZ','002142.SZ','002179.SZ','002195.SZ','002230.SZ','002241.SZ','002252.SZ','002271.SZ','002304.SZ',
        '002311.SZ','002352.SZ','002371.SZ','002415.SZ','002459.SZ','002460.SZ','002466.SZ','002475.SZ','002493.SZ','002594.SZ',
        '002601.SZ','002648.SZ','002709.SZ','002714.SZ','002736.SZ','002812.SZ','002920.SZ','002938.SZ',
        // 创业板 30只
        '300014.SZ','300015.SZ','300033.SZ','300059.SZ','300122.SZ','300124.SZ','300274.SZ','300316.SZ','300347.SZ','300413.SZ',
        '300433.SZ','300450.SZ','300498.SZ','300750.SZ','300760.SZ','300782.SZ','300896.SZ','300999.SZ','300394.SZ','300502.SZ',
        '300308.SZ','300476.SZ','300136.SZ','300458.SZ','300408.SZ','300115.SZ','300207.SZ','300661.SZ','300454.SZ','300699.SZ',
        // 科创板 20只
        '688981.SS','688111.SS','688036.SS','688005.SS','688008.SS','688009.SS','688012.SS','688017.SS','688036.SS','688099.SS',
        '688126.SS','688187.SS','688223.SS','688256.SS','688303.SS','688396.SS','688516.SS','688561.SS','688599.SS','688981.SS'
      ];
      const allCodes = [...new Set([...priorityCodes, ...top150])];
      const batchSize = 80;
      const extQuotes = [];

      console.log(`\n📡 获取扩展行情 (${allCodes.length}只常用股，每批${batchSize})...`);
      for (let i = 0; i < allCodes.length; i += batchSize) {
        const batch = allCodes.slice(i, i + batchSize);
        const batchQuotes = await getQuotes(batch);
        for (const q of batchQuotes) {
          if (q.price > 0) {
            extQuotes.push({
              t: q.ticker,
              p: q.price,
              c: q.changePercent,
              v: q.volume,
              a: q.amount  // 成交额(万元)
            });
          }
        }
        process.stdout.write(`  ${Math.min(i+batchSize, allCodes.length)}/${allCodes.length} (${extQuotes.length}有效)\r`);
      }
      console.log(`\n✅ 扩展行情: ${extQuotes.length}/${allCodes.length} 只在线`);

      const extData = {
        timestamp: new Date().toISOString(),
        source: '新浪财经',
        count: extQuotes.length,
        quotes: extQuotes
      };
      fs.writeFileSync(path.join(DATA_DIR, 'quotes_ext.json'), JSON.stringify(extData), 'utf8');
      console.log(`✅ 扩展行情已保存 (${(JSON.stringify(extData).length/1024).toFixed(1)} KB)`);
    } catch (e) {
      console.error('⚠️ 扩展行情获取失败:', e.message);
    }
  }

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
