"""
Beta Testing Program API.

Public endpoints (require active user):
  GET  /beta/status         → { enabled: bool }
  POST /beta/apply          → submit application (409 if already applied)
  GET  /beta/me             → user's own application row (null if none)
  POST /beta/feedback       → { lecture_id?, rating, comment? }

Admin endpoints (require admin):
  GET  /beta/admin/status
  POST /beta/admin/toggle                    body: { enabled: bool }
  GET  /beta/admin/applications              ?status=pending|approved|rejected
  POST /beta/admin/applications/{id}/approve
  POST /beta/admin/applications/{id}/reject
  GET  /beta/admin/feedback                  ?page=1&page_size=20
  GET  /beta/admin/stats
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_active_user, get_admin_user, User
from app.services.supabase_service import (
    get_beta_enabled,
    set_beta_enabled,
    submit_beta_application,
    get_beta_application,
    list_beta_applications,
    approve_beta_application,
    reject_beta_application,
    submit_beta_feedback,
    list_beta_feedback,
    get_beta_stats,
)

router = APIRouter(prefix="/beta", tags=["beta"])


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class ApplyRequest(BaseModel):
    full_name: Optional[str] = None
    subject:   Optional[str] = None
    use_case:  Optional[str] = Field(None, max_length=400)


class FeedbackRequest(BaseModel):
    lecture_id: Optional[str] = None
    rating:     Optional[int] = Field(None, ge=1, le=5)
    comment:    Optional[str] = Field(None, max_length=1000)


class ToggleRequest(BaseModel):
    enabled: bool


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------

@router.get("/status")
async def beta_status():
    """Returns whether the beta program is currently open."""
    return {"enabled": get_beta_enabled()}


@router.post("/apply")
async def beta_apply(body: ApplyRequest, user: User = Depends(get_active_user)):
    """Submit a beta application. Returns 409 if the user already has an application."""
    existing = get_beta_application(user.id)
    if existing:
        raise HTTPException(
            status_code=409,
            detail="You have already submitted a beta application.",
        )
    row = submit_beta_application(
        user_id=user.id,
        email=user.email,
        full_name=body.full_name,
        subject=body.subject,
        use_case=body.use_case,
    )
    return row


@router.get("/me")
async def beta_me(user: User = Depends(get_active_user)):
    """Returns the user's own beta application, or null if none."""
    return get_beta_application(user.id)


@router.post("/feedback")
async def beta_feedback(body: FeedbackRequest, user: User = Depends(get_active_user)):
    """Submit feedback for the beta program."""
    row = submit_beta_feedback(
        user_id=user.id,
        lecture_id=body.lecture_id,
        rating=body.rating,
        comment=body.comment,
    )
    return row


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@router.get("/admin/status")
async def admin_beta_status(_: User = Depends(get_admin_user)):
    return {"enabled": get_beta_enabled()}


@router.post("/admin/toggle")
async def admin_toggle_beta(body: ToggleRequest, _: User = Depends(get_admin_user)):
    set_beta_enabled(body.enabled)
    return {"enabled": body.enabled}


@router.get("/admin/applications")
async def admin_list_applications(
    status: Optional[str] = Query(None, description="Filter by status: pending|approved|rejected"),
    _: User = Depends(get_admin_user),
):
    return list_beta_applications(status=status)


@router.post("/admin/applications/{application_id}/approve")
async def admin_approve(application_id: str, _: User = Depends(get_admin_user)):
    try:
        return approve_beta_application(application_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/admin/applications/{application_id}/reject")
async def admin_reject(application_id: str, _: User = Depends(get_admin_user)):
    try:
        return reject_beta_application(application_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/admin/feedback")
async def admin_feedback(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: User = Depends(get_admin_user),
):
    return list_beta_feedback(page=page, page_size=page_size)


@router.get("/admin/stats")
async def admin_stats(_: User = Depends(get_admin_user)):
    return get_beta_stats()
