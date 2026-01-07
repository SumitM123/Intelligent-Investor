from fastapi import APIRouter
from fastapi import Request
from pydantic import BaseModel
from fastapi import Response, status
from database import SessionLocal
from frequenty_used_methods import get_user_id
router = APIRouter(prefix="/api/stocks")
class User(BaseModel):
    google_id: str = None
@router.get('getStocks')
def get_stocks(user: User = None, response: Response = None) -> Any:
    if user.google_id == None:
        return {"Error": "There's no user ID that's bounded to the request"}
    '''
        Check if the user exists within the database in postgreSQL. If exists, then get their stocks

        You have a Users table. The user's table consists of the user_ID, and a header of stocks
            The stocks will be of type 'jsonb' datatype
        Stocks table: Each row consists of the stock name, the date of bought, how much bought, total amount bount, the price bought at, total dividends earned
    '''
    user_id = get_user_id()
    if user_id == None:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return JSONResponse(content={"Error": "Not a valid google_id was provided"})
    
    # with SessionLocal() as session:
    #     result = session.execute(text("SELECT user_id FROM users_id WHERE google_id = :google_id"), 
    #                     {"google_id": stock.google_id})
    #     user_id = result.google_id

        


    
