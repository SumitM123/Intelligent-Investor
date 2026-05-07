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
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import re

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

'''
    The purpose of this endpoint is to provide how much money is invested for each security within the connected account. Then, 
    based on the stock, show you the proportion of money for common stocks, and high-grade bonds. 

    Create a GET route in it would take in accountID as query parameters. The snaptrade_id would be 
    included inside the header stored inside of a cookie.  Then, inside the method first retrive snaptrade_usersecret_id 
    by calling the getSnapTradeSecretID() method and input the snaptrade_id argument inside the parenthesis. If the usersecret id 
    doesn't exist, then return an HTTP exception with the respective status code for the particular matter. If it exists, then 
    continue on with the method. 

    Based on the snaptrade API, make a request so that it first receives the balance of the account. initialize two array variables: stock
    and bond. Then, once you do that, itereate through all the securities that the account holds.  As you iterate, check if it's a bond or a stock. 
    If it's a bond, append it to the bond array as well as the amount of money invested in that bond as a tuple, for example ("bond", amount of money)
    and do the same for stock. Once that's done for all the securities that the account holds do the next step.

    For each of the bond. Based on bond get the ISIN then input ISIN to xpressapi to get bond-grade. 
    Based on the snaptrade API, make a request to the .get_user_account_positions() method. 
'''
@router.get("/get_user_account_positions")


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

    snapTrade.account_information.get_user_account_positions()
    return {"account_information": account_information.body}


