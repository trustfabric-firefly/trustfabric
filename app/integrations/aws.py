from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)

_SESSION_NAME = "TrustFabricAudit"


def _base_client(service: str, region: str = "us-east-1"):
    """Create a boto3 client using the backend's own IAM credentials from settings."""
    kwargs: dict[str, Any] = {"region_name": region}
    if settings.aws_access_key_id and settings.aws_secret_access_key:
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
    return boto3.client(service, **kwargs)


def _get_credentials(role_arn: str, region: str = "us-east-1") -> dict:
    """Assume the cross-account role and return temporary credentials dict."""
    sts = _base_client("sts", region)
    kwargs: dict[str, Any] = {
        "RoleArn": role_arn,
        "RoleSessionName": _SESSION_NAME,
        "DurationSeconds": 3600,
    }
    if settings.aws_external_id:
        kwargs["ExternalId"] = settings.aws_external_id
    resp = sts.assume_role(**kwargs)
    creds = resp["Credentials"]
    return {
        "aws_access_key_id": creds["AccessKeyId"],
        "aws_secret_access_key": creds["SecretAccessKey"],
        "aws_session_token": creds["SessionToken"],
        "region": region,
    }


def _client(service: str, creds: dict):
    return boto3.client(
        service,
        aws_access_key_id=creds["aws_access_key_id"],
        aws_secret_access_key=creds["aws_secret_access_key"],
        aws_session_token=creds["aws_session_token"],
        region_name=creds.get("region", "us-east-1"),
    )


def get_account_info(creds: dict) -> dict:
    """Return account ID and alias."""
    sts = _client("sts", creds)
    identity = sts.get_caller_identity()
    account_id = identity["Account"]

    alias = ""
    try:
        iam = _client("iam", creds)
        aliases = iam.list_account_aliases().get("AccountAliases", [])
        if aliases:
            alias = aliases[0]
    except (ClientError, BotoCoreError):
        pass

    return {"account_id": account_id, "account_alias": alias}


def validate_connection(role_arn: str, region: str = "us-east-1") -> dict:
    """Assume the role and return account info. Raises on failure."""
    creds = _get_credentials(role_arn, region)
    return get_account_info(creds)


# ---------------------------------------------------------------------------
# Audit functions — each returns a list of check-result dicts
# ---------------------------------------------------------------------------

CheckResult = dict  # {"check_id": str, "passed": bool, "evidence": str, "affected_resources": list}


def audit_iam(creds: dict) -> List[CheckResult]:
    iam = _client("iam", creds)
    results: List[CheckResult] = []

    # 1. Root MFA
    try:
        summary = iam.get_account_summary()["SummaryMap"]
        root_mfa = summary.get("AccountMFAEnabled", 0) == 1
        results.append({
            "check_id": "aws_iam_root_mfa",
            "passed": root_mfa,
            "evidence": "Root account MFA is enabled" if root_mfa else "Root account MFA is NOT enabled",
            "affected_resources": [] if root_mfa else ["root"],
        })
    except (ClientError, BotoCoreError) as e:
        logger.warning("IAM root MFA check failed: %s", e)

    # 2. Password policy
    try:
        policy = iam.get_account_password_policy()["PasswordPolicy"]
        min_length = policy.get("MinimumPasswordLength", 0) >= 14
        require_symbols = policy.get("RequireSymbols", False)
        require_numbers = policy.get("RequireNumbers", False)
        require_upper = policy.get("RequireUppercaseCharacters", False)
        strong = min_length and require_symbols and require_numbers and require_upper
        results.append({
            "check_id": "aws_iam_password_policy",
            "passed": strong,
            "evidence": f"Password policy: min length {policy.get('MinimumPasswordLength', 0)}, "
                        f"symbols={'yes' if require_symbols else 'no'}, "
                        f"numbers={'yes' if require_numbers else 'no'}, "
                        f"uppercase={'yes' if require_upper else 'no'}",
            "affected_resources": [],
        })
    except ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchEntity":
            results.append({
                "check_id": "aws_iam_password_policy",
                "passed": False,
                "evidence": "No custom password policy configured — using AWS defaults",
                "affected_resources": [],
            })
        else:
            logger.warning("IAM password policy check failed: %s", e)

    # 3. Unused access keys (>90 days)
    try:
        users = iam.list_users().get("Users", [])
        stale_keys: list[str] = []
        cutoff = datetime.now(timezone.utc) - timedelta(days=90)
        for user in users:
            keys = iam.list_access_keys(UserName=user["UserName"]).get("AccessKeyMetadata", [])
            for key in keys:
                if key["Status"] == "Active":
                    last_used_resp = iam.get_access_key_last_used(AccessKeyId=key["AccessKeyId"])
                    last_used = last_used_resp.get("AccessKeyLastUsed", {}).get("LastUsedDate")
                    if last_used is None or last_used < cutoff:
                        stale_keys.append(f"{user['UserName']}:{key['AccessKeyId'][:8]}…")
        results.append({
            "check_id": "aws_iam_unused_keys",
            "passed": len(stale_keys) == 0,
            "evidence": f"{len(stale_keys)} access key(s) unused for >90 days"
                        if stale_keys else "All active access keys have been used within 90 days",
            "affected_resources": stale_keys[:10],
        })
    except (ClientError, BotoCoreError) as e:
        logger.warning("IAM unused keys check failed: %s", e)

    # 4. Users with console access but no MFA
    try:
        users = iam.list_users().get("Users", [])
        no_mfa: list[str] = []
        for user in users:
            try:
                iam.get_login_profile(UserName=user["UserName"])
            except ClientError:
                continue  # no console access
            mfa_devices = iam.list_mfa_devices(UserName=user["UserName"]).get("MFADevices", [])
            if not mfa_devices:
                no_mfa.append(user["UserName"])
        results.append({
            "check_id": "aws_iam_user_mfa",
            "passed": len(no_mfa) == 0,
            "evidence": f"{len(no_mfa)} console user(s) without MFA"
                        if no_mfa else "All console users have MFA enabled",
            "affected_resources": no_mfa[:10],
        })
    except (ClientError, BotoCoreError) as e:
        logger.warning("IAM user MFA check failed: %s", e)

    # 5. Inline policies on users
    try:
        users = iam.list_users().get("Users", [])
        users_with_inline: list[str] = []
        for user in users:
            policies = iam.list_user_policies(UserName=user["UserName"]).get("PolicyNames", [])
            if policies:
                users_with_inline.append(user["UserName"])
        results.append({
            "check_id": "aws_iam_no_inline_policies",
            "passed": len(users_with_inline) == 0,
            "evidence": f"{len(users_with_inline)} user(s) have inline policies attached"
                        if users_with_inline else "No users have inline policies — all use managed policies",
            "affected_resources": users_with_inline[:10],
        })
    except (ClientError, BotoCoreError) as e:
        logger.warning("IAM inline policies check failed: %s", e)

    return results


