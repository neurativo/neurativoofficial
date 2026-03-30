"""
Clerk backend API service.
Used by the admin panel to list all users from Clerk directly,
since Clerk user IDs are not Supabase UUIDs and can't be stored in profiles.
"""
import httpx
from app.core.config import settings

CLERK_API_BASE = "https://api.clerk.com/v1"


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.CLERK_SECRET_KEY}",
        "Content-Type": "application/json",
    }


def clerk_list_users(limit: int = 500, offset: int = 0) -> list:
    """
    Fetches users from Clerk API.
    Returns list of dicts with: id, email, first_name, last_name, created_at, last_sign_in_at.
    Returns [] if CLERK_SECRET_KEY is not configured.
    """
    if not settings.CLERK_SECRET_KEY:
        return []
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(
                f"{CLERK_API_BASE}/users",
                headers=_headers(),
                params={"limit": limit, "offset": offset, "order_by": "-created_at"},
            )
            resp.raise_for_status()
            users = resp.json()
            result = []
            for u in users:
                emails = u.get("email_addresses") or []
                primary_email_id = u.get("primary_email_address_id")
                email = ""
                for e in emails:
                    if e.get("id") == primary_email_id:
                        email = e.get("email_address", "")
                        break
                if not email and emails:
                    email = emails[0].get("email_address", "")

                result.append({
                    "id": u.get("id"),
                    "email": email,
                    "first_name": u.get("first_name") or "",
                    "last_name": u.get("last_name") or "",
                    "display_name": f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip(),
                    "created_at_ms": u.get("created_at"),  # milliseconds epoch
                    "last_sign_in_ms": u.get("last_sign_in_at"),
                    "image_url": u.get("image_url") or "",
                })
            return result
    except Exception as e:
        print(f"[clerk] clerk_list_users error: {e}")
        return []


def clerk_get_user(user_id: str) -> dict:
    """Fetches a single user from Clerk by ID."""
    if not settings.CLERK_SECRET_KEY:
        return {}
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(f"{CLERK_API_BASE}/users/{user_id}", headers=_headers())
            resp.raise_for_status()
            u = resp.json()
            emails = u.get("email_addresses") or []
            primary_email_id = u.get("primary_email_address_id")
            email = ""
            for e in emails:
                if e.get("id") == primary_email_id:
                    email = e.get("email_address", "")
                    break
            if not email and emails:
                email = emails[0].get("email_address", "")
            return {
                "id": u.get("id"),
                "email": email,
                "first_name": u.get("first_name") or "",
                "last_name": u.get("last_name") or "",
                "display_name": f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip(),
                "created_at_ms": u.get("created_at"),
                "last_sign_in_ms": u.get("last_sign_in_at"),
                "image_url": u.get("image_url") or "",
            }
    except Exception as e:
        print(f"[clerk] clerk_get_user error: {e}")
        return {}


def clerk_get_user_count() -> int:
    """Returns total user count from Clerk."""
    if not settings.CLERK_SECRET_KEY:
        return 0
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(f"{CLERK_API_BASE}/users/count", headers=_headers())
            resp.raise_for_status()
            return resp.json().get("total_count", 0)
    except Exception as e:
        print(f"[clerk] clerk_get_user_count error: {e}")
        return 0
