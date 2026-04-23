"""Tests for persistent admin audit log."""


def test_admin_write_audit_exists():
    """supabase_service must export admin_write_audit function."""
    import inspect
    from app.services import supabase_service
    assert hasattr(supabase_service, "admin_write_audit"), (
        "supabase_service must have admin_write_audit function"
    )
    sig = inspect.signature(supabase_service.admin_write_audit)
    assert "admin_id" in sig.parameters
    assert "action" in sig.parameters
    assert "target_id" in sig.parameters
    assert "detail" in sig.parameters


def test_admin_get_audit_log_exists():
    """supabase_service must export admin_get_audit_log function."""
    import inspect
    from app.services import supabase_service
    assert hasattr(supabase_service, "admin_get_audit_log"), (
        "supabase_service must have admin_get_audit_log function"
    )
    sig = inspect.signature(supabase_service.admin_get_audit_log)
    assert "page" in sig.parameters
    assert "page_size" in sig.parameters
    assert "action_filter" in sig.parameters


def test_admin_py_uses_supabase_writer():
    """admin.py _audit() must call admin_write_audit, not only appendleft."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "admin_write_audit" in source, (
        "admin.py must import and call admin_write_audit from supabase_service"
    )


def test_audit_log_endpoint_exists():
    """GET /admin/audit-log endpoint must exist in admin.py."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "audit-log" in source or "audit_log_endpoint" in source, (
        "admin.py must have a GET /audit-log endpoint"
    )
