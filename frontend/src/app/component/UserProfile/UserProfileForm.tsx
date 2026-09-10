"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export interface UserProfile {
  monthly_investment: number;
  annual_income: number;
  stock_pct: number;
  bond_pct: number;
  enterprising_pct: number;
  is_married: boolean;
  home_state: string;
  is_employed: boolean;
  has_401k: boolean | null;
  has_401k_match: boolean | null;
  match_rate_pct: number | null;
  match_limit_pct: number | null;
  k401_investment_types: string[];
}

// Must stay in sync with _K401_TYPES in backend/routes/user.py.
const K401_TYPES: { slug: string; label: string }[] = [
  { slug: "index_fund", label: "Index funds" },
  { slug: "target_date", label: "Target-date funds" },
  { slug: "bond_fund", label: "Bond funds" },
  { slug: "tips", label: "TIPS / inflation-protected" },
  { slug: "stable_value", label: "Stable value" },
  { slug: "money_market", label: "Money market" },
  { slug: "mutual_fund", label: "Actively managed mutual funds" },
  { slug: "international", label: "International funds" },
  { slug: "reit", label: "REITs" },
  { slug: "company_stock", label: "Company stock" },
  { slug: "brokerage_window", label: "Self-directed brokerage window" },
];

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL",
  "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE",
  "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD",
  "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

// Graham's 50/50 rule: never below 25% or above 75% on either side.
const MIN_STOCK = 25;
const MAX_STOCK = 75;
const MAX_ENTERPRISING = 10;

const clampStock = (v: number) => Math.min(MAX_STOCK, Math.max(MIN_STOCK, v));

