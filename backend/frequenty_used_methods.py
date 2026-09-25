# from fastapi import BaseModel
from database import SessionLocal
from fastapi import FastAPI, Response, status, HTTPException
from sqlalchemy import text
from uuid import UUID
from datetime import datetime, timezone, timedelta, date
import httpx
import os
import time
import heapq
import threading
from typing import Optional

_AV_BASE = "https://www.alphavantage.co/query"
_FMP_BASE = "https://financialmodelingprep.com/stable"
_FINNHUB_BASE = "https://finnhub.io/api/v1"

_LEAD_STOCK_API_KEY_VARS = [
    "ALPHA_VANTAGE_API_LEADING_STOCK",
    "ALPHA_VANTAGE_API_LEADING_STOCK_2",
    "ALPHA_VANTAGE_API_LEADING_STOCK_3",
    "ALPHA_VANTAGE_API_LEADING_STOCK_4",
    "ALPHA_VANTAGE_API_LEADING_STOCK_5",
]

# Min-heap of (last_used_unix_time, env_var_name) for the 5 leading-stock AlphaVantage
# keys. Popping always returns the least-recently-used key; fetch_av re-pushes it with
# a fresh timestamp on every call, round-robining load across all 5 keys instead of
# hammering one and sleeping out its per-key rate limit.
lead_stock_min_heap: list[tuple[float, str]] = [
    (time.time(), var) for var in _LEAD_STOCK_API_KEY_VARS
]
heapq.heapify(lead_stock_min_heap)
_lead_stock_heap_lock = threading.Lock()


def _next_lead_stock_api_key_var() -> str:
    """Pop the least-recently-used leading-stock API key env var, timestamp it now,
    and push it back onto the heap. Locked because isLeadingStock is a sync route
    that Starlette runs in a thread pool -- concurrent screens must not corrupt the heap."""
    with _lead_stock_heap_lock:
        _, key_var = heapq.heappop(lead_stock_min_heap)
        heapq.heappush(lead_stock_min_heap, (time.time(), key_var))
        return key_var


