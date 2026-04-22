# Import Progress Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `summary_status` through the full-audio import path so the frontend knows exactly when transcription and summarisation finish, then only navigates to the lecture page when both are complete.

**Architecture:** `summary_status` column already exists in the DB (used by live sessions). The import path needs to write it at three points: upload start (`'importing'`), after Whisper finishes (`'summarizing'`), after summary saved (`'final'`). `get_lecture_for_summarization` gets `summary_status` added to its SELECT so the polling endpoint returns it. The frontend's polling loop is updated to navigate on `'final'` instead of a fake 800ms timer.

**Tech Stack:** FastAPI (Python), Supabase, React (JSX), axios polling.

---

### Task 1: Backend — wire `summary_status` through import path

**Files:**
- Modify: `backend/app/api/endpoints.py` (~lines 298–363 and ~420–435)
- Modify: `backend/app/services/supabase_service.py` (lines 268–280)
- Test: `backend/tests/test_import_status.py` (create)

**Context:**
- `set_summary_status(lecture_id, status)` already exists in `supabase_service.py` (lines 475–485) and is already imported in `endpoints.py` for the live session path.
- `get_lecture_for_summarization` (lines 268–280) selects a fixed list of columns — `summary_status` is missing.
- `_transcribe_background` (lines 298–363) needs three status writes.
- The `POST /transcribe` endpoint (lines 420–422) creates the lecture record then immediately schedules the background task — needs one status write between those two.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_import_status.py`:

```python
"""Tests for import progress status wiring."""


def test_get_lecture_for_summarization_includes_summary_status():
    """get_lecture_for_summarization must select summary_status column."""
    import inspect
    from app.services.supabase_service import get_lecture_for_summarization

    source = inspect.getsource(get_lecture_for_summarization)
    assert "summary_status" in source, (
        "get_lecture_for_summarization must include 'summary_status' in its SELECT — "
        "the frontend polls GET /lectures/{id} which calls this function."
    )


def test_transcribe_background_sets_importing_status():
    """_transcribe_background must set summary_status='importing' at the start."""
    import inspect
    from app.api import endpoints

    source = inspect.getsource(endpoints._transcribe_background)
    assert "'importing'" in source or '"importing"' in source, (
        "_transcribe_background must call set_summary_status(lecture_id, 'importing') "
        "at the start so the frontend knows transcription is in progress."
    )


def test_transcribe_background_sets_summarizing_status():
    """_transcribe_background must set summary_status='summarizing' after transcript saved."""
    import inspect
    from app.api import endpoints

    source = inspect.getsource(endpoints._transcribe_background)
    assert "'summarizing'" in source or '"summarizing"' in source, (
        "_transcribe_background must call set_summary_status(lecture_id, 'summarizing') "
        "after update_lecture_transcript so the frontend shows 'Generating summary…'."
    )


def test_transcribe_background_sets_final_status():
    """_transcribe_background must set summary_status='final' after summary saved."""
    import inspect
    from app.api import endpoints

    source = inspect.getsource(endpoints._transcribe_background)
    # Count occurrences of 'final' — must appear in _transcribe_background context
    # (it also appears in set_summary_status docstring, so check the bg function source)
    final_count = source.count("'final'") + source.count('"final"')
    assert final_count >= 1, (
        "_transcribe_background must call set_summary_status(lecture_id, 'final') "
        "after update_lecture_summary_only so the frontend knows to navigate."
    )
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_import_status.py -v 2>&1 | head -30
```

Expected: all 4 tests FAIL — `summary_status` not yet in SELECT, status writes not yet added.

- [ ] **Step 3: Add `summary_status` to `get_lecture_for_summarization`**

In `backend/app/services/supabase_service.py`, find `get_lecture_for_summarization` (lines 268–280). Replace the select string to include `summary_status`:

**Before:**
```python
def get_lecture_for_summarization(lecture_id: str):
    """
    Retrieves transcript, summary, language, and analytics for a lecture.
    """
    db = _fresh_db()
    response = db.table("lectures").select(
        "transcript, summary, master_summary, total_sections, last_summarized_length, "
        "total_chunks, total_duration_seconds, title, created_at, language, topic"
    ).eq("id", lecture_id).execute()

    if hasattr(response, 'data') and len(response.data) > 0:
        return response.data[0]
    return None
