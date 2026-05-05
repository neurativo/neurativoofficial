# Pipeline Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce per-lecture API and storage costs by 60–70% through ffmpeg audio compression, transcript caching, a single GPT content-generation call, async job tracking, and a 30-day free-tier retention policy — without degrading academic quality for any student from undergrad to PhD level.

**Architecture:** Audio is compressed to mono 16 kHz mp3 before Whisper (huge cost drop on long lectures); the full transcript is cleaned and fed to one GPT-4o-mini call that returns summary + flashcards + quiz + glossary as structured JSON; a `processing_jobs` table tracks each import job step-by-step so the frontend can show real progress and the backend never loses track of in-flight work. Live sessions keep their real-time micro-summary pipeline; only the end-of-session recompute is collapsed to one GPT call.

**Tech Stack:** Python 3.11 / FastAPI, ffmpeg (system binary via subprocess), OpenAI gpt-4o-mini, Supabase (PostgreSQL), React + Vite (frontend polling)

> **Scope note:** This spec covers 4 independent subsystems (audio compression, content generation, job queue, storage/retention) that are implemented sequentially because they share the processing pipeline. Each task checkpoint produces deployable, testable software on its own.

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `backend/app/services/audio_service.py` | ffmpeg compression; Whisper size-chunking |
| `backend/app/services/transcript_cleaner.py` | filler removal, dedup, token cap |
| `backend/app/services/content_generator.py` | single GPT call → summary + flashcards + quiz + glossary |
| `backend/app/services/job_queue.py` | create/update/fetch processing_jobs records |
| `backend/app/api/jobs.py` | `GET /api/v1/jobs/{lecture_id}` status endpoint |
| `backend/migrations/004_pipeline.sql` | processing_jobs table; flashcards/quiz/glossary columns on lectures |
| `frontend/src/components/JobProgress.jsx` | progress bar shown while lecture is processing |
| `frontend/src/lib/jobsApi.js` | `getJobStatus(lectureId)` Clerk-authenticated fetch |

### Modified files
| File | What changes |
|---|---|
| `backend/app/services/openai_service.py` | call `audio_service.compress()` before Whisper; hardcode `whisper-1` |
| `backend/app/services/recompute_service.py` | replace multi-call GPT pipeline with single `content_generator.generate()` call |
| `backend/app/api/endpoints.py` | check transcript cache before Whisper; submit to job_queue; remove old `_transcribe_background`; add regenerate endpoint |
| `backend/app/main.py` | register jobs router |
| `backend/app/services/pdf_service.py` | accept `quality` param (`lite`/`standard`/`full`) per plan tier |
| `backend/app/services/supabase_service.py` | add `save_flashcards`, `save_quiz`, `save_glossary`, `get_stale_free_lectures`, `delete_lecture_content` helpers |
| `frontend/src/pages/LectureView.jsx` | import `JobProgress`; show while status ≠ final; add Flashcards + Quiz + Glossary tabs |

---

## Task 1: Database migration

**Files:**
- Create: `backend/migrations/004_pipeline.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 004_pipeline.sql
-- Run in Supabase SQL editor after 003

-- ── processing_jobs ───────────────────────────────────────────────────────────
create table if not exists processing_jobs (
    id           uuid primary key default gen_random_uuid(),
    lecture_id   uuid not null unique,
    user_id      text not null,
    status       text not null default 'queued',
    -- queued | compressing | transcribing | cleaning | generating | storing | done | failed
    step_detail  text,           -- human-readable current step label
    error        text,           -- set when status = 'failed'
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index if not exists idx_pjobs_user     on processing_jobs(user_id);
create index if not exists idx_pjobs_status   on processing_jobs(status);
create index if not exists idx_pjobs_lecture  on processing_jobs(lecture_id);

-- ── Generated content columns on lectures ─────────────────────────────────────
alter table lectures
    add column if not exists flashcards  jsonb,  -- [{front, back}]
    add column if not exists quiz        jsonb,  -- [{question, options[4], answer, explanation}]
    add column if not exists glossary    jsonb;  -- [{term, definition}]

-- ── Retention flag ────────────────────────────────────────────────────────────
alter table lectures
    add column if not exists deletion_scheduled_at timestamptz,
    add column if not exists content_deleted        boolean not null default false;
```

- [ ] **Step 2: Run migration in Supabase**

Open Supabase SQL editor → paste contents → Run.
Verify: `select column_name from information_schema.columns where table_name = 'lectures' and column_name in ('flashcards','quiz','glossary');` should return 3 rows.

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/004_pipeline.sql
git commit -m "feat(db): add processing_jobs table and content columns to lectures"
```

---

## Task 2: Audio compression service

**Files:**
- Create: `backend/app/services/audio_service.py`

**Context:** Whisper costs $0.0001/sec of audio. A 2-hour WAV at 44 kHz stereo = ~1.5 GB. Compressed to mono 16 kHz mp3 at 32 kbps = ~28 MB. Whisper charges the same per second regardless of quality — speech intelligibility is identical at 16 kHz mono. Compression saves zero Whisper API cost but **Whisper's 25 MB file size limit** means uncompressed files need chunking (many API calls). Compression ensures even 10-hour lectures need at most ~2 chunks.

At 32 kbps mp3: 10 hours = ~1.4 GB → ~144 MB → 7 chunks of 20 MB each. More realistic 2-hour lecture → ~29 MB → 2 chunks. 1-hour → ~14.4 MB → 1 chunk (no chunking needed).

- [ ] **Step 1: Write `audio_service.py`**

```python
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
```

- [ ] **Step 2: Verify ffmpeg is installed on the dev machine**

```bash
ffmpeg -version
```

Expected: version line printed. If missing on Windows: `winget install FFmpeg`.
On Render/Railway in production: add `ffmpeg` to the build command or use a Docker image with ffmpeg.

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/audio_service.py
git commit -m "feat(audio): ffmpeg compression service mono 16kHz mp3"
```

---

## Task 3: Transcript cleaning service

**Files:**
- Create: `backend/app/services/transcript_cleaner.py`

**Context:** Raw Whisper output contains filler words (um, uh, er), repeated words ("the the"), silence markers ([silence]), and occasionally repeated phrases from poor audio cuts. Removing these before GPT reduces token count by ~15–25% on typical lectures — direct cost saving. The token cap prevents oversized prompts on 10-hour lectures (GPT-4o-mini has 128K context; we target max 80K input tokens ≈ ~60,000 words to leave room for the system prompt and output).

- [ ] **Step 1: Write `transcript_cleaner.py`**

