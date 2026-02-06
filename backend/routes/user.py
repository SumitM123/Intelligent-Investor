from pydantic import BaseModel
from database import SessionLocal
from fastapi import FastAPI, Response, status, File, UploadFile, Form
from fastapi.responses import JSONResponse
from fastapi import APIRouter, Cookie
from fastapi import HTTPException
from fastapi import Body
from sqlalchemy import text
from typing import Annotated
import boto3
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
def get_user_id(google_id: str | None, response: Response):
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
    response.set_cookie(key="user_id", value=str(user_id), max_age=300000, path="/api", httponly=True)

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
    return {"content": {"user_name": name, "email": email}, "message": "Successful request"}



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
    response: Response,
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
            response.set_cookie(key="user_id", value=existing_id, max_age=300000, path="/api", httponly=True)
            return JSONResponse(content="User already exists", status_code=200)

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

    response.set_cookie(key="user_id", value=user_id, max_age=300000, path="/api", httponly=True)

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
    return {"message": "Successful"}





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