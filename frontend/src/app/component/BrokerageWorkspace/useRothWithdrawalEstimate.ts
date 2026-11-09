"use client";

import { useCallback, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export interface RothWithdrawalResult {
  account_type: "roth_401k";
  withdrawal_amount: number;
  contribution_proportion: number;
  profit_proportion: number;
  contribution_amount_withdrawn: number;
  profit_amount_withdrawn: number;
  meets_age_59_5: boolean;
  meets_five_year_rule: boolean;
  is_qualified_distribution: boolean;
  federal_tax: number;
  state_tax: number;
  total_tax: number;
  early_withdrawal_penalty: number;
  total_taxes_and_penalties: number;
  net_withdrawal_after_taxes_and_penalties: number;
  tax_year: number;
}

export interface RothWithdrawalRequest {
  accountId: string;
  withdrawalAmount: number;
  totalContributions: number;
  meetsFiveYearRule: boolean;
}

/**
 * Calls the Roth 401(k) "Actual Retrieved" backend (GET /api/taxEstimate/estimateRothWithdrawal).
 * Account-level, not security-level -- no symbol/shares involved, unlike useSellEstimate.
 * Analytics only: this never actually withdraws anything.
 */
export function useRothWithdrawalEstimate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RothWithdrawalResult | null>(null);

  const runEstimate = useCallback(async (request: RothWithdrawalRequest) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("account_id", request.accountId);
      params.set("withdrawal_amount", String(Math.max(0, request.withdrawalAmount)));
      params.set("total_contributions", String(Math.max(0, request.totalContributions)));
      params.set("meets_five_year_rule", String(request.meetsFiveYearRule));

      const res = await fetch(
        `${API_BASE}/api/taxEstimate/estimateRothWithdrawal?${params.toString()}`,
        { credentials: "include" },
      );

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

      const data = (await res.json()) as RothWithdrawalResult;
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
