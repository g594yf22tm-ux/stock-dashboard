/**
 * sinaApi.js — 新浪财经 A股数据服务
 * 免费、无需 API Key、原生 A股支持
 */
'use strict';

const http = require('http');
const https = require('https');
const iconv = require('iconv-lite');

// ── HTTP 工具（含重试）───────────────────────────────────────────────────
async function httpGet(url, options = {}) {
  const maxRetries = options.retries || 2;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // 指数退避: 200ms, 400ms
      await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt - 1)));
    }

    try {
      const result = await new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://finance.sina.com.cn/',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            ...options.headers
          }
        }, (res) => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            // 新浪 API 全系列 GBK 编码 — 不依赖 Content-Type 头
            const text = iconv.decode(buf, 'gbk');
            resolve({ text, status: res.statusCode });
          });
        });
        req.on('error', reject);
        req.setTimeout(options.timeout || 8000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        console.error(`[SinaAPI] ${url.substring(0,60)}... 重试 ${attempt+1}/${maxRetries}: ${err.message}`);
      }
    }
  }
  throw lastError;
}

// ── 股票搜索 ──────────────────────────────────────────────────────────────
async function searchStocks(query) {
  const q = encodeURIComponent(query);
  const url = `http://suggest3.sinajs.cn/suggest/type=11,12,13,14&key=${q}`;

  try {
    const { text } = await httpGet(url);
    // 响应格式: var suggestvalue="名称,类型,代码,唯一标识,名称,拼音首字母,...;..."
    const match = text.match(/"(.*)"/);
    if (!match) return [];

    const entries = match[1].split(';').filter(Boolean);
    const results = [];

    for (const entry of entries) {
      const parts = entry.split(',');
      if (parts.length < 5) continue;

      // 新浪 API 对代码搜索和名称搜索返回不同格式：
      // 名称搜索: 中牧股份,11,600195,sh600195,...   → name=parts[0], type=parts[1], code=parts[3]
      // 代码搜索: sh600195,11,600195,sh600195,中牧股份,... → fullCode=parts[0], type=parts[1], name=parts[4]
      const isCodeSearch = parts[0].startsWith('sh') || parts[0].startsWith('sz');

      let name, type, code;
      if (isCodeSearch) {
        // 代码搜索格式
        code = parts[0];      // sh600195
        type = parts[1];      // 11
        name = parts[4];      // 中牧股份
        // 如果 parts[4] 为空或也是代码，用 parts[6]
        if (!name || name.startsWith('sh') || name.startsWith('sz')) {
          name = parts[6] || parts[0];
        }
      } else {
        // 名称搜索格式
        name = parts[0];      // 中牧股份
        type = parts[1];      // 11
        code = parts[3];      // sh600195
      }

      if (!name || !code) continue;
      // 只取A股（11=上海, 12=深圳）
      if (!['11', '12'].includes(type)) continue;

      const market = code.startsWith('sh') ? 'SS' : code.startsWith('sz') ? 'SZ' : '';
      if (!market) continue;
      const tickerNum = code.replace(/^sh|^sz/, '');
      const ticker = `${tickerNum}.${market}`;

      // 去重
      if (results.find(r => r.ticker === ticker)) continue;

      // 清理名称（去除可能的空白和代码混入）
      const cleanName = name.trim().replace(/^sh\d+|^sz\d+/i, '');

      results.push({
        ticker,
        name: cleanName || name.trim(),
        exchange: type === '11' ? '上海' : '深圳',
        fullCode: code
      });
    }

    return results.slice(0, 15);
  } catch (err) {
    console.error('[SinaAPI] Search error:', err.message);
    return [];
  }
}

