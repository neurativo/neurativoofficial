from supabase import create_client, Client
from app.core.config import settings
from datetime import datetime, timezone


# Initialize Supabase client
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY) if settings.SUPABASE_URL and settings.SUPABASE_KEY else None

def save_lecture(title: str, transcript: str, duration_seconds: int = None) -> str:
    """
    Saves a lecture to the Supabase database.
    
    Args:
        title: The title of the lecture
        transcript: The full transcript text
        duration_seconds: Optional duration in seconds
        
    Returns:
        str: The UUID of the created lecture record
        
    Raises:
        Exception: If Supabase client is not configured or insert fails
    """
    if not supabase:
        raise Exception("Supabase client is not initialized. check your environment variables.")

    data = {
        "title": title,
        "transcript": transcript,
        "duration_seconds": duration_seconds
    }
    
    # Supabase-py v2 returns a response object with .data
    response = supabase.table("lectures").insert(data).execute()
    
    if hasattr(response, 'data') and len(response.data) > 0:
        return response.data[0]['id']
    else:
        # Depending on version, response might be different, but v2 strongly types .data
        # If execution failed, it likely raised an exception already.
        raise Exception("Failed to insert lecture record: No data returned")

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


def create_lecture(title: str = "Live Session", transcript: str = "") -> str:
    """
    Creates a new lecture record, useful for initializing live sessions.
    Defaults to empty transcript.
    """
    return save_lecture(title, transcript)

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

def append_lecture_transcript(lecture_id: str, chunk_text: str) -> str:
    """
    Appends text to a lecture's transcript.
    Returns the new length of the transcript.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")

    current_transcript = get_lecture_transcript(lecture_id)

    if current_transcript:
        new_transcript = current_transcript + "\n" + chunk_text
    else:
        new_transcript = chunk_text

    response = supabase.table("lectures").update({"transcript": new_transcript}).eq("id", lecture_id).execute()
    
    if hasattr(response, 'data') and len(response.data) > 0:
        return len(new_transcript)
    else:
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
    Retrieves transcript, summary, and last_summarized_length for a lecture.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
        
    response = supabase.table("lectures").select("transcript, summary, master_summary, total_sections, last_summarized_length, total_chunks, total_duration_seconds, title, created_at").eq("id", lecture_id).execute()

    
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
    if not supabase:
        raise Exception("Supabase client is not initialized")
        
    supabase.table("lectures").update({"master_summary": summary, "summary": summary}).eq("id", lecture_id).execute()

def create_lecture_chunk(lecture_id: str, transcript: str, micro_summary: str, chunk_index: int):
    """
    Saves a transcription chunk and its micro summary with index.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
        
    data = {
        "lecture_id": lecture_id,
        "transcript": transcript,
        "micro_summary": micro_summary,
        "chunk_index": chunk_index
    }
    supabase.table("lecture_chunks").insert(data).execute()

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
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
        
    data = {
        "lecture_id": lecture_id,
        "section_summary": section_summary,
        "chunk_range_start": range_start,
        "chunk_range_end": range_end,
        "section_index": section_index
    }
    supabase.table("lecture_sections").insert(data).execute()
    
    # Also update total_sections counter in master table
    supabase.table("lectures").update({"total_sections": section_index + 1}).eq("id", lecture_id).execute()

def get_section_summaries(lecture_id: str):
    """
    Fetches all section summaries for a lecture in chronological order.
    """
    if not supabase:
        raise Exception("Supabase client is not initialized")
        
    response = supabase.table("lecture_sections")\
        .select("section_summary")\
        .eq("lecture_id", lecture_id)\
        .order("created_at", desc=False)\
        .execute()
        
    if hasattr(response, 'data'):
        return [item['section_summary'] for item in response.data]
    return []
def get_latest_section_end_index(lecture_id: str) -> int:
    """
    Returns the chunk_range_end of the latest section, or -1 if no sections exist.
    """
    if not supabase: return -1
    response = supabase.table("lecture_sections")\
        .select("chunk_range_end")\
        .eq("lecture_id", lecture_id)\
        .order("section_index", desc=True)\
        .limit(1)\
        .execute()
    
    if hasattr(response, 'data') and len(response.data) > 0:
        return response.data[0]['chunk_range_end']
    return -1

def get_unsummarized_chunks(lecture_id: str, after_index: int):
    """
    Fetches chunks (index and micro_summary) after a specific index.
    """
    if not supabase: return []
    response = supabase.table("lecture_chunks")\
        .select("chunk_index, micro_summary")\
        .eq("lecture_id", lecture_id)\
        .gt("chunk_index", after_index)\
        .order("chunk_index", desc=False)\
        .execute()
    
    if hasattr(response, 'data'):
        return response.data
    return []
