"""
Bond credit-grade classifier.

Implements the TreasuryDirect + FRED + Finnhub pipeline described in
`Bond Ratings.md`. Public entry point: `classify_bond(cusip, session, fred_api_key)`.

Yields/rates are handled as DECIMALS internally (0.05 = 5%). Spreads are
returned in BASIS POINTS. FRED series come back in percent, so they are
converted at the boundary.
"""

import os
from datetime import date, datetime, timedelta
from typing import Optional

# Commented out: only used by the disabled FINRA price code below.
# import base64
# import time

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session


FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"
TREASURY_DIRECT_BASE = "https://www.treasurydirect.gov/TA_WS/securities/search"
FINNHUB_BASE = "https://finnhub.io/api/v1/bond/profile"

# DISABLED: FINRA price integration. The official free FINRA Query API only exposes
# aggregate fixed-income datasets (market breadth/volume) — there is no per-CUSIP
# trade-price dataset. Verified live: the `fixedIncomeMarket/trace` dataset 404s and
# only aggregate datasets (e.g. treasuryWeeklyAggregates) exist, none with a CUSIP or
# price field. Kept here (commented) in case a working price source is found later.
# FINRA_TOKEN_URL = "https://ews.fip.finra.org/fip/rest/ews/oauth2/access_token"
# FINRA_DATA_BASE = "https://api.finra.org/data"
# FINRA_TRACE_GROUP = "fixedIncomeMarket"
# FINRA_TRACE_DATASET = "trace"
# FINRA_CUSIP_FIELD = "cusip"
# FINRA_PRICE_FIELD = "lastSalePrice"        # all-in price, per 100 of par
# FINRA_TRADE_DATE_FIELD = "tradeReportDate"

DEFAULT_FACE_VALUE = 1000.0
CACHE_TTL_DAYS = 365
HTTP_TIMEOUT_SECONDS = 10.0

# In-memory FINRA OAuth token cache (disabled with the FINRA price code above).
# _finra_token_cache = {"token": None, "expires_at": 0.0}

# FRED Treasury yield series → tenor in years
TREASURY_SERIES = {
    "DGS1MO": 1.0 / 12.0,
    "DGS3MO": 0.25,
    "DGS6MO": 0.5,
    "DGS1": 1.0,
    "DGS2": 2.0,
    "DGS5": 5.0,
    "DGS7": 7.0,
    "DGS10": 10.0,
    "DGS20": 20.0,
    "DGS30": 30.0,
}

# FRED OAS bucket-boundary series
OAS_SERIES = {
    "aaa_oas": "BAMLC0A1CAAA",
    "aa_oas": "BAMLC0A2CAA",
    "a_oas": "BAMLC0A3CA",
    "bbb_oas": "BAMLC0A4CBBB",
    "hy_oas": "BAMLH0A0HYM2",
}

PAYMENTS_PER_YEAR = {
    "monthly": 12,
    "quarterly": 4,
    "semi-annual": 2,
    "semiannual": 2,
    "annual": 1,
}


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _fetch_fred_series(
    series_id: str, fred_api_key: str, observation_end: Optional[str] = None
) -> Optional[float]:
    """Fetch the most recent non-null observation value for a FRED series.

    When `observation_end` (ISO "YYYY-MM-DD") is given, FRED only returns
    observations up to that date, so the newest hit is the latest value on/before
    it — i.e. the series value as it stood on that historical date.
    """
    if not fred_api_key:
        return None
    params = {
        "series_id": series_id,
        "api_key": fred_api_key,
        "sort_order": "desc",
        "limit": 5,  # newest may be "." (no data); scan a few back
        "file_type": "json",
    }
    if observation_end:
        params["observation_end"] = observation_end
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
            response = client.get(FRED_BASE, params=params)
            response.raise_for_status()
            data = response.json()
        for obs in data.get("observations", []):
            value = obs.get("value")
            if value and value != ".":
                return float(value)
    except (httpx.HTTPError, ValueError, KeyError):
        return None
    return None


