"use client";
import React, { useEffect, useState } from "react";
import URIButton from "@/app/component/URIButton/uriButton";

interface ConnectionURLProps {
  prevPageURL: string;
  hasSnapTradeUser: boolean;
}

export default function ConnectionURL({ prevPageURL, hasSnapTradeUser }: ConnectionURLProps) {
  const [uriGenerated, setURIGenerated] = useState<string>("");
  const [pending, setPending] = useState<boolean>(true);

  async function generateURI() {
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
      const res = await fetch(`${apiBase}/api/snapTrade/generateConnectionPortal`, {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        console.warn(`generateConnectionPortal failed: ${res.status}`);
        return "";
      }
      const data = (await res.json()) as { redirectURI?: string };
      return data?.redirectURI ?? "";
    } catch (e) {
      console.warn("Error generating the URI: " + (e as Error).message);
      return "";
    }
  }

  const loadURI = async () => {
    setPending(true);
    setURIGenerated(await generateURI());
    setPending(false);
  };

  useEffect(() => {
    if (!hasSnapTradeUser) {
      setPending(false);
      return;
    }
    void loadURI();
  }, [hasSnapTradeUser]);

  if (!hasSnapTradeUser) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]">
        <svg className="w-4 h-4 text-[var(--muted)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 018 0v4" strokeLinecap="round" />
        </svg>
        <p className="text-sm text-[var(--muted)]">
          Sign in first to connect a brokerage account.
        </p>
      </div>
    );
  }

  if (pending) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]">
        <svg className="w-4 h-4 text-[var(--muted)] animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
          <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="text-sm text-[var(--muted)]">Preparing secure SnapTrade portal…</p>
      </div>
    );
  }

  if (!uriGenerated) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-[var(--warn)]/30 bg-[var(--warn-soft)]">
        <p className="text-sm text-[var(--warn)]">
          Couldn&apos;t prepare the connection portal. Try again.
        </p>
        <button
          type="button"
          onClick={() => void loadURI()}
          className="text-xs font-medium px-3 py-1.5 rounded-md border border-[var(--warn)]/40 text-[var(--warn)] hover:bg-white transition"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <URIButton uriGenerated={uriGenerated} prevPageURLNav={prevPageURL} onRefresh={loadURI} />
      <p className="text-[11px] text-[var(--muted)] flex items-center gap-1.5">
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 018 0v4" strokeLinecap="round" />
        </svg>
        Credentials handled by SnapTrade. We never see them.
      </p>
    </div>
  );
}
