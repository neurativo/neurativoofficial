"""
Cost Tracker — fire-and-forget API cost logging.

Design principles:
  - NEVER blocks the hot path (transcription, summarization, QA).
  - All DB writes happen in background threads or asyncio tasks.
  - Every function swallows exceptions — a logging failure must never
    propagate to the user.
  - Pricing constants live here so there is one place to update them.
"""
import asyncio
import threading
from datetime import datetime, timezone
from typing import Optional

# ─── Pricing (USD) ────────────────────────────────────────────────────────────
# Whisper: per second of audio
# GPT: per 1 M tokens (input / output)
# Embeddings: per 1 M tokens
# Vision: per image (high-detail)

PRICING = {
    "whisper-1": {
        "per_audio_second": 0.0001,
    },
    "gpt-4o-mini": {
        "per_1m_input":  0.15,
        "per_1m_output": 0.60,
    },
    "gpt-4o": {
        "per_1m_input":  2.50,
        "per_1m_output": 10.00,
    },
    "text-embedding-3-small": {
        "per_1m_input": 0.02,
    },
    "gpt-4o-vision": {
        "per_image_high": 0.00765,
    },
}

LKR_RATE = 305.0  # USD → LKR conversion


# ─── Cost calculation ─────────────────────────────────────────────────────────

def calculate_cost(
    model: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    audio_seconds: float = 0.0,
    image_count: int = 0,
) -> float:
    """Returns cost in USD. Returns 0.0 on unknown model or error."""
    try:
        p = PRICING.get(model, {})
        cost = 0.0

        if "per_audio_second" in p:
            cost += audio_seconds * p["per_audio_second"]

        if "per_1m_input" in p:
            cost += (input_tokens / 1_000_000) * p["per_1m_input"]

        if "per_1m_output" in p:
            cost += (output_tokens / 1_000_000) * p["per_1m_output"]

        if "per_image_high" in p:
            cost += image_count * p["per_image_high"]

        return round(cost, 8)
    except Exception:
        return 0.0


# ─── DB writer (runs in background — never raises) ────────────────────────────

def _write_cost_log(
    feature: str,
    model: str,
    cost_usd: float,
    input_tokens: int,
    output_tokens: int,
    audio_seconds: float,
    image_count: int,
    user_id: Optional[str],
    lecture_id: Optional[str],
    plan_tier: Optional[str],
) -> None:
    """Synchronous DB insert — called from a background thread."""
    try:
        from app.services.supabase_service import get_client
        sb = get_client()
        if not sb:
            return
        row = {
            "feature":       feature,
            "model":         model,
            "cost_usd":      cost_usd,
            "input_tokens":  input_tokens,
            "output_tokens": output_tokens,
            "audio_seconds": audio_seconds,
            "image_count":   image_count,
            "created_at":    datetime.now(timezone.utc).isoformat(),
        }
        if user_id:
            row["user_id"] = user_id
        if lecture_id:
            row["lecture_id"] = lecture_id
        if plan_tier:
            row["plan_tier"] = plan_tier

        sb.table("api_cost_logs").insert(row).execute()
    except Exception as e:
        # Completely silent — cost logging must never break the hot path
        print(f"[cost_tracker] log failed (non-fatal): {e}")


# ─── Public API ───────────────────────────────────────────────────────────────

def log_cost(
    feature: str,
    model: str,
    cost_usd: Optional[float] = None,
    *,
    input_tokens: int = 0,
    output_tokens: int = 0,
    audio_seconds: float = 0.0,
    image_count: int = 0,
    user_id: Optional[str] = None,
    lecture_id: Optional[str] = None,
    plan_tier: Optional[str] = None,
) -> None:
    """
    Fire-and-forget cost log from synchronous code.
    Spawns a daemon thread — returns immediately.
    Safe to call from any sync function in the hot path.
    """
    if cost_usd is None:
        cost_usd = calculate_cost(model, input_tokens, output_tokens, audio_seconds, image_count)

    t = threading.Thread(
        target=_write_cost_log,
        args=(feature, model, cost_usd, input_tokens, output_tokens,
              audio_seconds, image_count, user_id, lecture_id, plan_tier),
        daemon=True,
    )
    t.start()


async def log_cost_async(
    feature: str,
    model: str,
    cost_usd: Optional[float] = None,
    *,
    input_tokens: int = 0,
    output_tokens: int = 0,
    audio_seconds: float = 0.0,
    image_count: int = 0,
    user_id: Optional[str] = None,
    lecture_id: Optional[str] = None,
    plan_tier: Optional[str] = None,
) -> None:
    """
    Fire-and-forget cost log from async code.
    Uses asyncio.create_task — returns immediately.
    Safe to call from any async function in the hot path.
    """
    if cost_usd is None:
        cost_usd = calculate_cost(model, input_tokens, output_tokens, audio_seconds, image_count)

    async def _task():
        try:
            await asyncio.to_thread(
                _write_cost_log,
                feature, model, cost_usd, input_tokens, output_tokens,
                audio_seconds, image_count, user_id, lecture_id, plan_tier,
            )
        except Exception:
            pass

    try:
        asyncio.create_task(_task())
    except RuntimeError:
        # No running event loop — fall back to thread
        log_cost(
            feature, model, cost_usd,
            input_tokens=input_tokens, output_tokens=output_tokens,
            audio_seconds=audio_seconds, image_count=image_count,
            user_id=user_id, lecture_id=lecture_id, plan_tier=plan_tier,
        )
