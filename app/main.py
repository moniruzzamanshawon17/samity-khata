from fastapi import Depends, FastAPI
from app.core.config import Settings, get_settings
from app.modules.members.controllers import router as members_router

settings = get_settings()

app = FastAPI(title=settings.APP_NAME)

app.include_router(members_router)

@app.get("/")
async def home(settings: Settings = Depends(get_settings)):
    return {"status": "ok", "app": settings.APP_NAME, "message": "Hello, Welcome to the Samity Khata"}

@app.get("/health")
async def get_health(settings: Settings = Depends(get_settings)):
    return {"status": "ok", "app": settings.APP_NAME}
