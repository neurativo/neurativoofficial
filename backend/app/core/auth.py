"""
JWT authentication via Clerk.

Verifies the Bearer token sent by the frontend using Clerk's JWKS endpoint.
The signing key is fetched once and cached; PyJWKClient handles key rotation.
"""
from fastapi import Depends, HTTPException, Header
from jwt import PyJWKClient
import jwt

from app.core.config import settings

_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(settings.CLERK_JWKS_URL)
    return _jwks_client


async def get_current_user(authorization: str = Header(None)):
    """
    FastAPI dependency — validates the Clerk Bearer token and returns a user dict
    with 'id' (Clerk user ID) and 'email' fields.
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
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Build a minimal user object matching the shape the rest of the app uses
        email = payload.get("email", "")
        return type("User", (), {"id": user_id, "email": email})()

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
