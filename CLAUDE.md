# 股票分析团队 — Claude Code 操作手册

## 项目概述

本仓库是专业股票分析团队的 AI 辅助工作区。通过 MCP (Model Context Protocol) 接入了多个金融数据服务端，支持美股、A股、港股的深度分析。所有分析报告遵循标准化流程输出到 `reports/` 目录。

---

## 目录结构

```
f:\Claude code test\
├── reports/            # 📄 最终分析报告 (Markdown)
├── data/               # 📊 缓存的原始市场数据
├── analysis/           # 🔬 中间分析产物
├── models/             # 🧮 估值模型 (DCF等)
├── portfolio/          # 💼 投资组合持仓数据
├── screenshots/        # 📸 截图分析素材
├── scripts/            # 🔧 辅助脚本
├── dashboard/          # 📊 Web 仪表盘
│   ├── server.js           # Express 服务器
│   ├── public/index.html   # 仪表盘前端界面
│   ├── config/             # 关注列表和UI配置
│   └── data/               # 缓存行情数据
├── .claude/
│   ├── settings.json       # 项目配置（权限/Hook/模型）
│   ├── settings.local.json # 本地覆盖（API Key，不提交Git）
│   ├── agents/             # 团队子代理定义
│   └── skills/             # 团队共享技能
├── .mcp.json           # MCP 数据服务端配置
├── .gitignore
└── CLAUDE.md           # 本文件 — 团队操作手册
```

---

## 股票代码格式规范

| 市场 | 格式 | 示例 |
|------|------|------|
| 美股 | 直接使用 Ticker | `AAPL`, `MSFT`, `GOOGL`, `TSLA`, `NVDA` |
| A股（上海） | `代码.SS` | `600519.SS` (贵州茅台), `601318.SS` (中国平安) |
| A股（深圳） | `代码.SZ` | `000001.SZ` (平安银行), `300750.SZ` (宁德时代) |
| 港股 | `代码.HK` | `9988.HK` (阿里巴巴), `0700.HK` (腾讯) |
| 指数 | Ticker | `^GSPC` (标普500), `^IXIC` (纳斯达克), `^HSI` (恒生) |

> ⚠️ **注意**: yfinance 对中国股票的支持有限（雅虎财经数据源限制）。A股/港股深度分析时优先使用 FMP 的数据，或后续接入东方财富 MCP 服务端。

---

## 可用数据源 (MCP 工具速查)

### yfinance (Yahoo Finance — 免费，无需 API Key)

| 工具名 | 功能 | 常用参数 |
|--------|------|----------|
| `get_stock_summary` | 股票基本信息概览 | ticker |
| `get_stock_price` | 实时价格 | ticker |
| `get_historical_prices` | 历史行情数据 | ticker, period, interval |
| `get_financials` | 财务报表（利润表/资产负债/现金流） | ticker |
| `get_key_statistics` | 关键统计指标 | ticker |
| `get_analyst_recommendations` | 分析师评级 | ticker |
| `get_earnings_history` | 历史盈利数据 | ticker |
| `get_earnings_calendar` | 财报日历 | ticker |
| `get_options_chain` | 期权链数据 | ticker, expiration |
| `get_news` | 相关新闻 | ticker |
| `get_insider_transactions` | 内部人交易记录 | ticker |
| `get_institutional_holders` | 机构持仓 | ticker |
| `get_recommendations_trend` | 分析师评级趋势 | ticker |
| `get_sustainability_scores` | ESG 可持续性评分 | ticker |
| `search_ticker` | 搜索股票代码 | query |
| `get_market_summary` | 市场概览 | — |
| `get_sector_performance` | 板块表现 | — |
| `get_top_gainers` | 涨幅榜 | — |
| `get_top_losers` | 跌幅榜 | — |
| `get_dividend_history` | 分红历史 | ticker |

### openinsider (内部交易 — 免费)

