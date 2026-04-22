"""Tests for multilingual code-switching support."""
import pytest
from unittest.mock import MagicMock, patch, AsyncMock


def _make_transcribe_response(text: str, language: str = "si"):
    resp = MagicMock()
    resp.text = text
    resp.language = language
    resp.segments = []
    return resp


# ── Language pinning removed ───────────────────────────────────────────────────

def test_live_chunk_transcription_does_not_pin_language():
    """
    The live chunk endpoint must call transcribe_audio with language=None
    so Whisper handles each chunk independently (code-switching support).
    Even when the lecture has a stored language, we must not pass it to Whisper.
    """
    # This test reads the source to verify the pin is absent.
    import inspect
    from app.api import endpoints
    source = inspect.getsource(endpoints)
    # The language pin was: language=stored_language or None
    # After fix, transcribe_audio must be called without a language= kwarg
    # referencing stored_language.
    assert "language=stored_language" not in source, (
        "Language pinning still present — remove 'language=stored_language or None' "
        "from the transcribe_audio call in the live chunk endpoint."
    )
