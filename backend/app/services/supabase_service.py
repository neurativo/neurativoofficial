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

def save_lecture(title: str, transcript: str, duration_seconds: int = None, language: str = "en") -> str:
    """
    Saves a lecture to the Supabase database.

    Args:
        title: The title of the lecture
        transcript: The full transcript text
        duration_seconds: Optional duration in seconds
        language: ISO-639-1 language code detected by Whisper (e.g. "en", "ar")

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


def get_lecture_language(lecture_id: str) -> str:
    """
    Returns the stored ISO-639-1 language code for a lecture, defaulting to 'en'.
    """
    try:
        response = (
            _fresh_db().table("lectures")
            .select("language")
            .eq("id", lecture_id)
            .execute()
        )
        if hasattr(response, 'data') and len(response.data) > 0:
            return response.data[0].get("language") or "en"
    except Exception:
        pass
    return "en"


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


def create_lecture(title: str = "Live Session", transcript: str = "", language: str = "en") -> str:
    """
    Creates a new lecture record, useful for initializing live sessions.
    Defaults to empty transcript. Language is updated on first chunk arrival.
    """
    return save_lecture(title, transcript, language=language)

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
    Updates analytics for a lecture (total_chunks, total_duration_seconds).
    Note: 'word_count' is implicitly derivable from transcript or stored if we add a column.
    For this request, we'll increment total_chunks and total_duration_seconds by approximate value.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
    
    # NOTE: This is a read-modify-write operation and is not atomic.
    # In production, replace with a Supabase RPC function:
    #   supabase.rpc("increment_analytics", {"lecture_id": lecture_id, "duration": chunk_duration}).execute()
    # For this prototype, concurrent requests for the same lecture_id are unlikely (12s chunk cadence).
    response = supabase.table("lectures").select("total_chunks, total_duration_seconds").eq("id", lecture_id).execute()
    
    if hasattr(response, 'data') and len(response.data) > 0:
        current = response.data[0]
        new_chunks = (current.get("total_chunks") or 0) + 1
        new_duration = (current.get("total_duration_seconds") or 0) + chunk_duration
        
        supabase.table("lectures").update({
            "total_chunks": new_chunks,
            "total_duration_seconds": new_duration
        }).eq("id", lecture_id).execute()

def end_live_session(lecture_id: str):
    """
    Marks the live session active for a lecture as inactive.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
        
    supabase.table("live_sessions").update({"is_active": False}).eq("lecture_id", lecture_id).execute()


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
    # Bug 1 fix: upsert with ignore_duplicates prevents postgres error 23505
    # on (lecture_id, section_index) unique constraint violation
    db.table("lecture_sections").upsert(
        data, on_conflict="lecture_id,section_index", ignore_duplicates=True
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


def get_recent_lectures(limit: int = 5, offset: int = 0) -> list:
    """
    Returns the most recent lectures sorted by created_at DESC.
    Used by the frontend idle screen to show session history.
    """
    if not supabase:
        return []
    response = (
        supabase.table("lectures")
        .select("id, title, topic, language, total_chunks, total_duration_seconds, created_at, summary")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    if not hasattr(response, "data"):
        return []
    rows = []
    for row in response.data:
        summary = row.get("summary") or ""
        rows.append({
            "id":                     row["id"],
            "title":                  row.get("title") or "Untitled",
            "topic":                  row.get("topic"),
            "language":               row.get("language") or "en",
            "total_chunks":           row.get("total_chunks") or 0,
            "total_duration_seconds": row.get("total_duration_seconds") or 0,
            "created_at":             row.get("created_at"),
            "summary_preview":        summary[:200] if summary else "",
        })
    return rows
