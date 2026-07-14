from __future__ import annotations

from datetime import datetime

from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, paginate
from app.domain.models import (
    ActivityEvent,
    AISystem,
    AuditEvent,
    AuditEventType,
    DataSensitivity,
    ModelType,
    SystemStatus,
)


def _system(n: int) -> AISystem:
    now = datetime.utcnow()
    return AISystem(
        id=n,
        organization_id="org-1",
        name=f"System {n}",
        description="d",
        owner="o",
        business_unit="bu",
        model_type=ModelType.llm,
        data_sensitivity=DataSensitivity.low,
        external_integrations=[],
        status=SystemStatus.active,
        risk_tier=None,
        risk_justification=None,
        required_policies=[],
        missing_required_controls=False,
        created_at=now,
        updated_at=now,
    )


def test_paginate_slices_and_reports_has_more():
    items = list(range(10))
    page = paginate(items, limit=3, offset=0)
    assert page.items == [0, 1, 2]
    assert page.total == 10
    assert page.limit == 3
    assert page.offset == 0
    assert page.has_more is True

    last = paginate(items, limit=3, offset=9)
    assert last.items == [9]
    assert last.has_more is False


def test_paginate_clamps_limit_and_offset():
    items = [1, 2, 3]
    page = paginate(items, limit=9999, offset=-5)
    assert page.limit == MAX_LIMIT
    assert page.offset == 0
    assert page.items == [1, 2, 3]


def test_paginate_empty():
    page = paginate([], limit=DEFAULT_LIMIT, offset=0)
    assert page.items == []
    assert page.total == 0
    assert page.has_more is False


def test_paginate_preserves_model_items():
    systems = [_system(1), _system(2), _system(3)]
    page = paginate(systems, limit=2, offset=0)
    assert len(page.items) == 2
    assert page.items[0].id == 1
    assert page.total == 3
    assert page.has_more is True

    rest = paginate(systems, limit=2, offset=2)
    assert len(rest.items) == 1
    assert rest.items[0].id == 3
    assert rest.has_more is False


def test_paginate_works_for_audit_and_events_shapes():
    now = datetime.utcnow()
    audits = [
        AuditEvent(
            id=i,
            organization_id="org",
            event_type=AuditEventType.system_created,
            target_id=i,
            user_id="u",
            timestamp=now,
            summary=f"s{i}",
        )
        for i in range(5)
    ]
    events = [
        ActivityEvent(
            id=i,
            organization_id="org",
            system_id=1,
            timestamp=now,
            user_id="u",
            event_type="access",
            metadata={},
        )
        for i in range(5)
    ]
    assert paginate(audits, limit=2, offset=2).items[0].id == 2
    assert paginate(events, limit=2, offset=0).total == 5
