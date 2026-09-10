"use client";

import { useMemo, useState } from "react";
import SecurityRow from "./SecurityRow";
import { scopeFor, securitiesFor } from "./scope";
import type { Breakdown, Frame } from "../PortfolioBreakdown/types";

interface Props {
  breakdown: Breakdown;
  frame: Frame;
  isDefensive: boolean;
}

const SCOPE_LABEL: Record<string, string> = {
  all: "Everything you hold",
  stocks: "The stocks half",
  bonds: "The bonds half",
};

export default function SecurityList({ breakdown, frame, isDefensive }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const scope = scopeFor(frame);
  const groups = useMemo(() => securitiesFor(breakdown, scope), [breakdown, scope]);

  // Percentages are of what is currently in scope, not of the whole portfolio, so the
  // column always sums to 100% for what the reader can actually see.
  const scopedTotal = useMemo(
    () => groups.reduce((sum, g) => sum + g.rows.reduce((s, r) => s + r.value, 0), 0),
    [groups],
  );

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-3 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
            Securities
          </p>
          <h3 className="mt-1 text-sm font-semibold">{SCOPE_LABEL[scope]}</h3>
        </div>
        <p className="text-xs text-[var(--muted)]">Click a row for its checklist</p>
      </div>

      {groups.length === 0 ? (
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
                    expanded={expanded.has(row.key)}
                    onToggle={() => toggle(row.key)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
