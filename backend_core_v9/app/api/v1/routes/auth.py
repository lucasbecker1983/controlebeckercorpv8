from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(payload: LoginRequest) -> dict[str, object]:
    return {
        "success": True,
        "message": "Stub de migracao V9. Implementar validacao real contra app_users.",
        "user": {"username": payload.username, "role": "admin"},
    }
