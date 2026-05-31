/**
 * fetch-market-data.js
 * =====================
 * Data fetcher for the stock dashboard. Gathers market indices, sector
 * performance, trending stocks, and watchlist quotes, then writes timestamped
 * JSON cache files to dashboard/data/.
 *
 * Usage:
 *   node scripts/fetch-market-data.js                     # full fetch
 *   node scripts/fetch-market-data.js --indices-only      # only indices + sectors
 *   node scripts/fetch-market-data.js --watchlist-only    # only watchlist quotes
 *   node scripts/fetch-market-data.js --dry-run           # log what would be fetched, no writes
 *
 * Exit codes:
 *   0 — success (all data fetched and cached)
 *   1 — partial failure (some tickers failed, stale cache served for those)
 *   2 — complete failure (no data fetched at all)
 *
 * Dependencies (npm):
 *   yahoo-finance2  — Yahoo Finance quotes, historical, sector data
 *
 * Optional dependencies (npm):
 *   yahoo-finance2 must be installed: npm install yahoo-finance2
 *
 * The FMP API key is read from process.env.FMP_API_KEY or dashboard/.env.
 * All output goes to dashboard/data/ as JSON.
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
const WATCHLIST_CONFIG_PATH = path.join(CONFIG_DIR, 'watchlist.json');
const DASHBOARD_CONFIG_PATH = path.join(CONFIG_DIR, 'dashboard.json');
const DOTENV_PATH = path.join(ROOT_DIR, 'dashboard', '.env');
const MARKET_CACHE_PATH = path.join(DATA_DIR, 'market.json');
const WATCHLIST_CACHE_PATH = path.join(DATA_DIR, 'watchlist.json');

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

/**
 * Attempt to load a JSON file; return null on any failure.
 */
function loadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    logger.warn(`Failed to load ${path.basename(filePath)}: ${err.message}`);
    return null;
  }
}

/**
 * Load environment variables from dashboard/.env (key=value, no quoting needed).
 * Does NOT override existing process.env values.
 */
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
    logger.debug('Loaded .env from', filePath);
  } catch (err) {
    // .env is optional, no warning needed
  }
}

/**
 * Atomic JSON write: write to a temp file then rename so readers never see a
 * partially-written file.
 */
function atomicWriteJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpPath = filePath + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
  logger.debug(`Wrote ${path.basename(filePath)} (${(JSON.stringify(data).length / 1024).toFixed(1)} KB)`);
}

/**
 * Load the most recent cache file; return { data, ageMs } or null.
 */
function loadCache(filePath, maxAgeMs) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;
    if (maxAgeMs && ageMs > maxAgeMs) {
      logger.debug(`Cache expired for ${path.basename(filePath)} (${(ageMs / 1000).toFixed(0)}s old, TTL ${(maxAgeMs / 1000).toFixed(0)}s)`);
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    logger.debug(`Loaded cache ${path.basename(filePath)} (${(ageMs / 1000).toFixed(0)}s old)`);
    return { data, ageMs };
  } catch (err) {
    logger.warn(`Cache read failed for ${path.basename(filePath)}: ${err.message}`);
    return null;
  }
}

/**
 * Wrap a promise with a timeout. Rejects if it takes longer than `ms`.
 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label || 'operation'} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Run async tasks with a concurrency cap. Returns an array of
 * { status: 'fulfilled', value } | { status: 'rejected', reason }.
 */
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

/**
 * Safe division returning 0 instead of NaN/Infinity.
 */
function safeDiv(a, b) {
  if (!b || b === 0) return 0;
  return a / b;
}

// ---------------------------------------------------------------------------
// Yahoo Finance client (lazy-loaded so script is importable without the dep)
// ---------------------------------------------------------------------------

let _yahooFinance = null;

function getYahooFinance() {
  if (_yahooFinance) return _yahooFinance;
  try {
    _yahooFinance = require('yahoo-finance2').default;
    // Suppress the verbose cookie/redirect warnings yahoo-finance2 emits
    if (_yahooFinance._Env) {
      _yahooFinance._Env.logger.level = 'error';
    }
    logger.debug('yahoo-finance2 loaded');
  } catch (err) {
    logger.error('yahoo-finance2 is not installed. Run: npm install yahoo-finance2');
    process.exit(2);
  }
  return _yahooFinance;
}

// ---------------------------------------------------------------------------
// Data Fetchers
// ---------------------------------------------------------------------------

/**
 * Fetch current quotes for market indices.
 * Returns a map: { "^GSPC": {...}, "^IXIC": {...}, ... }
 */
