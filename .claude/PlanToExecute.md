 Plan: Implement the 50/50 Rule (Portfolio Stock vs. Bond Proportion)

 Context

 Benjamin Graham's 50/50 rule states a defensive investor should never hold less than 25% or more than 75%
 in either stocks or bonds. The goal is to show the user — based on their selected SnapTrade brokerage
 account — what proportion of their portfolio is in leading common stocks, high-grade bonds (rated
 AAA/AA/A), or other.

 ---
 Bond Credit Rating Strategy (Free)

 No free direct API from S&P/Moody's/Fitch exists. Research found the best practical tiered approach:

 1. US Government / Treasury bonds → hard-code as AAA (sovereign guarantee)
 2. Agency bonds (Fannie Mae, Freddie Mac, etc.) → hard-code as AAA
 3. Municipal bonds → hard-code as A (generally high-grade; treat as qualifying)
 4. Corporate bonds → query the FINRA Bond Center public search API (finra-markets.morningstar.com) using
 the bond's CUSIP. Parse returned rating string. Cache result.
 5. Fallback → if no rating found → classify as "Unrated" (not high-grade)

 All bond rating lookups are cached in a new bond_ratings_cache DB table (CUSIP → rating) with a TTL
 (refresh after 30 days).

 ---
 Files to Create or Modify

 ┌────────────────────────────────────────────────────────────────┬─────────────────────────────────────┐
 │                              File                              │               Action                │
 ├────────────────────────────────────────────────────────────────┼─────────────────────────────────────┤
 │                                                                │ Implement the empty GET /api/snapTr │
 │ backend/routes/snapTrade.py                                    │ ade/get_user_account_positions      │
 │                                                                │ route                               │
 ├────────────────────────────────────────────────────────────────┼─────────────────────────────────────┤
 │ backend/bond_rating_service.py                                 │ New file: FINRA lookup + tiered     │
 │                                                                │ classification logic                │
 ├────────────────────────────────────────────────────────────────┼─────────────────────────────────────┤
 │ backend/migrations/create_bond_ratings_cache.sql               │ New SQL: create bond_ratings_cache  │
 │                                                                │ table                               │
 ├────────────────────────────────────────────────────────────────┼─────────────────────────────────────┤
 │                                                                │ Replace raw JSON dump with          │
 │ frontend/src/app/pages/typesOfInvestor/viewingPage/page.tsx    │ positions fetch + pass data to      │
 │                                                                │ client component                    │
 ├────────────────────────────────────────────────────────────────┼─────────────────────────────────────┤
 │ frontend/src/app/pages/typesOfInvestor/viewingPage/PortfolioBr │ New client component: pie chart +   │
 │ eakdown.tsx                                                    │ 50/50 compliance display            │
 ├────────────────────────────────────────────────────────────────┼─────────────────────────────────────┤
 │ frontend/package.json                                          │ Add recharts dependency             │
 └────────────────────────────────────────────────────────────────┴─────────────────────────────────────┘

 ---
 Step-by-Step Implementation

 Step 1 — DB migration: bond_ratings_cache table

 Create backend/migrations/create_bond_ratings_cache.sql:
 CREATE TABLE IF NOT EXISTS bond_ratings_cache (
     cusip        TEXT PRIMARY KEY,
     rating       TEXT,           -- e.g. "AAA", "A+", "BBB", "NR"
     is_high_grade BOOLEAN NOT NULL,
     cached_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 The migration must be run inside the PostgreSQL container at startup (add to init scripts or run manually).

 ---
 Step 2 — backend/bond_rating_service.py (new file)

 Functions:
 - classify_security_type(position: dict) -> str — returns "stock", "bond", or "other" based on
 position["symbol"]["type"]["code"] from SnapTrade (codes: "cs" = common stock, "bond" = bond, "et" = ETF
 treated as other, etc.)
 - is_us_government_bond(position: dict) -> bool — checks description/name for "Treasury", "GNMA", "FNMA",
 "FHLMC", or type code "bond" with government issuer flag
 - lookup_bond_rating_finra(cusip: str) -> str | None — HTTP GET to FINRA Bond Center API, returns rating
 string or None
 - get_bond_rating(position: dict, session) -> tuple[str, bool] — returns (rating, is_high_grade):
   a. Check bond_ratings_cache table first (skip if older than 30 days)
   b. Tiered logic: gov/agency → AAA, muni → A, corporate → FINRA lookup
   c. Write result to cache
   d. Determine is_high_grade: rating starts with "AAA", "AA", or "A" (but NOT "B")
 - High-grade check: rating[0] == 'A' (covers AAA, AA+, AA, AA-, A+, A, A-) but NOT "B", "C", "D"

 ---
 Step 3 — Implement GET /api/snapTrade/get_user_account_positions

 In backend/routes/snapTrade.py (currently empty function with just a decorator at line 234):

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

     stocks = []
     high_grade_bonds = []
     other = []

     with SessionLocal() as session:
         for position in positions:
             sec_type = classify_security_type(position)
             symbol = (position.get("symbol") or {}).get("symbol", "")
             market_value = float(position.get("price", 0)) * float(position.get("units", 0))

             if sec_type == "stock":
                 stocks.append({"symbol": symbol, "market_value": market_value})
             elif sec_type == "bond":
                 cusip = (position.get("symbol") or {}).get("id", symbol)
                 rating, is_hg = get_bond_rating(position, session)
                 entry = {"symbol": symbol, "market_value": market_value, "rating": rating}
                 if is_hg:
                     high_grade_bonds.append(entry)
                 else:
                     other.append(entry)
             else:
                 other.append({"symbol": symbol, "market_value": market_value})

     total = sum(p["market_value"] for p in stocks + high_grade_bonds + other) or 1
     return {
         "stocks": stocks,
         "high_grade_bonds": high_grade_bonds,
         "other": other,
         "percentages": {
             "stocks": round(sum(p["market_value"] for p in stocks) / total * 100, 2),
             "high_grade_bonds": round(sum(p["market_value"] for p in high_grade_bonds) / total * 100, 2),
             "other": round(sum(p["market_value"] for p in other) / total * 100, 2),
         },
         "is_compliant": (
             25 <= sum(p["market_value"] for p in high_grade_bonds) / total * 100 <= 75
             and 25 <= sum(p["market_value"] for p in stocks) / total * 100 <= 75
         ),
     }

 Also fix the existing getAccountInformation endpoint at line 250 — the orphaned
 snapTrade.account_information.get_user_account_positions() call must be removed.

 ---
 Step 4 — Frontend: update viewingPage/page.tsx

 - Add a second fetch call to GET /api/snapTrade/get_user_account_positions?account_id={accountID} alongside
  the existing account info fetch
 - Pass the positions result as a prop to the new <PortfolioBreakdown> client component
 - Keep the existing account info display or replace with the breakdown

 ---
 Step 5 — New PortfolioBreakdown.tsx client component

 frontend/src/app/pages/typesOfInvestor/viewingPage/PortfolioBreakdown.tsx

 - "use client" component
 - Props: { percentages: { stocks, high_grade_bonds, other }, is_compliant, stocks[], high_grade_bonds[],
 other[] }
 - Uses recharts PieChart + Pie + Cell + Tooltip + Legend
   - 3 slices: Stocks (blue), High-Grade Bonds (green), Other (gray)
 - Shows a compliance banner:
   - Green ✓ if is_compliant: "Your portfolio is within Graham's 25–75% range"
   - Red ✗ if not: "Rebalance needed — [stocks/bonds] is outside the 25–75% range"
 - Shows a table listing each holding with its classification and rating

 ---
 Step 6 — Add recharts

 Add to frontend/package.json dependencies: "recharts": "^2.15.0" and run npm install inside the frontend
 container.

 ---
 Critical File Paths

 - backend/routes/snapTrade.py:234 — empty positions route to implement
 - backend/routes/snapTrade.py:250 — orphaned positions call to remove
 - backend/bond_rating_service.py — new file (create)
 - backend/migrations/create_bond_ratings_cache.sql — new SQL (create)
 - frontend/src/app/pages/typesOfInvestor/viewingPage/page.tsx — update fetch + add component
 - frontend/src/app/pages/typesOfInvestor/viewingPage/PortfolioBreakdown.tsx — new file (create)
 - frontend/package.json — add recharts

 ---
 Verification

 1. Start containers: docker compose -f docker-compose.dev.yml up --build
 2. Run migration SQL inside the postgres container to create bond_ratings_cache
 3. Navigate to http://localhost:3000/pages/typesOfInvestor/accountsChoosing, select an account, and proceed
  to viewingPage
 4. Confirm the pie chart renders with 3 slices
 5. Confirm bonds in the account are classified and rated (check backend logs for FINRA API calls)
 6. Verify bond_ratings_cache table is populated after the first fetch
 7. Verify compliance indicator is correct based on percentages shown