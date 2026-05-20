import uuid as _uuid

from supabase import create_client, Client
from app.core.config import settings
from datetime import datetime, timezone


# Initialize Supabase client (global singleton for normal synchronous use)
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY) if settings.SUPABASE_URL and settings.SUPABASE_KEY else None


def get_client() -> Client | None:
    """
    Returns a fresh Supabase client with its own connection.
    Use this in background tasks to avoid sharing the global singleton
    across concurrent threads, which causes 'Server disconnected' errors.
    """
    if settings.SUPABASE_URL and settings.SUPABASE_KEY:
        return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return None


def _fresh_db() -> Client:
    """
    Creates a fresh Supabase client and raises if unavailable.
    Used by functions called from background threads (Fix 2: thread safety).
    Each call creates its own connection so threads never share state.
    """
    db = get_client()
    if not db:
        raise Exception("Supabase client is not initialized")
    return db

def save_lecture(title: str, transcript: str, duration_seconds: int = None, language: str = "en", user_id: str = None) -> str:
    """
    Saves a lecture to the Supabase database.

    Args:
        title: The title of the lecture
        transcript: The full transcript text
        duration_seconds: Optional duration in seconds
        language: ISO-639-1 language code detected by Whisper (e.g. "en", "ar")
        user_id: Optional UUID of the authenticated user who owns this lecture

    Returns:
        str: The UUID of the created lecture record
    """
    if not supabase:
        raise Exception("Supabase client is not initialized. check your environment variables.")

    data = {
        "title": title,
        "transcript": transcript,
        "duration_seconds": duration_seconds,
        "language": language,
    }
    if user_id:
        data["user_id"] = user_id

    response = supabase.table("lectures").insert(data).execute()

    if hasattr(response, 'data') and len(response.data) > 0:
        return response.data[0]['id']
    else:
        raise Exception("Failed to insert lecture record: No data returned")

def update_lecture_language(lecture_id: str, language: str):
    """
    Sets the detected language on a lecture record.
    Called on the first chunk of a live session once Whisper returns its detection.
    """
    _fresh_db().table("lectures").update({"language": language}).eq("id", lecture_id).execute()


def get_lecture_language(lecture_id: str):
    """
    Returns the stored ISO-639-1 language code for a lecture, or None if not yet detected.
    Returns None (not 'en') so the caller can distinguish "unset" from "English".
    """
    try:
        response = (
            _fresh_db().table("lectures")
            .select("language")
            .eq("id", lecture_id)
            .execute()
        )
        if hasattr(response, 'data') and len(response.data) > 0:
            lang = response.data[0].get("language")
            return lang if lang else None
    except Exception:
        pass
    return None  # caller uses `stored_language or 'en'` as the final fallback


def get_lecture_topic(lecture_id: str):
    """
    Returns the stored topic label for a lecture, or None if not yet detected.
    """
    if not supabase:
        return None
    response = (
        supabase.table("lectures")
        .select("topic")
        .eq("id", lecture_id)
        .execute()
    )
    if hasattr(response, 'data') and len(response.data) > 0:
        return response.data[0].get("topic") or None
    return None


def update_lecture_topic(lecture_id: str, topic: str):
    """
    Stores the detected topic label on the lecture record.
    """
    if not supabase:
        return
    supabase.table("lectures").update({"topic": topic}).eq("id", lecture_id).execute()


def get_lecture_transcript(lecture_id: str) -> str:
    """
    Retrieves the transcript for a given lecture ID.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
        
    response = supabase.table("lectures").select("transcript").eq("id", lecture_id).execute()
    
    if hasattr(response, 'data') and len(response.data) > 0:
        return response.data[0]['transcript']
    else:
        raise Exception(f"Lecture not found or no transcript available for ID: {lecture_id}")

def update_lecture_summary(lecture_id: str, summary: str):
    """
    Updates the summary for a given lecture ID.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
        
    response = supabase.table("lectures").update({"summary": summary}).eq("id", lecture_id).execute()
    
    # We can check for error or success, but typically if execute() returns without error it's fine.
    # We check if data was returned to ensure the record existed.
    if not (hasattr(response, 'data') and len(response.data) > 0):
         raise Exception(f"Failed to update summary. Lecture ID {lecture_id} might not exist.")


def create_lecture(title: str = "Live Session", transcript: str = "", language: str = "en", user_id: str = None) -> str:
    """
    Creates a new lecture record, useful for initializing live sessions.
    Defaults to empty transcript. Language is updated on first chunk arrival.
    user_id links the lecture to an authenticated user (used for RLS + ownership checks).
    """
    return save_lecture(title, transcript, language=language, user_id=user_id)

def create_live_session(lecture_id: str) -> str:
    """
    Creates a new live session record linked to a lecture.
    
    Args:
        lecture_id: The UUID of the lecture
        
    Returns:
        str: The UUID of the created live session
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
        
    data = {
        "lecture_id": lecture_id,
        "is_active": True
    }
    
    response = supabase.table("live_sessions").insert(data).execute()
    
    if hasattr(response, 'data') and len(response.data) > 0:
        return response.data[0]['id']
    else:
        raise Exception("Failed to create live session: No data returned")

def get_active_live_session(lecture_id: str):
    """
    Retrieves the active live session for a given lecture ID.
    Returns None if no active session is found.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")

    response = supabase.table("live_sessions").select("*").eq("lecture_id", lecture_id).eq("is_active", True).execute()
    
    if hasattr(response, 'data') and len(response.data) > 0:
        return response.data[0]
    return None


def list_active_live_sessions(limit: int = 100) -> list[dict]:
    """Returns active live sessions ordered oldest-first for maintenance sweeps."""
    if not supabase:
        return []
    try:
        response = (
            supabase.table("live_sessions")
            .select("id, lecture_id, is_active, last_chunk_at, created_at")
            .eq("is_active", True)
            .order("created_at")
            .limit(max(1, min(int(limit or 100), 500)))
            .execute()
        )
        return response.data or []
    except Exception as e:
        print(f"[live] list_active_live_sessions error: {e}")
        return []

def append_lecture_transcript(lecture_id: str, chunk_text: str) -> int:
    """
    Appends text to a lecture's transcript.
    Returns the new length of the transcript.
    Uses a single fresh client for both the read and write (thread-safe).
    """
    db = _fresh_db()
    # Inline fetch — avoids calling get_lecture_transcript (which uses global singleton)
    fetch = db.table("lectures").select("transcript").eq("id", lecture_id).execute()
    current = fetch.data[0].get("transcript") or "" if (hasattr(fetch, "data") and fetch.data) else ""
    new_transcript = (current + "\n" + chunk_text) if current else chunk_text
    response = db.table("lectures").update({"transcript": new_transcript}).eq("id", lecture_id).execute()
    if hasattr(response, 'data') and len(response.data) > 0:
        return len(new_transcript)
    raise Exception("Failed to update transcript")

def update_live_session_timestamp(live_session_id: str):
    """
    Updates the last_chunk_at timestamp for a live session.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
        
    now = datetime.now(timezone.utc).isoformat()
    response = supabase.table("live_sessions").update({"last_chunk_at": now}).eq("id", live_session_id).execute()
    if not (hasattr(response, 'data') and len(response.data) > 0):
        print(f"Warning: update_live_session_timestamp found no session with id {live_session_id}")

def update_lecture_analytics(lecture_id: str, chunk_duration: int = 12):
    """
    Atomically increments total_chunks and total_duration_seconds via a
    Supabase RPC so concurrent chunks never race and lose an increment.

    Required SQL (run once in Supabase SQL editor):
        CREATE OR REPLACE FUNCTION increment_lecture_analytics(
            p_lecture_id UUID, p_duration INTEGER
        ) RETURNS VOID LANGUAGE plpgsql AS $$
        BEGIN
            UPDATE lectures
            SET total_chunks           = COALESCE(total_chunks, 0) + 1,
                total_duration_seconds = COALESCE(total_duration_seconds, 0) + p_duration
            WHERE id = p_lecture_id;
        END; $$;
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
    try:
        supabase.rpc(
            "increment_lecture_analytics",
            {"p_lecture_id": lecture_id, "p_duration": chunk_duration},
        ).execute()
    except Exception:
        # RPC not yet created — fall back to read-modify-write
        response = supabase.table("lectures").select("total_chunks, total_duration_seconds").eq("id", lecture_id).execute()
        if hasattr(response, 'data') and len(response.data) > 0:
            current = response.data[0]
            supabase.table("lectures").update({
                "total_chunks":           (current.get("total_chunks") or 0) + 1,
                "total_duration_seconds": (current.get("total_duration_seconds") or 0) + chunk_duration,
            }).eq("id", lecture_id).execute()


def set_lecture_duration(lecture_id: str, duration_seconds: int) -> None:
    """Stores verified media duration without changing live chunk counters."""
    if not supabase:
        raise Exception("Supabase client is not initialized")
    seconds = max(0, int(duration_seconds or 0))
    supabase.table("lectures").update({
        "duration_seconds": seconds,
        "total_duration_seconds": seconds,
    }).eq("id", lecture_id).execute()


def end_live_session(lecture_id: str):
    """
    Marks the live session active for a lecture as inactive.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
        
    supabase.table("live_sessions").update({"is_active": False}).eq("lecture_id", lecture_id).execute()


def end_live_session_if_active(lecture_id: str, session_id: str | None = None) -> bool:
    """
    Marks an active live session inactive exactly once.
    Returns True only when an active row was actually transitioned.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")

    query = supabase.table("live_sessions").update({"is_active": False})
    if session_id:
        query = query.eq("id", session_id)
    else:
        query = query.eq("lecture_id", lecture_id)
    response = query.eq("is_active", True).execute()
    return bool(getattr(response, "data", None))


def get_lecture_for_summarization(lecture_id: str):
    """
    Retrieves transcript, summary, language, and analytics for a lecture.
    """
    db = _fresh_db()
    response = db.table("lectures").select(
        "transcript, summary, master_summary, total_sections, last_summarized_length, "
        "total_chunks, total_duration_seconds, title, created_at, language, topic, concept_note_cards, "
        "summary_status"
    ).eq("id", lecture_id).execute()

    if hasattr(response, 'data') and len(response.data) > 0:
        return response.data[0]
    return None