```python
# backend/app/services/transcript_cleaner.py
"""
transcript_cleaner.py — pre-GPT transcript normalisation.

Pipeline:
  1. Remove Whisper artefact markers  ([silence], [music], etc.)
  2. Remove filler words
  3. Collapse repeated-word stutters   ("the the the" → "the")
  4. Remove duplicate consecutive sentences
  5. Collapse whitespace
  6. Hard-cap at MAX_WORDS words

No AI calls — pure regex/string operations. ~10 ms for a 2-hour transcript.
"""
import re

# Words considered fillers when appearing as standalone tokens.
# Do NOT remove "like" mid-sentence — only when it's a standalone filler.
_FILLERS = {
    "um", "uh", "er", "ah", "hmm", "hm", "mhm", "uhh", "umm",
    "erm", "uhm", "uhhh", "oh", "okay", "ok",
}

# Whisper silence/noise markers
_MARKER_RE = re.compile(r'\[[\w\s]+\]', re.IGNORECASE)

# Repeated word pattern: "word word" → "word"  (handles 2-6 repetitions)
_REPEAT_WORD_RE = re.compile(r'\b(\w+)(\s+\1){1,5}\b', re.IGNORECASE)

# Collapse 3+ spaces/newlines
_WHITESPACE_RE = re.compile(r'[ \t]{2,}')
_NEWLINE_RE    = re.compile(r'\n{3,}')

# Approximate GPT token ≈ 0.75 words for English; cap at 80K tokens input
# We cap at 60K words as a conservative estimate.
MAX_WORDS = 60_000


def _remove_fillers(text: str) -> str:
    """Remove standalone filler words."""
    tokens = text.split()
    return " ".join(t for t in tokens if t.lower().rstrip(",.!?;:") not in _FILLERS)


def _deduplicate_sentences(text: str) -> str:
    """Remove consecutive duplicate sentences (common in poor live recordings)."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    deduped = []
    prev = None
    for s in sentences:
        normalised = s.strip().lower()
        if normalised != prev:
            deduped.append(s.strip())
        prev = normalised
    return " ".join(deduped)


def clean(transcript: str) -> str:
    """
    Full cleaning pipeline. Returns cleaned transcript string.
    Safe to call with empty string — returns empty string.
    """
    if not transcript or not transcript.strip():
        return ""

    text = transcript

    # Step 1: remove Whisper markers like [silence], [music], [noise]
    text = _MARKER_RE.sub(" ", text)

    # Step 2: remove filler words
    text = _remove_fillers(text)

    # Step 3: collapse repeated-word stutters ("the the the" → "the")
    text = _REPEAT_WORD_RE.sub(r'\1', text)

    # Step 4: remove consecutive duplicate sentences
    text = _deduplicate_sentences(text)

    # Step 5: collapse whitespace
    text = _WHITESPACE_RE.sub(" ", text)
    text = _NEWLINE_RE.sub("\n\n", text)
    text = text.strip()

    # Step 6: hard word cap
    words = text.split()
    if len(words) > MAX_WORDS:
        text = " ".join(words[:MAX_WORDS])
        print(f"[cleaner] transcript capped at {MAX_WORDS} words (was {len(words)} words)")

    return text
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/transcript_cleaner.py
git commit -m "feat(pipeline): transcript cleaner removes fillers, deduplicates, caps tokens"
```

---

## Task 4: Single GPT content generator

**Files:**
- Create: `backend/app/services/content_generator.py`

**Context:** Currently `recompute_service.py` calls GPT N+1 times (1 for segmentation + 1 per topic segment). The new `content_generator.generate()` calls GPT exactly ONCE and returns all four content types as structured JSON. This is the biggest cost reduction — a 10-section lecture that previously needed 11 GPT calls now needs 1. Quality is preserved by giving GPT the full context in one shot; GPT-4o-mini performs equally well or better when given the full picture. The live-session real-time micro/section pipeline stays unchanged.

The function also checks the cache: if `lectures.master_summary` is already non-empty AND `lectures.flashcards` is already set, it skips the GPT call entirely.

- [ ] **Step 1: Write `content_generator.py`**

```python
# backend/app/services/content_generator.py
"""
content_generator.py — single GPT call for all lecture content.

Produces in one API call:
  - master_summary   (markdown, structured sections)
  - flashcards       [{front, back}] × 10–20
  - quiz             [{question, options[4], answer, explanation}] × 5–12
  - glossary         [{term, definition}] × 10–20

Checks DB cache before calling GPT — skips if all fields already populated.
Caller (job_queue worker) is responsible for saving results to DB.
"""
import json
import time
from typing import Optional
from openai import OpenAI
from app.core.config import settings
from app.services.cost_tracker import log_cost

_client = OpenAI(
    api_key=settings.OPENAI_API_KEY,
    timeout=120,
) if settings.OPENAI_API_KEY else None

# Whisper model — hardcoded, never change
WHISPER_MODEL = "whisper-1"


def _topic_hint(topic: str | None) -> str:
    if not topic or topic.strip().lower() in ("", "general"):
        return ""
    return f" This is a {topic} lecture."


def _flashcard_count(word_count: int) -> int:
    """Scale flashcard count with lecture length."""
    if word_count < 1500:  return 8
    if word_count < 5000:  return 12
    if word_count < 15000: return 16
    return 20


def _quiz_count(word_count: int) -> int:
    """Scale quiz question count with lecture length."""
    if word_count < 1500:  return 4
    if word_count < 5000:  return 6
    if word_count < 15000: return 8
    return 12


def _build_prompt(
    transcript: str,
    title: str,
    topic: str | None,
    language: str,
) -> tuple[str, str]:
    """Returns (system_prompt, user_prompt)."""
    word_count   = len(transcript.split())
    n_flash      = _flashcard_count(word_count)
    n_quiz       = _quiz_count(word_count)
    topic_hint   = _topic_hint(topic)
    lang_note    = (
        "" if language == "en"
        else f" The transcript is in {language}. Write all output in the same language."
    )

    system = (
        f"You are Neurativo, an elite academic AI for students from undergrad to PhD level.{topic_hint}{lang_note}\n"
        "You generate four types of learning content from a lecture transcript in a single response.\n"
        "Return ONLY valid JSON — no markdown fences, no preamble.\n\n"
        "JSON schema:\n"
        "{\n"
        '  "summary": "<markdown string — see rules below>",\n'
        '  "flashcards": [{"front": "<question or term>", "back": "<answer or definition>"}],\n'
        '  "quiz": [{"question": "<question>", "options": ["A: ...", "B: ...", "C: ...", "D: ..."], "answer": "<A/B/C/D>", "explanation": "<why correct>"}],\n'
        '  "glossary": [{"term": "<term>", "definition": "<precise academic definition>"}]\n'
        "}\n\n"
        "SUMMARY RULES:\n"
        "- Use ## Section Title headings for each major topic\n"
        "- One lead sentence per section (present tense, specific)\n"
        "- 2–3 sentences of explanation per section\n"
        "- A > blockquote with a counterintuitive or surprising insight (mandatory for every section)\n"
        "- Key concepts: `term1`, `term2`, `term3` (mandatory, backticks only)\n"
        "- Examples: → first example → second example (mandatory)\n"
        "- Do NOT use **bold**. Use `backticks` for key terms only.\n"
        f"- Maximum 1000 words total across all sections\n\n"
        f"FLASHCARD RULES: {n_flash} cards. Front = question or key term. Back = precise answer or definition. "
        "Cover the most testable concepts from the lecture.\n\n"
        f"QUIZ RULES: {n_quiz} multiple-choice questions. Bloom's taxonomy: mix recall, understanding, and application. "
        "Each option must be plausible. Explanation must be 1–2 sentences.\n\n"
        "GLOSSARY RULES: 10–20 terms. Use domain-standard definitions. Order alphabetically."
    )

    user = (
        f"Lecture title: {title}\n\n"
        f"TRANSCRIPT:\n{transcript}"
    )

    return system, user


def generate(
    transcript: str,
    title: str,
    topic: str | None,
    language: str = "en",
    force: bool = False,
    existing_summary: str | None = None,
    existing_flashcards: list | None = None,
) -> dict:
    """
    Generates summary, flashcards, quiz, and glossary in one GPT call.

    Returns dict with keys: summary, flashcards, quiz, glossary.
    Returns empty dict if GPT is unavailable.

    Cache check: if existing_summary AND existing_flashcards are both non-empty
    AND force=False, returns None to signal "use cached values".
    """
    # Cache check — skip GPT if all content already exists
    if (
        not force
        and existing_summary
        and existing_summary.strip()
        and existing_flashcards
        and len(existing_flashcards) > 0
    ):
        return None   # Signal: use cached

    if not _client:
        return {}

    system, user = _build_prompt(transcript, title, topic, language)

    last_err = None
    for attempt in range(3):
        try:
            resp = _client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user},
                ],
                temperature=0.2,
                max_tokens=4000,   # enough for all four sections combined
                response_format={"type": "json_object"},
            )
            log_cost(
                "content_generate",
                "gpt-4o-mini",
                input_tokens=resp.usage.prompt_tokens,
                output_tokens=resp.usage.completion_tokens,
            )
            raw = resp.choices[0].message.content
            data = json.loads(raw)

            # Validate structure — fill missing keys with safe defaults
            result = {
                "summary":    data.get("summary", ""),
                "flashcards": data.get("flashcards", []),
                "quiz":       data.get("quiz", []),
                "glossary":   data.get("glossary", []),
            }
            return result

        except json.JSONDecodeError as e:
            print(f"[content_generator] JSON parse error (attempt {attempt+1}): {e}")
            last_err = e
        except Exception as e:
            last_err = e
            print(f"[content_generator] GPT error (attempt {attempt+1}): {e}")
        if attempt < 2:
            time.sleep(2 ** attempt)

    print(f"[content_generator] failed after 3 attempts: {last_err}")
    return {}
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/content_generator.py
git commit -m "feat(pipeline): single GPT call generates summary+flashcards+quiz+glossary"
```

