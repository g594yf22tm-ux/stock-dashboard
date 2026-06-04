---
name: earnings-preview
description: |
  财报前瞻 — 在财报发布前准备分析报告，包含预期数据、历史超预期记录、
  内部交易信号、期权隐含波动率。使用场景：财报季前的个股准备。
  关键词触发：财报前瞻、财报预览、盈利前瞻、earning、发财报
argument-hint: "[股票代码]"
user-invocable: true
disable-model-invocation: false
allowed-tools: Read, Write, mcp__yfinance__*, mcp__fmp__*, mcp__openinsider__*, WebSearch, WebFetch
model: sonnet
context: fork
---

# 财报前瞻

在股票发布财报前，汇总所有相关信息，为团队提供决策参考。

## 工作流程

### Step 1: 确定财报日期
- 使用 fmp `getEarningsCalendar` 或 yfinance `get_earnings_calendar` 获取下次财报发布日期和时间（盘前/盘后/盘前盘后）
- 如果财报日期超过 2 周，询问是否仍然需要前瞻报告

### Step 2: 分析师预期
- **EPS 预期**: fmp `getAnalystEstimates` → 共识 EPS、高/低预估区间
- **营收预期**: 共识营收、同比环比变化
- **评级分布**: 买入/持有/卖出比例
- **目标价**: 平均目标价、最高/最低，当前价格 vs 目标价的上涨/下跌空间
- **近期评级变动**: 最近 30 天内的上调/下调

### Step 3: 历史超预期记录
- fmp `getEarningsSurprises` → 最近 8 个季度的 EPS 实际 vs 预期
- 计算：超预期次数/总次数、平均超预期幅度
- 财报发布后的典型股价反应（上涨/下跌概率、平均波动幅度）

### Step 4: 内部交易信号
- openinsider `search_by_ticker` → 财报前 60 天内的内部交易活动
- 重点观察：
  - 内部人集中买入/卖出
  - 高管（CEO/CFO）的交易方向
  - 交易规模是否异常

### Step 5: 期权市场信号
- 使用 yfinance `get_options_chain` → 获取财报日期附近的期权链
- 计算隐含波动率 (IV) 和 IV Rank/Percentile
- 期权市场定价的预期波动幅度 (Straddle 成本 / 当前股价)
- 认沽/认购比率 (Put/Call Ratio) → 市场情绪

### Step 6: 最近动态
- WebSearch 搜索最近 30 天内的重大新闻和公告
- 竞争对手财报表现（如果行业内已有公司发财报）
- 分析师最近的评级调整和原因

### Step 7: 生成报告
```markdown
## 📅 财报前瞻: {TICKER} ({公司名称})
**报告日期**: YYYY-MM-DD
**财报日期**: YYYY-MM-DD (盘前/盘后)

### 分析师预期
| 指标 | 共识 | 同比 | 区间 |
|------|------|------|------|
| EPS | | | |
| 营收 | | | |

### 评级概览
| 评级 | 比例 |
|------|------|
| 买入 | |
| 持有 | |
| 卖出 | |
| 平均目标价 | $ |
| 上涨空间 | % |

### 历史超预期
| 指标 | 数据 |
|------|------|
| 超预期比率 | X/8 季度 |
| 平均超预期幅度 | ±% |
| 财报后平均波动 | ±% |
| 财报后上涨概率 | % |

### 内部交易信号（财报前60天）
| 信号 | 状态 |
|------|------|
| 内部人净买卖 | 净买入/净卖出 |
| 高管活动 | |
| 异常交易 | |

### 期权市场
| 指标 | 数值 |
|------|------|
| 隐含波动率 (IV) | |
| IV Rank | |
| 期权定价波动 | ±% |
| Put/Call Ratio | |

### 关注要点
- ✅ 积极因素: [...]
- ❌ 风险因素: [...]
- 🔍 关键关注: [财报中最需关注的指标]
```

保存路径: `reports/{股票代码}_earnings_preview_{YYYY-MM-DD}.md`

## 使用示例

```
用户: /earnings-preview AAPL
用户: /earnings-preview NVDA
用户: 微软下周发财报，做一个财报前瞻
```

## 注意事项

- 期权数据仅美股覆盖较全
- 内部交易数据的解读需结合具体情况（可能是计划性减持）
- 历史超预期不代表未来，需结合当前分析师预期的调整趋势
