import bisect
import json
from collections import deque
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import text

from frequenty_used_methods import fetch_finnhub, _parse_snaptrade_datetime
from snapTradeInitialization import snapTrade

'''
    Tax-computation logic for the "Actual Retrieved" feature (backend/routes/taxEstimate.py)
    -- see brainstorming actual retrived.txt for the full spec. Two account types:

    - traditional_brokerage: FIFO cost-basis reconstruction from buy/sell activity, then
      federal/state/NIIT tax via policyengine-us (compute_policyengine_tax) -- verified
      against PolicyEngine's own source to correctly apply IRC 1222(11) short/long-term
      netting, the IRC 1211(b) $3,000/$1,500 annual capital-loss cap, and NIIT's
      investment-income base, all automatically, from raw (possibly negative)
      short_term_capital_gains/long_term_capital_gains inputs. FIFO lots are cached
      per (user_id, account_id, symbol) in fifo_lot_cache rather than rebuilt from
      scratch on every request -- see sync_fifo_cache_for_account, fifo_sync_cursor,
      and the implementation plan for the full incremental-sync design.
    - roth_401k: a single withdrawal amount split proportionally into contribution/profit
      portions, taxed via compute_roth_401k_withdrawal (also policyengine-us-backed, via
      taxable_401k_distributions). No FIFO lots, no capital gains, no carryover.
'''

# Which tax types apply to a given account type, and which user_profile columns each
# one needs. Only traditional_brokerage is wired up in v1; other account types (401k,
# Roth IRA, etc.) extend this dict later without touching the route.
#
# roth_401k's tuples list only what actually lives in user_profile -- the account's
# tenure/5-year-rule status and the withdrawal amount are per-request form data, not
# profile columns, so they're not listed here (see estimateRothWithdrawal).
ACCOUNT_TYPE_TAX_REQUIREMENTS: dict[str, list[tuple[str, list[str]]]] = {
    "traditional_brokerage": [
        ("short_term_capital_gains", ["filing_status", "annual_income"]),
        ("long_term_capital_gains", ["filing_status", "annual_income"]),
        ("state_tax", ["filing_status", "annual_income", "home_state"]),
    ],
    "roth_401k": [
        ("ordinary_income_tax_on_earnings", ["filing_status", "annual_income", "date_of_birth"]),
        ("state_tax_on_earnings", ["filing_status", "annual_income", "home_state", "date_of_birth"]),
        ("early_withdrawal_penalty", ["date_of_birth"]),
    ],
}


def get_required_profile_columns(account_type: str) -> list[str]:
    """Flattens ACCOUNT_TYPE_TAX_REQUIREMENTS[account_type] into the unique user_profile
    columns a request for that account type needs, in first-seen order -- lets a route
    build its SELECT from the dict instead of hardcoding a column list. Used by the Roth
    401(k) route; traditional_brokerage's existing hardcoded SELECT is untouched."""
    columns: list[str] = []
    seen: set[str] = set()
    for _tax_type, required_columns in ACCOUNT_TYPE_TAX_REQUIREMENTS[account_type]:
        for column in required_columns:
            if column not in seen:
                seen.add(column)
                columns.append(column)
    return columns


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


