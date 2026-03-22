import asyncio
import json

from fastapi import APIRouter, BackgroundTasks, UploadFile, File, HTTPException, Depends
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
import numpy as np
from openai import OpenAI

from app.core.config import settings
from app.core.auth import get_current_user
from app.services.openai_service import transcribe_audio
from app.services.explanation_service import generate_explanation
from app.services.qa_service import answer_lecture_question
from app.services.pdf_service import generate_lecture_pdf
from app.services.topic_service import detect_lecture_topic
from app.services.summarization_service import (
    generate_micro_summary,
    generate_section_summary,
    generate_master_summary,
)
from app.services.embedding_service import get_embeddings, cosine_similarity
from app.services.cif_service import classify_chunk
from app.services.supabase_service import (
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
)


def _check_owner(lecture_id: str, user_id: str) -> None:
    """
    Raises 403 if the lecture has a user_id that doesn't match.
    Permits access to legacy lectures (user_id is NULL) so existing data isn't locked out.
    """
    owner_id = get_lecture_owner(lecture_id)
    if owner_id and str(owner_id) != str(user_id):
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
    question: str

class ExplainRequest(BaseModel):
    text: str
    mode: str = "simple"


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
def explain_text(lecture_id: str, request: ExplainRequest):
    topic = get_lecture_topic(lecture_id)
    explanation_data = generate_explanation(request.text, request.mode, topic=topic)
    return {
        "lecture_id":  lecture_id,
        "explanation": explanation_data.get("explanation"),
        "analogy":     explanation_data.get("analogy"),
        "breakdown":   explanation_data.get("breakdown"),
    }


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    allowed_extensions = ('.mp3', '.wav', '.m4a', '.mp4', '.mpeg', '.mpga', '.webm')
    if not file.filename.lower().endswith(allowed_extensions):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Supported formats: {', '.join(allowed_extensions)}"
        )
    transcript_text, language = await transcribe_audio(file)
    try:
        title = file.filename.rsplit('.', 1)[0]
        lecture_id = save_lecture(title=title, transcript=transcript_text, language=language)
        return {"lecture_id": lecture_id, "transcript": transcript_text, "language": language}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save lecture: {str(e)}")


@router.get("/summarize/{lecture_id}")
def summarize(lecture_id: str):
    lecture = get_lecture_for_summarization(lecture_id)
    summary = lecture.get("master_summary") or lecture.get("summary") or "Processing..."
    return {"lecture_id": lecture_id, "summary": summary}




