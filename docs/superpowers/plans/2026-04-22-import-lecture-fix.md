# Import Lecture Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the full-audio import path so it produces live-path-quality summaries by chunking the transcript through `summarize_topic_segment` before `generate_master_summary`, and add tests verifying the import path is multilingual-safe.

**Architecture:** `_transcribe_background` in `endpoints.py` is modified to split the transcript into 1500-word chunks, run `summarize_topic_segment` on each (mirrors the live path's section summarisation), then feed the resulting list into `generate_master_summary`. A new test file verifies the corrected behaviour via source inspection.

**Tech Stack:** FastAPI, asyncio.to_thread, OpenAI GPT-4o-mini (via existing summarisation service), pytest.

---

### Task 1: Create test file and write failing tests

**Files:**
- Create: `backend/tests/test_import.py`

- [ ] **Step 1: Create the test file with 3 failing tests**

```python
# backend/tests/test_import.py
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
    assert "generate_master_summary([transcript_text]" not in source, (
        "_transcribe_background must not pass raw transcript directly to "
        "generate_master_summary — use chunked summarize_topic_segment first."
    )
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_import.py -v 2>&1 | head -40
```

Expected output: test 1 should PASS (Whisper already has no pin), tests 2 and 3 should FAIL — that is the correct state before implementation.

- [ ] **Step 3: Commit the test file**

```bash
cd backend && git add tests/test_import.py
git commit -m "test: add failing tests for import lecture summarisation fix"
```

---

### Task 2: Fix `_transcribe_background` summarisation

**Files:**
- Modify: `backend/app/api/endpoints.py:316-328`

The current broken block (lines 316–328 of `endpoints.py`):
```python
    try:
        from app.services.summarization_service import generate_master_summary
        import asyncio as _asyncio
        summary = await _asyncio.to_thread(
            generate_master_summary, [transcript_text], language=language
        )
        update_lecture_summary_only(lecture_id, summary)
        print(f"[bg_transcribe] summary done lecture={lecture_id}")
    except Exception as e:
        print(f"[bg_transcribe] summarization failed for lecture={lecture_id}: {e}")
```

- [ ] **Step 1: Read `endpoints.py` lines 298–330 to confirm current state**

```bash
cd backend && sed -n '298,330p' app/api/endpoints.py
```

Confirm the block above matches what you see before editing.

- [ ] **Step 2: Replace the summarisation block**

Replace the entire `try` block that starts with `# Auto-summarize after transcription completes.` (lines ~316–328) with:

```python
    # Auto-summarize after transcription completes.
    # Chunk the transcript into ~1500-word segments, summarise each via
    # summarize_topic_segment (mirrors the live path's section summarisation),
    # then combine with generate_master_summary for live-path quality.
    try:
        from app.services.summarization_service import (
            generate_master_summary,
            summarize_topic_segment,
        )
        import asyncio as _asyncio

        # Fetch topic for better section titles (non-fatal if unavailable).
        try:
            _lec = get_lecture_full(lecture_id)
            topic = _lec.get("topic") if _lec else None
        except Exception:
            topic = None

        words = transcript_text.split()
        chunk_size = 1500
        chunks = [
            " ".join(words[i : i + chunk_size])
            for i in range(0, max(len(words), 1), chunk_size)
        ]

        section_summaries = []
        for idx, chunk in enumerate(chunks, start=1):
            title = f"Part {idx}"
            try:
                sec = await _asyncio.to_thread(
                    summarize_topic_segment, chunk, title, topic, language
                )
                section_summaries.append(sec)
            except Exception as _e:
                print(f"[bg_transcribe] section {idx} summarisation failed (skipped): {_e}")

        if not section_summaries:
            # Fallback: if all section summaries failed, pass raw text as single chunk.
            section_summaries = [transcript_text[:6000]]

        summary = await _asyncio.to_thread(
            generate_master_summary, section_summaries, language=language
        )
        update_lecture_summary_only(lecture_id, summary)
        print(f"[bg_transcribe] summary done lecture={lecture_id} sections={len(section_summaries)}")
    except Exception as e:
        print(f"[bg_transcribe] summarization failed for lecture={lecture_id}: {e}")
```

Note: `get_lecture_full` is already imported at the top of `endpoints.py` — no new import needed for it.

- [ ] **Step 3: Run the tests to confirm they now pass**

```bash
cd backend && python -m pytest tests/test_import.py -v 2>&1 | head -30
```

Expected: all 3 tests PASS.

- [ ] **Step 4: Run the full test suite to confirm no regressions**

```bash
cd backend && python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: all tests pass, no failures.

- [ ] **Step 5: Commit**

```bash
cd backend && git add app/api/endpoints.py
git commit -m "feat: fix import lecture summarisation — chunk via summarize_topic_segment before master summary"
```

---

## Self-Review

**Spec coverage:**
- ✅ Task 1 covers: new test file with 3 tests (no language pin, uses `summarize_topic_segment`, doesn't pass raw transcript to master summary)
- ✅ Task 2 covers: replace single `generate_master_summary([transcript_text])` call with chunked `summarize_topic_segment` → `generate_master_summary`, topic fetch via DB, fallback if all sections fail

**Placeholder scan:** None found. All code blocks are complete and runnable.

**Type consistency:**
- `summarize_topic_segment(segment_text: str, title: str, topic: str = None, language: str = "en")` — called as `summarize_topic_segment(chunk, title, topic, language)` ✅
- `generate_master_summary(section_summaries, language=language)` — called with a list of strings ✅
- `get_lecture_full(lecture_id)` → returns dict or None, `.get("topic")` is safe ✅
