from __future__ import annotations

import os
from collections import Counter
from datetime import datetime
from typing import Any, List, Optional

import firebase_admin
from firebase_admin import credentials, firestore

from app.core.config import settings
from app.domain.models import (
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

    def _next_id(self, key: str) -> int:
        counter_ref = self._client().collection(self._counter_collection).document(self._counter_document)
        field = f"{key}_id_seq"
        counter_ref.set({field: firestore.Increment(1)}, merge=True)
        data = counter_ref.get().to_dict() or {}
        return int(data.get(field, 0))

    @staticmethod
    def _serialize(model_obj) -> dict:
        return model_obj.model_dump(mode="json")

    # --- Systems ---
    def create_system(self, data: AISystemCreate, user_id: str) -> AISystem:
        system_id = self._next_id("system")
        now = datetime.utcnow()

        required_policies = self._derive_policies(data.risk_tier)

        system = AISystem(
            id=system_id,
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
            summary=f"System created: {system.name}",
        )
        return system

    def list_systems(self) -> List[AISystem]:
        systems: List[AISystem] = []
        for doc in self._client().collection(self._systems_collection).stream():
            payload = doc.to_dict() or {}
            payload["id"] = int(doc.id)
            systems.append(AISystem.model_validate(payload))
        return sorted(systems, key=lambda system: system.id)

    def get_system(self, system_id: int) -> Optional[AISystem]:
        doc = self._client().collection(self._systems_collection).document(str(system_id)).get()
        if not doc.exists:
            return None
        payload = doc.to_dict() or {}
        payload["id"] = system_id
        return AISystem.model_validate(payload)

    def update_system(self, system_id: int, data: AISystemUpdate, user_id: str) -> Optional[AISystem]:
        system = self.get_system(system_id)
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
            summary=f"System updated: {system.name}",
        )

        # If the risk tier changed, emit a dedicated audit record for change history.
        if "risk_tier" in update_data and system.risk_tier != old_risk_tier:
            self._record_audit(
                event_type=AuditEventType.risk_tier_changed,
                target_id=system_id,
                user_id=user_id,
                summary=(
                    f"Risk tier changed from {old_risk_tier or 'None'} "
                    f"to {system.risk_tier} (justification: {system.risk_justification})"
                ),
            )
        self._client().collection(self._systems_collection).document(str(system_id)).set(self._serialize(system))
        return system

    def delete_system(self, system_id: int, user_id: str) -> bool:
        system = self.get_system(system_id)
        if system is None:
            return False
        self._delete_system_policies_subcollection(system_id)
        self._client().collection(self._systems_collection).document(str(system_id)).delete()
        self._record_audit(
            event_type=AuditEventType.system_deleted,
            target_id=system_id,
            user_id=user_id,
            summary=f"System deleted: {system.name}",
        )
        return True

    # --- Events ---
    def create_event(self, data: ActivityEventCreate) -> ActivityEvent:
        event_id = self._next_id("event")
        event = ActivityEvent(id=event_id, **data.model_dump())
        self._client().collection(self._events_collection).document(str(event_id)).set(self._serialize(event))
        return event

    def list_events(
        self,
        system_id: Optional[int] = None,
        event_type: Optional[str] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
    ) -> List[ActivityEvent]:
        events: List[ActivityEvent] = []
        for doc in self._client().collection(self._events_collection).stream():
            payload = doc.to_dict() or {}
            payload["id"] = int(doc.id)
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
        summary: str,
    ) -> None:
        audit_id = self._next_id("audit")
        audit = AuditEvent(
            id=audit_id,
            event_type=event_type,
            target_id=target_id,
            user_id=user_id,
            timestamp=datetime.utcnow(),
            summary=summary,
        )
        self._client().collection(self._audits_collection).document(str(audit_id)).set(self._serialize(audit))

    def list_audits(self) -> List[AuditEvent]:
        audits: List[AuditEvent] = []
        for doc in self._client().collection(self._audits_collection).stream():
            payload = doc.to_dict() or {}
            payload["id"] = int(doc.id)
            audits.append(AuditEvent.model_validate(payload))
        return sorted(audits, key=lambda audit: audit.id)

    # --- LLM Logs ---
    def log_llm_interaction(self, log: LLMInteractionLog) -> LLMInteractionLog:
        log_id = self._next_id("llm_log")
        stored = log.model_copy(update={"id": log_id})
        self._client().collection(self._llm_logs_collection).document(str(log_id)).set(self._serialize(stored))
        return stored

    def list_llm_logs(self) -> List[LLMInteractionLog]:
        logs: List[LLMInteractionLog] = []
        for doc in self._client().collection(self._llm_logs_collection).stream():
            payload = doc.to_dict() or {}
            payload["id"] = int(doc.id)
            logs.append(LLMInteractionLog.model_validate(payload))
        return sorted(logs, key=lambda log: log.id or 0)

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

    def list_system_policies(self, system_id: int) -> Optional[List[GovernancePolicy]]:
        if self.get_system(system_id) is None:
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
    ) -> Optional[GovernancePolicy]:
        if self.get_system(system_id) is None:
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
            summary=f"Governance policy saved: {data.name} ({policy_id})",
        )
        return policy

    def update_system_policy(
        self,
        system_id: int,
        policy_id: str,
        data: GovernancePolicyUpdate,
        user_id: str,
    ) -> Optional[GovernancePolicy]:
        if self.get_system(system_id) is None:
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
            summary=f"Governance policy updated: {current.name} ({policy_id}) status={data.status.value}",
        )
        return updated

    # --- Dashboard ---
    def dashboard_summary(self) -> DashboardSummary:
        systems = self.list_systems()
        total_systems = len(systems)

        risk_counter: Counter[RiskTier] = Counter()
        missing_controls = 0
        for s in systems:
            if s.risk_tier is not None:
                risk_counter[s.risk_tier] += 1
            if s.missing_required_controls:
                missing_controls += 1

        events = self.list_events()
        total_events = len(events)
        events_per_system_counter: Counter[int] = Counter(e.system_id for e in events)

        return DashboardSummary(
            total_systems=total_systems,
            systems_by_risk=dict(risk_counter),
            systems_missing_controls=missing_controls,
            total_events=total_events,
            events_per_system=dict(events_per_system_counter),
        )

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

