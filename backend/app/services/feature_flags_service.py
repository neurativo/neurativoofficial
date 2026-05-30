"""
feature_flags_service.py
------------------------
Feature flags: control feature availability per visibility tier.
Feature releases: "What's New" modal shown once per user on publish.

Visibility tiers:
  internal  – only user IDs listed in allowed_user_ids (dev/admin testing)
  beta      – allowed_user_ids, extended over time
  public    – all authenticated users

Admin users (ADMIN_USER_IDS) can always see internal flags for testing.
"""
from __future__ import annotations

from app.services.supabase_service import get_client as _sb


# ──────────────────────────────────────────────────────────────────────────────
# Feature flags
# ──────────────────────────────────────────────────────────────────────────────

def get_all_flags() -> list[dict]:
    """Return all feature flags (admin view)."""
    db = _sb()
    r = db.table("feature_flags").select("*").order("created_at", desc=False).execute()
    return r.data or []


def get_flags_for_user(user_id: str, is_admin: bool = False) -> dict[str, bool]:
    """
    Return {flag_key: bool} for the given user.
    A flag is True if:
      - enabled=True AND
      - visibility='public'  OR
      - visibility='beta'/'internal' AND user_id is in allowed_user_ids OR
      - is_admin=True (admins see all enabled flags regardless of visibility)
    """
    db = _sb()
    r = db.table("feature_flags").select("key,enabled,visibility,allowed_user_ids") \
          .eq("enabled", True).execute()
    flags: dict[str, bool] = {}
    for row in (r.data or []):
        key = row["key"]
        visibility = row.get("visibility", "internal")
        allowed: list = row.get("allowed_user_ids") or []

        if visibility == "public":
            flags[key] = True
        elif user_id in allowed:
            flags[key] = True
        elif is_admin:
            flags[key] = True
        else:
            flags[key] = False
    return flags


def create_flag(key: str, name: str, description: str = "",
                visibility: str = "internal", enabled: bool = False,
                allowed_user_ids: list[str] | None = None) -> dict:
    db = _sb()
    payload = {
        "key": key.strip().lower().replace(" ", "_"),
        "name": name.strip(),
        "description": description.strip(),
        "visibility": visibility,
        "enabled": enabled,
        "allowed_user_ids": allowed_user_ids or [],
    }
    r = db.table("feature_flags").insert(payload).execute()
    return (r.data or [{}])[0]


def update_flag(key: str, **fields) -> dict:
    db = _sb()
    from datetime import datetime, timezone
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    r = db.table("feature_flags").update(fields).eq("key", key).execute()
    return (r.data or [{}])[0]


def delete_flag(key: str) -> None:
    db = _sb()
    db.table("feature_flags").delete().eq("key", key).execute()


# ──────────────────────────────────────────────────────────────────────────────
# Feature releases (What's New)
# ──────────────────────────────────────────────────────────────────────────────

def get_all_releases() -> list[dict]:
    """Return all releases newest first (admin view — includes drafts)."""
    db = _sb()
    r = db.table("feature_releases").select("*").order("created_at", desc=True).execute()
    return r.data or []


def get_unseen_releases(user_id: str, user_plan: str = "free") -> list[dict]:
    """
    Return published releases this user hasn't dismissed yet, newest first.
    Filters by target_plans if set (empty array = show to everyone).
    """
    db = _sb()
    # All published releases
    r = db.table("feature_releases") \
          .select("id,title,subtitle,features,cta_label,cta_url,target_plans,published_at") \
          .not_.is_("published_at", "null") \
          .order("published_at", desc=True) \
          .execute()
    all_releases = r.data or []

    if not all_releases:
        return []

    # Get dismissed IDs for this user
    dismissed_r = db.table("release_dismissals") \
                    .select("release_id") \
                    .eq("user_id", user_id) \
                    .execute()
    dismissed_ids = {row["release_id"] for row in (dismissed_r.data or [])}

    result = []
    for rel in all_releases:
        if rel["id"] in dismissed_ids:
            continue
        plans = rel.get("target_plans") or []
        if plans and user_plan not in plans:
            continue
        result.append(rel)
    return result


