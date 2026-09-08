from fastapi import APIRouter, Cookie, HTTPException, status
from typing import Annotated
from uuid import UUID
import re

from database import SessionLocal
from sqlalchemy import text
from frequenty_used_methods import fetch_fmp
import yfinance as yf

router = APIRouter(prefix="/api/stocks")

_SYMBOL_RE = re.compile(r"[A-Z][A-Z0-9]{0,4}(\.[A-Z]{1,2})?")


def _fetch_etf_weights(symbol: str) -> dict | None:
    try:
        weights = yf.Ticker(symbol).funds_data.sector_weightings
    except Exception as exc:
        print(f"[YF ERR] symbol={symbol} exc={exc}", flush=True)
        return None
    if not weights:
        return None
    return weights


def _fetch_etf_top_holdings(symbol: str) -> list[dict]:
    """Return [{symbol, weight_pct}] for an ETF's largest holdings via yfinance.

    `funds_data.top_holdings` is a DataFrame indexed by ticker with a weight
    column ("Holding Percent") expressed as a fraction. Returns [] on any
    failure or when no holdings are available (common for non-US / leveraged
    funds). Not cached, for the same reason as `_fetch_etf_weights`.
    """
    try:
        holdings = yf.Ticker(symbol).funds_data.top_holdings
    except Exception as exc:
        print(f"[YF ERR] top_holdings symbol={symbol} exc={exc}", flush=True)
        return []
    if holdings is None or getattr(holdings, "empty", True):
        return []
    # Tolerate casing/spacing drift in the weight column name.
    pct_col = None
    for col in holdings.columns:
        if "percent" in str(col).lower():
            pct_col = col
            break
    if pct_col is None:
        return []
    out: list[dict] = []
    try:
        for idx, row in holdings.iterrows():
            weight = row[pct_col]
            if weight is None:
                continue
            try:
                w = float(weight)
            except (TypeError, ValueError):
                continue
            if w != w:  # NaN guard
                continue
            out.append({"symbol": str(idx).upper(), "weight_pct": round(w * 100, 2)})
    except Exception as exc:
        print(f"[YF ERR] top_holdings parse symbol={symbol} exc={exc}", flush=True)
        return []
    return out


# yfinance bond_ratings buckets, in credit order. `us_government` is deliberately
# excluded: it is an overlapping issuer statistic rather than a rating bucket.
# These eight sum to 1.0 on their own (verified against BND/AGG/TLT/HYG), so
# including it would inflate the pie — TLT alone would total ~199%.
_BOND_RATING_LABELS = [
    ("aaa", "AAA"),
    ("aa", "AA"),
    ("a", "A"),
    ("bbb", "BBB"),
    ("bb", "BB"),
    ("b", "B"),
    ("below_b", "Below B"),
    ("other", "Other"),
]


def _fetch_bond_etf_ratings(symbol: str) -> list[dict]:
    """Return [{grade, weight_pct}] describing a bond fund's credit quality.

    Bond funds hold thousands of individual issues, so yfinance exposes no
    top_holdings for them. Credit quality is the meaningful composition to chart
    instead, and it lands on the same grade vocabulary the manually entered
    bonds already use. Returns [] on any failure, matching _fetch_etf_top_holdings.
    """
    try:
        ratings = yf.Ticker(symbol).funds_data.bond_ratings
    except Exception as exc:
        print(f"[YF ERR] bond_ratings symbol={symbol} exc={exc}", flush=True)
        return []
    if not isinstance(ratings, dict):
        return []
    out: list[dict] = []
    for key, label in _BOND_RATING_LABELS:
        try:
            weight = float(ratings.get(key) or 0)
        except (TypeError, ValueError):
            continue
        # Drop empty buckets, and slivers that would render as an invisible
        # wedge with a "0.0%" legend row (BND's unrated residual is 0.03%).
        if weight * 100 < 0.05:
            continue
        out.append({"grade": label, "weight_pct": round(weight * 100, 2)})
    return out


def _is_bond_etf(symbol: str) -> bool:
    """True when an ETF holds more fixed income than equity.

    A bond ETF (BND, AGG, …) is a fixed-income holding, so it belongs on the
    bonds side of Graham's 50/50 rule. Counting one as stock skews every
    allocation signal the app produces, so this is deliberately checked rather
    than inferred from the ticker. Falls back to False (equity ETF) whenever
    yfinance can't answer — the pre-existing behaviour.
    """
    try:
        classes = yf.Ticker(symbol).funds_data.asset_classes
    except Exception as exc:
        print(f"[YF ERR] asset_classes symbol={symbol} exc={exc}", flush=True)
        return False
    if not isinstance(classes, dict):
        return False
    try:
        return float(classes.get("bondPosition") or 0) > float(classes.get("stockPosition") or 0)
    except (TypeError, ValueError):
        return False