def update_lecture_incremental_summary(lecture_id: str, new_summary_part: str, new_summarized_length: int):
    """
    Appends the new summary part to the existing summary and updates last_summarized_length.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
    
    # First fetch existing summary to append
    # Alternatively, we could do this in SQL if writing a stored procedure, but here we do read-modify-write
    # We already have the logic to read in get_lecture_for_summarization, but to be safe we can use what we have or re-fetch.
    # However, to avoid race conditions in a high-concurrency real app we'd use DB functions.
    # For this simple backend, we'll fetch current summary again or assume the caller passed the state? 
    # Let's just retrieve current summary to be safe.
    
    current_data = get_lecture_for_summarization(lecture_id)
    if not current_data:
        raise Exception("Lecture not found")
        
    current_summary = current_data.get("summary") or ""
    
    if current_summary:
        updated_summary = current_summary + "\n\n" + new_summary_part
    else:
        updated_summary = new_summary_part
        
    response = supabase.table("lectures").update({
        "summary": updated_summary,
        "last_summarized_length": new_summarized_length
    }).eq("id", lecture_id).execute()
    
    if not (hasattr(response, 'data') and len(response.data) > 0):
        raise Exception("Failed to update lecture summary")


def update_lecture_summary_and_length(lecture_id: str, summary: str, last_summarized_length: int):
    """
    Overwrites the summary and updates the last_summarized_length.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
        
    response = supabase.table("lectures").update({
        "summary": summary,
        "last_summarized_length": last_summarized_length
    }).eq("id", lecture_id).execute()
    
    if not (hasattr(response, 'data') and len(response.data) > 0):
         raise Exception(f"Failed to update summary for ID: {lecture_id}")
def update_lecture_summary_only(lecture_id: str, summary: str):
    """
    Overwrites the primary summary (master_summary).
    """
    _fresh_db().table("lectures").update({"master_summary": summary, "summary": summary}).eq("id", lecture_id).execute()

def create_lecture_chunk(lecture_id: str, transcript: str, micro_summary: str, chunk_index: int):
    """
    Saves a transcription chunk and its micro summary with index.
    """
    data = {
        "lecture_id": lecture_id,
        "transcript": transcript,
        "micro_summary": micro_summary,
        "chunk_index": chunk_index
    }
    _fresh_db().table("lecture_chunks").insert(data).execute()

def get_micro_summaries(lecture_id: str, limit: int = 10):
    """
    Fetches the last N micro summaries for a lecture.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
        
    response = supabase.table("lecture_chunks")\
        .select("micro_summary")\
        .eq("lecture_id", lecture_id)\
        .order("created_at", desc=True)\
        .limit(limit)\
        .execute()
        
    if hasattr(response, 'data'):
        # Return in chronological order
        return [item['micro_summary'] for item in reversed(response.data)]
    return []

def create_lecture_section(lecture_id: str, section_summary: str, range_start: int, range_end: int, section_index: int):
    """
    Saves a section summary with index.
    Uses upsert with ignore_duplicates=True to safely handle race conditions
    where two concurrent background tasks try to insert the same section_index.
    """
    db = _fresh_db()
    data = {
        "lecture_id": lecture_id,
        "section_summary": section_summary,
        "chunk_range_start": range_start,
        "chunk_range_end": range_end,
        "section_index": section_index
    }
    # Upsert: if two background tasks race to the same section_index, the later
    # one overwrites — both computed summaries for the same chunk range, so
    # overwriting is safe and prevents silent data loss from ignore_duplicates.
    db.table("lecture_sections").upsert(
        data, on_conflict="lecture_id,section_index"
    ).execute()

    # Also update total_sections counter in master table
    db.table("lectures").update({"total_sections": section_index + 1}).eq("id", lecture_id).execute()

def get_section_summaries(lecture_id: str):
    """
    Fetches all section summaries for a lecture in chronological order.
    """
    response = _fresh_db().table("lecture_sections")\
        .select("section_summary")\
        .eq("lecture_id", lecture_id)\
        .order("section_index", desc=False)\
        .execute()

    if hasattr(response, 'data'):
        return [item['section_summary'] for item in response.data]
    return []


def get_lecture_sections(lecture_id: str) -> list[dict]:
    """
    Returns lecture sections with chunk ranges so callers can attach citations.
    """
    response = _fresh_db().table("lecture_sections")\
        .select("section_index, chunk_range_start, chunk_range_end, section_summary")\
        .eq("lecture_id", lecture_id)\
        .order("section_index", desc=False)\
        .execute()
    return response.data if hasattr(response, "data") and response.data else []


def snapshot_generated_outputs(lecture_id: str) -> dict:
    """
    Capture generated lecture outputs before a destructive recompute.

    Transcript/chunks are intentionally not part of this snapshot because they
    are source material, not generated output.
    """
    db = _fresh_db()
    try:
        lecture_resp = db.table("lectures").select(
            "master_summary, summary, flashcards, quiz, glossary, concept_note_cards, "
            "summary_status, total_sections, last_summarized_length"
        ).eq("id", lecture_id).execute()
    except Exception:
        try:
            lecture_resp = db.table("lectures").select(
                "master_summary, summary, flashcards, quiz, glossary, concept_note_cards, "
                "total_sections, last_summarized_length"
            ).eq("id", lecture_id).execute()
        except Exception:
            lecture_resp = db.table("lectures").select(
                "master_summary, summary, flashcards, quiz, glossary, "
                "total_sections, last_summarized_length"
            ).eq("id", lecture_id).execute()
    section_resp = db.table("lecture_sections").select(
        "section_index, chunk_range_start, chunk_range_end, section_summary"
    ).eq("lecture_id", lecture_id).order("section_index", desc=False).execute()
    return {
        "lecture": (lecture_resp.data or [{}])[0] if hasattr(lecture_resp, "data") else {},
        "sections": section_resp.data if hasattr(section_resp, "data") and section_resp.data else [],
    }


def clear_generated_outputs_for_recompute(lecture_id: str) -> None:
    """
    Delete previously generated outputs before rebuilding from the transcript.
    """
    db = _fresh_db()
    db.table("lecture_sections").delete().eq("lecture_id", lecture_id).execute()
    update = {
        "master_summary": "",
        "summary": "",
        "flashcards": None,
        "quiz": None,
        "glossary": None,
        "total_sections": 0,
        "last_summarized_length": 0,
    }
    try:
        db.table("lectures").update({
            **update,
            "summary_status": "recomputing",
        }).eq("id", lecture_id).execute()
    except Exception:
        db.table("lectures").update(update).eq("id", lecture_id).execute()


def restore_generated_outputs(lecture_id: str, snapshot: dict) -> None:
    """
    Restore generated outputs after a failed recompute.
    """
    db = _fresh_db()
    lecture_update = dict((snapshot or {}).get("lecture") or {})
    if lecture_update:
        try:
            db.table("lectures").update(lecture_update).eq("id", lecture_id).execute()
        except Exception:
            lecture_update.pop("summary_status", None)
            if lecture_update:
                db.table("lectures").update(lecture_update).eq("id", lecture_id).execute()
    db.table("lecture_sections").delete().eq("lecture_id", lecture_id).execute()
    rows = []
    for row in (snapshot or {}).get("sections") or []:
        rows.append({
            "lecture_id": lecture_id,
            "section_index": row.get("section_index"),
            "chunk_range_start": row.get("chunk_range_start"),
            "chunk_range_end": row.get("chunk_range_end"),
            "section_summary": row.get("section_summary"),
        })
    if rows:
        db.table("lecture_sections").insert(rows).execute()
def get_latest_section_end_index(lecture_id: str) -> int:
    """
    Returns the chunk_range_end of the latest section, or -1 if no sections exist.
    """
    try:
        response = _fresh_db().table("lecture_sections")\
            .select("chunk_range_end")\
            .eq("lecture_id", lecture_id)\
            .order("section_index", desc=True)\
            .limit(1)\
            .execute()
        if hasattr(response, 'data') and len(response.data) > 0:
            return response.data[0]['chunk_range_end']
    except Exception:
        pass
    return -1


def get_latest_section_count(lecture_id: str) -> int:
    """
    Returns the exact count of sections for a lecture via COUNT(*).
    More reliable than reading total_sections column (which may lag).
    Used in _run_summarization to compute the next section_index.
    """
    try:
        response = _fresh_db().table("lecture_sections")\
            .select("id", count="exact")\
            .eq("lecture_id", lecture_id)\
            .execute()
        return response.count if response.count is not None else 0
    except Exception:
        return 0

def get_unsummarized_chunks(lecture_id: str, after_index: int):
    """
    Fetches chunks (index and micro_summary) after a specific index.
    """
    try:
        response = _fresh_db().table("lecture_chunks")\
            .select("chunk_index, micro_summary")\
            .eq("lecture_id", lecture_id)\
            .gt("chunk_index", after_index)\
            .order("chunk_index", desc=False)\
            .execute()
        if hasattr(response, 'data'):
            return response.data
    except Exception:
        pass
    return []


def get_all_chunk_transcripts(lecture_id: str) -> list:
    """
    Returns raw transcript text for all chunks ordered by chunk_index.
    Used by the end-of-session recompute pipeline.

    Requires: ALTER TABLE lectures ADD COLUMN IF NOT EXISTS summary_status text DEFAULT 'live';
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
    Sets summary_status on a lecture. Values: 'live' | 'recomputing' | 'final'.
    Non-fatal — if the column doesn't exist yet, the error is swallowed.
    """
    try:
        _fresh_db().table("lectures").update(
            {"summary_status": status}
        ).eq("id", lecture_id).execute()
    except Exception as e:
        print(f"set_summary_status error (non-fatal): {e}")


# =============================================================================
#  EMBEDDING CACHE
# =============================================================================

def get_cached_embeddings(lecture_id: str) -> dict:
    """
    Returns a dict mapping chunk_hash -> embedding list for all cached
    QA chunk embeddings belonging to this lecture.
    """
    if not supabase:
        return {}
    response = (
        supabase.table("lecture_embeddings")
        .select("chunk_hash, embedding")
        .eq("lecture_id", lecture_id)
        .execute()
    )
    if hasattr(response, 'data'):
        return {row['chunk_hash']: row['embedding'] for row in response.data}
    return {}


def save_embeddings_cache(lecture_id: str, entries: list) -> None:
    """
    Upserts a list of {chunk_hash, chunk_text, embedding} dicts into the
    lecture_embeddings cache table.  Uses ON CONFLICT DO NOTHING so existing
    rows are never overwritten (hash collision → identical content).
    """
    if not supabase or not entries:
        return
    rows = [
        {
            "lecture_id": lecture_id,
            "chunk_hash": e["chunk_hash"],
            "chunk_text": e["chunk_text"],
            "embedding":  e["embedding"],
        }
        for e in entries
    ]
    supabase.table("lecture_embeddings").upsert(rows, on_conflict="lecture_id,chunk_hash").execute()


def update_lecture_title(lecture_id: str, title: str):
    """
    Overwrites the lecture title. Called when auto-title is generated from transcript.
    """
    if not supabase:
        return
    supabase.table("lectures").update({"title": title}).eq("id", lecture_id).execute()


def update_lecture_transcript(lecture_id: str, transcript: str, language: str) -> None:
    """Updates transcript and language on an existing lecture (used after background transcription)."""
    if not supabase:
        return
    supabase.table("lectures").update({
        "transcript": transcript,
        "language": language,
    }).eq("id", lecture_id).execute()


def save_student_question(lecture_id: str, question_text: str) -> None:
    """
    Inserts a CIF-detected student question into lecture_questions.

    Migration SQL (run manually in Supabase SQL editor):
        CREATE TABLE IF NOT EXISTS lecture_questions (
            id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
            lecture_id   uuid        REFERENCES lectures(id) ON DELETE CASCADE,
            question_text text       NOT NULL,
            detected_at  timestamptz DEFAULT now()
        );
    """
    try:
        _fresh_db().table("lecture_questions").insert({
            "lecture_id":    lecture_id,
            "question_text": question_text,
            "detected_at":   datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        print(f"[CIF] Failed to save student question: {e}")


def get_recent_lectures(limit: int = 5, offset: int = 0, user_id: str = None, q: str = None) -> list:
    """
    Returns lectures sorted by created_at DESC.
    When user_id is provided, filters to that user's lectures only.
    When q is provided, applies case-insensitive content search on
    title, topic, master_summary, and summary columns.
    """
    if not supabase:
        return []
    query = (
        supabase.table("lectures")
        .select(
            "id, title, topic, language, total_chunks, total_sections, "
            "total_duration_seconds, created_at, master_summary, summary"
        )
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    if user_id:
        query = query.eq("user_id", user_id)
    if q:
        term = q.strip()
        query = query.or_(
            f"title.ilike.%{term}%,"
            f"topic.ilike.%{term}%,"
            f"master_summary.ilike.%{term}%,"
            f"summary.ilike.%{term}%"
        )
    response = query.execute()
    if not hasattr(response, "data"):
        return []
    rows = []
    for row in response.data:
        preview_src = row.get("master_summary") or row.get("summary") or ""
        if q and preview_src:
            term = q.strip().lower()
            idx = preview_src.lower().find(term)
            if idx >= 0:
                start = max(0, idx - 60)
                end = min(len(preview_src), idx + len(term) + 60)
                snippet = (
                    ("…" if start > 0 else "")
                    + preview_src[start:end]
                    + ("…" if end < len(preview_src) else "")
                )
            else:
                snippet = preview_src[:200]
            summary_preview = snippet
        else:
            summary_preview = preview_src[:120] if preview_src else ""
        rows.append({
            "id":                     row["id"],
            "title":                  row.get("title") or "Untitled",
            "topic":                  row.get("topic"),
            "language":               row.get("language") or "en",
            "total_chunks":           row.get("total_chunks") or 0,
            "total_sections":         row.get("total_sections") or 0,
            "total_duration_seconds": row.get("total_duration_seconds") or 0,
            "created_at":             row.get("created_at"),
            "summary_preview":        summary_preview,
        })
    return rows


def get_lecture_owner(lecture_id: str) -> str | None:
    """
    Returns the user_id of the lecture owner, or None if the lecture doesn't exist
    or was created before authentication was added (legacy lectures).
    Used by endpoints to verify ownership before returning or modifying data.
    """
    try:
        response = (
            supabase.table("lectures")
            .select("user_id")
            .eq("id", lecture_id)
            .execute()
        )
        if hasattr(response, "data") and response.data:
            return response.data[0].get("user_id")
    except Exception:
        pass
    return None


def cleanup_old_chunks(days: int = 0) -> int:
    """
    Deletes lecture_chunks for lectures that have a completed master_summary.
    Chunks serve no purpose after summarisation is done — safe to delete anytime.
    If days > 0, only lectures created more than `days` days ago are targeted
    (safety margin to avoid deleting chunks for very recently completed lectures).
    Returns number of chunk rows deleted.
    """
    if not supabase:
        return 0

    q = supabase.table("lectures").select("id").filter("master_summary", "not.is", "null")
    if days > 0:
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        q = q.lt("created_at", cutoff)
    lectures_resp = q.execute()

    lecture_ids = [r["id"] for r in (lectures_resp.data or [])]
    print(f"[cleanup] days={days} matched_lectures={len(lecture_ids)}")
    if not lecture_ids:
        return 0

    deleted = 0
    for i in range(0, len(lecture_ids), 100):
        batch = lecture_ids[i:i + 100]
        count_resp = (
            supabase.table("lecture_chunks")
            .select("id", count="exact")
            .in_("lecture_id", batch)
            .execute()
        )
        batch_count = count_resp.count or 0
        print(f"[cleanup] batch {i//100 + 1}: {len(batch)} lectures → {batch_count} chunks")
        if batch_count > 0:
            supabase.table("lecture_chunks").delete().in_("lecture_id", batch).execute()
        deleted += batch_count
    return deleted


def delete_lecture(lecture_id: str) -> None:
    """
    Permanently deletes a lecture and all its associated data.
    Cascade deletes handle lecture_chunks, lecture_sections, etc.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
    supabase.table("lectures").delete().eq("id", lecture_id).execute()


