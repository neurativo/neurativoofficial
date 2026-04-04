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
from app.services.clerk_service import clerk_list_users, clerk_get_user, clerk_get_user_count
from app.services.supabase_service import (
    admin_get_stats,
    admin_get_user_detail,
    admin_get_lecture_detail,
    admin_list_lectures,
    admin_list_sessions,
    set_user_plan,
    delete_user_account,
    delete_lecture,
    cleanup_old_chunks,
    get_user_plan,
    get_client as _sb_client,
)
from app.services.cost_tracker import PRICING, LKR_RATE

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
    # Override total_users with authoritative count from Clerk
    clerk_count = clerk_get_user_count()
    if clerk_count:
        stats["total_users"] = clerk_count
    return stats


@router.get("/users")
async def list_users(
    search: str = Query("", max_length=100),
    plan: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(get_admin_user),
):
    """
    Paginated user list sourced from Clerk (authoritative) merged with
    local plan tier and lecture count from Supabase.
    """
    # Fetch all users from Clerk (up to 500; paginate if needed)
    offset = (page - 1) * page_size
    clerk_users = clerk_list_users(limit=500, offset=0)

    if not clerk_users:
        return {"users": [], "total": 0, "page": page, "page_size": page_size,
                "error": "CLERK_SECRET_KEY not configured or Clerk API unavailable"}

    # Fetch plan tiers for all user IDs from Supabase in one pass
    user_ids = [u["id"] for u in clerk_users]
    plans_map = get_user_plan(user_ids)

    # Fetch lecture counts per user
    from app.services.supabase_service import admin_lecture_counts_by_user
    counts_map = admin_lecture_counts_by_user(user_ids)

    # Build merged list
    merged = []
    for u in clerk_users:
        uid = u["id"]
        merged.append({
            "id": uid,
            "email": u["email"],
            "display_name": u["display_name"],
            "first_name": u["first_name"],
            "last_name": u["last_name"],
            "image_url": u["image_url"],
            "plan_tier": plans_map.get(uid, "free"),
            "lecture_count": counts_map.get(uid, 0),
            "created_at_ms": u["created_at_ms"],
            "last_sign_in_ms": u["last_sign_in_ms"],
        })

    # Search
    if search:
        sl = search.lower()
        merged = [u for u in merged if
                  sl in (u["email"] or "").lower() or
                  sl in (u["display_name"] or "").lower() or
                  sl in u["id"].lower()]

    # Plan filter
    if plan in ("free", "student", "pro"):
        merged = [u for u in merged if u["plan_tier"] == plan]

    total = len(merged)
    page_users = merged[offset: offset + page_size]
    return {"users": page_users, "total": total, "page": page, "page_size": page_size}


@router.get("/users/{user_id}")
async def get_user(user_id: str, admin: User = Depends(get_admin_user)):
    """Full user detail: Clerk profile + plan + lectures."""
    clerk_user = clerk_get_user(user_id)
    supabase_detail = admin_get_user_detail(user_id)
    if not clerk_user and not supabase_detail:
        raise HTTPException(status_code=404, detail="User not found")

    profile = supabase_detail.get("profile", {}) if supabase_detail else {}
    profile.update({
        "id": user_id,
        "email": clerk_user.get("email") or profile.get("email", ""),
        "display_name": clerk_user.get("display_name") or profile.get("display_name", ""),
        "image_url": clerk_user.get("image_url", ""),
        "created_at_ms": clerk_user.get("created_at_ms"),
        "last_sign_in_ms": clerk_user.get("last_sign_in_ms"),
        "plan_tier": profile.get("plan_tier") or "free",
    })

    return {
        "profile": profile,
        "lectures": supabase_detail.get("lectures", []) if supabase_detail else [],
    }


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
    days: int = Query(0, ge=0, le=365),
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


# ---------------------------------------------------------------------------
# Cost tracking endpoints
# ---------------------------------------------------------------------------

def _query_cost_logs(
    days: int = 30,
    feature: str = "",
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """Query api_cost_logs from Supabase. Returns empty data if table not found."""
    try:
        sb = _sb_client()
        if not sb:
            return {"logs": [], "total": 0, "total_usd": 0.0}

        # Date filter
        from datetime import datetime, timezone, timedelta
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        q = sb.table("api_cost_logs").select("*", count="exact").gte("created_at", since)
        if feature:
            q = q.eq("feature", feature)

        offset = (page - 1) * page_size
        res = q.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
        total = res.count or 0

        # Also fetch total cost for the period
        total_res = sb.table("api_cost_logs").select("cost_usd").gte("created_at", since).execute()
        total_usd = sum(r.get("cost_usd", 0) or 0 for r in (total_res.data or []))

        return {
            "logs":      res.data or [],
            "total":     total,
            "total_usd": round(total_usd, 6),
            "total_lkr": round(total_usd * LKR_RATE, 2),
        }
    except Exception as e:
        print(f"[admin/costs] query failed: {e}")
        return {"logs": [], "total": 0, "total_usd": 0.0, "total_lkr": 0.0}


def _cost_summary(days: int = 30) -> dict:
    """Aggregate cost by feature and day for the dashboard."""
    try:
        sb = _sb_client()
        if not sb:
            return {"by_feature": {}, "daily": [], "total_usd": 0.0}

        from datetime import datetime, timezone, timedelta
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        res = sb.table("api_cost_logs").select("feature,cost_usd,created_at,model").gte("created_at", since).execute()
        rows = res.data or []

        by_feature: dict = {}
        daily: dict = {}
        total_usd = 0.0

        for r in rows:
            feat = r.get("feature", "unknown")
            cost = r.get("cost_usd") or 0.0
            total_usd += cost
            by_feature[feat] = round(by_feature.get(feat, 0.0) + cost, 8)
            day = (r.get("created_at") or "")[:10]
            if day:
                daily[day] = round(daily.get(day, 0.0) + cost, 8)

        daily_list = sorted([{"date": d, "cost_usd": v} for d, v in daily.items()], key=lambda x: x["date"])

        return {
            "by_feature": by_feature,
            "daily":      daily_list,
            "total_usd":  round(total_usd, 6),
            "total_lkr":  round(total_usd * LKR_RATE, 2),
            "pricing":    PRICING,
        }
    except Exception as e:
        print(f"[admin/costs/summary] query failed: {e}")
        return {"by_feature": {}, "daily": [], "total_usd": 0.0, "total_lkr": 0.0, "pricing": PRICING}


@router.get("/costs")
async def get_costs(
    days:      int = Query(30, ge=1, le=365),
    feature:   str = Query(""),
    page:      int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    admin: User = Depends(get_admin_user),
):
    """Paginated raw cost logs with period totals."""
    return _query_cost_logs(days=days, feature=feature, page=page, page_size=page_size)


@router.get("/costs/summary")
async def get_costs_summary(
    days: int = Query(30, ge=1, le=365),
    admin: User = Depends(get_admin_user),
):
    """Aggregated cost breakdown by feature and day."""
    return _cost_summary(days=days)