def assert_user_exists(session, user_id) -> None:
    '''
        Raises 401 unless user_id is present in users_id. Takes the caller's session so the
        check joins the caller's transaction rather than opening a second one.
    '''
    row = session.execute(
        text("SELECT 1 FROM users_id WHERE user_id = :user_id LIMIT 1"),
        {"user_id": user_id},
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")


def fetch_av(function: str, symbol: Optional[str] = None, **kwargs) -> dict:
    api_key_var = _next_lead_stock_api_key_var()
    api_key = os.environ[api_key_var]
    params = {"function": function, "apikey": api_key}
    if symbol:
        params["symbol"] = symbol
    params.update(kwargs)

    print(f"[AV REQ] function={function} symbol={symbol} kwargs={kwargs} key_var={api_key_var}", flush=True)
    try:
        resp = httpx.get(_AV_BASE, params=params, timeout=20)
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        print(f"[AV HTTP-ERR] function={function} symbol={symbol} exc={exc}", flush=True)
        raise HTTPException(status_code=502, detail=f"AlphaVantage request failed: {exc}")
    data = resp.json()
    if "Information" in data or "Note" in data:
        msg = data.get("Information") or data.get("Note")
        print(f"[AV 429] function={function} symbol={symbol} body={msg}", flush=True)
        raise HTTPException(status_code=429, detail=f"AlphaVantage rate limit reached: {msg}")
    if "Error Message" in data:
        raise HTTPException(status_code=502, detail=f"AlphaVantage error: {data['Error Message']}")
    return data


def fetch_fmp(path: str, **params):
    api_key = os.environ["FINANCIAL_MODELING_PREP_API"]
    query = {"apikey": api_key, **{k: v for k, v in params.items() if k != "apikey"}}
    url = f"{_FMP_BASE}/{path.lstrip('/')}"

    # Never include `query` (carries apikey) or `exc` (httpx embeds the full URL
    # including apikey in its string form) in log lines or client-facing details.
    safe_params = {k: v for k, v in params.items() if k != "apikey"}
    print(f"[FMP REQ] path={path} params={safe_params}", flush=True)
    try:
        resp = httpx.get(url, params=query, timeout=20)
    except httpx.HTTPError as exc:
        print(f"[FMP HTTP-ERR] path={path} type={type(exc).__name__}", flush=True)
        raise HTTPException(status_code=502, detail="FMP request failed")

    if resp.status_code == 429:
        print(f"[FMP 429] path={path}", flush=True)
        raise HTTPException(status_code=429, detail="FMP rate limit reached")
    if resp.status_code >= 400:
        print(f"[FMP HTTP-ERR] path={path} status={resp.status_code}", flush=True)
        raise HTTPException(status_code=502, detail=f"FMP request failed (status {resp.status_code})")

    data = resp.json()
    if isinstance(data, dict) and "Error Message" in data:
        # FMP's "Error Message" body never contains the apikey, so it is safe to surface.
        raise HTTPException(status_code=502, detail=f"FMP error: {data['Error Message']}")
    return data


def fetch_finnhub(endpoint: str, **params) -> dict:
    api_key = os.environ["FINNHUB_API_KEY"]
    query = {**params, "token": api_key}
    url = f"{_FINNHUB_BASE}/{endpoint.lstrip('/')}"

    # Never include `query` (carries the token) or `exc` (httpx embeds the full URL
    # including the token in its string form) in log lines or client-facing details.
    print(f"[FINNHUB REQ] endpoint={endpoint} params={params}", flush=True)
    try:
        resp = httpx.get(url, params=query, timeout=20)
    except httpx.HTTPError as exc:
        print(f"[FINNHUB HTTP-ERR] endpoint={endpoint} type={type(exc).__name__}", flush=True)
        raise HTTPException(status_code=502, detail="Finnhub request failed")

    if resp.status_code == 429:
        print(f"[FINNHUB 429] endpoint={endpoint}", flush=True)
        raise HTTPException(status_code=429, detail="Finnhub rate limit reached")
    if resp.status_code >= 400:
        print(f"[FINNHUB HTTP-ERR] endpoint={endpoint} status={resp.status_code}", flush=True)
        raise HTTPException(status_code=502, detail=f"Finnhub request failed (status {resp.status_code})")

    return resp.json()


def _parse_snaptrade_datetime(raw) -> Optional[datetime]:
    """Parse a SnapTrade timestamp field (datetime object or ISO string, per SDK version
    drift), defaulting missing tzinfo to UTC. Same handling as getDividends in snapTrade.py."""
    parsed = None
    if isinstance(raw, datetime):
        parsed = raw
    elif isinstance(raw, str):
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            parsed = None

    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


# How far back to look for BUY/SELL history when reconstructing FIFO lots. Deliberately
# NOT derived from SnapTrade's account `created_date`: that field can postdate a real
# account's actual trading history (confirmed live -- an account resynced/re-issued
# internally by SnapTrade reported created_date weeks after a genuine BUY activity still
# present in its activity feed), which would silently truncate real lots out of the FIFO
# replay. A fixed long lookback costs nothing extra (the brokerage just returns whatever
# it actually retains) and can't under-fetch.
ACTIVITY_LOOKBACK_DAYS = 3650


def fifo_lookback_start_date() -> date:
    return (datetime.now(timezone.utc) - timedelta(days=ACTIVITY_LOOKBACK_DAYS)).date()


def get_eps_and_pe(symbol: str, current_price: float) -> dict:
    data = fetch_av("EARNINGS", symbol)
    annual = data.get("annualEarnings", [])

    def _parse_eps(entries):
        result = []
        for entry in entries:
            raw = entry.get("reportedEPS")
            if raw and raw != "None":
                try:
                    result.append(float(raw))
                except ValueError:
                    pass
        return result

    def _parse_eps_with_year(entries):
        result = []
        for entry in entries:
            raw = entry.get("reportedEPS")
            fiscal_date = entry.get("fiscalDateEnding", "")
            if raw and raw != "None" and fiscal_date:
                try:
                    year = int(fiscal_date[:4])
                    result.append((year, float(raw)))
                except ValueError:
                    pass
        return result

    eps_values = _parse_eps(annual[:3])
    eps_10yr_dated = _parse_eps_with_year(annual[:10])

    avg_eps = sum(eps_values) / len(eps_values) if eps_values else None
    pe_ratio = (current_price / avg_eps) if (avg_eps and avg_eps > 0) else None
    return {
        "avg_eps_3yr": avg_eps,
        "pe_ratio": pe_ratio,
        "eps_values": eps_values,
        "eps_10yr_dated": eps_10yr_dated,
    }

# class User(BaseModel):
#     google_id: str = None
# def get_user_id(user: User):
#     user_id = None
#     with SessionLocal() as session:
#         try:
#             result = session.execute(text("SELECT user_id FROM users_id WHERE google_id = :google_id"), 
#                             {"google_id": user.google_id})
#             user_id = result.google_id
#         except:
#             session.rollback()
#             user_id = None
#     return user_id
# def add_user_id(user: User):
#     inserted = False
#     with SessionLocal() as session:
#         result = session.execute(text("SELECT EXISTS(SELECT 1 FROM users_id WHERE google_id = :google_id)"), {"google_id": str(user.google_id)})
#         if result.scalar() == True:
#             return JSONResponse(content="User already exists", status_code=200)
#         session.commit()

#     # if doesn't exist, then add the user
#     with SessionLocal() as session:
#         try:
#             session.execute(text("INSERT INTO users_id (google_id) VALUES (:google_id)"), {"google_id": str(user.google_id)})
#             inserted = True
#             session.commit()
#         except:
#             session.rollback()
#             inserted = False

#     if inserted == False:
#         return JSONResponse(content="Failed to add User", status_code=400)
#     else:
#         return JSONResponse(content="Successfull request. Added the user to database", status_code=200)
            

# # Fix this code to delete the userID, and all the elements rows that are correlated with this user_id for other tables
# def delete_user_id(user: User):
#     deleted_user = False
#     with SessionLocal() as session:
#         try:
#             result = session.execute(text("SELECT user_id FROM users_id WHERE google_id = :google_id"), 
#                             {"google_id": user.google_id})
#             user_id = result.google_id
#         except:
#             session.rollback()
#             user_id = None
#     return user_id
def getSnapTradeSecretID(snapTrade_id: str):
    with SessionLocal() as session:
        # maybe just change it such that you're only looking up the row based on snapTrade_id instead of both
        row = session.execute(
            text(
                """
                SELECT snaptrade_usersecret_id
                FROM public.snaptrade_id
                WHERE snaptrade_id = :snaptrade_id
                LIMIT 1
                """
            ),
            {
                "snaptrade_id": snapTrade_id,
            },
        ).first()

    if row is None:
        raise HTTPException(status_code=404, detail="No matching SnapTrade credentials found")
    
    snaptrade_usersecret_id = row[0]
    return snaptrade_usersecret_id