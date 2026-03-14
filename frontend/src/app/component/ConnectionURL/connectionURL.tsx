"use client"
import React, { useEffect } from "react";
import { useState } from "react";
import URIButton from "@/app/component/URIButton/uriButton";
import { usePrevPageContext } from "@/app/context/prevPageURL";
// import { useUserContext } from "@/app/context/UserContext";
// The prevPageURl is the URL to go back to once it's been finished
interface ConnectionURLProps {
    prevPageURL: string;
}

//MAKE THE ENTIRE BUTTON AS A SEPERATE CLIENT COMPONENT WHERE IT TAKES INTO THE CONTEXT. THIS FILE
// SHOULD BE A SERVER COMPONENT, SO IT NEEDS TO MAKE REQUEST TO THE BACKEND

function ConnectionURL({ prevPageURL }: ConnectionURLProps) {
    const [uriGenerated, setURIGenerated] = useState<string>("");
    
    async function generateURI() {
        let data: { redirectURI?: string } | null = null;
        try {
            const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
            const res = await fetch(`${apiBase}/api/snapTrade/generateConnectionPortal`, {
                method: "GET",
                credentials: "include", // needed if backend reads cookies
            });

            if (!res.ok) throw new Error(`Request failed: ${res.status}`);
            data = await res.json();
            } catch (e) {
                console.error("Error generating the URI" + (e as Error).message);
            } 
        return data?.redirectURI ?? "";
    }
    useEffect(() => {
        const loadURI = async () => {
            setURIGenerated(await generateURI());
        };

        void loadURI();    
    }, []);
    return (
        <div>
            {uriGenerated !== "" && <URIButton uriGenerated={uriGenerated} prevPageURLNav={prevPageURL}/>}
            {uriGenerated === "" && <a> Receiving the URI to connect brokerage </a>}
        </div>
    );
};
export default ConnectionURL;