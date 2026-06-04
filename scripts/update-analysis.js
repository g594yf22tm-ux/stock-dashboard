/**
 * update-analysis.js
 * ===================
 * Runs analysis on all watchlist stocks and generates expert recommendation
 * text. Produces two cache files:
 *
 *   dashboard/data/analysis.json — per-stock technical, fundamental, insider
 *                                   analysis + recommendation text
 *   dashboard/data/reports.json   — index of recent analysis reports under
 *                                   the reports/ directory
 *
 * Usage:
 *   node scripts/update-analysis.js                       # analyze all watchlist stocks
 *   node scripts/update-analysis.js --ticker AAPL         # analyze a single stock
 *   node scripts/update-analysis.js --dry-run             # compute only, no file writes
 *   node scripts/update-analysis.js --reports-only        # only scan reports/ directory
 *
 * Exit codes:
 *   0 — success
 *   1 — partial failure (some stocks could not be analyzed)
 *   2 — complete failure (no analysis produced)
 *
 * Dependencies:
 *   yahoo-finance2  — historical prices for technical indicators
 *   (optional) cheerio — OpenInsider HTML scraping (falls back gracefully)
 *
 * The FMP_API_KEY env var enables fundamental data enrichment.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'dashboard', 'data');
const CONFIG_DIR = path.join(ROOT_DIR, 'dashboard', 'config');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');
const WATCHLIST_CONFIG_PATH = path.join(CONFIG_DIR, 'watchlist.json');
const DASHBOARD_CONFIG_PATH = path.join(CONFIG_DIR, 'dashboard.json');
const DOTENV_PATH = path.join(ROOT_DIR, 'dashboard', '.env');
const ANALYSIS_CACHE_PATH = path.join(DATA_DIR, 'analysis.json');
const REPORTS_CACHE_PATH = path.join(DATA_DIR, 'reports.json');

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info;

const logger = {
  debug: (...args) => LOG_LEVEL <= 0 && console.error('[DEBUG]', ...args),
  info:  (...args) => LOG_LEVEL <= 1 && console.error('[INFO] ', ...args),
  warn:  (...args) => LOG_LEVEL <= 2 && console.error('[WARN] ', ...args),
  error: (...args) => LOG_LEVEL <= 3 && console.error('[ERROR]', ...args),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    logger.warn(`Failed to load ${path.basename(filePath)}: ${err.message}`);
    return null;
  }
}

function loadDotEnv(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch (_) { /* optional */ }
}

function atomicWriteJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpPath = filePath + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
  logger.debug(`Wrote ${path.basename(filePath)}`);
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label || 'operation'} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function parallelWithLimit(tasks, limit) {
  const results = new Array(tasks.length);
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      try {
        results[i] = { status: 'fulfilled', value: await tasks[i]() };
      } catch (err) {
        results[i] = { status: 'rejected', reason: err };
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Lazy-loaded dependencies
// ---------------------------------------------------------------------------

let _yahooFinance = null;
function getYahooFinance() {
  if (_yahooFinance) return _yahooFinance;
  try {
    _yahooFinance = require('yahoo-finance2').default;
    logger.debug('yahoo-finance2 loaded');
  } catch (err) {
    logger.error('yahoo-finance2 is not installed. Run: npm install yahoo-finance2');
    process.exit(2);
  }
  return _yahooFinance;
}

// ---------------------------------------------------------------------------
// Technical Indicator Calculations
// ---------------------------------------------------------------------------

/**
 * Compute RSI (Relative Strength Index) for an array of closing prices.
 * Uses the Wilder smoothing method.
 *
 * @param {number[]} closes — array of closing prices, oldest first
 * @param {number} period — RSI period (typically 14)
 * @returns {number|null} RSI value (0-100)
 */
function computeRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;

  const deltas = [];
  for (let i = 1; i < closes.length; i++) {
    deltas.push(closes[i] - closes[i - 1]);
  }

  // Take the most recent `period` deltas
  const recent = deltas.slice(-period);
  let avgGain = 0;
  let avgLoss = 0;

  for (const d of recent) {
    if (d > 0) avgGain += d;
    else avgLoss += Math.abs(d);
  }
  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Compute MACD (Moving Average Convergence Divergence).
 *
 * @param {number[]} closes — array of closing prices, oldest first
 * @param {number} fast — fast EMA period (typically 12)
 * @param {number} slow — slow EMA period (typically 26)
 * @param {number} signal — signal line period (typically 9)
 * @returns {{ macdLine: number|null, signalLine: number|null, histogram: number|null, signal: string }}
 */
function computeMACD(closes, fast = 12, slow = 26, signal = 9) {
  if (!closes || closes.length < slow + signal) {
    return { macdLine: null, signalLine: null, histogram: null, signal: 'insufficient_data' };
  }

  // EMA helper
  function ema(data, period) {
    const k = 2 / (period + 1);
    let emaVal = data.slice(0, period).reduce((a, b) => a + b, 0) / period; // SMA seed
    for (let i = period; i < data.length; i++) {
      emaVal = data[i] * k + emaVal * (1 - k);
    }
    return emaVal;
  }

  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = emaFast - emaSlow;

  // Compute signal line (EMA of MACD line values over the last `signal` periods)
  // We need MACD values for the last `signal` data points to compute the signal EMA.
  // Simplified: compute MACD for the last N points and take their EMA.
  const macdHistory = [];
  for (let i = slow; i <= closes.length; i++) {
    const slice = closes.slice(0, i);
    const ef = ema(slice, fast);
    const es = ema(slice, slow);
    macdHistory.push(ef - es);
  }

  // EMA of the last `signal` MACD values
  let signalLine = null;
  if (macdHistory.length >= signal) {
    const kSig = 2 / (signal + 1);
    let seed = macdHistory.slice(0, signal).reduce((a, b) => a + b, 0) / signal;
    for (let i = signal; i < macdHistory.length; i++) {
      seed = macdHistory[i] * kSig + seed * (1 - kSig);
    }
    signalLine = seed;
  }

  const histogram = (macdLine != null && signalLine != null) ? macdLine - signalLine : null;

  // Determine signal
  let sigLabel = 'neutral';
  if (histogram !== null) {
    if (histogram > 0 && macdHistory.length >= 2) {
      // Check if histogram is rising (comparing last two MACD values)
      const prevHist = macdHistory[macdHistory.length - 2] - (signalLine - (histogram - (macdHistory[macdHistory.length - 1] - signalLine)));
      sigLabel = histogram > 0 ? 'bullish' : 'bearish';
    } else if (histogram < 0) {
      sigLabel = 'bearish';
    }
  }

  return {
    macdLine: parseFloat(macdLine.toFixed(4)),
    signalLine: signalLine != null ? parseFloat(signalLine.toFixed(4)) : null,
    histogram: histogram != null ? parseFloat(histogram.toFixed(4)) : null,
    signal: sigLabel,
  };
}

/**
 * Compute Simple Moving Average.
 *
 * @param {number[]} data — array of prices, oldest first
 * @param {number} period — window size
 * @returns {number|null}
 */
function computeSMA(data, period) {
  if (!data || data.length < period) return null;
  const slice = data.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return parseFloat((sum / period).toFixed(2));
}

/**
 * Compute Bollinger Bands.
 *
 * @param {number[]} closes — array of closing prices, oldest first
 * @param {number} period — typically 20
 * @param {number} stdDev — typically 2
 * @returns {{ middle: number|null, upper: number|null, lower: number|null, width: number|null }}
 */
function computeBollingerBands(closes, period = 20, stdDev = 2) {
  if (!closes || closes.length < period) {
    return { middle: null, upper: null, lower: null, width: null };
  }

  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((acc, v) => acc + (v - middle) ** 2, 0) / period;
  const std = Math.sqrt(variance);

  return {
    middle: parseFloat(middle.toFixed(2)),
    upper: parseFloat((middle + stdDev * std).toFixed(2)),
    lower: parseFloat((middle - stdDev * std).toFixed(2)),
    width: parseFloat(((2 * stdDev * std / middle) * 100).toFixed(2)), // bandwidth %
  };
}

/**
 * Compute all technical indicators for a ticker given its historical prices.
 */
function computeTechnicalIndicators(closes, config = {}) {
  const rsiPeriod = config.rsiPeriod || 14;
  const macdFast = config.macdFast || 12;
  const macdSlow = config.macdSlow || 26;
  const macdSig = config.macdSignal || 9;
  const smaPeriods = config.smaPeriods || [20, 50, 200];
  const bbPeriod = config.bollingerPeriod || 20;
  const bbStd = config.bollingerStdDev || 2;

  const rsi14 = computeRSI(closes, rsiPeriod);
  const macd = computeMACD(closes, macdFast, macdSlow, macdSig);
  const bollinger = computeBollingerBands(closes, bbPeriod, bbStd);

  const smas = {};
  for (const p of smaPeriods) {
    smas[`sma${p}`] = computeSMA(closes, p);
  }

  // Current price is the last close
  const price = closes[closes.length - 1];

  // Overall technical signal assessment
  let overallSignal = 'neutral';
  let signalStrength = 0.5;
  let signals = 0;
  let totalSignals = 0;

  // RSI signal
  totalSignals++;
  if (rsi14 !== null) {
    if (rsi14 > 70) { /* overbought — bearish */ signals += 0; }
    else if (rsi14 < 30) { /* oversold — bullish */ signals += 1; }
    else { signals += 0.5; }
  }

  // MACD signal
  totalSignals++;
  if (macd.signal === 'bullish') signals += 1;
  else if (macd.signal === 'bearish') signals += 0;
  else signals += 0.5;

  // Price vs SMA50
  totalSignals++;
  if (smas.sma50 !== null && price != null) {
    if (price > smas.sma50 * 1.02) signals += 1;
    else if (price < smas.sma50 * 0.98) signals += 0;
    else signals += 0.5;
  }

  // Price vs SMA200 (golden cross / death cross context)
  totalSignals++;
  if (smas.sma200 !== null && price != null) {
    if (price > smas.sma200) signals += 0.75;
    else signals += 0.25;
  }

  // SMA alignment (SMA20 > SMA50 > SMA200 = uptrend)
  totalSignals++;
  if (smas.sma20 !== null && smas.sma50 !== null && smas.sma200 !== null) {
    if (smas.sma20 > smas.sma50 && smas.sma50 > smas.sma200) signals += 1;
    else if (smas.sma20 < smas.sma50 && smas.sma50 < smas.sma200) signals += 0;
    else signals += 0.5;
  }

  signalStrength = signals / Math.max(totalSignals, 1);

  if (signalStrength >= 0.65) overallSignal = 'bullish';
  else if (signalStrength <= 0.35) overallSignal = 'bearish';
  else overallSignal = 'neutral';

  return {
    rsi14: rsi14 != null ? parseFloat(rsi14.toFixed(1)) : null,
    rsiSignal: rsi14 != null ? (rsi14 > 70 ? 'overbought' : rsi14 < 30 ? 'oversold' : 'neutral') : null,
    macdLine: macd.macdLine,
    macdSignalLine: macd.signalLine,
    macdHistogram: macd.histogram,
    macdSignal: macd.signal,
    ...smas,
    priceVsSma50: smas.sma50 != null && price != null ? parseFloat((((price - smas.sma50) / smas.sma50) * 100).toFixed(1)) : null,
    priceVsSma200: smas.sma200 != null && price != null ? parseFloat((((price - smas.sma200) / smas.sma200) * 100).toFixed(1)) : null,
    bollingerUpper: bollinger.upper,
    bollingerMiddle: bollinger.middle,
    bollingerLower: bollinger.lower,
    bollingerBandwidth: bollinger.width,
    overallSignal,
    signalStrength: parseFloat(signalStrength.toFixed(2)),
  };
}

// ---------------------------------------------------------------------------
// Data Fetchers
// ---------------------------------------------------------------------------

/**
 * Fetch 1 year of daily historical data for a ticker, enough for all
 * technical indicators (SMA200 needs at least 200 trading days).
 */
async function fetchHistorical(ticker, timeoutMs) {
  const yahooFinance = getYahooFinance();
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setFullYear(startDate.getFullYear() - 1);
  // Add buffer for weekends/holidays
  startDate.setMonth(startDate.getMonth() - 1);

  const history = await withTimeout(
    yahooFinance.historical(ticker, {
      period1: startDate.toISOString().slice(0, 10),
      period2: endDate.toISOString().slice(0, 10),
      interval: '1d',
    }),
    timeoutMs,
    `${ticker} historical`
  );

  if (!Array.isArray(history) || history.length === 0) {
    throw new Error(`No historical data returned for ${ticker}`);
  }

  return history;
}

/**
 * Fetch fundamental metrics from FMP API.
 */
async function fetchFMPFundamentals(ticker, timeoutMs) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return null;

  try {
    // Fetch key metrics (TTM data)
    const metricsUrl = `https://financialmodelingprep.com/api/v3/key-metrics-ttm/${ticker}?apikey=${apiKey}`;
    const metricsResp = await withTimeout(fetch(metricsUrl), timeoutMs, `FMP metrics ${ticker}`);

    if (!metricsResp.ok) {
      logger.debug(`FMP metrics HTTP ${metricsResp.status} for ${ticker}`);
      return null;
    }

    const metricsData = await metricsResp.json();
    const metrics = Array.isArray(metricsData) ? metricsData[0] : metricsData;

    // Fetch financial ratios
    const ratiosUrl = `https://financialmodelingprep.com/api/v3/ratios-ttm/${ticker}?apikey=${apiKey}`;
    const ratiosResp = await withTimeout(fetch(ratiosUrl), timeoutMs, `FMP ratios ${ticker}`);

    let ratios = null;
    if (ratiosResp.ok) {
      const ratiosData = await ratiosResp.json();
      ratios = Array.isArray(ratiosData) ? ratiosData[0] : ratiosData;
    }

    // Fetch growth metrics
    const growthUrl = `https://financialmodelingprep.com/api/v3/financial-growth/${ticker}?period=annual&apikey=${apiKey}`;
    const growthResp = await withTimeout(fetch(growthUrl), timeoutMs, `FMP growth ${ticker}`);
    let growth = null;
    if (growthResp.ok) {
      const growthData = await growthResp.json();
      growth = Array.isArray(growthData) ? growthData[0] : growthData;
    }

    return { metrics, ratios, growth };
  } catch (err) {
    logger.debug(`FMP fetch failed for ${ticker}: ${err.message}`);
    return null;
  }
}

/**
 * Fetch insider trading data from OpenInsider (via HTML scraping).
 * Uses cheerio if available; falls back to returning a neutral signal.
 */
async function fetchInsiderData(ticker, lookbackMonths, timeoutMs) {
  // Try to use cheerio for HTML scraping of openinsider.com
  let cheerio;
  try { cheerio = require('cheerio'); } catch (_) { /* optional */ }

  if (!cheerio) {
    logger.debug(`cheerio not installed — insider data unavailable for ${ticker}`);
    return {
      recentBuys: null,
      recentSells: null,
      netSharesBought: null,
      clusterBuying: null,
      overallSignal: 'insufficient_data',
      signalStrength: 0.5,
      _source: 'none',
    };
  }

  try {
    // openinsider.com screener URL for a specific ticker
    const url = `http://openinsider.com/screener?s=${encodeURIComponent(ticker)}&o=&pl=&ph=&ll=&lh=&fd=-1&fdr=&td=0&tdr=&fdlyl=&fdlyh=&daysago=&xp=1&xs=1&vl=&vh=&ocl=&och=&sic1=-1&sicl=100&sich=9999&grp=0&nfl=&nfh=&nil=&nih=&nol=&noh=&v2l=&v2h=&oc2l=&oc2h=&sortcol=0&cnt=100&page=1`;

    const resp = await withTimeout(fetch(url), timeoutMs, `OpenInsider ${ticker}`);
    if (!resp.ok) {
      logger.debug(`OpenInsider HTTP ${resp.status} for ${ticker}`);
      return { recentBuys: null, recentSells: null, netSharesBought: null, clusterBuying: null, overallSignal: 'insufficient_data', signalStrength: 0.5, _source: 'error' };
    }

    const html = await resp.text();
    const $ = cheerio.load(html);

    // Parse the trades table
    let recentBuys = 0;
    let recentSells = 0;
    let netShares = 0;

    $('table.tinytable tbody tr').each((i, row) => {
      if (i === 0) return; // Skip header
      const cols = $(row).find('td');
      if (cols.length < 12) return;

      const transactionDate = $(cols[1]).text().trim();
      const tradeType = $(cols[5]).text().trim();
      const sharesText = $(cols[10]).text().trim();

      // Check if within lookback window
      const dateMatch = transactionDate.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (!dateMatch) return;

      const tradeDate = new Date(dateMatch[0]);
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - (lookbackMonths || 6));

      if (tradeDate < cutoff) return;

      const shares = parseInt(sharesText.replace(/[^0-9-]/g, ''), 10) || 0;

      if (tradeType === 'P' || tradeType === 'Purchase') {
        recentBuys++;
        netShares += Math.abs(shares);
      } else if (tradeType === 'S' || tradeType === 'Sale') {
        recentSells++;
        netShares -= Math.abs(shares);
      }
    });

    // Determine signal
    let overallSignal = 'neutral';
    let signalStrength = 0.5;
    const totalTrades = recentBuys + recentSells;

    if (totalTrades > 0) {
      const buyRatio = recentBuys / totalTrades;
      if (buyRatio >= 0.7 && recentBuys >= 2) {
        overallSignal = 'bullish';
        signalStrength = Math.min(0.8, 0.5 + buyRatio * 0.4);
      } else if (buyRatio <= 0.3 && recentSells >= 2) {
        overallSignal = 'bearish';
        signalStrength = Math.max(0.2, 0.5 - (1 - buyRatio) * 0.4);
      }
    }

    return {
      recentBuys,
      recentSells,
      netSharesBought: netShares,
      clusterBuying: recentBuys >= 3,
      overallSignal,
      signalStrength: parseFloat(signalStrength.toFixed(2)),
      _source: 'openinsider.com',
    };
  } catch (err) {
    logger.debug(`Insider fetch failed for ${ticker}: ${err.message}`);
    return {
      recentBuys: null, recentSells: null, netSharesBought: null,
      clusterBuying: null, overallSignal: 'insufficient_data',
      signalStrength: 0.5, _source: 'error',
    };
  }
}