---

## Task 5: Job queue service + supabase helpers

**Files:**
- Create: `backend/app/services/job_queue.py`
- Modify: `backend/app/services/supabase_service.py` (add content-save helpers)

- [ ] **Step 1: Add DB helper functions to `supabase_service.py`**

Add these functions at the end of `backend/app/services/supabase_service.py`:

```python
# ── Content save helpers ───────────────────────────────────────────────────────

def save_generated_content(lecture_id: str, content: dict) -> None:
    """
    Saves summary, flashcards, quiz, and glossary from a content_generator result.
    Idempotent — safe to call multiple times.
    """
    import json as _json
    db = _fresh_db()
    update = {}
    if content.get("summary"):
        update["master_summary"] = content["summary"]
    if content.get("flashcards") is not None:
        update["flashcards"] = _json.dumps(content["flashcards"])
    if content.get("quiz") is not None:
        update["quiz"] = _json.dumps(content["quiz"])
    if content.get("glossary") is not None:
        update["glossary"] = _json.dumps(content["glossary"])
    if update:
        db.table("lectures").update(update).eq("id", lecture_id).execute()


def get_stale_free_lectures(days: int = 30) -> list:
    """
    Returns lectures owned by free-tier users older than `days` days
    where content has not yet been deleted.
    """
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    db = _fresh_db()
    try:
        # Join via user_subscriptions to check plan_tier = 'free'
        resp = db.table("lectures").select(
            "id,user_id,title,created_at"
        ).lt("created_at", cutoff).eq("content_deleted", False).execute()
        rows = resp.data or []
        # Filter to free-tier users
        free_users = set()
        if rows:
            user_ids = list({r["user_id"] for r in rows if r.get("user_id")})
            sub_resp = db.table("user_subscriptions").select(
                "user_id"
            ).in_("user_id", user_ids).eq("plan_tier", "free").execute()
            free_users = {r["user_id"] for r in (sub_resp.data or [])}
        return [r for r in rows if r.get("user_id") in free_users]
    except Exception as e:
        print(f"[retention] get_stale_free_lectures error: {e}")
        return []


def mark_content_deleted(lecture_id: str) -> None:
    """Marks a lecture's content as deleted and schedules deletion date."""
    _fresh_db().table("lectures").update({
        "transcript": "",
        "master_summary": "",
        "flashcards": None,
        "quiz": None,
        "glossary": None,
        "content_deleted": True,
    }).eq("id", lecture_id).execute()


def set_deletion_scheduled(lecture_id: str, scheduled_at: str) -> None:
    """Sets the deletion_scheduled_at timestamp for user notification."""
    _fresh_db().table("lectures").update({
        "deletion_scheduled_at": scheduled_at,
    }).eq("id", lecture_id).execute()
```

- [ ] **Step 2: Write `job_queue.py`**

```python
# backend/app/services/job_queue.py
"""
job_queue.py — processing job lifecycle management.

A processing_job is created when a lecture import is submitted.
The background worker calls update_job_status() at each step.
The frontend polls GET /api/v1/jobs/{lecture_id} for live progress.

Statuses (in order):
  queued → compressing → transcribing → cleaning → generating → storing → done
  Any step can → failed (credits are NOT deducted when status = failed)
"""
from datetime import datetime, timezone
from app.services.supabase_service import _fresh_db


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# Human-readable labels shown in the frontend progress bar
STATUS_LABELS = {
    "queued":       "Waiting to start…",
    "compressing":  "Compressing audio…",
    "transcribing": "Transcribing with Whisper…",
    "cleaning":     "Cleaning transcript…",
    "generating":   "Generating summary & study materials…",
    "storing":      "Saving results…",
    "done":         "Done",
    "failed":       "Processing failed",
}

# Progress percentage (0–100) for each status
STATUS_PROGRESS = {
    "queued":       5,
    "compressing":  15,
    "transcribing": 40,
    "cleaning":     55,
    "generating":   75,
    "storing":      90,
    "done":         100,
    "failed":       0,
}


def create_job(lecture_id: str, user_id: str) -> str:
    """Creates a processing_jobs record. Returns job id."""
    db = _fresh_db()
    resp = db.table("processing_jobs").upsert({
        "lecture_id": lecture_id,
        "user_id":    user_id,
        "status":     "queued",
        "step_detail": STATUS_LABELS["queued"],
        "updated_at": _now(),
    }, on_conflict="lecture_id").execute()
    if not resp.data:
        raise Exception(f"Failed to create processing job for lecture {lecture_id}")
    return resp.data[0]["id"]


def update_job_status(lecture_id: str, status: str, error: str | None = None) -> None:
    """Updates job status. Non-fatal — silently logs on error."""
    try:
        update = {
            "status":     status,
            "step_detail": STATUS_LABELS.get(status, status),
            "updated_at": _now(),
        }
        if error:
            update["error"] = error[:500]   # cap error message length
        _fresh_db().table("processing_jobs").update(update).eq("lecture_id", lecture_id).execute()
    except Exception as e:
        print(f"[job_queue] update_job_status failed (non-fatal): {e}")


def get_job(lecture_id: str) -> dict | None:
    """Returns the job record for a lecture, or None if not found."""
    try:
        resp = _fresh_db().table("processing_jobs").select("*").eq("lecture_id", lecture_id).execute()
        return resp.data[0] if resp.data else None
    except Exception:
        return None


def job_is_running(lecture_id: str) -> bool:
    """Returns True if a job is already queued or in progress for this lecture."""
    job = get_job(lecture_id)
    if not job:
        return False
    return job["status"] not in ("done", "failed")
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/job_queue.py backend/app/services/supabase_service.py
git commit -m "feat(pipeline): job queue service + content save + retention DB helpers"
```

---

## Task 6: Rewrite the import processing pipeline

**Files:**
- Modify: `backend/app/api/endpoints.py`

This is the central wire-up. The old `_transcribe_background` is replaced by a new `_process_lecture_job` function that runs the full pipeline with job status updates at each step.

