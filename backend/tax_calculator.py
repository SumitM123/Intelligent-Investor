from collections import deque
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import text

from frequenty_used_methods import fetch_finnhub, _parse_snaptrade_datetime
from snapTradeInitialization import snapTrade

'''
    FIFO cost-basis reconstruction for the "Actual Retrieved" feature
    (backend/routes/taxEstimate.py). Traditional brokerage accounts only for now -- see
    brainstorming actual retrived.txt for the full spec. Federal/state/NIIT tax
    computation itself is delegated to policyengine-us (see compute_policyengine_tax)
    rather than hand-rolled here -- verified against PolicyEngine's own source to
    correctly apply IRC 1222(11) short/long-term netting, the IRC 1211(b) $3,000/$1,500
    annual capital-loss cap, and NIIT's investment-income base, all automatically, from
    raw (possibly negative) short_term_capital_gains/long_term_capital_gains inputs.
'''

# Which tax types apply to a given account type, and which user_profile columns each
# one needs. Only traditional_brokerage is wired up in v1; other account types (401k,
# Roth IRA, etc.) extend this dict later without touching the route.
ACCOUNT_TYPE_TAX_REQUIREMENTS: dict[str, list[tuple[str, list[str]]]] = {
    "traditional_brokerage": [
        ("short_term_capital_gains", ["filing_status", "annual_income"]),
        ("long_term_capital_gains", ["filing_status", "annual_income"]),
        ("state_tax", ["filing_status", "annual_income", "home_state"]),
    ],
}


def fetch_buy_sell_activities(
    snapTrade_id: str,
    snaptrade_usersecret_id: str,
    account_id: str,
    symbol: str,
    start_date,
    end_date,
) -> list[dict]:
    """BUY/SELL activities for one symbol in one account, oldest first.

    Mirrors the get_account_activities call pattern used by getDividends in
    snapTrade.py, but type="BUY,SELL" instead of "DIVIDEND". NOTE: the comma-joined
    type value is unverified against SnapTrade's live API (the SDK passes `type`
    through as a raw string with no client-side splitting/validation) -- smoke-test
    against a sandbox account; if it isn't honored, fall back to two separate calls
    (type="BUY", type="SELL") merged before sorting.
    """
    activities_response = snapTrade.account_information.get_account_activities(
        account_id=account_id,
        user_id=snapTrade_id,
        user_secret=snaptrade_usersecret_id,
        start_date=start_date,
        end_date=end_date,
        type="BUY,SELL",
        limit=1000,
    )
    activities_body = activities_response.body or {}
    activities = activities_body.get("data", []) if isinstance(activities_body, dict) else []

    requested_symbol = symbol.strip().upper()
    parsed: list[dict] = []
    for activity in activities:
        activity_type = activity.get("type")
        if activity_type not in ("BUY", "SELL"):
            continue

        activity_symbol = activity.get("symbol") or {}
        ticker = (activity_symbol.get("symbol") or "").upper()
        raw_ticker = (activity_symbol.get("raw_symbol") or "").upper()
        if requested_symbol not in {ticker, raw_ticker}:
            continue

        trade_date_dt = _parse_snaptrade_datetime(activity.get("trade_date"))
        if trade_date_dt is None:
            continue

        shares = activity.get("units")
        price = activity.get("price")
        if shares is None or price is None:
            continue

        try:
            shares_f = float(shares)
            price_f = float(price)
        except (TypeError, ValueError):
            continue

        parsed.append({
            "type": activity_type,
            "shares": shares_f,
            "price": price_f,
            "trade_date": trade_date_dt,
        })

    parsed.sort(key=lambda item: item["trade_date"])
    return parsed


def replay_fifo_lots(activities: list[dict]) -> list[dict]:
    """Replay BUY/SELL activity history (oldest first) into the FIFO lots making up
    current holdings. BUY pushes a lot to the back of the queue; SELL consumes the
    oldest lot(s) first, reducing (never over-consuming) shares -- a lot can be
    partially consumed if a sell is smaller than it."""
    queue: deque[dict] = deque()

    for activity in activities:
        if activity["type"] == "BUY":
            queue.append({
                "shares": activity["shares"],
                "price": activity["price"],
                "trade_date": activity["trade_date"],
            })
        else:  # SELL
            remaining_to_sell = activity["shares"]
            while remaining_to_sell > 0 and queue:
                lot = queue[0]
                if lot["shares"] <= remaining_to_sell:
                    remaining_to_sell -= lot["shares"]
                    queue.popleft()
                else:
                    lot["shares"] -= remaining_to_sell
                    remaining_to_sell = 0

    return list(queue)


def build_fifo_lots(
    snapTrade_id: str,
    snaptrade_usersecret_id: str,
    account_id: str,
    symbol: str,
    account_created_date,
    today,
) -> list[dict]:
    activities = fetch_buy_sell_activities(
        snapTrade_id, snaptrade_usersecret_id, account_id, symbol,
        start_date=account_created_date, end_date=today,
    )
    return replay_fifo_lots(activities)


