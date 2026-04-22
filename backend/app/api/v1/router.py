from fastapi import APIRouter

from app.api.v1.endpoints import (
    alerts,
    auth,
    health,
    maintenance_windows,
    me,
    monitors,
    reports,
    scans,
    url_groups,
)

api_v1_router = APIRouter()

api_v1_router.include_router(auth.router)
api_v1_router.include_router(health.router)
api_v1_router.include_router(me.router)
api_v1_router.include_router(scans.router)
api_v1_router.include_router(url_groups.router)
api_v1_router.include_router(monitors.router)
api_v1_router.include_router(maintenance_windows.router)
api_v1_router.include_router(alerts.router)
api_v1_router.include_router(reports.router)
