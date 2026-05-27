# Intelligent Investor — Workflow Reference

## How to Run

All services run inside Docker. Never run frontend/backend directly on host.

```bash
# First run or after Dockerfile changes
docker compose -f docker-compose.dev.yml up --build

# Subsequent runs
docker compose -f docker-compose.dev.yml up

# Rebuild a single service (e.g. backend only)
docker compose -f docker-compose.dev.yml up --build backend
```

| Service  | URL                    |
|----------|------------------------|
| Frontend | http://localhost:3000  |
| Backend  | http://localhost:8000  |
| Database | localhost:5434         |

---

## Workflows

### 1. Authentication

**Entry point**: `/pages/signIn`

1. User clicks Google Sign-In → frontend verifies the Google credential token at `oauth2.googleapis.com/tokeninfo`
2. Extracted fields (`sub`, `name`, `email`, `picture`) are sent to `POST /api/users/addUser`
3. Backend upserts records in `users_id` and `user_info` tables
4. `passSignInProps` server action (in `actions.tsx`) sets cookies: `user_id`, `userName`, `profilePictureURL`
5. On the same sign-in, `POST /api/snapTrade/addUser` registers the user with SnapTrade and stores credentials in `snaptrade_id` table; sets `snapTradeUserID` cookie
6. All subsequent backend requests use these cookies for identity — no session tokens or JWTs

**Relevant files**: `pages/signIn/page.tsx`, `actions.tsx`, `backend/routes/user.py`, `backend/routes/snapTrade.py`

---

### 2. Brokerage Connection (SnapTrade)

**Entry point**: `ConnectionURL` component or the accounts-choosing page

1. Frontend calls `GET /api/snapTrade/generateConnectionPortal` → backend returns a SnapTrade `redirectURI`
2. User is redirected to SnapTrade's hosted portal to link their broker (TD, Questrade, etc.)
3. After linking, SnapTrade associates accounts under a `connection_id`
4. Frontend calls `GET /api/snapTrade/getAllAccountsFromConnection?connection_id=...` → backend checks `snaptrade_connection_accounts` cache first; on miss, fetches from SnapTrade and writes to DB
5. USD accounts are filtered and returned; user selects one to analyze
6. Selected `accountID` and `connectionID` are stored in `PrevPageContext` (React context, not persisted)

**Relevant files**: `pages/typesOfInvestor/accountsChoosing/`, `backend/routes/snapTrade.py`, `snaptrade_connection_accounts` table

---

### 3. Defensive Stock Screening (Graham Criteria)

**Entry point**: `/pages/typesOfInvestor/defensivePage` → `DefensiveScreener` component

User enters a ticker symbol. Frontend calls `GET /api/snapTrade/isLeadingStock?symbol=...&allCriteria=true`.

Backend evaluates 7 criteria against Benjamin Graham's defensive investor standards:

| # | Criterion | Source | Cached? |
|---|-----------|--------|---------|
| 1 | Revenue ≥ $1B AND Market Cap ≥ $8B | AlphaVantage OVERVIEW | Yes (3 months) |
| 2 | Current Ratio ≥ 1.75 | AlphaVantage BALANCE_SHEET | Yes |
| 3 | 10+ years of positive net income | AlphaVantage INCOME_STATEMENT | Yes |
| 4 | 20+ years dividends OR 7+ years buybacks | AlphaVantage DIVIDENDS + INCOME_STATEMENT | Yes |
| 5 | EPS growth ≥ 33% over 10 years (CPI-adjusted) | AlphaVantage EARNINGS + CPI | Yes |
| 6 | Price-to-FCF ≤ 25 | AlphaVantage CASH_FLOW + GLOBAL_QUOTE | **No** (recomputed) |
| 7 | P/FCF × P/Sales ≤ 50 | AlphaVantage OVERVIEW + CASH_FLOW | **No** (recomputed) |

- Criteria 1–5 are cached for 3 months in `leading_stock_analysis` (JSONB). On cache hit, only criteria 6–7 are fetched live.
- AlphaVantage free tier is 5 req/min. The backend enforces a 60+ second wait after the 5th call per request cycle to avoid rate limit errors.
- Final `is_leading` boolean and per-criterion breakdown are returned to the frontend for display.

**Relevant files**: `backend/routes/snapTrade.py::isLeadingStock()`, `backend/frequenty_used_methods.py::fetch_av()`, `leading_stock_analysis` table

---

