from snapTradeInitialization import snapTrade
from fastapi import APIRouter
from fastapi import HTTPException
from fastapi import Request
from pydantic import BaseModel
from fastapi import Response, status
import uuid 
from uuid import UUID
from fastapi import Cookie
from typing import Annotated
from database import SessionLocal
from sqlalchemy import text
from frequenty_used_methods import getSnapTradeSecretID
import httpx

router = APIRouter(prefix="/api/snapTrade")

@router.post("/addUser")
def addUser(user_id: Annotated[UUID, Cookie()]):
    snaptrade_id = None
    user_secret = None
    # adding snaptrade_id and user_secret to database
    with SessionLocal() as session:
        # checking if user exists
        try:
            existing_user = session.execute(
                text(
                    """
                    SELECT snaptrade_id, snaptrade_usersecret_id
                    FROM public.snaptrade_id
                    WHERE user_id = :user_id
                    LIMIT 1
                    """
                ),
                {"user_id": user_id},
            ).first()

            if existing_user is None:
                # based on the str, create a uuid and append the value to snapTrade. Get a key from snapTrade and store in the database
                snaptrade_id = uuid.uuid4()
                register_response = snapTrade.authentication.register_snap_trade_user(user_id=str(user_id))
                user_secret = register_response.body["userSecret"]
                
                # based on the type of the user, change the schema of the snaptrade_id table for the specific column
                print(type(user_secret))
                # user secret is of type string
                session.execute(
                    text(
                        """
                        INSERT INTO public.snaptrade_id (user_id, snaptrade_id, snaptrade_usersecret_id)
                        VALUES (:user_id, :snaptrade_id, :snaptrade_usersecret_id)
                        """
                    ),
                    {
                        "user_id": user_id,
                        "snaptrade_id": snaptrade_id,
                        "snaptrade_usersecret_id": user_secret,
                    },
                )
            else:
                snaptrade_id = existing_user[0]
                user_secret = existing_user[1]

            session.commit()
        except Exception:
            session.rollback()
            raise

    return {
        "user_id": str(user_id),
        "snaptrade_id": str(snaptrade_id),
    }
    
@router.get("/generateConnectionPortal")
def generateConnectionPortal(user_id: Annotated[UUID, Cookie()], snapTrade_id: Annotated[str, Cookie()]):

    snaptrade_usersecret_id = getSnapTradeSecretID(user_id, snapTrade_id)

    generateConnectionURLRequest = httpx.post("https://api.snaptrade.com/api/v1/snapTrade/login", user_id=str(user_id), user_secret=str(snaptrade_usersecret_id))
    
    connectionURLJSON = generateConnectionURLRequest.json()

    urlToClient = connectionURLJSON.body["redirectURI"]
    return {
        "redirectURI": urlToClient
    }

@router.get("/getAllAccountsFromConnection")
def getAllAccountsFromConnection(snapTrade_id: Annotated[str, Cookie()]):
    snaptrade_usersecret_id = getSnapTradeSecretID(snapTrade_id)

    allAccountsFromAllConnection =  snaptrade.accountInformation.listUserAccounts(
        
