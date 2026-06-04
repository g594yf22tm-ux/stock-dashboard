// Fetch ALL A-share stocks from Sina for comprehensive search
const http = require('http');
const iconv = require('iconv-lite');
const fs = require('fs');
const path = require('path');

function fetchPage(page) {
  return new Promise((resolve) => {
    const url = `http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=${page}&num=100&sort=symbol&asc=1&node=hs_a&symbol=`;
    http.get(url, {headers:{'User-Agent':'Mozilla/5.0','Referer':'https://finance.sina.com.cn/'}}, res => {
      let d=[];res.on('data',c=>d.push(c));res.on('end',()=>{
        try{
          const t=iconv.decode(Buffer.concat(d),'gbk');
          const json=JSON.parse(t);
          resolve(json.map(s=>{
            const r=s.symbol||'';
            return {c:r.startsWith('sh')?r.replace('sh','')+'.SS':r.replace('sz','')+'.SZ', n:s.name};
          }));
        }catch{resolve([])}
      });
    }).on('error',()=>resolve([]));
  });
}

async function main() {
  let all = [];
  // Fetch up to 60 pages (6000 stocks max)
  for (let p=1; p<=60; p++) {
    const stocks = await fetchPage(p);
    if (stocks.length === 0) break;
    all = all.concat(stocks);
    process.stdout.write(`\rPage ${p}: ${stocks.length} stocks, total ${all.length}`);
  }
  console.log('');

  // Filter: only 沪深主板/创业板/科创板, no 北交所
  const filtered = all.filter(s => {
    return s.c.match(/^(60[0-9]|00[0-9]|30[0-9]|688|68[0-9])/);
  });

  // Deduplicate
  const seen = new Set();
  const clean = filtered.filter(s => {
    if (seen.has(s.c)) return false;
    seen.add(s.c);
    return true;
  });

  console.log(`Total fetched: ${all.length}, filtered沪深: ${clean.length}`);

  const fp = path.join(__dirname, '..', 'dashboard', 'data', 'stock_list.json');
  fs.writeFileSync(fp, JSON.stringify(clean));
  const sz = (JSON.stringify(clean).length/1024).toFixed(1);
  console.log(`Saved to stock_list.json (${sz} KB)`);
}
main().catch(e=>console.error(e));
