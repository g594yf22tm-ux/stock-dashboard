// Rebuild the search section of index.html with lazy-loaded stock DB
const fs = require('fs');
const path = require('path');
const htmlPath = path.join(__dirname, '..', 'dashboard', 'public', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Find the STOCK_DB inline array and replace with lazy loading
const dbStart = html.indexOf('const STOCK_DB = [');
const dbEnd = html.indexOf('];', dbStart) + 2;

if (dbStart < 0 || dbEnd < 2) {
  console.log('STOCK_DB not found');
  process.exit(1);
}

// Replace with lazy-loading version
const newDB = `
// 全量A股股票库 — CDN按需加载(5207只沪深股票)
let STOCK_DB = [];
let _stockDBLoaded = false;
async function loadStockDB() {
  if (_stockDBLoaded) return;
  try {
    const r = await fetch(CDN + '/../stock_list.json', { cache: 'force-cache' });
    if (r.ok) {
      const data = await r.json();
      STOCK_DB = data;
      _stockDBLoaded = true;
      console.log('股票库加载完成:', STOCK_DB.length, '只');
    }
  } catch(e) { console.error('股票库加载失败:', e.message); }
}
// 轻量内嵌股票库（首屏快速搜索，100只常用股）
const STOCK_FAST = [{c:'600000.SS',n:'浦发银行'},{c:'600009.SS',n:'上海机场'},{c:'600015.SS',n:'华夏银行'},{c:'600016.SS',n:'民生银行'},{c:'600028.SS',n:'中国石化'},{c:'600029.SS',n:'南方航空'},{c:'600030.SS',n:'中信证券'},{c:'600031.SS',n:'三一重工'},{c:'600036.SS',n:'招商银行'},{c:'600048.SS',n:'保利发展'},{c:'600050.SS',n:'中国联通'},{c:'600085.SS',n:'同仁堂'},{c:'600104.SS',n:'上汽集团'},{c:'600111.SS',n:'北方稀土'},{c:'600150.SS',n:'中国船舶'},{c:'600188.SS',n:'兖矿能源'},{c:'600195.SS',n:'中牧股份'},{c:'600196.SS',n:'复星医药'},{c:'600276.SS',n:'恒瑞医药'},{c:'600309.SS',n:'万华化学'},{c:'600406.SS',n:'国电南瑞'},{c:'600436.SS',n:'片仔癀'},{c:'600438.SS',n:'通威股份'},{c:'600519.SS',n:'贵州茅台'},{c:'600547.SS',n:'山东黄金'},{c:'600570.SS',n:'恒生电子'},{c:'600585.SS',n:'海螺水泥'},{c:'600690.SS',n:'海尔智家'},{c:'600809.SS',n:'山西汾酒'},{c:'600837.SS',n:'海通证券'},{c:'600887.SS',n:'伊利股份'},{c:'600900.SS',n:'长江电力'},{c:'600941.SS',n:'中国移动'},{c:'601012.SS',n:'隆基绿能'},{c:'601088.SS',n:'中国神华'},{c:'601111.SS',n:'中国国航'},{c:'601138.SS',n:'工业富联'},{c:'601166.SS',n:'兴业银行'},{c:'601288.SS',n:'农业银行'},{c:'601318.SS',n:'中国平安'},{c:'601398.SS',n:'工商银行'},{c:'601628.SS',n:'中国人寿'},{c:'601633.SS',n:'长城汽车'},{c:'601668.SS',n:'中国建筑'},{c:'601688.SS',n:'华泰证券'},{c:'601728.SS',n:'中国电信'},{c:'601857.SS',n:'中国石油'},{c:'601888.SS',n:'中国中免'},{c:'601899.SS',n:'紫金矿业'},{c:'601919.SS',n:'中远海控'},{c:'601939.SS',n:'建设银行'},{c:'601988.SS',n:'中国银行'},{c:'603259.SS',n:'药明康德'},{c:'603288.SS',n:'海天味业'},{c:'688981.SS',n:'中芯国际'},{c:'000001.SZ',n:'平安银行'},{c:'000002.SZ',n:'万科A'},{c:'000063.SZ',n:'中兴通讯'},{c:'000100.SZ',n:'TCL科技'},{c:'000333.SZ',n:'美的集团'},{c:'000538.SZ',n:'云南白药'},{c:'000568.SZ',n:'泸州老窖'},{c:'000625.SZ',n:'长安汽车'},{c:'000651.SZ',n:'格力电器'},{c:'000725.SZ',n:'京东方A'},{c:'000858.SZ',n:'五粮液'},{c:'000876.SZ',n:'新希望'},{c:'000895.SZ',n:'双汇发展'},{c:'000938.SZ',n:'紫光股份'},{c:'000977.SZ',n:'浪潮信息'},{c:'002007.SZ',n:'华兰生物'},{c:'002027.SZ',n:'分众传媒'},{c:'002049.SZ',n:'紫光国微'},{c:'002142.SZ',n:'宁波银行'},{c:'002195.SZ',n:'岩山科技'},{c:'002230.SZ',n:'科大讯飞'},{c:'002241.SZ',n:'歌尔股份'},{c:'002271.SZ',n:'东方雨虹'},{c:'002304.SZ',n:'洋河股份'},{c:'002352.SZ',n:'顺丰控股'},{c:'002371.SZ',n:'北方华创'},{c:'002415.SZ',n:'海康威视'},{c:'002459.SZ',n:'晶澳科技'},{c:'002460.SZ',n:'赣锋锂业'},{c:'002466.SZ',n:'天齐锂业'},{c:'002475.SZ',n:'立讯精密'},{c:'002594.SZ',n:'比亚迪'},{c:'002714.SZ',n:'牧原股份'},{c:'002736.SZ',n:'国信证券'},{c:'300014.SZ',n:'亿纬锂能'},{c:'300015.SZ',n:'爱尔眼科'},{c:'300033.SZ',n:'同花顺'},{c:'300059.SZ',n:'东方财富'},{c:'300122.SZ',n:'智飞生物'},{c:'300124.SZ',n:'汇川技术'},{c:'300274.SZ',n:'阳光电源'},{c:'300498.SZ',n:'温氏股份'},{c:'300750.SZ',n:'宁德时代'},{c:'300760.SZ',n:'迈瑞医疗'}];
`;

html = html.substring(0, dbStart) + newDB + html.substring(dbEnd);

// Update clientSearch to use STOCK_FAST initially, then STOCK_DB after loaded
html = html.replace(
  'for (const s of STOCK_DB) {',
  'for (const s of (_stockDBLoaded ? STOCK_DB : STOCK_FAST)) {'
);

// Trigger loadStockDB on first search input
html = html.replace(
  "searchTimer = setTimeout(() => doSearch(q), 250);",
  "searchTimer = setTimeout(() => { loadStockDB(); doSearch(q); }, 250);"
);

fs.writeFileSync(htmlPath, html, 'utf8');

// Verify
const sm = html.match(/<script>([\s\S]*?)<\/script>/);
if (sm) {
  try { new Function(sm[1]); console.log('✅ JS OK'); }
  catch(e) { console.log('❌', e.message.substring(0, 80)); process.exit(1); }
}
console.log('Size:', (html.length/1024).toFixed(1), 'KB');
console.log('Has loadStockDB:', html.includes('loadStockDB'));
console.log('Has STOCK_FAST:', html.includes('STOCK_FAST'));
console.log('Has _stockDBLoaded:', html.includes('_stockDBLoaded'));