def fetch_all_buy_sell_activities(
    snapTrade_id: str,
    snaptrade_usersecret_id: str,
    account_id: str,
    start_date,
    end_date,
) -> list[dict]:
    """All BUY/SELL activities for an account -- every symbol, not just one -- oldest
    first. Sibling of fetch_buy_sell_activities without the per-symbol filter, used by
    the FIFO lot cache sync (sync_fifo_cache_for_account) so one fetch covers every
    symbol instead of one fetch per symbol being sold (the inefficiency build_fifo_lots
    has today: one full-account fetch per symbol in the route's sell loop).

    Unlike fetch_buy_sell_activities, also captures each activity's `id` and `symbol`:
    `id` is SnapTrade's transaction UUID (confirmed via live docs fetch this session --
    "Unique identifier for the transaction... Please note that this ID *can* change if
    the transaction is deleted and re-added" when SnapTrade reprocesses from the
    brokerage, documented as rare), normalized to a lowercase string once here so every
    later comparison (locate_cursor_activity) is a plain string equality, never a
    per-comparison type coercion. `symbol` is needed to bucket the result by ticker
    before applying to each symbol's cached queue."""
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

    parsed: list[dict] = []
    for activity in activities:
        activity_type = activity.get("type")
        if activity_type not in ("BUY", "SELL"):
            continue

        activity_id = activity.get("id")
        if not activity_id:
            continue

        activity_symbol = activity.get("symbol") or {}
        ticker = (activity_symbol.get("symbol") or activity_symbol.get("raw_symbol") or "").upper()
        if not ticker:
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
            "id": str(activity_id).lower(),
            "symbol": ticker,
            "type": activity_type,
            "shares": shares_f,
            "price": price_f,
            "trade_date": trade_date_dt,
        })

    parsed.sort(key=lambda item: item["trade_date"])
    return parsed


def apply_new_activities_to_cache(existing_lots: list[dict], new_activities: list[dict]) -> list[dict]:
    """Generalized FIFO replay: seeds the deque from existing_lots (already-cached real
    holdings for one symbol, possibly []) instead of always starting empty, then applies
    only new_activities (oldest first, one symbol, REAL BUY/SELL only -- never a
    hypothetical consume_fifo_lots-style sell, which must never be allowed to deplete the
    persisted cache) on top. BUY pushes a lot to the back of the queue; SELL consumes the
    oldest lot(s) first, partially draining a lot if the sell is smaller than it --
    identical mechanics to the original replay_fifo_lots, which is now just this function
    called with an empty seed (see below)."""
    queue: deque[dict] = deque(
        {"shares": lot["shares"], "price": lot["price"], "trade_date": lot["trade_date"]}
        for lot in existing_lots
    )

    for activity in new_activities:
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


def replay_fifo_lots(activities: list[dict]) -> list[dict]:
    """Replay BUY/SELL activity history (oldest first) into the FIFO lots making up
    current holdings, from scratch. Now a thin wrapper around
    apply_new_activities_to_cache so there is exactly one copy of this logic -- two
    independently-maintained copies would risk drifting apart in tax-critical code.
    Used by build_fifo_lots (the always-available non-cached reference path, unchanged)
    and by a full FIFO cache resync (sync_fifo_cache_for_account)."""
    return apply_new_activities_to_cache([], activities)


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


def locate_cursor_activity(
    activities: list[dict],
    cursor_id: str,
    hint_index: int,
    max_probe: int = 200,
) -> int | None:
    """Find the index of the activity whose `id` matches cursor_id (already a
    normalized lowercase string -- see fetch_all_buy_sell_activities), searching
    outward from hint_index in both directions (hint, hint+1, hint-1, hint+2,
    hint-2, ...) up to max_probe steps each way.

    Bidirectional, not backward-only: the right starting position can drift in
    EITHER direction between syncs -- left when old activity ages out of a lookback
    window, right when a late-reported/backdated transaction (trade_date in the
    past, only now visible -- evidenced structurally by trade_date and
    settlement_date being separate fields on every activity) gets inserted earlier
    in the re-sorted list than expected. Confirmed necessary this session, not a
    hypothetical.

    Never trusts the index alone -- every candidate position's `id` is compared by
    value before being accepted as a match. Returns None if not found within bound,
    or if the list doesn't contain it at all -- callers MUST treat None as "try a
    wider fetch, then a full resync," never as "assume the index is still right."
    """
    n = len(activities)
    if n == 0:
        return None

    hint_index = max(0, min(hint_index, n - 1))
    if activities[hint_index]["id"] == cursor_id:
        return hint_index

    for delta in range(1, max_probe + 1):
        right = hint_index + delta
        if right < n and activities[right]["id"] == cursor_id:
            return right
        left = hint_index - delta
        if left >= 0 and activities[left]["id"] == cursor_id:
            return left
        if right >= n and left < 0:
            break  # exhausted the whole list before reaching max_probe

    return None


