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
}

export interface SecurityGroup {
  title: string;
  rows: SecurityRowData[];
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
