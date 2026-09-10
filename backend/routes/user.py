from pydantic import BaseModel
from database import SessionLocal
from fastapi import FastAPI, status, File, UploadFile, Form
from fastapi import APIRouter, Cookie
from fastapi import HTTPException
from fastapi import Body
from sqlalchemy import text
from typing import Annotated
from uuid import UUID
import json
import boto3
from frequenty_used_methods import assert_user_exists
'''
    - Created a new table that stores user's personal information
    - addUserID route:
        the client will send a formdata. This way, you can retrive the image of the user. The image of the user will then be uploaded
        to the S3 bucket, storing the key in the specific attribute
    - getUserID:
        - you have to get the presignedURl of the object that's stored in the S3 bucket for the respective UserName Picture key, then return that to the Server Component. The Server component
        will then pass the presignedURL to the Client Component, in which the Client Component will display it if signed in. If not signed in, then will have the text of "Sign In"
    
    In the frontend, NavBar will be a component in the layout of the home page
'''

router = APIRouter(prefix="/api/users")

# set's a cookie with the unique_ID that's stored inside the database. This way, each request doesn't have to be signed everytime.

'''
    Based on the google_id, it'll get the respective UUID and assign the UUID as a cookie 
'''
@router.get("/getUserID")
def get_user_id(google_id: str | None):
    if not google_id:
        raise HTTPException(status_code=400, detail="Missing google_id")

    with SessionLocal() as session:
        row = session.execute(
            text("SELECT user_id FROM users_id WHERE google_id = :google_id"),
            {"google_id": google_id},
        ).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="Invalid request. User doesn't exist")

    user_id = row[0]
    
    with SessionLocal() as session:
        info = session.execute(
            text("SELECT name, email FROM user_info WHERE user_id = :user_id"),
            {"user_id": user_id},
        ).fetchone()
    if not info:
        raise HTTPException(status_code=400, detail="User info not found")
    #     # # generate presignedURL after assuming IAM role 
#     # sts = boto3.client("sts")
#     # role = sts.assume_role(RoleArn="arn:aws:iam::782634014252:role/S3_Full_Access", RoleSessionName="S3 Full Access Role")
#     # temp_credentials = role["Credentials"]
#     # s3_client = boto3.client(
#     #     "s3",
#     #     aws_access_key_id=temp_credentials["AccessKeyId"],
#     #     aws_secret_access_key=temp_credentials["SecretAccessKey"],
#     #     aws_session_token=temp_credentials["SessionToken"],
#     # )
#     # presigned_url = s3_client.generate_presigned_url(
#     #     ClientMethod='get_object',
#     #     Params={
#     #         'Bucket': 'intelligent-investor-analyzer-userprofilepic',
#     #         'Key': str(profile_picture_key)
#     #     },
#     #     ExpiresIn=3600  
#     # )
    name, email = info
    return {"content": {"user_name": name, "email": email}, "user_id": str(user_id), "message": "Successful request"}



class User(BaseModel):
    google_id: str 

'''
    If there is a new user, it'll add the user to the users_id table, as well as the user_info table
'''

# change this function because profilePicture being uploaded is a public image URL (string)
@router.post('/addUser')
def add_user_id(
    user_email: Annotated[str, Form()],
    user_name: Annotated[str, Form()],
    google_id: Annotated[str, Form()],
):
    if not google_id:
        raise HTTPException(status_code=400, detail="Missing google_id")

    with SessionLocal() as session:
        # check existing
        existing_id = session.execute(
            text("SELECT user_id FROM users_id WHERE google_id = :google_id"),
            {"google_id": google_id},
        ).scalar_one_or_none()
        # if user_id already does exist
        if existing_id is not None:
            info_exists = session.execute(
                text("SELECT 1 FROM user_info WHERE user_id = :user_id"),
                {"user_id": existing_id},
            ).fetchone()
            if not info_exists:
                session.execute(
                    text("INSERT INTO user_info (user_id, name, email) VALUES (:user_id, :name, :email)"),
                    {"user_id": existing_id, "name": user_name, "email": user_email},
                )
                session.commit()
            # Drives the post-signin redirect: a returning user who never finished (or
            # never started) the questionnaire still gets sent to /pages/userProfile.
            profile_exists = session.execute(
                text("SELECT 1 FROM user_profile WHERE user_id = :user_id LIMIT 1"),
                {"user_id": existing_id},
            ).first()
            return {
                "message": "User already exists",
                "user_id": str(existing_id),
                "is_new_user": False,
                "needs_profile": profile_exists is None,
            }

        # create user and info in one transaction
        session.execute(text("INSERT INTO users_id (google_id) VALUES (:google_id)"), {"google_id": google_id})
        user_id = session.execute(
            text("SELECT user_id FROM users_id WHERE google_id = :google_id"),
            {"google_id": google_id},
        ).scalar_one()

        session.execute(
            text("INSERT INTO user_info (user_id, name, email) VALUES (:user_id, :name, :email)"),
            {"user_id": user_id, "name": user_name, "email": user_email},
        )
        session.commit()

    #     # add information to the user_info table
