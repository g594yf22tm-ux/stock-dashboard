---
name: quick-check
description: 快速查股 — 输入代码或名称，即时返回价格/信号/新闻/技术指标
---

# 快速查股

## 触发
用户说：查一下XXX、XXX怎么样、看看XXX、quick check XXX

## 参数
- `query`: 股票代码或名称（必填）

## 流程

### 第1步：搜索匹配
```
搜索 dashboard/config/stock_list.json 中的股票
支持: 代码 (600036) / 完整ticker (600036.SS) / 名称 (招商银行)
```

### 第2步：获取实时数据
```
新浪数据: 读取 dashboard/data/watchlist.json 找到该股票
yfinance: get_stock_price 补充实时价格
yfinance: get_stock_summary 补充PE/市值等
fmp: get_quote 补充美股实时报价
```

### 第3步：获取技术分析
```
读取 dashboard/data/analysis.json 中找到该股票
展示: RSI / MACD / MA / 波动率 / 52周位置
```

### 第4步：获取新闻
```
读取 dashboard/data/news.json 中的市场要闻
fmp: get_stock_news 获取个股新闻
```

### 第5步：生成快速报告

```markdown
# 🔍 {股票名称} ({ticker})

## 💹 实时行情
| 指标 | 数值 |
|------|------|
| 最新价 | ¥XX.XX |
| 涨跌幅 | +X.XX% |
| 开盘/最高/最低 | ... |
| 成交量/额 | ... |
| PE/PB | ... |

## 📈 技术面 (v3.0)
| 指标 | 数值 | 判断 |
|------|------|------|
| RSI(14) | 58.3 | 中性偏强 |
| MACD | +0.45 | 金叉 |
| MA5/MA20 | ... | 多头排列 |
| 波动率 | 18% | 正常 |
| 52周位置 | 68% | 中高位 |

## 💰 基本面
目标价: ¥XX | 潜在空间: +XX%
投资逻辑: {reason}

## ⚠️ 风险
{个股风险列表}

## 📰 最新新闻
1. ...
2. ...

---
> 📡 数据: 新浪 + Yahoo Finance + FMP | ⚠️ 仅供参考
```
