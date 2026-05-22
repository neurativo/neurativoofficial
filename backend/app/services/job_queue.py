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
        db = _fresh_db()
        db.table("processing_jobs").update(update).eq("lecture_id", lecture_id).execute()

        if status == "done":
            try:
                job_resp = db.table("processing_jobs").select("user_id").eq("lecture_id", lecture_id).limit(1).execute()
                user_id = (job_resp.data[0].get("user_id") or "") if job_resp.data else ""
                if user_id:
                    from app.services.email_service import send_lecture_ready_for_job
                    send_lecture_ready_for_job(lecture_id, user_id)
            except Exception as e:
                print(f"[job_queue] lecture ready email error (non-fatal): {e}")
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