'''
Create a GET route in it would take in accountID, and stock symbol as query parameters. The snaptrade_id would be 
    included inside the header stored inside of a cookie.  Then, inside the method first retrive snaptrade_usersecret_id 
    by calling the getSnapTradeSecretID() method and input the snaptrade_id argument inside the parenthesis. If the usersecret id 
    doesn't exist, then return an HTTP exception with the respective status code for the particular matter. If it exists, then 
    continue on with the method. 

    Dividends table schema: account_id: string, stock_symbol: string, infomation: Array[dividend_info], late_checked: TIMESTAMPTZ

    Make a query to the database trying to find the entry with the specific account_id. 
        If not being able to find the row:
            1) Make a request to the account_information.get_account_activities() method with the necessary parameters, such as 
            account_id, user_id, user_secret. Set the start_date to be the since account_creation make sure it's in the right format. 
            And set end_date to the time of the request. Again, set it such that it's in the right format. The type should be of DIVIDEND.
            2) Once the object is retrived, go through every single element inside the data property, and ensure that the symbol is the same 
            symbol as the stock symbol that's provided as the argument. If it's the same symbol, append a tuple of (amount, DPS, units, trade_date)
            to an array. 
            3) After doing so, create a new entry inside the dividends table with the respective information based on the schema
            4) Then, return the row
        else:
            return the row
    
    After getting the specific row, I want you to return the information column with the right structure.

    *** Important: Ensure that all the dates are time-zone aware and that the time-zone is converted to the same timezone as the
    one on wallstreet if not already. 

'''
@router.get("/getDividends")
def getDividends(
    snapTrade_id: Annotated[str, Cookie(alias="snapTradeUserID")],
    accountID: str,
    stock_symbol: str,
):
    # Basic ticker validation: alphanumeric plus common exchange separators like "." and "-".
    normalized_symbol = stock_symbol.strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9.\-]{0,24}", normalized_symbol):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid request: stock_symbol is invalid",
        )

    wall_street_tz = ZoneInfo("America/New_York")

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
    
    def _read_cached_row(session):
        return session.execute(
            text(
                """
                SELECT account_id, stock_symbol, last_checked,
                       COALESCE((
                           SELECT jsonb_agg(
                               jsonb_build_object(
                                   'amount_earned', (d).amount_earned,
                                   'dps', (d).dps,
                                   'units', (d).units,
                                   'trade_date', (d).trade_date
                               )
                           )
                           FROM unnest(information) AS d
                       ), '[]'::jsonb) AS information
                FROM snaptrade_dividends
                WHERE account_id = :account_id AND stock_symbol = :stock_symbol
                LIMIT 1
                """
            ),
            {"account_id": accountID, "stock_symbol": stock_symbol},
        ).first()

    with SessionLocal() as session:
        existing_row = _read_cached_row(session)
        if existing_row is not None:
            return {
                "account_id": existing_row[0],
                "stock_symbol": existing_row[1],
                "last_checked": existing_row[2],
                "information": existing_row[3] or [],
            }

    # Cache miss: fetch dividend activities and persist them.

    # This is to get when the account was created to start from the beginning. This occurs only when the entry didn't exist initially
    account_detail_response = snapTrade.account_information.get_user_account_details(
        user_id=snapTrade_id,
        user_secret=snaptrade_usersecret_id,
        account_id=accountID,
    )
    account_details = account_detail_response.body or {}

    created_date_raw = account_details.get("created_date")
    start_dt = None
    if isinstance(created_date_raw, datetime):
        start_dt = created_date_raw
    elif isinstance(created_date_raw, str):
        try:
            start_dt = datetime.fromisoformat(created_date_raw.replace("Z", "+00:00"))
        except ValueError:
            start_dt = None

    if start_dt is None:
        start_dt = datetime.now(timezone.utc) - timedelta(days=3650)

    if start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=timezone.utc)

    now_dt = datetime.now(timezone.utc)

    activities_response = snapTrade.account_information.get_account_activities(
        account_id=accountID,
        user_id=snapTrade_id,
        user_secret=snaptrade_usersecret_id,
        start_date=start_dt.date(),
        end_date=now_dt.date(),
        type="DIVIDEND",
        limit=1000,
    )
    activities_body = activities_response.body or {}
    activities = activities_body.get("data", []) if isinstance(activities_body, dict) else []

    requested_symbol = normalized_symbol
    dividend_tuples = []

    for activity in activities:
        if activity.get("type") != "DIVIDEND":
            continue

        activity_symbol = activity.get("symbol") or {}
        ticker = (activity_symbol.get("symbol") or "").upper()
        raw_ticker = (activity_symbol.get("raw_symbol") or "").upper()
        if requested_symbol not in {ticker, raw_ticker}:
            continue

        amount = activity.get("amount")
        units = activity.get("units")
        dps = None
        if amount is not None and units not in (None, 0):
            dps = float(amount) / float(units)

        trade_date_raw = activity.get("trade_date")
        trade_date_dt = None
        if isinstance(trade_date_raw, datetime):
            trade_date_dt = trade_date_raw
        elif isinstance(trade_date_raw, str):
            try:
                trade_date_dt = datetime.fromisoformat(trade_date_raw.replace("Z", "+00:00"))
            except ValueError:
                trade_date_dt = None

        if trade_date_dt is None:
            continue

        if trade_date_dt.tzinfo is None:
            trade_date_dt = trade_date_dt.replace(tzinfo=timezone.utc)
        trade_date_dt = trade_date_dt.astimezone(wall_street_tz)

        dividend_tuples.append(
            {
                "amount_earned": amount,
                "dps": dps,
                "units": units,
                "trade_date": trade_date_dt,
            }
        )

    with SessionLocal() as session:
        try:
            session.execute(
                text(
                    """
                    INSERT INTO snaptrade_dividends (account_id, stock_symbol, information, last_checked)
                    VALUES (:account_id, :stock_symbol, ARRAY[]::dividend_info[], NOW())
                    ON CONFLICT (account_id, stock_symbol) DO UPDATE SET
                        last_checked = NOW()
                    """
                ),
                {"account_id": accountID, "stock_symbol": stock_symbol},
            )

            for item in dividend_tuples:
                session.execute(
                    text(
                        """
                        UPDATE snaptrade_dividends
                        SET information = array_append(
                                information,
                                ROW(:amount_earned, :dps, :units, :trade_date)::dividend_info
                            ),
                            last_checked = NOW()
                        WHERE account_id = :account_id
                          AND stock_symbol = :stock_symbol
                        """
                    ),
                    {
                        "amount_earned": item["amount_earned"],
                        "dps": item["dps"],
                        "units": item["units"],
                        "trade_date": item["trade_date"],
                        "account_id": accountID,
                        "stock_symbol": stock_symbol,
                    },
                )

            session.commit()
        except Exception:
            session.rollback()
            raise

        inserted_row = _read_cached_row(session)

    if inserted_row is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store dividend information",
        )

    return {
        "account_id": inserted_row[0],
        "stock_symbol": inserted_row[1],
        "last_checked": inserted_row[2],
        "information": inserted_row[3] or [],
    }

