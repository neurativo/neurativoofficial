import asyncio
import httpx
from openai import OpenAI
from fastapi import UploadFile, HTTPException
from app.core.config import settings
from io import BytesIO

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


async def transcribe_audio(file: UploadFile) -> tuple[str, str]:
    """
    Transcribes audio using Whisper and returns (transcript_text, language_code).
    Language code is ISO-639-1 (e.g. "en", "ar", "zh").
    Whisper detects language automatically — we just capture what it found.
    """
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    if not client:
        raise HTTPException(status_code=500, detail="OpenAI client not initialized")

    try:
        file_content = await file.read()
        file_obj = BytesIO(file_content)
        file_obj.name = file.filename

        # Use response_format="verbose_json" to get language alongside transcript.
        # Whisper always detects language internally — verbose_json exposes it
        # instead of discarding it. No extra API cost, no extra latency.
        transcript_response = await asyncio.to_thread(
            client.audio.transcriptions.create,
            model="whisper-1",
            file=file_obj,
            response_format="verbose_json"
        )

        text = transcript_response.text or ""
        # verbose_json includes a top-level 'language' field (ISO-639-1 code)
        detected_language = getattr(transcript_response, "language", None) or "en"

        return text, detected_language

    except Exception as e:
        print(f"Error during transcription: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


def get_language_display_name(language_code: str) -> str:
    """Returns a human-readable language name for display in the UI."""
    return LANGUAGE_NAMES.get(language_code.lower(), language_code.upper())
