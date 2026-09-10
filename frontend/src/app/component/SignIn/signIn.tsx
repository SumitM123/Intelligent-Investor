'use client';
import Image from "next/image";
import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { signOutAction } from "@/app/actions";

interface SignedIn {
  isSignedIn: boolean;
  profilePicture: string;
  userName: string;
  // Icon-only rendering for the retracted sidebar. Everything stays clickable.
  collapsed?: boolean;
}

export default function SignIn({ isSignedIn, profilePicture, userName, collapsed = false }: SignedIn) {
  const [stateSignedIn, setStateSignedIn] = useState(isSignedIn);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setStateSignedIn(isSignedIn), [isSignedIn]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleSignOut = () => {
    setMenuOpen(false);
    startTransition(async () => {
      await signOutAction();
    });
  };

  if (!stateSignedIn) {
    return (
      <Link
        href="/pages/signIn"
        title={collapsed ? "Sign in" : undefined}
        aria-label="Sign in"
        className={`flex items-center justify-center rounded-md text-sm font-medium bg-neutral-900 text-white hover:bg-neutral-800 active:scale-[0.98] transition w-full ${
          collapsed ? "py-2.5" : "gap-2 px-3 py-2.5"
        }`}
      >
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {!collapsed && "Sign in"}
      </Link>
    );
  }

  const firstName = userName?.split(" ")[0] ?? "User";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        title={collapsed ? userName : undefined}
        aria-label={collapsed ? `Account menu for ${userName}` : undefined}
        className={`flex items-center rounded-md hover:bg-black/[0.04] w-full text-left transition ${
          collapsed ? "justify-center py-2" : "gap-2.5 px-2 py-2"
        }`}
      >
        {profilePicture ? (
          <Image
            src={profilePicture}
            alt=""
            width={32}
            height={32}
            className="rounded-full ring-1 ring-[var(--border)]"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-[var(--accent)] grid place-items-center text-white text-xs font-semibold ring-1 ring-[var(--border)]">
            {userName?.[0]?.toUpperCase() ?? "U"}
          </div>
        )}
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate leading-tight">{firstName}</p>
              <p className="text-[11px] text-[var(--muted)] truncate leading-tight mt-0.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--pass)] mr-1.5 align-middle" />
                Connected
              </p>
            </div>
            <svg
              className={`w-4 h-4 text-[var(--muted)] transition ${menuOpen ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" />
            </svg>
          </>
        )}
      </button>

      {menuOpen && (
        <div
          className={`absolute bottom-full mb-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg p-1 z-50 fade-up ${
            collapsed ? "left-0 w-56" : "left-0 right-0"
          }`}
        >
          <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-[11px] text-[var(--muted)] truncate">Signed in via Google</p>
          </div>
          <Link
            href="/pages/userProfile"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm w-full text-left hover:bg-[var(--accent-soft)] hover:text-[var(--accent-strong)] text-[var(--foreground)] transition"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Edit profile
          </Link>
          <button
            onClick={handleSignOut}
            disabled={isPending}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm w-full text-left hover:bg-[var(--fail-soft)] hover:text-[var(--fail)] text-[var(--foreground)] transition disabled:opacity-60 disabled:cursor-wait"
          >
            {isPending ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
                <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3M14 17l5-5-5-5M19 12H7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {isPending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
