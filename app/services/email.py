from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def _send(to_email: str, subject: str, body: str) -> bool:
    """Send a plain-text email over SMTP. No-op (returns False) if SMTP isn't configured."""
    if not settings.smtp_ready:
        logger.info("SMTP not configured; skipping email to %s (%s)", to_email, subject)
        return False

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from_email
    message["To"] = to_email
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_username and settings.smtp_password:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to_email)
        return False


def send_invite_email(
    *,
    to_email: str,
    organization_name: str,
    role: str,
    invited_by_email: str | None,
) -> bool:
    inviter = invited_by_email or "An organization admin"
    login_url = f"{settings.frontend_url.rstrip('/')}/login"

    subject = f"You've been invited to join {organization_name} on TrustFabric"
    body = (
        f"{inviter} invited you to join {organization_name} on TrustFabric as {role}.\n\n"
        f"Sign up or log in with this email address ({to_email}) to get access:\n"
        f"{login_url}\n\n"
        "If you weren't expecting this invite, you can ignore this email."
    )
    return _send(to_email, subject, body)