### 4. Portfolio Viewing

**Entry point**: `/pages/typesOfInvestor/viewingPage?accountID=...`

1. Frontend calls `GET /api/snapTrade/accountInformation?account_id=...`
2. Backend fetches holdings and balances from SnapTrade SDK
3. Page displays:
   - Current stock/ETF holdings with quantities and values
   - Allocation breakdown (stocks vs. bonds vs. cash)
   - Whether the 25–75% allocation band (Graham's rule) is satisfied
   - Margin of Safety status per holding (where calculable)

**Relevant files**: `pages/typesOfInvestor/viewingPage/`, `backend/routes/snapTrade.py`

---

### 5. Dividend Tracking

**Entry point**: Called from the viewing page per-stock or on-demand

- **First load** (`GET /api/snapTrade/getDividends?accountID=...&stock_symbol=...`):
  - Checks `snaptrade_dividends` table; on miss, fetches full activity history from SnapTrade
  - Filters for `DIVIDEND` type entries matching the symbol
  - Normalizes dates to `America/New_York` and stores as a PostgreSQL composite type array (`dividend_info[]`)

- **Refresh** (`PUT /api/snapTrade/updateDividends?accountID=...&stock_symbol=...`):
  - Fetches only activities since `last_checked`
  - Appends new entries without duplicating existing ones
  - Updates `last_checked` timestamp

**Relevant files**: `backend/routes/snapTrade.py`, `snaptrade_dividends` table

---

### 6. Bond Analysis

**Entry point**: `BondList` component (used in both defensive and enterprising pages)

1. User enters one or more CUSIP codes
2. Frontend calls `POST /api/bonds` with `{cusips: [...], is_defensive: bool}`
3. Backend runs `classify_bond(cusip)` for each:
   - Checks if it's a US Treasury via TreasuryDirect API (automatic AAA)
   - Otherwise fetches bond profile (coupon, maturity, payment frequency) from Finnhub; caches in `bond_profile_cache` (30-day TTL)
   - Fetches current Treasury yield curve from FRED (10 DGS series); interpolates yield for the bond's maturity
   - Calculates Yield-to-Maturity using the bond's price
   - Fetches OAS spreads from FRED (AAA/AA/A/BBB/HY); caches daily in `fred_oas_spreads`
   - Maps the spread to a grade: AAA → BB and below (High Yield)
4. Enriched bond list (grade, YTM, coupon, maturity) stored per user in `bonds_table` (keyed by `user_id + is_defensive`)
5. `GET /api/bonds?is_defensive=true` retrieves previously saved bonds for the user

**Relevant files**: `backend/bond_classifier.py`, `backend/routes/bonds.py`, `bond_profile_cache`, `fred_oas_spreads`, `bonds_table`

---

## Data Flow Summary

```
External APIs
  AlphaVantage ─────────────────────────────┐
  SnapTrade ────────────────────────────────┤
  FRED ─────────────────────────────────────┤──► FastAPI Backend ──► PostgreSQL Cache
  Finnhub ──────────────────────────────────┤         │
  TreasuryDirect ───────────────────────────┘         │
                                                       ▼
                                              Next.js Frontend
                                         (Server + Client Components)
```

---

## Key Database Tables

| Table | Purpose |
|-------|---------|
| `users_id` / `user_info` | Google OAuth user accounts |
| `snaptrade_id` | SnapTrade credentials per user |
| `snaptrade_connection_accounts` | Cached brokerage account list per `connection_id` |
| `snaptrade_dividends` | Dividend history per `(account_id, stock_symbol)` |
| `leading_stock_analysis` | Cached Graham criteria results per ticker (3-month TTL) |
| `bonds_table` | User's saved bond list (per investor type) |
| `bond_profile_cache` | Finnhub bond profile by CUSIP (30-day TTL) |
| `fred_oas_spreads` | Daily OAS spread buckets from FRED |

---

## Environment Variables (`.env` at project root)

| Variable | Used By |
|----------|---------|
| `DATABASE_URL` | Backend DB connection |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Frontend Google OAuth |
| `SNAPTRADE_CLIENT_ID` / `SNAPTRADE_SECRET` | SnapTrade SDK |
| `ALPHA_VANTAGE_API_LEADING_STOCK` | Stock screening endpoint |
| `ALPHA_VANTAGE_API_SEARCH_BAR` | Search bar component |
| `ALPHA_VANTAGE_API_MCP` | MCP tool calls |
