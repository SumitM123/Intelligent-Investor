"use client";

import { useCallback, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export interface SellEstimateBreakdownEntry {
  symbol: string;
  shares_to_sell: number;
  current_price: number;
  lots_consumed: unknown[];
}

export interface SellEstimateNetLoss {
  is_net_loss: true;
  net_value: number;
  total_tax: number;
  federal_tax: 0;
  state_tax: 0;
  deductible_against_income_this_year: number;
  carryover_to_next_year: number;
  breakdown: SellEstimateBreakdownEntry[];
}

export interface SellEstimateSuccess {
  is_net_loss?: false;
  net_value: number;
  short_term_gain: number;
  long_term_gain: number;
  federal_short_term_tax: number;
  federal_long_term_tax: number;
  federal_tax: number;
  state_tax: number;
  total_tax: number;
  niit: number;
  tax_year: number;
  breakdown: SellEstimateBreakdownEntry[];
}

export type SellEstimateResult = SellEstimateNetLoss | SellEstimateSuccess;

export interface SellRequestEntry {
  symbol: string;
  shares: number;
}

/**
 * Calls the "Actual Retrieved" tax-estimate backend (GET /api/taxEstimate/estimateRetrival).
 * account_type is hardcoded to "traditional_brokerage" — the only account type this app
 * has ever supported end-to-end. Analytics only: this never actually sells anything.
 */
export function useSellEstimate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SellEstimateResult | null>(null);

  const runEstimate = useCallback(async (accountId: string, sells: SellRequestEntry[]) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("account_type", "traditional_brokerage");
      params.set("account_id", accountId);
      for (const s of sells) {
        params.append("symbol", s.symbol);
        params.append("shares", String(Math.max(0, s.shares)));
      }

      const res = await fetch(`${API_BASE}/api/taxEstimate/estimateRetrival?${params.toString()}`, {
        credentials: "include",
      });

      if (!res.ok) {
        let detail = `Estimate failed (${res.status})`;
        try {
          const body = await res.json();
          if (typeof body?.detail === "string") detail = body.detail;
        } catch {
          // body wasn't JSON — keep the generic message
        }
        throw new Error(detail);
      }

      const data = (await res.json()) as SellEstimateResult;
      setResult(data);
      return data;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { runEstimate, loading, error, result, reset };
}
