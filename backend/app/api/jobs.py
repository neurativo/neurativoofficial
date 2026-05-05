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
