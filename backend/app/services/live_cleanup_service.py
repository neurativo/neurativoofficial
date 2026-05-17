from datetime import datetime, timedelta, timezone
from threading import Lock, Thread

from app.services.credits_service import finalize_reserved_credits
from app.services.supabase_service import (
    add_monthly_usage_minutes,
    end_live_session_if_active,
    get_lecture_for_summarization,
    get_lecture_language,
    get_lecture_topic,
    get_lecture_owner,
    get_latest_section_end_index,
    get_section_summaries,
    get_unsummarized_chunks,
    create_lecture_section,
    update_lecture_summary_only,
    set_summary_status,
    list_active_live_sessions,
)
from app.services.summarization_service import generate_section_summary, generate_master_summary


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

            # Finalize notes: generate final section + master summary + recompute
            # (same as _complete_live_session_end — ensures notes are generated even
            # when the session ends via idle timeout rather than an explicit end call)
            try:
                _finalize_notes_async(lecture_id)
            except Exception as e:
                print(f"[live/cleanup] notes finalization failed for {lecture_id}: {e}")

            cleaned += 1

        return cleaned
    finally:
        _cleanup_lock.release()


def _finalize_notes_async(lecture_id: str) -> None:
    """
    Runs the full note-finalization pipeline in a background thread.
    Mirrors what _complete_live_session_end does synchronously, ensuring
    sessions that end via idle-timeout get proper flashcards/quiz/glossary.
    """
    def _run():
        try:
            from app.services.recompute_service import recompute_final_summary
            language = get_lecture_language(lecture_id) or "en"
            topic    = get_lecture_topic(lecture_id)
            lecture  = get_lecture_for_summarization(lecture_id)
            if not lecture:
                return

            # Flush any pending chunks into a final section
            last_sec_end   = get_latest_section_end_index(lecture_id)
            pending_chunks = get_unsummarized_chunks(lecture_id, last_sec_end)
            if pending_chunks:
                micro_list = [c["micro_summary"] for c in pending_chunks if c.get("micro_summary")]
                if micro_list:
                    start_idx = pending_chunks[0]["chunk_index"]
                    last_idx  = pending_chunks[-1]["chunk_index"]
                    total_secs = lecture.get("total_sections") or 0
                    final_section = generate_section_summary(micro_list, language=language, topic=topic)
                    create_lecture_section(lecture_id, final_section, start_idx, last_idx, total_secs)

            # Regenerate master summary from all sections
            all_sections = get_section_summaries(lecture_id)
            if all_sections:
                master = generate_master_summary(all_sections, language=language, topic=topic)
                update_lecture_summary_only(lecture_id, master)

            # Full recompute: flashcards, quiz, glossary, educational reconstruction
            set_summary_status(lecture_id, "recomputing")
            recompute_final_summary(lecture_id)
        except Exception as e:
            print(f"[live/cleanup] _finalize_notes_async error for {lecture_id}: {e}")

    Thread(target=_run, daemon=True).start()
