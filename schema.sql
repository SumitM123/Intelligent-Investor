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

COMMIT;
