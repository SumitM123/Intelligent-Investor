from pydantic import BaseModel
from database import SessionLocal
from fastapi import FastAPI, Response, status, File, UploadFile, Form
from fastapi.responses import JSONResponse
from fastapi import APIRouter, Cookie
from fastapi import HTTPException
from fastapi import Body
from sqlalchemy import text
from typing import Annotated
import nanoid
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
def get_user_id(google_id: str, response: Response):
    user_id = None
    with SessionLocal() as session:
        try:
            result = session.execute(text("SELECT user_id FROM users_id WHERE google_id = :google_id"), 
                            {"google_id": google_id})
            # check if there is user exist
            if result.first() != None:
                user_id = (result.first())[0]
            else:
                user_id = None
        except:
            session.rollback()
            user_id = None
    
    if user_id == None:
        raise HTTPException(status_code=400, detail="Invalid request. User doesn't exist")
    
    response.set_cookie(key="user_id", value=str(user_id), max_age=300000, path="/api", httponly=True)
    return {"Message": "Success"}


class User(BaseModel):
    google_id: str 

'''
    If there is a new user, it'll add the user to the users_id table, as well as the user_info table
'''
@router.post('/addUser')
def add_user_id(user_profile_pic: Annotated[bytes, File()],
                user_profile_pic_meta: Annotated[UploadFile, File()],
                user_email: Annotated[str, Form()],
                user_name: Annotated[str, Form()],
                google_id: Annotated[str, Form()], 
                response: Response):
    # user = user_class.model_dump()
    inserted = False
    user_id = None
    # add the google_id, user_id entry in the users_id table
    with SessionLocal() as session:
        # checking if user already exists inside the database. If so, add the respective cookie
        result = session.execute(text("SELECT EXISTS(SELECT 1 FROM users_id WHERE google_id = :google_id)"), {"google_id": google_id})
        if result.scalars() == True:
            response.set_cookie(key="user_id", value=result.scalars().first(), max_age=300000, path="/api", httponly=True)
            user_id = result.scalars().first()
            return JSONResponse(content="User already exists", status_code=200)
        # if user doesn't already exist, then insert and set the respective cookie
        try:
            session.execute(text("INSERT INTO users_id (google_id) VALUES (:google_id)"), {"google_id": google_id})
            result = session.execute(text("SELECT user_id FROM users_id WHERE google_id = :google_id"), {"google_id": google_id})
            response.set_cookie(key="user_id", value=result.scalars().first(), max_age=300000, path="/api", httponly=True)
            user_id = result.scalars().first()
            inserted = True
        except:
            session.rollback()
            inserted = False
        
        session.commit()


    if inserted == False:
        # return JSONResponse(content="Failed to add User", status_code=400)
        raise HTTPException(status_code=400, detail="Unable to add user")

    # add information to the user_info table
    profile_picture_key = nanoid.generate()
    with SessionLocal() as session:
        try:
            session.execute(text("INSERT INTO user_info (user_id, name, email, profile_picture_key) VALUES (:user_id, :name, :email, :profile_picture_key)"), 
                                    {"user_id": user_id, "name": user_name, "email": user_email, "profile_picture_key": profile_picture_key})
            inserted = True
        except:
            session.rollback()
            inserted = False
    
    '''
        Add the profile picture of the user to S3 bucket with the profile_picture_key as the key to the object that's going to be stored in S3 bucket
    '''

        
    # else:
    #     return JSONResponse(content="Successfull request. Added the user to database", status_code=200)
    # add the necessary data to the user_info table here
    # 

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