def consume_fifo_lots(remaining_lots: list[dict], shares_to_sell: float, current_price: float, today: date) -> dict:
    """Applies a hypothetical sale of shares_to_sell against remaining_lots via FIFO,
    bucketing each consumed lot's gain/loss into short-term or long-term by holding
    period (<=365 days vs >365 days)."""
    total_available = sum(lot["shares"] for lot in remaining_lots)
    if shares_to_sell > total_available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot sell more shares than held "
                f"(requested {shares_to_sell}, available {total_available})"
            ),
        )

    short_term_gain = 0.0
    long_term_gain = 0.0
    lots_consumed: list[dict] = []
    remaining_to_sell = shares_to_sell

    for lot in remaining_lots:
        if remaining_to_sell <= 0:
            break
        shares_consumed = min(lot["shares"], remaining_to_sell)
        holding_period_days = (today - lot["trade_date"].date()).days
        gain = (current_price - lot["price"]) * shares_consumed
        term = "short" if holding_period_days <= 365 else "long"
        if term == "short":
            short_term_gain += gain
        else:
            long_term_gain += gain

        lots_consumed.append({
            "shares_consumed": shares_consumed,
            "purchase_price": lot["price"],
            "purchase_date": lot["trade_date"].date().isoformat(),
            "holding_period_days": holding_period_days,
            "term": term,
            "gain": gain,
        })
        remaining_to_sell -= shares_consumed

    return {
        "short_term_gain": short_term_gain,
        "long_term_gain": long_term_gain,
        "lots_consumed": lots_consumed,
    }


# This app's user_profile.filing_status values (lowercase_with_underscores, enforced by
# the user_profile_filing_status_check CHECK constraint in schema.sql) mapped to
# PolicyEngine's TaxUnit filing_status enum. SURVIVING_SPOUSE is intentionally
# unreachable -- user_profile has no such option.
_FILING_STATUS_TO_POLICYENGINE = {
    "single": "SINGLE",
    "married_filing_jointly": "JOINT",
    "married_filing_separately": "SEPARATE",
    "head_of_household": "HEAD_OF_HOUSEHOLD",
}


def map_filing_status_to_policyengine(filing_status: str) -> str:
    mapped = _FILING_STATUS_TO_POLICYENGINE.get(filing_status)
    if mapped is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unmapped filing_status for PolicyEngine: {filing_status}",
        )
    return mapped


def _build_policyengine_situation(
    pe_filing_status: str, annual_income: float, home_state: str,
    short_term_capital_gains: float, long_term_capital_gains: float, tax_year: int,
) -> dict:
    return {
        "people": {"you": {
            "employment_income": {tax_year: annual_income},
            "long_term_capital_gains": {tax_year: long_term_capital_gains},
            "short_term_capital_gains": {tax_year: short_term_capital_gains},
        }},
        "families": {"family": {"members": ["you"]}},
        "marital_units": {"marital_unit": {"members": ["you"]}},
        "tax_units": {"tax_unit": {"members": ["you"], "filing_status": {tax_year: pe_filing_status}}},
        "spm_units": {"spm_unit": {"members": ["you"]}},
        "households": {"household": {"members": ["you"], "state_code": {tax_year: home_state}}},
    }


def compute_policyengine_tax(
    filing_status: str,
    annual_income: float,
    home_state: str,
    short_term_capital_gains: float,
    long_term_capital_gains: float,
    tax_year: int,
) -> dict:
    """Single PolicyEngine Simulation call producing federal income tax, state income
    tax, and NIIT for one household. Inputs are RAW/signed (may be negative) -- do NOT
    pre-offset short-term against long-term before calling this; PolicyEngine's own
    net_capital_gain / loss_limited_net_capital_gains variables (IRC 1222(11), 1211(b))
    do that internally, correctly, per filing status -- verified against source."""
    from policyengine_us import Simulation

    pe_filing_status = map_filing_status_to_policyengine(filing_status)
    situation = _build_policyengine_situation(
        pe_filing_status, annual_income, home_state,
        short_term_capital_gains, long_term_capital_gains, tax_year,
    )
    sim = Simulation(situation=situation)
    federal_tax = float(sim.calculate("income_tax", tax_year)[0])
    niit = float(sim.calculate("net_investment_income_tax", tax_year)[0])
    state_tax = float(sim.calculate("state_income_tax", tax_year)[0])
    return {
        "federal_tax": federal_tax,
        "state_tax": state_tax,
        "niit": niit,
        "total_tax": federal_tax + state_tax + niit,
    }


