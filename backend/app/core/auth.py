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
        return User(id=user_id, email=email)

    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication failed")
