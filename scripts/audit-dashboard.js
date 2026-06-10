// Audit the dashboard page for optimization opportunities
const fs = require('fs');
const html = fs.readFileSync('f:/Claude code test/dashboard/public/index.html', 'utf8');

const issues = [];

// ── 1. CSS Analysis ──
const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const css = cssMatch ? cssMatch[1] : '';

// Find truly duplicate CSS rules
const ruleMap = new Map();
const cssRules = css.match(/[^{}]+\{[^{}]+\}/g) || [];
cssRules.forEach(rule => {
  const parts = rule.split('{');
  const selector = parts[0].trim();
  const body = parts[1].replace('}','').trim();
  const key = selector + '::' + body;
  if (ruleMap.has(key)) issues.push('DUPLICATE: ' + selector + ' { ' + body.substring(0,80) + ' }');
  ruleMap.set(key, true);
});

// Count conflicting selectors
const selRules = new Map();
cssRules.forEach(rule => {
  const parts = rule.split('{');
  const selector = parts[0].trim();
  const body = parts[1].replace('}','').trim();
  if (!selRules.has(selector)) selRules.set(selector, []);
  selRules.get(selector).push(body);
});
const conflicts = [...selRules.entries()].filter(([,v]) => v.length > 1);
console.log('=== CONFLICTING CSS SELECTORS (' + conflicts.length + ') ===');
conflicts.forEach(([s,v]) => console.log('  ' + s + ': ' + v.length + ' definitions'));

// ── 2. Check inline styles ──
const inlineStyles = (html.match(/style="/g) || []).length;
console.log('\nInline styles: ' + inlineStyles);

// ── 3. Loading placeholders ──
const loadingDivs = (html.match(/加载中\.\.\./g) || []).length;
console.log('"加载中..." placeholders: ' + loadingDivs);

// ── 4. JS patterns ──
const innerHTMLCounts = (html.match(/innerHTML\s*=/g) || []).length;
const onclickCounts = (html.match(/onclick=/g) || []).length;
const tryCatchCount = (html.match(/try\s*\{/g) || []).length;
console.log('innerHTML usage: ' + innerHTMLCounts);
console.log('onclick handlers: ' + onclickCounts);
console.log('try/catch blocks: ' + tryCatchCount);

// ── 5. Hardcoded colors ──
const hardHex = html.match(/#[0-9a-fA-F]{6}(?!\w)/g) || [];
const uniqueHex = [...new Set(hardHex)];
console.log('Hardcoded hex colors: ' + uniqueHex.length + ' unique');
uniqueHex.forEach(h => console.log('  ' + h));

// ── 6. Check for large data embeds ──
if (html.includes('EMBEDDED_REPORTS')) console.log('Has embedded reports list');
if (html.includes('_extQuotes')) console.log('Has extension quotes handler');

// ── 7. Missing optimizations ──
if (!html.includes('loading="lazy"')) console.log('MISSING: lazy loading on images');
if (!html.includes('defer') && !html.includes('async')) console.log('MISSING: script defer/async');
if (!html.includes('will-change')) console.log('MISSING: will-change for animations');
if (!html.includes('content-visibility')) console.log('MISSING: content-visibility optimization');

// ── 8. Meta tags ──
const metaCount = (html.match(/<meta /g) || []).length;
console.log('Meta tags: ' + metaCount);

// ── 9. Check for the renderAnalysis data compatibility ──
console.log('\n=== DATA COMPATIBILITY ===');
const hasAnalysis = html.includes('renderAnalysis');
const hasSignalScore = html.includes('_signalScore');
console.log('renderAnalysis defined: ' + hasAnalysis);
console.log('_signalScore fallback: ' + hasSignalScore);

// ── 10. Search for specific bug patterns ──
const brokenEscapes = html.match(/\\[^\\'\"nrtbfv\/0ux]/g);
if (brokenEscapes) console.log('WARNING: Suspicious escape sequences found: ' + brokenEscapes.length);