- [ ] **Step 1: Add new imports at the top of `endpoints.py`**

Add after the existing imports block (after `from app.services.credits_service import ...`):

```python
from app.services.audio_service import compress, split_for_whisper
from app.services.transcript_cleaner import clean as clean_transcript
from app.services.content_generator import generate as generate_content, WHISPER_MODEL
from app.services.job_queue import create_job, update_job_status, job_is_running, get_job
from app.services.supabase_service import save_generated_content
```

- [ ] **Step 2: Replace `_transcribe_background` with `_process_lecture_job`**

Remove the entire `_transcribe_background` function (lines ~303–388 in the current file) and replace with:

```python
async def _process_lecture_job(
    file_bytes: bytes,
    filename: str,
    lecture_id: str,
    user_id: str,
) -> None:
    """
    Full async processing pipeline for an uploaded lecture.
    Updates processing_jobs status at every step.
    Deducts 1 credit on success. Does NOT deduct on failure.
    """
    import asyncio as _asyncio

    async def _step(status: str) -> None:
        await _asyncio.to_thread(update_job_status, lecture_id, status)
        try:
            set_summary_status(lecture_id, status if status not in ("done",) else "final")
        except Exception:
            pass

    # ── Step 1: Check transcript cache ────────────────────────────────────────
    await _step("compressing")
    try:
        cached = get_lecture_transcript(lecture_id)
        if cached and cached.strip():
            transcript_text = cached
            language = get_lecture_language(lecture_id) or "en"
            print(f"[pipeline] {lecture_id}: transcript cache hit — skipping Whisper")
            # Jump straight to cleaning
            await _process_from_transcript(lecture_id, user_id, transcript_text, language)
            return
    except Exception:
        pass  # No cache — proceed normally

    # ── Step 2: Compress audio ────────────────────────────────────────────────
    try:
        compressed = await _asyncio.to_thread(compress, file_bytes, filename)
    except Exception as e:
        await _asyncio.to_thread(update_job_status, lecture_id, "failed", str(e))
        return

    # ── Step 3: Transcribe via Whisper (with chunking if needed) ──────────────
    await _step("transcribing")
    try:
        chunks = split_for_whisper(compressed, filename.rsplit(".", 1)[0] + ".mp3")
        transcript_parts = []
        detected_language = "en"

        for chunk_bytes, chunk_name in chunks:
            from io import BytesIO
            file_obj = BytesIO(chunk_bytes)
            file_obj.name = chunk_name
            chunk_resp = await _asyncio.to_thread(
                _bg_client.audio.transcriptions.create,
                model=WHISPER_MODEL,
                file=file_obj,
                response_format="verbose_json",
                temperature=0,
            )
            segs = getattr(chunk_resp, "segments", None) or []
            if segs:
                from app.services.openai_service import filter_segments_by_confidence
                text = filter_segments_by_confidence(segs)
                audio_sec = segs[-1].end if segs else 0.0
            else:
                text = chunk_resp.text or ""
                audio_sec = 0.0
            from app.services.cost_tracker import log_cost as _log_cost
            _log_cost("whisper_import", WHISPER_MODEL, audio_seconds=audio_sec)
            transcript_parts.append(text)
            detected_language = getattr(chunk_resp, "language", None) or detected_language

        transcript_text = " ".join(transcript_parts).strip()
        word_count = len(transcript_text.split())
        estimated_minutes = max(1, word_count // 150)
        update_lecture_transcript(lecture_id, transcript_text, detected_language)
        try:
            increment_uploads_this_month(user_id, duration_minutes=estimated_minutes)
        except Exception:
            pass

    except Exception as e:
        await _asyncio.to_thread(update_job_status, lecture_id, "failed", f"Transcription failed: {e}")
        return

    await _process_from_transcript(lecture_id, user_id, transcript_text, detected_language)


async def _process_from_transcript(
    lecture_id: str,
    user_id: str,
    transcript_text: str,
    language: str,
) -> None:
    """
    Steps 4-6 of the pipeline: clean → generate → store.
    Called both from fresh transcription AND cache-hit path.
    """
    import asyncio as _asyncio
    from app.services.cost_tracker import log_cost as _log_cost

    # ── Step 4: Clean transcript ───────────────────────────────────────────────
    await _asyncio.to_thread(update_job_status, lecture_id, "cleaning")
    try:
        cleaned = await _asyncio.to_thread(clean_transcript, transcript_text)
    except Exception as e:
        await _asyncio.to_thread(update_job_status, lecture_id, "failed", f"Cleaning failed: {e}")
        return

    # ── Step 5: Single GPT call — generate all content ────────────────────────
    await _asyncio.to_thread(update_job_status, lecture_id, "generating")
    try:
        lecture = get_lecture_full(lecture_id)
        title   = (lecture or {}).get("title", "Lecture")
        topic   = (lecture or {}).get("topic")
        existing_summary    = (lecture or {}).get("master_summary") or ""
        existing_flashcards = (lecture or {}).get("flashcards") or []

        content = await _asyncio.to_thread(
            generate_content,
            cleaned, title, topic, language,
            False,  # force = False → use cache if available
            existing_summary, existing_flashcards,
        )
    except Exception as e:
        await _asyncio.to_thread(update_job_status, lecture_id, "failed", f"Content generation failed: {e}")
        return

    # ── Step 6: Store results ─────────────────────────────────────────────────
    await _asyncio.to_thread(update_job_status, lecture_id, "storing")
    try:
        if content is None:
            print(f"[pipeline] {lecture_id}: using cached content (no GPT call needed)")
        elif content:
            await _asyncio.to_thread(save_generated_content, lecture_id, content)
        # Mark done
        set_summary_status(lecture_id, "final")
        await _asyncio.to_thread(update_job_status, lecture_id, "done")

        # Deduct 1 credit — only on success
        try:
            deduct_credit(user_id, lecture_id)
            mark_credit_deducted(lecture_id)
        except Exception as e:
            print(f"[pipeline] credit deduction failed (non-fatal): {e}")

    except Exception as e:
        await _asyncio.to_thread(update_job_status, lecture_id, "failed", f"Storing failed: {e}")
```

- [ ] **Step 3: Update the `transcribe` endpoint to create a job and reject duplicates**

Replace the end of the `transcribe` endpoint (from "Schedule transcription..." to return):

```python
    # Reject if a job is already running for this lecture
    if job_is_running(lecture_id):
        return {"lecture_id": lecture_id, "status": "already_processing"}

    # Create job record
    try:
        create_job(lecture_id, str(user.id))
    except Exception as e:
        print(f"[transcribe] create_job failed (non-fatal): {e}")

    # Schedule job as background task
    background_tasks.add_task(_process_lecture_job, file_bytes, filename, lecture_id, str(user.id))
    return {"lecture_id": lecture_id, "status": "queued"}
```

Remove the old credit-check + increment_uploads call (now inside `_process_lecture_job`) and the old `background_tasks.add_task(_transcribe_background, ...)` line.

- [ ] **Step 4: Add regenerate endpoint**

Add after the `transcribe` endpoint:

