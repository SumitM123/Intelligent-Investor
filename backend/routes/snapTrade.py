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
                    FROM snaptrade_id
                    WHERE user_id = :user_id
                    LIMIT 1
                    """
                ),
                {"user_id": user_id},
            ).first()

            # user doesn't exist
            if existing_user is None:
                # based on the str, create a uuid and append the value to snapTrade. Get a key from snapTrade and store in the database
                snaptrade_id = uuid.uuid4()
                # I'm getting an error here where user_id already exists?? 
                register_response = snapTrade.authentication.register_snap_trade_user(user_id=str(snaptrade_id))
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
def generateConnectionPortal(
    user_id: Annotated[UUID, Cookie()],
    snapTrade_id: Annotated[str, Cookie(alias="snapTradeUserID")],
):

    snaptrade_usersecret_id = getSnapTradeSecretID(snapTrade_id)

    generateConnectionURLRequest = httpx.post(
        "https://api.snaptrade.com/api/v1/snapTrade/login",
        json={"userId": str(snapTrade_id), "userSecret": str(snaptrade_usersecret_id)},
    )
    
    connectionURLJSON = generateConnectionURLRequest.json()

    urlToClient = connectionURLJSON["redirectURI"]
    return {
        "redirectURI": urlToClient
    }

@router.get("/getAllAccountsFromConnection")
def getAllAccountsFromConnection(
    snapTrade_id: Annotated[str, Cookie(alias="snapTradeUserID")],
    connection_id: str,
):
    snaptrade_usersecret_id = getSnapTradeSecretID(snapTrade_id)
    allAccountsFromAllConnection = snapTrade.account_information.list_user_accounts(user_id=snapTrade_id, user_secret=snaptrade_usersecret_id).body
    # get's all the valid accounts of the USD currency and within the right connection
    accountsForConnection = []
    for brokerageAccount in allAccountsFromAllConnection:
        if brokerageAccount["brokerage_authorization"] == connection_id and brokerageAccount["balance"]["total"]["currency"] == "USD":
            accountsForConnection.append[brokerageAccount]
    return {"accounts_connection" : accountsForConnection}

@router.get("/accountInformation")
def getAccountInformation(
    snapTrade_id: Annotated[str, Cookie(alias="snapTradeUserID")],
    account_id: str,
):
    snaptrade_usersecret_id = getSnapTradeSecretID(snapTrade_id)
    # may have to change the method name
    account_information = snapTrade.account_information.get_user_account_details(
        user_id=snapTrade_id,
        user_secret=snaptrade_usersecret_id,
        account_id=account_id
    )
    return {"account_information": account_information.body}

