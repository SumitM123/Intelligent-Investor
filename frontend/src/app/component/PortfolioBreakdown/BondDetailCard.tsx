"use client";

import { gradeTone } from "@/app/component/BondList/gradeTone";
import type { BondNode } from "./types";

function money(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function pct(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `${n.toFixed(2)}%`;
}

export default function BondDetailCard({ bond }: { bond: BondNode }) {
  const tone = gradeTone(bond.grade);
  const positionValue = (bond.price ?? 0) * (bond.quantity ?? 0) || null;

  const rows: { label: string; value: string }[] = [
    { label: "Type", value: bond.bond_type ?? "—" },
    {
      label: "Coupon",
      value:
        bond.coupon_rate !== null && bond.coupon_rate !== undefined
          ? `${bond.coupon_rate.toFixed(2)}%`
          : "—",
    },
    { label: "Price / 100", value: bond.price !== null && bond.price !== undefined ? bond.price.toFixed(2) : "—" },
    {
      label: "Quantity",
      value:
        bond.quantity !== null && bond.quantity !== undefined
          ? bond.quantity.toLocaleString()
          : "—",
    },
    { label: "Position value", value: money(positionValue) },
    { label: "Purchase date", value: bond.purchase_date ?? "—" },
    { label: "Yield to maturity", value: pct(bond.ytm) },
    { label: "Treasury yield @ maturity", value: pct(bond.treasury_yield) },
    {
      label: "OAS spread",
      value:
        bond.spread_bps !== null && bond.spread_bps !== undefined
          ? `${bond.spread_bps} bps`
          : "—",
    },
    { label: "Maturity date", value: bond.maturity_date ?? "—" },
  ];

  return (
    <div className="rounded-lg border border-[var(--border)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[var(--surface-muted)] border-b border-[var(--border)]">
        <span className="font-mono tabular font-semibold text-sm">{bond.cusip}</span>
        <span
          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold tabular"
          style={{ background: tone.bg, color: tone.text }}
        >
          {tone.label}
        </span>
      </div>
      <dl className="divide-y divide-[var(--border)]">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <dt className="text-xs text-[var(--muted)]">{r.label}</dt>
            <dd className="text-sm tabular font-medium text-right">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
