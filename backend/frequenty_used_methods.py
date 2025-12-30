# from fastapi import BaseModel
# from database import SessionLocal
# from fastapi import FastAPI, Response, status

# class User(BaseModel):
#     google_id: str = None
# def get_user_id(user: User):
#     user_id = None
#     with SessionLocal() as session:
#         try:
#             result = session.execute(text("SELECT user_id FROM users_id WHERE google_id = :google_id"), 
#                             {"google_id": user.google_id})
#             user_id = result.google_id
#         except:
#             session.rollback()
#             user_id = None
#     return user_id
# def add_user_id(user: User):
#     inserted = False
#     with SessionLocal() as session:
#         result = session.execute(text("SELECT EXISTS(SELECT 1 FROM users_id WHERE google_id = :google_id)"), {"google_id": str(user.google_id)})
#         if result.scalar() == True:
#             return JSONResponse(content="User already exists", status_code=200)
#         session.commit()

#     # if doesn't exist, then add the user
#     with SessionLocal() as session:
#         try:
#             session.execute(text("INSERT INTO users_id (google_id) VALUES (:google_id)"), {"google_id": str(user.google_id)})
#             inserted = True
#             session.commit()
#         except:
#             session.rollback()
#             inserted = False

#     if inserted == False:
#         return JSONResponse(content="Failed to add User", status_code=400)
#     else:
#         return JSONResponse(content="Successfull request. Added the user to database", status_code=200)
            

# # Fix this code to delete the userID, and all the elements rows that are correlated with this user_id for other tables
# def delete_user_id(user: User):
#     deleted_user = False
#     with SessionLocal() as session:
#         try:
#             result = session.execute(text("SELECT user_id FROM users_id WHERE google_id = :google_id"), 
#                             {"google_id": user.google_id})
#             user_id = result.google_id
#         except:
#             session.rollback()
#             user_id = None
#     return user_id