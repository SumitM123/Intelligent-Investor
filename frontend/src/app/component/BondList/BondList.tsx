"use client";

import { useState, type ReactNode } from "react";

export interface BondEntry {
  cusip: string;
  grade?: string;
  is_high_grade?: boolean;
  ytm?: number | null;
  spread_bps?: number | null;
  bond_type?: string;
  // Annual coupon rate as a PERCENT (e.g. 5.25 = 5.25%). User-provided; the backend
  // converts it to a decimal to build the annual coupon for the YTM calculation.
  coupon_rate?: number | null;
  // Maturity date (ISO "YYYY-MM-DD"), in the future. User-provided; drives maturity_years.
  maturity_date?: string | null;
  // Current market price, quoted per 100 of par (e.g. 98.50 = $985 on a $1,000 bond).
  // User-provided; feeds the YTM calculation on the backend.
  price?: number | null;
  // Number of bonds held (each $1,000 face). Scales dollars invested, not the grade.
  quantity?: number | null;
  // Purchase date (ISO "YYYY-MM-DD"). Captured for the dollars-invested record and a
  // future "at purchase" grade. User-provided.
  purchase_date?: string | null;
}

interface BondListProps {
  initialBonds: BondEntry[];
  isDefensive: boolean;
}

const CUSIP_REGEX = /^[A-Z0-9]{9}$/;

// The empty add-form state, reused on mount and after each successful add.
const EMPTY_DRAFT = { cusip: "", coupon: "", maturity: "", price: "", quantity: "", purchaseDate: "" };

// Two entries are the "same lot" when every identifying field matches except
// quantity — that combination is what the backend also uses to decide whether
// a classification can be reused (see backend/routes/bonds.py::syncBonds).
function isSameLot(a: BondEntry, b: BondEntry): boolean {
  return (
    a.cusip === b.cusip &&
    a.coupon_rate === b.coupon_rate &&
    a.maturity_date === b.maturity_date &&
    a.price === b.price &&
    a.purchase_date === b.purchase_date
  );
}

function lotKey(b: BondEntry): string {
  return `${b.cusip}|${b.coupon_rate}|${b.maturity_date}|${b.price}|${b.purchase_date}`;
}

function gradeTone(grade?: string): { bg: string; text: string; label: string } {
  if (!grade) return { bg: "var(--surface-muted)", text: "var(--muted)", label: "—" };
  const g = grade.toUpperCase();
  if (g.startsWith("AAA") || g.startsWith("AA")) return { bg: "var(--pass-soft)", text: "var(--pass)", label: g };
  if (g.startsWith("A")) return { bg: "var(--accent-soft)", text: "var(--accent-strong)", label: g };
  if (g.startsWith("BBB")) return { bg: "var(--warn-soft)", text: "var(--warn)", label: g };
  return { bg: "var(--fail-soft)", text: "var(--fail)", label: g };
}

// Shared visual shell for a labelled add-form field, so the inputs stay consistent.
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)]">
        {label}
        {hint && <span className="ml-1 normal-case tracking-normal">{hint}</span>}
      </span>
      <div className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[color-mix(in_oklch,var(--accent)_15%,transparent)] transition">
        {children}
      </div>
    </div>
  );
}

