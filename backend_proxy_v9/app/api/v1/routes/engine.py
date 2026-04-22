from fastapi import APIRouter

router = APIRouter()


@router.get("/status")
async def engine_status() -> dict[str, bool]:
    return {"dns_filter_ready": False}
