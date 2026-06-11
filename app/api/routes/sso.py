from __future__ import annotations

from fastapi import APIRouter, Form, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse, Response

from app.domain.models import SsoDiscoverRequest, SsoExchangeRequest
from app.services.sso import (
    build_login_redirect_url,
    build_sp_metadata_xml,
    discover_sso_for_email,
    exchange_sso_code,
    process_saml_acs,
)

router = APIRouter()


@router.post("/discover", summary="Discover SSO availability for an email domain")
def discover_sso(payload: SsoDiscoverRequest) -> dict:
    return discover_sso_for_email(payload.email)


@router.get("/{organization_id}/login", summary="Start SAML SSO login")
def start_sso_login(
    organization_id: str,
    return_to: str | None = Query(default=None),
) -> RedirectResponse:
    redirect_url = build_login_redirect_url(organization_id, return_to)
    return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)


@router.get("/{organization_id}/metadata", summary="SAML service provider metadata")
def sso_metadata(organization_id: str) -> Response:
    xml = build_sp_metadata_xml(organization_id)
    return Response(content=xml, media_type="application/xml")


@router.post("/acs", summary="SAML assertion consumer service")
async def saml_acs(
    request: Request,
    SAMLResponse: str = Form(...),  # noqa: N803
    RelayState: str | None = Form(default=None),  # noqa: N803
) -> RedirectResponse:
    host = request.headers.get("host", "")
    https = request.url.scheme == "https"
    redirect_url = process_saml_acs(
        https=https,
        host=host,
        path="/api/v1/auth/sso/acs",
        saml_response=SAMLResponse,
        relay_state=RelayState,
    )
    return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)


@router.post("/exchange", summary="Exchange a one-time SSO code for a Firebase custom token")
def sso_exchange(payload: SsoExchangeRequest) -> dict:
    try:
        return exchange_sso_code(payload.code)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete SSO sign-in",
        ) from exc