// ── 实时行情 ──────────────────────────────────────────────────────────────
async function getQuote(ticker) {
  // 转换格式: 600519.SS → sh600519, 000001.SZ → sz000001
  const parts = ticker.split('.');
  if (parts.length !== 2) return null;
  const num = parts[0];
  const market = parts[1].toLowerCase();
  const code = (market === 'ss' ? 'sh' : market === 'sz' ? 'sz' : '') + num;

  const url = `http://hq.sinajs.cn/list=${code}`;

  try {
    const { text } = await httpGet(url);

    // 解析 hq_str 格式
    // var hq_str_sh600519="贵州茅台,1680.50,1659.70,1675.00,1685.00,1650.00,...";
    const hqMatch = text.match(/"([^"]+)"/);
    if (!hqMatch) return null;

    const fields = hqMatch[1].split(',');
    if (fields.length < 32) return null;

    return {
      ticker,
      name: fields[0],
      open: parseFloat(fields[1]),
      prevClose: parseFloat(fields[2]),
      price: parseFloat(fields[3]),
      high: parseFloat(fields[4]),
      low: parseFloat(fields[5]),
      volume: parseInt(fields[8]),
      amount: parseFloat(fields[9]), // 成交额(万元)
      change: (parseFloat(fields[3]) - parseFloat(fields[2])).toFixed(2),
      changePercent: (((parseFloat(fields[3]) - parseFloat(fields[2])) / parseFloat(fields[2])) * 100).toFixed(2),
      bidPrice: parseFloat(fields[11]), // 买一
      askPrice: parseFloat(fields[21]), // 卖一
      date: fields[30],
      time: fields[31]
    };
  } catch (err) {
    console.error('[SinaAPI] Quote error:', err.message);
    return null;
  }
}

// ── 批量行情 ──────────────────────────────────────────────────────────────
async function getQuotes(tickers) {
  if (!tickers || tickers.length === 0) return [];
  const codes = tickers.map(t => {
    const parts = t.split('.');
    const m = parts[1]?.toLowerCase();
    return (m === 'ss' ? 'sh' : m === 'sz' ? 'sz' : '') + parts[0];
  }).join(',');

  const url = `http://hq.sinajs.cn/list=${codes}`;
  try {
    const { text } = await httpGet(url);
    const results = [];

    const regex = /var hq_str_(\w+)="([^"]*)"/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const code = match[1];
      const fields = match[2].split(',');
      if (fields.length < 32) continue;

      const num = code.replace(/^sh|^sz/, '');
      const market = code.startsWith('sh') ? 'SS' : 'SZ';
      const ticker = `${num}.${market}`;

      results.push({
        ticker,
        name: fields[0],
        open: parseFloat(fields[1]),
        prevClose: parseFloat(fields[2]),
        price: parseFloat(fields[3]) || 0,
        high: parseFloat(fields[4]),
        low: parseFloat(fields[5]),
        volume: parseInt(fields[8]) || 0,
        amount: parseFloat(fields[9]) || 0,
        changePercent: parseFloat(fields[3]) && parseFloat(fields[2])
          ? (((parseFloat(fields[3]) - parseFloat(fields[2])) / parseFloat(fields[2])) * 100).toFixed(2)
          : '0.00',
        change: parseFloat(fields[3]) && parseFloat(fields[2])
          ? (parseFloat(fields[3]) - parseFloat(fields[2])).toFixed(2)
          : '0.00',
        time: fields[31]
      });
    }
    return results;
  } catch (err) {
    console.error('[SinaAPI] Batch quote error:', err.message);
    return [];
  }
}

