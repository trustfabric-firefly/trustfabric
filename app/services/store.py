from __future__ import annotations

import os
from collections import Counter
from datetime import datetime
from typing import Any, List, Optional

import firebase_admin
from firebase_admin import credentials, firestore

from app.core.config import settings
from app.core.secrets import (
    INTEGRATION_TOKEN_FIELDS,
    decrypt_secret,
    encrypt_secret,
    is_encrypted,
)
from app.domain.models import (
    AIChatMessage,
    AIChatMessageCreate,
    AISystem,
    AISystemCreate,
    AISystemUpdate,
    ActivityEvent,
    ActivityEventCreate,
    AuditEvent,
    AuditEventType,
    DashboardSummary,
    GovernancePolicy,
    GovernancePolicyCreate,
    GovernancePolicyUpdate,
    LLMInteractionLog,
    NistCoverage,
    NistFunctionCoverage,
    Organization,
    OrganizationCopilotQuota,
    OrganizationCopilotUsage,
    OrganizationInvite,
    OrganizationInviteStatus,
    OrganizationMember,
    OrganizationSsoConfig,
    OrganizationUpdate,
    PolicyKey,
    RiskTier,
)
from app.services.policies import required_policies_for_risk


class FirestoreStore:
    def __init__(self) -> None:
        self._systems_collection = "systems"
        self._events_collection = "events"
        self._audits_collection = "audits"
        self._llm_logs_collection = "llm_logs"
        self._counter_collection = "_counters"
        self._counter_document = "ids"
        self._organizations_collection = "organizations"
        self._organization_members_collection = "organization_members"
        self._organization_invites_collection = "organization_invites"
        self._organization_sso_collection = "organization_sso"
        self._sso_exchange_collection = "sso_exchange_codes"
        self._integrations_collection = "organization_integrations"
        self._copilot_quotas_collection = "organization_copilot_quotas"
        self._copilot_usage_collection = "organization_copilot_usage"
        self._copilot_user_daily_collection = "organization_copilot_user_daily"
        # Lazy init so importing the app without Firebase creds (e.g. unit tests) does not fail.
        self._db: Any = None

    def _client(self) -> Any:
        if self._db is None:
            self._db = self._init_firestore_client()
        return self._db

    def _init_firestore_client(self):
        """
        Initialize Firestore and fail fast when credentials are missing/invalid.
        """
        creds_path = settings.firebase_credentials_file or os.getenv("SERVICE_FIREBASE")
        if not creds_path:
            raise RuntimeError("Firebase credentials path is not configured. Set SERVICE_FIREBASE in .env.")
        if not os.path.exists(creds_path):
            raise RuntimeError(f"Firebase credentials file not found: {creds_path}")

        try:
            firebase_admin.get_app()
        except ValueError:
            firebase_admin.initialize_app(credentials.Certificate(creds_path))

        return firestore.client()

    def _next_id(self, key: str, organization_id: str) -> int:
        counter_ref = self._client().collection(self._counter_collection).document(organization_id)
        field = f"{key}_id_seq"
        counter_ref.set({field: firestore.Increment(1)}, merge=True)
        data = counter_ref.get().to_dict() or {}
        return int(data.get(field, 0))

    @staticmethod
    def _serialize(model_obj) -> dict:
        return model_obj.model_dump(mode="json")

    @staticmethod
    def _matches_org(payload: dict[str, Any], organization_id: str) -> bool:
        doc_org = payload.get("organization_id")
        if doc_org is None:
            return organization_id == settings.default_organization_id
        return doc_org == organization_id

    # --- Organizations ---
    def create_organization(self, org: Organization) -> Organization:
        self._client().collection(self._organizations_collection).document(org.id).set(self._serialize(org))
        return org

    def get_organization(self, organization_id: str) -> Optional[Organization]:
        doc = self._client().collection(self._organizations_collection).document(organization_id).get()
        if not doc.exists:
            return None
        return Organization.model_validate(doc.to_dict() or {})

    def add_organization_member(self, member: OrganizationMember) -> OrganizationMember:
        doc_id = f"{member.organization_id}_{member.user_id}"
        self._client().collection(self._organization_members_collection).document(doc_id).set(
            self._serialize(member)
        )
        return member

    def list_user_memberships(self, user_id: str) -> List[OrganizationMember]:
        members: List[OrganizationMember] = []
        docs = (
            self._client()
            .collection(self._organization_members_collection)
            .where("user_id", "==", user_id)
            .stream()
        )
        for doc in docs:
            members.append(OrganizationMember.model_validate(doc.to_dict() or {}))
        return sorted(members, key=lambda member: member.joined_at)

    def list_organization_members(self, organization_id: str) -> List[OrganizationMember]:
        members: List[OrganizationMember] = []
        docs = (
            self._client()
            .collection(self._organization_members_collection)
            .where("organization_id", "==", organization_id)
            .stream()
        )
        for doc in docs:
            members.append(OrganizationMember.model_validate(doc.to_dict() or {}))
        return sorted(members, key=lambda member: member.joined_at)

    def get_organization_member(self, organization_id: str, user_id: str) -> Optional[OrganizationMember]:
        doc_id = f"{organization_id}_{user_id}"
        doc = self._client().collection(self._organization_members_collection).document(doc_id).get()
        if not doc.exists:
            return None
        return OrganizationMember.model_validate(doc.to_dict() or {})

    def get_organization_member_by_email(self, organization_id: str, email: str) -> Optional[OrganizationMember]:
        normalized = email.strip().lower()
        for member in self.list_organization_members(organization_id):
            if member.email and member.email.strip().lower() == normalized:
                return member
        return None

    def update_organization_member(self, member: OrganizationMember) -> OrganizationMember:
        doc_id = f"{member.organization_id}_{member.user_id}"
        self._client().collection(self._organization_members_collection).document(doc_id).set(
            self._serialize(member)
        )
        return member

    def remove_organization_member(self, organization_id: str, user_id: str) -> None:
        doc_id = f"{organization_id}_{user_id}"
        self._client().collection(self._organization_members_collection).document(doc_id).delete()

    def create_organization_invite(self, invite: OrganizationInvite) -> OrganizationInvite:
        self._client().collection(self._organization_invites_collection).document(invite.id).set(
            self._serialize(invite)
        )
        return invite

    def get_organization_invite(self, organization_id: str, invite_id: str) -> Optional[OrganizationInvite]:
        doc = self._client().collection(self._organization_invites_collection).document(invite_id).get()
        if not doc.exists:
            return None
        invite = OrganizationInvite.model_validate(doc.to_dict() or {})
        if invite.organization_id != organization_id:
            return None
        return invite

    def list_organization_invites(
        self,
        organization_id: str,
        *,
        status: OrganizationInviteStatus = OrganizationInviteStatus.pending,
    ) -> List[OrganizationInvite]:
        invites: List[OrganizationInvite] = []
        docs = (
            self._client()
            .collection(self._organization_invites_collection)
            .where("organization_id", "==", organization_id)
            .where("status", "==", status.value)
            .stream()
        )
        for doc in docs:
            invites.append(OrganizationInvite.model_validate(doc.to_dict() or {}))
        return sorted(invites, key=lambda invite: invite.created_at)

    def list_pending_invites_for_email(self, email: str) -> List[OrganizationInvite]:
        normalized = email.strip().lower()
        invites: List[OrganizationInvite] = []
        docs = (
            self._client()
            .collection(self._organization_invites_collection)
            .where("email", "==", normalized)
            .where("status", "==", OrganizationInviteStatus.pending.value)
            .stream()
        )
        for doc in docs:
            invites.append(OrganizationInvite.model_validate(doc.to_dict() or {}))
        return invites

    def get_pending_invite_for_email(self, organization_id: str, email: str) -> Optional[OrganizationInvite]:
        normalized = email.strip().lower()
        for invite in self.list_organization_invites(organization_id, status=OrganizationInviteStatus.pending):
            if invite.email == normalized:
                return invite
        return None

    def update_organization_invite(self, invite: OrganizationInvite) -> OrganizationInvite:
        self._client().collection(self._organization_invites_collection).document(invite.id).set(
            self._serialize(invite)
        )
        return invite

    def get_organization_sso_config(self, organization_id: str) -> Optional[OrganizationSsoConfig]:
        doc = self._client().collection(self._organization_sso_collection).document(organization_id).get()
        if not doc.exists:
            return None
        return OrganizationSsoConfig.model_validate(doc.to_dict() or {})

    def save_organization_sso_config(self, config: OrganizationSsoConfig) -> OrganizationSsoConfig:
        self._client().collection(self._organization_sso_collection).document(config.organization_id).set(
            self._serialize(config)
        )
        return config

    def delete_organization_sso_config(self, organization_id: str) -> None:
        self._client().collection(self._organization_sso_collection).document(organization_id).delete()

    def list_enabled_sso_configs(self) -> List[OrganizationSsoConfig]:
        configs: List[OrganizationSsoConfig] = []
        docs = (
            self._client()
            .collection(self._organization_sso_collection)
            .where("enabled", "==", True)
            .stream()
        )
        for doc in docs:
            configs.append(OrganizationSsoConfig.model_validate(doc.to_dict() or {}))
        return configs

    def create_sso_exchange_code(
        self,
        *,
        code: str,
        user_id: str,
        organization_id: str,
        email: str,
        return_to: str,
        expires_at: datetime,
    ) -> None:
        self._client().collection(self._sso_exchange_collection).document(code).set(
            {
                "code": code,
                "user_id": user_id,
                "organization_id": organization_id,
                "email": email,
                "return_to": return_to,
                "expires_at": expires_at.isoformat(),
                "used": False,
            }
        )

    def consume_sso_exchange_code(self, code: str) -> Optional[dict[str, Any]]:
        doc_ref = self._client().collection(self._sso_exchange_collection).document(code)
        doc = doc_ref.get()
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        if data.get("used"):
            return None
        expires_raw = data.get("expires_at")
        if expires_raw:
            expires_at = datetime.fromisoformat(str(expires_raw))
            if expires_at < datetime.utcnow():
                return None
        doc_ref.update({"used": True})
        return data

    def update_organization(self, organization_id: str, payload: OrganizationUpdate) -> Optional[Organization]:
        org = self.get_organization(organization_id)
        if org is None:
            return None
        updates: dict[str, Any] = {"name": payload.name.strip()}
        if payload.compliance_contact_email is not None:
            contact = payload.compliance_contact_email.strip()
            updates["compliance_contact_email"] = contact or None
        updated = org.model_copy(update=updates)
        self._client().collection(self._organizations_collection).document(organization_id).set(
            self._serialize(updated)
        )
        return updated

    # --- Copilot quotas & usage ---
    def get_copilot_quota(self, organization_id: str) -> Optional[OrganizationCopilotQuota]:
        doc = self._client().collection(self._copilot_quotas_collection).document(organization_id).get()
        if not doc.exists:
            return None
        payload = doc.to_dict() or {}
        payload.setdefault("organization_id", organization_id)
        return OrganizationCopilotQuota.model_validate(payload)

    def upsert_copilot_quota(self, quota: OrganizationCopilotQuota) -> OrganizationCopilotQuota:
        self._client().collection(self._copilot_quotas_collection).document(quota.organization_id).set(
            self._serialize(quota),
            merge=True,
        )
        return quota

    def get_copilot_usage(self, organization_id: str, period: str) -> OrganizationCopilotUsage:
        doc_id = f"{organization_id}_{period}"
        doc = self._client().collection(self._copilot_usage_collection).document(doc_id).get()
        if not doc.exists:
            return OrganizationCopilotUsage(organization_id=organization_id, period=period)
        payload = doc.to_dict() or {}
        payload.setdefault("organization_id", organization_id)
        payload.setdefault("period", period)
        return OrganizationCopilotUsage.model_validate(payload)

    def increment_copilot_usage(
        self,
        organization_id: str,
        period: str,
        *,
        user_id: str,
        day: str,
        cost_usd: float,
    ) -> OrganizationCopilotUsage:
        now = datetime.utcnow()
        usage_ref = self._client().collection(self._copilot_usage_collection).document(
            f"{organization_id}_{period}"
        )
        usage_ref.set(
            {
                "organization_id": organization_id,
                "period": period,
                "request_count": firestore.Increment(1),
                "estimated_cost_usd": firestore.Increment(float(cost_usd)),
                "last_request_at": now.isoformat(),
            },
            merge=True,
        )
        daily_ref = self._client().collection(self._copilot_user_daily_collection).document(
            f"{organization_id}_{day}_{user_id}"
        )
        daily_ref.set({"count": firestore.Increment(1)}, merge=True)
        return self.get_copilot_usage(organization_id, period)

    def get_user_daily_copilot_requests(self, organization_id: str, user_id: str, day: str) -> int:
        doc = self._client().collection(self._copilot_user_daily_collection).document(
            f"{organization_id}_{day}_{user_id}"
        ).get()
        if not doc.exists:
            return 0
        payload = doc.to_dict() or {}
        return int(payload.get("count", 0))

    @staticmethod
    def _encrypt_integration_fields(doc: dict[str, Any]) -> dict[str, Any]:
        out = dict(doc)
        for field in INTEGRATION_TOKEN_FIELDS:
            if out.get(field):
                value = str(out[field])
                if not is_encrypted(value):
                    out[field] = encrypt_secret(value)
        return out

    @staticmethod
    def _decrypt_integration_fields(doc: dict[str, Any]) -> dict[str, Any]:
        out = dict(doc)
        for field in INTEGRATION_TOKEN_FIELDS:
            if out.get(field):
                out[field] = decrypt_secret(str(out[field]))
        return out

    def migrate_plaintext_integration_tokens(self) -> int:
        """Encrypt legacy plaintext integration tokens. Returns updated document count."""
        updated = 0
        for doc in self._client().collection(self._integrations_collection).stream():
            data = doc.to_dict() or {}
            patches: dict[str, str] = {}
            for field in INTEGRATION_TOKEN_FIELDS:
                raw = data.get(field)
                if raw and not is_encrypted(str(raw)):
                    patches[field] = encrypt_secret(str(raw))
            if patches:
                doc.reference.update(patches)
                updated += 1
        return updated

    # --- Systems ---
    def create_system(self, data: AISystemCreate, user_id: str, organization_id: str) -> AISystem:
        system_id = self._next_id("system", organization_id)
        now = datetime.utcnow()

        required_policies = self._derive_policies(data.risk_tier)

        system = AISystem(
            id=system_id,
            organization_id=organization_id,
            created_at=now,
            updated_at=now,
            required_policies=required_policies,
            missing_required_controls=self._missing_controls(required_policies, data),
            **data.model_dump(),
        )
        self._client().collection(self._systems_collection).document(str(system_id)).set(self._serialize(system))

        self._record_audit(
            event_type=AuditEventType.system_created,
            target_id=system_id,
            user_id=user_id,
            organization_id=organization_id,
            summary=f"System created: {system.name}",
        )
        return system

    def list_systems(self, organization_id: str) -> List[AISystem]:
        systems: List[AISystem] = []
        for doc in self._client().collection(self._systems_collection).stream():
            payload = doc.to_dict() or {}
            if not self._matches_org(payload, organization_id):
                continue
            payload["id"] = int(doc.id)
            payload.setdefault("organization_id", organization_id)
            systems.append(AISystem.model_validate(payload))
        return sorted(systems, key=lambda system: system.id)

    def link_scan_to_systems(self, scan_record, organization_id: str) -> None:
        """Update all AI systems that have a GitHub-related integration with the latest scan results.
        Called automatically after every scan completes."""
        github_keywords = {"github", "copilot", "github copilot"}
        systems = self.list_systems(organization_id)
        for system in systems:
            integrations_lower = {i.lower() for i in system.external_integrations}
            # Also match systems with model_type LLM or any github keyword in integrations
            if integrations_lower & github_keywords or "github" in system.name.lower():
                self._client().collection(self._systems_collection).document(str(system.id)).update({
                    "last_scan_id": scan_record.scan_id,
                    "last_scan_date": scan_record.timestamp.isoformat(),
                    "compliance_score": scan_record.results.compliance_score,
                    "active_violations": len(scan_record.results.violations),
                    "updated_at": datetime.utcnow().isoformat(),
                })

    def get_system(self, system_id: int, organization_id: str) -> Optional[AISystem]:
        doc = self._client().collection(self._systems_collection).document(str(system_id)).get()
        if not doc.exists:
            return None
        payload = doc.to_dict() or {}
        if not self._matches_org(payload, organization_id):
            return None
        payload["id"] = system_id
        payload.setdefault("organization_id", organization_id)
        return AISystem.model_validate(payload)

    def update_system(
        self,
        system_id: int,
        data: AISystemUpdate,
        user_id: str,
        organization_id: str,
    ) -> Optional[AISystem]:
        system = self.get_system(system_id, organization_id)
        if system is None:
            return None

        # Capture old risk tier before applying updates so we can log tier changes.
        old_risk_tier = system.risk_tier

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(system, key, value)

        system.updated_at = datetime.utcnow()
        system.required_policies = self._derive_policies(system.risk_tier)
        system.missing_required_controls = self._missing_controls(system.required_policies, system)

        self._record_audit(
            event_type=AuditEventType.system_updated,
            target_id=system_id,
            user_id=user_id,
            organization_id=organization_id,
            summary=f"System updated: {system.name}",
        )

        # If the risk tier changed, emit a dedicated audit record for change history.
        if "risk_tier" in update_data and system.risk_tier != old_risk_tier:
            self._record_audit(
                event_type=AuditEventType.risk_tier_changed,
                target_id=system_id,
                user_id=user_id,
                organization_id=organization_id,
                summary=(
                    f"Risk tier changed from {old_risk_tier or 'None'} "
                    f"to {system.risk_tier} (justification: {system.risk_justification})"
                ),
            )
        self._client().collection(self._systems_collection).document(str(system_id)).set(self._serialize(system))
        return system

    def delete_system(self, system_id: int, user_id: str, organization_id: str) -> bool:
        system = self.get_system(system_id, organization_id)
        if system is None:
            return False
        self._delete_system_chat_subcollection(system_id)
        self._delete_system_policies_subcollection(system_id)
        self._client().collection(self._systems_collection).document(str(system_id)).delete()
        self._record_audit(
            event_type=AuditEventType.system_deleted,
            target_id=system_id,
            user_id=user_id,
            organization_id=organization_id,
            summary=f"System deleted: {system.name}",
        )
        return True

    # --- Events ---
    def create_event(self, data: ActivityEventCreate, organization_id: str) -> ActivityEvent:
        event_id = self._next_id("event", organization_id)
        event = ActivityEvent(id=event_id, organization_id=organization_id, **data.model_dump())
        self._client().collection(self._events_collection).document(str(event_id)).set(self._serialize(event))
        return event

    def list_events(
        self,
        organization_id: str,
        system_id: Optional[int] = None,
        event_type: Optional[str] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
    ) -> List[ActivityEvent]:
        events: List[ActivityEvent] = []
        for doc in self._client().collection(self._events_collection).stream():
            payload = doc.to_dict() or {}
            if not self._matches_org(payload, organization_id):
                continue
            payload["id"] = int(doc.id)
            payload.setdefault("organization_id", organization_id)
            events.append(ActivityEvent.model_validate(payload))
        if system_id is not None:
            events = [e for e in events if e.system_id == system_id]
        if event_type is not None:
            events = [e for e in events if e.event_type == event_type]
        if start is not None:
            events = [e for e in events if e.timestamp >= start]
        if end is not None:
            events = [e for e in events if e.timestamp <= end]
        return sorted(events, key=lambda event: event.id)

    # --- Audit ---
    def _record_audit(
        self,
        event_type: AuditEventType,
        target_id: Optional[int],
        user_id: str,
        organization_id: str,
        summary: str,
    ) -> None:
        audit_id = self._next_id("audit", organization_id)
        audit = AuditEvent(
            id=audit_id,
            organization_id=organization_id,
            event_type=event_type,
            target_id=target_id,
            user_id=user_id,
            timestamp=datetime.utcnow(),
            summary=summary,
        )
        self._client().collection(self._audits_collection).document(str(audit_id)).set(self._serialize(audit))

    def list_audits(self, organization_id: str) -> List[AuditEvent]:
        audits: List[AuditEvent] = []
        for doc in self._client().collection(self._audits_collection).stream():
            payload = doc.to_dict() or {}
            if not self._matches_org(payload, organization_id):
                continue
            payload["id"] = int(doc.id)
            payload.setdefault("organization_id", organization_id)
            audits.append(AuditEvent.model_validate(payload))
        return sorted(audits, key=lambda audit: audit.id)

    # --- LLM Logs ---
    def log_llm_interaction(
        self,
        log: LLMInteractionLog,
        organization_id: str | None = None,
    ) -> LLMInteractionLog:
        org_id = organization_id or settings.default_organization_id
        log_id = self._next_id("llm_log", org_id)
        stored = log.model_copy(update={"id": log_id, "organization_id": org_id})
        self._client().collection(self._llm_logs_collection).document(str(log_id)).set(self._serialize(stored))
        return stored

    def list_llm_logs(
        self,
        organization_id: str,
        *,
        system_id: Optional[int] = None,
        user_id: Optional[str] = None,
        model_name: Optional[str] = None,
        success: Optional[bool] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        limit: int = 200,
    ) -> List[LLMInteractionLog]:
        logs: List[LLMInteractionLog] = []
        for doc in self._client().collection(self._llm_logs_collection).stream():
            payload = doc.to_dict() or {}
            if not self._matches_org(payload, organization_id):
                continue
            payload["id"] = int(doc.id)
            payload.setdefault("organization_id", organization_id)
            logs.append(LLMInteractionLog.model_validate(payload))
        if system_id is not None:
            logs = [log for log in logs if log.system_id == system_id]
        if user_id is not None:
            logs = [log for log in logs if log.user_id == user_id]
        if model_name is not None:
            logs = [log for log in logs if log.model_name == model_name]
        if success is not None:
            logs = [log for log in logs if log.success == success]
        if start is not None:
            logs = [log for log in logs if log.timestamp >= start]
        if end is not None:
            logs = [log for log in logs if log.timestamp <= end]
        logs = sorted(logs, key=lambda log: log.id or 0, reverse=True)
        return logs[: max(1, min(limit, 500))]

    def get_llm_log(self, log_id: int, organization_id: str) -> Optional[LLMInteractionLog]:
        doc = self._client().collection(self._llm_logs_collection).document(str(log_id)).get()
        if not doc.exists:
            return None
        payload = doc.to_dict() or {}
        if not self._matches_org(payload, organization_id):
            return None
        payload["id"] = int(doc.id)
        payload.setdefault("organization_id", organization_id)
        return LLMInteractionLog.model_validate(payload)

    # --- Governance policies (systems/{system_id}/policies) ---
    def _system_policies_collection(self, system_id: int) -> Any:
        return (
            self._client()
            .collection(self._systems_collection)
            .document(str(system_id))
            .collection("policies")
        )

    def _delete_system_policies_subcollection(self, system_id: int) -> None:
        for doc in self._system_policies_collection(system_id).stream():
            doc.reference.delete()

    @staticmethod
    def _coerce_policy_datetime(val: Any) -> datetime:
        if isinstance(val, datetime):
            return val
        if hasattr(val, "timestamp") and callable(val.timestamp):
            return datetime.utcfromtimestamp(val.timestamp())
        if isinstance(val, str):
            cleaned = val.replace("Z", "+00:00") if val.endswith("Z") else val
            dt = datetime.fromisoformat(cleaned)
            return dt.replace(tzinfo=None) if dt.tzinfo else dt
        raise ValueError(f"Unsupported datetime value: {type(val)!r}")

    def _normalize_policy_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        out = dict(payload)
        for key in ("created_at", "updated_at"):
            if key in out and out[key] is not None:
                out[key] = self._coerce_policy_datetime(out[key])
        return out

    # --- Persistent AI chat history (systems/{system_id}/copilot_chat) ---
    def _system_chat_collection(self, system_id: int) -> Any:
        return (
            self._client()
            .collection(self._systems_collection)
            .document(str(system_id))
            .collection("copilot_chat")
        )

    def _delete_system_chat_subcollection(self, system_id: int) -> None:
        for doc in self._system_chat_collection(system_id).stream():
            doc.reference.delete()

    def _normalize_chat_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        out = dict(payload)
        if "created_at" in out and out["created_at"] is not None:
            out["created_at"] = self._coerce_policy_datetime(out["created_at"])
        return out

    def list_system_chat_messages(
        self,
        system_id: int,
        user_id: str,
        organization_id: str,
    ) -> Optional[List[AIChatMessage]]:
        if self.get_system(system_id, organization_id) is None:
            return None

        messages: List[AIChatMessage] = []
        docs = self._system_chat_collection(system_id).where("user_id", "==", user_id).stream()
        for doc in docs:
            raw = doc.to_dict() or {}
            raw["id"] = doc.id
            raw["system_id"] = system_id
            messages.append(AIChatMessage.model_validate(self._normalize_chat_payload(raw)))
        return sorted(messages, key=lambda message: message.created_at)

    def create_system_chat_message(
        self,
        system_id: int,
        user_id: str,
        data: AIChatMessageCreate,
        organization_id: str,
    ) -> Optional[AIChatMessage]:
        if self.get_system(system_id, organization_id) is None:
            return None

        now = datetime.utcnow()
        ref = self._system_chat_collection(system_id).document()
        message = AIChatMessage(
            id=ref.id,
            system_id=system_id,
            user_id=user_id,
            created_at=now,
            **data.model_dump(),
        )
        ref.set(message.model_dump(mode="json"))
        return message

    def list_system_policies(self, system_id: int, organization_id: str) -> Optional[List[GovernancePolicy]]:
        if self.get_system(system_id, organization_id) is None:
            return None
        policies: List[GovernancePolicy] = []
        for doc in self._system_policies_collection(system_id).stream():
            raw = doc.to_dict() or {}
            raw["id"] = doc.id
            policies.append(GovernancePolicy.model_validate(self._normalize_policy_payload(raw)))
        return sorted(policies, key=lambda p: p.created_at, reverse=True)

    def create_system_policy(
        self,
        system_id: int,
        data: GovernancePolicyCreate,
        user_id: str,
        organization_id: str,
    ) -> Optional[GovernancePolicy]:
        if self.get_system(system_id, organization_id) is None:
            return None
        now = datetime.utcnow()
        ref = self._system_policies_collection(system_id).document()
        policy_id = ref.id
        policy = GovernancePolicy(
            id=policy_id,
            system_id=system_id,
            name=data.name,
            description=data.description,
            category=data.category,
            severity=data.severity,
            applies_to=data.applies_to,
            creation_method=data.creation_method,
            status=data.status,
            rules=data.rules,
            created_by=user_id,
            created_at=now,
            updated_at=now,
            version=1,
        )
        ref.set(policy.model_dump(mode="json"))
        self._record_audit(
            event_type=AuditEventType.policy_created,
            target_id=system_id,
            user_id=user_id,
            organization_id=organization_id,
            summary=f"Governance policy saved: {data.name} ({policy_id})",
        )
        return policy

    def list_all_active_governance_policies(self, organization_id: str) -> List[GovernancePolicy]:
        """Return all active governance policies across every system via a collection group query."""
        results: List[GovernancePolicy] = []
        try:
            docs = (
                self._client()
                .collection_group("policies")
                .where("status", "==", "active")
                .stream()
            )
            org_system_ids = {str(system.id) for system in self.list_systems(organization_id)}
            for doc in docs:
                raw = doc.to_dict() or {}
                raw["id"] = doc.id
                if str(raw.get("system_id")) not in org_system_ids:
                    continue
                try:
                    results.append(
                        GovernancePolicy.model_validate(self._normalize_policy_payload(raw))
                    )
                except Exception:
                    pass  # skip malformed docs
        except Exception:
            pass  # never fail a scan due to policy fetch error
        return results

    def update_system_policy(
        self,
        system_id: int,
        policy_id: str,
        data: GovernancePolicyUpdate,
        user_id: str,
        organization_id: str,
    ) -> Optional[GovernancePolicy]:
        if self.get_system(system_id, organization_id) is None:
            return None
        ref = self._system_policies_collection(system_id).document(policy_id)
        snap = ref.get()
        if not snap.exists:
            return None
        raw = dict(snap.to_dict() or {})
        raw["id"] = policy_id
        current = GovernancePolicy.model_validate(self._normalize_policy_payload(raw))
        if data.status is None:
            return current
        now = datetime.utcnow()
        updated = current.model_copy(
            update={
                "status": data.status,
                "updated_at": now,
                "version": current.version + 1,
            }
        )
        ref.set(updated.model_dump(mode="json"))
        self._record_audit(
            event_type=AuditEventType.policy_updated,
            target_id=system_id,
            user_id=user_id,
            organization_id=organization_id,
            summary=f"Governance policy updated: {current.name} ({policy_id}) status={data.status.value}",
        )
        return updated

    # --- Dashboard ---
    def dashboard_summary(self, organization_id: str) -> DashboardSummary:
        systems = self.list_systems(organization_id)
        total_systems = len(systems)

        risk_counter: Counter[RiskTier] = Counter()
        missing_controls = 0
        for s in systems:
            if s.risk_tier is not None:
                risk_counter[s.risk_tier] += 1
            if s.missing_required_controls:
                missing_controls += 1

        events = self.list_events(organization_id)
        total_events = len(events)
        events_per_system_counter: Counter[int] = Counter(e.system_id for e in events)

        return DashboardSummary(
            total_systems=total_systems,
            systems_by_risk=dict(risk_counter),
            systems_missing_controls=missing_controls,
            total_events=total_events,
            events_per_system=dict(events_per_system_counter),
        )

    # --- NIST Coverage ---

    # Maps governance policy categories to NIST AI RMF functions.
    # Each function has a fixed number of controls (cells in the heatmap).
    _NIST_FUNCTIONS: dict[str, dict] = {
        "Govern":  {"controls": 6, "categories": {"access_control", "compliance", "security"}},
        "Map":     {"controls": 5, "categories": {"model_restrictions", "feature_control"}},
        "Measure": {"controls": 5, "categories": {"quality_control", "data_privacy"}},
        "Manage":  {"controls": 4, "categories": {"cost_management"}},
    }

    def nist_coverage(self, organization_id: str) -> NistCoverage:
        """
        Aggregate governance policies across all systems into NIST AI RMF function coverage.
        Each policy's category is mapped to a NIST function; active/draft/inactive counts
        are tallied and missing slots are inferred from the fixed control totals.
        """
        systems = self.list_systems(organization_id)

        counts: dict[str, dict[str, int]] = {
            fn: {"active": 0, "draft": 0, "inactive": 0}
            for fn in self._NIST_FUNCTIONS
        }

        for system in systems:
            policies = self.list_system_policies(system.id, organization_id)
            for policy in policies:
                for fn, meta in self._NIST_FUNCTIONS.items():
                    if policy.category.value in meta["categories"]:
                        status = policy.status.value
                        if status in counts[fn]:
                            counts[fn][status] += 1

        functions = []
        total_active = 0
        total_controls = 0

        for fn, meta in self._NIST_FUNCTIONS.items():
            c = counts[fn]
            covered = c["active"] + c["draft"] + c["inactive"]
            missing = max(0, meta["controls"] - covered)
            functions.append(NistFunctionCoverage(
                function=fn,
                total_controls=meta["controls"],
                active=c["active"],
                draft=c["draft"],
                inactive=c["inactive"],
                missing=missing,
            ))
            total_active += c["active"]
            total_controls += meta["controls"]

        return NistCoverage(
            functions=functions,
            total_controls=total_controls,
            total_active=total_active,
        )


    # --- Scan Policies ---

    _DEFAULT_SCAN_POLICIES = [
        # ── Personal / repo-level checks ─────────────────────────────────────
        {
            "check_id": "chk_branch_protection",
            "name": "Branch Protection on Default Branch",
            "description": "Checks that your repositories have protection rules enabled on their default branch, preventing direct pushes and enforcing review workflows.",
            "severity": "high",
            "tier": "personal",
        },
        {
            "check_id": "chk_pr_reviews",
            "name": "Pull Request Reviews Required",
            "description": "Checks that protected branches require at least one approving review before code can be merged, ensuring human oversight of all changes.",
            "severity": "medium",
            "tier": "personal",
        },
        {
            "check_id": "chk_vulnerability_alerts",
            "name": "Vulnerability Alerts Enabled",
            "description": "Checks that Dependabot vulnerability alerts are active on your repositories, notifying you when dependencies have known security issues.",
            "severity": "high",
            "tier": "personal",
        },
        {
            "check_id": "chk_actions_restricted",
            "name": "GitHub Actions Restricted to Trusted Sources",
            "description": "Checks that GitHub Actions are configured to allow only local or verified actions rather than all third-party actions, reducing supply-chain risk.",
            "severity": "medium",
            "tier": "personal",
        },
        {
            "check_id": "chk_secret_scanning",
            "name": "Secret Scanning Enabled",
            "description": "Checks that GitHub Secret Scanning is enabled on your repositories. When a hardcoded API key, token, or credential is committed, GitHub detects it and alerts you before it can be exploited.",
            "severity": "high",
            "tier": "personal",
        },
        {
            "check_id": "chk_secret_push_protection",
            "name": "Secret Scanning Push Protection Enabled",
            "description": "Checks that push protection is active. This is stronger than secret scanning — it blocks the push entirely if a secret is detected, preventing it from ever reaching the repository history.",
            "severity": "high",
            "tier": "personal",
        },
        # ── Enterprise-only checks (Copilot Business/Enterprise) ─────────────
        {
            "check_id": "chk_public_code_blocked",
            "name": "Copilot Public Code Suggestions Blocked",
            "description": "Checks that your GitHub Copilot org policy blocks suggestions that match public code, preventing potential IP and license compliance issues.",
            "severity": "high",
            "tier": "enterprise",
        },
        {
            "check_id": "chk_copilot_cli_disabled",
            "name": "Copilot CLI Feature Disabled (or Controlled)",
            "description": "Checks that the Copilot CLI feature is not openly enabled across the org unless explicitly approved, limiting the attack surface for AI-generated shell commands.",
            "severity": "medium",
            "tier": "enterprise",
        },
        {
            "check_id": "chk_seat_management",
            "name": "Copilot Seat Assignment Restricted",
            "description": "Checks that Copilot seats are assigned to specific approved users rather than enabled for all org members, ensuring access control over AI tool usage.",
            "severity": "medium",
            "tier": "enterprise",
        },
        {
            "check_id": "chk_inactive_seats",
            "name": "Copilot Inactive Seat Ratio Below 30%",
            "description": "Checks that fewer than 30% of allocated Copilot seats are inactive, flagging license waste and potential security risk from unused elevated access.",
            "severity": "low",
            "tier": "enterprise",
        },
        {
            "check_id": "chk_org_two_factor",
            "name": "Organization Two-Factor Authentication Required",
            "description": "Checks that your GitHub organization enforces two-factor authentication for all members, a baseline identity security control required by most enterprise security policies.",
            "severity": "high",
            "tier": "enterprise",
        },
    ]

    def get_scan_policies(self, organization_id: str) -> list:
        from app.domain.models import ScanPolicy, GovernancePolicySeverity
        docs = (
            self._client()
            .collection("scan_policies")
            .where("organization_id", "==", organization_id)
            .stream()
        )
        results = [ScanPolicy.model_validate(d.to_dict()) for d in docs]

        existing_ids = {r.check_id for r in results}

        # Seed defaults (full set if empty; backfill missing checks if partially seeded)
        now = datetime.utcnow()
        for p in self._DEFAULT_SCAN_POLICIES:
            if p["check_id"] in existing_ids:
                continue
            policy = ScanPolicy(
                check_id=p["check_id"],
                name=p["name"],
                description=p["description"],
                severity=GovernancePolicySeverity(p["severity"]),
                enabled=True,
                tier=p.get("tier", "personal"),
                user_id=organization_id,
                created_at=now,
                updated_at=now,
            )
            doc_id = f"{organization_id}_{p['check_id']}"
            payload = policy.model_dump(mode="json")
            payload["organization_id"] = organization_id
            self._client().collection("scan_policies").document(doc_id).set(payload)
            results.append(policy)

        return sorted(results, key=lambda p: p.check_id)

    def update_scan_policy(self, organization_id: str, check_id: str, enabled: bool):
        from app.domain.models import ScanPolicy
        doc_id = f"{organization_id}_{check_id}"
        doc_ref = self._client().collection("scan_policies").document(doc_id)
        doc = doc_ref.get()
        if not doc.exists:
            # Seed first, then update
            self.get_scan_policies(organization_id)
            doc_ref = self._client().collection("scan_policies").document(doc_id)
        doc_ref.update({"enabled": enabled, "updated_at": datetime.utcnow().isoformat()})
        updated = doc_ref.get().to_dict()
        return ScanPolicy.model_validate(updated)

    # --- Scans ---

    def save_scan(self, user_id: str, organization_id: str, record) -> None:
        doc = record.model_dump(mode="json")
        doc["user_id"] = user_id
        doc["organization_id"] = organization_id
        self._client().collection("scans").document(record.scan_id).set(doc)

    def list_scans(self, organization_id: str) -> list:
        from app.domain.models import ScanRecord
        results = []
        docs = self._client().collection("scans").limit(200).stream()
        for doc in docs:
            payload = doc.to_dict() or {}
            if not self._matches_org(payload, organization_id):
                continue
            results.append(ScanRecord.model_validate(payload))
        results.sort(key=lambda r: r.timestamp, reverse=True)
        return results[:50]

    def get_scan(self, scan_id: str, organization_id: str | None = None):
        from app.domain.models import ScanRecord
        doc = self._client().collection("scans").document(scan_id).get()
        if not doc.exists:
            return None
        payload = doc.to_dict() or {}
        if organization_id is not None and not self._matches_org(payload, organization_id):
            return None
        return ScanRecord.model_validate(payload)

    # --- Framework Compliance Results ---

    def save_framework_result(self, user_id: str, result) -> None:
        """Persist a FrameworkResult under scans/{scan_id}/frameworks/{framework_id}."""
        from app.domain.models import FrameworkResult
        doc = result.model_dump(mode="json")
        doc["user_id"] = user_id
        (
            self._client()
            .collection("scans")
            .document(result.scan_id)
            .collection("frameworks")
            .document(result.framework_id)
            .set(doc)
        )

    def get_framework_results(self, scan_id: str) -> list:
        """Return all FrameworkResult objects stored under a scan."""
        from app.domain.models import FrameworkResult
        results = []
        try:
            docs = (
                self._client()
                .collection("scans")
                .document(scan_id)
                .collection("frameworks")
                .stream()
            )
            for doc in docs:
                try:
                    results.append(FrameworkResult.model_validate(doc.to_dict()))
                except Exception:
                    pass
        except Exception:
            pass
        return results

    def save_attestation(
        self,
        organization_id: str,
        user_id: str,
        framework_id: str,
        req_id: str,
        item_index: int,
        value: bool,
    ) -> None:
        """Save a single manual checklist attestation."""
        doc_id = f"{organization_id}_{framework_id}"
        field = f"{req_id}_{item_index}"
        (
            self._client()
            .collection("attestations")
            .document(doc_id)
            .set(
                {field: value, "updated_at": datetime.utcnow().isoformat(), "user_id": user_id},
                merge=True,
            )
        )

    def get_attestations(self, organization_id: str, framework_id: str) -> dict:
        """Return all attestations for an organization+framework as {req_id_item_index: bool}."""
        doc_id = f"{organization_id}_{framework_id}"
        doc = self._client().collection("attestations").document(doc_id).get()
        if not doc.exists:
            return {}
        data = doc.to_dict() or {}
        # Filter out metadata fields
        return {k: bool(v) for k, v in data.items() if k != "updated_at" and isinstance(v, bool)}

    # --- GitHub Integration ---

    def save_github_connection(self, organization_id: str, token: str, user_info: dict) -> None:
        doc = {
            "organization_id": organization_id,
            "github_access_token": token,
            "github_login": user_info.get("login", ""),
            "github_name": user_info.get("name"),
            "github_avatar_url": user_info.get("avatar_url", ""),
            "github_public_repos": user_info.get("public_repos", 0),
            "github_orgs": user_info.get("orgs", []),
            "github_connected_at": datetime.utcnow().isoformat(),
        }
        encrypted = self._encrypt_integration_fields(doc)
        self._client().collection(self._integrations_collection).document(organization_id).set(
            encrypted, merge=True
        )

    def get_github_connection(self, organization_id: str) -> Optional[dict]:
        doc = self._client().collection(self._integrations_collection).document(organization_id).get()
        if not doc.exists:
            return None
        return self._decrypt_integration_fields(doc.to_dict() or {})

    def delete_github_connection(self, organization_id: str) -> None:
        fields_to_remove = {
            "github_access_token": firestore.DELETE_FIELD,
            "github_login": firestore.DELETE_FIELD,
            "github_name": firestore.DELETE_FIELD,
            "github_avatar_url": firestore.DELETE_FIELD,
            "github_public_repos": firestore.DELETE_FIELD,
            "github_orgs": firestore.DELETE_FIELD,
            "github_connected_at": firestore.DELETE_FIELD,
        }
        doc_ref = self._client().collection(self._integrations_collection).document(organization_id)
        if doc_ref.get().exists:
            doc_ref.update(fields_to_remove)

    # --- Slack Integration ---

    def save_slack_connection(
        self,
        organization_id: str,
        bot_token: str,
        team_name: str,
        channel_id: str,
        channel_name: str,
    ) -> None:
        doc = {
            "organization_id": organization_id,
            "slack_bot_token": bot_token,
            "slack_team_name": team_name,
            "slack_channel_id": channel_id,
            "slack_channel_name": channel_name,
            "slack_connected_at": datetime.utcnow().isoformat(),
        }
        encrypted = self._encrypt_integration_fields(doc)
        self._client().collection(self._integrations_collection).document(organization_id).set(
            encrypted, merge=True
        )

    def get_slack_connection(self, organization_id: str) -> Optional[dict]:
        doc = self._client().collection(self._integrations_collection).document(organization_id).get()
        if not doc.exists:
            return None
        data = self._decrypt_integration_fields(doc.to_dict() or {})
        if not data.get("slack_bot_token"):
            return None
        return data

    def update_slack_channel(self, organization_id: str, channel_id: str, channel_name: str) -> None:
        doc_ref = self._client().collection(self._integrations_collection).document(organization_id)
        if doc_ref.get().exists:
            doc_ref.update({
                "slack_channel_id": channel_id,
                "slack_channel_name": channel_name,
            })

    def delete_slack_connection(self, organization_id: str) -> None:
        fields_to_remove = {
            "slack_bot_token": firestore.DELETE_FIELD,
            "slack_team_name": firestore.DELETE_FIELD,
            "slack_channel_id": firestore.DELETE_FIELD,
            "slack_channel_name": firestore.DELETE_FIELD,
            "slack_connected_at": firestore.DELETE_FIELD,
        }
        doc_ref = self._client().collection(self._integrations_collection).document(organization_id)
        if doc_ref.get().exists:
            doc_ref.update(fields_to_remove)

    # --- AWS Integration ---

    def save_aws_connection(
        self,
        organization_id: str,
        role_arn: str,
        account_id: str,
        account_alias: str,
        region: str,
    ) -> None:
        doc = {
            "organization_id": organization_id,
            "aws_role_arn": role_arn,
            "aws_account_id": account_id,
            "aws_account_alias": account_alias,
            "aws_region": region,
            "aws_connected_at": datetime.utcnow().isoformat(),
        }
        self._client().collection(self._integrations_collection).document(organization_id).set(doc, merge=True)

    def get_aws_connection(self, organization_id: str) -> Optional[dict]:
        doc = self._client().collection(self._integrations_collection).document(organization_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        if not data.get("aws_role_arn"):
            return None
        return data

    def delete_aws_connection(self, organization_id: str) -> None:
        fields_to_remove = {
            "aws_role_arn": firestore.DELETE_FIELD,
            "aws_account_id": firestore.DELETE_FIELD,
            "aws_account_alias": firestore.DELETE_FIELD,
            "aws_region": firestore.DELETE_FIELD,
            "aws_connected_at": firestore.DELETE_FIELD,
        }
        doc_ref = self._client().collection(self._integrations_collection).document(organization_id)
        if doc_ref.get().exists:
            doc_ref.update(fields_to_remove)

    # --- Figma Integration ---

    def save_figma_connection(
        self,
        organization_id: str,
        token: str,
        user_info: dict[str, Any],
    ) -> None:
        doc = {
            "organization_id": organization_id,
            "figma_access_token": token,
            "figma_user_id": user_info.get("id", ""),
            "figma_email": user_info.get("email", ""),
            "figma_handle": user_info.get("handle", ""),
            "figma_img_url": user_info.get("img_url", ""),
            "figma_connected_at": datetime.utcnow().isoformat(),
        }
        encrypted = self._encrypt_integration_fields(doc)
        self._client().collection(self._integrations_collection).document(organization_id).set(
            encrypted, merge=True
        )

    def get_figma_connection(self, organization_id: str) -> Optional[dict]:
        doc = self._client().collection(self._integrations_collection).document(organization_id).get()
        if not doc.exists:
            return None
        data = self._decrypt_integration_fields(doc.to_dict() or {})
        if not data.get("figma_access_token"):
            return None
        return data

    def delete_figma_connection(self, organization_id: str) -> None:
        fields_to_remove = {
            "figma_access_token": firestore.DELETE_FIELD,
            "figma_user_id": firestore.DELETE_FIELD,
            "figma_email": firestore.DELETE_FIELD,
            "figma_handle": firestore.DELETE_FIELD,
            "figma_img_url": firestore.DELETE_FIELD,
            "figma_connected_at": firestore.DELETE_FIELD,
        }
        doc_ref = self._client().collection(self._integrations_collection).document(organization_id)
        if doc_ref.get().exists:
            doc_ref.update(fields_to_remove)

    def save_aws_scan(self, user_id: str, organization_id: str, record) -> None:
        doc = record.model_dump(mode="json")
        doc["user_id"] = user_id
        doc["organization_id"] = organization_id
        self._client().collection("aws_scans").document(record.scan_id).set(doc)

    def list_aws_scans(self, organization_id: str) -> list:
        from app.domain.models import AwsScanRecord
        results = []
        docs = self._client().collection("aws_scans").limit(200).stream()
        for doc in docs:
            payload = doc.to_dict() or {}
            if not self._matches_org(payload, organization_id):
                continue
            results.append(AwsScanRecord.model_validate(payload))
        results.sort(key=lambda r: r.timestamp, reverse=True)
        return results[:50]

    def get_aws_scan(self, scan_id: str, organization_id: str | None = None):
        from app.domain.models import AwsScanRecord
        doc = self._client().collection("aws_scans").document(scan_id).get()
        if not doc.exists:
            return None
        payload = doc.to_dict() or {}
        if organization_id is not None and not self._matches_org(payload, organization_id):
            return None
        return AwsScanRecord.model_validate(payload)

    # --- Helpers ---
    @staticmethod
    def _derive_policies(risk_tier: Optional[RiskTier]) -> List[PolicyKey]:
        """
        Determine required policies for a given risk tier using the YAML-backed policy engine.

        This calls into `services.policies.required_policies_for_risk`, which:
        - Parses YAML (if provided) and validates it against a Pydantic schema.
        - Falls back to a safe default mapping when YAML is missing or invalid.
        """
        if risk_tier is None:
            return []
        return required_policies_for_risk(risk_tier)

    @staticmethod
    def _missing_controls(required_policies: List[PolicyKey], system_like: AISystemCreate | AISystem) -> bool:
        # For now we treat "missing controls" as "required policies exist but justification or sensitivity is missing"
        if not required_policies:
            return False
        if getattr(system_like, "risk_justification", None) is None:
            return True
        if getattr(system_like, "data_sensitivity", None) is None:
            return True
        return False


store = FirestoreStore()
