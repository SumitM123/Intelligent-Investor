from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI(title="Productivity Assistant API", version="1.0.0")

# Add CORS middleware to allow frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)