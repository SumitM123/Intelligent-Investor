"use client";

import { useEffect, useMemo, useState } from "react";
import SecurityRow from "./SecurityRow";
import SellResultCard from "./SellResultCard";
import { isSellable, scopeFor, securitiesFor, type SecurityRowData } from "./scope";
import { useSellEstimate, type SellRequestEntry } from "./useSellEstimate";
import type { Breakdown, Frame } from "../PortfolioBreakdown/types";

interface Props {
  breakdown: Breakdown;
  frame: Frame;
  isDefensive: boolean;
  accountId: string | null;
}

type Mode = "view" | "sell" | "results";

const SCOPE_LABEL: Record<string, string> = {
  all: "Everything you hold",
  stocks: "The stocks half",
  bonds: "The bonds half",
};

export default function SecurityList({ breakdown, frame, isDefensive, accountId }: Props) {
  const [mode, setMode] = useState<Mode>("view");
  // Dual-purpose: the view-mode "which criteria panels are open" set doubles as the
  // sell-mode "which rows are selected" set, since selecting a row IS opening its panel.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sellFractions, setSellFractions] = useState<Record<string, number>>({});
  const { runEstimate, loading: estimateLoading, error: estimateError, result: estimateResult, reset: resetEstimate } =
    useSellEstimate();

  const scope = scopeFor(frame);
  const groups = useMemo(() => securitiesFor(breakdown, scope), [breakdown, scope]);

  // Percentages are of what is currently in scope, not of the whole portfolio, so the
  // column always sums to 100% for what the reader can actually see.
  const scopedTotal = useMemo(
    () => groups.reduce((sum, g) => sum + g.rows.reduce((s, r) => s + r.value, 0), 0),
    [groups],
  );

  const allRows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  const sellableRows = useMemo(() => allRows.filter(isSellable), [allRows]);

  const sellSelection = useMemo<SellRequestEntry[]>(() => {
    const rowByKey = new Map(allRows.map((r) => [r.key, r] as [string, SecurityRowData]));
    return Array.from(expanded)
      .map((key) => ({ row: rowByKey.get(key), fraction: sellFractions[key] ?? 0 }))
      .filter(
        (s): s is { row: SecurityRowData; fraction: number } =>
          !!s.row && isSellable(s.row) && s.fraction > 0,
      )
      .map((s) => ({ symbol: s.row.symbol, shares: s.fraction * s.row.units! }));
  }, [expanded, sellFractions, allRows]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const setSellFraction = (key: string, fraction: number) =>
    setSellFractions((prev) => ({ ...prev, [key]: fraction }));

  const resetToView = () => {
    setMode("view");
    setExpanded(new Set());
    setSellFractions({});
    resetEstimate();
  };

  const handleSold = async () => {
    if (sellSelection.length === 0 || !accountId || estimateLoading) return;
    try {
      await runEstimate(accountId, sellSelection);
      setMode("results");
    } catch {
      // estimateError is already set by the hook; stay in sell mode so the user can retry.
    }
  };

  // Selections reference shares specific to the account they were made under — if the
  // user switches accounts mid-sell (or mid-results), those selections must not silently
  // carry over to the newly selected account.
  useEffect(() => {
    if (mode !== "view") resetToView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-3 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
            Securities
          </p>
          <h3 className="mt-1 text-sm font-semibold">{SCOPE_LABEL[scope]}</h3>
        </div>

        <div className="flex items-center gap-3">
          {mode === "view" && (
            <>
              <p className="text-xs text-[var(--muted)]">Click a row for its checklist</p>
              {sellableRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMode("sell")}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
                >
                  Sell
                </button>
              )}
            </>
          )}
          {mode === "sell" && (
            <>
              <p className="text-xs text-[var(--muted)]">Click a row to select it for sale</p>
              <button
                type="button"
                onClick={resetToView}
                className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
              >
                View
              </button>
            </>
          )}
          {mode === "results" && (
            <button
              type="button"
              onClick={resetToView}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
            >
              View
            </button>
          )}
        </div>
      </div>

      {mode === "results" ? (
        estimateResult ? (
          <SellResultCard result={estimateResult} />
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-6 text-center text-sm text-[var(--muted)]">
            Nothing to show.
          </div>
        )
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-6 text-center text-sm text-[var(--muted)]">
          Nothing in this part of the portfolio yet.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.title}>
              <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase px-1 pb-1.5">
                {group.title}
              </p>
              <ul className="rounded-lg border border-[var(--border)] bg-[var(--background)] overflow-hidden">
                {group.rows.map((row) => (
                  <SecurityRow
                    key={row.key}
                    row={row}
                    isDefensive={isDefensive}
                    shareOfTotal={scopedTotal > 0 ? (row.value / scopedTotal) * 100 : 0}
                    mode={mode}
                    expanded={expanded.has(row.key)}
                    onToggle={() => toggle(row.key)}
                    sellFraction={sellFractions[row.key] ?? 0}
                    onSellFractionChange={(fraction) => setSellFraction(row.key, fraction)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {mode === "sell" && (
        <div className="mt-4 flex items-center justify-end gap-3">
          {estimateError && <p className="text-xs text-[var(--fail)]">{estimateError}</p>}
          <button
            type="button"
            onClick={handleSold}
            disabled={sellSelection.length === 0 || !accountId || estimateLoading}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {estimateLoading ? "Estimating…" : "Sold"}
          </button>
        </div>
      )}
    </div>
  );
}
