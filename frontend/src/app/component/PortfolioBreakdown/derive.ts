// Pure slice-derivation: given the current drill frame + the unified breakdown,
// produce the pie slices (and their drill-in handlers). Keeping this pure lets
// PieView stay presentational and makes the levels trivially testable.

import type { BondEntry } from "@/app/component/BondList/BondList";
import { STOCKS_COLOR, BONDS_COLOR, ETF_COLOR, BOND_ETF_COLOR, pickColor, gradeColor } from "./colors";
import type { Breakdown, BondNode, Frame, Slice } from "./types";

// Build the bonds half of the breakdown from the shared BondList state so it
// stays reactive to add/delete edits (value = purchase_price × quantity).
export function bondsToByGrade(
  bonds: BondEntry[],
): { byGrade: Record<string, BondNode[]>; total: number } {
  const byGrade: Record<string, BondNode[]> = {};
  let total = 0;
  for (const b of bonds) {
    const price = b.purchase_price ?? 0;
    const qty = b.quantity ?? 0;
    const value = price * qty;
    total += value;
    const grade = b.grade || "Unclassified";
    (byGrade[grade] ??= []).push({
      cusip: b.cusip,
      grade,
      bond_value: value,
      purchase_price: b.purchase_price ?? null,
      quantity: b.quantity ?? null,
      ytm: b.ytm ?? null,
      spread_bps: b.spread_bps ?? null,
      treasury_yield: b.treasury_yield ?? null,
      maturity_date: b.maturity_date ?? null,
      bond_type: b.bond_type ?? null,
    });
  }
  return { byGrade, total };
}

export function findBond(bd: Breakdown, cusip: string): BondNode | null {
  for (const list of Object.values(bd.bonds_by_grade)) {
    const hit = list.find((b) => b.cusip === cusip);
    if (hit) return hit;
  }
  return null;
}

// Short label for one frame, used to render the breadcrumb path.
export function frameLabel(frame: Frame): string {
  switch (frame.level) {
    case "L0":
      return "Portfolio";
    case "L1S":
      return "Stocks";
    case "L1B":
      return "Bonds";
    case "L2E":
      return "Equities";
    case "L2T":
      return "ETFs";
    case "L2BE":
      return "Bond ETFs";
    case "L2B":
      return frame.grade;
    case "L3E":
      return frame.sector;
    case "L3T":
    case "L3BE":
      return frame.etfSymbol;
    case "L3B":
      return frame.cusip;
  }
}

export function titleFor(frame: Frame): string {
  switch (frame.level) {
    case "L0":
      return "Stocks vs Bonds";
    case "L1S":
      return "Equities vs ETFs";
    case "L1B":
      return "Bonds by grade";
    case "L2E":
      return "Equities by sector";
    case "L2T":
      return "ETFs by position";
    case "L2BE":
      return "Bond ETFs by position";
    case "L2B":
      return `${frame.grade} bonds`;
    case "L3E":
      return `${frame.sector} stocks`;
    case "L3T":
      return `${frame.etfSymbol} top holdings`;
    case "L3BE":
      return `${frame.etfSymbol} credit quality`;
    case "L3B":
      return `Bond ${frame.cusip}`;
  }
}

// Whether the current level's values are dollars or percentages (the ETF leaves
// — holdings weights and credit-quality weights — are the percentage ones).
export function unitFor(frame: Frame): "usd" | "pct" {
  return frame.level === "L3T" || frame.level === "L3BE" ? "pct" : "usd";
}

