# Audio Quality & Transcription Accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate false/hallucinated transcripts and improve accuracy on low-quality audio by adding frontend bandpass filters, pinning Whisper's language after first detection, enforcing temperature=0, and filtering hallucinated segments via Whisper's own `no_speech_prob` confidence signal.

**Architecture:** `filter_segments_by_confidence()` is a pure helper in `openai_service.py` — called inside `transcribe_audio()` so the endpoint always receives clean, already-filtered text. `endpoints.py` fetches the stored language before calling transcription and passes it as a pin. The frontend inserts two `BiquadFilterNode`s (highpass 80Hz, lowpass 8000Hz) in the AudioContext chain before gain and compression.

**Tech Stack:** React (Web Audio API `BiquadFilterNode`), FastAPI (Python), OpenAI Whisper API (`verbose_json`), pytest, pytest-asyncio

---

## File Map

| File | Change |
|------|--------|
| `backend/tests/__init__.py` | New — makes `tests/` a package |
| `backend/tests/test_segment_filter.py` | New — unit tests for `filter_segments_by_confidence` |
| `backend/tests/test_openai_service.py` | New — unit tests for `transcribe_audio` language + temperature |
| `backend/app/services/openai_service.py` | Add `filter_segments_by_confidence()`, add `language` param + `temperature=0` to both transcription functions, call helper inside `transcribe_audio()` |
| `backend/app/api/endpoints.py` | Fetch `stored_language` before transcription; pass as pin; extend prompt 100→200 words; remove hallucination string loop |
| `frontend/src/App.jsx` | Insert `highpass(80Hz)` + `lowpass(8000Hz)` BiquadFilterNodes in `startRecording()` audio chain |

---

## Task 1: Install pytest and create test package

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/tests/__init__.py`

- [ ] **Step 1: Add pytest deps to requirements.txt**

Append to `backend/requirements.txt`:
```
pytest==8.3.5
pytest-asyncio==0.24.0
```

- [ ] **Step 2: Install**

```bash
cd backend
venv/Scripts/pip install pytest==8.3.5 pytest-asyncio==0.24.0
```

Expected output: `Successfully installed pytest-8.3.5 pytest-asyncio-0.24.0`

- [ ] **Step 3: Create test package**

Create empty file `backend/tests/__init__.py` (no content needed).

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt backend/tests/__init__.py
git commit -m "chore: add pytest and pytest-asyncio for backend tests"
```

---

## Task 2: `filter_segments_by_confidence()` helper — test then implement

**Files:**
- Create: `backend/tests/test_segment_filter.py`
- Modify: `backend/app/services/openai_service.py` (add helper before `transcribe_audio`)

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_segment_filter.py`:

```python
from unittest.mock import MagicMock


def _seg(text, no_speech_prob):
    s = MagicMock()
    s.text = text
    s.no_speech_prob = no_speech_prob
    return s


def test_all_segments_below_threshold_kept():
    from app.services.openai_service import filter_segments_by_confidence
    segs = [_seg("Hello world", 0.1), _seg("this is a test", 0.3)]
    assert filter_segments_by_confidence(segs) == "Hello world this is a test"


def test_segments_above_threshold_dropped():
    from app.services.openai_service import filter_segments_by_confidence
    segs = [_seg("real speech", 0.2), _seg("ありがとうございました", 0.9)]
    assert filter_segments_by_confidence(segs) == "real speech"


def test_segment_exactly_at_threshold_is_kept():
    from app.services.openai_service import filter_segments_by_confidence
    segs = [_seg("borderline", 0.6)]
    assert filter_segments_by_confidence(segs) == "borderline"


def test_all_segments_above_threshold_returns_empty():
    from app.services.openai_service import filter_segments_by_confidence
    segs = [_seg("noise", 0.7), _seg("hiss", 0.95)]
    assert filter_segments_by_confidence(segs) == ""


def test_empty_input_returns_empty():
    from app.services.openai_service import filter_segments_by_confidence
    assert filter_segments_by_confidence([]) == ""


