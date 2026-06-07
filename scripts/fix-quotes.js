// fix-quotes.js — fix double-quote escaping in renderAnalysis
const fs = require('fs');

// Fix both files
for (const f of ['f:/Claude code test/dashboard/public/index.html', 'f:/Claude code test/index.html']) {
  let c = fs.readFileSync(f, 'utf8');

  // Fix 1: The broken line with unescaped quotes in no-data div
  // Find: el.innerHTML = "<div class="no-data"...
  // Replace with: el.innerHTML = '<div class="no-data"...
  const bad1 = 'el.innerHTML = "<div class="no-data" style="grid-column:1/-1">';
  const good1 = "el.innerHTML = '<div class=\"no-data\" style=\"grid-column:1/-1\">";
  if (c.includes(bad1)) {
    c = c.split(bad1).join(good1);
    console.log(f.split('/').pop() + ': Fixed no-data line');
  }

  // Fix 2: Any remaining " inside " strings in the renderAnalysis function
  // Find all lines with pattern: "<tag ...class="....">"  where outer quotes are "
  // Strategy: find the renderAnalysis function and fix all inner-HTML strings
  const fnStart = c.indexOf('function renderAnalysis(recommendations) {');
  const fnEnd = c.indexOf('}).join("");', fnStart) + '}).join("");'.length;

  if (fnStart > 0) {
    let fn = c.substring(fnStart, fnEnd);

    // Fix: replace "</div>" with '</div>' in JS string context
    fn = fn.replace(/">暂无分析数据/g, "'>暂无分析数据");

    // The main pattern: "> ... </div>" inside JS " strings
    // Fix by changing outer double quotes to single quotes where there are inner double quotes

    // Key fix: function uses a mix of " and ' — let's standardize:
    // Any string that contains class=" must have its outer quotes changed from " to '
    // Pattern: "...class="value"..."
    fn = fn.replace(/"([^"]*class="[^"]*"[^"]*)"/g, function(match, inner) {
      // Change outer quotes to single quotes, keep inner double quotes
      return "'" + inner + "'";
    });

    c = c.substring(0, fnStart) + fn + c.substring(fnEnd);
    console.log(f.split('/').pop() + ': Fixed inner quotes in renderAnalysis');
  }

  fs.writeFileSync(f, c);
}
console.log('\nDone');