// ---------------------------------------------------------------------------
// Recommendation Generator
// ---------------------------------------------------------------------------

/**
 * Generate a natural-language expert recommendation based on all signals.
 */
function generateRecommendation(ticker, name, technical, fundamental, insider) {
  const parts = [];
  const risks = [];

  // --- Company intro ---
  parts.push(`${name} (${ticker})`);

  // --- Technical assessment ---
  if (technical.overallSignal === 'bullish') {
    parts.push('shows bullish technical momentum');
    if (technical.priceVsSma50 !== null) {
      parts.push(`trading ${Math.abs(technical.priceVsSma50)}% ${technical.priceVsSma50 > 0 ? 'above' : 'below'} its 50-day moving average`);
    }
    if (technical.rsi14 !== null) {
      const rsiDesc = technical.rsi14 > 70 ? 'overbought' : technical.rsi14 < 30 ? 'oversold' : 'at neutral RSI levels';
      parts.push(`with RSI of ${technical.rsi14} (${rsiDesc})`);
    }
  } else if (technical.overallSignal === 'bearish') {
    parts.push('exhibits bearish technical pressure');
    if (technical.priceVsSma50 !== null) {
      parts.push(`${Math.abs(technical.priceVsSma50)}% ${technical.priceVsSma50 > 0 ? 'above' : 'below'} the 50-day MA`);
    }
  } else {
    parts.push('is in a neutral technical posture');
  }

  // --- Fundamental assessment ---
  if (fundamental && fundamental.overallSignal !== 'insufficient_data') {
    if (fundamental.overallSignal === 'strong') {
      parts.push('Fundamentals are robust');
      if (fundamental.roe !== null) {
        parts.push(`with ROE of ${fundamental.roe}%`);
        if (fundamental.roe > 20) risks.push(`High ROE of ${fundamental.roe}% may not be sustainable long-term`);
      }
    } else if (fundamental.overallSignal === 'weak') {
      parts.push('Fundamentals show areas of concern');
      if (fundamental.revenueGrowth !== null && fundamental.revenueGrowth < 0) {
        risks.push(`Revenue declining at ${fundamental.revenueGrowth}% YoY`);
      }
    }

    if (fundamental.pe !== null) {
      const peDesc = fundamental.pe > 30 ? 'elevated' : fundamental.pe < 15 ? 'modest' : 'moderate';
      parts.push(`P/E ratio is ${peDesc} at ${fundamental.pe}x`);
      if (fundamental.pe > 30) risks.push(`Elevated P/E ratio of ${fundamental.pe}x may limit multiple expansion`);
    }
    if (fundamental.revenueGrowth !== null) {
      parts.push(`revenue growth of ${fundamental.revenueGrowth}%`);
    }
    if (fundamental.debtToEquity !== null && fundamental.debtToEquity > 2) {
      risks.push(`High debt-to-equity ratio of ${fundamental.debtToEquity}`);
    }
    if (fundamental.fcfYield !== null && fundamental.fcfYield > 5) {
      parts.push(`strong FCF yield of ${fundamental.fcfYield}%`);
    }
  } else {
    parts.push('Fundamental data is unavailable');
  }

  // --- Insider assessment ---
  if (insider && insider.overallSignal !== 'insufficient_data') {
    if (insider.overallSignal === 'bullish') {
      parts.push('Recent insider buying activity is a positive signal');
    } else if (insider.overallSignal === 'bearish') {
      parts.push('Recent insider selling deserves attention');
      risks.push(`Insider selling detected (${insider.recentSells} sales in recent months)`);
    }
  }

  // --- Overall ---
  let recommendation = parts.join('. ') + '.';

  // Build risk list
  if (risks.length === 0) {
    risks.push('Market-wide systemic risk applies to all equities');
  }

  return { recommendation, risks };
}

