from snapTradeInitialization import snapTrade
from fastapi import APIRouter
from fastapi import Request
from pydantic import BaseModel
from fastapi import Response, status
import uuid 
from uuid import UUID
from fastapi import Cookie
from typing import Annotated
from database import SessionLocal
from sqlalchemy import text

router = APIRouter(prefix="/api/snapTrade")

@router.post("/addUser")
def addUser(response: Response, user_id: Annotated[UUID, Cookie()]):
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

    # Store the SnapTrade user id in a cookie for subsequent backend calls.
    response.set_cookie(
        key="snaptrade_user_id",
        value=str(snaptrade_id),
        httponly=True,
        samesite="lax",
    )

     
    # the userID and user_secret need to passed for API calls for snapTrade. Maybe add it to the cookies.
    