def audit_s3(creds: dict) -> List[CheckResult]:
    s3 = _client("s3", creds)
    results: List[CheckResult] = []

    try:
        buckets = s3.list_buckets().get("Buckets", [])
    except (ClientError, BotoCoreError) as e:
        logger.warning("S3 list_buckets failed: %s", e)
        return results

    total = len(buckets)
    no_encryption: list[str] = []
    public_access: list[str] = []
    no_versioning: list[str] = []

    for b in buckets:
        name = b["Name"]

        # Encryption
        try:
            s3.get_bucket_encryption(Bucket=name)
        except ClientError as e:
            if e.response["Error"]["Code"] == "ServerSideEncryptionConfigurationNotFoundError":
                no_encryption.append(name)

        # Public access block
        try:
            pab = s3.get_public_access_block(Bucket=name)["PublicAccessBlockConfiguration"]
            if not all([
                pab.get("BlockPublicAcls", False),
                pab.get("IgnorePublicAcls", False),
                pab.get("BlockPublicPolicy", False),
                pab.get("RestrictPublicBuckets", False),
            ]):
                public_access.append(name)
        except ClientError:
            public_access.append(name)

        # Versioning
        try:
            ver = s3.get_bucket_versioning(Bucket=name)
            if ver.get("Status") != "Enabled":
                no_versioning.append(name)
        except (ClientError, BotoCoreError):
            no_versioning.append(name)

    results.append({
        "check_id": "aws_s3_encryption",
        "passed": len(no_encryption) == 0,
        "evidence": f"{total - len(no_encryption)}/{total} buckets have default encryption"
                    if no_encryption else f"All {total} buckets have default encryption enabled",
        "affected_resources": no_encryption[:10],
    })
    results.append({
        "check_id": "aws_s3_public_access",
        "passed": len(public_access) == 0,
        "evidence": f"{len(public_access)}/{total} buckets lack full public access block"
                    if public_access else f"All {total} buckets have public access fully blocked",
        "affected_resources": public_access[:10],
    })
    results.append({
        "check_id": "aws_s3_versioning",
        "passed": len(no_versioning) == 0,
        "evidence": f"{total - len(no_versioning)}/{total} buckets have versioning enabled"
                    if no_versioning else f"All {total} buckets have versioning enabled",
        "affected_resources": no_versioning[:10],
    })

    return results


