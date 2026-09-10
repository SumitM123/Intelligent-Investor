"use client";

import { evaluate } from "./criteria";
import type { SecurityRowData } from "./scope";

interface Props {
  row: SecurityRowData;
  isDefensive: boolean;
  shareOfTotal: number;
  expanded: boolean;
  onToggle: () => void;
}

export default function SecurityRow({ row, isDefensive, shareOfTotal, expanded, onToggle }: Props) {
  const { verdict, results, exemptNote } = evaluate(row, isDefensive);
  const passing = verdict === "pass";
  const panelId = `criteria-${row.key}`;

  return (
    <li className="border-b border-[var(--border)] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-black/[0.03] transition"
      >
        <span
          aria-hidden
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: passing ? "var(--pass)" : "var(--fail)" }}
        />
        <span className="sr-only">{passing ? "Passes" : "Fails"}</span>

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

      {expanded && (
        <div id={panelId} className="px-3 pb-3 pt-1 bg-[var(--surface-muted)]">
          {exemptNote ? (
            <p className="text-xs text-[var(--muted)] leading-relaxed px-1 py-2">{exemptNote}</p>
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
    </li>
  );
}
