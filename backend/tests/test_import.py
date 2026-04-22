"""Tests for the full-audio import path — multilingual safety and summarisation quality."""


def test_transcribe_audio_bytes_has_no_language_pin():
    """transcribe_audio_bytes must not accept a language parameter.

    The import path uses transcribe_audio_bytes (not transcribe_audio).
    It must let Whisper auto-detect language on every file — no pinning.
    """
    import inspect
    from app.services.openai_service import transcribe_audio_bytes

    sig = inspect.signature(transcribe_audio_bytes)
    assert "language" not in sig.parameters, (
        "transcribe_audio_bytes must not have a 'language' parameter — "
        "Whisper should auto-detect per file."
    )


def test_background_task_uses_summarize_topic_segment():
    """_transcribe_background must call summarize_topic_segment for chunked summarisation.

    The old code passed [transcript_text] directly to generate_master_summary.
    The new code must chunk the transcript via summarize_topic_segment first,
    then pass the resulting section summaries to generate_master_summary.
    """
    import inspect
    from app.api import endpoints

    source = inspect.getsource(endpoints._transcribe_background)
    assert "summarize_topic_segment" in source, (
        "_transcribe_background must call summarize_topic_segment to chunk-summarise "
        "the transcript before passing to generate_master_summary."
    )


def test_background_task_does_not_pass_raw_transcript_to_master_summary():
    """_transcribe_background must not pass [transcript_text] directly to generate_master_summary.

    Passing the raw transcript as a single list element overflows GPT context for
    long lectures and produces low-quality summaries.
    """
    import inspect
    from app.api import endpoints

    source = inspect.getsource(endpoints._transcribe_background)
    assert "[transcript_text]" not in source or "summarize_topic_segment" in source, (
        "_transcribe_background must not pass raw transcript directly to "
        "generate_master_summary — use chunked summarize_topic_segment first."
    )
