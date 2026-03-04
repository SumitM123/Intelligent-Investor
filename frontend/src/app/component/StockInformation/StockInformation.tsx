import React from "react";
import { useState } from "react";
/*
    Within the list, if clicked, it'll go to an alternative page for that specific stock, and essentially provide 
    what's needed in terms of the ratios and other essential metrics. It has one button inside, which is add to 
    include in the watchlist. Then, it'll start cumulating up the dividends. 
*/
type IncomeStatementInfo = {
    "fiscalDateEnding": string;
    "grossProfit": string;

}
function StockInformation(name : string) {
    const [incomeStatement, setIncomeStatement] = useState<IncomeStatementInfo>();
    async function retriveInformation() {
        let incomeStatementURL = `https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${name}&apikey=${process.env.ALPHA_VANTAGE_API}`;
        try {
            const incomeStatement = await fetch(incomeStatementURL);
            const incomeStatementJSON = await incomeStatement.json();
            const incomeStatementJSONQuarterly = incomeStatementJSON["quarterlyReports"];
        
        } catch (error) {
            console.error("Problem receiving the income statement of the stock" + (error as Error).message);
        }
        let balanceSheetURL = `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${name}&apikey=${process.env.ALPHA_VANTAGE_API}`;
        

    }
    return (
        <div>
            Replace this
        </div>
    );
};

export default StockInformation;