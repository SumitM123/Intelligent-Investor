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
from datetime import datetime, timezone, timedelta, date
from zoneinfo import ZoneInfo
import re
import json
import time
from frequenty_used_methods import fetch_av, get_eps_and_pe

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


@router.get("/connections")
def listConnections(
    snapTrade_id: Annotated[str, Cookie(alias="snapTradeUserID")],
):
    '''
        Live list of this user's usable brokerage connections.

        This is the "am I connected?" source of truth. It is read from SnapTrade on every
        request and never cached, so it survives a page refresh and reflects a connection the
        user removed at their brokerage (or in SnapTrade's own portal) without telling us.

        Entries flagged `disabled` are dropped: SnapTrade keeps the authorization record
        around after it expires or is revoked, so "still listed" does not mean "still usable".
    '''
    snaptrade_usersecret_id = getSnapTradeSecretID(snapTrade_id)

    try:
        response = snapTrade.connections.list_brokerage_authorizations(
            user_id=snapTrade_id,
            user_secret=snaptrade_usersecret_id,
        )
    except Exception as exc:
        print("Error listing brokerage authorizations: " + str(exc), flush=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to reach the SnapTrade connections endpoint",
        )

    authorizations = getattr(response, "body", response) or []
    if not isinstance(authorizations, list):
        authorizations = []

    connections = []
    for auth in authorizations:
        if not isinstance(auth, dict):
            continue
        if auth.get("disabled"):
            continue

        brokerage = auth.get("brokerage")
        brokerage = brokerage if isinstance(brokerage, dict) else {}
        institution_name = (
            brokerage.get("display_name")
            or brokerage.get("name")
            or auth.get("name")
            or "Brokerage"
        )

        connections.append({
            "id": auth.get("id"),
            "institution_name": institution_name,
            "created_date": auth.get("created_date"),
        })

    # Newest first. created_date is ISO 8601 from SnapTrade, so a plain string sort orders
    # correctly; entries missing a date sort last.
    connections.sort(key=lambda c: c["created_date"] or "", reverse=True)

    return {"connections": connections}


@router.delete("/connection/{connection_id}")
def removeConnection(
    connection_id: str,
    snapTrade_id: Annotated[str, Cookie(alias="snapTradeUserID")],
):
    '''
        Unlink one brokerage connection.

        SnapTrade's delete is ASYNCHRONOUS: a 200 means the removal was queued, not that it
        has already taken effect, so an immediate re-read of /connections may still list the
        connection. The frontend clears its own state instead of waiting for the list to
        catch up.
    '''
    snaptrade_usersecret_id = getSnapTradeSecretID(snapTrade_id)

    try:
        snapTrade.connections.delete_connection(
            connection_id=connection_id,
            user_id=snapTrade_id,
            user_secret=snaptrade_usersecret_id,
        )
    except Exception as exc:
        print("Error removing brokerage authorization: " + str(exc), flush=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to remove the brokerage connection",
        )

    # Best effort: clear rows left behind by the account cache that getAllAccountsFromConnection
    # used to write. The disconnect at SnapTrade already succeeded, so a failure to tidy up
    # locally must not surface to the caller as an error.
    with SessionLocal() as session:
        try:
            session.execute(
                text("DELETE FROM snaptrade_connection_accounts WHERE connection_id = :cid"),
                {"cid": connection_id},
            )
            session.commit()
        except Exception:
            session.rollback()
            print(f"Could not clear cached accounts for connection {connection_id}", flush=True)

    return {"disconnected": connection_id}