```

**After:**
```python
def get_lecture_for_summarization(lecture_id: str):
    """
    Retrieves transcript, summary, language, and analytics for a lecture.
    """
    db = _fresh_db()
    response = db.table("lectures").select(
        "transcript, summary, master_summary, total_sections, last_summarized_length, "
        "total_chunks, total_duration_seconds, title, created_at, language, topic, "
        "summary_status"
    ).eq("id", lecture_id).execute()

    if hasattr(response, 'data') and len(response.data) > 0:
        return response.data[0]
    return None
```

- [ ] **Step 4: Add `set_summary_status('importing')` in POST /transcribe**

In `backend/app/api/endpoints.py`, find the POST /transcribe endpoint. After the `save_lecture` call and before `background_tasks.add_task`, add:

**Before (lines ~422–433):**
```python
    try:
        lecture_id = save_lecture(title=title, transcript="", language="en", user_id=str(user.id))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to create lecture")

    # Increment upload counter now (non-reversible — uploading counts even if transcription fails)
    try:
        increment_uploads_this_month(str(user.id))
    except Exception:
        pass

    # Schedule transcription + summarization as a background task (not bound by HTTP timeout)
    background_tasks.add_task(_transcribe_background, file_bytes, filename, lecture_id, str(user.id))
```

**After:**
```python
    try:
        lecture_id = save_lecture(title=title, transcript="", language="en", user_id=str(user.id))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to create lecture")

    # Mark as importing immediately so frontend polling sees the status.
    try:
        set_summary_status(lecture_id, "importing")
    except Exception:
        pass

    # Increment upload counter now (non-reversible — uploading counts even if transcription fails)
    try:
        increment_uploads_this_month(str(user.id))
    except Exception:
        pass

    # Schedule transcription + summarization as a background task (not bound by HTTP timeout)
    background_tasks.add_task(_transcribe_background, file_bytes, filename, lecture_id, str(user.id))
