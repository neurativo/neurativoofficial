"""Tests for subscriber-only gate on credit pack checkout."""
import pytest
import asyncio
from unittest.mock import MagicMock, patch


def _mock_free_user():
    u = MagicMock()
    u.id = "user-free-1"
    u.email = "free@example.com"
    return u


def _mock_student_user():
    u = MagicMock()
    u.id = "user-student-1"
    u.email = "student@example.com"
    return u


def test_free_user_gets_403_on_credits_checkout():
    """Free tier users should receive 403 subscription_required."""
    from app.api.billing import create_credits_checkout, CreditsCheckoutBody
    from fastapi import HTTPException

    body = CreditsCheckoutBody(pack="small_pack")
    user = _mock_free_user()

    with patch("app.api.billing.supabase_service") as mock_svc, \
         patch("app.api.billing.settings") as mock_settings:
        mock_settings.DODO_API_KEY = "test-key"

        db = MagicMock()
        profile_resp = MagicMock()
        profile_resp.data = {"plan_tier": "free"}
        db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = profile_resp
        mock_svc._fresh_db.return_value = db

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(create_credits_checkout(body, user))

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail["error"] == "subscription_required"


def test_student_user_passes_subscription_check():
    """Student tier users should pass the gate and reach the Dodo checkout."""
    from app.api.billing import create_credits_checkout, CreditsCheckoutBody

    body = CreditsCheckoutBody(pack="small_pack")
    user = _mock_student_user()

    with patch("app.api.billing.supabase_service") as mock_svc, \
         patch("app.api.billing.settings") as mock_settings, \
         patch("app.api.billing.dodo_service") as mock_dodo, \
         patch("app.api.billing.create_credits_purchase_intent", return_value="intent-1"):
        mock_settings.DODO_API_KEY = "test-key"
        mock_settings.CLERK_SECRET_KEY = "clerk-key"

        db = MagicMock()
        profile_resp = MagicMock()
        profile_resp.data = {"plan_tier": "student"}
        db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = profile_resp
        mock_svc._fresh_db.return_value = db

        mock_dodo.create_credits_checkout.return_value = ("session-1", "https://checkout.dodopayments.com/abc")

        result = asyncio.run(create_credits_checkout(body, user))
        assert "checkout_url" in result
