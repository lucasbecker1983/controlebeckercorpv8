from fastapi import APIRouter

router = APIRouter()


@router.get("/stats")
async def dns_stats() -> dict[str, int]:
    return {"totalQueries": 0, "blockedQueries": 0, "avgLatency": 0, "activeZones": 0}


@router.get("/zones")
async def dns_zones() -> list[dict[str, str]]:
    return []
