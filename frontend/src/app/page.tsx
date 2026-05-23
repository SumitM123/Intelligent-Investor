import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const cookieStore = await cookies();
  const userName = cookieStore.get("userName")?.value;

  if (!userName) {
    redirect("/pages/signIn");
  }

  const firstName = userName?.split(" ")[0] ?? "there";

  return (
    <div className="max-w-5xl mx-auto px-8 lg:px-12 py-14">
      <p className="text-xs font-semibold tracking-widest text-[var(--accent)] uppercase">Welcome back</p>
      <h1 className="mt-3 text-3xl lg:text-4xl font-semibold tracking-tight">
        Hello, {firstName}.
      </h1>
      <p className="mt-3 text-base text-[var(--muted)] max-w-2xl leading-relaxed">
        Pick up where you left off, or start a new analysis. Graham would have approved of the boredom.
      </p>

      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <QuickLink
          href="/pages/typesOfInvestor"
          eyebrow="Start here"
          title="Choose your path"
          desc="Switch between defensive and enterprising mode."
        />
        <QuickLink
          href="/pages/typesOfInvestor/defensivePage"
          eyebrow="Screen"
          title="Run Graham's seven tests"
          desc="Search the market for stocks that pass every check."
        />
        <QuickLink
          href="/pages/typesOfInvestor/accountsChoosing"
          eyebrow="Analyze"
          title="Pull a brokerage account"
          desc="Score real positions against the criteria."
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