def get_capital_loss_limit(filing_status: str, tax_year: int) -> float:
    """Real IRC 1211(b) annual capital-loss deduction cap ($3,000 / $1,500 MFS), read
    from PolicyEngine's own parameter tree -- single source of truth, tracks
    PolicyEngine's parameter if it ever changes rather than hardcoding it. Access path
    confirmed via a REPL smoke test against the installed package."""
    from policyengine_us import Simulation

    pe_filing_status = map_filing_status_to_policyengine(filing_status)
    situation = _build_policyengine_situation(pe_filing_status, 0.0, "CA", 0.0, 0.0, tax_year)
    sim = Simulation(situation=situation)
    period = f"{tax_year}-01-01"
    loss_limit = sim.tax_benefit_system.parameters.gov.irs.capital_gains.loss_limit(period)
    return float(loss_limit[pe_filing_status])


def get_opening_carryover_balance(session, user_id, tax_year: int) -> tuple[float, float]:
    """Opening (short_term, long_term) loss balance for tax_year, both <= 0. If a row
    already exists for (user_id, tax_year), that IS the opening balance as-is (a second
    call within the same year reads back what an earlier call this year already wrote --
    see the "Known open question" in the implementation plan). Otherwise rolls forward
    from the most recent PRIOR year's row (any number of years back, not just
    tax_year - 1 -- IRC 1212(b): capital losses carry forward indefinitely, no
    expiration). No row at all (first-ever use) -> (0.0, 0.0)."""
    row = session.execute(
        text(
            """
            SELECT net_short_term_capital_loss, net_long_term_capital_loss
            FROM net_capital_loss
            WHERE user_id = :user_id AND tax_year = :tax_year
            """
        ),
        {"user_id": user_id, "tax_year": tax_year},
    ).first()
    if row is not None:
        return float(row[0]), float(row[1])

    prior_row = session.execute(
        text(
            """
            SELECT net_short_term_capital_loss, net_long_term_capital_loss
            FROM net_capital_loss
            WHERE user_id = :user_id AND tax_year < :tax_year
            ORDER BY tax_year DESC
            LIMIT 1
            """
        ),
        {"user_id": user_id, "tax_year": tax_year},
    ).first()
    if prior_row is not None:
        return float(prior_row[0]), float(prior_row[1])

    return 0.0, 0.0


def store_carryover_balance(
    session, user_id, tax_year: int, filing_status: str,
    new_net_st: float, new_net_lt: float,
) -> dict:
    """Bookkeeping only -- determines what carries into next year's opening balance.
    Never affects this year's actual tax (compute_policyengine_tax already handled that
    from the raw new_net_st/new_net_lt directly). Short-term losses absorb this year's
    $3,000/$1,500 usable-loss cap first, long-term second -- but opposite-signed buckets
    must be netted against each other FIRST, or a positive bucket can survive the
    depletion step untouched and violate the "always <= 0" invariant (worked example:
    st=-5000, lt=+1000 -> net=-4000 -> netting first gives eff_st=-4000, eff_lt=0 ->
    depleting the $3,000 cap from eff_st gives a valid stored (-1000, 0))."""
    net_capital = new_net_st + new_net_lt

    if net_capital >= 0:
        st_new, lt_new, mini, leftover = 0.0, 0.0, 0.0, 0.0
    else:
        if new_net_st < 0 <= new_net_lt:
            eff_st, eff_lt = new_net_st + new_net_lt, 0.0
        elif new_net_lt < 0 <= new_net_st:
            eff_st, eff_lt = 0.0, new_net_lt + new_net_st
        else:
            eff_st, eff_lt = new_net_st, new_net_lt  # both already <= 0

        cap = get_capital_loss_limit(filing_status, tax_year)
        mini = max(net_capital, -cap)        # usable this year, <= 0
        leftover = net_capital - mini        # carries forward, <= 0
        if leftover == 0.0:
            st_new, lt_new = 0.0, 0.0
        else:
            mini_mag = -mini
            st_used = min(mini_mag, -eff_st)
            st_new = eff_st + st_used
            lt_new = eff_lt + (mini_mag - st_used)

    session.execute(
        text(
            """
            INSERT INTO net_capital_loss (user_id, tax_year, net_short_term_capital_loss, net_long_term_capital_loss, updated_at)
            VALUES (:user_id, :tax_year, :st, :lt, NOW())
            ON CONFLICT (user_id, tax_year) DO UPDATE
                SET net_short_term_capital_loss = EXCLUDED.net_short_term_capital_loss,
                    net_long_term_capital_loss = EXCLUDED.net_long_term_capital_loss,
                    updated_at = NOW()
            """
        ),
        {"user_id": user_id, "tax_year": tax_year, "st": st_new, "lt": lt_new},
    )

    return {
        "deductible_against_income_this_year": mini,
        "carryover_to_next_year": leftover,
        "stored_short_term": st_new,
        "stored_long_term": lt_new,
    }


def get_current_price(symbol: str) -> float:
    """Live price via Finnhub /quote -- SnapTrade only exposes purchase-time price via
    activity history, not a reliably live quote."""
    data = fetch_finnhub("quote", symbol=symbol)
    price = data.get("c")
    if price in (None, 0):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not retrieve current price for {symbol}",
        )
    return float(price)
