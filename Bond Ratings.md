# Plan: Bond Grade Classification (Hybrid TreasuryDirect + FRED Spread Approach)

## Context
For each bond in a user's selected brokerage account, classify it as **high-grade** (AAA / AA / A) or not using a fully dynamic, API-driven approach — no hardcoded rating tables. The grade is inferred from the bond's **yield spread over the interpolated US Treasury curve**, compared against **live OAS bucket boundaries** fetched daily from FRED. US Treasury bonds are confirmed via TreasuryDirect and classified AAA directly (spread over themselves is meaningless). The result is displayed as a bond holdings table on the `viewingPage`.

Pie chart and the 50/50 compliance display are deferred to a later phase.

---

## Full Data Flow

```
Request: GET /api/snapTrade/get_user_account_positions?account_id=...

1. Call SnapTrade → get all positions for the account
2. For each position:
   a. Classify as stock / bond / other via symbol.type.code
   b. If bond:
      i.  Look up CUSIP in TreasuryDirect → if confirmed Treasury → grade = "AAA", done
      ii. Otherwise → fetch bond fundamentals (coupon, maturity, payment freq)
              from bond_profile_cache or Finnhub /bond/profile
      iii. Calculate annualised coupon (adjust for payment frequency)
      iv.  Calculate YTM using the approximation formula
      v.   Fetch Treasury yield curve from FRED (cached in-request or from DB)
      vi.  Interpolate Treasury yield at bond's exact maturity (linear interpolation)
      vii. Spread (bps) = (YTM − interpolated Treasury yield) × 10,000
      viii.Fetch today's OAS buckets from fred_oas_spreads table
              (if table has no row for today → fetch from FRED and insert first)
      ix.  Classify grade: spread vs. OAS bucket boundaries
3. Return list of bonds with symbol, type, YTM, spread_bps, grade, is_high_grade
```

---

## Formulas

**Annualised coupon** (adjust for payment frequency before YTM calc):
```
payment_frequency: "monthly" → multiply periodic payment × 12
                   "quarterly" → × 4
                   "semi-annual" → × 2
                   "annual" → × 1
Coupon_Annual = periodic_coupon_payment × payments_per_year
```

**YTM approximation**:
```
YTM = (Coupon_Annual + (Principal − Price) / Maturity_Years)
      ─────────────────────────────────────────────────────
                   (Principal + Price) / 2
```
- `Principal` = face/par value (typically 1000 for US bonds)
- `Price` = current market price from SnapTrade position
- `Maturity_Years` = (maturity_date − today).days / 365.25

**Treasury yield linear interpolation** (for maturity falling between two FRED tenors):
```
Interpolated_Yield = Y_low + (T − T_low) / (T_high − T_low) × (Y_high − Y_low)
```
- T = bond's exact maturity in years
- T_low, T_high = the two nearest Treasury maturities that bracket T
- Y_low, Y_high = their respective FRED yields
- If T < shortest tenor or > longest tenor → use nearest endpoint (no extrapolation)

**Spread**:
```
Spread_bps = (YTM − Interpolated_Treasury_Yield) × 10,000
```

