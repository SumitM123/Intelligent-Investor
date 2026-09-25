# Intelligent Investor

A stock market analysis tool grounded in Benjamin Graham's *The Intelligent Investor*. It connects to your real brokerage accounts (via SnapTrade) and evaluates your actual holdings — and any ticker you want to screen — against Graham's defensive/enterprising investor criteria, the 50/50 stocks-to-bonds rule, and inflation-aware return projections.

## Features

- **Google OAuth sign-in** — cookie-based session, no JWTs.
- **Brokerage linking** — connect a real account through SnapTrade's hosted portal and pick which account to analyze.
- **Screen a stock** — test any U.S. ticker against 7 modernized Graham criteria (size, financial strength, earnings stability, shareholder returns, valuation) and see which ones pass or fail.
- **Portfolio viewing** — holdings, stocks-vs-bonds-vs-cash allocation, and whether the 25–75% Graham band is satisfied.
- **Dividend tracking** — per-holding dividend history, incrementally refreshed from SnapTrade.
- **Bond analysis** — paste CUSIPs and get credit-grade classification (via Treasury/FRED/Finnhub yield-spread lookup), YTM, coupon, and maturity.
- **Sell planning** — model the tax impact of selling part of a position before you do it.
- **Tax estimate** — federal/state/NIIT tax estimate (via PolicyEngine) including capital-loss carryover.

See [WORKFLOWS.md](WORKFLOWS.md) for a step-by-step trace of each feature, the tables it touches, and the Docker networking model.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Backend | Python, FastAPI, Uvicorn |
| Database | PostgreSQL (SQLAlchemy + raw `text()` queries, no ORM) |
| Brokerage data | SnapTrade SDK |
| Market/fundamentals data | AlphaVantage, Financial Modeling Prep, Finnhub, FRED, yfinance |
| Tax calculation | PolicyEngine-US |
| File storage | AWS S3 (presigned URLs for user avatars) |
| Auth | Google OAuth (cookie-based) |

## Getting Started

Everything runs in Docker — the frontend and backend are never run directly on the host.

```bash
# First run, or after a Dockerfile change
docker compose -f docker-compose.dev.yml up --build

# Subsequent runs
docker compose -f docker-compose.dev.yml up

# Rebuild just one service
docker compose -f docker-compose.dev.yml up --build backend
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| Database | localhost:5434 |

### Environment variables

Create a `.env` file at the project root with:

```
DATABASE_URL=
POSTGRE_USER=
POSTGRE_PASSWORD=
POSTGRE_DB=

NEXT_PUBLIC_GOOGLE_CLIENT_ID=
NEXT_PUBLIC_API_BASE=http://localhost:8000

SNAPTRADE_CLIENT_ID=
SNAPTRADE_SECRET=

# Stock screening rotates across 5 keys to stay under AlphaVantage's free-tier
# rate limit — see backend/frequenty_used_methods.py
ALPHA_VANTAGE_API_LEADING_STOCK=
ALPHA_VANTAGE_API_LEADING_STOCK_2=
ALPHA_VANTAGE_API_LEADING_STOCK_3=
ALPHA_VANTAGE_API_LEADING_STOCK_4=
ALPHA_VANTAGE_API_LEADING_STOCK_5=
ALPHA_VANTAGE_API_SEARCH_BAR=
ALPHA_VANTAGE_API_MCP=

FINANCIAL_MODELING_PREP_API=
FINNHUB_API_KEY=
FRED_API_KEY=
```

Lint the frontend (runs inside its container):

```bash
docker compose -f docker-compose.dev.yml exec frontend npm run lint
```

## Project Structure

```
backend/
  main.py                    FastAPI app, router mounting, PolicyEngine warmup
  database.py                SQLAlchemy engine / SessionLocal
  frequenty_used_methods.py  Shared helpers: fetch_av/fetch_fmp/fetch_finnhub, AV key rotation
  bond_classifier.py         CUSIP → credit grade / YTM classification
  tax_calculator.py          PolicyEngine wrapper for the tax estimate route
  snapTradeInitialization.py SnapTrade client singleton
  routes/
    user.py                  User management, avatar upload
    snapTrade.py             Brokerage linking, accounts, holdings, dividends, stock screening
    stocks.py                Diversification / ETF & sector composition
    bonds.py                 Bond classification and per-user saved bond lists
    portfolio.py             Portfolio-level aggregation
    taxEstimate.py           Federal/state/NIIT estimate with loss carryover

frontend/src/app/
  layout.tsx                 Root layout; reads auth cookies server-side
  actions.tsx                Server Actions
  context/                   Client-side React context (e.g. UserContext)
  component/                 Shared UI (InvestorWorkspace, BrokerageWorkspace, BondList, ...)
  pages/
    signIn/                  Google sign-in
    typesOfInvestor/         Defensive / enterprising investor flows
    userProfile/             Profile + avatar management
```

## Documentation

- [`WORKFLOWS.md`](WORKFLOWS.md) — end-to-end trace of every feature, database tables, Docker networking model.
- [`CLAUDE.md`](CLAUDE.md) — codebase conventions and architecture notes for AI-assisted development.
- `toDo.txt` — the product requirements document (read-only).