/**
 * Evaluate fundamental health from FMP data.
 */
function evaluateFundamentals(fmpData) {
  if (!fmpData || (!fmpData.metrics && !fmpData.ratios)) {
    return {
      pe: null, forwardPE: null, peg: null, pb: null,
      roe: null, roa: null, debtToEquity: null, currentRatio: null,
      revenueGrowth: null, earningsGrowth: null, fcfYield: null,
      dividendYield: null, profitMargin: null,
      overallSignal: 'insufficient_data',
      signalStrength: 0.5,
      _source: 'none',
    };
  }

  const m = fmpData.metrics || {};
  const r = fmpData.ratios || {};
  const g = fmpData.growth || {};

  const pe = r.peRatioTTM ?? m.peRatioTTM ?? null;
  const forwardPE = r.priceEarningsToGrowthRatioTTM ?? null;
  const roe = r.returnOnEquityTTM ?? m.roeTTM ?? null;
  const roa = r.returnOnAssetsTTM ?? m.roaTTM ?? null;
  const debtToEquity = r.debtToEquityTTM ?? m.debtToEquityTTM ?? null;
  const revenueGrowth = g?.revenueGrowth ? parseFloat(g.revenueGrowth) : null;
  const earningsGrowth = g?.netIncomeGrowth ? parseFloat(g.netIncomeGrowth) : null;
  const fcfYield = r.freeCashFlowYieldTTM ?? m.freeCashFlowYieldTTM ?? null;
  const dividendYield = r.dividendYieldPercentageTTM ?? m.dividendYieldPercentageTTM ?? null;
  const profitMargin = r.netProfitMarginTTM ?? m.netProfitMarginTTM ?? null;
  const pb = r.priceToBookRatioTTM ?? m.pbRatioTTM ?? null;
  const peg = r.pegRatioTTM ?? null;
  const currentRatio = r.currentRatioTTM ?? m.currentRatioTTM ?? null;

  // Composite fundamental score
  let signals = 0;
  let total = 0;

  // ROE check
  total++;
  if (roe !== null) {
    if (roe > 20) signals += 1;
    else if (roe > 10) signals += 0.7;
    else if (roe > 0) signals += 0.3;
    else signals += 0;
  }

  // Revenue growth
  total++;
  if (revenueGrowth !== null) {
    if (revenueGrowth > 15) signals += 1;
    else if (revenueGrowth > 5) signals += 0.7;
    else if (revenueGrowth > 0) signals += 0.4;
    else signals += 0;
  }

  // Debt level
  total++;
  if (debtToEquity !== null) {
    if (debtToEquity < 0.5) signals += 1;
    else if (debtToEquity < 1.5) signals += 0.7;
    else if (debtToEquity < 3) signals += 0.3;
    else signals += 0;
  }

  // FCF yield
  total++;
  if (fcfYield !== null) {
    if (fcfYield > 5) signals += 1;
    else if (fcfYield > 2) signals += 0.7;
    else if (fcfYield > 0) signals += 0.3;
    else signals += 0;
  }

  // Profit margin
  total++;
  if (profitMargin !== null) {
    if (profitMargin > 20) signals += 1;
    else if (profitMargin > 10) signals += 0.7;
    else if (profitMargin > 0) signals += 0.4;
    else signals += 0;
  }

  const signalStrength = total > 0 ? signals / total : 0.5;
  let overallSignal = 'neutral';
  if (signalStrength >= 0.7) overallSignal = 'strong';
  else if (signalStrength <= 0.35) overallSignal = 'weak';

  return {
    pe: pe != null ? parseFloat(pe.toFixed(2)) : null,
    forwardPE: forwardPE != null ? parseFloat(forwardPE.toFixed(2)) : null,
    peg: peg != null ? parseFloat(peg.toFixed(2)) : null,
    pb: pb != null ? parseFloat(pb.toFixed(2)) : null,
    roe: roe != null ? parseFloat(roe.toFixed(2)) : null,
    roa: roa != null ? parseFloat(roa.toFixed(2)) : null,
    debtToEquity: debtToEquity != null ? parseFloat(debtToEquity.toFixed(2)) : null,
    currentRatio: currentRatio != null ? parseFloat(currentRatio.toFixed(2)) : null,
    revenueGrowth: revenueGrowth != null ? parseFloat(revenueGrowth.toFixed(1)) : null,
    earningsGrowth: earningsGrowth != null ? parseFloat(earningsGrowth.toFixed(1)) : null,
    fcfYield: fcfYield != null ? parseFloat(fcfYield.toFixed(2)) : null,
    dividendYield: dividendYield != null ? parseFloat(dividendYield.toFixed(2)) : null,
    profitMargin: profitMargin != null ? parseFloat(profitMargin.toFixed(1)) : null,
    overallSignal,
    signalStrength: parseFloat(signalStrength.toFixed(2)),
    _source: 'fmp',
  };
}

