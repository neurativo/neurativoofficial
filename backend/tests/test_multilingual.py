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


# ── Task 2: summarization_service multilingual instruction ──────────────────

def test_multilingual_instruction_exists():
    """_multilingual_instruction() is a callable that takes no arguments."""
    from app.services.summarization_service import _multilingual_instruction
    result = _multilingual_instruction()
    assert isinstance(result, str)
    assert len(result) > 0

def test_multilingual_instruction_says_english():
    """_multilingual_instruction() output must mention English output."""
    from app.services.summarization_service import _multilingual_instruction
    result = _multilingual_instruction()
    assert "English" in result or "english" in result

def test_multilingual_instruction_mentions_mixed_languages():
    """_multilingual_instruction() must mention mixed/multiple languages."""
    from app.services.summarization_service import _multilingual_instruction
    result = _multilingual_instruction()
    # Must mention the concept of mixed/multiple languages
    assert any(word in result for word in ["mixed", "multiple", "languages", "Sinhala", "Tamil"])

def test_language_instruction_no_longer_used_in_summarization():
    """_language_instruction must not appear as a call in summarization_service."""
    import inspect
    from app.services import summarization_service
    source = inspect.getsource(summarization_service)
    # The old function call pattern should be gone (after line 7 where it's defined)
    # We check that lang_note is not assigned from _language_instruction(language)
    assert "lang_note = _language_instruction(language)" not in source, (
        "_language_instruction(language) call sites still present in summarization_service.py — "
        "replace them all with _multilingual_instruction()"
    )


# ── Task 3: qa_service multilingual instruction ─────────────────────────────

def test_qa_service_uses_english_output_instruction():
    """qa_service RAG prompt must instruct GPT to answer in English."""
    import inspect
    from app.services import qa_service
    source = inspect.getsource(qa_service)
    # Must contain the new multilingual instruction that says English
    assert "Always respond in English" in source, (
        "qa_service.py must contain 'Always respond in English' instruction"
    )
    # Must NOT contain the old pattern of responding in the lecture's language
    # (which used f-string formatting with lang_name variable)
    assert 'f"[INSTRUCTION: Always respond in {lang_name}' not in source, (
        "qa_service.py must not tell GPT to respond in the lecture's detected language (old pattern)"
    )


# ── Task 4: pdf_service multilingual note ───────────────────────────────────

def test_pdf_enrich_section_has_multilingual_note():
    """_call_enrich_section must have a multilingual note in its prompt."""
    import inspect
    from app.services import pdf_service
    source = inspect.getsource(pdf_service._call_enrich_section)
    assert "mixed languages" in source or "multilingual" in source.lower() or "Extract meaning" in source, (
        "_call_enrich_section must include a multilingual note in its user prompt"
    )

def test_pdf_glossary_has_multilingual_note():
    """_call_glossary must have a multilingual note in its prompt."""
    import inspect
    from app.services import pdf_service
    source = inspect.getsource(pdf_service._call_glossary)
    assert "mixed languages" in source or "multilingual" in source.lower() or "Extract meaning" in source, (
        "_call_glossary must include a multilingual note in its user prompt"
    )

def test_pdf_takeaways_has_multilingual_note():
    """_call_takeaways must have a multilingual note in its prompt."""
    import inspect
    from app.services import pdf_service
    source = inspect.getsource(pdf_service._call_takeaways)
    assert "mixed languages" in source or "multilingual" in source.lower() or "Extract meaning" in source, (
        "_call_takeaways must include a multilingual note in its user prompt"
    )
