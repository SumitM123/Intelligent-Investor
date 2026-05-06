# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

**Intelligent Investor** — a stock market analysis tool grounded in Benjamin Graham's principles from *The Intelligent Investor*. Core principles implemented or planned: the 50/50 stocks-to-bonds rule (never below 25% or above 75% in either), Margin of Safety, Dollar Cost Averaging, Defensive vs. Enterprising investor stock criteria, and inflation-aware real return projections.

`toDo.txt` is the authoritative product requirements document. It is **read-only** — do not edit it.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Backend | Python, FastAPI, Uvicorn |
| Database | PostgreSQL (SQLAlchemy + raw `text()` queries, no ORM models) |
| Brokerage Integration | SnapTrade Python SDK |
| File Storage | AWS S3 (boto3, presigned URLs for user avatars) |
| Auth | Google OAuth (cookie-based; `user_id` UUID stored in cookie) |

## Development Commands

### Full stack (Docker — preferred)
```bash
docker compose -f docker-compose.dev.yml up --build
```
Frontend: `http://localhost:3000` | Backend: `http://localhost:8000`

### Frontend only
```bash
cd frontend
npm install
npm run dev      # dev server
npm run build    # production build
npm run lint     # ESLint
```

### Backend only
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Required env vars for backend: `DATABASE_URL`, `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_SECRET`  
Required env vars for frontend: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_API_BASE`, `INTERNAL_API_BASE`

## Architecture

### Frontend (`frontend/src/app/`)

Next.js App Router. Server Components handle auth cookie reads; Client Components handle interactivity.

- `layout.tsx` — Root layout. Reads `userName` and `profilePictureURL` cookies server-side and passes auth state to `NavBar`.
- `providers.tsx` — Wraps the tree in client-side context providers.
- `context/UserContext.tsx` — Client context holding `userID` and `isSignedIn`. **Cannot be consumed inside Server Components** — this is a known bug on `defensivePage/page.tsx`.
- `actions.tsx` — Next.js Server Actions.
- `pages/typesOfInvestor/` — Investor type sub-pages: `defensivePage`, `accountsChoosing`, `viewingPage`.

### Backend (`backend/`)

FastAPI app (`main.py`) with three routers mounted under `/api`:

| Router | Prefix | Purpose |
|---|---|---|
| `routes/user.py` | `/api/user` | User management, S3 presigned URL for avatar upload |
| `routes/stocks.py` | `/api/stocks` | Stock data endpoints (partially implemented) |
| `routes/snapTrade.py` | `/api/snapTrade` | SnapTrade brokerage integration |

`database.py` — SQLAlchemy engine + `SessionLocal` sessionmaker. Always use `with SessionLocal() as session:` and call `session.rollback()` inside `except` blocks.

`frequenty_used_methods.py` — Shared helpers. Currently contains `getSnapTradeSecretID(snaptrade_id)`, which looks up the user's SnapTrade secret from the `snaptrade_id` table.

`snapTradeInitialization.py` — Instantiates the SnapTrade client singleton (`snapTrade`) used across route files.

### Database Tables (PostgreSQL)

All queries use raw SQL via SQLAlchemy `text()`. Key tables:

- `users_id` — app users (Google OAuth)
- `snaptrade_id` — maps `user_id` → `snaptrade_id` + `snaptrade_usersecret_id`
- `snaptrade_connection_accounts` — cached brokerage accounts per `connection_id` (JSONB)
- `snaptrade_dividends` — dividend history per `(account_id, stock_symbol)`; uses a custom PostgreSQL composite type `dividend_info(amount_earned, dps, units, trade_date)`

### Auth & Session Flow

1. User signs in via Google OAuth → cookies set: `user_id` (UUID), `userName`, `profilePictureURL`.
2. SnapTrade flow: `POST /api/snapTrade/addUser` registers user with SnapTrade and stores credentials → sets `snapTradeUserID` cookie → `GET /api/snapTrade/generateConnectionPortal` returns a redirect URI for brokerage linking.
3. All protected backend routes read identity from cookies (`user_id: UUID`, `snapTradeUserID: str`).

### Key Patterns

- **Caching**: SnapTrade API responses are cached in PostgreSQL (connection accounts, dividend history). Cache-miss triggers a live fetch and insert.
- **Timezone**: All dates are normalized to `America/New_York` (Wall Street time) before storage.
- **No ORM models**: Schema is managed directly in PostgreSQL; Python side uses raw SQL with named parameters.
