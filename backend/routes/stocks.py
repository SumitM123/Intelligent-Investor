from fastapi import APIRouter
from fastapi import Request
from pydantic import BaseModel
from fastapi import Response, status
import requests

router = APIRouter(prefix="/stocks")

@router.get('getStocks')
def get_stocks(user_id: str = None):
    if user_id == None:
        return {"Error": "There's no user ID that's bounded to the request"}
    '''
        Check if the user exists within the database in postgreSQL. If exists, then get their stocks

        You have a Users table. The user's table consists of the user_ID, and a header of stocks
            The stocks will be of type 'jsonb' datatype
        Stocks table: Each row consists of the stock name, the date of bought, how much bought, total amount bount, the price bought at, total dividends earned

    '''

    
