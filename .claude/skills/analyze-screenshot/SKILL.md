---
name: analyze-screenshot
description: |
  截图分析 — 通过 OCR 识别股票截图中的文字和数据（K线图、分时图、自选列表、财务数据等），
  提取关键信息并用 MCP 工具交叉验证，输出分析。
  使用场景：用户截取股票软件画面后需要分析解读。
  关键词触发：分析截图、看看这张图、帮我读一下、这个图、截图分析
argument-hint: "[图片文件名 或 留空查看全部截图]"
user-invocable: true
disable-model-invocation: false
allowed-tools: Read, Write, Bash, mcp__yfinance__*, mcp__openinsider__*, mcp__fmp__*, Glob
model: sonnet
context: fork
---

# 截图分析

通过 OCR（光学字符识别）从股票软件截图中提取文字和数据，然后用 MCP 数据源交叉验证。

## 工作流程

### Step 1: 图片压缩
运行压缩脚本（图片不能太大，否则 OCR 识别不准）：
```
node scripts/resize-screenshot.js
```
处理后的图片在 `screenshots/processed/` 目录下，文件名带 `_1000px.jpg` 后缀。

### Step 2: OCR 文字识别
运行 OCR 脚本，从截图中提取文字和数据：
```
node scripts/ocr-screenshot.js
```
这会输出：
- 🎯 检测到的股票代码
- 💰 检测到的价格数据
- 📊 检测到的涨跌幅
- 📝 完整识别文本

### Step 3: 分析识别结果
从 OCR 输出中提取关键信息：
- **股票代码**: 如 002195, AAPL, 600519.SS 等
- **价格数据**: 当前价、涨跌幅、成交量
- **技术指标**: MA5/MA10/MA20, MACD, RSI, KDJ 等数值
- **基本面数据**: PE, PB, ROE, 市值等
- **资金流向**: 主力净流入、大单等
- **基金持仓**: 基金家数、持股数

### Step 4: MCP 交叉验证（重要！）
OCR 识别可能不完美，用 MCP 工具拉取真实数据确认：
- 如果识别到股票代码 → 用 yfinance `get_stock_price` 确认当前价格
- 如果识别到技术指标 → 用 fmp `getTechnicalIndicator` 获取准确数值
- 如果识别到基本面 → 用 fmp 或 yfinance 获取最新财报数据

### Step 5: 综合分析输出
```markdown
## 📸 截图分析结果

### 识别到的股票
| 代码 | 名称 | 当前价 | 涨跌幅 |
|------|------|--------|--------|

### 技术面数据
[从截图中提取的指标数值]

### 交叉验证
| 数据项 | 截图值 | MCP确认值 | 是否一致 |
|--------|--------|-----------|----------|

### 分析
[基于截图数据 + MCP 验证的综合分析]
```

## 注意事项
- OCR 对中文和复杂表格的识别准确率约 30-60%，关键数字务必用 MCP 交叉验证
- 优先使用 `node scripts/resize-screenshot.js` 而非 PowerShell 版本（Node.js 版更可靠）
- 截图中的 K 线形态无法通过 OCR 识别，需用户补充描述（如"头肩顶"、"金叉"等）
