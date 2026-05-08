"""
Teams API — organization management endpoints.
All write operations require the caller to be an org admin.
Stripe billing is intentionally excluded from this version.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel

from app.core.auth import get_active_user, User
from app.services import teams_service as ts
from app.services.email_service import (
    send_invite_email,
    send_seat_activated_email,
    send_seat_removed_email,
)

router = APIRouter(prefix="/teams", tags=["teams"])


# ── pydantic models ────────────────────────────────────────────────────────────

class CreateOrgBody(BaseModel):
    slug: str
    name: str
    owner_email: str = ""


class CreateInviteBody(BaseModel):
    seat_tier: str = "student"          # student | pro
    email: Optional[str] = None         # None = open link
    max_uses: Optional[int] = None
    expires_at: Optional[str] = None    # ISO timestamp


class UpdateMemberBody(BaseModel):
    seat_tier: Optional[str] = None     # student | pro
    status: Optional[str] = None        # removed


class RedeemInviteBody(BaseModel):
    token: str


class UpdateOrgBody(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None
    allowed_domains: Optional[list] = None


# ── dependency ────────────────────────────────────────────────────────────────

def _require_org_admin(slug: str, user: User) -> dict:
    org = ts.get_org_by_slug(slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if not ts.is_org_admin(org["id"], user.id):
        raise HTTPException(status_code=403, detail="Admin access required")
    return org


# ── public ────────────────────────────────────────────────────────────────────

@router.get("/{slug}/public")
def get_org_public(slug: str):
    """Public info for the portal landing page."""
    org = ts.get_org_by_slug(slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"id": org["id"], "slug": org["slug"], "name": org["name"], "logo_url": org.get("logo_url")}


# ── org management ────────────────────────────────────────────────────────────

@router.post("/")
def create_org(body: CreateOrgBody, user: User = Depends(get_active_user)):
    """Create a new organization. The caller becomes owner + admin member."""
    slug = body.slug.lower().strip().replace(" ", "-")
    if not slug or len(slug) < 3:
        raise HTTPException(status_code=422, detail="Slug must be at least 3 characters")
    if ts.get_org_by_slug(slug):
        raise HTTPException(status_code=409, detail="Slug already taken")
    try:
        org = ts.create_org(slug=slug, name=body.name, owner_id=user.id)
        # Update owner member row with actual email
        db_members = ts.list_members(org["id"])
        if db_members:
            from app.services.supabase_service import _fresh_db
            _fresh_db().table("org_members").update({"email": user.email}).eq("id", db_members[0]["id"]).execute()
        return org
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{slug}/dashboard")
def get_dashboard(slug: str, user: User = Depends(get_active_user)):
    """Admin: full org data + members + seat counts."""
    org = _require_org_admin(slug, user)
    members = ts.list_members(org["id"])
    invites = ts.list_invites(org["id"])
    counts = ts.count_active_seats(org["id"])
    return {
        "org": org,
        "members": members,
        "invites": invites,
        "seat_counts": counts,
    }


@router.patch("/{slug}")
def update_org(slug: str, body: UpdateOrgBody, user: User = Depends(get_active_user)):
    """Admin: update org name, logo, allowed_domains."""
    org = _require_org_admin(slug, user)
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=422, detail="Nothing to update")
    updated = ts.update_org(org["id"], **fields)
    return updated


# ── invites ───────────────────────────────────────────────────────────────────

@router.post("/{slug}/invites")
def create_invite(slug: str, body: CreateInviteBody,
                  background: BackgroundTasks,
                  user: User = Depends(get_active_user)):
    """Admin: create an email invite or open link."""
    org = _require_org_admin(slug, user)
    if body.seat_tier not in ("student", "pro"):
        raise HTTPException(status_code=422, detail="seat_tier must be 'student' or 'pro'")

    invite = ts.create_invite(
        org_id=org["id"],
        created_by=user.id,
        seat_tier=body.seat_tier,
        email=body.email,
        max_uses=body.max_uses,
        expires_at=body.expires_at,
    )

    join_url = f"https://teams.neurativo.com/{slug}/join?token={invite['token']}"
    invite["join_url"] = join_url

    # Send invite email in background if email specified
    if body.email:
        background.add_task(
            send_invite_email,
            to=body.email,
            org_name=org["name"],
            inviter_name=user.email,
            join_url=join_url,
            seat_tier=body.seat_tier,
        )

    return invite


@router.get("/{slug}/invites")
def list_invites(slug: str, user: User = Depends(get_active_user)):
    """Admin: list active invites with join URLs."""
    org = _require_org_admin(slug, user)
    invites = ts.list_invites(org["id"])
    for inv in invites:
        inv["join_url"] = f"https://teams.neurativo.com/{slug}/join?token={inv['token']}"
    return invites


@router.delete("/{slug}/invites/{invite_id}")
def revoke_invite(slug: str, invite_id: str, user: User = Depends(get_active_user)):
    """Admin: revoke (delete) an invite."""
    org = _require_org_admin(slug, user)
    # Verify invite belongs to this org
    invites = ts.list_invites(org["id"])
    if not any(i["id"] == invite_id for i in invites):
        raise HTTPException(status_code=404, detail="Invite not found")
    ts.revoke_invite(invite_id)
    return {"ok": True}


# ── join ──────────────────────────────────────────────────────────────────────

@router.post("/join")
def join_org(body: RedeemInviteBody, background: BackgroundTasks,
             user: User = Depends(get_active_user)):
    """Redeem an invite token. Any authenticated user can call this."""
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="Verify your email before joining an organization")
    try:
        result = ts.redeem_invite(body.token, user.id, user.email)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    org = result["org"]
    background.add_task(send_seat_activated_email, to=user.email, org_name=org["name"])
    return {
        "ok": True,
        "org_slug": org["slug"],
        "org_name": org["name"],
        "seat_tier": result["member"].get("seat_tier"),
    }


@router.get("/me/org")
def get_my_org(user: User = Depends(get_active_user)):
    """Returns the org the current user belongs to, or null."""
    org = ts.get_active_org_for_user(user.id)
    return {"org": org}


# ── member management ─────────────────────────────────────────────────────────

@router.patch("/{slug}/members/{member_id}")
def update_member(slug: str, member_id: str, body: UpdateMemberBody,
                  background: BackgroundTasks,
                  user: User = Depends(get_active_user)):
    """Admin: change a member's seat_tier or remove them."""
    org = _require_org_admin(slug, user)
    member = ts.get_member(member_id)
    if not member or member["org_id"] != org["id"]:
        raise HTTPException(status_code=404, detail="Member not found")

    if body.status == "removed":
        ts.remove_member(member_id)
        if member.get("email"):
            background.add_task(send_seat_removed_email, to=member["email"], org_name=org["name"])
        return {"ok": True, "status": "removed"}

    if body.seat_tier:
        updated = ts.update_member_tier(member_id, body.seat_tier)
        return updated

    raise HTTPException(status_code=422, detail="Provide seat_tier or status=removed")


