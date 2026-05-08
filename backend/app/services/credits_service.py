"""
Credits service — check, deduct, add, and history for the credit-based pricing system.
1 credit = up to 30 minutes of audio (ceil(duration_minutes / 30)).
A 1-hr lecture costs 2 credits; a 90-min lecture costs 3 credits; etc.
All DB calls use _fresh_db() for thread safety.
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException

from app.services.supabase_service import _fresh_db


# ── Pricing catalogue ──────────────────────────────────────────────────────────

PRODUCTS = {
    # 1 credit = 30 min of audio. Avg lecture 30 min = ~$0.20 cost → target 55%+ gross margin.
    "small_pack":  {"credits": 10,  "price_usd": 4.99,  "label": "Starter",    "per_credit": 0.50},
    "large_pack":  {"credits": 30,  "price_usd": 11.99, "label": "Best value", "per_credit": 0.40},
    "pro_pack":    {"credits": 60,  "price_usd": 21.99, "label": "Power pack", "per_credit": 0.37},
}

# Subscription plan monthly credit grants
PLAN_PRICES_USD = {
    "student": 9.99,
    "pro":     19.99,
}

STARTER_CREDITS = 5

# Credits auto-granted on monthly refresh per plan tier.
# Set conservatively to protect margins — heavy users buy extra packs.
# Student worst-case: 15 × $0.39 = $5.85 cost vs $9.99 → 41% floor margin.
# Pro worst-case: 30 × $0.39 = $11.70 cost vs $19.99 → 41% floor margin.
PLAN_MONTHLY_CREDITS = {
    "student": 15,
    "pro":     30,
}


# ── Internal helpers ───────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _log_transaction(
    db,
    user_id: str,
    amount: int,
    balance_after: int,
    reason: str,
    product: Optional[str] = None,
    lecture_id: Optional[str] = None,
) -> None:
    row = {
        "user_id": user_id,
        "amount": amount,
        "balance_after": balance_after,
        "reason": reason,
    }
    if product:
        row["product"] = product
    if lecture_id:
        row["lecture_id"] = lecture_id
    db.table("credit_transactions").insert(row).execute()


# ── Public API ─────────────────────────────────────────────────────────────────

def get_credit_balance(user_id: str) -> dict:
    """
    Returns credits, sub status, sub expires, and whether sub is active.
    """
    db = _fresh_db()
    resp = db.table("profiles").select(
        "credits,credits_sub_status,credits_sub_started,credits_sub_expires"
    ).eq("id", user_id).execute()

    if not resp.data:
        return {
            "credits": 0,
            "credits_sub_status": "none",
            "credits_sub_started": None,
            "credits_sub_expires": None,
            "sub_active": False,
        }

    row = resp.data[0]
    expires = row.get("credits_sub_expires")
    # expires=None means indefinite (no expiry set by admin) — still active
    sub_active = (
        row.get("credits_sub_status") == "monthly"
        and (expires is None or expires > _now())
    )
    return {
        "credits": row.get("credits", 0),
        "credits_sub_status": row.get("credits_sub_status", "none"),
        "credits_sub_started": row.get("credits_sub_started"),
        "credits_sub_expires": expires,
        "sub_active": sub_active,
    }


def credits_for_duration(duration_seconds: int) -> int:
    """
    Returns how many credits a lecture costs based on its duration.
    Formula: ceil(minutes / 30) — one credit per 30-minute block (rounded up).

    This guarantees a 37% floor margin at the cheapest pack price ($0.333/credit):
      cost per 30-min block = 30 × $0.007 = $0.21; revenue = $0.333; margin = 37%.

    Examples:
        1 – 30 min  → 1 credit
       31 – 60 min  → 2 credits
       61 – 90 min  → 3 credits
       91 – 120 min → 4 credits
      121 – 150 min → 5 credits
      151 – 180 min → 6 credits
      211 – 240 min → 8 credits  (4-hr Pro lecture)
    """
    import math
    minutes = max(1, math.ceil((duration_seconds or 0) / 60))
    return math.ceil(minutes / 30)


def check_credits(user_id: str, required: int = 1) -> None:
    """
    Raises HTTP 402 if user has fewer credits than required.
    Pass required=credits_for_duration(seconds) for pre-flight check on long sessions.
    """
    balance = get_credit_balance(user_id)
    if balance["credits"] < required:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "no_credits",
                "message": f"You need {required} credit(s) for this lecture. Purchase more to continue.",
                "credits": balance["credits"],
                "required": required,
            },
        )


def _deduct_amount(user_id: str, lecture_id: str, amount: int, reason: str = "lecture_processed") -> int:
    """
    Deducts an exact credit amount.
    Uses a guarded UPDATE to handle race conditions.
    Returns new balance, or raises 402 if insufficient.
    """
    cost = max(1, int(amount or 0))
    db = _fresh_db()

    # Fetch current balance
    resp = db.table("profiles").select("credits").eq("id", user_id).execute()
    if not resp.data:
        raise HTTPException(status_code=402, detail={"error": "no_credits", "credits": 0})

    current = resp.data[0]["credits"]
    if current < cost:
        raise HTTPException(
            status_code=402,
            detail={"error": "no_credits", "message": f"Insufficient credits (need {cost}, have {current}).", "credits": current},
        )

    new_balance = current - cost

    # Guarded update: only succeeds if balance hasn't dropped below cost since we read it
    update_resp = db.table("profiles").update({"credits": new_balance}).eq("id", user_id).gte("credits", cost).execute()

    if not update_resp.data:
        raise HTTPException(
            status_code=402,
            detail={"error": "no_credits", "message": "Insufficient credits.", "credits": 0},
        )

    _log_transaction(
        db,
        user_id=user_id,
        amount=-cost,
        balance_after=new_balance,
        reason=reason,
        lecture_id=lecture_id,
    )
    return new_balance


def deduct_credit(user_id: str, lecture_id: str, duration_seconds: int = 0) -> int:
    """
    Deducts credits proportional to lecture duration (see credits_for_duration).
    """
    return _deduct_amount(
        user_id=user_id,
        lecture_id=lecture_id,
        amount=credits_for_duration(duration_seconds),
        reason="lecture_processed",
    )


def reserve_credits(user_id: str, lecture_id: str, required: int) -> int:
    """
    Reserves credits before expensive processing starts.
    Reserved credits are final unless explicitly refunded.
    """
    return _deduct_amount(
        user_id=user_id,
        lecture_id=lecture_id,
        amount=required,
        reason="credit_reserved",
    )


def get_reserved_credits(user_id: str, lecture_id: str) -> int:
    """Returns the currently reserved/deducted credit amount for a lecture."""
    db = _fresh_db()
    return _reserved_amount(db, user_id, lecture_id)


def _reserved_amount(db, user_id: str, lecture_id: str) -> int:
    resp = db.table("credit_transactions").select("amount,reason").eq(
        "user_id", user_id
    ).eq("lecture_id", lecture_id).execute()
    outstanding = 0
    for row in resp.data or []:
        amount = int(row.get("amount") or 0)
        reason = row.get("reason")
        if amount < 0 and reason in ("credit_reserved", "lecture_processed"):
            outstanding += abs(amount)
        elif amount > 0 and reason == "refund":
            outstanding -= amount
    return max(0, outstanding)


def finalize_reserved_credits(user_id: str, lecture_id: str, actual_duration_seconds: int) -> None:
    """
    Adjusts a reservation to the final duration cost.
    If the reserved amount is higher than actual cost, refunds the difference.
    If actual cost is higher, deducts the shortfall.
    """
    db = _fresh_db()
    reserved = _reserved_amount(db, user_id, lecture_id)
    actual = credits_for_duration(actual_duration_seconds)
    if reserved <= 0:
        deduct_credit(user_id, lecture_id, duration_seconds=actual_duration_seconds)
        mark_credit_deducted(lecture_id)
        return
    if reserved > actual:
        bal_resp = db.table("profiles").select("credits").eq("id", user_id).execute()
        if bal_resp.data:
            refund_amount = reserved - actual
            new_balance = int(bal_resp.data[0]["credits"]) + refund_amount
            db.table("profiles").update({"credits": new_balance}).eq("id", user_id).execute()
            _log_transaction(
                db,
                user_id=user_id,
                amount=refund_amount,
                balance_after=new_balance,
                reason="refund",
                lecture_id=lecture_id,
            )
    elif actual > reserved:
        _deduct_amount(user_id, lecture_id, actual - reserved, reason="lecture_processed")
    mark_credit_deducted(lecture_id)


def refund_credit(user_id: str, lecture_id: str) -> None:
    """
    Refunds the correct number of credits when lecture processing fails.
    The refund amount matches what was originally deducted (based on duration).
    Safe to call even if already refunded (idempotent via credit_deducted check).
    """
    db = _fresh_db()

    # Only refund if credit was actually deducted for this lecture
    lec_resp = db.table("lectures").select("credit_deducted,total_duration_seconds").eq("id", lecture_id).execute()
    if not lec_resp.data or not lec_resp.data[0].get("credit_deducted"):
        return

    refund_amount = _reserved_amount(db, user_id, lecture_id)
    if refund_amount <= 0:
        duration_seconds = lec_resp.data[0].get("total_duration_seconds") or 0
        refund_amount = credits_for_duration(duration_seconds)

    bal_resp = db.table("profiles").select("credits").eq("id", user_id).execute()
    if not bal_resp.data:
        return

    new_balance = bal_resp.data[0]["credits"] + refund_amount
    db.table("profiles").update({"credits": new_balance}).eq("id", user_id).execute()
    db.table("lectures").update({"credit_deducted": False}).eq("id", lecture_id).execute()

    _log_transaction(
        db,
        user_id=user_id,
        amount=+refund_amount,
        balance_after=new_balance,
        reason="refund",
        lecture_id=lecture_id,
    )


def add_credits(
    user_id: str,
    amount: int,
    reason: str,
    product: Optional[str] = None,
    lecture_id: Optional[str] = None,
) -> int:
    """
    Adds credits to a user's balance. Returns new balance.
    reason: starter_grant | pack_purchase | monthly_refresh | plan_grant
    """
    db = _fresh_db()

    resp = db.table("profiles").select("credits").eq("id", user_id).execute()
    if not resp.data:
        raise Exception(f"Profile not found for user {user_id}")

    current = resp.data[0]["credits"]
    new_balance = current + amount

    db.table("profiles").update({"credits": new_balance}).eq("id", user_id).execute()

    _log_transaction(
        db,
        user_id=user_id,
        amount=amount,
        balance_after=new_balance,
        reason=reason,
        product=product,
        lecture_id=lecture_id,
    )
    return new_balance


def maybe_grant_starter(user_id: str, email: str = "", email_verified: bool = False) -> bool:
    """
    Grants 5 starter credits exactly once per user.
    Returns True if credits were granted, False if already granted or ineligible.

    Guards:
    1. User ID must be non-empty — the authenticated Clerk subject is the trust boundary.
    2. The credit_transactions table has a partial unique index on
       (user_id) WHERE reason = 'starter_grant', so even if two requests
       race past the check simultaneously, only one INSERT succeeds.
    """
    if not user_id:
        return False

    db = _fresh_db()
    try:
        resp = db.rpc(
            "grant_starter_credits",
            {
                "p_user_id": user_id,
                "p_email": email,
                "p_starter_credits": STARTER_CREDITS,
            },
        ).execute()
        if isinstance(resp.data, bool):
            return resp.data
        if isinstance(resp.data, list) and resp.data:
            return bool(resp.data[0])
        return bool(resp.data)
    except Exception as e:
        raise Exception(f"Starter credit RPC failed: {e}")


def mark_credit_deducted(lecture_id: str) -> None:
    """Mark that credit was deducted for this lecture (for refund tracking)."""
    _fresh_db().table("lectures").update({"credit_deducted": True}).eq("id", lecture_id).execute()


def get_credit_history(user_id: str, limit: int = 50) -> list:
    """Returns the last `limit` credit transactions for a user, newest first."""
    db = _fresh_db()
    resp = db.table("credit_transactions").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(limit).execute()
    return resp.data or []


def log_purchase_intent(
    user_id: str,
    product: str,
    price_usd: float,
    credits: int,
) -> str:
    """
    Logs a purchase intent (no payment gateway yet).
    Returns the intent ID.
    """
    if product not in PRODUCTS:
        raise HTTPException(status_code=400, detail=f"Unknown product: {product}")

    db = _fresh_db()
    resp = db.table("purchase_intents").insert({
        "user_id": user_id,
        "product": product,
        "price_usd": price_usd,
        "credits": credits,
        "status": "pending",
    }).execute()

    if not resp.data:
        raise Exception("Failed to log purchase intent")
    return resp.data[0]["id"]


def grant_plan_credits(user_id: str, plan_tier: str) -> int:
    """
    Grant monthly credits for student/pro plan members.
    Called when plan is assigned or renewed.
    Returns credits added (0 if plan has no credit grant).
    """
    amount = PLAN_MONTHLY_CREDITS.get(plan_tier, 0)
    if amount == 0:
        return 0
    add_credits(user_id, amount, reason="plan_grant", product=f"{plan_tier}_grant")
    return amount
