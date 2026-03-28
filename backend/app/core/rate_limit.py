from slowapi import Limiter
from slowapi.util import get_remote_address

# Global rate limiter — keyed by client IP
# Individual endpoints override with stricter limits via @limiter.limit(...)
limiter = Limiter(key_func=get_remote_address)
