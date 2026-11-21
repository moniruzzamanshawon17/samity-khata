from fastapi import Depends, FastAPI

from app.core.config import Settings, get_settings
from app.core.error_handlers import register_error_handlers
from app.modules.auth.controllers import router as auth_router
from app.modules.members.controllers import router as members_router
from app.modules.samities.controllers import router as samities_router
from app.modules.transactions.controllers import balance_router
from app.modules.transactions.controllers import router as transactions_router

API_PREFIX = "/api/v1"

settings = get_settings()

app = FastAPI(title=settings.APP_NAME)

app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(samities_router, prefix=API_PREFIX)
app.include_router(members_router, prefix=API_PREFIX)
app.include_router(balance_router, prefix=API_PREFIX)
app.include_router(transactions_router, prefix=API_PREFIX)

register_error_handlers(app)


@app.get("/")
async def home(settings: Settings = Depends(get_settings)):
    return {"status": "ok", "app": settings.APP_NAME, "message": "Hello, Welcome to the Samity Khata"}


@app.get("/health")
async def get_health(settings: Settings = Depends(get_settings)):
    return {"status": "ok", "app": settings.APP_NAME}