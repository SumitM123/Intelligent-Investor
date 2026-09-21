from collections import deque
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import text

from frequenty_used_methods import fetch_finnhub, _parse_snaptrade_datetime
from snapTradeInitialization import snapTrade

'''
    FIFO cost-basis reconstruction + federal/state capital-gains tax estimation for the
    "Actual Retrieved" feature (backend/routes/taxEstimate.py). Traditional brokerage
    accounts only for now -- see brainstorming actual retrived.txt for the full spec.
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


def net_capital_gains(short_term_total: float, long_term_total: float) -> dict:
    """Nets short-term and long-term totals across all securities in the request.

    A net loss (net_value < 0) stops here -- no bracket tax is computed for it.
    Otherwise, if exactly one bucket is negative, it offsets the positive bucket down
    to net_value and only the originally-positive bucket's type is taxed.
    """
    net_value = short_term_total + long_term_total
    if net_value < 0:
        return {
            "is_net_loss": True,
            "net_value": net_value,
            "taxable_short_term": 0.0,
            "taxable_long_term": 0.0,
        }

    if short_term_total < 0 <= long_term_total:
        taxable_short_term, taxable_long_term = 0.0, net_value
    elif long_term_total < 0 <= short_term_total:
        taxable_short_term, taxable_long_term = net_value, 0.0
    else:
        taxable_short_term, taxable_long_term = short_term_total, long_term_total

    return {
        "is_net_loss": False,
        "net_value": net_value,
        "taxable_short_term": taxable_short_term,
        "taxable_long_term": taxable_long_term,
    }


def calculate_bracket_tax(brackets: list[dict], stacking_base: float, taxable_amount: float) -> float:
    """Incremental tax owed on [stacking_base, stacking_base + taxable_amount] -- the
    marginal tax on top of income already earned, not tax on the whole stack from $0."""
    if taxable_amount <= 0:
        return 0.0

    range_start = stacking_base
    range_end = stacking_base + taxable_amount
    tax = 0.0
    for bracket in brackets:
        lower = float(bracket["lower_bound"])
        upper = float(bracket["upper_bound"]) if bracket["upper_bound"] is not None else float("inf")
        overlap = min(range_end, upper) - max(range_start, lower)
        if overlap > 0:
            tax += overlap * float(bracket["rate"])
    return tax


def get_tax_brackets(session, jurisdiction: str, tax_type: str, filing_status: str, tax_year: int) -> list[dict]:
    """Reads a bracket table from the tax_brackets reference table. An empty result is
    a server-side data bug (an unseeded combination), never silently treated as $0 --
    no-income-tax jurisdictions are seeded with an explicit 0%-rate row."""
    rows = session.execute(
        text(
            """
            SELECT lower_bound, upper_bound, rate
            FROM tax_brackets
            WHERE jurisdiction = :jurisdiction
              AND tax_type = :tax_type
              AND filing_status = :filing_status
              AND tax_year = :tax_year
            ORDER BY bracket_order
            """
        ),
        {
            "jurisdiction": jurisdiction,
            "tax_type": tax_type,
            "filing_status": filing_status,
            "tax_year": tax_year,
        },
    ).fetchall()

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                f"No tax bracket data seeded for jurisdiction={jurisdiction} "
                f"tax_type={tax_type} filing_status={filing_status} tax_year={tax_year}"
            ),
        )

    return [{"lower_bound": r[0], "upper_bound": r[1], "rate": r[2]} for r in rows]


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
