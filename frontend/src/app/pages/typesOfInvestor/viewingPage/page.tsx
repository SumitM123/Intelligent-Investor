import { cookies } from "next/headers";

interface ViewingPageProps {
  searchParams?: Promise<{
    accountID?: string;
  }>;
}

interface Holding {
  symbol: string;
  name: string;
  value: number;
  pe: number;
  pb: number;
  mos: number;
  passed: number;
  passedBits: boolean[];
}

const SAMPLE_HOLDINGS: Holding[] = [
  { symbol: "JNJ",  name: "Johnson & Johnson",        value: 18420, pe: 14.2, pb: 5.8,  mos: 28, passed: 6, passedBits: [true,true,true,true,true,false,true] },
  { symbol: "KO",   name: "Coca-Cola Company",        value: 14200, pe: 22.1, pb: 9.4,  mos: 8,  passed: 5, passedBits: [true,true,true,true,true,false,false] },
  { symbol: "WMT",  name: "Walmart Inc.",             value: 21800, pe: 26.4, pb: 6.1,  mos: -4, passed: 4, passedBits: [true,true,true,true,false,false,false] },
  { symbol: "PG",   name: "Procter & Gamble",         value: 16930, pe: 24.5, pb: 7.9,  mos: 12, passed: 5, passedBits: [true,true,true,true,true,false,false] },
  { symbol: "BRK.B",name: "Berkshire Hathaway",       value: 28150, pe: 9.8,  pb: 1.5,  mos: 41, passed: 7, passedBits: [true,true,true,false,true,true,true] },
  { symbol: "MSFT", name: "Microsoft Corporation",    value: 28920, pe: 35.1, pb: 12.4, mos: -18,passed: 3, passedBits: [true,true,true,false,true,false,false] },
];

