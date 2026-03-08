from snapTradeInitialization import snapTrade
from fastapi import APIRouter
from fastapi import Request
from pydantic import BaseModel
from fastapi import Response, status
import uuid 
from uuid import UUID
from fastapi import Cookie
from typing import Annotated
router = APIRouter(prefix="/api/snapTrade")

# 
@router.post("/addUser")
def addUser(user_id: Annotated[UUID, Cookie()]):
    # based on the str, create a uuid and append the value to snapTrade. Get a key from snapTrade and store in the database
    snap_trade_id = uuid.uuid4()
    register_response = snapTrade.authentication.register_snap_trade_user(user_id=user_id)
    user_secret = register_response.body["userSecret"]
    
    # based on the type of the user, change the schema of the snaptrade_id table for the specific column
    print(type(user_secret))
    # add the values to the snaptrade_id table in side the database. Use sessionLocal to do so
 
    
    # the userID and user_secret need to passed for API calls. Maybe add it to the cookies