async function fetchIndices(indexConfig, timeoutMs) {
  const yahooFinance = getYahooFinance();
  const tickers = indexConfig.map(i => i.ticker);

  logger.info(`Fetching ${tickers.length} index quotes: ${tickers.join(', ')}`);

  const quotes = await withTimeout(
    yahooFinance.quote(tickers),
    timeoutMs,
    'Index quote fetch'
  );

  const result = {};
  for (const q of Array.isArray(quotes) ? quotes : [quotes]) {
    const cfg = indexConfig.find(i => i.ticker === q.symbol);
    result[q.symbol] = {
      ticker: q.symbol,
      name: cfg ? cfg.displayName : q.shortName || q.symbol,
      price: q.regularMarketPrice ?? null,
      change: q.regularMarketChange ?? null,
      changePercent: q.regularMarketChangePercent ?? null,
      previousClose: q.regularMarketPreviousClose ?? null,
      dayHigh: q.regularMarketDayHigh ?? null,
      dayLow: q.regularMarketDayLow ?? null,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
    };
    logger.debug(`  ${q.symbol}: ${q.regularMarketPrice} (${(q.regularMarketChangePercent ?? 0).toFixed(2)}%)`);
  }

  return result;
}

/**
 * Fetch sector performance. Yahoo Finance has a sector list under
 * the "Sectors & Industries" umbrella; we use the `quote` for sector ETFs
 * or fall back to the trending/screener approach.
 *
 * This function fetches a known set of sector tracking ETFs (SPDR Select
 * Sector funds) as a reliable proxy. Falls back gracefully.
 */
async function fetchSectors(timeoutMs) {
  const yahooFinance = getYahooFinance();

  // SPDR Select Sector ETFs — standard sector proxies
  const sectorETFs = [
    { ticker: 'XLK',  name: 'Technology' },
    { ticker: 'XLV',  name: 'Healthcare' },
    { ticker: 'XLF',  name: 'Financial Services' },
    { ticker: 'XLY',  name: 'Consumer Cyclical' },
    { ticker: 'XLC',  name: 'Communication Services' },
    { ticker: 'XLI',  name: 'Industrials' },
    { ticker: 'XLP',  name: 'Consumer Defensive' },
    { ticker: 'XLE',  name: 'Energy' },
    { ticker: 'XLU',  name: 'Utilities' },
    { ticker: 'XLRE', name: 'Real Estate' },
    { ticker: 'XLB',  name: 'Basic Materials' },
  ];

  logger.info(`Fetching sector performance via ${sectorETFs.length} sector ETFs`);

  const tickers = sectorETFs.map(s => s.ticker);
  const quotes = await withTimeout(
    yahooFinance.quote(tickers),
    timeoutMs,
    'Sector ETF quote fetch'
  );

  const sectors = [];
  const quoteArr = Array.isArray(quotes) ? quotes : [quotes];
  const quoteMap = {};
  for (const q of quoteArr) {
    quoteMap[q.symbol] = q;
  }

  for (const etf of sectorETFs) {
    const q = quoteMap[etf.ticker];
    if (!q) {
      sectors.push({
        name: etf.name,
        ticker: etf.ticker,
        changePercent: null,
        price: null,
        _stale: true,
      });
      continue;
    }
    sectors.push({
      name: etf.name,
      ticker: etf.ticker,
      changePercent: q.regularMarketChangePercent ?? null,
      price: q.regularMarketPrice ?? null,
      change: q.regularMarketChange ?? null,
    });
    logger.debug(`  ${etf.name} (${etf.ticker}): ${(q.regularMarketChangePercent ?? 0).toFixed(2)}%`);
  }

  // Sort by performance (best to worst)
  sectors.sort((a, b) => (b.changePercent ?? -999) - (a.changePercent ?? -999));

  return sectors;
}

/**
 * Fetch trending / most active stocks. Uses Yahoo Finance's trending endpoint.
 * Falls back to a hard-coded set of popular tickers when Yahoo blocks the request.
 */
