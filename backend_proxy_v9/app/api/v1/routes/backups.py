from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def list_backups() -> list[dict[str, str]]:
    return []
