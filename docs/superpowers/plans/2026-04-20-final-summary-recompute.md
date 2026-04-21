# Final Summary Recompute — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the live triple-compression summary chain with a single definitive recompute pass at session end, sourced directly from the raw transcript, producing 100% accurate, hallucination-free summaries for any subject domain.

**Architecture:** When a session ends, a background job concatenates all raw transcript chunks, runs two focused GPT passes (topic segmentation then per-topic summarization), and saves the definitive master_summary. The live pipeline is untouched. LectureView polls for completion and shows a "Refining summary…" badge while the job runs.

**Tech Stack:** Python/FastAPI, OpenAI gpt-4o-mini, Supabase (PostgreSQL), React/JSX

---

## File Map

| File | Change |
|------|--------|
| `backend/app/services/supabase_service.py` | Add `get_all_chunk_transcripts`, `set_summary_status`; update `get_lecture_full` to include `summary_status` |
| `backend/app/services/summarization_service.py` | Add `import json`; add `segment_transcript()`, `summarize_topic_segment()` |
| `backend/app/services/recompute_service.py` | Create new — orchestrates `recompute_final_summary()` |
| `backend/app/api/endpoints.py` | Wire recompute into session-end endpoint |
| `frontend/src/pages/LectureView.jsx` | Add `summaryStatus` state, polling, "Refining…" badge |
| `backend/tests/test_summarization.py` | Create new — unit tests for all three new service functions |
| Supabase | `ALTER TABLE lectures ADD COLUMN summary_status text DEFAULT 'live'` |

---

### Task 1: Supabase migration + supabase_service.py helpers

**Files:**
- Modify: `backend/app/services/supabase_service.py:452,756`
- Test: `backend/tests/test_summarization.py` (created in Task 6)

- [ ] **Step 1: Run migration in Supabase SQL editor**

Open the Supabase dashboard → SQL editor and run:

```sql
ALTER TABLE lectures ADD COLUMN IF NOT EXISTS summary_status text DEFAULT 'live';
```

Verify it worked:
```sql
SELECT id, summary_status FROM lectures LIMIT 3;
```
Expected: rows show `summary_status = 'live'` (or null for existing rows — the DEFAULT only applies to new inserts, but NULL is treated the same as 'live' in our code).

- [ ] **Step 2: Add `get_all_chunk_transcripts` to supabase_service.py**

Open `backend/app/services/supabase_service.py`. After line 452 (end of `get_unsummarized_chunks`), insert:

```python
def get_all_chunk_transcripts(lecture_id: str) -> list:
    """
    Returns raw transcript text for all chunks ordered by chunk_index.
    Used by the end-of-session recompute pipeline.
    """
    try:
        response = _fresh_db().table("lecture_chunks")\
            .select("transcript")\
            .eq("lecture_id", lecture_id)\
            .order("chunk_index", desc=False)\
            .execute()
        if hasattr(response, 'data'):
            return [row['transcript'] for row in response.data if row.get('transcript')]
    except Exception as e:
        print(f"get_all_chunk_transcripts error: {e}")
    return []


def set_summary_status(lecture_id: str, status: str) -> None:
    """
    Sets summary_status on a lecture.
    Values: 'live' | 'recomputing' | 'final'
    Non-fatal on failure.
    """
    try:
        _fresh_db().table("lectures").update(
            {"summary_status": status}
        ).eq("id", lecture_id).execute()
    except Exception as e:
        print(f"set_summary_status error: {e}")
```

- [ ] **Step 3: Update `get_lecture_full` to include `summary_status`**

In `backend/app/services/supabase_service.py`, find `get_lecture_full` at line 756. Change the select string from:

```python
    response = db.table("lectures").select(
        "id, title, topic, language, transcript, master_summary, summary, "
        "total_chunks, total_sections, total_duration_seconds, created_at, "
        "share_token, share_views"
    ).eq("id", lecture_id).execute()
```

To:

```python
    response = db.table("lectures").select(
        "id, title, topic, language, transcript, master_summary, summary, "
        "total_chunks, total_sections, total_duration_seconds, created_at, "
        "share_token, share_views, summary_status"
    ).eq("id", lecture_id).execute()
```

