"use client";

import { useState } from "react";

export interface BondEntry {
  cusip: string;
  grade?: string;
  is_high_grade?: boolean;
  ytm?: number | null;
  spread_bps?: number | null;
  bond_type?: string;
}

interface BondListProps {
  initialBonds: BondEntry[];
  isDefensive: boolean;
}

const CUSIP_REGEX = /^[A-Z0-9]{9}$/;

export default function BondList({ initialBonds, isDefensive }: BondListProps) {
  const [bonds, setBonds] = useState<BondEntry[]>(initialBonds ?? []);
  const [inputCusip, setInputCusip] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncToBackend = async (cusips: string[]): Promise<BondEntry[]> => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
    const res = await fetch(`${apiBase}/api/bonds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ cusips, is_defensive: isDefensive }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Sync failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { bonds?: BondEntry[] };
    return data.bonds ?? [];
  };

  const handleAdd = async () => {
    const cusip = inputCusip.trim().toUpperCase();
    if (!CUSIP_REGEX.test(cusip)) {
      setError("CUSIP must be exactly 9 alphanumeric characters.");
      return;
    }
    if (bonds.some((b) => b.cusip === cusip)) {
      setError(`CUSIP ${cusip} is already in the list.`);
      return;
    }

    setError(null);
    setLoading(true);
    const previousBonds = bonds;
    const optimistic: BondEntry = { cusip };
    setBonds([...previousBonds, optimistic]);
    setInputCusip("");

    try {
      const updated = await syncToBackend([...previousBonds.map((b) => b.cusip), cusip]);
      setBonds(updated);
    } catch (e) {
      setBonds(previousBonds);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (cusip: string) => {
    setError(null);
    setLoading(true);
    const previousBonds = bonds;
    const remaining = previousBonds.filter((b) => b.cusip !== cusip);
    setBonds(remaining);

    try {
      const updated = await syncToBackend(remaining.map((b) => b.cusip));
      setBonds(updated);
    } catch (e) {
      setBonds(previousBonds);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleAdd();
    }
  };

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h2>Bond Holdings</h2>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
        <input
          type="text"
          value={inputCusip}
          onChange={(e) => setInputCusip(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter CUSIP (9 characters)"
          disabled={loading}
          maxLength={9}
          style={{
            padding: "0.5rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
            fontFamily: "monospace",
            textTransform: "uppercase",
          }}
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={loading || inputCusip.trim().length === 0}
          style={{
            padding: "0.5rem 1rem",
            border: "1px solid #2563eb",
            borderRadius: "4px",
            background: loading ? "#9ca3af" : "#2563eb",
            color: "white",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Working…" : "Add"}
        </button>
      </div>

      {error && (
        <div style={{ color: "#b91c1c", marginBottom: "0.75rem" }} role="alert">
          {error}
        </div>
      )}

      {bonds.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No bonds added yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {bonds.map((b) => (
            <li
              key={b.cusip}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.5rem 0.75rem",
                borderBottom: "1px solid #e5e7eb",
                gap: "0.75rem",
              }}
            >
              <span style={{ flex: 1 }}>
                <strong style={{ fontFamily: "monospace" }}>{b.cusip}</strong>
                {b.grade && <span style={{ marginLeft: "0.75rem" }}>— {b.grade}</span>}
                {b.bond_type && (
                  <span style={{ marginLeft: "0.5rem", color: "#6b7280" }}>({b.bond_type})</span>
                )}
                {b.ytm !== null && b.ytm !== undefined && (
                  <span style={{ marginLeft: "0.75rem", color: "#374151" }}>
                    YTM {b.ytm}%
                  </span>
                )}
                {b.spread_bps !== null && b.spread_bps !== undefined && (
                  <span style={{ marginLeft: "0.5rem", color: "#374151" }}>
                    spread {b.spread_bps} bps
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => void handleDelete(b.cusip)}
                disabled={loading}
                style={{
                  padding: "0.25rem 0.75rem",
                  border: "1px solid #b91c1c",
                  borderRadius: "4px",
                  background: "white",
                  color: "#b91c1c",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
                aria-label={`Delete ${b.cusip}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