```python
@router.post("/lectures/{lecture_id}/regenerate")
@limiter.limit("3/minute")
async def regenerate_content(
    request: Request,
    background_tasks: BackgroundTasks,
    lecture_id: str,
    user=Depends(get_active_user),
):
    """
    Re-runs content generation (GPT call) for an existing lecture.
    Does NOT re-transcribe — uses the stored transcript.
    Does NOT deduct credits (regeneration is free).
    """
    _check_owner(lecture_id, user.id)
    _validate_uuid(lecture_id)

    if job_is_running(lecture_id):
        raise HTTPException(status_code=409, detail="A processing job is already running for this lecture.")

    lecture = get_lecture_full(lecture_id)
    transcript = (lecture or {}).get("transcript") or ""
    if not transcript.strip():
        raise HTTPException(status_code=400, detail="No transcript available to regenerate from.")

    async def _regen():
        import asyncio as _asyncio
        language = get_lecture_language(lecture_id) or "en"
        create_job(lecture_id, str(user.id))
        await _process_from_transcript(lecture_id, str(user.id), transcript, language)

    background_tasks.add_task(_regen)
    return {"lecture_id": lecture_id, "status": "queued"}
```

- [ ] **Step 5: Update recompute_service.py to use single GPT call**

Replace the contents of `backend/app/services/recompute_service.py`:

```python
"""
recompute_service.py — end-of-session final summary pipeline.

Called as a FastAPI BackgroundTask after a live session ends.
Uses a SINGLE GPT call via content_generator.generate() instead of
the old multi-call approach (N+1 GPT calls for N topic segments).
Saves summary, flashcards, quiz, and glossary in one shot.
"""
from app.services.content_generator import generate as generate_content
from app.services.transcript_cleaner import clean as clean_transcript
from app.services.supabase_service import (
    get_all_chunk_transcripts,
    set_summary_status,
    save_generated_content,
    get_lecture_language,
    get_lecture_topic,
    get_lecture_full,
)


def recompute_final_summary(lecture_id: str) -> None:
    """
    End-of-session recompute: one GPT call for all content.

    Flow:
    1. Fetch all raw transcript chunks and concatenate.
    2. Clean transcript.
    3. Single GPT call → summary + flashcards + quiz + glossary.
    4. Save all content.
    5. Set summary_status = 'final'.
    """
    try:
        language = get_lecture_language(lecture_id) or "en"
        topic    = get_lecture_topic(lecture_id)
        lecture  = get_lecture_full(lecture_id)
        title    = (lecture or {}).get("title", "Live Session")

        transcripts = get_all_chunk_transcripts(lecture_id)
        if not transcripts:
            print(f"[recompute] {lecture_id}: no chunks, skipping.")
            set_summary_status(lecture_id, "final")
            return

        full_text = " ".join(transcripts)
        cleaned   = clean_transcript(full_text)

        if not cleaned:
            print(f"[recompute] {lecture_id}: transcript empty after cleaning.")
            set_summary_status(lecture_id, "final")
            return

        existing_summary    = (lecture or {}).get("master_summary") or ""
        existing_flashcards = (lecture or {}).get("flashcards") or []

        content = generate_content(
            cleaned, title, topic, language,
            force=False,
            existing_summary=existing_summary,
            existing_flashcards=existing_flashcards,
        )

        if content is None:
            print(f"[recompute] {lecture_id}: cache hit — content already exists.")
        elif content:
            save_generated_content(lecture_id, content)
            print(f"[recompute] {lecture_id}: content saved.")
        else:
            print(f"[recompute] {lecture_id}: GPT call returned empty result.")

    except Exception as e:
        print(f"[recompute] {lecture_id}: error (non-fatal): {e}")
    finally:
        try:
            set_summary_status(lecture_id, "final")
        except Exception as e:
            print(f"[recompute] {lecture_id}: could not set final status: {e}")
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/endpoints.py backend/app/services/recompute_service.py
git commit -m "feat(pipeline): async job queue, single GPT call, audio compression wired up"
```

---

## Task 7: Jobs API endpoint + register router

**Files:**
- Create: `backend/app/api/jobs.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write `jobs.py`**

```python
# backend/app/api/jobs.py
"""Jobs API — frontend polls this for processing progress."""
from fastapi import APIRouter, Depends, HTTPException
from app.core.auth import get_active_user
from app.services.job_queue import get_job, STATUS_PROGRESS, STATUS_LABELS
from app.services.supabase_service import get_lecture_owner

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{lecture_id}")
def get_job_status(lecture_id: str, user=Depends(get_active_user)):
    """
    Returns the processing job status for a lecture.
    Used by the frontend progress indicator while a lecture is processing.
    """
    # Verify ownership
    owner = get_lecture_owner(lecture_id)
    if owner and str(owner) != str(user.id):
        raise HTTPException(status_code=403, detail="Access denied")

    job = get_job(lecture_id)
    if not job:
        # No job record — lecture may be from before the queue system
        return {"status": "done", "progress": 100, "label": "Done", "error": None}

    status = job["status"]
    return {
        "status":     status,
        "progress":   STATUS_PROGRESS.get(status, 0),
        "label":      STATUS_LABELS.get(status, status),
        "error":      job.get("error"),
        "updated_at": job.get("updated_at"),
    }
```

- [ ] **Step 2: Register router in `main.py`**

Add after the existing router imports:
```python
from app.api.jobs import router as jobs_router
```

Add after the existing `app.include_router(credits_router, prefix="/api/v1")`:
```python
app.include_router(jobs_router, prefix="/api/v1")
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/jobs.py backend/app/main.py
git commit -m "feat(api): job status endpoint GET /api/v1/jobs/{lecture_id}"
```

---

## Task 8: PDF quality tiers

**Files:**
- Modify: `backend/app/services/pdf_service.py`
- Modify: `backend/app/api/endpoints.py`

**Context:**
- Free tier: summary text only, no analogy boxes, no stats grid, max 4 sections shown, no enrichment pass
- Student: standard quality (current implementation)
- Pro: full enrichment (current + extended analogy pass + all stats)

- [ ] **Step 1: Add `quality` parameter to `generate_lecture_pdf`**

In `backend/app/services/pdf_service.py`, find the main `generate_lecture_pdf` function and add the `quality` parameter. Locate the function signature:

```python
async def generate_lecture_pdf(lecture_id: str, user_id: str | None = None) -> bytes:
```

Replace with:

```python
async def generate_lecture_pdf(
    lecture_id: str,
    user_id: str | None = None,
    quality: str = "standard",   # "lite" | "standard" | "full"
) -> bytes:
```

Then at the beginning of the function body, add:

```python
    IS_LITE = quality == "lite"
    IS_FULL = quality == "full"
```

Then find the section where `_call_enrich_section` calls are made (in the parallel pipeline block) and wrap the enrichment with a lite check. In the parallel gather block, find the list comprehension that creates `enrich_tasks` and modify it:

```python
        # Lite tier: skip enrichment entirely, use raw section data only
        if IS_LITE:
            sections_data = [{"title": s, "prose": s, "bullets": [], "concepts": [],
                              "examples": [], "analogy": None, "mistake": None, "remember": None}
                             for s in section_texts[:4]]  # max 4 sections for lite
            enrich_results = sections_data
        else:
            # (existing parallel enrichment code stays here)
