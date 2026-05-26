# from fastapi import BaseModel
from database import SessionLocal
from fastapi import FastAPI, Response, status, HTTPException
from sqlalchemy import text
from uuid import UUID
import httpx
import os
from typing import Optional

_AV_BASE = "https://www.alphavantage.co/query"


def fetch_av(function: str, symbol: Optional[str] = None, **kwargs) -> dict:
    params = {"function": function, "apikey": os.environ["ALPHA_VANTAGE_API_LEADING_STOCK"]}
    if symbol:
        params["symbol"] = symbol
    params.update(kwargs)
    print(f"[AV REQ] function={function} symbol={symbol} kwargs={kwargs}", flush=True)
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