| 工具名 | 功能 |
|--------|------|
| `search_by_ticker` | 按股票代码搜索内部交易 |
| `cluster_buys` | 集群买入检测（最可靠的内幕信号） |
| `cluster_sells` | 集群卖出检测 |
| `short_interest` | 空头持仓数据 |
| `insider_trend` | 内部交易总体趋势 |
| `congressional_trades` | 国会成员交易记录 |
| `hedge_fund_holdings` | 对冲基金持仓（13F） |
| `get_form4` | SEC Form 4 详细数据 |
| `get_8k_filings` | 重大事件报告 (8-K) |
| `get_13d_filings` | 大股东声明 (13D/G) |
| `get_cik` | 查询公司 CIK 代码 |
| `get_company_cik` | 公司 → CIK 映射 |
| `get_owner_transactions` | 特定内部人交易记录 |
| `get_recent_filings` | 最近的 SEC 文件 |
| `get_latest_insider_summary` | 最新内部人摘要 |
| `get_all_companies` | 可用公司列表 |

### fmp (Financial Modeling Prep — 需 API Key)

| 工具名 | 功能 |
|--------|------|
| `getCompanyProfile` | 公司基本档案 |
| `getIncomeStatement` | 利润表 |
| `getBalanceSheet` | 资产负债表 |
| `getCashFlowStatement` | 现金流量表 |
| `getFinancialRatios` | 财务比率（PE/PB/ROE/ROA/Debt-to-Equity等） |
| `getKeyMetrics` | 关键指标（含 TTM） |
| `getDCF` | DCF 估值模型 |
| `getAnalystEstimates` | 分析师预测 |
| `getPriceTarget` | 目标价汇总 |
| `getRating` | 分析师综合评级 |
| `getEnterpriseValue` | 企业价值 |
| `getHistoricalMarketCap` | 历史市值 |
| `getStockScreener` | 股票筛选器 |
| `getEarningsCalendar` | 财报日历 |
| `getEarningsSurprises` | 盈利超预期/不及预期历史 |
| `getHistoricalRatios` | 历史财务比率 |
| `getFullQuote` | 完整报价 |
| `getSectorPerformance` | 板块表现 |
| `getMarketGainers` | 市场涨幅榜 |
| `getMarketLosers` | 市场跌幅榜 |
| `getTechnicalIndicator` | 技术指标（RSI/MACD/布林带/SMA/EMA等） |
| `getCongresionalTrading` | 国会交易 |
| `getInsiderTrading` | 内部交易 |
| `getETFHolders` | ETF 持仓 |
| `getInstitutionalHolders` | 机构持仓 |
| `getSupplementalData` | 补充数据（国际化） |
| `getFinancialGrowth` | 财务增长指标 |
| `getOwnerEarnings` | 所有者收益（巴菲特指标） |
| `getEnterpriseValues` | 企业价值倍数 |

---

## 核心工作流

### 🔍 个股深度分析 `/deep-dive-analysis`

完整流程：数据采集 → 基本面分析 → 技术面分析 → 风险评估 → 综合报告

```
用户: /deep-dive-analysis AAPL
→ data-engineer 代理: 从 yfinance + fmp + openinsider 获取全面数据
→ fundamental-analyst 代理: DCF估值、杜邦分析、FCF趋势、可比公司
→ technical-analyst 代理: RSI/MACD/布林带、多时间框架、支撑阻力
→ risk-manager 代理: 个股风险评估
→ report-writer 代理: 整合输出到 reports/AAPL_deep_dive_YYYY-MM-DD.md
```

### 📊 行业扫描 `/sector-scan`

筛选特定行业的被低估标的。

```
用户: /sector-scan 半导体 RSI<40 PEG<1.5
→ 获取板块所有股票
→ 按条件筛选排序
→ 输出 Top 10 关注列表
```

### 💼 投资组合审查 `/portfolio-review`

检查投资组合健康度。

```
用户: /portfolio-review
→ 读取 portfolio/ 持仓数据
→ 计算集中度(HHI)、贝塔、行业分布
→ 运行压力测试（2008/2020/2022场景）
→ 生成组合健康报告
```

### 📅 财报前瞻 `/earnings-preview`

财报前准备工作。

```
用户: /earnings-preview AAPL
→ 获取财报日期
→ 分析师一致性预期 vs 历史超预期记录
→ 内部交易活动（财报前增减持信号）
→ 期权隐含波动率
→ 输出财报前瞻报告
```

### 📸 截图分析 `/analyze-screenshot`

通过截图直接分析股票软件画面，Claude Code 内置的视觉识别能力可以「看懂」图表。

```
用户截图（K线图/分时图/自选列表等）
→ 保存到 screenshots/ 目录
→ /analyze-screenshot
→ Claude 识别图表内容并输出分析
```