export default function BondList({ initialBonds, isDefensive }: BondListProps) {
  const [bonds, setBonds] = useState<BondEntry[]>(initialBonds ?? []);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Today in ISO form: purchase date can't be in the future; maturity must be after it.
  const today = new Date().toISOString().slice(0, 10);

  // --- Field updates (with light input filtering on the numeric fields) ---
  const setCusip = (v: string) => setDraft((d) => ({ ...d, cusip: v.toUpperCase() }));
  const setCoupon = (v: string) => {
    if (v !== "" && !/^\d*\.?\d*$/.test(v)) return; // non-negative decimal percent
    setDraft((d) => ({ ...d, coupon: v }));
  };
  const setMaturity = (v: string) => setDraft((d) => ({ ...d, maturity: v }));
  const setPrice = (v: string) => {
    if (v !== "" && !/^\d*\.?\d*$/.test(v)) return; // non-negative decimal only
    setDraft((d) => ({ ...d, price: v }));
  };
  const setQuantity = (v: string) => {
    if (v !== "" && !/^\d*$/.test(v)) return; // whole non-negative count only
    setDraft((d) => ({ ...d, quantity: v }));
  };
  const setPurchaseDate = (v: string) => setDraft((d) => ({ ...d, purchaseDate: v }));

  // --- Validation: all six fields required for a complete holding ---
  const cusipValid = CUSIP_REGEX.test(draft.cusip);
  const couponValid = draft.coupon !== "" && Number(draft.coupon) > 0;
  const maturityValid = draft.maturity !== "" && draft.maturity > today; // must mature in the future
  const priceValid = draft.price !== "" && Number(draft.price) > 0;
  const quantityValid = draft.quantity !== "" && Number(draft.quantity) >= 1;
  const dateValid = draft.purchaseDate !== "" && draft.purchaseDate <= today;
  const formValid =
    cusipValid && couponValid && maturityValid && priceValid && quantityValid && dateValid;

  const syncToBackend = async (entries: BondEntry[]): Promise<BondEntry[]> => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
    const payload = {
      bonds: entries.map((b) => ({
        cusip: b.cusip,
        coupon_rate: b.coupon_rate ?? null,
        maturity_date: b.maturity_date ?? null,
        price: b.price ?? null,
        quantity: b.quantity ?? null,
        purchase_date: b.purchase_date ?? null,
      })),
      is_defensive: isDefensive,
    };
    // [BOND] pipeline trace — what we send to the backend.
    console.log("[BOND] → POST /api/bonds payload:", JSON.stringify(payload));
    const res = await fetch(`${apiBase}/api/bonds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    console.log("[BOND] ← /api/bonds status:", res.status);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[BOND] sync failed:", res.status, text);
      throw new Error(`Sync failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { bonds?: BondEntry[] };
    // [BOND] pipeline trace — the enriched bonds (grade / ytm / spread) coming back.
    console.log("[BOND] ← response bonds:", JSON.stringify(data.bonds, null, 2));
    return data.bonds ?? [];
  };

  const handleAdd = async () => {
    const cusip = draft.cusip.trim().toUpperCase();
    if (!CUSIP_REGEX.test(cusip)) {
      setError("CUSIP must be exactly 9 alphanumeric characters.");
      return;
    }
    if (!couponValid || !maturityValid || !priceValid || !quantityValid || !dateValid) {
      setError("Enter coupon %, a future maturity date, price, quantity, and a purchase date (not in the future).");
      return;
    }

    const newBond: BondEntry = {
      cusip,
      coupon_rate: Number(draft.coupon),
      maturity_date: draft.maturity,
      price: Number(draft.price),
      quantity: Number(draft.quantity),
      purchase_date: draft.purchaseDate,
    };
    // [BOND] pipeline trace — the holding the user just submitted.
    console.log("[BOND] handleAdd newBond:", JSON.stringify(newBond));

    setError(null);
    setLoading(true);
    const previousBonds = bonds;

    // Same CUSIP + coupon + maturity + price + purchase date as an existing
    // holding -> the same lot, so merge by summing quantity instead of adding
    // a new row. Any of those fields differing (e.g. bought more later at a
    // different price) -> a distinct lot, kept as its own row.
    const matchIndex = previousBonds.findIndex((b) => isSameLot(b, newBond));
    const nextBonds =
      matchIndex === -1
        ? [...previousBonds, newBond]
        : previousBonds.map((b, i) =>
            i === matchIndex ? { ...b, quantity: (b.quantity ?? 0) + (newBond.quantity ?? 0) } : b
          );

    setBonds(nextBonds); // optimistic
    setDraft(EMPTY_DRAFT);
    try {
      const updated = await syncToBackend(nextBonds);
      setBonds(updated);
    } catch (e) {
      setBonds(previousBonds);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (bond: BondEntry) => {
    setError(null);
    setLoading(true);
    const previousBonds = bonds;
    const remaining = previousBonds.filter((b) => !isSameLot(b, bond));
    setBonds(remaining);
    try {
      const updated = await syncToBackend(remaining);
      setBonds(updated);
    } catch (e) {
      setBonds(previousBonds);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && formValid && !loading) {
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
        Enter the CUSIP, coupon %, maturity date, the price you paid (per 100 of par), quantity, and
        purchase date. We&apos;ll grade the bond and compute yield-to-maturity and spread when you add it.
        Adding the same CUSIP again with identical terms just increases the quantity; changing the price,
        coupon, maturity, or purchase date instead tracks it as a separate lot.
      </p>

      {/* Add form: all six inputs entered together, submitted as one bond */}
      <div className="mb-3">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          <Field label="CUSIP">
            <input
              type="text"
              value={draft.cusip}
              onChange={(e) => setCusip(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="912828YH7"
              disabled={loading}
              maxLength={9}
              className="flex-1 min-w-0 bg-transparent outline-none font-mono tabular text-sm placeholder:text-[var(--muted)]"
              aria-label="CUSIP"
            />
            {draft.cusip && (
              <span
                className={`text-[10px] font-mono tabular shrink-0 ${
                  cusipValid ? "text-[var(--pass)]" : "text-[var(--muted)]"
                }`}
              >
                {draft.cusip.length}/9
              </span>
            )}
          </Field>

          <Field label="Coupon" hint="%">
            <input
              type="text"
              inputMode="decimal"
              value={draft.coupon}
              onChange={(e) => setCoupon(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="5.25"
              disabled={loading}
              className="w-full min-w-0 bg-transparent outline-none font-mono tabular text-sm placeholder:text-[var(--muted)]"
              aria-label="Coupon rate percent"
            />
          </Field>

          <Field label="Maturity date">
            <input
              type="date"
              value={draft.maturity}
              min={today}
              onChange={(e) => setMaturity(e.target.value)}
              disabled={loading}
              className="w-full min-w-0 bg-transparent outline-none font-mono tabular text-xs placeholder:text-[var(--muted)]"
              aria-label="Maturity date"
            />
          </Field>

          <Field label="Price" hint="/ 100">
            <input
              type="text"
              inputMode="decimal"
              value={draft.price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="98.50"
              disabled={loading}
              className="w-full min-w-0 bg-transparent outline-none font-mono tabular text-sm placeholder:text-[var(--muted)]"
              aria-label="Price per 100 of par"
            />
          </Field>

          <Field label="Qty">
            <input
              type="text"
              inputMode="numeric"
              value={draft.quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="10"
              disabled={loading}
              className="w-full min-w-0 bg-transparent outline-none font-mono tabular text-sm placeholder:text-[var(--muted)]"
              aria-label="Quantity"
            />
          </Field>

          <Field label="Purchase date">
            <input
              type="date"
              value={draft.purchaseDate}
              max={today}
              onChange={(e) => setPurchaseDate(e.target.value)}
              disabled={loading}
              className="w-full min-w-0 bg-transparent outline-none font-mono tabular text-xs placeholder:text-[var(--muted)]"
              aria-label="Purchase date"
            />
          </Field>
        </div>

        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={loading || !formValid}
          className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition"
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
            Fill in the six fields above to populate your fixed-income side. Treasuries, munis, and
            investment-grade corporates all work.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--border)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-muted)] text-[10px] font-semibold tracking-widest uppercase text-[var(--muted)]">
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-4 py-2.5">CUSIP</th>
                <th className="text-right px-3 py-2.5">Coupon</th>
                <th className="text-left px-3 py-2.5">Maturity</th>
                <th className="text-right px-3 py-2.5">
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
                  <tr key={lotKey(b)} className="border-b border-[var(--border)] last:border-0 hover:bg-black/[0.02] transition">
                    <td className="px-4 py-3 font-mono tabular font-semibold">{b.cusip}</td>
                    <td className="px-3 py-3 text-right tabular">
                      {b.coupon_rate !== null && b.coupon_rate !== undefined ? `${b.coupon_rate.toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-3 py-3 tabular text-[var(--muted)] text-xs">
                      {b.maturity_date ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular">
                      {b.price !== null && b.price !== undefined ? b.price.toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular">
                      {b.quantity !== null && b.quantity !== undefined ? b.quantity : "—"}
                    </td>
                    <td className="px-3 py-3 tabular text-[var(--muted)] text-xs">
                      {b.purchase_date ?? "—"}
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
                        onClick={() => void handleDelete(b)}
                        disabled={loading}
                        aria-label={`Delete ${b.cusip} lot purchased ${b.purchase_date ?? "unknown date"}`}
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
