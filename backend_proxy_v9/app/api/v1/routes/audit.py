from fastapi import APIRouter

router = APIRouter()


@router.get("/permanencia")
async def permanencia() -> list[dict[str, str]]:
    return []