- [ ] **Step 4: Verify the service still imports cleanly**

```bash
cd D:/neurativoproject/backend
python -c "from app.services.supabase_service import get_all_chunk_transcripts, set_summary_status, get_lecture_full; print('OK')"
```
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/supabase_service.py
git commit -m "feat: add summary_status column + supabase helpers for recompute"
```

---

### Task 2: segment_transcript() in summarization_service.py

**Files:**
- Modify: `backend/app/services/summarization_service.py:1-2,290`

- [ ] **Step 1: Add `import json` at the top of summarization_service.py**

`backend/app/services/summarization_service.py` currently starts with:
```python
import time
import app.services.openai_service as openai_service
```

Change to:
```python
import json
import time
import app.services.openai_service as openai_service
```

- [ ] **Step 2: Append `segment_transcript()` at the end of summarization_service.py**

After line 289 (the last line, `    return master_summary`), add:

```python

# ─────────────────────────────────────────────────────────────────────────────
#  End-of-session recompute — Pass 1: topic segmentation
# ─────────────────────────────────────────────────────────────────────────────

def segment_transcript(full_text: str, topic: str = None) -> list:
    """
    Pass 1 of the end-of-session recompute.
    Sends the full raw transcript to GPT and asks it to identify where topics
    naturally shift, returning a list of {"title", "start", "end"} dicts.

    "start" and "end" are character indices into full_text.
    Falls back to equal thirds if GPT fails or returns unparseable JSON.
    Retries up to 3 times with exponential backoff.
    """
    if not openai_service.client or not full_text.strip():
        return []

    topic_line = (
        f" This is a {topic} lecture." if topic and topic != "general" else ""
    )

    last_err = None
    for attempt in range(3):
        try:
            response = openai_service.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            f"You are analyzing a lecture transcript.{topic_line}"
                            " Identify every distinct topic or subtopic covered.\n\n"
                            "Rules:\n"
                            "- Titles must be specific and descriptive "
                            "(e.g. 'Krebs Cycle — ATP Production', not 'Overview' or 'Section 1')\n"
                            "- A topic shift occurs when the speaker moves to a genuinely new concept, "
                            "not just a new sentence\n"
                            "- Minimum 1 topic, maximum 12 topics\n"
                            "- Every character in the transcript must belong to exactly one topic\n"
                            "- Return ONLY valid JSON, no other text, no markdown fences\n\n"
                            "Return a JSON array:\n"
                            '[{"title": "...", "start": <char_index>, "end": <char_index>}, ...]'
                        )
                    },
                    {"role": "user", "content": full_text}
                ],
                temperature=0.0,
                max_tokens=800,
            )
            log_cost(
                "segment_transcript", "gpt-4o-mini",
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens,
            )
            raw = response.choices[0].message.content.strip()
            # Strip markdown code fences if GPT wraps in them anyway
            if raw.startswith("```"):
                lines = raw.split("\n")
                raw = "\n".join(lines[1:])
                if raw.endswith("```"):
                    raw = raw[:-3].strip()
            segments = json.loads(raw)
            if isinstance(segments, list) and len(segments) > 0:
                return segments
        except Exception as e:
            last_err = e
            if attempt < 2:
                time.sleep(2 ** attempt)

    print(f"segment_transcript error after 3 attempts: {last_err}. Using fallback.")
    # Fallback: split into thirds
    n = len(full_text)
    return [
        {"title": "Part 1", "start": 0,         "end": n // 3},
        {"title": "Part 2", "start": n // 3,     "end": (2 * n) // 3},
        {"title": "Part 3", "start": (2 * n) // 3, "end": n},
    ]
```

- [ ] **Step 3: Verify the file imports cleanly**

```bash
cd D:/neurativoproject/backend
python -c "from app.services.summarization_service import segment_transcript; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/summarization_service.py
git commit -m "feat: add segment_transcript() — Pass 1 of recompute pipeline"
```

---

### Task 3: summarize_topic_segment() in summarization_service.py

**Files:**
- Modify: `backend/app/services/summarization_service.py` (append)

- [ ] **Step 1: Append `summarize_topic_segment()` at the end of summarization_service.py**

After the last line of `segment_transcript()`, add:

```python

# ─────────────────────────────────────────────────────────────────────────────
#  End-of-session recompute — Pass 2: per-topic summarization
# ─────────────────────────────────────────────────────────────────────────────

def summarize_topic_segment(
    segment_text: str,
    title: str,
    topic: str = None,
    language: str = "en",
) -> str:
    """
    Pass 2 of the end-of-session recompute.
    Summarizes one topic segment directly from the raw transcript slice.

    Anti-hallucination rules are baked in: optional sections (blockquote,
    Key concepts, Examples) are ONLY written if the content warrants them.
    Output is compatible with the frontend parseSummary() function.
    Retries up to 3 times with exponential backoff.
    """
    if not openai_service.client or not segment_text.strip():
        return ""

    lang_note  = _language_instruction(language)
    topic_line = (
        f" This is a {topic} lecture."
        f" Use precise {topic} terminology exactly as the speaker used it."
        if topic and topic != "general" else ""
    )

    section_format = (
        "Use exactly this markdown structure for your output "
        "(omit any section that has no content from the transcript):\n\n"
        f"## {title}\n\n"
        "{{One sentence capturing the single most important idea STATED in this section.}}\n\n"
        "{{2-4 sentences explaining what was covered, in the speaker's own terminology.}}\n\n"
        "[Include ONLY if the speaker emphasized a key point, drew a contrast, or stated a conclusion:\n"
        "> {{One sentence restating that point}}]\n\n"
        "[Include ONLY if the speaker named or defined specific terms:\n"
        "Key concepts: `term1`, `term2`, `term3`]\n\n"
        "[Include ONLY if the speaker gave explicit examples:\n"
        "Examples:\n"
        "→ {{example the speaker gave}}]\n\n"
        "---"
    )

    last_err = None
    for attempt in range(3):
        try:
            response = openai_service.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            f"You are summarizing a section of a lecture transcript.{topic_line}"
                            " Your ONLY source is the transcript text provided.\n\n"
                            "STRICT RULES — violations make the summary worthless:\n"
                            "1. Include ONLY information explicitly stated in this transcript. "
                            "Do not add background knowledge, definitions, or context the speaker did not give.\n"
                            "2. Key concepts: only terms the speaker named or defined. "
                            "If a term appears but was not explained, omit it.\n"
                            "3. Examples: only examples the speaker gave. "
                            "If no example was given, omit the Examples section entirely — do not invent one.\n"
                            "4. The blockquote must restate something the speaker actually emphasized. "
                            "If nothing qualifies, omit the blockquote entirely.\n"
                            "5. Write content directly — do not use 'the speaker says' or 'in this section'.\n"
                            "6. No filler phrases: no 'it is important to note', "
                            "'in conclusion', 'as we can see', 'as mentioned above'.\n"
                            "7. Do NOT use **bold**. Use `backticks` for key terms only.\n\n"
                            + section_format
                            + lang_note
                        )
                    },
                    {"role": "user", "content": segment_text}
                ],
                temperature=0.1,
                max_tokens=500,
            )
            log_cost(
                "topic_segment_summary", "gpt-4o-mini",
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            last_err = e
            if attempt < 2:
                time.sleep(2 ** attempt)

    print(f"summarize_topic_segment error after 3 attempts: {last_err}")
    return ""
```

- [ ] **Step 2: Verify the file imports cleanly**

```bash
cd D:/neurativoproject/backend
python -c "from app.services.summarization_service import summarize_topic_segment; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/summarization_service.py
git commit -m "feat: add summarize_topic_segment() — Pass 2 of recompute pipeline"
```

---

### Task 4: recompute_service.py — orchestrator

**Files:**
- Create: `backend/app/services/recompute_service.py`

- [ ] **Step 1: Create the file**

Create `backend/app/services/recompute_service.py`:

```python
"""
recompute_service.py

End-of-session final summary recompute pipeline.

Called as a FastAPI BackgroundTask after a live session ends.
Runs two GPT passes over the full raw transcript:
  Pass 1 — segment_transcript(): detect natural topic boundaries
  Pass 2 — summarize_topic_segment(): summarize each topic directly from transcript

Saves the result to lectures.master_summary and sets summary_status = 'final'.
"""

from app.services.summarization_service import segment_transcript, summarize_topic_segment
from app.services.supabase_service import (
    get_all_chunk_transcripts,
    set_summary_status,
    update_lecture_summary_only,
    get_lecture_language,
    get_lecture_topic,
)


def recompute_final_summary(lecture_id: str) -> None:
    """
    Orchestrates the end-of-session recompute.

    Flow:
    1. Fetch all raw transcript chunks and concatenate.
    2. Pass 1: detect topic segments via segment_transcript().
    3. Pass 2: summarize each segment via summarize_topic_segment().
    4. Assemble and save the definitive master_summary.
    5. Set summary_status = 'final'.

    Always sets summary_status to 'final' even on failure, so the frontend
    stops showing the "Refining…" badge regardless of outcome.
    """
    try:
        language = get_lecture_language(lecture_id) or "en"
        topic    = get_lecture_topic(lecture_id)

        # Step 1: collect raw transcript
        transcripts = get_all_chunk_transcripts(lecture_id)
        if not transcripts:
            print(f"[recompute] {lecture_id}: no chunks found, skipping.")
            set_summary_status(lecture_id, "final")
            return

        full_text = " ".join(transcripts)

        # Step 2: topic segmentation
        segments = segment_transcript(full_text, topic=topic)
        if not segments:
            print(f"[recompute] {lecture_id}: segmentation returned nothing, skipping.")
            set_summary_status(lecture_id, "final")
            return

        # Step 3: per-topic summarization
        topic_summaries = []
        for seg in segments:
            start      = max(0, int(seg.get("start", 0)))
            end        = min(len(full_text), int(seg.get("end", len(full_text))))
            text_slice = full_text[start:end].strip()
            if not text_slice:
                continue
            summary = summarize_topic_segment(
                text_slice,
                title=seg.get("title", "Topic"),
                topic=topic,
                language=language,
            )
            if summary:
                topic_summaries.append(summary)

        if not topic_summaries:
            print(f"[recompute] {lecture_id}: all topic summaries empty, skipping save.")
            set_summary_status(lecture_id, "final")
            return

        # Step 4: assemble and save
        master = "\n\n".join(topic_summaries)
        update_lecture_summary_only(lecture_id, master)
        print(f"[recompute] {lecture_id}: done. {len(topic_summaries)} topics.")

    except Exception as e:
        print(f"[recompute] {lecture_id}: error (non-fatal): {e}")

    finally:
        # Always mark final so the frontend badge clears
        try:
            set_summary_status(lecture_id, "final")
        except Exception as e:
            print(f"[recompute] {lecture_id}: could not set final status: {e}")
```

- [ ] **Step 2: Verify the module imports cleanly**

```bash
cd D:/neurativoproject/backend
python -c "from app.services.recompute_service import recompute_final_summary; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/recompute_service.py
git commit -m "feat: add recompute_service — orchestrates end-of-session summary recompute"
```

---

### Task 5: Wire recompute into endpoints.py

**Files:**
- Modify: `backend/app/api/endpoints.py:21-79,994-1044`

- [ ] **Step 1: Add new imports to endpoints.py**

In `backend/app/api/endpoints.py`, find the summarization_service import block at lines 21–25:

```python
from app.services.summarization_service import (
    generate_micro_summary,
    generate_section_summary,
    generate_master_summary,
)
```

Add `recompute_service` import after it:

```python
from app.services.summarization_service import (
    generate_micro_summary,
    generate_section_summary,
    generate_master_summary,
)
from app.services.recompute_service import recompute_final_summary
```

Also add `set_summary_status` to the supabase_service import block (lines 28–79). The block currently ends with `get_visual_frames_in_window,`. Add `set_summary_status` before the closing `)`:

```python
    get_visual_frames_in_window,
    set_summary_status,
)
```

- [ ] **Step 2: Update `end_session_endpoint` to fire the recompute**

In `backend/app/api/endpoints.py`, find `end_session_endpoint` at line 994. The function currently ends with:

```python
        # Purge chunks older than 30 days (completed lectures only) in background
        background_tasks.add_task(cleanup_old_chunks, 30)

        return {"status": "ended", "lecture_id": lecture_id}
