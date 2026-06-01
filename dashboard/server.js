/**
 * Stock Dashboard Server v2.0
 * =============================
 * Express.js server serving the professional stock analysis dashboard.
 *
 * Start:  node dashboard/server.js
 *        npm run dashboard
 *        npm run dashboard:update   (fetches fresh data, then starts)
 *        npm run dashboard:build    (generates static HTML with embedded data)
 *
 * Open:   http://localhost:3000
 */

'use strict';

const express = require('express');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sinaApi = require('./services/sinaApi');
const { pinyin } = require('pinyin-pro');

// -- Config -------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_DIR = path.join(__dirname, 'config');
const REPORTS_DIR = path.join(ROOT, 'reports');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

// Cache TTLs in ms
const CACHE_TTL = {
  prices:        60 * 1000,
  fundamentals:  24 * 60 * 60 * 1000,
  insider:       60 * 60 * 1000,
  sectors:       5 * 60 * 1000,
  indices:       60 * 1000,
  analysis:      60 * 60 * 1000,
};

// Simple rate limiter
const rateLimits = new Map();
function checkRateLimit(ip, limit=60, windowMs=60000) {
  const now = Date.now();
  const record = rateLimits.get(ip) || { count: 0, reset: now + windowMs };
  if (now > record.reset) { record.count = 0; record.reset = now + windowMs; }
  record.count++;
  rateLimits.set(ip, record);
  return record.count <= limit;
}
// Clean stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, r] of rateLimits) { if (now > r.reset) rateLimits.delete(ip); }
}, 300000);

// -- Helpers ------------------------------------------------------------------

function loadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[ERROR] loadJSON ${path.basename(filePath)}: ${err.message}`);
    return null;
  }
}

function isCacheStale(filePath, ttlMs) {
  try {
    if (!fs.existsSync(filePath)) return true;
    const stat = fs.statSync(filePath);
    return (Date.now() - stat.mtimeMs) > ttlMs;
  } catch {
    return true;
  }
}

/**
 * A股交易时间判断（北京时间 UTC+8）
 * 交易日：周一至周五（排除法定节假日 — 此处做基本周末判断）
 * 交易时段：9:15-9:25 集合竞价，9:30-11:30 上午盘，13:00-15:00 下午盘
 */
function getMarketStatus() {
  const now = new Date();
  const bjHour = now.getUTCHours() + 8;
  const bjMin = now.getUTCMinutes();
  const bjDay = (bjHour >= 24) ? (now.getUTCDay() + 1) % 7 : now.getUTCDay();
  const h = bjHour >= 24 ? bjHour - 24 : bjHour;
  const day = bjDay; // 0=Sun, 6=Sat

  if (day === 0 || day === 6) {
    return { status: 'CLOSED', reason: '周末休市', isOpen: false };
  }

  const t = h * 60 + bjMin;

  if (t < 9 * 60 + 15) {
    return { status: 'CLOSED', reason: '等待开盘（9:15集合竞价）', isOpen: false };
  }
  if (t < 9 * 60 + 25) {
    return { status: 'OPEN', reason: '集合竞价中', isOpen: true };
  }
  if (t < 11 * 60 + 30) {
    return { status: 'OPEN', reason: '上午盘交易中', isOpen: true };
  }
  if (t < 13 * 60) {
    return { status: 'CLOSED', reason: '午间休市（11:30-13:00）', isOpen: false };
  }
  if (t < 15 * 60) {
    return { status: 'OPEN', reason: '下午盘交易中', isOpen: true };
  }
  if (t < 15 * 60 + 30) {
    return { status: 'CLOSED', reason: '收盘撮合中', isOpen: false };
  }
  return { status: 'CLOSED', reason: '已收盘', isOpen: false };
}

/**
 * Convert a signal label and strength to a 1-5 star rating.
 */
function computeStarRating(technicalSignal, fundamentalSignal, insiderSignal) {
  const map = {
    bullish: 1, strong: 1, buy: 1,
    neutral: 0.5, hold: 0.5,
    bearish: 0, weak: 0, sell: 0,
    insufficient_data: 0.5, error: 0.5,
  };

  const tScore = map[technicalSignal] ?? 0.5;
  const fScore = map[fundamentalSignal] ?? 0.5;
  const iScore = map[insiderSignal] ?? 0.5;

  // Weighted composite: technical 30%, fundamental 40%, insider 30%
  const composite = tScore * 0.3 + fScore * 0.4 + iScore * 0.3;

  // Map 0-1 to 1-5 stars
  const stars = Math.round(composite * 4) + 1;
  return Math.min(5, Math.max(1, stars));
}

/**
 * Map 0-1 signal strength to a 1-10 score.
 */
function strengthToScore(strength) {
  return Math.round((strength || 0.5) * 10);
}

// -- Data Enrichment ----------------------------------------------------------

/**
 * Normalise analysis data into a uniform map keyed by ticker.
 * Handles two formats:
 *   A. { analyses: [{ ticker, technical: {rsi14, macdSignal, ...}, fundamental: {...}, insider: {...} }] }
 *      (from update-analysis.js)
 *   B. { recommendations: [{ ticker, name, scores: {fundamental, technical, risk, overall},
 *                            signal, fundamentalView, technicalView, riskView }] }
 *      (from Claude agent-generated analysis)
 */
function buildAnalysisMap(analysisData) {
  const map = {};
  if (!analysisData) return map;

  // Format A: raw analysis from update-analysis.js
  if (analysisData.analyses && Array.isArray(analysisData.analyses)) {
    for (const a of analysisData.analyses) {
      map[a.ticker] = {
        ticker: a.ticker,
        name: a.name,
        // Technical data available
        hasRawData: true,
        technical: a.technical || null,
        fundamental: a.fundamental || null,
        insider: a.insider || null,
        recommendation: a.recommendation || null,
        risks: a.risks || [],
        // For scoring fallback
        techStrength: a.technical?.signalStrength,
        fundStrength: a.fundamental?.signalStrength,
        insiderStrength: a.insider?.signalStrength,
        expertRating: computeStarRating(
          a.technical?.overallSignal,
          a.fundamental?.overallSignal,
          a.insider?.overallSignal
        ),
        compositeScore: Math.round(
          ((a.technical?.signalStrength || 0.5) * 0.3 +
           (a.fundamental?.signalStrength || 0.5) * 0.4 +
           (a.insider?.signalStrength || 0.5) * 0.3) * 10
        ),
      };
    }
  }

  // Format B: frontend-friendly recommendations
  if (analysisData.recommendations && Array.isArray(analysisData.recommendations)) {
    for (const r of analysisData.recommendations) {
      const existing = map[r.ticker];
      if (existing) {
        // Merge scores and views into existing raw data
        existing.frontendData = r;
        if (!existing.recommendation && r.signal) existing.recommendation = r.signal;
      } else {
        // Map scores to approximate strengths for star rating
        const scores = r.scores || {};
        const tStr = (scores.technical || 5) / 10;
        const fStr = (scores.fundamental || 5) / 10;
        const rStr = (scores.risk || 5) / 10;
        const signal = (r.signal || 'HOLD').toUpperCase();
        const techSig = signal === 'BUY' ? 'bullish' : signal === 'WATCH' ? 'bearish' : 'neutral';
        const fundSig = scores.fundamental >= 7 ? 'strong' : scores.fundamental <= 4 ? 'weak' : 'neutral';

        map[r.ticker] = {
          ticker: r.ticker,
          name: r.name,
          hasRawData: false,
          frontendData: r,
          recommendation: signal,
          risks: [],
          // Derive signals from scores
          techStrength: tStr,
          fundStrength: fStr,
          insiderStrength: rStr,
          expertRating: computeStarRating(techSig, fundSig, 'insufficient_data'),
          compositeScore: Math.round(((tStr * 0.3) + (fStr * 0.4) + (rStr * 0.3)) * 10),
          // Store frontend views
          fundamentalView: r.fundamentalView || null,
          technicalView: r.technicalView || null,
          riskView: r.riskView || null,
        };
      }
    }
  }

  return map;
}

/**
 * Merge watchlist data with analysis data.
 * Adds RSI, MACD signal, expert ratings to each watchlist stock.
 */
function mergeWatchlistWithAnalysis(watchlistData, analysisData) {
  if (!watchlistData || !watchlistData.stocks) {
    return watchlistData || { stocks: [], timestamp: new Date().toISOString(), _stale: true };
  }

  const analysisMap = buildAnalysisMap(analysisData);

  const enriched = watchlistData.stocks.map(stock => {
    const a = analysisMap[stock.ticker];
    const entry = { ...stock };

    if (a) {
      if (a.hasRawData) {
        // Full raw data from update-analysis.js
        entry.rsi14 = a.technical?.rsi14 ?? null;
        entry.rsiSignal = a.technical?.rsiSignal ?? null;
        entry.macdSignal = a.technical?.macdSignal ?? 'insufficient_data';
        entry.techOverall = a.technical?.overallSignal ?? 'insufficient_data';
        entry.techStrength = a.techStrength ?? 0.5;
        entry.pe = stock.pe ?? a.fundamental?.pe ?? null;
        entry.forwardPE = a.fundamental?.forwardPE ?? null;
        entry.roe = a.fundamental?.roe ?? null;
        entry.debtToEquity = a.fundamental?.debtToEquity ?? null;
        entry.revenueGrowth = a.fundamental?.revenueGrowth ?? null;
        entry.fcfYield = a.fundamental?.fcfYield ?? null;
        entry.fundOverall = a.fundamental?.overallSignal ?? 'insufficient_data';
        entry.fundStrength = a.fundStrength ?? 0.5;
        entry.insiderSignal = a.insider?.overallSignal ?? 'insufficient_data';
        entry.insiderStrength = a.insiderStrength ?? 0.5;
        entry.insiderBuys = a.insider?.recentBuys ?? null;
        entry.insiderSells = a.insider?.recentSells ?? null;
        entry.recommendation = a.recommendation || null;
        entry.risks = a.risks || [];
        // Also carry frontend views if merged
        if (a.fundamentalView) entry.fundamentalView = a.fundamentalView;
        if (a.technicalView) entry.technicalView = a.technicalView;
        if (a.riskView) entry.riskView = a.riskView;
      } else {
        // Frontend format only — carry what scores we can derive
        entry.rsi14 = null;
        entry.rsiSignal = null;
        entry.macdSignal = 'insufficient_data';
        const signal = a.recommendation || 'HOLD';
        entry.techOverall = signal === 'BUY' ? 'bullish' : signal === 'WATCH' ? 'bearish' : 'neutral';
        entry.techStrength = a.techStrength ?? 0.5;
        entry.pe = stock.pe ?? null;
        entry.forwardPE = null;
        entry.roe = null;
        entry.debtToEquity = null;
        entry.revenueGrowth = null;
        entry.fcfYield = null;
        entry.fundOverall = 'insufficient_data';
        entry.fundStrength = a.fundStrength ?? 0.5;
        entry.insiderSignal = 'insufficient_data';
        entry.insiderStrength = 0.5;
        entry.insiderBuys = null;
        entry.insiderSells = null;
        entry.recommendation = a.recommendation || null;
        entry.risks = a.risks || [];
        if (a.fundamentalView) entry.fundamentalView = a.fundamentalView;
        if (a.technicalView) entry.technicalView = a.technicalView;
        if (a.riskView) entry.riskView = a.riskView;
      }

      entry.expertRating = a.expertRating ?? 3;
      entry.compositeScore = a.compositeScore ?? 5;
    } else {
      entry.rsi14 = null;
      entry.rsiSignal = null;
      entry.macdSignal = 'insufficient_data';
      entry.techOverall = 'insufficient_data';
      entry.techStrength = 0.5;
      entry.forwardPE = null;
      entry.roe = null;
      entry.debtToEquity = null;
      entry.revenueGrowth = null;
      entry.fcfYield = null;
      entry.fundOverall = 'insufficient_data';
      entry.fundStrength = 0.5;
      entry.insiderSignal = 'insufficient_data';
      entry.insiderStrength = 0.5;
      entry.insiderBuys = null;
      entry.insiderSells = null;
      entry.recommendation = null;
      entry.risks = [];
      entry.expertRating = 3;
      entry.compositeScore = 5;
    }

    return entry;
  });

  return {
    timestamp: watchlistData.timestamp || new Date().toISOString(),
    source: watchlistData.source || 'unknown',
    analysisTimestamp: analysisData?.timestamp || null,
    stocks: enriched,
  };
}

/**
 * Transform analysis.json data into frontend-friendly format.
 * Handles two input formats:
 *   A. { analyses: [{ technical, fundamental, insider, recommendation, risks }] }
 *      (from update-analysis.js — needs views generated)
 *   B. { recommendations: [{ ticker, name, scores, signal, fundamentalView, technicalView, riskView }] }
 *      (from Claude agent — already has views, pass through)
 */
function formatAnalysisForFrontend(analysisData) {
  if (!analysisData) {
    return { recommendations: [], timestamp: new Date().toISOString(), _stale: true };
  }

  // Detect format
  const hasRawAnalyses = analysisData.analyses && Array.isArray(analysisData.analyses);
  const hasFrontendRecs = analysisData.recommendations && Array.isArray(analysisData.recommendations);

  // If already in frontend format, pass through with minor normalisation
  if (hasFrontendRecs && !hasRawAnalyses) {
    const recommendations = analysisData.recommendations.map(r => ({
      ticker: r.ticker || '',
      name: r.name || r.ticker || '',
      fundamentalView: r.fundamentalView || '暂无基本面分析。',
      technicalView: r.technicalView || '暂无技术面分析。',
      riskView: r.riskView || '暂无风险评估。',
      recommendation: r.signal || r.recommendation || '',
      scores: {
        fundamental: r.scores?.fundamental != null ? Math.round(r.scores.fundamental) : 5,
        technical: r.scores?.technical != null ? Math.round(r.scores.technical) : 5,
        risk: r.scores?.risk != null ? Math.round(r.scores.risk) : 5,
      },
    }));
    return {
      timestamp: analysisData.timestamp || new Date().toISOString(),
      sources: analysisData.sources || ['claude-agent'],
      recommendations,
    };
  }

  // Format A: raw analyses — generate views from signal data
  if (hasRawAnalyses) {
    // Build analysis map for possible enrichment from format B in same file
    const frontendMap = {};
    if (hasFrontendRecs) {
      for (const r of analysisData.recommendations) {
        frontendMap[r.ticker] = r;
      }
    }

    const recommendations = analysisData.analyses.map(a => {
      const fe = frontendMap[a.ticker];

      // 优先使用预写分析文字（a.technical.view / a.fundamental.view / risks）
      let technicalView = a.technical?.view || fe?.technicalView || '';
      let fundamentalView = a.fundamental?.view || fe?.fundamentalView || '';
      let riskView = Array.isArray(a.risks) ? a.risks.join('；') : (a.risks || fe?.riskView || '');

      if (!technicalView) {
        if (a.technical?.overallSignal === 'bullish') {
          technicalView = `技术面看涨。RSI(14)=${a.technical.rsi14 ?? 'N/A'}`;
          if (a.technical.macdSignal === 'bullish') technicalView += '，MACD金叉';
          if (a.technical.priceVsSma50 !== null) {
            const dir = a.technical.priceVsSma50 > 0 ? '高于' : '低于';
            technicalView += `，价格${dir}50日均线${Math.abs(a.technical.priceVsSma50)}%`;
          }
          technicalView += '。';
        } else if (a.technical?.overallSignal === 'bearish') {
          technicalView = `技术面偏空。MACD信号:${a.technical.macdSignal}`;
          if (a.technical.rsi14 !== null) {
            if (a.technical.rsi14 < 30) technicalView += `，RSI超卖(${a.technical.rsi14})`;
            else if (a.technical.rsi14 > 70) technicalView += `，RSI超买(${a.technical.rsi14})`;
          }
          technicalView += '。';
        } else {
          technicalView = '技术面中性。数据不足或信号矛盾。';
        }
      }

      if (!fundamentalView) {
        if (a.fundamental?.overallSignal === 'strong') {
          fundamentalView = '基本面强劲。';
          if (a.fundamental.roe !== null) fundamentalView += `ROE=${a.fundamental.roe}%，`;
          if (a.fundamental.revenueGrowth !== null) fundamentalView += `营收增长${a.fundamental.revenueGrowth}%，`;
          if (a.fundamental.pe !== null) fundamentalView += `PE=${a.fundamental.pe}x。`;
        } else if (a.fundamental?.overallSignal === 'weak') {
          fundamentalView = '基本面偏弱。';
          if (a.fundamental.debtToEquity !== null && a.fundamental.debtToEquity > 1.5) {
            fundamentalView += `负债率偏高(D/E=${a.fundamental.debtToEquity})，`;
          }
          if (a.fundamental.revenueGrowth !== null && a.fundamental.revenueGrowth < 0) {
            fundamentalView += `营收下滑${Math.abs(a.fundamental.revenueGrowth)}%。`;
          }
        } else {
          fundamentalView = '基本面数据不足或中性。';
          if (a.fundamental?.pe !== null) fundamentalView += `PE=${a.fundamental.pe}x。`;
        }
      }

      if (!riskView) {
        if (a.risks && a.risks.length > 0) {
          riskView = a.risks.slice(0, 3).join('；') + '。';
        } else {
          riskView = '未识别到特定风险因素。市场系统性风险适用于所有权益类资产。';
        }
      }

      return {
        ticker: a.ticker,
        name: a.name || a.ticker,
        fundamentalView,
        technicalView,
        riskView,
        recommendation: fe?.signal || a.recommendation || '',
        scores: {
          fundamental: fe?.scores?.fundamental != null
            ? Math.round(fe.scores.fundamental)
            : strengthToScore(a.fundamental?.signalStrength),
          technical: fe?.scores?.technical != null
            ? Math.round(fe.scores.technical)
            : strengthToScore(a.technical?.signalStrength),
          risk: fe?.scores?.risk != null
            ? Math.round(fe.scores.risk)
            : 10 - Math.round((a.risks?.length || 0) * 2),
        },
      };
    });

    return {
      timestamp: analysisData.timestamp || new Date().toISOString(),
      sources: analysisData.sources || ['yahoo-finance', 'fmp', 'openinsider'],
      recommendations,
    };
  }

  // Nothing usable
  return { recommendations: [], timestamp: new Date().toISOString(), _stale: true };
}

// -- Report Scanning ----------------------------------------------------------

/**
 * Scan the reports directory for analysis reports.
 */
function scanReports() {
  const reports = [];
  if (!fs.existsSync(REPORTS_DIR)) return reports;

  try {
    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, 15);

    const filenameRe = /^([A-Za-z0-9.^-]+)_(.+)_(\d{4}-\d{2}-\d{2})\.md$/;

    for (const file of files) {
      const match = file.match(filenameRe);
      const stat = fs.statSync(path.join(REPORTS_DIR, file));
      const date = match ? match[3] : stat.mtime.toISOString().split('T')[0];
      const ticker = match ? match[1] : '';
      const type = match ? match[2].replace(/_/g, ' ') : 'unknown';

      let excerpt = '';
      try {
        const content = fs.readFileSync(path.join(REPORTS_DIR, file), 'utf8');
        const summaryRe = /^##\s*(?:Summary|摘要|Executive Summary|核心结论|综合结论)\s*$/im;
        const lines = content.split(/\r?\n/);
        let inSummary = false;
        const excerptLines = [];
        for (const line of lines) {
          if (summaryRe.test(line)) { inSummary = true; continue; }
          if (inSummary) {
            if (/^##\s/.test(line)) break;
            if (line.trim()) excerptLines.push(line.trim());
          }
        }
        excerpt = excerptLines.join(' ').slice(0, 250);
        if (excerpt.length >= 250) excerpt += '...';
      } catch { /* swallow */ }

      reports.push({
        filename: file,
        ticker,
        type,
        title: match ? `${ticker} ${type}` : file.replace('.md', '').replace(/_/g, ' '),
        date,
        path: `/reports/${file}`,
        excerpt,
      });
    }
  } catch (err) {
    console.error(`[ERROR] scanReports: ${err.message}`);
  }

  return reports;
}

// -- App ----------------------------------------------------------------------

const app = express();

// Middleware
app.use(compression()); // Gzip/brotli 压缩
app.use(express.json()); // 全局 JSON 解析

// Rate limiter for API endpoints
app.use('/api/', (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(ip, 120, 60000)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试', retryAfter: '60秒' });
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${new Date().toLocaleTimeString('zh-CN', { hour12: false })} ${res.statusCode} ${req.method} ${req.url} (${ms}ms)`);
  });
  next();
});

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Static files with optimized caching
const staticOptions = {
  maxAge: 5 * 60 * 1000,        // 5 min cache
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Cache-Control', 'public, max-age=120');
    }
  }
};
app.use(express.static(PUBLIC_DIR, staticOptions));
app.use('/reports', express.static(REPORTS_DIR, { maxAge: 10 * 60 * 1000 }));

