Plan: Manual CUSIP Bond Entry with Backend Grade Lookup                                                │
     │                                                                                                        │
     │ Context                                                                                                │
     │                                                                                                        │
     │ After researching SnapTrade's API in the prior session, we confirmed that SnapTrade's positions        │
     │ endpoint does not reliably expose individual-bond holdings or CUSIPs (only FIGI). The "free aggregator │
     │  with bonds" path is a dead end for this side project. The chosen fallback is manual CUSIP entry: the  │
     │ user types a CUSIP on the Defensive or Enterprising page, the backend looks up grade and metrics via   │
     │ the existing Bond-Ratings.md classification pipeline, and the result is persisted per-user,            │
     │ per-investor-type.                                                                                     │
     │                                                                                                        │
     │ This feature delivers:                                                                                 │
     │ 1. A new BondList component for adding (by CUSIP) and deleting bonds, rendered on both the Defensive   │
     │ and Enterprising pages.                                                                                │
     │ 2. A new bonds_table PostgreSQL table holding one row per (user_id, is_defensive) combination, with a  │
     │ JSONB array of bond entries.                                                                           │
     │ 3. A new /api/bonds router with POST (sync on every add/delete) and GET (fetch on page load)           │
     │ endpoints.                                                                                             │
     │ 4. The grade-lookup logic from Bond Ratings.md (bond_classifier.py) implemented inline as part of this │
     │  feature, since "Backend lookup on POST" requires it.                                                  │
     │ 5. A new enterprisingPage cloned from defensivePage.                                                   │
     │                                                                                                        │
     │ ---                                                                                                    │
     │ Architecture Overview                                                                                  │
     │                                                                                                        │
     │ [defensivePage / enterprisingPage]                                                                     │
     │     ├── Server Component: reads user_id cookie, GET /api/bonds?is_defensive=...                        │
     │     │     └── passes bonds[] to <BondList initialBonds={...} isDefensive={...} />                      │
     │     └── Client Component <BondList>:                                                                   │
     │           ├── State: bonds[] (array of {cusip, grade, ytm, spread_bps, bond_type})                     │
     │           ├── UI: CUSIP input + Add button, list with per-row Delete buttons                           │
     │           └── Effect: on every add/delete → POST /api/bonds with current state                         │
     │                                                                                                        │
     │ [backend/routes/bonds.py]                                                                              │
     │     ├── POST /api/bonds { cusips: [], is_defensive: bool }                                             │
     │     │     ├── For each new CUSIP not already in DB row: bond_classifier.classify(cusip)                │
     │     │     ├── For CUSIPs already in DB row: reuse cached entry (no re-lookup)                          │
     │     │     ├── UPSERT bonds_table row with (user_id, is_defensive, bonds JSONB)                         │
     │     │     └── Return: { bonds: [...] } (the full enriched array)                                       │
     │     └── GET /api/bonds?is_defensive=true|false                                                         │
     │           └── SELECT bonds FROM bonds_table WHERE user_id=? AND is_defensive=?                         │
     │               Returns: { bonds: [...] } (empty array if no row yet)                                    │
     │                                                                                                        │
     │ [backend/bond_classifier.py]                                                                           │
     │     ├── is_treasury(cusip) → bool                  (TreasuryDirect)                                    │
     │     ├── get_bond_profile(cusip, session) → dict    (Finnhub + bond_profile_cache)                      │
     │     ├── get_treasury_curve(fred_key) → dict        (FRED, 10 DGS series)                               │
     │     ├── get_or_fetch_oas_buckets(session, key)     (FRED, 5 OAS series, fred_oas_spreads)              │
     │     └── classify_bond(cusip, session, fred_key) → dict                                                 │
     │            Returns: { cusip, grade, is_high_grade, ytm, spread_bps, bond_type }                        │
     │                                                                                                        │
     │ ---                                                                                                    │
     │ Database Schema                                                                                        │
     │                                                                                                        │
     │ Run manually in psql inside the postgres container:                                                    │
     │                                                                                                        │
     │ CREATE TABLE IF NOT EXISTS bonds_table (                                                               │
     │     user_id      UUID NOT NULL,                                                                        │
     │     is_defensive BOOLEAN NOT NULL,                                                                     │
     │     bonds        JSONB NOT NULL DEFAULT '[]'::jsonb,                                                   │
     │     updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),                                                   │
     │     PRIMARY KEY (user_id, is_defensive),                                                               │
     │     FOREIGN KEY (user_id) REFERENCES users_id(user_id) ON DELETE CASCADE                               │
     │ );                                                                                                     │
     │                                                                                                        │
     │ Schema of each element in bonds JSONB array:                                                           │
     │ {                                                                                                      │
     │   "cusip": "912828YK4",                                                                                │
     │   "grade": "AAA",                                                                                      │
     │   "is_high_grade": true,                                                                               │
     │   "ytm": 4.85,                                                                                         │
     │   "spread_bps": 0,                                                                                     │
     │   "bond_type": "treasury"                                                                              │
     │ }                                                                                                      │
     │                                                                                                        │
     │ Also create the two supporting cache tables from Bond Ratings.md (needed by bond_classifier.py):       │
     │                                                                                                        │
     │ CREATE TABLE IF NOT EXISTS fred_oas_spreads (                                                          │
     │     date       DATE PRIMARY KEY,                                                                       │
     │     aaa_oas    FLOAT NOT NULL,                                                                         │
     │     aa_oas     FLOAT NOT NULL,                                                                         │
     │     a_oas      FLOAT NOT NULL,                                                                         │
     │     bbb_oas    FLOAT NOT NULL,                                                                         │
     │     hy_oas     FLOAT NOT NULL,                                                                         │
     │     fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()                                                      │
     │ );                                                                                                     │
     │                                                                                                        │
     │ CREATE TABLE IF NOT EXISTS bond_profile_cache (                                                        │
     │     cusip          TEXT PRIMARY KEY,                                                                   │
     │     coupon_rate    FLOAT,                                                                              │
     │     payment_freq   TEXT,                                                                               │
     │     maturity_date  DATE,                                                                               │
     │     face_value     FLOAT,                                                                              │
     │     bond_type      TEXT,                                                                               │
     │     cached_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()                                                  │
     │ );                                                                                                     │
     │                                                                                                        │
     │ ---                                                                                                    │
     │ Files to Create / Modify                                                                               │
     │                                                                                                        │
     │ Backend                                                                                                │
     │                                                                                                        │
     │ ┌────────────────────────────┬────────┬───────────────────────────────────────────────┐                │
     │ │            File            │ Action │                     Notes                     │                │
     │ ├────────────────────────────┼────────┼───────────────────────────────────────────────┤                │
     │ │ backend/bond_classifier.py │ Create │ All classification logic from Bond Ratings.md │                │
     │ ├────────────────────────────┼────────┼───────────────────────────────────────────────┤                │
     │ │ backend/routes/bonds.py    │ Create │ New router with POST + GET endpoints          │                │
     │ ├────────────────────────────┼────────┼───────────────────────────────────────────────┤                │
     │ │ backend/main.py            │ Modify │ Import + register new router (line ~27)       │                │
     │ ├────────────────────────────┼────────┼───────────────────────────────────────────────┤                │
     │ │ backend/requirements.txt   │ Modify │ Verify httpx present; add if not              │                │
     │ └────────────────────────────┴────────┴───────────────────────────────────────────────┘                │
     │                                                                                                        │
     │ Frontend                                                                                               │
     │                                                                                                        │
     │ File: frontend/src/app/component/BondList/BondList.tsx                                                 │
     │ Action: Create                                                                                         │
     │ Notes: Client Component: input + add + list + per-row delete                                           │
     │ ────────────────────────────────────────                                                               │
     │ File: frontend/src/app/pages/typesOfInvestor/defensivePage/page.tsx                                    │
     │ Action: Modify                                                                                         │
     │ Notes: Become async Server Component; GET bonds; render <BondList isDefensive={true}                   │
     │ initialBonds={...} />                                                                                  │
     │ ────────────────────────────────────────                                                               │
     │ File: frontend/src/app/pages/typesOfInvestor/enterprisingPage/page.tsx                                 │
     │ Action: Create                                                                                         │
     │ Notes: Clone of defensivePage structure with <BondList isDefensive={false} ... />                      │
     │ ────────────────────────────────────────                                                               │
     │ File: frontend/src/app/pages/typesOfInvestor/viewingPage/page.tsx                                      │
     │ Action: NO CHANGE — intentionally left untouched                                                       │
     │ Notes: Referenced read-only as a cookie-forwarding pattern (lines 19-26). Not modified by this plan.   │
     │                                                                                                        │
     │ Environment                                                                                            │
     │                                                                                                        │
     │ Add to .env at project root:                                                                           │
     │ - FRED_API_KEY (free, register at fred.stlouisfed.org)                                                 │
     │ - FINNHUB_API_KEY (free tier, register at finnhub.io)                                                  │
     │                                                                                                        │
     │ ---                                                                                                    │
     │ Implementation Details                                                                                 │
     │                                                                                                        │
     │ 1. backend/bond_classifier.py (new)                                                                    │
     │                                                                                                        │
     │ Implements the Tier 1 / Tier 2 logic from Bond Ratings.md. Single public entry point:                  │
     │                                                                                                        │
     │ def classify_bond(cusip: str, session, fred_api_key: str) -> dict:                                     │
     │     """                                                                                                │
     │     Returns: {cusip, grade, is_high_grade, ytm, spread_bps, bond_type}                                 │
     │     For Treasuries: short-circuits with grade="AAA", spread_bps=0, ytm=None.                           │
     │     For other bonds: looks up profile, computes YTM via approximation, fetches                         │
     │     interpolated Treasury yield, computes spread, compares against today's OAS buckets.                │
     │     For unknown bonds (no Finnhub data): grade="Unclassified", is_high_grade=False.                    │
     │     """                                                                                                │
     │                                                                                                        │
     │ Internal helpers (private, used only by classify_bond):                                                │
     │ - is_treasury(cusip) → GET TreasuryDirect /TA_WS/securities/search?cusip={cusip}                       │
     │ - get_bond_profile(cusip, session) → read from bond_profile_cache (30-day TTL), fall back to Finnhub   │
     │ /bond/profile, upsert cache                                                                            │
     │ - get_treasury_curve(fred_api_key) → 10 DGS series in parallel via httpx.AsyncClient (sync API         │
     │ wrapper)                                                                                               │
     │ - interpolate_treasury_yield(years, curve) → linear interpolation, clamp at endpoints                  │
     │ - annualise_coupon(periodic, freq) → multiply by payments-per-year                                     │
     │ - calculate_ytm(price, principal, coupon_annual, years) → approximation formula                        │
     │ - get_or_fetch_oas_buckets(session, fred_api_key) → read fred_oas_spreads for today, fetch + insert if │
     │  missing                                                                                               │
     │ - classify_grade(spread_bps, oas_buckets) → ladder of comparisons returning                            │
     │ ("AAA"|"AA"|"A"|"BBB"|"High Yield/Junk", bool)                                                         │
     │                                                                                                        │
     │ Note on price for YTM calc: Since this feature is manual entry without SnapTrade price feed, use the   │
     │ bond's current market price = par (1000) as a default. This produces grade = AAA for all bonds priced  │
     │ at par — acceptable for an MVP; document as a known limitation. To improve later, fetch real prices    │
     │ from Finnhub /quote or add a price field to the entry form. Confirm with user whether to add price     │
     │ input now or defer.                                                                                    │
     │                                                                                                        │
     │ 2. backend/routes/bonds.py (new)                                                                       │
     │                                                                                                        │
     │ Follows the patterns from backend/routes/user.py and backend/routes/snapTrade.py:                      │
     │                                                                                                        │
     │ from fastapi import APIRouter, Cookie, HTTPException                                                   │
     │ from typing import Annotated                                                                           │
     │ from uuid import UUID                                                                                  │
     │ from pydantic import BaseModel                                                                         │
     │ from sqlalchemy import text                                                                            │
     │ import json, os                                                                                        │
     │ from database import SessionLocal                                                                      │
     │ from bond_classifier import classify_bond                                                              │
     │                                                                                                        │
     │ router = APIRouter(prefix="/api/bonds")                                                                │
     │                                                                                                        │
     │ class BondsSyncRequest(BaseModel):                                                                     │
     │     cusips: list[str]                                                                                  │
     │     is_defensive: bool                                                                                 │
     │                                                                                                        │
     │ @router.post("")                                                                                       │
     │ def syncBonds(user_id: Annotated[UUID, Cookie()], body: BondsSyncRequest):                             │
     │     fred_key = os.getenv("FRED_API_KEY")                                                               │
     │     with SessionLocal() as session:                                                                    │
     │         try:                                                                                           │
     │             # Read existing row (if any) to reuse cached entries for unchanged CUSIPs                  │
     │             existing = session.execute(                                                                │
     │                 text("SELECT bonds FROM bonds_table WHERE user_id=:uid AND is_defensive=:isd"),        │
     │                 {"uid": str(user_id), "isd": body.is_defensive},                                       │
     │             ).first()                                                                                  │
     │             existing_map = {b["cusip"]: b for b in (existing[0] if existing else [])}                  │
     │                                                                                                        │
     │             new_bonds = []                                                                             │
     │             for cusip in body.cusips:                                                                  │
     │                 if cusip in existing_map:                                                              │
     │                     new_bonds.append(existing_map[cusip])                                              │
     │                 else:                                                                                  │
     │                     new_bonds.append(classify_bond(cusip, session, fred_key))                          │
     │                                                                                                        │
     │             session.execute(                                                                           │
     │                 text("""                                                                               │
     │                     INSERT INTO bonds_table (user_id, is_defensive, bonds, updated_at)                 │
     │                     VALUES (:uid, :isd, CAST(:bonds AS jsonb), NOW())                                  │
     │                     ON CONFLICT (user_id, is_defensive) DO UPDATE SET                                  │
     │                         bonds = EXCLUDED.bonds,                                                        │
     │                         updated_at = NOW()                                                             │
     │                 """),                                                                                  │
     │                 {"uid": str(user_id), "isd": body.is_defensive, "bonds": json.dumps(new_bonds)},       │
     │             )                                                                                          │
     │             session.commit()                                                                           │
     │             return {"bonds": new_bonds}                                                                │
     │         except Exception:                                                                              │
     │             session.rollback()                                                                         │
     │             raise                                                                                      │
     │                                                                                                        │
     │ @router.get("")                                                                                        │
     │ def getBonds(user_id: Annotated[UUID, Cookie()], is_defensive: bool):                                  │
     │     with SessionLocal() as session:                                                                    │
     │         row = session.execute(                                                                         │
     │             text("SELECT bonds FROM bonds_table WHERE user_id=:uid AND is_defensive=:isd"),            │
     │             {"uid": str(user_id), "isd": is_defensive},                                                │
     │         ).first()                                                                                      │
     │     return {"bonds": row[0] if row else []}                                                            │
     │                                                                                                        │
     │ 3. backend/main.py (modify)                                                                            │
     │                                                                                                        │
     │ After line 27 (existing app.include_router(router_user) etc.):                                         │
     │ from routes.bonds import router as router_bonds                                                        │
     │ # ...                                                                                                  │
     │ app.include_router(router_bonds)                                                                       │
     │                                                                                                        │
     │ 4. frontend/src/app/component/BondList/BondList.tsx (new)                                              │
     │                                                                                                        │
     │ Client Component ("use client"). Props: { initialBonds: BondEntry[], isDefensive: boolean }.           │
     │                                                                                                        │
     │ State: bonds: BondEntry[], inputCusip: string, loading: boolean, error: string | null.                 │
     │                                                                                                        │
     │ UI:                                                                                                    │
     │ - Input for CUSIP + "Add" button                                                                       │
     │ - Below: <ul> of bonds, each row showing {cusip} — {grade} — YTM {ytm}% + a Delete button on the right │
     │ - Loading spinner while POST is in flight                                                              │
     │ - Error message if POST fails                                                                          │
     │                                                                                                        │
     │ Add handler:                                                                                           │
     │ 1. Append {cusip: inputCusip} placeholder to local state.                                              │
     │ 2. POST /api/bonds with { cusips: [...all cusips], is_defensive }, credentials: "include".             │
     │ 3. On response, replace state with response.bonds (now includes grade/YTM/etc. from backend).          │
     │ 4. Clear input.                                                                                        │
     │                                                                                                        │
     │ Delete handler:                                                                                        │
     │ 1. Optimistic local remove.                                                                            │
     │ 2. POST /api/bonds with remaining CUSIPs.                                                              │
     │ 3. On error: restore the removed entry and show error.                                                 │
     │                                                                                                        │
     │ Validation: CUSIPs are 9 characters, alphanumeric. Reject malformed input client-side before POST.     │
     │                                                                                                        │
     │ 5. frontend/src/app/pages/typesOfInvestor/defensivePage/page.tsx (modify)                              │
     │                                                                                                        │
     │ Convert to async Server Component (same pattern as viewingPage):                                       │
     │                                                                                                        │
     │ import { cookies } from "next/headers";                                                                │
     │ import BondList from "@/app/component/BondList/BondList";                                              │
     │ import StockSearchBar from "@/app/component/Stock Search Bar/StockSearchBar";                          │
     │ import ConnectionURL from "@/app/component/ConnectionURL/connectionURL";                               │
     │                                                                                                        │
     │ export default async function DefensivePage() {                                                        │
     │   const cookieStore = await cookies();                                                                 │
     │   const userIdCookie = cookieStore.get("user_id")?.value;                                              │
     │                                                                                                        │
     │   let initialBonds = [];                                                                               │
     │   if (userIdCookie) {                                                                                  │
     │     const res = await fetch(                                                                           │
     │       "http://backend:8000/api/bonds?is_defensive=true",                                               │
     │       { headers: { Cookie: `user_id=${userIdCookie}` }, cache: "no-store" }                            │
     │     );                                                                                                 │
     │     if (res.ok) initialBonds = (await res.json()).bonds || [];                                         │
     │   }                                                                                                    │
     │                                                                                                        │
     │   return (                                                                                             │
     │     <div>                                                                                              │
     │       <h1>Defensive Page</h1>                                                                          │
     │       <StockSearchBar />                                                                               │
     │       <ConnectionURL prevPageURL="defensive" />                                                        │
     │       <BondList initialBonds={initialBonds} isDefensive={true} />                                      │
     │     </div>                                                                                             │
     │   );                                                                                                   │
     │ }                                                                                                      │
     │                                                                                                        │
     │ Important: Remove the import { useUserContext } from ... line — this is the CLAUDE.md-noted bug        │
     │ (Server Component can't use client context). The bug is finally being fixed as part of this change.    │
     │                                                                                                        │
     │ 6. frontend/src/app/pages/typesOfInvestor/enterprisingPage/page.tsx (new)                              │
     │                                                                                                        │
     │ Identical structure, with is_defensive=false and isDefensive={false}:                                  │
     │                                                                                                        │
     │ // Same as defensivePage but:                                                                          │
     │ //   - fetch URL uses ?is_defensive=false                                                              │
     │ //   - <BondList ... isDefensive={false} />                                                            │
     │ //   - <ConnectionURL prevPageURL="enterprising" />                                                    │
     │ //   - <h1>Enterprising Page</h1>                                                                      │
     │                                                                                                        │
     │ ---                                                                                                    │
     │ Critical File Paths                                                                                    │
     │                                                                                                        │
     │ - backend/bond_classifier.py — new, all bond grade/YTM/spread logic                                    │
     │ - backend/routes/bonds.py — new, router with POST + GET                                                │
     │ - backend/main.py:27 — register new router                                                             │
     │ - frontend/src/app/component/BondList/BondList.tsx — new, client-side bond list UI                     │
     │ - frontend/src/app/pages/typesOfInvestor/defensivePage/page.tsx — convert to async Server Component,   │
     │ add <BondList>                                                                                         │
     │ - frontend/src/app/pages/typesOfInvestor/enterprisingPage/page.tsx — new, mirrors defensive            │
     │                                                                                                        │
     │ Existing files referenced (read-only, used as patterns — do not modify):                               │
     │ - frontend/src/app/pages/typesOfInvestor/viewingPage/page.tsx:19-26 — cookie-forwarding pattern for    │
     │ the Server Component fetch                                                                             │
     │ - backend/routes/user.py:34-38 — SessionLocal + text() raw SQL pattern                                 │
     │ - backend/routes/snapTrade.py:195-210 — JSONB write with CAST(:param AS jsonb) + json.dumps()          │
     │ - backend/routes/snapTrade.py:82 — Annotated[str, Cookie(alias="...")] pattern                         │
     │                                                                                                        │
     │ ---                                                                                                    │
     │ Verification                                                                                           │
     │                                                                                                        │
     │ 1. DB setup:                                                                                           │
     │ docker compose -f docker-compose.dev.yml exec db psql -U <user> -d <db> -f /tmp/bonds.sql              │
     │ 1. (or pipe the three CREATE TABLE statements through psql directly).                                  │
     │ 2. Env setup: Add FRED_API_KEY and FINNHUB_API_KEY to .env.                                            │
     │ 3. Start containers: docker compose -f docker-compose.dev.yml up --build (must rebuild backend due to  │
     │ new file).                                                                                             │
     │ 4. End-to-end test (Defensive):                                                                        │
     │   - Sign in via Google OAuth.                                                                          │
     │   - Navigate to /pages/typesOfInvestor/defensivePage.                                                  │
     │   - Type a known Treasury CUSIP (e.g., 912828YK4) and click Add. Confirm:                              │
     │       - Row appears in the list with grade=AAA, bond_type=treasury.                                    │
     │     - Network tab shows POST /api/bonds returning enriched bonds array.                                │
     │     - In psql: SELECT * FROM bonds_table WHERE is_defensive=true; shows the row with correct JSONB.    │
     │   - Add a known corporate-bond CUSIP. Confirm grade is computed (or "Unclassified" if Finnhub          │
     │ free-tier doesn't return data — known limitation).                                                     │
     │   - Click Delete on a row. Confirm UI removes the row and DB row's bonds array shrinks.                │
     │ 5. End-to-end test (Enterprising): Repeat on /pages/typesOfInvestor/enterprisingPage. Confirm          │
     │ is_defensive=false is sent and stored in a separate row.                                               │
     │ 6. Cross-page isolation: Defensive and Enterprising lists must be independent (different rows keyed by │
     │  is_defensive).                                                                                        │
     │ 7. Refresh persistence: Reload either page. Confirm GET /api/bonds?is_defensive=... returns the saved  │
     │ bonds and the list re-renders correctly.                                                               │
     │ 8. Auth boundary: With no user_id cookie, POST should 422 (Cookie missing). GET should return an empty │
     │  list (server component degrades gracefully).                                                          │
     │ 9. Cache check: First add of a non-Treasury CUSIP triggers Finnhub call; second add of the same CUSIP  │
     │ within 30 days uses bond_profile_cache. Confirm via backend logs.                                      │
     │ 10. Manual math check: For one bond, manually compute YTM + spread and compare with the stored value   │
     │ (within 1 bps).                                                                                        │
     │                                                                                                        │
     │ ---                                                                                                    │
     │ Known Limitations / Follow-ups                                                                         │
     │                                                                                                        │
     │ - YTM uses price=par (1000) as default because manual entry has no live price. Real YTM will be        │
     │ available once a price field is added to the form.                                                     │
     │ - Finnhub free-tier coverage for non-Treasury bonds is uncertain. Some corporate CUSIPs may return     │
     │ empty profiles → grade = "Unclassified". Document this in the UI as expected behavior.                 │
     │ - CUSIP validation is format-only (9 alphanumeric chars). The full CUSIP checksum algorithm is not     │
     │ implemented; invalid CUSIPs will be rejected later at TreasuryDirect / Finnhub.                        │
     │ - POST on every add/delete means a slow Finnhub/FRED call blocks the user's add. Consider returning an │
     │  immediate {cusip} placeholder and computing grade async in a future iteration.                        │
     │ - The useUserContext import on defensivePage is being removed. If any other code depends on it (none   │
     │ found in exploration), expect a compile error to surface.                                              │
     ╰────────────────────────────────────────────────────────────────────────────────────────────────────────╯