def _bisect_trade_date_hint(activities: list[dict], target_date: date) -> int:
    """A starting index for locate_cursor_activity's outward search, computed fresh
    from trade_date proximity via binary search rather than reused from a stored
    index. A raw integer index from a PREVIOUS sync's fetch isn't meaningfully
    comparable to a position in THIS sync's freshly fetched list -- the two fetches
    cover different (and differently-sized) windows once the fetch is narrowed to
    last_seen_trade_date, so the index stored on fifo_sync_cursor is kept only as
    observability metadata, not reused as next time's literal hint. activities is
    oldest-first and sorted by trade_date, so bisecting for target_date gives an
    O(log n) starting point; locate_cursor_activity's outward UUID-equality search
    then resolves same-day ties and any small misordering from exactly that point."""
    if not activities:
        return 0
    target_dt = datetime.combine(target_date, time.min, tzinfo=timezone.utc)
    dates = [a["trade_date"] for a in activities]
    idx = bisect.bisect_left(dates, target_dt)
    return max(0, min(idx, len(activities) - 1))


def _serialize_lots(lots: list[dict]) -> list[dict]:
    """Python lots (trade_date as a datetime) -> JSONB-safe dicts (trade_date as a
    plain "YYYY-MM-DD" ISO date string). Time-of-day is deliberately discarded --
    consume_fifo_lots only ever reads lot["trade_date"].date(), so it was never
    meaningful. Mirrors this codebase's existing JSONB convention (e.g.
    k401_investment_types in routes/user.py): json.dumps the result, bind it as a
    string param, CAST(:param AS jsonb) in the SQL."""
    return [
        {
            "shares": lot["shares"],
            "price": lot["price"],
            "trade_date": (
                lot["trade_date"].date().isoformat()
                if hasattr(lot["trade_date"], "date")
                else lot["trade_date"].isoformat()
            ),
        }
        for lot in lots
    ]


def _deserialize_lots(raw_lots) -> list[dict]:
    """JSONB-safe dicts (as already-parsed Python objects -- psycopg2 decodes JSONB
    columns automatically, same as bonds_table.bonds elsewhere in this codebase) ->
    Python lots, upconverting trade_date from an ISO date string back to a
    UTC-midnight datetime so consume_fifo_lots's existing lot["trade_date"].date()
    call keeps working unmodified regardless of whether a lot originated from the
    cache or a fresh SnapTrade fetch -- consume_fifo_lots itself is never touched."""
    if not raw_lots:
        return []
    return [
        {
            "shares": float(lot["shares"]),
            "price": float(lot["price"]),
            "trade_date": datetime.combine(
                date.fromisoformat(lot["trade_date"]), time.min, tzinfo=timezone.utc,
            ),
        }
        for lot in raw_lots
    ]


