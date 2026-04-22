from fastapi import APIRouter

router = APIRouter()


@router.get("/download")
async def download_cert() -> dict[str, str]:
    return {"message": "Stub certificado V9"}
