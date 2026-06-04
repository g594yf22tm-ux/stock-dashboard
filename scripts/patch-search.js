const fs = require('fs');
const path = require('path');
const htmlPath = path.join(__dirname, '..', 'dashboard', 'public', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Insert pinyin initial helper before clientSearch
const pyHelper = `
// 拼音首字母搜索辅助
function pyMatch(name, q) {
  if (!name) return false;
  let py = '';
  const map = {
    '中':'z','牧':'m','股':'g','份':'f','贵':'g','州':'z','茅':'m','台':'t','五':'w','粮':'l','液':'y',
    '招':'z','商':'s','银':'y','行':'h','平':'p','安':'a','浦':'p','发':'f','民':'m','生':'s','兴':'x','业':'y',
    '华':'h','夏':'x','建':'j','设':'s','工':'g','农':'n','交':'j','通':'t','邮':'y','储':'c',
    '海':'h','国':'g','泰':'t','君':'j','光':'g','大':'d','申':'s','万':'w','宏':'h','源':'y','东':'d',
    '方':'f','广':'g','长':'c','江':'j','电':'d','力':'l','三':'s','一':'y','重':'z','工':'g','徐':'x',
    '上':'s','汽':'q','集':'j','团':'t','北':'b','京':'j','车':'c','比':'b','亚':'y','迪':'d',
    '宁':'n','德':'d','时':'s','代':'d','阳':'y','光':'g','隆':'l','基':'j','绿':'l','通':'t','威':'w',
    '药':'y','明':'m','康':'k','恒':'h','瑞':'r','医':'y','复':'f','星':'x','片':'p','仔':'z','癀':'h',
    '同':'t','仁':'r','堂':'t','白':'b','云':'y','山':'s','尔':'e','眼':'y','科':'k','迈':'m','智':'z',
    '飞':'f','生':'s','物':'w','春':'c','高':'g','新':'x','兰':'l','莱':'l','士':'s','原':'y','温':'w','氏':'s',
    '双':'s','汇':'h','金':'j','龙':'l','鱼':'y','天':'t','味':'w','洋':'y','河':'h','泸':'l','老':'l','窖':'j',
    '古':'g','井':'j','贡':'g','山':'s','西':'x','汾':'f','科':'k','万':'w','保':'b','利':'l','蛇':'s',
    '筑':'z','铁':'t','电':'d','核':'h','石':'s','油':'y','化':'h','神':'s','煤':'m','兖':'y','矿':'k',
    '紫':'z','洛':'l','钼':'m','江':'j','铜':'t','云':'y','铝':'l','南':'n',
    '宝':'b','钢':'g','鞍':'a','首':'s','包':'b','太':'t','锈':'x','马':'m',
    '螺':'l','水':'s','泥':'n','冀':'j','年':'n','伊':'y','蒙':'m','牛':'n','明':'m','元':'y','贝':'b','因':'y','美':'m',
    '分':'f','众':'z','传':'c','媒':'m','芒':'g','果':'g','超':'c','线':'x','谊':'y',
    '顺':'s','花':'h','财':'c','富':'f','慧':'h','网':'w','络':'l','办':'b','公':'g','讯':'x',
    '康':'k','威':'w','视':'s','紫':'z','浪':'l','潮':'c','曙':'s','创':'c','微':'w','尔':'e','兆':'z','易':'y',
    '卓':'z','胜':'s','歌':'g','立':'l','讯':'x','精':'j','密':'m','蓝':'l','思':'s',
    'T':'t','C':'c','L':'l','深':'s','马':'m','维':'w','诺':'n',
    '汇':'h','川':'c','先':'x','导':'d','晶':'j','盛':'s','锦':'j','固':'g',
    '赐':'c','材':'c','料':'l','恩':'e','捷':'j','璞':'p','泰':'t','来':'l','杉':'s','当':'d','升':'s',
    '容':'r','百':'b','方':'f','碳':'t','翔':'x','丰':'f','鲁':'l',
    '力':'l','荣':'r','虹':'h','卫':'w','学':'x','佰':'b','和':'h','成':'c','浙':'z','龙':'l',
    '阿':'a','胶':'j','应':'y','健':'j','民':'m','九':'j','芝':'z',
    '润':'r','昆':'k','以':'y','岭':'l','人':'r','寿':'s','保':'b','险':'x',
    '移':'y','动':'d','联':'l','信':'x','控':'k','圆':'y','韵':'y','达':'d','邦':'b',
    '航':'h','空':'k','秋':'q','吉':'j','祥':'x','机':'j','场':'c','圳':'z',
    '免':'m','王':'w','府':'f','百':'b','红':'h','旗':'q','连':'l',
    '辉':'h','超':'c','市':'s','家':'j','悦':'y','步':'b','江':'j',
    '船':'c','舶':'b','发':'f','沈':'s','西':'x',
    '能':'n','源':'y','汽':'q','伏':'f','风':'f','储':'c',
    '东':'d','阿':'a','黑':'h','牡':'m','丹':'d','大':'d','连':'l','青':'q','岛':'d',
    '烟':'y','台':'t','威':'w','日':'r','照':'z','临':'l','沂':'y','德':'d','州':'z',
    '聊':'l','城':'c','滨':'b','菏':'h','泽':'z','济':'j','宁':'n','泰':'t','安':'a',
    '莱':'l','芜':'w','淄':'z','博':'b','枣':'z','庄':'z','东':'d','营':'y',
    '郑':'z','开':'k','封':'f','洛':'l','阳':'y','平':'p','顶':'d','安':'a','鹤':'h','壁':'b',
    '新':'x','乡':'x','焦':'j','濮':'p','许':'x','漯':'l','河':'h','三':'s','门':'m','峡':'x',
    '商':'s','丘':'q','周':'z','口':'k','驻':'z','马':'m','店':'d','南':'n','信':'x',
    '武':'w','汉':'h','黄':'h','石':'s','十':'s','堰':'y','宜':'y','昌':'c','襄':'x','樊':'f',
    '鄂':'e','荆':'j','孝':'x','黄':'h','冈':'g','咸':'x','随':'s','恩':'e','施':'s',
    '长':'c','沙':'s','株':'z','湘':'x','潭':'t','衡':'h','邵':'s','岳':'y','常':'c','张':'z',
    '益':'y','郴':'c','永':'y','怀':'h','娄':'l','底':'d',
    '成':'c','都':'d','自':'z','贡':'g','攀':'p','枝':'z','泸':'l','德':'d','绵':'m','广':'g',
    '遂':'s','内':'n','乐':'l','南':'n','眉':'m','宜':'y','广':'g','达':'d','雅':'y','巴':'b',
    '资':'z','阿':'a','甘':'g','凉':'l','贵':'g','六':'l','盘':'p','遵':'z','安':'a','毕':'b',
    '铜':'t','黔':'q','西':'x','昆':'k','曲':'q','玉':'y','保':'b','昭':'z','丽':'l',
    '普':'p','临':'l','楚':'c','红':'h','文':'w','大':'d','怒':'n','迪':'d'
  };
  for (const ch of name) {
    py += map[ch] || '';
  }
  const ql = q.toLowerCase();
  return py.startsWith(ql) || py.includes(ql);
}
`;

// Insert before clientSearch
const clientIdx = html.indexOf('function clientSearch(q)');
html = html.substring(0, clientIdx) + pyHelper + '\n' + html.substring(clientIdx);

// Now update clientSearch to use pyMatch
// Replace matchName lines to also include pyMatch
html = html.replace(
  /const matchName\s*=\s*\(s\.name\|\|''\)\.toLowerCase\(\)\.includes\(ql\)\s*\|\|\s*\(s\.name\|\|''\)\.includes\(q\);/g,
  'const matchName = (s.name||\'\').toLowerCase().includes(ql) || (s.name||\'\').includes(q); const matchPy = pyMatch(s.name, q);'
);

html = html.replace(
  /if\s*\(matchCode\s*\|\|\s*matchName\)\s*\{([^}]*?)seen\.add\(s\.ticker\);/g,
  'if (matchCode || matchName || matchPy) {$1seen.add(s.ticker);'
);

// Also add pyMatch to the STOCK_DB loop
html = html.replace(
  /const matchName\s*=\s*\(s\.n\|\|''\)\.includes\(q\)\s*\|\|\s*\(s\.n\|\|''\)\.toLowerCase\(\)\.includes\(ql\);/g,
  'const matchName = (s.n||\'\').includes(q) || (s.n||\'\').toLowerCase().includes(ql); const matchPy2 = pyMatch(s.n, q);'
);

html = html.replace(
  /if\s*\(matchCode\s*\|\|\s*matchName\)\s*\{([^}]*?)seen\.add\(s\.c\);/g,
  'if (matchCode || matchName || matchPy2) {$1seen.add(s.c);'
);

fs.writeFileSync(htmlPath, html, 'utf8');

// Verify
const sm = html.match(/<script>([\s\S]*?)<\/script>/);
if (sm) {
  try { new Function(sm[1]); console.log('✅ JS OK'); }
  catch(e) { console.log('❌', e.message.substring(0, 80)); }
}
console.log('Has pyMatch:', html.includes('function pyMatch'));
console.log('Has matchPy:', html.includes('matchPy'));
console.log('Size:', (html.length/1024).toFixed(1), 'KB');
