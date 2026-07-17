"""
Bonds router.

`POST /api/bonds` syncs the user's bond list for a given investor type
(`is_defensive=true|false`). The frontend sends the current set of bonds, each
with a CUSIP plus user-entered price (per 100 of par), quantity, and purchase
date; the backend classifies any new lots via `bond_classifier.classify_bond`
(feeding in the price + purchase date), reuses stored entries for unchanged
lots, and upserts the full enriched list into `bonds_table` as a JSONB array.

`GET /api/bonds?is_defensive=true|false` returns the persisted list.
"""

import json
import os
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Cookie, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from database import SessionLocal
from bond_classifier import classify_bond


router = APIRouter(prefix="/api/bonds")


class BondInput(BaseModel):
    cusip: str
    coupon_rate: float | None = None  # annual coupon as a PERCENT (e.g. 5.25)
    maturity_date: str | None = None  # ISO "YYYY-MM-DD"
    price: float | None = None        # market price quoted per 100 of par
    quantity: int | None = None       # number of bonds held ($1,000 face each)
    purchase_date: str | None = None  # ISO "YYYY-MM-DD"


class BondsSyncRequest(BaseModel):
    bonds: list[BondInput]
    is_defensive: bool

'''
    REVIEW THIS ROUTE. Sometimes if bonds are deleted, then won't be updated inside of the
    database. Check this and fix
'''
@router.post("")
def syncBonds(
    user_id: Annotated[UUID, Cookie()],
    body: BondsSyncRequest,
):
    """Replace the user's bond list for the given investor type.

    The same CUSIP can appear as multiple distinct lots (different purchase
    date / price / maturity / coupon) — the frontend only merges an incoming
    entry into an existing one when every field except quantity matches, so by
    the time a request lands here, each entry is already a lot the user wants
    tracked separately.

    For each incoming lot:
      - If a stored lot with the same CUSIP + coupon_rate + maturity_date +
        price + purchase_date already exists, reuse its classification
        (grade/ytm/spread/bond_type) instead of re-classifying — those are the
        only fields `classify_bond` uses, so an exact match guarantees the
        same result. Quantity is still refreshed from the incoming item, since
        the frontend increments it in place rather than sending a new lot.
      - Otherwise, call `classify_bond` (passing the user's price + purchase
        date) to look up grade + metrics fresh, then attach the user-supplied
        price / quantity / purchase_date so they persist and round-trip back
        to the client.

    The full enriched array is UPSERTed into `bonds_table` keyed on
    `(user_id, is_defensive)`. Returns the full enriched array.
    """
    fred_api_key = os.getenv("FRED_API_KEY")
    if not fred_api_key:
        raise HTTPException(
            status_code=500,
            detail="FRED_API_KEY is not configured on the server",
        )

    # Group by CUSIP (case-insensitive, stored uppercase) into a hash map of
    # CUSIP -> list of lots. Unlike a `seen` set, this does not collapse
    # repeated CUSIPs — different lots of the same bond are kept as separate
    # entries in the array.
    cleaned_bonds: dict[str, list[BondInput]] = {}
    for item in body.bonds:
        if not isinstance(item.cusip, str):
            continue
        c = item.cusip.strip().upper()
        if not c:
            continue
        cleaned_bonds.setdefault(c, []).append(item)

    with SessionLocal() as session:
        try:
            existing_row = session.execute(
                text("""
                    SELECT bonds FROM bonds_table
                    WHERE user_id = :uid AND is_defensive = :isd
                """),
                {"uid": str(user_id), "isd": body.is_defensive},
            ).first()

            # Group stored entries by CUSIP too — a CUSIP can have more than
            # one stored lot.
            existing_map: dict[str, list[dict]] = {}
            if existing_row and existing_row[0]:
                for entry in existing_row[0]:
                    if isinstance(entry, dict) and entry.get("cusip"):
                        existing_map.setdefault(entry["cusip"], []).append(entry)

            print(
                f"[BOND] syncBonds: user={user_id} is_defensive={body.is_defensive} "
                f"incoming={[(c, i.coupon_rate, i.maturity_date, i.price, i.quantity, i.purchase_date) for c, items in cleaned_bonds.items() for i in items]} "
                f"existing_cusips={list(existing_map.keys())}",
                flush=True,
            )

            new_bonds = []
            for cusip, items in cleaned_bonds.items():
                stored_lots = existing_map.get(cusip, [])
                for item in items:
                    match = next(
                        (
                            e for e in stored_lots
                            if e.get("coupon_rate") == item.coupon_rate
                            and e.get("maturity_date") == item.maturity_date
                            and e.get("price") == item.price
                            and e.get("purchase_date") == item.purchase_date
                        ),
                        None,
                    )
                    if match:
                        # Same lot already classified — reuse the classification.
                        print(f"[BOND] syncBonds: {cusip} lot reused from stored row (not re-classified)", flush=True)
                        enriched = dict(match)
                    else:
                        enriched = classify_bond(
                            cusip,
                            session,
                            fred_api_key,
                            price_per_100=item.price,
                            coupon_rate_pct=item.coupon_rate,
                            maturity_date_str=item.maturity_date,
                            purchase_date_str=item.purchase_date,
                        )
                        print(f"[BOND] syncBonds: {cusip} lot classified -> {enriched}", flush=True)

                    # Persist the user-supplied holding fields with the analysis.
                    # Refreshed even on reuse, since quantity can change without
                    # the lot's classification-relevant fields changing.
                    enriched["coupon_rate"] = item.coupon_rate
                    enriched["maturity_date"] = item.maturity_date
                    enriched["price"] = item.price
                    enriched["quantity"] = item.quantity
                    enriched["purchase_date"] = item.purchase_date
                    new_bonds.append(enriched)

            session.execute(
                text("""
                    INSERT INTO bonds_table (user_id, is_defensive, bonds, updated_at)
                    VALUES (:uid, :isd, CAST(:bonds AS jsonb), NOW())
                    ON CONFLICT (user_id, is_defensive) DO UPDATE SET
                        bonds = EXCLUDED.bonds,
                        updated_at = NOW()
                """),
                {
                    "uid": str(user_id),
                    "isd": body.is_defensive,
                    "bonds": json.dumps(new_bonds, default=str),
                },
            )
            session.commit()
            return {"bonds": new_bonds}
        except HTTPException:
            session.rollback()
            raise
        except Exception as exc:
            session.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Failed to sync bonds: {exc}",
            )

'''
    Used to get the list of bonds that the user when user first enters the page
'''
@router.get("")
def getBonds(
    user_id: Annotated[UUID, Cookie()],
    is_defensive: bool,
):
    """Return the user's persisted bond list for the given investor type."""
    with SessionLocal() as session:
        row = session.execute(
            text("""
                SELECT bonds FROM bonds_table
                WHERE user_id = :uid AND is_defensive = :isd
            """),
            {"uid": str(user_id), "isd": is_defensive},
        ).first()
    return {"bonds": row[0] if row and row[0] else []}
