"use client";

import { useState } from "react";

interface Props {
  // Upper bound for the withdrawal amount -- the account's live USD balance, already
  // fetched today via getAllAccountsFromConnection (no extra request needed).
  accountBalance: number;
  loading: boolean;
  error: string | null;
  onSubmit: (input: {
    withdrawalAmount: number;
    totalContributions: number;
    meetsFiveYearRule: boolean;
  }) => void;
}

function formatDollars(amount: number): string {
  return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// Unlike SellPanel (one instance per selected row, fraction owned by the parent so it
// can be shared across the dollar/shares derivation), this panel is a single account-
// level instance -- its inputs are self-contained local state, only handed up to the
// parent at submit time.
export default function RothWithdrawalPanel({ accountBalance, loading, error, onSubmit }: Props) {
  const [withdrawalDraft, setWithdrawalDraft] = useState("");
  const [contributionsDraft, setContributionsDraft] = useState("");
  const [meetsFiveYearRule, setMeetsFiveYearRule] = useState<boolean | null>(null);

  const withdrawalAmount = Number(withdrawalDraft) || 0;
  const totalContributions = Number(contributionsDraft) || 0;

  const applyWithdrawal = (raw: string) => {
    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return; // non-negative decimal only
    if (raw === "") {
      setWithdrawalDraft("");
      return;
    }
    const clamped = Math.min(Math.max(Number(raw), 0), accountBalance);
    setWithdrawalDraft(String(clamped));
  };

  const applyContributions = (raw: string) => {
    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return; // non-negative decimal only
    // Deliberately no upper clamp here: contributions can exceed the current balance
    // when the account is at a loss (the backend's own math handles that case).
    setContributionsDraft(raw);
  };

  const canSubmit =
    withdrawalAmount > 0 &&
    withdrawalAmount <= accountBalance &&
    totalContributions >= 0 &&
    meetsFiveYearRule !== null &&
    !loading;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4 flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)]">
          Withdrawal amount <span className="normal-case tracking-normal">(max ${formatDollars(accountBalance)})</span>
        </span>
        <div className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[color-mix(in_oklch,var(--accent)_15%,transparent)] transition">
          <span className="text-sm text-[var(--muted)]">$</span>
          <input
            inputMode="decimal"
            value={withdrawalDraft}
            onChange={(e) => applyWithdrawal(e.target.value)}
            placeholder="0"
            className="w-full bg-transparent outline-none text-sm tabular"
          />
        </div>
        <input
          type="range"
          min={0}
          max={accountBalance}
          step={Math.max(1, Math.round(accountBalance / 1000))}
          value={withdrawalAmount}
          onChange={(e) => setWithdrawalDraft(e.target.value)}
          aria-label="Withdrawal amount"
          aria-valuetext={`$${formatDollars(withdrawalAmount)}`}
          className="range-band"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)]">
          Total contributions <span className="normal-case tracking-normal">(lifetime, already-taxed basis)</span>
        </span>
        <div className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[color-mix(in_oklch,var(--accent)_15%,transparent)] transition">
          <span className="text-sm text-[var(--muted)]">$</span>
          <input
            inputMode="decimal"
            value={contributionsDraft}
            onChange={(e) => applyContributions(e.target.value)}
            placeholder="0"
            className="w-full bg-transparent outline-none text-sm tabular"
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)]">
          Have you held this account for 5 years or more?
        </legend>
        <div className="flex gap-2">
          {[
            { v: true, text: "Yes" },
            { v: false, text: "No" },
          ].map(({ v, text }) => (
            <label
              key={text}
              className="cursor-pointer rounded-lg border border-[var(--border)] px-4 py-2 text-sm transition hover:border-[var(--accent)] has-checked:border-[var(--accent)] has-checked:bg-[var(--accent-soft)] has-checked:text-[var(--accent-strong)] has-focus-visible:ring-2 has-focus-visible:ring-[color-mix(in_oklch,var(--accent)_25%,transparent)]"
            >
              <input
                type="radio"
                name="meetsFiveYearRule"
                className="sr-only"
                checked={meetsFiveYearRule === v}
                onChange={() => setMeetsFiveYearRule(v)}
              />
              {text}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-end gap-3">
        {error && <p className="text-xs text-[var(--fail)]">{error}</p>}
        <button
          type="button"
          onClick={() =>
            canSubmit &&
            onSubmit({ withdrawalAmount, totalContributions, meetsFiveYearRule: meetsFiveYearRule! })
          }
          disabled={!canSubmit}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? "Estimating…" : "Estimate"}
        </button>
      </div>
    </div>
  );
}
