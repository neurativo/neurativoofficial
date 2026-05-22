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


@router.post("/portal")
async def get_customer_portal(user=Depends(get_active_user)):
    """
    Creates a Dodo customer portal session for the authenticated user.
    Returns {"portal_url": "https://..."} — frontend redirects the user there.
    Users can update their payment method, view invoices, and manage their subscription.
    """
    info = supabase_service.get_dodo_subscription_info(str(user.id))
    customer_id = info.get("dodo_customer_id")
    if not customer_id:
        raise HTTPException(status_code=404, detail="No billing account found. Please subscribe first.")
    try:
        result = dodo_service.create_customer_portal(
            customer_id=customer_id,
            return_url="https://www.neurativo.com/profile",
        )
    except Exception as e:
        print(f"[billing] portal error: {e}")
        raise HTTPException(status_code=502, detail="Could not open billing portal. Please try again.")
    portal_url = result.get("link") or result.get("url") or result.get("portal_url") or ""
    if not portal_url:
        raise HTTPException(status_code=502, detail="Billing portal returned no URL.")
    return {"portal_url": portal_url}


class CreateDiscountBody(BaseModel):
    discount_type: Literal["percentage", "flat"]
    amount: int  # percentage: 0-100, flat: cents
    code: str | None = None
    name: str | None = None
    expires_at: str | None = None
    usage_limit: int | None = None
    restricted_to: list | None = None


@router.get("/admin/stats")
async def admin_billing_stats(user=Depends(get_admin_user)):
    """Returns MRR estimate and active subscriber counts. Admin only."""
    try:
        db = supabase_service._fresh_db()
        resp = db.table("user_subscriptions") \
            .select("plan_tier") \
            .in_("subscription_status", ["active", "renewed"]) \
            .execute()
        counts = {"student": 0, "pro": 0}
        for row in (resp.data or []):
            tier = row.get("plan_tier", "")
            if tier in counts:
                counts[tier] += 1
        mrr = round(counts["student"] * 9.99 + counts["pro"] * 19.99, 2)
        return {
            "active_subscribers": sum(counts.values()),
            "by_plan": counts,
            "mrr_usd": mrr,
        }
    except Exception as e:
        print(f"[billing] admin stats error: {e}")
        raise HTTPException(status_code=502, detail="Could not fetch billing stats")


@router.get("/admin/users/{user_id}/subscription")
async def admin_get_user_subscription(user_id: str, user=Depends(get_admin_user)):
    """Returns the Dodo subscription info for a specific user. Admin only."""
    info = supabase_service.get_dodo_subscription_info(user_id)
    return info or {}


@router.post("/admin/subscriptions/{subscription_id}/cancel")
async def admin_cancel_subscription(subscription_id: str, user=Depends(get_admin_user)):
    """Cancels a subscription by Dodo subscription ID. Admin only."""
    try:
        dodo_service.cancel_subscription(subscription_id)
    except Exception as e:
        print(f"[billing] admin cancel error: {e}")
        raise HTTPException(status_code=502, detail="Could not cancel subscription")
    # Find user and update DB
    uid = supabase_service.get_user_by_dodo_subscription(subscription_id)
    if uid:
        supabase_service.save_dodo_subscription(
            user_id=uid,
            dodo_customer_id=None,
            dodo_subscription_id=subscription_id,
            status="cancelled",
        )
    return {"ok": True}


@router.get("/payment-history")
async def get_payment_history(user=Depends(get_active_user)):
    """Returns the user's completed credit pack purchases and subscription info."""
    user_id = str(user.id)
    try:
        db = supabase_service._fresh_db()
        # Credit pack purchases
        pack_resp = db.table("purchase_intents") \
            .select("id, product, price_usd, credits, dodo_payment_id, created_at") \
            .eq("user_id", user_id) \
            .eq("status", "completed") \
            .order("created_at", desc=True) \
            .limit(50) \
            .execute()
        payments = []
        for row in (pack_resp.data or []):
            payments.append({
                "type": "credit_pack",
                "product": row.get("product", ""),
                "price_usd": row.get("price_usd", 0),
                "credits": row.get("credits", 0),
                "payment_id": row.get("dodo_payment_id", ""),
                "date": row.get("created_at", ""),
            })
        # Subscription info
        sub = supabase_service.get_dodo_subscription_info(user_id)
        return {"payments": payments, "subscription": sub}
    except Exception as e:
        print(f"[billing] payment-history error: {e}")
        raise HTTPException(status_code=502, detail="Could not fetch payment history")


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