'''
Create a PUT route in which it would take in accountID, and stock symbol as query parameters. The snaptrade_id would be 
included inside the header stored inside of a cookie.  Then, inside the method first retrive snaptrade_usersecret_id 
by calling the getSnapTradeSecretID() method and input the snaptrade_id argument inside the parenthesis. If the usersecret id 
doesn't exist, then return an HTTP exception with the respective status code for the particular matter. If it exists, then 
continue on with the method. 

If stock symbol is invalid, then return a HTTPException.

The objective of this route is to update the information column inside the dividends table for the particular accountID, and stock symbol. 
Here is what I want you to do step by step
    1) Ensure that the row exists in the snaptrade_dividends table by searching for the row with the same accountID and stock symbol.
        - If doesn't exist, then return a string saying "Don't own this stock"
    2) Once you see that it exists, get the last_checked value for that row. Convert it into a datatime object with timezone-aware and 
    convert it into the New York timezone. Let this variable name be last_updated_time. 
    3) Call the get_account_activities(). When calling this method, set the start_time to the date that was retrieved from previous step
    and set the end date to the date of the current time of when the route is called. Once called, iterate through data property of the 
    object that was returned and for each element, check if the trade_date property. Convert the trade_date to the same timezone as the 
    one that we converted to in step 2. Then, if the property value is more recent than the last_updated_time variable, get the following 
    properties of amount_earned, units, trade_date, and stock_symbol and place them into a tuple. Then, append this tuple to an array.
    Do this while the last_updated_time is less recent than the current trade_date property of the element. If not, then stop the iteration
    4) After the iteration is done, for each of the tuple from the array, convert it to of 'information' type from the snaptrade_dividends table
    and then append it to the information column of the entry in which account_id and stock_symbol are matched from the arguments of the method
    calling. 
    5) Update the last_checked property of the entry to the current time. 
    
'''

