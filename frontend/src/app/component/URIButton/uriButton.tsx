"use client";
import React, { useEffect, useState } from "react";
import { useUserContext } from "../../context/UserContext";
import { SnapTradeReact } from "snaptrade-react";
import { usePrevPageContext } from "@/app/context/prevPageURL";
import { useRouter } from "next/navigation";

interface UriProps {
  uriGenerated: string;
  prevPageURLNav: string;
  onRefresh?: () => void;
}

export default function URIButton({ uriGenerated, prevPageURLNav, onRefresh }: UriProps) {
  const [open, setOpen] = useState(false);
  const { isSignedIn } = useUserContext();
  const { setPrevPage, setConnectionID } = usePrevPageContext();
  const router = useRouter();

  useEffect(() => {
    setPrevPage(prevPageURLNav);
  }, [prevPageURLNav, setPrevPage]);

  return (
    <>
      <button
        type="button"
        disabled={!isSignedIn}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M10 14a3.5 3.5 0 005 0l4-4a3.5 3.5 0 00-5-5l-1 1" strokeLinecap="round" />
          <path d="M14 10a3.5 3.5 0 00-5 0l-4 4a3.5 3.5 0 005 5l1-1" strokeLinecap="round" />
        </svg>
        Connect to brokerage
        <span className="ml-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/15 text-white/80">
          SnapTrade
        </span>
      </button>

      <SnapTradeReact
        loginLink={uriGenerated}
        isOpen={open}
        close={() => {
          setOpen(false);
          router.push("/pages/typesOfInvestor/accountsChoosing");
        }}
        onSuccess={(authorizationID) => {
          setConnectionID(authorizationID);
          router.push("/pages/typesOfInvestor/accountsChoosing");
        }}
        onError={(error) => {
          console.error("Trouble connecting to brokerage account: " + error.detail);
        }}
        onExit={() => {
          setOpen(false);
          onRefresh?.();
          if (prevPageURLNav === "defensive") {
            router.push("/pages/typesOfInvestor/defensivePage");
          } else {
            router.push("/pages/typesOfInvestor/enterprisingPage");
          }
          router.refresh();
        }}
      />
    </>
  );
}
