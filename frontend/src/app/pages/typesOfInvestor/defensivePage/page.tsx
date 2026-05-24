import { cookies } from "next/headers";
import DefensiveScreener from "@/app/component/DefensiveScreener/DefensiveScreener";
import { type BondEntry } from "@/app/component/BondList/BondList";

export default async function DefensivePage() {
  const cookieStore = await cookies();
  const userIdCookie = cookieStore.get("user_id")?.value;
  const hasSnapTradeUser = !!cookieStore.get("snapTradeUserID")?.value;
  const apiBaseUrl = process.env.INTERNAL_API_BASE ?? "http://backend:8000";

  let initialBonds: BondEntry[] = [];
  if (userIdCookie) {
    try {
      const res = await fetch(`${apiBaseUrl}/api/bonds?is_defensive=true`, {
        headers: { Cookie: `user_id=${userIdCookie}` },
        cache: "no-store",
      });
      if (res.ok) {
        const json = (await res.json()) as { bonds?: BondEntry[] };
        initialBonds = json.bonds ?? [];
      } else {
        console.error("defensivePage: failed to load bonds", res.status);
      }
    } catch (error) {
      console.warn("defensivePage: error loading bonds", error);
    }
  }

  return (
    <div className="px-8 lg:px-12 py-10 max-w-7xl mx-auto">
      <header className="flex items-end justify-between gap-6 border-b border-[var(--border)] pb-6 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-widest uppercase text-[var(--accent)]">
            <ShieldIcon /> Defensive investor
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Graham&apos;s Defensive Screen</h1>
          <p className="mt-2 text-sm text-[var(--muted)] max-w-2xl leading-relaxed">
            Companies must pass all seven tests. The universe is small and slow-moving by design — that&apos;s the point.
          </p>
        </div>
        <div className="flex gap-8">
          <Stat label="Universe" value="4,182" />
          <Stat label="Pass all 7" value="312" tone="accent" />
          <Stat label="Last refresh" value="Live" tone="muted" />
        </div>
      </header>

      <DefensiveScreener initialBonds={initialBonds} hasSnapTradeUser={hasSnapTradeUser} />
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

function ShieldIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" strokeLinejoin="round" />
    </svg>
  );
}
