from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def list_vips() -> list[dict[str, str]]:
    return []
