from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, text
import psycopg2
import os
from .database import SessionLocal

app = FastAPI(title="Productivity Assistant API", version="1.0.0")

# Add CORS middleware to allow frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DATABASE_URL = os.getenv("DATABASE_URL")
# POSTGRE_USER = os.getenv("POSTGRE_USER")
# POSTGRE_PASSWORD = os.getenv("POSTGRE_PASSWORD")
# POSTGRE_DB = os.getenv("POSTGRE_DB")

# engine = create_engine(url=DATABASE_URL, max_overflow=20, pool_size=10, pool_pre_ping=True)
# def get_db_conn():
#     # yield returns a stream of data, unlike return and when called again will start the function where it stopped from the previous yield
#     with engine.connect() as conn:
#         yield conn
@app.get("/")
async def root():
    return {"message": "🚀 Hot Reload Working! API is ready for development"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "database": "connected"}

@app.get("/api/tasks")
async def get_tasks():
    # This is a placeholder - you'll implement actual database logic later
    return {
        "tasks": [
            {"id": 1, "title": "Sample Task 1", "completed": False},
            {"id": 2, "title": "Sample Task 2", "completed": True}
        ]
    }

class User(BaseModel):
    google_id: str
@app.post("/api/createUser")
def create_user(user: User):
    google_id = user.google_id
    with SessionLocal() as session:
        command = text()
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)