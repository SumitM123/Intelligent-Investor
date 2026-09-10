"use client";

import type { AccountOption } from "../PortfolioBreakdown/types";

interface Props {
  accounts: AccountOption[];
  loading: boolean;
  error: string | null;
  onSelect: (accountId: string) => void;
}

// Card markup salvaged from the deleted accountsChoosing page, minus its fabricated
// allocation bar (`45 + ((index * 17) % 40)`) — that was invented data dressed up as
// analysis. Real allocation is what the pie shows once an account is picked.
export default function AccountPicker({ accounts, loading, error, onSelect }: Props) {
  if (loading) return <SkeletonGrid />;

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--fail)]/30 bg-[var(--fail-soft)] p-5 flex items-start gap-3">
        <svg className="w-5 h-5 text-[var(--fail)] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 17h0" strokeLinecap="round" />
        </svg>
        <div>
          <p className="text-sm font-medium text-[var(--fail)]">Can&apos;t load accounts</p>
          <p className="mt-1 text-xs text-[var(--fail)]/80">{error}</p>
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-6 text-center">
        <p className="text-sm font-medium">No USD accounts on this connection</p>
        <p className="mt-1 text-xs text-[var(--muted)] max-w-sm mx-auto">
          Only USD-denominated brokerage accounts can be charted. Try connecting a different
          institution.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* The heading lives on the enclosing card in BrokerageWorkspace — this is just the grid. */}
      <p className="text-xs text-[var(--muted)] mb-4 leading-relaxed">
        Every position gets scored against Graham&apos;s criteria and charted against the
        25–75% balance band.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        {accounts.map((acct, i) => (
          <button
            key={acct.id}
            type="button"
            onClick={() => onSelect(acct.id)}
            className="text-left rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--accent)] transition fade-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <p className="text-[10px] font-semibold tracking-widest uppercase text-[var(--muted)]">
              {acct.institution_name ?? "Brokerage"}
            </p>
            <p className="mt-1 text-base font-semibold truncate leading-tight">{acct.name}</p>
            {acct.number && (
              <p className="text-[11px] text-[var(--muted)] font-mono tabular mt-1 truncate">
                ···{acct.number.slice(-4)}
              </p>
            )}
            {typeof acct.balance === "number" && (
              <p className="mt-4 text-xl font-semibold tabular tracking-tight">
                ${acct.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            )}
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)]">
              Analyze
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="space-y-3 pulse-data">
            <div className="h-3 w-20 bg-[var(--border)] rounded" />
            <div className="h-5 w-40 bg-[var(--border)] rounded" />
            <div className="h-3 w-32 bg-[var(--border)] rounded" />
            <div className="h-2 w-full bg-[var(--border)] rounded mt-6" />
          </div>
        </div>
      ))}
    </div>
  );
}
