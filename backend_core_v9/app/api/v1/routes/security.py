from fastapi import APIRouter

router = APIRouter()


@router.get("/dashboard")
async def security_dashboard() -> dict[str, object]:
    return {
        "ufw": {"active": False, "rules": []},
        "fail2ban": {"active": False, "currently_banned": 0, "total_banned": 0, "banned_ips": []},
        "public_ips": [],
        "sentinel_metrics": {"top_ports": [], "top_ips": []},
    }
