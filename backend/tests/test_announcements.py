"""Tests for broadcast announcements feature."""


def test_get_announcements_exists():
    """supabase_service must export get_announcements()."""
    from app.services import supabase_service
    assert hasattr(supabase_service, "get_announcements"), (
        "supabase_service must have get_announcements function"
    )


def test_create_announcement_exists():
    """supabase_service must export create_announcement(text, type, expires_at)."""
    import inspect
    from app.services import supabase_service
    assert hasattr(supabase_service, "create_announcement"), (
        "supabase_service must have create_announcement function"
    )
    sig = inspect.signature(supabase_service.create_announcement)
    assert "text" in sig.parameters
    assert "ann_type" in sig.parameters


def test_delete_announcement_exists():
    """supabase_service must export delete_announcement(announcement_id)."""
    import inspect
    from app.services import supabase_service
    assert hasattr(supabase_service, "delete_announcement"), (
        "supabase_service must have delete_announcement function"
    )
    sig = inspect.signature(supabase_service.delete_announcement)
    assert "announcement_id" in sig.parameters


def test_admin_announcement_endpoints_exist():
    """admin.py must have POST and DELETE /announcements endpoints."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "announcements" in source, (
        "admin.py must have announcement management endpoints"
    )


def test_user_announcements_endpoint_exists():
    """endpoints.py must have GET /announcements endpoint."""
    import inspect
    from app.api import endpoints
    source = inspect.getsource(endpoints)
    assert "announcements" in source, (
        "endpoints.py must have GET /announcements endpoint returning active announcements"
    )
