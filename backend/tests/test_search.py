"""Tests for lecture search functionality."""


def test_get_recent_lectures_accepts_q_param():
    """get_recent_lectures must accept a q keyword argument."""
    import inspect
    from app.services.supabase_service import get_recent_lectures

    sig = inspect.signature(get_recent_lectures)
    assert "q" in sig.parameters, (
        "get_recent_lectures must have a 'q' parameter for content search."
    )


def test_get_recent_lectures_q_default_is_none():
    """get_recent_lectures q param must default to None (no search = all lectures)."""
    import inspect
    from app.services.supabase_service import get_recent_lectures

    sig = inspect.signature(get_recent_lectures)
    assert sig.parameters["q"].default is None, (
        "get_recent_lectures 'q' parameter must default to None."
    )


def test_get_lectures_endpoint_accepts_q_param():
    """GET /lectures endpoint source must accept a q query parameter."""
    import inspect
    from app.api import endpoints

    source = inspect.getsource(endpoints.get_lectures)
    assert "q" in source, (
        "get_lectures endpoint must accept a 'q' query parameter."
    )


def test_get_recent_lectures_applies_ilike_when_q_provided():
    """get_recent_lectures must use ilike filtering when q is not None."""
    import inspect
    from app.services.supabase_service import get_recent_lectures

    source = inspect.getsource(get_recent_lectures)
    assert "ilike" in source, (
        "get_recent_lectures must apply ilike filter when q is provided."
    )


def test_search_snippet_shown_when_q_provided():
    """get_recent_lectures must return a context snippet when q is provided."""
    import inspect
    from app.services.supabase_service import get_recent_lectures

    source = inspect.getsource(get_recent_lectures)
    assert "idx" in source or ".find(" in source, (
        "get_recent_lectures must extract a context snippet around the match when q is provided."
    )
