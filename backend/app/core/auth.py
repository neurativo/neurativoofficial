"""
JWT authentication via Supabase.

Extracts and verifies the user from the Bearer token sent by the frontend.
Uses the Supabase client's auth.get_user() which validates the JWT against
Supabase's auth service — no need to manage secrets locally.
"""
from fastapi import Depends, HTTPException, Header
from supabase import create_client
from app.core.config import settings


async def get_current_user(authorization: str = Header(None)):
    """
    FastAPI dependency — validates the Bearer token and returns the Supabase user.
    Raises 401 if the token is missing or invalid.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.split(" ", 1)[1]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        # Fresh client — avoids thread-safety issues with singleton
        client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        response = client.auth.get_user(token)
        if not response or not response.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return response.user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