# =============================================================================
#  SHARE / FULL LECTURE
# =============================================================================

def generate_share_token(
    lecture_id: str,
    mode: str = "full",
    expires_at: str | None = None,
) -> str:
    """
    Returns the existing share_token (or generates a new one) and updates
    the share_mode / share_expires_at settings for this lecture.
    Requires these columns in Supabase (run once):
        ALTER TABLE lectures ADD COLUMN IF NOT EXISTS share_mode TEXT DEFAULT 'full';
        ALTER TABLE lectures ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMPTZ;
    """
    db = _fresh_db()
    resp = db.table("lectures").select("share_token").eq("id", lecture_id).execute()
    existing_token = None
    if hasattr(resp, "data") and resp.data:
        existing_token = resp.data[0].get("share_token")

    token = existing_token or str(_uuid.uuid4())
    update_payload: dict = {"share_token": token}
    try:
        update_payload["share_mode"] = mode
        update_payload["share_expires_at"] = expires_at
    except Exception:
        pass  # columns may not exist yet — token still works
    db.table("lectures").update(update_payload).eq("id", lecture_id).execute()
    return token


def clear_share_token(lecture_id: str) -> None:
    """Sets share_token = NULL (and clears expiry/mode) to unshare a lecture."""
    payload = {"share_token": None}
    try:
        payload["share_mode"] = None
        payload["share_expires_at"] = None
    except Exception:
        pass
    _fresh_db().table("lectures").update(payload).eq("id", lecture_id).execute()


def get_lecture_by_share_token(token: str):
    """
    Finds a lecture by share_token.
    - Returns None if not found.
    - Returns {"expired": True} if share_expires_at is in the past.
    - Strips transcript when share_mode = 'summary_only'.
    """
    if not supabase:
        return None
    response = (
        supabase.table("lectures")
        .select("id, title, topic, language, master_summary, summary, transcript, "
                "created_at, total_duration_seconds, share_views, share_mode, share_expires_at")
        .eq("share_token", token)
        .execute()
    )
    if not (hasattr(response, "data") and response.data):
        return None
    lecture = response.data[0]

    # Expiry check
    expires_at = lecture.get("share_expires_at")
    if expires_at:
        from datetime import datetime, timezone
        try:
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp:
                return {"expired": True}
        except Exception:
            pass

    # Mode filter — strip transcript for summary-only links
    if lecture.get("share_mode") == "summary_only":
        lecture.pop("transcript", None)

    # Remove internal share fields from public response
    lecture.pop("share_mode", None)
    lecture.pop("share_expires_at", None)
    return lecture


def increment_share_views(lecture_id: str) -> None:
    """
    Atomically increments share_views. Non-fatal on failure.

    Required SQL (run once in Supabase SQL editor):
        CREATE OR REPLACE FUNCTION increment_share_views(p_lecture_id UUID)
        RETURNS VOID LANGUAGE plpgsql AS $$
        BEGIN
            UPDATE lectures SET share_views = COALESCE(share_views, 0) + 1
            WHERE id = p_lecture_id;
        END; $$;
    """
    if not supabase:
        return
    try:
        supabase.rpc("increment_share_views", {"p_lecture_id": lecture_id}).execute()
    except Exception:
        # RPC not yet created — fall back to read-modify-write
        try:
            resp = supabase.table("lectures").select("share_views").eq("id", lecture_id).execute()
            if hasattr(resp, "data") and resp.data:
                current = resp.data[0].get("share_views") or 0
                supabase.table("lectures").update({"share_views": current + 1}).eq("id", lecture_id).execute()
        except Exception as e:
            print(f"[share] increment_share_views failed (non-fatal): {e}")


