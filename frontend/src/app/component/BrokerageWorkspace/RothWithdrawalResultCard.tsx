"use client";

import type { RothWithdrawalResult } from "./useRothWithdrawalEstimate";

interface Props {
  result: RothWithdrawalResult;
}

function formatCurrency(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function SummaryRow({
  label,
  value,
  tone = "neutral",
  emphasize = false,
  format = "currency",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "pass" | "fail";
  emphasize?: boolean;
  format?: "currency" | "percent";
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
        {format === "percent" ? formatPercent(value) : formatCurrency(value)}
      </span>
    </div>
  );
}

export default function RothWithdrawalResultCard({ result }: Props) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
      <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase mb-2">
        Estimated withdrawal impact
      </p>

      <div className="divide-y divide-[var(--border)]">
        <SummaryRow label="Withdrawal amount" value={result.withdrawal_amount} emphasize />
        <SummaryRow
          label="Contributions withdrawn"
          value={result.contribution_amount_withdrawn}
          tone="pass"
        />
        <SummaryRow
          label="Profit withdrawn"
          value={result.profit_amount_withdrawn}
        />
        <SummaryRow
          label="Profit share of withdrawal"
          value={result.profit_proportion}
          format="percent"
        />
        <SummaryRow label="Federal tax" value={result.federal_tax} />
        <SummaryRow label="State tax" value={result.state_tax} />
        <SummaryRow
          label="Early withdrawal penalty"
          value={result.early_withdrawal_penalty}
          tone={result.early_withdrawal_penalty > 0 ? "fail" : "neutral"}
        />
        <SummaryRow
          label="Total taxes & penalties"
          value={result.total_taxes_and_penalties}
          emphasize
          tone={result.total_taxes_and_penalties > 0 ? "fail" : "pass"}
        />
        <SummaryRow
          label="Net withdrawal after taxes & penalties"
          value={result.net_withdrawal_after_taxes_and_penalties}
          emphasize
          tone="pass"
        />
      </div>

      <p className="mt-3 text-[11px] text-[var(--muted)] leading-relaxed">
        {result.is_qualified_distribution
          ? "Qualified distribution — no tax or penalty on the profit portion."
          : "Not a qualified distribution — the profit portion is taxed and/or penalized per the age and 5-year rules."}
      </p>
      <p className="mt-1 text-[11px] text-[var(--muted)] leading-relaxed">
        Analytics only — nothing was actually withdrawn.
      </p>
    </div>
  );
}
