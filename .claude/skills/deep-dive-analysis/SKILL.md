---
name: deep-dive-analysis
description: |
  个股深度分析 — 依次串联数据工程师→基本面分析师→技术分析师→风险管理师→报告撰写师，
  全流程完成后输出结构化分析报告保存到 reports/ 目录。
  使用场景：需要对某只股票进行全面深度研究时。
  关键词触发：深度分析、全面研究、个股研究、分析一下、给一份报告
argument-hint: "[股票代码]"
user-invocable: true
disable-model-invocation: false
allowed-tools: Read, Write, Grep, Glob, Bash, WebSearch, WebFetch, Skill, Task, TodoWrite, mcp__yfinance__*, mcp__openinsider__*, mcp__fmp__*
model: sonnet
context: fork
---

# 个股深度分析

对指定股票执行全流程深度分析，最终输出一份完整的研究报告。

## 工作流程

按以下顺序执行，每步完成后标记进度：

### Step 1: 数据采集
调用 `data-engineer` 子代理，获取以下全部数据：
- 公司概要（yfinance `get_stock_summary` + fmp `getCompanyProfile`）
- 最近 5 年财务报表（fmp: 利润表/资产负债表/现金流量表）
- 关键指标和比率（fmp `getKeyMetrics` + `getFinancialRatios`）
- 历史价格数据（yfinance `get_historical_prices`，至少 2 年日线）
- 分析师评级和目标价（fmp `getAnalystEstimates` + `getPriceTarget`）
- 内部交易活动（openinsider `search_by_ticker` + `cluster_buys`）
- 机构持仓（openinsider `hedge_fund_holdings`）
- 空头数据（openinsider `short_interest`）

### Step 2: 基本面分析
调用 `fundamental-analyst` 子代理，输入 Step 1 的财务数据，输出：
- 杜邦分析（ROE 拆解）
- 成长性分析（收入/盈利/FCF 的 3Y/5Y CAGR）
- DCF 估值模型（Bull/Base/Bear 三档公允价）
- 可比估值（同行业 3-5 家 PE/EV-EBITDA/PEG 对比）
- 财务健康度综合评定

### Step 3: 技术面分析
调用 `technical-analyst` 子代理，输入 Step 1 的价格数据，输出：
- 多时间框架趋势判断（周线/日线/4小时）
- RSI/MACD/布林带/均线系统指标汇总
- 关键支撑阻力位
- 技术形态和信号识别
- 技术面综合评分

### Step 4: 风险评估
调用 `risk-manager` 子代理，输入前几步的分析结果，输出：
- 个股风险指标（Beta、最大回撤、波动率、VaR）
- 空头信号和内部交易风险
- 压力测试（2008/2020/2022 三种情景）

### Step 5: 报告整合
调用 `report-writer` 子代理，整合前四步的输出，生成最终报告：
- 报告保存路径: `reports/{股票代码}_deep_dive_{YYYY-MM-DD}.md`
- 必须包含所有标准章节（摘要/公司概况/基本面/技术面/风险/结论/附录）
- 每个数据点标注来源和时间

### Step 6: 完成确认
报告生成后，输出一段简洁的总结给用户。

## 使用示例

```
用户: /deep-dive-analysis AAPL
用户: /deep-dive-analysis 9988.HK
用户: 对特斯拉做一个深度分析
```

## 注意事项

- A股/港股使用 yfinance 可能数据不完整，请在报告中注明数据覆盖率
- 如果 FMP API Key 未配置，跳过 fmp 工具，仅使用 yfinance + openinsider
- 估值结果仅作参考，不得被视为投资建议
