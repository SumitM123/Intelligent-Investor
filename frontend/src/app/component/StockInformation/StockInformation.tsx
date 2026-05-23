"use client";
import React, { useState } from "react";

interface StockInformationProps {
  symbol: string;
  name?: string;
  price?: number;
  changePct?: number;
  pe?: number;
  pb?: number;
  dividendYield?: number;
  marketCap?: number;
  spark?: number[];
  passedBits?: boolean[];
}

/**
 * Dense stock summary card.
 * Sparkline on the left, key metrics on the right, pass/fail pill in the corner.
 * All optional props degrade gracefully to em-dashes.
 */
export default function StockInformation({
  symbol,
  name,
  price,
  changePct,
  pe,
  pb,
  dividendYield,
  marketCap,
  spark,
  passedBits,
}: StockInformationProps) {
  const positive = (changePct ?? 0) >= 0;
  const passCount = passedBits ? passedBits.filter(Boolean).length : null;
  const tone =
    passCount === null
      ? null
      : passCount === 7
      ? "pass"
      : passCount >= 4
      ? "warn"
      : "fail";

  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--border-strong)] transition">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono tabular text-lg font-semibold tracking-tight">{symbol}</span>
            {name && (
              <span className="text-xs text-[var(--muted)] truncate">{name}</span>
            )}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular tracking-tight">
              {price !== undefined ? `$${price.toFixed(2)}` : "—"}
            </span>
            {changePct !== undefined && (
              <span
                className={`text-xs font-medium tabular ${
                  positive ? "text-[var(--pass)]" : "text-[var(--fail)]"
                }`}
              >
                {positive ? "+" : ""}
                {changePct.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        {tone && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold tabular ${
              tone === "pass"
                ? "bg-[var(--pass-soft)] text-[var(--pass)]"
                : tone === "warn"
                ? "bg-[var(--warn-soft)] text-[var(--warn)]"
                : "bg-[var(--fail-soft)] text-[var(--fail)]"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {passCount}/7
          </span>
        )}
      </div>

      {spark && spark.length > 1 && <Sparkline data={spark} positive={positive} />}

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Metric label="P/E" value={pe?.toFixed(1)} />
        <Metric label="P/B" value={pb?.toFixed(2)} />
        <Metric
          label="Div yield"
          value={dividendYield !== undefined ? `${dividendYield.toFixed(2)}%` : undefined}
        />
        <Metric
          label="Mkt cap"
          value={marketCap !== undefined ? formatLargeNumber(marketCap) : undefined}
        />
      </dl>
    </article>
  );
}

function Metric({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1 border-b border-[var(--border)] last:border-0">
      <dt className="text-[11px] text-[var(--muted)] uppercase tracking-wider">{label}</dt>
      <dd className="tabular text-sm font-medium">{value ?? "—"}</dd>
    </div>
  );
}

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const w = 280;
  const h = 56;
  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color = positive ? "var(--pass)" : "var(--fail)";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full" preserveAspectRatio="none" style={{ height: 56 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function formatLargeNumber(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}
