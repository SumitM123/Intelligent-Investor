from fastapi import APIRouter
from fastapi import HTTPException
from fastapi import Cookie, Query
from fastapi import status
from typing import Annotated
from uuid import UUID
from datetime import date
import re

from database import SessionLocal
from sqlalchemy import text
from frequenty_used_methods import assert_user_exists, getSnapTradeSecretID, fifo_lookback_start_date
from tax_calculator import (
    ACCOUNT_TYPE_TAX_REQUIREMENTS,
    build_fifo_lots,
    consume_fifo_lots,
    net_capital_gains,
    calculate_bracket_tax,
    get_tax_brackets,
    get_current_price,
)

router = APIRouter(prefix="/api/taxEstimate")

_SYMBOL_RE = re.compile(r"[A-Z0-9][A-Z0-9.\-]{0,24}")


@router.get("/estimateRetrival")
def estimateRetrieval(
    user_id: Annotated[UUID, Cookie()],
    snapTrade_id: Annotated[str, Cookie(alias="snapTradeUserID")],
    account_type: str,
    account_id: str,
    symbol: Annotated[list[str], Query()],
    shares: Annotated[list[float], Query()],
):
    if account_type not in ACCOUNT_TYPE_TAX_REQUIREMENTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported account_type: {account_type}",
        )

    if len(symbol) != len(shares):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="symbol and shares must have the same number of entries",
        )
    if not symbol:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one symbol is required")

    # Normalize, validate, and group duplicate symbols (sum their shares) so a
    # repeated symbol is treated as one sell, not two independent FIFO builds.
    requested: dict[str, float] = {}
    for raw_symbol, raw_shares in zip(symbol, shares):
        normalized_symbol = raw_symbol.strip().upper()
        if not _SYMBOL_RE.fullmatch(normalized_symbol):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid symbol: {raw_symbol}",
            )
        if raw_shares <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"shares must be positive for {normalized_symbol}",
            )
        requested[normalized_symbol] = requested.get(normalized_symbol, 0.0) + raw_shares

    try:
        snaptrade_usersecret_id = getSnapTradeSecretID(snapTrade_id)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid request: SnapTrade secret was not found for this user",
        )
    if not snaptrade_usersecret_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid request: SnapTrade secret was not found for this user",
        )

    with SessionLocal() as session:
        try:
            assert_user_exists(session, user_id)
            profile_row = session.execute(
                text(
                    """
                    SELECT filing_status, annual_income, home_state
                    FROM user_profile
                    WHERE user_id = :user_id
                    """
                ),
                {"user_id": user_id},
            ).first()
        except HTTPException:
            session.rollback()
            raise
        except Exception as exc:
            session.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to load user profile: {exc}")

    if profile_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    filing_status, annual_income, home_state = profile_row
    annual_income = float(annual_income)

    today = date.today()
    account_created_date = fifo_lookback_start_date()

    short_term_total = 0.0
    long_term_total = 0.0
    breakdown = []
    price_by_symbol: dict[str, float] = {}

    for sym, shares_to_sell in requested.items():
        lots = build_fifo_lots(
            snapTrade_id, snaptrade_usersecret_id, account_id, sym,
            account_created_date, today,
        )
        if sym not in price_by_symbol:
            price_by_symbol[sym] = get_current_price(sym)
        current_price = price_by_symbol[sym]

        result = consume_fifo_lots(lots, shares_to_sell, current_price, today)
        short_term_total += result["short_term_gain"]
        long_term_total += result["long_term_gain"]
        breakdown.append({
            "symbol": sym,
            "shares_to_sell": shares_to_sell,
            "current_price": current_price,
            "lots_consumed": result["lots_consumed"],
        })

    netting = net_capital_gains(short_term_total, long_term_total)

    if netting["is_net_loss"]:
        net_value = netting["net_value"]
        return {
            "is_net_loss": True,
            "net_value": net_value,
            "total_tax": net_value,
            "federal_tax": 0.0,
            "state_tax": 0.0,
            "deductible_against_income_this_year": max(net_value, -3000.0),
            "carryover_to_next_year": min(net_value + 3000.0, 0.0),
            "breakdown": breakdown,
        }

    tax_year = today.year

    with SessionLocal() as session:
        try:
            federal_ordinary_brackets = get_tax_brackets(
                session, "FEDERAL", "ordinary_income", filing_status, tax_year
            )
            federal_ltcg_brackets = get_tax_brackets(
                session, "FEDERAL", "long_term_capital_gains", filing_status, tax_year
            )
            state_brackets = get_tax_brackets(session, home_state, "state_income", filing_status, tax_year)
        except HTTPException:
            session.rollback()
            raise

    taxable_short_term = netting["taxable_short_term"]
    taxable_long_term = netting["taxable_long_term"]

    federal_short_term_tax = calculate_bracket_tax(federal_ordinary_brackets, annual_income, taxable_short_term)
    federal_long_term_tax = calculate_bracket_tax(
        federal_ltcg_brackets, annual_income + taxable_short_term, taxable_long_term
    )
    federal_tax = federal_short_term_tax + federal_long_term_tax

    # v1 simplification: state tax treats short-term + long-term as one combined
    # ordinary-income bucket (most states have no separate LTCG rate). Known gap:
    # Washington's separate capital-gains excise tax isn't modeled.
    state_tax = calculate_bracket_tax(state_brackets, annual_income, taxable_short_term + taxable_long_term)

    # NIIT (3.8% surtax) intentionally out of scope for v1 -- see brainstorming doc.
    niit = 0.0

    return {
        "net_value": netting["net_value"],
        "short_term_gain": taxable_short_term,
        "long_term_gain": taxable_long_term,
        "federal_short_term_tax": federal_short_term_tax,
        "federal_long_term_tax": federal_long_term_tax,
        "federal_tax": federal_tax,
        "state_tax": state_tax,
        "total_tax": federal_tax + state_tax,
        "niit": niit,
        "tax_year": tax_year,
        "breakdown": breakdown,
    }