export default async function ViewingPage({ searchParams }: ViewingPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const accountID = resolvedSearchParams?.accountID ?? "";
  const apiBaseUrl = process.env.INTERNAL_API_BASE ?? "http://backend:8000";

  let accountInformation: unknown = null;
  let accountError = "";

  if (accountID) {
    try {
      const cookieStore = await cookies();
      const snapTradeCookie = cookieStore.get("snapTradeUserID")?.value;
      const params = new URLSearchParams();
      params.append("account_id", accountID);
      const response = await fetch(`${apiBaseUrl}/api/snapTrade/accountInformation?${params.toString()}`, {
        headers: snapTradeCookie ? { Cookie: `snapTradeUserID=${snapTradeCookie}` } : undefined,
        cache: "no-store",
      });
      if (!response.ok) {
        const errorBody = await response.text();
        console.error("accountInformation fetch failed", { status: response.status, body: errorBody });
        throw new Error(`Request failed with status ${response.status}`);
      }
      const json = (await response.json()) as { account_information?: unknown };
      accountInformation = json.account_information ?? null;
    } catch (error) {
      console.error("Error loading account information", error);
      accountError = error instanceof Error ? error.message : "Failed to fetch account information";
    }
  }

  if (!accountID) {
    return <EmptyState />;
  }

  return (
    <div className="px-8 lg:px-12 py-10 max-w-7xl mx-auto">
      <header className="border-b border-[var(--border)] pb-6">
        <div className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-widest uppercase text-[var(--accent)]">
          <span>Step 3 of 3</span>
          <span className="text-[var(--border-strong)]">·</span>
          <span className="text-[var(--muted)]">Analysis</span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Portfolio overview</h1>
            <p className="mt-1 text-xs text-[var(--muted)] font-mono tabular">
              Account · {accountID.slice(0, 24)}{accountID.length > 24 ? "…" : ""}
            </p>
          </div>
          <div className="flex gap-8 flex-wrap">
            <Stat label="Total value" value="$128,420" />
            <Stat label="Margin of safety" value="34%" tone="pass" />
            <Stat label="Graham compliance" value="5 / 7" tone="warn" />
          </div>
        </div>
      </header>

      {accountError && (
        <div className="mt-6 rounded-xl border border-[var(--fail)]/30 bg-[var(--fail-soft)] p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-[var(--fail)] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 17h0" strokeLinecap="round" />
          </svg>
          <div>
            <p className="text-sm font-medium text-[var(--fail)]">Couldn&apos;t fetch live account data</p>
            <p className="mt-0.5 text-xs text-[var(--fail)]/80">{accountError}</p>
            <p className="mt-1 text-xs text-[var(--fail)]/70">Showing illustrative analysis below.</p>
          </div>
        </div>
      )}

      <div className="mt-8 grid lg:grid-cols-3 gap-6">
        {/* Margin of Safety Dial */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
            Portfolio margin of safety
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">Weighted average across holdings</p>
          <MarginOfSafetyDial pct={34} />
          <div className="grid grid-cols-3 text-xs gap-3 mt-4 pt-4 border-t border-[var(--border)]">
            <div>
              <p className="text-[var(--muted)] text-[10px] uppercase tracking-wider">Intrinsic</p>
              <p className="mt-0.5 font-semibold tabular">$172,300</p>
            </div>
            <div>
              <p className="text-[var(--muted)] text-[10px] uppercase tracking-wider">Market</p>
              <p className="mt-0.5 font-semibold tabular">$128,420</p>
            </div>
            <div>
              <p className="text-[var(--muted)] text-[10px] uppercase tracking-wider">Discount</p>
              <p className="mt-0.5 font-semibold tabular text-[var(--pass)]">−25.5%</p>
            </div>
          </div>
        </div>

        {/* 50/50 allocation */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
              Allocation vs 50/50 rule
            </p>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--pass)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--pass)]" />
              Within band
            </span>
          </div>
          <AllocationBar stocks={62} bonds={38} />
          <div className="mt-6 grid grid-cols-3 gap-6 text-xs">
            <div>
              <p className="text-[var(--muted)] text-[10px] uppercase tracking-wider">Stocks</p>
              <p className="mt-1 text-xl tabular font-semibold tracking-tight">62%</p>
              <p className="text-[var(--muted)] tabular text-[11px]">$79,620</p>
            </div>
            <div>
              <p className="text-[var(--muted)] text-[10px] uppercase tracking-wider">Bonds</p>
              <p className="mt-1 text-xl tabular font-semibold tracking-tight">38%</p>
              <p className="text-[var(--muted)] tabular text-[11px]">$48,800</p>
            </div>
            <div>
              <p className="text-[var(--muted)] text-[10px] uppercase tracking-wider">Action</p>
              <p className="mt-1 text-sm leading-snug">
                No rebalance needed.
                <span className="block text-[var(--muted)] mt-0.5 text-[11px]">
                  Drift threshold not crossed.
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Holdings table */}
      <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold">Holdings</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Each row scored against Graham&apos;s 7 criteria. Hover the badge for a breakdown.
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-[var(--muted)]">
            <Legend color="var(--pass)" label="Pass" />
            <Legend color="var(--fail)" label="Fail" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] font-semibold tracking-widest uppercase text-[var(--muted)] bg-[var(--surface-muted)]">
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-6 py-3 font-semibold">Ticker</th>
                <th className="text-left px-3 py-3 font-semibold">Company</th>
                <th className="text-right px-3 py-3 font-semibold">Value</th>
                <th className="text-right px-3 py-3 font-semibold">P/E</th>
                <th className="text-right px-3 py-3 font-semibold">P/B</th>
                <th className="text-right px-3 py-3 font-semibold">MoS</th>
                <th className="text-center px-6 py-3 font-semibold">Criteria</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_HOLDINGS.map((h) => (
                <tr key={h.symbol} className="border-b border-[var(--border)] last:border-0 hover:bg-black/[0.02] transition">
                  <td className="px-6 py-4 font-mono tabular font-semibold">{h.symbol}</td>
                  <td className="px-3 py-4 text-[var(--muted)] truncate max-w-[220px]">{h.name}</td>
                  <td className="px-3 py-4 text-right tabular">${h.value.toLocaleString()}</td>
                  <td className="px-3 py-4 text-right tabular">{h.pe.toFixed(1)}</td>
                  <td className="px-3 py-4 text-right tabular">{h.pb.toFixed(2)}</td>
                  <td
                    className={`px-3 py-4 text-right tabular font-semibold ${
                      h.mos >= 25 ? "text-[var(--pass)]" : h.mos > 0 ? "text-[var(--warn)]" : "text-[var(--fail)]"
                    }`}
                  >
                    {h.mos > 0 ? `+${h.mos}%` : `${h.mos}%`}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2.5" title={`${h.passed} of 7 Graham criteria passed`}>
                      <CriteriaBadge passedBits={h.passedBits} />
                      <span className="text-xs tabular text-[var(--muted)]">{h.passed}/7</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Raw data drawer */}
      {!accountError && accountInformation !== null && (
        <details className="mt-6 group">
          <summary className="cursor-pointer inline-flex items-center gap-2 text-xs font-mono text-[var(--muted)] hover:text-[var(--foreground)] transition select-none">
            <svg className="w-3.5 h-3.5 transition group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            View raw SnapTrade payload
          </summary>
          <pre className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-[11px] font-mono overflow-auto max-h-96 leading-relaxed">
            {JSON.stringify(accountInformation, null, 2)}
          </pre>
        </details>
      )}
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
  tone?: "pass" | "warn" | "fail";
}) {
  const toneClass =
    tone === "pass" ? "text-[var(--pass)]"
    : tone === "warn" ? "text-[var(--warn)]"
    : tone === "fail" ? "text-[var(--fail)]"
    : "";
  return (
    <div className="text-right">
      <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular tracking-tight ${toneClass}`}>{value}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Semi-circular gauge for Margin of Safety. 0-100% domain.
    Bands: 0-15 fail, 15-25 warn, 25-100 pass. */
function MarginOfSafetyDial({ pct }: { pct: number }) {
  const value = Math.max(0, Math.min(100, pct));
  const w = 240;
  const h = 140;
  const cx = w / 2;
  const cy = 120;
  const r = 100;
  const stroke = 14;

  const arcAt = (start: number, end: number) => {
    const sx = cx + r * Math.cos(Math.PI - (start / 100) * Math.PI);
    const sy = cy - r * Math.sin(Math.PI - (start / 100) * Math.PI);
    const ex = cx + r * Math.cos(Math.PI - (end / 100) * Math.PI);
    const ey = cy - r * Math.sin(Math.PI - (end / 100) * Math.PI);
    const large = end - start > 50 ? 1 : 0;
    return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
  };

  const needleAngle = Math.PI - (value / 100) * Math.PI;
  const needleX = cx + (r - 8) * Math.cos(needleAngle);
  const needleY = cy - (r - 8) * Math.sin(needleAngle);

  const tone =
    value >= 25 ? "var(--pass)" : value >= 15 ? "var(--warn)" : "var(--fail)";

  return (
    <div className="relative mt-4">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        {/* segmented arc */}
        <path d={arcAt(0, 15)} fill="none" stroke="var(--fail-soft)" strokeWidth={stroke} strokeLinecap="butt" />
        <path d={arcAt(15, 25)} fill="none" stroke="var(--warn-soft)" strokeWidth={stroke} strokeLinecap="butt" />
        <path d={arcAt(25, 100)} fill="none" stroke="var(--pass-soft)" strokeWidth={stroke} strokeLinecap="butt" />
        {/* needle */}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={tone} strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill={tone} />
        <circle cx={cx} cy={cy} r="2.5" fill="var(--surface)" />
        {/* tick labels */}
        <text x={cx - r} y={cy + 18} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="monospace">0%</text>
        <text x={cx} y={cy - r - 6} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="monospace">50%</text>
        <text x={cx + r} y={cy + 18} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="monospace">100%</text>
      </svg>
      <div className="absolute inset-x-0 bottom-2 text-center">
        <p className="text-3xl font-semibold tabular tracking-tight" style={{ color: tone }}>
          {value}%
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)] mt-0.5">
          {value >= 25 ? "Healthy margin" : value >= 15 ? "Thin margin" : "No margin"}
        </p>
      </div>
    </div>
  );
}

/** Horizontal stacked bar with 25%/75% band markers + a vertical 50% target. */
function AllocationBar({ stocks, bonds }: { stocks: number; bonds: number }) {
  return (
    <div className="mt-5">
      <div className="relative h-3 rounded-full overflow-hidden bg-[var(--surface-muted)] border border-[var(--border)]">
        <div className="h-full flex">
          <div className="bg-neutral-900 dark:bg-white" style={{ width: `${stocks}%` }} />
          <div className="bg-[var(--accent)]" style={{ width: `${bonds}%` }} />
        </div>
        {/* band markers */}
        <span className="absolute top-0 bottom-0 w-px bg-[var(--background)]" style={{ left: "25%" }} title="25% floor" />
        <span className="absolute top-0 bottom-0 w-px bg-[var(--background)]" style={{ left: "75%" }} title="75% ceiling" />
        {/* 50% target */}
        <span className="absolute -top-1 -bottom-1 w-0.5 bg-[var(--accent)]/40" style={{ left: "50%" }} title="50% target" />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-mono text-[var(--muted)] tabular">
        <span>0%</span>
        <span className="text-[var(--fail)]">25% floor</span>
        <span className="font-semibold text-[var(--accent)]">50% target</span>
        <span className="text-[var(--fail)]">75% ceiling</span>
        <span>100%</span>
      </div>
    </div>
  );
}

/** 7-segment radial badge — one wedge per Graham criterion. */
function CriteriaBadge({ passedBits }: { passedBits: boolean[] }) {
  const size = 28;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 13;
  const rInner = 6;
  const segments = 7;
  const gap = 0.06; // radians

  const arc = (i: number) => {
    const start = -Math.PI / 2 + (i / segments) * Math.PI * 2 + gap / 2;
    const end = -Math.PI / 2 + ((i + 1) / segments) * Math.PI * 2 - gap / 2;
    const x1 = cx + rOuter * Math.cos(start);
    const y1 = cy + rOuter * Math.sin(start);
    const x2 = cx + rOuter * Math.cos(end);
    const y2 = cy + rOuter * Math.sin(end);
    const x3 = cx + rInner * Math.cos(end);
    const y3 = cy + rInner * Math.sin(end);
    const x4 = cx + rInner * Math.cos(start);
    const y4 = cy + rInner * Math.sin(start);
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`;
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
      {passedBits.map((passed, i) => (
        <path
          key={i}
          d={arc(i)}
          fill={passed ? "var(--pass)" : "var(--fail-soft)"}
          stroke="var(--surface)"
          strokeWidth="0.5"
        />
      ))}
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="max-w-2xl mx-auto px-8 py-20 text-center">
      <div className="inline-grid place-items-center w-12 h-12 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="6" width="18" height="14" rx="2" />
          <path d="M3 10h18M17 14h2" strokeLinecap="round" />
        </svg>
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">No account selected</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Connect a brokerage and choose an account first. We&apos;ll bring you back here.
      </p>
      <a
        href="/pages/typesOfInvestor"
        className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition"
      >
        Choose a path
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </div>
  );
}
