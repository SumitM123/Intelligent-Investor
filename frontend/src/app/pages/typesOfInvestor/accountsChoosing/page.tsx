/*
    1) Ensure that the brokerage account that the user made a connection with is a USD account.
        - Preferred: have a brokerage account that also has access to bonds
    2) Get all the accounts that are within the connection
*/
"use client"
import { usePrevPageContext } from "@/app/context/prevPageURL";
import { useEffect, useState } from "react";
function listAllAccounts() {
    const [allAccounts, setAllAccounts] = useState([]);
    //contains the prevPageURL and the connectionID
    const accountListingContext = usePrevPageContext();
    useEffect(() => {
        // Get all the accounts from all the connections
        const gettingRelevantAccounts = async () => {
            try {
                const params = new URLSearchParams();
                params.append("connection_id", accountListingContext.connectionID);
                const response = await fetch(`http://backend:8000/api/snapTrade/getAllAccountsFromConnection?${params}`, {
                    credentials: "include"
                });  
                const resJSON = await response.json();
                setAllAccounts(resJSON);
            } catch (err) {
                console.error("Error getting the accounts to the relevant connection" + (err as Error).message)
            }
        }
        void gettingRelevantAccounts();

    }, []);
}
export default listAllAccounts;