def test_missing_no_speech_prob_defaults_to_zero_and_is_kept():
    from app.services.openai_service import filter_segments_by_confidence
    s = MagicMock(spec=[])
    s.text = "good speech"
    assert filter_segments_by_confidence([s]) == "good speech"
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend
venv/Scripts/python -m pytest tests/test_segment_filter.py -v
```

Expected: `ImportError: cannot import name 'filter_segments_by_confidence'`

- [ ] **Step 3: Add helper to `openai_service.py`**

In `backend/app/services/openai_service.py`, add this function after the `_bg_client` block (after line 30) and before `transcribe_audio`:

```python
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
    ]
    return " ".join(kept).strip()
```

- [ ] **Step 4: Run to confirm all pass**

```bash
cd backend
venv/Scripts/python -m pytest tests/test_segment_filter.py -v
```

Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_segment_filter.py backend/app/services/openai_service.py
git commit -m "feat: add filter_segments_by_confidence helper with tests"
```

---

## Task 3: Update `transcribe_audio()` — language param, temperature=0, segment filtering

**Files:**
- Create: `backend/tests/test_openai_service.py`
- Modify: `backend/app/services/openai_service.py:33-80` (the `transcribe_audio` function)

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_openai_service.py`:

```python
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
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd backend
venv/Scripts/python -m pytest tests/test_openai_service.py -v
```

Expected: tests for `temperature`, `language`, and segment filtering all FAIL.

- [ ] **Step 3: Replace `transcribe_audio()` in `openai_service.py`**

Replace the entire `transcribe_audio` function (lines 33–80) with:

```python
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
```

- [ ] **Step 4: Run all tests**

```bash
cd backend
venv/Scripts/python -m pytest tests/ -v
```

Expected: all tests PASS (5 in `test_openai_service.py`, 6 in `test_segment_filter.py`)

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_openai_service.py backend/app/services/openai_service.py
git commit -m "feat: transcribe_audio — temperature=0, language pin, no_speech_prob filtering"
```

---

## Task 4: Update `transcribe_audio_bytes()` — temperature=0

**Files:**
- Modify: `backend/app/services/openai_service.py:83-106` (the `transcribe_audio_bytes` function)

- [ ] **Step 1: Replace `transcribe_audio_bytes()` in `openai_service.py`**

Replace the entire `transcribe_audio_bytes` function (lines 83–106) with:

```python
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
        response_format="verbose_json",
        temperature=0,
    )
    detected_language = getattr(transcript_response, "language", None) or "en"
    segments = getattr(transcript_response, "segments", None) or []

    if segments:
        text = filter_segments_by_confidence(segments)
    else:
        text = transcript_response.text or ""

    audio_seconds = segments[-1]["end"] if segments else 0.0
    log_cost("whisper_import", "whisper-1", audio_seconds=audio_seconds)

    return text, detected_language
```

- [ ] **Step 2: Run all tests**

```bash
cd backend
venv/Scripts/python -m pytest tests/ -v
```