// -- API Routes ---------------------------------------------------------------

/**
 * GET /api/health
 * Health check + server stats + data source connectivity.
 */
app.get('/api/health', async (req, res) => {
  const mem = process.memoryUsage();

  // Test Sina API connectivity
  let sinaStatus = 'unknown';
  try {
    const testQuote = await sinaApi.getQuote('000001.SS');
    sinaStatus = testQuote && testQuote.name ? 'connected' : 'degraded';
  } catch { sinaStatus = 'error'; }

  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    memory: {
      rss: (mem.rss / 1024 / 1024).toFixed(1) + ' MB',
      heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(1) + ' MB',
    },
    nodeVersion: process.version,
    platform: process.platform,
    dataSources: {
      sina: sinaStatus,
    },
    marketStatus: getMarketStatus(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/market
 * Market overview: indices, sectors, trending stocks, market status.
 */
app.get('/api/market', (req, res) => {
  const marketFile = path.join(DATA_DIR, 'market.json');
  const data = loadJSON(marketFile);
  const marketStatus = getMarketStatus();

  if (!data) {
    // Return empty structure so frontend shows "no data" gracefully
    return res.json({
      indices: {},
      sectors: [],
      trending: [],
      marketBreadth: { advancers: 0, decliners: 0, unchanged: 0 },
      marketStatus,
      timestamp: new Date().toISOString(),
      _stale: true,
      _message: 'No market data cached. Run: node scripts/fetch-market-data.js',
    });
  }

  // Add staleness info
  const ageMs = Date.now() - new Date(data.timestamp).getTime();
  data._stale = ageMs > CACHE_TTL.indices;
  data._ageSeconds = Math.floor(ageMs / 1000);
  data.marketStatus = marketStatus;

  res.json(data);
});

/**
 * GET /api/watchlist/live
 * 从新浪获取关注列表的实时行情（替换静态缓存数据）
 */
app.get('/api/watchlist/live', async (req, res) => {
  const config = loadJSON(path.join(CONFIG_DIR, 'watchlist.json'));
  const stocks = config?.stocks?.filter(s => s.active !== false) || [];
  if (stocks.length === 0) {
    return res.json({ stocks: [], timestamp: new Date().toISOString() });
  }

  try {
    const tickers = stocks.map(s => s.ticker);
    const liveQuotes = await sinaApi.getQuotes(tickers);

    // 合并新浪实时行情 + 配置信息 + 分析数据
    const analysisData = loadJSON(path.join(DATA_DIR, 'analysis.json'));
    const enriched = stocks.map(cfg => {
      const live = liveQuotes.find(q => q.ticker === cfg.ticker);
      const analysis = analysisData?.analyses?.find(a => a.ticker === cfg.ticker);

      // 计算当日信号
      const signal = live ? sinaApi.analyzeSignal(live) : null;

      return {
        ticker: cfg.ticker,
        name: live?.name || cfg.name,
        price: live?.price || null,
        change: live?.change || null,
        changePercent: live?.changePercent || null,
        open: live?.open || null,
        high: live?.high || null,
        low: live?.low || null,
        volume: live?.volume || null,
        amount: live?.amount || null,
        sector: cfg.sector || '',
        targetPrice: cfg.targetPrice || null,
        signal: signal ? { text: signal.signalText, score: signal.score, type: signal.signal, color: signal.color } : null,
        expertRating: analysis?.recommendation
          ? (analysis.recommendation.signal === 'BUY' ? 5 : analysis.recommendation.signal === 'HOLD' ? 3 : 2)
          : 3,
        recommendation: analysis?.recommendation || null,
        source: '新浪实时',
        _live: true
      };
    });

    // 按涨跌幅排序（涨幅大的在前）
    enriched.sort((a, b) => Math.abs(b.changePercent || 0) - Math.abs(a.changePercent || 0));

    // 同时更新热门关注
    const trending = enriched
      .filter(s => s.volume > 0)
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
      .slice(0, 10)
      .map(s => ({
        ticker: s.ticker, name: s.name,
        price: s.price, changePercent: s.changePercent,
        volume: s.volume, signal: s.signal?.text
      }));

    res.json({
      stocks: enriched,
      trending,
      count: enriched.length,
      liveCount: enriched.filter(s => s.price != null).length,
      source: '新浪财经实时行情',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Watchlist Live] Error:', err.message);
    // 回退到缓存
    const cached = loadJSON(path.join(DATA_DIR, 'watchlist.json'));
    res.json({
      stocks: cached?.stocks || [],
      trending: [],
      count: cached?.stocks?.length || 0,
      liveCount: 0,
      source: '缓存数据（实时获取失败）',
      timestamp: new Date().toISOString(),
      _stale: true
    });
  }
});

/**
 * GET /api/watchlist
 * Enriched watchlist with analysis data.
 */
app.get('/api/watchlist', (req, res) => {
  const watchlistFile = path.join(DATA_DIR, 'watchlist.json');
  const analysisFile = path.join(DATA_DIR, 'analysis.json');
  const configFile = path.join(CONFIG_DIR, 'watchlist.json');

  const watchlistData = loadJSON(watchlistFile);
  const analysisData = loadJSON(analysisFile);
  const config = loadJSON(configFile);

  if (!watchlistData) {
    // Even without cached data, we can return the config stocks as a skeleton
    if (config && config.stocks) {
      const skeleton = config.stocks
        .filter(s => s.active !== false)
        .map(s => ({
          ticker: s.ticker,
          name: s.name,
          price: null,
          change: null,
          changePercent: null,
          volume: null,
          marketCap: null,
          pe: null,
          targetPrice: s.targetPrice || null,
          sparkline: [],
          rsi14: null,
          rsiSignal: null,
          macdSignal: 'insufficient_data',
          techOverall: 'insufficient_data',
          fundOverall: 'insufficient_data',
          insiderSignal: 'insufficient_data',
          expertRating: 3,
          compositeScore: 5,
          recommendation: null,
          risks: [],
          sector: s.sector || null,
          _stale: true,
        }));
      return res.json({
        timestamp: new Date().toISOString(),
        stocks: skeleton,
        _stale: true,
        _message: 'No cached data. Run: node scripts/fetch-market-data.js && node scripts/update-analysis.js',
      });
    }
    return res.json({ stocks: [], timestamp: new Date().toISOString(), _stale: true });
  }

  // Enrich with analysis data
  const enriched = mergeWatchlistWithAnalysis(watchlistData, analysisData);

  // Add target prices from config
  if (config?.stocks) {
    const targetMap = {};
    config.stocks.forEach(s => { targetMap[s.ticker] = s.targetPrice; });
    enriched.stocks.forEach(s => {
      if (!s.targetPrice) s.targetPrice = targetMap[s.ticker] || null;
    });
  }

  // Add staleness info
  const ageMs = Date.now() - new Date(enriched.timestamp).getTime();
  enriched._stale = ageMs > CACHE_TTL.prices;
  enriched._ageSeconds = Math.floor(ageMs / 1000);

  res.json(enriched);
});

/**
 * GET /api/analysis
 * Expert analysis recommendations formatted for frontend display.
 */
app.get('/api/analysis', (req, res) => {
  const analysisFile = path.join(DATA_DIR, 'analysis.json');
  const data = loadJSON(analysisFile);

  if (!data) {
    return res.json({
      recommendations: [],
      timestamp: new Date().toISOString(),
      _stale: true,
      _message: 'No analysis data. Run: node scripts/update-analysis.js',
    });
  }

  const formatted = formatAnalysisForFrontend(data);

  // Add staleness
  const ageMs = Date.now() - new Date(data.timestamp).getTime();
  formatted._stale = ageMs > CACHE_TTL.analysis;
  formatted._ageSeconds = Math.floor(ageMs / 1000);

  res.json(formatted);
});

/**
 * GET /api/reports
 * Recent analysis reports from the reports/ directory.
 */
app.get('/api/reports', (req, res) => {
  // First try cached reports.json
  const reportsFile = path.join(DATA_DIR, 'reports.json');
  const cached = loadJSON(reportsFile);

  if (cached && cached.reports && cached.reports.length > 0) {
    const ageMs = Date.now() - new Date(cached.timestamp).getTime();
    return res.json({
      ...cached,
      _stale: ageMs > CACHE_TTL.analysis,
      _ageSeconds: Math.floor(ageMs / 1000),
    });
  }

  // Fall back to direct directory scan
  const reports = scanReports();
  res.json({
    reports,
    timestamp: new Date().toISOString(),
    _stale: false,
  });
});

/**
 * GET /api/config
 * Dashboard configuration for the frontend.
 */
app.get('/api/config', (req, res) => {
  const dashboardConfig = loadJSON(path.join(CONFIG_DIR, 'dashboard.json'));
  const watchlistConfig = loadJSON(path.join(CONFIG_DIR, 'watchlist.json'));

  const ui = dashboardConfig?.ui || {};
  const chartColors = ui.chartColors || {};
  const panels = ui.panels || {};

  res.json({
    title: ui.title || 'Stock Analysis Dashboard',
    refreshIntervalMs: ui.refreshIntervalMs || 300000,
    theme: ui.theme || 'dark',
    defaultView: ui.defaultView || 'dashboard',
    chartColors: {
      up: chartColors.up || '#22c55e',
      down: chartColors.down || '#ef4444',
      neutral: chartColors.neutral || '#6b7280',
      primary: chartColors.primary || '#3b82f6',
      secondary: chartColors.secondary || '#8b5cf6',
      accent: chartColors.accent || '#f59e0b',
      background: chartColors.background || '#1a1a2e',
      surface: chartColors.surface || '#16213e',
      border: chartColors.border || '#334155',
      text: chartColors.text || '#f8fafc',
      textMuted: chartColors.textMuted || '#94a3b8',
    },
    panels,
    watchlist: watchlistConfig?.stocks?.filter(s => s.active !== false).map(s => ({
      ticker: s.ticker,
      name: s.name,
    })) || [],
    sectors: watchlistConfig?.sectors || [],
    marketStatus: getMarketStatus(),
  });
});

/**
 * POST /api/refresh
 * Trigger a background data refresh.
 */
app.post('/api/refresh', (req, res) => {
  const fetchScript = path.join(SCRIPTS_DIR, 'fetch-market-data.js');
  const analysisScript = path.join(SCRIPTS_DIR, 'update-analysis.js');

  // Check if scripts exist
  if (!fs.existsSync(fetchScript)) {
    return res.status(500).json({
      status: 'error',
      message: `Fetch script not found: ${fetchScript}`,
    });
  }

  // Respond immediately; the refresh runs in background
  res.json({
    status: 'started',
    message: 'Data refresh triggered in background. This takes ~15-30 seconds.',
    timestamp: new Date().toISOString(),
  });

  // Spawn market data fetch
  console.log('[REFRESH] Starting background data fetch...');
  const marketChild = spawn('node', [fetchScript], {
    cwd: ROOT,
    stdio: 'inherit',
    detached: true,
  });

  marketChild.on('close', (code) => {
    console.log(`[REFRESH] Market fetch exited with code ${code}`);
    if (code === 0) {
      // After market data, spawn analysis update
      console.log('[REFRESH] Starting analysis update...');
      const analysisChild = spawn('node', [analysisScript], {
        cwd: ROOT,
        stdio: 'inherit',
        detached: true,
      });
      analysisChild.on('close', (code2) => {
        console.log(`[REFRESH] Analysis update exited with code ${code2}`);
      });
      analysisChild.on('error', (err) => {
        console.error(`[REFRESH] Analysis spawn error: ${err.message}`);
      });
    }
  });

  marketChild.on('error', (err) => {
    console.error(`[REFRESH] Market fetch spawn error: ${err.message}`);
  });
});

// -- Search API ---------------------------------------------------------------
// 智能搜索：代码 > 名称 > 拼音 > 模糊匹配
app.get('/api/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.json({ results: [], query: '', message: '输入代码/名称/拼音' });
  }

  const results = [];
  const seen = new Set();
  const watchlist = loadJSON(path.join(DATA_DIR, 'watchlist.json'));

  function addResult(r) {
    if (!seen.has(r.ticker)) {
      seen.add(r.ticker);
      results.push(r);
    }
  }

  // 1. 精确匹配：代码或名称完全匹配（关注列表优先）
  if (watchlist?.stocks) {
    for (const s of watchlist.stocks) {
      const tickerMatch = s.ticker === query || s.ticker.replace(/\.\w+$/,'') === query;
      const nameMatch = s.name === query;
      const tickerPartial = s.ticker.includes(query) || s.ticker.replace(/\.\w+$/,'').startsWith(query);
      const namePartial = s.name.includes(query);

      if (tickerMatch || nameMatch || tickerPartial || namePartial) {
        addResult({
          ticker: s.ticker, name: s.name,
          price: s.price, change: s.change, changePercent: s.changePercent,
          sector: s.sector || '', volume: s.volume,
          source: '关注列表', _cached: true, score: tickerMatch ? 100 : nameMatch ? 95 : 80
        });
      }
    }

    // 拼音匹配
    if (results.length < 5 && /^[a-zA-Z]+$/.test(query)) {
      const qLower = query.toLowerCase();
      for (const s of watchlist.stocks) {
        if (seen.has(s.ticker)) continue;
        try {
          const py = pinyin(s.name, { toneType: 'none', type: 'array' }).join('');
          const pyInit = pinyin(s.name, { pattern: 'first', toneType: 'none', type: 'array' }).join('');
          if (py.startsWith(qLower) || pyInit.startsWith(qLower) || py.includes(qLower)) {
            addResult({
              ticker: s.ticker, name: s.name,
              price: s.price, change: s.change, changePercent: s.changePercent,
              sector: s.sector || '', source: '拼音匹配', _cached: true, score: 70
            });
          }
        } catch {}
      }
    }
  }

  // 2. 新浪全市场搜索
  if (results.length < 8) {
    try {
      const sinaResults = await sinaApi.searchStocks(query);
      for (const sr of sinaResults) {
        addResult({ ...sr, source: '全市场', _cached: false, score: 60 });
      }
    } catch (err) {
      console.error('[Search] Sina API failed:', err.message);
    }
  }

  // 3. 如果都没结果，尝试仅用数字部分搜索（如输入600519但格式不同）
  if (results.length === 0 && /^\d{4,6}$/.test(query)) {
    // 判断可能是沪市还是深市
    const attempts = [query+'.SS', query+'.SZ'];
    for (const t of attempts) {
      try {
        const q = await sinaApi.getQuote(t);
        if (q && q.name) {
          addResult({
            ticker: t, name: q.name,
            price: q.price, changePercent: q.changePercent,
            source: '智能匹配', _cached: false, score: 85
          });
          break; // 找到一个就够了
        }
      } catch {}
    }
  }

  // 按分数排序
  results.sort((a, b) => (b.score || 0) - (a.score || 0));

  res.json({
    query: req.query.q,
    results: results.slice(0, 15),
    count: Math.min(results.length, 15),
    hasMore: results.length > 15,
    source: results.length > 0 ? (results[0].source || '多源') : '无结果',
    suggestions: results.length === 0 ? [
      '试试输入完整代码（如 600519）',
      '试试输入股票名称（如 贵州茅台）',
      '试试输入拼音首字母（如 GZMT）',
    ] : [],
    timestamp: new Date().toISOString()
  });
});

// -- Stock Detail API ---------------------------------------------------------
// 获取单只股票的实时行情
app.get('/api/stock/:ticker', async (req, res) => {
  const ticker = (req.params.ticker || '').trim();
  if (!ticker) return res.status(400).json({ error: '请输入股票代码' });

  try {
    const quote = await sinaApi.getQuote(ticker);
    if (!quote) {
      return res.status(404).json({
        error: '未找到该股票',
        ticker,
        message: '请检查代码格式，如：600519.SS (沪市) 或 000001.SZ (深市)'
      });
    }

    // 从缓存获取补充信息
    const watchlist = loadJSON(path.join(DATA_DIR, 'watchlist.json'));
    const cached = watchlist?.stocks?.find(s => s.ticker === ticker);

    // 计算当日技术信号
    const signal = sinaApi.analyzeSignal(quote);

    res.json({
      ...quote,
      sector: cached?.sector || '',
      targetPrice: cached?.targetPrice || null,
      sparkline: cached?.sparkline || [],
      pe: cached?.pe || null,
      marketCap: cached?.marketCap || null,
      signal,
      source: '新浪财经实时数据',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: '数据获取失败', message: err.message });
  }
});

// -- Stock News API -----------------------------------------------------------
// 获取该股票的专属新闻
app.get('/api/stock/:ticker/news', async (req, res) => {
  const ticker = (req.params.ticker || '').trim();

  // 获取股票名称
  let name = ticker;
  try {
    const quote = await sinaApi.getQuote(ticker);
    if (quote) name = quote.name;
  } catch {}

  // 从新浪个股页面抓取专属新闻
  let articles = [];
  try {
    articles = await sinaApi.getStockNews(ticker);
  } catch (err) {
    console.error('[News] Scrape error:', err.message);
  }

  const { keywords, searchUrl } = sinaApi.getNewsKeywords(ticker, name);

  // 补充外部链接
  const externalLinks = {
    sina: `https://finance.sina.com.cn/realstock/company/${ticker.replace('.SS','sh').replace('.SZ','sz').replace('.ss','sh').replace('.sz','sz')}/nc.shtml`,
    eastmoney: `https://guba.eastmoney.com/list,${ticker.replace(/\.\w+$/,'')}.html`,
    baidu: searchUrl
  };

  res.json({
    ticker,
    name,
    articles,
    count: articles.length,
    keywords,
    externalLinks,
    timestamp: new Date().toISOString()
  });
});

// -- Favorites API ------------------------------------------------------------
// 自选股管理：增删查 + 持久化到 dashboard/data/favorites.json
const FAVORITES_FILE = path.join(DATA_DIR, 'favorites.json');

function loadFavorites() {
  try { if (fs.existsSync(FAVORITES_FILE)) return JSON.parse(fs.readFileSync(FAVORITES_FILE, 'utf8')); }
  catch(e) { console.error('[Favorites] Read error:', e.message); }
  return [];
}
function saveFavorites(list) {
  fs.writeFileSync(FAVORITES_FILE, JSON.stringify(list, null, 2), 'utf8');
}

// GET /api/favorites — 获取自选列表（含实时行情）
app.get('/api/favorites', async (req, res) => {
  const favs = loadFavorites();
  if (favs.length === 0) return res.json({ favorites: [], count: 0, timestamp: new Date().toISOString() });

  try {
    const quotes = await sinaApi.getQuotes(favs.map(f => f.ticker));
    const enriched = favs.map(f => {
      const q = quotes.find(x => x.ticker === f.ticker);
      const signal = q ? sinaApi.analyzeSignal(q) : null;
      return {
        ticker: f.ticker, name: q?.name || f.name, addedAt: f.addedAt,
        price: q?.price || null,
        change: q?.change || null, changePercent: q?.changePercent || null,
        open: q?.open, high: q?.high, low: q?.low, volume: q?.volume, amount: q?.amount,
        signal: signal ? { text: signal.signalText, score: signal.score, type: signal.signal, color: signal.color } : null,
        source: q ? '新浪实时' : '离线'
      };
    });
    res.json({ favorites: enriched, count: enriched.length, source: '新浪财经实时行情', timestamp: new Date().toISOString() });
  } catch (err) {
    res.json({ favorites: favs, count: favs.length, source: '缓存', timestamp: new Date().toISOString(), _stale: true });
  }
});

// POST /api/favorites/add — 加入自选
app.post('/api/favorites/add', async (req, res) => {
  const { ticker } = req.body || {};
  if (!ticker) return res.status(400).json({ error: '缺少 ticker' });

  const favs = loadFavorites();
  if (favs.find(f => f.ticker === ticker)) {
    return res.json({ status: 'exists', ticker, message: '已在自选中', count: favs.length });
  }

  // 获取名称
  let name = ticker;
  try { const q = await sinaApi.getQuote(ticker); if (q) name = q.name; } catch {}

  favs.push({ ticker, name, addedAt: new Date().toISOString() });
  saveFavorites(favs);

  res.json({ status: 'added', ticker, name, count: favs.length, message: `已加入自选: ${name}` });
});

// POST /api/favorites/remove — 移除自选
app.post('/api/favorites/remove', (req, res) => {
  const { ticker } = req.body || {};
  if (!ticker) return res.status(400).json({ error: '缺少 ticker' });

  let favs = loadFavorites();
  const before = favs.length;
  favs = favs.filter(f => f.ticker !== ticker);
  if (favs.length === before) return res.json({ status: 'not_found', ticker, message: '不在自选中' });

  saveFavorites(favs);
  res.json({ status: 'removed', ticker, count: favs.length, message: '已移出自选' });
});

// -- Report Delete API --------------------------------------------------------
// DELETE /api/reports/all — 一键清空所有报告
app.delete('/api/reports/all', (req, res) => {
  try {
    if (!fs.existsSync(REPORTS_DIR)) {
      return res.json({ status: 'deleted', count: 0, message: '无报告可删除' });
    }
    const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md'));
    let deleted = 0;
    for (const f of files) {
      try { fs.unlinkSync(path.join(REPORTS_DIR, f)); deleted++; }
      catch(e) { console.error('[Reports] Delete error:', f, e.message); }
    }
    console.log('[Reports] Batch deleted:', deleted, 'files');
    res.json({ status: 'deleted', count: deleted, message: `已删除 ${deleted} 份报告` });
  } catch(err) {
    res.status(500).json({ error: '批量删除失败', message: err.message });
  }
});

// DELETE /api/reports/:filename
app.delete('/api/reports/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join(REPORTS_DIR, filename);

  // 安全检查：防止路径遍历
  if (!filePath.startsWith(REPORTS_DIR)) {
    return res.status(403).json({ error: '路径非法' });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在', filename });
    }
    fs.unlinkSync(filePath);
    console.log('[Reports] Deleted:', filename);
    res.json({ status: 'deleted', filename, message: '报告已删除' });
  } catch (err) {
    res.status(500).json({ error: '删除失败', message: err.message });
  }
});