def resolve_symbols(symbols: list[str]) -> dict[str, tuple]:
    """Resolve (sector, industry, is_etf, is_bond_etf) for each symbol.

    Reads the `stock_industry` cache first, falls back to FMP /profile for cache
    misses, and persists the misses. Returns
    {symbol: (sector, industry, is_etf, is_bond_etf)}; symbols FMP can't resolve
    are simply omitted. ETFs store sector/industry as "N/A" — their composition
    is fetched live elsewhere.
    """
    if not symbols:
        return {}

    with SessionLocal() as session:
        cached_rows = session.execute(
            text(
                """
                SELECT stock_symbol, sector, industry, is_etf, is_bond_etf
                FROM stock_industry
                WHERE stock_symbol = ANY(:symbols)
                """
            ),
            {"symbols": symbols},
        ).all()

    cache: dict[str, tuple] = {row[0]: (row[1], row[2], row[3], row[4]) for row in cached_rows}
    missing = [s for s in symbols if s not in cache]
    if not missing:
        return cache

    # FMP /stable/profile accepts a single symbol per call (the v3 path-batch
    # form was deprecated Aug 2025). We loop here; the cache absorbs repeat work.
    to_insert = []
    for sym in missing:
        profiles = fetch_fmp("profile", symbol=sym)
        if not isinstance(profiles, list) or not profiles:
            continue
        entry = profiles[0]
        if not isinstance(entry, dict):
            continue
        is_etf = bool(entry.get("isEtf"))
        if is_etf:
            # ETF composition shifts too often to cache locally; callers fetch
            # fresh weights / holdings from yfinance per request. Which side of
            # the 50/50 rule the fund sits on, though, is stable enough to cache.
            sector, industry = "N/A", "N/A"
            is_bond_etf = _is_bond_etf(sym)
        else:
            sector = entry.get("sector") or None
            industry = entry.get("industry") or None
            is_bond_etf = False
        to_insert.append({
            "stock_symbol": sym,
            "sector": sector,
            "industry": industry,
            "is_etf": is_etf,
            "is_bond_etf": is_bond_etf,
        })
        cache[sym] = (sector, industry, is_etf, is_bond_etf)

    if to_insert:
        with SessionLocal() as session:
            try:
                for row in to_insert:
                    session.execute(
                        text(
                            """
                            INSERT INTO stock_industry (stock_symbol, sector, industry, is_etf, is_bond_etf)
                            VALUES (:stock_symbol, :sector, :industry, :is_etf, :is_bond_etf)
                            ON CONFLICT (stock_symbol) DO NOTHING
                            """
                        ),
                        row,
                    )
                session.commit()
            except Exception:
                session.rollback()
                raise

    return cache


# NOTE for frontend callers: `symbols` is forwarded to FMP's /profile/{symbols}
# endpoint as a comma-separated list. FMP does not publish an explicit cap, but
# URL length, plan-tier batch limits, and the 20s HTTP timeout make a single
# request unreliable past ~100 symbols. If the user's portfolio exceeds that,
# chunk the symbols client-side and issue multiple requests at an interval
# rather than sending one oversized call.

# CHECKED
@router.get("/receiveDiversification")
def receiveDiversification(
    user_id: Annotated[UUID, Cookie()],
    symbols: str,
):
    # checking if user exists
    with SessionLocal() as session:
        user_row = session.execute(
            text("SELECT 1 FROM users_id WHERE user_id = :user_id LIMIT 1"),
            {"user_id": user_id},
        ).first()
    if user_row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    requested: list[str] = []
    seen: set[str] = set()
    # symbols is going to be a string of CSV 
    for raw in symbols.split(","):
        s = raw.strip().upper()
        if not s:
            continue
        if not _SYMBOL_RE.fullmatch(s):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid stock symbol: {s}",
            )
        # no duplicate symbols
        if s not in seen:
            seen.add(s)
            requested.append(s)
    # no empty symbol string
    if not requested:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="symbols must contain at least one ticker",
        )

    # Resolve sector/industry/is_etf via the shared cache-then-FMP helper.
    cache = resolve_symbols(requested)

    diversification = []
    etfs: list[dict] = []
    for sym in requested:
        sector, industry, is_etf, _is_bond = cache.get(sym, (None, None, False, False))
        if is_etf:
            weights = _fetch_etf_weights(sym)
            etfs.append({sym: weights if weights is not None else {}})
        else:
            diversification.append((sym, sector, industry))

    return {"diversification": diversification, "ETFs": etfs}