#     # profile_picture_key = nanoid.generate()
#     with SessionLocal() as session:
#         try:
#             session.execute(text("INSERT INTO user_info (user_id, name, email) VALUES (:user_id, :name, :email)"), 
#                                     {"user_id": user_id, "name": user_name, "email": user_email})
#             inserted = True
#         except Exception as exc:
#             session.rollback()
#             inserted = False
#             raise HTTPException(status_code=400, detail=f"Unable to add user info: {exc}")

#     # if inserted == False:
#     #     # return JSONResponse(content="Failed to add User", status_code=400)
#     #     raise HTTPException(status_code=400, detail="Unable to add user info to table")
#     '''
#         Add the profile picture of the user to S3 bucket with the profile_picture_key as the key to the object that's going to be stored in S3 bucket
#     '''
#     # if inserted == False:
#     #     # return JSONResponse(content="Failed to add User", status_code=400)
#     #     raise HTTPException(status_code=400, detail="Unable to add user to database")
#     # # FIRST ASSUME THE ROLE, AND THEN UPLOAD TO THE BUCKET
#     # sts = boto3.client("sts")
#     # role = sts.assume_role(RoleArn="arn:aws:iam::782634014252:role/S3_Full_Access", RoleSessionName="S3 Full Access Role")
#     # temp_credentials = role["Credentials"]

#     # s3_resource = boto3.resource(
#     #     "s3",
#     #     aws_access_key_id=temp_credentials["AccessKeyId"],
#     #     aws_secret_access_key=temp_credentials["SecretAccessKey"],
#     #     aws_session_token=temp_credentials["SessionToken"],
#     # )
#     # bucket = s3_resource.Bucket("intelligent-investor-analyzer-userprofilepic")
#     # obj = bucket.Object(user_profile_pic)
#     # try:
#     #     # inside the parameters, I need to put the file name
#     #     obj.upload_file(profile_picture_key)
#     # except Exception:
#     #     raise HTTPException(status_code=400, detail="Had trouble uploading profile picture to s3 bucket")
    # A user_id created moments ago cannot have a profile row yet.
    return {
        "message": "Successful",
        "user_id": str(user_id),
        "is_new_user": True,
        "needs_profile": True,
    }





'''
    User investing profile (/pages/userProfile questionnaire).

    GET   -> {"profile": {...}} or {"profile": None}; 200 either way so the caller's
             res.ok check stays a real error check.
    POST  -> 201 on create, 409 if a profile already exists.
    PUT   -> 200 on update, 404 if there is nothing to update.

    Identity always comes from the httpOnly user_id cookie (same as stocks.py/bonds.py),
    never from the form body, which would be trivially spoofable.
'''

# Investment options a 401(k) plan may offer. Anything outside this set is rejected.
_K401_TYPES = frozenset({
    "index_fund", "target_date", "bond_fund", "tips", "company_stock", "mutual_fund",
    "stable_value", "money_market", "international", "reit", "brokerage_window",
})

_US_STATES = frozenset({
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL",
    "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE",
    "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD",
    "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
})

_PROFILE_COLUMNS = """
    user_id, monthly_investment, annual_income, stock_pct, enterprising_pct,
    is_married, home_state, is_employed, has_401k, has_401k_match,
    match_rate_pct, match_limit_pct, k401_investment_types, created_at, updated_at
"""


def _row_to_profile(row) -> dict:
    '''NUMERIC comes back from psycopg as Decimal, which is not JSON serialisable.'''
    def num(value):
        return None if value is None else float(value)

    return {
        "user_id": str(row.user_id),
        "monthly_investment": num(row.monthly_investment),
        "annual_income": num(row.annual_income),
        "stock_pct": row.stock_pct,
        "bond_pct": 100 - row.stock_pct,
        "enterprising_pct": row.enterprising_pct,
        "is_married": row.is_married,
        "home_state": row.home_state,
        "is_employed": row.is_employed,
        "has_401k": row.has_401k,
        "has_401k_match": row.has_401k_match,
        "match_rate_pct": num(row.match_rate_pct),
        "match_limit_pct": num(row.match_limit_pct),
        "k401_investment_types": row.k401_investment_types,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
    }


