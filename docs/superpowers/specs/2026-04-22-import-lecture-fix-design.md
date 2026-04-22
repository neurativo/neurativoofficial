# Import Lecture Fix — Design Spec

**Date:** 2026-04-22
**Goal:** Fix the full-audio import path so it produces the same quality output as the live recording path, and verify multilingual support works correctly end-to-end for imported lectures.

---

## Problem

The import background task (`_transcribe_background` in `endpoints.py`) passes the full raw transcript directly to `generate_master_summary` as a single list element:

```python
summary = await _asyncio.to_thread(
    generate_master_summary, [transcript_text], language=language
)
```

`generate_master_summary` is designed to receive a list of condensed section summaries (typically 3–10 sentences each). Receiving a raw transcript of 5,000–30,000 words instead:

1. **Context window risk** — a 1-hour lecture is ~9,000 words, which pushes GPT context limits when the master summary prompt is added.
2. **Poor quality** — GPT asked to produce a master summary of raw lecture prose (not pre-condensed sections) generates generic, low-density output.
3. **Missed multilingual benefit** — section-level chunking is where mixed-language content gets properly extracted phrase by phrase.

The live path runs: micro-summary per chunk → section summary per ~900 words of micros → master summary from section summaries. The import path skips the first two phases entirely.

---

## Architecture

No new files. No schema changes. No API endpoint changes. No frontend changes.

| File | Change |
|------|--------|
| `backend/app/api/endpoints.py` | Replace single `generate_master_summary([transcript_text])` call with chunked section summarisation → master summary |
| `backend/tests/test_import.py` | New test file — verify import multilingual behaviour and summarisation path |

---

## Change Details

### 1. Fix `_transcribe_background` summarisation — `endpoints.py`

**Current (broken):**
```python
summary = await _asyncio.to_thread(
    generate_master_summary, [transcript_text], language=language
)
update_lecture_summary_only(lecture_id, summary)
```

**New:**
```python
# Split full transcript into ~1500-word chunks for section summarisation,
# then build master summary from those section summaries — mirrors live path quality.
words = transcript_text.split()
chunk_size = 1500
chunks = [
    " ".join(words[i : i + chunk_size])
    for i in range(0, len(words), chunk_size)
]
# Generate a section summary for each chunk (I/O-bound, run sequentially to
# avoid hammering the API; typical import is 4–8 chunks for a 1-hour lecture).
section_summaries = []
for chunk in chunks:
    sec = await _asyncio.to_thread(
        generate_section_summary, [], language=language, transcript_chunk=chunk
    )
    section_summaries.append(sec)

summary = await _asyncio.to_thread(
    generate_master_summary, section_summaries, language=language
)
update_lecture_summary_only(lecture_id, summary)
```

Wait — `generate_section_summary` currently takes `micro_summaries: list` not a `transcript_chunk`. We need a clean way to pass raw text. Two options:

**Option A (preferred):** Call `generate_master_summary` with the chunks split to ≤1500 words, processed via `summarize_topic_segment` (which already accepts raw transcript text and a title) to produce per-chunk condensed summaries, then feed those into `generate_master_summary`.

**Option B:** Add an optional `transcript_chunk` param to `generate_section_summary`.

**Decision: Option A** — `summarize_topic_segment` already exists precisely for this (it takes raw text, a title, and a topic and produces a condensed summary). No API changes needed.

**Revised new code:**
```python
from app.services.summarization_service import (
    generate_master_summary,
    summarize_topic_segment,
)

words = transcript_text.split()
chunk_size = 1500
chunks = [
    " ".join(words[i : i + chunk_size])
    for i in range(0, len(words), chunk_size)
]

# Summarise each chunk independently, then combine into master summary.
section_summaries = []
for idx, chunk in enumerate(chunks, start=1):
    title = f"Part {idx}"
    sec = await _asyncio.to_thread(
        summarize_topic_segment, chunk, title, topic, language
    )
    section_summaries.append(sec)

summary = await _asyncio.to_thread(
    generate_master_summary, section_summaries, language=language
)
update_lecture_summary_only(lecture_id, summary)
```

Where `topic` is already available in `_transcribe_background` scope (the lecture topic, or `None`).

If `transcript_text` is very short (≤1500 words), `chunks` has one element and `section_summaries` has one entry — the master summary is still called correctly.

---

### 2. Pass `topic` into `_transcribe_background`

Currently the background task receives `(file_bytes, filename, lecture_id, user_id)`. To call `summarize_topic_segment` with the topic, we need it available.

**Option:** Fetch it from the DB inside the background task:
```python
from app.services.supabase_service import get_lecture_full
lecture = get_lecture_full(lecture_id)
topic = lecture.get("topic") if lecture else None
```

This is one extra DB read inside the background task — acceptable since it runs async. No function signature change.

---

### 3. New test file — `backend/tests/test_import.py`

```python
"""Tests for the full-audio import path — multilingual and summarisation quality."""

def test_transcribe_audio_bytes_has_no_language_pin():
    """transcribe_audio_bytes must not accept or pass a language pin to Whisper."""
    import inspect
    from app.services.openai_service import transcribe_audio_bytes
    sig = inspect.signature(transcribe_audio_bytes)
    assert "language" not in sig.parameters, (
        "transcribe_audio_bytes must not have a 'language' parameter — "
        "Whisper should auto-detect per file."
    )

def test_background_task_uses_summarize_topic_segment():
    """_transcribe_background must use summarize_topic_segment for chunked summarisation."""
    import inspect
    from app.api import endpoints
    source = inspect.getsource(endpoints._transcribe_background)
    assert "summarize_topic_segment" in source, (
        "_transcribe_background must call summarize_topic_segment to chunk-summarise "
        "the transcript before passing to generate_master_summary."
    )

def test_background_task_does_not_pass_raw_transcript_to_master_summary():
    """_transcribe_background must not pass [transcript_text] directly to generate_master_summary."""
    import inspect
    from app.api import endpoints
    source = inspect.getsource(endpoints._transcribe_background)
    # The old anti-pattern was: generate_master_summary([transcript_text], ...)
    # After fix, section_summaries list is built first, then passed.
    assert "generate_master_summary([transcript_text]" not in source, (
        "_transcribe_background must not pass raw transcript directly to "
        "generate_master_summary — use chunked summarize_topic_segment first."
    )
```

---

## What This Fixes

| Scenario | Before | After |
|----------|--------|-------|
| Short imported lecture (≤1500 words) | Raw text → master summary (acceptable quality) | 1 chunk → section summary → master summary (same quality) |
| Long imported lecture (1 hour, ~9000 words) | Raw 9000-word text → master summary (poor quality, context risk) | 6 × 1500-word chunks → 6 section summaries → master summary (live-path quality) |
| Mixed-language imported lecture | `_multilingual_instruction()` already applies ✅ | Same ✅ |
| Topic/domain context for summarisation | Lost (not passed) | Available via DB fetch |

---

## Non-Goals

- No changes to `generate_section_summary` or `generate_master_summary` signatures.
- No changes to DB schema or API endpoints.
- No frontend changes.
- No changes to live recording path (already correct).
- No per-chunk DB rows for imported lectures (keeps import simple vs live).
