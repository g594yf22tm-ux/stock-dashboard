// polish-css.js — 注入精致视觉细节CSS
const fs = require('fs');
const f = 'f:/Claude code test/dashboard/public/index.html';
let c = fs.readFileSync(f, 'utf8');

const polish = `
    /* 精致细节 */
    .card { border: 1px solid var(--border); position: relative; }
    .card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
      background: linear-gradient(90deg, transparent, var(--primary), transparent); opacity: 0.4; }
    .card-title { font-weight: 600; letter-spacing: 0.01em; }
    table { border-collapse: separate; border-spacing: 0; }
    th { font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; font-size: 0.72em; }
    td { font-size: 0.85em; }
    .badge { transition: all 0.2s ease; }
    .badge.buy { background: var(--up-bg); color: var(--up); border: 1px solid var(--up-border); }
    .badge.hold { background: var(--accent-bg); color: var(--accent); border: 1px solid rgba(245,158,11,0.3); }
    .badge.watch { background: rgba(107,114,128,0.1); color: var(--text-secondary); border: 1px solid rgba(107,114,128,0.2); }
    .btn { transition: all 0.15s ease; }
    .btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
    .btn:active { transform: translateY(0); }
    .search-box:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-bg); }
    #watchlistBody tr, #favBody tr { transition: background 0.15s; }
    .detail-metric:hover { background: var(--surface); border-color: var(--primary); }
    .detail-metric { transition: all 0.15s; border: 1px solid transparent; }
    @keyframes shimmer { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
    .search-results .result-item { transition: background 0.12s; border-left: 2px solid transparent; }
    .search-results .result-item:hover { border-left-color: var(--primary); }
    hr { border-color: var(--border); opacity: 0.5; }
    .loading { color: var(--text-secondary); }
`;

const cssEnd = '</style>';
c = c.replace(cssEnd, polish + '\n  ' + cssEnd);
fs.writeFileSync(f, c);
console.log('✓ 精致细节CSS已注入');
console.log('文件: ' + c.length + ' 字符');
