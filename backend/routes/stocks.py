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


# NOTE for frontend callers: `symbols` is forwarded to FMP's /profile/{symbols}
# endpoint as a comma-separated list. FMP does not publish an explicit cap, but
# URL length, plan-tier batch limits, and the 20s HTTP timeout make a single
# request unreliable past ~100 symbols. If the user's portfolio exceeds that,
# chunk the symbols client-side and issue multiple requests at an interval
# rather than sending one oversized call.
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

    with SessionLocal() as session:
        # get's all the rows in one query for each symbol
        cached_rows = session.execute(
            text(
                """
                SELECT stock_symbol, sector, industry, is_etf
                FROM stock_industry
                WHERE stock_symbol = ANY(:symbols)
                """
            ),
            {"symbols": requested},
        ).all()

    # cache[sym] = (sector, industry, is_etf); creating a cache for the already found rows
    cache: dict[str, tuple] = {row[0]: (row[1], row[2], row[3]) for row in cached_rows}
    missing = [s for s in requested if s not in cache]
    # fetching the contents for the symbols that weren't inside of the cache
    if missing:
        # FMP /stable/profile accepts a single symbol per call (the v3 path-batch
        # form was deprecated Aug 2025). We loop here; cache absorbs repeat work.
        fetched: dict[str, tuple] = {}
        for sym in missing:
            profiles = fetch_fmp("profile", symbol=sym)
            if not isinstance(profiles, list) or not profiles:
                continue
            entry = profiles[0]
            if not isinstance(entry, dict):
                continue
            is_etf = bool(entry.get("isEtf"))
            if is_etf:
                # ETF composition shifts too often to cache locally; the route
                # always fetches fresh weights from yfinance below.
                fetched[sym] = ("N/A", "N/A", True)
            else:
                sector = entry.get("sector") or None
                industry = entry.get("industry") or None
                fetched[sym] = (sector, industry, False)
        # create a mapping that needs to be inserted after retriving the respective values
        to_insert = []
        for sym in missing:
            sector, industry, is_etf = fetched.get(sym, (None, None, False))
            cache[sym] = (sector, industry, is_etf)
            to_insert.append({
                "stock_symbol": sym,
                "sector": sector,
                "industry": industry,
                "is_etf": is_etf,
            })

        with SessionLocal() as session:
            try:
                for row in to_insert:
                    session.execute(
                        text(
                            """
                            INSERT INTO stock_industry (stock_symbol, sector, industry, is_etf)
                            VALUES (:stock_symbol, :sector, :industry, :is_etf)
                            ON CONFLICT (stock_symbol) DO NOTHING
                            """
                        ),
                        row,
                    )
                session.commit()
            except Exception:
                session.rollback()
                raise

    diversification = []
    etfs: list[dict] = []
    for sym in requested:
        sector, industry, is_etf = cache.get(sym, (None, None, False))
        diversification.append((sym, sector, industry))
        if is_etf:
            weights = _fetch_etf_weights(sym)
            etfs.append({sym: weights if weights is not None else {}})

    return {"diversification": diversification, "ETFs": etfs}
