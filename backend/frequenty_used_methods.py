from fastapi import BaseModel
from database import SessionLocal

class User(BaseModel):
    google_id: str = None
def get_user_id(user: User):
    user_id = None
    with SessionLocal() as session:
        try:
            result = session.execute(text("SELECT user_id FROM users_id WHERE google_id = :google_id"), 
                            {"google_id": user.google_id})
            user_id = result.google_id
        except:
            session.rollback()
            user_id = None
    return user_id

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