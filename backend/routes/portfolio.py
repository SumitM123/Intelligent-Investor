"""
Portfolio breakdown router.

`GET /api/portfolio/breakdown?is_defensive=true|false&account_id=<id>` returns a
single composite payload describing how a user's money is split across asset
classes, powering the drill-down pie chart on the Defensive / Enterprising pages.

The stocks half comes from one SnapTrade account's positions (only when
`account_id` is supplied AND SnapTrade is connected); the bonds half comes from
`bonds_table` keyed on `(user_id, is_defensive)` and is independent of any
brokerage account. Missing/disconnected SnapTrade is never an error — the stocks
half is simply empty.

Bond ETFs are the one brokerage holding that crosses over: they are fixed income,
so they are returned separately as `bond_etfs` and counted in `bonds_total`
rather than `stocks_total`, keeping the 50/50 stocks-to-bonds reading honest.
"""

from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Cookie
from sqlalchemy import text

from database import SessionLocal
from routes.snapTrade import fetch_positions_for_account
from routes.stocks import resolve_symbols, _fetch_etf_top_holdings, _fetch_bond_etf_ratings


router = APIRouter(prefix="/api/portfolio")


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


@router.get("/breakdown")
def portfolio_breakdown(
    user_id: Annotated[UUID, Cookie()],
    is_defensive: bool,
    account_id: Optional[str] = None,
    snapTrade_id: Annotated[Optional[str], Cookie(alias="snapTradeUserID")] = None,
):
    """Aggregate one account's stock positions + the user's bonds into one payload."""
    equities: list[dict] = []
    etfs: list[dict] = []
    bond_etfs: list[dict] = []
    stocks_total = 0.0
    bond_etfs_total = 0.0

    # --- Stocks half: a single SnapTrade account's positions ---
    positions: list[dict] = []
    if snapTrade_id and account_id:
        try:
            positions = fetch_positions_for_account(snapTrade_id, account_id)
        except Exception as exc:
            # A brokerage hiccup must not blank out the bonds half.
            print(f"[portfolio] positions fetch failed account={account_id} exc={exc}", flush=True)
            positions = []

    if positions:
        symbols = sorted({p["symbol"] for p in positions if p.get("symbol")})
        resolved = resolve_symbols(symbols)
        for p in positions:
            symbol = p["symbol"]
            market_value = _safe_float(p.get("market_value"))
            sector, industry, is_etf, is_bond_etf = resolved.get(
                symbol, (None, None, False, False)
            )
            if is_etf:
                if is_bond_etf:
                    # A bond fund is fixed income: it belongs on the bonds side
                    # of the 50/50 rule even though it trades as an ETF. It also
                    # exposes no top_holdings, so it drills into credit quality.
                    bond_etfs.append({
                        "symbol": symbol,
                        "market_value": market_value,
                        "top_holdings": [],
                        "credit_quality": _fetch_bond_etf_ratings(symbol),
                    })
                    bond_etfs_total += market_value
                else:
                    etfs.append({
                        "symbol": symbol,
                        "market_value": market_value,
                        "top_holdings": _fetch_etf_top_holdings(symbol),
                    })
                    stocks_total += market_value
            else:
                stocks_total += market_value
                equities.append({
                    "symbol": symbol,
                    "market_value": market_value,
                    "sector": sector or "Unknown",
                    "industry": industry or "Unknown",
                })

    # --- Bonds half: bonds_table for (user_id, is_defensive); not account-scoped ---
    bonds_by_grade: dict[str, list] = {}
    bonds_total = 0.0
    with SessionLocal() as session:
        row = session.execute(
            text("""
                SELECT bonds FROM bonds_table
                WHERE user_id = :uid AND is_defensive = :isd
            """),
            {"uid": str(user_id), "isd": is_defensive},
        ).first()

    stored_bonds = row[0] if row and row[0] else []
    for entry in stored_bonds:
        if not isinstance(entry, dict):
            continue
        # Legacy rows may lack price/qty → value 0; still listed under their grade.
        bond_value = _safe_float(entry.get("purchase_price")) * _safe_float(entry.get("quantity"))
        bonds_total += bond_value
        grade = entry.get("grade") or "Unclassified"
        bonds_by_grade.setdefault(grade, []).append({
            "cusip": entry.get("cusip"),
            "grade": grade,
            "bond_value": round(bond_value, 2),
            "purchase_price": entry.get("purchase_price"),
            "quantity": entry.get("quantity"),
            "ytm": entry.get("ytm"),
            "spread_bps": entry.get("spread_bps"),
            "treasury_yield": entry.get("treasury_yield"),
            "maturity_date": entry.get("maturity_date"),
            "bond_type": entry.get("bond_type"),
        })

    return {
        "stocks_total": round(stocks_total, 2),
        # Bond ETFs are brokerage-held fixed income, so they join the manually
        # entered bonds in the bonds total rather than the stocks total.
        "bonds_total": round(bonds_total + bond_etfs_total, 2),
        "equities": equities,
        "etfs": etfs,
        "bond_etfs": bond_etfs,
        "bonds_by_grade": bonds_by_grade,
    }
