"use client";

import ConnectBrokerButton from "./ConnectBrokerButton";
import AccountPicker from "./AccountPicker";
import SecurityList from "./SecurityList";
import PortfolioBreakdown from "../PortfolioBreakdown/PortfolioBreakdown";
import { usePortfolioData } from "../PortfolioBreakdown/usePortfolioData";
import type { BrokerageState } from "./useBrokerageState";

interface Props {
  broker: BrokerageState;
  isDefensive: boolean;
}

/**
 * Renders the broker flow for whatever stage `broker` reports. The state itself lives in
 * useBrokerageState (owned by InvestorWorkspace), because the page needs to know the stage
 * to decide whether the screener and bond list render at all.
 *
 * usePortfolioData stays here rather than in the hook: it reads the bonds context, so it has
 * to run inside PortfolioProvider.
 */
export default function BrokerageWorkspace({ broker, isDefensive }: Props) {
  const {
    stage,
    connection,
    accounts,
    accountsLoading,
    accountsError,
    selectedAccountId,
    selectedAccount,
    disconnecting,
    stack,
    currentFrame,
    selectAccount,
    disconnect,
    reload,
    push,
    back,
    jumpTo,
  } = broker;

  const { breakdown, loading: breakdownLoading, error: breakdownError } = usePortfolioData(
    selectedAccountId,
    isDefensive,
  );

  if (stage === "noSnapTradeUser") {
    return (
      <HeroCard
        title="Your SnapTrade session is missing"
        blurb="Sign out and back in to reconnect a brokerage account."
      />
    );
  }

  if (stage === "loading") {
    return (
      <HeroCard title="Checking your brokerage connection…" spinner />
    );
  }

  // Nothing connected: this is the only thing on the page, so make it the page.
  if (stage === "disconnected") {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-8 py-16 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-[var(--accent-soft)] grid place-items-center">
          <svg
            className="w-7 h-7 text-[var(--accent)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d="M10 14a3.5 3.5 0 005 0l4-4a3.5 3.5 0 00-5-5l-1 1" strokeLinecap="round" />
            <path d="M14 10a3.5 3.5 0 00-5 0l-4 4a3.5 3.5 0 005 5l1-1" strokeLinecap="round" />
          </svg>
        </div>

        <h2 className="mt-6 text-2xl font-semibold tracking-tight">
          Connect your broker account
        </h2>
        <p className="mt-3 text-sm text-[var(--muted)] max-w-md mx-auto leading-relaxed">
          Link a brokerage to score every position against Graham&apos;s criteria and chart your
          stocks-to-bonds balance. Everything else unlocks once an account is connected.
        </p>

        <div className="mt-8 flex flex-col items-center">
          <ConnectBrokerButton large onConnected={reload} onClose={reload} />
        </div>
      </div>
    );
  }

  // Connected but no account chosen yet — still the only thing on the page.
  if (stage === "choosingAccount") {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
              {connection?.institution_name ?? "Brokerage"} connected
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              Pick an account to analyze
            </h2>
          </div>
          <DisconnectButton
            institution={connection?.institution_name ?? "brokerage"}
            onDisconnect={disconnect}
            disconnecting={disconnecting}
          />
        </div>
        <AccountPicker
          accounts={accounts}
          loading={accountsLoading}
          error={accountsError}
          onSelect={selectAccount}
        />
      </div>
    );
  }

  // stage === "analyzing"
  return (
    <>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <label
              htmlFor="account-select"
              className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase"
            >
              Account
            </label>
            <select
              id="account-select"
              value={selectedAccountId ?? ""}
              onChange={(e) => selectAccount(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] outline-none focus:border-[var(--accent)] transition"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.number ? ` ···${a.number.slice(-4)}` : ""}
                </option>
              ))}
            </select>
            {selectedAccount?.institution_name && (
              <span className="text-xs text-[var(--muted)]">
                {selectedAccount.institution_name}
              </span>
            )}
          </div>

          <DisconnectButton
            institution={connection?.institution_name ?? "brokerage"}
            onDisconnect={disconnect}
            disconnecting={disconnecting}
          />
        </div>

        <PortfolioBreakdown
          breakdown={breakdown}
          stack={stack}
          push={push}
          back={back}
          jumpTo={jumpTo}
          loading={breakdownLoading}
          error={breakdownError}
        />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <SecurityList breakdown={breakdown} frame={currentFrame} isDefensive={isDefensive} />
      </div>
    </>
  );
}

function HeroCard({
  title,
  blurb,
  spinner,
}: {
  title: string;
  blurb?: string;
  spinner?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-8 py-16 text-center">
      {spinner && (
        <svg className="w-6 h-6 mx-auto mb-4 text-[var(--muted)] animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
          <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      <p className="text-base font-medium">{title}</p>
      {blurb && (
        <p className="mt-2 text-sm text-[var(--muted)] max-w-md mx-auto leading-relaxed">{blurb}</p>
      )}
    </div>
  );
}

function DisconnectButton({
  institution,
  onDisconnect,
  disconnecting,
}: {
  institution: string;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onDisconnect}
      disabled={disconnecting}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:border-[var(--fail)] hover:text-[var(--fail)] disabled:opacity-50 disabled:cursor-not-allowed transition"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M10 14a3.5 3.5 0 005 0l4-4a3.5 3.5 0 00-5-5l-1 1" strokeLinecap="round" />
        <path d="M14 10a3.5 3.5 0 00-5 0l-4 4a3.5 3.5 0 005 5l1-1" strokeLinecap="round" />
        <path d="M4 4l16 16" strokeLinecap="round" />
      </svg>
      {disconnecting ? "Disconnecting…" : `Disconnect ${institution}`}
    </button>
  );
}
