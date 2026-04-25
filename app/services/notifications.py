from __future__ import annotations

import logging
from typing import Optional

from app.integrations import slack as slack_integration
from app.services.store import store

logger = logging.getLogger(__name__)


def _get_slack(user_id: str) -> Optional[tuple[str, str]]:
    """Return (bot_token, channel_id) if the user has Slack connected, else None."""
    conn = store.get_slack_connection(user_id)
    if not conn:
        return None
    token = conn.get("slack_bot_token")
    channel = conn.get("slack_channel_id")
    if not token or not channel:
        return None
    return token, channel


async def notify_scan_completed(user_id: str, scan_record) -> None:
    pair = _get_slack(user_id)
    if not pair:
        return
    token, channel = pair

    r = scan_record
    score = r.results.compliance_score
    violations = len(r.results.violations)
    compliant = len(r.results.compliant)

    score_emoji = ":white_check_mark:" if score >= 80 else ":warning:" if score >= 50 else ":x:"
    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "Compliance Scan Completed"},
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Organization:*\n{r.organization}"},
                {"type": "mrkdwn", "text": f"*Score:*\n{score_emoji} {score}%"},
                {"type": "mrkdwn", "text": f"*Violations:*\n{violations}"},
                {"type": "mrkdwn", "text": f"*Compliant:*\n{compliant}"},
            ],
        },
    ]

    if violations > 0:
        top = r.results.violations[:3]
        details = "\n".join(f"• *{v.policy_name}* ({v.severity.value})" for v in top)
        if violations > 3:
            details += f"\n_…and {violations - 3} more_"
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Top violations:*\n{details}"},
        })

    text = f"Scan completed for {r.organization} — score {score}%, {violations} violation(s)"
    await slack_integration.send_notification(token, channel, text=text, blocks=blocks)


async def notify_system_change(user_id: str, system, action: str) -> None:
    pair = _get_slack(user_id)
    if not pair:
        return
    token, channel = pair

    action_label = {"created": "registered", "updated": "updated", "deleted": "deleted"}.get(action, action)
    text = f"AI system *{system.name}* was {action_label}"

    blocks = [
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": text},
        },
    ]

    if action != "deleted":
        fields = [
            {"type": "mrkdwn", "text": f"*Owner:*\n{system.owner}"},
            {"type": "mrkdwn", "text": f"*Risk tier:*\n{system.risk_tier or 'Not assigned'}"},
        ]
        blocks.append({"type": "section", "fields": fields})

    await slack_integration.send_notification(token, channel, text=text, blocks=blocks)
