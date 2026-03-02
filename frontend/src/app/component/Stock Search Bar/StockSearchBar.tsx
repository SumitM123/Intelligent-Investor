'use client'
import React from "react";
import { useState } from "react";
import { useEffect } from "react";
function StockSearchBar() {
    // Each stock will consist of this tuple: (Symbol, name, and currency)
    const [stocks, setStocks] = useState([null]);
    const [searchItem, setSearchItem] = useState("Search for Stock");
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchItem(event.target.value);
    };
    async function getStocks(url : string) {
        try {
            setStocks([]);
            const response = await fetch(url);
            const arrJSON = await response.json();
            const sizeMin = Math.min(arrJSON["bestMatches"].length, 5)
            for (let i = 0; i < sizeMin; i++) {
                const currentObject = arrJSON["bestMatches"][i];
                setStocks([...stocks, (currentObject["1. symbol"], currentObject["2. name"], currentObject["8. currency"])]);
            }
        } catch(error) {
            console.error((error as Error).message);
        }
    }
    useEffect( () => {
        //after half a second of no change from searchItem and the value doesn't equal "Search for Stocks", then make request to backend
        var beforeString = searchItem;
        var afterString;
        const timer = setInterval(() => {
            afterString = searchItem;
            if (beforeString === afterString) {
                // call the API to get stocks
                var url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${searchItem}&apikey=${process.env.ALPHA_VANTAGE_API}&datatpye=json`;
                getStocks(url);
            }
        }, 500)
    }, [searchItem]);
    return (
        <input type="text" value={searchItem} onChange={handleChange}> {searchItem}</input>
    );
}
export default StockSearchBar();