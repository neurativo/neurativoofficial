"""
Admin API — enterprise-grade management endpoints.

Security model:
  - Every route requires a valid Clerk JWT (get_admin_user dependency).
  - The JWT subject must be present in the ADMIN_USER_IDS env-var list.
  - No shared secrets, no API keys — Clerk JWT is the sole auth mechanism.

All destructive actions are recorded in the Supabase audit_logs table (persistent) and
an in-memory deque (fast display buffer for the current process lifetime).
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
    admin_write_audit,
    admin_get_audit_log,
    set_user_plan,
    delete_user_account,
    delete_lecture,
    cleanup_old_chunks,
    get_user_plan,
    get_client as _sb_client,
    set_user_suspended,
    get_user_suspended,
    admin_get_suspended_map,
    get_plan_limits_override,
    set_plan_limits_override,
    get_announcements,
    create_announcement,
    delete_announcement,
)
from app.services.cost_tracker import PRICING, LKR_RATE

router = APIRouter(prefix="/admin", tags=["admin"])

# ---------------------------------------------------------------------------
# In-memory audit log — persists for the lifetime of the process
# ---------------------------------------------------------------------------
_audit_log: collections.deque = collections.deque(maxlen=100)


def _audit(admin_id: str, action: str, target_id: str = "", detail: str = "") -> None:
    """Write audit entry to Supabase (persistent) and in-memory buffer (fast display)."""
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "admin_id": admin_id,
        "action": action,
        "target_id": target_id,
        "detail": detail,
    }
    _audit_log.appendleft(entry)
    admin_write_audit(
        admin_id=admin_id,
        action=action,
        target_id=target_id,
        detail=detail,
    )


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class UpdatePlanRequest(BaseModel):
    plan_tier: str  # "free" | "student" | "pro"


class UpdateLimitsRequest(BaseModel):
    tier: str        # "free" | "student" | "pro"
    limits: dict     # partial or full limits dict for that tier


class CreateAnnouncementRequest(BaseModel):
    text: str
    ann_type: str = "info"      # "info" | "warning" | "maintenance"
    expires_at: Optional[str] = None   # ISO-8601 datetime string or null


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

    # Fetch suspension status for all user IDs
    suspended_map = admin_get_suspended_map(user_ids)

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
            "is_suspended": suspended_map.get(uid, False),
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
    is_suspended = get_user_suspended(user_id)
    profile.update({
        "id": user_id,
        "email": clerk_user.get("email") or profile.get("email", ""),
        "display_name": clerk_user.get("display_name") or profile.get("display_name", ""),
        "image_url": clerk_user.get("image_url", ""),
        "created_at_ms": clerk_user.get("created_at_ms"),
        "last_sign_in_ms": clerk_user.get("last_sign_in_ms"),
        "plan_tier": profile.get("plan_tier") or "free",
        "is_suspended": is_suspended,
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


@router.patch("/users/{user_id}/suspend")
async def suspend_user(user_id: str, admin: User = Depends(get_admin_user)):
    """Suspend a user — blocks all API access without deleting their data."""
    try:
        set_user_suspended(user_id, True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to suspend user: {e}")
    _audit(admin.id, "suspend_user", user_id)
    return {"ok": True, "user_id": user_id, "is_suspended": True}


@router.patch("/users/{user_id}/unsuspend")
async def unsuspend_user(user_id: str, admin: User = Depends(get_admin_user)):
    """Lift suspension — restores full API access."""
    try:
        set_user_suspended(user_id, False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to unsuspend user: {e}")
    _audit(admin.id, "unsuspend_user", user_id)
    return {"ok": True, "user_id": user_id, "is_suspended": False}


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


@router.get("/audit-log")
async def get_audit_log_endpoint(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action: str = Query(""),
    admin: User = Depends(get_admin_user),
):
    """Paginated admin audit log from Supabase."""
    return admin_get_audit_log(page=page, page_size=page_size, action_filter=action)


@router.get("/system")
async def get_system(admin: User = Depends(get_admin_user)):
    """System info: effective plan limits (with any overrides) + recent audit entries."""
    from app.core.plans import get_limits as _get_limits
    effective_limits = {tier: _get_limits(tier) for tier in ("free", "student", "pro")}
    recent = admin_get_audit_log(page=1, page_size=20)
    return {
        "plan_limits": effective_limits,
        "audit_log": recent["logs"],
    }


@router.patch("/system/limits")
async def update_plan_limits(
    body: UpdateLimitsRequest,
    admin: User = Depends(get_admin_user),
):
    """
    Update numeric limits or feature flags for a specific plan tier.
    Changes are persisted to Supabase and take effect immediately (no restart needed).
    """
    if body.tier not in ("free", "student", "pro"):
        raise HTTPException(status_code=400, detail="tier must be free, student, or pro")

    from app.core.plans import PLAN_LIMITS, get_limits as _get_limits
    current_override = get_plan_limits_override() or {}
    merged_tier = dict(PLAN_LIMITS.get(body.tier, PLAN_LIMITS["free"]))
    if body.tier in current_override:
        merged_tier.update(current_override[body.tier])
    merged_tier.update(body.limits)
    new_override = dict(current_override)
    new_override[body.tier] = merged_tier
    try:
        set_plan_limits_override(new_override)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save limits: {e}")
    _audit(admin.id, "update_limits", body.tier, f"keys={list(body.limits.keys())}")
    return {"ok": True, "tier": body.tier, "limits": merged_tier}


# ---------------------------------------------------------------------------
# Engagement analytics
# ---------------------------------------------------------------------------

def _analytics_summary(days: int = 30) -> dict:
    """
    Computes engagement analytics from api_cost_logs and lectures tables.
    Returns: active_users (dau/wau/mau counts), feature_adoption, top_users, daily_active.
    """
    try:
        sb = _sb_client()
        if not sb:
            return {"active_users": {}, "feature_adoption": {}, "top_users": [], "daily_active": []}

        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        since = (now - timedelta(days=days)).isoformat()
        since_7 = (now - timedelta(days=7)).isoformat()
        since_1 = (now - timedelta(days=1)).isoformat()

        logs_res = sb.table("api_cost_logs").select("user_id,feature,created_at").gte("created_at", since).execute()
        logs = logs_res.data or []

        users_30 = {r["user_id"] for r in logs if r.get("user_id")}
        users_7 = {r["user_id"] for r in logs if r.get("user_id") and r.get("created_at", "") >= since_7}
        users_1 = {r["user_id"] for r in logs if r.get("user_id") and r.get("created_at", "") >= since_1}

        active_users = {
            "dau": len(users_1),
            "wau": len(users_7),
            "mau": len(users_30),
        }

        feature_users: dict = {}
        for r in logs:
            feat = r.get("feature")
            uid = r.get("user_id")
            if feat and uid:
                if feat not in feature_users:
                    feature_users[feat] = set()
                feature_users[feat].add(uid)

        total_active = max(len(users_30), 1)
        feature_adoption = {
            feat: round(len(uids) / total_active * 100, 1)
            for feat, uids in feature_users.items()
        }
        feature_adoption = dict(sorted(feature_adoption.items(), key=lambda x: -x[1]))

        daily_active_map: dict = {}
        for r in logs:
            day = (r.get("created_at") or "")[:10]
            uid = r.get("user_id")
            if day and uid:
                if day not in daily_active_map:
                    daily_active_map[day] = set()
                daily_active_map[day].add(uid)
        daily_active = sorted(
            [{"date": d, "active_users": len(uids)} for d, uids in daily_active_map.items()],
            key=lambda x: x["date"],
        )

        user_call_counts: dict = {}
        for r in logs:
            uid = r.get("user_id")
            if uid:
                user_call_counts[uid] = user_call_counts.get(uid, 0) + 1
        top_user_ids = sorted(user_call_counts, key=lambda u: -user_call_counts[u])[:10]

        from app.services.supabase_service import admin_lecture_counts_by_user
        lecture_counts = admin_lecture_counts_by_user(top_user_ids) if top_user_ids else {}

        top_users = [
            {
                "user_id": uid,
                "api_calls": user_call_counts[uid],
                "lectures": lecture_counts.get(uid, 0),
            }
            for uid in top_user_ids
        ]

        return {
            "active_users": active_users,
            "feature_adoption": feature_adoption,
            "top_users": top_users,
            "daily_active": daily_active,
        }
    except Exception as e:
        print(f"[admin/analytics] summary failed: {e}")
        return {"active_users": {}, "feature_adoption": {}, "top_users": [], "daily_active": []}


@router.get("/analytics")
async def get_analytics(
    days: int = Query(30, ge=1, le=365),
    admin: User = Depends(get_admin_user),
):
    """Engagement analytics: active users (DAU/WAU/MAU), feature adoption, top users."""
    return _analytics_summary(days=days)


# ---------------------------------------------------------------------------
# Broadcast announcements
# ---------------------------------------------------------------------------

@router.get("/announcements")
async def list_announcements(admin: User = Depends(get_admin_user)):
    """List all active (non-expired) announcements."""
    return {"announcements": get_announcements()}


@router.post("/announcements")
async def create_announcement_endpoint(
    body: CreateAnnouncementRequest,
    admin: User = Depends(get_admin_user),
):
    """Create a new broadcast announcement."""
    if body.ann_type not in ("info", "warning", "maintenance"):
        raise HTTPException(status_code=400, detail="ann_type must be info, warning, or maintenance")
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")
    try:
        row = create_announcement(
            text=body.text.strip(),
            ann_type=body.ann_type,
            expires_at=body.expires_at,
            created_by=admin.id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create announcement: {e}")
    _audit(admin.id, "create_announcement", str(row.get("id", "")), f"type={body.ann_type}")
    return {"ok": True, "announcement": row}


@router.delete("/announcements/{announcement_id}")
async def delete_announcement_endpoint(
    announcement_id: int,
    admin: User = Depends(get_admin_user),
):
    """Permanently delete an announcement."""
    try:
        delete_announcement(announcement_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete announcement: {e}")
    _audit(admin.id, "delete_announcement", str(announcement_id))
    return {"ok": True, "deleted_id": announcement_id}


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