def get_lecture_full(lecture_id: str):
    """
    Returns complete lecture data including share fields for the LectureView page.
    Falls back if summary_status or concept_note_cards is missing in production.
    """
    db = _fresh_db()
    try:
        response = db.table("lectures").select(
            "id, title, topic, language, transcript, master_summary, summary, "
            "total_chunks, total_sections, total_duration_seconds, created_at, "
            "share_token, share_views, summary_status, "
            "flashcards, quiz, glossary, concept_note_cards, deletion_scheduled_at, content_deleted"
        ).eq("id", lecture_id).execute()
        if hasattr(response, "data") and response.data:
            return response.data[0]
        return None
    except Exception:
        try:
            response = db.table("lectures").select(
                "id, title, topic, language, transcript, master_summary, summary, "
                "total_chunks, total_sections, total_duration_seconds, created_at, "
                "share_token, share_views, "
                "flashcards, quiz, glossary, concept_note_cards, deletion_scheduled_at, content_deleted"
            ).eq("id", lecture_id).execute()
            if hasattr(response, "data") and response.data:
                row = response.data[0]
                row.setdefault("summary_status", "final")
                return row
        except Exception:
            response = db.table("lectures").select(
                "id, title, topic, language, transcript, master_summary, summary, "
                "total_chunks, total_sections, total_duration_seconds, created_at, "
                "share_token, share_views, "
                "flashcards, quiz, glossary, deletion_scheduled_at, content_deleted"
            ).eq("id", lecture_id).execute()
            if hasattr(response, "data") and response.data:
                row = response.data[0]
                row.setdefault("summary_status", "final")
                row.setdefault("concept_note_cards", [])
                return row
        return None


def get_lecture_concept_note_cards(lecture_id: str):
    """Returns saved concept note cards for a lecture, or an empty list."""
    db = _fresh_db()
    try:
        response = (
            db.table("lectures")
            .select("concept_note_cards")
            .eq("id", lecture_id)
            .execute()
        )
        if hasattr(response, "data") and response.data:
            raw = response.data[0].get("concept_note_cards")
            if isinstance(raw, list):
                return raw
            if isinstance(raw, str) and raw.strip():
                import json as _json
                try:
                    parsed = _json.loads(raw)
                    return parsed if isinstance(parsed, list) else []
                except Exception:
                    return []
    except Exception as exc:
        print(f"[inventory-cache] read skipped for {lecture_id}: {exc}")
    return []


def update_lecture_concept_note_cards(lecture_id: str, cards: list[dict]) -> None:
    """Stores concept note cards, including any internal sentinel records."""
    import json as _json
    print(
        f"[db-write] update_lecture_concept_note_cards called for "
        f"{lecture_id} with {len(cards)} cards"
    )
    db = _fresh_db()
    try:
        result = (
            db.table("lectures")
            .update({"concept_note_cards": _json.dumps(cards or [])})
            .eq("id", lecture_id)
            .execute()
        )
        updated = bool(getattr(result, "data", None))
        print(f"[db-write] update result: updated={updated}")
    except Exception as exc:
        print(f"[inventory-cache] write skipped for {lecture_id}: {exc}")


# =============================================================================
#  PROFILE
# =============================================================================

def get_user_profile(user_id: str) -> dict:
    """
    Returns profile data for a user. Merges profiles table (settings/stats)
    with user_subscriptions table (plan_tier, which uses TEXT key compatible with Clerk IDs).
    """
    if not supabase:
        return {}
    profile: dict = {
        "id": user_id,
        "display_name": "",
        "avatar_url": None,
        "preferred_language": "en",
        "pdf_auto_download": True,
        "total_hours_recorded": 0,
        "total_words_transcribed": 0,
        "plan_tier": "free",
        "uploads_this_month": 0,
    }
    try:
        response = supabase.table("profiles").select("*").eq("id", user_id).execute()
        if hasattr(response, "data") and response.data:
            row = response.data[0]
            profile.update({
                "id":                      row.get("id") or user_id,
                "display_name":            row.get("display_name") or row.get("full_name") or "",
                "avatar_url":              row.get("avatar_url"),
                "preferred_language":      row.get("preferred_language") or "en",
                "pdf_auto_download":       row.get("pdf_auto_download") if row.get("pdf_auto_download") is not None else True,
                "total_hours_recorded":    row.get("total_hours_recorded") or 0,
                "total_words_transcribed": row.get("total_words_transcribed") or 0,
                "plan_tier":               row.get("plan_tier") or "free",
                "uploads_this_month":      row.get("uploads_this_month") or 0,
            })
    except Exception as e:
        print(f"[profile] get_user_profile error (non-fatal): {e}")
    # Override plan_tier from user_subscriptions (TEXT primary key, Clerk-ID compatible)
    # Also checks beta_expires_at for lazy plan downgrade — no cron needed.
    beta_expires_at_str = None
    try:
        plan_resp = supabase.table("user_subscriptions").select("plan_tier, beta_expires_at").eq("user_id", user_id).execute()
        if plan_resp.data:
            row = plan_resp.data[0]
            profile["plan_tier"] = row.get("plan_tier") or profile["plan_tier"]
            beta_expires_at_str = row.get("beta_expires_at")
    except Exception as e:
        print(f"[profile] get_user_plan override error (non-fatal): {e}")

    # Lazy beta expiry — downgrade to free if beta window has passed (beta users only)
    beta_active = False
    if beta_expires_at_str:
        try:
            expires = datetime.fromisoformat(beta_expires_at_str.replace("Z", "+00:00"))
            now_utc = datetime.now(timezone.utc)
            if expires <= now_utc:
                profile["plan_tier"] = "free"   # beta over — lazy downgrade
                # Write back to DB so the rest of the system stays consistent
                try:
                    supabase.table("user_subscriptions").update({
                        "plan_tier": "free",
                        "beta_expires_at": None,
                        "updated_at": now_utc.isoformat(),
                    }).eq("user_id", user_id).eq("plan_tier", "student").execute()
                except Exception:
                    pass  # non-fatal — in-memory downgrade is sufficient
            else:
                beta_active = True
        except Exception:
            pass

    profile["beta_expires_at"] = beta_expires_at_str
    profile["beta_active"] = beta_active
    return profile


def ensure_user_profile(user_id: str, email: str = "") -> None:
    """
    Creates a profile row if one doesn't exist yet.
    Called on every authenticated request so every signed-up user is visible in admin.
    Uses upsert with on_conflict so existing rows are never overwritten.
    """
    if not supabase:
        return
    try:
        payload = {"id": user_id}
        if email:
            payload["email"] = email
        supabase.table("profiles").upsert(payload, on_conflict="id", ignore_duplicates=True).execute()
    except Exception as e:
        print(f"[profile] ensure_user_profile error (non-fatal): {e}")


def update_user_profile(user_id: str, data: dict) -> dict:
    """
    Upserts profile data. Accepts display_name, preferred_language, pdf_auto_download.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
    allowed = {"display_name", "preferred_language", "pdf_auto_download"}
    payload = {k: v for k, v in data.items() if k in allowed}
    payload["id"] = user_id
    try:
        supabase.table("profiles").upsert(payload, on_conflict="id").execute()
    except Exception as e:
        raise Exception(f"Failed to update profile: {e}")
    return get_user_profile(user_id)


def delete_user_account(user_id: str) -> None:
    """
    Deletes all user data: lectures cascade via DB constraints.
    Profile is deleted from the profiles table.
    Auth user deletion must be done via Supabase admin API separately.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
    # Delete all lectures (cascades to chunks, sections, embeddings)
    supabase.table("lectures").delete().eq("user_id", user_id).execute()
    # Delete profile
    try:
        supabase.table("profiles").delete().eq("id", user_id).execute()
    except Exception as e:
        print(f"[profile] delete profile error (non-fatal): {e}")


def _current_year_month() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m")


def get_monthly_usage(user_id: str) -> dict:
    """Returns {live_lectures, uploads, total_minutes_used} for the current calendar month."""
    if not supabase:
        return {"live_lectures": 0, "uploads": 0, "total_minutes_used": 0}
    try:
        resp = (
            supabase.table("monthly_usage")
            .select("live_lectures, uploads, total_minutes_used")
            .eq("user_id", user_id)
            .eq("year_month", _current_year_month())
            .execute()
        )
        if resp.data:
            return {
                "live_lectures":      resp.data[0].get("live_lectures") or 0,
                "uploads":            resp.data[0].get("uploads") or 0,
                "total_minutes_used": resp.data[0].get("total_minutes_used") or 0,
            }
    except Exception as e:
        print(f"[usage] get_monthly_usage error (non-fatal): {e}")
    return {"live_lectures": 0, "uploads": 0, "total_minutes_used": 0}


