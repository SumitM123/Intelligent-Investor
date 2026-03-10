"use client"
import React from "react";
import { useUserContext} from "../../context/UserContext";
import { useState } from "react";
import { SnapTradeReact } from 'snaptrade-react';
import { usePrevPageContext } from "@/app/context/prevPageURL";
import { useRouter } from "next/router";
interface uri {
    uriGenerated : string,
    prevPageURLNav: string
}
function URIButton( {uriGenerated, prevPageURLNav} : uri) {
    const [open, setOpen] = useState(false);
    const { isSignedIn } = useUserContext();
    const {setPrevPage} = usePrevPageContext();
    const router = useRouter();
    setPrevPage(prevPageURLNav);
    const buttonStyle: React.CSSProperties = {
        padding: "10px 16px",
        borderRadius: "8px",
        border: "1px solid #c0c0c0",
        backgroundColor: isSignedIn ? "#1f6feb" : "#d1d5db",
        color: isSignedIn ? "#ffffff" : "#6b7280",
        cursor: isSignedIn ? "pointer" : "not-allowed",
        opacity: isSignedIn ? 1 : 0.8,
    };
    function onClose() {
        setOpen(false);
        router.push("/pages/defensivePage/accountsChoosing");
    }
    return (
        <div>
            <button type="button" disabled={!isSignedIn} style={buttonStyle} onClick={() => {
                setOpen(true);
            }}>
                Connect to Brokerage
            </button>
          <SnapTradeReact
        loginLink={uriGenerated}
        isOpen={open}
        close={onClose} // After setOpen(), you can route to a different page for accounts
        
      />
        </div>
    );
}
export default URIButton;