Expected: all 11 tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/openai_service.py
git commit -m "feat: add temperature=0 and segment filtering to transcribe_audio_bytes"
```

---

## Task 5: Update `endpoints.py` — language pinning + 200-word prompt + remove string stripping

**Files:**
- Modify: `backend/app/api/endpoints.py:719-762`

- [ ] **Step 1: Find the chunk endpoint's lock block**

Open `backend/app/api/endpoints.py`. Locate the block starting around line 719 that reads:

```python
    _HALLUCINATION_LANGS = {'ja', 'zh'}
    # Known Whisper silence hallucination strings — stripped from chunk text before processing
    _HALLUCINATION_STRINGS = [
        'ご視聴ありがとうございました', 'ありがとうございました',
        'お願いします', 'ご視聴', '字幕', 'Subtitles',
    ]

    async with _get_lecture_lock(lecture_id):
        # Build Whisper context from last ~100 words of transcript to prevent
        # duplicate transcription at chunk boundaries (Whisper re-generates its own
        # internal context window otherwise, causing the last 1-2 sentences to repeat).
        whisper_prompt = None
        try:
            transcript_so_far = get_lecture_transcript(lecture_id)
            if transcript_so_far:
                words = transcript_so_far.split()
                whisper_prompt = " ".join(words[-100:])
        except Exception:
            pass

        # 2. Transcribe
        try:
            chunk_text, detected_language = await transcribe_audio(file, prompt=whisper_prompt)
        except Exception:
            raise HTTPException(status_code=500, detail="Transcription failed")

        # Strip known Whisper hallucination strings (fired on silence/noise)
        for _h in _HALLUCINATION_STRINGS:
            chunk_text = chunk_text.replace(_h, '')
        chunk_text = chunk_text.strip()

        if not chunk_text:
            return {"lecture_id": lecture_id, "chunk_transcript": "", "message": "Empty transcription"}

        # 3. Persist language — first real detection wins, never override.
        # Ignore hallucination languages (ja/zh) which Whisper emits on silence.
        stored_language = get_lecture_language(lecture_id)  # None if not yet set
        if not stored_language and detected_language and detected_language not in _HALLUCINATION_LANGS:
            update_lecture_language(lecture_id, detected_language)
            stored_language = detected_language
        language = stored_language or 'en'
```

- [ ] **Step 2: Replace that block with the updated version**

```python
    _HALLUCINATION_LANGS = {'ja', 'zh'}

    async with _get_lecture_lock(lecture_id):
        # Fetch pinned language before transcription so we can pass it to Whisper.
        # After first detection, pinning prevents per-chunk re-detection drift that
        # causes cross-language hallucinations on quiet or ambiguous audio.
        stored_language = get_lecture_language(lecture_id)  # None on first chunk

        # Build Whisper context from last ~200 words of transcript to prevent
        # duplicate transcription at chunk boundaries.
        whisper_prompt = None
        try:
            transcript_so_far = get_lecture_transcript(lecture_id)
            if transcript_so_far:
                words = transcript_so_far.split()
                whisper_prompt = " ".join(words[-200:])
        except Exception:
            pass

        # 2. Transcribe — language pin passed when available.
        #    no_speech_prob segment filtering happens inside transcribe_audio().
        try:
            chunk_text, detected_language = await transcribe_audio(
                file,
                prompt=whisper_prompt,
                language=stored_language or None,
            )
        except Exception:
            raise HTTPException(status_code=500, detail="Transcription failed")

        chunk_text = chunk_text.strip()

        if not chunk_text:
            return {"lecture_id": lecture_id, "chunk_transcript": "", "message": "Empty transcription"}

        # 3. Persist language — first real detection wins, never override.
        # Ignore hallucination languages (ja/zh) which Whisper emits on silence.
        if not stored_language and detected_language and detected_language not in _HALLUCINATION_LANGS:
            update_lecture_language(lecture_id, detected_language)
            stored_language = detected_language
        language = stored_language or 'en'
```

- [ ] **Step 3: Run all tests**

```bash
cd backend
venv/Scripts/python -m pytest tests/ -v
```

Expected: all 11 tests PASS

- [ ] **Step 4: Smoke-test the backend starts**

```bash
cd backend
venv/Scripts/python -m uvicorn app.main:app --port 8001 --reload
```

Expected: `Application startup complete.` with no import errors. Ctrl+C to stop.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/endpoints.py
git commit -m "feat: language pinning + 200-word prompt + delegate hallucination filtering to service"
```

---

## Task 6: Frontend — bandpass filters in `startRecording()`

**Files:**
- Modify: `frontend/src/App.jsx:742-757`

No automated test is possible here (Web Audio API is browser-only). Manual verification is at the end of this task.

- [ ] **Step 1: Find the audio chain in `App.jsx`**

Open `frontend/src/App.jsx`. Locate the block around line 742:

