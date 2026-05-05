"""
Teams service — org CRUD, member management, invite logic, seat enforcement.
All DB calls use a fresh Supabase client per call for thread safety.
"""
import secrets
from datetime import datetime, timezone
from typing import Optional

from app.services.supabase_service import _fresh_db


# ── helpers ───────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_token() -> str:
    return secrets.token_urlsafe(24)


# ── org CRUD ──────────────────────────────────────────────────────────────────

def create_org(slug: str, name: str, owner_id: str, seat_limit: int = 0,
               stripe_customer_id: str = None, stripe_subscription_id: str = None) -> dict:
    db = _fresh_db()
    row = {
        "slug": slug,
        "name": name,
        "owner_id": owner_id,
        "seat_limit": seat_limit,
        "status": "active",
    }
    if stripe_customer_id:
        row["stripe_customer_id"] = stripe_customer_id
    if stripe_subscription_id:
        row["stripe_subscription_id"] = stripe_subscription_id

    resp = db.table("organizations").insert(row).execute()
    if not resp.data:
        raise Exception("Failed to create organization")
    org = resp.data[0]

    # Auto-add owner as admin member
    db.table("org_members").insert({
        "org_id": org["id"],
        "user_id": owner_id,
        "email": "",  # filled in by caller if needed
        "role": "admin",
        "seat_tier": "pro",
        "status": "active",
        "joined_at": _now(),
    }).execute()

    return org


def get_org_by_slug(slug: str) -> Optional[dict]:
    db = _fresh_db()
    resp = db.table("organizations").select("*").eq("slug", slug).execute()
    return resp.data[0] if resp.data else None


def get_org_by_id(org_id: str) -> Optional[dict]:
    db = _fresh_db()
    resp = db.table("organizations").select("*").eq("id", org_id).execute()
    return resp.data[0] if resp.data else None


def update_org(org_id: str, **fields) -> dict:
    db = _fresh_db()
    resp = db.table("organizations").update(fields).eq("id", org_id).execute()
    return resp.data[0] if resp.data else {}


def list_all_orgs() -> list:
    """Admin only — list all organizations."""
    db = _fresh_db()
    resp = db.table("organizations").select("*").order("created_at", desc=True).execute()
    return resp.data or []


# ── seat counting ─────────────────────────────────────────────────────────────

def count_active_seats(org_id: str) -> dict:
    """Returns {"total": N, "student": N, "pro": N} of active members."""
    db = _fresh_db()
    resp = db.table("org_members").select("seat_tier").eq("org_id", org_id).eq("status", "active").execute()
    rows = resp.data or []
    student = sum(1 for r in rows if r["seat_tier"] == "student")
    pro = sum(1 for r in rows if r["seat_tier"] == "pro")
    return {"total": len(rows), "student": student, "pro": pro}


def _assert_seat_available(org_id: str, org: dict = None) -> None:
    """Raises ValueError if org has no free seat."""
    if org is None:
        org = get_org_by_id(org_id)
    if not org or org["status"] != "active":
        raise ValueError("Organization is not active")
    counts = count_active_seats(org_id)
    if counts["total"] >= org["seat_limit"]:
        raise ValueError(f"No seats available ({counts['total']}/{org['seat_limit']} used)")


# ── members ───────────────────────────────────────────────────────────────────

def list_members(org_id: str) -> list:
    db = _fresh_db()
    resp = db.table("org_members").select("*").eq("org_id", org_id).neq("status", "removed").order("invited_at").execute()
    return resp.data or []


def get_member(member_id: str) -> Optional[dict]:
    db = _fresh_db()
    resp = db.table("org_members").select("*").eq("id", member_id).execute()
    return resp.data[0] if resp.data else None


def get_member_by_user(org_id: str, user_id: str) -> Optional[dict]:
    db = _fresh_db()
    resp = db.table("org_members").select("*").eq("org_id", org_id).eq("user_id", user_id).neq("status", "removed").execute()
    return resp.data[0] if resp.data else None


