from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlparse

from fastapi import HTTPException, status

from app.core.config import settings
from app.core.sso_state import decode_sso_state, encode_sso_state
from app.domain.models import (
    OrganizationMember,
    OrganizationSsoConfig,
    OrganizationSsoConfigUpdate,
    OrgRole,
)
from app.integrations.firebase import create_custom_token, get_or_create_user_by_email
from app.services.members import accept_pending_invites, normalize_email
from app.services.store import store

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _email_domain(email: str) -> str:
    return normalize_email(email).split("@", 1)[1]


def _normalize_domains(domains: list[str]) -> list[str]:
    cleaned = sorted({d.strip().lower().lstrip("@") for d in domains if d.strip()})
    return cleaned


def _normalize_cert(cert: str) -> str:
    return cert.strip().replace("\r\n", "\n")


def _safe_return_to(value: str | None) -> str:
    if value and value.startswith("/") and not value.startswith("//"):
        return value
    return "/dashboard"


def _sp_urls(organization_id: str) -> tuple[str, str]:
    base = settings.api_base_url.rstrip("/")
    entity_id = f"{base}/api/v1/auth/sso/{organization_id}/metadata"
    acs_url = f"{base}/api/v1/auth/sso/acs"
    return entity_id, acs_url


def build_saml_settings(config: OrganizationSsoConfig) -> dict[str, Any]:
    entity_id, acs_url = _sp_urls(config.organization_id)
    return {
        "strict": True,
        "debug": settings.app_env != "production",
        "sp": {
            "entityId": entity_id,
            "assertionConsumerService": {
                "url": acs_url,
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
            },
            "NameIDFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
        },
        "idp": {
            "entityId": config.idp_entity_id,
            "singleSignOnService": {
                "url": config.idp_sso_url,
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
            },
            "x509cert": _normalize_cert(config.idp_x509_cert),
        },
        "security": {
            "authnRequestsSigned": False,
            "wantAssertionsSigned": True,
            "wantMessagesSigned": False,
        },
    }


def _prepare_saml_request(https: bool, host: str, path: str, post_data: dict[str, str] | None = None) -> dict[str, Any]:
    return {
        "https": "on" if https else "off",
        "http_host": host,
        "script_name": path,
        "get_data": {},
        "post_data": post_data or {},
    }


def _saml_auth(config: OrganizationSsoConfig, request_data: dict[str, Any]):
    try:
        from onelogin.saml2.auth import OneLogin_Saml2_Auth
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SAML support is not installed on this server",
        ) from exc
    return OneLogin_Saml2_Auth(request_data, build_saml_settings(config))


def validate_sso_config_update(
    payload: OrganizationSsoConfigUpdate,
    *,
    existing_cert: str = "",
) -> OrganizationSsoConfigUpdate:
    if not payload.enabled:
        return payload
    cert = payload.idp_x509_cert.strip() or existing_cert.strip()
    missing = []
    if not payload.idp_entity_id.strip():
        missing.append("idp_entity_id")
    if not payload.idp_sso_url.strip():
        missing.append("idp_sso_url")
    if not cert:
        missing.append("idp_x509_cert")
    domains = _normalize_domains(payload.email_domains)
    if not domains:
        missing.append("email_domains")
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"SSO configuration incomplete: {', '.join(missing)}",
        )
    payload.email_domains = domains
    payload.idp_x509_cert = _normalize_cert(cert)
    return payload


def upsert_organization_sso_config(
    organization_id: str,
    payload: OrganizationSsoConfigUpdate,
) -> OrganizationSsoConfig:
    existing = store.get_organization_sso_config(organization_id)
    existing_cert = existing.idp_x509_cert if existing else ""
    payload = validate_sso_config_update(payload, existing_cert=existing_cert)
    config = OrganizationSsoConfig(
        organization_id=organization_id,
        enabled=payload.enabled,
        enforced=payload.enforced,
        idp_entity_id=payload.idp_entity_id.strip(),
        idp_sso_url=payload.idp_sso_url.strip(),
        idp_x509_cert=payload.idp_x509_cert,
        email_domains=_normalize_domains(payload.email_domains),
        jit_provisioning=payload.jit_provisioning,
        default_role=payload.default_role,
        updated_at=datetime.utcnow(),
    )
    return store.save_organization_sso_config(config)


def get_public_sso_config(organization_id: str) -> OrganizationSsoConfig:
    config = store.get_organization_sso_config(organization_id)
    if config is None or not config.enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SSO is not enabled")
    return config


def discover_sso_for_email(email: str) -> dict[str, Any]:
    normalized = normalize_email(email)
    if not _EMAIL_RE.match(normalized):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email address")
    domain = _email_domain(normalized)
    for config in store.list_enabled_sso_configs():
        if domain not in config.email_domains:
            continue
        org = store.get_organization(config.organization_id)
        if org is None:
            continue
        return {
            "sso_available": True,
            "organization_id": config.organization_id,
            "organization_name": org.name,
            "enforced": config.enforced,
        }
    return {"sso_available": False}


