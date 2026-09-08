"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
// Type-only import (erased at compile time) — avoids a runtime import cycle with
// BondList, which imports usePortfolioBonds from this module.
import type { BondEntry } from "@/app/component/BondList/BondList";

interface PortfolioCtx {
  bonds: BondEntry[];
  setBonds: (b: BondEntry[]) => void;
}

const Ctx = createContext<PortfolioCtx | null>(null);

// Holds the single source of truth for the user's bond list, shared between
// BondList (which edits it) and PortfolioBreakdown (which charts it). Lifting
// the state here keeps the Bonds half of the pie reactive to add/delete without
// a server round-trip.
export function PortfolioProvider({
  initialBonds,
  children,
}: {
  initialBonds: BondEntry[];
  children: ReactNode;
}) {
  const [bonds, setBonds] = useState<BondEntry[]>(initialBonds ?? []);
  return <Ctx.Provider value={{ bonds, setBonds }}>{children}</Ctx.Provider>;
}

export function usePortfolioBonds(): PortfolioCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("usePortfolioBonds must be used within a PortfolioProvider");
  }
  return ctx;
}