async function fetchTrending(maxResults, timeoutMs) {
  const yahooFinance = getYahooFinance();

  logger.info(`Fetching up to ${maxResults} trending stocks`);

  try {
    // yahoo-finance2 exposes `trendingSymbols` which returns the Yahoo
    // "Trending Tickers" carousel data.
    const trendingResult = await withTimeout(
      yahooFinance.trendingSymbols('US'),
      timeoutMs,
      'Trending symbols fetch'
    );

    let quotes = trendingResult?.quotes || [];
    // Fallback if the newer endpoint shape doesn't match
    if (!Array.isArray(quotes)) {
      quotes = Array.isArray(trendingResult) ? trendingResult : [];
    }

    const items = quotes.slice(0, maxResults).map(q => ({
      ticker: q.symbol,
      name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice ?? null,
      changePercent: q.regularMarketChangePercent ?? null,
      volume: q.regularMarketVolume ?? null,
      marketCap: q.marketCap ?? null,
    }));

    logger.info(`Got ${items.length} trending stocks`);
    return items;
  } catch (err) {
    logger.warn(`Trending fetch failed (${err.message}), falling back to most-active`);

    // Fallback: fetch quotes for a set of popular tickers and rank by volume
    const fallbackTickers = [
      'AAPL', 'TSLA', 'NVDA', 'AMD', 'PLTR', 'AMZN', 'MSFT', 'GOOGL', 'META',
      'NFLX', 'SPY', 'QQQ', 'IWM', 'BA', 'F', 'INTC', 'SOFI', 'RIVN', 'LCID',
    ];
    try {
      const raw = await withTimeout(
        yahooFinance.quote(fallbackTickers),
        timeoutMs,
        'Fallback trending fetch'
      );
      const items = (Array.isArray(raw) ? raw : [raw])
        .filter(q => q && q.symbol)
        .sort((a, b) => (b.regularMarketVolume ?? 0) - (a.regularMarketVolume ?? 0))
        .slice(0, maxResults)
        .map(q => ({
          ticker: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          price: q.regularMarketPrice ?? null,
          changePercent: q.regularMarketChangePercent ?? null,
          volume: q.regularMarketVolume ?? null,
          marketCap: q.marketCap ?? null,
        }));
      logger.info(`Got ${items.length} fallback trending stocks`);
      return items;
    } catch (err2) {
      logger.warn(`Fallback trending also failed: ${err2.message}`);
      return [];
    }
  }
}

/**
 * Fetch quotes and sparkline (5-day historical) for all watchlist stocks.
 * Uses parallel requests with a concurrency limit.
 */
async function fetchWatchlist(stocks, concurrency, timeoutMs) {
  const yahooFinance = getYahooFinance();

  // Filter to active stocks only
  const active = stocks.filter(s => s.active !== false);
  logger.info(`Fetching quotes for ${active.length} watchlist stocks (concurrency=${concurrency})`);

  const tasks = active.map(stock => async () => {
    const ticker = stock.ticker;

    // Fetch current quote + 5-day history in parallel per stock
    const [quoteResult, historyResult] = await Promise.allSettled([
      withTimeout(yahooFinance.quote(ticker), timeoutMs, `${ticker} quote`),
      withTimeout(
        yahooFinance.historical(ticker, {
          period1: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          period2: new Date().toISOString().slice(0, 10),
          interval: '1d',
        }),
        timeoutMs,
        `${ticker} history`
      ),
    ]);

    // Build sparkline from historical data (close prices, last 5 days)
    let sparkline = [];
    if (historyResult.status === 'fulfilled' && Array.isArray(historyResult.value)) {
      sparkline = historyResult.value
        .slice(-5)
        .map(h => h.close ?? h.adjClose ?? null)
        .filter(v => v !== null);
    }

    // Build quote data
    const q = quoteResult.status === 'fulfilled' ? quoteResult.value : null;

    if (!q) {
      logger.warn(`  ${ticker}: fetch failed — ${quoteResult.reason?.message || 'unknown'}`);
      return {
        ticker,
        name: stock.name,
        price: null,
        change: null,
        changePercent: null,
        previousClose: null,
        dayHigh: null,
        dayLow: null,
        volume: null,
        marketCap: null,
        pe: null,
        sparkline,
        fiftyTwoWeekHigh: null,
        fiftyTwoWeekLow: null,
        targetPrice: stock.targetPrice ?? null,
        sector: stock.sector ?? null,
        currency: null,
        _stale: true,
        _error: quoteResult.reason?.message || 'Fetch failed',
      };
    }

    return {
      ticker,
      name: q.shortName || q.longName || stock.name || ticker,
      price: q.regularMarketPrice ?? null,
      change: q.regularMarketChange ?? null,
      changePercent: q.regularMarketChangePercent ?? null,
      previousClose: q.regularMarketPreviousClose ?? null,
      dayHigh: q.regularMarketDayHigh ?? null,
      dayLow: q.regularMarketDayLow ?? null,
      volume: q.regularMarketVolume ?? null,
      marketCap: q.marketCap ?? null,
      pe: q.trailingPE ?? null,
      sparkline,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
      targetPrice: stock.targetPrice ?? null,
      sector: stock.sector ?? null,
      currency: q.currency || 'USD',
      _stale: false,
    };
  });

  const results = await parallelWithLimit(tasks, concurrency);

  const stocks_data = results.map(r =>
    r.status === 'fulfilled' ? r.value : {
      ticker: 'UNKNOWN',
      name: 'Unknown',
      price: null,
      change: null,
      changePercent: null,
      _stale: true,
      _error: r.reason?.message || 'Task failed',
    }
  );

  // Sort by absolute change percent (largest movers first)
  stocks_data.sort((a, b) =>
    Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0)
  );

  // Count failures
  const failed = stocks_data.filter(s => s._stale).length;
  if (failed > 0) {
    logger.warn(`${failed}/${stocks_data.length} watchlist stocks failed to fetch`);
  } else {
    logger.info(`All ${stocks_data.length} watchlist stocks fetched successfully`);
  }

  return stocks_data;
}

