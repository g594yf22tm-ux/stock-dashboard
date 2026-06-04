const fs = require('fs');
const path = require('path');

const claudePath = path.join(__dirname, '..', 'CLAUDE.md');
let claude = fs.readFileSync(claudePath, 'utf8');

const pwSection = `

## Playwright

修改任何前端代码(HTML/JS/CSS)或 API 后必须运行:

    npm run visual-check

验证: 主仪表盘/standalone/报告浏览/报告查看/搜索/详情弹窗
未通过即修复直到通过。使用系统Edge浏览器。
`;

if (!claude.includes('Playwright')) {
  // Insert after the "快速开始" section or at the end
  const quickStartIdx = claude.indexOf('## 快速开始');
  if (quickStartIdx > 0) {
    claude = claude.substring(0, quickStartIdx) + pwSection + '\n' + claude.substring(quickStartIdx);
  } else {
    claude += pwSection;
  }
  fs.writeFileSync(claudePath, claude, 'utf8');
  console.log('CLAUDE.md updated with Playwright section');
} else {
  console.log('Playwright section already exists');
}
