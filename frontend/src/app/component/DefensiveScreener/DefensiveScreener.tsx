"use client";

import { useCallback, useState } from "react";
import StockSearchBar from "@/app/component/Stock Search Bar/StockSearchBar";
import ConnectionURL from "@/app/component/ConnectionURL/connectionURL";
import BondList, { type BondEntry } from "@/app/component/BondList/BondList";

const DEFENSIVE_CRITERIA = [
  { code: "1", name: "Adequate size", threshold: "≥ $2B market cap", backendKey: "adequate_size" },
  { code: "2", name: "Strong financial condition", threshold: "Current ratio ≥ 2.0", backendKey: "current_ratio" },
  { code: "3", name: "Earnings stability", threshold: "Positive earnings 10 yrs", backendKey: "no_earnings_deficits" },
  { code: "4", name: "Dividend record", threshold: "Uninterrupted 20 yrs", backendKey: "shareholder_returns" },
  { code: "5", name: "Earnings growth", threshold: "≥ 33% over the decade", backendKey: "earnings_growth_10yr" },
  { code: "6", name: "Moderate P/E", threshold: "≤ 15× last 3yr avg", backendKey: "price_to_fcf" },
  { code: "7", name: "Moderate P/B", threshold: "P/E × P/B ≤ 22.5", backendKey: "valuation_combined" },
];

type CriteriaDetail = { pass?: boolean } & Record<string, unknown>;
type CriteriaDetails = Record<string, CriteriaDetail>;
type ScreenResponse = {
  symbol: string;
  is_leading: boolean;
  criteria_details?: CriteriaDetails;
};
type ScreenResult = ScreenResponse & { checkedAt: Date };

interface Props {
  initialBonds: BondEntry[];
  hasSnapTradeUser: boolean;
}

export default function DefensiveScreener({ initialBonds, hasSnapTradeUser }: Props) {
  const [result, setResult] = useState<ScreenResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScreen = useCallback(async (symbol: string) => {
    const trimmed = symbol.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
      const res = await fetch(
        `${apiBase}/api/snapTrade/isLeadingStock?symbol=${encodeURIComponent(trimmed)}&allCriteria=true`,
        { credentials: "include" },
      );
      if (!res.ok) {
        setError(`Screen failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as ScreenResponse;
      setResult({ ...data, checkedAt: new Date() });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const stateFor = (backendKey: string): "pass" | "fail" | "unknown" => {
    const detail = result?.criteria_details?.[backendKey];
    if (!detail) return "unknown";
    return detail.pass ? "pass" : "fail";
  };

  return (
    <div className="mt-8 grid lg:grid-cols-[280px_1fr] gap-8">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase px-1 pb-2">
          Criteria
        </p>
        <ul className="space-y-0.5">
          {DEFENSIVE_CRITERIA.map((c) => {
            const state = stateFor(c.backendKey);
            const itemClass =
              state === "pass"
                ? "bg-[var(--pass-soft)]"
                : state === "fail"
                  ? "bg-[var(--fail-soft)]"
                  : "hover:bg-black/[0.04]";
            const badgeClass =
              state === "pass"
                ? "border-[var(--pass)] bg-[var(--pass-soft)] text-[var(--pass)]"
                : state === "fail"
                  ? "border-[var(--fail)] bg-[var(--fail-soft)] text-[var(--fail)]"
                  : "border-[var(--border)] text-[var(--muted)]";
            const nameClass =
              state === "pass"
                ? "text-[var(--pass)]"
                : state === "fail"
                  ? "text-[var(--fail)]"
                  : "";
            return (
              <li
                key={c.code}
                className={`flex items-start gap-3 p-3 rounded-lg transition ${itemClass}`}
              >
                <span
                  className={`grid place-items-center w-6 h-6 rounded-md border text-[10px] font-mono font-semibold tabular shrink-0 ${badgeClass}`}
                >
                  {c.code}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium leading-tight ${nameClass}`}>{c.name}</p>
                  <p className="text-xs text-[var(--muted)] mt-1 tabular leading-tight">{c.threshold}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 px-1 text-[10px] tabular text-[var(--muted)]">
          {result
            ? `Last screened ${result.symbol} at ${result.checkedAt.toLocaleTimeString()}`
            : "No stock screened yet."}
        </p>
        <div className="mt-4 mx-1 rounded-lg bg-[var(--surface-muted)] border border-[var(--border)] p-3">
          <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">Tip</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            A stock that passes 6/7 still fails the screen. Graham&apos;s framework rewards <em>all</em> conditions, not <em>most</em>.
          </p>
        </div>
      </aside>

      <section className="space-y-6 min-w-0">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <div>
              <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
                Screen a stock
              </p>
              <h2 className="mt-1 text-base font-semibold">Test any U.S. ticker against the 7 criteria</h2>
            </div>
            <kbd className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--border)] text-[11px] font-mono text-[var(--muted)]">
              ⌘K to focus
            </kbd>
          </div>
          <StockSearchBar onSubmit={handleScreen} submitting={loading} />
          {error && <p className="mt-3 text-xs text-[var(--fail)]">{error}</p>}
          {result && (
            <p className="mt-3 text-xs tabular text-[var(--muted)]">
              {result.symbol}:{" "}
              <span className={result.is_leading ? "text-[var(--pass)] font-semibold" : "text-[var(--fail)] font-semibold"}>
                {result.is_leading ? "Passes all 7" : "Fails the screen"}
              </span>
            </p>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div>
              <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
                Brokerage
              </p>
              <h2 className="mt-1 text-base font-semibold">Score your real positions</h2>
              <p className="text-xs text-[var(--muted)] mt-1">
                Connect via SnapTrade. We never see your credentials and no trades are executed.
              </p>
            </div>
          </div>
          <ConnectionURL prevPageURL="defensive" hasSnapTradeUser={hasSnapTradeUser} />
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <BondList initialBonds={initialBonds} isDefensive={true} />
        </div>
      </section>
    </div>
  );
}