**Grade classification** (using today's FRED OAS values as bucket boundaries):
```
if Spread_bps <= aaa_oas  → "AAA"   (high-grade ✓)
elif Spread_bps <= aa_oas  → "AA"    (high-grade ✓)
elif Spread_bps <= a_oas   → "A"     (high-grade ✓)
elif Spread_bps <= bbb_oas → "BBB"   (investment-grade, not high-grade ✗)
else                       → "High Yield / Junk"  (not high-grade ✗)
```

---

## New Database Tables

Tables are created manually in PostgreSQL (no migration runner exists in the project).

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
Cache TTL: 30 days (re-fetch from Finnhub if `cached_at` is older than 30 days, since coupon/maturity don't change often but bond_type could be corrected).

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

Treasury yields are fetched fresh per-request (lightweight, 10 calls). OAS bucket boundaries are cached in DB and only re-fetched when today's row is missing.

---

## Files to Create or Modify

| File | Action |
|---|---|
| `backend/bond_classifier.py` | **New** — all classification logic (YTM, interpolation, FRED calls, grading) |
| `backend/routes/snapTrade.py` | **Modify** — implement the empty `get_user_account_positions` route (line 234) + fix orphaned call at line 250 |
| `backend/requirements.txt` | **Modify** — add `httpx` if not already present (check first) |
| `frontend/src/app/pages/typesOfInvestor/viewingPage/page.tsx` | **Modify** — fetch positions endpoint and render bond table |

---

## Step-by-Step Implementation

### Step 1 — Create the two new DB tables
Run manually in psql inside the postgres container:
```sql
CREATE TABLE IF NOT EXISTS fred_oas_spreads (
    date       DATE PRIMARY KEY,
    aaa_oas    FLOAT NOT NULL,
    aa_oas     FLOAT NOT NULL,
    a_oas      FLOAT NOT NULL,
    bbb_oas    FLOAT NOT NULL,
    hy_oas     FLOAT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bond_profile_cache (
    cusip            TEXT PRIMARY KEY,
    coupon_rate      FLOAT,
    payment_freq     TEXT,
    maturity_date    DATE,
    face_value       FLOAT,
    bond_type        TEXT,
    cached_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Step 2 — `backend/bond_classifier.py` (new file)

```python
# Key functions — all logic lives here, imported by snapTrade.py

def fetch_fred_series(series_id: str, fred_api_key: str) -> float:
    # GET latest observation from FRED JSON API
    # Returns the float value of the most recent non-null observation

def get_treasury_curve(fred_api_key: str) -> dict[float, float]:
    # Returns {maturity_years: yield_percent} for all 10 DGS series
    # e.g. {0.083: 5.21, 0.25: 5.18, 0.5: 5.10, 1: 4.95, ...}

def interpolate_treasury_yield(maturity_years: float, curve: dict[float, float]) -> float:
    # Linear interpolation between the two bracketing tenors
    # Clamps to nearest endpoint if outside range

def annualise_coupon(periodic_payment: float, payment_freq: str) -> float:
    # Multiplies by payments_per_year based on freq string

def calculate_ytm(price: float, principal: float, coupon_annual: float, maturity_years: float) -> float:
    # Applies the approximation formula
    # Returns YTM as a decimal (e.g. 0.055 = 5.5%)

def get_or_fetch_oas_buckets(session, fred_api_key: str) -> dict:
    # 1. SELECT from fred_oas_spreads WHERE date = TODAY
    # 2. If found → return {aaa_oas, aa_oas, a_oas, bbb_oas, hy_oas}
    # 3. If not found → fetch 5 FRED series, INSERT row, return values

def classify_grade(spread_bps: float, oas_buckets: dict) -> tuple[str, bool]:
    # Returns ("AAA"|"AA"|"A"|"BBB"|"High Yield", is_high_grade: bool)

def is_treasury(cusip: str) -> bool:
    # GET https://www.treasurydirect.gov/TA_WS/securities/search?cusip={cusip}&format=json
    # Returns True if response has at least one result (confirmed US Treasury)

def get_bond_profile(cusip: str, session) -> dict | None:
    # 1. Check bond_profile_cache WHERE cusip = ? AND cached_at > NOW() - 30 days
    # 2. If found → return cached row
    # 3. If not → GET https://finnhub.io/api/v1/bond/profile?cusip={cusip}&token={FINNHUB_KEY}
    # 4. Parse: coupon, maturityDate, paymentFrequency → normalise paymentFrequency string
    # 5. INSERT/UPDATE bond_profile_cache
    # 6. Return parsed dict
```

### Step 3 — Implement `GET /api/snapTrade/get_user_account_positions`
In `backend/routes/snapTrade.py` at line 234:

```python
@router.get("/get_user_account_positions")
def get_user_account_positions(
    snapTrade_id: Annotated[str, Cookie(alias="snapTradeUserID")],
    account_id: str,
):
    snaptrade_usersecret_id = getSnapTradeSecretID(snapTrade_id)
    if not snaptrade_usersecret_id:
        raise HTTPException(status_code=400, detail="SnapTrade secret not found")

    positions_response = snapTrade.account_information.get_user_account_positions(
        user_id=snapTrade_id,
        user_secret=snaptrade_usersecret_id,
        account_id=account_id,
    )
    positions = positions_response.body or []

    bonds = []
    stocks = []
    other = []

    fred_api_key = os.getenv("FRED_API_KEY")
    treasury_curve = get_treasury_curve(fred_api_key)

    with SessionLocal() as session:
        oas_buckets = get_or_fetch_oas_buckets(session, fred_api_key)

        for position in positions:
            symbol_obj = position.get("symbol") or {}
            sec_type = (symbol_obj.get("type") or {}).get("code", "")
            ticker = symbol_obj.get("symbol", "")
            cusip = symbol_obj.get("cusip", "")
            price = float(position.get("price") or 0)
            units = float(position.get("units") or 0)
            market_value = price * units

            if sec_type in ("cs", "ad"):  # common stock, ADR
                stocks.append({"symbol": ticker, "market_value": market_value})

            elif sec_type == "bond":
                entry = {"symbol": ticker, "cusip": cusip, "market_value": market_value}

                # Tier 1: Treasury confirmation
                if cusip and is_treasury(cusip):
                    entry.update({"bond_type": "treasury", "grade": "AAA", "is_high_grade": True,
                                  "ytm": None, "spread_bps": 0})
                else:
                    # Tier 2: YTM + spread inference
                    profile = get_bond_profile(cusip, session) if cusip else None
                    if profile:
                        coupon_annual = annualise_coupon(
                            profile["coupon_rate"] * profile["face_value"],
                            profile["payment_freq"]
                        )
                        maturity_years = (profile["maturity_date"] - date.today()).days / 365.25
                        ytm = calculate_ytm(price, profile["face_value"], coupon_annual, maturity_years)
                        t_yield = interpolate_treasury_yield(maturity_years, treasury_curve)
                        spread_bps = (ytm - t_yield) * 10_000
                        grade, is_hg = classify_grade(spread_bps, oas_buckets)
                        entry.update({"bond_type": profile["bond_type"], "grade": grade,
                                      "is_high_grade": is_hg, "ytm": round(ytm * 100, 4),
                                      "spread_bps": round(spread_bps, 2)})
                    else:
                        entry.update({"bond_type": "unknown", "grade": "Unclassified",
                                      "is_high_grade": False, "ytm": None, "spread_bps": None})
                bonds.append(entry)

            else:
                other.append({"symbol": ticker, "market_value": market_value, "type": sec_type})

    return {"bonds": bonds, "stocks": stocks, "other": other}
```

Also **remove** the orphaned `snapTrade.account_information.get_user_account_positions()` call at line 250 inside `getAccountInformation`.


---

## New Environment Variables

| Variable | Source | Purpose |
|---|---|---|
| `FRED_API_KEY` | Free registration at fred.stlouisfed.org | FRED JSON API for Treasury yields + OAS series |
| `FINNHUB_API_KEY` | Free registration at finnhub.io | Bond profile (coupon, maturity, payment frequency) |

Add both to the `.env` file at the project root and reference via `os.getenv()` in `bond_classifier.py`.

**Note on Finnhub free tier**: The `/bond/profile` endpoint is documented in the free SDK, but data availability for non-Treasury bonds needs to be verified with a live test call after the Finnhub API key is set up. If the free tier returns empty profiles, the user will see "Unclassified" for non-Treasury bonds and may need to upgrade.

---

## Critical File Paths

- `backend/routes/snapTrade.py:234` — empty positions route to implement
- `backend/routes/snapTrade.py:250` — orphaned call to remove (inside `getAccountInformation`)
- `backend/bond_classifier.py` — new file (all math + FRED + TreasuryDirect + Finnhub logic)
- `backend/requirements.txt` — verify `httpx` is present; add if not
- `frontend/src/app/pages/typesOfInvestor/viewingPage/page.tsx` — add fetch + bond table render

---

## Verification

1. Run the two CREATE TABLE statements in psql inside the postgres container
2. Add `FRED_API_KEY` and `FINNHUB_API_KEY` to `.env`
3. Start containers: `docker compose -f docker-compose.dev.yml up --build`
4. Navigate to `viewingPage?accountID=<id>` for an account that holds bonds
5. Confirm the bond table renders with grade, YTM, and spread columns
6. Check the `fred_oas_spreads` table — it should have a row for today after the first request
7. Check the `bond_profile_cache` table — it should have one row per bond CUSIP that was looked up
8. Manually verify one bond's YTM and spread against a third-party calculator (e.g., FINRA BondFacts website) to sanity-check the math