# ── admin panel endpoints ─────────────────────────────────────────────────────

@router.get("/")
def admin_list_orgs(user: User = Depends(get_active_user)):
    """
    Superadmin only: list all organizations.
    Requires ADMIN_USER_IDS membership (checked via get_active_user + manual check).
    """
    from app.core.config import settings
    if user.id not in settings.ADMIN_USER_IDS:
        raise HTTPException(status_code=403, detail="Admin access required")
    orgs = ts.list_all_orgs()
    # Enrich with member counts
    result = []
    for org in orgs:
        counts = ts.count_active_seats(org["id"])
        result.append({**org, "seat_counts": counts})
    return result


@router.patch("/{slug}/admin")
def admin_update_org(slug: str, body: UpdateOrgBody,
                     seat_limit: Optional[int] = None,
                     status: Optional[str] = None,
                     user: User = Depends(get_active_user)):
    """Superadmin only: update any org field including seat_limit and status."""
    from app.core.config import settings
    if user.id not in settings.ADMIN_USER_IDS:
        raise HTTPException(status_code=403, detail="Admin access required")
    org = ts.get_org_by_slug(slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if seat_limit is not None:
        fields["seat_limit"] = seat_limit
    if status is not None:
        fields["status"] = status
    if not fields:
        raise HTTPException(status_code=422, detail="Nothing to update")
    return ts.update_org(org["id"], **fields)


@router.get("/{slug}/admin")
def admin_get_org(slug: str, user: User = Depends(get_active_user)):
    """Superadmin only: full org detail."""
    from app.core.config import settings
    if user.id not in settings.ADMIN_USER_IDS:
        raise HTTPException(status_code=403, detail="Admin access required")
    org = ts.get_org_by_slug(slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    members = ts.list_members(org["id"])
    counts = ts.count_active_seats(org["id"])
    return {"org": org, "members": members, "seat_counts": counts}