def get_active_org_for_user(user_id: str) -> Optional[dict]:
    """Returns the org a user belongs to (active seat), or None."""
    db = _fresh_db()
    resp = db.table("org_members").select("org_id, seat_tier, role").eq("user_id", user_id).eq("status", "active").execute()
    if not resp.data:
        return None
    row = resp.data[0]
    org = get_org_by_id(row["org_id"])
    if org and org["status"] == "active":
        return {**org, "seat_tier": row["seat_tier"], "role": row["role"]}
    return None


def activate_member(member_id: str, user_id: str) -> dict:
    """Marks a member as active and upserts their user_subscriptions row."""
    db = _fresh_db()
    resp = db.table("org_members").update({
        "user_id": user_id,
        "status": "active",
        "joined_at": _now(),
    }).eq("id", member_id).execute()
    member = resp.data[0] if resp.data else {}

    # Grant plan tier via user_subscriptions
    _grant_seat(user_id, member.get("seat_tier", "student"), member.get("org_id"))
    return member


def remove_member(member_id: str) -> dict:
    """Sets member status to removed and reverts their plan to free."""
    db = _fresh_db()
    resp = db.table("org_members").select("*").eq("id", member_id).execute()
    if not resp.data:
        raise ValueError("Member not found")
    member = resp.data[0]

    db.table("org_members").update({"status": "removed"}).eq("id", member_id).execute()
    _revoke_seat(member["user_id"], member["org_id"])
    return member


def update_member_tier(member_id: str, seat_tier: str) -> dict:
    """Changes a member's seat tier (student|pro) and updates user_subscriptions."""
    if seat_tier not in ("student", "pro"):
        raise ValueError("seat_tier must be 'student' or 'pro'")
    db = _fresh_db()
    resp = db.table("org_members").update({"seat_tier": seat_tier}).eq("id", member_id).execute()
    member = resp.data[0] if resp.data else {}
    if member.get("user_id"):
        _grant_seat(member["user_id"], seat_tier, member.get("org_id"))
    return member


def _grant_seat(user_id: str, seat_tier: str, org_id: str) -> None:
    db = _fresh_db()
    db.table("user_subscriptions").upsert({
        "user_id": user_id,
        "plan_tier": seat_tier,
        "org_id": org_id,
        "updated_at": _now(),
    }, on_conflict="user_id").execute()


def _revoke_seat(user_id: str, org_id: str) -> None:
    """Revert to free only if no personal subscription exists."""
    if not user_id:
        return
    db = _fresh_db()
    # Check if they have an org-granted seat (org_id matches)
    resp = db.table("user_subscriptions").select("org_id").eq("user_id", user_id).execute()
    if resp.data and resp.data[0].get("org_id") == org_id:
        db.table("user_subscriptions").update({
            "plan_tier": "free",
            "org_id": None,
            "updated_at": _now(),
        }).eq("user_id", user_id).execute()


# ── invites ───────────────────────────────────────────────────────────────────

def create_invite(org_id: str, created_by: str, seat_tier: str = "student",
                  email: str = None, max_uses: int = None, expires_at: str = None) -> dict:
    db = _fresh_db()
    row = {
        "org_id": org_id,
        "token": _generate_token(),
        "seat_tier": seat_tier,
        "created_by": created_by,
        "uses": 0,
    }
    if email:
        row["email"] = email
    if max_uses is not None:
        row["max_uses"] = max_uses
    if expires_at:
        row["expires_at"] = expires_at

    resp = db.table("org_invites").insert(row).execute()
    return resp.data[0] if resp.data else {}


def list_invites(org_id: str) -> list:
    db = _fresh_db()
    resp = db.table("org_invites").select("*").eq("org_id", org_id).order("created_at", desc=True).execute()
    return resp.data or []


def get_invite_by_token(token: str) -> Optional[dict]:
    db = _fresh_db()
    resp = db.table("org_invites").select("*").eq("token", token).execute()
    return resp.data[0] if resp.data else None


def revoke_invite(invite_id: str) -> None:
    db = _fresh_db()
    db.table("org_invites").delete().eq("id", invite_id).execute()


