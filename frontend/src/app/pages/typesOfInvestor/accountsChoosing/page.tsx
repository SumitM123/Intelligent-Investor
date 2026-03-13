/*
    1) Ensure that the brokerage account that the user made a connection with is a USD account.
        - Preferred: have a brokerage account that also has access to bonds
    2) Get all the accounts that are within the connection
*/
"use client"
import { usePrevPageContext } from "@/app/context/prevPageURL";
import { useEffect, useState } from "react";

interface BrokerageAccount {
    id: string;
    name: string;
}

function listAllAccounts() {
    const [allAccounts, setAllAccounts] = useState<BrokerageAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>("");
    //contains the prevPageURL and the connectionID
    const accountListingContext = usePrevPageContext();

    useEffect(() => {
        if (!accountListingContext.connectionID || accountListingContext.connectionID === "No value") {
            setError("Connection ID is missing. Please connect a brokerage account first.");
            setIsLoading(false);
            return;
        }
        const receivedAccountInformation = async () => {
            try {
                const params = new URLSearchParams();
                params.append("account_id", selectedAccountId);
                const res = await fetch(`http://backend:8000/api/snapTrade/accountInformation?${params}`);
                
            } catch (err) {
                const message = (err as Error).message;
                setError("Error getting account information.");
                console.error("Error getting account information." + message)
            } 
        }
        // Get all the accounts from all the connections
        const gettingRelevantAccounts = async () => {
            try {
                const params = new URLSearchParams();
                params.append("connection_id", accountListingContext.connectionID);
                const response = await fetch(`http://backend:8000/api/snapTrade/getAllAccountsFromConnection?${params}`, {
                    credentials: "include"
                });  

                if (!response.ok) {
                    throw new Error(`Request failed with status ${response.status}`);
                }

                const resJSON = await response.json();
                const fetchedAccounts = (resJSON["accounts_connection"] ?? []) as BrokerageAccount[];
                setAllAccounts(fetchedAccounts);

                if (fetchedAccounts.length === 0) {
                    setError("There are no USD accounts for this specific connection to the brokerage. Please select another brokerage to connect with.");
                }

                if (fetchedAccounts.length > 0) {
                    setSelectedAccountId(fetchedAccounts[0].id);
                }
            } catch (err) {
                const message = (err as Error).message;
                setError("Error getting the accounts for the selected connection.");
                console.error("Error getting the accounts to the relevant connection: " + message)
            } finally {
                setIsLoading(false);
            }
        }

        void gettingRelevantAccounts();

    }, [accountListingContext.connectionID]);

    return (
        <div>
            <h2>Select an account to connect</h2>

            {isLoading && <p>Loading accounts...</p>}

            {!isLoading && error && <p>{error}</p>}

            {!isLoading && !error && allAccounts.length === 0 && (
                <p>No accounts were found for this connection.</p>
            )}

            {!isLoading && !error && allAccounts.length > 0 && (
                <>
                    <select
                        value={selectedAccountId}
                        onChange={(event) => setSelectedAccountId(event.target.value)}
                    >
                        {allAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                                {account.name}
                            </option>
                        ))}
                    </select>
                    <button type="button" onClick={() => {

                    }}>Select</button>
                </>
            )}
        </div>
    );

}
export default listAllAccounts;