def _validate_profile(
    monthly_investment: float,
    annual_income: float,
    stock_pct: int,
    enterprising_pct: int,
    is_married: bool,
    home_state: str,
    is_employed: bool,
    has_401k: bool | None,
    has_401k_match: bool | None,
    match_rate_pct: float | None,
    match_limit_pct: float | None,
    k401_investment_types: list[str],
) -> dict:
    '''
        Rejects rather than clamps: silently coercing an out-of-band value would hide a
        broken client and quietly store a split the user never chose.
    '''
    if monthly_investment < 0:
        raise HTTPException(status_code=400, detail="monthly_investment cannot be negative")
    if annual_income < 0:
        raise HTTPException(status_code=400, detail="annual_income cannot be negative")
    # Graham's 50/50 rule: never below 25% or above 75% on either side. Because bonds are
    # 100 - stock_pct, bounding stock_pct alone bounds both sides.
    if not 25 <= stock_pct <= 75:
        raise HTTPException(status_code=400, detail="stock_pct must be between 25 and 75")
    if not 0 <= enterprising_pct <= 10:
        raise HTTPException(status_code=400, detail="enterprising_pct must be between 0 and 10")

    state = home_state.strip().upper()
    if state not in _US_STATES:
        raise HTTPException(status_code=400, detail=f"Unknown home_state: {home_state}")

    types = sorted(set(k401_investment_types))
    unknown = [t for t in types if t not in _K401_TYPES]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown 401(k) investment types: {unknown}")

    # Branch coherence. These mirror the CHECK constraints on user_profile, but caught here
    # they produce a 400 with a usable message instead of a 500 from a constraint violation.
    if not is_employed:
        if has_401k is not None:
            raise HTTPException(status_code=400, detail="has_401k requires is_employed")
    elif has_401k is None:
        raise HTTPException(status_code=400, detail="has_401k is required when employed")

    if has_401k is not True:
        if has_401k_match is not None:
            raise HTTPException(status_code=400, detail="has_401k_match requires has_401k")
        if types:
            raise HTTPException(status_code=400, detail="k401_investment_types requires has_401k")
    elif has_401k_match is None:
        raise HTTPException(status_code=400, detail="has_401k_match is required when has_401k")

    if has_401k_match is not True:
        if match_rate_pct is not None or match_limit_pct is not None:
            raise HTTPException(status_code=400, detail="Match amounts require has_401k_match")
    elif match_rate_pct is None or match_limit_pct is None:
        raise HTTPException(
            status_code=400, detail="match_rate_pct and match_limit_pct are required when matching"
        )

    for label, value in (("match_rate_pct", match_rate_pct), ("match_limit_pct", match_limit_pct)):
        if value is not None and not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail=f"{label} must be between 0 and 100")

    return {
        "monthly_investment": monthly_investment,
        "annual_income": annual_income,
        "stock_pct": stock_pct,
        "enterprising_pct": enterprising_pct,
        "is_married": is_married,
        "home_state": state,
        "is_employed": is_employed,
        "has_401k": has_401k,
        "has_401k_match": has_401k_match,
        "match_rate_pct": match_rate_pct,
        "match_limit_pct": match_limit_pct,
        "k401_investment_types": json.dumps(types),
    }


@router.get("/userProfile")
def get_user_profile(user_id: Annotated[UUID, Cookie()]):
    with SessionLocal() as session:
        try:
            assert_user_exists(session, user_id)
            row = session.execute(
                text(f"SELECT {_PROFILE_COLUMNS} FROM user_profile WHERE user_id = :user_id"),
                {"user_id": user_id},
            ).fetchone()
            return {"profile": _row_to_profile(row) if row else None}
        except HTTPException:
            session.rollback()
            raise
        except Exception as exc:
            session.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to load user profile: {exc}")


