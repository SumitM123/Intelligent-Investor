'use client';
import React, { useState, useEffect, useRef, useCallback } from "react";

type StockMatch = { symbol: string; name: string; currency: string };
type AlphaVantageMatch = {
  "1. symbol": string;
  "2. name": string;
  "8. currency": string;
};

interface StockSearchBarProps {
  onSubmit?: (symbol: string) => void;
  submitting?: boolean;
}

export default function StockSearchBar({ onSubmit, submitting = false }: StockSearchBarProps = {}) {
  const [stocks, setStocks] = useState<StockMatch[]>([]);
  const [searchItem, setSearchItem] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submitSelected = () => {
    if (!onSubmit) return;
    const symbol = (stocks[activeIdx]?.symbol ?? searchItem).trim().toUpperCase();
    if (!symbol) return;
    onSubmit(symbol);
  };

  // Cmd+K focuses the input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") inputRef.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fetchStocks = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const apiKey =
        process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API ?? process.env.ALPHA_VANTAGE_API ?? "";
      const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(
        q,
      )}&apikey=${apiKey}&datatype=json`;
      const response = await fetch(url);
      const arrJSON = await response.json();
      if (!arrJSON?.bestMatches) {
        setStocks([]);
        return;
      }
      const americanStocks: AlphaVantageMatch[] = [];
      for (const item of arrJSON["bestMatches"]) {
        if (item["8. currency"] === "USD") americanStocks.push(item);
        if (americanStocks.length >= 6) break;
      }
      setStocks(
        americanStocks.map((m) => ({
          symbol: m["1. symbol"],
          name: m["2. name"],
          currency: m["8. currency"],
        })),
      );
      setActiveIdx(0);
    } catch (error) {
      console.error((error as Error).message);
      setStocks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = searchItem.trim();
    if (!trimmed) {
      setStocks([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => fetchStocks(trimmed), 350);
    return () => clearTimeout(timer);
  }, [searchItem, fetchStocks]);

  const showDropdown = focused && searchItem.trim() !== "" && (stocks.length > 0 || loading);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (onSubmit) {
        submitSelected();
      } else if (stocks.length > 0) {
        // Selection is illustrative for now — the navigation target is not wired.
        const sel = stocks[activeIdx];
        if (sel) console.log("Selected", sel.symbol);
      }
      return;
    }
    if (stocks.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, stocks.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    }
  };

  return (
    <div className="relative">
      <div className="flex items-stretch gap-2">
      <div
        className={`flex-1 flex items-center gap-3 px-3.5 py-2.5 rounded-lg border bg-[var(--background)] transition ${
          focused
            ? "border-[var(--accent)] ring-2 ring-[color-mix(in_oklch,var(--accent)_15%,transparent)]"
            : "border-[var(--border)] hover:border-[var(--border-strong)]"
        }`}
      >
        <svg
          className={`w-4 h-4 shrink-0 ${focused ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={searchItem}
          onChange={(e) => setSearchItem(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={handleKey}
          placeholder="Search ticker or company…  e.g. JNJ, Berkshire"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--muted)] tabular"
          aria-label="Search stocks"
        />
        {loading && (
          <svg className="w-4 h-4 text-[var(--muted)] animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
            <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded border border-[var(--border)] text-[10px] font-mono text-[var(--muted)]">
          ⌘K
        </kbd>
      </div>
      {onSubmit && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={submitSelected}
          disabled={submitting || !searchItem.trim()}
          className="px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-sm font-semibold tracking-tight transition hover:bg-[var(--accent-strong)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Screening…" : "Screen"}
        </button>
      )}
      </div>

      {showDropdown && (
        <ul
          className="absolute left-0 right-0 top-full mt-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] overflow-hidden z-30 fade-up"
          role="listbox"
        >
          {loading && stocks.length === 0 && (
            <li className="px-3.5 py-3 text-xs text-[var(--muted)] tabular">Searching…</li>
          )}
          {!loading && stocks.length === 0 && (
            <li className="px-3.5 py-3 text-xs text-[var(--muted)]">No U.S. tickers matched.</li>
          )}
          {stocks.map((s, i) => (
            <li
              key={`${s.symbol}-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIdx(i)}
              className={`flex items-center justify-between gap-3 px-3.5 py-2.5 cursor-pointer border-l-2 transition ${
                i === activeIdx
                  ? "bg-[color-mix(in_oklch,var(--accent)_5%,transparent)] border-l-[var(--accent)]"
                  : "border-l-transparent hover:bg-black/[0.03]"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono tabular text-sm font-semibold tracking-tight">
                    {s.symbol}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--muted)]">
                    {s.currency}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] truncate mt-0.5">{s.name}</p>
              </div>
              <svg
                className="w-4 h-4 text-[var(--muted)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