/**
 * Attempt to enrich watchlist data with FMP fundamentals (PE, market cap, etc.)
 * when the API key is available. This is purely additive — it won't fail the
 * overall fetch if FMP is unavailable.
 */
async function enrichWithFMP(stocksData, timeoutMs) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    logger.info('FMP_API_KEY not set — skipping FMP enrichment');
    return stocksData;
  }

  logger.info('Enriching watchlist with FMP fundamentals');

  const tickers = stocksData.map(s => s.ticker);
  const url = `https://financialmodelingprep.com/api/v3/quote/${tickers.join(',')}?apikey=${apiKey}`;

  try {
    const resp = await withTimeout(fetch(url), timeoutMs, 'FMP quote fetch');

    if (!resp.ok) {
      logger.warn(`FMP returned HTTP ${resp.status} — skipping enrichment`);
      return stocksData;
    }

    const fmpData = await resp.json();
    if (!Array.isArray(fmpData)) {
      logger.warn('FMP returned unexpected format — skipping enrichment');
      return stocksData;
    }

    const fmpMap = {};
    for (const item of fmpData) {
      fmpMap[item.symbol] = item;
    }

    for (const stock of stocksData) {
      const fmp = fmpMap[stock.ticker];
      if (!fmp) continue;

      // Fill in gaps that Yahoo Finance might have missed
      if (stock.marketCap == null && fmp.marketCap != null) stock.marketCap = fmp.marketCap;
      if (stock.pe == null && fmp.pe != null) stock.pe = fmp.pe;
      // Add FMP-specific fields
      stock.eps = fmp.eps ?? null;
      stock.forwardPE = fmp.priceEarningsToGrowth ?? null;
    }

    logger.info('FMP enrichment complete');
  } catch (err) {
    logger.warn(`FMP enrichment failed: ${err.message}`);
  }

  return stocksData;
}

// ---------------------------------------------------------------------------
// Cache Management
// ---------------------------------------------------------------------------

/**
 * Save market overview data to cache, tagged with timestamp and source.
 */
function saveMarketCache(indices, sectors, trending) {
  const payload = {
    timestamp: new Date().toISOString(),
    source: 'yahoo-finance',
    indices,
    sectors,
    trending,
    marketBreadth: {
      // Computed as best-effort from sector ETF data
      advancers: sectors.filter(s => (s.changePercent ?? 0) > 0).length,
      decliners: sectors.filter(s => (s.changePercent ?? 0) < 0).length,
      unchanged: sectors.filter(s => s.changePercent === 0 || s.changePercent == null).length,
    },
  };
  atomicWriteJSON(MARKET_CACHE_PATH, payload);
  logger.info(`Market cache saved: ${Object.keys(indices).length} indices, ${sectors.length} sectors, ${trending.length} trending`);
  return payload;
}

/**
 * Save watchlist data to cache.
 */
