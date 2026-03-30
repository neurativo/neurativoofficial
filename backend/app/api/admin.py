"""
Admin API — enterprise-grade management endpoints.

Security model:
  - Every route requires a valid Clerk JWT (get_admin_user dependency).
  - The JWT subject must be present in the ADMIN_USER_IDS env-var list.
  - No shared secrets, no API keys — Clerk JWT is the sole auth mechanism.

All destructive actions are recorded in an in-memory audit log (deque, maxlen=100).
"""
import collections
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.auth import get_admin_user, User
from app.core.plans import PLAN_LIMITS
from app.services.supabase_service import (
    admin_get_stats,
    admin_list_users,
    admin_get_user_detail,
    admin_get_lecture_detail,
    admin_list_lectures,
    admin_list_sessions,
    set_user_plan,
    delete_user_account,
    delete_lecture,
    cleanup_old_chunks,
)

router = APIRouter(prefix="/admin", tags=["admin"])

# ---------------------------------------------------------------------------
# In-memory audit log — persists for the lifetime of the process
# ---------------------------------------------------------------------------
_audit_log: collections.deque = collections.deque(maxlen=100)


def _audit(admin_id: str, action: str, target_id: str = "", detail: str = "") -> None:
    _audit_log.appendleft({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "admin_id": admin_id,
        "action": action,
        "target_id": target_id,
        "detail": detail,
    })


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class UpdatePlanRequest(BaseModel):
    plan_tier: str  # "free" | "student" | "pro"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/verify")
async def verify_admin(admin: User = Depends(get_admin_user)):
    """Health-check for admin access. Frontend calls this on mount."""
    return {"ok": True, "user_id": admin.id}


@router.get("/stats")
async def get_stats(admin: User = Depends(get_admin_user)):
    """Platform-wide statistics: user counts, plan distribution, recent activity."""
    stats = admin_get_stats()
    if not stats:
        raise HTTPException(status_code=500, detail="Failed to fetch stats")
    return stats


@router.get("/users")
async def list_users(
    search: str = Query("", max_length=100),
    plan: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(get_admin_user),
):
    """Paginated user list with optional search and plan filter."""
    return admin_list_users(search=search, plan_filter=plan, page=page, page_size=page_size)


@router.get("/users/{user_id}")
async def get_user(user_id: str, admin: User = Depends(get_admin_user)):
    """Full user profile + their lectures."""
    detail = admin_get_user_detail(user_id)
    if not detail:
        raise HTTPException(status_code=404, detail="User not found")
    return detail


@router.patch("/users/{user_id}/plan")
async def update_user_plan(
    user_id: str,
    body: UpdatePlanRequest,
    admin: User = Depends(get_admin_user),
):
    """Allocate or change a user's plan tier."""
    if body.plan_tier not in ("free", "student", "pro"):
        raise HTTPException(status_code=400, detail="Invalid plan tier. Must be free, student, or pro.")
    try:
        set_user_plan(user_id, body.plan_tier)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update plan: {e}")
    _audit(admin.id, "update_plan", user_id, f"plan={body.plan_tier}")
    return {"ok": True, "user_id": user_id, "plan_tier": body.plan_tier}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: User = Depends(get_admin_user)):
    """Permanently delete a user and all their data."""
    try:
        delete_user_account(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {e}")
    _audit(admin.id, "delete_user", user_id)
    return {"ok": True, "deleted_user_id": user_id}


@router.get("/sessions")
async def list_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(get_admin_user),
):
    """All live sessions — active and historical."""
    return admin_list_sessions(page=page, page_size=page_size)


@router.get("/lectures")
async def list_lectures(
    search: str = Query("", max_length=200),
    user_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(get_admin_user),
):
    """All lectures across all users with search/filter."""
    return admin_list_lectures(
        search=search,
        user_id_filter=user_id or "",
        page=page,
        page_size=page_size,
    )


@router.get("/lectures/{lecture_id}")
async def get_lecture_detail(lecture_id: str, admin: User = Depends(get_admin_user)):
    """Full lecture detail: transcript, summary, sections, student questions, sessions."""
    detail = admin_get_lecture_detail(lecture_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return detail


@router.delete("/lectures/{lecture_id}")
async def remove_lecture(lecture_id: str, admin: User = Depends(get_admin_user)):
    """Permanently delete a lecture and its chunks/sections."""
    try:
        delete_lecture(lecture_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete lecture: {e}")
    _audit(admin.id, "delete_lecture", lecture_id)
    return {"ok": True, "deleted_lecture_id": lecture_id}


@router.post("/system/cleanup")
async def trigger_cleanup(
    days: int = Query(30, ge=1, le=365),
    admin: User = Depends(get_admin_user),
):
    """Manually trigger old-chunk cleanup."""
    try:
        deleted = cleanup_old_chunks(days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {e}")
    _audit(admin.id, "cleanup_chunks", detail=f"days={days} deleted={deleted}")
    return {"ok": True, "deleted_chunks": deleted}


@router.get("/system")
async def get_system(admin: User = Depends(get_admin_user)):
    """System info: plan limits config, audit log."""
    return {
        "plan_limits": PLAN_LIMITS,
        "audit_log": list(_audit_log),
    }