```

- [ ] **Step 5: Add status writes to `_transcribe_background`**

In `backend/app/api/endpoints.py`, replace the full `_transcribe_background` function body with:

```python
async def _transcribe_background(file_bytes: bytes, filename: str, lecture_id: str, user_id: str) -> None:
    """
    Background task: transcribe audio bytes, update the lecture, then summarize.
    Not bound by HTTP timeout — runs until completion or failure.
    """
    # Signal that transcription is starting.
    try:
        set_summary_status(lecture_id, "importing")
    except Exception:
        pass

    try:
        transcript_text, language = await transcribe_audio_bytes(file_bytes, filename)
        update_lecture_transcript(lecture_id, transcript_text, language)
        word_count = len(transcript_text.split())
        estimated_minutes = max(1, word_count // 150)
        try:
            increment_uploads_this_month(user_id, duration_minutes=estimated_minutes)
        except Exception:
            pass
        print(f"[bg_transcribe] done lecture={lecture_id} lang={language} ~{estimated_minutes}min")
    except Exception as e:
        print(f"[bg_transcribe] transcription failed for lecture={lecture_id}: {e}")
        return

    # Transcript saved — signal that summarisation is starting.
    try:
        set_summary_status(lecture_id, "summarizing")
    except Exception:
        pass

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

        # Fetch topic for better section context (non-fatal if unavailable).
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
            # Fallback: if all section summaries failed, pass raw text truncated.
            section_summaries = [transcript_text[:6000]]

        summary = await _asyncio.to_thread(
            generate_master_summary, section_summaries, language=language
        )
        update_lecture_summary_only(lecture_id, summary)
        print(f"[bg_transcribe] summary done lecture={lecture_id} sections={len(section_summaries)}")
    except Exception as e:
        print(f"[bg_transcribe] summarization failed for lecture={lecture_id}: {e}")
        return

    # Everything done — signal frontend to navigate.
    try:
        set_summary_status(lecture_id, "final")
    except Exception:
        pass
```

- [ ] **Step 6: Run tests — all 4 must pass**

```bash
cd backend && python -m pytest tests/test_import_status.py -v 2>&1 | head -30
```

Expected: all 4 tests PASS.

- [ ] **Step 7: Run full suite — no regressions**

```bash
cd backend && python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 8: Commit backend changes**

```bash
cd backend && git add app/api/endpoints.py app/services/supabase_service.py tests/test_import_status.py
git commit -m "feat: wire summary_status through import path — importing/summarizing/final"
```

---

### Task 2: Frontend — poll `summary_status`, navigate on `'final'`

**Files:**
- Modify: `frontend/src/components/ImportModal.jsx` (lines ~140–158)

**Context:**
The polling loop (lines 140–158) currently checks `transcript.length > 10` and then fakes 800ms of "summarising" before navigating. After Task 1, the GET `/api/v1/lectures/{id}` response includes `summary_status`. The frontend should:
- Show "Transcribing…" while `summary_status` is `'importing'` (or null)
- Switch to "Generating summary…" when `summary_status === 'summarizing'`
- Navigate when `summary_status === 'final'`
- Fallback: if `summary_status` is null (old backend), navigate 5s after transcript appears

- [ ] **Step 1: Read the current polling loop**

Read `frontend/src/components/ImportModal.jsx` lines 135–165 to confirm the current while loop before editing.

- [ ] **Step 2: Replace the polling loop**

Find this block in `frontend/src/components/ImportModal.jsx`:

```javascript
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL));
            try {
                const check = await api.get(`/api/v1/lectures/${lectureId}`);
                const transcript = check.data?.transcript;
                if (transcript && transcript.length > 10) {
                    setStage('summarizing');
                    await new Promise(r => setTimeout(r, 800));
                    setStage('done');
                    await new Promise(r => setTimeout(r, 600));
                    navigate(`/lecture/${lectureId}`);
                    return;
                }
            } catch { /* keep polling */ }
        }
```

Replace it with:

```javascript
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL));
            try {
                const check = await api.get(`/api/v1/lectures/${lectureId}`);
                const status = check.data?.summary_status;
                const transcript = check.data?.transcript;

                // Update displayed stage based on backend status.
                if (status === 'summarizing') {
                    setStage('summarizing');
                } else if (!status && transcript && transcript.length > 10) {
                    // Fallback: old backend without summary_status — show summarizing stage.
                    setStage('summarizing');
                }

                // Navigate when backend confirms everything is done.
                if (status === 'final') {
                    setStage('done');
                    await new Promise(r => setTimeout(r, 600));
                    navigate(`/lecture/${lectureId}`);
                    return;
                }

                // Fallback: old backend — navigate 5s after transcript appears
                // (gives summarisation extra time vs the old 800ms fake wait).
                if (!status && transcript && transcript.length > 10) {
                    await new Promise(r => setTimeout(r, 5000));
                    setStage('done');
                    await new Promise(r => setTimeout(r, 600));
                    navigate(`/lecture/${lectureId}`);
                    return;
                }
            } catch { /* keep polling */ }
        }
```

- [ ] **Step 3: Verify the file looks correct**

Read `frontend/src/components/ImportModal.jsx` lines 130–175 to confirm the edit was applied correctly and no syntax errors are visible.

- [ ] **Step 4: Commit frontend changes**

```bash
git add frontend/src/components/ImportModal.jsx
git commit -m "feat: poll summary_status in ImportModal — navigate only when backend confirms 'final'"
```

---

## Self-Review

**Spec coverage:**
- ✅ Task 1 Step 3: `summary_status` added to `get_lecture_for_summarization` SELECT
- ✅ Task 1 Step 4: `set_summary_status('importing')` in POST /transcribe after save_lecture
- ✅ Task 1 Step 5: `_transcribe_background` writes `'importing'` at start, `'summarizing'` after transcript, `'final'` after summary
- ✅ Task 2 Step 2: Frontend polls `summary_status`, navigates on `'final'`, fallback for null status

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:**
- `set_summary_status(lecture_id, "importing"/"summarizing"/"final")` — consistent string literals throughout ✅
- `summary_status` field name consistent across backend SELECT and frontend `check.data?.summary_status` ✅
