import Link from "next/link";

// Public landing page. `middleware.ts` bounces signed-in visitors straight to the
// defensive page, so this is only ever rendered logged out — there is no session to
// read here and no redirect to perform.
export default function HomePage() {
  return (
    <div className="max-w-5xl mx-auto px-8 lg:px-12 py-14">
      <p className="text-xs font-semibold tracking-widest text-[var(--accent)] uppercase">
        Intelligent Investor
      </p>
      <h1 className="mt-3 text-3xl lg:text-4xl font-semibold tracking-tight">
        Graham&apos;s framework, run against your actual portfolio.
      </h1>
      <p className="mt-3 text-base text-[var(--muted)] max-w-2xl leading-relaxed">
        Connect a brokerage account and see every position scored against the criteria from
        <em> The Intelligent Investor</em> — margin of safety, the 25–75% balance band, and the
        seven tests a defensive stock has to pass.
      </p>

      <div className="mt-8 flex items-center gap-3 flex-wrap">
        <Link
          href="/pages/signIn"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 active:scale-[0.98] transition"
        >
          Get started
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <p className="text-xs text-[var(--muted)]">
          Credentials handled by SnapTrade. We never see them, and no trades are executed.
        </p>
      </div>

      <div className="mt-12 grid sm:grid-cols-2 gap-4">
        <QuickLink
          href="/pages/typesOfInvestor"
          eyebrow="Start here"
          title="Choose your path"
          desc="Defensive or enterprising — the criteria differ, the discipline doesn't."
        />
        <QuickLink
          href="/pages/typesOfInvestor/defensivePage"
          eyebrow="Screen"
          title="Run Graham's seven tests"
          desc="Search the market for stocks that pass every check."
        />
      </div>

      <section className="mt-14 pt-10 border-t border-[var(--border)]">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-[var(--muted)]">First principles</p>
        <div className="mt-4 grid lg:grid-cols-3 gap-6">
          <Principle
            title="Margin of safety"
            body="Buy below intrinsic value. The gap absorbs the errors you don't know you're making."
          />
          <Principle
            title="The 50/50 rule"
            body="Stocks-to-bonds should stay between 25% and 75%. Rebalance against the tide, not with it."
          />
          <Principle
            title="Mr. Market"
            body="The market is a moody business partner. Trade with him only when his price serves you."
          />
        </div>
      </section>
    </div>
  );
}

function QuickLink({
  href,
  eyebrow,
  title,
  desc,
}: {
  href: string;
  eyebrow: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:border-[var(--accent)] hover:-translate-y-0.5"
    >
      <p className="text-[10px] font-semibold tracking-widest uppercase text-[var(--accent)]">{eyebrow}</p>
      <p className="mt-2 text-base font-semibold tracking-tight">{title}</p>
      <p className="mt-1.5 text-sm text-[var(--muted)] leading-relaxed">{desc}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] opacity-0 group-hover:opacity-100 transition">
        Open
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </Link>
  );
}

function Principle({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-sm font-semibold tracking-tight">{title}</p>
      <p className="mt-1.5 text-sm text-[var(--muted)] leading-relaxed">{body}</p>
    </div>
  );
}
