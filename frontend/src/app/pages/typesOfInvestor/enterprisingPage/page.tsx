import { cookies } from "next/headers";
import StockSearchBar from "@/app/component/Stock Search Bar/StockSearchBar";
import ConnectionURL from "@/app/component/ConnectionURL/connectionURL";
import BondList, { type BondEntry } from "@/app/component/BondList/BondList";

const ENTERPRISING_CRITERIA = [
  { code: "1", name: "Strong financial condition", threshold: "Current ratio ≥ 1.5" },
  { code: "2", name: "Long-term debt", threshold: "≤ 110% of net current assets" },
  { code: "3", name: "Earnings stability", threshold: "Positive last 5 yrs" },
  { code: "4", name: "Dividend record", threshold: "Currently paying" },
  { code: "5", name: "Earnings growth", threshold: "Up from 5 yrs ago" },
  { code: "6", name: "Price to book", threshold: "≤ 1.2× tangible book" },
  { code: "7", name: "Price to earnings", threshold: "Bottom 10% by P/E" },
];

export default async function EnterprisingPage() {
  const cookieStore = await cookies();
  const userIdCookie = cookieStore.get("user_id")?.value;
  const hasSnapTradeUser = !!cookieStore.get("snapTradeUserID")?.value;
  const apiBaseUrl = process.env.INTERNAL_API_BASE ?? "http://backend:8000";

  let initialBonds: BondEntry[] = [];
  if (userIdCookie) {
    try {
      const res = await fetch(`${apiBaseUrl}/api/bonds?is_defensive=false`, {
        headers: { Cookie: `user_id=${userIdCookie}` },
        cache: "no-store",
      });
      if (res.ok) {
        const json = (await res.json()) as { bonds?: BondEntry[] };
        initialBonds = json.bonds ?? [];
      } else {
        console.error("enterprisingPage: failed to load bonds", res.status);
      }
    } catch (error) {
      console.error("enterprisingPage: error loading bonds", error);
    }
  }

  return (
    <div className="px-8 lg:px-12 py-10 max-w-7xl mx-auto">
      <header className="flex items-end justify-between gap-6 border-b border-[var(--border)] pb-6 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-widest uppercase text-[var(--accent)]">
            <CompassIcon /> Enterprising investor
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Graham&apos;s Enterprising Screen</h1>
          <p className="mt-2 text-sm text-[var(--muted)] max-w-2xl leading-relaxed">
            Wider universe, deeper diligence. Looser quantitative filters trade breadth for the work of reading the statements yourself.
          </p>
        </div>
        <div className="flex gap-8">
          <Stat label="Universe" value="4,182" />
          <Stat label="Pass all 7" value="827" tone="accent" />
          <Stat label="Last refresh" value="Live" tone="muted" />
        </div>
      </header>

      <div className="mt-8 grid lg:grid-cols-[280px_1fr] gap-8">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase px-1 pb-2">
            Criteria
          </p>
          <ul className="space-y-0.5">
            {ENTERPRISING_CRITERIA.map((c) => (
              <li
                key={c.code}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-black/[0.04] transition"
              >
                <span className="grid place-items-center w-6 h-6 rounded-md border border-[var(--border)] text-[10px] font-mono font-semibold tabular text-[var(--muted)] shrink-0">
                  {c.code}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{c.name}</p>
                  <p className="text-xs text-[var(--muted)] mt-1 tabular leading-tight">{c.threshold}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 mx-1 rounded-lg bg-[var(--surface-muted)] border border-[var(--border)] p-3">
            <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">Tip</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              Enterprising candidates require qualitative judgement on top of the quantitative screen — moat, management, secular trend.
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
            <StockSearchBar />
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
            <ConnectionURL prevPageURL="enterprising" hasSnapTradeUser={hasSnapTradeUser} />
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <BondList initialBonds={initialBonds} isDefensive={false} />
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent" | "muted";
}) {
  return (
    <div className="text-right">
      <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular tracking-tight ${
          tone === "accent" ? "text-[var(--accent)]" : tone === "muted" ? "text-[var(--muted)]" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CompassIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" strokeLinejoin="round" />
    </svg>
  );
}
