"""
JWT authentication via Clerk.

Verifies the Bearer token sent by the frontend using Clerk's JWKS endpoint.
The signing key is fetched once and cached; PyJWKClient handles key rotation.
"""
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Header
from jwt import PyJWKClient
import jwt

from app.core.config import settings

_jwks_client: PyJWKClient | None = None


@dataclass(frozen=True, slots=True)
class User:
    id: str
    email: str
    email_verified: bool = True


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(settings.CLERK_JWKS_URL)
    return _jwks_client


async def get_current_user(authorization: str = Header(None)) -> User:
    """
    FastAPI dependency — validates the Clerk Bearer token and returns a User.
    Raises 401 if the token is missing or invalid.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.split(" ", 1)[1]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        client = _get_jwks_client()
        signing_key = client.get_signing_key_from_jwt(token)

        decode_opts = {
            "verify_exp": True,
            "verify_iat": True,
            "verify_nbf": True,
        }

        decode_kwargs = {
            "algorithms": ["RS256"],
            "options": decode_opts,
        }

        if settings.ENVIRONMENT == "production" and not settings.CLERK_JWT_ISSUER:
            raise HTTPException(status_code=500, detail="Authentication issuer is not configured")

        # Issuer verification (if configured)
        if settings.CLERK_JWT_ISSUER:
            decode_kwargs["issuer"] = settings.CLERK_JWT_ISSUER
        else:
            decode_opts["verify_iss"] = False

        # Audience verification disabled for Clerk (Clerk JWTs don't include aud by default)
        decode_opts["verify_aud"] = False

        payload = jwt.decode(token, signing_key.key, **decode_kwargs)

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        email = payload.get("email", "")
        # Clerk may omit email_verified depending on the session token template.
        # Treat a missing claim as verified when an email is present so normal
        # first-run users still receive starter credits and can access gated flows.
        email_verified = payload.get("email_verified")
        if email_verified is None:
            email_verified = bool(email)
        return User(id=user_id, email=email, email_verified=bool(email_verified))

    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication failed")


async def get_active_user(authorization: str = Header(None)) -> User:
    """
    FastAPI dependency — validates Clerk JWT and checks that the user is not suspended.
    Also triggers domain-allowlist org auto-join as a background fire-and-forget.
    Raises 401 if not authenticated, 403 if suspended.
    """
    user = await get_current_user(authorization)
    from app.services.supabase_service import get_user_suspended
    if get_user_suspended(user.id):
        raise HTTPException(
            status_code=403,
            detail="Account suspended. Contact support at support@neurativo.com.",
        )
    # Domain allowlist: auto-join org if email domain matches (non-blocking)
    if user.email_verified and user.email and "@" in user.email:
        import asyncio
        from app.services.teams_service import maybe_auto_join_by_domain
        asyncio.get_running_loop().run_in_executor(
            None, maybe_auto_join_by_domain, user.id, user.email
        )
    return user


async def get_admin_user(authorization: str = Header(None)) -> User:
    """
    FastAPI dependency — verifies the Clerk Bearer token AND checks that
    the user is in the ADMIN_USER_IDS allowlist. Raises 403 if not admin.
    """
    user = await get_current_user(authorization)
    if user.id not in settings.ADMIN_USER_IDS:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