```

Change those last three lines to:

```python
        # Purge chunks older than 30 days (completed lectures only) in background
        background_tasks.add_task(cleanup_old_chunks, 30)

        # Kick off definitive recompute from raw transcript
        set_summary_status(lecture_id, "recomputing")
        background_tasks.add_task(recompute_final_summary, lecture_id)

        return {"status": "ended", "lecture_id": lecture_id}
```

- [ ] **Step 3: Run tests to verify nothing broke**

```bash
cd D:/neurativoproject/backend
python -m pytest backend/tests/ --tb=short -q 2>&1 | tail -10
```
Expected: all existing tests pass (12 passed).

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/endpoints.py
git commit -m "feat: fire recompute_final_summary as background task on session end"
```

---

### Task 6: Tests for new service functions

**Files:**
- Create: `backend/tests/test_summarization.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_summarization.py`:

```python
import json
import pytest
from unittest.mock import MagicMock, patch


def _make_chat_response(content: str, prompt_tokens: int = 10, completion_tokens: int = 20):
    """Helper: fake openai ChatCompletion response."""
    resp = MagicMock()
    resp.choices = [MagicMock()]
    resp.choices[0].message.content = content
    resp.usage.prompt_tokens     = prompt_tokens
    resp.usage.completion_tokens = completion_tokens
    return resp


# ─────────────────────────────────────────────────────────────────────────────
# segment_transcript
# ─────────────────────────────────────────────────────────────────────────────

def test_segment_transcript_returns_parsed_json():
    """segment_transcript returns a list of dicts when GPT returns valid JSON."""
    fake_segments = [
        {"title": "Krebs Cycle", "start": 0, "end": 500},
        {"title": "Electron Transport Chain", "start": 500, "end": 1000},
    ]
    fake_response = _make_chat_response(json.dumps(fake_segments))

    with patch("app.services.openai_service.client") as mock_client, \
         patch("app.services.summarization_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_response
        from app.services.summarization_service import segment_transcript
        result = segment_transcript("some transcript text about biology")

    assert isinstance(result, list)
    assert len(result) == 2
    assert result[0]["title"] == "Krebs Cycle"
    assert result[1]["start"] == 500


def test_segment_transcript_strips_markdown_fences():
    """segment_transcript handles GPT wrapping JSON in ```json ... ``` fences."""
    fake_segments = [{"title": "Topic A", "start": 0, "end": 100}]
    fenced = f"```json\n{json.dumps(fake_segments)}\n```"
    fake_response = _make_chat_response(fenced)

    with patch("app.services.openai_service.client") as mock_client, \
         patch("app.services.summarization_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_response
        from app.services.summarization_service import segment_transcript
        result = segment_transcript("text")

    assert result[0]["title"] == "Topic A"


def test_segment_transcript_falls_back_to_thirds_on_error():
    """segment_transcript returns equal-thirds fallback when GPT raises an exception."""
    with patch("app.services.openai_service.client") as mock_client, \
         patch("app.services.summarization_service.log_cost"), \
         patch("time.sleep"):
        mock_client.chat.completions.create.side_effect = Exception("API down")
        from app.services.summarization_service import segment_transcript
        result = segment_transcript("a" * 300)

    assert len(result) == 3
    assert result[0]["start"] == 0
    assert result[2]["end"] == 300


# ─────────────────────────────────────────────────────────────────────────────
# summarize_topic_segment
# ─────────────────────────────────────────────────────────────────────────────

def test_summarize_topic_segment_returns_string():
    """summarize_topic_segment returns the GPT content as a stripped string."""
    expected = "## Photosynthesis\n\nLeaf cells convert sunlight to glucose.\n\n---"
    fake_response = _make_chat_response(f"  {expected}  ")

    with patch("app.services.openai_service.client") as mock_client, \
         patch("app.services.summarization_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_response
        from app.services.summarization_service import summarize_topic_segment
        result = summarize_topic_segment("raw transcript text", title="Photosynthesis")

    assert result == expected


def test_summarize_topic_segment_injects_title_into_prompt():
    """The section title is included in the system prompt sent to GPT."""
    captured = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        return _make_chat_response("## My Title\n\nContent.\n\n---")

    with patch("app.services.openai_service.client") as mock_client, \
         patch("app.services.summarization_service.log_cost"):
        mock_client.chat.completions.create.side_effect = fake_create
        from app.services.summarization_service import summarize_topic_segment
        summarize_topic_segment("text", title="My Title")

    system_prompt = captured["messages"][0]["content"]
    assert "My Title" in system_prompt


def test_summarize_topic_segment_returns_empty_on_blank_input():
    """summarize_topic_segment returns '' without calling GPT if text is blank."""
    with patch("app.services.openai_service.client") as mock_client:
        mock_client.chat.completions.create.side_effect = AssertionError("should not be called")
        from app.services.summarization_service import summarize_topic_segment
        result = summarize_topic_segment("   ", title="Whatever")

    assert result == ""


# ─────────────────────────────────────────────────────────────────────────────
# recompute_final_summary
# ─────────────────────────────────────────────────────────────────────────────

def test_recompute_final_summary_saves_master_and_sets_final():
    """Full happy path: chunks → segments → summaries → saved, status='final'."""
    fake_segments = [
        {"title": "Topic A", "start": 0,  "end": 10},
        {"title": "Topic B", "start": 10, "end": 20},
    ]
    saved = {}

    with patch("app.services.recompute_service.get_lecture_language", return_value="en"), \
         patch("app.services.recompute_service.get_lecture_topic", return_value="biology"), \
         patch("app.services.recompute_service.get_all_chunk_transcripts",
               return_value=["hello world", "foo bar"]), \
         patch("app.services.recompute_service.segment_transcript",
               return_value=fake_segments), \
         patch("app.services.recompute_service.summarize_topic_segment",
               side_effect=lambda text, title, **kw: f"## {title}\n\nSummary.\n\n---"), \
         patch("app.services.recompute_service.update_lecture_summary_only",
               side_effect=lambda lid, master: saved.update({"master": master})), \
         patch("app.services.recompute_service.set_summary_status",
               side_effect=lambda lid, status: saved.update({"status": status})):
        from app.services.recompute_service import recompute_final_summary
        recompute_final_summary("lecture-123")

    assert saved["status"] == "final"
    assert "## Topic A" in saved["master"]
    assert "## Topic B" in saved["master"]


def test_recompute_final_summary_sets_final_even_when_no_chunks():
    """If no chunks exist, status still becomes 'final' (no crash)."""
    status_set = {}

    with patch("app.services.recompute_service.get_lecture_language", return_value="en"), \
         patch("app.services.recompute_service.get_lecture_topic", return_value=None), \
         patch("app.services.recompute_service.get_all_chunk_transcripts", return_value=[]), \
         patch("app.services.recompute_service.set_summary_status",
               side_effect=lambda lid, s: status_set.update({"status": s})):
        from app.services.recompute_service import recompute_final_summary
        recompute_final_summary("lecture-empty")

    assert status_set["status"] == "final"
```

