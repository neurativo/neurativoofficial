"""Tests for admin plan limits editor."""


def test_get_plan_limits_override_exists():
    """supabase_service must export get_plan_limits_override()."""
    from app.services import supabase_service
    assert hasattr(supabase_service, "get_plan_limits_override"), (
        "supabase_service must have get_plan_limits_override function"
    )


def test_set_plan_limits_override_exists():
    """supabase_service must export set_plan_limits_override(limits_dict)."""
    import inspect
    from app.services import supabase_service
    assert hasattr(supabase_service, "set_plan_limits_override"), (
        "supabase_service must have set_plan_limits_override function"
    )
    sig = inspect.signature(supabase_service.set_plan_limits_override)
    assert "limits" in sig.parameters


def test_get_limits_checks_supabase_override():
    """get_limits in plans.py must check Supabase override before using constants."""
    import inspect
    from app.core import plans
    source = inspect.getsource(plans.get_limits)
    assert "override" in source or "get_plan_limits_override" in source, (
        "get_limits must attempt to read Supabase overrides before falling back to constants"
    )


def test_admin_patch_limits_endpoint_exists():
    """admin.py must have a PATCH /system/limits endpoint."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "system/limits" in source or "system_limits" in source, (
        "admin.py must have PATCH /system/limits endpoint"
    )
