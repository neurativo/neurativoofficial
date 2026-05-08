"""
Credits API — balance, history, and purchase intent endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import get_active_user
from app.services.credits_service import (
    get_credit_balance,
    get_credit_history,
    log_purchase_intent,
    maybe_grant_starter,
    PRODUCTS,
)
from app.services.live_cleanup_service import cleanup_stale_live_sessions

router = APIRouter(prefix="/credits", tags=["credits"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class PurchaseIntentBody(BaseModel):
    product: str  # small_pack | large_pack | monthly_sub


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/balance")
def get_balance(user=Depends(get_active_user)):
    """
    Returns current credit balance and subscription status.
    Also grants starter credits on first call (idempotent).
    """
    try:
        cleanup_stale_live_sessions()
    except Exception as e:
        print(f"[credits] stale live cleanup failed: {e}")
    user_id = str(user.id)
    maybe_grant_starter(
        user_id,
        email=getattr(user, "email", "") or "",
        email_verified=getattr(user, "email_verified", False),
    )
    balance = get_credit_balance(user_id)
    return {
        **balance,
        "low_credits": balance["credits"] < 3,
        "products": PRODUCTS,
    }


@router.get("/history")
def get_history(user=Depends(get_active_user)):
    """Returns the last 50 credit transactions for the current user."""
    return {"transactions": get_credit_history(str(user.id))}


@router.post("/purchase-intent")
def create_purchase_intent(body: PurchaseIntentBody, user=Depends(get_active_user)):
    """
    Logs a purchase intent (no payment gateway yet).
    Returns the intent ID and product details so the frontend can show
    confirmation. Actual credit granting happens after payment is confirmed
    (manual or via future webhook).
    """
    if body.product not in PRODUCTS:
        raise HTTPException(status_code=400, detail=f"Unknown product '{body.product}'")

    product_info = PRODUCTS[body.product]
    intent_id = log_purchase_intent(
        user_id=str(user.id),
        product=body.product,
        price_usd=product_info["price_usd"],
        credits=product_info["credits"],
    )
    return {
        "intent_id": intent_id,
        "product": body.product,
        "credits": product_info["credits"],
        "price_usd": product_info["price_usd"],
        "status": "pending",
        "message": "Purchase logged. Credits will be added once payment is confirmed.",
    }


@router.get("/catalogue")
def get_catalogue():
    """Returns available credit products (public, no auth needed)."""
    return {"products": PRODUCTS}
