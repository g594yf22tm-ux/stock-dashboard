---
name: sector-scan
description: |
  行业扫描 — 使用筛选器扫描指定行业，按自定义财务和技术条件筛选，输出 Top 10 关注列表。
  使用场景：寻找被低估的标的、行业轮动分析、热门板块追踪。
  关键词触发：行业扫描、板块筛选、被低估的股票、选股、筛选
argument-hint: "[行业名称 或 筛选条件]"
user-invocable: true
disable-model-invocation: false
allowed-tools: Read, Write, mcp__yfinance__*, mcp__fmp__*, WebSearch, Bash
model: sonnet
context: fork
---

# 行业扫描

对指定行业进行全面扫描，按条件筛选并输出关注列表。

## 工作流程

### Step 1: 确定行业和范围
- 如果用户指定了行业名称（如"半导体"、"新能源"），使用 fmp `getStockScreener` 或 yfinance `get_sector_performance` 获取该行业的股票列表
- 如果用户只给了条件（如"PEG<1 RSI<40"），扩大搜索范围到全市场

### Step 2: 获取行业数据
- 获取每只股票的关键指标：
  - 估值: PE, PB, PS, EV/EBITDA, PEG (fmp `getFinancialRatios`)
  - 盈利能力: ROE, ROA, 净利润率, FCF Yield (fmp `getKeyMetrics`)
  - 增长: 收入增长率, EPS 增长率 (fmp `getFinancialGrowth`)
  - 技术: RSI (fmp `getTechnicalIndicator`)
- 注意 API 调用限制，优先拉取最关键的指标

### Step 3: 筛选和排序
按用户条件或默认条件筛选：

**默认筛选条件（如用户未指定）:**
1. PE > 0（排除亏损公司）
2. PE < 行业平均 * 1.5
3. PEG < 2（增长合理估值）
4. ROE > 10%
5. FCF Yield > 0%
6. RSI < 70（非超买状态）

**自定义条件支持:**
- 用户可指定任意条件组合，如 "PE<15 ROE>20% 市值>100亿"

### Step 4: 排名
按综合评分排序（ROE 权重 30%、PEG 权重 30%、FCF Yield 权重 25%、RSI 权重 15%）

### Step 5: 输出结果
```markdown
## 🎯 行业扫描结果: {行业名称}
**扫描日期**: YYYY-MM-DD
**筛选条件**: [列出应用的条件]

### Top 10 关注列表
| 排名 | 代码 | 名称 | PE | PEG | ROE | FCF Yield | RSI | 评分 |
|------|------|------|-----|-----|-----|-----------|-----|------|
| 1 | | | | | | | | |

### 行业概览
- 行业中位数 PE: 
- 行业中位数 ROE: 
- 板块近期表现: 

### 重点关注
[对 Top 3 的简要分析说明]
```

## 使用示例

```
用户: /sector-scan 半导体
用户: /sector-scan 新能源 PEG<1 ROE>15%
用户: 扫描一下中概股里被低估的公司
```

## 注意事项

- 免费 API 有调用次数限制，如果股票数量超过 50 只，可以先按市值取 Top 50 再详细扫描
- 行业分类可能因数据源不同有差异，建议先确认目标行业在数据源中的分类名称
