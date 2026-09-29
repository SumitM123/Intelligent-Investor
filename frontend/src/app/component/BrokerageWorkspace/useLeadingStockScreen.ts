"use client";

import { useCallback, useState } from "react";
import {
  LEADING_STOCK_CRITERIA,
  exemptionNote,
  type CriterionResult,
  type EvaluableRow,
  type Verdict,
} from "./criteria";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

type Status = "exempt" | "idle" | "loading" | "success" | "error";

export interface LeadingStockScreenState {
  status: Status;
  verdict: Verdict | null;
  results: CriterionResult[];
  exemptNote: string | null;
  error: string | null;
}

interface ScreenResponse {
  symbol: string;
  is_leading: boolean;
  criteria_details?: Record<string, { pass?: boolean } & Record<string, unknown>>;
}

/**
 * The real 7-criterion Graham leading-stock screen for one held equity, via the same
 * GET /api/snapTrade/isLeadingStock route the "Screen a stock" search bar calls.
 *
 * Fetch-on-demand only -- call `run()` -- never eager. A cache miss server-side chains
 * several sequential AlphaVantage calls per symbol; firing that for every row in the
 * list on mount would be slow and could burn through the rate-limited API keys for
 * securities nobody ever looks at.
 */
export function useLeadingStockScreen(row: EvaluableRow) {
  const note = exemptionNote(row);
  const [state, setState] = useState<LeadingStockScreenState>(
    note
      ? { status: "exempt", verdict: null, results: [], exemptNote: note, error: null }
      : { status: "idle", verdict: null, results: [], exemptNote: null, error: null },
  );

  const run = useCallback(async () => {
    if (note) return;
    setState((prev) => ({ ...prev, status: "loading", error: null }));
    try {
      const res = await fetch(
        `${API_BASE}/api/snapTrade/isLeadingStock?symbol=${encodeURIComponent(row.symbol)}&allCriteria=true`,
        { credentials: "include" },
      );
      if (!res.ok) {
        let detail = `Screen failed (${res.status})`;
        try {
          const body = await res.json();
          if (typeof body?.detail === "string") detail = body.detail;
        } catch {
          // body wasn't JSON — keep the generic message
        }
        throw new Error(detail);
      }
      const data = (await res.json()) as ScreenResponse;
      const results: CriterionResult[] = LEADING_STOCK_CRITERIA.map((criterion) => ({
        criterion,
        pass: data.criteria_details?.[criterion.backendKey]?.pass === true,
      }));
      setState({
        status: "success",
        verdict: data.is_leading ? "pass" : "fail",
        results,
        exemptNote: null,
        error: null,
      });
    } catch (e) {
      setState({
        status: "error",
        verdict: null,
        results: [],
        exemptNote: null,
        error: (e as Error).message,
      });
    }
  }, [note, row.symbol]);

  return { ...state, run };
}
