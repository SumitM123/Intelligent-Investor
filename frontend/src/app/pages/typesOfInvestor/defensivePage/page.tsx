import { cookies } from "next/headers";
import StockSearchBar from "@/app/component/Stock Search Bar/StockSearchBar";
import ConnectionURL from "@/app/component/ConnectionURL/connectionURL";
import BondList, { type BondEntry } from "@/app/component/BondList/BondList";

export default async function DefensivePage() {
    const cookieStore = await cookies();
    const userIdCookie = cookieStore.get("user_id")?.value;
    const hasSnapTradeUser = !!cookieStore.get("snapTradeUserID")?.value;
    const apiBaseUrl = process.env.INTERNAL_API_BASE ?? "http://backend:8000";

    let initialBonds: BondEntry[] = [];
    if (userIdCookie) {
        try {
            const res = await fetch(
                `${apiBaseUrl}/api/bonds?is_defensive=true`,
                {
                    headers: { Cookie: `user_id=${userIdCookie}` },
                    cache: "no-store",
                },
            );
            if (res.ok) {
                const json = (await res.json()) as { bonds?: BondEntry[] };
                initialBonds = json.bonds ?? [];
            } else {
                console.error("defensivePage: failed to load bonds", res.status);
            }
        } catch (error) {
            console.error("defensivePage: error loading bonds", error);
        }
    }

    return (
        <div>
            <h1>Defensive Page</h1>
            <StockSearchBar />
            <ConnectionURL prevPageURL="defensive" hasSnapTradeUser={hasSnapTradeUser} />
            <BondList initialBonds={initialBonds} isDefensive={true} />
        </div>
    );
}