def build_login_redirect_url(organization_id: str, return_to: str | None) -> str:
    config = get_public_sso_config(organization_id)
    relay_state = encode_sso_state(organization_id, _safe_return_to(return_to))
    request_data = _prepare_saml_request(
        https=settings.api_base_url.startswith("https"),
        host=urlparse(settings.api_base_url).netloc,
        path=f"/api/v1/auth/sso/{organization_id}/login",
    )
    auth = _saml_auth(config, request_data)
    return auth.login(return_to=relay_state)


def process_saml_acs(
    *,
    https: bool,
    host: str,
    path: str,
    saml_response: str,
    relay_state: str | None,
) -> str:
    if not relay_state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing RelayState")

    try:
        organization_id, return_to = decode_sso_state(relay_state)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    config = get_public_sso_config(organization_id)
    request_data = _prepare_saml_request(
        https=https,
        host=host,
        path=path,
        post_data={"SAMLResponse": saml_response, "RelayState": relay_state},
    )
    auth = _saml_auth(config, request_data)
    auth.process_response()
    errors = auth.get_errors()
    if errors:
        reason = auth.get_last_error_reason() or errors[0]
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"SAML authentication failed: {reason}")

    if not auth.is_authenticated():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="SAML authentication failed")

    email = normalize_email(auth.get_nameid() or "")
    attributes = auth.get_attributes() or {}
    for key in ("email", "mail", "Email", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"):
        values = attributes.get(key)
        if values:
            email = normalize_email(str(values[0]))
            break

    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="SAML response did not include a valid email")

    domain = _email_domain(email)
    if domain not in config.email_domains:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email domain is not authorized for this organization",
        )

    display_name = None
    for key in ("displayName", "name", "givenName"):
        values = attributes.get(key)
        if values:
            display_name = str(values[0])
            break

    user_id = get_or_create_user_by_email(email, display_name=display_name)
    accept_pending_invites(user_id, email)
    _ensure_org_membership(organization_id, user_id, email, config)

    code = uuid.uuid4().hex
    store.create_sso_exchange_code(
        code=code,
        user_id=user_id,
        organization_id=organization_id,
        email=email,
        return_to=return_to,
        expires_at=datetime.utcnow() + timedelta(minutes=5),
    )
    frontend = settings.frontend_url.rstrip("/")
    return f"{frontend}/sso/callback?code={code}&organization_id={organization_id}"


def _ensure_org_membership(
    organization_id: str,
    user_id: str,
    email: str,
    config: OrganizationSsoConfig,
) -> OrganizationMember:
    existing = store.get_organization_member(organization_id, user_id)
    if existing:
        return existing

    if not config.jit_provisioning:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is not a member of this organization. Contact your administrator.",
        )

    member = OrganizationMember(
        organization_id=organization_id,
        user_id=user_id,
        role=config.default_role,
        email=email,
        joined_at=datetime.utcnow(),
    )
    store.add_organization_member(member)
    return member


def exchange_sso_code(code: str) -> dict[str, str]:
    record = store.consume_sso_exchange_code(code.strip())
    if record is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired SSO code")

    user_id = str(record["user_id"])
    organization_id = str(record["organization_id"])
    custom_token = create_custom_token(user_id, organization_id=organization_id)
    return {
        "custom_token": custom_token,
        "organization_id": organization_id,
        "return_to": _safe_return_to(str(record.get("return_to") or "/dashboard")),
        "email": str(record.get("email") or ""),
    }


def build_sp_metadata_xml(organization_id: str) -> str:
    config = get_public_sso_config(organization_id)
    try:
        from onelogin.saml2.settings import OneLogin_Saml2_Settings
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SAML support is not installed on this server",
        ) from exc
    saml_settings = OneLogin_Saml2_Settings(build_saml_settings(config), sp_validation_only=True)
    metadata = saml_settings.get_sp_metadata()
    errors = saml_settings.validate_metadata(metadata)
    if errors:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Invalid SP metadata: {', '.join(errors)}",
        )
    return metadata


def public_sso_summary(organization_id: str) -> dict[str, Any]:
    config = store.get_organization_sso_config(organization_id)
    entity_id, acs_url = _sp_urls(organization_id)
    if config is None:
        return {
            "enabled": False,
            "enforced": False,
            "email_domains": [],
            "jit_provisioning": True,
            "default_role": OrgRole.viewer.value,
            "sp_entity_id": entity_id,
            "sp_acs_url": acs_url,
            "metadata_url": f"{settings.api_base_url.rstrip('/')}/api/v1/auth/sso/{organization_id}/metadata",
            "login_url": f"{settings.api_base_url.rstrip('/')}/api/v1/auth/sso/{organization_id}/login",
        }
    return {
        "enabled": config.enabled,
        "enforced": config.enforced,
        "idp_entity_id": config.idp_entity_id,
        "idp_sso_url": config.idp_sso_url,
        "idp_x509_cert_configured": bool(config.idp_x509_cert),
        "email_domains": config.email_domains,
        "jit_provisioning": config.jit_provisioning,
        "default_role": config.default_role.value,
        "updated_at": config.updated_at.isoformat(),
        "sp_entity_id": entity_id,
        "sp_acs_url": acs_url,
        "metadata_url": f"{settings.api_base_url.rstrip('/')}/api/v1/auth/sso/{organization_id}/metadata",
        "login_url": f"{settings.api_base_url.rstrip('/')}/api/v1/auth/sso/{organization_id}/login",
    }
