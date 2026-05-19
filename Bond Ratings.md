# Plan: Bond Grade Classification (TreasuryDirect + FRED Spread Approach)

## Context

Classify each bond held by a user as **high-grade** (AAA / AA / A) or not, using a fully dynamic, API-driven approach — no hardcoded rating tables. The grade is inferred from the bond's **yield spread over the interpolated US Treasury curve**, compared against **live OAS bucket boundaries** fetched daily from FRED. US Treasury bonds are confirmed via TreasuryDirect and classified `AAA` directly (spread over themselves is meaningless).

**Bond source:** bonds are sourced via **manual CUSIP entry** on the Defensive and Enterprising pages — not via SnapTrade. SnapTrade is intentionally excluded for two reasons:

1. SnapTrade's `getUserAccountPositions` endpoint does not advertise fixed-income / individual bonds. Its coverage is stocks, ETFs, crypto, mutual funds, and options. Direct bond holdings either do not surface, or do so inconsistently.
2. SnapTrade's `symbol` object returns **FIGI codes only — no CUSIP**. The downstream TreasuryDirect and Finnhub lookups in this plan are CUSIP-keyed, so even if a bond did appear in a SnapTrade response, there would be no usable identifier for classification.

The manual-entry flow (the form input, persistence to `bonds_table`, page wiring, `POST /api/bonds` endpoint) is owned by **`backend/manualBondsInput.md`**. This document focuses strictly on the **classification logic** invoked by `bond_classifier.classify_bond(cusip, session, fred_api_key)`.

Pie chart and the 50/50 stocks-to-bonds compliance display are deferred to a later phase.

---

## Full Data Flow

`classify_bond(cusip, session, fred_api_key)` is called once per CUSIP submitted to `POST /api/bonds`. The data flow per call:

```
Input: CUSIP (from request body)

1. Look up CUSIP in TreasuryDirect
   → If confirmed Treasury: return { grade: "AAA", is_high_grade: True,
                                     bond_type: "treasury", ytm: None, spread_bps: 0 }
2. Otherwise → fetch bond fundamentals (coupon, maturity, payment_freq, face_value)
       from bond_profile_cache (30-day TTL) or fall back to Finnhub /bond/profile.
       If Finnhub returns no profile: return { grade: "Unclassified",
                                                is_high_grade: False, ... }
3. Annualise the coupon (adjust for payment frequency)
4. Compute YTM via the approximation formula
       (price = par = 1000 — see Known Limitations)
5. Fetch the FRED Treasury yield curve (10 DGS series, in-memory cache per request)
6. Linearly interpolate the Treasury yield at the bond's exact maturity
7. spread_bps = (YTM − interpolated_treasury_yield) × 10,000
8. Fetch today's OAS bucket boundaries from fred_oas_spreads table
       (if no row for today → fetch all 5 OAS series from FRED, INSERT, then return)
9. Classify grade by ladder comparison of spread_bps vs. OAS bucket boundaries
Return: { cusip, grade, is_high_grade, ytm, spread_bps, bond_type }
```

---

## Formulas

**Annualised coupon** (adjust for payment frequency before YTM calc):
```
payment_frequency: "monthly"     → multiply periodic payment × 12
                   "quarterly"   → × 4
                   "semi-annual" → × 2
                   "annual"      → × 1
Coupon_Annual = periodic_coupon_payment × payments_per_year
```

**YTM approximation**:
```
YTM = (Coupon_Annual + (Principal − Price) / Maturity_Years)
      ─────────────────────────────────────────────────────
                   (Principal + Price) / 2
```
- `Principal` = face/par value (typically 1000 for US bonds)
- `Price` = current market price (defaults to par; see Known Limitations)
- `Maturity_Years` = (maturity_date − today).days / 365.25

**Treasury yield linear interpolation** (for maturity falling between two FRED tenors):
```
Interpolated_Yield = Y_low + (T − T_low) / (T_high − T_low) × (Y_high − Y_low)
```
- `T` = bond's exact maturity in years
- `T_low`, `T_high` = the two nearest Treasury maturities that bracket `T`
- `Y_low`, `Y_high` = their respective FRED yields
- If `T` < shortest tenor or > longest tenor → clamp to nearest endpoint (no extrapolation)

