"use client"
import React from "react";
import { useUserContext} from "../../context/UserContext";
import { useState } from "react";
import { SnapTradeReact } from 'snaptrade-react';

interface uri {
    uriGenerated : string
}
function URIButton( {uriGenerated} : uri) {
    const [open, setOpen] = useState(false);
    const { isSignedIn } = useUserContext();
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
        router
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
        close={() => 
            setOpen(false)
            
        } // After setOpen(), you can route to a different page for accounts
        
      />
        </div>
    );
}
export default URIButton;
