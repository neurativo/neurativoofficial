"""
Credits service — check, deduct, add, and history for the credit-based pricing system.
1 credit = 1 lecture processed (upload or live session).
All DB calls use _fresh_db() for thread safety.
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException

from app.services.supabase_service import _fresh_db


# ── Pricing catalogue ──────────────────────────────────────────────────────────

PRODUCTS = {
    "small_pack":  {"credits": 10,  "price_usd": 5.99},
    "large_pack":  {"credits": 30,  "price_usd": 14.99},
    "monthly_sub": {"credits": 30,  "price_usd": 11.99},
}

STARTER_CREDITS = 5

# Credits auto-granted on monthly refresh per plan tier
PLAN_MONTHLY_CREDITS = {
    "student": 30,
    "pro":     60,
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
    sub_active = (
        row.get("credits_sub_status") == "monthly"
        and expires is not None
        and expires > _now()
    )
    return {
        "credits": row.get("credits", 0),
        "credits_sub_status": row.get("credits_sub_status", "none"),
        "credits_sub_started": row.get("credits_sub_started"),
        "credits_sub_expires": expires,
        "sub_active": sub_active,
    }


def check_credits(user_id: str) -> None:
    """
    Raises HTTP 402 if user has 0 credits.
    Call this before starting any lecture processing.
    """
    balance = get_credit_balance(user_id)
    if balance["credits"] <= 0:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "no_credits",
                "message": "You have no credits. Purchase more to continue.",
                "credits": 0,
            },
        )


def deduct_credit(user_id: str, lecture_id: str) -> int:
    """
    Atomically deducts 1 credit from user's balance.
    Uses WHERE credits > 0 as guard against race conditions.
    Returns new balance, or raises if insufficient credits.
    """
    db = _fresh_db()

    # Fetch current balance
    resp = db.table("profiles").select("credits").eq("id", user_id).execute()
    if not resp.data:
        raise HTTPException(status_code=402, detail={"error": "no_credits", "credits": 0})

    current = resp.data[0]["credits"]
    if current <= 0:
        raise HTTPException(
            status_code=402,
            detail={"error": "no_credits", "message": "Insufficient credits.", "credits": 0},
        )

    new_balance = current - 1

    # Update with guard: only updates if credits still > 0 (race-condition safe)
    update_resp = db.table("profiles").update({"credits": new_balance}).eq("id", user_id).gt("credits", 0).execute()

    if not update_resp.data:
        # Another request consumed the last credit
        raise HTTPException(
            status_code=402,
            detail={"error": "no_credits", "message": "Insufficient credits.", "credits": 0},
        )

    _log_transaction(
        db,
        user_id=user_id,
        amount=-1,
        balance_after=new_balance,
        reason="lecture_processed",
        lecture_id=lecture_id,
    )
    return new_balance


def refund_credit(user_id: str, lecture_id: str) -> None:
    """
    Refunds 1 credit when lecture processing fails.
    Safe to call even if already refunded (idempotent via credit_deducted check).
    """
    db = _fresh_db()

    # Only refund if credit was actually deducted for this lecture
    lec_resp = db.table("lectures").select("credit_deducted").eq("id", lecture_id).execute()
    if not lec_resp.data or not lec_resp.data[0].get("credit_deducted"):
        return

    # Add 1 credit back
    bal_resp = db.table("profiles").select("credits").eq("id", user_id).execute()
    if not bal_resp.data:
        return

    new_balance = bal_resp.data[0]["credits"] + 1
    db.table("profiles").update({"credits": new_balance}).eq("id", user_id).execute()
    db.table("lectures").update({"credit_deducted": False}).eq("id", lecture_id).execute()

    _log_transaction(
        db,
        user_id=user_id,
        amount=+1,
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


def maybe_grant_starter(user_id: str) -> bool:
    """
    Grants 5 starter credits exactly once per user.
    Returns True if credits were granted, False if already granted.
    """
    db = _fresh_db()

    # Check if starter_grant already issued
    existing = db.table("credit_transactions").select("id").eq("user_id", user_id).eq("reason", "starter_grant").limit(1).execute()
    if existing.data:
        return False

    add_credits(user_id, STARTER_CREDITS, reason="starter_grant")
    return True


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