# NEED TO HAVE PREMIUM API KEY INSEAD OF FREE TIER.
# Disabled: this coupon-rate + maturity lookup calls Finnhub /bond/profile, which is a
# premium endpoint — it returns HTTP 403 "You don't have access to this resource" on the
# free tier, so the lookup can never succeed without a paid key.
# def _fetch_finnhub_profile(cusip: str) -> Optional[dict]:
#     """Fetch raw bond profile from Finnhub. Returns None on failure or empty."""
#     finnhub_key = os.getenv("FINNHUB_API_KEY")
#     if not finnhub_key or not cusip:
#         return None
#     try:
#         with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
#             response = client.get(
#                 FINNHUB_BASE,
#                 params={"cusip": cusip, "token": finnhub_key},
#             )
#             response.raise_for_status()
#             data = response.json()
#         # Free tier returns {} or partial data for unknown CUSIPs
#         if not data or data.get("couponRate") in (None, "", 0):
#             return None
#         return data
#     except (httpx.HTTPError, ValueError):
#         return None


def _normalise_payment_freq(freq: str) -> str:
    """Map any Finnhub-style frequency string to the canonical lowercase form."""
    if not freq:
        return "semi-annual"
    f = freq.lower().strip()
    if "month" in f:
        return "monthly"
    if "quarter" in f:
        return "quarterly"
    if "semi" in f or f == "semiannual":
        return "semi-annual"
    if "annual" in f or "year" in f:
        return "annual"
    return "semi-annual"


# DISABLED: FINRA price helpers (no free per-CUSIP price source exists — see note
# at the top). Kept commented in case a working price source is found later.
#
# def _get_finra_token() -> Optional[str]:
#     """Return a cached or freshly-minted FINRA OAuth2 bearer token, or None.
#
#     Uses client-credentials grant with HTTP Basic auth. The token is cached in
#     memory until ~60s before its stated expiry to avoid a round-trip per call.
#     """
#     client_id = os.getenv("FINRA_CLIENT_ID")
#     client_secret = os.getenv("FINRA_CLIENT_SECRET")
#     if not client_id or not client_secret:
#         return None
#
#     now = time.time()
#     cached = _finra_token_cache.get("token")
#     if cached and _finra_token_cache.get("expires_at", 0.0) > now + 60:
#         return cached
#
#     try:
#         basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
#         with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
#             response = client.post(
#                 FINRA_TOKEN_URL,
#                 params={"grant_type": "client_credentials"},
#                 headers={"Authorization": f"Basic {basic}"},
#             )
#             response.raise_for_status()
#             data = response.json()
#         token = data.get("access_token")
#         if not token:
#             return None
#         expires_in = float(data.get("expires_in", 1800))
#         _finra_token_cache["token"] = token
#         _finra_token_cache["expires_at"] = now + expires_in
#         return token
#     except (httpx.HTTPError, ValueError, KeyError, TypeError):
#         return None
#
#
# def _extract_finra_records(payload) -> list:
#     """Pull the record list out of a FINRA response (envelope shape varies)."""
#     if isinstance(payload, list):
#         return payload
#     if isinstance(payload, dict):
#         for key in ("records", "data", "results"):
#             value = payload.get(key)
#             if isinstance(value, list):
#                 return value
#     return []


# ---------------------------------------------------------------------------
# Public helpers (used by classify_bond; exported for unit testing)
# ---------------------------------------------------------------------------

def is_treasury(cusip: str) -> bool:
    """Return True iff TreasuryDirect confirms this CUSIP as a US Treasury."""
    if not cusip:
        return False
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
            response = client.get(
                TREASURY_DIRECT_BASE,
                params={"cusip": cusip, "format": "json"},
            )
            response.raise_for_status()
            data = response.json()
        return isinstance(data, list) and len(data) > 0
    except (httpx.HTTPError, ValueError):
        return False


def get_treasury_curve(fred_api_key: str, as_of_date: Optional[str] = None) -> dict:
    """Return {tenor_years: yield_decimal} for the 10 DGS series.

    FRED reports values in percent; we divide by 100 so the curve is in decimal
    form (0.0425 = 4.25%) and can be compared directly to a decimal YTM.

    `as_of_date` (ISO "YYYY-MM-DD") pins the curve to a historical date so the
    spread reflects the Treasury yields as of purchase; when omitted the curve
    is today's.
    """
    curve = {}
    for series_id, tenor in TREASURY_SERIES.items():
        value = _fetch_fred_series(series_id, fred_api_key, observation_end=as_of_date)
        if value is not None:
            curve[tenor] = value / 100.0
    return curve