def redeem_invite(token: str, user_id: str, user_email: str) -> dict:
    """
    Validates and redeems an invite token.
    Returns the activated org_members row.
    Raises ValueError with a user-facing message on any failure.
    """
    invite = get_invite_by_token(token)
    if not invite:
        raise ValueError("Invite link is invalid or has already been used")

    # Expiry check
    if invite.get("expires_at"):
        expires = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > expires:
            raise ValueError("This invite link has expired")

    # Max uses check
    if invite.get("max_uses") is not None and invite["uses"] >= invite["max_uses"]:
        raise ValueError("This invite link has reached its maximum uses")

    # Email-specific invite: must match
    if invite.get("email") and invite["email"].lower() != user_email.lower():
        raise ValueError("This invite was sent to a different email address")

    org = get_org_by_id(invite["org_id"])
    if not org or org["status"] != "active":
        raise ValueError("This organization is no longer active")

    # Already a member?
    existing = get_member_by_user(org["id"], user_id)
    if existing and existing["status"] == "active":
        raise ValueError("You are already a member of this organization")

    # Seat availability
    _assert_seat_available(org["id"], org)

    db = _fresh_db()

    # Upsert org_members
    if existing:
        # Reactivate removed member
        resp = db.table("org_members").update({
            "status": "active",
            "seat_tier": invite["seat_tier"],
            "user_id": user_id,
            "joined_at": _now(),
        }).eq("id", existing["id"]).execute()
        member = resp.data[0] if resp.data else existing
    else:
        resp = db.table("org_members").insert({
            "org_id": org["id"],
            "user_id": user_id,
            "email": user_email,
            "role": "member",
            "seat_tier": invite["seat_tier"],
            "status": "active",
            "joined_at": _now(),
        }).execute()
        member = resp.data[0] if resp.data else {}

    # Grant plan
    _grant_seat(user_id, invite["seat_tier"], org["id"])

    # Increment uses
    db.table("org_invites").update({"uses": invite["uses"] + 1}).eq("id", invite["id"]).execute()

    return {"member": member, "org": org}


# ── domain allowlist auto-join ────────────────────────────────────────────────

def maybe_auto_join_by_domain(user_id: str, user_email: str) -> Optional[dict]:
    """
    Checks if the user's email domain matches any org's allowed_domains.
    If so and they have no active org seat, auto-activates a student seat.
    Called as a background task — never raises, returns None on any error.
    """
    try:
        domain = user_email.split("@")[-1].lower() if "@" in user_email else ""
        if not domain:
            return None

        # Check if user already has an active seat
        existing_org = get_active_org_for_user(user_id)
        if existing_org:
            return None

        db = _fresh_db()
        # Find orgs with this domain in their allowlist
        resp = db.table("organizations").select("*").eq("status", "active").contains("allowed_domains", [domain]).execute()
        if not resp.data:
            return None

        org = resp.data[0]
        counts = count_active_seats(org["id"])
        if counts["total"] >= org["seat_limit"]:
            return None  # No seats left

        # Check not already a member
        existing_member = get_member_by_user(org["id"], user_id)
        if existing_member and existing_member["status"] == "active":
            return None

        if existing_member:
            db.table("org_members").update({
                "status": "active", "user_id": user_id, "joined_at": _now(),
            }).eq("id", existing_member["id"]).execute()
            member = {**existing_member, "status": "active"}
        else:
            resp2 = db.table("org_members").insert({
                "org_id": org["id"],
                "user_id": user_id,
                "email": user_email,
                "role": "member",
                "seat_tier": "student",
                "status": "active",
                "joined_at": _now(),
            }).execute()
            member = resp2.data[0] if resp2.data else {}

        _grant_seat(user_id, "student", org["id"])
        return {"member": member, "org": org}
    except Exception as e:
        print(f"[teams] maybe_auto_join_by_domain error: {e}")
        return None


def is_org_admin(org_id: str, user_id: str) -> bool:
    db = _fresh_db()
    resp = db.table("org_members").select("role").eq("org_id", org_id).eq("user_id", user_id).eq("status", "active").execute()
    if resp.data and resp.data[0]["role"] == "admin":
        return True
    org = get_org_by_id(org_id)
    return bool(org and org["owner_id"] == user_id)