class RefundBody(BaseModel):
    reason: str | None = None


@router.get("/admin/payments")
async def admin_list_payments(
    page: int = 0,
    page_size: int = 20,
    status: str | None = None,
    customer_id: str | None = None,
    subscription_id: str | None = None,
    user=Depends(get_admin_user),
):
    """Lists Dodo payments with optional filters. Admin only."""
    try:
        return dodo_service.list_payments(
            page=page,
            page_size=page_size,
            status=status or None,
            customer_id=customer_id or None,
            subscription_id=subscription_id or None,
        )
    except Exception as e:
        print(f"[billing] admin list_payments error: {e}")
        raise HTTPException(status_code=502, detail="Could not fetch payments")


@router.get("/admin/payments/{payment_id}")
async def admin_get_payment(payment_id: str, user=Depends(get_admin_user)):
    """Returns details of a specific Dodo payment. Admin only."""
    try:
        return dodo_service.get_payment(payment_id)
    except Exception as e:
        print(f"[billing] admin get_payment error: {e}")
        raise HTTPException(status_code=502, detail="Could not fetch payment")


@router.post("/admin/payments/{payment_id}/refund")
async def admin_create_refund(payment_id: str, body: RefundBody, user=Depends(get_admin_user)):
    """Creates a full refund for a payment. Admin only."""
    try:
        return dodo_service.create_refund(payment_id=payment_id, reason=body.reason or None)
    except Exception as e:
        print(f"[billing] admin create_refund error: {e}")
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/admin/refunds")
async def admin_list_refunds(
    page: int = 0,
    page_size: int = 20,
    status: str | None = None,
    user=Depends(get_admin_user),
):
    """Lists Dodo refunds. Admin only."""
    try:
        return dodo_service.list_refunds(page=page, page_size=page_size, status=status or None)
    except Exception as e:
        print(f"[billing] admin list_refunds error: {e}")
        raise HTTPException(status_code=502, detail="Could not fetch refunds")


@router.get("/admin/disputes")
async def admin_list_disputes(
    page: int = 0,
    page_size: int = 20,
    dispute_status: str | None = None,
    dispute_stage: str | None = None,
    user=Depends(get_admin_user),
):
    """Lists Dodo disputes. Admin only."""
    try:
        return dodo_service.list_disputes(
            page=page,
            page_size=page_size,
            dispute_status=dispute_status or None,
            dispute_stage=dispute_stage or None,
        )
    except Exception as e:
        print(f"[billing] admin list_disputes error: {e}")
        raise HTTPException(status_code=502, detail="Could not fetch disputes")


@router.post("/admin/customers/{customer_id}/portal")
async def admin_customer_portal(
    customer_id: str,
    return_url: str | None = None,
    user=Depends(get_admin_user),
):
    """Creates a Dodo customer portal session for a given customer. Admin only."""
    try:
        return dodo_service.create_customer_portal(customer_id=customer_id, return_url=return_url or None)
    except Exception as e:
        print(f"[billing] admin customer_portal error: {e}")
        raise HTTPException(status_code=502, detail="Could not create customer portal session")


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
        # Grant monthly credits on both new activation and renewal (monthly refresh).
        # period_end (next_billing_date) is used as a deduplication key so retried
        # webhooks for the same billing cycle never double-grant credits.
        if plan_tier:
            try:
                grant_plan_credits(user_id, plan_tier, period_end=next_billing_date)
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
        # Grant credits for the new plan on upgrade (idempotent via period_end key)
        if plan_tier:
            try:
                grant_plan_credits(user_id, plan_tier, period_end=next_billing_date)
            except Exception as e:
                print(f"[billing] grant_plan_credits (plan_changed) error (non-fatal): {e}")

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
        # on_hold means payment failed — downgrade to free immediately so
        # the user doesn't retain paid features while the subscription is unpaid.
        supabase_service.set_user_plan(user_id, "free")
        supabase_service.save_dodo_subscription(
            user_id=user_id,
            dodo_customer_id=dodo_customer_id,
            dodo_subscription_id=subscription_id,
            status="on_hold",
        )
        print(f"[billing] on_hold: downgraded user={user_id} to free")

    elif event_type == "subscription.failed":
        supabase_service.save_dodo_subscription(
            user_id=user_id,
            dodo_customer_id=dodo_customer_id,
            dodo_subscription_id=subscription_id,
            status="failed",
        )

    return {"ok": True}