def interpolate_treasury_yield(maturity_years: float, curve: dict) -> float:
    """Linear interpolation between bracketing tenors; clamps at endpoints."""
    if not curve:
        return 0.0
    tenors = sorted(curve.keys())
    if maturity_years <= tenors[0]:
        return curve[tenors[0]]
    if maturity_years >= tenors[-1]:
        return curve[tenors[-1]]
    for i in range(len(tenors) - 1):
        t_low, t_high = tenors[i], tenors[i + 1]
        if t_low <= maturity_years <= t_high:
            y_low, y_high = curve[t_low], curve[t_high]
            ratio = (maturity_years - t_low) / (t_high - t_low)
            return y_low + ratio * (y_high - y_low)
    return curve[tenors[-1]]


def annualise_coupon(periodic_payment: float, payment_freq: str) -> float:
    """Multiply a single periodic coupon payment by the payments-per-year."""
    multiplier = PAYMENTS_PER_YEAR.get((payment_freq or "").lower(), 2)
    return periodic_payment * multiplier


def calculate_ytm(price: float, principal: float, coupon_annual: float, maturity_years: float) -> float:
    """YTM approximation formula. Returns YTM as a decimal (0.055 = 5.5%)."""
    if maturity_years <= 0 or (principal + price) == 0:
        return 0.0
    numerator = coupon_annual + (principal - price) / maturity_years
    denominator = (principal + price) / 2.0
    return numerator / denominator


# DISABLED: FINRA per-CUSIP price lookup. No free source returns corporate-bond
# prices by CUSIP (the FINRA Query API is aggregate-only). Kept commented so it can
# be restored if a working price source becomes available. While disabled,
# classify_bond falls back to price = par (so YTM ≈ coupon rate).
#
# def get_bond_price(cusip: str, face_value: float = DEFAULT_FACE_VALUE) -> Optional[float]:
#     """Return the latest FINRA TRACE price for a CUSIP, in dollars.
#
#     FINRA quotes corporate-bond prices per 100 of par, so we scale by face_value
#     (price_per_100 / 100 × face_value) to match the dollar units `calculate_ytm`
#     expects for `price`/`principal`. Returns None if FINRA is unconfigured, has no
#     recent trade for the CUSIP, or errors — callers should fall back to par.
#     """
#     if not cusip:
#         return None
#     token = _get_finra_token()
#     if not token:
#         return None
#
#     body = {
#         "compareFilters": [
#             {"fieldName": FINRA_CUSIP_FIELD, "fieldValue": cusip, "compareType": "EQUAL"}
#         ],
#         "sortFields": [f"-{FINRA_TRADE_DATE_FIELD}"],  # newest trade first
#         "limit": 1,
#     }
#     try:
#         with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
#             response = client.post(
#                 f"{FINRA_DATA_BASE}/group/{FINRA_TRACE_GROUP}/name/{FINRA_TRACE_DATASET}",
#                 headers={
#                     "Authorization": f"Bearer {token}",
#                     "Content-Type": "application/json",
#                 },
#                 json=body,
#             )
#             response.raise_for_status()
#             data = response.json()
#     except (httpx.HTTPError, ValueError):
#         return None
#
#     records = _extract_finra_records(data)
#     if not records:
#         return None
#     price_per_100 = records[0].get(FINRA_PRICE_FIELD)
#     if price_per_100 in (None, ""):
#         return None
#     try:
#         return float(price_per_100) / 100.0 * face_value
#     except (ValueError, TypeError):
#         return None


