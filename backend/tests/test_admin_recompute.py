"""Tests for admin lecture recompute wiring."""


def test_admin_recompute_endpoint_exists():
    import inspect
    from app.api import admin

    source = inspect.getsource(admin)
    assert '"/lectures/{lecture_id}/recompute"' in source
    assert "recompute_final_summary" in source
    assert "recompute_lecture" in source


def test_admin_api_exposes_recompute_lecture():
    from pathlib import Path

    source = Path("frontend/src/lib/adminApi.js").read_text(encoding="utf-8")
    assert "recomputeLecture" in source