```javascript
            // Boost mic gain for distant lecture recording (phone in a classroom).
            // Compressor sits after gain to prevent clipping when mic is close.
            const micSource = audioContextRef.current.createMediaStreamSource(micStream);
            const gainNode = audioContextRef.current.createGain();
            gainNode.gain.value = 2.5;
            const compressor = audioContextRef.current.createDynamicsCompressor();
            compressor.threshold.value = -24;  // start compressing at -24 dBFS
            compressor.knee.value       = 30;  // soft knee
            compressor.ratio.value      = 12;  // heavy limiting above threshold
            compressor.attack.value     = 0.003;
            compressor.release.value    = 0.25;
            const gainDest = audioContextRef.current.createMediaStreamDestination();
            micSource.connect(gainNode);
            gainNode.connect(compressor);
            compressor.connect(analyserRef.current);
            compressor.connect(gainDest);
```

- [ ] **Step 2: Replace with bandpass-enhanced chain**

```javascript
            // Audio chain: bandpass filters strip non-speech frequencies before gain/compression.
            // Highpass 80Hz removes AC hum, fan noise, desk vibration, traffic rumble.
            // Lowpass 8kHz removes high-frequency hiss; speech intelligibility lives below 8kHz.
            // Gain boost for distant lecture recording (phone in a classroom).
            // Compressor after gain prevents clipping when mic is close.
            const micSource = audioContextRef.current.createMediaStreamSource(micStream);

            const highpass = audioContextRef.current.createBiquadFilter();
            highpass.type = 'highpass';
            highpass.frequency.value = 80;

            const lowpass = audioContextRef.current.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.value = 8000;

            const gainNode = audioContextRef.current.createGain();
            gainNode.gain.value = 2.5;
            const compressor = audioContextRef.current.createDynamicsCompressor();
            compressor.threshold.value = -24;  // start compressing at -24 dBFS
            compressor.knee.value       = 30;  // soft knee
            compressor.ratio.value      = 12;  // heavy limiting above threshold
            compressor.attack.value     = 0.003;
            compressor.release.value    = 0.25;
            const gainDest = audioContextRef.current.createMediaStreamDestination();
            micSource.connect(highpass);
            highpass.connect(lowpass);
            lowpass.connect(gainNode);
            gainNode.connect(compressor);
            compressor.connect(analyserRef.current);
            compressor.connect(gainDest);
```

- [ ] **Step 3: Verify the frontend builds without errors**

```bash
cd frontend
npm run build
```

Expected: build completes with no errors. Warnings about bundle size are fine.

- [ ] **Step 4: Manual smoke test**

1. Start the backend: `cd backend && venv/Scripts/uvicorn app.main:app --reload`
2. Start the frontend: `cd frontend && npm run dev`
3. Open the app, start a live session
4. Speak for ~30 seconds in a normal environment — confirm transcript appears
5. Test near an AC vent or fan — confirm transcript is cleaner than before (no garbled noise artifacts)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: add highpass(80Hz) + lowpass(8kHz) bandpass filters to audio chain"
```

---

## Self-Review Checklist (already completed before saving)

- [x] **Spec coverage:** All three spec sections covered — frontend bandpass (Task 6), temperature + language + segment filtering (Tasks 2–4), endpoints language pinning + prompt extension (Task 5)
- [x] **No placeholders:** All steps contain exact code
- [x] **Type consistency:** `filter_segments_by_confidence` named consistently across Tasks 2 and 3; `transcribe_audio(file, prompt, language)` signature matches usage in Task 5
- [x] **`transcribe_audio_bytes` covered:** Task 4 adds temperature=0 and segment filtering to the background import path
- [x] **`_HALLUCINATION_STRINGS` intentionally removed** from endpoints: filtering is now done inside the service via `no_speech_prob`; the fallback string list is no longer needed since the root cause is addressed
- [x] **`stored_language` fetch moved before transcription** in Task 5 so it can be passed as the language pin — this is a subtle order change from the original code that must not be missed