// ---------------------------------------------------------------------------
// Report Scanner
// ---------------------------------------------------------------------------

/**
 * Scan the reports/ directory for recent analysis reports.
 * Parses filenames of the form: TICKER_type_YYYY-MM-DD.md
 * Extracts the first heading-level summary from each report.
 *
 * @returns {Array} Array of { ticker, type, date, file, excerpt }
 */
function scanReports() {
  const reports = [];

  if (!fs.existsSync(REPORTS_DIR)) {
    logger.warn(`Reports directory not found: ${REPORTS_DIR}`);
    return reports;
  }

  const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md'));

  // Regex: TICKER_type_YYYY-MM-DD.md
  // TICKER can contain letters, numbers, dots, hyphens
  const filenameRe = /^([A-Za-z0-9.^-]+)_(.+)_(\d{4}-\d{2}-\d{2})\.md$/;

  for (const file of files) {
    const match = file.match(filenameRe);
    if (!match) continue;

    const ticker = match[1];
    const type = match[2];
    const date = match[3];
    const filePath = path.join(REPORTS_DIR, file);

    // Extract first ## Summary or ## 摘要 section
    let excerpt = '';
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      // Look for a summary heading
      const summaryRe = /^##\s*(?:Summary|摘要|Executive Summary|核心结论|综合结论)\s*$/im;
      const lines = content.split(/\r?\n/);
      let inSummary = false;
      const excerptLines = [];

      for (const line of lines) {
        if (summaryRe.test(line)) {
          inSummary = true;
          continue;
        }
        if (inSummary) {
          if (/^##\s/.test(line)) break; // next heading — stop
          if (line.trim().length > 0) excerptLines.push(line.trim());
        }
      }

      excerpt = excerptLines.join(' ').slice(0, 300);
      if (excerpt.length >= 300) excerpt += '...';
    } catch (err) {
      logger.debug(`Could not read report ${file}: ${err.message}`);
    }

    reports.push({
      ticker,
      type,
      date,
      file: `reports/${file}`,
      excerpt,
    });
  }

  // Sort by date descending
  reports.sort((a, b) => b.date.localeCompare(a.date));

  logger.info(`Found ${reports.length} reports in reports/`);
  return reports;
}