- [ ] **Step 2: Run tests to verify they fail (TDD — no implementation yet)**

```bash
cd D:/neurativoproject/backend
python -m pytest backend/tests/test_summarization.py -v 2>&1 | tail -20
```
Expected: some tests PASS (the ones testing existing functions), new ones PASS or FAIL depending on whether imports resolve. All should pass since the functions were added in Tasks 2–4.

- [ ] **Step 3: Run full test suite**

```bash
cd D:/neurativoproject/backend
python -m pytest backend/tests/ --tb=short -q 2>&1 | tail -10
```
Expected: all tests pass (12 existing + new tests).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_summarization.py
git commit -m "test: add unit tests for segment_transcript, summarize_topic_segment, recompute_final_summary"
```

---

### Task 7: LectureView.jsx — "Refining summary…" badge + polling

**Files:**
- Modify: `frontend/src/pages/LectureView.jsx`

The LectureView component is at `frontend/src/pages/LectureView.jsx`. Key lines to know:
- Line 432: `const [lecture, setLecture] = useState(null);`
- Line 453–458: `useEffect` that fetches `/api/v1/lectures/${id}/full` on mount
- Line 471: end of the last `useEffect` related to data loading
- The tab bar renders a button for "Summary" — find it by searching for `setActiveTab('summary')`

- [ ] **Step 1: Add `summaryStatus` state**

In `frontend/src/pages/LectureView.jsx`, find line 432:
```jsx
    const [lecture, setLecture]         = useState(null);
