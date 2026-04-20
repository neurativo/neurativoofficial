# Audio Quality & Transcription Accuracy — Design Spec

**Date:** 2026-04-20
**Scope:** Full-stack improvements to reduce false transcripts and improve accuracy on low-quality audio (mobile, desktop, distant recording, noisy environments)
**Approach:** B — Frontend audio preprocessing + backend Whisper API improvements + segment-level hallucination filtering

---

## Problem

Neurativo's live recording pipeline produces false or inaccurate transcripts under real-world conditions:
- Distant lecturer in a classroom (phone on desk, lecturer far away)
- Noisy environments (AC, fans, traffic, background noise)
- Accented or fast speech generating wrong words
- Silent/low-signal gaps generating hallucinated text

The current pipeline has partial mitigations (gain boost, compressor, hardcoded hallucination strings, last-100-words boundary prompt) but misses the highest-leverage fixes.

---

## Solution Overview

Three targeted changes across the frontend and backend, each addressing a distinct failure mode.

---

## Section 1: Frontend Audio Preprocessing

**File:** `frontend/src/App.jsx` — `startRecording()` function

**Change:** Insert two `BiquadFilterNode`s into the AudioContext signal chain before gain and compression.

**New chain:**
```
micSource → highpass(80Hz) → lowpass(8000Hz) → gainNode(2.5x) → compressor → destination
```

**Details:**
- **Highpass filter at 80Hz** (`type: 'highpass'`, `frequency: 80`): removes AC hum, fan noise, desk vibration, traffic rumble. All of human speech sits above 80Hz; nothing below contributes to intelligibility.
- **Lowpass filter at 8000Hz** (`type: 'lowpass'`, `frequency: 8000`): removes high-frequency hiss and electrical interference. Speech intelligibility is fully captured below 8kHz; Whisper resamples to 16kHz internally, so frequencies above 8kHz provide no benefit.
- Gain (2.5x) and compressor settings remain unchanged — they are already well-tuned for distant recording.

**Impact:** Cleaner signal reaches Whisper, reducing ambiguous audio that triggers hallucinations.

---

## Section 2: Backend Whisper API Improvements

**Files:** `backend/app/services/openai_service.py`, `backend/app/api/endpoints.py`

### 2a. Explicit `temperature=0`

Pass `temperature=0` on every Whisper API call (`transcribe_audio` and `transcribe_audio_bytes`). Currently omitted, leaving the API to apply its internal defaults. Explicit zero = maximum determinism, fewest random word substitutions.

### 2b. Language Pinning

After first language detection (lock-in already exists in `endpoints.py`), pass `language=stored_language` to every subsequent Whisper call for that lecture.

Currently Whisper re-detects language independently on every 12s clip. On quiet or ambiguous audio, this is the single biggest source of cross-language hallucinations — Whisper may decide a quiet clip is Japanese and produce Japanese text. Pinning the language after the first confident detection eliminates this entirely.

**Implementation:** `transcribe_audio()` accepts an optional `language: str = None` parameter. `endpoints.py` passes `stored_language` on all chunks after the first.

### 2c. Extended Boundary Prompt

Increase the whisper context prompt from the last **100 words → 200 words** of transcript. More text context improves boundary continuity between 12s chunks. No extra API cost.

---

## Section 3: Segment-level `no_speech_prob` Filtering

**File:** `backend/app/api/endpoints.py`

**Change:** Replace hardcoded hallucination string stripping with segment-level filtering using Whisper's built-in confidence signal.

Whisper's `verbose_json` response already returns per-segment metadata including `no_speech_prob` (float 0.0–1.0). This is Whisper's own estimate of the probability that a segment contains no real speech.

**New logic (replaces the `_HALLUCINATION_STRINGS` loop):**
```python
segments = getattr(transcript_response, "segments", None) or []
if segments:
    kept = [s.text for s in segments if s.no_speech_prob <= 0.6]
    chunk_text = " ".join(kept).strip()
else:
    chunk_text = transcript_response.text or ""
```

**Threshold:** `0.6` — the established cutoff used in Whisper's own open-source reference implementation. Segments above this threshold are statistically more likely to be hallucinated than real speech.

**Fallback:** The hardcoded `_HALLUCINATION_STRINGS` list was removed from `endpoints.py` entirely. The `no_speech_prob` filtering addresses the root cause rather than individual symptom strings, and the list was Whisper-version-specific and fragile. No fallback string list is maintained.

**Impact:** Eliminates hallucinated text on silence, background noise, and low-SNR audio that the hardcoded list cannot cover.

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/App.jsx` | Add highpass + lowpass BiquadFilterNode in `startRecording()` audio chain |
| `backend/app/services/openai_service.py` | Add `temperature=0` and optional `language` param to `transcribe_audio()` and `transcribe_audio_bytes()` |
| `backend/app/api/endpoints.py` | Pass `language=stored_language` to transcription; extend prompt to 200 words; replace string hallucination stripping with `no_speech_prob` segment filtering |

---

## What Is Not Changing

- Chunk size stays at 12s (real-time feel preserved)
- Gain (2.5x) and compressor settings unchanged
- Language lock-in logic unchanged (first real detection wins)
- `_HALLUCINATION_LANGS` set unchanged (ja/zh ignored for language detection)
- No GPT post-processing pass (cost not justified given Whisper accuracy with pinned language + clean audio)
- No changes to summarization, Q&A, or any other service

---

## Success Criteria

- No cross-language hallucinations after first chunk (language pinning)
- No hallucinated text on silent/noisy chunks (no_speech_prob filtering)
- Reduced background noise artifacts in transcript (bandpass filters)
- No regression in transcript continuity across chunk boundaries
