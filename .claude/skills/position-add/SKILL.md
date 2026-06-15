---
name: position-add
description: 添加持仓 — 录入股票买入信息到持仓组合
---

# 添加持仓

## 触发
用户说：买入XXX、加仓XXX、添加持仓XXX、我买了XXX

## 参数
- `ticker`: 股票代码（必填），如 600036.SS 或 600036
- `shares`: 买入股数
- `price`: 买入价格
- `date`: 买入日期（默认今天）
- `notes`: 备注

## 流程

### 第1步：解析输入
```
如果只给了代码没有股数/价格 → 询问用户
如果代码只有6位数字 → 自动判断 .SS 还是 .SZ
  60xxxx → .SS (沪市)
  00xxxx → .SZ (深市主板)
  30xxxx → .SZ (创业板)
  68xxxx → .SS (科创板)
```

### 第2步：读取现有持仓
```
读取 dashboard/data/portfolio.json
如果股票已存在 → 询问是否加仓（累加股数，更新均价）
```

### 第3步：写入持仓
```
更新 portfolio.json:
  positions.push({ ticker, name, shares, costPrice, entryDate, notes })
  updated = new Date().toISOString()

提交到 git:
  git add dashboard/data/portfolio.json
  git commit -m "持仓: +{name} {shares}股 @¥{price}"
  git push origin master
```

### 第4步：确认
```markdown
✅ 已添加持仓:
  {股票名} ({ticker})
  买入 {shares}股 @ ¥{price}
  成本 ¥{cost}
  日期 {date}
  备注 {notes}
```
