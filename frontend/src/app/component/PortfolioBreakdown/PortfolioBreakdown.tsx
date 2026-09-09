"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PieView from "./PieView";
import BondDetailCard from "./BondDetailCard";
import { usePortfolioBonds } from "./PortfolioProvider";
import { bondsToByGrade, findBond, frameLabel, slicesFor, titleFor, unitFor } from "./derive";
import type { AccountOption, Breakdown, Frame } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

interface Props {
  isDefensive: boolean;
  hasSnapTradeUser: boolean;
}

// Everything the backend contributes: the stocks half, plus the bond ETFs that
// belong to the bonds half but can only come from the brokerage account.
type StockHalf = Pick<Breakdown, "stocks_total" | "equities" | "etfs" | "bond_etfs">;

export default function PortfolioBreakdown({ isDefensive, hasSnapTradeUser }: Props) {
  const { bonds } = usePortfolioBonds();

  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const [stockHalf, setStockHalf] = useState<StockHalf | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stack, setStack] = useState<Frame[]>([{ level: "L0" }]);
  const current = stack[stack.length - 1];
  const push = useCallback((f: Frame) => setStack((s) => [...s, f]), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const jumpTo = useCallback((index: number) => setStack((s) => s.slice(0, index + 1)), []);
  const reset = useCallback(() => setStack([{ level: "L0" }]), []);

  // 1. Load the account list once (only when SnapTrade is connected).
  useEffect(() => {
    if (!hasSnapTradeUser) {
      setAccountsLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/snapTrade/list_accounts`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`list_accounts ${res.status}`);
        const data = (await res.json()) as { accounts?: AccountOption[] };
        if (cancelled) return;
        const accs = (data.accounts ?? []).filter((a) => a.id);
        setAccounts(accs);
        setSelectedAccountId(accs[0]?.id ?? null);
      } catch {
        if (!cancelled) setAccounts([]);
      } finally {
        if (!cancelled) setAccountsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasSnapTradeUser]);

  // 2. (Re)fetch the stocks half whenever the selected account changes.
  useEffect(() => {
    if (!selectedAccountId) {
      setStockHalf(null);
      return;
    }
    let cancelled = false;
    setLoadingBreakdown(true);
    setError(null);
    (async () => {
      try {
        const url = `${API_BASE}/api/portfolio/breakdown?is_defensive=${isDefensive}&account_id=${encodeURIComponent(
          selectedAccountId,
        )}`;
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`breakdown ${res.status}`);
        const data = (await res.json()) as Breakdown;
        if (cancelled) return;
        setStockHalf({
          stocks_total: data.stocks_total,
          equities: data.equities ?? [],
          etfs: data.etfs ?? [],
          bond_etfs: data.bond_etfs ?? [],
        });
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setStockHalf(null);
        }
      } finally {
        if (!cancelled) setLoadingBreakdown(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId, isDefensive]);

  // Switching accounts should drop any stale drill path on the stocks side.
  useEffect(() => {
    reset();
  }, [selectedAccountId, reset]);

  // Bonds half is derived from the shared BondList state (reactive to edits),
  // then joined by any brokerage-held bond ETFs from the backend.
  const { byGrade, total: bondsTotal } = useMemo(() => bondsToByGrade(bonds), [bonds]);

  const breakdown: Breakdown = useMemo(() => {
    const bondEtfs = stockHalf?.bond_etfs ?? [];
    const bondEtfTotal = bondEtfs.reduce((a, e) => a + e.market_value, 0);
    return {
      stocks_total: stockHalf?.stocks_total ?? 0,
      bonds_total: bondsTotal + bondEtfTotal,
      equities: stockHalf?.equities ?? [],
      etfs: stockHalf?.etfs ?? [],
      bond_etfs: bondEtfs,
      bonds_by_grade: byGrade,
    };
  }, [stockHalf, bondsTotal, byGrade]);

  const slices = useMemo(() => slicesFor(current, breakdown, push), [current, breakdown, push]);

  // Whole-card empty state: nothing connected and nothing entered.
  const nothingToShow = accountsLoaded && !hasSnapTradeUser && bonds.length === 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-1 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
            Allocation
          </p>
          <h2 className="mt-1 text-base font-semibold">Where your money sits — stocks vs bonds</h2>
        </div>
        <span className="text-xs text-[var(--muted)] tabular">
          {breakdown.stocks_total > 0 || breakdown.bonds_total > 0
            ? `$${(breakdown.stocks_total + breakdown.bonds_total).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })} charted`
            : "—"}
        </span>
      </div>
      <p className="text-xs text-[var(--muted)] mt-1 mb-4 leading-relaxed">
        Click a slice (or a legend row) to drill in. Bond allocation uses price × quantity,
        not a live mark.
      </p>

      {nothingToShow ? (
        <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-6 text-center">
          <p className="text-sm font-medium">Nothing to break down yet</p>
          <p className="mt-1 text-xs text-[var(--muted)] max-w-sm mx-auto">
            Connect SnapTrade or add a bond to see your portfolio breakdown.
          </p>
        </div>
      ) : (
        <>
          {/* Account picker */}
          {hasSnapTradeUser && accounts.length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <label className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
                Account
              </label>
              <select
                value={selectedAccountId ?? ""}
                onChange={(e) => setSelectedAccountId(e.target.value || null)}
                className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] outline-none focus:border-[var(--accent)] transition"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.brokerage_name ? ` · ${a.brokerage_name}` : ""}
                  </option>
                ))}
              </select>
              {loadingBreakdown && (
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
                    <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Loading positions…
                </span>
              )}
            </div>
          )}

          {hasSnapTradeUser && accountsLoaded && accounts.length === 0 && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 mb-4 text-xs text-[var(--muted)]">
              No USD brokerage accounts found — showing the bond side only.
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-[var(--warn)]/30 bg-[var(--warn-soft)] px-3 py-2 mb-4 text-xs text-[var(--warn)]">
              Couldn&apos;t load brokerage positions ({error}). The bond side is still shown.
            </div>
          )}

          {/* Breadcrumb + back */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <button
              type="button"
              onClick={back}
              disabled={stack.length <= 1}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:bg-black/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </button>
            <nav className="flex items-center gap-1 text-xs min-w-0 flex-wrap">
              {stack.map((frame, i) => {
                const isLast = i === stack.length - 1;
                return (
                  <span key={`${frame.level}-${i}`} className="flex items-center gap-1 min-w-0">
                    {i > 0 && <span className="text-[var(--muted)]">›</span>}
                    <button
                      type="button"
                      onClick={() => jumpTo(i)}
                      disabled={isLast}
                      className={`truncate ${
                        isLast
                          ? "font-semibold text-[var(--foreground)] cursor-default"
                          : "text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      {frameLabel(frame)}
                    </button>
                  </span>
                );
              })}
            </nav>
          </div>

          <p className="text-sm font-semibold mb-3">{titleFor(current)}</p>

          {/* Body */}
          {current.level === "L3B" ? (
            (() => {
              const bond = findBond(breakdown, current.lotKey);
              return bond ? (
                <BondDetailCard bond={bond} />
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-8 text-center text-sm text-[var(--muted)]">
                  Bond {current.cusip} is no longer in your list.
                </div>
              );
            })()
          ) : current.level === "L3T" && slices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-8 text-center text-sm text-[var(--muted)]">
              Sector breakdown not available for {current.etfSymbol}.
            </div>
          ) : current.level === "L3BE" && slices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-8 text-center text-sm text-[var(--muted)]">
              Credit quality not available for {current.etfSymbol}.
            </div>
          ) : (
            <PieView slices={slices} unit={unitFor(current)} />
          )}
        </>
      )}
    </div>
  );
}