def get_bond_profile(cusip: str, session: Session) -> Optional[dict]:
    """Return bond fundamentals from cache (30-day TTL) or Finnhub, or None."""
    if not cusip:
        return None

    cutoff = datetime.now() - timedelta(days=CACHE_TTL_DAYS)
    cached = session.execute(
        text("""
            SELECT coupon_rate, maturity_date, face_value, bond_type
            FROM bond_profile_cache
            WHERE cusip = :cusip AND cached_at > :cutoff
        """),
        {"cusip": cusip, "cutoff": cutoff},
    ).first()

    if cached:
        return {
            "coupon_rate": float(cached[0]) if cached[0] is not None else 0.0,
            "maturity_date": cached[1],
            "face_value": float(cached[2]) if cached[2] is not None else DEFAULT_FACE_VALUE,
            "bond_type": cached[3] or "corporate",
        }

    # No fresh row. If a stale row for this CUSIP exists (past the 30-day TTL),
    # delete it so the table doesn't retain an expired profile when the Finnhub
    # re-fetch below fails (in which case ON CONFLICT never overwrites it).
    try:
        session.execute(
            text("""
                DELETE FROM bond_profile_cache
                WHERE cusip = :cusip AND cached_at <= :cutoff
            """),
            {"cusip": cusip, "cutoff": cutoff},
        )
        session.commit()
    except Exception:
        session.rollback()

    # NEED TO HAVE PREMIUM API KEY INSEAD OF FREE TIER.
    # The coupon-rate + maturity lookup below calls Finnhub /bond/profile, which is a
    # premium endpoint (HTTP 403 on the free tier). Without a paid key it never returns
    # data, so the lookup is disabled and we report no profile (-> Unclassified) here.
    return None

    # raw = _fetch_finnhub_profile(cusip)
    # if not raw:
    #     return None
    #
    # try:
    #     coupon_rate_pct = float(raw.get("couponRate") or 0)
    #     coupon_rate = coupon_rate_pct / 100.0  # Finnhub returns percent (e.g. 5.0)
    #     maturity_str = raw.get("maturityDate", "")
    #     maturity_date = (
    #         datetime.strptime(maturity_str, "%Y-%m-%d").date() if maturity_str else None
    #     )
    # except (ValueError, TypeError):
    #     return None
    #
    # if not maturity_date or coupon_rate <= 0:
    #     return None
    #
    # face_value = DEFAULT_FACE_VALUE
    # bond_type = "corporate"  # Finnhub /bond/profile does not return a category
    #
    # try:
    #     session.execute(
    #         text("""
    #             INSERT INTO bond_profile_cache
    #                 (cusip, coupon_rate, maturity_date, face_value, bond_type, cached_at)
    #             VALUES (:cusip, :coupon_rate, :maturity_date, :face_value, :bond_type, NOW())
    #             ON CONFLICT (cusip) DO UPDATE SET
    #                 coupon_rate = EXCLUDED.coupon_rate,
    #                 maturity_date = EXCLUDED.maturity_date,
    #                 face_value = EXCLUDED.face_value,
    #                 bond_type = EXCLUDED.bond_type,
    #                 cached_at = NOW()
    #         """),
    #         {
    #             "cusip": cusip,
    #             "coupon_rate": coupon_rate,
    #             "maturity_date": maturity_date,
    #             "face_value": face_value,
    #             "bond_type": bond_type,
    #         },
    #     )
    #     session.commit()
    # except Exception:
    #     session.rollback()
    #     # Lookup succeeded; cache write failed. Still return the profile.
    #
    # return {
    #     "coupon_rate": coupon_rate,
    #     "maturity_date": maturity_date,
    #     "face_value": face_value,
    #     "bond_type": bond_type,
    # }


def get_or_fetch_oas_buckets(
    session: Session, fred_api_key: str, purchase_date_str: Optional[str] = None
) -> Optional[dict]:
    """Return the OAS bucket boundaries in basis points, as of the purchase date.

    `purchase_date_str` (ISO "YYYY-MM-DD") pins the rating thresholds to the date
    the bond was bought, so they line up with the purchase-date Treasury curve.

    The `fred_oas_spreads` cache only ever holds today's row:
      - When the purchase date is today (or omitted), this reads the cache and,
        on a miss, fetches the latest FRED values, caches them, and returns.
      - When the purchase date is historical, the buckets are fetched from FRED
        pinned to that date (observation_end) and returned WITHOUT caching, so
        the cache stays limited to today's values only.
    """
    today = date.today()
    as_of = purchase_date_str or today.isoformat()

    if as_of == today.isoformat():
        # Today's buckets — served from (and written back to) the cache.
        row = session.execute(
            text("""
                SELECT aaa_oas, aa_oas, a_oas, bbb_oas, hy_oas
                FROM fred_oas_spreads WHERE date = :d
            """),
            {"d": today},
        ).first()

        if row:
            return {
                "aaa_oas": float(row[0]),
                "aa_oas": float(row[1]),
                "a_oas": float(row[2]),
                "bbb_oas": float(row[3]),
                "hy_oas": float(row[4]),
            }
        observation_end = None  # cache miss: fetch the latest values
    else:
        # Historical purchase date — fetch as-of that date; do NOT cache.
        observation_end = as_of

    raw_percent = {}
    for key, series_id in OAS_SERIES.items():
        value = _fetch_fred_series(series_id, fred_api_key, observation_end=observation_end)
        if value is None:
            return None
        raw_percent[key] = value

    # FRED OAS values are in percentage points (e.g. 0.32 = 0.32% = 32 bps).
    values_bps = {k: v * 100.0 for k, v in raw_percent.items()}

    # Only today's buckets are cached; historical purchase-date fetches are not,
    # so the cache never holds anything but today's row.
    if observation_end is None:
        try:
            session.execute(
                text("""
                    INSERT INTO fred_oas_spreads
                        (date, aaa_oas, aa_oas, a_oas, bbb_oas, hy_oas, fetched_at)
                    VALUES (:d, :aaa, :aa, :a, :bbb, :hy, NOW())
                    ON CONFLICT (date) DO UPDATE SET
                        aaa_oas = EXCLUDED.aaa_oas,
                        aa_oas = EXCLUDED.aa_oas,
                        a_oas = EXCLUDED.a_oas,
                        bbb_oas = EXCLUDED.bbb_oas,
                        hy_oas = EXCLUDED.hy_oas,
                        fetched_at = NOW()
                """),
                {
                    "d": today,
                    "aaa": values_bps["aaa_oas"],
                    "aa": values_bps["aa_oas"],
                    "a": values_bps["a_oas"],
                    "bbb": values_bps["bbb_oas"],
                    "hy": values_bps["hy_oas"],
                },
            )
            session.commit()
        except Exception:
            session.rollback()
            # Even if persistence fails, return what we just fetched.

    return values_bps


