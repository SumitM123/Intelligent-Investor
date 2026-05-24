---
name: leading-stock-criteria
description: Reference for the 7 criteria a stock must pass to be considered a "leading common stock" in the Intelligent Investor project. Invoke manually with /leading-stock-criteria.
disable-model-invocation: true
---

# Leading Common Stock Criteria

A stock must pass **all 7** of the following criteria (C3 was deleted) to be classified as a leading common stock. These are the modernized Graham-style defensive investor criteria implemented in the `isLeadingStock` endpoint (`backend/routes/snapTrade.py`).

## 1. Adequate Size

- **Revenue (TTM) ≥ $1B** **AND** **Market Cap ≥ $8B**
- Source: `COMPANY_OVERVIEW.RevenueTTM`, `COMPANY_OVERVIEW.MarketCapitalization`

## 2. Strong Financial Condition

- **Current Ratio ≥ 1.75**
- Current Ratio = `totalCurrentAssets / totalCurrentLiabilities`
- Source: `BALANCE_SHEET.annualReports[0]`

## ~~3. Earnings Stability~~ — *Deleted*

Originally required 10 consecutive years of positive earnings; redundant once C4 enforces zero deficits.

## 4. No Earnings Deficits

- **Zero years of negative net income** across the available annual history
- Strict — any single year of negative net income disqualifies the stock
- Source: `INCOME_STATEMENT.annualReports[].netIncome`

## 5. Shareholder Returns *(either path qualifies)*

- **Dividends**: uninterrupted payments across all 10 years, **OR**
- **Buybacks**: share count reduced in **≥ 7 of the last 10 years**
- Sources:
  - Dividends: `DIVIDENDS` endpoint, grouped by year
  - Buybacks: `INCOME_STATEMENT.annualReports[].commonStockSharesOutstanding`, year-over-year comparison

## 6. Price-to-FCF

- **P/FCF ≤ 25**
- P/FCF = `market_cap / fcf`
- FCF = `operatingCashflow - capitalExpenditures` (AlphaVantage returns capex as a positive number)
- Source: `CASH_FLOW.annualReports[0]`

## 7. Combined Valuation

- **(P/FCF × P/Sales) ≤ 50**
- P/Sales = `market_cap / revenue_ttm`
- Multiplies the P/FCF from C6 with P/Sales to penalize stocks that are simultaneously expensive on cash flow and sales

## 8. EPS Growth (CPI-Adjusted)

- **EPS growth ≥ 33%** over a 10-year window
- Historical EPS values are CPI-adjusted using the AlphaVantage `CPI` series before computing growth
- Source: `EARNINGS.annualEarnings[]` (via `get_eps_and_pe` in `frequenty_used_methods.py`), CPI series from `fetch_av("CPI")`

---

## Final Verdict

```python
is_leading = all([c1_pass, c2_pass, c4_pass, c5_pass, c6_pass, c7_pass, c8_pass])
```

## AlphaVantage Endpoints Used (per cache miss)

1. `GLOBAL_QUOTE` — current price
2. `OVERVIEW` — market cap, revenue TTM
3. `BALANCE_SHEET` — current assets/liabilities
4. `INCOME_STATEMENT` — net income, shares outstanding
5. `EARNINGS` — annual EPS
6. `CASH_FLOW` — operating cash flow, capex
7. `CPI` — inflation adjustment for EPS

## Caching Behavior

- Results stored in the `leading_stock_analysis` table, keyed by `symbol`
- Cache TTL: 3 months (`last_checked >= NOW() - INTERVAL '3 months'`)
- Stale rows are **overwritten** via `ON CONFLICT (symbol) DO UPDATE` — no duplicates created
- Full breakdown stored in JSONB column `criteria_details`
