"use client";

import { useEffect } from "react";
import { useLeadingStockScreen } from "./useLeadingStockScreen";
import SellPanel from "./SellPanel";
import { isSellable, type SecurityRowData } from "./scope";

interface Props {
  row: SecurityRowData;
  shareOfTotal: number;
  mode: "view" | "sell";
  expanded: boolean;
  onToggle: () => void;
  sellFraction: number;
  onSellFractionChange: (fraction: number) => void;
}

export default function SecurityRow({
  row,
  shareOfTotal,
  mode,
  expanded,
  onToggle,
  sellFraction,
  onSellFractionChange,
}: Props) {
  const { status, verdict, results, exemptNote, error, run } = useLeadingStockScreen(row);
  const panelId = `criteria-${row.key}`;

  // Fetch-on-demand: only once this row is actually opened in view mode, and only once
  // per row (status flips off "idle" as soon as the fetch starts, so this won't refire
  // on every expand/collapse — it fires again only via the panel's own Retry button).
  useEffect(() => {
    if (mode === "view" && expanded && status === "idle") run();
  }, [mode, expanded, status, run]);

  // Collapsed-row dot: distinct from a real pass/fail until a screen has actually run,
  // so an equity nobody has clicked yet reads as "unknown," not the misleading default
  // green the stub used to show for every single holding.
  const dotColor =
    status === "success"
      ? verdict === "pass"
        ? "var(--pass)"
        : "var(--fail)"
      : status === "exempt"
        ? "var(--pass)"
        : status === "error"
          ? "var(--warn)"
          : "var(--muted)";
  const dotLabel =
    status === "success"
      ? verdict === "pass"
        ? "Passes the leading-stock screen"
        : "Fails the leading-stock screen"
      : status === "exempt"
        ? "Exempt from the checklist"
        : status === "error"
          ? "Screen failed"
          : status === "loading"
            ? "Checking…"
            : "Not yet screened — click to check";

  const sellable = isSellable(row);

  if (mode === "sell" && !sellable) {
    return (
      <li className="border-b border-[var(--border)] last:border-b-0">
        <div
          aria-disabled="true"
          className="w-full flex items-center gap-3 px-3 py-2.5 opacity-50"
        >
          <span aria-hidden className="w-2 h-2 rounded-full shrink-0 border border-[var(--muted)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium font-mono truncate">{row.symbol}</span>
            <span className="block text-xs text-[var(--muted)] truncate">{row.detail}</span>
          </span>
          <span className="text-right shrink-0">
            <span className="block text-sm tabular font-medium">
              ${row.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span className="block text-xs text-[var(--muted)]">Not sellable</span>
          </span>
        </div>
      </li>
    );
  }

  const selected = mode === "sell" && expanded;

  return (
    <li className="border-b border-[var(--border)] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-pressed={mode === "sell" ? selected : undefined}
        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-black/[0.03] transition ${
          selected ? "bg-[var(--accent-soft)]" : ""
        }`}
      >
        {mode === "sell" ? (
          <span
            aria-hidden
            className="grid place-items-center w-4 h-4 rounded-full shrink-0 text-[9px] font-semibold text-white"
            style={{
              background: selected ? "var(--accent)" : "transparent",
              border: selected ? "none" : "1.5px solid var(--border-strong)",
            }}
          >
            {selected ? "✓" : ""}
          </span>
        ) : (
          <>
            <span
              aria-hidden
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: dotColor }}
            />
            <span className="sr-only">{dotLabel}</span>
          </>
        )}

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium font-mono truncate">{row.symbol}</span>
          <span className="block text-xs text-[var(--muted)] truncate">{row.detail}</span>
        </span>

        <span className="text-right shrink-0">
          <span className="block text-sm tabular font-medium">
            ${row.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span className="block text-xs text-[var(--muted)] tabular">
            {shareOfTotal.toLocaleString(undefined, { maximumFractionDigits: 1 })}%
          </span>
        </span>

        <svg
          className={`w-4 h-4 shrink-0 text-[var(--muted)] transition-transform ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && mode === "view" && (
        <div id={panelId} className="px-3 pb-3 pt-1 bg-[var(--surface-muted)]">
          {status === "exempt" ? (
            <p className="text-xs text-[var(--muted)] leading-relaxed px-1 py-2">{exemptNote}</p>
          ) : status === "idle" || status === "loading" ? (
            <p className="text-xs text-[var(--muted)] leading-relaxed px-1 py-2">
              Checking against the 7-criterion leading-stock screen…
            </p>
          ) : status === "error" ? (
            <div className="px-1 py-2">
              <p className="text-xs text-[var(--warn)] leading-relaxed">{error}</p>
              <button
                type="button"
                onClick={run}
                className="mt-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {results.map(({ criterion, pass }) => (
                <li key={criterion.backendKey} className="flex items-start gap-2.5 px-1 py-1.5">
                  <span
                    className="mt-0.5 grid place-items-center w-4 h-4 rounded shrink-0 text-[9px] font-semibold text-white"
                    style={{ background: pass ? "var(--pass)" : "var(--fail)" }}
                    aria-hidden
                  >
                    {pass ? "✓" : "✕"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium leading-tight">{criterion.name}</span>
                    <span className="block text-[11px] text-[var(--muted)] tabular leading-tight mt-0.5">
                      {criterion.threshold}
                    </span>
                  </span>
                  <span className="sr-only">{pass ? "passes" : "fails"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {expanded && mode === "sell" && sellable && (
        <div id={panelId}>
          <SellPanel
            sharesHeld={row.units!}
            holdingValue={row.value}
            fraction={sellFraction}
            onFractionChange={onSellFractionChange}
          />
        </div>
      )}
    </li>
  );
}
