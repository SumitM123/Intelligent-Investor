import React, { useEffect } from "react";
import {useState} from 'react';
import axios from 'axios';
import {UserContext, useUserContext} from '../Contexts/UserContext'
function DefensivePage () {
    const [stocks, setStocks] = useState(null);
    const userContext = useUserContext();

    /* 
        Diversifying Porfolio: Each stock is within on industry
            1) Information Technology
            2) Healthcare: Pharmaceuticals, biotech, medical devices, services.
            3) Financials: Banks, insurance, investment firms.
            4) Energy: Oil & gas, renewables, utilities.
            5) Industrials: Manufacturing, aerospace, construction.
            6) Consumer Staples: Food, beverages, household goods (less sensitive to economic dips).
            7) Consumer Discretionary: Retail, autos, entertainment (sensitive to economy).
            8) Real Estate: REITs, property development.
            9) Utilities: Electric, gas, water companies (often stable, dividend payers). 

        Based on the total amount of money, provide a diagram showing the proportion of portfolio 
        going towards investing in each industry
    */
    useEffect(() => {
        // This will be added as a query string. If you want to add it as a parameter, then directly just add it to URL
        const stocksArr = axios.get('/api/stocks/getStocks', {
            params: {
                ID: userContext.userID
            }
        })
        const bondsArr = axios.get('/api/stocks/getBonds')
    }, []);

    return (
        <h1>
            Defensive Page
        </h1>
    );
}

export default DefensivePage;