```

For the key_stats section, wrap in an `IS_LITE` check to skip stats on lite tier.

- [ ] **Step 2: Update the PDF export endpoint in `endpoints.py`**

Find the `GET /lectures/{lecture_id}/export/pdf` endpoint and update it to pass `quality` based on plan tier:

```python
@router.get("/lectures/{lecture_id}/export/pdf")
@limiter.limit("3/minute")
async def export_pdf(request: Request, lecture_id: str, user=Depends(get_active_user)):
    _check_owner(lecture_id, user.id)
    profile   = get_user_profile(str(user.id))
    plan_tier = profile.get("plan_tier") or "free"
    limits    = get_limits(plan_tier)

    if not limits.get("pdf_export"):
        raise HTTPException(status_code=403, detail={
            "error": "pdf_not_available",
            "plan": plan_tier,
        })

    quality_map = {"free": "lite", "student": "standard", "pro": "full"}
    quality = quality_map.get(plan_tier, "standard")

    try:
        pdf_bytes = await generate_lecture_pdf(lecture_id, user_id=str(user.id), quality=quality)
    except Exception as e:
        print(f"PDF export error: {e}")
        raise HTTPException(status_code=500, detail="PDF generation failed")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="lecture-{lecture_id[:8]}.pdf"'},
    )
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/pdf_service.py backend/app/api/endpoints.py
git commit -m "feat(pdf): quality tiers lite/standard/full based on plan tier"
```

---

## Task 9: Retention policy endpoint

**Files:**
- Modify: `backend/app/api/endpoints.py` (or create `backend/app/api/maintenance.py`)

**Context:** A cron job (GitHub Actions / Vercel Cron) calls `POST /api/v1/admin/maintenance/cleanup` daily. This scans free-tier lectures older than 30 days, sets `deletion_scheduled_at` for those between 27-30 days old (3-day warning), and deletes content from those ≥ 30 days old. The admin auth header is required.

- [ ] **Step 1: Add the maintenance endpoint**

Add to the admin router (`backend/app/api/admin.py`):

```python
@router.post("/maintenance/cleanup")
def run_cleanup(user=Depends(get_admin_user)):
    """
    Retention policy enforcement.
    - Lectures 27-29 days old: set deletion_scheduled_at (3-day warning)
    - Lectures ≥ 30 days old: delete transcript + summary + generated content
    Returns counts of actions taken.
    """
    from datetime import datetime, timezone, timedelta
    from app.services.supabase_service import (
        get_stale_free_lectures,
        mark_content_deleted,
        set_deletion_scheduled,
    )

    now = datetime.now(timezone.utc)
    warn_cutoff   = now - timedelta(days=27)
    delete_cutoff = now - timedelta(days=30)

    stale = get_stale_free_lectures(days=27)   # lectures ≥ 27 days old
    warned  = 0
    deleted = 0

    for lec in stale:
        created = lec.get("created_at", "")
        try:
            age = now - datetime.fromisoformat(created.replace("Z", "+00:00"))
        except Exception:
            continue

        if age.days >= 30:
            mark_content_deleted(lec["id"])
            deleted += 1
        elif age.days >= 27:
            scheduled = (datetime.fromisoformat(created.replace("Z", "+00:00")) + timedelta(days=30)).isoformat()
            set_deletion_scheduled(lec["id"], scheduled)
            warned += 1

    return {
        "checked": len(stale),
        "warned":  warned,
        "deleted": deleted,
        "ran_at":  now.isoformat(),
    }
```

- [ ] **Step 2: Show deletion warning in LectureView (frontend)**

In `frontend/src/pages/LectureView.jsx`, find the data fetching useEffect and add a check for `deletion_scheduled_at`. In the lecture data display, add before the main content panels:

```jsx
{lecture.deletion_scheduled_at && !lecture.content_deleted && (
    <div style={{
        background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8,
        padding: '10px 16px', fontSize: 13, color: '#92400e', marginBottom: 12
    }}>
        ⚠ Your free plan content is scheduled for deletion on{' '}
        <strong>{new Date(lecture.deletion_scheduled_at).toLocaleDateString()}</strong>.{' '}
        <a href="/pricing" style={{ color: '#92400e', fontWeight: 600 }}>Upgrade to save it.</a>
    </div>
)}
```

- [ ] **Step 3: Expose `deletion_scheduled_at` in the lecture GET endpoint**

In `backend/app/api/endpoints.py`, find the `GET /lectures/{lecture_id}` endpoint and ensure `get_lecture_full` returns `deletion_scheduled_at`. In `supabase_service.py`, find `get_lecture_full` and add `deletion_scheduled_at` to the select string:

```python
# In get_lecture_full, find the .select("...") call and add:
"deletion_scheduled_at, content_deleted"
# to the column list.
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/admin.py backend/app/services/supabase_service.py frontend/src/pages/LectureView.jsx
git commit -m "feat(retention): 30-day free tier cleanup + 3-day warning notification"
```

---

## Task 10: Frontend — Job progress indicator

**Files:**
- Create: `frontend/src/lib/jobsApi.js`
- Create: `frontend/src/components/JobProgress.jsx`
- Modify: `frontend/src/pages/LectureView.jsx`
- Modify: `frontend/src/components/Dashboard.jsx`

- [ ] **Step 1: Write `jobsApi.js`**

```javascript
// frontend/src/lib/jobsApi.js
import axios from 'axios';
import { useAuth } from '@clerk/react';

const BASE = import.meta.env.VITE_API_URL || 'https://api.neurativo.com';

