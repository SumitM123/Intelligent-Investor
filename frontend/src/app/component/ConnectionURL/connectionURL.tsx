"use client"
import React, { useEffect, useState } from "react";
import URIButton from "@/app/component/URIButton/uriButton";

interface ConnectionURLProps {
    prevPageURL: string;
    hasSnapTradeUser: boolean;
}

function ConnectionURL({ prevPageURL, hasSnapTradeUser }: ConnectionURLProps) {
    const [uriGenerated, setURIGenerated] = useState<string>("");

    async function generateURI() {
        try {
            const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
            const res = await fetch(`${apiBase}/api/snapTrade/generateConnectionPortal`, {
                method: "GET",
                credentials: "include",
            });
            if (!res.ok) {
                console.warn(`generateConnectionPortal failed: ${res.status}`);
                return "";
            }
            const data = (await res.json()) as { redirectURI?: string };
            return data?.redirectURI ?? "";
        } catch (e) {
            console.warn("Error generating the URI: " + (e as Error).message);
            return "";
        }
    }

    const loadURI = async () => {
        setURIGenerated(await generateURI());
    };

    useEffect(() => {
        if (!hasSnapTradeUser) return;
        void loadURI();
    }, [hasSnapTradeUser]);

    if (!hasSnapTradeUser) {
        return <a>Sign in to connect a brokerage</a>;
    }
    return (
        <div>
            {uriGenerated !== "" && <URIButton uriGenerated={uriGenerated} prevPageURLNav={prevPageURL} onRefresh={loadURI}/>}
            {uriGenerated === "" && <a> Receiving the URI to connect brokerage </a>}
        </div>
    );
}
export default ConnectionURL;
