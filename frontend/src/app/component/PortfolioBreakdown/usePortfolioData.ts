"use client";

import { useEffect, useMemo, useState } from "react";
import { usePortfolioBonds } from "./PortfolioProvider";
import { bondsToByGrade } from "./derive";
import type { Breakdown } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

// Everything the backend contributes: the stocks half, plus the bond ETFs that
// belong to the bonds half but can only come from the brokerage account.
type StockHalf = Pick<Breakdown, "stocks_total" | "equities" | "etfs" | "bond_etfs">;

/**
 * Loads one account's breakdown and merges it with the client-side bond list.
 *
 * Lifted out of PortfolioBreakdown so the pie and the security list can be handed the
 * *same* Breakdown object from a single call — two independent copies of this fetch
 * could disagree about what the portfolio contains.
 */
export function usePortfolioData(accountId: string | null, isDefensive: boolean) {
  const { bonds } = usePortfolioBonds();

  const [stockHalf, setStockHalf] = useState<StockHalf | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) {
      setStockHalf(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const url = `${API_BASE}/api/portfolio/breakdown?is_defensive=${isDefensive}&account_id=${encodeURIComponent(
          accountId,
        )}`;
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`breakdown ${res.status}`);
        const data = (await res.json()) as Breakdown;
        if (cancelled) return;
        setStockHalf({
          stocks_total: data.stocks_total,
          equities: data.equities ?? [],
          etfs: data.etfs ?? [],
          bond_etfs: data.bond_etfs ?? [],
        });
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setStockHalf(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, isDefensive]);

  // Bonds half is derived from the shared BondList state (reactive to edits), then
  // joined by any brokerage-held bond ETFs from the backend.
  const { byGrade, total: bondsTotal } = useMemo(() => bondsToByGrade(bonds), [bonds]);

  const breakdown: Breakdown = useMemo(() => {
    const bondEtfs = stockHalf?.bond_etfs ?? [];
    const bondEtfTotal = bondEtfs.reduce((a, e) => a + e.market_value, 0);
    return {
      stocks_total: stockHalf?.stocks_total ?? 0,
      bonds_total: bondsTotal + bondEtfTotal,
      equities: stockHalf?.equities ?? [],
      etfs: stockHalf?.etfs ?? [],
      bond_etfs: bondEtfs,
      bonds_by_grade: byGrade,
    };
  }, [stockHalf, bondsTotal, byGrade]);

  return { breakdown, loading, error };
}
