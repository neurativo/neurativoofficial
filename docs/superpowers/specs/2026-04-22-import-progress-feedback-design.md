# Import Progress Feedback — Design Spec

**Date:** 2026-04-22
**Goal:** Fix the import lecture UX so the frontend knows exactly when transcription and summarisation finish, and only navigates to the lecture page when both are complete.

---

## Problem

The import background task (`_transcribe_background`) can take 30–90 seconds for a 1-hour lecture (Whisper transcription + 6+ `summarize_topic_segment` calls). The frontend polls every 5 seconds for `transcript.length > 10`, then fakes 800ms of "summarising" and navigates — landing the student on a lecture page with no summary yet.

---

## Architecture

No new DB columns. No new API endpoints. No schema migrations.

| File | Change |
|------|--------|
| `backend/app/services/supabase_service.py` | `save_lecture` writes `summary_status = 'importing'` on creation |
| `backend/app/api/endpoints.py` | `_transcribe_background` writes `'importing'` → `'summarizing'` → `'final'` via `set_summary_status`; `GET /lectures/{id}` includes `summary_status` in response |
| `frontend/src/components/ImportModal.jsx` | Poll for `summary_status` field; navigate only when `'final'` |

---

## Change Details

### 1. `save_lecture` — write initial status

`backend/app/services/supabase_service.py`, `save_lecture()`:

Add `"summary_status": "importing"` to the insert payload so the field is set from the moment the lecture record is created.

**Current insert dict (approximate):**
```python
{
    "title": title,
    "transcript": transcript,
    "language": language,
    "user_id": user_id,
}
```

**New insert dict:**
```python
{
    "title": title,
    "transcript": transcript,
    "language": language,
    "user_id": user_id,
    "summary_status": "importing",
}
```

`set_summary_status` already wraps failures non-fatally, so if the column is missing in production this will fail silently and fall back to the existing behaviour. To be safe, wrap the `summary_status` insert key the same way — or use `set_summary_status` immediately after `save_lecture` in the endpoint. The latter is cleaner:

In `POST /transcribe` endpoint, after `lecture_id = save_lecture(...)`:
```python
try:
    set_summary_status(lecture_id, "importing")
except Exception:
    pass
```

This way `save_lecture` doesn't need to know about `summary_status` and the insert stays clean.

---

### 2. `_transcribe_background` — write status at each phase

`backend/app/api/endpoints.py`, `_transcribe_background`:

Import `set_summary_status` at the top of the function (alongside the existing summarisation imports) and add three status writes:

```
Start of function      → set_summary_status(lecture_id, "importing")
After update_lecture_transcript → set_summary_status(lecture_id, "summarizing")
After update_lecture_summary_only → set_summary_status(lecture_id, "final")
```

All three calls are wrapped in `try/except` (non-fatal) so a missing column never breaks the import.

`set_summary_status` already exists in `supabase_service.py` and is already imported in `endpoints.py` for the live session path.

---

### 3. `GET /api/v1/lectures/{id}` — include `summary_status`

The `/lectures/{id}` endpoint currently calls `get_lecture_for_summarization()` which selects a fixed set of columns that does not include `summary_status`. The frontend polls this endpoint.

Two options:
- **A.** Add `summary_status` to the `get_lecture_for_summarization` query.
- **B.** Add a new lightweight `get_lecture_status(lecture_id)` helper that only fetches `id, summary_status, transcript` — called from a new or existing endpoint.

**Decision: Option A.** `get_lecture_for_summarization` already returns transcript, summary, language etc. Adding `summary_status` to its SELECT list is a one-line change and the existing endpoint already has auth. The frontend already calls this endpoint — no URL change needed.

`backend/app/services/supabase_service.py`, `get_lecture_for_summarization()`:

Add `summary_status` to the select string. If the column doesn't exist (old production DB), Supabase returns it as `null` — the frontend treats `null` as `'importing'` (not yet done).

---

### 4. Frontend — poll `summary_status`, navigate on `'final'`

`frontend/src/components/ImportModal.jsx`, `handleSubmit` polling loop:

**Current logic (broken):**
```javascript
if (transcript && transcript.length > 10) {
    setStage('summarizing');
    await new Promise(r => setTimeout(r, 800));
    setStage('done');
    await new Promise(r => setTimeout(r, 600));
    navigate(`/lecture/${lectureId}`);
    return;
}
```

**New logic:**
```javascript
const status = check.data?.summary_status;
const transcript = check.data?.transcript;

// Update displayed stage based on backend status
if (status === 'summarizing' || (transcript && transcript.length > 10 && !status)) {
    setStage('summarizing');
}
if (status === 'final') {
    setStage('done');
    await new Promise(r => setTimeout(r, 600));
    navigate(`/lecture/${lectureId}`);
    return;
}
// Fallback for old backend without summary_status: navigate on transcript presence
// after a longer wait to give summarisation time to run.
if (!status && transcript && transcript.length > 10) {
    // summary_status not supported — wait longer for summarisation
    await new Promise(r => setTimeout(r, 5000));
    setStage('done');
    await new Promise(r => setTimeout(r, 600));
    navigate(`/lecture/${lectureId}`);
    return;
}
```

The fallback ensures backward compatibility if `summary_status` is `null` (production DB not yet migrated).

---

## Status Flow

```
POST /transcribe
  → save lecture (summary_status = 'importing')  ← student sees "Uploading…"
  → background task starts
      → set_summary_status('importing')           ← student sees "Transcribing…"
      → transcribe_audio_bytes (Whisper)
      → update_lecture_transcript
      → set_summary_status('summarizing')         ← frontend switches to "Generating summary…"
      → summarize_topic_segment × N
      → generate_master_summary
      → update_lecture_summary_only
      → set_summary_status('final')               ← frontend navigates to lecture page
```

---

## What This Fixes

| Scenario | Before | After |
|----------|--------|-------|
| Short import (< 5 min) | Works (transcript + 800ms ≈ summary ready) | Works (navigates on `'final'`) |
| Long import (1 hour) | Navigates before summary exists | Waits for `'final'`, navigates with summary ready |
| No summary_status column (old DB) | Same as before (800ms fake wait) | 5s extended wait as fallback |
| Transcription fails | Times out after 20 min | Times out after 20 min (unchanged) |

---

## Non-Goals

- No WebSocket / SSE push notifications.
- No progress percentage or ETA.
- No changes to the live recording path.
- No new API endpoints.
- No DB migration required (column already exists for live sessions).
