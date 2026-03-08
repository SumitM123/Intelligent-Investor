from fastapi import APIRouter
from fastapi import Request
from pydantic import BaseModel
from fastapi import Response, status
import requests

class Necessities(BaseModel):
    base_school_url: str | None = None
    access_token: str | None = None

router = APIRouter(prefix="/canvas")

@router.post("/verify")
async def verify(request: Necessities, response: Response):
    base_url = request.base_school_url
    access_token = request.access_token

    if base_url == None or access_token == None:
        response.status_code = status.HTTP_400_BAD_REQUEST
        response.headers["No base url or access_token"]
        return {"Error" : "Not a valid request. Cannot be None"}
    
    checking_base_url = requests.get("https://canvas.instructure.com/api/v1/accounts/search", params={"domain": base_url})
    if checking_base_url["name"] == None:
        response.status_code = status.HTTP_400_BAD_REQUEST
        response.headers["No base url or access_token"]
        return {"Error" : "Not a valid request. Cannot be None"}
    
    # what else do you have to check

# @router.post("/scrapeAssignments")
# async def scrapeAssignments(request, response: Response):
    
    

    
    

