from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "orbicheck",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    imports=[
        "app.tasks.scan_tasks",
        "app.tasks.monitor_tasks",
        "app.tasks.report_tasks",
        "app.tasks.report_schedule_tasks",
        "app.tasks.notification_tasks",
        "app.tasks.url_group_run_tasks",
    ],
    beat_schedule={
        "dispatch-monitor-checks": {
            "task": "app.tasks.monitor_tasks.dispatch_monitor_checks",
            "schedule": 10.0,
        },
        "cleanup-monitor-snapshots": {
            "task": "app.tasks.monitor_tasks.cleanup_monitor_snapshots",
            "schedule": crontab(hour=3, minute=0),
        },
        "retry-notification-dispatch": {
            "task": "app.tasks.notification_tasks.retry_notification_dispatch",
            "schedule": 60.0,
        },
        "dispatch-due-report-schedules": {
            "task": "app.tasks.report_schedule_tasks.dispatch_due_report_schedules",
            "schedule": 60.0,
        },
    },
)
