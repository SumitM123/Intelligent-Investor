"""
Bonds router.

`POST /api/bonds` syncs the user's bond list for a given investor type
(`is_defensive=true|false`). The frontend sends the current set of bonds, each
carrying a CUSIP plus the `purchase_price` and `quantity` the user entered; the
backend classifies any new CUSIPs via `bond_classifier.classify_bond`, reuses
cached entries for unchanged CUSIPs (splicing in the latest price/quantity), and
upserts the full enriched list into `bonds_table` as a JSONB array.

`GET /api/bonds?is_defensive=true|false` returns the persisted list. Each entry
carries `cusip, grade, is_high_grade, ytm, spread_bps, bond_type,
treasury_yield, maturity_date, purchase_price, quantity`.
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
    # Optional so re-syncs of legacy rows (which predate these fields) don't 422
    # at the schema layer; newly-added CUSIPs are still required to supply valid
    # values in the handler below.
    purchase_price: float | None = None
    quantity: float | None = None


class BondsSyncRequest(BaseModel):
    bonds: list[BondInput]
    is_defensive: bool


@router.post("")
def syncBonds(
    user_id: Annotated[UUID, Cookie()],
    body: BondsSyncRequest,
):
    """Replace the user's bond list for the given investor type.

    For each bond in `body.bonds` (keyed by CUSIP):
      - If the CUSIP is already in the stored row, reuse its enriched entry and
        overwrite `purchase_price`/`quantity` when the request supplies them.
      - Otherwise, call `classify_bond` to look up grade + metrics fresh. A new
        CUSIP must carry `purchase_price > 0` and `quantity > 0`.

    The full enriched array is UPSERTed into `bonds_table` keyed on
    `(user_id, is_defensive)`. Returns the full enriched array.
    """
    fred_api_key = os.getenv("FRED_API_KEY")
    if not fred_api_key:
        raise HTTPException(
            status_code=500,
            detail="FRED_API_KEY is not configured on the server",
        )

    # Normalise + dedupe by CUSIP (case-insensitive, stored uppercase). For a
    # duplicate CUSIP the last-seen price/quantity wins (treat it as an edit).
    cleaned: dict[str, dict] = {}
    order: list[str] = []
    for item in body.bonds:
        if not isinstance(item.cusip, str):
            continue
        c = item.cusip.strip().upper()
        if not c:
            continue
        if c not in cleaned:
            order.append(c)
        cleaned[c] = {"purchase_price": item.purchase_price, "quantity": item.quantity}

    with SessionLocal() as session:
        try:
            existing_row = session.execute(
                text("""
                    SELECT bonds FROM bonds_table
                    WHERE user_id = :uid AND is_defensive = :isd
                """),
                {"uid": str(user_id), "isd": body.is_defensive},
            ).first()

            existing_map = {}
            if existing_row and existing_row[0]:
                for entry in existing_row[0]:
                    if isinstance(entry, dict) and entry.get("cusip"):
                        existing_map[entry["cusip"]] = entry

            new_bonds = []
            for cusip in order:
                price = cleaned[cusip]["purchase_price"]
                qty = cleaned[cusip]["quantity"]

                if cusip in existing_map:
                    # Reuse the enriched grade/metrics; overwrite price/qty only
                    # when the request supplied valid values (a user edit).
                    entry = dict(existing_map[cusip])
                    if price is not None:
                        if price <= 0:
                            raise HTTPException(
                                status_code=400,
                                detail=f"purchase_price must be > 0 for {cusip}",
                            )
                        entry["purchase_price"] = price
                    if qty is not None:
                        if qty <= 0:
                            raise HTTPException(
                                status_code=400,
                                detail=f"quantity must be > 0 for {cusip}",
                            )
                        entry["quantity"] = qty
                    # Guarantee the keys exist even for legacy rows that lacked them.
                    entry.setdefault("purchase_price", price)
                    entry.setdefault("quantity", qty)
                    new_bonds.append(entry)
                else:
                    # New CUSIP — price + quantity are required and must be positive.
                    if price is None or price <= 0:
                        raise HTTPException(
                            status_code=400,
                            detail=f"purchase_price must be > 0 for new bond {cusip}",
                        )
                    if qty is None or qty <= 0:
                        raise HTTPException(
                            status_code=400,
                            detail=f"quantity must be > 0 for new bond {cusip}",
                        )
                    classified = classify_bond(cusip, session, fred_api_key)
                    classified["purchase_price"] = price
                    classified["quantity"] = qty
                    new_bonds.append(classified)

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
