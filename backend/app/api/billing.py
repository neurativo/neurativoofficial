"""
Billing API — Dodo Payments subscription management.
"""
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from app.core.auth import get_active_user
from app.core.config import settings
from app.services import dodo_service, supabase_service

router = APIRouter(prefix="/billing", tags=["billing"])

_RETURN_URL = "https://www.neurativo.com/app?subscribed=1"


class CheckoutBody(BaseModel):
    plan: Literal["student", "pro"]


@router.post("/checkout")
async def create_checkout(body: CheckoutBody, user=Depends(get_active_user)):
    """
    Creates a Dodo Payments subscription checkout session.
    Returns {"checkout_url": "https://..."} — frontend redirects the user there.
    """
    if not settings.DODO_API_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")

    user_id = str(user.id)
    email = getattr(user, "email", "") or ""

    try:
        subscription_id, payment_link = dodo_service.create_subscription_checkout(
            user_id=user_id,
            email=email,
            name=email.split("@")[0] if email else "Student",
            plan=body.plan,
            return_url=_RETURN_URL,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[billing] checkout error: {e}")
        raise HTTPException(status_code=502, detail="Could not create checkout session")

    # Store the subscription_id immediately so the webhook can resolve the user
    try:
        supabase_service.save_dodo_subscription(
            user_id=user_id,
            dodo_customer_id=None,
            dodo_subscription_id=subscription_id,
            status="pending",
        )
    except Exception as e:
        print(f"[billing] save pending sub error (non-fatal): {e}")

    return {"checkout_url": payment_link}


@router.get("/subscription")
async def get_subscription(user=Depends(get_active_user)):
    """Returns the current subscription info for the authenticated user."""
    info = supabase_service.get_dodo_subscription_info(str(user.id))
    status = info.get("subscription_status", "none")
    return {
        "plan_tier": info.get("plan_tier", "free"),
        "subscription_status": status,
        "subscription_period_end": info.get("subscription_period_end"),
        "has_active_subscription": status in ("active", "renewed"),
    }


@router.post("/cancel")
async def cancel_subscription(user=Depends(get_active_user)):
    """Cancels the current active subscription."""
    info = supabase_service.get_dodo_subscription_info(str(user.id))
    sub_id = info.get("dodo_subscription_id")
    if not sub_id:
        raise HTTPException(status_code=404, detail="No subscription found")
    if info.get("subscription_status") not in ("active", "renewed", "on_hold"):
        raise HTTPException(status_code=400, detail="No active subscription to cancel")

    try:
        dodo_service.cancel_subscription(sub_id)
    except Exception as e:
        print(f"[billing] cancel error: {e}")
        raise HTTPException(status_code=502, detail="Could not cancel subscription")

    supabase_service.save_dodo_subscription(
        user_id=str(user.id),
        dodo_customer_id=info.get("dodo_customer_id"),
        dodo_subscription_id=sub_id,
        status="cancelled",
    )
    return {"ok": True}


@router.post("/webhook")
async def webhook(
    request: Request,
    webhook_id: str = Header(None, alias="webhook-id"),
    webhook_timestamp: str = Header(None, alias="webhook-timestamp"),
    webhook_signature: str = Header(None, alias="webhook-signature"),
):
    """
    Dodo Payments webhook endpoint.
    Verifies Standard Webhooks HMAC-SHA256 signature and updates user plan/status.
    Register this URL in the Dodo dashboard:
        https://neurativoofficial-production.up.railway.app/api/v1/billing/webhook
    """
    body = await request.body()

    try:
        event = dodo_service.verify_webhook(
            body=body,
            webhook_id=webhook_id or "",
            webhook_timestamp=webhook_timestamp or "",
            webhook_signature=webhook_signature or "",
        )
    except ValueError as e:
        print(f"[billing] webhook rejected: {e}")
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event_type = event.get("type", "")
    data = event.get("data", {})

    subscription_id = data.get("subscription_id")
    if not subscription_id:
        return {"ok": True}

    customer = data.get("customer", {})
    dodo_customer_id = customer.get("customer_id")
    metadata = data.get("metadata", {})
    next_billing_date = data.get("next_billing_date")
    product_id = data.get("product_id")

    # Resolve user — metadata is set at checkout creation; DB fallback for older events
    user_id = (metadata or {}).get("neurativo_user_id") or \
              supabase_service.get_user_by_dodo_subscription(subscription_id)

    if not user_id:
        print(f"[billing] webhook: no user found for subscription {subscription_id} event={event_type}")
        return {"ok": True}

    plan_tier = dodo_service._product_to_plan(product_id) if product_id else None

    if event_type in ("subscription.active", "subscription.renewed"):
        if plan_tier:
            supabase_service.set_user_plan(user_id, plan_tier)
        supabase_service.save_dodo_subscription(
            user_id=user_id,
            dodo_customer_id=dodo_customer_id,
            dodo_subscription_id=subscription_id,
            status="active" if event_type == "subscription.active" else "renewed",
            period_end=next_billing_date,
        )
        print(f"[billing] activated: user={user_id} plan={plan_tier} event={event_type}")

    elif event_type == "subscription.plan_changed":
        if plan_tier:
            supabase_service.set_user_plan(user_id, plan_tier)
        supabase_service.save_dodo_subscription(
            user_id=user_id,
            dodo_customer_id=dodo_customer_id,
            dodo_subscription_id=subscription_id,
            status="active",
            period_end=next_billing_date,
        )

    elif event_type in ("subscription.cancelled", "subscription.expired"):
        supabase_service.set_user_plan(user_id, "free")
        supabase_service.save_dodo_subscription(
            user_id=user_id,
            dodo_customer_id=dodo_customer_id,
            dodo_subscription_id=subscription_id,
            status=event_type.split(".")[1],
        )
        print(f"[billing] downgraded to free: user={user_id} event={event_type}")

    elif event_type == "subscription.on_hold":
        supabase_service.save_dodo_subscription(
            user_id=user_id,
            dodo_customer_id=dodo_customer_id,
            dodo_subscription_id=subscription_id,
            status="on_hold",
        )

    elif event_type == "subscription.failed":
        supabase_service.save_dodo_subscription(
            user_id=user_id,
            dodo_customer_id=dodo_customer_id,
            dodo_subscription_id=subscription_id,
            status="failed",
        )

    return {"ok": True}