// -- Quick Stock Analysis API --------------------------------------------------
// POST /api/analyze — 为指定股票快速生成分析摘要
app.post('/api/analyze', async (req, res) => {
  const { ticker } = req.body || {};
  if (!ticker) return res.status(400).json({ error: '缺少股票代码' });

  // 获取实时行情
  let stock = { ticker, name: ticker, price: 0, changePercent: '0' };
  try {
    const q = await sinaApi.getQuote(ticker);
    if (q) stock = { ...q, ticker };
  } catch {}

  // 获取分析数据
  const analysisData = loadJSON(path.join(DATA_DIR, 'analysis.json'));
  const analysis = analysisData?.analyses?.find(a => a.ticker === ticker);

  // 计算信号
  const signal = stock.price ? sinaApi.analyzeSignal(stock) : null;

  // 生成报告内容
  const now = new Date().toLocaleString('zh-CN');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `${stock.name}_${ticker}_分析报告_${dateStr}.md`;
  const report = `# ${stock.name}（${ticker}）分析报告

**日期**: ${dateStr} | **分析师**: AI 专家团队 | **数据截止**: ${now}

---

> ${stock.name}（${ticker}），当前价 **¥${stock.price}**，${parseFloat(stock.changePercent||0) >= 0 ? '📈 上涨' : '📉 下跌'} **${stock.changePercent}%**。${signal ? `当日信号：**${signal.signalText}**，综合评分 **${signal.score} 分**。` : ''}${analysis?.fundamental?.view ? analysis.fundamental.view.substring(0, 120) + '...' : ''}

---

## 📊 实时行情

| 指标 | 数值 | 指标 | 数值 |
|------|------|------|------|
| 最新价 | **¥${stock.price}** | 涨跌幅 | **${stock.changePercent}%** |
| 开盘价 | ¥${stock.open || '—'} | 昨收 | ¥${stock.prevClose || '—'} |
| 最高价 | ¥${stock.high || '—'} | 最低价 | ¥${stock.low || '—'} |
| 成交量 | ${(stock.volume||0).toLocaleString()} 股 | 成交额 | ${((stock.amount||0)/10000/10000).toFixed(2)} 亿 |

---

## 🧠 专家团队分析

### 📊 基本面分析师观点

${analysis?.fundamental?.view || '暂无详细基本面分析。建议运行 /deep-dive-analysis 获取完整深度报告。'}

> 关键指标：PE ${analysis?.fundamental?.pe || stock.pe || 'N/A'} | ROE ${analysis?.fundamental?.roe || 'N/A'}% | 营收增长 ${analysis?.fundamental?.revenueGrowth || 'N/A'}%

### 📈 技术分析师观点

${analysis?.technical?.view || '暂无技术分析数据。'}

> 技术指标：RSI(14)=${analysis?.technical?.rsi14 || 'N/A'} | MACD ${analysis?.technical?.macdSignal || 'N/A'} | 趋势 ${analysis?.technical?.overallSignal || 'N/A'}

### 🛡️ 风险管理师观点

${Array.isArray(analysis?.risks) ? analysis.risks.map(r => '- ' + r).join('\n') : (analysis?.risks || '- 暂无详细风险评估')}

---

## 🎯 综合评估

| 维度 | 评级 | 信号强度 |
|------|------|----------|
| 基本面 | ${analysis?.fundamental?.overallSignal || 'neutral'} | ${((analysis?.fundamental?.signalStrength || 0.5) * 100).toFixed(0)}% |
| 技术面 | ${analysis?.technical?.overallSignal || 'neutral'} | ${((analysis?.technical?.signalStrength || 0.5) * 100).toFixed(0)}% |
| 风险面 | ${analysis?.insider?.overallSignal || 'neutral'} | ${((analysis?.insider?.signalStrength || 0.5) * 100).toFixed(0)}% |
| **综合建议** | **${analysis?.recommendation?.signal || 'N/A'}** | **置信度 ${((analysis?.recommendation?.confidence || 0) * 100).toFixed(0)}%** |

${signal ? `
### ⚡ 当日实时信号

| 信号 | 评分 | 说明 |
|------|------|------|
| **${signal.signalText}** | ${signal.score} 分 | 基于盘中实时数据计算 |
| 相对昨收 | ${signal.details.priceVsClose} | — |
| 日内振幅 | ${signal.details.dayAmplitude} | — |
| 量能 | ${signal.details.volumeLevel} | — |
` : ''}

---

> ⚠️ **免责声明**：本报告由 AI 辅助生成，数据来自新浪财经实时行情及公开信息。所有分析和信号仅供研究参考，**不构成任何投资建议**。投资有风险，决策需谨慎。
`;

  // 保存报告
  fs.writeFileSync(path.join(REPORTS_DIR, filename), report, 'utf8');
  console.log('[Reports] Generated:', filename);

  res.json({
    status: 'generated',
    filename,
    ticker,
    name: stock.name,
    report: report.substring(0, 500) + '\n...',
    path: `/reports/${encodeURIComponent(filename)}`
  });
});

