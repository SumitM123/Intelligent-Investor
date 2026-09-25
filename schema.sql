-- Schema derived from SQL queries in backend/routes/*.py and frequenty_used_methods.py
-- Apply with:
--   docker compose -f docker-compose.dev.yml exec -T db psql -U productivity -d productivity < schema.sql

BEGIN;

-- Composite type used as the element type of snaptrade_dividends.information
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dividend_info') THEN
        CREATE TYPE dividend_info AS (
            amount_earned NUMERIC,
            dps           NUMERIC,
            units         NUMERIC,
            trade_date    TIMESTAMPTZ
        );
    END IF;
END$$;

-- App users (Google OAuth). user_id is auto-generated on INSERT (see user.py addUser).
CREATE TABLE IF NOT EXISTS users_id (
    user_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id TEXT UNIQUE NOT NULL
);

-- Per-user profile info (name, email) keyed by user_id.
CREATE TABLE IF NOT EXISTS user_info (
    user_id UUID PRIMARY KEY REFERENCES users_id(user_id) ON DELETE CASCADE,
    name    TEXT NOT NULL,
    email   TEXT NOT NULL
);

-- SnapTrade credentials per app user.
CREATE TABLE IF NOT EXISTS snaptrade_id (
    user_id                 UUID PRIMARY KEY REFERENCES users_id(user_id) ON DELETE CASCADE,
    snaptrade_id            UUID UNIQUE NOT NULL,
    snaptrade_usersecret_id TEXT NOT NULL
);

-- Cached SnapTrade accounts per brokerage connection.
-- connection_id is PK because INSERT uses ON CONFLICT (connection_id).
CREATE TABLE IF NOT EXISTS snaptrade_connection_accounts (
    connection_id TEXT PRIMARY KEY,
    snaptrade_id  UUID NOT NULL,
    accounts      JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Dividend history per (account_id, stock_symbol).
-- Composite PK matches ON CONFLICT (account_id, stock_symbol).
CREATE TABLE IF NOT EXISTS snaptrade_dividends (
    account_id   TEXT NOT NULL,
    stock_symbol TEXT NOT NULL,
    information  dividend_info[] NOT NULL DEFAULT ARRAY[]::dividend_info[],
    last_checked TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, stock_symbol)
);

-- Cached "is leading stock" analysis from isLeadingStock route.
CREATE TABLE IF NOT EXISTS leading_stock_analysis (
    symbol           TEXT PRIMARY KEY,
    is_leading       BOOLEAN NOT NULL,
    criteria_details JSONB NOT NULL,
    last_checked     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cached sector/industry classification per stock symbol (from FMP profile endpoint).
-- Looked up on every /api/stocks/receiveDiversification request before calling FMP.
-- For ETFs, sector and industry are stored as 'N/A'; sector weights are fetched
-- live from yfinance per request (not cached, since ETF composition shifts).
-- is_bond_etf marks funds holding more fixed income than equity (yfinance
-- asset_classes): they count toward the bonds side of the 50/50 rule, not stocks.
CREATE TABLE IF NOT EXISTS stock_industry (
    stock_symbol TEXT PRIMARY KEY,
    sector       TEXT,
    industry     TEXT,
    is_etf       BOOLEAN NOT NULL DEFAULT false,
    is_bond_etf  BOOLEAN NOT NULL DEFAULT false
);

-- Backfill the columns for installations that pre-date them.
ALTER TABLE stock_industry
    ADD COLUMN IF NOT EXISTS is_etf BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stock_industry
    ADD COLUMN IF NOT EXISTS is_bond_etf BOOLEAN NOT NULL DEFAULT false;

-- Per-user bond holdings, partitioned by investor type (defensive vs enterprising).
-- Composite PK matches ON CONFLICT (user_id, is_defensive) in bonds.py upsert.
-- `bonds` is a JSONB array; each element is one bond with the shape:
--   {cusip, grade, is_high_grade, ytm, spread_bps, bond_type,
--    treasury_yield, maturity_date,        -- from classify_bond (bond_classifier.py)
--    purchase_price, quantity}             -- user-entered in BondList; value = price*qty
-- treasury_yield is the interpolated curve point at maturity (percent) or null;
-- maturity_date is an ISO date string or null. No DDL needed for new fields (JSONB).
CREATE TABLE IF NOT EXISTS bonds_table (
    user_id      UUID NOT NULL REFERENCES users_id(user_id) ON DELETE CASCADE,
    is_defensive BOOLEAN NOT NULL,
    bonds        JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, is_defensive)
);

-- Cached bond fundamentals from Finnhub /bond/profile, keyed by CUSIP.
-- 365-day TTL enforced in code (cached_at compared against cutoff in bond_classifier.py).
-- coupon_rate / face_value stored as decimals (coupon_rate e.g. 0.05 = 5%).
-- PK matches ON CONFLICT (cusip) in get_bond_profile upsert.
CREATE TABLE IF NOT EXISTS bond_profile_cache (
    cusip         TEXT PRIMARY KEY,
    coupon_rate   FLOAT,
    maturity_date DATE,
    face_value    FLOAT,
    bond_type     TEXT,
    cached_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily FRED ICE BofA OAS bucket boundaries in basis points, keyed by date.
-- Populated by get_or_fetch_oas_buckets in bond_classifier.py: reads today's row;
-- on miss, pulls all 5 series from FRED and inserts. Values from FRED are already
-- in basis points (e.g. 83 = 83 bps) and stored as-is.
-- PK matches ON CONFLICT (date) in the upsert.
CREATE TABLE IF NOT EXISTS fred_oas_spreads (
    date       DATE PRIMARY KEY,
    aaa_oas    FLOAT NOT NULL,
    aa_oas     FLOAT NOT NULL,
    a_oas      FLOAT NOT NULL,
    bbb_oas    FLOAT NOT NULL,
    hy_oas     FLOAT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-user investing profile captured by the /pages/userProfile questionnaire.
-- One row per user (user_id is the PK), so POST creates and PUT updates in place.
-- Bond percent is deliberately NOT stored: it is always 100 - stock_pct, and the
-- BETWEEN 25 AND 75 check therefore enforces Graham's 25/75 band on both sides at once.
-- NULL on the 401(k) columns means "not applicable" (the branch was never taken);
-- the trailing CHECKs make an incoherent branch impossible to persist.
CREATE TABLE IF NOT EXISTS user_profile (
    user_id               UUID PRIMARY KEY REFERENCES users_id(user_id) ON DELETE CASCADE,
    monthly_investment    NUMERIC(12,2) NOT NULL CHECK (monthly_investment >= 0),
    annual_income         NUMERIC(12,2) NOT NULL CHECK (annual_income >= 0),
    stock_pct             SMALLINT NOT NULL CHECK (stock_pct BETWEEN 25 AND 75),
    enterprising_pct      SMALLINT NOT NULL DEFAULT 0 CHECK (enterprising_pct BETWEEN 0 AND 10),
    is_married            BOOLEAN NOT NULL,
    home_state            TEXT NOT NULL CHECK (char_length(home_state) = 2),
    is_employed           BOOLEAN NOT NULL,
    has_401k              BOOLEAN,
    has_401k_match        BOOLEAN,
    match_rate_pct        NUMERIC(5,2) CHECK (match_rate_pct BETWEEN 0 AND 100),
    match_limit_pct       NUMERIC(5,2) CHECK (match_limit_pct BETWEEN 0 AND 100),
    k401_investment_types JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (is_employed OR has_401k IS NULL),
    CHECK (has_401k IS TRUE OR has_401k_match IS NULL),
    CHECK (has_401k_match IS TRUE OR (match_rate_pct IS NULL AND match_limit_pct IS NULL))
);

-- filing_status: added for the "Actual Retrieved" tax-estimate feature. Kept alongside
-- is_married (not a replacement) since the existing /api/users/userProfile frontend form
-- only sends is_married; filing_status defaults from it and is the field tax logic reads.
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS filing_status TEXT;

UPDATE user_profile
SET filing_status = CASE WHEN is_married THEN 'married_filing_jointly' ELSE 'single' END
WHERE filing_status IS NULL;

ALTER TABLE user_profile ALTER COLUMN filing_status SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_profile_filing_status_check'
    ) THEN
        ALTER TABLE user_profile
            ADD CONSTRAINT user_profile_filing_status_check
            CHECK (filing_status IN (
                'single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household'
            ));
    END IF;
END$$;

-- Federal + state tax bracket reference data -- NO LONGER QUERIED as of the
-- PolicyEngine migration (backend/tax_calculator.py now computes federal/state/NIIT
-- tax via policyengine-us instead of hand-rolled brackets). Left in place, unqueried,
-- as a zero-risk rollback safety net; tax_brackets_seed.sql is likewise untouched.
CREATE TABLE IF NOT EXISTS tax_brackets (
    jurisdiction  TEXT     NOT NULL,
    tax_type      TEXT     NOT NULL CHECK (tax_type IN ('ordinary_income', 'long_term_capital_gains', 'state_income')),
    filing_status TEXT     NOT NULL CHECK (filing_status IN (
                        'single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household'
                    )),
    tax_year      SMALLINT NOT NULL,
    bracket_order SMALLINT NOT NULL,
    lower_bound   NUMERIC(14,2) NOT NULL CHECK (lower_bound >= 0),
    upper_bound   NUMERIC(14,2),
    rate          NUMERIC(6,5)   NOT NULL CHECK (rate BETWEEN 0 AND 1),
    PRIMARY KEY (jurisdiction, tax_type, filing_status, tax_year, bracket_order),
    CHECK (upper_bound IS NULL OR upper_bound > lower_bound)
);

-- Year-scoped capital-loss carryover balances for the "Actual Retrieved" tax-estimate
-- feature. One row per (user_id, tax_year); both columns are always <= 0 -- this table
-- only ever holds *unused loss*, never a positive gain balance. A missing row for a
-- given (user_id, tax_year) means "roll forward from the most recent prior year's row,
-- or (0,0) if none" -- callers must not assume a missing row means (0,0) outright (see
-- get_opening_carryover_balance in backend/tax_calculator.py).
CREATE TABLE IF NOT EXISTS net_capital_loss (
    user_id                     UUID     NOT NULL REFERENCES users_id(user_id) ON DELETE CASCADE,
    tax_year                    SMALLINT NOT NULL,
    net_short_term_capital_loss NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (net_short_term_capital_loss <= 0),
    net_long_term_capital_loss  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (net_long_term_capital_loss <= 0),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, tax_year)
);

COMMIT;
