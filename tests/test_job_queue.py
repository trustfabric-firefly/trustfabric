from __future__ import annotations

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from app.domain.models import JobRecord, JobStatus, JobType, ScanStatus
from app.services.job_queue import JobQueue, build_pending_github_scan


def test_build_pending_github_scan_has_pending_status():
    record = build_pending_github_scan(
        scan_id="scan-1",
        github_org="acme",
        scope="repositories",
        triggered_by="user-1",
    )
    assert record.scan_id == "scan-1"
    assert record.status == ScanStatus.pending
    assert record.results.compliance_score == 0


def test_enqueue_persists_and_queues_job():
    async def _run():
        queue = JobQueue()
        mock_store = MagicMock()
        with patch("app.services.job_queue.store", mock_store):
            job = await queue.enqueue(
                job_type=JobType.github_scan,
                organization_id="org-1",
                user_id="user-1",
                payload={"github_org": "acme"},
                resource_id="scan-1",
            )
        assert job.job_type == JobType.github_scan
        assert job.resource_id == "scan-1"
        mock_store.save_job.assert_called_once()
        assert queue._queue.qsize() == 1

    asyncio.run(_run())


def test_process_job_marks_github_scan_failed_on_error():
    async def _run():
        queue = JobQueue()
        job = JobRecord(
            job_id="job-1",
            job_type=JobType.github_scan,
            organization_id="org-1",
            user_id="user-1",
            status=JobStatus.pending,
            payload={"github_org": "acme", "triggered_by": "user-1"},
            resource_id="scan-1",
            created_at=datetime.utcnow(),
        )
        mock_store = MagicMock()
        mock_store.get_job.return_value = job

        with patch("app.services.job_queue.store", mock_store), patch(
            "app.services.job_queue.dispatch_webhook_event",
            new=AsyncMock(),
        ), patch.object(queue, "_run_github_scan", new=AsyncMock(side_effect=ValueError("boom"))):
            await queue._process_job("job-1")

        mock_store.update_scan.assert_called()
        failed_update = mock_store.update_scan.call_args[0][2]
        assert failed_update["status"] == ScanStatus.failed.value
        assert "boom" in failed_update["error"]

    asyncio.run(_run())