def sync_fifo_cache_for_account(
    session,
    user_id,
    account_id: str,
    snapTrade_id: str,
    snaptrade_usersecret_id: str,
    today: date,
    symbols_of_interest: set[str],
) -> dict[str, list[dict]]:
    """Orchestrates the per-account FIFO lot cache: locates the SnapTrade activity
    cursor left by the last sync, applies only activity new since then to the cached
    per-symbol queues, and persists the result -- replacing a full lookback-window
    refetch+replay on every call (today's build_fifo_lots, called once per symbol)
    with a small delta fetch, once per account, on steady-state calls.

    Concurrency: locks the account's fifo_sync_cursor row (SELECT ... FOR UPDATE) for
    the whole operation, via an upsert-then-lock pattern so the row always exists to
    lock even on an account that has never synced before. This holds the lock across
    the SnapTrade network call -- accepted given low expected per-account concurrency
    (one user, rarely simultaneous tabs); a future change moving the fetch outside the
    lock must re-validate the cursor hasn't moved after re-acquiring it.

    Never writes anything consume_fifo_lots's hypothetical sell path produced -- only
    real BUY/SELL activity (via apply_new_activities_to_cache) is ever persisted here.

    Does not commit the session -- the caller (estimateRetrieval) owns the transaction
    boundary, same convention as every other session-taking function in this file.

    Returns a dict guaranteed to contain every symbol in symbols_of_interest
    (defaulting to [] for a symbol the account has never held), plus any other symbol
    this sync touched.
    """
    from frequenty_used_methods import fifo_lookback_start_date, FIFO_SYNC_OVERLAP_DAYS

    # Upsert-then-lock: guarantees a row exists to lock even for an account that has
    # never synced before, closing a race where two concurrent first-syncs could both
    # proceed past a "no row found" SELECT ... FOR UPDATE.
    session.execute(
        text(
            """
            INSERT INTO fifo_sync_cursor (user_id, account_id)
            VALUES (:user_id, :account_id)
            ON CONFLICT (user_id, account_id) DO NOTHING
            """
        ),
        {"user_id": user_id, "account_id": account_id},
    )
    cursor_row = session.execute(
        text(
            """
            SELECT last_activity_id, last_seen_trade_date
            FROM fifo_sync_cursor
            WHERE user_id = :user_id AND account_id = :account_id
            FOR UPDATE
            """
        ),
        {"user_id": user_id, "account_id": account_id},
    ).first()

    stored_cursor_id = str(cursor_row[0]).lower() if cursor_row[0] is not None else None
    last_seen_trade_date = cursor_row[1]

    activities: list[dict] = []
    new_activities_by_symbol: dict[str, list[dict]] = {}
    did_resync = False

    if stored_cursor_id is not None:
        # Narrowed fetch first -- the actual lever that cuts SnapTrade load. The
        # cursor's own trade_date is last_seen_trade_date, so it should sit very
        # close to the end of this narrow, oldest-first-sorted window.
        narrow_start = last_seen_trade_date - timedelta(days=FIFO_SYNC_OVERLAP_DAYS)
        narrow_activities = fetch_all_buy_sell_activities(
            snapTrade_id, snaptrade_usersecret_id, account_id,
            start_date=narrow_start, end_date=today,
        )
        hint_index = _bisect_trade_date_hint(narrow_activities, last_seen_trade_date)
        cursor_index = locate_cursor_activity(narrow_activities, stored_cursor_id, hint_index)

        if cursor_index is not None:
            activities = narrow_activities
        else:
            # Not found in the narrow window -- likely just means this account
            # hasn't synced in more than the overlap buffer, not that the cache is
            # actually invalid. Retry wide before concluding a resync is needed, or
            # every >FIFO_SYNC_OVERLAP_DAYS-stale sync would wastefully discard a
            # perfectly good cache.
            wide_activities = fetch_all_buy_sell_activities(
                snapTrade_id, snaptrade_usersecret_id, account_id,
                start_date=fifo_lookback_start_date(), end_date=today,
            )
            hint_index = _bisect_trade_date_hint(wide_activities, last_seen_trade_date)
            cursor_index = locate_cursor_activity(wide_activities, stored_cursor_id, hint_index)
            activities = wide_activities

        if cursor_index is None:
            # Not found even in the full lookback window -- genuinely stale (aged
            # out of the window entirely) or corrupted (SnapTrade's rare
            # reprocessing event reissued the id). Fall through to full resync.
            did_resync = True
        else:
            for activity in activities[cursor_index + 1:]:
                new_activities_by_symbol.setdefault(activity["symbol"], []).append(activity)
    else:
        did_resync = True

    if did_resync:
        activities = fetch_all_buy_sell_activities(
            snapTrade_id, snaptrade_usersecret_id, account_id,
            start_date=fifo_lookback_start_date(), end_date=today,
        )
        new_activities_by_symbol = {}
        for activity in activities:
            new_activities_by_symbol.setdefault(activity["symbol"], []).append(activity)

    existing_rows = session.execute(
        text(
            """
            SELECT symbol, lots FROM fifo_lot_cache
            WHERE user_id = :user_id AND account_id = :account_id
            """
        ),
        {"user_id": user_id, "account_id": account_id},
    ).fetchall()
    existing_lots_by_symbol: dict[str, list[dict]] = {
        row[0]: _deserialize_lots(row[1] or []) for row in existing_rows
    }

    # Which symbols actually need a DB write this sync. Incremental: only symbols
    # with genuinely new activity. Resync: that, PLUS every symbol with a
    # pre-existing cache row -- even one with zero activity in the fresh fetch --
    # so a resync correctly overwrites (to []) a symbol whose activity disappeared
    # from SnapTrade's history rather than silently leaving a stale row behind.
    db_writes_needed = set(new_activities_by_symbol.keys())
    if did_resync:
        db_writes_needed |= set(existing_lots_by_symbol.keys())

    result_lots_by_symbol: dict[str, list[dict]] = dict(existing_lots_by_symbol)

    for sym in db_writes_needed:
        if did_resync:
            updated = apply_new_activities_to_cache([], new_activities_by_symbol.get(sym, []))
        else:
            updated = apply_new_activities_to_cache(
                existing_lots_by_symbol.get(sym, []), new_activities_by_symbol[sym],
            )
        result_lots_by_symbol[sym] = updated

        session.execute(
            text(
                """
                INSERT INTO fifo_lot_cache (user_id, account_id, symbol, lots, updated_at)
                VALUES (:user_id, :account_id, :symbol, CAST(:lots AS jsonb), NOW())
                ON CONFLICT (user_id, account_id, symbol) DO UPDATE
                    SET lots = EXCLUDED.lots, updated_at = NOW()
                """
            ),
            {
                "user_id": user_id,
                "account_id": account_id,
                "symbol": sym,
                "lots": json.dumps(_serialize_lots(updated)),
            },
        )

    if activities:
        newest = activities[-1]
        session.execute(
            text(
                """
                UPDATE fifo_sync_cursor
                SET last_activity_id = CAST(:activity_id AS uuid),
                    last_activity_index = :activity_index,
                    last_seen_trade_date = :trade_date,
                    last_synced_at = NOW()
                WHERE user_id = :user_id AND account_id = :account_id
                """
            ),
            {
                "user_id": user_id,
                "account_id": account_id,
                "activity_id": newest["id"],
                "activity_index": len(activities) - 1,
                "trade_date": newest["trade_date"].date(),
            },
        )
    # else: zero BUY/SELL activity ever for this account -- leave the cursor at
    # (NULL, NULL, NULL). The next sync will trivially take the full-resync path
    # again, which is cheap when there's nothing to fetch. Not special-cased
    # further -- a known, acceptable minor inefficiency for an account with no
    # trade history at all.

    for sym in symbols_of_interest:
        result_lots_by_symbol.setdefault(sym, [])

    return result_lots_by_symbol


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
    """Two PolicyEngine Simulation calls -- one with the household's real income AND
    capital gains, one with the same income but gains zeroed out -- diffed to isolate
    the MARGINAL federal/state/NIIT tax actually attributable to the capital gains.
    A single sim.calculate("income_tax", ...) call returns the household's TOTAL tax
    liability for the year (wage income included), not the incremental tax caused by
    the gains -- diffing against a no-gains baseline is the only way to pull that back
    out of PolicyEngine. Confirmed against a live case: $25,000 salary + a $1.37 gain
    was reporting $890 "federal_tax" (the tax on the $25,000 salary alone) before this
    fix; diffed, it correctly reports the near-zero marginal tax on $1.37.

    Inputs are RAW/signed (may be negative) -- do NOT pre-offset short-term against
    long-term before calling this; PolicyEngine's own net_capital_gain /
    loss_limited_net_capital_gains variables (IRC 1222(11), 1211(b)) do that internally,
    correctly, per filing status -- verified against source."""
    from policyengine_us import Simulation

    pe_filing_status = map_filing_status_to_policyengine(filing_status)

    with_gains_situation = _build_policyengine_situation(
        pe_filing_status, annual_income, home_state,
        short_term_capital_gains, long_term_capital_gains, tax_year,
    )
    baseline_situation = _build_policyengine_situation(
        pe_filing_status, annual_income, home_state, 0.0, 0.0, tax_year,
    )
    with_gains_sim = Simulation(situation=with_gains_situation)
    baseline_sim = Simulation(situation=baseline_situation)

    federal_tax = (
        float(with_gains_sim.calculate("income_tax", tax_year)[0])
        - float(baseline_sim.calculate("income_tax", tax_year)[0])
    )
    niit = (
        float(with_gains_sim.calculate("net_investment_income_tax", tax_year)[0])
        - float(baseline_sim.calculate("net_investment_income_tax", tax_year)[0])
    )
    state_tax = (
        float(with_gains_sim.calculate("state_income_tax", tax_year)[0])
        - float(baseline_sim.calculate("state_income_tax", tax_year)[0])
    )
    return {
        "federal_tax": federal_tax,
        "state_tax": state_tax,
        "niit": niit,
        "total_tax": federal_tax + state_tax + niit,
    }


