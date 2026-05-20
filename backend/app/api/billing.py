"""
Billing API — Dodo Payments subscription management.
"""
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from app.core.auth import get_active_user, get_admin_user
from app.core.config import settings
from app.services import dodo_service, supabase_service
from app.services.credits_service import (
    PRODUCTS as CREDIT_PRODUCTS,
    complete_purchase_intent,
    create_credits_purchase_intent,
    grant_plan_credits,
)

router = APIRouter(prefix="/billing", tags=["billing"])

_RETURN_URL = "https://www.neurativo.com/app?subscribed=1"


class CheckoutBody(BaseModel):
    plan: Literal["student", "pro"]


class CreditsCheckoutBody(BaseModel):
    pack: Literal["small_pack", "large_pack", "pro_pack"]


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

    # Clerk JWT may omit email — fall back to Clerk REST API
    if not email or "@" not in email:
        try:
            import httpx as _httpx
            r = _httpx.get(
                f"https://api.clerk.com/v1/users/{user_id}",
                headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
                timeout=8,
            )
            if r.is_success:
                data = r.json()
                addrs = data.get("email_addresses") or []
                primary_id = data.get("primary_email_address_id")
                for a in addrs:
                    if a.get("id") == primary_id:
                        email = a.get("email_address", "")
                        break
                if not email and addrs:
                    email = addrs[0].get("email_address", "")
        except Exception as e:
            print(f"[billing] clerk email fetch error: {e}")

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Could not determine your email address. Please update your profile.")

    try:
        _session_id, checkout_url = dodo_service.create_subscription_checkout(
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

    return {"checkout_url": checkout_url}


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


@router.post("/credits-checkout")
async def create_credits_checkout(body: CreditsCheckoutBody, user=Depends(get_active_user)):
    """
    Creates a Dodo one-time payment checkout for a credit pack.
    Returns {"checkout_url": "https://..."}.
    """
    if not settings.DODO_API_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")

    user_id = str(user.id)
    email = getattr(user, "email", "") or ""
    pack = body.pack

    # Fetch email from Clerk if missing
    if not email or "@" not in email:
        try:
            import httpx as _httpx
            r = _httpx.get(
                f"https://api.clerk.com/v1/users/{user_id}",
                headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
                timeout=8,
            )
            if r.is_success:
                data = r.json()
                addrs = data.get("email_addresses") or []
                primary_id = data.get("primary_email_address_id")
                for a in addrs:
                    if a.get("id") == primary_id:
                        email = a.get("email_address", "")
                        break
                if not email and addrs:
                    email = addrs[0].get("email_address", "")
        except Exception as e:
            print(f"[billing] clerk email fetch error: {e}")

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Could not determine your email address.")

    product_info = CREDIT_PRODUCTS.get(pack)
    if not product_info:
        raise HTTPException(status_code=400, detail=f"Unknown pack: {pack}")

    return_url = f"https://www.neurativo.com/credits?purchased=1"

    # Create a pending intent first so webhook can find it
    try:
        # Temporary intent_id placeholder — will be updated after we get session_id
        intent_id = create_credits_purchase_intent(
            user_id=user_id,
            product=pack,
            price_usd=product_info["price_usd"],
            credits=product_info["credits"],
            dodo_session_id="pending",  # updated below
        )
    except Exception as e:
        print(f"[billing] create intent error: {e}")
        intent_id = ""

    try:
        session_id, checkout_url = dodo_service.create_credits_checkout(
            user_id=user_id,
            email=email,
            name=email.split("@")[0],
            pack=pack,
            intent_id=intent_id,
            return_url=return_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[billing] credits checkout error: {e}")
        raise HTTPException(status_code=502, detail="Could not create checkout session")

    # Update intent with real session_id
    if intent_id and session_id:
        try:
            from app.services.supabase_service import _fresh_db
            _fresh_db().table("purchase_intents").update(
                {"dodo_session_id": session_id}
            ).eq("id", intent_id).execute()
        except Exception as e:
            print(f"[billing] update session_id error (non-fatal): {e}")

    return {"checkout_url": checkout_url}


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


class CreateDiscountBody(BaseModel):
    discount_type: Literal["percentage", "flat"]
    amount: int  # percentage: 0-100, flat: cents
    code: str | None = None
    name: str | None = None
    expires_at: str | None = None
    usage_limit: int | None = None
    restricted_to: list | None = None


@router.get("/admin/subscriptions")
async def admin_list_subscriptions(
    page: int = 0,
    page_size: int = 20,
    status: str | None = None,
    user=Depends(get_admin_user),
):
    """Lists Dodo subscriptions. Admin only."""
    try:
        return dodo_service.list_subscriptions(page=page, page_size=page_size, status=status or None)
    except Exception as e:
        print(f"[billing] admin list_subscriptions error: {e}")
        raise HTTPException(status_code=502, detail="Could not fetch subscriptions")


@router.get("/admin/discounts")
async def admin_list_discounts(user=Depends(get_admin_user)):
    """Lists all Dodo discount codes. Admin only."""
    try:
        return dodo_service.list_discounts()
    except Exception as e:
        print(f"[billing] admin list_discounts error: {e}")
        raise HTTPException(status_code=502, detail="Could not fetch discounts")


@router.post("/admin/discounts")
async def admin_create_discount(body: CreateDiscountBody, user=Depends(get_admin_user)):
    """Creates a Dodo discount code. Admin only."""
    try:
        return dodo_service.create_discount(
            discount_type=body.discount_type,
            amount=body.amount,
            code=body.code,
            name=body.name,
            expires_at=body.expires_at,
            usage_limit=body.usage_limit,
            restricted_to=body.restricted_to,
        )
    except Exception as e:
        print(f"[billing] admin create_discount error: {e}")
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/admin/discounts/{discount_id}")
async def admin_delete_discount(discount_id: str, user=Depends(get_admin_user)):
    """Deletes a Dodo discount code. Admin only."""
    try:
        dodo_service.delete_discount(discount_id)
        return {"ok": True}
    except Exception as e:
        print(f"[billing] admin delete_discount error: {e}")
        raise HTTPException(status_code=502, detail="Could not delete discount")


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

    # ── One-time payment (credit packs) ────────────────────────────────────────
    if event_type == "payment.succeeded":
        payment_id = data.get("payment_id", "")
        p_metadata = data.get("metadata", {}) or {}
        p_user_id = p_metadata.get("neurativo_user_id") or ""
        p_product = p_metadata.get("product", "")
        p_intent_id = p_metadata.get("intent_id", "")
        p_session_id = data.get("checkout_session_id") or data.get("session_id") or ""

        if p_user_id and p_product:
            try:
                complete_purchase_intent(
                    payment_id=payment_id,
                    session_id=p_session_id,
                    intent_id=p_intent_id,
                    user_id=p_user_id,
                    product=p_product,
                )
            except Exception as e:
                print(f"[billing] complete_purchase_intent error: {e}")
        else:
            print(f"[billing] payment.succeeded missing user_id or product in metadata: {p_metadata}")
        return {"ok": True}

    # ── Subscription events ─────────────────────────────────────────────────────
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
        # Grant monthly credits on new activation (not on every renewal to avoid duplicates)
        if event_type == "subscription.active" and plan_tier:
            try:
                grant_plan_credits(user_id, plan_tier)
            except Exception as e:
                print(f"[billing] grant_plan_credits error (non-fatal): {e}")

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
