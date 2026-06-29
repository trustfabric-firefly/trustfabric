from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any
from uuid import uuid4

from app.core.config import settings
from app.domain.models import (
    AwsScanRecord,
    GitHubScannedConfig,
    JobRecord,
    JobStatus,
    JobType,
    ScanConfig,
    ScanRecord,
    ScanResults,
    ScanStatus,
    WebhookEvent,
)
from app.services.store import store
from app.services.webhooks import dispatch_webhook_event

logger = logging.getLogger(__name__)


class JobQueue:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._worker_task: asyncio.Task | None = None
        self._semaphore = asyncio.Semaphore(max(1, settings.job_queue_max_concurrent))

    async def start(self) -> None:
        if self._worker_task is not None:
            return
        await self._recover_pending_jobs()
        self._worker_task = asyncio.create_task(self._worker_loop())

    async def stop(self) -> None:
        if self._worker_task is None:
            return
        self._worker_task.cancel()
        try:
            await self._worker_task
        except asyncio.CancelledError:
            pass
        self._worker_task = None

    async def _recover_pending_jobs(self) -> None:
        for job in store.list_pending_jobs(limit=50):
            if job.status == JobStatus.running:
                store.update_job(
                    job.job_id,
                    {"status": JobStatus.pending.value, "started_at": None},
                )
            await self._queue.put(job.job_id)

    async def enqueue(
        self,
        *,
        job_type: JobType,
        organization_id: str,
        user_id: str,
        payload: dict[str, Any],
        resource_id: str,
    ) -> JobRecord:
        job = JobRecord(
            job_id=str(uuid4()),
            job_type=job_type,
            organization_id=organization_id,
            user_id=user_id,
            status=JobStatus.pending,
            payload=payload,
            resource_id=resource_id,
            created_at=datetime.utcnow(),
        )
        store.save_job(job)
        await self._queue.put(job.job_id)
        return job

    async def _worker_loop(self) -> None:
        while True:
            job_id = await self._queue.get()
            try:
                async with self._semaphore:
                    await self._process_job(job_id)
            except Exception:
                logger.exception("Unhandled error processing job %s", job_id)
            finally:
                self._queue.task_done()

    async def _process_job(self, job_id: str) -> None:
        job = store.get_job(job_id)
        if job is None or job.status not in (JobStatus.pending, JobStatus.running):
            return

        store.update_job(
            job_id,
            {"status": JobStatus.running.value, "started_at": datetime.utcnow().isoformat()},
        )

        try:
            if job.job_type == JobType.github_scan:
                record = await self._run_github_scan(job)
            elif job.job_type == JobType.aws_scan:
                record = await self._run_aws_scan(job)
            else:
                raise ValueError(f"Unknown job type: {job.job_type}")

            store.update_job(
                job_id,
                {
                    "status": JobStatus.completed.value,
                    "completed_at": datetime.utcnow().isoformat(),
                    "error": None,
                },
            )
            await self._notify_scan_success(job, record)
        except Exception as exc:
            logger.exception("Job %s failed", job_id)
            self._mark_scan_failed(job, str(exc))
            store.update_job(
                job_id,
                {
                    "status": JobStatus.failed.value,
                    "completed_at": datetime.utcnow().isoformat(),
                    "error": str(exc),
                },
            )
            await self._notify_scan_failure(job, str(exc))

    async def _run_github_scan(self, job: JobRecord) -> ScanRecord:
        from app.services.scan import run_scan

        store.update_scan(
            job.resource_id or "",
            job.organization_id,
            {"status": ScanStatus.running.value},
        )
        return await run_scan(
            user_id=job.user_id,
            organization_id=job.organization_id,
            github_org=job.payload.get("github_org", ""),
            triggered_by=job.payload.get("triggered_by", job.user_id),
            scan_id=job.resource_id,
        )

    async def _run_aws_scan(self, job: JobRecord) -> AwsScanRecord:
        from app.services.aws_scan import run_aws_scan

        store.update_aws_scan(
            job.resource_id or "",
            job.organization_id,
            {"status": ScanStatus.running.value},
        )
        return await asyncio.to_thread(
            run_aws_scan,
            job.user_id,
            job.organization_id,
            job.payload.get("triggered_by", job.user_id),
            job.resource_id,
        )

    def _mark_scan_failed(self, job: JobRecord, error: str) -> None:
        if not job.resource_id:
            return
        updates = {"status": ScanStatus.failed.value, "error": error}
        if job.job_type == JobType.aws_scan:
            store.update_aws_scan(job.resource_id, job.organization_id, updates)
        else:
            store.update_scan(job.resource_id, job.organization_id, updates)

    async def _notify_scan_success(self, job: JobRecord, record: Any) -> None:
        from app.services.notifications import notify_aws_scan_completed, notify_scan_completed

        try:
            if job.job_type == JobType.github_scan:
                await notify_scan_completed(job.organization_id, record)
            else:
                await notify_aws_scan_completed(job.organization_id, record)
        except Exception:
            logger.exception("Slack notification failed for job %s", job.job_id)

        payload = record.model_dump(mode="json")
        await dispatch_webhook_event(
            job.organization_id,
            WebhookEvent.scan_completed,
            payload,
        )

        violations = 0
        if job.job_type == JobType.github_scan:
            violations = len(record.results.violations)
        else:
            violations = record.failed_checks

        if violations > 0:
            alert_payload = {
                **payload,
                "alert_type": "violations_detected",
                "violation_count": violations,
            }
            await dispatch_webhook_event(
                job.organization_id,
                WebhookEvent.compliance_alert,
                alert_payload,
            )

    async def _notify_scan_failure(self, job: JobRecord, error: str) -> None:
        payload = {
            "job_id": job.job_id,
            "job_type": job.job_type.value,
            "scan_id": job.resource_id,
            "error": error,
        }
        await dispatch_webhook_event(
            job.organization_id,
            WebhookEvent.scan_failed,
            payload,
        )
        await dispatch_webhook_event(
            job.organization_id,
            WebhookEvent.compliance_alert,
            {**payload, "alert_type": "scan_failed"},
        )


def build_pending_github_scan(
    *,
    scan_id: str,
    github_org: str,
    scope: str,
    triggered_by: str,
) -> ScanRecord:
    return ScanRecord(
        scan_id=scan_id,
        organization=github_org,
        timestamp=datetime.utcnow(),
        config=ScanConfig(scope=scope, github_org=github_org, policies_checked=[]),
        github_config=GitHubScannedConfig(),
        results=ScanResults(
            compliance_score=0,
            total_policies=0,
            violations=[],
            compliant=[],
            scanned_repositories=[],
        ),
        duration_seconds=0.0,
        triggered_by=triggered_by,
        status=ScanStatus.pending,
    )


def build_pending_aws_scan(
    *,
    scan_id: str,
    account_id: str,
    region: str,
    triggered_by: str,
) -> AwsScanRecord:
    return AwsScanRecord(
        scan_id=scan_id,
        account_id=account_id,
        region=region,
        timestamp=datetime.utcnow(),
        compliance_score=0,
        total_checks=0,
        passed_checks=0,
        failed_checks=0,
        checks=[],
        duration_seconds=0.0,
        triggered_by=triggered_by,
        status=ScanStatus.pending,
    )


job_queue = JobQueue()
