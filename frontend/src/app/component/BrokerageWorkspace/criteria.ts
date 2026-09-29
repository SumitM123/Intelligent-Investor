// Definitions for the 7-criterion "leading common stock" screen, shared by the "Screen a
// stock" search bar (InvestorWorkspace) and the per-held-security checklist (SecurityRow,
// via useLeadingStockScreen). A held equity's checklist is the same live backend screen as
// any manually-searched ticker -- not a separate portfolio-fit rubric.

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

// Index funds Graham's stock-picking tests were never meant to score: you cannot ask
// whether VOO has an uninterrupted dividend record or a current ratio.
export const BROAD_MARKET: Set<string> = new Set([
  "SPY", "VOO", "IVV", "VTI", "ITOT", "SCHB", "SPTM", "VT", "VXUS", "VEU",
  "QQQ", "DIA", "IWM", "IWB", "VUG", "VTV",
  "AGG", "BND", "BNDX", "SCHZ", "SPAB", "IUSB", "TLT", "IEF", "SHY", "GOVT",
]);

// The 7-criterion "leading common stock" screen (GET /api/snapTrade/isLeadingStock).
// Used both by the "Screen a stock" search bar (any ticker, held or not) and by
// useLeadingStockScreen (a held equity, on demand). Order and definitions match
// .claude/skills/leading-stock-criteria/SKILLS.md.
export const LEADING_STOCK_CRITERIA: Criterion[] = [
  { code: "1", name: "Adequate size", threshold: "Revenue (TTM) ≥ $1B and market cap ≥ $8B", backendKey: "adequate_size" },
  { code: "2", name: "Strong financial condition", threshold: "Current ratio ≥ 1.75", backendKey: "current_ratio" },
  { code: "4", name: "No earnings deficits", threshold: "Zero years of negative net income (10yr history)", backendKey: "no_earnings_deficits" },
  { code: "5", name: "Shareholder returns", threshold: "Uninterrupted dividends 10yrs, or buybacks in ≥ 7 of last 10yrs", backendKey: "shareholder_returns" },
  { code: "6", name: "Price to free cash flow", threshold: "P/FCF ≤ 25", backendKey: "price_to_fcf" },
  { code: "7", name: "Combined valuation", threshold: "P/FCF × P/Sales ≤ 50", backendKey: "valuation_combined" },
  { code: "8", name: "Earnings growth", threshold: "EPS growth ≥ 33% over 10yrs, CPI-adjusted", backendKey: "earnings_growth_10yr" },
];

export interface EvaluableRow {
  symbol: string;
  kind: "equity" | "etf" | "bond_etf" | "bond";
}

/**
 * Rows the 7-criterion leading-stock screen cannot meaningfully score: it evaluates a
 * single company's fundamentals (revenue, current ratio, EPS growth, ...), which no fund
 * or bond has in the same sense. Returns null for a plain equity, which is the only kind
 * useLeadingStockScreen actually calls the backend for.
 */
export function exemptionNote(row: EvaluableRow): string | null {
  if (row.kind === "bond" || row.kind === "bond_etf") {
    return "Fixed income — judged on credit quality, not the equity checklist.";
  }
  if (row.kind === "etf") {
    return BROAD_MARKET.has(row.symbol.toUpperCase())
      ? "Broad-market fund — exempt from the checklist."
      : "Fund holding — the leading-stock checklist scores individual companies, not funds.";
  }
  return null;
}
