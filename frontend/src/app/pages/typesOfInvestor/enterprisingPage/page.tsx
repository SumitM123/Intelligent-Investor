import { cookies } from "next/headers";
import InvestorWorkspace from "@/app/component/InvestorWorkspace/InvestorWorkspace";
import { type BondEntry } from "@/app/component/BondList/BondList";

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

      <InvestorWorkspace
        initialBonds={initialBonds}
        hasSnapTradeUser={hasSnapTradeUser}
        isDefensive={false}
      />
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
