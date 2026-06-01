"""SMTP email delivery for monitor alert notifications and reports."""

from __future__ import annotations

import json
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from html import escape

import aiosmtplib

from app.core.config import settings
from app.models.alert_event import AlertEvent
from app.models.monitor import Monitor

logger = logging.getLogger(__name__)

SMTP_TIMEOUT_SECONDS = 30

SEVERITY_COLORS = {
    "critical": "#dc2626",
    "warning": "#f59e0b",
    "info": "#2563eb",
}

CAPABILITY_LABELS = {
    "uptime_only": "Uptime",
    "content_change": "Content",
    "ssl_expiry": "SSL",
    "visual_change": "Visual",
}


def _dashboard_alerts_url() -> str:
    first_origin = settings.CORS_ORIGINS[0] if settings.CORS_ORIGINS else ""
    if isinstance(first_origin, str) and first_origin.startswith("http"):
        return f"{first_origin.rstrip('/')}/dashboard/alerts"
    return "/dashboard/alerts"


def _build_plain_text(alert_event: AlertEvent, monitor: Monitor) -> str:
    threshold_json = json.dumps(alert_event.threshold_config or {}, ensure_ascii=False, indent=2)
    return (
        "OrbiCheck Alert\n\n"
        f"Severity: {alert_event.severity}\n"
        f"Monitor: {monitor.display_name}\n"
        f"URL: {monitor.url}\n"
        f"Capability: {CAPABILITY_LABELS.get(alert_event.capability, alert_event.capability)}\n"
        f"Event type: {alert_event.event_type}\n"
        f"Message: {alert_event.message}\n"
        f"Actual value: {alert_event.actual_value}\n"
        f"Threshold config: {threshold_json}\n"
        f"Timestamp: {alert_event.created_at.isoformat() if alert_event.created_at else ''}\n"
        f"Dashboard: {_dashboard_alerts_url()}\n"
    )


def _build_html(alert_event: AlertEvent, monitor: Monitor) -> str:
    severity_color = SEVERITY_COLORS.get(alert_event.severity, "#2563eb")
    threshold_json = escape(
        json.dumps(alert_event.threshold_config or {}, ensure_ascii=False, indent=2)
    )
    timestamp = alert_event.created_at.isoformat() if alert_event.created_at else ""
    capability = CAPABILITY_LABELS.get(alert_event.capability, alert_event.capability)
    dashboard_url = _dashboard_alerts_url()
    return f"""
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:#18181b;color:#ffffff;font-size:22px;font-weight:700;">
                OrbiCheck Alerts
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:{severity_color};color:#ffffff;font-size:12px;font-weight:700;text-transform:uppercase;">
                  {escape(alert_event.severity)}
                </div>
                <h1 style="margin:16px 0 8px;font-size:24px;line-height:1.3;">
                  {escape(alert_event.message)}
                </h1>
                <p style="margin:0 0 20px;color:#52525b;font-size:14px;">
                  {escape(capability)} alert for {escape(monitor.display_name)}
                </p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:8px 0;font-weight:700;">Monitor</td>
                    <td style="padding:8px 0;">{escape(monitor.display_name)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-weight:700;">URL</td>
                    <td style="padding:8px 0;">{escape(monitor.url)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-weight:700;">Capability</td>
                    <td style="padding:8px 0;">{escape(capability)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-weight:700;">Event type</td>
                    <td style="padding:8px 0;">{escape(alert_event.event_type)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-weight:700;">Actual value</td>
                    <td style="padding:8px 0;">{escape(alert_event.actual_value)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-weight:700;">Timestamp</td>
                    <td style="padding:8px 0;">{escape(timestamp)}</td>
                  </tr>
                </table>

                <div style="margin-top:20px;padding:16px;border-radius:12px;background:#f4f4f5;">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:700;">Threshold config</p>
                  <pre style="margin:0;white-space:pre-wrap;font-size:12px;line-height:1.5;color:#27272a;">{threshold_json}</pre>
                </div>

                <div style="margin-top:24px;">
                  <a href="{escape(dashboard_url)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#18181b;color:#ffffff;text-decoration:none;font-weight:700;">
                    View in Dashboard
                  </a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
""".strip()


async def send_alert_email(
    to_email: str,
    alert_event: AlertEvent,
    monitor: Monitor,
) -> bool:
    """Send alert notification email. Returns True if sent successfully."""
    if not settings.EMAIL_DISPATCH_ENABLED:
        logger.info("alert_email_skipped_disabled to_email=%s", to_email)
        return False
    if not to_email.strip():
        logger.info("alert_email_skipped_missing_recipient monitor_id=%s", monitor.id)
        return False

    message = MIMEMultipart("alternative")
    message["Subject"] = (
        f"[OrbiCheck] {alert_event.severity.upper()} - {monitor.display_name}"
    )
    message["From"] = formataddr((settings.SMTP_FROM_NAME, settings.SMTP_FROM_EMAIL))
    message["To"] = to_email.strip()
    message.attach(MIMEText(_build_plain_text(alert_event, monitor), "plain", "utf-8"))
    message.attach(MIMEText(_build_html(alert_event, monitor), "html", "utf-8"))

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER or None,
            password=settings.SMTP_PASSWORD or None,
            start_tls=settings.SMTP_USE_TLS,
            timeout=SMTP_TIMEOUT_SECONDS,
        )
        logger.info(
            "alert_email_sent to_email=%s monitor_id=%s alert_id=%s",
            to_email,
            monitor.id,
            alert_event.id,
        )
        return True
    except aiosmtplib.SMTPException as exc:
        logger.warning(
            "alert_email_smtp_error to_email=%s monitor_id=%s error=%s",
            to_email,
            monitor.id,
            str(exc)[:400],
        )
        return False
    except OSError as exc:
        logger.warning(
            "alert_email_os_error to_email=%s monitor_id=%s error=%s",
            to_email,
            monitor.id,
            str(exc)[:400],
        )
        return False
    except Exception as exc:
        logger.warning(
            "alert_email_unexpected_error to_email=%s monitor_id=%s error=%s",
            to_email,
            monitor.id,
            str(exc)[:400],
        )
        return False


