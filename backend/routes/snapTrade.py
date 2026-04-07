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
    snapTrade_id: Annotated[str, Cookie(alias="snapTradeUserID")],
):
    print("SnapTrade_id being received" + snapTrade_id)
    snaptrade_usersecret_id = getSnapTradeSecretID(snapTrade_id)
    print("SnapTrade_id user secret being received" + snaptrade_usersecret_id)
    
    try:
        # Use official SDK so client credentials are sent correctly
        connection_response = snapTrade.authentication.login_snap_trade_user(
            user_id=str(snapTrade_id),
            user_secret=str(snaptrade_usersecret_id),
        )
    except Exception as exc:
        print("Error generating the URI" + str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "message": "Failed to reach SnapTrade login endpoint",
                "error": str(exc),
            },
        )

    # SDK responses keep JSON in .body; fall back to raw object in case signature differs
    connectionURLJSON = getattr(connection_response, "body", connection_response)

    # Guard against missing redirectURI so we fail gracefully instead of raising KeyError
    urlToClient = connectionURLJSON.get("redirectURI") if isinstance(connectionURLJSON, dict) else None
    if not urlToClient:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "message": "SnapTrade response did not include redirectURI",
                "response": connectionURLJSON,
            },
        )

    return {"redirectURI": urlToClient}

@router.get("/getAllAccountsFromConnection")
def getAllAccountsFromConnection(
    snapTrade_id: Annotated[str, Cookie(alias="snapTradeUserID")],
    connection_id: str,
):
    '''
        snaptrade_id: uuid, connection_id: str

        You have a table with schema snaptrade_id, connection_id, arrayOfAllAccounts
    '''
    # Resolve the SnapTrade secret first; if missing/invalid, fail with invalid request.
    try:
        snaptrade_usersecret_id = getSnapTradeSecretID(snapTrade_id)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid request: SnapTrade secret was not found for this user",
        )

    if not snaptrade_usersecret_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid request: SnapTrade secret was not found for this user",
        )

    # Fast path: return cached JSONB accounts by connection_id.
    with SessionLocal() as session:
        existing_row = session.execute(
            text(
                """
                SELECT accounts
                FROM snaptrade_connection_accounts
                WHERE connection_id = :connection_id
                LIMIT 1
                """
            ),
            {"connection_id": connection_id},
        ).first()

    if existing_row is not None:
        raw_accounts = existing_row[0] or []
        accountsForConnection = []

        # Ensure each entry is returned as an account object (dict).
        for account_json in raw_accounts:
            if isinstance(account_json, dict):
                accountsForConnection.append(account_json)
            else:
                try:
                    import json
                    accountsForConnection.append(json.loads(account_json))
                except Exception:
                    continue

        return {"accounts_connection": accountsForConnection}

    # Cache miss: fetch from SnapTrade, filter for this connection + USD, then persist.
    allAccountsFromAllConnection = snapTrade.account_information.list_user_accounts(
        user_id=snapTrade_id,
        user_secret=snaptrade_usersecret_id,
    ).body
    print("Successful getting the usersecret id and the all the accounts")
    print("All the accounts from all connection", allAccountsFromAllConnection)

    accountsForConnection = []
    for brokerageAccount in allAccountsFromAllConnection:
        if brokerageAccount["brokerage_authorization"] == connection_id and brokerageAccount["balance"]["total"]["currency"] == "USD":
            accountsForConnection.append(brokerageAccount)

    print("The accounts that are under the connection:", accountsForConnection)

    with SessionLocal() as session:
        try:
            import json

            session.execute(
                text(
                    """
                    INSERT INTO snaptrade_connection_accounts (snaptrade_id, connection_id, accounts)
                    VALUES (:snaptrade_id, :connection_id, CAST(:accounts AS jsonb))
                    ON CONFLICT (connection_id) DO UPDATE SET
                        snaptrade_id = EXCLUDED.snaptrade_id,
                        accounts = EXCLUDED.accounts
                    """
                ),
                {
                    "snaptrade_id": snapTrade_id,
                    "connection_id": connection_id,
                    "accounts": json.dumps(accountsForConnection),
                },
            )
            session.commit()
        except Exception:
            session.rollback()
            raise

    return {"accounts_connection": accountsForConnection}

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

