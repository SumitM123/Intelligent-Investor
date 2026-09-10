"use client";

import { useMemo } from "react";
import PieView from "./PieView";
import BondDetailCard from "./BondDetailCard";
import { findBond, frameLabel, slicesFor, titleFor, unitFor } from "./derive";
import type { Breakdown, Frame } from "./types";

interface Props {
  breakdown: Breakdown;
  stack: Frame[];
  push: (f: Frame) => void;
  back: () => void;
  jumpTo: (index: number) => void;
  loading: boolean;
  error: string | null;
}

/**
 * Presentational. Data-fetching moved to usePortfolioData and the account picker moved to
 * BrokerageWorkspace, which owns the drill stack too — the security list has to be able to
 * read the current frame, and two copies of that state would drift.
 */
export default function PortfolioBreakdown({
  breakdown,
  stack,
  push,
  back,
  jumpTo,
  loading,
  error,
}: Props) {
  const current = stack[stack.length - 1];
  const slices = useMemo(() => slicesFor(current, breakdown, push), [current, breakdown, push]);
  const charted = breakdown.stocks_total + breakdown.bonds_total;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-1 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
            Allocation
          </p>
          <h2 className="mt-1 text-base font-semibold">Where your money sits — stocks vs bonds</h2>
        </div>
        <span className="text-xs text-[var(--muted)] tabular">
          {charted > 0
            ? `$${charted.toLocaleString(undefined, { maximumFractionDigits: 0 })} charted`
            : "—"}
        </span>
      </div>
      <p className="text-xs text-[var(--muted)] mt-1 mb-4 leading-relaxed">
        Click a slice (or a legend row) to drill in. Bond allocation uses price × quantity,
        not a live mark.
      </p>

      {loading && (
        <div className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] mb-4">
          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
            <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Loading positions…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--warn)]/30 bg-[var(--warn-soft)] px-3 py-2 mb-4 text-xs text-[var(--warn)]">
          Couldn&apos;t load brokerage positions ({error}). The bond side is still shown.
        </div>
      )}

      {/* Breadcrumb + back */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          type="button"
          onClick={back}
          disabled={stack.length <= 1}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:bg-black/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <nav className="flex items-center gap-1 text-xs min-w-0 flex-wrap">
          {stack.map((frame, i) => {
            const isLast = i === stack.length - 1;
            return (
              <span key={`${frame.level}-${i}`} className="flex items-center gap-1 min-w-0">
                {i > 0 && <span className="text-[var(--muted)]">›</span>}
                <button
                  type="button"
                  onClick={() => jumpTo(i)}
                  disabled={isLast}
                  className={`truncate ${
                    isLast
                      ? "font-semibold text-[var(--foreground)] cursor-default"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {frameLabel(frame)}
                </button>
              </span>
            );
          })}
        </nav>
      </div>

      <p className="text-sm font-semibold mb-3">{titleFor(current)}</p>

      {/* Body */}
      {current.level === "L3B" ? (
        (() => {
          const bond = findBond(breakdown, current.lotKey);
          return bond ? (
            <BondDetailCard bond={bond} />
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-8 text-center text-sm text-[var(--muted)]">
              Bond {current.cusip} is no longer in your list.
            </div>
          );
        })()
      ) : current.level === "L3T" && slices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-8 text-center text-sm text-[var(--muted)]">
          Sector breakdown not available for {current.etfSymbol}.
        </div>
      ) : current.level === "L3BE" && slices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-8 text-center text-sm text-[var(--muted)]">
          Credit quality not available for {current.etfSymbol}.
        </div>
      ) : (
        <PieView slices={slices} unit={unitFor(current)} />
      )}
    </div>
  );
}
