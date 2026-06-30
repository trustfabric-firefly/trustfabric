from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.services import email
from app.services.email import send_added_to_org_email, send_invite_email


def test_send_invite_email_noop_when_smtp_not_configured():
    with patch.object(email.settings, "smtp_host", ""), \
         patch.object(email.settings, "smtp_from_email", ""):
        sent = send_invite_email(
            to_email="new@example.com",
            organization_name="Acme",
            role="viewer",
            invited_by_email="admin@example.com",
        )
    assert sent is False


def test_send_invite_email_sends_via_smtp():
    mock_server = MagicMock()
    mock_server.__enter__.return_value = mock_server

    with patch.object(email.settings, "smtp_host", "smtp.example.com"), \
         patch.object(email.settings, "smtp_from_email", "noreply@trustfabric.dev"), \
         patch.object(email.settings, "smtp_username", "user"), \
         patch.object(email.settings, "smtp_password", "pass"), \
         patch("smtplib.SMTP", return_value=mock_server) as mock_smtp:
        sent = send_invite_email(
            to_email="new@example.com",
            organization_name="Acme",
            role="viewer",
            invited_by_email="admin@example.com",
        )

    assert sent is True
    mock_smtp.assert_called_once()
    mock_server.starttls.assert_called_once()
    mock_server.login.assert_called_once_with("user", "pass")
    sent_message = mock_server.send_message.call_args[0][0]
    assert sent_message["To"] == "new@example.com"
    assert "Acme" in sent_message["Subject"]


def test_send_invite_email_returns_false_on_smtp_error():
    with patch.object(email.settings, "smtp_host", "smtp.example.com"), \
         patch.object(email.settings, "smtp_from_email", "noreply@trustfabric.dev"), \
         patch("smtplib.SMTP", side_effect=OSError("connection refused")):
        sent = send_invite_email(
            to_email="new@example.com",
            organization_name="Acme",
            role="viewer",
            invited_by_email=None,
        )
    assert sent is False


def test_send_added_to_org_email_sends_via_smtp():
    mock_server = MagicMock()
    mock_server.__enter__.return_value = mock_server

    with patch.object(email.settings, "smtp_host", "smtp.example.com"), \
         patch.object(email.settings, "smtp_from_email", "noreply@trustfabric.dev"), \
         patch("smtplib.SMTP", return_value=mock_server) as mock_smtp:
        sent = send_added_to_org_email(
            to_email="existing@example.com",
            organization_name="Acme",
            role="auditor",
            invited_by_email="admin@example.com",
        )

    assert sent is True
    mock_smtp.assert_called_once()
    sent_message = mock_server.send_message.call_args[0][0]
    assert sent_message["To"] == "existing@example.com"
    assert "added" in sent_message["Subject"].lower()


def test_send_added_to_org_email_noop_when_smtp_not_configured():
    with patch.object(email.settings, "smtp_host", ""), \
         patch.object(email.settings, "smtp_from_email", ""):
        sent = send_added_to_org_email(
            to_email="existing@example.com",
            organization_name="Acme",
            role="auditor",
            invited_by_email=None,
        )
    assert sent is False