def classify_grade(spread_bps: float, oas_buckets: dict) -> tuple:
    """Ladder comparison: (grade_string, is_high_grade)."""
    if spread_bps <= oas_buckets["aaa_oas"]:
        return ("AAA", True)
    if spread_bps <= oas_buckets["aa_oas"]:
        return ("AA", True)
    if spread_bps <= oas_buckets["a_oas"]:
        return ("A", True)
    if spread_bps <= oas_buckets["bbb_oas"]:
        return ("BBB", False)
    return ("High Yield / Junk", False)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def classify_bond(
    cusip: str,
    session: Session,
    fred_api_key: str,
    price_per_100: Optional[float] = None,
    coupon_rate_pct: Optional[float] = None,
    maturity_date_str: Optional[str] = None,
    purchase_date_str: Optional[str] = None,
) -> dict:
    """Classify a single bond by CUSIP.

    `price_per_100` is the user-supplied market price quoted per 100 of par
    (e.g. 98.5 = $985 on a $1,000 bond). When provided it drives the YTM; when
    omitted, price falls back to par and YTM collapses to the coupon rate.

    `coupon_rate_pct` (annual coupon as a percent, e.g. 5.25) and
    `maturity_date_str` (ISO "YYYY-MM-DD") are the user-supplied bond terms. When
    both are given they build the profile directly — the free manual-entry path,
    used because the Finnhub coupon/maturity lookup is premium-gated (disabled).

    Returns a dict with keys: cusip, grade, is_high_grade, ytm, spread_bps,
    bond_type. Grade is one of "AAA" | "AA" | "A" | "BBB" | "High Yield / Junk"
    | "Unclassified" | "Matured".

    Treasuries short-circuit with grade="AAA". Bonds with no Finnhub profile
    return grade="Unclassified" with null metrics.
    """
    unclassified = {
        "cusip": cusip,
        "grade": "Unclassified",
        "is_high_grade": False,
        "ytm": None,
        "spread_bps": None,
        "bond_type": "unknown",
    }

    print(f"[BOND] classify_bond start cusip={cusip} price_per_100={price_per_100}", flush=True)

    if not cusip:
        print("[BOND] empty cusip -> Unclassified", flush=True)
        return unclassified

    # Tier 1: Treasury confirmation
    if is_treasury(cusip):
        print(f"[BOND] {cusip}: is_treasury=True -> grade=AAA (treasury short-circuit; no YTM)", flush=True)
        return {
            "cusip": cusip,
            "grade": "AAA",
            "is_high_grade": True,
            "ytm": None,
            "spread_bps": 0,
            "bond_type": "treasury",
        }

    # Tier 2: build the bond profile. Prefer the user-supplied coupon + maturity (the
    # free manual-entry path). Only fall back to get_bond_profile (the Finnhub lookup,
    # currently premium-gated / disabled) when the user didn't provide them.
    if coupon_rate_pct is not None and maturity_date_str:
        try:
            coupon_rate = float(coupon_rate_pct) / 100.0  # percent -> decimal
            maturity_date = datetime.strptime(maturity_date_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            print(f"[BOND] {cusip}: bad coupon/maturity input -> Unclassified", flush=True)
            return unclassified
        if coupon_rate <= 0:
            print(f"[BOND] {cusip}: coupon<=0 -> Unclassified", flush=True)
            return unclassified
        profile = {
            "coupon_rate": coupon_rate,
            "maturity_date": maturity_date,
            "face_value": DEFAULT_FACE_VALUE,
            "bond_type": "corporate",
        }
        print(
            f"[BOND] {cusip}: using user-entered coupon_rate={coupon_rate} maturity={maturity_date}",
            flush=True,
        )
    else:
        profile = get_bond_profile(cusip, session)
        if not profile:
            print(
                f"[BOND] {cusip}: no coupon/maturity input and no Finnhub profile -> "
                f"Unclassified (FINNHUB_API_KEY set? {bool(os.getenv('FINNHUB_API_KEY'))})",
                flush=True,
            )
            return unclassified
        print(
            f"[BOND] {cusip}: profile coupon_rate={profile['coupon_rate']} "
            f"maturity={profile['maturity_date']} face={profile['face_value']} "
            f"type={profile['bond_type']}",
            flush=True,
        )

    face_value = profile["face_value"]
    coupon_rate = profile["coupon_rate"]
    maturity_date = profile["maturity_date"]
    maturity_years = (maturity_date - date.today()).days / 365.25
    print(f"[BOND] {cusip}: maturity_years={maturity_years:.3f}", flush=True)

    if maturity_years <= 0:
        print(f"[BOND] {cusip}: matured (years<=0) -> grade=Matured", flush=True)
        return {
            "cusip": cusip,
            "grade": "Matured",
            "is_high_grade": False,
            "ytm": None,
            "spread_bps": None,
            "bond_type": profile["bond_type"],
        }

    # Annual coupon = coupon_rate (decimal) × face. Frequency does not change the
    # annual total, only the periodic-payment size, so no annualise_coupon call is
    # needed here. The helper is kept for direct unit testing.
    coupon_annual = coupon_rate * face_value
    # Use the user-supplied market price (quoted per 100 of par) when given, so YTM
    # reflects the real discount/premium. No free per-CUSIP price source exists (see
    # disabled FINRA code above), so without a user price we fall back to par, which
    # collapses YTM to the coupon rate.
    if price_per_100 is not None and price_per_100 > 0:
        price = (price_per_100 / 100.0) * face_value
    else:
        price = face_value
    ytm = calculate_ytm(price, face_value, coupon_annual, maturity_years)
    print(
        f"[BOND] {cusip}: price={price} coupon_annual={coupon_annual} "
        f"ytm={ytm:.6f} ({ytm * 100:.4f}%)",
        flush=True,
    )

    # Pin the Treasury curve to the purchase date so the spread reflects the
    # yields as of when the bond was bought, not today's. Falls back to today's
    # curve when no purchase date was supplied.
    curve = get_treasury_curve(fred_api_key, as_of_date=purchase_date_str)
    treasury_yield = interpolate_treasury_yield(maturity_years, curve)
    spread_bps = (ytm - treasury_yield) * 10_000.0
    print(
        f"[BOND] {cusip}: as_of={purchase_date_str or 'today'} "
        f"treasury_yield={treasury_yield:.6f} "
        f"spread_bps={spread_bps:.2f} (curve_points={len(curve)})",
        flush=True,
    )

    oas_buckets = get_or_fetch_oas_buckets(session, fred_api_key, purchase_date_str=purchase_date_str)
    if not oas_buckets:
        print(f"[BOND] {cusip}: OAS buckets unavailable -> Unclassified (ytm/spread kept)", flush=True)
        return {
            "cusip": cusip,
            "grade": "Unclassified",
            "is_high_grade": False,
            "ytm": round(ytm * 100, 4),
            "spread_bps": round(spread_bps, 2),
            "bond_type": profile["bond_type"],
        }

    grade, is_high_grade = classify_grade(spread_bps, oas_buckets)
    print(
        f"[BOND] {cusip}: oas_buckets={oas_buckets} -> grade={grade} is_high_grade={is_high_grade}",
        flush=True,
    )
    return {
        "cusip": cusip,
        "grade": grade,
        "is_high_grade": is_high_grade,
        "ytm": round(ytm * 100, 4),
        "spread_bps": round(spread_bps, 2),
        "bond_type": profile["bond_type"],
    }
