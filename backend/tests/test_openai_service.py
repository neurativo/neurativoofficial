import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from io import BytesIO
from fastapi import UploadFile


def _make_upload_file(content: bytes = b"fake", filename: str = "c.webm") -> UploadFile:
    return UploadFile(filename=filename, file=BytesIO(content))


def _make_response(text="hello", language="en", segments=None):
    r = MagicMock()
    r.text = text
    r.language = language
    r.segments = segments or []
    return r


def _seg(text, no_speech_prob):
    s = MagicMock()
    s.text = text
    s.no_speech_prob = no_speech_prob
    return s


@pytest.mark.asyncio
async def test_transcribe_audio_passes_temperature_zero():
    """temperature=0 must appear in the kwargs forwarded to the OpenAI client."""
    captured = {}

    async def fake_to_thread(fn, **kwargs):
        captured.update(kwargs)
        return _make_response()

    with patch("app.services.openai_service.log_cost_async", new_callable=AsyncMock), \
         patch("asyncio.to_thread", side_effect=fake_to_thread):
        from app.services.openai_service import transcribe_audio
        await transcribe_audio(_make_upload_file())

    assert captured.get("temperature") == 0


@pytest.mark.asyncio
async def test_transcribe_audio_forwards_language_when_provided():
    """When language='ar' is passed, it must reach the OpenAI API kwargs."""
    captured = {}

    async def fake_to_thread(fn, **kwargs):
        captured.update(kwargs)
        return _make_response(language="ar")

    with patch("app.services.openai_service.log_cost_async", new_callable=AsyncMock), \
         patch("asyncio.to_thread", side_effect=fake_to_thread):
        from app.services.openai_service import transcribe_audio
        await transcribe_audio(_make_upload_file(), language="ar")

    assert captured.get("language") == "ar"


@pytest.mark.asyncio
async def test_transcribe_audio_omits_language_when_none():
    """When language is not provided, the 'language' key must not reach OpenAI."""
    captured = {}

    async def fake_to_thread(fn, **kwargs):
        captured.update(kwargs)
        return _make_response()

    with patch("app.services.openai_service.log_cost_async", new_callable=AsyncMock), \
         patch("asyncio.to_thread", side_effect=fake_to_thread):
        from app.services.openai_service import transcribe_audio
        await transcribe_audio(_make_upload_file())

    assert "language" not in captured


@pytest.mark.asyncio
async def test_transcribe_audio_filters_hallucinated_segments():
    """Segments with no_speech_prob > 0.6 must be excluded from returned text."""
    segs = [_seg("real speech", 0.1), _seg("hallucination", 0.9)]

    async def fake_to_thread(fn, **kwargs):
        return _make_response(text="real speech hallucination", segments=segs)

    with patch("app.services.openai_service.log_cost_async", new_callable=AsyncMock), \
         patch("asyncio.to_thread", side_effect=fake_to_thread):
        from app.services.openai_service import transcribe_audio
        text, _ = await transcribe_audio(_make_upload_file())

    assert text == "real speech"
    assert "hallucination" not in text


@pytest.mark.asyncio
async def test_transcribe_audio_falls_back_to_response_text_when_no_segments():
    """When Whisper returns no segments, response.text is used as-is."""
    async def fake_to_thread(fn, **kwargs):
        return _make_response(text="full transcript", segments=[])

    with patch("app.services.openai_service.log_cost_async", new_callable=AsyncMock), \
         patch("asyncio.to_thread", side_effect=fake_to_thread):
        from app.services.openai_service import transcribe_audio
        text, _ = await transcribe_audio(_make_upload_file())

    assert text == "full transcript"
