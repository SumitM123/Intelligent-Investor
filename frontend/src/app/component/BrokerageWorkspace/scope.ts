// The security list follows the pie, but only two levels deep. The pie drills five levels
// (portfolio → stocks → ETFs → one ETF → its sectors); the list only ever answers "which
// securities am I looking at" — all of them, the stocks half, or the bonds half. Drilling
// deeper than stocks/bonds leaves the list exactly where it was.

import type { Breakdown, Frame } from "../PortfolioBreakdown/types";

export type ListScope = "all" | "stocks" | "bonds";

export interface SecurityRowData {
  key: string;
  // Ticker for anything the market quotes, CUSIP for an individual bond lot.
  symbol: string;
  // Sector for an equity, credit grade for a bond — whatever qualifies the row.
  detail: string;
  value: number;
  kind: "equity" | "etf" | "bond_etf" | "bond";
  // Shares held — only set for equity/etf rows. Sell mode uses this (plus `value`
  // as the dollar cap) for the slider; bond/bond_etf rows leave it undefined and
  // are not sellable (they don't resolve through the tax-estimate backend, which
  // looks up FIFO lot history and live quotes by market ticker).
  units?: number;
}

export interface SecurityGroup {
  title: string;
  rows: SecurityRowData[];
}

// A row is sellable only if it's an equity/ETF with known shares held — bonds and
// bond ETFs don't resolve through the tax-estimate backend (it looks up FIFO lot
// history and live quotes by market ticker, not CUSIP, and bond ETFs don't carry
// `units` today). Shared by SecurityList (filtering/gating) and SecurityRow
// (per-row rendering) so the definition can't drift between the two.
export function isSellable(row: SecurityRowData): boolean {
  return (row.kind === "equity" || row.kind === "etf") && typeof row.units === "number" && row.units > 0;
}

export function scopeFor(frame: Frame): ListScope {
  switch (frame.level) {
    case "L0":
      return "all";
    case "L1S":
    case "L2E":
    case "L2T":
    case "L3E":
    case "L3T":
      return "stocks";
    case "L1B":
    case "L2B":
    case "L2BE":
    case "L3B":
    case "L3BE":
      return "bonds";
  }
}

export function securitiesFor(bd: Breakdown, scope: ListScope): SecurityGroup[] {
  const equities: SecurityGroup = {
    title: "Equities",
    rows: bd.equities.map((e) => ({
      key: `equity:${e.symbol}`,
      symbol: e.symbol,
      detail: e.sector || "Unclassified",
      value: e.market_value,
      kind: "equity" as const,
      units: e.units,
    })),
  };

  const etfs: SecurityGroup = {
    title: "ETFs",
    rows: bd.etfs.map((e) => ({
      key: `etf:${e.symbol}`,
      symbol: e.symbol,
      detail: "Equity fund",
      value: e.market_value,
      kind: "etf" as const,
      units: e.units,
    })),
  };

  const bondEtfs: SecurityGroup = {
    title: "Bond ETFs",
    rows: bd.bond_etfs.map((e) => ({
      key: `bondetf:${e.symbol}`,
      symbol: e.symbol,
      detail: "Bond fund",
      value: e.market_value,
      kind: "bond_etf" as const,
    })),
  };

  const bonds: SecurityGroup = {
    title: "Bonds",
    // bonds_by_grade buckets lots by credit grade; the list is flat, so unwrap it.
    rows: Object.values(bd.bonds_by_grade)
      .flat()
      .map((b) => ({
        key: `bond:${b.lot_key}`,
        symbol: b.cusip,
        detail: b.grade || "Ungraded",
        value: b.bond_value,
        kind: "bond" as const,
      })),
  };

  const groups =
    scope === "stocks"
      ? [equities, etfs]
      : scope === "bonds"
        ? [bondEtfs, bonds]
        : [equities, etfs, bondEtfs, bonds];

  return groups.filter((g) => g.rows.length > 0);
}
