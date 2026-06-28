"use client";

import { useState } from "react";

export interface BondEntry {
  cusip: string;
  grade?: string;
  is_high_grade?: boolean;
  ytm?: number | null;
  spread_bps?: number | null;
  bond_type?: string;
  // Current market price, quoted per 100 of par (e.g. 98.50 = $985 on a $1,000 bond).
  // User-provided; feeds the YTM calculation on the backend.
  price?: number | null;
  // Number of bonds held (each $1,000 face). Scales dollars invested, not the grade.
  quantity?: number | null;
  // Purchase date (ISO "YYYY-MM-DD"). Selects the historical market context for an
  // "at purchase" grade. User-provided.
  purchase_date?: string | null;
}

interface BondListProps {
  initialBonds: BondEntry[];
  isDefensive: boolean;
}

const CUSIP_REGEX = /^[A-Z0-9]{9}$/;

function gradeTone(grade?: string): { bg: string; text: string; label: string } {
  if (!grade) return { bg: "var(--surface-muted)", text: "var(--muted)", label: "—" };
  const g = grade.toUpperCase();
  if (g.startsWith("AAA") || g.startsWith("AA")) return { bg: "var(--pass-soft)", text: "var(--pass)", label: g };
  if (g.startsWith("A")) return { bg: "var(--accent-soft)", text: "var(--accent-strong)", label: g };
  if (g.startsWith("BBB")) return { bg: "var(--warn-soft)", text: "var(--warn)", label: g };
  return { bg: "var(--fail-soft)", text: "var(--fail)", label: g };
}

