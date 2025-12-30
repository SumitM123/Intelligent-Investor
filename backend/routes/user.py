from pydantic import BaseModel
from database import SessionLocal
from fastapi import FastAPI, Response, status
from fastapi.responses import JSONResponse
from fastapi import APIRouter
from fastapi import HTTPException
from fastapi import Body
from sqlalchemy import text


router = APIRouter(prefix="/api/users")

@router.get("/getUserID")
def get_user_id(google_id: str):
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
    else:
        return JSONResponse(content={"Response status": "Sucess", "User ID": user_id})

class User(BaseModel):
    google_id: str 
@router.post('/addUser')
def add_user_id(user_class: User):
    user = user_class.model_dump()
    inserted = False
    with SessionLocal() as session:
        # checking if user already exists inside the database
        result = session.execute(text("SELECT EXISTS(SELECT 1 FROM users_id WHERE google_id = :google_id)"), {"google_id": str(user["google_id"])})
        if result.scalar() == True:
            return JSONResponse(content="User already exists", status_code=200)
        try:
            session.execute(text("INSERT INTO users_id (google_id) VALUES (:google_id)"), {"google_id": str(user["google_id"])})
            inserted = True
        except:
            session.rollback()
            inserted = False
        
        session.commit()

    if inserted == False:
        # return JSONResponse(content="Failed to add User", status_code=400)
        raise HTTPException(status_code=400, detail="Unable to add user")
    else:
        return JSONResponse(content="Successfull request. Added the user to database", status_code=200)
            

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