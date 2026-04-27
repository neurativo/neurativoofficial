"""Tests for user suspension feature."""


def test_set_user_suspended_exists():
    """supabase_service must export set_user_suspended(user_id, suspended)."""
    import inspect
    from app.services import supabase_service
    assert hasattr(supabase_service, "set_user_suspended"), (
        "supabase_service must have set_user_suspended function"
    )
    sig = inspect.signature(supabase_service.set_user_suspended)
    assert "user_id" in sig.parameters
    assert "suspended" in sig.parameters


def test_get_user_suspended_exists():
    """supabase_service must export get_user_suspended(user_id) -> bool."""
    import inspect
    from app.services import supabase_service
    assert hasattr(supabase_service, "get_user_suspended"), (
        "supabase_service must have get_user_suspended function"
    )
    sig = inspect.signature(supabase_service.get_user_suspended)
    assert "user_id" in sig.parameters


def test_get_active_user_exists_in_auth():
    """auth.py must export get_active_user dependency."""
    from app.core import auth
    assert hasattr(auth, "get_active_user"), (
        "auth.py must have get_active_user dependency that checks suspension"
    )


def test_get_active_user_checks_suspension():
    """get_active_user must call get_user_suspended."""
    import inspect
    from app.core import auth
    source = inspect.getsource(auth.get_active_user)
    assert "get_user_suspended" in source or "suspended" in source, (
        "get_active_user must check suspension status from supabase_service"
    )


def test_admin_suspend_endpoints_exist():
    """admin.py must have suspend and unsuspend route handlers."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "suspend" in source, "admin.py must have suspend endpoint"
    assert "unsuspend" in source, "admin.py must have unsuspend endpoint"
