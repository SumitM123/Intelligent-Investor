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

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session


FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"
TREASURY_DIRECT_BASE = "https://www.treasurydirect.gov/TA_WS/securities/search"
FINNHUB_BASE = "https://finnhub.io/api/v1/bond/profile"

DEFAULT_FACE_VALUE = 1000.0
CACHE_TTL_DAYS = 30
HTTP_TIMEOUT_SECONDS = 10.0

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

def _fetch_fred_series(series_id: str, fred_api_key: str) -> Optional[float]:
    """Fetch the most recent non-null observation value for a FRED series."""
    if not fred_api_key:
        return None
    params = {
        "series_id": series_id,
        "api_key": fred_api_key,
        "sort_order": "desc",
        "limit": 5,  # newest may be "." (no data); scan a few back
        "file_type": "json",
    }
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


def _fetch_finnhub_profile(cusip: str) -> Optional[dict]:
    """Fetch raw bond profile from Finnhub. Returns None on failure or empty."""
    finnhub_key = os.getenv("FINNHUB_API_KEY")
    if not finnhub_key or not cusip:
        return None
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
            response = client.get(
                FINNHUB_BASE,
                params={"cusip": cusip, "token": finnhub_key},
            )
            response.raise_for_status()
            data = response.json()
        # Free tier returns {} or partial data for unknown CUSIPs
        if not data or data.get("couponRate") in (None, "", 0):
            return None
        return data
    except (httpx.HTTPError, ValueError):
        return None


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


def get_treasury_curve(fred_api_key: str) -> dict:
    """Return {tenor_years: yield_decimal} for the 10 DGS series.

    FRED reports values in percent; we divide by 100 so the curve is in decimal
    form (0.0425 = 4.25%) and can be compared directly to a decimal YTM.
    """
    curve = {}
    for series_id, tenor in TREASURY_SERIES.items():
        value = _fetch_fred_series(series_id, fred_api_key)
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


def get_bond_profile(cusip: str, session: Session) -> Optional[dict]:
    """Return bond fundamentals from cache (30-day TTL) or Finnhub, or None."""
    if not cusip:
        return None

    cutoff = datetime.now() - timedelta(days=CACHE_TTL_DAYS)
    cached = session.execute(
        text("""
            SELECT coupon_rate, payment_freq, maturity_date, face_value, bond_type
            FROM bond_profile_cache
            WHERE cusip = :cusip AND cached_at > :cutoff
        """),
        {"cusip": cusip, "cutoff": cutoff},
    ).first()

    if cached:
        return {
            "coupon_rate": float(cached[0]) if cached[0] is not None else 0.0,
            "payment_freq": cached[1] or "semi-annual",
            "maturity_date": cached[2],
            "face_value": float(cached[3]) if cached[3] is not None else DEFAULT_FACE_VALUE,
            "bond_type": cached[4] or "corporate",
        }

    raw = _fetch_finnhub_profile(cusip)
    if not raw:
        return None

    try:
        coupon_rate_pct = float(raw.get("couponRate") or 0)
        coupon_rate = coupon_rate_pct / 100.0  # Finnhub returns percent (e.g. 5.0)
        payment_freq = _normalise_payment_freq(raw.get("paymentFrequency", ""))
        maturity_str = raw.get("maturityDate", "")
        maturity_date = (
            datetime.strptime(maturity_str, "%Y-%m-%d").date() if maturity_str else None
        )
    except (ValueError, TypeError):
        return None

    if not maturity_date or coupon_rate <= 0:
        return None

    face_value = DEFAULT_FACE_VALUE
    bond_type = "corporate"  # Finnhub /bond/profile does not return a category

    try:
        session.execute(
            text("""
                INSERT INTO bond_profile_cache
                    (cusip, coupon_rate, payment_freq, maturity_date, face_value, bond_type, cached_at)
                VALUES (:cusip, :coupon_rate, :payment_freq, :maturity_date, :face_value, :bond_type, NOW())
                ON CONFLICT (cusip) DO UPDATE SET
                    coupon_rate = EXCLUDED.coupon_rate,
                    payment_freq = EXCLUDED.payment_freq,
                    maturity_date = EXCLUDED.maturity_date,
                    face_value = EXCLUDED.face_value,
                    bond_type = EXCLUDED.bond_type,
                    cached_at = NOW()
            """),
            {
                "cusip": cusip,
                "coupon_rate": coupon_rate,
                "payment_freq": payment_freq,
                "maturity_date": maturity_date,
                "face_value": face_value,
                "bond_type": bond_type,
            },
        )
        session.commit()
    except Exception:
        session.rollback()
        # Lookup succeeded; cache write failed. Still return the profile.

    return {
        "coupon_rate": coupon_rate,
        "payment_freq": payment_freq,
        "maturity_date": maturity_date,
        "face_value": face_value,
        "bond_type": bond_type,
    }


def get_or_fetch_oas_buckets(session: Session, fred_api_key: str) -> Optional[dict]:
    """Return today's OAS bucket boundaries in basis points.

    Reads `fred_oas_spreads` for today; if no row exists, fetches all 5 FRED
    series, converts percent → bps (multiply by 100), and inserts.
    """
    today = date.today()
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

    raw_percent = {}
    for key, series_id in OAS_SERIES.items():
        value = _fetch_fred_series(series_id, fred_api_key)
        if value is None:
            return None
        raw_percent[key] = value

    # FRED ICE BofA OAS series are already in basis points (e.g. 83 = 83 bps).
    values_bps = {k: v for k, v in raw_percent.items()}

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

def classify_bond(cusip: str, session: Session, fred_api_key: str) -> dict:
    """Classify a single bond by CUSIP.

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

    if not cusip:
        return unclassified

    # Tier 1: Treasury confirmation
    if is_treasury(cusip):
        return {
            "cusip": cusip,
            "grade": "AAA",
            "is_high_grade": True,
            "ytm": None,
            "spread_bps": 0,
            "bond_type": "treasury",
        }

    # Tier 2: profile + YTM-based grade inference
    profile = get_bond_profile(cusip, session)
    if not profile:
        return unclassified

    face_value = profile["face_value"]
    coupon_rate = profile["coupon_rate"]
    maturity_date = profile["maturity_date"]
    maturity_years = (maturity_date - date.today()).days / 365.25

    if maturity_years <= 0:
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
    price = face_value  # Manual entry has no price feed; default to par.
    ytm = calculate_ytm(price, face_value, coupon_annual, maturity_years)

    curve = get_treasury_curve(fred_api_key)
    treasury_yield = interpolate_treasury_yield(maturity_years, curve)
    spread_bps = (ytm - treasury_yield) * 10_000.0

    oas_buckets = get_or_fetch_oas_buckets(session, fred_api_key)
    if not oas_buckets:
        return {
            "cusip": cusip,
            "grade": "Unclassified",
            "is_high_grade": False,
            "ytm": round(ytm * 100, 4),
            "spread_bps": round(spread_bps, 2),
            "bond_type": profile["bond_type"],
        }

    grade, is_high_grade = classify_grade(spread_bps, oas_buckets)
    return {
        "cusip": cusip,
        "grade": grade,
        "is_high_grade": is_high_grade,
        "ytm": round(ytm * 100, 4),
        "spread_bps": round(spread_bps, 2),
        "bond_type": profile["bond_type"],
    }
