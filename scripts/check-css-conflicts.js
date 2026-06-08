const fs = require('fs');
const html = fs.readFileSync('f:/Claude code test/dashboard/public/index.html', 'utf8');
const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const css = cssMatch[1];

const selectors = ['.card', '.card-title', '.btn', '.detail-panel', '.detail-grid', '.search-box', '.analysis-grid', '.container', '.header', 'table', 'th', 'td', '.badge'];
selectors.forEach(sel => {
  const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('[^}]*' + escaped + '[^{]*\\{[^}]+\\}', 'gi');
  const matches = css.match(re) || [];
  console.log('--- ' + sel + ' (' + matches.length + ' rules) ---');
  matches.forEach(m => console.log('  ' + m.trim().substring(0, 150)));
  console.log('');
});
