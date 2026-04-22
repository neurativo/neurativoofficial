"""Tests for import progress status wiring."""


def test_get_lecture_for_summarization_includes_summary_status():
    """get_lecture_for_summarization must select summary_status column."""
    import inspect
    from app.services.supabase_service import get_lecture_for_summarization

    source = inspect.getsource(get_lecture_for_summarization)
    assert "summary_status" in source, (
        "get_lecture_for_summarization must include 'summary_status' in its SELECT — "
        "the frontend polls GET /lectures/{id} which calls this function."
    )


def test_transcribe_background_sets_importing_status():
    """_transcribe_background must set summary_status='importing' at the start."""
    import inspect
    from app.api import endpoints

    source = inspect.getsource(endpoints._transcribe_background)
    assert "'importing'" in source or '"importing"' in source, (
        "_transcribe_background must call set_summary_status(lecture_id, 'importing') "
        "at the start so the frontend knows transcription is in progress."
    )


def test_transcribe_background_sets_summarizing_status():
    """_transcribe_background must set summary_status='summarizing' after transcript saved."""
    import inspect
    from app.api import endpoints

    source = inspect.getsource(endpoints._transcribe_background)
    assert "'summarizing'" in source or '"summarizing"' in source, (
        "_transcribe_background must call set_summary_status(lecture_id, 'summarizing') "
        "after update_lecture_transcript so the frontend shows 'Generating summary…'."
    )


def test_transcribe_background_sets_final_status():
    """_transcribe_background must set summary_status='final' after summary saved."""
    import inspect
    from app.api import endpoints

    source = inspect.getsource(endpoints._transcribe_background)
    final_count = source.count("'final'") + source.count('"final"')
    assert final_count >= 1, (
        "_transcribe_background must call set_summary_status(lecture_id, 'final') "
        "after update_lecture_summary_only so the frontend knows to navigate."
    )
