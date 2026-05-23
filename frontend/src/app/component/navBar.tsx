'use client';
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SignIn from "./SignIn/signIn";
import { useUserContext } from "../context/UserContext";

interface SignedIn {
  isSignedIn: boolean;
  profilePicture: string;
  userName: string;
}

const NAV_ITEMS = [
  { href: "/pages/typesOfInvestor", label: "Choose path", Icon: PathIcon, exact: true },
  { href: "/pages/typesOfInvestor/defensivePage", label: "Defensive", Icon: ShieldIcon },
  { href: "/pages/typesOfInvestor/enterprisingPage", label: "Enterprising", Icon: CompassIcon },
  { href: "/pages/typesOfInvestor/accountsChoosing", label: "Accounts", Icon: WalletIcon },
];

export default function NavBar({ isSignedIn, userName, profilePicture }: SignedIn) {
  const userContext = useUserContext();
  const pathname = usePathname();

  useEffect(() => {
    userContext.setIsSignedIn(isSignedIn);
  }, [isSignedIn, userContext]);

  // Hide sidebar on sign-in page for a clean unauthenticated hero
  if (pathname === "/pages/signIn") return null;

  return (
    <aside className="sticky top-0 h-screen w-60 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] flex flex-col">
      <Link
        href="/"
        className="flex items-center gap-2.5 px-5 h-14 border-b border-[var(--border)] hover:bg-black/[0.02] transition"
      >
        <span className="grid place-items-center w-7 h-7 rounded-md bg-[var(--accent)] text-white font-mono text-[11px] font-semibold">
          II
        </span>
        <span className="text-sm font-semibold tracking-tight">Intelligent Investor</span>
      </Link>

      <nav className="flex-1 p-3 overflow-y-auto">
        <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
          Workspace
        </p>
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ href, label, Icon, exact }) => {
            const active = exact ? pathname === href : pathname?.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`group flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition ${
                    active
                      ? "bg-[color-mix(in_oklch,var(--accent)_10%,transparent)] text-[var(--accent)] font-medium"
                      : "text-[var(--foreground)] hover:bg-black/[0.04]"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? "text-[var(--accent)]" : "text-[var(--muted)] group-hover:text-[var(--foreground)]"
                    }`}
                  />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mt-6 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
          Reference
        </p>
        <div className="px-3 py-2 text-xs text-[var(--muted)] leading-relaxed">
          <p>The 50/50 rule, margin of safety, dollar-cost averaging — all the way down.</p>
        </div>
      </nav>

      <div className="border-t border-[var(--border)] p-3">
        <SignIn isSignedIn={isSignedIn} userName={userName} profilePicture={profilePicture} />
      </div>
    </aside>
  );
}

function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CompassIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" strokeLinejoin="round" />
    </svg>
  );
}
function WalletIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M3 10h18M17 14h2" strokeLinecap="round" />
    </svg>
  );
}
function PathIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 4v6c0 2 1.5 3 3 3h6c1.5 0 3 1 3 3v4" strokeLinecap="round" />
      <path d="M3 16l3 3 3-3M21 8l-3-4-3 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
