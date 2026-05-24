"""Tests for admin financials endpoints."""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import get_admin_user, User

client = TestClient(app)

ADMIN_HEADERS = {"Authorization": "Bearer test-admin-token"}

_ADMIN_USER = User(id="admin-user-id", email="admin@test.com")


def _override_admin():
    return _ADMIN_USER


def _make_sb(sub_data=None, pack_data=None, cost_data=None, infra_data=None, created_data=None):
    sb = MagicMock()
    def _table(name):
        tbl = MagicMock()
        def _select(*a, **kw):
            sel = MagicMock()
            def _chain(*a, **kw): return sel
            sel.eq = _chain
            sel.in_ = _chain
            sel.gte = _chain
            sel.lte = _chain
            if name == "user_subscriptions":
                sel.execute = MagicMock(return_value=MagicMock(data=sub_data or []))
            elif name == "purchase_intents":
                sel.execute = MagicMock(return_value=MagicMock(data=pack_data or []))
            elif name == "api_cost_logs":
                sel.execute = MagicMock(return_value=MagicMock(data=cost_data or []))
            elif name == "admin_external_costs":
                sel.execute = MagicMock(return_value=MagicMock(data=infra_data or []))
            else:
                sel.execute = MagicMock(return_value=MagicMock(data=[]))
            return sel
        tbl.select = _select
        ins = MagicMock()
        ins.execute = MagicMock(return_value=MagicMock(data=[created_data] if created_data else []))
        tbl.insert = MagicMock(return_value=ins)
        return tbl
    sb.table = _table
    return sb


@patch("app.api.admin._sb_client")
def test_financials_summary_zero_data(mock_sb):
    """Returns zeros when no data exists for the month."""
    app.dependency_overrides[get_admin_user] = _override_admin
    try:
        mock_sb.return_value = _make_sb()
        res = client.get("/api/v1/admin/financials/summary?month=2025-01", headers=ADMIN_HEADERS)
        assert res.status_code == 200
        body = res.json()
        assert body["month"] == "2025-01"
        assert body["revenue"]["total_usd"] == 0.0
        assert body["costs"]["total_usd"] == 0.0
        assert body["net_profit_usd"] == 0.0
        assert body["margin_pct"] == 0.0
    finally:
        app.dependency_overrides.pop(get_admin_user, None)


@patch("app.api.admin._sb_client")
def test_financials_summary_with_data(mock_sb):
    """Calculates correct P&L with subscriptions, credit packs, AI costs."""
    app.dependency_overrides[get_admin_user] = _override_admin
    try:
        mock_sb.return_value = _make_sb(
            sub_data=[{"plan_tier": "student"}, {"plan_tier": "pro"}],
            pack_data=[{"price_usd": 11.99}],
            cost_data=[{"cost_usd": 5.00}],
            infra_data=[{"category": "railway", "amount_usd": 10.00}],
        )
        res = client.get("/api/v1/admin/financials/summary?month=2026-05", headers=ADMIN_HEADERS)
        assert res.status_code == 200
        body = res.json()
        # Revenue: 9.99 + 19.99 + 11.99 = 41.97
        assert body["revenue"]["subscriptions_usd"] == pytest.approx(29.98, abs=0.01)
        assert body["revenue"]["credit_packs_usd"] == pytest.approx(11.99, abs=0.01)
        assert body["revenue"]["total_usd"] == pytest.approx(41.97, abs=0.01)
        # AI cost = 5.00
        assert body["costs"]["ai_api_usd"] == pytest.approx(5.00, abs=0.01)
        # Infrastructure = 10.00
        assert body["costs"]["infrastructure_usd"] == pytest.approx(10.00, abs=0.01)
        assert body["costs"]["infrastructure_by_category"]["railway"] == pytest.approx(10.00, abs=0.01)
        # Net profit = total_revenue - total_costs (positive)
        assert body["net_profit_usd"] == pytest.approx(
            body["revenue"]["total_usd"] - body["costs"]["total_usd"], abs=0.01
        )
    finally:
        app.dependency_overrides.pop(get_admin_user, None)


@patch("app.api.admin._sb_client")
def test_financials_summary_default_month(mock_sb):
    """Without month param, defaults to current month format YYYY-MM."""
    from datetime import datetime, timezone
    app.dependency_overrides[get_admin_user] = _override_admin
    try:
        mock_sb.return_value = _make_sb()
        res = client.get("/api/v1/admin/financials/summary", headers=ADMIN_HEADERS)
        assert res.status_code == 200
        body = res.json()
        expected_month = datetime.now(timezone.utc).strftime("%Y-%m")
        assert body["month"] == expected_month
    finally:
        app.dependency_overrides.pop(get_admin_user, None)


@patch("app.api.admin._sb_client")
def test_financials_trend_returns_months_array(mock_sb):
    """Trend endpoint returns a months array of the correct length."""
    app.dependency_overrides[get_admin_user] = _override_admin
    try:
        mock_sb.return_value = _make_sb()
        res = client.get("/api/v1/admin/financials/trend?months=3", headers=ADMIN_HEADERS)
        assert res.status_code == 200
        body = res.json()
        assert "months" in body
        assert len(body["months"]) == 3
        # Each entry has required fields
        for entry in body["months"]:
            assert "month" in entry
            assert "revenue_usd" in entry
            assert "costs_usd" in entry
            assert "net_profit_usd" in entry
    finally:
        app.dependency_overrides.pop(get_admin_user, None)


@patch("app.api.admin._sb_client")
def test_get_external_costs_returns_items(mock_sb):
    """External costs list endpoint returns items for a month."""
    app.dependency_overrides[get_admin_user] = _override_admin
    try:
        mock_sb.return_value = _make_sb(infra_data=[
            {"id": "abc", "category": "railway", "label": "Railway Pro", "amount_usd": 5.00, "note": None}
        ])
        res = client.get("/api/v1/admin/external-costs?month=2026-05", headers=ADMIN_HEADERS)
        assert res.status_code == 200
        body = res.json()
        assert body["month"] == "2026-05"
        assert len(body["items"]) == 1
        assert body["items"][0]["category"] == "railway"
    finally:
        app.dependency_overrides.pop(get_admin_user, None)


@patch("app.api.admin._sb_client")
def test_create_external_cost(mock_sb):
    """POST /admin/external-costs creates a cost entry."""
    app.dependency_overrides[get_admin_user] = _override_admin
    try:
        new_item = {"id": "xyz", "category": "supabase", "label": "Supabase Pro",
                    "amount_usd": 25.00, "period": "2026-05", "note": None}
        mock_sb.return_value = _make_sb(created_data=new_item)
        res = client.post("/api/v1/admin/external-costs", headers=ADMIN_HEADERS,
                          json={"category": "supabase", "label": "Supabase Pro",
                                "amount_usd": 25.00, "period": "2026-05"})
        assert res.status_code == 201
        body = res.json()
        assert body["category"] == "supabase"
        assert body["amount_usd"] == 25.00
    finally:
        app.dependency_overrides.pop(get_admin_user, None)
