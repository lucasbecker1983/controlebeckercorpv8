from fastapi import APIRouter

from app.api.v1.routes import audit, backups, cert, dns, engine, health, proxy, vip

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(proxy.router, prefix="/proxy", tags=["proxy"])
api_router.include_router(engine.router, prefix="/proxy/engine", tags=["engine"])
api_router.include_router(audit.router, prefix="/proxy/audit", tags=["audit"])
api_router.include_router(backups.router, prefix="/backups", tags=["backups"])
api_router.include_router(cert.router, prefix="/cert", tags=["cert"])
api_router.include_router(dns.router, prefix="/dns", tags=["dns"])
api_router.include_router(vip.router, prefix="/dns/vip", tags=["vip"])
