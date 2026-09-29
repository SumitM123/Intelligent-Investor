"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export interface TargetSplit {
  stock_pct: number;
  bond_pct: number;
}

/**
 * The user's goal stocks/bonds split, from GET /api/portfolio/targetSplit (backed by
 * user_profile.stock_pct). Unlike the account breakdown, this is a per-user setting, not
 * a per-account one, so it's fetched once per mount rather than re-fetched on account
 * switch.
 */
export function useTargetSplit() {
  const [target, setTarget] = useState<TargetSplit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/portfolio/targetSplit`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`targetSplit ${res.status}`);
        const data = (await res.json()) as TargetSplit;
        if (!cancelled) setTarget(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { target, loading, error };
}
