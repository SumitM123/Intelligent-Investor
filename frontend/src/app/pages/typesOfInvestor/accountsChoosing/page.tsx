/*
    1) Ensure that the brokerage account that the user made a connection with is a USD account.
        - Preferred: have a brokerage account that also has access to bonds
    2) Get all the accounts that are within the connection
*/
"use client"
import { usePrevPageContext } from "@/app/context/prevPageURL";
import { useEffect, useState } from "react";
function listAllAccounts() {
    // useEffect( () => {
    
    // }, []);
    const [allAccounts, setAllAccounts] = useState([]);
    //
    //contains the prevPageURL and the connectionID
    const accountListingContext = usePrevPageContext();

    useEffect(() => {
        // Get all the accounts from all the connections
        const gettingAllAccounts = async () => {
            try {
                const 
            }
        }
    }, []);
}
export default listAllAccounts;