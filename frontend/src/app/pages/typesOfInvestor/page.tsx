import Link from "next/link";

export default function ChoosePath() {
  return (
    <div className="max-w-5xl mx-auto px-8 lg:px-12 py-14">
      <div className="max-w-2xl">
        <div className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-widest uppercase text-[var(--accent)]">
          <span>Step 1 of 3</span>
          <span className="text-[var(--border-strong)]">·</span>
          <span className="text-[var(--muted)]">Path</span>
        </div>
        <h1 className="mt-3 text-3xl lg:text-4xl font-semibold tracking-tight">
          What kind of investor are you?
        </h1>
        <p className="mt-3 text-base text-[var(--muted)] leading-relaxed">
          Graham split investors into two camps based on the time and analysis they&apos;re willing to commit. Pick the path that fits how you actually invest — you can switch later.
        </p>
      </div>

      <div className="mt-10 grid md:grid-cols-2 gap-5">
        <PathCard
          href="/pages/typesOfInvestor/defensivePage"
          eyebrow="Defensive"
          eyebrowIcon={<ShieldIcon />}
          title="Lower effort. Strict quality filter."
          description="For investors who want a reliable, low-maintenance portfolio. Strict criteria narrow the universe to a small set of high-quality companies."
          bullets={[
            "Market cap ≥ $2B",
            "20-year uninterrupted dividend record",
            "10 consecutive years of positive earnings",
            "P/E ≤ 15  ·  P/B  ·  P/E ≤ 22.5",
          ]}
          recommended="if you check your portfolio quarterly, not daily."
        />
        <PathCard
          href="/pages/typesOfInvestor/enterprisingPage"
          eyebrow="Enterprising"
          eyebrowIcon={<CompassIcon />}
          title="More analysis. Wider opportunity set."
          description="For active investors comfortable evaluating financial statements. Looser criteria expand the universe, but each candidate demands deeper diligence."
          bullets={[
            "Current ratio ≥ 1.5",
            "Earnings growth in 4 of last 5 years",
            "P/B ≤ 1.2× tangible book value",
            "Currently paying a dividend",
          ]}
          recommended="if you actually enjoy reading 10-Ks."
        />
      </div>

      <div className="mt-12 pt-8 border-t border-[var(--border)] grid md:grid-cols-2 gap-6">
        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase text-[var(--muted)]">
            Not sure?
          </p>
          <p className="mt-1.5 text-sm text-[var(--foreground)] leading-relaxed">
            A defensive portfolio is the default for most investors. Graham himself recommended it for anyone unwilling to dedicate <em>substantial</em> effort to security analysis.
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-[var(--muted)]">
            The 50/50 rule applies to both
          </p>
          <p className="mt-1.5 text-sm leading-relaxed">
            Stocks-to-bonds allocation should never fall below 25% or rise above 75% in either direction. You&apos;ll calibrate this once an account is connected.
          </p>
        </div>
      </div>
    </div>
  );
}

function PathCard({
  href,
  eyebrow,
  eyebrowIcon,
  title,
  description,
  bullets,
  recommended,
}: {
  href: string;
  eyebrow: string;
  eyebrowIcon: React.ReactNode;
  title: string;
  description: string;
  bullets: string[];
  recommended: string;
}) {
  return (
    <Link
      href={href}
      className="group relative block rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 transition hover:border-[var(--accent)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)]"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[color-mix(in_oklch,var(--accent)_10%,transparent)] text-[var(--accent)] text-[11px] font-semibold tracking-wide uppercase">
          {eyebrowIcon} {eyebrow}
        </span>
        <svg
          className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="mt-5 text-xl font-semibold tracking-tight leading-snug">{title}</h2>
      <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">{description}</p>
      <ul className="mt-5 space-y-2">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm">
            <svg
              className="w-4 h-4 mt-0.5 text-[var(--accent)] shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="leading-snug">{b}</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 pt-4 border-t border-[var(--border)] text-xs text-[var(--muted)]">
        Recommended {recommended}
      </p>
    </Link>
  );
}

function ShieldIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" strokeLinejoin="round" />
    </svg>
  );
}
function CompassIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" strokeLinejoin="round" />
    </svg>
  );
}