# "IMPORTANT: ENSURE THAT THE TIME IS INSERTED PROPERTY TO THE RIGHT METHOD. AND CONVERT THE 'information' COLUMN
# OF THE snaptrade_dividends TABLE SO THAT IT DOESN'T CONTAIN DUPLICATE ELEMENTS AND THAT EVERYTHING IS FINE"
@router.put("/updateDividends")
def updateDividends(
    snapTrade_id: Annotated[str, Cookie(alias="snapTradeUserID")],
    accountID: str,
    stock_symbol: str,
):
    normalized_symbol = stock_symbol.strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9.\-]{0,24}", normalized_symbol):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid request: stock_symbol is invalid",
        )

    wall_street_tz = ZoneInfo("America/New_York")

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

    def _read_row(session):
        return session.execute(
            text(
                """
                SELECT account_id, stock_symbol, last_checked,
                       COALESCE((
                           SELECT jsonb_agg(
                               jsonb_build_object(
                                   'amount_earned', (d).amount_earned,
                                   'dps', (d).dps,
                                   'units', (d).units,
                                   'trade_date', (d).trade_date
                               )
                           )
                           FROM unnest(information) AS d
                       ), '[]'::jsonb) AS information
                FROM snaptrade_dividends
                WHERE account_id = :account_id
                  AND UPPER(stock_symbol) = :stock_symbol
                LIMIT 1
                """
            ),
            {"account_id": accountID, "stock_symbol": normalized_symbol},
        ).first()

    with SessionLocal() as session:
        existing_row = _read_row(session)
        if existing_row is None:
            return {"message": "Don't own this stock"}

        last_checked_raw = existing_row[2]
        if isinstance(last_checked_raw, datetime):
            last_updated_time = last_checked_raw
        elif isinstance(last_checked_raw, str):
            last_updated_time = datetime.fromisoformat(last_checked_raw.replace("Z", "+00:00"))
        else:
            last_updated_time = datetime.now(timezone.utc) - timedelta(days=3650)

        if last_updated_time.tzinfo is None:
            last_updated_time = last_updated_time.replace(tzinfo=timezone.utc)
        last_updated_time = last_updated_time.astimezone(wall_street_tz)

    current_time = datetime.now(timezone.utc).astimezone(wall_street_tz)

    activities_response = snapTrade.account_information.get_account_activities(
        account_id=accountID,
        user_id=snapTrade_id,
        user_secret=snaptrade_usersecret_id,
        start_date=last_updated_time.date(),
        end_date=current_time.date(),
        type="DIVIDEND",
        limit=1000,
    )
    activities_body = activities_response.body or {}
    activities = activities_body.get("data", []) if isinstance(activities_body, dict) else []

    parsed_activities = []
    for activity in activities:
        if activity.get("type") != "DIVIDEND":
            continue

        activity_symbol = activity.get("symbol") or {}
        ticker = (activity_symbol.get("symbol") or "").upper()
        raw_ticker = (activity_symbol.get("raw_symbol") or "").upper()
        if normalized_symbol not in {ticker, raw_ticker}:
            continue

        trade_date_raw = activity.get("trade_date")
        trade_date_dt = None
        if isinstance(trade_date_raw, datetime):
            trade_date_dt = trade_date_raw
        elif isinstance(trade_date_raw, str):
            try:
                trade_date_dt = datetime.fromisoformat(trade_date_raw.replace("Z", "+00:00"))
            except ValueError:
                trade_date_dt = None

        if trade_date_dt is None:
            continue

        if trade_date_dt.tzinfo is None:
            trade_date_dt = trade_date_dt.replace(tzinfo=timezone.utc)
        trade_date_dt = trade_date_dt.astimezone(wall_street_tz)
        parsed_activities.append((trade_date_dt, activity))

    # Ensure newest-to-oldest ordering so break condition is safe.
    parsed_activities.sort(key=lambda item: item[0], reverse=True)

    new_dividend_tuples = []
    for trade_date_dt, activity in parsed_activities:
        if trade_date_dt <= last_updated_time:
            break

        amount = activity.get("amount")
        units = activity.get("units")
        dps = None
        if amount is not None and units not in (None, 0):
            dps = float(amount) / float(units)

        # Tuple requested: amount, units, trade_date, stock_symbol (plus dps for storage schema).
        new_dividend_tuples.append((amount, dps, units, trade_date_dt, normalized_symbol))

    with SessionLocal() as session:
        try:
            for amount, dps, units, trade_date_dt, _stock_symbol in new_dividend_tuples:
                session.execute(
                    text(
                        """
                        UPDATE snaptrade_dividends
                        SET information = array_append(
                                information,
                                ROW(:amount_earned, :dps, :units, :trade_date)::dividend_info
                            )
                        WHERE account_id = :account_id
                          AND UPPER(stock_symbol) = :stock_symbol
                        """
                    ),
                    {
                        "amount_earned": amount,
                        "dps": dps,
                        "units": units,
                        "trade_date": trade_date_dt,
                        "account_id": accountID,
                        "stock_symbol": normalized_symbol,
                    },
                )

            session.execute(
                text(
                    """
                    UPDATE snaptrade_dividends
                    SET last_checked = NOW()
                    WHERE account_id = :account_id
                      AND UPPER(stock_symbol) = :stock_symbol
                    """
                ),
                {"account_id": accountID, "stock_symbol": normalized_symbol},
            )

            session.commit()
        except Exception:
            session.rollback()
            raise

        updated_row = _read_row(session)

    if updated_row is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update dividend information",
        )

    return {
        "account_id": updated_row[0],
        "stock_symbol": updated_row[1],
        "last_checked": updated_row[2],
        "information": updated_row[3] or [],
    }

    
'''
    Architecture:
        1) Make a request to an API to get the payment date for dividend in the general market
        for stocks. This is going to be a scheduler starting every year
        2) Once that scheduler is given a value, then based on the values, we make another scheduler
        that'll run during those given value times
        3) In of the times, it'll get all the account in each connection_id from the snaptrade_connection_accounts
        table
        4) Once you get all the accounts, it'll run the updateDividends() route for each of them to update the amount 
        of dividends they'll get

        5) Have a refresh button that'll trigger the update dividends in the backend for the particular account_id.
            - Stop the request from going through if pushed too many times from before
        
'''
@router.get("getAllUsers")
def getAllUserID():
    pass
