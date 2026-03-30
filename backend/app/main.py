import time

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.api.endpoints import router as api_router
from app.api.admin import router as admin_router
from app.core.config import settings
from app.core.rate_limit import limiter

_start_time = time.time()

app = FastAPI(
    title=settings.PROJECT_NAME,
    # Disable automatic docs in production to reduce attack surface
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    openapi_url="/openapi.json" if settings.ENVIRONMENT != "production" else None,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------------------------------------------------------------------------
# CORS — only allow known frontend origins, never wildcard with credentials
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


# ---------------------------------------------------------------------------
# Security headers middleware
# ---------------------------------------------------------------------------
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=()"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    # Remove server fingerprinting header
    if "server" in response.headers:
        del response.headers["server"]
    return response


app.include_router(api_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"message": "OK"}


@app.get("/health")
async def health():
    """Basic liveness check — does not expose infrastructure details."""
    supabase_ok = False
    try:
        from app.services.supabase_service import supabase as _sb
        if _sb:
            _sb.table("lectures").select("id").limit(1).execute()
            supabase_ok = True
    except Exception:
        pass

    openai_ok = False
    try:
        from app.services.openai_service import client as _oai
        openai_ok = _oai is not None
    except Exception:
        pass

    overall = "ok" if (supabase_ok and openai_ok) else "degraded"
    return {"status": overall}
