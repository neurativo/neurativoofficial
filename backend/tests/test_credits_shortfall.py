"""Tests for graceful credit shortfall handling in finalize_reserved_credits."""
import pytest
from unittest.mock import MagicMock, patch, call
from fastapi import HTTPException


def _make_db(credits=0, reserved_amount=1):
    """Build a mock Supabase db client."""
    db = MagicMock()

    # profiles.select returns credits
    profile_resp = MagicMock()
    profile_resp.data = [{"credits": credits}]
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = profile_resp

    # credit_transactions for _reserved_amount (two .eq() calls)
    tx_resp = MagicMock()
    tx_resp.data = [{"amount": -reserved_amount, "reason": "credit_reserved"}]
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = tx_resp

    return db


def test_finalize_forgives_shortfall_when_balance_zero():
    """When a 35-min session reserved 1 credit but balance is now 0, finalize should not raise."""
    from app.services.credits_service import finalize_reserved_credits

    with patch("app.services.credits_service._fresh_db") as mock_db_fn, \
         patch("app.services.credits_service.mark_credit_deducted"):
        db = _make_db(credits=0, reserved_amount=1)
        mock_db_fn.return_value = db

        try:
            finalize_reserved_credits("user-1", "lecture-1", actual_duration_seconds=2100)
        except HTTPException as exc:
            pytest.fail(f"finalize_reserved_credits raised HTTP {exc.status_code} but should forgive shortfall")


def test_finalize_still_deducts_when_balance_sufficient():
    """Normal case: user has enough credits, finalize deducts the difference."""
    from app.services.credits_service import finalize_reserved_credits

    with patch("app.services.credits_service._fresh_db") as mock_db_fn, \
         patch("app.services.credits_service.mark_credit_deducted"), \
         patch("app.services.credits_service._deduct_amount") as mock_deduct:
        db = _make_db(credits=5, reserved_amount=1)
        mock_db_fn.return_value = db

        finalize_reserved_credits("user-1", "lecture-1", actual_duration_seconds=2100)
        mock_deduct.assert_called_once_with(
            "user-1", "lecture-1", 1, reason="lecture_processed"
        )


def test_finalize_propagates_non_402_exception():
    """Non-402 HTTPExceptions from _deduct_amount must still be raised."""
    from app.services.credits_service import finalize_reserved_credits

    with patch("app.services.credits_service._fresh_db") as mock_db_fn, \
         patch("app.services.credits_service.mark_credit_deducted"), \
         patch("app.services.credits_service._deduct_amount") as mock_deduct:
        db = _make_db(credits=5, reserved_amount=1)
        mock_db_fn.return_value = db
        mock_deduct.side_effect = HTTPException(status_code=500, detail="internal error")

        with pytest.raises(HTTPException) as exc_info:
            finalize_reserved_credits("user-1", "lecture-1", actual_duration_seconds=2100)

        assert exc_info.value.status_code == 500
