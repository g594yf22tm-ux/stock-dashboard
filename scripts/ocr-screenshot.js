/**
 * ocr-screenshot.js
 * 使用 OCR 从股票截图中识别文字和数字，输出结构化文本供分析
 * 用法: node scripts/ocr-screenshot.js [文件名]
 *       不带参数则处理最新截图
 */
const { createWorker } = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
const OCR_CACHE_DIR = path.join(SCREENSHOT_DIR, '.ocr_cache');

async function preprocessImage(inputPath) {
  // 增强图片对比度和锐度以提高 OCR 准确率
  const enhancedPath = inputPath.replace(/\.\w+$/, '_enhanced.png');
  await sharp(inputPath)
    .greyscale()
    .normalize()
    .sharpen()
    .linear(1.2, 0)  // 增加对比度
    .toFile(enhancedPath);
  return enhancedPath;
}

async function ocrImage(inputPath) {
  console.log(`🔍 OCR 识别: ${path.basename(inputPath)}`);

  // 预处理
  console.log('   📐 预处理中...');
  const enhancedPath = await preprocessImage(inputPath);

  // OCR 识别（中文优先 + 英文数字辅助）
  console.log('   📖 文字识别中（中英双语）...');
  const worker = await createWorker('chi_sim', 1, {
    logger: m => { if (m.status === 'recognizing text') process.stdout.write('.'); }
  });
  process.stdout.write('\n');

  const { data } = await worker.recognize(enhancedPath);

  // 清理增强文件
  fs.unlinkSync(enhancedPath);

  await worker.terminate();

  return {
    text: data.text,
    confidence: data.confidence,
    words: data.words?.map(w => ({
      text: w.text,
      confidence: w.confidence,
      bbox: w.bbox
    }))
  };
}

function parseStockData(ocrText) {
  // 尝试从 OCR 文本中提取股票相关的结构化信息
  const result = {
    tickers: [],
    prices: [],
    percentages: [],
    indicators: {},
    rawText: ocrText
  };

  // 提取股票代码（如 AAPL, 600519, 9988.HK）
  const tickerPattern = /\b[A-Z]{1,5}(\.(SS|SZ|HK))?\b/g;
  const tickers = ocrText.match(tickerPattern) || [];
  result.tickers = [...new Set(tickers)];

  // 提取价格（如 293.44, ¥180.50）
  const pricePattern = /[¥$]?\s*(\d{1,4}\.\d{2})/g;
  const prices = ocrText.match(pricePattern) || [];
  result.prices = prices;

  // 提取涨跌幅
  const pctPattern = /([+-]?\d+\.\d{1,2}%)/g;
  const pcts = ocrText.match(pctPattern) || [];
  result.percentages = pcts;

  // 提取技术指标关键词
  const indicatorKeywords = ['MACD', 'RSI', 'KDJ', 'VOL', 'MA', 'EMA', 'BOLL', 'PE', 'PB'];
  indicatorKeywords.forEach(kw => {
    const idx = ocrText.indexOf(kw);
    if (idx >= 0) {
      result.indicators[kw] = ocrText.substring(idx, idx + 30).trim();
    }
  });

  return result;
}

async function main() {
  const targetFile = process.argv[2];

  let inputPath;
  if (targetFile) {
    inputPath = path.isAbsolute(targetFile)
      ? targetFile
      : path.join(SCREENSHOT_DIR, targetFile);
  } else {
    // 优先使用 processed 目录的压缩图片，否则用原始截图
    const processedDir = path.join(SCREENSHOT_DIR, 'processed');
    if (fs.existsSync(processedDir)) {
      const processed = fs.readdirSync(processedDir)
        .filter(f => /_1000px\.jpg$/i.test(f))
        .sort()
        .reverse();
      if (processed.length > 0) {
        inputPath = path.join(processedDir, processed[0]);
      }
    }
    if (!inputPath) {
      // 使用原始截图
      const files = fs.readdirSync(SCREENSHOT_DIR)
        .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
        .sort((a, b) => {
          return fs.statSync(path.join(SCREENSHOT_DIR, b)).mtimeMs -
                 fs.statSync(path.join(SCREENSHOT_DIR, a)).mtimeMs;
        });
      if (files.length > 0) {
        inputPath = path.join(SCREENSHOT_DIR, files[0]);
      }
    }
  }

  if (!inputPath || !fs.existsSync(inputPath)) {
    console.error('❌ 没有找到截图文件');
    console.log(`请将截图保存到: ${SCREENSHOT_DIR}`);
    process.exit(1);
  }

  console.log(`📸 分析截图: ${path.basename(inputPath)}`);
  console.log('');

  // OCR
  const ocrResult = await ocrImage(inputPath);
  const parsed = parseStockData(ocrResult.text);

  // 输出
  console.log('');
  console.log('═'.repeat(60));
  console.log('📋 OCR 识别结果');
  console.log('═'.repeat(60));
  console.log(`置信度: ${ocrResult.confidence}%`);
  console.log('');

  // 检测到的股票代码
  if (parsed.tickers.length > 0) {
    console.log('🎯 检测到的股票代码:', parsed.tickers.join(', '));
  }

  // 检测到的价格
  if (parsed.prices.length > 0) {
    console.log('💰 检测到的价格:', parsed.prices.join(', '));
  }

  // 检测到的百分比
  if (parsed.percentages.length > 0) {
    console.log('📊 检测到的涨跌幅:', parsed.percentages.join(', '));
  }

  // 技术指标
  if (Object.keys(parsed.indicators).length > 0) {
    console.log('📈 检测到的指标:');
    Object.entries(parsed.indicators).forEach(([k, v]) => {
      console.log(`   ${k}: ${v}`);
    });
  }

  console.log('');
  console.log('─'.repeat(60));
  console.log('📝 完整识别文本:');
  console.log('─'.repeat(60));
  console.log(ocrResult.text);
  console.log('═'.repeat(60));
}

main().catch(err => {
  console.error('OCR 失败:', err.message);
  process.exit(1);
});