def get_live_account_balance(snapTrade_id: str, snaptrade_usersecret_id: str, account_id: str) -> float:
    """Live USD total balance for one account, via the same
    account_information.list_user_accounts call + balance.total.amount extraction that
    backend/routes/snapTrade.py's getAllAccountsFromConnection already uses. Deliberately
    uncached -- balances change by the minute and this feeds a tax computation, so a
    stale read is worse than a slower one."""
    all_accounts = snapTrade.account_information.list_user_accounts(
        user_id=snapTrade_id,
        user_secret=snaptrade_usersecret_id,
    ).body
    if not isinstance(all_accounts, list):
        all_accounts = []

    for account in all_accounts:
        if not isinstance(account, dict) or account.get("id") != account_id:
            continue
        balance = account.get("balance") or {}
        total = balance.get("total") or {}
        if total.get("currency") != "USD":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Account {account_id} has no USD balance",
            )
        amount = total.get("amount")
        if amount is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Account {account_id} has no balance available",
            )
        return float(amount)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Account {account_id} was not found",
    )


def _build_roth_401k_situation(
    pe_filing_status: str, annual_income: float, home_state: str,
    taxable_earnings: float, tax_year: int,
) -> dict:
    """Sibling to _build_policyengine_situation, kept separate rather than overloading
    it -- this situation carries taxable_401k_distributions (the taxable portion of a
    non-qualified Roth 401(k) withdrawal) instead of capital-gains fields, and the two
    shouldn't cross-contaminate. taxable_401k_distributions is verified (REPL smoke test
    against the installed policyengine-us) to add ordinary income at the correct marginal
    rate and to leave net_investment_income_tax unchanged -- correct, since IRC 1411
    excludes qualified retirement plan distributions from net investment income."""
    return {
        "people": {"you": {
            "employment_income": {tax_year: annual_income},
            "taxable_401k_distributions": {tax_year: taxable_earnings},
        }},
        "families": {"family": {"members": ["you"]}},
        "marital_units": {"marital_unit": {"members": ["you"]}},
        "tax_units": {"tax_unit": {"members": ["you"], "filing_status": {tax_year: pe_filing_status}}},
        "spm_units": {"spm_unit": {"members": ["you"]}},
        "households": {"household": {"members": ["you"], "state_code": {tax_year: home_state}}},
    }


