from fastapi import APIRouter
from pydantic import BaseModel, EmailStr

router = APIRouter()


class SmtpPayload(BaseModel):
    host: str
    port: int = 587
    username: str = ""
    password: str = ""
    from_email: EmailStr | None = None
    from_name: str = "Becker Sentinel"
    to_email: EmailStr | None = None
    use_tls: bool = True
    use_ssl: bool = False
    requires_auth: bool = True
    is_active: bool = True


@router.get("")
async def get_smtp_config() -> dict[str, object]:
    return {
        "host": "smtp.gmail.com",
        "port": 587,
        "username": "",
        "password": "",
        "has_password": False,
        "from_email": None,
        "from_name": "Becker Sentinel",
        "to_email": None,
        "use_tls": True,
        "use_ssl": False,
        "requires_auth": True,
        "is_active": True,
    }


@router.post("")
async def save_smtp_config(payload: SmtpPayload) -> dict[str, object]:
    return {"success": True, "config": payload.model_dump(exclude={"password"}) | {"password": "", "has_password": bool(payload.password)}}


@router.post("/test")
async def test_smtp(payload: SmtpPayload) -> dict[str, str]:
    return {"success": True, "message": f"Stub SMTP V9 pronto para teste em {payload.host}:{payload.port}"}
