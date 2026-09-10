"use client";

import { useCallback, useEffect, useState } from "react";
import { SnapTradeReact } from "snaptrade-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

interface Props {
  // Called after a successful link so the workspace can re-read /connections.
  onConnected: () => void;
  // Called when the modal closes without linking, so the workspace can stop waiting.
  onClose: () => void;
  // Hero sizing for the disconnected state, where this is the only thing on the page.
  large?: boolean;
}

/**
 * Replaces ConnectionURL + URIButton. Same portal fetch and the same SnapTrade modal, but
 * none of the three callbacks route anywhere: the flow stays on the page it started on and
 * the workspace re-reads its state instead. Routing off a modal callback is what used to
 * dead-end the wizard on refresh.
 */
export default function ConnectBrokerButton({ onConnected, onClose, large = false }: Props) {
  const [uri, setUri] = useState("");
  const [pending, setPending] = useState(true);
  const [open, setOpen] = useState(false);

  const loadURI = useCallback(async () => {
    setPending(true);
    try {
      const res = await fetch(`${API_BASE}/api/snapTrade/generateConnectionPortal`, {
        credentials: "include",
      });
      if (!res.ok) {
        console.warn(`generateConnectionPortal failed: ${res.status}`);
        setUri("");
        return;
      }
      const data = (await res.json()) as { redirectURI?: string };
      setUri(data?.redirectURI ?? "");
    } catch (e) {
      console.warn("Error generating the SnapTrade portal URI: " + (e as Error).message);
      setUri("");
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    void loadURI();
  }, [loadURI]);

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

  if (!uri) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-[var(--warn)]/30 bg-[var(--warn-soft)]">
        <p className="text-sm text-[var(--warn)]">Couldn&apos;t prepare the connection portal.</p>
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
    <div className={large ? "flex flex-col items-center gap-3" : "space-y-2"}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 rounded-lg bg-neutral-900 text-white font-medium hover:bg-neutral-800 active:scale-[0.98] transition ${
          large ? "px-7 py-4 text-base" : "px-4 py-2.5 text-sm"
        }`}
      >
        <svg
          className={large ? "w-5 h-5" : "w-4 h-4"}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M10 14a3.5 3.5 0 005 0l4-4a3.5 3.5 0 00-5-5l-1 1" strokeLinecap="round" />
          <path d="M14 10a3.5 3.5 0 00-5 0l-4 4a3.5 3.5 0 005 5l1-1" strokeLinecap="round" />
        </svg>
        Connect your Broker Account
        <span
          className={`ml-1 font-mono uppercase tracking-wider rounded bg-white/15 text-white/80 ${
            large ? "text-[11px] px-2 py-0.5" : "text-[10px] px-1.5 py-0.5"
          }`}
        >
          SnapTrade
        </span>
      </button>

      <p className="text-[11px] text-[var(--muted)] flex items-center gap-1.5">
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 018 0v4" strokeLinecap="round" />
        </svg>
        Credentials handled by SnapTrade. We never see them.
      </p>

      <SnapTradeReact
        loginLink={uri}
        isOpen={open}
        close={() => {
          setOpen(false);
          onClose();
        }}
        onSuccess={() => {
          setOpen(false);
          // Deliberately ignores the authorizationID the callback hands us: the workspace
          // re-reads /connections, which is the only answer that survives a refresh.
          onConnected();
        }}
        onError={(error) => {
          console.error("Trouble connecting to brokerage account: " + error.detail);
        }}
        onExit={() => {
          setOpen(false);
          onClose();
        }}
      />
    </div>
  );
}
