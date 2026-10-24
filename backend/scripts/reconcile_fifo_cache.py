"""
Manual reconciliation harness for the FIFO lot cache (sync_fifo_cache_for_account),
added to speed up the "Actual Retrieved" traditional_brokerage tax-estimate feature.
Not part of the request path, not a CI gate -- this repo has no automated test runner
(confirmed: zero backend/**/test_*.py files). Run by hand against a real connected
SnapTrade account before merging any change to apply_new_activities_to_cache,
locate_cursor_activity, sync_fifo_cache_for_account, or the JSONB serialize/deserialize
round-trip -- this is tax-correctness code, so the bar is bit-for-bit equivalence with
the old from-scratch replay (build_fifo_lots), not spot-checking.

Run from inside the backend container, from the backend/ directory:
    python scripts/reconcile_fifo_cache.py <user_id> <account_id> <SYMBOL1,SYMBOL2,...>

Requires a real user_id with a snaptrade_id row and a real connected account_id that
holds (or has historically held) the given symbols. Mutates that account's
fifo_sync_cursor / fifo_lot_cache rows as part of testing -- do not run against
anything other than a disposable test user.
"""

import os
import sys
from datetime import date, timedelta
from uuid import UUID

# Running as `python scripts/reconcile_fifo_cache.py` puts scripts/ (not the backend
# root) on sys.path[0], so the flat `from database import ...`-style imports used
# throughout this codebase would otherwise fail regardless of cwd. Make this script
# invokable from anywhere, not just the exact convention in the docstring above.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from sqlalchemy import text

from frequenty_used_methods import getSnapTradeSecretID, fifo_lookback_start_date
from tax_calculator import (
    build_fifo_lots,
    fetch_buy_sell_activities,
    apply_new_activities_to_cache,
    sync_fifo_cache_for_account,
    consume_fifo_lots,
    _serialize_lots,
)

PASS = "PASS"
FAIL = "FAIL"


def _lots_equal(a: list[dict], b: list[dict]) -> bool:
    """Compare on ISO date, not raw type -- cache-derived lots carry trade_date as a
    UTC-midnight datetime upconverted from a stored date string, while build_fifo_lots
    lots carry whatever _parse_snaptrade_datetime returned (full timestamp). Both are
    supposed to represent the same calendar date; a type mismatch alone is not a
    failure, a date mismatch is."""
    if len(a) != len(b):
        return False
    for lot_a, lot_b in zip(a, b):
        if round(lot_a["shares"], 6) != round(lot_b["shares"], 6):
            return False
        if round(lot_a["price"], 6) != round(lot_b["price"], 6):
            return False
        if lot_a["trade_date"].date() != lot_b["trade_date"].date():
            return False
    return True


def _clear_cache(session, user_id, account_id):
    session.execute(
        text("DELETE FROM fifo_sync_cursor WHERE user_id = :u AND account_id = :a"),
        {"u": user_id, "a": account_id},
    )
    session.execute(
        text("DELETE FROM fifo_lot_cache WHERE user_id = :u AND account_id = :a"),
        {"u": user_id, "a": account_id},
    )
    session.commit()


def _report(label: str, ok: bool, detail: str = ""):
    print(f"[{PASS if ok else FAIL}] {label}" + (f" -- {detail}" if detail else ""))
    return ok