// -- Main Route ---------------------------------------------------------------

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// 404 handler
app.use((req, res) => {
  if (req.accepts('html')) {
    res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found', path: req.url });
  }
});

// Error handler
app.use((err, req, res, _next) => {
  console.error(`[ERROR] Unhandled: ${err.stack || err.message}`);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// -- Build: Static HTML with embedded data -----------------------------------

function buildStaticHTML() {
  console.log('[BUILD] Generating static dashboard HTML with embedded data...');

  // Load all data
  const marketFile = path.join(DATA_DIR, 'market.json');
  const watchlistFile = path.join(DATA_DIR, 'watchlist.json');
  const analysisFile = path.join(DATA_DIR, 'analysis.json');
  const configFile = path.join(CONFIG_DIR, 'dashboard.json');

  const marketData = loadJSON(marketFile) || { indices: {}, sectors: [], trending: [] };
  const watchlistData = loadJSON(watchlistFile);
  const analysisData = loadJSON(analysisFile);
  const dashboardConfig = loadJSON(configFile) || {};

  const reports = scanReports();
  const marketStatus = getMarketStatus();
  const enrichedWatchlist = mergeWatchlistWithAnalysis(watchlistData, analysisData);
  const formattedAnalysis = formatAnalysisForFrontend(analysisData);

  // Read the HTML template
  const htmlPath = path.join(PUBLIC_DIR, 'index.html');
  const htmlTemplate = fs.readFileSync(htmlPath, 'utf8');

  // Inject embedded data before the closing </body> tag
  const embeddedScript = `
<script>
  // Embedded data for static build (generated ${new Date().toISOString()})
  window.__EMBEDDED_DATA__ = {
    market: ${JSON.stringify({ ...marketData, marketStatus })},
    watchlist: ${JSON.stringify(enrichedWatchlist)},
    analysis: ${JSON.stringify(formattedAnalysis)},
    reports: ${JSON.stringify({ reports, timestamp: new Date().toISOString() })},
    config: ${JSON.stringify({
      title: dashboardConfig.ui?.title || 'Stock Analysis Dashboard',
      refreshIntervalMs: dashboardConfig.ui?.refreshIntervalMs || 300000,
      theme: dashboardConfig.ui?.theme || 'dark',
    })},
    buildTimestamp: "${new Date().toISOString()}"
  };
</script>
`;

  const builtHTML = htmlTemplate.replace('</body>', embeddedScript + '\n</body>');

  const outputPath = path.join(PUBLIC_DIR, 'index.static.html');
  fs.writeFileSync(outputPath, builtHTML, 'utf8');

  console.log(`[BUILD] Static HTML written to ${outputPath}`);
  console.log(`[BUILD]   Market: ${Object.keys(marketData.indices || {}).length} indices`);
  console.log(`[BUILD]   Watchlist: ${enrichedWatchlist.stocks?.length || 0} stocks`);
  console.log(`[BUILD]   Analysis: ${formattedAnalysis.recommendations?.length || 0} analyses`);
  console.log(`[BUILD]   Reports: ${reports.length} reports`);
}

// CLI: --build flag
if (process.argv.includes('--build')) {
  buildStaticHTML();
  process.exit(0);
}

// -- Start --------------------------------------------------------------------

app.listen(PORT, HOST, () => {
  const os = require('os');
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal);
  const localIP = ips[0]?.address || '0.0.0.0';

  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║     📊 股票分析仪表盘 v2.0 — A股专用                 ║');
  console.log('  ║                                                      ║');
  console.log(`  ║  💻 电脑访问: http://localhost:${PORT}                   ║`);
  console.log(`  ║  📱 手机访问: http://${localIP}:${PORT}              ║`);
  console.log('  ║     (手机和电脑需在同一WiFi)                         ║');
  console.log('  ║                                                      ║');
  console.log('  ║  按 Ctrl+C 停止                                      ║');
  console.log('  ╚══════════════════════════════════════════════════════╝');
  console.log('');
});
