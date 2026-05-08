# backend/app/services/audio_service.py
"""
audio_service.py — audio compression before Whisper.

Converts any audio to mono 16kHz mp3 via ffmpeg subprocess.
Falls back to original bytes if ffmpeg is not installed.
Chunks audio at CHUNK_SIZE_BYTES boundaries for Whisper's 25 MB limit.
"""
import subprocess
import io
import math
import tempfile
import os
from typing import List

# Whisper hard limit is 25 MB. We target 20 MB chunks for safety headroom.
WHISPER_SIZE_LIMIT = 25 * 1024 * 1024   # 25 MB
CHUNK_TARGET_BYTES  = 20 * 1024 * 1024  # 20 MB per chunk

# ffmpeg target: mono, 16kHz, mp3, 32kbps (speech-optimised, ~240KB/min)
_FFMPEG_ARGS = [
    "ffmpeg", "-y",
    "-i", "pipe:0",           # stdin
    "-ac", "1",               # mono
    "-ar", "16000",           # 16 kHz
    "-b:a", "32k",            # 32 kbps — enough for speech, tiny file
    "-f", "mp3",
    "pipe:1",                 # stdout
]


def _ffmpeg_available() -> bool:
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True, timeout=5)
        return True
    except Exception:
        return False


def probe_duration_seconds(audio_bytes: bytes, original_filename: str = "audio.webm") -> int | None:
    """
    Returns media duration using ffprobe, or None if duration cannot be verified.
    The caller should treat None conservatively for paid-cost gates.
    """
    suffix = os.path.splitext(original_filename or "")[1] or ".webm"
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        try:
            result = subprocess.run(
                [
                    "ffprobe",
                    "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    tmp_path,
                ],
                capture_output=True,
                text=True,
                timeout=20,
            )
            if result.returncode != 0:
                return None
            duration = float((result.stdout or "").strip())
            if duration <= 0:
                return None
            return int(math.ceil(duration))
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
    except Exception:
        return None


_FFMPEG_OK: bool | None = None   # cached at runtime


def compress(audio_bytes: bytes, original_filename: str = "audio.webm") -> bytes:
    """
    Converts audio_bytes to mono 16kHz mp3 via ffmpeg.
    Returns original bytes unchanged if ffmpeg is unavailable.
    """
    global _FFMPEG_OK
    if _FFMPEG_OK is None:
        _FFMPEG_OK = _ffmpeg_available()
    if not _FFMPEG_OK:
        print("[audio_service] ffmpeg not available — skipping compression")
        return audio_bytes

    try:
        result = subprocess.run(
            _FFMPEG_ARGS,
            input=audio_bytes,
            capture_output=True,
            timeout=300,   # 5 min max for 10-hour recordings
        )
        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace")[:500]
            print(f"[audio_service] ffmpeg error (returncode {result.returncode}): {stderr}")
            return audio_bytes
        compressed = result.stdout
        reduction = (1 - len(compressed) / len(audio_bytes)) * 100 if audio_bytes else 0
        print(f"[audio_service] compressed {len(audio_bytes):,} → {len(compressed):,} bytes ({reduction:.1f}% reduction)")
        return compressed
    except subprocess.TimeoutExpired:
        print("[audio_service] ffmpeg timeout — using original bytes")
        return audio_bytes
    except Exception as e:
        print(f"[audio_service] ffmpeg exception: {e} — using original bytes")
        return audio_bytes


def split_for_whisper(audio_bytes: bytes, filename: str = "audio.mp3") -> List[tuple[bytes, str]]:
    """
    Splits audio_bytes into chunks <= CHUNK_TARGET_BYTES.
    Returns list of (chunk_bytes, chunk_filename) tuples.
    If audio fits in one chunk, returns [(audio_bytes, filename)].

    Note: byte-splitting mp3 is imperfect but Whisper tolerates it well at
    32 kbps because frames are small (26 ms each = ~104 bytes). A split in
    the middle of a frame causes at most 26 ms of gibberish at the boundary.
    """
    if len(audio_bytes) <= CHUNK_TARGET_BYTES:
        return [(audio_bytes, filename)]

    n_chunks = math.ceil(len(audio_bytes) / CHUNK_TARGET_BYTES)
    chunk_size = math.ceil(len(audio_bytes) / n_chunks)
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "mp3"
    base = filename.rsplit(".", 1)[0]

    chunks = []
    for i in range(n_chunks):
        start = i * chunk_size
        end = min(start + chunk_size, len(audio_bytes))
        chunk_bytes = audio_bytes[start:end]
        chunk_name = f"{base}_part{i+1}.{ext}"
        chunks.append((chunk_bytes, chunk_name))
    return chunks
