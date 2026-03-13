"use client"

import { useState, useContext, createContext, Dispatch, SetStateAction, ReactNode } from 'react';
interface prevPageContext {
    prevPageURL: string;
    setPrevPage: Dispatch<SetStateAction<string>>;
    connectionID: string;
    setConnectionID: Dispatch<SetStateAction<string>>;
}
export const prevPageContext = createContext<prevPageContext | null>(null);
export function usePrevPageContext () {
    const context = useContext(prevPageContext);
    if (!context) {
        throw new Error("useUserContext must be used within a UserContextProvider");
    }
    return context;
}
export function PrevPageContextProvider({ children } : {children: ReactNode}) {
    const [prevPage, setPrevPage] = useState("No value");
    const [connectionID, setConnectionID] = useState("No value");
    const value = { prevPageURL: prevPage, setPrevPage, connectionID: connectionID, setConnectionID};
    
    return (
        <prevPageContext.Provider value={value}> 
            {children} 
        </prevPageContext.Provider>
    );
}