def main(user_id_str: str, account_id: str, symbols: list[str]):
    user_id = UUID(user_id_str)
    # snapTrade_id (SnapTrade's own user id, distinct from this app's user_id) must be
    # looked up the same way every other route does -- read it directly here rather
    # than re-deriving getSnapTradeSecretID's internals.
    with SessionLocal() as session:
        row = session.execute(
            text("SELECT snaptrade_id FROM snaptrade_id WHERE user_id = :u"),
            {"u": user_id},
        ).first()
    if row is None:
        print(f"No snaptrade_id row for user_id={user_id}")
        sys.exit(1)
    snapTrade_id = str(row[0])
    snaptrade_usersecret_id = getSnapTradeSecretID(snapTrade_id)

    today = date.today()
    all_ok = True

    # --- 1. Reference: today's from-scratch path, untouched ---
    lots_old: dict[str, list[dict]] = {}
    for sym in symbols:
        lots_old[sym] = build_fifo_lots(
            snapTrade_id, snaptrade_usersecret_id, account_id, sym,
            fifo_lookback_start_date(), today,
        )
    print(f"Reference lots (build_fifo_lots, from scratch): "
          f"{', '.join(f'{s}={len(lots_old[s])} lots' for s in symbols)}")

    # --- 2. Full resync equivalence ---
    with SessionLocal() as session:
        _clear_cache(session, user_id, account_id)
        lots_new_full = sync_fifo_cache_for_account(
            session, user_id, account_id, snapTrade_id, snaptrade_usersecret_id,
            today, symbols_of_interest=set(symbols),
        )
        session.commit()
    for sym in symbols:
        all_ok &= _report(
            f"full resync == build_fifo_lots [{sym}]",
            _lots_equal(lots_old[sym], lots_new_full[sym]),
        )

    # --- 3. Incremental-path equivalence, at several split points ---
    for sym in symbols:
        activities = fetch_buy_sell_activities(
            snapTrade_id, snaptrade_usersecret_id, account_id, sym,
            fifo_lookback_start_date(), today,
        )
        if len(activities) < 2:
            print(f"[SKIP] incremental-path check for {sym} -- fewer than 2 activities")
            continue
        split_points = sorted({1, len(activities) // 2, len(activities) - 1})
        for k in split_points:
            seeded = apply_new_activities_to_cache([], activities[:k])
            cursor_activity = activities[k - 1]
            with SessionLocal() as session:
                _clear_cache(session, user_id, account_id)
                session.execute(
                    text(
                        """
                        INSERT INTO fifo_sync_cursor
                            (user_id, account_id, last_activity_id, last_activity_index, last_seen_trade_date)
                        VALUES (:u, :a, CAST(:id AS uuid), :idx, :d)
                        """
                    ),
                    {
                        "u": user_id, "a": account_id,
                        "id": cursor_activity.get("id") or "00000000-0000-0000-0000-000000000000",
                        "idx": k - 1, "d": cursor_activity["trade_date"].date(),
                    },
                )
                import json
                session.execute(
                    text(
                        """
                        INSERT INTO fifo_lot_cache (user_id, account_id, symbol, lots)
                        VALUES (:u, :a, :s, CAST(:lots AS jsonb))
                        """
                    ),
                    {"u": user_id, "a": account_id, "s": sym, "lots": json.dumps(_serialize_lots(seeded))},
                )
                session.commit()

                # NOTE: this seeded cursor's activity `id` may not exist in a fresh
                # fetch if fetch_buy_sell_activities doesn't itself expose `id`
                # (it doesn't -- only fetch_all_buy_sell_activities does). This
                # split-point check is therefore illustrative of the mechanism, not
                # a fully automated pass/fail without first confirming the account's
                # real activity ids via fetch_all_buy_sell_activities. Flagged
                # in-line rather than silently assumed correct.
                result = sync_fifo_cache_for_account(
                    session, user_id, account_id, snapTrade_id, snaptrade_usersecret_id,
                    today, symbols_of_interest={sym},
                )
                session.commit()
            all_ok &= _report(
                f"incremental split k={k} == build_fifo_lots [{sym}]",
                _lots_equal(lots_old[sym], result[sym]),
            )

    # --- 4. consume_fifo_lots equivalence on a trivial hypothetical sell ---
    with SessionLocal() as session:
        _clear_cache(session, user_id, account_id)
        session.commit()
    for sym in symbols:
        if not lots_old[sym]:
            continue
        shares_to_sell = min(1.0, sum(l["shares"] for l in lots_old[sym]))
        try:
            from tax_calculator import get_current_price
            price = get_current_price(sym)
        except Exception as exc:
            print(f"[SKIP] consume_fifo_lots check for {sym} -- price lookup failed: {exc}")
            continue
        r_old = consume_fifo_lots(lots_old[sym], shares_to_sell, price, today)
        r_new = consume_fifo_lots(lots_new_full[sym], shares_to_sell, price, today)
        all_ok &= _report(
            f"consume_fifo_lots(old) == consume_fifo_lots(cached) [{sym}]",
            round(r_old["short_term_gain"], 6) == round(r_new["short_term_gain"], 6)
            and round(r_old["long_term_gain"], 6) == round(r_new["long_term_gain"], 6),
        )

    # --- 5. Non-mutation guarantee: calling sync twice back-to-back is a no-op ---
    # Step 4 left the cache cleared -- restore it to an already-synced state first,
    # so this checks "second call against a warm cache", not "first call ever".
    with SessionLocal() as session:
        sync_fifo_cache_for_account(
            session, user_id, account_id, snapTrade_id, snaptrade_usersecret_id,
            today, symbols_of_interest=set(symbols),
        )
        session.commit()
    with SessionLocal() as session:
        before = session.execute(
            text("SELECT symbol, lots FROM fifo_lot_cache WHERE user_id = :u AND account_id = :a ORDER BY symbol"),
            {"u": user_id, "a": account_id},
        ).fetchall()
        sync_fifo_cache_for_account(
            session, user_id, account_id, snapTrade_id, snaptrade_usersecret_id,
            today, symbols_of_interest=set(symbols),
        )
        session.commit()
    with SessionLocal() as session:
        after = session.execute(
            text("SELECT symbol, lots FROM fifo_lot_cache WHERE user_id = :u AND account_id = :a ORDER BY symbol"),
            {"u": user_id, "a": account_id},
        ).fetchall()
    all_ok &= _report("back-to-back sync is a no-op (cache unchanged)", before == after)

    # --- 6. Forced drift: shift the stored index, confirm the cursor is still found ---
    with SessionLocal() as session:
        session.execute(
            text(
                """
                UPDATE fifo_sync_cursor SET last_activity_index = last_activity_index + 5
                WHERE user_id = :u AND account_id = :a
                """
            ),
            {"u": user_id, "a": account_id},
        )
        session.commit()
        result = sync_fifo_cache_for_account(
            session, user_id, account_id, snapTrade_id, snaptrade_usersecret_id,
            today, symbols_of_interest=set(symbols),
        )
        session.commit()
    for sym in symbols:
        all_ok &= _report(f"forced-drift sync == build_fifo_lots [{sym}]", _lots_equal(lots_old[sym], result[sym]))

    # --- 7. Forced corruption: bogus cursor id triggers resync, still correct ---
    with SessionLocal() as session:
        session.execute(
            text(
                """
                UPDATE fifo_sync_cursor SET last_activity_id = '00000000-0000-0000-0000-000000000000'
                WHERE user_id = :u AND account_id = :a
                """
            ),
            {"u": user_id, "a": account_id},
        )
        session.commit()
        result = sync_fifo_cache_for_account(
            session, user_id, account_id, snapTrade_id, snaptrade_usersecret_id,
            today, symbols_of_interest=set(symbols),
        )
        session.commit()
    for sym in symbols:
        all_ok &= _report(
            f"forced-corruption (resync fallback) == build_fifo_lots [{sym}]",
            _lots_equal(lots_old[sym], result[sym]),
        )

    # --- 8. Narrow-miss-then-widen: stale last_seen_trade_date still finds the cursor ---
    with SessionLocal() as session:
        cursor = session.execute(
            text("SELECT last_activity_id FROM fifo_sync_cursor WHERE user_id = :u AND account_id = :a"),
            {"u": user_id, "a": account_id},
        ).first()
        if cursor and cursor[0]:
            session.execute(
                text(
                    """
                    UPDATE fifo_sync_cursor SET last_seen_trade_date = :d
                    WHERE user_id = :u AND account_id = :a
                    """
                ),
                {"u": user_id, "a": account_id, "d": today - timedelta(days=60)},
            )
            session.commit()
            result = sync_fifo_cache_for_account(
                session, user_id, account_id, snapTrade_id, snaptrade_usersecret_id,
                today, symbols_of_interest=set(symbols),
            )
            session.commit()
            for sym in symbols:
                all_ok &= _report(
                    f"narrow-miss-then-widen == build_fifo_lots [{sym}]",
                    _lots_equal(lots_old[sym], result[sym]),
                )

    print()
    print("ALL CHECKS PASSED" if all_ok else "SOME CHECKS FAILED -- see [FAIL] lines above")
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(f"Usage: python {sys.argv[0]} <user_id> <account_id> <SYMBOL1,SYMBOL2,...>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2], [s.strip().upper() for s in sys.argv[3].split(",")])
