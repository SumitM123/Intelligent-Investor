"use client"

import { useState, useContext, createContext, Dispatch, SetStateAction, ReactNode } from 'react';

// `connectionID`, `accountID` and `prevPageURL` used to live here: the old wizard kept the
// SnapTrade connection in React state and routed off it, which is exactly why a refresh
// dead-ended on "Connection ID is missing". Connection state is now read live from
// `GET /api/snapTrade/connections`, so none of it belongs in context any more.
interface prevPageContext {
    uriGenerationString: string;
    setURIGenerationString: Dispatch<SetStateAction<string>>;
}

export const prevPageContext = createContext<prevPageContext | null>(null);

export function usePrevPageContext () {
    const context = useContext(prevPageContext);
    if (!context) {
        throw new Error("usePrevPageContext must be used within a PrevPageContextProvider");
    }
    return context;
}

export function PrevPageContextProvider({ children } : {children: ReactNode}) {
    const [uriGenerationString, setURIGenerationString] = useState("");
    const value = {
        uriGenerationString,
        setURIGenerationString,
    };

    return (
        <prevPageContext.Provider value={value}>
            {children}
        </prevPageContext.Provider>
    );
}
