import asyncio
import json
import os
import re

from fastapi import APIRouter, BackgroundTasks, UploadFile, File, HTTPException, Depends, Request, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
import numpy as np
from openai import OpenAI

from app.core.config import settings
from app.core.auth import get_current_user
from app.core.plans import get_limits, is_unlimited
from app.core.rate_limit import limiter
from app.services.openai_service import transcribe_audio, transcribe_audio_bytes
from app.services.explanation_service import generate_explanation
from app.services.qa_service import answer_lecture_question
from app.services.pdf_service import generate_lecture_pdf
from app.services.topic_service import detect_lecture_topic
from app.services.summarization_service import (
    generate_micro_summary,
    generate_section_summary,
    generate_master_summary,
)
from app.services.recompute_service import recompute_final_summary
from app.services.embedding_service import get_embeddings, cosine_similarity
from app.services.cif_service import classify_chunk
from app.services.supabase_service import (
    ensure_user_profile,
    save_lecture,
    create_lecture,
    create_live_session,
    get_active_live_session,
    append_lecture_transcript,
    update_live_session_timestamp,
    get_lecture_for_summarization,
    update_lecture_summary_only,
    create_lecture_chunk,
    get_micro_summaries,
    create_lecture_section,
    get_section_summaries,
    get_latest_section_end_index,
    get_latest_section_count,
    get_unsummarized_chunks,
    end_live_session,
    cleanup_old_chunks,
    update_lecture_analytics,
    update_lecture_language,
    get_lecture_language,
    get_lecture_topic,
    update_lecture_topic,
    get_cached_embeddings,
    save_embeddings_cache,
    get_lecture_transcript,
    get_client,
    get_recent_lectures,
    get_lecture_owner,
    delete_lecture,
    update_lecture_title,
    update_lecture_transcript,
    save_student_question,
    generate_share_token,
    clear_share_token,
    get_lecture_by_share_token,
    increment_share_views,
    get_lecture_full,
    get_user_profile,
    update_user_profile,
    delete_user_account,
    get_monthly_lecture_count,
    get_monthly_usage,
    increment_monthly_live,
    get_total_lecture_count,
    set_user_plan,
    increment_uploads_this_month,
    save_visual_frame,
    get_visual_frames,
    get_visual_frames_in_window,
    set_summary_status,
)


