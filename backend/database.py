import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from pydantic import BaseModel
DATABASE_URL = os.getenv("DATABASE_URL")
POSTGRE_USER = os.getenv("POSTGRE_USER")
POSTGRE_PASSWORD = os.getenv("POSTGRE_PASSWORD")
POSTGRE_DB = os.getenv("POSTGRE_DB")

engine = create_engine(url=DATABASE_URL, max_overflow=20, pool_size=10, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
# class User(BaseModel):
#     google_id: str = None
# def get_user_id(user: User):
#     user_id = None
#     with SessionLocal() as session:
#         try:
#             result = session.execute(text("SELECT user_id FROM users_id WHERE google_id = :google_id"), 
#                             {"google_id": stock.google_id})
#             user_id = result.google_id
#         except:
#             session.rollback()
#             user_id = None
#     return user_id
