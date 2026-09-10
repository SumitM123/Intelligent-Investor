'use client';
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SignIn from "./SignIn/signIn";
import { useUserContext } from "../context/UserContext";

interface SignedIn {
  isSignedIn: boolean;
  profilePicture: string;
  userName: string;
  // Read from the sidebarCollapsed cookie in layout.tsx so the server renders the same
  // width the client will — a localStorage read would hydrate at the wrong size first.
  defaultCollapsed?: boolean;
}

const NAV_ITEMS = [
  { href: "/pages/typesOfInvestor/defensivePage", label: "Defensive", Icon: ShieldIcon },
  { href: "/pages/typesOfInvestor/enterprisingPage", label: "Enterprising", Icon: CompassIcon },
  { href: "/pages/userProfile", label: "Profile", Icon: UserIcon },
];

export default function NavBar({
  isSignedIn,
  userName,
  profilePicture,
  defaultCollapsed = false,
}: SignedIn) {
  const userContext = useUserContext();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    userContext.setIsSignedIn(isSignedIn);
  }, [isSignedIn, userContext]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      // One year, so the choice survives a reload. Written here rather than in an effect to
      // keep render and persistence in the same click.
      document.cookie = `sidebarCollapsed=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // A blocked cookie only costs the preference on next load.
    }
  };

  // Hide sidebar on sign-in page for a clean unauthenticated hero
  if (pathname === "/pages/signIn") return null;

  return (
    <aside
      className={`sticky top-0 h-screen shrink-0 border-r border-[var(--border)] bg-[var(--surface)] flex flex-col transition-[width] duration-200 ease-out ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-1.5 py-3 border-b border-[var(--border)]">
          <Link
            href="/"
            title="Intelligent Investor"
            aria-label="Intelligent Investor — home"
            className="grid place-items-center w-8 h-8 rounded-md bg-[var(--accent)] text-white font-mono text-[11px] font-semibold hover:opacity-90 transition"
          >
            II
          </Link>
          <ToggleButton collapsed onClick={toggle} />
        </div>
      ) : (
        <div className="flex items-center gap-1 px-3 h-14 border-b border-[var(--border)]">
          <Link
            href="/"
            className="flex items-center gap-2.5 min-w-0 flex-1 rounded-md py-1 hover:bg-black/[0.03] transition"
          >
            <span className="grid place-items-center w-7 h-7 shrink-0 rounded-md bg-[var(--accent)] text-white font-mono text-[11px] font-semibold">
              II
            </span>
            <span className="text-sm font-semibold tracking-tight truncate">Intelligent Investor</span>
          </Link>
          <ToggleButton onClick={toggle} />
        </div>
      )}

      <nav className={`flex-1 overflow-y-auto overflow-x-hidden ${collapsed ? "p-2" : "p-3"}`}>
        {!collapsed && (
          <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
            Workspace
          </p>
        )}
        <ul className="space-y-0.5">
          {/* Logged out this renders empty, leaving the <SignIn> footer as the only action. */}
          {(isSignedIn ? NAV_ITEMS : []).map(({ href, label, Icon }) => {
            const active = pathname?.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  title={collapsed ? label : undefined}
                  aria-label={label}
                  className={`group flex items-center rounded-md transition ${
                    collapsed ? "justify-center py-2.5" : "gap-2.5 px-3 py-2"
                  } ${
                    active
                      ? "bg-[color-mix(in_oklch,var(--accent)_10%,transparent)] text-[var(--accent)] font-medium"
                      : "text-[var(--foreground)] hover:bg-black/[0.04]"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active
                        ? "text-[var(--accent)]"
                        : "text-[var(--muted)] group-hover:text-[var(--foreground)]"
                    }`}
                  />
                  {!collapsed && <span className="truncate text-sm">{label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>

        {!collapsed && (
          <>
            <p className="mt-6 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
              Reference
            </p>
            <div className="px-3 py-2 text-xs text-[var(--muted)] leading-relaxed">
              <p>The 50/50 rule, margin of safety, dollar-cost averaging — all the way down.</p>
            </div>
          </>
        )}
      </nav>

      <div className={`border-t border-[var(--border)] ${collapsed ? "p-2" : "p-3"}`}>
        <SignIn
          isSignedIn={isSignedIn}
          userName={userName}
          profilePicture={profilePicture}
          collapsed={collapsed}
        />
      </div>
    </aside>
  );
}

function ToggleButton({ collapsed = false, onClick }: { collapsed?: boolean; onClick: () => void }) {
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-expanded={!collapsed}
      className="grid place-items-center w-7 h-7 shrink-0 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/[0.06] transition"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path
          d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
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
function UserIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" strokeLinecap="round" />
    </svg>
  );
}
