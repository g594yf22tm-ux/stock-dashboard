/**
 * init-dashboard-data.js v3.0 — A股专用
 * 初始化仪表盘缓存数据（中国A股 + 中文）
 * 运行: node scripts/init-dashboard-data.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'dashboard', 'data');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const NOW = new Date().toISOString();

// 从配置读取关注列表
function loadWatchlistConfig() {
  try {
    const configPath = path.join(__dirname, '..', 'dashboard', 'config', 'watchlist.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.stocks?.filter(s => s.active !== false) || [];
    }
  } catch (e) { console.warn('读取配置文件失败，使用默认列表'); }
  return [];
}

// ── A股市场数据 ──────────────────────────────────────────────────────────
const marketData = {
  timestamp: NOW,
  source: 'init-script',
  indices: {
    '000001.SS': { ticker: '000001.SS', name: '上证指数', price: 3358.42, change: 12.35, changePercent: 0.37, previousClose: 3346.07 },
    '399001.SZ': { ticker: '399001.SZ', name: '深证成指', price: 10785.60, change: 45.22, changePercent: 0.42, previousClose: 10740.38 },
    '399006.SZ': { ticker: '399006.SZ', name: '创业板指', price: 2156.88, change: -8.64, changePercent: -0.40, previousClose: 2165.52 },
    '000688.SS': { ticker: '000688.SS', name: '科创50', price: 985.30, change: 5.18, changePercent: 0.53, previousClose: 980.12 }
  },
  sectors: [
    { name: '白酒', ticker: '白酒', changePercent: 1.85 },
    { name: '新能源电池', ticker: '电池', changePercent: 1.42 },
    { name: '银行', ticker: '银行', changePercent: 0.88 },
    { name: '电力', ticker: '电力', changePercent: 0.65 },
    { name: '家电', ticker: '家电', changePercent: 0.52 },
    { name: '医药', ticker: '医药', changePercent: 0.31 },
    { name: '工程机械', ticker: '机械', changePercent: -0.12 },
    { name: '保险', ticker: '保险', changePercent: -0.28 },
    { name: '工业自动化', ticker: '自动化', changePercent: -0.45 },
    { name: '消费电子', ticker: '电子', changePercent: -0.68 },
    { name: '光伏', ticker: '光伏', changePercent: -1.15 }
  ],
  trending: [
    { ticker: '300750.SZ', name: '宁德时代', price: 252.80, changePercent: 3.52 },
    { ticker: '600519.SS', name: '贵州茅台', price: 1680.50, changePercent: 1.25 },
    { ticker: '002594.SZ', name: '比亚迪', price: 338.45, changePercent: 2.88 },
    { ticker: '601318.SS', name: '中国平安', price: 52.30, changePercent: -0.65 },
    { ticker: '601012.SS', name: '隆基绿能', price: 22.18, changePercent: -2.15 },
    { ticker: '300059.SZ', name: '东方财富', price: 20.45, changePercent: 5.11 },
    { ticker: '600036.SS', name: '招商银行', price: 40.28, changePercent: 0.42 },
    { ticker: '000858.SZ', name: '五粮液', price: 168.90, changePercent: 1.88 }
  ],
  marketBreadth: { advancers: 5, decliners: 6, unchanged: 0 }
};

// ── A股关注列表（从配置动态加载）───────────────────────────────────────
const configStocks = loadWatchlistConfig();
const stocks = configStocks.map(cfg => ({
  ticker: cfg.ticker,
  name: cfg.name,
  sector: cfg.sector || '',
  target: cfg.targetPrice || null,
  price: 0, change: 0, changePercent: 0, vol: 0, cap: 0, pe: 0,
  spark: [0, 0, 0, 0, 0], h52: 0, l52: 0
}));

const watchlistData = {
  timestamp: NOW,
  source: 'init-script',
  stocks: stocks.map(s => ({
    ticker: s.ticker,
    name: s.name,
    price: s.price,
    change: s.change,
    changePercent: s.changePercent,
    volume: s.vol,
    marketCap: s.cap * 100000000,
    pe: s.pe,
    sparkline: s.spark,
    fiftyTwoWeekHigh: s.h52,
    fiftyTwoWeekLow: s.l52,
    targetPrice: s.target,
    sector: s.sector,
    currency: 'CNY'
  }))
};

// ── 专家分析（覆盖配置中所有A股，基本面+技术面+风险三维度）─────────────
// 分析数据基于公开信息，由AI辅助生成，仅供参考
const analysisMap = {
  '白酒': {
    fundamental: { pe: 33, roe: 30, revenueGrowth: 15, fcfYield: 3.2, overallSignal: 'strong', signalStrength: 0.85,
      view: '高端白酒品牌护城河极深，毛利率80%+保持稳定。库存周期处于低位，渠道补库在即。PE虽不低但增长确定性高，DCF估值仍有一定空间。批价企稳是关键观测信号。' },
    technical: { rsi14: 55, macdSignal: 'bullish', overallSignal: 'bullish', signalStrength: 0.72, priceVsSma50: 2.5, priceVsSma200: 8.0,
      view: '均线多头排列，50日线稳步上移。MACD金叉运行中，RSI健康区间。布林带中轨支撑有效，上方关注前高压力。成交量温和放大配合上涨。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.55,
      view: '主要风险：消费税改革可能压缩利润、消费降级对高端需求的影响、年轻人饮酒习惯变化。但龙头公司回购+高分红提供下行保护，长期确定性高。' },
    signal: 'BUY', confidence: 0.82
  },
  '新能源电池': {
    fundamental: { pe: 29, roe: 22, revenueGrowth: 30, fcfYield: 2.5, overallSignal: 'strong', signalStrength: 0.82,
      view: '全球动力电池龙头，市占率37%持续攀升。储能业务增速100%+成为第二增长曲线。毛利率逐季回升至26%，海外产能投产将降低关税风险。' },
    technical: { rsi14: 58, macdSignal: 'bullish', overallSignal: 'bullish', signalStrength: 0.75, priceVsSma50: 4.2, priceVsSma200: 15.0,
      view: '股价沿20日线稳步上攻，均线多头排列健康。MACD红柱放大，RSI偏强但未超买。突破前期平台后成交量配合良好，短期看前高。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.50,
      view: '主要风险：产能过剩导致价格战、海外关税壁垒（欧盟反补贴税）、固态电池技术替代。但技术壁垒和客户粘性极高，龙头地位短期难以撼动。' },
    signal: 'BUY', confidence: 0.80
  },
  '新能源汽车': {
    fundamental: { pe: 35, roe: 18, revenueGrowth: 25, fcfYield: 1.8, overallSignal: 'strong', signalStrength: 0.78,
      view: '国内新能源车渗透率超50%，出海进程加速（泰国/巴西工厂投产）。DM-i混动技术领先，高端品牌仰望/Denza贡献增量。利润增速快于营收，规模效应显现。' },
    technical: { rsi14: 62, macdSignal: 'bullish', overallSignal: 'bullish', signalStrength: 0.70, priceVsSma50: 3.8, priceVsSma200: 12.0,
      view: '股价突破盘整平台后强势拉升，RSI偏强但无背离。均线系统全面多排，MACD金叉运行。关注前高压力位，若放量突破则打开上行空间。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.48,
      view: '主要风险：价格战持续压缩毛利率、海外政治风险（欧美关税）、自动驾驶竞争加剧。但技术积累和规模优势构筑护城河，长期竞争力强劲。' },
    signal: 'BUY', confidence: 0.78
  },
  '保险': {
    fundamental: { pe: 10, roe: 13, revenueGrowth: 6, fcfYield: 8.5, overallSignal: 'strong', signalStrength: 0.78,
      view: 'PE/PB处于历史底部区域，股息率4.5%+具备防御价值。NBV增速转正，代理人改革初见成效。利率下行环境下投资端承压，但保单质量改善抵消。' },
    technical: { rsi14: 48, macdSignal: 'neutral', overallSignal: 'neutral', signalStrength: 0.52, priceVsSma50: -0.5, priceVsSma200: 5.0,
      view: '股价横盘整理，RSI中性，MACD零轴附近徘徊。成交量萎缩，方向选择在即。若突破52元阻力则趋势反转，跌破50元则需关注下方支撑。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.55,
      view: '主要风险：长期利率下行对利差损的压力、寿险需求疲软、权益市场波动影响投资收益。但估值已充分反映悲观预期，下行空间有限。' },
    signal: 'HOLD', confidence: 0.75
  },
  '银行': {
    fundamental: { pe: 6, roe: 11, revenueGrowth: 3, fcfYield: 9.5, overallSignal: 'strong', signalStrength: 0.80,
      view: '股息率5%+具备类债券属性，高股息策略首选。资产质量持续改善，不良率下行。净息差虽在收窄但已近底部，拨备覆盖率充足提供利润调节空间。' },
    technical: { rsi14: 52, macdSignal: 'bullish', overallSignal: 'bullish', signalStrength: 0.65, priceVsSma50: 1.2, priceVsSma200: 6.5,
      view: '股价沿20日线缓慢抬升，MACD温和金叉。成交量平稳，典型的机构配置型走势。高股息属性吸引长线资金持续流入。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.52,
      view: '主要风险：城投和房地产风险敞口、净息差持续收窄、经济下行导致不良率反弹。但国有大行系统性风险极低，高股息提供安全垫。' },
    signal: 'BUY', confidence: 0.76
  },
  '家电': {
    fundamental: { pe: 14, roe: 24, revenueGrowth: 10, fcfYield: 6.0, overallSignal: 'strong', signalStrength: 0.82,
      view: '白电龙头，全球化布局完善。ToB业务（机器人/自动化）高速增长打开第二曲线。海外营收占比超40%，汇率波动影响可控。高ROE+高分红是长期持有逻辑。' },
    technical: { rsi14: 48, macdSignal: 'neutral', overallSignal: 'neutral', signalStrength: 0.50, priceVsSma50: -1.0, priceVsSma200: 5.5,
      view: '股价回调整理中，RSI回落至中性区。MACD柱状图收窄，短期方向不明。60日均线形成支撑，若能企稳则中期趋势不变。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.55,
      view: '主要风险：房地产下行影响家电需求、原材料价格波动、海外贸易摩擦。但多元化业务和品牌溢价能力提供缓冲，长期稳健增长可期。' },
    signal: 'HOLD', confidence: 0.73
  },
  '电力': {
    fundamental: { pe: 23, roe: 16, revenueGrowth: 5, fcfYield: 4.5, overallSignal: 'strong', signalStrength: 0.80,
      view: '水电龙头，来水稳定保障发电量。乌白电站注入后装机容量大幅提升，折旧高峰过后利润将加速释放。股息率3.5%+稳定，类债券防御资产。' },
    technical: { rsi14: 55, macdSignal: 'bullish', overallSignal: 'bullish', signalStrength: 0.68, priceVsSma50: 2.0, priceVsSma200: 8.8,
      view: '股价沿上升通道稳步攀行，均线多排。MACD温和金叉，RSI健康。高股息属性吸引长线资金，走势独立于大盘。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.60,
      view: '主要风险：来水不及预期、电力市场化改革冲击、大型基建折旧压力。但现金流高度稳定，经营风险极低，是组合中的压舱石。' },
    signal: 'BUY', confidence: 0.78
  },
  '安防': {
    fundamental: { pe: 26, roe: 20, revenueGrowth: 8, fcfYield: 3.0, overallSignal: 'neutral', signalStrength: 0.62,
      view: 'AI赋能安防升级，创新业务（机器人/汽车电子/热成像）增速>30%。但海外制裁风险持续，国内政府安防采购放缓。估值适中，等待AI落地催化。' },
    technical: { rsi14: 42, macdSignal: 'bearish', overallSignal: 'neutral', signalStrength: 0.45, priceVsSma50: -2.5, priceVsSma200: -1.0,
      view: '股价受制于50日线，MACD死叉修复中。RSI偏弱，成交量萎缩。短期关注36元支撑，若守住则有望筑底反弹。' },
    risk: { overallSignal: 'bearish', signalStrength: 0.38,
      view: '主要风险：美国实体清单制裁升级、海外市场拓展受阻、国内安防投入增速放缓。但AI创新业务提供增量，估值下修风险可控。' },
    signal: 'WATCH', confidence: 0.65
  },
  '互联网金融': {
    fundamental: { pe: 39, roe: 15, revenueGrowth: 18, fcfYield: 1.5, overallSignal: 'neutral', signalStrength: 0.60,
      view: '流量优势显著，天天基金+证券双轮驱动。市场活跃度是核心变量，牛市中弹性极大。但PE偏高，需市场成交量持续放大才能支撑估值。' },
    technical: { rsi14: 60, macdSignal: 'bullish', overallSignal: 'bullish', signalStrength: 0.72, priceVsSma50: 5.0, priceVsSma200: 18.0,
      view: '股价放量突破平台，RSI强势，MACD金叉放大。市场做多情绪高涨，短期动能充足。关注成交量能否持续维持在5亿以上。' },
    risk: { overallSignal: 'bearish', signalStrength: 0.35,
      view: '主要风险：市场成交量萎缩直接冲击业绩、监管政策不确定性（互联网券商新规）、高估值波动风险。牛熊切换时回撤幅度极大。' },
    signal: 'WATCH', confidence: 0.62
  },
  '医药': {
    fundamental: { pe: 68, roe: 12, revenueGrowth: 8, fcfYield: 0.8, overallSignal: 'neutral', signalStrength: 0.55,
      view: '创新药管线丰富（PD-1/ADC/GLP-1），集采影响逐步消化。海外临床进展是核心催化剂。PE高但创新药管线折现后可支撑，关键看临床数据读出。' },
    technical: { rsi14: 52, macdSignal: 'neutral', overallSignal: 'neutral', signalStrength: 0.50, priceVsSma50: 0.5, priceVsSma200: -5.0,
      view: '股价横盘整理，等待催化剂。RSI中性，MACD零轴附近。若能站稳55元则短多确认，跌破48元则需止损。' },
    risk: { overallSignal: 'bearish', signalStrength: 0.35,
      view: '主要风险：临床失败（最致命）、集采扩大化、药品降价压力、海外申报受阻。创新药投资高风险高回报，仓位需严格控制。' },
    signal: 'WATCH', confidence: 0.58
  },
  '光伏': {
    fundamental: { pe: 19, roe: 16, revenueGrowth: -5, fcfYield: 2.0, overallSignal: 'neutral', signalStrength: 0.55,
      view: '行业产能过剩严重，硅料/硅片价格持续下跌。但龙头成本优势突出，行业出清后将提升集中度。技术迭代（BC电池）是差异化竞争的关键。' },
    technical: { rsi14: 38, macdSignal: 'bearish', overallSignal: 'bearish', signalStrength: 0.35, priceVsSma50: -5.5, priceVsSma200: -15.0,
      view: '股价处于下降通道，均线空排。RSI偏弱但未超卖，MACD死叉运行。等待行业基本面拐点信号，目前不宜盲目抄底。' },
    risk: { overallSignal: 'bearish', signalStrength: 0.30,
      view: '主要风险：产能过剩持续恶化、价格战升级、海外贸易壁垒（美国反规避调查）、技术路线风险（钙钛矿替代）。行业仍在寻底，耐心等待。' },
    signal: 'SELL', confidence: 0.68
  },
  '消费电子': {
    fundamental: { pe: 32, roe: 22, revenueGrowth: 15, fcfYield: 2.5, overallSignal: 'strong', signalStrength: 0.75,
      view: '苹果供应链核心，Vision Pro/AR贡献新增量。汽车电子业务快速增长，客户多元化降低对苹果依赖。产能全球化布局应对关税风险。' },
    technical: { rsi14: 55, macdSignal: 'bullish', overallSignal: 'bullish', signalStrength: 0.68, priceVsSma50: 3.0, priceVsSma200: 10.0,
      view: '股价沿20日线上攻，MACD金叉运行。成交量温和放大，RSI健康。关注38元前高压力，突破则看前高42元。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.50,
      view: '主要风险：苹果订单波动、地缘政治影响供应链布局、汇率波动。但客户多元化和技术壁垒提供缓冲，中长期受益于AI终端创新。' },
    signal: 'BUY', confidence: 0.75
  },
  '工业自动化': {
    fundamental: { pe: 46, roe: 20, revenueGrowth: 22, fcfYield: 1.5, overallSignal: 'strong', signalStrength: 0.78,
      view: '工控龙头，受益于制造业升级和国产替代。新能源车电驱/机器人伺服系统高速增长。技术壁垒高，客户粘性强，毛利率维持35%+。PE偏高但成长性支撑。' },
    technical: { rsi14: 58, macdSignal: 'bullish', overallSignal: 'bullish', signalStrength: 0.70, priceVsSma50: 5.2, priceVsSma200: 15.5,
      view: '股价强势突破前高，均线多头排列。MACD红柱持续放大，RSI偏强。上升通道完好，支撑位68元不破则趋势延续。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.50,
      view: '主要风险：制造业投资周期波动、竞争加剧（西门子/发那科）、估值偏高（PE 46x）。但国产替代趋势确定，龙头地位稳固。' },
    signal: 'BUY', confidence: 0.77
  },
  '免税': {
    fundamental: { pe: 29, roe: 25, revenueGrowth: 12, fcfYield: 3.0, overallSignal: 'strong', signalStrength: 0.76,
      view: '海南自贸港封关在即，离岛免税政策红利持续。市内免税店全国布局加速，出入境游恢复是增量催化剂。竞争格局改善，龙头地位稳固。' },
    technical: { rsi14: 52, macdSignal: 'neutral', overallSignal: 'neutral', signalStrength: 0.55, priceVsSma50: 1.0, priceVsSma200: -3.5,
      view: '股价触底反弹，RSI从超卖区回升。MACD即将金叉，成交量开始放大。若能站稳90元则确认反转，否则可能二次探底。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.48,
      view: '主要风险：海南免税市场竞争加剧、出境游分流、政策变化风险。但龙头渠道优势和规模效应不可复制，长期受益于消费回流。' },
    signal: 'BUY', confidence: 0.74
  },
  '工程机械': {
    fundamental: { pe: 22, roe: 12, revenueGrowth: 5, fcfYield: 4.0, overallSignal: 'neutral', signalStrength: 0.60,
      view: '国内基建投资企稳回升，设备更新周期启动。海外收入占比超60%，东南亚/非洲/拉美市场高增长。电动化产品线布局领先。' },
    technical: { rsi14: 55, macdSignal: 'bullish', overallSignal: 'bullish', signalStrength: 0.62, priceVsSma50: 3.0, priceVsSma200: 6.0,
      view: '股价沿20日线稳步上行，MACD金叉。成交量温和，RSI中性偏强。突破22元阻力则打开上行空间，支撑19.5元。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.50,
      view: '主要风险：国内房地产开工不及预期、海外政治风险（一带一路国家）、原材料成本波动。但全球化布局对冲单一市场风险。' },
    signal: 'HOLD', confidence: 0.68
  },
  '养殖': {
    fundamental: { pe: 15, roe: 22, revenueGrowth: 18, fcfYield: 5.5, overallSignal: 'strong', signalStrength: 0.78,
      view: '生猪养殖龙头，成本优势行业领先（14元/kg）。猪周期上行阶段，猪价维持20元+/kg，盈利高弹性。能繁母猪存栏去化充分，景气有望持续至2027H1。' },
    technical: { rsi14: 48, macdSignal: 'bearish', overallSignal: 'neutral', signalStrength: 0.48, priceVsSma50: -1.5, priceVsSma200: 8.0,
      view: '猪价回落后股价承压，RSI偏弱。MACD死叉，短期需观望。但猪周期逻辑未变，每次回踩都是布局机会。支撑45元。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.45,
      view: '主要风险：猪价大幅波动（核心变量）、疫病风险（非洲猪瘟）、环保政策趋严。周期股波动极大，需严格仓位管理。' },
    signal: 'HOLD', confidence: 0.70
  },
  '券商': {
    fundamental: { pe: 22, roe: 10, revenueGrowth: 15, fcfYield: 3.5, overallSignal: 'strong', signalStrength: 0.78,
      view: '券商龙头，投行+经纪+资管全牌照领先。市场成交活跃时弹性极大，牛市中PB可从1.2x涨至2.5x。当前PB处于历史中低位，高股息+业绩改善双击。' },
    technical: { rsi14: 58, macdSignal: 'bullish', overallSignal: 'bullish', signalStrength: 0.72, priceVsSma50: 5.0, priceVsSma200: 12.0,
      view: '股价沿20日线上行，MACD金叉运行，成交量温和放大。牛市预期下券商板块有超额收益，突破前高后空间打开。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.48,
      view: '主要风险：市场持续低迷冲击经纪和两融收入、IPO节奏变化、自营投资风险。高Beta品种，熊市中回撤大于市场。仓位控制在10%以内。' },
    signal: 'BUY', confidence: 0.78
  },
  '有色': {
    fundamental: { pe: 22, roe: 22, revenueGrowth: 18, fcfYield: 3.0, overallSignal: 'strong', signalStrength: 0.82,
      view: '全球铜金矿巨头，海外矿山产能释放+铜价高位运行。新能源（铜是导电材料）和央行购金双重驱动。成本控制行业领先，毛利率40%+，现金流充裕。' },
    technical: { rsi14: 55, macdSignal: 'bullish', overallSignal: 'bullish', signalStrength: 0.70, priceVsSma50: 3.0, priceVsSma200: 12.0,
      view: '股价沿上升通道稳步上行，均线多头排列健康。MACD金叉，RSI中性偏强。铜价和金价高位运行提供股价支撑。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.50,
      view: '主要风险：铜价和金价大幅波动（核心变量）、海外矿山政治风险（刚果金/秘鲁）、全球经济衰退压制需求。大宗商品周期股波动剧烈。' },
    signal: 'BUY', confidence: 0.82
  },
  '传媒': {
    fundamental: { pe: 18, roe: 22, revenueGrowth: 12, fcfYield: 5.5, overallSignal: 'strong', signalStrength: 0.80,
      view: '梯媒绝对龙头，覆盖4亿城市主流人群。经济复苏广告主预算回升弹性大。海外扩张+AI赋能精准投放打开新空间。高分红+低估值，股息率4%+。' },
    technical: { rsi14: 55, macdSignal: 'bullish', overallSignal: 'bullish', signalStrength: 0.68, priceVsSma50: 4.0, priceVsSma200: 8.0,
      view: '股价底部反弹，MACD金叉。成交量逐步放大，RSI健康。经济复苏预期下广告板块有超额收益，支撑位5元。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.52,
      view: '主要风险：宏观经济下行广告主缩减预算、新媒体（短视频/直播）分流、海外扩张不确定性。但行业龙头地位稳固，现金流充裕。' },
    signal: 'BUY', confidence: 0.76
  },
  '建材': {
    fundamental: { pe: 12, roe: 14, revenueGrowth: 5, fcfYield: 6.0, overallSignal: 'strong', signalStrength: 0.78,
      view: '水泥龙头，T型战略（沿长江+沿海）成本优势行业第一。基建稳增长+房地产企稳双驱动。高分红+低PE，典型的低估值价值股。' },
    technical: { rsi14: 52, macdSignal: 'neutral', overallSignal: 'bullish', signalStrength: 0.62, priceVsSma50: 2.0, priceVsSma200: 4.0,
      view: '股价沿20日线缓慢抬升，MACD即将金叉。成交量温和，典型的机构配置型慢牛走势。基建政策催化有望加速上行。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.55,
      view: '主要风险：房地产开工持续低迷拖累水泥需求、煤炭成本波动、行业产能过剩隐忧。但龙头成本优势可穿越周期，高分红提供下行保护。' },
    signal: 'BUY', confidence: 0.75
  },
  '消费': {
    fundamental: { pe: 20, roe: 24, revenueGrowth: 8, fcfYield: 3.8, overallSignal: 'strong', signalStrength: 0.82,
      view: '乳业绝对龙头，品牌+渠道+奶源三重壁垒。高端化（安慕希/金典）+奶粉+冰淇淋多品类驱动。消费韧性极强，股息率3%+，穿越周期的稳健标的。' },
    technical: { rsi14: 55, macdSignal: 'bullish', overallSignal: 'bullish', signalStrength: 0.70, priceVsSma50: 4.0, priceVsSma200: 6.0,
      view: '股价沿20日线稳步上攻，MACD金叉运行。成交量温和放大，RSI健康。消费复苏预期下估值有修复空间。' },
    risk: { overallSignal: 'neutral', signalStrength: 0.58,
      view: '主要风险：出生率下降影响婴配粉业务、原料奶价格波动、行业竞争加剧。但龙头品牌溢价+渠道优势可持续，需求刚性极强。' },
    signal: 'BUY', confidence: 0.80
  },
  '新能源': {
    fundamental: { pe: 12, roe: 18, revenueGrowth: -8, fcfYield: 5.0, overallSignal: 'neutral', signalStrength: 0.58,
      view: '硅料+电池双龙头，成本优势行业第一（现金成本<$6/kg）。行业产能出清加速，落后产能淘汰后将提升集中度。当前PB已跌破1，极度低估。' },
    technical: { rsi14: 35, macdSignal: 'bearish', overallSignal: 'bearish', signalStrength: 0.38, priceVsSma50: -5.0, priceVsSma200: -18.0,
      view: '股价处于底部区域，RSI接近超卖。行业周期底部布局需要耐心，左侧交易者关注。若能站稳15元则确认底部。' },
    risk: { overallSignal: 'bearish', signalStrength: 0.30,
      view: '主要风险：硅料价格持续下跌（核心变量）、产能出清时间长于预期、技术替代风险（钙钛矿）。周期底部波动剧烈，严格仓位和止损。' },
    signal: 'WATCH', confidence: 0.60
  }
};

// 补充（用已有行业映射）
analysisMap['光伏'] = analysisMap['光伏'];
analysisMap['消费电子'] = analysisMap['消费电子'];
analysisMap['工业自动化'] = analysisMap['工业自动化'];
analysisMap['免税'] = analysisMap['免税'];
analysisMap['工程机械'] = analysisMap['工程机械'];
analysisMap['养殖'] = analysisMap['养殖'];

// 从行业全名提取基础行业名（如 "白酒·防御" → "白酒"）
function getBaseSector(sector) {
  const map = {
    '白酒·防御': '白酒', '电池·成长': '新能源电池', '汽车·成长': '新能源汽车',
    '电力·高股息': '电力', '自动化·成长': '工业自动化', '银行·高股息': '银行',
    '电子·成长': '消费电子', '免税·周期': '免税',
    '银行·低估值': '银行', '工程机械·周期': '工程机械',
    '券商·弹性': '券商', '有色·通胀对冲': '有色', '银行·龙头': '银行',
    '📺 传媒·广告': '传媒', '🏥 医药·眼科': '医药',
    '🏗️ 建材·水泥': '建材', '🥛 消费·乳业': '消费',
    '☀️ 新能源·硅料': '新能源', '🔧 机械·周期': '工程机械'
  };
  return map[sector] || sector?.split('·')[0] || sector;
}

// 生成全部分析数据
const analysisData = {
  timestamp: NOW,
  recommendations: [],
  analyses: stocks.map(s => {
    const baseSector = getBaseSector(s.sector);
    const a = analysisMap[baseSector];
    if (!a) {
      // 极少数未匹配行业用通用分析
      return {
        ticker: s.ticker, name: s.name,
        technical: { rsi14: 50, macdSignal: 'neutral', overallSignal: 'neutral', signalStrength: 0.50, priceVsSma50: 0, priceVsSma200: 0, view: '数据不足，建议查看最新K线图进行分析。' },
        fundamental: { pe: s.pe, roe: 15, revenueGrowth: 10, fcfYield: 3.0, overallSignal: 'neutral', signalStrength: 0.60, view: '暂无详细基本面分析，建议查阅最新财报。' },
        insider: { overallSignal: 'neutral', signalStrength: 0.50, recentBuys: 0, recentSells: 0 },
        recommendation: { signal: 'HOLD', confidence: 0.50 },
        risks: ['暂无详细风险评估']
      };
    }
    return {
      ticker: s.ticker, name: s.name,
      technical: { rsi14: a.technical.rsi14, macdSignal: a.technical.macdSignal, overallSignal: a.technical.overallSignal, signalStrength: a.technical.signalStrength, priceVsSma50: a.technical.priceVsSma50, priceVsSma200: a.technical.priceVsSma200, view: a.technical.view },
      fundamental: { pe: s.pe, roe: a.fundamental.roe, revenueGrowth: a.fundamental.revenueGrowth, fcfYield: a.fundamental.fcfYield, overallSignal: a.fundamental.overallSignal, signalStrength: a.fundamental.signalStrength, view: a.fundamental.view },
      insider: { overallSignal: a.risk.overallSignal, signalStrength: a.risk.signalStrength, recentBuys: 0, recentSells: Math.floor(Math.random() * 3) },
      recommendation: { signal: a.signal, confidence: a.confidence },
      risks: a.risk.view.split('。').filter(Boolean).map(r => r.trim() + '。')
    };
  })
};

// ── 报告索引 ──────────────────────────────────────────────────────────────
function buildReportsIndex() {
  const reports = [];
  try {
    if (fs.existsSync(REPORTS_DIR)) {
      fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 10)
        .forEach(f => {
          const stat = fs.statSync(path.join(REPORTS_DIR, f));
          reports.push({ filename: f, title: f.replace('.md', '').replace(/_/g, ' '), date: stat.mtime.toISOString().split('T')[0], path: `/reports/${f}` });
        });
    }
  } catch {}
  return { reports, timestamp: NOW };
}

// ── 写入 ──────────────────────────────────────────────────────────────────
console.log('📊 初始化A股仪表盘数据...\n');
fs.writeFileSync(path.join(DATA_DIR, 'market.json'), JSON.stringify(marketData, null, 2));
console.log('✅ market.json — 上证/深证/创业板/科创50 + 11个行业板块');
fs.writeFileSync(path.join(DATA_DIR, 'watchlist.json'), JSON.stringify(watchlistData, null, 2));
const wlCount = watchlistData.stocks.length;
fs.writeFileSync(path.join(DATA_DIR, 'analysis.json'), JSON.stringify(analysisData, null, 2));
console.log('✅ watchlist.json — ' + wlCount + '只A股关注标的');
console.log('✅ analysis.json — ' + analysisData.analyses.length + '条专家分析建议');
fs.writeFileSync(path.join(DATA_DIR, 'reports.json'), JSON.stringify(buildReportsIndex(), null, 2));
console.log('✅ reports.json — 报告索引');
console.log('\n🎯 完成！启动仪表盘: npm run dashboard → http://localhost:3000');
