"use client";

import type { SellEstimateResult } from "./useSellEstimate";

interface Props {
  result: SellEstimateResult;
}

function formatCurrency(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function SummaryRow({
  label,
  value,
  tone = "neutral",
  emphasize = false,
}: {
  label: string;
  value: number;
  tone?: "neutral" | "pass" | "fail";
  emphasize?: boolean;
}) {
  const color =
    tone === "pass" ? "var(--pass)" : tone === "fail" ? "var(--fail)" : "var(--accent)";
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <span
        className={`tabular ${emphasize ? "text-base font-semibold" : "text-sm font-medium"}`}
        style={{ color }}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}

export default function SellResultCard({ result }: Props) {
  const netValuePass = result.net_value >= 0;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
      <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase mb-2">
        Estimated tax impact
      </p>

      <div className="divide-y divide-[var(--border)]">
        <SummaryRow label="Net value" value={result.net_value} tone={netValuePass ? "pass" : "fail"} />
        <SummaryRow label="Federal tax" value={result.federal_tax} />
        <SummaryRow label="State tax" value={result.state_tax} />
        <SummaryRow label="Total tax" value={result.total_tax} emphasize />
        {result.is_net_loss && (
          <>
            <SummaryRow
              label="Deductible against income this year"
              value={result.deductible_against_income_this_year}
            />
            <SummaryRow label="Carryover to next year" value={result.carryover_to_next_year} />
          </>
        )}
      </div>

      <p className="mt-3 text-[11px] text-[var(--muted)] leading-relaxed">
        Analytics only — nothing was actually sold.
      </p>
    </div>
  );
}