def increment_monthly_live(user_id: str, duration_seconds: int = 0) -> None:
    """Atomically increments live_lectures counter and total_minutes_used for current month."""
    if not supabase:
        return
    ym = _current_year_month()
    minutes = max(1, (duration_seconds or 0) // 60)
    try:
        existing = (
            supabase.table("monthly_usage")
            .select("live_lectures, total_minutes_used")
            .eq("user_id", user_id)
            .eq("year_month", ym)
            .execute()
        )
        if existing.data:
            row = existing.data[0]
            supabase.table("monthly_usage").update({
                "live_lectures": (row.get("live_lectures") or 0) + 1,
                "total_minutes_used": (row.get("total_minutes_used") or 0) + minutes,
            }).eq("user_id", user_id).eq("year_month", ym).execute()
        else:
            supabase.table("monthly_usage").insert({
                "user_id": user_id, "year_month": ym,
                "live_lectures": 1, "uploads": 0, "total_minutes_used": minutes,
            }).execute()
    except Exception as e:
        print(f"[usage] increment_monthly_live error (non-fatal): {e}")


def increment_uploads_this_month(user_id: str, duration_minutes: int = 0) -> None:
    """Atomically increments uploads counter and total_minutes_used for current month."""
    if not supabase:
        return
    ym = _current_year_month()
    minutes = max(0, duration_minutes or 0)
    try:
        existing = (
            supabase.table("monthly_usage")
            .select("uploads, total_minutes_used")
            .eq("user_id", user_id)
            .eq("year_month", ym)
            .execute()
        )
        if existing.data:
            row = existing.data[0]
            supabase.table("monthly_usage").update({
                "uploads": (row.get("uploads") or 0) + 1,
                "total_minutes_used": (row.get("total_minutes_used") or 0) + minutes,
            }).eq("user_id", user_id).eq("year_month", ym).execute()
        else:
            supabase.table("monthly_usage").insert({
                "user_id": user_id, "year_month": ym,
                "live_lectures": 0, "uploads": 1, "total_minutes_used": minutes,
            }).execute()
    except Exception as e:
        print(f"[usage] increment_uploads_this_month error (non-fatal): {e}")


def add_monthly_usage_minutes(user_id: str, duration_minutes: int) -> None:
    """Adds minutes to the current month's total without changing lecture/upload counts."""
    if not supabase:
        return
    ym = _current_year_month()
    minutes = max(0, duration_minutes or 0)
    if minutes == 0:
        return
    try:
        existing = (
            supabase.table("monthly_usage")
            .select("total_minutes_used")
            .eq("user_id", user_id)
            .eq("year_month", ym)
            .execute()
        )
        if existing.data:
            row = existing.data[0]
            supabase.table("monthly_usage").update({
                "total_minutes_used": (row.get("total_minutes_used") or 0) + minutes,
            }).eq("user_id", user_id).eq("year_month", ym).execute()
        else:
            supabase.table("monthly_usage").insert({
                "user_id": user_id, "year_month": ym,
                "live_lectures": 0, "uploads": 0, "total_minutes_used": minutes,
            }).execute()
    except Exception as e:
        print(f"[usage] add_monthly_usage_minutes error (non-fatal): {e}")


def get_total_lecture_count(user_id: str) -> int:
    """Returns all-time lecture count for a user."""
    if not supabase:
        return 0
    try:
        response = (
            supabase.table("lectures")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        return response.count if response.count is not None else 0
    except Exception as e:
        print(f"[usage] get_total_lecture_count error (non-fatal): {e}")
        return 0


def get_user_plan(user_ids: list) -> dict:
    """
    Returns a dict of {user_id: plan_tier} for a list of user IDs.
    Reads from user_subscriptions table (TEXT primary key, works with Clerk string IDs).
    Users with no row default to 'free'.
    """
    if not supabase or not user_ids:
        return {}
    result = {}
    try:
        for i in range(0, len(user_ids), 100):
            batch = user_ids[i:i + 100]
            resp = supabase.table("user_subscriptions").select("user_id, plan_tier").in_("user_id", batch).execute()
            for row in (resp.data or []):
                result[row["user_id"]] = row.get("plan_tier") or "free"
    except Exception as e:
        print(f"[admin] get_user_plan error (non-fatal): {e}")
    return result


def admin_lecture_counts_by_user(user_ids: list) -> dict:
    """Returns {user_id: lecture_count} for a list of user IDs."""
    if not supabase or not user_ids:
        return {}
    counts: dict = {}
    try:
        for i in range(0, len(user_ids), 100):
            batch = user_ids[i:i + 100]
            resp = supabase.table("lectures").select("user_id").in_("user_id", batch).execute()
            for row in (resp.data or []):
                uid = row.get("user_id")
                if uid:
                    counts[uid] = counts.get(uid, 0) + 1
    except Exception as e:
        print(f"[admin] admin_lecture_counts_by_user error (non-fatal): {e}")
    return counts


# =============================================================================
#  VISUAL FRAMES
# =============================================================================

def save_visual_frame(
    lecture_id: str,
    timestamp_seconds: int,
    visual_data: dict,
    formatted_text: str,
    source: str = "screen",   # "screen" (Phase 1) or "board" (Phase 2)
) -> None:
    """Persists a GPT-4o Vision analysis result for a single captured frame.
    Tries with 'source' column first; falls back without it if the column doesn't
    exist yet (run: ALTER TABLE lecture_visual_frames ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'screen')
    """
    if not supabase:
        return
    row = {
        "lecture_id":        lecture_id,
        "timestamp_seconds": timestamp_seconds,
        "content_type":      visual_data.get("content_type"),
        "title":             visual_data.get("title"),
        "text_content":      visual_data.get("text_content"),
        "equations":         visual_data.get("equations", []),
        "diagrams":          visual_data.get("diagrams", []),
        "code":              visual_data.get("code"),
        "key_terms":         visual_data.get("key_terms", []),
        "summary":           visual_data.get("summary"),
        "formatted_text":    formatted_text,
        "source":            source,
    }
    try:
        supabase.table("lecture_visual_frames").insert(row).execute()
    except Exception:
        # Retry without 'source' in case the column migration hasn't been run yet
        row.pop("source", None)
        supabase.table("lecture_visual_frames").insert(row).execute()


def get_visual_frames(lecture_id: str) -> list:
    """Returns all visual frames for a lecture in chronological order.
    Wraps flat DB columns into a nested visual_data dict for frontend compatibility."""
    if not supabase:
        return []
    response = (
        supabase.table("lecture_visual_frames")
        .select("*")
        .eq("lecture_id", lecture_id)
        .order("timestamp_seconds", desc=False)
        .execute()
    )
    frames = response.data if hasattr(response, "data") else []
    for f in frames:
        f["visual_data"] = {
            "has_content":  True,
            "content_type": f.get("content_type"),
            "title":        f.get("title"),
            "text_content": f.get("text_content"),
            "equations":    f.get("equations") or [],
            "diagrams":     f.get("diagrams") or [],
            "code":         f.get("code"),
            "key_terms":    f.get("key_terms") or [],
            "summary":      f.get("summary"),
        }
    return frames


def get_visual_frames_in_window(lecture_id: str, start_sec: int, end_sec: int) -> list:
    """Returns visual frames captured within [start_sec, end_sec) for a lecture."""
    if not supabase:
        return []
    response = (
        supabase.table("lecture_visual_frames")
        .select("formatted_text, equations, diagrams")
        .eq("lecture_id", lecture_id)
        .gte("timestamp_seconds", start_sec)
        .lt("timestamp_seconds", end_sec)
        .execute()
    )
    return response.data if hasattr(response, "data") else []


def set_user_plan(user_id: str, plan_tier: str) -> None:
    """Sets a user's plan tier in user_subscriptions table (TEXT primary key, works with Clerk string IDs)."""
    if not supabase:
        raise Exception("Supabase not initialized")
    from datetime import datetime, timezone
    resp = supabase.table("user_subscriptions").upsert(
        {"user_id": user_id, "plan_tier": plan_tier, "updated_at": datetime.now(timezone.utc).isoformat()},
        on_conflict="user_id"
    ).execute()
    # supabase-py v2 raises on error, but guard against silent failures too
    if hasattr(resp, "error") and resp.error:
        raise Exception(str(resp.error))


def set_user_suspended(user_id: str, suspended: bool) -> None:
    """Sets the is_suspended flag on a user in user_subscriptions. Non-fatal on missing table."""
    if not supabase:
        raise Exception("Supabase not initialized")
    from datetime import datetime, timezone
    supabase.table("user_subscriptions").upsert(
        {
            "user_id": user_id,
            "is_suspended": suspended,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="user_id",
    ).execute()


def save_dodo_subscription(
    user_id: str,
    dodo_customer_id: str | None,
    dodo_subscription_id: str,
    status: str,
    period_end: str | None = None,
) -> None:
    """Persists Dodo billing fields on user_subscriptions."""
    if not supabase:
        raise Exception("Supabase not initialized")
    from datetime import datetime, timezone
    update: dict = {
        "user_id": user_id,
        "dodo_subscription_id": dodo_subscription_id,
        "subscription_status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if dodo_customer_id:
        update["dodo_customer_id"] = dodo_customer_id
    if period_end is not None:
        update["subscription_period_end"] = period_end
    supabase.table("user_subscriptions").upsert(update, on_conflict="user_id").execute()


def get_user_by_dodo_subscription(subscription_id: str) -> str | None:
    """Returns user_id for a given dodo_subscription_id, or None."""
    if not supabase:
        return None
    try:
        resp = supabase.table("user_subscriptions").select("user_id").eq(
            "dodo_subscription_id", subscription_id
        ).limit(1).execute()
        if resp.data:
            return resp.data[0]["user_id"]
    except Exception as e:
        print(f"[billing] get_user_by_dodo_subscription error: {e}")
    return None


def get_dodo_subscription_info(user_id: str) -> dict:
    """Returns Dodo billing fields for a user."""
    if not supabase:
        return {}
    try:
        resp = supabase.table("user_subscriptions").select(
            "plan_tier, dodo_subscription_id, dodo_customer_id, subscription_status, subscription_period_end"
        ).eq("user_id", user_id).limit(1).execute()
        if resp.data:
            return resp.data[0]
    except Exception as e:
        print(f"[billing] get_dodo_subscription_info error: {e}")
    return {}


def get_user_suspended(user_id: str) -> bool:
    """Returns True if the user is suspended. Defaults to False if not found."""
    if not supabase or not user_id:
        return False
    try:
        resp = supabase.table("user_subscriptions").select("is_suspended").eq("user_id", user_id).limit(1).execute()
        if resp.data:
            return bool(resp.data[0].get("is_suspended", False))
    except Exception as e:
        print(f"[suspension] get_user_suspended error (non-fatal): {e}")
    return False


def admin_get_suspended_map(user_ids: list) -> dict:
    """Returns {user_id: is_suspended} for a list of user IDs. Defaults to False."""
    if not supabase or not user_ids:
        return {}
    result = {}
    try:
        for i in range(0, len(user_ids), 100):
            batch = user_ids[i:i + 100]
            resp = supabase.table("user_subscriptions").select("user_id, is_suspended").in_("user_id", batch).execute()
            for row in (resp.data or []):
                result[row["user_id"]] = bool(row.get("is_suspended", False))
    except Exception as e:
        print(f"[suspension] admin_get_suspended_map error (non-fatal): {e}")
    return result


# =============================================================================
#  ADMIN QUERIES
# =============================================================================

def get_plan_limits_override() -> dict | None:
    """
    Reads plan limits override from admin_config table.
    Returns the stored dict if present, or None if not set (use Python constants as fallback).
    """
    if not supabase:
        return None
    try:
        resp = supabase.table("admin_config").select("value").eq("key", "plan_limits").limit(1).execute()
        if resp.data:
            return resp.data[0].get("value")
    except Exception as e:
        print(f"[admin_config] get_plan_limits_override error (non-fatal): {e}")
    return None


def set_plan_limits_override(limits: dict) -> None:
    """
    Stores the full plan_limits dict in admin_config table.
    Overwrites any existing override.
    """
    if not supabase:
        raise Exception("Supabase not initialized")
    from datetime import datetime, timezone
    supabase.table("admin_config").upsert(
        {
            "key": "plan_limits",
            "value": limits,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="key",
    ).execute()


def admin_write_audit(
    admin_id: str,
    action: str,
    target_id: str = "",
    detail: str = "",
) -> None:
    """Persists an admin action to the audit_logs Supabase table. Non-fatal."""
    if not supabase:
        return
    try:
        from datetime import datetime, timezone
        supabase.table("audit_logs").insert({
            "created_at": datetime.now(timezone.utc).isoformat(),
            "admin_id": admin_id,
            "action": action,
            "target_id": target_id,
            "detail": detail,
        }).execute()
    except Exception as e:
        print(f"[audit] write failed (non-fatal): {e}")


def admin_get_audit_log(
    page: int = 1,
    page_size: int = 50,
    action_filter: str = "",
) -> dict:
    """
    Returns paginated audit log rows from Supabase.
    Falls back to empty list if table not found.
    """
    if not supabase:
        return {"logs": [], "total": 0}
    try:
        offset = (page - 1) * page_size
        q = supabase.table("audit_logs").select("*", count="exact").order("created_at", desc=True)
        if action_filter:
            q = q.eq("action", action_filter)
        res = q.range(offset, offset + page_size - 1).execute()
        return {
            "logs": res.data or [],
            "total": res.count or 0,
            "page": page,
            "page_size": page_size,
        }
    except Exception as e:
        print(f"[audit] read failed: {e}")
        return {"logs": [], "total": 0, "page": page, "page_size": page_size}


def admin_get_stats() -> dict:
    """Platform-wide stats for the admin dashboard."""
    if not supabase:
        return {}
    try:
        # Count unique users: union of profiles + lecture user_ids
        prof_ids_resp = supabase.table("profiles").select("id").execute()
        prof_ids = {r["id"] for r in (prof_ids_resp.data or [])}
        lec_ids_resp = supabase.table("lectures").select("user_id").not_.is_("user_id", "null").execute()
        lec_ids = {r["user_id"] for r in (lec_ids_resp.data or []) if r.get("user_id")}
        total_users = len(prof_ids | lec_ids)

        lectures_resp = supabase.table("lectures").select("id", count="exact").execute()
        total_lectures = lectures_resp.count or 0

        sessions_resp = supabase.table("live_sessions").select("id", count="exact").eq("is_active", True).execute()
        active_sessions = sessions_resp.count or 0

        plan_dist = {"free": 0, "student": 0, "pro": 0}
        try:
            plan_resp = supabase.table("user_subscriptions").select("plan_tier").execute()
            for row in (plan_resp.data or []):
                tier = row.get("plan_tier") or "free"
                plan_dist[tier] = plan_dist.get(tier, 0) + 1
        except Exception:
            pass

        # Recent users: get latest unique user_ids from lectures, then fetch their profiles
        recent_lec_resp = (
            supabase.table("lectures")
            .select("user_id, created_at")
            .not_.is_("user_id", "null")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        ).data or []
        seen_uids = []
        for r in recent_lec_resp:
            uid = r.get("user_id")
            if uid and uid not in seen_uids:
                seen_uids.append(uid)
            if len(seen_uids) >= 10:
                break
        recent_users = []
        if seen_uids:
            prof_resp = supabase.table("profiles").select("id, display_name, plan_tier, created_at").in_("id", seen_uids).execute()
            prof_map = {p["id"]: p for p in (prof_resp.data or [])}
            for uid in seen_uids:
                p = prof_map.get(uid, {"id": uid, "display_name": "", "plan_tier": "free", "created_at": None})
                recent_users.append(p)

        recent_lectures = (
            supabase.table("lectures")
            .select("id, title, user_id, total_duration_seconds, created_at")
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        ).data or []

        # Total shared lectures and share views
        shared_resp = supabase.table("lectures").select("share_views").not_.is_("share_token", "null").execute()
        shared_count = len(shared_resp.data or [])
        total_share_views = sum((r.get("share_views") or 0) for r in (shared_resp.data or []))

        # Total hours recorded across all users
        hours_resp = supabase.table("profiles").select("total_hours_recorded").execute()
        total_hours = sum((r.get("total_hours_recorded") or 0) for r in (hours_resp.data or []))

        # Total questions detected (CIF)
        try:
            q_resp = supabase.table("lecture_questions").select("id", count="exact").execute()
            total_questions = q_resp.count or 0
        except Exception:
            total_questions = 0

        return {
            "total_users": total_users,
            "total_lectures": total_lectures,
            "active_sessions": active_sessions,
            "plan_distribution": plan_dist,
            "recent_users": recent_users,
            "recent_lectures": recent_lectures,
            "shared_lectures": shared_count,
            "total_share_views": total_share_views,
            "total_hours_recorded": round(total_hours, 1),
            "total_questions_detected": total_questions,
        }
    except Exception as e:
        print(f"[admin] admin_get_stats error: {e}")
        return {}


def admin_list_users(search: str = "", plan_filter: str = "", page: int = 1, page_size: int = 20) -> dict:
    """
    Paginated user list that unions profiles + lectures so ALL users appear:
    - Users who signed up and opened the app (have a profile row via ensure_user_profile)
    - Users who created lectures (have a user_id in lectures)
    No user is missed regardless of what they have or haven't done.
    """
    if not supabase:
        return {"users": [], "total": 0}
    try:
        # Source 1: all profile rows (anyone who opened the dashboard)
        prof_resp = supabase.table("profiles").select("id, display_name, full_name, email, plan_tier, uploads_this_month, total_hours_recorded, created_at").execute()
        prof_rows = prof_resp.data or []
        prof_map: dict = {p["id"]: p for p in prof_rows}

        # Source 2: unique user_ids from lectures (anyone who recorded/uploaded)
        lec_resp = (
            supabase.table("lectures")
            .select("user_id, created_at")
            .not_.is_("user_id", "null")
            .order("created_at", desc=True)
            .execute()
        )
        lec_rows = lec_resp.data or []

        # Lecture counts and first-seen date per user
        lec_counts: dict = {}
        lec_first_seen: dict = {}
        for r in lec_rows:
            uid = r.get("user_id")
            if uid:
                lec_counts[uid] = lec_counts.get(uid, 0) + 1
                if uid not in lec_first_seen:
                    lec_first_seen[uid] = r.get("created_at")

        # Union: start from profiles, add any lecture-only users not yet in profiles
        all_uids_ordered = [p["id"] for p in prof_rows]  # profiles first (have created_at)
        for uid in lec_first_seen:
            if uid not in prof_map:
                all_uids_ordered.append(uid)

        # Build merged user list
        users = []
        for uid in all_uids_ordered:
            p = prof_map.get(uid, {})
            users.append({
                "id": uid,
                "display_name": p.get("display_name") or p.get("full_name") or "",
                "email": p.get("email") or "",
                "plan_tier": p.get("plan_tier") or "free",
                "uploads_this_month": p.get("uploads_this_month") or 0,
                "total_hours_recorded": p.get("total_hours_recorded") or 0,
                "created_at": p.get("created_at") or lec_first_seen.get(uid),
                "lecture_count": lec_counts.get(uid, 0),
            })

        # Sort by created_at descending (newest first)
        users.sort(key=lambda u: u.get("created_at") or "", reverse=True)

        # Apply plan filter
        if plan_filter in ("free", "student", "pro"):
            users = [u for u in users if u["plan_tier"] == plan_filter]

        # Apply search (by display_name, email, or user ID)
        if search:
            sl = search.lower()
            users = [u for u in users if
                     sl in (u.get("display_name") or "").lower() or
                     sl in (u.get("email") or "").lower() or
                     sl in (u.get("id") or "").lower()]

        total = len(users)
        offset = (page - 1) * page_size
        users = users[offset: offset + page_size]

        return {"users": users, "total": total, "page": page, "page_size": page_size}
    except Exception as e:
        print(f"[admin] admin_list_users error: {e}")
        import traceback; traceback.print_exc()
        return {"users": [], "total": 0, "error": str(e)}


def admin_get_user_detail(user_id: str) -> dict:
    """Full profile + lectures for a single user. Works even with no profile row."""
    if not supabase:
        return {}
    try:
        profile_resp = supabase.table("profiles").select("*").eq("id", user_id).execute()
        profile = (profile_resp.data or [{}])[0] if (profile_resp.data) else {}
        # Ensure id is always present
        profile["id"] = profile.get("id") or user_id
        profile.setdefault("plan_tier", "free")
        profile.setdefault("display_name", "")
        # Override plan from user_subscriptions (TEXT key, Clerk-ID compatible)
        try:
            plan_row = supabase.table("user_subscriptions").select("plan_tier").eq("user_id", user_id).execute()
            if plan_row.data:
                profile["plan_tier"] = plan_row.data[0].get("plan_tier") or profile["plan_tier"]
        except Exception:
            pass

        lectures_resp = (
            supabase.table("lectures")
            .select("id, title, topic, language, total_chunks, total_duration_seconds, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        lectures = lectures_resp.data or []
        return {"profile": profile, "lectures": lectures}
    except Exception as e:
        print(f"[admin] admin_get_user_detail error: {e}")
        return {"profile": {"id": user_id, "plan_tier": "free"}, "lectures": []}


def admin_get_lecture_detail(lecture_id: str) -> dict:
    """Full lecture detail for admin: all fields + sections + questions + session info."""
    if not supabase:
        return {}
    try:
        lec_resp = supabase.table("lectures").select(
            "id, title, user_id, topic, language, transcript, summary, master_summary, "
            "total_chunks, total_sections, total_duration_seconds, last_summarized_length, "
            "share_token, share_views, created_at"
        ).eq("id", lecture_id).execute()
        if not (lec_resp.data):
            return {}
        lecture = lec_resp.data[0]

        sections_resp = supabase.table("lecture_sections").select(
            "id, section_index, chunk_range_start, chunk_range_end, section_summary, created_at"
        ).eq("lecture_id", lecture_id).order("section_index").execute()
        lecture["sections"] = sections_resp.data or []

        try:
            q_resp = supabase.table("lecture_questions").select(
                "id, question_text, detected_at"
            ).eq("lecture_id", lecture_id).order("detected_at", desc=True).execute()
            lecture["questions"] = q_resp.data or []
        except Exception:
            lecture["questions"] = []

        session_resp = supabase.table("live_sessions").select(
            "id, is_active, last_chunk_at, created_at"
        ).eq("lecture_id", lecture_id).execute()
        lecture["sessions"] = session_resp.data or []

        return lecture
    except Exception as e:
        print(f"[admin] admin_get_lecture_detail error: {e}")
        return {}


def admin_list_sessions(page: int = 1, page_size: int = 20) -> dict:
    """All live sessions (active + historical) for admin."""
    if not supabase:
        return {"sessions": [], "total": 0}
    try:
        offset = (page - 1) * page_size
        resp = supabase.table("live_sessions").select(
            "id, lecture_id, is_active, last_chunk_at, created_at",
            count="exact"
        ).order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
        sessions = resp.data or []

        # Attach lecture title for context
        if sessions:
            lec_ids = list({s["lecture_id"] for s in sessions if s.get("lecture_id")})
            lec_resp = supabase.table("lectures").select("id, title, user_id").in_("id", lec_ids).execute()
            lec_map = {l["id"]: l for l in (lec_resp.data or [])}
            for s in sessions:
                lec = lec_map.get(s.get("lecture_id"), {})
                s["lecture_title"] = lec.get("title") or "Untitled"
                s["user_id"] = lec.get("user_id")

        return {"sessions": sessions, "total": resp.count or 0, "page": page, "page_size": page_size}
    except Exception as e:
        print(f"[admin] admin_list_sessions error: {e}")
        return {"sessions": [], "total": 0}


def admin_list_lectures(search: str = "", user_id_filter: str = "", page: int = 1, page_size: int = 20) -> dict:
    """Paginated all-lectures view for admin."""
    if not supabase:
        return {"lectures": [], "total": 0}
    try:
        offset = (page - 1) * page_size
        query = supabase.table("lectures").select(
            "id, title, user_id, topic, language, total_chunks, total_duration_seconds, created_at",
            count="exact"
        )
        if user_id_filter:
            query = query.eq("user_id", user_id_filter)
        if search:
            query = query.ilike("title", f"%{search}%")
        resp = query.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
        return {
            "lectures": resp.data or [],
            "total": resp.count or 0,
            "page": page,
            "page_size": page_size,
        }
    except Exception as e:
        print(f"[admin] admin_list_lectures error: {e}")
        return {"lectures": [], "total": 0}


def get_monthly_lecture_count(user_id: str) -> dict:
    """Returns live lecture count for the current month from monthly_usage.
    Uses the monotonic counter — deleting lectures does NOT reduce this count.
    """
    usage = get_monthly_usage(user_id)
    return {"count": usage["live_lectures"]}


def get_announcements() -> list:
    """
    Returns all non-expired announcements sorted by created_at DESC.
    Includes announcements with expires_at = null (permanent) and those not yet expired.
    """
    if not supabase:
        return []
    try:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        res = supabase.table("announcements").select("*").or_(
            f"expires_at.is.null,expires_at.gte.{now}"
        ).order("created_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        print(f"[announcements] get error (non-fatal): {e}")
        return []


def create_announcement(
    text: str,
    ann_type: str = "info",
    expires_at: str | None = None,
    created_by: str = "",
) -> dict:
    """Creates a new announcement row. Returns the inserted row."""
    if not supabase:
        raise Exception("Supabase not initialized")
    payload = {
        "text": text,
        "ann_type": ann_type,
        "created_by": created_by,
    }
    if expires_at:
        payload["expires_at"] = expires_at
    res = supabase.table("announcements").insert(payload).execute()
    if res.data:
        return res.data[0]
    raise Exception("Insert returned no data")


def delete_announcement(announcement_id: int) -> None:
    """Permanently deletes an announcement by ID."""
    if not supabase:
        raise Exception("Supabase not initialized")
    supabase.table("announcements").delete().eq("id", announcement_id).execute()


# ── Content save helpers ───────────────────────────────────────────────────────

def save_generated_content(lecture_id: str, content: dict) -> None:
    """
    Saves summary, flashcards, quiz, and glossary from a content_generator result.
    Idempotent — safe to call multiple times.
    Also fires a background thread to embed the summary for semantic search.
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

    # Fire-and-forget: generate and store summary embedding for semantic search
    summary_text = content.get("summary") or ""
    if summary_text.strip():
        import threading as _threading
        def _embed_summary():
            try:
                from app.services.embedding_service import embed_single
                emb = embed_single(summary_text)
                save_lecture_summary_embedding(lecture_id, emb)
            except Exception as e:
                print(f"[search] summary embedding failed for {lecture_id}: {e}")
        _threading.Thread(target=_embed_summary, daemon=True).start()


def save_exam_prep(lecture_id: str, data: list) -> None:
    """Caches generated exam prep questions in the lectures table."""
    import json as _json
    _fresh_db().table("lectures").update(
        {"exam_prep_questions": _json.dumps(data)}
    ).eq("id", lecture_id).execute()


def get_exam_prep(lecture_id: str) -> list | None:
    """Returns cached exam prep questions, or None if not yet generated."""
    import json as _json
    if not supabase:
        return None
    try:
        resp = supabase.table("lectures").select("exam_prep_questions").eq("id", lecture_id).execute()
        if resp.data and resp.data[0].get("exam_prep_questions"):
            raw = resp.data[0]["exam_prep_questions"]
            return _json.loads(raw) if isinstance(raw, str) else raw
    except Exception as e:
        print(f"[exam_prep] get error: {e}")
    return None


def save_concept_map(lecture_id: str, data: dict) -> None:
    """Caches generated concept map in the lectures table."""
    import json as _json
    _fresh_db().table("lectures").update(
        {"concept_map": _json.dumps(data)}
    ).eq("id", lecture_id).execute()


def get_concept_map(lecture_id: str) -> dict | None:
    """Returns cached concept map, or None if not yet generated."""
    import json as _json
    if not supabase:
        return None
    try:
        resp = supabase.table("lectures").select("concept_map").eq("id", lecture_id).execute()
        if resp.data and resp.data[0].get("concept_map"):
            raw = resp.data[0]["concept_map"]
            return _json.loads(raw) if isinstance(raw, str) else raw
    except Exception as e:
        print(f"[concept_map] get error: {e}")
    return None


def save_lecture_summary_embedding(lecture_id: str, embedding: list) -> None:
    """Stores the summary embedding for semantic lecture search."""
    import json as _json
    _fresh_db().table("lectures").update(
        {"summary_embedding": _json.dumps(embedding)}
    ).eq("id", lecture_id).execute()


def get_all_user_lecture_embeddings(user_id: str) -> list[dict]:
    """Returns all lectures for a user that have a summary_embedding set."""
    import json as _json
    if not supabase:
        return []
    try:
        resp = (
            supabase.table("lectures")
            .select("id, title, topic, master_summary, summary_embedding")
            .eq("user_id", user_id)
            .not_.is_("summary_embedding", "null")
            .execute()
        )
        results = []
        for row in (resp.data or []):
            emb = row.get("summary_embedding")
            if emb:
                if isinstance(emb, str):
                    try:
                        emb = _json.loads(emb)
                    except Exception:
                        continue
                results.append({
                    "lecture_id": row["id"],
                    "title": row.get("title") or "",
                    "topic": row.get("topic") or "",
                    "summary": (row.get("master_summary") or "")[:150],
                    "summary_embedding": emb,
                })
        return results
    except Exception as e:
        print(f"[search] get_all_user_lecture_embeddings error: {e}")
        return []


def save_quiz_attempt(
    lecture_id: str,
    user_id: str,
    score: int,
    total: int,
    duration_seconds: int | None,
    answers_json: dict,
    weak_topics: list,
) -> dict:
    """Inserts a quiz attempt row and returns the inserted record."""
    import json as _json
    db = _fresh_db()
    payload = {
        "lecture_id": lecture_id,
        "user_id": user_id,
        "score": score,
        "total": total,
        "duration_seconds": duration_seconds,
        "answers_json": _json.dumps(answers_json),
        "weak_topics": _json.dumps(weak_topics),
    }
    resp = db.table("quiz_attempts").insert(payload).execute()
    return resp.data[0] if resp.data else {}


def get_quiz_attempts(lecture_id: str, user_id: str, limit: int = 10) -> list[dict]:
    """Returns the last `limit` quiz attempts for a given lecture + user."""
    if not supabase:
        return []
    try:
        resp = (
            supabase.table("quiz_attempts")
            .select("id, score, total, duration_seconds, weak_topics, attempted_at")
            .eq("lecture_id", lecture_id)
            .eq("user_id", user_id)
            .order("attempted_at", desc=True)
            .limit(limit)
            .execute()
        )
        import json as _json
        rows = []
        for row in (resp.data or []):
            wt = row.get("weak_topics")
            if isinstance(wt, str):
                try:
                    wt = _json.loads(wt)
                except Exception:
                    wt = []
            rows.append({**row, "weak_topics": wt or []})
        return rows
    except Exception as e:
        print(f"[quiz_attempts] get error: {e}")
        return []


def get_stale_free_lectures(days: int = 30) -> list:
    """
    Returns lectures owned by free-tier users older than `days` days
    where content has not yet been deleted.
    """
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    db = _fresh_db()
    try:
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


# ---------------------------------------------------------------------------
# Credits management (admin)
# ---------------------------------------------------------------------------

def get_user_credits(user_id: str) -> dict:
    """
    Returns user's credit balance, subscription status, and recent transactions.
    Reads from profiles (credits, credits_sub_status, credits_sub_expires).
    """
    db = _fresh_db()
    if not db:
        return {"credits": 0, "credits_sub_status": "none", "credits_sub_expires": None, "transactions": []}
    try:
        row = db.table("profiles").select(
            "credits, credits_sub_status, credits_sub_started, credits_sub_expires"
        ).eq("id", user_id).execute()
        profile = (row.data or [{}])[0] if row.data else {}
        txn_row = db.table("credit_transactions").select("*").eq(
            "user_id", user_id
        ).order("created_at", desc=True).limit(30).execute()
        return {
            "credits":             profile.get("credits", 0) or 0,
            "credits_sub_status":  profile.get("credits_sub_status", "none") or "none",
            "credits_sub_started": profile.get("credits_sub_started"),
            "credits_sub_expires": profile.get("credits_sub_expires"),
            "transactions":        txn_row.data or [],
        }
    except Exception as e:
        print(f"[credits] get_user_credits error: {e}")
        return {"credits": 0, "credits_sub_status": "none", "credits_sub_expires": None, "transactions": []}


def admin_adjust_credits(
    user_id: str,
    amount: int,
    reason: str,
    product: str = "",
    set_absolute: bool = False,
) -> dict:
    """
    Adjust (add/deduct) or set a user's credit balance.
    set_absolute=False: adds amount to current balance (negative = deduct).
    set_absolute=True : sets balance to exactly amount.
    Logs every change to credit_transactions.
    Returns {"credits": new_balance, "delta": delta}.
    """
    db = _fresh_db()
    if not db:
        raise RuntimeError("Supabase not configured")

    row = db.table("profiles").select("credits").eq("id", user_id).execute()
    if not row.data:
        # No profile yet — create a minimal row so the update below has a target
        db.table("profiles").insert({"id": user_id}).execute()
    current = ((row.data or [{}])[0].get("credits") or 0)

    if set_absolute:
        new_balance = max(0, amount)
        delta = new_balance - current
    else:
        new_balance = max(0, current + amount)
        delta = new_balance - current

    # Use update+eq to avoid sending Clerk user ID in JSON body (avoids UUID cast error)
    db.table("profiles").update({"credits": new_balance}).eq("id", user_id).execute()

    if delta != 0:
        try:
            db.table("credit_transactions").insert({
                "user_id":       user_id,
                "amount":        delta,
                "balance_after": new_balance,
                "reason":        reason,
                "product":       product or None,
            }).execute()
        except Exception as log_err:
            # Transaction log is non-critical — don't fail the balance update.
            # Root cause is usually credit_transactions.user_id being UUID type
            # in production; fix with migrations/004_fix_text_columns.sql.
            print(f"[admin_credits] transaction log failed (non-fatal): {log_err}")

    return {"credits": new_balance, "delta": delta}


def admin_set_credits_subscription(
    user_id: str,
    status: str,
    expires_at,
) -> dict:
    """
    Set a user's credit subscription status ('none' | 'monthly').
    expires_at: ISO-8601 string or None.
    """
    from datetime import datetime, timezone
    db = _fresh_db()
    if not db:
        raise RuntimeError("Supabase not configured")
    payload = {
        "credits_sub_status": status,
        "credits_sub_expires": expires_at,
    }
    if status != "none":
        payload["credits_sub_started"] = datetime.now(timezone.utc).isoformat()

    # Ensure a profile row exists first (admin may manage users who haven't
    # triggered profile creation via the app yet).
    existing = db.table("profiles").select("id").eq("id", user_id).execute()
    if not existing.data:
        # Create a minimal profile row. profiles.id is TEXT (Clerk-compatible).
        db.table("profiles").insert({"id": user_id}).execute()

    # Use update+eq to avoid sending Clerk user ID in JSON body (avoids UUID cast error)
    db.table("profiles").update(payload).eq("id", user_id).execute()
    return {"credits_sub_status": status, "credits_sub_expires": expires_at}


# =============================================================================
#  BETA TESTING PROGRAM
# =============================================================================

def get_beta_enabled() -> bool:
    """Returns True if the beta testing program is currently open."""
    if not supabase:
        return False
    try:
        resp = supabase.table("app_settings").select("value").eq("key", "beta_enabled").limit(1).execute()
        if resp.data:
            return bool(resp.data[0].get("value"))
    except Exception as e:
        print(f"[beta] get_beta_enabled error (non-fatal): {e}")
    return False


def set_beta_enabled(enabled: bool) -> None:
    """Enables or disables the beta testing program."""
    if not supabase:
        raise Exception("Supabase not initialized")
    import json as _json2
    supabase.table("app_settings").upsert(
        {"key": "beta_enabled", "value": _json2.dumps(enabled), "updated_at": datetime.now(timezone.utc).isoformat()},
        on_conflict="key"
    ).execute()


def submit_beta_application(user_id: str, email: str, full_name: str = None,
                            subject: str = None, use_case: str = None) -> dict:
    """Inserts a new beta application. Silently ignores duplicate (user already applied)."""
    if not supabase:
        raise Exception("Supabase not initialized")
    payload = {
        "user_id": user_id,
        "email": email,
    }
    if full_name:
        payload["full_name"] = full_name
    if subject:
        payload["subject"] = subject
    if use_case:
        payload["use_case"] = use_case
    resp = supabase.table("beta_applications").upsert(
        payload, on_conflict="user_id", ignore_duplicates=True
    ).execute()
    # Return existing row if insert was ignored
    existing = supabase.table("beta_applications").select("*").eq("user_id", user_id).limit(1).execute()
    if existing.data:
        return existing.data[0]
    if hasattr(resp, "data") and resp.data:
        return resp.data[0]
    return payload


def get_beta_application(user_id: str) -> dict | None:
    """Returns a user's beta application row, or None if they haven't applied."""
    if not supabase:
        return None
    try:
        resp = supabase.table("beta_applications").select("*").eq("user_id", user_id).limit(1).execute()
        if resp.data:
            return resp.data[0]
    except Exception as e:
        print(f"[beta] get_beta_application error (non-fatal): {e}")
    return None


def list_beta_applications(status: str = None) -> list:
    """Admin: list all applications, optionally filtered by status."""
    if not supabase:
        return []
    try:
        q = supabase.table("beta_applications").select("*")
        if status:
            q = q.eq("status", status)
        resp = q.order("created_at", desc=True).execute()
        return resp.data or []
    except Exception as e:
        print(f"[beta] list_beta_applications error (non-fatal): {e}")
    return []


def approve_beta_application(application_id: str) -> dict:
    """Approves a beta application: sets status, approved_at, expires_at, upgrades plan."""
    if not supabase:
        raise Exception("Supabase not initialized")
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=7)

    # Fetch the application to get user_id
    app_resp = supabase.table("beta_applications").select("*").eq("id", application_id).limit(1).execute()
    if not app_resp.data:
        raise Exception("Application not found")
    app_row = app_resp.data[0]
    user_id = app_row["user_id"]

    # Update application status
    supabase.table("beta_applications").update({
        "status": "approved",
        "approved_at": now.isoformat(),
        "expires_at": expires.isoformat(),
    }).eq("id", application_id).execute()

    # Upgrade user to student plan + grant plan credits
    set_user_plan(user_id, "student")
    from app.services.credits_service import grant_plan_credits
    grant_plan_credits(user_id, "student")

    # Set beta_expires_at on user_subscriptions
    supabase.table("user_subscriptions").upsert(
        {
            "user_id": user_id,
            "beta_expires_at": expires.isoformat(),
            "updated_at": now.isoformat(),
        },
        on_conflict="user_id"
    ).execute()

    updated = supabase.table("beta_applications").select("*").eq("id", application_id).limit(1).execute()
    return updated.data[0] if updated.data else app_row


def reject_beta_application(application_id: str) -> dict:
    """Rejects a beta application."""
    if not supabase:
        raise Exception("Supabase not initialized")
    supabase.table("beta_applications").update({"status": "rejected"}).eq("id", application_id).execute()
    updated = supabase.table("beta_applications").select("*").eq("id", application_id).limit(1).execute()
    if updated.data:
        return updated.data[0]
    return {"id": application_id, "status": "rejected"}


def submit_beta_feedback(user_id: str, lecture_id: str = None, rating: int = None,
                         comment: str = None) -> dict:
    """Inserts a beta feedback row."""
    if not supabase:
        raise Exception("Supabase not initialized")
    payload: dict = {"user_id": user_id}
    if lecture_id:
        payload["lecture_id"] = lecture_id
    if rating is not None:
        payload["rating"] = rating
    if comment:
        payload["comment"] = comment
    resp = supabase.table("beta_feedback").insert(payload).execute()
    if hasattr(resp, "data") and resp.data:
        return resp.data[0]
    return payload


def list_beta_feedback(page: int = 1, page_size: int = 20) -> dict:
    """Admin: paginated list of beta feedback entries."""
    if not supabase:
        return {"items": [], "total": 0}
    try:
        offset = (page - 1) * page_size
        resp = supabase.table("beta_feedback").select("*", count="exact").order(
            "created_at", desc=True
        ).range(offset, offset + page_size - 1).execute()
        return {
            "items": resp.data or [],
            "total": resp.count or 0,
            "page": page,
            "page_size": page_size,
        }
    except Exception as e:
        print(f"[beta] list_beta_feedback error (non-fatal): {e}")
    return {"items": [], "total": 0}


def get_beta_stats() -> dict:
    """Returns aggregate stats for the beta program."""
    if not supabase:
        return {}
    try:
        apps_resp = supabase.table("beta_applications").select("status, expires_at").execute()
        apps = apps_resp.data or []
        total_applied = len(apps)
        pending = sum(1 for a in apps if a.get("status") == "pending")
        approved = sum(1 for a in apps if a.get("status") == "approved")
        rejected = sum(1 for a in apps if a.get("status") == "rejected")
        now = datetime.now(timezone.utc)
        active = 0
        expired = 0
        for a in apps:
            if a.get("status") != "approved":
                continue
            exp_str = a.get("expires_at")
            if not exp_str:
                continue
            try:
                exp = datetime.fromisoformat(exp_str.replace("Z", "+00:00"))
                if exp > now:
                    active += 1
                else:
                    expired += 1
            except Exception:
                pass

        fb_resp = supabase.table("beta_feedback").select("rating").execute()
        fb_rows = fb_resp.data or []
        total_feedback = len(fb_rows)
        ratings = [r["rating"] for r in fb_rows if r.get("rating") is not None]
        avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else None

        return {
            "total_applied": total_applied,
            "pending": pending,
            "approved": approved,
            "rejected": rejected,
            "active": active,
            "expired": expired,
            "total_feedback": total_feedback,
            "avg_rating": avg_rating,
        }
    except Exception as e:
        print(f"[beta] get_beta_stats error (non-fatal): {e}")
    return {}


# ---------------------------------------------------------------------------
# Visit analytics
# ---------------------------------------------------------------------------

def record_page_visit(page: str, session_id: str = None, user_id: str = None, referrer: str = None) -> None:
    """Insert a row into page_visits. Fire-and-forget — never raises."""
    try:
        supabase = get_client()
        if not supabase:
            return
        row = {"page": page[:64]}
        if session_id:
            row["session_id"] = session_id[:64]
        if user_id:
            row["user_id"] = user_id[:128]
        if referrer:
            row["referrer"] = referrer[:256]
        supabase.table("page_visits").insert(row).execute()
    except Exception as e:
        print(f"[analytics] record_page_visit error (non-fatal): {e}")