export function slicesFor(frame: Frame, bd: Breakdown, push: (f: Frame) => void): Slice[] {
  switch (frame.level) {
    case "L0": {
      const slices: Slice[] = [];
      if (bd.stocks_total > 0) {
        slices.push({
          label: "Stocks",
          value: bd.stocks_total,
          color: STOCKS_COLOR,
          onClick: () => push({ level: "L1S" }),
        });
      }
      if (bd.bonds_total > 0) {
        slices.push({
          label: "Bonds",
          value: bd.bonds_total,
          color: BONDS_COLOR,
          onClick: () => push({ level: "L1B" }),
        });
      }
      return slices;
    }

    case "L1S": {
      const equityTotal = bd.equities.reduce((a, e) => a + e.market_value, 0);
      const etfTotal = bd.etfs.reduce((a, e) => a + e.market_value, 0);
      const slices: Slice[] = [];
      if (equityTotal > 0) {
        slices.push({
          label: "Equities",
          value: equityTotal,
          color: STOCKS_COLOR,
          onClick: () => push({ level: "L2E" }),
        });
      }
      if (etfTotal > 0) {
        slices.push({
          label: "ETFs",
          value: etfTotal,
          color: ETF_COLOR,
          onClick: () => push({ level: "L2T" }),
        });
      }
      return slices;
    }

    case "L2E": {
      const bySector = new Map<string, number>();
      for (const e of bd.equities) {
        bySector.set(e.sector, (bySector.get(e.sector) ?? 0) + e.market_value);
      }
      return [...bySector.entries()].map(([sector, value]) => ({
        label: sector,
        value,
        color: pickColor(sector),
        onClick: () => push({ level: "L3E", sector }),
      }));
    }

    case "L3E": {
      // Leaf: individual stocks within the chosen sector. No further drill.
      return bd.equities
        .filter((e) => e.sector === frame.sector)
        .map((e) => ({
          label: e.symbol,
          value: e.market_value,
          color: pickColor(e.symbol),
          onClick: () => {},
        }));
    }

    case "L2T": {
      return bd.etfs.map((e) => ({
        label: e.symbol,
        value: e.market_value,
        color: pickColor(e.symbol),
        onClick: () => push({ level: "L3T", etfSymbol: e.symbol }),
      }));
    }

    case "L3T": {
      // Leaf: top holdings inside the chosen ETF (weights, not dollars). The
      // ETF may sit on either half, so search both lists.
      const etf =
        bd.etfs.find((e) => e.symbol === frame.etfSymbol) ??
        bd.bond_etfs.find((e) => e.symbol === frame.etfSymbol);
      if (!etf) return [];
      return etf.top_holdings.map((h) => ({
        label: h.symbol,
        value: h.weight_pct,
        color: pickColor(h.symbol),
        onClick: () => {},
      }));
    }

    case "L1B": {
      const slices: Slice[] = Object.entries(bd.bonds_by_grade).map(([grade, list]) => ({
        label: grade,
        value: list.reduce((a, b) => a + b.bond_value, 0),
        color: gradeColor(grade),
        onClick: () => push({ level: "L2B", grade }),
      }));
      // Brokerage-held fixed income sits alongside the credit-grade groups
      // rather than inside one — a fund has no single CUSIP or grade.
      const bondEtfTotal = bd.bond_etfs.reduce((a, e) => a + e.market_value, 0);
      if (bondEtfTotal > 0) {
        slices.push({
          label: "Bond ETFs",
          value: bondEtfTotal,
          color: BOND_ETF_COLOR,
          onClick: () => push({ level: "L2BE" }),
        });
      }
      return slices;
    }

    case "L2BE": {
      return bd.bond_etfs.map((e) => ({
        label: e.symbol,
        value: e.market_value,
        color: pickColor(e.symbol),
        onClick: () => push({ level: "L3BE", etfSymbol: e.symbol }),
      }));
    }

    case "L3BE": {
      // Leaf: a bond fund's credit-quality mix (weights, not dollars). Graded
      // colors keep it visually consistent with the manual bonds' grade ring.
      const etf = bd.bond_etfs.find((e) => e.symbol === frame.etfSymbol);
      if (!etf) return [];
      return etf.credit_quality.map((r) => ({
        label: r.grade,
        value: r.weight_pct,
        color: gradeColor(r.grade),
        onClick: () => {},
      }));
    }

    case "L2B": {
      const list = bd.bonds_by_grade[frame.grade] ?? [];
      return list.map((b) => ({
        label: b.cusip,
        value: b.bond_value,
        color: gradeColor(b.grade),
        onClick: () => push({ level: "L3B", cusip: b.cusip }),
      }));
    }

    case "L3B":
      // Leaf info card — rendered by BondDetailCard, not as a pie.
      return [];
  }
}
