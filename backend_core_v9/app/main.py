from fastapi import FastAPI

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging


configure_logging()

app = FastAPI(
    title="Controle Becker Corp Core V9",
    version="9.0.0",
    openapi_url="/openapi.json",
)

register_exception_handlers(app)
app.include_router(api_router, prefix="/api")


@app.get("/", tags=["meta"])
async def root() -> dict[str, str]:
    return {"service": settings.app_name, "status": "online"}