// ── 当日技术信号分析 ────────────────────────────────────────────────────
function analyzeSignal(quote) {
  if (!quote || !quote.price) return null;

  const price = quote.price;
  const prevClose = quote.prevClose;
  const high = quote.high;
  const low = quote.low;
  const open = quote.open;
  const changePct = parseFloat(quote.changePercent);

  // 价格位置（日内振幅中的相对位置）
  const dayRange = high - low;
  const pricePosition = dayRange > 0 ? ((price - low) / dayRange) : 0.5;

  // 多维度评分
  let score = 50; // 中性 50 分

  // 1. 涨跌幅度信号
  if (changePct >= 3) score += 15;
  else if (changePct >= 1) score += 8;
  else if (changePct <= -3) score -= 15;
  else if (changePct <= -1) score -= 8;

  // 2. 价格相对日内高低点位置
  if (pricePosition > 0.7 && changePct > 0) score += 10;  // 强势收盘
  else if (pricePosition < 0.3 && changePct < 0) score -= 10; // 弱势收盘

  // 3. 开盘vs收盘方向
  if (price > open && changePct > 0) score += 5;  // 低开高走
  else if (price < open && changePct < 0) score -= 5;  // 高开低走

  // 评分转信号
  let signal, signalText, color;
  if (score >= 70) { signal = 'BUY'; signalText = '强势看多'; color = '#ec4f5e'; }
  else if (score >= 60) { signal = 'BUY'; signalText = '偏多'; color = '#ec4f5e'; }
  else if (score >= 45) { signal = 'HOLD'; signalText = '震荡观望'; color = '#f59e0b'; }
  else if (score >= 35) { signal = 'WATCH'; signalText = '偏弱关注'; color = '#06b6d4'; }
  else { signal = 'WATCH'; signalText = '弱势回避'; color = '#22c55e'; }

  return {
    score: Math.min(100, Math.max(0, score)),
    signal,
    signalText,
    color,
    details: {
      priceVsClose: `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`,
      dayAmplitude: dayRange > 0 ? `${((dayRange / prevClose) * 100).toFixed(2)}%` : '—',
      pricePosition: `${(pricePosition * 100).toFixed(0)}%`,
      openCloseDirection: price > open ? '低开高走 ↑' : price < open ? '高开低走 ↓' : '平开',
      volumeLevel: quote.volume > 10000000 ? '放量' : quote.volume > 5000000 ? '正常' : '缩量'
    },
    disclaimer: '信号基于当日盘中数据计算，仅供参考，不构成投资建议'
  };
}

// ── 个股新闻（从新浪个股页面抓取）───────────────────────────────────────
async function getStockNews(ticker) {
  const parts = ticker.split('.');
  if (parts.length !== 2) return [];
  const market = parts[1].toLowerCase();
  const prefix = market === 'ss' ? 'sh' : 'sz';
  const code = prefix + parts[0];
  const url = `https://vip.stock.finance.sina.com.cn/corp/go.php/vCB_AllNewsStock/symbol/${code}.phtml`;

  try {
    const { text: html } = await httpGet(url);
    const articles = [];
    const seen = new Set();

    // 匹配: <a ... href="..." ...>文字</a> 或 <a ... href='...' ...>文字</a>
    const regex = /<a[^>]*href=["']([^"']*)["'][^>]*>([^<]{10,150})<\/a>/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
      let href = match[1];
      const title = match[2].replace(/&nbsp;/g, ' ').trim();

      // 基本过滤
      if (title.length < 10 || title.length > 150) continue;
      if (!/[一-鿿]/.test(title)) continue;
      if (seen.has(title)) continue;

      // 补全URL
      if (href.startsWith('//')) href = 'https:' + href;
      else if (href.startsWith('/')) href = 'https://finance.sina.com.cn' + href;
      // 接受所有http和相对URL

      seen.add(title);
      articles.push({ title, url: href, source: '新浪财经' });
    }
    return articles.slice(0, 12);
  } catch (err) {
    console.error('[SinaAPI] News error:', err.message);
    return [];
  }
}

function getNewsKeywords(ticker, name) {
  return {
    keywords: [`${name} ${ticker}`, `${ticker} 最新消息`, `${name} 公告`],
    searchUrl: `https://www.baidu.com/s?wd=${encodeURIComponent(name + ' ' + ticker + ' 最新消息')}`
  };
}

module.exports = { searchStocks, getQuote, getQuotes, getNewsKeywords, analyzeSignal, getStockNews };
