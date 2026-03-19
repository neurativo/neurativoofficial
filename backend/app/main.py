import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import router as api_router
from app.core.config import settings

_start_time = time.time()

app = FastAPI(title=settings.PROJECT_NAME)

# Configure CORS - Allow all for development simplicity, restrict in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"message": "AI Lecture Assistant Backend is running", "docs_url": "/docs"}


@app.get("/health")
async def health():
    """
    Liveness + dependency check.
    Returns overall status, uptime, and connectivity for Supabase and OpenAI.
    'ok'       — all dependencies reachable
    'degraded' — one or more dependencies unavailable
    """
    # Supabase: attempt a lightweight read
    supabase_ok = False
    try:
        from app.services.supabase_service import supabase as _sb
        if _sb:
            _sb.table("lectures").select("id").limit(1).execute()
            supabase_ok = True
    except Exception:
        pass

    # OpenAI: client initialised means the key is set; no network call needed
    openai_ok = False
    try:
        from app.services.openai_service import client as _oai
        openai_ok = _oai is not None
    except Exception:
        pass

    overall = "ok" if (supabase_ok and openai_ok) else "degraded"

    return {
        "status":         overall,
        "uptime_seconds": round(time.time() - _start_time, 1),
        "supabase":       "ok" if supabase_ok else "unavailable",
        "openai":         "ok" if openai_ok  else "unavailable",
    }
