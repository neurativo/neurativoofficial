import asyncio
import httpx
from openai import OpenAI
from fastapi import UploadFile, HTTPException
from app.core.config import settings
from io import BytesIO
from app.services.cost_tracker import log_cost_async, log_cost

# Language code → display name map for the frontend badge
LANGUAGE_NAMES = {
    "en": "English", "ar": "Arabic", "zh": "Chinese", "fr": "French",
    "de": "German", "hi": "Hindi", "id": "Indonesian", "it": "Italian",
    "ja": "Japanese", "ko": "Korean", "ms": "Malay", "nl": "Dutch",
    "pl": "Polish", "pt": "Portuguese", "ru": "Russian", "es": "Spanish",
    "sv": "Swedish", "ta": "Tamil", "te": "Telugu", "th": "Thai",
    "tr": "Turkish", "uk": "Ukrainian", "ur": "Urdu", "vi": "Vietnamese",
}

# Resilience 9: granular timeout — 5s to connect, 30s for response body
# Prevents Whisper/GPT calls from hanging indefinitely on network stalls
client = OpenAI(
    api_key=settings.OPENAI_API_KEY,
    timeout=httpx.Timeout(30.0, connect=5.0),
) if settings.OPENAI_API_KEY else None

# Separate client for background file uploads — 20 min timeout for 1h+ audio
_bg_client = OpenAI(
    api_key=settings.OPENAI_API_KEY,
    timeout=httpx.Timeout(1200.0, connect=10.0),
) if settings.OPENAI_API_KEY else None


def filter_segments_by_confidence(segments: list, threshold: float = 0.6) -> str:
    """
    Returns joined text from segments whose no_speech_prob is at or below threshold.
    Segments above threshold are Whisper's own signal that the audio is non-speech.
    Threshold 0.6 matches Whisper's open-source reference implementation.
    Returns empty string when all segments are discarded or input is empty.
    """
    kept = [
        s.text
        for s in segments
        if getattr(s, "no_speech_prob", 0.0) <= threshold
        and s.text is not None
    ]
    return " ".join(kept).strip()


async def transcribe_audio(file: UploadFile, prompt: str = None, language: str = None) -> tuple[str, str]:
    """
    Transcribes audio using Whisper and returns (transcript_text, language_code).
    Language code is ISO-639-1 (e.g. "en", "ar", "zh").
    prompt: optional last ~200 words of the previous chunk to prevent duplicate transcription
            at chunk boundaries.
    language: ISO-639-1 code to pin Whisper's language detection. Pass the lecture's stored
              language on all chunks after the first detection. Eliminates cross-language
              hallucinations on quiet/ambiguous 12s clips.
    """
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    if not client:
        raise HTTPException(status_code=500, detail="OpenAI client not initialized")

    try:
        file_content = await file.read()
        file_obj = BytesIO(file_content)
        file_obj.name = file.filename

        create_kwargs = dict(
            model="whisper-1",
            file=file_obj,
            response_format="verbose_json",
            temperature=0,
        )
        if prompt:
            create_kwargs["prompt"] = prompt
        if language:
            create_kwargs["language"] = language

        transcript_response = await asyncio.to_thread(
            client.audio.transcriptions.create,
            **create_kwargs
        )

        detected_language = getattr(transcript_response, "language", None) or "en"
        segments = getattr(transcript_response, "segments", None) or []

        # Filter hallucinated segments using Whisper's own no_speech_prob signal.
        # Falls back to response.text when Whisper returns no segment data.
        if segments:
            text = filter_segments_by_confidence(segments)
        else:
            text = transcript_response.text or ""

        audio_seconds = segments[-1].end if segments else 0.0
        await log_cost_async("whisper_transcription", "whisper-1", audio_seconds=audio_seconds)

        return text, detected_language

    except Exception as e:
        print(f"Error during transcription: {e}")
        raise HTTPException(status_code=500, detail="Transcription failed")


async def transcribe_audio_bytes(file_bytes: bytes, filename: str) -> tuple[str, str]:
    """
    Transcribes raw audio bytes. Used for background processing of large files
    where the HTTP request must return before Whisper finishes.
    Uses a long-timeout client (20 min) suitable for 1h+ recordings.
    """
    if not _bg_client:
        raise Exception("OpenAI client not initialized")
    file_obj = BytesIO(file_bytes)
    file_obj.name = filename
    transcript_response = await asyncio.to_thread(
        _bg_client.audio.transcriptions.create,
        model="whisper-1",
        file=file_obj,
        response_format="verbose_json"
    )
    text = transcript_response.text or ""
    detected_language = getattr(transcript_response, "language", None) or "en"

    segments = getattr(transcript_response, "segments", None) or []
    audio_seconds = segments[-1]["end"] if segments else 0.0
    log_cost("whisper_import", "whisper-1", audio_seconds=audio_seconds)

    return text, detected_language


def get_language_display_name(language_code: str) -> str:
    """Returns a human-readable language name for display in the UI."""
    return LANGUAGE_NAMES.get(language_code.lower(), language_code.upper())
