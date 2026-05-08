from datetime import datetime, timedelta, timezone
from threading import Lock

from app.services.credits_service import finalize_reserved_credits
from app.services.supabase_service import (
    add_monthly_usage_minutes,
    end_live_session_if_active,
    get_lecture_for_summarization,
    get_lecture_owner,
    list_active_live_sessions,
)


_cleanup_lock = Lock()


def cleanup_stale_live_sessions(idle_minutes: int = 15, limit: int = 20) -> int:
    """
    Ends inactive live sessions and settles their reserved credits.

    A session is stale when its last chunk timestamp (or creation time if no chunk
    has ever arrived) is older than the cutoff. This function is safe to call
    opportunistically from normal request paths.
    """
    idle_minutes = max(1, int(idle_minutes or 15))
    limit = max(1, int(limit or 20))

    if not _cleanup_lock.acquire(blocking=False):
        return 0

    try:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=idle_minutes)
        stale_sessions: list[dict] = []

        for session in list_active_live_sessions(limit=max(limit * 3, 50)):
            ref_time = session.get("last_chunk_at") or session.get("created_at")
            if not ref_time:
                continue
            try:
                session_time = datetime.fromisoformat(str(ref_time).replace("Z", "+00:00"))
            except ValueError:
                continue
            if session_time <= cutoff:
                stale_sessions.append(session)
                if len(stale_sessions) >= limit:
                    break

        cleaned = 0
        for session in stale_sessions:
            lecture_id = session.get("lecture_id")
            session_id = session.get("id")
            if not lecture_id:
                continue
            user_id = get_lecture_owner(lecture_id)
            if not user_id:
                continue
            if not end_live_session_if_active(lecture_id, session_id=session_id):
                continue

            try:
                lecture = get_lecture_for_summarization(lecture_id)
                live_dur = (lecture or {}).get("total_duration_seconds") or 0
                finalize_reserved_credits(user_id, lecture_id, actual_duration_seconds=live_dur)
                add_monthly_usage_minutes(user_id, max(0, ((live_dur + 59) // 60) - 1))
            except Exception as e:
                print(f"[live/cleanup] finalization failed for {lecture_id}: {e}")
            cleaned += 1

        return cleaned
    finally:
        _cleanup_lock.release()
