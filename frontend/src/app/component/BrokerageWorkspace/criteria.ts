// One home for both Graham checklists. These used to be duplicated as a static rail in
// DefensiveScreener.tsx and enterprisingPage/page.tsx; the rail is gone and the same data
// now feeds the per-security dropdown in SecurityRow.

export interface Criterion {
  code: string;
  name: string;
  threshold: string;
  backendKey: string;
}

export interface CriterionResult {
  criterion: Criterion;
  pass: boolean;
}

export type Verdict = "pass" | "fail";

export interface Evaluation {
  verdict: Verdict;
  results: CriterionResult[];
  // When set, the checklist does not apply to this holding and `results` is empty —
  // the row renders this sentence instead of a list of criteria.
  exemptNote?: string;
}

export const DEFENSIVE_CRITERIA: Criterion[] = [
  { code: "1", name: "Adequate size", threshold: "≥ $2B market cap", backendKey: "adequate_size" },
  { code: "2", name: "Strong financial condition", threshold: "Current ratio ≥ 2.0", backendKey: "current_ratio" },
  { code: "3", name: "Earnings stability", threshold: "Positive earnings 10 yrs", backendKey: "no_earnings_deficits" },
  { code: "4", name: "Dividend record", threshold: "Uninterrupted 20 yrs", backendKey: "shareholder_returns" },
  { code: "5", name: "Earnings growth", threshold: "≥ 33% over the decade", backendKey: "earnings_growth_10yr" },
  { code: "6", name: "Moderate P/E", threshold: "≤ 15× last 3yr avg", backendKey: "price_to_fcf" },
  { code: "7", name: "Moderate P/B", threshold: "P/E × P/B ≤ 22.5", backendKey: "valuation_combined" },
];

export const ENTERPRISING_CRITERIA: Criterion[] = [
  { code: "1", name: "Strong financial condition", threshold: "Current ratio ≥ 1.5", backendKey: "current_ratio" },
  { code: "2", name: "Long-term debt", threshold: "≤ 110% of net current assets", backendKey: "long_term_debt" },
  { code: "3", name: "Earnings stability", threshold: "Positive last 5 yrs", backendKey: "no_earnings_deficits" },
  { code: "4", name: "Dividend record", threshold: "Currently paying", backendKey: "shareholder_returns" },
  { code: "5", name: "Earnings growth", threshold: "Up from 5 yrs ago", backendKey: "earnings_growth_5yr" },
  { code: "6", name: "Price to book", threshold: "≤ 1.2× tangible book", backendKey: "price_to_book" },
  { code: "7", name: "Price to earnings", threshold: "Bottom 10% by P/E", backendKey: "price_to_earnings" },
];

// Index funds Graham's stock-picking tests were never meant to score: you cannot ask
// whether VOO has an uninterrupted dividend record or a current ratio.
export const BROAD_MARKET: Set<string> = new Set([
  "SPY", "VOO", "IVV", "VTI", "ITOT", "SCHB", "SPTM", "VT", "VXUS", "VEU",
  "QQQ", "DIA", "IWM", "IWB", "VUG", "VTV",
  "AGG", "BND", "BNDX", "SCHZ", "SPAB", "IUSB", "TLT", "IEF", "SHY", "GOVT",
]);

export function criteriaFor(isDefensive: boolean): Criterion[] {
  return isDefensive ? DEFENSIVE_CRITERIA : ENTERPRISING_CRITERIA;
}

export interface EvaluableRow {
  symbol: string;
  kind: "equity" | "etf" | "bond_etf" | "bond";
}

/**
 * STUB. Every individual holding currently comes back passing.
 *
 * Real Graham evaluation (via GET /api/snapTrade/isLeadingStock, which already returns
 * criteria_details keyed by `backendKey`) replaces this one function — nothing else in the
 * list needs to change when it does.
 *
 * The two exemptions below are not stubs and should survive that change: neither a bond nor
 * a broad-market index fund is a thing the equity checklist can meaningfully score.
 */
export function evaluate(row: EvaluableRow, isDefensive: boolean): Evaluation {
  if (row.kind === "bond" || row.kind === "bond_etf") {
    return {
      verdict: "pass",
      results: [],
      exemptNote: "Fixed income — judged on credit quality, not the equity checklist.",
    };
  }

  if (BROAD_MARKET.has(row.symbol.toUpperCase())) {
    return {
      verdict: "pass",
      results: [],
      exemptNote: "Broad-market fund — exempt from the checklist.",
    };
  }

  return {
    verdict: "pass",
    results: criteriaFor(isDefensive).map((criterion) => ({ criterion, pass: true })),
  };
}
