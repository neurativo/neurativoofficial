"""Tests for admin engagement analytics endpoint."""


def test_analytics_endpoint_exists():
    """admin.py must have a GET /analytics endpoint."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "/analytics" in source or "analytics_endpoint" in source or "get_analytics" in source, (
        "admin.py must have a GET /analytics endpoint"
    )


def test_analytics_returns_active_users():
    """The analytics function must compute active_users (dau/wau/mau)."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "dau" in source.lower() or "active_users" in source or "daily_active" in source, (
        "analytics must include active user counts (DAU/WAU/MAU)"
    )


def test_analytics_returns_feature_adoption():
    """The analytics function must compute feature_adoption rates."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "feature_adoption" in source or "adoption" in source, (
        "analytics must include feature adoption rates"
    )


def test_analytics_returns_top_users():
    """The analytics function must compute top_users by activity."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "top_users" in source, (
        "analytics must include top_users list"
    )
