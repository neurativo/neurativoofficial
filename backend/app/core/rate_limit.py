from slowapi import Limiter
from slowapi.util import get_remote_address

# Global rate limiter — keyed by client IP
# Individual endpoints set limits via @limiter.limit(...)
# Endpoints without explicit limits get no rate limiting (add @limiter.limit as needed)
limiter = Limiter(key_func=get_remote_address)
