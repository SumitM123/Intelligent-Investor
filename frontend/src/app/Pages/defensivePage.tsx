import React, { useEffect } from "react";
import {useState} from 'react';
import axios from 'axios';
import {UserContext, useUserContext} from '../Contexts/UserContext'
function DefensivePage () {
    const [stocks, setStocks] = useState(null);
    const userContext = useUserContext();
    useEffect(() => {
        // This will be added as a query string. If you want to add it as a parameter, then directly just add it to URL
        const stocksArr = axios.get('/api/stocks/getStocks', {
            params: {
                ID: userContext.userID
            }
        })
    }, []);
    return (
        <h1>
            Defensive Page
        </h1>
    );
}

export default DefensivePage;