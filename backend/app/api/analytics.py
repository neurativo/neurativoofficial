"""
Public analytics beacon.

  POST /analytics/pageview  — fire-and-forget page visit tracking
      Body: { page, session_id?, referrer? }
      Auth: optional (user_id extracted from JWT if present)

Heavy rate limit: 120/minute per IP/user to prevent abuse.
"""
import re

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from typing import Optional

from app.core.rate_limit import limiter
from app.services.supabase_service import record_page_visit

router = APIRouter(prefix="/analytics", tags=["analytics"])

_VALID_PAGES = re.compile(r'^[a-zA-Z0-9_\-/]{1,64}$')


class PageviewRequest(BaseModel):
    page:       str            = Field(..., min_length=1, max_length=64)
    session_id: Optional[str] = Field(None, max_length=64)
    referrer:   Optional[str] = Field(None, max_length=256)


@router.post("/pageview", status_code=204)
@limiter.limit("120/minute")
async def track_pageview(request: Request, body: PageviewRequest):
    """Record a page visit. No auth required. Returns 204 No Content."""
    # Validate page name to only allow safe slugs
    if not _VALID_PAGES.match(body.page):
        return  # silently ignore invalid page names — don't error out

    # Extract user_id from JWT if present (no signature check needed here)
    user_id = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            import jwt as pyjwt
            payload = pyjwt.decode(
                auth.split(" ", 1)[1],
                options={"verify_signature": False, "verify_exp": False},
                algorithms=["RS256"],
            )
            user_id = payload.get("sub")
        except Exception:
            pass

    record_page_visit(
        page=body.page,
        session_id=body.session_id,
        user_id=user_id,
        referrer=body.referrer,
    )
