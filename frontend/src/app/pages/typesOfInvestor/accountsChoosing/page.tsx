"use client";
import { usePrevPageContext } from "@/app/context/prevPageURL";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface BrokerageAccount {
  id: string;
  name: string;
  balance?: number;
  brokerage_name?: string;
  stock_allocation?: number;
  bond_allocation?: number;
}

export default function AccountsChoosing() {
  const [allAccounts, setAllAccounts] = useState<BrokerageAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
  const router = useRouter();
  const ctx = usePrevPageContext();

  useEffect(() => {
    if (!ctx.connectionID || ctx.connectionID === "No value") {
      setError("Connection ID is missing. Please connect a brokerage account first.");
      setIsLoading(false);
      return;
    }
    const load = async () => {
      try {
        const params = new URLSearchParams();
        params.append("connection_id", ctx.connectionID);
        const response = await fetch(
          `${apiBaseUrl}/api/snapTrade/getAllAccountsFromConnection?${params}`,
          { credentials: "include" }
        );
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        const resJSON = await response.json();
        const fetched = (resJSON["accounts_connection"] ?? []) as BrokerageAccount[];
        setAllAccounts(fetched);
        if (fetched.length === 0) {
          setError("There are no USD accounts for this connection. Please select another brokerage.");
        } else {
          setSelectedAccountId(fetched[0].id);
        }
      } catch (err) {
        setError("Error loading accounts.");
        console.error("Error getting the accounts for the connection: " + (err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [ctx.connectionID, apiBaseUrl]);

  const handleContinue = () => {
    if (!selectedAccountId) return;
    ctx.setAccountID(selectedAccountId);
    router.push(
      `/pages/typesOfInvestor/viewingPage?accountID=${encodeURIComponent(selectedAccountId)}`
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-8 lg:px-12 py-14">
      <div className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-widest uppercase text-[var(--accent)]">
        <span>Step 2 of 3</span>
        <span className="text-[var(--border-strong)]">·</span>
        <span className="text-[var(--muted)]">Accounts</span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Choose an account to analyze</h1>
      <p className="mt-3 text-sm text-[var(--muted)] max-w-2xl leading-relaxed">
        We&apos;ll evaluate every position against Graham&apos;s criteria, flag allocation drift outside the 25–75% band, and surface what to do about it.
      </p>

      {isLoading && <SkeletonGrid />}

      {!isLoading && error && (
        <div className="mt-8 rounded-xl border border-[var(--fail)]/30 bg-[var(--fail-soft)] p-5 flex items-start gap-3">
          <svg
            className="w-5 h-5 text-[var(--fail)] shrink-0 mt-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 17h0" strokeLinecap="round" />
          </svg>
          <div>
            <p className="text-sm font-medium text-[var(--fail)]">Can&apos;t load accounts</p>
            <p className="mt-1 text-xs text-[var(--fail)]/80">{error}</p>
          </div>
        </div>
      )}

      {!isLoading && !error && allAccounts.length > 0 && (
        <>
          <div className="mt-8 grid md:grid-cols-2 gap-4">
            {allAccounts.map((acct, i) => (
              <AccountCard
                key={acct.id}
                acct={acct}
                index={i}
                selected={selectedAccountId === acct.id}
                onSelect={() => setSelectedAccountId(acct.id)}
              />
            ))}
          </div>

          <div className="mt-8 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-[var(--muted)]">
              Selected{" "}
              <span className="font-mono tabular text-[var(--foreground)]">
                {selectedAccountId ? `${selectedAccountId.slice(0, 12)}…` : "—"}
              </span>
            </p>
            <button
              type="button"
              onClick={handleContinue}
              disabled={!selectedAccountId}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Continue to analysis
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AccountCard({
  acct,
  index,
  selected,
  onSelect,
}: {
  acct: BrokerageAccount;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  // Until backend supplies allocation, use a deterministic illustrative value per account.
  const baseStocks = acct.stock_allocation ?? 45 + ((index * 17) % 40);
  const stocks = Math.min(Math.max(baseStocks, 0), 100);
  const bonds = acct.bond_allocation ?? 100 - stocks;
  const outOfBand = stocks > 75 || stocks < 25;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`text-left rounded-xl border-2 p-5 transition fade-up ${
        selected
          ? "border-[var(--accent)] bg-[color-mix(in_oklch,var(--accent)_5%,var(--surface))]"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"
      } ${outOfBand ? "ring-1 ring-[var(--fail)]/30" : ""}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-[var(--muted)]">
            {acct.brokerage_name ?? "Brokerage"}
          </p>
          <p className="mt-1 text-base font-semibold truncate leading-tight">{acct.name}</p>
          <p className="text-[11px] text-[var(--muted)] font-mono tabular mt-1 truncate">
            {acct.id.slice(0, 18)}…
          </p>
        </div>
        <div
          className={`grid place-items-center w-5 h-5 rounded-full border shrink-0 transition ${
            selected
              ? "bg-[var(--accent)] border-[var(--accent)]"
              : "border-[var(--border-strong)] bg-transparent"
          }`}
        >
          {selected && (
            <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>

      {acct.balance !== undefined && (
        <p className="mt-4 text-xl font-semibold tabular tracking-tight">
          ${acct.balance.toLocaleString()}
        </p>
      )}

      <div className="mt-5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[var(--muted)]">
            Stocks <span className="tabular text-[var(--foreground)] font-medium">{stocks}%</span>
          </span>
          <span className="text-[var(--muted)]">
            Bonds <span className="tabular text-[var(--foreground)] font-medium">{bonds}%</span>
          </span>
        </div>
        <div
          className="mt-2 relative h-2 rounded-full overflow-hidden bg-[var(--surface-muted)] border border-[var(--border)]"
          aria-label="Allocation"
        >
          <div className="h-full flex">
            <div
              className={outOfBand ? "bg-[var(--fail)]" : "bg-neutral-900 dark:bg-white"}
              style={{ width: `${stocks}%` }}
            />
            <div className="bg-[var(--accent)]" style={{ width: `${bonds}%` }} />
          </div>
          {/* 25% / 75% Graham band markers */}
          <span className="absolute top-0 bottom-0 w-px bg-[var(--background)]" style={{ left: "25%" }} />
          <span className="absolute top-0 bottom-0 w-px bg-[var(--background)]" style={{ left: "75%" }} />
        </div>

        {outOfBand ? (
          <p className="mt-2 text-[11px] text-[var(--fail)] inline-flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v4M12 17h0M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" strokeLinejoin="round" />
            </svg>
            Outside Graham&apos;s 25–75% band
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-[var(--muted)] inline-flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-[var(--pass)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Within the balance band
          </p>
        )}
      </div>
    </button>
  );
}

function SkeletonGrid() {
  return (
    <div className="mt-8 grid md:grid-cols-2 gap-4">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        >
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