**Spread**:
```
Spread_bps = (YTM − Interpolated_Treasury_Yield) × 10,000
```

**Grade classification** (using today's FRED OAS values as bucket boundaries):
```
if Spread_bps <= aaa_oas  → "AAA"          (high-grade ✓)
elif Spread_bps <= aa_oas  → "AA"           (high-grade ✓)
elif Spread_bps <= a_oas   → "A"            (high-grade ✓)
elif Spread_bps <= bbb_oas → "BBB"          (investment-grade, not high-grade ✗)
else                       → "High Yield / Junk"  (not high-grade ✗)
```

---

## Database Tables (Owned by This Plan)

These two cache tables are used exclusively by `bond_classifier.py`. The application's `bonds_table` (manual-entry persistence) is **separate** and is owned by `backend/manualBondsInput.md`.

Create manually in psql inside the postgres container:

### `fred_oas_spreads` — daily OAS bucket boundaries
```sql
CREATE TABLE IF NOT EXISTS fred_oas_spreads (
    date       DATE PRIMARY KEY,
    aaa_oas    FLOAT NOT NULL,   -- BAMLC0A1CAAA
    aa_oas     FLOAT NOT NULL,   -- BAMLC0A2CAA
    a_oas      FLOAT NOT NULL,   -- BAMLC0A3CA
    bbb_oas    FLOAT NOT NULL,   -- BAMLC0A4CBBB
    hy_oas     FLOAT NOT NULL,   -- BAMLH0A0HYM2
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `bond_profile_cache` — bond fundamentals from Finnhub / TreasuryDirect
```sql
CREATE TABLE IF NOT EXISTS bond_profile_cache (
    cusip            TEXT PRIMARY KEY,
    coupon_rate      FLOAT,          -- annual coupon rate as decimal (e.g. 0.05 = 5%)
    payment_freq     TEXT,           -- "monthly", "quarterly", "semi-annual", "annual"
    maturity_date    DATE,
    face_value       FLOAT,          -- par value (default 1000)
    bond_type        TEXT,           -- "treasury", "corporate", "municipal", "agency", "other"
    cached_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
Cache TTL: 30 days (re-fetch from Finnhub if `cached_at` is older than 30 days, since coupon/maturity don't change often but `bond_type` could be corrected).

---

## FRED Series Used

| Purpose | Series ID | Description |
|---|---|---|
| Treasury 1-month | `DGS1MO` | 0.083 yr tenor |
| Treasury 3-month | `DGS3MO` | 0.25 yr |
| Treasury 6-month | `DGS6MO` | 0.5 yr |
| Treasury 1-year | `DGS1` | 1 yr |
| Treasury 2-year | `DGS2` | 2 yr |
| Treasury 5-year | `DGS5` | 5 yr |
| Treasury 7-year | `DGS7` | 7 yr |
| Treasury 10-year | `DGS10` | 10 yr |
| Treasury 20-year | `DGS20` | 20 yr |
| Treasury 30-year | `DGS30` | 30 yr |
| AAA OAS boundary | `BAMLC0A1CAAA` | ICE BofA AAA US Corporate Index OAS |
| AA OAS boundary | `BAMLC0A2CAA` | ICE BofA AA US Corporate Index OAS |
| A OAS boundary | `BAMLC0A3CA` | ICE BofA Single-A US Corporate Index OAS |
| BBB OAS boundary | `BAMLC0A4CBBB` | ICE BofA BBB US Corporate Index OAS |
| HY baseline | `BAMLH0A0HYM2` | ICE BofA US High Yield Index OAS |

All fetched via: `GET https://api.stlouisfed.org/fred/series/observations?series_id={ID}&api_key={FRED_API_KEY}&sort_order=desc&limit=1&file_type=json`

Treasury yields are fetched fresh per request (lightweight, 10 calls). OAS bucket boundaries are cached in `fred_oas_spreads` and only re-fetched when today's row is missing.

---

## Files

| File | Action | Notes |
|---|---|---|
| `backend/bond_classifier.py` | **New** | All classification logic: `classify_bond()` plus private helpers `is_treasury`, `get_bond_profile`, `get_treasury_curve`, `interpolate_treasury_yield`, `annualise_coupon`, `calculate_ytm`, `get_or_fetch_oas_buckets`, `classify_grade` |
| `backend/requirements.txt` | **Modify (if needed)** | Verify `httpx` is present; add if not |

### Files explicitly NOT modified by this plan

- `backend/routes/snapTrade.py` — bond classification does **not** consume SnapTrade positions. The empty `get_user_account_positions` route and the orphaned call previously noted in this document are no longer in scope.
- `frontend/src/app/pages/typesOfInvestor/viewingPage/page.tsx` — bond holdings are surfaced on `defensivePage` and `enterprisingPage`, not `viewingPage`. The viewing page is intentionally left untouched.
- The `POST /api/bonds` and `GET /api/bonds` routes — these belong to `backend/manualBondsInput.md` and are out of scope here. This document only defines the function those routes call.

---

## New Environment Variables

| Variable | Source | Purpose |
|---|---|---|
| `FRED_API_KEY` | Free registration at fred.stlouisfed.org | FRED JSON API for Treasury yields + OAS series |
| `FINNHUB_API_KEY` | Free registration at finnhub.io | Bond profile (coupon, maturity, payment frequency) for non-Treasury CUSIPs |

Add both to the `.env` file at the project root and reference via `os.getenv()` in `bond_classifier.py`.

**Note on Finnhub free tier:** The `/bond/profile` endpoint is in the free SDK, but data availability for non-Treasury bonds varies. If the free tier returns empty profiles for a given CUSIP, `classify_bond` returns `grade = "Unclassified"`. Document this behavior in the UI so users understand why some bonds show no grade.

---

## Critical File Paths

- `backend/bond_classifier.py` — new file (TreasuryDirect + FRED + Finnhub + YTM math + grade ladder)
- `backend/manualBondsInput.md` — companion plan covering the manual-entry flow, `bonds_table`, and the `/api/bonds` endpoints that consume `classify_bond`

---

## Verification

Standalone verification of `bond_classifier.py` (no UI needed):

1. Run the two `CREATE TABLE` statements above (`fred_oas_spreads`, `bond_profile_cache`) in psql inside the postgres container.
2. Add `FRED_API_KEY` and `FINNHUB_API_KEY` to `.env`.
3. Rebuild backend: `docker compose -f docker-compose.dev.yml up --build backend`.
4. From a Python REPL inside the backend container:
   ```python
   from database import SessionLocal
   from bond_classifier import classify_bond
   import os
   with SessionLocal() as s:
       print(classify_bond("912828YK4", s, os.getenv("FRED_API_KEY")))
   ```
   Expect: `grade = "AAA"`, `bond_type = "treasury"`, `spread_bps = 0`, `ytm = None`.
5. Repeat with a known corporate-bond CUSIP. Confirm:
   - `fred_oas_spreads` has a row for today (re-runs the same day reuse it).
   - `bond_profile_cache` has a row for the CUSIP (re-runs within 30 days reuse it).
   - Returned `grade` is consistent with the bond's known credit rating.
6. Manually verify YTM and spread against a third-party calculator (e.g., FINRA BondFacts) — expect agreement within ~1 bps.

End-to-end verification — including the form UI, the `POST /api/bonds` round-trip, and `bonds_table` persistence — is documented in `backend/manualBondsInput.md`.

---

## Known Limitations

- **Price defaults to par (1000).** Manual entry does not capture a live price, so YTM is computed assuming the bond trades at par. This produces a reasonable approximation for Treasuries (which trade near par) but underestimates spread for deeply discounted or premium-priced bonds. To improve later: add a price input to the entry form, or integrate a real-time bond-pricing source.
- **Finnhub free-tier coverage for non-Treasury bonds is inconsistent.** Some corporate CUSIPs return empty profiles → `grade = "Unclassified"`.
- **No CUSIP checksum validation.** Format validation (9 alphanumeric characters) is performed at the form layer; invalid CUSIPs fail later at TreasuryDirect / Finnhub and surface as "Unclassified".
- **Synchronous external API calls** in `classify_bond` block the `POST /api/bonds` request. For first-time CUSIPs this can add several hundred milliseconds. Acceptable for the current MVP; consider background classification in a future iteration.
