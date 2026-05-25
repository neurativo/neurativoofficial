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
import calendar as _calendar
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel

from app.core.auth import get_admin_user, User
from app.core.config import settings
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
    get_stale_free_lectures,
    mark_content_deleted,
    set_deletion_scheduled,
    get_lecture_full,
)
from app.services.cost_tracker import PRICING, LKR_RATE
from app.services.recompute_service import recompute_final_summary

router = APIRouter(prefix="/admin", tags=["admin"])

# ---------------------------------------------------------------------------
# In-memory audit log — persists for the lifetime of the process
# ---------------------------------------------------------------------------
_audit_log: collections.deque = collections.deque(maxlen=100)


def _audit(admin_id: str, action: str, target_id: str = "", detail: str = "") -> None:
    """Write audit entry to Supabase (persistent) and in-memory buffer (fast display)."""
    entry = {
        "created_at": datetime.now(timezone.utc).isoformat(),
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

_clerk_executor = ThreadPoolExecutor(max_workers=4)


@router.get("/admins")
async def list_admins(admin: User = Depends(get_admin_user)):
    """List all admins: env-var superadmins + DB-managed admins."""
    loop = asyncio.get_event_loop()

    # 1. Fetch DB-managed admins (sync supabase call in thread)
    db_admins = []
    try:
        sb = _sb_client()
        if sb:
            def _fetch_db():
                return sb.table("admin_users").select("user_id,added_by,note,created_at").order("created_at").execute()
            res = await loop.run_in_executor(_clerk_executor, _fetch_db)
            db_admins = res.data or []
    except Exception:
        pass

    env_user_ids = list(settings.ADMIN_USER_IDS)
    all_uids = list({uid for uid in env_user_ids + [r["user_id"] for r in db_admins]})

    # 2. Enrich with Clerk profiles concurrently (sync HTTP in thread pool)
    async def _get_profile(uid):
        try:
            return uid, await loop.run_in_executor(_clerk_executor, clerk_get_user, uid)
        except Exception:
            return uid, {}

    profile_pairs = await asyncio.gather(*[_get_profile(uid) for uid in all_uids])
    profiles = {uid: (p or {}) for uid, p in profile_pairs}

    def _fmt(uid):
        p = profiles.get(uid, {})
        name = (p.get("display_name") or
                f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or
                uid)
        return {"user_id": uid, "name": name,
                "email": p.get("email", ""), "image_url": p.get("image_url", "")}

    result = []
    for uid in env_user_ids:
        result.append({**_fmt(uid), "source": "env", "removable": False})
    for row in db_admins:
        uid = row["user_id"]
        if uid in env_user_ids:
            continue
        result.append({**_fmt(uid), "source": "db", "removable": True,
                       "added_by": row.get("added_by", ""), "note": row.get("note"),
                       "created_at": row.get("created_at")})
    return {"admins": result}


@router.post("/admins", status_code=201)
async def add_admin(body: dict, admin: User = Depends(get_admin_user)):
    """Grant admin access to a Clerk user by user_id."""
    user_id = (body.get("user_id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=422, detail="user_id is required")
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You are already an admin")
    # Validate that this Clerk user exists (sync call → thread)
    loop = asyncio.get_event_loop()
    profile = await loop.run_in_executor(_clerk_executor, clerk_get_user, user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Clerk user not found")
    sb = _sb_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")
    existing = sb.table("admin_users").select("user_id").eq("user_id", user_id).maybe_single().execute()
    if existing.data or user_id in settings.ADMIN_USER_IDS:
        raise HTTPException(status_code=409, detail="User is already an admin")
    row = {"user_id": user_id, "added_by": admin.id, "note": body.get("note") or None}
    res = sb.table("admin_users").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Insert failed")
    return res.data[0]


@router.delete("/admins/{user_id}", status_code=204)
async def remove_admin(user_id: str, admin: User = Depends(get_admin_user)):
    """Revoke admin access for a DB-managed admin (cannot remove env-var superadmins)."""
    if user_id in settings.ADMIN_USER_IDS:
        raise HTTPException(status_code=400, detail="Cannot remove a superadmin set via environment variable")
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    sb = _sb_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")
    sb.table("admin_users").delete().eq("user_id", user_id).execute()
    return None


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


@router.post("/lectures/{lecture_id}/recompute")
async def recompute_lecture(
    lecture_id: str,
    background_tasks: BackgroundTasks,
    admin: User = Depends(get_admin_user),
):
    """Queue recomputation of stored lecture content from existing transcript data."""
    lecture = get_lecture_full(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")

    transcript = (lecture.get("transcript") or "").strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="No transcript available to recompute from.")

    background_tasks.add_task(recompute_final_summary, lecture_id)
    _audit(admin.id, "recompute_lecture", lecture_id)
    return {"ok": True, "lecture_id": lecture_id, "status": "queued"}


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


@router.post("/maintenance/cleanup")
async def run_cleanup(user=Depends(get_admin_user)):
    """
    Retention policy enforcement.
    - Lectures 27-29 days old: set deletion_scheduled_at (3-day warning)
    - Lectures ≥ 30 days old: delete transcript + summary + generated content
    Returns counts of actions taken.
    """
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    warn_cutoff   = now - timedelta(days=27)
    delete_cutoff = now - timedelta(days=30)

    stale = get_stale_free_lectures(days=27)   # lectures ≥ 27 days old
    warned  = 0
    deleted = 0

    for lec in stale:
        created = lec.get("created_at", "")
        try:
            age = now - datetime.fromisoformat(created.replace("Z", "+00:00"))
        except Exception:
            continue

        if age.days >= 30:
            mark_content_deleted(lec["id"])
            deleted += 1
        elif age.days >= 27:
            scheduled = (datetime.fromisoformat(created.replace("Z", "+00:00")) + timedelta(days=30)).isoformat()
            set_deletion_scheduled(lec["id"], scheduled)
            warned += 1

    _audit(user.id, "retention_cleanup", detail=f"warned={warned} deleted={deleted}")
    return {
        "checked": len(stale),
        "warned":  warned,
        "deleted": deleted,
        "ran_at":  now.isoformat(),
    }


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


# ── Financials helpers ────────────────────────────────────────────────────────

_PLAN_PRICES_FIN = {"student": 9.99, "pro": 19.99}
_DODO_RATE       = 0.035
_DODO_FIXED      = 0.35   # per transaction


def _month_bounds(month_str: str):
    """Return (start_iso, end_iso) for a 'YYYY-MM' period string."""
    try:
        year, mon = int(month_str[:4]), int(month_str[5:7])
        start = datetime(year, mon, 1, tzinfo=timezone.utc)
        last  = _calendar.monthrange(year, mon)[1]
        end   = datetime(year, mon, last, 23, 59, 59, 999999, tzinfo=timezone.utc)
        return start.isoformat(), end.isoformat()
    except (ValueError, IndexError):
        raise HTTPException(status_code=422, detail=f"Invalid month format '{month_str}'. Expected YYYY-MM.")


def _build_financials_summary(month_str: str) -> dict:
    """Full P&L for one month. Returns {} when Supabase is unavailable."""
    sb = _sb_client()
    if not sb:
        return {}

    start, end = _month_bounds(month_str)

    # 1. Subscription revenue (active/renewed subs whose period_end >= month_start)
    sub_res = sb.table("user_subscriptions") \
        .select("plan_tier") \
        .in_("subscription_status", ["active", "renewed"]) \
        .gte("subscription_period_end", start) \
        .execute()
    sub_counts: dict = {"student": 0, "pro": 0}
    for r in (sub_res.data or []):
        tier = r.get("plan_tier", "")
        if tier in sub_counts:
            sub_counts[tier] += 1
    sub_revenue = round(
        sub_counts["student"] * _PLAN_PRICES_FIN["student"] +
        sub_counts["pro"]     * _PLAN_PRICES_FIN["pro"], 2
    )
    total_subs = sub_counts["student"] + sub_counts["pro"]

    # 2. Credit pack revenue (completed purchase_intents in period)
    pack_res = sb.table("purchase_intents") \
        .select("price_usd") \
        .eq("status", "completed") \
        .gte("created_at", start) \
        .lte("created_at", end) \
        .execute()
    pack_rows       = pack_res.data or []
    credit_revenue  = round(sum(r.get("price_usd") or 0.0 for r in pack_rows), 2)
    credit_pack_count = len(pack_rows)

    total_revenue = round(sub_revenue + credit_revenue, 2)

    # 3. AI API costs
    cost_res = sb.table("api_cost_logs") \
        .select("cost_usd") \
        .gte("created_at", start) \
        .lte("created_at", end) \
        .execute()
    ai_cost = round(sum(r.get("cost_usd") or 0.0 for r in (cost_res.data or [])), 2)

    # 4. Dodo payment processing fees (auto-calculated)
    credit_pack_fees = round(
        sum((r.get("price_usd") or 0.0) * _DODO_RATE + _DODO_FIXED for r in pack_rows), 2
    )
    sub_fees   = round(sub_revenue * _DODO_RATE + total_subs * _DODO_FIXED, 2)
    dodo_fees  = round(credit_pack_fees + sub_fees, 2)

    # 5. Infrastructure costs (manual entries)
    infra_res = sb.table("admin_external_costs") \
        .select("category,amount_usd") \
        .eq("period", month_str) \
        .execute()
    infra_by_cat: dict = {"railway": 0.0, "supabase": 0.0, "clerk": 0.0, "resend": 0.0, "other": 0.0}
    for r in (infra_res.data or []):
        cat = r.get("category") or "other"
        infra_by_cat[cat] = round(infra_by_cat.get(cat, 0.0) + (r.get("amount_usd") or 0.0), 2)
    infra_total = round(sum(infra_by_cat.values()), 2)

    # 6. Totals
    total_costs  = round(ai_cost + dodo_fees + infra_total, 2)
    net_profit   = round(total_revenue - total_costs, 2)
    margin_pct   = round((net_profit / max(total_revenue, 0.000001)) * 100, 1) \
                   if total_revenue > 0 else 0.0

    return {
        "month": month_str,
        "revenue": {
            "subscriptions_usd":  sub_revenue,
            "subscriber_counts":  sub_counts,
            "credit_packs_usd":   credit_revenue,
            "credit_pack_count":  credit_pack_count,
            "total_usd":          total_revenue,
        },
        "costs": {
            "ai_api_usd":          ai_cost,
            "dodo_fees_usd":       dodo_fees,
            "dodo_fees_breakdown": {
                "credit_pack_fees_usd": credit_pack_fees,
                "subscription_fees_usd": sub_fees,
            },
            "infrastructure_usd":          infra_total,
            "infrastructure_by_category":  infra_by_cat,
            "total_usd":                   total_costs,
        },
        "net_profit_usd": net_profit,
        "margin_pct":     margin_pct,
    }


# ── Financials endpoints ──────────────────────────────────────────────────────

@router.get("/financials/summary")
async def get_financials_summary(
    month: str = None,
    admin: User = Depends(get_admin_user),
):
    """Full P&L for a single month. Defaults to current month."""
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
    summary = _build_financials_summary(month)
    if not summary:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return summary


@router.get("/financials/trend")
async def get_financials_trend(
    months: int = 12,
    admin: User = Depends(get_admin_user),
):
    """Monthly P&L summaries for the last N months (oldest first)."""
    if months < 1 or months > 24:
        months = 12
    now   = datetime.now(timezone.utc)
    result = []
    for i in range(months - 1, -1, -1):
        year  = now.year
        mon   = now.month - i
        while mon <= 0:
            mon  += 12
            year -= 1
        month_str = f"{year:04d}-{mon:02d}"
        s = _build_financials_summary(month_str)
        result.append({
            "month":          month_str,
            "revenue_usd":    s.get("revenue", {}).get("total_usd", 0.0) if s else 0.0,
            "costs_usd":      s.get("costs",   {}).get("total_usd", 0.0) if s else 0.0,
            "net_profit_usd": s.get("net_profit_usd", 0.0) if s else 0.0,
            "margin_pct":     s.get("margin_pct", 0.0)     if s else 0.0,
        })
    return {"months": result}


@router.get("/external-costs")
async def list_external_costs(
    month: str,
    admin: User = Depends(get_admin_user),
):
    """List all manual cost entries for a given YYYY-MM month."""
    sb = _sb_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")
    res = sb.table("admin_external_costs") \
        .select("id,category,label,amount_usd,note,period,cost_date,created_at") \
        .eq("period", month) \
        .order("cost_date", desc=False) \
        .execute()
    return {"month": month, "items": res.data or []}


@router.post("/external-costs", status_code=201)
async def create_external_cost(
    body: dict,
    admin: User = Depends(get_admin_user),
):
    """Create a manual cost entry."""
    sb = _sb_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        amount = float(body.get("amount_usd", 0) or 0)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="amount_usd must be a number")
    cost_date = body.get("cost_date") or None
    period = body.get("period", "")
    # Auto-derive period from cost_date if not supplied
    if cost_date and not period:
        period = cost_date[:7]  # 'YYYY-MM-DD' → 'YYYY-MM'
    row = {
        "category":   body.get("category", "other"),
        "label":      body.get("label", ""),
        "amount_usd": amount,
        "period":     period,
        "note":       body.get("note"),
        "cost_date":  cost_date,
    }
    res = sb.table("admin_external_costs").insert(row).execute()
    items = res.data or []
    if not items:
        raise HTTPException(status_code=500, detail="Insert failed")
    return items[0]


@router.put("/external-costs/{cost_id}")
async def update_external_cost(
    cost_id: str,
    body: dict,
    admin: User = Depends(get_admin_user),
):
    """Update a manual cost entry."""
    sb = _sb_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        amount = float(body.get("amount_usd", 0) or 0)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="amount_usd must be a number")
    cost_date = body.get("cost_date") or None
    period = body.get("period", "")
    if cost_date and not period:
        period = cost_date[:7]
    row = {
        "category":   body.get("category", "other"),
        "label":      body.get("label", ""),
        "amount_usd": amount,
        "period":     period,
        "note":       body.get("note"),
        "cost_date":  cost_date,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    res = sb.table("admin_external_costs").update(row).eq("id", cost_id).execute()
    items = res.data or []
    if not items:
        raise HTTPException(status_code=404, detail="Cost entry not found")
    return items[0]


@router.delete("/external-costs/{cost_id}", status_code=204)
async def delete_external_cost(
    cost_id: str,
    admin: User = Depends(get_admin_user),
):
    """Delete a manual cost entry."""
    sb = _sb_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")
    sb.table("admin_external_costs").delete().eq("id", cost_id).execute()
    return None


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


# ---------------------------------------------------------------------------
# Credits management endpoints
# ---------------------------------------------------------------------------

class AdjustCreditsRequest(BaseModel):
    amount: int                         # positive = grant, negative = deduct
    reason: str = "admin_grant"         # admin_grant | admin_deduct | starter_grant | plan_grant | refund | manual
    product: str = ""


class SetCreditsRequest(BaseModel):
    amount: int                         # exact balance to set (≥ 0)
    reason: str = "admin_set"


class SetCreditsSubscriptionRequest(BaseModel):
    status: str                         # "none" | "monthly"
    expires_at: Optional[str] = None    # ISO-8601 or null


from app.services.supabase_service import (
    get_user_credits,
    admin_adjust_credits,
    admin_set_credits_subscription,
)


@router.get("/users/{user_id}/credits")
async def get_credits(user_id: str, admin: User = Depends(get_admin_user)):
    """Get a user's current credit balance, subscription status, and transaction history."""
    return get_user_credits(user_id)


@router.post("/users/{user_id}/credits/adjust")
async def adjust_credits(
    user_id: str,
    body: AdjustCreditsRequest,
    admin: User = Depends(get_admin_user),
):
    """
    Add or deduct credits from a user's balance.
    Positive amount = grant, negative = deduct.
    """
    valid_reasons = {"admin_grant", "admin_deduct", "starter_grant", "plan_grant", "monthly_refresh", "refund", "manual"}
    if body.reason not in valid_reasons:
        raise HTTPException(status_code=400, detail=f"reason must be one of: {', '.join(sorted(valid_reasons))}")
    if body.amount == 0:
        raise HTTPException(status_code=400, detail="amount must be non-zero")
    try:
        result = admin_adjust_credits(
            user_id=user_id,
            amount=body.amount,
            reason=body.reason,
            product=body.product,
            set_absolute=False,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    action = "grant_credits" if body.amount > 0 else "deduct_credits"
    _audit(admin.id, action, user_id, f"amount={body.amount} reason={body.reason} new_balance={result['credits']}")
    return {"ok": True, **result}


@router.post("/users/{user_id}/credits/set")
async def set_credits(
    user_id: str,
    body: SetCreditsRequest,
    admin: User = Depends(get_admin_user),
):
    """Set a user's credit balance to an exact value."""
    if body.amount < 0:
        raise HTTPException(status_code=400, detail="amount must be >= 0")
    try:
        result = admin_adjust_credits(
            user_id=user_id,
            amount=body.amount,
            reason=body.reason,
            set_absolute=True,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    _audit(admin.id, "set_credits", user_id, f"amount={body.amount} new_balance={result['credits']}")
    return {"ok": True, **result}


@router.post("/users/{user_id}/credits/subscription")
async def set_credits_subscription(
    user_id: str,
    body: SetCreditsSubscriptionRequest,
    admin: User = Depends(get_admin_user),
):
    """Set a user's credit subscription status (none | monthly)."""
    if body.status not in ("none", "monthly"):
        raise HTTPException(status_code=400, detail="status must be 'none' or 'monthly'")
    try:
        result = admin_set_credits_subscription(
            user_id=user_id,
            status=body.status,
            expires_at=body.expires_at,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    _audit(admin.id, "set_credits_subscription", user_id, f"status={body.status} expires={body.expires_at}")
    return {"ok": True, **result}


# ---------------------------------------------------------------------------
# Visit analytics
# ---------------------------------------------------------------------------

def _visit_analytics(days: int = 30) -> dict:
    """Pageview stats from page_visits table."""
    try:
        from datetime import timedelta
        sb = _sb_client()
        if not sb:
            return {}
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        res = sb.table("page_visits").select("page,session_id,user_id,created_at").gte("created_at", since).execute()
        rows = res.data or []

        total_views = len(rows)
        unique_sessions = len({r["session_id"] for r in rows if r.get("session_id")})
        unique_users = len({r["user_id"] for r in rows if r.get("user_id")})

        page_counts: dict = {}
        for r in rows:
            p = r.get("page") or "unknown"
            page_counts[p] = page_counts.get(p, 0) + 1
        top_pages = sorted([{"page": p, "views": v} for p, v in page_counts.items()], key=lambda x: -x["views"])

        daily: dict = {}
        for r in rows:
            day = (r.get("created_at") or "")[:10]
            if day:
                daily[day] = daily.get(day, 0) + 1
        daily_trend = sorted([{"date": d, "views": v} for d, v in daily.items()], key=lambda x: x["date"])

        # Authenticated vs anonymous split
        authed = sum(1 for r in rows if r.get("user_id"))
        anon = total_views - authed

        return {
            "total_views":     total_views,
            "unique_sessions": unique_sessions,
            "unique_users":    unique_users,
            "authed_views":    authed,
            "anon_views":      anon,
            "top_pages":       top_pages[:10],
            "daily_trend":     daily_trend,
        }
    except Exception as e:
        print(f"[admin/visits] failed: {e}")
        return {}


@router.get("/analytics/visits")
async def get_visit_analytics(
    days: int = Query(30, ge=1, le=365),
    _: User = Depends(get_admin_user),
):
    """Pageview analytics: total views, unique sessions, top pages, daily trend."""
    return _visit_analytics(days=days)


# ---------------------------------------------------------------------------
# Enhanced cost analytics
# ---------------------------------------------------------------------------

def _cost_overview(days: int = 30) -> dict:
    """Grand total costs with plan-tier and model breakdowns."""
    try:
        from datetime import timedelta
        sb = _sb_client()
        if not sb:
            return {}
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        res = sb.table("api_cost_logs").select("cost_usd,plan_tier,model,created_at").gte("created_at", since).execute()
        rows = res.data or []

        total_usd = 0.0
        by_plan: dict = {}
        by_model: dict = {}
        daily: dict = {}

        for r in rows:
            cost = r.get("cost_usd") or 0.0
            total_usd += cost
            plan = r.get("plan_tier") or "unknown"
            by_plan[plan] = round(by_plan.get(plan, 0.0) + cost, 8)
            model = r.get("model") or "unknown"
            by_model[model] = round(by_model.get(model, 0.0) + cost, 8)
            day = (r.get("created_at") or "")[:10]
            if day:
                daily[day] = round(daily.get(day, 0.0) + cost, 8)

        daily_list = sorted([{"date": d, "cost_usd": v, "cost_lkr": round(v * LKR_RATE, 2)} for d, v in daily.items()], key=lambda x: x["date"])

        return {
            "total_usd":  round(total_usd, 6),
            "total_lkr":  round(total_usd * LKR_RATE, 2),
            "by_plan":    {k: round(v, 6) for k, v in sorted(by_plan.items(), key=lambda x: -x[1])},
            "by_model":   {k: round(v, 6) for k, v in sorted(by_model.items(), key=lambda x: -x[1])},
            "daily":      daily_list,
            "call_count": len(rows),
        }
    except Exception as e:
        print(f"[admin/costs/overview] failed: {e}")
        return {}


def _cost_per_user(days: int = 30, page: int = 1, page_size: int = 50) -> dict:
    """Per-user cost breakdown, sorted by total spend."""
    try:
        from datetime import timedelta
        sb = _sb_client()
        if not sb:
            return {"users": [], "total": 0}
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        res = sb.table("api_cost_logs").select("user_id,cost_usd,plan_tier,feature,created_at").gte("created_at", since).execute()
        rows = res.data or []

        user_map: dict = {}
        for r in rows:
            uid = r.get("user_id")
            if not uid:
                continue
            if uid not in user_map:
                user_map[uid] = {"user_id": uid, "cost_usd": 0.0, "call_count": 0, "plan_tier": r.get("plan_tier") or "free", "features": set()}
            user_map[uid]["cost_usd"] += r.get("cost_usd") or 0.0
            user_map[uid]["call_count"] += 1
            if r.get("feature"):
                user_map[uid]["features"].add(r["feature"])
            # Keep most recent plan_tier seen
            if r.get("plan_tier"):
                user_map[uid]["plan_tier"] = r["plan_tier"]

        sorted_users = sorted(user_map.values(), key=lambda x: -x["cost_usd"])
        total = len(sorted_users)
        offset = (page - 1) * page_size
        page_users = sorted_users[offset:offset + page_size]

        for u in page_users:
            u["cost_usd"] = round(u["cost_usd"], 6)
            u["cost_lkr"] = round(u["cost_usd"] * LKR_RATE, 2)
            u["features"] = list(u["features"])

        return {"users": page_users, "total": total}
    except Exception as e:
        print(f"[admin/costs/per-user] failed: {e}")
        return {"users": [], "total": 0}


def _beta_costs(days: int = 30) -> dict:
    """Cost breakdown for beta testers only."""
    try:
        from datetime import timedelta
        sb = _sb_client()
        if not sb:
            return {}
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        # Get all beta user IDs (approved applications)
        beta_res = sb.table("beta_applications").select("user_id,email,approved_at,expires_at").eq("status", "approved").execute()
        beta_users = {r["user_id"]: r for r in (beta_res.data or [])}
        if not beta_users:
            return {"total_usd": 0.0, "total_lkr": 0.0, "user_count": 0, "avg_cost_usd": 0.0, "users": [], "by_feature": {}}

        # Fetch cost logs for beta users in the period
        cost_res = sb.table("api_cost_logs").select("user_id,cost_usd,feature,created_at").gte("created_at", since).in_("user_id", list(beta_users.keys())).execute()
        rows = cost_res.data or []

        total_usd = 0.0
        by_feature: dict = {}
        per_user: dict = {}

        for r in rows:
            uid = r.get("user_id")
            cost = r.get("cost_usd") or 0.0
            total_usd += cost
            feat = r.get("feature") or "unknown"
            by_feature[feat] = round(by_feature.get(feat, 0.0) + cost, 8)
            if uid:
                if uid not in per_user:
                    per_user[uid] = {"user_id": uid, "email": beta_users[uid].get("email", ""), "cost_usd": 0.0, "call_count": 0}
                per_user[uid]["cost_usd"] += cost
                per_user[uid]["call_count"] += 1

        user_list = sorted(per_user.values(), key=lambda x: -x["cost_usd"])
        for u in user_list:
            u["cost_usd"] = round(u["cost_usd"], 6)
            u["cost_lkr"] = round(u["cost_usd"] * LKR_RATE, 2)

        user_count = len(beta_users)
        avg_cost = round(total_usd / max(len(per_user), 1), 6)

        return {
            "total_usd":     round(total_usd, 6),
            "total_lkr":     round(total_usd * LKR_RATE, 2),
            "user_count":    user_count,
            "active_count":  len(per_user),
            "avg_cost_usd":  avg_cost,
            "avg_cost_lkr":  round(avg_cost * LKR_RATE, 2),
            "users":         user_list,
            "by_feature":    {k: round(v, 6) for k, v in sorted(by_feature.items(), key=lambda x: -x[1])},
        }
    except Exception as e:
        print(f"[admin/costs/beta] failed: {e}")
        return {}


@router.get("/costs/overview")
async def get_costs_overview(
    days: int = Query(30, ge=1, le=365),
    _: User = Depends(get_admin_user),
):
    """Grand total costs with plan-tier and model breakdowns."""
    return _cost_overview(days=days)


@router.get("/costs/per-user")
async def get_costs_per_user(
    days:      int = Query(30, ge=1, le=365),
    page:      int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: User = Depends(get_admin_user),
):
    """Per-user cost breakdown sorted by total spend."""
    return _cost_per_user(days=days, page=page, page_size=page_size)


@router.get("/costs/beta")
async def get_costs_beta(
    days: int = Query(30, ge=1, le=365),
    _: User = Depends(get_admin_user),
):
    """Cost breakdown for beta testers only."""
    return _beta_costs(days=days)


def _cost_financial(days: int = 30) -> dict:
    """
    Financial overview: actual AI costs + actual credit-pack revenue +
    subscription MRR snapshot + gross profit per plan tier.
    All figures are real data — nothing estimated except where labeled.
    """
    try:
        from datetime import timedelta
        sb = _sb_client()
        if not sb:
            return {}
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        # ── 1. AI costs (actual, from api_cost_logs) ──────────────────────────
        cost_res = sb.table("api_cost_logs") \
            .select("cost_usd,plan_tier") \
            .gte("created_at", since).execute()
        cost_rows = cost_res.data or []
        total_ai_cost = sum(r.get("cost_usd") or 0.0 for r in cost_rows)
        ai_by_plan: dict = {}
        for r in cost_rows:
            plan = r.get("plan_tier") or "free"
            ai_by_plan[plan] = round(ai_by_plan.get(plan, 0.0) + (r.get("cost_usd") or 0.0), 8)

        # ── 2. Credit-pack revenue (actual completed purchases in period) ──────
        pack_res = sb.table("purchase_intents") \
            .select("price_usd,product,user_id") \
            .eq("status", "completed") \
            .gte("created_at", since).execute()
        pack_rows = pack_res.data or []
        credit_revenue = sum(r.get("price_usd") or 0.0 for r in pack_rows)
        credit_by_product: dict = {}
        for r in pack_rows:
            prod = r.get("product") or "unknown"
            credit_by_product[prod] = credit_by_product.get(prod, 0) + 1

        # ── 3. Subscription MRR — current active subscribers snapshot ──────────
        PLAN_PRICES = {"student": 9.99, "pro": 19.99}
        sub_res = sb.table("user_subscriptions") \
            .select("plan_tier") \
            .in_("subscription_status", ["active", "renewed"]).execute()
        sub_counts: dict = {"student": 0, "pro": 0}
        for r in (sub_res.data or []):
            tier = r.get("plan_tier", "")
            if tier in sub_counts:
                sub_counts[tier] += 1
        mrr_usd = round(sub_counts["student"] * PLAN_PRICES["student"] +
                        sub_counts["pro"]    * PLAN_PRICES["pro"], 2)

        # ── 4. User counts by plan (current state from profiles) ───────────────
        profile_res = sb.table("profiles").select("plan_tier").execute()
        plan_user_counts: dict = {"free": 0, "student": 0, "pro": 0}
        for r in (profile_res.data or []):
            tier = r.get("plan_tier") or "free"
            if tier in plan_user_counts:
                plan_user_counts[tier] += 1

        # ── 5. Totals + profit ─────────────────────────────────────────────────
        # Revenue = actual credit packs + MRR estimate (subscription)
        total_revenue_usd = round(credit_revenue + mrr_usd, 2)
        gross_profit_usd  = round(total_revenue_usd - total_ai_cost, 2)
        margin_pct = round((gross_profit_usd / max(total_revenue_usd, 0.000001)) * 100, 1) \
                     if total_revenue_usd > 0 else 0.0

        # ── 6. Per-plan breakdown ──────────────────────────────────────────────
        by_plan: dict = {}
        for tier in ["free", "student", "pro"]:
            ai_cost     = round(ai_by_plan.get(tier, 0.0), 6)
            sub_rev     = round(sub_counts.get(tier, 0) * PLAN_PRICES.get(tier, 0.0), 2)
            # profit per plan only considers subscription revenue vs AI cost for that tier
            plan_profit = round(sub_rev - ai_cost, 6)
            by_plan[tier] = {
                "user_count":          plan_user_counts.get(tier, 0),
                "subscriber_count":    sub_counts.get(tier, 0),
                "ai_cost_usd":         ai_cost,
                "ai_cost_lkr":         round(ai_cost * LKR_RATE, 2),
                "subscription_mrr_usd": sub_rev,
                "plan_profit_usd":     plan_profit,
                "plan_profit_lkr":     round(plan_profit * LKR_RATE, 2),
            }

        return {
            "days":                days,
            "total_ai_cost_usd":   round(total_ai_cost, 6),
            "total_ai_cost_lkr":   round(total_ai_cost * LKR_RATE, 2),
            "credit_revenue_usd":  round(credit_revenue, 2),
            "credit_pack_count":   len(pack_rows),
            "credit_by_product":   credit_by_product,
            "mrr_usd":             mrr_usd,
            "subscriber_counts":   sub_counts,
            "total_revenue_usd":   total_revenue_usd,
            "total_revenue_lkr":   round(total_revenue_usd * LKR_RATE, 2),
            "gross_profit_usd":    gross_profit_usd,
            "gross_profit_lkr":    round(gross_profit_usd * LKR_RATE, 2),
            "margin_pct":          margin_pct,
            "by_plan":             by_plan,
        }
    except Exception as e:
        print(f"[admin/costs/financial] failed: {e}")
        return {}


def _cost_user_detail(user_id: str, days: int = 30) -> dict:
    """Full cost breakdown for a single user."""
    try:
        from datetime import timedelta
        sb = _sb_client()
        if not sb:
            return {}
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        res = sb.table("api_cost_logs") \
            .select("feature,model,cost_usd,input_tokens,output_tokens,audio_seconds,created_at,lecture_id,plan_tier") \
            .eq("user_id", user_id) \
            .gte("created_at", since) \
            .order("created_at", desc=True) \
            .limit(500).execute()
        rows = res.data or []

        total_cost = sum(r.get("cost_usd") or 0.0 for r in rows)
        by_feature: dict = {}
        by_model:   dict = {}
        daily:      dict = {}

        for r in rows:
            feat  = r.get("feature") or "unknown"
            model = r.get("model")   or "unknown"
            cost  = r.get("cost_usd") or 0.0
            by_feature[feat]  = round(by_feature.get(feat, 0.0) + cost, 8)
            by_model[model]   = round(by_model.get(model, 0.0)  + cost, 8)
            day = (r.get("created_at") or "")[:10]
            if day:
                daily[day] = round(daily.get(day, 0.0) + cost, 8)

        return {
            "user_id":        user_id,
            "days":           days,
            "total_cost_usd": round(total_cost, 6),
            "total_cost_lkr": round(total_cost * LKR_RATE, 2),
            "call_count":     len(rows),
            "by_feature":     {k: round(v, 6) for k, v in sorted(by_feature.items(),  key=lambda x: -x[1])},
            "by_model":       {k: round(v, 6) for k, v in sorted(by_model.items(),    key=lambda x: -x[1])},
            "daily":          sorted([{"date": d, "cost_usd": v} for d, v in daily.items()], key=lambda x: x["date"]),
            "recent_logs":    rows[:50],
        }
    except Exception as e:
        print(f"[admin/costs/user] failed: {e}")
        return {}


@router.get("/costs/financial")
async def get_costs_financial(
    days: int = Query(30, ge=1, le=365),
    _: User = Depends(get_admin_user),
):
    """Financial overview: AI costs, credit-pack revenue, subscription MRR, profit."""
    return _cost_financial(days=days)


@router.get("/costs/user/{user_id}")
async def get_costs_user(
    user_id: str,
    days: int = Query(30, ge=1, le=365),
    _: User = Depends(get_admin_user),
):
    """Full cost breakdown for a single user."""
    return _cost_user_detail(user_id=user_id, days=days)


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------

class FeedbackStatusUpdate(BaseModel):
    status: str  # "new" | "read" | "done"


@router.get("/feedback")
async def admin_list_feedback(
    limit:  int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    type:   str = Query(None),
    status: str = Query(None),
    admin: User = Depends(get_admin_user),
):
    """Returns all user feedback, newest first. Filterable by type and status."""
    from app.services.supabase_service import get_feedback_list, get_feedback_unread_count
    rows = get_feedback_list(limit=limit, offset=offset, feedback_type=type or None, status=status or None)
    unread = get_feedback_unread_count()
    return {"feedback": rows, "unread_count": unread, "total": len(rows)}


@router.get("/feedback/unread-count")
async def admin_feedback_unread_count(admin: User = Depends(get_admin_user)):
    """Returns the count of unread (status='new') feedback items."""
    from app.services.supabase_service import get_feedback_unread_count
    return {"count": get_feedback_unread_count()}


@router.patch("/feedback/{feedback_id}")
async def admin_update_feedback(
    feedback_id: str,
    body: FeedbackStatusUpdate,
    admin: User = Depends(get_admin_user),
):
    """Updates the status of a feedback item (new → read → done)."""
    if body.status not in ("new", "read", "done"):
        raise HTTPException(status_code=400, detail="Invalid status")
    from app.services.supabase_service import update_feedback_status
    try:
        update_feedback_status(feedback_id, body.status)
        return {"ok": True}
    except Exception as e:
        print(f"[admin/feedback] update error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update feedback")


# =============================================================================
#  FEATURE FLAGS  (admin CRUD)
# =============================================================================

from app.services.feature_flags_service import (
    get_all_flags,
    create_flag,
    update_flag,
    delete_flag,
    get_all_releases,
    create_release,
    update_release,
    publish_release,
    unpublish_release,
    delete_release,
    get_release_stats,
)


class CreateFlagRequest(BaseModel):
    key:              str
    name:             str
    description:      str  = ""
    visibility:       str  = "internal"
    enabled:          bool = False
    allowed_user_ids: list = []


class UpdateFlagRequest(BaseModel):
    name:             Optional[str]  = None
    description:      Optional[str]  = None
    visibility:       Optional[str]  = None
    enabled:          Optional[bool] = None
    allowed_user_ids: Optional[list] = None


@router.get("/feature-flags")
async def admin_list_flags(admin: User = Depends(get_admin_user)):
    return {"flags": get_all_flags()}


@router.post("/feature-flags")
async def admin_create_flag(body: CreateFlagRequest, admin: User = Depends(get_admin_user)):
    if body.visibility not in ("internal", "beta", "public"):
        raise HTTPException(400, "visibility must be internal|beta|public")
    flag = create_flag(
        key=body.key,
        name=body.name,
        description=body.description,
        visibility=body.visibility,
        enabled=body.enabled,
        allowed_user_ids=body.allowed_user_ids,
    )
    _audit(admin.id, "create_feature_flag", body.key)
    return {"flag": flag}


@router.patch("/feature-flags/{key}")
async def admin_update_flag(key: str, body: UpdateFlagRequest, admin: User = Depends(get_admin_user)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if "visibility" in fields and fields["visibility"] not in ("internal", "beta", "public"):
        raise HTTPException(400, "visibility must be internal|beta|public")
    flag = update_flag(key, **fields)
    _audit(admin.id, "update_feature_flag", key, str(fields))
    return {"flag": flag}


@router.delete("/feature-flags/{key}")
async def admin_delete_flag(key: str, admin: User = Depends(get_admin_user)):
    delete_flag(key)
    _audit(admin.id, "delete_feature_flag", key)
    return {"ok": True}


# =============================================================================
#  FEATURE RELEASES — What's New  (admin CRUD)
# =============================================================================

class CreateReleaseRequest(BaseModel):
    title:        str
    subtitle:     str  = ""
    features:     list = []
    cta_label:    str  = "Start exploring"
    cta_url:      str  = ""
    target_plans: list = []


class UpdateReleaseRequest(BaseModel):
    title:        Optional[str]  = None
    subtitle:     Optional[str]  = None
    features:     Optional[list] = None
    cta_label:    Optional[str]  = None
    cta_url:      Optional[str]  = None
    target_plans: Optional[list] = None


@router.get("/releases")
async def admin_list_releases(admin: User = Depends(get_admin_user)):
    releases = get_all_releases()
    for rel in releases:
        rel["stats"] = get_release_stats(rel["id"])
    return {"releases": releases}


@router.post("/releases")
async def admin_create_release(body: CreateReleaseRequest, admin: User = Depends(get_admin_user)):
    rel = create_release(
        title=body.title,
        subtitle=body.subtitle,
        features=body.features,
        cta_label=body.cta_label,
        cta_url=body.cta_url,
        target_plans=body.target_plans,
    )
    _audit(admin.id, "create_release", rel.get("id", ""), body.title)
    return {"release": rel}


@router.patch("/releases/{release_id}")
async def admin_update_release(release_id: str, body: UpdateReleaseRequest, admin: User = Depends(get_admin_user)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    rel = update_release(release_id, **fields)
    _audit(admin.id, "update_release", release_id)
    return {"release": rel}


@router.post("/releases/{release_id}/publish")
async def admin_publish_release(release_id: str, admin: User = Depends(get_admin_user)):
    rel = publish_release(release_id)
    _audit(admin.id, "publish_release", release_id)
    return {"release": rel}


@router.post("/releases/{release_id}/unpublish")
async def admin_unpublish_release(release_id: str, admin: User = Depends(get_admin_user)):
    rel = unpublish_release(release_id)
    _audit(admin.id, "unpublish_release", release_id)
    return {"release": rel}


@router.delete("/releases/{release_id}")
async def admin_delete_release(release_id: str, admin: User = Depends(get_admin_user)):
    delete_release(release_id)
    _audit(admin.id, "delete_release", release_id)
    return {"ok": True}