```

Add the new state on the next line:
```jsx
    const [lecture, setLecture]         = useState(null);
    const [summaryStatus, setSummaryStatus] = useState('live');
```

- [ ] **Step 2: Update the initial fetch to read summary_status**

Find the useEffect at lines 453–458:
```jsx
    useEffect(() => {
        api.get(`/api/v1/lectures/${id}/full`)
            .then(res => setLecture(res.data))
            .catch(() => navigate('/app'))
            .finally(() => setLoading(false));
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
```

Change to:
```jsx
    useEffect(() => {
        api.get(`/api/v1/lectures/${id}/full`)
            .then(res => {
                setLecture(res.data);
                setSummaryStatus(res.data.summary_status || 'live');
            })
            .catch(() => navigate('/app'))
            .finally(() => setLoading(false));
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Add polling useEffect**

After the useEffect from Step 2 (after line 458), insert:

```jsx
    // Poll every 3s while summary is being recomputed; stop when final
    useEffect(() => {
        if (summaryStatus !== 'recomputing') return;
        const interval = setInterval(() => {
            api.get(`/api/v1/lectures/${id}/full`)
                .then(res => {
                    if ((res.data.summary_status || 'live') !== 'recomputing') {
                        setLecture(res.data);
                        setSummaryStatus(res.data.summary_status || 'final');
                    }
                })
                .catch(() => {});
        }, 3000);
        return () => clearInterval(interval);
    }, [summaryStatus, id]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Add "Refining summary…" badge in the Summary tab button**

Find the Summary tab button. Search for `setActiveTab('summary')`. It will look like:
```jsx
<button className={`lv-tab${activeTab === 'summary' ? ' active' : ''}`} onClick={() => setActiveTab('summary')}>Summary</button>
```

Change to:
```jsx
<button className={`lv-tab${activeTab === 'summary' ? ' active' : ''}`} onClick={() => setActiveTab('summary')}>
    Summary{summaryStatus === 'recomputing' && <span style={{ fontSize: 11, color: 'var(--color-muted)', fontStyle: 'italic', fontWeight: 400, marginLeft: 5 }}>· Refining…</span>}
</button>
```

- [ ] **Step 5: Verify the app builds without errors**

```bash
cd D:/neurativoproject/frontend
npm run build 2>&1 | tail -15
```
Expected: build completes with no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/LectureView.jsx
git commit -m "feat: show Refining summary badge and poll until recompute completes"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| session end fires background recompute | Task 5 |
| fetch full raw transcript | Task 4 (`get_all_chunk_transcripts`) |
| Pass 1: topic segmentation via GPT | Task 2 |
| Pass 2: per-topic summarization from transcript | Task 3 |
| anti-hallucination rules in prompts | Task 3 (prompt) |
| JSON fallback on segmentation failure | Task 2 (fallback to thirds) |
| summary_status column | Task 1 |
| set_summary_status helper | Task 1 |
| get_lecture_full includes summary_status | Task 1 |
| LectureView reads summary_status | Task 7 |
| "Refining summary…" badge | Task 7 |
| polling until final | Task 7 |
| always sets final even on error | Task 4 (finally block) |
| unit tests for segment_transcript | Task 6 |
| unit tests for summarize_topic_segment | Task 6 |
| unit tests for recompute_final_summary | Task 6 |

All spec requirements covered. No placeholders. No TBDs.