// ---------------------------------------------------------------------------
// Single Stock Analysis
// ---------------------------------------------------------------------------

/**
 * Run full analysis on a single stock. Returns the analysis object.
 */
async function analyzeOne(stock, config, timeoutMs) {
  const ticker = stock.ticker;
  const name = stock.name || ticker;
  logger.info(`Analyzing ${ticker} (${name})`);

  const analysisConfig = config.analysis || {};

  // 1. Fetch historical data for technical analysis
  let technical = {
    rsi14: null, rsiSignal: null, macdLine: null, macdSignalLine: null,
    macdHistogram: null, macdSignal: 'insufficient_data',
    sma20: null, sma50: null, sma200: null,
    priceVsSma50: null, priceVsSma200: null,
    bollingerUpper: null, bollingerMiddle: null, bollingerLower: null,
    bollingerBandwidth: null,
    overallSignal: 'insufficient_data', signalStrength: 0.5,
  };

  try {
    const history = await fetchHistorical(ticker, timeoutMs);
    const closes = history.map(h => h.close).filter(c => c != null);

    if (closes.length >= 20) {
      technical = computeTechnicalIndicators(closes, analysisConfig.technical || {});
    } else {
      logger.warn(`${ticker}: insufficient history (${closes.length} closes), need >= 20`);
    }
  } catch (err) {
    logger.warn(`${ticker}: historical fetch failed — ${err.message}`);
    technical.overallSignal = 'insufficient_data';
  }

  // 2. Fetch fundamental data from FMP
  let fundamental;
  try {
    const fmpData = await fetchFMPFundamentals(ticker, timeoutMs);
    fundamental = evaluateFundamentals(fmpData);
  } catch (err) {
    logger.warn(`${ticker}: fundamental fetch failed — ${err.message}`);
    fundamental = {
      pe: null, forwardPE: null, peg: null, pb: null,
      roe: null, roa: null, debtToEquity: null, currentRatio: null,
      revenueGrowth: null, earningsGrowth: null, fcfYield: null,
      dividendYield: null, profitMargin: null,
      overallSignal: 'insufficient_data', signalStrength: 0.5,
      _source: 'error',
    };
  }

  // 3. Fetch insider trading data
  let insider;
  try {
    insider = await fetchInsiderData(
      ticker,
      analysisConfig.insider?.lookbackMonths || 6,
      timeoutMs
    );
  } catch (err) {
    logger.warn(`${ticker}: insider fetch failed — ${err.message}`);
    insider = {
      recentBuys: null, recentSells: null, netSharesBought: null,
      clusterBuying: null, overallSignal: 'insufficient_data',
      signalStrength: 0.5, _source: 'error',
    };
  }

  // 4. Generate recommendation
  const { recommendation, risks } = generateRecommendation(
    ticker, name, technical, fundamental, insider
  );

  return {
    ticker,
    name,
    technical,
    fundamental,
    insider,
    recommendation,
    risks,
    _timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const reportsOnly = args.includes('--reports-only');
  const tickerFlag = args.indexOf('--ticker');
  const singleTicker = tickerFlag !== -1 ? args[tickerFlag + 1] : null;

  loadDotEnv(DOTENV_PATH);

  const watchlistConfig = loadJSON(WATCHLIST_CONFIG_PATH);
  if (!watchlistConfig) {
    logger.error(`Watchlist config not found at ${WATCHLIST_CONFIG_PATH}`);
    process.exit(2);
  }

  const dashboardConfig = loadJSON(DASHBOARD_CONFIG_PATH) || {};
  const fetcherConfig = dashboardConfig.fetchers || {};
  const concurrency = fetcherConfig.concurrency || 5;
  const timeoutMs = fetcherConfig.timeoutMs || 15000;

  // ===== Reports Scan =====
  logger.info('='.repeat(60));
  logger.info('PHASE: Report Scanning');
  logger.info('='.repeat(60));

  const reports = scanReports();

  if (!dryRun) {
    atomicWriteJSON(REPORTS_CACHE_PATH, {
      timestamp: new Date().toISOString(),
      reports,
    });
  } else {
    logger.info(`[DRY-RUN] Would save ${reports.length} report entries`);
  }

  if (reportsOnly) {
    logger.info(`Reports scan complete. ${reports.length} reports indexed.`);
    process.exit(0);
  }

  // ===== Stock Analysis =====
  logger.info('='.repeat(60));
  logger.info('PHASE: Stock Analysis');
  logger.info('='.repeat(60));

  const stocks = singleTicker
    ? watchlistConfig.stocks.filter(s => s.ticker.toUpperCase() === singleTicker.toUpperCase())
    : (watchlistConfig.stocks || []).filter(s => s.active !== false);

  if (stocks.length === 0) {
    logger.error(singleTicker
      ? `Ticker "${singleTicker}" not found in watchlist config`
      : 'No active stocks in watchlist'
    );
    process.exit(2);
  }

  logger.info(`Analyzing ${stocks.length} stocks`);

  const tasks = stocks.map(stock => () => analyzeOne(stock, watchlistConfig, timeoutMs));
  const results = await parallelWithLimit(tasks, concurrency);

  const analyses = results.map(r =>
    r.status === 'fulfilled' ? r.value : {
      ticker: 'UNKNOWN',
      name: 'Unknown',
      technical: { overallSignal: 'error', signalStrength: 0 },
      fundamental: { overallSignal: 'error', signalStrength: 0 },
      insider: { overallSignal: 'error', signalStrength: 0 },
      recommendation: `Analysis failed: ${r.reason?.message || 'unknown error'}`,
      risks: ['Analysis could not be completed'],
      _timestamp: new Date().toISOString(),
      _error: true,
    }
  );

  const failed = analyses.filter(a => a._error).length;
  let exitCode = 0;
  if (failed === analyses.length) exitCode = 2;
  else if (failed > 0) exitCode = 1;

  if (!dryRun) {
    atomicWriteJSON(ANALYSIS_CACHE_PATH, {
      timestamp: new Date().toISOString(),
      sources: ['yahoo-finance', 'fmp', 'openinsider'],
      analyses,
    });
    logger.info(`Analysis cache saved: ${analyses.length} stocks`);
  } else {
    logger.info(`[DRY-RUN] Would save analysis for ${analyses.length} stocks (${analyses.length - failed} OK, ${failed} failed)`);
  }

  // Print summary table
  logger.info('='.repeat(60));
  logger.info('ANALYSIS SUMMARY');
  logger.info('='.repeat(60));
  for (const a of analyses) {
    const tech = a.technical.overallSignal || '?';
    const fund = a.fundamental.overallSignal || '?';
    const insd = a.insider.overallSignal || '?';
    logger.info(`  ${a.ticker.padEnd(8)} | Tech: ${tech.padEnd(12)} | Fund: ${fund.padEnd(12)} | Insider: ${insd.padEnd(12)}`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info('='.repeat(60));
  logger.info(`Analysis complete in ${elapsed}s. Exit code: ${exitCode}`);
  logger.info('='.repeat(60));

  process.exit(exitCode);
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

main().catch(err => {
  logger.error(`Fatal: ${err.message}`);
  console.error(err.stack);
  process.exit(2);
});