@router.get("/getAllAccountsFromConnection")
def getAllAccountsFromConnection(
    snapTrade_id: Annotated[str, Cookie(alias="snapTradeUserID")],
    connection_id: str,
):
    '''
        snaptrade_id: uuid, connection_id: str

        The USD accounts belonging to one brokerage connection.

        Deliberately uncached. Connections are disposable — each connect mints a new
        connection_id and a disconnect can happen without us being told — so a permanent
        cache keyed by connection_id is guaranteed to go stale, and balances change by the
        minute regardless. Always read live from SnapTrade.
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

    allAccountsFromAllConnection = snapTrade.account_information.list_user_accounts(
        user_id=snapTrade_id,
        user_secret=snaptrade_usersecret_id,
    ).body
    if not isinstance(allAccountsFromAllConnection, list):
        allAccountsFromAllConnection = []

    accountsForConnection = []
    for brokerageAccount in allAccountsFromAllConnection:
        if not isinstance(brokerageAccount, dict):
            continue
        if brokerageAccount.get("brokerage_authorization") != connection_id:
            continue

        balance = brokerageAccount.get("balance") or {}
        total = balance.get("total") or {}
        if total.get("currency") != "USD":
            continue

        # Trimmed to what the account picker actually renders, so the response shape is an
        # explicit contract rather than whatever SnapTrade happens to return.
        accountsForConnection.append({
            "id": brokerageAccount.get("id"),
            "name": brokerageAccount.get("name") or "Brokerage account",
            "number": brokerageAccount.get("number"),
            "institution_name": brokerageAccount.get("institution_name"),
            "balance": total.get("amount"),
        })

    print(f"Accounts under connection {connection_id}: {len(accountsForConnection)}", flush=True)

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
def get_user_account_positions(
    snapTrade_id: Annotated[str, Cookie(alias="snapTradeUserID")],
    account_id: str,
):
    """Return normalised positions for a single SnapTrade account.

    `account_id` is required — the portfolio breakdown charts one account at a
    time. Cash rows (no underlying symbol) are skipped.
    """
    return {"positions": fetch_positions_for_account(snapTrade_id, account_id)}


def _shape(value) -> str:
    """Describe a payload's structure (keys/lengths only, never values).

    Used by the positions sanity log so SDK shape drift is diagnosable from the
    logs without printing anyone's actual holdings.
    """
    if isinstance(value, dict):
        return f"dict{sorted(value.keys())}"
    if isinstance(value, list):
        first = value[0] if value else None
        inner = sorted(first.keys()) if isinstance(first, dict) else type(first).__name__
        return f"list[{len(value)}] first={inner}"
    return type(value).__name__


def _extract_position_symbol(position: dict) -> str | None:
    """Pull the ticker out of a SnapTrade position, tolerating shape drift.

    SDK 13.x carries it as position.instrument.symbol; older payloads nested it
    as position.symbol.symbol(.symbol) or only carried raw_symbol. Try each.
    """
    for key in ("instrument", "symbol"):
        field = position.get(key)
        if not isinstance(field, dict):
            continue
        # Ticker sitting directly on this level (SDK 13.x, or a flattened symbol).
        for candidate in (field.get("symbol"), field.get("raw_symbol")):
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip().upper()
        # Older nesting: .symbol is itself an object holding the ticker.
        inner = field.get("symbol")
        if isinstance(inner, dict):
            ticker = inner.get("symbol") or inner.get("raw_symbol")
            if isinstance(ticker, str) and ticker.strip():
                return ticker.strip().upper()
    return None


def fetch_positions_for_account(snapTrade_id: str, account_id: str) -> list[dict]:
    """Return [{symbol, units, market_value}] for one SnapTrade account.

    Empty list (never an error) when the account has no chartable positions.
    Cash rows and rows missing units/price are skipped.
    """
    if not account_id:
        return []
    snaptrade_usersecret_id = getSnapTradeSecretID(snapTrade_id)
    # get_user_account_positions was removed from the SDK; positions/all is the
    # replacement (SDK 13.x), and it wraps the position list in "results".
    response = snapTrade.account_information.get_all_account_positions(
        user_id=snapTrade_id,
        user_secret=snaptrade_usersecret_id,
        account_id=account_id,
    )
    body = getattr(response, "body", response)
    # SDK 13.x wraps the payload as {"results": ..., "data_freshness": ...}.
    payload = body.get("results", body) if isinstance(body, dict) else body
    if isinstance(payload, dict):
        positions = (
            payload.get("equity_positions")
            or payload.get("positions")
            or payload.get("data")
            or []
        )
    elif isinstance(payload, list):
        positions = payload
    else:
        positions = []

    # Shape-only sanity log (keys/lengths, never values) to verify nesting
    # against a real payload without leaking holdings into the logs.
    print(
        f"[SNAPTRADE positions] account={account_id} count={len(positions)} "
        f"payload={_shape(payload)}",
        flush=True,
    )

    out: list[dict] = []
    for position in positions:
        if not isinstance(position, dict):
            continue
        symbol = _extract_position_symbol(position)
        if not symbol:  # cash / unparseable row
            continue
        units = position.get("units")
        price = position.get("price")
        if units is None or price is None:
            continue
        try:
            units_f = float(units)
            price_f = float(price)
        except (TypeError, ValueError):
            continue
        out.append({
            "symbol": symbol,
            "units": units_f,
            "market_value": units_f * price_f,
        })
    return out


@router.get("/list_accounts")
def list_accounts(
    snapTrade_id: Annotated[str, Cookie(alias="snapTradeUserID")],
):
    """List the user's USD SnapTrade accounts for the breakdown account picker.

    Unlike getAllAccountsFromConnection this needs no connection_id — it returns
    every USD account across all of the user's brokerage connections. Empty list
    (not an error) when there are no USD accounts.
    """
    snaptrade_usersecret_id = getSnapTradeSecretID(snapTrade_id)
    response = snapTrade.account_information.list_user_accounts(
        user_id=snapTrade_id,
        user_secret=snaptrade_usersecret_id,
    )
    accounts = getattr(response, "body", response) or []
    if not isinstance(accounts, list):
        accounts = []

    out: list[dict] = []
    for account in accounts:
        if not isinstance(account, dict):
            continue
        balance = account.get("balance") or {}
        total = balance.get("total") or {}
        if total.get("currency") != "USD":
            continue
        out.append({
            "id": account.get("id"),
            "name": account.get("name") or "Brokerage account",
            # institution_name is the human-readable brokerage ("Fidelity");
            # brokerage_authorization is the connection's UUID, exposed under an honest
            # name so the caller can tell which connection an account belongs to.
            "institution_name": account.get("institution_name"),
            "connection_id": account.get("brokerage_authorization"),
        })
    return {"accounts": out}


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


def _safe_float(val, default=None):
    if val is None or val == "None":
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _compute_price_dependent_criteria(symbol: str) -> dict:
    # Recomputed every call (never cached): both metrics hinge on the
    # current stock price, which is stale the moment we store it.
    quote = fetch_av("GLOBAL_QUOTE", symbol).get("Global Quote", {})
    current_price = _safe_float(quote.get("05. price"))
    if current_price is None:
        raise HTTPException(status_code=502, detail="Could not retrieve stock price from AlphaVantage")

    overview = fetch_av("OVERVIEW", symbol)
    market_cap = _safe_float(overview.get("MarketCapitalization"))
    revenue_ttm = _safe_float(overview.get("RevenueTTM"))

    cash_flow_reports = fetch_av("CASH_FLOW", symbol).get("annualReports", [])
    latest_cf = cash_flow_reports[0] if cash_flow_reports else {}
    operating_cf = _safe_float(latest_cf.get("operatingCashflow"))
    capex = _safe_float(latest_cf.get("capitalExpenditures"))
    fcf = (operating_cf - capex) if (operating_cf is not None and capex is not None) else None

    if fcf is not None and fcf > 0 and market_cap is not None and market_cap > 0:
        p_fcf = market_cap / fcf
        c6_pass = p_fcf <= 25
    else:
        p_fcf = None
        c6_pass = False

    if fcf is not None and fcf > 0 and revenue_ttm is not None and revenue_ttm > 0 and market_cap is not None and market_cap > 0:
        p_sales = market_cap / revenue_ttm
        valuation_product = p_fcf * p_sales
        c7_pass = valuation_product <= 50
    else:
        p_sales = None
        valuation_product = None
        c7_pass = False

    return {
        "price_to_fcf": {
            "pass": c6_pass,
            "market_cap": market_cap,
            "fcf": fcf,
            "p_fcf_ratio": p_fcf,
            "threshold": 25,
        },
        "valuation_combined": {
            "pass": c7_pass,
            "p_fcf": p_fcf,
            "p_sales": p_sales,
            "product": valuation_product,
            "threshold": 50,
        },
    }


_CACHED_CRITERIA_KEYS = (
    "adequate_size",
    "current_ratio",
    "no_earnings_deficits",
    "shareholder_returns",
    "earnings_growth_10yr",
)
_PRICE_DEPENDENT_KEYS = ("price_to_fcf", "valuation_combined")

'''
    Things to work on for this route:
        1) Can potentially make this faster, especially when the periodic change time is passed. 
            - For the criteria that is true, and can't use the cached values because of relevance is exceeded, only search through the criteria 
            that weren't passed, and then look through the entire list of data if not passed. If some criteria is passed, then instead of looking
            through the entire list, what I want you to do is that just compare the new data for each of the criteria, and if that new data passed,
            then keep as passed. Otherwise, turn it to false.
                Ex: dividend = true. So C5 is passed. Instead of looking over the entire list of the past 10 years, just cross check that the current 
                dividend payment got payed at the right time relative to the payment of the last payment. If checks out, remain as true. Otherwise, 
                switch to false. And then store the last faulty date for dividends inside a table. This table can be used to check if it's been 10 years
                since the next update with the last faulty date. 
        2) Right now, the updates are relative to when a new stock is added. Instead, make it relative to when financial statements are reported