async def send_test_email(to_email: str) -> bool:
    """Send a test email to verify SMTP configuration. Returns True if sent."""
    if not settings.EMAIL_DISPATCH_ENABLED:
        return False
    if not to_email.strip():
        return False

    message = MIMEMultipart("alternative")
    message["Subject"] = "[OrbiCheck] Test Email - SMTP Configuration Verified"
    message["From"] = formataddr((settings.SMTP_FROM_NAME, settings.SMTP_FROM_EMAIL))
    message["To"] = to_email.strip()

    plain = (
        "OrbiCheck Test Email\n\n"
        "If you received this email, your SMTP configuration is working correctly.\n"
        "Alert emails will be delivered to this address when monitors trigger alerts.\n"
    )
    html = """
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr><td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0"
               style="background:#fff;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px;background:#18181b;color:#fff;font-size:22px;font-weight:700;">
              OrbiCheck Alerts
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#22c55e;color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;">
                SUCCESS
              </div>
              <h1 style="margin:16px 0 8px;font-size:24px;line-height:1.3;">
                SMTP Configuration Verified
              </h1>
              <p style="margin:0 0 20px;color:#52525b;font-size:14px;">
                If you received this email, your SMTP settings are working correctly.
                Alert emails will be delivered to this address when monitors trigger alerts.
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>
""".strip()

    message.attach(MIMEText(plain, "plain", "utf-8"))
    message.attach(MIMEText(html, "html", "utf-8"))

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER or None,
            password=settings.SMTP_PASSWORD or None,
            start_tls=settings.SMTP_USE_TLS,
            timeout=SMTP_TIMEOUT_SECONDS,
        )
        logger.info("test_email_sent to_email=%s", to_email)
        return True
    except aiosmtplib.SMTPException as exc:
        logger.warning("test_email_smtp_error to_email=%s error=%s", to_email, str(exc)[:400])
        raise
    except OSError as exc:
        logger.warning("test_email_os_error to_email=%s error=%s", to_email, str(exc)[:400])
        raise


async def send_report_email(
    *,
    to_email: str,
    schedule_name: str,
    report_title: str,
    target_domain: str,
    report_url: str,
) -> bool:
    """Send a scheduled report notification email with a dashboard link."""

    if not settings.EMAIL_DISPATCH_ENABLED:
        logger.info("report_email_skipped_disabled to_email=%s", to_email)
        return False
    recipient = to_email.strip()
    if not recipient:
        logger.info("report_email_skipped_missing_recipient schedule=%s", schedule_name)
        return False

    safe_title = escape(report_title)
    safe_schedule = escape(schedule_name)
    safe_domain = escape(target_domain)
    safe_url = escape(report_url)
    plain = (
        "OrbiCheck Scheduled Report\n\n"
        f"Schedule: {schedule_name}\n"
        f"Report: {report_title}\n"
        f"Target: {target_domain}\n"
        f"Open report: {report_url}\n"
    )
    html = f"""
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:#18181b;color:#ffffff;font-size:22px;font-weight:700;">
                OrbiCheck Reports
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 8px;color:#52525b;font-size:14px;">Scheduled report ready</p>
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">{safe_title}</h1>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr><td style="padding:8px 0;font-weight:700;">Schedule</td><td>{safe_schedule}</td></tr>
                  <tr><td style="padding:8px 0;font-weight:700;">Target</td><td>{safe_domain}</td></tr>
                </table>
                <div style="margin-top:24px;">
                  <a href="{safe_url}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#18181b;color:#ffffff;text-decoration:none;font-weight:700;">
                    Open report
                  </a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
""".strip()

    message = MIMEMultipart("alternative")
    message["Subject"] = f"[OrbiCheck] Scheduled report ready - {report_title}"
    message["From"] = formataddr((settings.SMTP_FROM_NAME, settings.SMTP_FROM_EMAIL))
    message["To"] = recipient
    message.attach(MIMEText(plain, "plain", "utf-8"))
    message.attach(MIMEText(html, "html", "utf-8"))
    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER or None,
        password=settings.SMTP_PASSWORD or None,
        start_tls=settings.SMTP_USE_TLS,
        timeout=SMTP_TIMEOUT_SECONDS,
    )
    logger.info("report_email_sent to_email=%s schedule=%s", recipient, schedule_name)
    return True