**三种截图上传方式：**

| 方式 | 操作 | 适用场景 |
|------|------|----------|
| 🖱️ **直接拖拽** | 在 VS Code / Claude Code 桌面版中，把图片拖入聊天窗口 | 最方便，即拖即分析 |
| 📁 **保存到截图目录** | 截图保存到 `screenshots/`，然后 `/analyze-screenshot` | 批量截图、分类管理 |
| 📋 **剪贴板快存** | 运行 `.\scripts\clipboard-save.ps1` 自动保存剪贴板中的截图 | 快速导入（无需手动保存） |

**截图分析能力：**
- 🕯️ K线图 → 识别价格/均线/成交量/技术指标 → 输出技术面分析
- ⚡ 分时图 → 识别日内走势/均价线/量能分布 → 输出日内情绪分析
- 📊 行情列表 → 提取多只股票的涨跌幅/PE/量比 → 异动发现
- 📋 财务数据 → 提取表格数字 → 与历史/预期对比

---

## 报告输出规范

### 命名规则
```
reports/<股票代码>_<分析类型>_<YYYY-MM-DD>.md
```
示例: `reports/AAPL_deep_dive_2026-05-31.md`

### 必含章节
每份正式报告必须包含：
1. **摘要** — 一页以内核心结论
2. **数据来源** — 列出所有数据源和时间戳
3. **分析方法** — 说明使用的分析框架
4. **分析内容** — 结构化分析数据（表格优先）
5. **综合结论** — 总结性陈述
6. **风险提示** — 标注关键风险和不确定性

### 写作规范
- 报告正文使用中文撰写
- 专业术语保留英文原词（如 DCF、FCF、ROE、EBITDA）
- 关键数据使用 Markdown 表格呈现
- 估值区间使用范围表示（如：公允价 $150-$180）

### ⚠️ 约束规则
1. **必须引用数据源** — 所有数据必须标注来源（yfinance / FMP / openinsider）
2. **禁止买卖建议** — 仅提供分析数据和估值参考
3. **标注时间戳** — 所有数据必须注明获取时间
4. **前复权价格** — 分析 A股时使用前复权价格
5. **风险必提** — 每份报告必须包含风险提示章节

---

## 📊 Web 仪表盘

```bash
npm run dashboard        # 启动仪表盘 → http://localhost:3000
npm run dashboard:fetch  # 仅拉取最新数据
npm run screenshot       # 处理截图文件
```

仪表盘功能：
- 🔍 股票搜索（代码/名称）
- 📈 A股四大指数实时行情
- 👁️ 20只关注标的完整数据表
- 🧠 专家团队分析建议
- 📄 最近报告索引
- ⏰ 自动识别A股交易时段（北京时间）

---

## 团队子代理

| 代理名 | 用途 | 模型 |
|--------|------|------|
| `data-engineer` | 从 MCP 数据源获取、验证、清洗数据 | haiku |
| `fundamental-analyst` | 基本面分析、DCF估值、财务比率 | sonnet |
| `technical-analyst` | 技术指标、形态识别、多时间框架 | sonnet |
| `risk-manager` | 风险评估、组合压力测试 | sonnet |
| `report-writer` | 整合分析结果，生成 Markdown 报告 | sonnet |

---

## 已知限制和注意事项

1. **yfinance A股支持有限**: 雅虎财经对中国股票数据覆盖不完整，A股/港股分析结果可能有缺漏
2. **FMP API 限额**: 免费版每日 250 次调用，批量分析时注意控制频率
3. **openinsider 仅美股**: 内幕交易数据来自 SEC EDGAR，只覆盖美股
4. **实时性**: yfinance 数据有约 15 分钟延迟（NYSE/NASDAQ 规则），非实时 tick 级数据
5. **估值模型**: DCF 等估值模型结果依赖于假设参数，仅作参考

---

## 快速开始

```bash
# 1. 设置 FMP API Key（可选）
export FMP_API_KEY=your_key_here

# 2. 启动 Claude Code
claude

# 3. 验证连接
/mcp          # 确认 yfinance + openinsider + fmp 状态为 Connected

# 4. 测试分析
/deep-dive-analysis AAPL
```

---

> 📌 本文件由团队共同维护。修改 MCP 配置或添加新工作流后，请同步更新本文档。
