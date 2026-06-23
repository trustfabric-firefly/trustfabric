from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import HTTPException, status

from app.core.config import settings
from app.services import copilot


def _set_provider(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setattr(settings, "copilot_provider", value)


def test_provider_order_single_openai(monkeypatch):
    _set_provider(monkeypatch, "openai")
    assert copilot._provider_order() == ["openai"]


def test_provider_order_single_gemini(monkeypatch):
    _set_provider(monkeypatch, "gemini")
    assert copilot._provider_order() == ["gemini"]


def test_provider_order_single_claude(monkeypatch):
    _set_provider(monkeypatch, "claude")
    assert copilot._provider_order() == ["claude"]


def test_provider_order_auto_is_three(monkeypatch):
    _set_provider(monkeypatch, "auto")
    assert copilot._provider_order() == ["openai", "gemini", "claude"]


def test_provider_order_case_insensitive(monkeypatch):
    _set_provider(monkeypatch, "  Gemini ")
    assert copilot._provider_order() == ["gemini"]


def test_provider_order_invalid_raises_500(monkeypatch):
    _set_provider(monkeypatch, "bogus")
    with pytest.raises(HTTPException) as exc:
        copilot._provider_order()
    assert exc.value.status_code == 500


def test_unsupported_provider_fn_raises(monkeypatch):
    with pytest.raises(HTTPException) as exc:
        copilot._provider_fn("nope")
    assert exc.value.status_code == 500


def test_generate_recommendations_returns_first_success(monkeypatch):
    _set_provider(monkeypatch, "auto")
    with patch.object(
        copilot, "generate_with_openai", return_value={"summary": "ok"}
    ) as openai_fn:
        result = copilot.generate_recommendations_for_system(1, "u1", "org-1")
    assert result["summary"] == "ok"
    assert result["provider"] == "openai"
    openai_fn.assert_called_once()


def test_generate_recommendations_preserves_existing_provider_key(monkeypatch):
    _set_provider(monkeypatch, "claude")
    with patch.object(
        copilot, "generate_with_claude", return_value={"summary": "ok", "provider": "claude-custom"}
    ):
        result = copilot.generate_recommendations_for_system(1, "u1", "org-1")
    assert result["provider"] == "claude-custom"


def test_generate_recommendations_404_propagates_immediately(monkeypatch):
    _set_provider(monkeypatch, "auto")
    not_found = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="missing")
    with patch.object(copilot, "generate_with_openai", side_effect=not_found):
        with pytest.raises(HTTPException) as exc:
            copilot.generate_recommendations_for_system(1, "u1", "org-1")
    assert exc.value.status_code == 404


def test_generate_recommendations_falls_back_on_503(monkeypatch):
    _set_provider(monkeypatch, "auto")
    unavailable = HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="down")
    with patch.object(copilot, "generate_with_openai", side_effect=unavailable):
        with patch.object(copilot, "generate_with_gemini", side_effect=unavailable):
            with patch.object(
                copilot, "generate_with_claude", return_value={"summary": "fallback"}
            ):
                result = copilot.generate_recommendations_for_system(1, "u1", "org-1")
    assert result["summary"] == "fallback"
    assert result["provider"] == "claude"


def test_generate_recommendations_all_fail_raises_503(monkeypatch):
    _set_provider(monkeypatch, "auto")
    unavailable = HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="bad")
    with patch.object(copilot, "generate_with_openai", side_effect=unavailable):
        with patch.object(copilot, "generate_with_gemini", side_effect=unavailable):
            with patch.object(copilot, "generate_with_claude", side_effect=unavailable):
                with pytest.raises(HTTPException) as exc:
                    copilot.generate_recommendations_for_system(1, "u1", "org-1")
    assert exc.value.status_code == 503


def test_generate_recommendations_non_retryable_raises(monkeypatch):
    _set_provider(monkeypatch, "claude")
    forbidden = HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no")
    with patch.object(copilot, "generate_with_claude", side_effect=forbidden):
        with pytest.raises(HTTPException) as exc:
            copilot.generate_recommendations_for_system(1, "u1", "org-1")
    assert exc.value.status_code == 403


def test_generate_policy_recommendation_first_success(monkeypatch):
    _set_provider(monkeypatch, "gemini")
    with patch.object(
        copilot, "generate_policy_with_gemini", return_value={"policy": {}}
    ):
        result = copilot.generate_policy_recommendation("make a policy", "u1")
    assert result["provider"] == "gemini"


def test_generate_policy_recommendation_falls_back(monkeypatch):
    _set_provider(monkeypatch, "auto")
    down = HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="x")
    with patch.object(copilot, "generate_policy_with_openai", side_effect=down):
        with patch.object(copilot, "generate_policy_with_gemini", side_effect=down):
            with patch.object(
                copilot, "generate_policy_with_claude", return_value={"policy": {}}
            ):
                result = copilot.generate_policy_recommendation("p", "u1")
    assert result["provider"] == "claude"


def test_generate_policy_recommendation_all_fail_raises_503(monkeypatch):
    _set_provider(monkeypatch, "auto")
    down = HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="x")
    with patch.object(copilot, "generate_policy_with_openai", side_effect=down):
        with patch.object(copilot, "generate_policy_with_gemini", side_effect=down):
            with patch.object(copilot, "generate_policy_with_claude", side_effect=down):
                with pytest.raises(HTTPException) as exc:
                    copilot.generate_policy_recommendation("p", "u1")
    assert exc.value.status_code == 503