function saveWatchlistCache(stocksData) {
  const payload = {
    timestamp: new Date().toISOString(),
    source: 'yahoo-finance',
    stocks: stocksData,
  };
  atomicWriteJSON(WATCHLIST_CACHE_PATH, payload);
  logger.info(`Watchlist cache saved: ${stocksData.length} stocks`);
  return payload;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const indicesOnly = args.includes('--indices-only');
  const watchlistOnly = args.includes('--watchlist-only');
  const all = !indicesOnly && !watchlistOnly;

  // Load configs
  loadDotEnv(DOTENV_PATH);

  const watchlistConfig = loadJSON(WATCHLIST_CONFIG_PATH);
  if (!watchlistConfig) {
    logger.error(`Watchlist config not found at ${WATCHLIST_CONFIG_PATH}`);
    process.exit(2);
  }

  const dashboardConfig = loadJSON(DASHBOARD_CONFIG_PATH) || {};
  const cacheConfig = dashboardConfig.cache || {};
  const fetcherConfig = dashboardConfig.fetchers || {};

  const concurrency = fetcherConfig.concurrency || 5;
  const timeoutMs = fetcherConfig.timeoutMs || 15000;
  const trendingMax = watchlistConfig.trending?.maxResults || 10;

  let exitCode = 0;
  let anySuccess = false;

  // ===== Market Data (indices, sectors, trending) =====
  if (all || indicesOnly) {
    logger.info('='.repeat(60));
    logger.info('PHASE 1: Market Overview');
    logger.info('='.repeat(60));

    try {
      // Indices
      const indices = await fetchIndices(watchlistConfig.indices || [], timeoutMs);
      anySuccess = true;

      // Sectors
      let sectors = [];
      try {
        sectors = await fetchSectors(timeoutMs);
      } catch (err) {
        logger.warn(`Sector fetch failed: ${err.message} — using cached sectors`);
        const cache = loadCache(MARKET_CACHE_PATH, (cacheConfig.sectors?.ttlSeconds || 300) * 1000);
        if (cache?.data?.sectors) sectors = cache.data.sectors;
      }

      // Trending
      let trending = [];
      try {
        trending = await fetchTrending(trendingMax, timeoutMs);
      } catch (err) {
        logger.warn(`Trending fetch failed: ${err.message}`);
        const cache = loadCache(MARKET_CACHE_PATH, (cacheConfig.indices?.ttlSeconds || 60) * 1000);
        if (cache?.data?.trending) trending = cache.data.trending;
      }

      if (!dryRun) {
        saveMarketCache(indices, sectors, trending);
      } else {
        logger.info('[DRY-RUN] Would save market cache with:');
        logger.info(`  Indices: ${Object.keys(indices).join(', ')}`);
        logger.info(`  Sectors: ${sectors.length}`);
        logger.info(`  Trending: ${trending.length}`);
      }
    } catch (err) {
      logger.error(`Market data phase failed: ${err.message}`);
      exitCode = Math.max(exitCode, 1);

      // Attempt to fall back to cached market data
      const cache = loadCache(MARKET_CACHE_PATH, Infinity);
      if (!cache) {
        logger.error('No cached market data available — market overview will be empty');
      } else {
        logger.info(`Fell back to cached market data from ${cache.data.timestamp}`);
      }
    }
  }

  // ===== Watchlist Data =====
  if (all || watchlistOnly) {
    logger.info('='.repeat(60));
    logger.info('PHASE 2: Watchlist Quotes');
    logger.info('='.repeat(60));

    try {
      let stocksData = await fetchWatchlist(
        watchlistConfig.stocks || [],
        concurrency,
        timeoutMs
      );

      // Enrich with FMP if available
      try {
        stocksData = await enrichWithFMP(stocksData, timeoutMs);
      } catch (err) {
        logger.warn(`FMP enrichment error (non-fatal): ${err.message}`);
      }

      const failed = stocksData.filter(s => s._stale).length;
      if (failed > 0) exitCode = Math.max(exitCode, 1);
      if (failed < stocksData.length) anySuccess = true;

      if (!dryRun) {
        saveWatchlistCache(stocksData);
      } else {
        logger.info('[DRY-RUN] Would save watchlist cache with:');
        logger.info(`  Stocks: ${stocksData.length} (${stocksData.filter(s => !s._stale).length} fresh, ${stocksData.filter(s => s._stale).length} stale)`);
      }
    } catch (err) {
      logger.error(`Watchlist phase failed: ${err.message}`);
      exitCode = Math.max(exitCode, 1);

      const cache = loadCache(WATCHLIST_CACHE_PATH, Infinity);
      if (!cache) {
        logger.error('No cached watchlist data available');
      } else {
        logger.info(`Fell back to cached watchlist data from ${cache.data.timestamp}`);
      }
    }
  }

  // ===== Summary =====
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info('='.repeat(60));
  logger.info(`Fetch complete in ${elapsed}s. Exit code: ${exitCode}`);
  logger.info('='.repeat(60));

  if (!anySuccess) process.exit(2);
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