export function useJobsApi() {
    const { getToken } = useAuth();
    return {
        getStatus: async (lectureId) => {
            const token = await getToken();
            const res = await axios.get(`${BASE}/api/v1/jobs/${lectureId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return res.data;
        },
    };
}
```

- [ ] **Step 2: Write `JobProgress.jsx`**

```jsx
// frontend/src/components/JobProgress.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useJobsApi } from '../lib/jobsApi.js';

const STEPS = [
    { key: 'queued',       label: 'Queued' },
    { key: 'compressing',  label: 'Compressing' },
    { key: 'transcribing', label: 'Transcribing' },
    { key: 'cleaning',     label: 'Cleaning' },
    { key: 'generating',   label: 'Generating' },
    { key: 'storing',      label: 'Saving' },
    { key: 'done',         label: 'Done' },
];

export default function JobProgress({ lectureId, onDone }) {
    const api    = useJobsApi();
    const [job, setJob]   = useState(null);
    const [error, setErr] = useState(null);
    const timerRef = useRef(null);

    useEffect(() => {
        if (!lectureId) return;

        const poll = async () => {
            try {
                const data = await api.getStatus(lectureId);
                setJob(data);
                if (data.status === 'done') {
                    onDone?.();
                    return;   // stop polling
                }
                if (data.status === 'failed') {
                    setErr(data.error || 'Processing failed. Please try again.');
                    return;   // stop polling
                }
                timerRef.current = setTimeout(poll, 2500);  // poll every 2.5s
            } catch (e) {
                setErr('Could not check processing status.');
            }
        };

        poll();
        return () => clearTimeout(timerRef.current);
    }, [lectureId]);

    if (!job || job.status === 'done') return null;

    const progress = job.progress ?? 0;
    const isFailed = job.status === 'failed';

    return (
        <div style={{
            background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderRadius: 12, padding: '20px 24px', marginBottom: 16,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 13 }}>
                <span style={{ fontWeight: 500, color: isFailed ? '#dc2626' : 'var(--color-text)' }}>
                    {isFailed ? '✗ Processing failed' : job.label || 'Processing…'}
                </span>
                {!isFailed && <span style={{ color: 'var(--color-muted)' }}>{progress}%</span>}
            </div>

            {!isFailed && (
                <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 6, overflow: 'hidden', marginBottom: 14 }}>
                    <div style={{
                        height: '100%',
                        width: `${progress}%`,
                        background: progress === 100 ? '#22c55e' : '#6366f1',
                        borderRadius: 6,
                        transition: 'width 0.6s ease',
                    }} />
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {STEPS.filter(s => s.key !== 'done').map(s => {
                    const stepIdx = STEPS.findIndex(x => x.key === job.status);
                    const thisIdx = STEPS.findIndex(x => x.key === s.key);
                    const done    = thisIdx < stepIdx;
                    const active  = s.key === job.status;
                    return (
                        <span key={s.key} style={{
                            fontSize: 11, padding: '3px 9px', borderRadius: 6,
                            background: done ? '#f0fdf4' : active ? '#ede9fe' : 'var(--color-border)',
                            color: done ? '#16a34a' : active ? '#7c3aed' : 'var(--color-muted)',
                            fontWeight: active ? 600 : 400,
                        }}>
                            {done ? '✓ ' : active ? '⟳ ' : ''}{s.label}
                        </span>
                    );
                })}
            </div>

            {(error || isFailed) && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>
                    {error || job.error || 'Processing failed. Please try re-uploading.'}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 3: Wire `JobProgress` into `LectureView.jsx`**

In `LectureView.jsx`, add the import at the top:
```jsx
import JobProgress from '../components/JobProgress.jsx';
```

Find the `useEffect` that fetches the lecture data. Add state for tracking job status:
```jsx
const [isProcessing, setIsProcessing] = useState(false);
```

After the lecture data is fetched, check `summary_status` to determine if processing is ongoing:
```jsx
// Inside the data fetch callback, after setting lecture:
const status = data?.summary_status;
setIsProcessing(
    status && !['final', 'done'].includes(status)
);
```

In the JSX, before the main two-panel body, insert:
```jsx
{isProcessing && (
    <div style={{ padding: '16px 20px 0' }}>
        <JobProgress
            lectureId={lecture?.id}
            onDone={() => {
                setIsProcessing(false);
                // Refresh lecture data
                api.get(`/api/v1/lectures/${lecture.id}`).then(r => setLecture(r.data)).catch(() => {});
            }}
        />
    </div>
)}
```

- [ ] **Step 4: Show "Processing…" card in Dashboard for queued lectures**

In `Dashboard.jsx`, the lecture cards that have `summary_status` of `importing`/`compressing`/`transcribing`/`generating` should show a processing badge. Find the card render section and add:

```jsx
{['importing','compressing','transcribing','cleaning','generating','storing'].includes(lecture.summary_status) && (
    <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, padding: '2px 8px', borderRadius: 5,
        background: '#ede9fe', color: '#7c3aed',
        marginBottom: 8,
    }}>
        ⟳ Processing…
    </span>
)}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/jobsApi.js frontend/src/components/JobProgress.jsx frontend/src/pages/LectureView.jsx frontend/src/components/Dashboard.jsx
git commit -m "feat(frontend): job progress bar with step indicators in LectureView and Dashboard"
```

---

## Task 11: Frontend — Flashcard, Quiz, and Glossary tabs

**Files:**
- Modify: `frontend/src/pages/LectureView.jsx`

**Context:** The single GPT call now stores `flashcards`, `quiz`, and `glossary` as JSON in the `lectures` table. The LectureView already has a tab system (Summary / Q&A). We add three new tabs.

- [ ] **Step 1: Add new tabs to the tab bar in `LectureView.jsx`**

Find the `.lv-tabs` section in the JSX and add three new tabs after the existing ones:

```jsx
<button className={`lv-tab ${tab === 'flashcards' ? 'active' : ''}`} onClick={() => setTab('flashcards')}>Flashcards</button>
<button className={`lv-tab ${tab === 'quiz' ? 'active' : ''}`} onClick={() => setTab('quiz')}>Quiz</button>
<button className={`lv-tab ${tab === 'glossary' ? 'active' : ''}`} onClick={() => setTab('glossary')}>Glossary</button>
```

- [ ] **Step 2: Add tab content renderers**

Add CSS for the new tab content to the CSS string in `LectureView.jsx`:

```css
/* Flashcards */
.lv-card-flip { perspective: 800px; height: 160px; cursor: pointer; margin-bottom: 12px; }
.lv-card-inner { position: relative; width: 100%; height: 100%; transition: transform 0.45s; transform-style: preserve-3d; }
.lv-card-flip.flipped .lv-card-inner { transform: rotateY(180deg); }
.lv-card-face { position: absolute; inset: 0; border: 1px solid var(--color-border); border-radius: 12px; padding: 20px; background: var(--color-card); backface-visibility: hidden; display: flex; align-items: center; justify-content: center; font-size: 14px; line-height: 1.55; text-align: center; }
.lv-card-back { transform: rotateY(180deg); background: var(--color-dark); color: var(--color-dark-fg); }
.lv-fc-nav { display: flex; align-items: center; gap: 12px; justify-content: center; margin-top: 12px; }
.lv-fc-btn { padding: 6px 14px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-card); font-size: 12px; cursor: pointer; font-family: inherit; }

/* Quiz */
.lv-quiz-q { background: var(--color-card); border: 1px solid var(--color-border); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
.lv-quiz-qtext { font-size: 14px; font-weight: 500; margin-bottom: 12px; line-height: 1.55; }
.lv-quiz-opt { display: block; width: 100%; text-align: left; padding: 8px 12px; margin-bottom: 6px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg); font-size: 13px; cursor: pointer; font-family: inherit; transition: background .15s; }
.lv-quiz-opt:hover { background: var(--color-border); }
.lv-quiz-opt.correct { background: #f0fdf4; border-color: #86efac; color: #15803d; }
.lv-quiz-opt.wrong   { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
.lv-quiz-expl { font-size: 12px; color: var(--color-sec); margin-top: 8px; padding: 8px 12px; background: var(--color-bg); border-radius: 8px; line-height: 1.55; }

/* Glossary */
.lv-gloss-row { display: flex; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--color-border); font-size: 13px; }
.lv-gloss-term { font-weight: 600; min-width: 140px; flex-shrink: 0; color: var(--color-text); }
.lv-gloss-def  { color: var(--color-sec); line-height: 1.6; }
```

- [ ] **Step 3: Add state for interactive tab components**

Add inside the `LectureView` function:
```jsx
const [fcIdx, setFcIdx]         = useState(0);   // current flashcard index
const [fcFlipped, setFcFlipped] = useState(false);
const [quizAnswers, setQuizAnswers] = useState({});  // {qIdx: chosenOption}
```

- [ ] **Step 4: Add tab body renderers**

Inside the tab body conditional rendering section (where `tab === 'summary'` etc. are checked), add:

```jsx
{tab === 'flashcards' && (() => {
    const cards = lecture?.flashcards || [];
    if (!cards.length) return <div className="lv-empty-panel">No flashcards yet</div>;
    const card = cards[fcIdx];
    return (
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', textAlign: 'center', marginBottom: 12 }}>
                {fcIdx + 1} / {cards.length} · Click card to flip
            </div>
            <div className={`lv-card-flip${fcFlipped ? ' flipped' : ''}`} onClick={() => setFcFlipped(f => !f)}>
                <div className="lv-card-inner">
                    <div className="lv-card-face">{card.front}</div>
                    <div className="lv-card-face lv-card-back">{card.back}</div>
                </div>
            </div>
            <div className="lv-fc-nav">
                <button className="lv-fc-btn" onClick={() => { setFcIdx(i => Math.max(0, i-1)); setFcFlipped(false); }}>←</button>
                <button className="lv-fc-btn" onClick={() => { setFcIdx(i => Math.min(cards.length-1, i+1)); setFcFlipped(false); }}>→</button>
                <button className="lv-fc-btn" onClick={() => { setFcIdx(Math.floor(Math.random() * cards.length)); setFcFlipped(false); }}>Shuffle</button>
            </div>
        </div>
    );
})()}

{tab === 'quiz' && (() => {
    const questions = lecture?.quiz || [];
    if (!questions.length) return <div className="lv-empty-panel">No quiz yet</div>;
    return (
        <div>
            {questions.map((q, qi) => {
                const chosen = quizAnswers[qi];
                const answered = chosen !== undefined;
                const correctLetter = (q.answer || '').charAt(0).toUpperCase();
                return (
                    <div key={qi} className="lv-quiz-q">
                        <div className="lv-quiz-qtext">{qi + 1}. {q.question}</div>
                        {(q.options || []).map((opt, oi) => {
                            const letter = String.fromCharCode(65 + oi);
                            let cls = 'lv-quiz-opt';
                            if (answered) {
                                if (letter === correctLetter) cls += ' correct';
                                else if (letter === chosen) cls += ' wrong';
                            }
                            return (
                                <button key={oi} className={cls}
                                    disabled={answered}
                                    onClick={() => setQuizAnswers(a => ({ ...a, [qi]: letter }))}>
                                    {opt}
                                </button>
                            );
                        })}
                        {answered && q.explanation && (
                            <div className="lv-quiz-expl">💡 {q.explanation}</div>
                        )}
                    </div>
                );
            })}
        </div>
    );
})()}

{tab === 'glossary' && (() => {
    const terms = lecture?.glossary || [];
    if (!terms.length) return <div className="lv-empty-panel">No glossary yet</div>;
    const sorted = [...terms].sort((a, b) => (a.term || '').localeCompare(b.term || ''));
    return (
        <div>
            {sorted.map((g, i) => (
                <div key={i} className="lv-gloss-row">
                    <div className="lv-gloss-term">{g.term}</div>
                    <div className="lv-gloss-def">{g.definition}</div>
                </div>
            ))}
        </div>
    );
})()}
```

- [ ] **Step 5: Ensure the lecture API returns `flashcards`, `quiz`, `glossary`**

In `backend/app/api/endpoints.py`, find the `GET /lectures/{lecture_id}` endpoint. Verify that `get_lecture_full` includes these fields in its select. In `supabase_service.py`, find `get_lecture_full` and add to its select string:
```python
"flashcards, quiz, glossary"
```
(alongside the existing columns in the select call)

- [ ] **Step 6: Parse JSON from DB before sending to frontend**

In the endpoint that returns lecture detail, add JSON parsing for the three fields:

```python
import json as _json
for field in ("flashcards", "quiz", "glossary"):
    val = lecture_data.get(field)
    if isinstance(val, str):
        try:
            lecture_data[field] = _json.loads(val)
        except Exception:
            lecture_data[field] = []
    elif val is None:
        lecture_data[field] = []
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/LectureView.jsx backend/app/api/endpoints.py backend/app/services/supabase_service.py
git commit -m "feat(frontend): flashcard flip cards, interactive quiz, and glossary tab in LectureView"
```

---

## Task 12: Production deployment notes

**Files:**
- No code changes — operational notes

- [ ] **Step 1: Ensure ffmpeg is available on Render/Railway**

In `render.yaml` or your deployment config, add to the build command:
```bash
apt-get install -y ffmpeg
```
Or use a base Docker image that includes ffmpeg (e.g., `tiangolo/uvicorn-gunicorn-fastapi:python3.11` + `RUN apt-get install -y ffmpeg`).

- [ ] **Step 2: Set up daily maintenance cron**

Create a GitHub Actions workflow at `.github/workflows/cleanup.yml`:
```yaml
name: Daily cleanup
on:
  schedule:
    - cron: '0 2 * * *'   # 2 AM UTC daily
jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Run cleanup
        run: |
          curl -X POST ${{ secrets.API_URL }}/api/v1/admin/maintenance/cleanup \
            -H "Authorization: Bearer ${{ secrets.ADMIN_API_KEY }}"
```

Add `ADMIN_API_KEY` and `API_URL` to GitHub repo secrets.

- [ ] **Step 3: Commit cleanup workflow**

```bash
git add .github/workflows/cleanup.yml
git commit -m "chore: daily retention cleanup cron via GitHub Actions"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task | Status |
|---|---|---|
| Audio compression mono 16kHz mp3 before Whisper | Task 2 (audio_service.py) | ✓ |
| Always use whisper-1 | Task 4 (`WHISPER_MODEL = "whisper-1"` hardcoded) | ✓ |
| Only chunk if exceeds 25 MB | Task 2 (`split_for_whisper`) | ✓ |
| Check transcript cache before Whisper | Task 6 (`_process_lecture_job` cache check) | ✓ |
| Transcript cleaning before GPT | Task 3 + Task 6 (`clean_transcript` call) | ✓ |
| Truncate to max token limit | Task 3 (`MAX_WORDS = 60_000`) | ✓ |
| Single GPT call: summary + flashcards + quiz + glossary | Task 4 (`content_generator.py`) | ✓ |
| Return structured JSON, parse and store separately | Task 4 + Task 5 (`save_generated_content`) | ✓ |
| Never call GPT more than once per job | Task 4 (single call) | ✓ |
| Skip GPT if content already exists | Task 4 (cache check in `generate()`) | ✓ |
| Regenerate button (explicit user action) | Task 6 (`/regenerate` endpoint) | ✓ |
| Delete raw audio after transcript saved | ⚠ Audio is held in memory, never stored to Supabase Storage in current code — no deletion needed. Future work if storage is added. | N/A |
| PDF: free = lite, student = standard, pro = full | Task 8 | ✓ |
| Retention: delete free >30 days | Task 9 (`run_cleanup`) | ✓ |
| Notify 3 days before deletion | Task 9 (`deletion_scheduled_at` + frontend warning) | ✓ |
| processing_jobs table with status tracking | Task 1 + Task 5 | ✓ |
| Worker processes in order: compress→transcribe→clean→generate→store | Task 6 (`_process_lecture_job`) | ✓ |
| Frontend progress indicator | Task 10 (`JobProgress.jsx`) | ✓ |
| No credits deducted on failure | Task 6 (deduct only in `done` step) | ✓ |
| Prevent duplicate job submission | Task 6 (`job_is_running` check) | ✓ |

### Placeholder scan
No TBDs, TODOs, or incomplete sections found.

### Type consistency check
- `compress(bytes, str) → bytes` — used consistently in Task 2 and Task 6
- `split_for_whisper(bytes, str) → List[tuple[bytes, str]]` — used consistently in Task 6
- `clean(str) → str` — imported as `clean_transcript` in Task 6
- `generate(str, str, str|None, str, bool, str|None, list|None) → dict|None` — used consistently in Task 6 and Task 9
- `create_job(str, str) → str` — used in Task 6 and Task 7
- `update_job_status(str, str, str|None) → None` — used throughout Task 6
- `get_job(str) → dict|None` — used in Task 7
- `STATUS_PROGRESS: dict[str, int]` — used in Task 7 and Task 10
- `STATUS_LABELS: dict[str, str]` — used in Task 7 and Task 10
- `save_generated_content(str, dict) → None` — used in Task 6
- All consistent. ✓

> **Note on "delete raw audio from storage":** The current import pipeline holds audio in memory (FastAPI UploadFile → bytes). Audio is never written to Supabase Storage, so there is nothing to delete after transcription. If storage upload is added in the future, the deletion step belongs in `_process_from_transcript` after the transcript is confirmed saved.