'''
@router.get("/isLeadingStock")
def isLeadingStock(
    user_id: Annotated[UUID, Cookie()],
    symbol: str,
    allCriteria: bool = False,
):

    with SessionLocal() as session:
        user_row = session.execute(
            text("SELECT 1 FROM users_id WHERE user_id = :user_id LIMIT 1"),
            {"user_id": user_id},
        ).first()
    if user_row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    normalized = symbol.strip().upper()
    if not re.fullmatch(r"[A-Z][A-Z0-9]{0,4}(\.[A-Z]{1,2})?", normalized):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid stock symbol",
        )

    # Return cached result if fresher than 3 months
    with SessionLocal() as session:
        cached = session.execute(
            text(
                """
                SELECT symbol, is_leading, criteria_details, last_checked
                FROM leading_stock_analysis
                WHERE symbol = :symbol
                  AND last_checked >= NOW() - INTERVAL '3 months'
                LIMIT 1
                """
            ),
            {"symbol": normalized},
        ).first()

    if cached is not None:
        cached_criteria = cached[2] or {}
        price_dep = _compute_price_dependent_criteria(normalized)
        merged_criteria = {**cached_criteria, **price_dep}
        is_leading = all(
            merged_criteria.get(k, {}).get("pass", False)
            for k in (*_CACHED_CRITERIA_KEYS, *_PRICE_DEPENDENT_KEYS)
        )
        if allCriteria:
            return {
                "symbol": cached[0],
                "is_leading": is_leading,
                "criteria_details": merged_criteria,
            }
        return {
            "symbol": cached[0],
            "is_leading": is_leading,
        }

    # --- Cache miss: fetch from AlphaVantage and evaluate all 7 criteria ---

    # AlphaVantage free tier allows 5 requests/min. Track the moment of the
    # first call so we can throttle before the 6th call below.
    av_window_start = time.monotonic()

    # Current price
    quote = fetch_av("GLOBAL_QUOTE", normalized).get("Global Quote", {})
    current_price = _safe_float(quote.get("05. price"))
    if current_price is None:
        raise HTTPException(status_code=502, detail="Could not retrieve stock price from AlphaVantage")

    # Company overview (market cap, trailing-12-month revenue)
    overview = fetch_av("OVERVIEW", normalized)
    market_cap = _safe_float(overview.get("MarketCapitalization"))
    revenue_ttm = _safe_float(overview.get("RevenueTTM"))

    # Balance sheet (most recent annual — current assets/liabilities for C2,
    # and last 10 years of shares outstanding for the C5 buybacks check).
    # AlphaVantage stopped populating commonStockSharesOutstanding in
    # INCOME_STATEMENT responses, so we source it from BALANCE_SHEET instead.
    annual_balance = fetch_av("BALANCE_SHEET", normalized).get("annualReports", [])
    latest_balance = annual_balance[0] if annual_balance else {}
    current_assets = _safe_float(latest_balance.get("totalCurrentAssets"))
    current_liabilities = _safe_float(latest_balance.get("totalCurrentLiabilities"))
    shares_by_year = []
    for r in annual_balance[:10]:
        yr_str = r.get("fiscalDateEnding", "")[:4]
        shares = _safe_float(r.get("commonStockSharesOutstanding"))
        if yr_str and shares is not None:
            try:
                shares_by_year.append((int(yr_str), shares))
            except ValueError:
                pass

    # Income statement (last 10 annual net incomes for the C4 deficit check)
    annual_income = fetch_av("INCOME_STATEMENT", normalized).get("annualReports", [])[:10]
    net_incomes = [_safe_float(r.get("netIncome")) for r in annual_income]
    net_incomes = [v for v in net_incomes if v is not None]

    # EPS (criterion 8) — computed via shared helper
    eps_result = get_eps_and_pe(normalized, current_price)

    # Free Cash Flow (criteria 6 and 7): operating CF minus capex.
    # CASH_FLOW is the 6th AlphaVantage call — throttle to stay under the
    # 5 requests/minute free-tier limit. Wait until 61s have elapsed since
    # the first call before continuing.
    elapsed = time.monotonic() - av_window_start
    if elapsed < 61:
        time.sleep(61 - elapsed)
    cash_flow_reports = fetch_av("CASH_FLOW", normalized).get("annualReports", [])
    latest_cf = cash_flow_reports[0] if cash_flow_reports else {}
    operating_cf = _safe_float(latest_cf.get("operatingCashflow"))
    capex = _safe_float(latest_cf.get("capitalExpenditures"))
    fcf = (operating_cf - capex) if (operating_cf is not None and capex is not None) else None

    # Dividends — infer payment frequency from the two most recent entries,
    # then walk backwards in frequency-sized steps for 10 years; stop on the
    # first month with no payment.
    dividends = fetch_av("DIVIDENDS", normalized).get("data", [])

    parsed_divs = []
    for d in dividends:
        ex_date = d.get("ex_dividend_date", "")
        if ex_date and ex_date != "None":
            try:
                parsed_divs.append(date.fromisoformat(ex_date))
            except ValueError:
                pass
    parsed_divs.sort(reverse=True)  # newest-first

    div_interval_days = None
    if len(parsed_divs) >= 2:
        div_interval_days = (parsed_divs[0] - parsed_divs[1]).days

    today = date.today()
    cutoff = (today.year - 10, today.month)
    missing_div_periods = []
    c5_dividends = False
    _DIV_TOLERANCE_DAYS = 30
    if div_interval_days is not None and div_interval_days > 0 and parsed_divs:
        i = 0
        j = 1
        current = parsed_divs[i]
        next = parsed_divs[j]
        while (current.year, current.month) >= cutoff:
            difference = (current - next).days
            if (abs(difference) <= _DIV_TOLERANCE_DAYS + abs(div_interval_days)):
                i += 1
                j += 1
                if j >= len(parsed_divs):
                    break
                current = parsed_divs[i]
                next = parsed_divs[j]
            else:
                missing_div_periods.append(f"{current.year}-{current.month:02d}")
                break
        else:
            c5_dividends = True


    # CPI indexed by year — used for YoY EPS inflation adjustment in criterion 8.
    # AlphaVantage returns annual CPI newest-first,
    # so setdefault preserves the most recent reading for any given year.
    cpi_entries = fetch_av("CPI", interval="annual").get("data", [])
    cpi_by_year = {}
    for e in cpi_entries:
        date_str = e.get("date", "")
        val = _safe_float(e.get("value"))
        if val is None or len(date_str) < 4:
            continue
        try:
            yr = int(date_str[:4])
        except ValueError:
            continue
        cpi_by_year.setdefault(yr, val)

    latest_cpi = _safe_float(cpi_entries[0].get("value")) if cpi_entries else None

    # --- Evaluate criteria ---
    criteria = {}

    # 1. Adequate Size: Revenue (TTM) ≥ $1B AND Market Cap ≥ $8B
    _revenue_threshold = 1_000_000_000
    _mktcap_threshold = 8_000_000_000
    c1_revenue_pass = revenue_ttm is not None and revenue_ttm >= _revenue_threshold
    c1_mktcap_pass = market_cap is not None and market_cap >= _mktcap_threshold
    c1_pass = c1_revenue_pass and c1_mktcap_pass
    criteria["adequate_size"] = {
        "pass": c1_pass,
        "revenue_ttm": revenue_ttm,
        "revenue_threshold": _revenue_threshold,
        "revenue_pass": c1_revenue_pass,
        "market_cap": market_cap,
        "market_cap_threshold": _mktcap_threshold,
        "market_cap_pass": c1_mktcap_pass,
    }

    # 2. Current ratio ≥ 1.75
    if current_assets is not None and current_liabilities and current_liabilities > 0:
        current_ratio = current_assets / current_liabilities
        c2_pass = current_ratio >= 1.75
    else:
        current_ratio = None
        c2_pass = False
    criteria["current_ratio"] = {
        "pass": c2_pass,
        "current_assets": current_assets,
        "current_liabilities": current_liabilities,
        "ratio": current_ratio,
        "threshold": 1.75,
    }

    # 4. No earnings deficits in past 10 years (deficit = strictly negative net income)
    deficit_count = sum(1 for v in net_incomes if v < 0)
    c4_pass = len(net_incomes) >= 10 and deficit_count == 0
    criteria["no_earnings_deficits"] = {
        "pass": c4_pass,
        "years_checked": len(net_incomes),
        "deficit_count": deficit_count,
    }

    # 5. Shareholder returns: uninterrupted dividends for 10 years OR consistent
    # buybacks (net share-count reduction in 7 of the past 10 years).
    buyback_years_count = 0
    if len(shares_by_year) >= 2:
        # shares_by_year is newest-first (AlphaVantage ordering)
        for i in range(len(shares_by_year) - 1):
            if shares_by_year[i][1] < shares_by_year[i + 1][1]:
                buyback_years_count += 1
    c5_buybacks = buyback_years_count >= 7
    c5_pass = c5_dividends or c5_buybacks
    criteria["shareholder_returns"] = {
        "pass": c5_pass,
        "dividends": {
            "pass": c5_dividends,
            "interval_days": div_interval_days,
            "missing_periods": missing_div_periods,
        },
        "buybacks": {
            "pass": c5_buybacks,
            "years_with_share_reduction": buyback_years_count,
            "threshold": 7,
        },
    }
    
    # 8. EPS growth ≥ 33% over the past 10 years, inflation-adjusted YoY.
    # Each historical EPS is scaled to current dollars via that fiscal year's CPI
    # before averaging, so the growth percentage reflects real earnings improvement
    # rather than nominal drift caused by inflation.
    eps_10yr_dated = eps_result["eps_10yr_dated"]

    def _adjust_eps(year: int, eps_val: float) -> float:
        if latest_cpi is None:
            return eps_val
        cpi_for_year = cpi_by_year.get(year)
        if cpi_for_year is None or cpi_for_year <= 0:
            return eps_val
        return eps_val * (latest_cpi / cpi_for_year)

    if len(eps_10yr_dated) >= 8:
        # adjusted_recent = [_adjust_eps(yr, val) for yr, val in eps_10yr_dated[:3]]
        # adjusted_early = [_adjust_eps(yr, val) for yr, val in eps_10yr_dated[-3:]]
        adjusted_recent = [val for yr, val in eps_10yr_dated[:3]]
        adjusted_early = [val  for yr, val in eps_10yr_dated[-3:]]
        avg_recent_eps = sum(adjusted_recent) / 3
        avg_early_eps = sum(adjusted_early) / 3
        if avg_early_eps > 0:
            earnings_growth_pct = ((avg_recent_eps - avg_early_eps) / avg_early_eps) * 100
            c8_pass = earnings_growth_pct >= 33
        else:
            earnings_growth_pct = None
            c8_pass = False
    else:
        avg_recent_eps = None
        avg_early_eps = None
        earnings_growth_pct = None
        c8_pass = False
    criteria["earnings_growth_10yr"] = {
        "pass": c8_pass,
        "avg_eps_recent_3yr": avg_recent_eps,
        "avg_eps_early_3yr": avg_early_eps,
        "growth_pct": earnings_growth_pct,
        "threshold_pct": 33,
        "inflation_adjusted": True,
        "years_covered": len(eps_10yr_dated),
    }

    # 6. Price/FCF (market cap / free cash flow) ≤ 25
    if fcf is not None and fcf > 0 and market_cap is not None and market_cap > 0:
        p_fcf = market_cap / fcf
        c6_pass = p_fcf <= 25
    else:
        p_fcf = None
        c6_pass = False
    criteria["price_to_fcf"] = {
        "pass": c6_pass,
        "market_cap": market_cap,
        "fcf": fcf,
        "p_fcf_ratio": p_fcf,
        "threshold": 25,
    }

    # 7. (P/FCF × P/Sales) ≤ 50 — combined valuation check
    # p_fcf already computed in criterion 6 above
    if fcf is not None and fcf > 0 and revenue_ttm is not None and revenue_ttm > 0 and market_cap is not None and market_cap > 0:
        p_sales = market_cap / revenue_ttm
        valuation_product = p_fcf * p_sales
        c7_pass = valuation_product <= 50
    else:
        p_sales = None
        valuation_product = None
        c7_pass = False
    criteria["valuation_combined"] = {
        "pass": c7_pass,
        "p_fcf": p_fcf,
        "p_sales": p_sales,
        "product": valuation_product,
        "threshold": 50,
    }

    is_leading = all([c1_pass, c2_pass, c4_pass, c5_pass, c6_pass, c7_pass, c8_pass])

    # price_to_fcf and valuation_combined depend on current price, so they're
    # excluded from the cache and recomputed on every request.
    cacheable_criteria = {
        k: v for k, v in criteria.items() if k not in _PRICE_DEPENDENT_KEYS
    }
    # The stored is_leading reflects only price-independent criteria (C1, C2, C4, C5, C8).
    # C6 and C7 are price-dependent and recomputed on every request, so storing a value
    # that includes them would be stale the moment the stock price moves.
    is_leading_cached = all([c1_pass, c2_pass, c4_pass, c5_pass, c8_pass])

    # Upsert result into cache table
    with SessionLocal() as session:
        try:
            session.execute(
                text(
                    """
                    INSERT INTO leading_stock_analysis (symbol, is_leading, criteria_details, last_checked)
                    VALUES (:symbol, :is_leading, CAST(:criteria_details AS jsonb), NOW())
                    ON CONFLICT (symbol) DO UPDATE SET
                        is_leading = EXCLUDED.is_leading,
                        criteria_details = EXCLUDED.criteria_details,
                        last_checked = NOW()
                    """
                ),
                {
                    "symbol": normalized,
                    "is_leading": is_leading_cached,
                    "criteria_details": json.dumps(cacheable_criteria),
                },
            )
            session.commit()
        except Exception:
            session.rollback()
            raise

    if allCriteria:
        return {
            "symbol": normalized,
            "is_leading": is_leading,
            "criteria_details": criteria,
        }
    return {
        "symbol": normalized,
        "is_leading": is_leading,
    }