export default function UserProfileForm({ initialProfile }: { initialProfile: UserProfile | null }) {
  const router = useRouter();
  const isEdit = initialProfile !== null;

  // Money fields are held as strings so the input can be empty rather than forced to 0.
  const [monthly, setMonthly] = useState(
    initialProfile ? String(initialProfile.monthly_investment) : ""
  );
  const [income, setIncome] = useState(
    initialProfile ? String(initialProfile.annual_income) : ""
  );
  const [stockPct, setStockPct] = useState(
    initialProfile ? clampStock(initialProfile.stock_pct) : 50
  );
  const [enterprisingPct, setEnterprisingPct] = useState(
    initialProfile ? Math.min(MAX_ENTERPRISING, Math.max(0, initialProfile.enterprising_pct)) : 0
  );
  const [isMarried, setIsMarried] = useState<boolean | null>(initialProfile?.is_married ?? null);
  const [homeState, setHomeState] = useState(initialProfile?.home_state ?? "");
  const [isEmployed, setIsEmployed] = useState<boolean | null>(initialProfile?.is_employed ?? null);
  const [has401k, setHas401k] = useState<boolean | null>(initialProfile?.has_401k ?? null);
  const [hasMatch, setHasMatch] = useState<boolean | null>(initialProfile?.has_401k_match ?? null);
  const [matchRate, setMatchRate] = useState(
    initialProfile?.match_rate_pct != null ? String(initialProfile.match_rate_pct) : ""
  );
  const [matchLimit, setMatchLimit] = useState(
    initialProfile?.match_limit_pct != null ? String(initialProfile.match_limit_pct) : ""
  );
  const [types, setTypes] = useState<string[]>(initialProfile?.k401_investment_types ?? []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setMoney = (setter: (v: string) => void) => (v: string) => {
    if (v !== "" && !/^\d*\.?\d*$/.test(v)) return; // non-negative decimal only
    setter(v);
  };

  const toggleType = (slug: string) =>
    setTypes((t) => (t.includes(slug) ? t.filter((x) => x !== slug) : [...t, slug]));

  // Which follow-up questions are live. Hidden answers stay in state (so an accidental
  // toggle doesn't destroy work) but are never sent, keeping the payload coherent.
  const show401k = isEmployed === true;
  const showMatch = show401k && has401k === true;
  const showMatchAmounts = showMatch && hasMatch === true;

  // Validation runs over the active branch only.
  const monthlyValid = monthly !== "" && Number(monthly) >= 0;
  const incomeValid = income !== "" && Number(income) >= 0;
  const pctValid = (v: string) => v !== "" && Number(v) >= 0 && Number(v) <= 100;
  const formValid =
    monthlyValid &&
    incomeValid &&
    isMarried !== null &&
    homeState !== "" &&
    isEmployed !== null &&
    (!show401k || has401k !== null) &&
    (!showMatch || hasMatch !== null) &&
    (!showMatchAmounts || (pctValid(matchRate) && pctValid(matchLimit)));

  const buildFormData = () => {
    const fd = new FormData();
    fd.append("monthly_investment", monthly);
    fd.append("annual_income", income);
    fd.append("stock_pct", String(stockPct));
    fd.append("enterprising_pct", String(enterprisingPct));
    fd.append("is_married", String(isMarried));
    fd.append("home_state", homeState);
    fd.append("is_employed", String(isEmployed));
    // Walk the same conditional tree the form renders, so inactive keys are omitted
    // entirely. FastAPI 422s on an empty string for `bool | None`.
    if (show401k) {
      fd.append("has_401k", String(has401k));
      if (showMatch) {
        fd.append("has_401k_match", String(hasMatch));
        if (showMatchAmounts) {
          fd.append("match_rate_pct", matchRate);
          fd.append("match_limit_pct", matchLimit);
        }
      }
      if (has401k === true) {
        types.forEach((t) => fd.append("k401_investment_types", t));
      }
    }
    return fd;
  };

  const submit = async () => {
    if (!formValid || saving) return;
    setSaving(true);
    setError(null);

    const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
    const url = `${apiBase}/api/users/userProfile`;
    // Never set Content-Type by hand here: it would clobber the multipart boundary.
    const send = (method: "POST" | "PUT") =>
      fetch(url, { method, credentials: "include", body: buildFormData() });

    try {
      let res = await send(isEdit ? "PUT" : "POST");
      // Self-heal a stale create/edit guess: 409 means it already exists, 404 means it
      // doesn't. Either way the other verb is correct.
      if (res.status === 409) res = await send("PUT");
      else if (res.status === 404) res = await send("POST");

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Request failed (${res.status})`);
      }
      router.refresh();
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSaving(false);
    }
  };

  return (
    <div className="mt-10 flex flex-col gap-10">
      <Section title="Your plan" caption="What you're putting in, and how it gets split.">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Monthly investment" hint="(per month)">
            <span className="text-[var(--muted)] text-sm">$</span>
            <input
              inputMode="decimal"
              value={monthly}
              onChange={(e) => setMoney(setMonthly)(e.target.value)}
              placeholder="500"
              className="w-full bg-transparent outline-none text-sm tabular"
            />
          </Field>
          <Field label="Total annual income" hint="(before tax)">
            <span className="text-[var(--muted)] text-sm">$</span>
            <input
              inputMode="decimal"
              value={income}
              onChange={(e) => setMoney(setIncome)(e.target.value)}
              placeholder="120000"
              className="w-full bg-transparent outline-none text-sm tabular"
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="split"
            className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)]"
          >
            Stocks / bonds split
          </label>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium tabular">{100 - stockPct}% Bonds</span>
            <span className="font-medium tabular">{stockPct}% Stocks</span>
          </div>
          <input
            id="split"
            type="range"
            min={MIN_STOCK}
            max={MAX_STOCK}
            step={1}
            value={stockPct}
            onChange={(e) => setStockPct(Number(e.target.value))}
            aria-valuetext={`${100 - stockPct} percent bonds, ${stockPct} percent stocks`}
            className="range-band"
          />
          <div className="flex h-2 rounded-full overflow-hidden border border-[var(--border)]">
            <div style={{ width: `${100 - stockPct}%` }} className="bg-[var(--accent)]" />
            <div style={{ width: `${stockPct}%` }} className="bg-[var(--accent-soft)]" />
          </div>
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            Graham&apos;s 50/50 rule: never less than 25% or more than 75% on either side. The
            slider is capped at that band.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="enterprising"
            className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)]"
          >
            Enterprising / speculative allocation
          </label>
          <div className="text-sm font-medium tabular">{enterprisingPct}%</div>
          <input
            id="enterprising"
            type="range"
            min={0}
            max={MAX_ENTERPRISING}
            step={1}
            value={enterprisingPct}
            onChange={(e) => setEnterprisingPct(Number(e.target.value))}
            aria-valuetext={`${enterprisingPct} percent`}
            className="range-band"
          />
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            Capped at 10% — Graham&apos;s ceiling for speculative money.
          </p>
        </div>
      </Section>

      <Section title="About you" caption="These change how your gains are taxed.">
        <YesNo
          name="married"
          label="Marital status"
          value={isMarried}
          onChange={setIsMarried}
          yesLabel="Married"
          noLabel="Single"
          hint="The net investment income surtax starts at $200k single, $250k married."
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Home state" hint="(for municipal bonds)">
            <select
              value={homeState}
              onChange={(e) => setHomeState(e.target.value)}
              aria-label="Home state"
              className="w-full bg-transparent outline-none text-sm"
              style={{ colorScheme: "light", color: "#0c0a09" }}
            >
              <option value="" style={{ color: "#0c0a09", backgroundColor: "#ffffff" }}>
                Select…
              </option>
              {US_STATES.map((s) => (
                <option key={s} value={s} style={{ color: "#0c0a09", backgroundColor: "#ffffff" }}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Employment & 401(k)" caption="Tax-deferred space is where TIPS belong.">
        <YesNo
          name="employed"
          label="Are you employed?"
          value={isEmployed}
          onChange={setIsEmployed}
        />

        {show401k && (
          <div className="fade-up flex flex-col gap-6 pl-4 border-l-2 border-[var(--border)]">
            <YesNo
              name="has401k"
              label="Does your employer offer a 401(k)?"
              value={has401k}
              onChange={setHas401k}
            />

            {showMatch && (
              <div className="fade-up flex flex-col gap-6 pl-4 border-l-2 border-[var(--border)]">
                <YesNo
                  name="hasMatch"
                  label="Is there an employer match?"
                  value={hasMatch}
                  onChange={setHasMatch}
                />

                {showMatchAmounts && (
                  <div className="fade-up grid sm:grid-cols-2 gap-4">
                    <Field label="Match rate" hint="(% they contribute)">
                      <input
                        inputMode="decimal"
                        value={matchRate}
                        onChange={(e) => setMoney(setMatchRate)(e.target.value)}
                        placeholder="50"
                        className="w-full bg-transparent outline-none text-sm tabular"
                      />
                      <span className="text-[var(--muted)] text-sm">%</span>
                    </Field>
                    <Field label="Up to" hint="(% of your salary)">
                      <input
                        inputMode="decimal"
                        value={matchLimit}
                        onChange={(e) => setMoney(setMatchLimit)(e.target.value)}
                        placeholder="6"
                        className="w-full bg-transparent outline-none text-sm tabular"
                      />
                      <span className="text-[var(--muted)] text-sm">%</span>
                    </Field>
                    {matchRate !== "" && matchLimit !== "" && (
                      <p className="sm:col-span-2 text-xs text-[var(--muted)]">
                        Reads as: {matchRate}% match on the first {matchLimit}% of your salary.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {has401k === true && (
              <div className="fade-up flex flex-col gap-2 pl-4 border-l-2 border-[var(--border)]">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)]">
                  What can you invest in inside the 401(k)?
                </span>
                <div className="flex flex-wrap gap-2">
                  {K401_TYPES.map((t) => (
                    <label
                      key={t.slug}
                      className="cursor-pointer rounded-full border border-[var(--border)] px-3 py-1.5 text-xs transition hover:border-[var(--accent)] has-checked:border-[var(--accent)] has-checked:bg-[var(--accent-soft)] has-checked:text-[var(--accent-strong)]"
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={types.includes(t.slug)}
                        onChange={() => toggleType(t.slug)}
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  Select all that apply. TIPS in particular belong in tax-deferred space.
                </p>
              </div>
            )}
          </div>
        )}
      </Section>

      {error && (
        <div className="rounded-xl border border-[var(--fail)]/30 bg-[var(--fail-soft)] p-4">
          <p className="text-sm font-medium text-[var(--fail)]">Couldn&apos;t save your profile</p>
          <p className="mt-1 text-xs text-[var(--fail)]/80">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-4 border-t border-[var(--border)] pt-6">
        <button
          type="button"
          onClick={submit}
          disabled={!formValid || saving}
          className="px-5 py-2.5 rounded-md text-sm font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {saving ? "Saving…" : isEdit ? "Save changes" : "Build my plan"}
        </button>
        {!formValid && (
          <span className="text-xs text-[var(--muted)]">Answer every question to continue.</span>
        )}
      </div>
    </div>
  );
}

// --- Local presentational helpers ---

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{caption}</p>
      </div>
      {children}
    </section>
  );
}

// Shared visual shell for a labelled field, mirroring BondList's add-form styling.
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

// Native radios, so grouping and roving arrow-key focus come for free.
function YesNo({
  name,
  label,
  value,
  onChange,
  yesLabel = "Yes",
  noLabel = "No",
  hint,
}: {
  name: string;
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
  hint?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)]">
        {label}
      </legend>
      <div className="flex gap-2">
        {[
          { v: true, text: yesLabel },
          { v: false, text: noLabel },
        ].map(({ v, text }) => (
          <label
            key={text}
            className="cursor-pointer rounded-lg border border-[var(--border)] px-4 py-2 text-sm transition hover:border-[var(--accent)] has-checked:border-[var(--accent)] has-checked:bg-[var(--accent-soft)] has-checked:text-[var(--accent-strong)] has-focus-visible:ring-2 has-focus-visible:ring-[color-mix(in_oklch,var(--accent)_25%,transparent)]"
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === v}
              onChange={() => onChange(v)}
            />
            {text}
          </label>
        ))}
      </div>
      {hint && <p className="text-xs text-[var(--muted)] leading-relaxed">{hint}</p>}
    </fieldset>
  );
}