def audit_cloudtrail(creds: dict) -> List[CheckResult]:
    ct = _client("cloudtrail", creds)
    results: List[CheckResult] = []

    try:
        trails = ct.describe_trails().get("trailList", [])
        multi_region = [t for t in trails if t.get("IsMultiRegionTrail")]
        logging_active = []
        no_validation: list[str] = []

        for t in trails:
            try:
                status = ct.get_trail_status(Name=t["TrailARN"])
                if status.get("IsLogging"):
                    logging_active.append(t["Name"])
            except (ClientError, BotoCoreError):
                pass
            if not t.get("LogFileValidationEnabled"):
                no_validation.append(t["Name"])

        has_multi_region_logging = any(
            t["Name"] in [a for a in logging_active] for t in multi_region
        )

        results.append({
            "check_id": "aws_cloudtrail_enabled",
            "passed": has_multi_region_logging,
            "evidence": f"{len(multi_region)} multi-region trail(s) found, "
                        f"{len(logging_active)} actively logging"
                        if trails else "No CloudTrail trails configured",
            "affected_resources": [],
        })
        results.append({
            "check_id": "aws_cloudtrail_log_validation",
            "passed": len(no_validation) == 0,
            "evidence": f"{len(no_validation)} trail(s) without log file validation"
                        if no_validation else "Log file validation enabled on all trails",
            "affected_resources": no_validation,
        })
    except (ClientError, BotoCoreError) as e:
        logger.warning("CloudTrail audit failed: %s", e)

    return results


def audit_config(creds: dict) -> List[CheckResult]:
    config = _client("config", creds)
    results: List[CheckResult] = []

    try:
        recorders = config.describe_configuration_recorders().get("ConfigurationRecorders", [])
        statuses = config.describe_configuration_recorder_status().get("ConfigurationRecordersStatus", [])
        recording = any(s.get("recording") for s in statuses)

        results.append({
            "check_id": "aws_config_enabled",
            "passed": len(recorders) > 0 and recording,
            "evidence": f"{len(recorders)} recorder(s), {'actively recording' if recording else 'NOT recording'}"
                        if recorders else "No AWS Config recorders configured",
            "affected_resources": [],
        })
    except (ClientError, BotoCoreError) as e:
        logger.warning("AWS Config recorder check failed: %s", e)

    try:
        channels = config.describe_delivery_channels().get("DeliveryChannels", [])
        results.append({
            "check_id": "aws_config_delivery",
            "passed": len(channels) > 0,
            "evidence": f"{len(channels)} delivery channel(s) configured"
                        if channels else "No AWS Config delivery channels configured",
            "affected_resources": [],
        })
    except (ClientError, BotoCoreError) as e:
        logger.warning("AWS Config delivery check failed: %s", e)

    return results


def audit_security_hub(creds: dict) -> List[CheckResult]:
    results: List[CheckResult] = []
    try:
        sh = _client("securityhub", creds)
        sh.describe_hub()
        hub_enabled = True
    except ClientError as e:
        if e.response["Error"]["Code"] in ("InvalidAccessException", "ResourceNotFoundException"):
            hub_enabled = False
        else:
            logger.warning("Security Hub check failed: %s", e)
            return results
    except BotoCoreError as e:
        logger.warning("Security Hub check failed: %s", e)
        return results

    results.append({
        "check_id": "aws_securityhub_enabled",
        "passed": hub_enabled,
        "evidence": "Security Hub is enabled" if hub_enabled else "Security Hub is NOT enabled in this region",
        "affected_resources": [],
    })

    if hub_enabled:
        try:
            sh = _client("securityhub", creds)
            findings = sh.get_findings(
                Filters={
                    "ComplianceStatus": [{"Value": "FAILED", "Comparison": "EQUALS"}],
                    "SeverityLabel": [
                        {"Value": "CRITICAL", "Comparison": "EQUALS"},
                        {"Value": "HIGH", "Comparison": "EQUALS"},
                    ],
                    "ComplianceSecurityControlId": [{"Value": "NIST", "Comparison": "PREFIX"}],
                },
                MaxResults=20,
            ).get("Findings", [])
            results.append({
                "check_id": "aws_securityhub_nist_findings",
                "passed": len(findings) == 0,
                "evidence": f"{len(findings)} critical/high NIST 800-53 finding(s)"
                            if findings else "No critical/high NIST 800-53 findings",
                "affected_resources": [f.get("Title", "")[:80] for f in findings[:5]],
            })
        except (ClientError, BotoCoreError) as e:
            logger.warning("Security Hub findings check failed: %s", e)

    return results


def run_all_audits(role_arn: str, region: str = "us-east-1") -> tuple[dict, List[CheckResult]]:
    """Assume role, run all audits, return (account_info, check_results)."""
    creds = _get_credentials(role_arn, region)
    account_info = get_account_info(creds)

    all_results: List[CheckResult] = []
    for audit_fn in (audit_iam, audit_s3, audit_cloudtrail, audit_config, audit_security_hub):
        try:
            all_results.extend(audit_fn(creds))
        except Exception:
            logger.warning("Audit function %s failed", audit_fn.__name__, exc_info=True)

    return account_info, all_results
