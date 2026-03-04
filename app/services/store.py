from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Dict, List, Optional

from app.domain.models import (
    AISystem,
    AISystemCreate,
    AISystemUpdate,
    ActivityEvent,
    ActivityEventCreate,
    AuditEvent,
    AuditEventType,
    DashboardSummary,
    LLMInteractionLog,
    PolicyKey,
    RiskTier,
)
from app.services.policies import required_policies_for_risk


class InMemoryStore:
    def __init__(self) -> None:
        self._systems: Dict[int, AISystem] = {}
        self._events: Dict[int, ActivityEvent] = {}
        self._audits: Dict[int, AuditEvent] = {}
        self._llm_logs: Dict[int, LLMInteractionLog] = {}

        self._system_id_seq = 1
        self._event_id_seq = 1
        self._audit_id_seq = 1
        self._llm_log_id_seq = 1

    # --- Systems ---
    def create_system(self, data: AISystemCreate, user_id: str) -> AISystem:
        system_id = self._system_id_seq
        self._system_id_seq += 1
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
        self._systems[system_id] = system

        self._record_audit(
            event_type=AuditEventType.system_created,
            target_id=system_id,
            user_id=user_id,
            summary=f"System created: {system.name}",
        )
        return system

    def list_systems(self) -> List[AISystem]:
        return list(self._systems.values())

    def get_system(self, system_id: int) -> Optional[AISystem]:
        return self._systems.get(system_id)

    def update_system(self, system_id: int, data: AISystemUpdate, user_id: str) -> Optional[AISystem]:
        system = self._systems.get(system_id)
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
        return system

    def delete_system(self, system_id: int, user_id: str) -> bool:
        system = self._systems.pop(system_id, None)
        if system is None:
            return False
        self._record_audit(
            event_type=AuditEventType.system_deleted,
            target_id=system_id,
            user_id=user_id,
            summary=f"System deleted: {system.name}",
        )
        return True

    # --- Events ---
    def create_event(self, data: ActivityEventCreate) -> ActivityEvent:
        event_id = self._event_id_seq
        self._event_id_seq += 1
        event = ActivityEvent(id=event_id, **data.model_dump())
        self._events[event_id] = event
        return event

    def list_events(
        self,
        system_id: Optional[int] = None,
        event_type: Optional[str] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
    ) -> List[ActivityEvent]:
        events = list(self._events.values())
        if system_id is not None:
            events = [e for e in events if e.system_id == system_id]
        if event_type is not None:
            events = [e for e in events if e.event_type == event_type]
        if start is not None:
            events = [e for e in events if e.timestamp >= start]
        if end is not None:
            events = [e for e in events if e.timestamp <= end]
        return events

    # --- Audit ---
    def _record_audit(
        self,
        event_type: AuditEventType,
        target_id: Optional[int],
        user_id: str,
        summary: str,
    ) -> None:
        audit_id = self._audit_id_seq
        self._audit_id_seq += 1
        self._audits[audit_id] = AuditEvent(
            id=audit_id,
            event_type=event_type,
            target_id=target_id,
            user_id=user_id,
            timestamp=datetime.utcnow(),
            summary=summary,
        )

    def list_audits(self) -> List[AuditEvent]:
        return list(self._audits.values())

    # --- LLM Logs ---
    def log_llm_interaction(self, log: LLMInteractionLog) -> LLMInteractionLog:
        log_id = self._llm_log_id_seq
        self._llm_log_id_seq += 1
        stored = log.model_copy(update={"id": log_id})
        self._llm_logs[log_id] = stored
        return stored

    def list_llm_logs(self) -> List[LLMInteractionLog]:
        return list(self._llm_logs.values())

    # --- Dashboard ---
    def dashboard_summary(self) -> DashboardSummary:
        systems = list(self._systems.values())
        total_systems = len(systems)

        risk_counter: Counter[RiskTier] = Counter()
        missing_controls = 0
        for s in systems:
            if s.risk_tier is not None:
                risk_counter[s.risk_tier] += 1
            if s.missing_required_controls:
                missing_controls += 1

        events = list(self._events.values())
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


store = InMemoryStore()

