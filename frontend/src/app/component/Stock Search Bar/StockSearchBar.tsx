'use client'
import React from "react";
import { useState } from "react";
import { useEffect } from "react";

type StockMatch = {
    symbol: string;
    name: string;
    currency: string;
};

function StockSearchBar() {
    const [stocks, setStocks] = useState<StockMatch[]>([]);
    const [searchItem, setSearchItem] = useState("");

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchItem(event.target.value);
    };

    async function getStocks(url: string) {
        try {
            const response = await fetch(url);
            const arrJSON = await response.json();

            if (!arrJSON?.bestMatches) {
                setStocks([]);
                return;
            }

            const sizeMin = Math.min(arrJSON["bestMatches"].length, 5);
            const nextStocks: StockMatch[] = [];

            for (let i = 0; i < sizeMin; i++) {
                const currentObject = arrJSON["bestMatches"][i];
                nextStocks.push({
                    symbol: currentObject["1. symbol"],
                    name: currentObject["2. name"],
                    currency: currentObject["8. currency"],
                });
            }

            setStocks(nextStocks);
        } catch (error) {
            console.error((error as Error).message);
            setStocks([]);
        }
    }

    useEffect(() => {
        const trimmedSearch = searchItem.trim();

        if (!trimmedSearch) {
            setStocks([]);
            return;
        }

        const timer = setTimeout(() => {
            const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(trimmedSearch)}&apikey=${process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API}&datatype=json`;
            getStocks(url);
        }, 500);

        return () => clearTimeout(timer);
    }, [searchItem]);

    return (
        <div>
            <input
                type="text"
                value={searchItem}
                onChange={handleChange}
                placeholder="Search for Stock"
            />

            {searchItem.trim() !== "" && stocks.length > 0 && (
                <ul>
                    {stocks.map((stock) => (
                        <li key={`${stock.symbol}-${stock.name}`}>
                            {stock.symbol} - {stock.name} ({stock.currency})
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
export default StockSearchBar;