@router.post("/userProfile", status_code=status.HTTP_201_CREATED)
def create_user_profile(
    monthly_investment: Annotated[float, Form()],
    annual_income: Annotated[float, Form()],
    stock_pct: Annotated[int, Form()],
    enterprising_pct: Annotated[int, Form()],
    is_married: Annotated[bool, Form()],
    home_state: Annotated[str, Form()],
    is_employed: Annotated[bool, Form()],
    has_401k: Annotated[bool | None, Form()] = None,
    has_401k_match: Annotated[bool | None, Form()] = None,
    match_rate_pct: Annotated[float | None, Form()] = None,
    match_limit_pct: Annotated[float | None, Form()] = None,
    k401_investment_types: Annotated[list[str], Form()] = [],
    user_id: Annotated[UUID, Cookie()] = ...,
):
    params = _validate_profile(
        monthly_investment, annual_income, stock_pct, enterprising_pct, is_married,
        home_state, is_employed, has_401k, has_401k_match, match_rate_pct,
        match_limit_pct, k401_investment_types,
    )
    params["user_id"] = user_id

    with SessionLocal() as session:
        try:
            assert_user_exists(session, user_id)
            existing = session.execute(
                text("SELECT 1 FROM user_profile WHERE user_id = :user_id LIMIT 1"),
                {"user_id": user_id},
            ).first()
            if existing is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Profile already exists - use PUT to update it",
                )

            row = session.execute(
                text(f"""
                    INSERT INTO user_profile (
                        user_id, monthly_investment, annual_income, stock_pct, enterprising_pct,
                        is_married, home_state, is_employed, has_401k, has_401k_match,
                        match_rate_pct, match_limit_pct, k401_investment_types
                    ) VALUES (
                        :user_id, :monthly_investment, :annual_income, :stock_pct, :enterprising_pct,
                        :is_married, :home_state, :is_employed, :has_401k, :has_401k_match,
                        :match_rate_pct, :match_limit_pct, CAST(:k401_investment_types AS jsonb)
                    )
                    RETURNING {_PROFILE_COLUMNS}
                """),
                params,
            ).fetchone()
            session.commit()
            return {"profile": _row_to_profile(row)}
        except HTTPException:
            session.rollback()
            raise
        except Exception as exc:
            session.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to create user profile: {exc}")


@router.put("/userProfile")
def update_user_profile(
    monthly_investment: Annotated[float, Form()],
    annual_income: Annotated[float, Form()],
    stock_pct: Annotated[int, Form()],
    enterprising_pct: Annotated[int, Form()],
    is_married: Annotated[bool, Form()],
    home_state: Annotated[str, Form()],
    is_employed: Annotated[bool, Form()],
    has_401k: Annotated[bool | None, Form()] = None,
    has_401k_match: Annotated[bool | None, Form()] = None,
    match_rate_pct: Annotated[float | None, Form()] = None,
    match_limit_pct: Annotated[float | None, Form()] = None,
    k401_investment_types: Annotated[list[str], Form()] = [],
    user_id: Annotated[UUID, Cookie()] = ...,
):
    params = _validate_profile(
        monthly_investment, annual_income, stock_pct, enterprising_pct, is_married,
        home_state, is_employed, has_401k, has_401k_match, match_rate_pct,
        match_limit_pct, k401_investment_types,
    )
    params["user_id"] = user_id

    with SessionLocal() as session:
        try:
            assert_user_exists(session, user_id)
            row = session.execute(
                text(f"""
                    UPDATE user_profile SET
                        monthly_investment    = :monthly_investment,
                        annual_income         = :annual_income,
                        stock_pct             = :stock_pct,
                        enterprising_pct      = :enterprising_pct,
                        is_married            = :is_married,
                        home_state            = :home_state,
                        is_employed           = :is_employed,
                        has_401k              = :has_401k,
                        has_401k_match        = :has_401k_match,
                        match_rate_pct        = :match_rate_pct,
                        match_limit_pct       = :match_limit_pct,
                        k401_investment_types = CAST(:k401_investment_types AS jsonb),
                        updated_at            = NOW()
                    WHERE user_id = :user_id
                    RETURNING {_PROFILE_COLUMNS}
                """),
                params,
            ).fetchone()
            if row is None:
                raise HTTPException(
                    status_code=404, detail="Profile not found - use POST to create it"
                )
            session.commit()
            return {"profile": _row_to_profile(row)}
        except HTTPException:
            session.rollback()
            raise
        except Exception as exc:
            session.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to update user profile: {exc}")


# Fix this code to delete the userID, and all the elements rows that are correlated with this user_id for other tables
def delete_user_id(user: User):
    deleted_user = False
    with SessionLocal() as session:
        try:
            result = session.execute(text("SELECT user_id FROM users_id WHERE google_id = :google_id"), 
                            {"google_id": user.google_id})
            user_id = result.google_id
        except:
            session.rollback()
            user_id = None
    return user_id