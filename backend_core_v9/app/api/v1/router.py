from fastapi import APIRouter

from app.api.v1.routes import auth, health, security, smtp, users

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(security.router, prefix="/security", tags=["security"])
api_router.include_router(smtp.router, prefix="/security/smtp", tags=["smtp"])