@router.post("/live/start")
def start_live_session(user=Depends(get_current_user)):
    try:
        lecture_id      = create_lecture(title="Live Session", transcript="", user_id=str(user.id))
        live_session_id = create_live_session(lecture_id)
        return {"lecture_id": lecture_id, "live_session_id": live_session_id, "status": "started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start live session: {str(e)}")


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
async def process_live_chunk(
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

    # Fix 4: serialize per-lecture so two overlapping chunks never race through
    # transcription + transcript-append for the same lecture simultaneously.
    async with _get_lecture_lock(lecture_id):
        # 2. Transcribe
        try:
            chunk_text, detected_language = await transcribe_audio(file)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

        if not chunk_text:
            return {"lecture_id": lecture_id, "chunk_transcript": "", "message": "Empty transcription"}

        # 3. Persist language (stored value wins after first detection)
        stored_language = get_lecture_language(lecture_id)
        if stored_language == "en" and detected_language != "en":
            update_lecture_language(lecture_id, detected_language)
            stored_language = detected_language
        language = stored_language

        # 4. Append transcript + update session analytics
        try:
            full_transcript_length = append_lecture_transcript(lecture_id, chunk_text)
            update_live_session_timestamp(session['id'])
            update_lecture_analytics(lecture_id, chunk_duration=12)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to update lecture: {str(e)}")

    # 5. Compute chunk_idx (needed by background task and topic detection)
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

    return {
        "lecture_id":             lecture_id,
        "chunk_transcript":       chunk_text,
        "full_transcript_length": full_transcript_length,
        "language":               language,
        "topic":                  topic,
        "cif_type":               cif_result["type"],
        "cif_confidence":         cif_result["confidence"],
    }


@router.get("/live/{lecture_id}/stream")
async def stream_summary(lecture_id: str):
    """
    Server-Sent Events stream for live summary + topic updates.
    Polls Supabase every 2 s and pushes a JSON event whenever master_summary
    or topic changes.  The frontend connects on session start and closes the
    EventSource on session end.

    Event payload (JSON): { "summary": "...", "topic": "..." }
    Each field is only included when it has changed.
    A ": heartbeat" comment is sent every ~30 s to keep proxies from timing out.
    """
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
def end_session_endpoint(lecture_id: str, user=Depends(get_current_user)):
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

        # Fix 4: release per-lecture lock so memory doesn't grow unbounded
        if lecture_id in _lecture_locks:
            del _lecture_locks[lecture_id]

        return {"status": "ended", "lecture_id": lecture_id}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to end session: {str(e)}")


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
        raise HTTPException(status_code=500, detail=f"Failed to fetch analytics: {str(e)}")


@router.get("/lectures/{lecture_id}/export/pdf")
async def export_pdf(lecture_id: str, user=Depends(get_current_user)):
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
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")


@router.get("/lectures")
def get_lectures(limit: int = 20, offset: int = 0, user=Depends(get_current_user)):
    """
    Returns lectures for the authenticated user sorted by created_at DESC.
    Used by the Dashboard to display the user's lecture history.
    """
    try:
        return get_recent_lectures(limit=limit, offset=offset, user_id=str(user.id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch lectures: {str(e)}")


@router.get("/lectures/{lecture_id}")
def get_lecture_details(lecture_id: str, user=Depends(get_current_user)):
    _check_owner(lecture_id, user.id)
    lecture = get_lecture_for_summarization(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return lecture


@router.post("/ask/{lecture_id}")
def ask_question_auth(lecture_id: str, request: QuestionRequest, user=Depends(get_current_user)):
    _check_owner(lecture_id, user.id)
    answer = answer_lecture_question(lecture_id, request.question)
    return {"lecture_id": lecture_id, "question": request.question, "answer": answer}


@router.get("/lectures/{lecture_id}/full")
def get_lecture_full_endpoint(lecture_id: str, user=Depends(get_current_user)):
    """Returns the complete lecture data including transcript, summary, and share state."""
    _check_owner(lecture_id, user.id)
    lecture = get_lecture_full(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return lecture


@router.post("/lectures/{lecture_id}/share")
def share_lecture(lecture_id: str, user=Depends(get_current_user)):
    """Generates (or returns existing) share token. Returns the share URL path."""
    _check_owner(lecture_id, user.id)
    try:
        token = generate_share_token(lecture_id)
        return {"share_url": f"/share/{token}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate share link: {str(e)}")


@router.post("/lectures/{lecture_id}/unshare")
def unshare_lecture(lecture_id: str, user=Depends(get_current_user)):
    """Removes the share token, making the lecture private."""
    _check_owner(lecture_id, user.id)
    try:
        clear_share_token(lecture_id)
        return {"unshared": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to unshare: {str(e)}")


@router.get("/share/{token}")
def get_shared_lecture(token: str):
    """Public endpoint — no auth required. Finds lecture by share token."""
    lecture = get_lecture_by_share_token(token)
    if not lecture:
        raise HTTPException(status_code=404, detail="Shared lecture not found")
    try:
        increment_share_views(lecture["id"])
    except Exception:
        pass
    return lecture


@router.delete("/lectures/{lecture_id}")
def delete_lecture_endpoint(lecture_id: str, user=Depends(get_current_user)):
    """Permanently deletes a lecture and all associated data."""
    _check_owner(lecture_id, user.id)
    try:
        delete_lecture(lecture_id)
        return {"status": "deleted", "lecture_id": lecture_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete lecture: {str(e)}")


class TitleUpdateRequest(BaseModel):
    title: str


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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update title: {str(e)}")


# =============================================================================
#  PROFILE ENDPOINTS
# =============================================================================

class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    preferred_language: str | None = None
    pdf_auto_download: bool | None = None


@router.get("/profile")
def get_profile(user=Depends(get_current_user)):
    """Returns the authenticated user's profile."""
    try:
        profile = get_user_profile(str(user.id))
        profile["email"] = getattr(user, "email", None)
        return profile
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch profile: {str(e)}")


@router.patch("/profile")
def patch_profile(request: ProfileUpdateRequest, user=Depends(get_current_user)):
    """Updates the authenticated user's profile fields."""
    data = request.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        updated = update_user_profile(str(user.id), data)
        return updated
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update profile: {str(e)}")


@router.delete("/profile")
def delete_profile(user=Depends(get_current_user)):
    """Deletes the authenticated user's account and all associated data."""
    try:
        delete_user_account(str(user.id))
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete account: {str(e)}")


@router.get("/usage")
def get_usage(user=Depends(get_current_user)):
    """Returns usage stats for the current month."""
    from datetime import datetime, timezone
    try:
        usage = get_monthly_lecture_count(str(user.id))
        count = usage["count"]
        limit = 5  # free plan
        now = datetime.now(timezone.utc)
        # First day of next month
        if now.month == 12:
            resets_at = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            resets_at = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
        return {
            "lectures_this_month": count,
            "limit": limit,
            "remaining": max(0, limit - count),
            "plan_tier": "free",
            "resets_at": resets_at.isoformat(),
            "limit_reached": count >= limit,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch usage: {str(e)}")