def compute_roth_401k_withdrawal(
    filing_status: str,
    annual_income: float,
    home_state: str,
    date_of_birth: date,
    withdrawal_amount: float,
    total_contributions: float,
    live_balance: float,
    meets_five_year_rule: bool,
    tax_year: int,
) -> dict:
    """Roth 401(k) non-security withdrawal: no FIFO lots, no capital gains, no
    net_capital_loss carryover involvement -- the withdrawal amount is split into a
    contribution portion (always tax/penalty-free, already-taxed basis) and a profit
    portion (taxed/penalized per the matrix below), by proportion, not by dollar bucket.

    meets_59_5 (from date_of_birth) and meets_five_year_rule (user-attested, not stored)
    together determine a qualified distribution (IRS: both 5-year period AND age 59.5+
    required) -- fully tax- and penalty-free. Every other combination taxes the profit
    portion as ordinary income; the 10% early-withdrawal penalty additionally applies
    whenever meets_59_5 is False, regardless of the 5-year rule (rule-of-55 and other
    exceptions are explicitly not modeled -- see the implementation plan)."""
    if live_balance <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account has no positive balance to withdraw against",
        )

    from dateutil.relativedelta import relativedelta

    age = relativedelta(date.today(), date_of_birth)
    meets_59_5 = (age.years, age.months) >= (59, 6)

    # Account at a loss (contributions >= balance): the entire withdrawal is basis: no
    # gain, nothing to tax or penalize, regardless of age/5-year status.
    contribution_proportion = min(1.0, total_contributions / live_balance)
    profit_proportion = 1.0 - contribution_proportion

    contribution_amount_withdrawn = withdrawal_amount * contribution_proportion
    profit_amount_withdrawn = withdrawal_amount * profit_proportion

    is_qualified = meets_59_5 and meets_five_year_rule

    if is_qualified or profit_amount_withdrawn <= 0:
        federal_tax = 0.0
        state_tax = 0.0
    else:
        from policyengine_us import Simulation

        pe_filing_status = map_filing_status_to_policyengine(filing_status)

        with_earnings_situation = _build_roth_401k_situation(
            pe_filing_status, annual_income, home_state, profit_amount_withdrawn, tax_year,
        )
        baseline_situation = _build_roth_401k_situation(
            pe_filing_status, annual_income, home_state, 0.0, tax_year,
        )
        with_earnings_sim = Simulation(situation=with_earnings_situation)
        baseline_sim = Simulation(situation=baseline_situation)

        federal_tax = (
            float(with_earnings_sim.calculate("income_tax", tax_year)[0])
            - float(baseline_sim.calculate("income_tax", tax_year)[0])
        )
        state_tax = (
            float(with_earnings_sim.calculate("state_income_tax", tax_year)[0])
            - float(baseline_sim.calculate("state_income_tax", tax_year)[0])
        )

    early_withdrawal_penalty = 0.0 if (is_qualified or meets_59_5) else profit_amount_withdrawn * 0.10

    total_tax = federal_tax + state_tax
    total_taxes_and_penalties = total_tax + early_withdrawal_penalty

    return {
        "account_type": "roth_401k",
        "withdrawal_amount": withdrawal_amount,
        "contribution_proportion": contribution_proportion,
        "profit_proportion": profit_proportion,
        "contribution_amount_withdrawn": contribution_amount_withdrawn,
        "profit_amount_withdrawn": profit_amount_withdrawn,
        "meets_age_59_5": meets_59_5,
        "meets_five_year_rule": meets_five_year_rule,
        "is_qualified_distribution": is_qualified,
        "federal_tax": federal_tax,
        "state_tax": state_tax,
        "total_tax": total_tax,
        "early_withdrawal_penalty": early_withdrawal_penalty,
        "total_taxes_and_penalties": total_taxes_and_penalties,
        "net_withdrawal_after_taxes_and_penalties": withdrawal_amount - total_taxes_and_penalties,
        "tax_year": tax_year,
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
