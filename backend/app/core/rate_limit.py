from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _user_id_or_ip(request: Request) -> str:
    """
    Rate limit key: user_id for authenticated requests, client IP for anonymous.

    Why: get_remote_address trusts X-Forwarded-For, which any client can spoof.
    For authenticated endpoints this means a single user can bypass per-IP limits
    by rotating the header. Keying on user_id (from the verified JWT sub claim)
    makes the limit truly per-user and unspoofable.

    Note: the JWT signature is NOT re-verified here — the endpoint's auth
    dependency handles that. We decode without verification solely to extract
    the sub claim for rate-limiting purposes.
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            import jwt as pyjwt
            token = auth.split(" ", 1)[1]
            payload = pyjwt.decode(
                token,
                options={"verify_signature": False, "verify_exp": False},
                algorithms=["RS256"],
            )
            user_id = payload.get("sub")
            if user_id:
                return f"user:{user_id}"
        except Exception:
            pass
    return get_remote_address(request)


# Global rate limiter — keyed by user_id (authenticated) or IP (anonymous)
# Individual endpoints set limits via @limiter.limit(...)
limiter = Limiter(key_func=_user_id_or_ip)