def dismiss_release(user_id: str, release_id: str) -> None:
    db = _sb()
    db.table("release_dismissals").upsert(
        {"user_id": user_id, "release_id": release_id},
        on_conflict="user_id,release_id",
    ).execute()


def create_release(title: str, subtitle: str = "", features: list | None = None,
                   cta_label: str = "Start exploring", cta_url: str = "",
                   target_plans: list[str] | None = None,
                   scheduled_at: str | None = None,
                   linked_flag_keys: list[str] | None = None) -> dict:
    db = _sb()
    payload = {
        "title": title.strip(),
        "subtitle": subtitle.strip(),
        "features": features or [],
        "cta_label": cta_label.strip() or "Start exploring",
        "cta_url": cta_url.strip(),
        "target_plans": target_plans or [],
        "published_at": None,
        "scheduled_at": scheduled_at or None,
        "linked_flag_keys": linked_flag_keys or [],
    }
    r = db.table("feature_releases").insert(payload).execute()
    return (r.data or [{}])[0]


def update_release(release_id: str, **fields) -> dict:
    db = _sb()
    from datetime import datetime, timezone
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    r = db.table("feature_releases").update(fields).eq("id", release_id).execute()
    return (r.data or [{}])[0]


def publish_release(release_id: str) -> dict:
    """Set published_at to now and enable any linked feature flags."""
    from datetime import datetime, timezone
    db = _sb()
    # Fetch release to get linked_flag_keys before updating
    r = db.table("feature_releases").select("linked_flag_keys").eq("id", release_id).maybe_single().execute()
    linked_keys = (r.data or {}).get("linked_flag_keys") or []
    result = update_release(release_id, published_at=datetime.now(timezone.utc).isoformat())
    for key in linked_keys:
        try:
            update_flag(key, enabled=True)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[publish_release] failed to enable flag {key!r}: {e}")
    return result


def unpublish_release(release_id: str) -> dict:
    """Retract a release (set published_at back to null) and disable linked feature flags."""
    db = _sb()
    from datetime import datetime, timezone
    # Fetch release to get linked_flag_keys before updating
    r = db.table("feature_releases").select("linked_flag_keys").eq("id", release_id).maybe_single().execute()
    linked_keys = (r.data or {}).get("linked_flag_keys") or []
    result_r = db.table("feature_releases").update(
        {"published_at": None, "updated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", release_id).execute()
    for key in linked_keys:
        try:
            update_flag(key, enabled=False)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[unpublish_release] failed to disable flag {key!r}: {e}")
    return (result_r.data or [{}])[0]


def auto_publish_due_releases() -> None:
    """Find releases where scheduled_at <= NOW() and published_at IS NULL, publish each."""
    import logging
    from datetime import datetime, timezone
    logger = logging.getLogger(__name__)
    try:
        db = _sb()
        now_iso = datetime.now(timezone.utc).isoformat()
        r = db.table("feature_releases") \
              .select("id, linked_flag_keys") \
              .lte("scheduled_at", now_iso) \
              .is_("published_at", "null") \
              .execute()
        rows = r.data or []
        for row in rows:
            try:
                publish_release(row["id"])
                logger.info(f"[release-scheduler] auto-published release {row['id']}")
                # Write audit log entry with system actor
                try:
                    from app.services.supabase_service import admin_write_audit
                    admin_write_audit(
                        admin_id="system",
                        action="auto_publish_release",
                        target_id=row["id"],
                        detail="auto-published by scheduler",
                    )
                except Exception:
                    pass
            except Exception as e:
                logger.error(f"[release-scheduler] failed to auto-publish {row['id']}: {e}")
    except Exception as e:
        logger.error(f"[release-scheduler] query failed: {e}")


def delete_release(release_id: str) -> None:
    db = _sb()
    db.table("feature_releases").delete().eq("id", release_id).execute()


def get_release_stats(release_id: str) -> dict:
    """Return dismissal count for a release."""
    db = _sb()
    r = db.table("release_dismissals").select("user_id", count="exact") \
          .eq("release_id", release_id).execute()
    return {"dismissed_count": r.count or 0}
