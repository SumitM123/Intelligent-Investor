"use client";

import Script from "next/script";
import { useCallback, useEffect } from "react";
import { passSignInProps } from "@/app/actions";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            element: HTMLElement | null,
            options: { theme?: string; size?: string; type?: string; shape?: string; logo_alignment?: string; width?: number }
          ) => void;
        };
      };
    };
  }
}

const SignInPage = () => {
  const handleCredentialResponse = useCallback(async (response: { credential: string }) => {
    const formData = new FormData();
    formData.append("credential", response.credential);
    await passSignInProps(formData);
  }, []);

  const initGoogleButton = useCallback(() => {
    if (!window.google) return;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.warn("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID");
      return;
    }
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredentialResponse,
      auto_select: false,
    });
    window.google.accounts.id.renderButton(document.getElementById("googleSignInDiv"), {
      theme: "outline",
      size: "large",
      type: "standard",
      shape: "pill",
      logo_alignment: "left",
      width: 300,
    });
  }, [handleCredentialResponse]);

  useEffect(() => {
    initGoogleButton();
  }, [initGoogleButton]);

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" async defer onLoad={initGoogleButton} />
      <main className="min-h-screen grid lg:grid-cols-5">
        {/* Left: hero copy + sign-in */}
        <div className="lg:col-span-3 flex flex-col justify-between p-8 lg:p-16">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-8 h-8 rounded-md bg-[var(--accent)] text-white font-mono text-xs font-semibold">
              II
            </span>
            <span className="text-sm font-semibold tracking-tight">Intelligent Investor</span>
          </div>

          <div className="max-w-xl py-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--border)] bg-[var(--surface)] text-xs font-medium text-[var(--muted)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              Built on Benjamin Graham&apos;s principles
            </div>

            <h1 className="mt-6 text-4xl lg:text-5xl font-semibold tracking-tight leading-[1.05]">
              Invest with
              <br />
              <span className="text-[var(--accent)]">discipline.</span>
            </h1>

            <p className="mt-5 text-base lg:text-lg text-[var(--muted)] leading-relaxed">
              A research workspace grounded in <em>The Intelligent Investor</em>. Screen for margin of safety, balance stocks against bonds, and own what passes Graham&apos;s tests — not what&apos;s trending.
            </p>

            <blockquote className="mt-8 pl-4 border-l-2 border-[var(--accent)] text-sm text-[var(--muted)] leading-relaxed">
              <em>&ldquo;The investor&apos;s chief problem — and even his worst enemy — is likely to be himself.&rdquo;</em>
              <span className="block mt-1.5 not-italic text-xs">— Benjamin Graham, 1949</span>
            </blockquote>

            <div className="mt-10">
              <div id="googleSignInDiv" />
            </div>

            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--muted)]">
              <TrustMark>SnapTrade-secured</TrustMark>
              <TrustMark>Google OAuth only</TrustMark>
              <TrustMark>No trades executed</TrustMark>
            </div>
          </div>

          <p className="text-xs text-[var(--muted)]">
            For research and analysis. Not investment advice.
          </p>
        </div>

        {/* Right: hero visual — real vs nominal returns illustration */}
        <div className="hidden lg:flex lg:col-span-2 relative bg-[var(--surface)] border-l border-[var(--border)] dot-grid items-center justify-center overflow-hidden">
          <div className="w-full max-w-md p-8 relative z-10">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.08)]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
                  $10,000 invested · 1970 → 2024
                </p>
                <span className="text-[10px] font-mono text-[var(--muted)] tabular">S&amp;P 500</span>
              </div>

              <div className="flex items-baseline gap-4">
                <div>
                  <p className="text-2xl font-semibold tabular tracking-tight">$1.47M</p>
                  <p className="text-[11px] text-[var(--muted)]">nominal</p>
                </div>
                <div className="h-8 w-px bg-[var(--border)]" />
                <div>
                  <p className="text-2xl font-semibold tabular tracking-tight text-[var(--accent)]">$215K</p>
                  <p className="text-[11px] text-[var(--muted)]">real (inflation-adjusted)</p>
                </div>
              </div>

              <ReturnsChart />

              <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-[var(--muted)] tabular">
                <span>1970</span>
                <span>1990</span>
                <span>2024</span>
              </div>

              <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center gap-4 text-[11px]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-0.5 bg-neutral-900 dark:bg-white" />
                  Nominal
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-0.5 bg-[var(--accent)]" />
                  Real return
                </span>
              </div>
            </div>

            <p className="mt-6 text-xs text-[var(--muted)] leading-relaxed text-center max-w-xs mx-auto">
              Graham&apos;s lesson: most of what looks like return is just inflation. We surface what&apos;s real.
            </p>
          </div>
        </div>
      </main>
    </>
  );
};

function TrustMark({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg className="w-3.5 h-3.5 text-[var(--pass)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </span>
  );
}

function ReturnsChart() {
  // Illustrative S&P 500 trajectory 1970-2024; total return index, indexed to 100
  const nominal = [100, 105, 115, 95, 120, 160, 200, 260, 380, 510, 720, 1000, 1300, 1900, 2700, 4100, 6300, 10000, 14700];
  const real = [100, 100, 100, 75, 90, 110, 130, 155, 195, 240, 295, 360, 430, 540, 720, 1000, 1430, 1900, 2150];
  const w = 360;
  const h = 130;
  const pad = 6;
  const max = Math.max(...nominal);
  const toPath = (arr: number[]) =>
    arr
      .map((v, i) => {
        const x = pad + (i / (arr.length - 1)) * (w - pad * 2);
        const y = h - pad - (v / max) * (h - pad * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full mt-5" preserveAspectRatio="none" style={{ height: 130 }}>
      {/* baseline grid */}
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={t}
          x1={pad}
          x2={w - pad}
          y1={h - pad - t * (h - pad * 2)}
          y2={h - pad - t * (h - pad * 2)}
          stroke="var(--border)"
          strokeDasharray="2 3"
        />
      ))}
      <path
        d={toPath(nominal)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="text-neutral-900 dark:text-white draw-line"
        style={{ ["--length" as string]: 1200 }}
      />
      <path
        d={toPath(real)}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="draw-line"
        style={{ ["--length" as string]: 1200, animationDelay: "0.2s" }}
      />
    </svg>
  );
}

export default SignInPage;
