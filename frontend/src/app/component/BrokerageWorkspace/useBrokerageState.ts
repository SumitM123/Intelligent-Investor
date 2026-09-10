"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccountOption, BrokerConnection, Frame } from "../PortfolioBreakdown/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

// Remembering the picked account across a refresh is a convenience, so sessionStorage is
// the right home for it. Keying by connection id means it self-invalidates on reconnect:
// a new connection mints a new id, so the old key can never match again.
const accountKey = (connectionId: string) => `brokerage:selectedAccount:${connectionId}`;

export type BrokerStage =
  | "noSnapTradeUser"
  | "loading"
  | "disconnected"
  | "choosingAccount"
  | "analyzing";

export interface BrokerageState {
  stage: BrokerStage;
  connection: BrokerConnection | null;
  accounts: AccountOption[];
  accountsLoading: boolean;
  accountsError: string | null;
  selectedAccountId: string | null;
  selectedAccount: AccountOption | null;
  disconnecting: boolean;
  stack: Frame[];
  currentFrame: Frame;
  selectAccount: (accountId: string) => void;
  disconnect: () => Promise<void>;
  reload: () => void;
  push: (f: Frame) => void;
  back: () => void;
  jumpTo: (index: number) => void;
}

/**
 * Owns the broker flow's state: which connection exists, which accounts sit under it, which
 * account is being analyzed, and the pie's drill stack.
 *
 * Lifted out of BrokerageWorkspace so InvestorWorkspace can read `stage` and decide which
 * sections of the page to render at all — until an account is picked, the stock screener and
 * the bond list stay hidden.
 *
 * Deliberately free of any bonds-context dependency, so it can be called from a component
 * that renders (rather than sits inside) PortfolioProvider.
 */
export function useBrokerageState(hasSnapTradeUser: boolean): BrokerageState {
  const [connection, setConnection] = useState<BrokerConnection | null>(null);
  const [connectionsLoading, setConnectionsLoading] = useState(true);

  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const [disconnecting, setDisconnecting] = useState(false);

  // Bumped to force a re-read of /connections after connecting or dismissing the modal.
  const [reloadToken, setReloadToken] = useState(0);

  const [stack, setStack] = useState<Frame[]>([{ level: "L0" }]);
  const push = useCallback((f: Frame) => setStack((s) => [...s, f]), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const jumpTo = useCallback((index: number) => setStack((s) => s.slice(0, index + 1)), []);

  // 1. Which connections exist right now? One institution at a time, so take the newest.
  useEffect(() => {
    if (!hasSnapTradeUser) {
      setConnectionsLoading(false);
      return;
    }
    let cancelled = false;
    setConnectionsLoading(true);
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/snapTrade/connections`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`connections ${res.status}`);
        const data = (await res.json()) as { connections?: BrokerConnection[] };
        if (cancelled) return;
        setConnection(data.connections?.[0] ?? null);
      } catch (e) {
        if (!cancelled) {
          console.warn("Could not read brokerage connections: " + (e as Error).message);
          setConnection(null);
        }
      } finally {
        if (!cancelled) setConnectionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasSnapTradeUser, reloadToken]);

  // 2. Which accounts sit under that connection?
  useEffect(() => {
    if (!connection) {
      setAccounts([]);
      setSelectedAccountId(null);
      return;
    }
    let cancelled = false;
    setAccountsLoading(true);
    setAccountsError(null);
    (async () => {
      try {
        const url = `${API_BASE}/api/snapTrade/getAllAccountsFromConnection?connection_id=${encodeURIComponent(
          connection.id,
        )}`;
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`getAllAccountsFromConnection ${res.status}`);
        const data = (await res.json()) as { accounts_connection?: AccountOption[] };
        if (cancelled) return;

        const fetched = (data.accounts_connection ?? []).filter((a) => a.id);
        setAccounts(fetched);

        // Restore the previous pick only if it is still a real account on this connection.
        let restored: string | null = null;
        try {
          const stored = sessionStorage.getItem(accountKey(connection.id));
          if (stored && fetched.some((a) => a.id === stored)) restored = stored;
        } catch {
          // Private mode or blocked storage — fall through to the picker.
        }
        setSelectedAccountId(restored);
      } catch (e) {
        if (!cancelled) {
          setAccountsError((e as Error).message);
          setAccounts([]);
        }
      } finally {
        if (!cancelled) setAccountsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection]);

  const selectAccount = useCallback(
    (accountId: string) => {
      setSelectedAccountId(accountId);
      setStack([{ level: "L0" }]);
      if (!connection) return;
      try {
        sessionStorage.setItem(accountKey(connection.id), accountId);
      } catch {
        // Not being able to remember the pick is not worth failing the interaction.
      }
    },
    [connection],
  );

  const disconnect = useCallback(async () => {
    if (!connection) return;
    const ok = window.confirm(
      `Disconnect ${connection.institution_name}? You can reconnect at any time, but you'll go through the brokerage login again.`,
    );
    if (!ok) return;

    setDisconnecting(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/snapTrade/connection/${encodeURIComponent(connection.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) throw new Error(`disconnect ${res.status}`);
      try {
        sessionStorage.removeItem(accountKey(connection.id));
      } catch {
        // Nothing to clean up if storage is unavailable.
      }
      // SnapTrade's delete is queued, not immediate, so clear local state outright rather
      // than trusting the next /connections read to already reflect it.
      setConnection(null);
      setAccounts([]);
      setSelectedAccountId(null);
      setStack([{ level: "L0" }]);
    } catch (e) {
      console.error("Could not disconnect: " + (e as Error).message);
      window.alert("Couldn't disconnect that brokerage. Please try again.");
    } finally {
      setDisconnecting(false);
    }
  }, [connection]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );

  const stage: BrokerStage = !hasSnapTradeUser
    ? "noSnapTradeUser"
    : connectionsLoading
      ? "loading"
      : !connection
        ? "disconnected"
        : !selectedAccountId
          ? "choosingAccount"
          : "analyzing";

  return {
    stage,
    connection,
    accounts,
    accountsLoading,
    accountsError,
    selectedAccountId,
    selectedAccount,
    disconnecting,
    stack,
    currentFrame: stack[stack.length - 1],
    selectAccount,
    disconnect,
    reload,
    push,
    back,
    jumpTo,
  };
}
