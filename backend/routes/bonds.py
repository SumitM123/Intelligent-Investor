"""
Bonds router.

`POST /api/bonds` syncs the user's bond list for a given investor type
(`is_defensive=true|false`). The frontend sends the current set of CUSIPs;
the backend classifies any new CUSIPs via `bond_classifier.classify_bond`,
reuses cached entries for unchanged CUSIPs, and upserts the full enriched
list into `bonds_table` as a JSONB array.

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


class BondsSyncRequest(BaseModel):
    cusips: list[str]
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

    For each CUSIP in `body.cusips`:
      - If the CUSIP is already in the stored row, reuse its enriched entry.
      - Otherwise, call `classify_bond` to look up grade + metrics fresh.

    The full enriched array is UPSERTed into `bonds_table` keyed on
    `(user_id, is_defensive)`. Returns the full enriched array.
    """
    fred_api_key = os.getenv("FRED_API_KEY")
    if not fred_api_key:
        raise HTTPException(
            status_code=500,
            detail="FRED_API_KEY is not configured on the server",
        )

    # Normalise + dedupe CUSIPs (case-insensitive, but stored uppercase)
    cleaned_cusips = []
    seen = set()
    for raw in body.cusips:
        if not isinstance(raw, str):
            continue
        c = raw.strip().upper()
        if not c or c in seen:
            continue
        seen.add(c)
        cleaned_cusips.append(c)
    # continue from here
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
            for cusip in cleaned_cusips:
                if cusip in existing_map:
                    new_bonds.append(existing_map[cusip])
                else:
                    new_bonds.append(classify_bond(cusip, session, fred_api_key))

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
