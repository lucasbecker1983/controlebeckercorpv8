from fastapi import APIRouter

router = APIRouter()


@router.get("/logs")
async def proxy_logs() -> list[dict[str, str]]:
    return []
