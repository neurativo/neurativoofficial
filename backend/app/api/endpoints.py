import asyncio
import json

from fastapi import APIRouter, BackgroundTasks, UploadFile, File, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
import numpy as np

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
)


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
        "divergence": round(divergence_score, 3),
        "drift":      round(drift_score, 3),
        "momentum":   round(momentum_score, 3),
        "composite":  round(composite, 3),
        "threshold":  TRIGGER_THRESHOLD,
        "triggered":  should_fire,
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


@router.post("/ask/{lecture_id}")
def ask_question(lecture_id: str, request: QuestionRequest):
    answer = answer_lecture_question(lecture_id, request.question)
    return {"lecture_id": lecture_id, "question": request.question, "answer": answer}


@router.post("/live/start")
def start_live_session():
    try:
        lecture_id      = create_lecture(title="Live Session", transcript="")
        live_session_id = create_live_session(lecture_id)
        return {"lecture_id": lecture_id, "live_session_id": live_session_id, "status": "started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start live session: {str(e)}")


def _run_summarization(
    lecture_id: str,
    chunk_text: str,
    chunk_idx: int,
    language: str,
    topic,          # str | None — value already stored in DB; passed to avoid re-fetch
):
    """
    Background worker: micro summary → N.A.S.T. → section + master summary.
    Runs off the hot /chunk path so the endpoint returns after transcription.
    FastAPI BackgroundTasks runs sync functions in the thread pool.
    """
    try:
        # Phase 1: micro summary
        micro = generate_micro_summary(chunk_text, language=language)
        create_lecture_chunk(lecture_id, chunk_text, micro, chunk_idx)

        # N.A.S.T.: section boundary detection
        last_sec_end   = get_latest_section_end_index(lecture_id)
        pending_chunks = get_unsummarized_chunks(lecture_id, last_sec_end)

        if pending_chunks:
            trigger, nast_debug = should_trigger_section(pending_chunks)

            if trigger:
                start_idx      = pending_chunks[0]['chunk_index']
                last_idx       = pending_chunks[-1]['chunk_index']
                lecture_data   = get_lecture_for_summarization(lecture_id)
                total_secs     = (lecture_data.get("total_sections") or 0) if lecture_data else 0
                micro_list     = [c['micro_summary'] for c in pending_chunks]

                # Phase 2: section summary (topic-aware)
                new_section = generate_section_summary(micro_list, language=language, topic=topic)
                create_lecture_section(lecture_id, new_section, start_idx, last_idx, total_secs)

                # Phase 3: master summary (topic-aware)
                all_sections = get_section_summaries(lecture_id)
                if all_sections:
                    master = generate_master_summary(all_sections, language=language, topic=topic)
                    update_lecture_summary_only(lecture_id, master)

    except Exception as e:
        print(f"[summarization bg] Error for lecture {lecture_id}: {e}")


@router.post("/live/{lecture_id}/chunk")
async def process_live_chunk(
    lecture_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """
    Hot path — returns after transcription + transcript append.
    All summarization (micro, N.A.S.T., section, master) is offloaded to a
    BackgroundTask so the 12-second recording loop is never blocked.

    Summary updates are pushed to the frontend via the SSE stream endpoint
    GET /live/{lecture_id}/stream rather than the chunk response.
    """
    # 1. Validate session
    session = get_active_live_session(lecture_id)
    if not session:
        raise HTTPException(status_code=400, detail="Active live session not found")

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

    # 7. Offload summarization
    background_tasks.add_task(
        _run_summarization,
        lecture_id=lecture_id,
        chunk_text=chunk_text,
        chunk_idx=chunk_idx,
        language=language,
        topic=topic,
    )

    return {
        "lecture_id":             lecture_id,
        "chunk_transcript":       chunk_text,
        "full_transcript_length": full_transcript_length,
        "language":               language,
        "topic":                  topic,
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

        try:
            while True:
                await asyncio.sleep(2)
                idle_ticks += 1

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

                # Heartbeat comment every ~30 s (15 × 2-second ticks)
                if idle_ticks >= 15:
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
def end_session_endpoint(lecture_id: str):
    """
    Ends the live session and forces a final summary pass so the session
    always ends with a complete, up-to-date master summary.
    """
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

        return {"status": "ended", "lecture_id": lecture_id}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to end session: {str(e)}")


@router.get("/lectures/{lecture_id}/analytics")
def get_analytics(lecture_id: str):
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
async def export_pdf(lecture_id: str):
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


@router.get("/lectures/{lecture_id}")
def get_lecture_details(lecture_id: str):
    lecture = get_lecture_for_summarization(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return lecture
