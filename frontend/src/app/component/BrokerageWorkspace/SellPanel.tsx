"use client";

import { useState } from "react";

interface Props {
  sharesHeld: number;
  // Market value of the full holding (== sharesHeld * price). Used directly as the
  // dollar cap rather than re-deriving a per-share price, so fraction <-> dollars
  // <-> shares stay exact instead of round-tripping through a division.
  holdingValue: number;
  fraction: number; // 0..1, owned by the parent (SecurityList)
  onFractionChange: (fraction: number) => void;
}

function formatDollars(amount: number): string {
  return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function SellPanel({ sharesHeld, holdingValue, fraction, onFractionChange }: Props) {
  // null = not being edited, show the derived value. A string is the in-progress
  // raw text while the numeric input is focused.
  const [draftText, setDraftText] = useState<string | null>(null);

  const dollarAmount = fraction * holdingValue;
  const sharesToSell = fraction * sharesHeld;

  const applyDollarAmount = (raw: string) => {
    if (raw === "") return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || holdingValue <= 0) return;
    const clamped = Math.min(Math.max(parsed, 0), holdingValue);
    onFractionChange(clamped / holdingValue);
  };

  return (
    <div className="px-3 pb-3 pt-1 bg-[var(--surface-muted)]">
      <p className="text-xs text-[var(--muted)] px-1 py-1 tabular">
        ${formatDollars(dollarAmount)}{" "}
        <span className="text-[var(--muted)]">
          ({sharesToSell.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares)
        </span>
      </p>

      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={fraction}
        onChange={(e) => onFractionChange(Number(e.target.value))}
        aria-label="Amount to sell"
        aria-valuetext={`$${formatDollars(dollarAmount)}, ${sharesToSell.toLocaleString(undefined, {
          maximumFractionDigits: 4,
        })} shares`}
        className="range-band"
      />

      <div className="mt-1 flex flex-col gap-1 max-w-[10rem]">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)]">
          Sell amount
        </span>
        <div className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[color-mix(in_oklch,var(--accent)_15%,transparent)] transition">
          <span className="text-sm text-[var(--muted)]">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={draftText ?? formatDollars(dollarAmount)}
            onFocus={() => setDraftText(formatDollars(dollarAmount))}
            onChange={(e) => {
              const v = e.target.value;
              if (v !== "" && !/^\d*\.?\d*$/.test(v)) return; // non-negative decimal only
              setDraftText(v);
              applyDollarAmount(v);
            }}
            onBlur={() => setDraftText(null)}
            className="w-full min-w-0 bg-transparent outline-none text-sm tabular"
          />
        </div>
      </div>
    </div>
  );
}