export default function BondList({ initialBonds, isDefensive }: BondListProps) {
  const [bonds, setBonds] = useState<BondEntry[]>(initialBonds ?? []);
  const [inputCusip, setInputCusip] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-CUSIP draft price (raw input string, so partial entries like "98." are
  // preserved while typing). Seeded from any prices that came back with the bonds.
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const b of initialBonds ?? []) {
      if (b.price !== null && b.price !== undefined) {
        map[b.cusip] = String(b.price);
      }
    }
    return map;
  });

  // Per-CUSIP draft quantity (whole number of bonds) and purchase date (ISO string),
  // seeded the same way as price so saved values round-trip back into the inputs.
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const b of initialBonds ?? []) {
      if (b.quantity !== null && b.quantity !== undefined) {
        map[b.cusip] = String(b.quantity);
      }
    }
    return map;
  });
  const [dateInputs, setDateInputs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const b of initialBonds ?? []) {
      if (b.purchase_date) {
        map[b.cusip] = b.purchase_date;
      }
    }
    return map;
  });

  // Today in ISO form, used to stop the date picker from accepting a future buy date.
  const today = new Date().toISOString().slice(0, 10);

  const handlePriceChange = (cusip: string, value: string) => {
    // Permit only an empty field or a non-negative decimal (no letters/signs).
    if (value !== "" && !/^\d*\.?\d*$/.test(value)) return;
    setPriceInputs((prev) => ({ ...prev, [cusip]: value }));
  };

  const handleQuantityChange = (cusip: string, value: string) => {
    // Whole, non-negative count only (or empty).
    if (value !== "" && !/^\d*$/.test(value)) return;
    setQuantityInputs((prev) => ({ ...prev, [cusip]: value }));
  };

  const handleDateChange = (cusip: string, value: string) => {
    setDateInputs((prev) => ({ ...prev, [cusip]: value }));
  };

  const syncToBackend = async (cusips: string[]): Promise<BondEntry[]> => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
    const res = await fetch(`${apiBase}/api/bonds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ cusips, is_defensive: isDefensive }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Sync failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { bonds?: BondEntry[] };
    return data.bonds ?? [];
  };

  const handleAdd = async () => {
    const cusip = inputCusip.trim().toUpperCase();
    if (!CUSIP_REGEX.test(cusip)) {
      setError("CUSIP must be exactly 9 alphanumeric characters.");
      return;
    }
    if (bonds.some((b) => b.cusip === cusip)) {
      setError(`CUSIP ${cusip} is already in the list.`);
      return;
    }
    setError(null);
    setLoading(true);
    const previousBonds = bonds;
    setBonds([...previousBonds, { cusip }]);
    setInputCusip("");
    try {
      const updated = await syncToBackend([...previousBonds.map((b) => b.cusip), cusip]);
      setBonds(updated);
    } catch (e) {
      setBonds(previousBonds);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (cusip: string) => {
    setError(null);
    setLoading(true);
    const previousBonds = bonds;
    const remaining = previousBonds.filter((b) => b.cusip !== cusip);
    setBonds(remaining);
    try {
      const updated = await syncToBackend(remaining.map((b) => b.cusip));
      setBonds(updated);
    } catch (e) {
      setBonds(previousBonds);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleAdd();
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-1 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
            Bond holdings
          </p>
          <h2 className="mt-1 text-base font-semibold">Track the fixed-income half of your 50/50</h2>
        </div>
        <span className="text-xs text-[var(--muted)] tabular">
          {bonds.length} {bonds.length === 1 ? "bond" : "bonds"}
        </span>
      </div>
      <p className="text-xs text-[var(--muted)] mt-1 mb-5 leading-relaxed">
        Enter a 9-character CUSIP. We&apos;ll fetch grade, yield-to-maturity, and spread on save.
      </p>

      <div className="flex gap-2 mb-3 flex-wrap">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[color-mix(in_oklch,var(--accent)_15%,transparent)] transition">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)] shrink-0">
            CUSIP
          </span>
          <input
            type="text"
            value={inputCusip}
            onChange={(e) => setInputCusip(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="912828YH7"
            disabled={loading}
            maxLength={9}
            className="flex-1 bg-transparent outline-none font-mono tabular text-sm placeholder:text-[var(--muted)]"
            aria-label="CUSIP"
          />
          {inputCusip && (
            <span
              className={`text-[10px] font-mono tabular ${
                CUSIP_REGEX.test(inputCusip) ? "text-[var(--pass)]" : "text-[var(--muted)]"
              }`}
            >
              {inputCusip.length}/9
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={loading || inputCusip.trim().length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
                <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Saving
            </>
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              Add bond
            </>
          )}
        </button>
      </div>

      {error && (
        <div
          className="rounded-lg border border-[var(--fail)]/30 bg-[var(--fail-soft)] px-3 py-2 mb-3 text-xs text-[var(--fail)] inline-flex items-center gap-2"
          role="alert"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 17h0" strokeLinecap="round" />
          </svg>
          {error}
        </div>
      )}

      {bonds.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-6 text-center">
          <p className="text-sm font-medium">No bonds yet</p>
          <p className="mt-1 text-xs text-[var(--muted)] max-w-sm mx-auto">
            Add a CUSIP above to populate your fixed-income side. Treasuries, munis, and investment-grade corporates all work.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--border)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-muted)] text-[10px] font-semibold tracking-widest uppercase text-[var(--muted)]">
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-4 py-2.5">CUSIP</th>
                <th className="text-left px-3 py-2.5">
                  Price <span className="font-normal normal-case tracking-normal text-[var(--muted)]">/ 100</span>
                </th>
                <th className="text-right px-3 py-2.5">Qty</th>
                <th className="text-left px-3 py-2.5">Purchase date</th>
                <th className="text-left px-3 py-2.5">Grade</th>
                <th className="text-left px-3 py-2.5">Type</th>
                <th className="text-right px-3 py-2.5">YTM</th>
                <th className="text-right px-3 py-2.5">Spread</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {bonds.map((b) => {
                const grade = gradeTone(b.grade);
                return (
                  <tr key={b.cusip} className="border-b border-[var(--border)] last:border-0 hover:bg-black/[0.02] transition">
                    <td className="px-4 py-3 font-mono tabular font-semibold">{b.cusip}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 w-[100px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[color-mix(in_oklch,var(--accent)_15%,transparent)] transition">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={priceInputs[b.cusip] ?? ""}
                          onChange={(e) => handlePriceChange(b.cusip, e.target.value)}
                          placeholder="98.50"
                          disabled={loading}
                          className="w-full bg-transparent outline-none font-mono tabular text-sm placeholder:text-[var(--muted)]"
                          aria-label={`Price for ${b.cusip}`}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center w-[72px] ml-auto px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[color-mix(in_oklch,var(--accent)_15%,transparent)] transition">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={quantityInputs[b.cusip] ?? ""}
                          onChange={(e) => handleQuantityChange(b.cusip, e.target.value)}
                          placeholder="10"
                          disabled={loading}
                          className="w-full bg-transparent outline-none font-mono tabular text-sm text-right placeholder:text-[var(--muted)]"
                          aria-label={`Quantity for ${b.cusip}`}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center w-[150px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[color-mix(in_oklch,var(--accent)_15%,transparent)] transition">
                        <input
                          type="date"
                          value={dateInputs[b.cusip] ?? ""}
                          max={today}
                          onChange={(e) => handleDateChange(b.cusip, e.target.value)}
                          disabled={loading}
                          className="w-full bg-transparent outline-none font-mono tabular text-xs placeholder:text-[var(--muted)]"
                          aria-label={`Purchase date for ${b.cusip}`}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold tabular"
                        style={{ background: grade.bg, color: grade.text }}
                      >
                        {grade.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[var(--muted)] text-xs">{b.bond_type ?? "—"}</td>
                    <td className="px-3 py-3 text-right tabular">
                      {b.ytm !== null && b.ytm !== undefined ? `${b.ytm.toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular text-[var(--muted)]">
                      {b.spread_bps !== null && b.spread_bps !== undefined
                        ? `${b.spread_bps} bps`
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void handleDelete(b.cusip)}
                        disabled={loading}
                        aria-label={`Delete ${b.cusip}`}
                        className="inline-flex items-center justify-center w-7 h-7 rounded text-[var(--muted)] hover:bg-[var(--fail-soft)] hover:text-[var(--fail)] disabled:opacity-40 transition"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
