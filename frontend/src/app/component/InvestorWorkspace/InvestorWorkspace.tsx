"use client";

import { useCallback, useState } from "react";
import StockSearchBar from "@/app/component/Stock Search Bar/StockSearchBar";
import BondList, { type BondEntry } from "@/app/component/BondList/BondList";
import { PortfolioProvider } from "@/app/component/PortfolioBreakdown/PortfolioProvider";
import BrokerageWorkspace from "@/app/component/BrokerageWorkspace/BrokerageWorkspace";
import { useBrokerageState } from "@/app/component/BrokerageWorkspace/useBrokerageState";

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
  isDefensive: boolean;
}

/**
 * The single body shared by the defensive and enterprising pages.
 *
 * Everything is gated on the broker stage: until a connection exists *and* an account is
 * picked, the connect/pick step is the only thing on the page. The stock screener and the
 * bond list appear only once there is a portfolio to read them against.
 *
 * PortfolioProvider must wrap both children: BondList edits the bond state that the pie's
 * bonds half and the bonds-scoped security list are derived from.
 */
export default function InvestorWorkspace({ initialBonds, hasSnapTradeUser, isDefensive }: Props) {
  const broker = useBrokerageState(hasSnapTradeUser);
  const analyzing = broker.stage === "analyzing";

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

  return (
    <div className="mt-8">
      <PortfolioProvider initialBonds={initialBonds}>
        <div className="space-y-6 min-w-0">
          {analyzing && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                <div>
                  <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
                    Screen a stock
                  </p>
                  <h2 className="mt-1 text-base font-semibold">
                    Test any U.S. ticker against the 7 criteria
                  </h2>
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
                  <span
                    className={
                      result.is_leading
                        ? "text-[var(--pass)] font-semibold"
                        : "text-[var(--fail)] font-semibold"
                    }
                  >
                    {result.is_leading ? "Passes all 7" : "Fails the screen"}
                  </span>{" "}
                  · checked {result.checkedAt.toLocaleTimeString()}
                </p>
              )}
            </div>
          )}

          <BrokerageWorkspace broker={broker} isDefensive={isDefensive} />

          {analyzing && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <BondList isDefensive={isDefensive} />
            </div>
          )}
        </div>
      </PortfolioProvider>
    </div>
  );
}
