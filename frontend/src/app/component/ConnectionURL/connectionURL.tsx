import React, { useEffect } from "react";

// The prevPageURl is the URL to go back to once it's been finished
interface ConnectionURLProps {
    prevPageURL: string;
    signedIn: boolean;
}

function ConnectionURL({ prevPageURL, signedIn }: ConnectionURLProps) {
    const buttonStyle: React.CSSProperties = {
        padding: "10px 16px",
        borderRadius: "8px",
        border: "1px solid #c0c0c0",
        backgroundColor: signedIn ? "#1f6feb" : "#d1d5db",
        color: signedIn ? "#ffffff" : "#6b7280",
        cursor: signedIn ? "pointer" : "not-allowed",
        opacity: signedIn ? 1 : 0.8,
    };
    // on mount, get the URL
    const { isSignedIn } = useUserContext();

    useEffect(() => {

    }, []);
    async function generateURI() {
        try {
            const res = await fetch("http://backend:8000/api/snapTrade/generateConnectionPortal", {
                method: "GET",
                credentials: "include", // needed if backend reads cookies
            });

            if (!res.ok) throw new Error(`Request failed: ${res.status}`);
            const data = await res.json();
            } catch (e) {
                setError("Could not generate connection URL.");
                setRedirectURI("");
            }
        }  
    }
    return (
        
        <button type="button" disabled={!signedIn} style={buttonStyle} onClick={generateURI}>
            Connect Brokerage Account
            {/* Generate URL and pick the  account ({prevPageURL}) */}
        </button>
    )
}
export default ConnectionURL;