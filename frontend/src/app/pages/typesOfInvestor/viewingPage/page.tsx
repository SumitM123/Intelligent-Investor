import { cookies } from "next/headers";

interface ViewingPageProps {
	searchParams?: Promise<{
		accountID?: string;
	}>;
}

export default async function ViewingPage({ searchParams }: ViewingPageProps) {
	const resolvedSearchParams = searchParams ? await searchParams : undefined;
	const accountID = resolvedSearchParams?.accountID ?? "";
	const apiBaseUrl = process.env.INTERNAL_API_BASE ?? "http://backend:8000";

	let accountInformation: unknown = null;
	let accountError = "";

	if (accountID) {
		try {
			const cookieStore = await cookies();
			const snapTradeCookie = cookieStore.get("snapTradeUserID")?.value;
			const params = new URLSearchParams();
			params.append("account_id", accountID);

			const response = await fetch(`${apiBaseUrl}/api/snapTrade/accountInformation?${params.toString()}`, {
				headers: snapTradeCookie ? { Cookie: `snapTradeUserID=${snapTradeCookie}` } : undefined,
				cache: "no-store",
			});

			if (!response.ok) {
				const errorBody = await response.text();
				console.error("accountInformation fetch failed", {
					status: response.status,
					body: errorBody,
				});
				throw new Error(`Request failed with status ${response.status}`);
			}

			const json = (await response.json()) as { account_information?: unknown };
			console.log("account_information response body:", json.account_information);
			accountInformation = json.account_information ?? null;
		} catch (error) {
			console.error("Error loading account information", error);
			accountError = error instanceof Error ? error.message : "Failed to fetch account information";
		}
	} else {
        
    }

	return (
		<div>
			<h1>Viewing Page</h1>
			<p>Selected account ID: {accountID || "No account selected"}</p>
			{accountError && <p>Error loading account information: {accountError}</p>}
			{!accountError && accountInformation !== null && (
				<pre>{JSON.stringify(accountInformation, null, 2)}</pre>
			)}
        </div>
	);
}