def _next_month_iso() -> str:
    """Returns ISO timestamp for the first second of next calendar month (UTC)."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    if now.month == 12:
        resets = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        resets = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return resets.isoformat()


_UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)


def _validate_uuid(lecture_id: str) -> None:
    """Raises 400 if lecture_id is not a valid UUID."""
    if not _UUID_RE.match(lecture_id):
        raise HTTPException(status_code=400, detail="Invalid lecture ID")


def _check_owner(lecture_id: str, user_id: str) -> None:
    """
    Raises 404 if the lecture doesn't exist.
    Raises 403 if the lecture has a user_id that doesn't match.
    """
    _validate_uuid(lecture_id)
    owner_id = get_lecture_owner(lecture_id)
    if owner_id is None:
        # Lecture doesn't exist or has no owner — check if the lecture actually exists
        lecture = get_lecture_for_summarization(lecture_id)
        if not lecture:
            raise HTTPException(status_code=404, detail="Lecture not found")
        # Legacy lecture (no owner) — deny access to prevent unauthorized access
        raise HTTPException(status_code=403, detail="Access denied")
    if str(owner_id) != str(user_id):
        raise HTTPException(status_code=403, detail="Access denied")


# =============================================================================
#  NEURATIVO ADAPTIVE SECTION TRIGGER  (N.A.S.T.)
#
#  A section boundary is a *meaningful moment* — not a word count.
#  Three independent signals combine into one composite score.
#
#  SIGNAL 1 — Semantic Divergence  (weight 0.50)
#    Mean pairwise cosine similarity across all pending micro-summaries.
#    Low similarity = chunks cover different ideas = boundary arrived.
#    Score = 1.0 - mean_pairwise_similarity
#
#  SIGNAL 2 — Novelty Drift  (weight 0.30)
#    Similarity between the FIRST and LATEST micro-summary in the window.
#    High distance = lecture has drifted far from where this section started.
#    Score = 1.0 - cosine_similarity(first, latest)
#
#  SIGNAL 3 — Momentum  (weight 0.20)
#    Soft time-pressure. Grows linearly from 0 at MIN_CHUNKS to 1.0 at
#    MIN_CHUNKS + MOMENTUM_WINDOW. Never dominates but prevents infinite wait.
#    Score = min(1.0, (n - MIN_CHUNKS) / MOMENTUM_WINDOW)
#
#  COMPOSITE = 0.50 * divergence + 0.30 * drift + 0.20 * momentum
#  TRIGGER   when composite >= TRIGGER_THRESHOLD
#  HARD CAP  when chunks >= HARD_CAP_CHUNKS  (always fires)
#  GUARD     never fires with fewer than MIN_CHUNKS pending
#
#  Language-agnostic. Works identically in any language.
# =============================================================================

MIN_CHUNKS        = 3
HARD_CAP_CHUNKS   = 10
MOMENTUM_WINDOW   = 7
TRIGGER_THRESHOLD = 0.55


def _mean_pairwise_similarity(embeddings: list) -> float:
    n = len(embeddings)
    if n < 2:
        return 1.0
    total, count = 0.0, 0
    for i in range(n):
        for j in range(i + 1, n):
            total += cosine_similarity(embeddings[i], embeddings[j])
            count += 1
    return total / count if count > 0 else 1.0


def should_trigger_section(pending_chunks: list) -> tuple:
    n = len(pending_chunks)

    if n < MIN_CHUNKS:
        return False, {"reason": "below_min_chunks", "chunks": n}

    if n >= HARD_CAP_CHUNKS:
        return True, {"reason": "hard_cap", "chunks": n}

    summaries = [c['micro_summary'] for c in pending_chunks if c.get('micro_summary', '').strip()]
    if len(summaries) < MIN_CHUNKS:
        return False, {"reason": "insufficient_summaries"}

    try:
        embeddings = get_embeddings(summaries)
    except Exception as e:
        print(f"N.A.S.T. embedding error — falling back to chunk count: {e}")
        return n >= 6, {"reason": "embedding_fallback", "chunks": n}

    # Signal 1: Semantic Divergence
    mean_sim        = _mean_pairwise_similarity(embeddings)
    divergence_score = 1.0 - mean_sim

    # Signal 2: Novelty Drift
    drift_sim   = cosine_similarity(embeddings[0], embeddings[-1])
    drift_score = 1.0 - drift_sim

    # Signal 3: Momentum
    momentum_score = min(1.0, (n - MIN_CHUNKS) / MOMENTUM_WINDOW)

    # Composite
    composite  = (0.50 * divergence_score) + (0.30 * drift_score) + (0.20 * momentum_score)
    should_fire = composite >= TRIGGER_THRESHOLD

    debug = {
        "chunks":     n,
        "divergence": round(float(divergence_score), 3),
        "drift":      round(float(drift_score), 3),
        "momentum":   round(float(momentum_score), 3),
        "composite":  round(float(composite), 3),
        "threshold":  TRIGGER_THRESHOLD,
        "triggered":  bool(should_fire),
    }
    print(f"[N.A.S.T.] {debug}")
    return should_fire, debug


# =============================================================================
#  MODELS
# =============================================================================

class QuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)

class ShareRequest(BaseModel):
    mode: str = Field("full", pattern=r'^(full|summary_only)$')
    expires_at: str | None = None   # ISO-8601 UTC timestamp, or null for no expiry

class ExplainRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    mode: str = Field("simple", pattern=r'^(simple|detailed|step|analogy)$')

class FrameRequest(BaseModel):
    image_base64: str           # JPEG base64 encoded frame
    timestamp_seconds: int      # seconds into session
    last_frame_hash: str = ""   # first 100 chars of previous frame base64
    camera_mode: bool = False   # True = physical board/projector (Phase 2)


router = APIRouter()

# Fix 4: Per-lecture asyncio locks prevent two overlapping chunks for the same
# lecture from racing through transcription + transcript-append simultaneously.
_lecture_locks: dict[str, asyncio.Lock] = {}


def _get_lecture_lock(lecture_id: str) -> asyncio.Lock:
    """Returns (creating if needed) the asyncio.Lock for a given lecture."""
    if lecture_id not in _lecture_locks:
        _lecture_locks[lecture_id] = asyncio.Lock()
    return _lecture_locks[lecture_id]


# =============================================================================
#  ENDPOINTS
# =============================================================================

@router.post("/explain/{lecture_id}")
@limiter.limit("20/minute")
def explain_text(request: Request, lecture_id: str, body: ExplainRequest, user=Depends(get_current_user)):
    _check_owner(lecture_id, user.id)
    topic = get_lecture_topic(lecture_id)
    try:
        explanation_data = generate_explanation(body.text, body.mode, topic=topic)
    except Exception:
        raise HTTPException(status_code=500, detail="Explanation generation failed")
    return {
        "lecture_id":  lecture_id,
        "explanation": explanation_data.get("explanation"),
        "analogy":     explanation_data.get("analogy"),
        "breakdown":   explanation_data.get("breakdown"),
    }


_ALLOWED_AUDIO_EXTENSIONS = ('.mp3', '.wav', '.m4a', '.mp4', '.mpeg', '.mpga', '.webm')

# Audio/video MIME signatures (offset, bytes)
_AUDIO_MAGIC: list[tuple[int, bytes]] = [
    (0, b'ID3'),               # MP3 with ID3 tag
    (0, b'\xff\xfb'),          # MP3 frame sync
    (0, b'\xff\xf3'),          # MP3 frame sync
    (0, b'\xff\xf2'),          # MP3 frame sync
    (0, b'RIFF'),              # WAV
    (0, b'\x1a\x45\xdf\xa3'), # WebM / MKV
    (0, b'OggS'),              # OGG
    (4, b'ftyp'),              # MP4 / M4A
]


async def _check_audio_magic(file: UploadFile) -> bool:
    """Reads the first 12 bytes to verify audio magic bytes, then rewinds."""
    header = await file.read(12)
    await file.seek(0)
    for offset, sig in _AUDIO_MAGIC:
        if header[offset : offset + len(sig)] == sig:
            return True
    return False


async def _transcribe_background(file_bytes: bytes, filename: str, lecture_id: str, user_id: str) -> None:
    """
    Background task: transcribe audio bytes, update the lecture, then summarize.
    Not bound by HTTP timeout — runs until completion or failure.
    """
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
    # Auto-summarize after transcription completes.
    # generate_master_summary expects a list of section summaries — wrap the
    # full transcript as a single element so it doesn't TypeError on str.join.
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


@router.post("/transcribe")
@limiter.limit("5/minute")
async def transcribe(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    # Extension check
    if not file.filename.lower().endswith(_ALLOWED_AUDIO_EXTENSIONS):
        raise HTTPException(status_code=400, detail="Invalid file format")

    # Fetch plan limits
    profile = get_user_profile(str(user.id))
    plan_tier = profile.get("plan_tier") or "free"
    limits = get_limits(plan_tier)

    # Check monthly upload count + total hours cap
    monthly_usage_data = get_monthly_usage(str(user.id))
    if not is_unlimited(limits["uploads_per_month"]):
        if monthly_usage_data["uploads"] >= limits["uploads_per_month"]:
            raise HTTPException(status_code=403, detail={
                "error": "upload_limit_reached",
                "limit": limits["uploads_per_month"],
                "plan": plan_tier,
                "resets_at": _next_month_iso(),
            })
    total_min_limit = limits.get("total_minutes_per_month")
    if total_min_limit is not None and monthly_usage_data["total_minutes_used"] >= total_min_limit:
        raise HTTPException(status_code=403, detail={
            "error": "hours_limit_reached",
            "limit_hours": total_min_limit // 60,
            "used_hours": round(monthly_usage_data["total_minutes_used"] / 60, 1),
            "plan": plan_tier,
            "resets_at": _next_month_iso(),
        })

    # Magic bytes check
    if not await _check_audio_magic(file):
        raise HTTPException(status_code=400, detail="Invalid file format")

    # Read full file into memory (needed for size check + background task)
    file_bytes = await file.read()
    filename = file.filename

    # File size check
    if not is_unlimited(limits["upload_max_bytes"]):
        if len(file_bytes) > limits["upload_max_bytes"]:
            raise HTTPException(status_code=413, detail={
                "error": "file_too_large",
                "max_bytes": limits["upload_max_bytes"],
                "plan": plan_tier,
            })

    # Create lecture record immediately with empty transcript
    title = filename.rsplit('.', 1)[0][:200]
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

    return {"lecture_id": lecture_id, "status": "processing"}


@router.get("/summarize/{lecture_id}")
def summarize(lecture_id: str, user=Depends(get_current_user)):
    _check_owner(lecture_id, user.id)
    lecture = get_lecture_for_summarization(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    summary = lecture.get("master_summary") or lecture.get("summary") or "Processing..."
    return {"lecture_id": lecture_id, "summary": summary}




@router.post("/live/start")
@limiter.limit("10/minute")
def start_live_session(request: Request, user=Depends(get_current_user)):
    try:
        profile = get_user_profile(str(user.id))
        plan_tier = profile.get("plan_tier") or "free"
        limits = get_limits(plan_tier)

        monthly = get_monthly_usage(str(user.id))

        # Check monthly live lecture count limit
        if not is_unlimited(limits["live_lectures_per_month"]):
            if monthly["live_lectures"] >= limits["live_lectures_per_month"]:
                raise HTTPException(status_code=403, detail={
                    "error": "live_limit_reached",
                    "limit": limits["live_lectures_per_month"],
                    "plan": plan_tier,
                    "resets_at": _next_month_iso(),
                })

        # Check total monthly hours cap
        total_min_limit = limits.get("total_minutes_per_month")
        if total_min_limit is not None:
            if monthly["total_minutes_used"] >= total_min_limit:
                raise HTTPException(status_code=403, detail={
                    "error": "hours_limit_reached",
                    "limit_hours": total_min_limit // 60,
                    "used_hours": round(monthly["total_minutes_used"] / 60, 1),
                    "plan": plan_tier,
                    "resets_at": _next_month_iso(),
                })

        lecture_id      = create_lecture(title="Live Session", transcript="", user_id=str(user.id))
        live_session_id = create_live_session(lecture_id)
        try:
            increment_monthly_live(str(user.id))
        except Exception:
            pass
        max_dur = limits["live_max_duration_seconds"]
        return {
            "lecture_id": lecture_id,
            "live_session_id": live_session_id,
            "status": "started",
            "plan_tier": plan_tier,
            "limits": {
                "max_duration_seconds": max_dur,
                "is_unlimited": is_unlimited(max_dur),
                "visual_capture": bool(limits.get("visual_capture")),
            },
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to start live session")


_openai_client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None


def _generate_lecture_title(chunk_text: str, topic: str | None) -> str:
    """
    Generates a short, specific lecture title from the first meaningful transcript chunk.
    Called at chunk_idx == 1 when the title is still the default "Live Session".
    """
    if not _openai_client:
        return "Live Session"
    topic_hint = f" The topic appears to be: {topic}." if topic else ""
    prompt = (
        f"Generate a short, specific title (max 8 words) for a lecture based on this transcript excerpt.{topic_hint} "
        "The title should describe what specific concepts or ideas are being taught. "
        "Do NOT use generic titles like 'Lecture 1', 'Introduction', 'Overview', or 'Fundamentals'.\n\n"
        f"Transcript excerpt:\n{chunk_text[:600]}\n\n"
        "Respond with only the title, no quotes or punctuation at the end."
    )
    resp = _openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=30,
        temperature=0.3,
    )
    return resp.choices[0].message.content.strip().strip('"').strip("'")


def _run_summarization(
    lecture_id: str,
    chunk_text: str,
    chunk_idx: int,
    language: str,
    topic,              # str | None — value already stored in DB; passed to avoid re-fetch
    cif_type: str = "LECTURE",
    cif_confidence: float = 1.0,
):
    """
    Background worker: CIF routing → micro summary → N.A.S.T. → section + master summary.
    Uses a fresh Supabase client per invocation (Fix 2 — thread safety).
    Per-step try/except blocks (Fix 7) ensure one failure never silently drops
    all later steps.
    FastAPI BackgroundTasks runs sync functions in the thread pool.
    """
    # Fix 2: fresh client per invocation avoids "Server disconnected" errors
    db = get_client()
    if not db:
        print(f"[BG] No DB client for lecture {lecture_id}")
        return

    # ── CIF Routing ───────────────────────────────────────────────────────────
    # Only act on high-confidence non-lecture classifications (> 0.75).
    # On confidence <= 0.75 for any type: fall through to normal summarization.
    if cif_confidence > 0.75:
        if cif_type == "OFF_TOPIC":
            print(f"[BG][CIF] Dropped OFF_TOPIC chunk (lecture={lecture_id})")
            return
        if cif_type == "STUDENT_QUESTION":
            try:
                save_student_question(lecture_id, chunk_text)
                print(f"[BG][CIF] Saved STUDENT_QUESTION for lecture={lecture_id}")
            except Exception as sq_err:
                print(f"[BG][CIF] save_student_question failed (non-fatal): {sq_err}")
            return
        # LECTURER_RESPONSE → treat as LECTURE, fall through

    # ── Phase 1: micro summary ────────────────────────────────────────────────
    try:
        micro = generate_micro_summary(chunk_text, language=language)

        # Merge visual content captured in the same 12-second window (non-fatal)
        try:
            visual_frames = get_visual_frames_in_window(
                lecture_id, chunk_idx * 12, (chunk_idx + 1) * 12
            )
            if visual_frames:
                visual_text = "\n".join(
                    f["formatted_text"] for f in visual_frames
                    if f.get("formatted_text")
                )
                if visual_text:
                    micro = micro + "\n[Visual content: " + visual_text + "]"
        except Exception as ve:
            print(f"[BG] Visual merge failed (non-fatal): {ve}")

        db.table("lecture_chunks").insert({
            "lecture_id":    lecture_id,
            "transcript":    chunk_text,
            "micro_summary": micro,
            "chunk_index":   chunk_idx,
        }).execute()
    except Exception as e:
        print(f"[BG] Micro summary / chunk insert failed for lecture {lecture_id}: {e}")
        return  # can't proceed without the micro summary row

    # ── Auto-title at 2nd chunk ───────────────────────────────────────────────
    if chunk_idx == 1:
        try:
            title_resp = db.table("lectures").select("title").eq("id", lecture_id).execute()
            if title_resp.data and title_resp.data[0].get("title") == "Live Session":
                new_title = _generate_lecture_title(chunk_text, topic)
                db.table("lectures").update({"title": new_title}).eq("id", lecture_id).execute()
                print(f"[BG] Auto-set title '{new_title}' for lecture {lecture_id}")
        except Exception as e:
            print(f"[BG] Title generation failed (non-fatal): {e}")

    # ── N.A.S.T. + section + master summary ──────────────────────────────────
    try:
        last_sec_resp = (
            db.table("lecture_sections")
            .select("chunk_range_end")
            .eq("lecture_id", lecture_id)
            .order("section_index", desc=True)
            .limit(1)
            .execute()
        )
        last_sec_end = (
            last_sec_resp.data[0]["chunk_range_end"]
            if (hasattr(last_sec_resp, "data") and last_sec_resp.data)
            else -1
        )

        pending_resp = (
            db.table("lecture_chunks")
            .select("chunk_index, micro_summary")
            .eq("lecture_id", lecture_id)
            .gt("chunk_index", last_sec_end)
            .order("chunk_index", desc=False)
            .execute()
        )
        pending_chunks = pending_resp.data if hasattr(pending_resp, "data") else []

        if not pending_chunks:
            return

        trigger, nast_debug = should_trigger_section(pending_chunks)
        if not trigger:
            return

        start_idx = pending_chunks[0]["chunk_index"]
        last_idx  = pending_chunks[-1]["chunk_index"]

        # Fix 1: use COUNT(*) from lecture_sections — always accurate, never lags
        # like total_sections column can after concurrent inserts.
        section_count = get_latest_section_count(lecture_id)

        micro_list = [c["micro_summary"] for c in pending_chunks]

        # Phase 2: section summary (topic-aware)
        new_section = generate_section_summary(micro_list, language=language, topic=topic)

        # Fix 1: upsert with ignore_duplicates handles any remaining race window
        try:
            db.table("lecture_sections").upsert(
                {
                    "lecture_id":         lecture_id,
                    "section_summary":    new_section,
                    "chunk_range_start":  start_idx,
                    "chunk_range_end":    last_idx,
                    "section_index":      section_count,
                },
                on_conflict="lecture_id,section_index",
                ignore_duplicates=True,
            ).execute()
            db.table("lectures").update(
                {"total_sections": section_count + 1}
            ).eq("id", lecture_id).execute()
        except Exception as e:
            if "23505" in str(e):
                print(
                    f"[BG] Duplicate section insert ignored "
                    f"(lecture={lecture_id}, section={section_count})"
                )
            else:
                print(f"[BG] Section insert error (non-fatal): {e}")
                return

    except Exception as e:
        print(f"[BG] N.A.S.T./section error for lecture {lecture_id}: {e}")
        return

    # ── Phase 3: master summary (non-fatal if it fails) ───────────────────────
    try:
        secs_resp = (
            db.table("lecture_sections")
            .select("section_summary")
            .eq("lecture_id", lecture_id)
            .order("section_index", desc=False)
            .execute()
        )
        all_sections = (
            [item["section_summary"] for item in secs_resp.data]
            if hasattr(secs_resp, "data")
            else []
        )
        if all_sections:
            master = generate_master_summary(all_sections, language=language, topic=topic)
            db.table("lectures").update({
                "master_summary": master,
                "summary":        master,
            }).eq("id", lecture_id).execute()
    except Exception as e:
        print(f"[BG] Master summary error for lecture {lecture_id} (non-fatal): {e}")


@router.post("/live/{lecture_id}/chunk")
@limiter.limit("30/minute")
async def process_live_chunk(
    request: Request,
    lecture_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    """
    Hot path — returns after transcription + transcript append.
    All summarization (micro, N.A.S.T., section, master) is offloaded to a
    BackgroundTask so the 12-second recording loop is never blocked.

    Summary updates are pushed to the frontend via the SSE stream endpoint
    GET /live/{lecture_id}/stream rather than the chunk response.
    """
    # 1. Validate session + ownership
    _check_owner(lecture_id, user.id)
    session = get_active_live_session(lecture_id)
    if not session:
        raise HTTPException(status_code=400, detail="Active live session not found")

    # Reject oversized uploads before reading into RAM (DoS protection).
    # Content-Length is checked first; byte-count check after read is the fallback.
    _MAX_CHUNK = 5 * 1024 * 1024  # 5 MB
    cl = request.headers.get("content-length")
    if cl and int(cl) > _MAX_CHUNK:
        raise HTTPException(status_code=413, detail="Audio chunk too large")

    # Validate audio chunk — magic bytes check (rejects non-audio uploads)
    if not await _check_audio_magic(file):
        raise HTTPException(status_code=400, detail="Invalid audio format")

    # Read + secondary size guard (covers clients that omit Content-Length)
    chunk_bytes = await file.read()
    if len(chunk_bytes) > _MAX_CHUNK:
        raise HTTPException(status_code=413, detail="Audio chunk too large")
    await file.seek(0)

    # Fetch plan limits once per chunk (one lightweight DB call)
    profile = get_user_profile(str(user.id))
    plan_tier = profile.get("plan_tier") or "free"
    limits = get_limits(plan_tier)

    # Fix 4: serialize per-lecture so two overlapping chunks never race through
    # transcription + transcript-append for the same lecture simultaneously.
    # Languages Whisper hallucinates on silence — never use these to set lecture language
    _HALLUCINATION_LANGS = {'ja', 'zh'}

    async with _get_lecture_lock(lecture_id):
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

        # 2. Transcribe — no language pin so Whisper handles code-switching.
        #    Each chunk is detected independently. no_speech_prob filtering
        #    handles silence hallucinations (no need for language pinning).
        try:
            chunk_text, detected_language = await transcribe_audio(
                file,
                prompt=whisper_prompt,
            )
        except Exception:
            raise HTTPException(status_code=500, detail="Transcription failed")

        chunk_text = chunk_text.strip()

        if not chunk_text:
            return {"lecture_id": lecture_id, "chunk_transcript": "", "message": "Empty transcription"}

        # 3. Persist language — each chunk's detection is stored independently.
        # Ignore hallucination languages (ja/zh) which Whisper emits on silence.
        stored_language = get_lecture_language(lecture_id)
        if detected_language and detected_language not in _HALLUCINATION_LANGS:
            update_lecture_language(lecture_id, detected_language)
            stored_language = detected_language
        language = stored_language or 'en'

        # 4. Append transcript + update session analytics
        try:
            full_transcript_length = append_lecture_transcript(lecture_id, chunk_text)
            update_live_session_timestamp(session['id'])
            update_lecture_analytics(lecture_id, chunk_duration=12)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to update lecture")

        # 5. Compute chunk_idx inside the lock so a concurrent chunk that already
        #    incremented total_chunks doesn't cause two chunks to share the same index.
        lecture_data = get_lecture_for_summarization(lecture_id)
        chunk_idx    = ((lecture_data.get("total_chunks") or 0) - 1) if lecture_data else 0

    # 6. Topic detection — synchronous, fires exactly once on chunk_idx == 1.
    #    Kept on the hot path so the response carries the topic for the badge.
    topic = get_lecture_topic(lecture_id)
    if chunk_idx == 1 and topic is None:
        try:
            full_transcript = get_lecture_transcript(lecture_id)
            topic = detect_lecture_topic(full_transcript)
            update_lecture_topic(lecture_id, topic)
            print(f"[topic] Detected '{topic}' for lecture {lecture_id}")
        except Exception as e:
            print(f"[topic] Detection failed (non-fatal): {e}")

    # 7. CIF — classify chunk before summarization
    #    Runs synchronously so the result is included in the response.
    #    Fast call (max_tokens=60, temperature=0.1, ~50–100ms).
    try:
        cif_result = classify_chunk(chunk_text, topic)
    except Exception as cif_err:
        print(f"[CIF] classify_chunk raised unexpectedly (failing toward inclusion): {cif_err}")
        cif_result = {"type": "LECTURE", "confidence": 0.5, "note": ""}

    # 8. Offload summarization (CIF result passed through for routing)
    background_tasks.add_task(
        _run_summarization,
        lecture_id=lecture_id,
        chunk_text=chunk_text,
        chunk_idx=chunk_idx,
        language=language,
        topic=topic,
        cif_type=cif_result["type"],
        cif_confidence=cif_result["confidence"],
    )

    # Duration limit check
    base_response = {
        "lecture_id":             lecture_id,
        "chunk_transcript":       chunk_text,
        "full_transcript_length": full_transcript_length,
        "language":               language,
        "topic":                  topic,
        "cif_type":               cif_result["type"],
        "cif_confidence":         cif_result["confidence"],
    }

    if not is_unlimited(limits["live_max_duration_seconds"]):
        total_seconds = (lecture_data or {}).get("total_duration_seconds", 0) or 0
        max_seconds = limits["live_max_duration_seconds"]
        if total_seconds >= max_seconds:
            end_live_session(lecture_id)
            return {**base_response, "session_auto_ended": True, "reason": "duration_limit_reached", "plan": plan_tier, "limit_seconds": max_seconds}
        warning_threshold = max_seconds - 300
        if total_seconds >= warning_threshold:
            return {**base_response, "duration_warning": True, "seconds_remaining": max_seconds - total_seconds}

    return base_response


@router.post("/live/{lecture_id}/frame")
@limiter.limit("30/minute")
async def process_visual_frame(
    request: Request,
    lecture_id: str,
    body: FrameRequest,
    user=Depends(get_current_user),
):
    """
    Processes a screen capture frame for visual content.
    Analyzes with GPT-4o Vision only when screen content has meaningfully changed.
    Student/Pro only — free plan returns 403 feature_locked.
    """
    _check_owner(lecture_id, user.id)

    # Check plan
    profile = get_user_profile(str(user.id))
    limits = get_limits(profile.get("plan_tier", "free"))
    if not limits.get("visual_capture"):
        raise HTTPException(status_code=403, detail={
            "error": "feature_locked",
            "feature": "visual_capture",
            "required_plan": "student",
        })

    # Verify session is active
    session = get_active_live_session(lecture_id)
    if not session:
        raise HTTPException(status_code=400, detail="No active session")

    # Get topic for context
    topic = get_lecture_topic(lecture_id)

    from app.services.vision_service import (
        analyze_frame,
        analyze_board_frame,
        format_visual_for_summary,
        should_send_frame,
    )

    # Change detection — skip if frame is visually unchanged
    if not should_send_frame(body.image_base64, body.last_frame_hash):
        return {"analyzed": False, "reason": "no_change", "lecture_id": lecture_id}

    # Route to correct analyzer: board camera (Phase 2) or screen capture (Phase 1)
    source = "board" if body.camera_mode else "screen"
    if body.camera_mode:
        visual = await analyze_board_frame(body.image_base64, topic)
    else:
        visual = await analyze_frame(body.image_base64, topic)

    if not visual or not visual.get("has_content"):
        return {
            "analyzed":   True,
            "has_content": False,
            "issue":      visual.get("issue") if visual else None,
            "lecture_id": lecture_id,
        }

    visual_text = format_visual_for_summary(visual)
    try:
        save_visual_frame(
            lecture_id=lecture_id,
            timestamp_seconds=body.timestamp_seconds,
            visual_data=visual,
            formatted_text=visual_text,
            source=source,
        )
    except Exception as e:
        print(f"[VISION] save_visual_frame failed (non-fatal): {e}")

    return {
        "analyzed":     True,
        "has_content":  True,
        "content_type": visual.get("content_type"),
        "confidence":   visual.get("confidence"),
        "summary":      visual.get("summary"),
        "source":       source,
        "lecture_id":   lecture_id,
    }


@router.get("/live/{lecture_id}/stream")
async def stream_summary(lecture_id: str, token: str = Query(None)):
    """
    Server-Sent Events stream for live summary + topic updates.
    Requires a Bearer token passed as ?token= query param (EventSource can't set headers).
    Polls Supabase every 2 s and pushes a JSON event whenever master_summary
    or topic changes.  The frontend connects on session start and closes the
    EventSource on session end.

    Event payload (JSON): { "summary": "...", "topic": "..." }
    Each field is only included when it has changed.
    A ": heartbeat" comment is sent every ~30 s to keep proxies from timing out.
    """
    # Authenticate via query param since EventSource doesn't support custom headers
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await get_current_user(f"Bearer {token}")
    _check_owner(lecture_id, user.id)
    async def event_generator():
        last_summary  = None
        last_topic    = None
        idle_ticks    = 0           # counts 2-second polls with no change
        elapsed       = 0           # total seconds elapsed (Fix 5: max 4 h cap)
        max_duration  = 14400       # 4 hours in seconds

        try:
            while True:
                await asyncio.sleep(2)
                idle_ticks += 1
                elapsed    += 2

                # Fix 5: hard session timeout — prevents zombie SSE streams
                if elapsed >= max_duration:
                    yield f"data: {json.dumps({'event': 'session-timeout'})}\n\n"
                    break

                try:
                    data = await asyncio.to_thread(get_lecture_for_summarization, lecture_id)
                    if data:
                        current_summary = data.get("master_summary") or data.get("summary") or ""
                        current_topic   = data.get("topic")

                        event_data = {}
                        if current_summary and current_summary != last_summary:
                            last_summary = current_summary
                            event_data["summary"] = current_summary

                        if current_topic and current_topic != last_topic:
                            last_topic = current_topic
                            event_data["topic"] = current_topic

                        if event_data:
                            idle_ticks = 0
                            yield f"data: {json.dumps(event_data)}\n\n"

                except asyncio.CancelledError:
                    break
                except Exception as e:
                    print(f"[SSE] poll error for {lecture_id}: {e}")

                # Fix 5: heartbeat every ~15 s (7 × 2-second ticks) instead of 30 s
                if idle_ticks >= 7:
                    idle_ticks = 0
                    yield ": heartbeat\n\n"

        except (asyncio.CancelledError, GeneratorExit):
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable Nginx buffering
        },
    )


@router.post("/live/{lecture_id}/end")
def end_session_endpoint(lecture_id: str, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    """
    Ends the live session and forces a final summary pass so the session
    always ends with a complete, up-to-date master summary.
    """
    _check_owner(lecture_id, user.id)
    try:
        end_live_session(lecture_id)

        try:
            lecture_data = get_lecture_for_summarization(lecture_id)
            language     = get_lecture_language(lecture_id) or "en"
            topic        = get_lecture_topic(lecture_id)

            if lecture_data:
                last_sec_end   = get_latest_section_end_index(lecture_id)
                pending_chunks = get_unsummarized_chunks(lecture_id, last_sec_end)

                # Force a final section from any remaining unsummarized chunks
                if pending_chunks:
                    micro_list         = [c['micro_summary'] for c in pending_chunks if c.get('micro_summary')]
                    current_total_secs = lecture_data.get("total_sections") or 0
                    start_idx          = pending_chunks[0]['chunk_index']
                    last_idx           = pending_chunks[-1]['chunk_index']
                    if micro_list:
                        final_section = generate_section_summary(micro_list, language=language, topic=topic)
                        create_lecture_section(
                            lecture_id, final_section, start_idx, last_idx, current_total_secs
                        )

                # Rebuild master from all sections
                all_sections = get_section_summaries(lecture_id)
                if all_sections:
                    master = generate_master_summary(all_sections, language=language, topic=topic)
                    update_lecture_summary_only(lecture_id, master)

        except Exception as e:
            print(f"Final summary on end (non-fatal): {e}")

        # Release per-lecture lock so memory doesn't grow unbounded
        if lecture_id in _lecture_locks:
            del _lecture_locks[lecture_id]

        # Purge chunks older than 30 days (completed lectures only) in background
        background_tasks.add_task(cleanup_old_chunks, 30)

        # Kick off definitive recompute from raw transcript
        set_summary_status(lecture_id, "recomputing")
        background_tasks.add_task(recompute_final_summary, lecture_id)

        return {"status": "ended", "lecture_id": lecture_id}

    except Exception:
        raise HTTPException(status_code=500, detail="Failed to end session")


@router.get("/lectures/{lecture_id}/analytics")
def get_analytics(lecture_id: str, user=Depends(get_current_user)):
    _check_owner(lecture_id, user.id)
    try:
        data = get_lecture_for_summarization(lecture_id)
        if not data:
            raise HTTPException(status_code=404, detail="Lecture not found")
        transcript  = data.get("transcript") or ""
        summary     = data.get("summary") or ""
        t_len       = len(transcript)
        s_len       = len(summary)
        return {
            "word_count":             len(transcript.split()) if transcript else 0,
            "transcript_length":      t_len,
            "total_chunks":           data.get("total_chunks") or 0,
            "total_duration_seconds": data.get("total_duration_seconds") or 0,
            "compression_ratio":      round(s_len / t_len, 2) if t_len > 0 else 0.0,
            "language":               data.get("language") or "en",
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch analytics")


@router.get("/lectures/{lecture_id}/export/pdf")
@limiter.limit("3/minute")
async def export_pdf(request: Request, lecture_id: str, user=Depends(get_current_user)):
    _check_owner(lecture_id, user.id)
    try:
        pdf_bytes = await generate_lecture_pdf(lecture_id)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=lecture_{lecture_id}.pdf"}
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in export_pdf: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate PDF")


@router.get("/lectures")
def get_lectures(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
):
    """
    Returns lectures for the authenticated user sorted by created_at DESC.
    Used by the Dashboard to display the user's lecture history.
    """
    try:
        return get_recent_lectures(limit=limit, offset=offset, user_id=str(user.id))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch lectures")


@router.get("/lectures/{lecture_id}")
def get_lecture_details(lecture_id: str, user=Depends(get_current_user)):
    _check_owner(lecture_id, user.id)
    lecture = get_lecture_for_summarization(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return lecture


@router.post("/ask/{lecture_id}")
@limiter.limit("20/minute")
def ask_question_auth(request: Request, lecture_id: str, body: QuestionRequest, user=Depends(get_current_user)):
    _check_owner(lecture_id, user.id)
    try:
        answer = answer_lecture_question(lecture_id, body.question)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to answer question")
    return {"lecture_id": lecture_id, "question": body.question, "answer": answer}


@router.get("/lectures/{lecture_id}/full")
def get_lecture_full_endpoint(lecture_id: str, user=Depends(get_current_user)):
    """Returns the complete lecture data including transcript, summary, and share state."""
    _check_owner(lecture_id, user.id)
    lecture = get_lecture_full(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return lecture


@router.get("/lectures/{lecture_id}/visual-frames")
def get_lecture_visual_frames(lecture_id: str, user=Depends(get_current_user)):
    """Returns all visual frames captured during a lecture, in chronological order."""
    _check_owner(lecture_id, user.id)
    try:
        frames = get_visual_frames(lecture_id)
        return {"lecture_id": lecture_id, "frames": frames, "count": len(frames)}
    except Exception as e:
        print(f"[visual-frames] fetch error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch visual frames")


@router.post("/lectures/{lecture_id}/share")
@limiter.limit("20/minute")
def share_lecture(request: Request, lecture_id: str, body: ShareRequest = None, user=Depends(get_current_user)):
    """Generates (or returns existing) share token with optional mode and expiry."""
    _check_owner(lecture_id, user.id)
    mode = body.mode if body else "full"
    expires_at = body.expires_at if body else None
    try:
        token = generate_share_token(lecture_id, mode=mode, expires_at=expires_at)
        return {"share_url": f"/share/{token}", "mode": mode, "expires_at": expires_at}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate share link")


@router.post("/lectures/{lecture_id}/unshare")
def unshare_lecture(lecture_id: str, user=Depends(get_current_user)):
    """Removes the share token, making the lecture private."""
    _check_owner(lecture_id, user.id)
    try:
        clear_share_token(lecture_id)
        return {"unshared": True}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to unshare")


@router.get("/share/{token}")
@limiter.limit("30/minute")
def get_shared_lecture(request: Request, token: str):
    """Public endpoint — no auth required. Finds lecture by share token."""
    lecture = get_lecture_by_share_token(token)
    if not lecture:
        raise HTTPException(status_code=404, detail="Shared lecture not found")
    if lecture.get("expired"):
        raise HTTPException(status_code=410, detail="Share link has expired")
    try:
        increment_share_views(lecture["id"])
    except Exception:
        pass
    return lecture


@router.delete("/lectures/{lecture_id}")
@limiter.limit("10/minute")
def delete_lecture_endpoint(request: Request, lecture_id: str, user=Depends(get_current_user)):
    """Permanently deletes a lecture and all associated data."""
    _check_owner(lecture_id, user.id)
    try:
        delete_lecture(lecture_id)
        return {"status": "deleted", "lecture_id": lecture_id}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to delete lecture")


class TitleUpdateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


@router.patch("/lectures/{lecture_id}/title")
def update_lecture_title_endpoint(lecture_id: str, request: TitleUpdateRequest, user=Depends(get_current_user)):
    """Updates a lecture's title."""
    _check_owner(lecture_id, user.id)
    title = request.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    try:
        update_lecture_title(lecture_id, title)
        return {"lecture_id": lecture_id, "title": title}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to update title")


# =============================================================================
#  PROFILE ENDPOINTS
# =============================================================================

class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(None, max_length=100)
    preferred_language: str | None = Field(None, max_length=10)
    pdf_auto_download: bool | None = None


@router.get("/profile")
def get_profile(user=Depends(get_current_user)):
    """Returns the authenticated user's profile."""
    try:
        profile = get_user_profile(str(user.id))
        profile["email"] = getattr(user, "email", None)
        return profile
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch profile")


@router.patch("/profile")
@limiter.limit("20/minute")
def patch_profile(request: Request, body: ProfileUpdateRequest, user=Depends(get_current_user)):
    """Updates the authenticated user's profile fields."""
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        updated = update_user_profile(str(user.id), data)
        return updated
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to update profile")


@router.delete("/profile")
@limiter.limit("3/hour")
def delete_profile(request: Request, user=Depends(get_current_user)):
    """Deletes the authenticated user's account and all associated data."""
    try:
        delete_user_account(str(user.id))
        return {"status": "deleted"}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to delete account")


@router.get("/usage")
def get_usage(user=Depends(get_current_user)):
    """Returns comprehensive usage stats for the current month."""
    # Ensure a profile row exists so every signed-up user appears in admin
    ensure_user_profile(str(user.id), getattr(user, "email", "") or "")
    try:
        profile = get_user_profile(str(user.id))
        plan_tier = profile.get("plan_tier") or "free"
        limits = get_limits(plan_tier)

        monthly              = get_monthly_usage(str(user.id))
        lectures_count       = monthly["live_lectures"]
        uploads_count        = monthly["uploads"]
        total_minutes_used   = monthly["total_minutes_used"]
        total_lectures_count = get_total_lecture_count(str(user.id))

        live_limit       = limits["live_lectures_per_month"]
        upload_limit     = limits["uploads_per_month"]
        max_live_dur     = limits["live_max_duration_seconds"]
        max_up_dur       = limits["upload_max_duration_seconds"]
        total_min_limit  = limits.get("total_minutes_per_month")

        def _dur_label(secs):
            if secs is None: return "Unlimited"
            m = secs // 60
            h = m // 60
            if h >= 1 and m % 60 == 0: return f"{h} hour{'s' if h > 1 else ''}"
            if h >= 1: return f"{h}h {m % 60}m"
            return f"{m} min"

        resets_at = _next_month_iso()
        return {
            "lectures_this_month":       lectures_count,
            "lectures_limit":            live_limit,
            "lectures_remaining":        max(0, live_limit - lectures_count) if live_limit is not None else None,
            "uploads_this_month":        uploads_count,
            "uploads_limit":             upload_limit,
            "uploads_remaining":         max(0, upload_limit - uploads_count) if upload_limit is not None else None,
            "live_max_duration_seconds": max_live_dur,
            "live_max_duration_label":   _dur_label(max_live_dur),
            "upload_max_duration_label": _dur_label(max_up_dur),
            "total_minutes_used":        total_minutes_used,
            "total_hours_used":          round(total_minutes_used / 60, 1),
            "total_minutes_limit":       total_min_limit,
            "total_hours_limit":         (total_min_limit // 60) if total_min_limit is not None else None,
            "hours_remaining":           max(0, (total_min_limit - total_minutes_used) // 60) if total_min_limit is not None else None,
            "plan_tier":                 plan_tier,
            "month_resets_at":           resets_at,
            "total_lectures_all_time":   total_lectures_count,
            # Legacy fields
            "limit":                     live_limit,
            "remaining":                 max(0, live_limit - lectures_count) if live_limit is not None else None,
            "resets_at":                 resets_at,
            "limit_reached":             live_limit is not None and lectures_count >= live_limit,
        }
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch usage")

