"""
Dodo Payments integration — subscription billing.
Uses the REST API directly via httpx (no extra SDK dependency).
Webhook verification follows the Standard Webhooks HMAC-SHA256 spec.
"""
import base64
import hashlib
import hmac
import json
import os
import time
from typing import Tuple

import httpx

from app.core.config import settings

def _api_base() -> str:
    if os.getenv("DODO_TEST_MODE", "").lower() in ("1", "true", "yes"):
        return "https://test.dodopayments.com"
    return "https://live.dodopayments.com"


def _plan_product_map() -> dict:
    return {
        "student": settings.DODO_STUDENT_PRODUCT_ID,
        "pro": settings.DODO_PRO_PRODUCT_ID,
    }


def _product_to_plan(product_id: str) -> str | None:
    for plan, pid in _plan_product_map().items():
        if pid and pid == product_id:
            return plan
    return None


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.DODO_API_KEY}",
        "Content-Type": "application/json",
    }


def create_subscription_checkout(
    user_id: str,
    email: str,
    name: str,
    plan: str,
    return_url: str,
) -> Tuple[str, str]:
    """
    Creates a Dodo Payments subscription and returns (subscription_id, payment_link).
    Raises ValueError for unknown plans, httpx.HTTPError on API failure.
    """
    product_id = _plan_product_map().get(plan)
    if not product_id:
        raise ValueError(f"Unknown plan or product not configured: {plan}")

    payload = {
        "product_id": product_id,
        "quantity": 1,
        "customer": {
            "email": email,
            "name": name or email.split("@")[0],
        },
        "return_url": return_url,
        "payment_link": True,
        "metadata": {"neurativo_user_id": user_id},
    }

    with httpx.Client(timeout=20) as client:
        resp = client.post(
            f"{_api_base()}/subscriptions",
            headers=_headers(),
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

    subscription_id = data["subscription_id"]
    payment_link = data.get("payment_link") or ""
    return subscription_id, payment_link


def cancel_subscription(subscription_id: str) -> None:
    """Cancels an active subscription."""
    with httpx.Client(timeout=15) as client:
        resp = client.patch(
            f"{_api_base()}/subscriptions/{subscription_id}",
            headers=_headers(),
            json={"status": "cancelled"},
        )
        resp.raise_for_status()


def verify_webhook(
    body: bytes,
    webhook_id: str,
    webhook_timestamp: str,
    webhook_signature: str,
) -> dict:
    """
    Verifies a Dodo Payments webhook using the Standard Webhooks spec.
    Returns the parsed event dict on success, raises ValueError on failure.
    """
    secret = settings.DODO_WEBHOOK_SECRET
    if not secret:
        raise ValueError("DODO_WEBHOOK_SECRET not configured")

    if not webhook_id or not webhook_timestamp or not webhook_signature:
        raise ValueError("Missing webhook headers")

    # Reject stale webhooks (> 5 minutes old)
    try:
        ts = int(webhook_timestamp)
        if abs(time.time() - ts) > 300:
            raise ValueError("Webhook timestamp too old")
    except (TypeError, ValueError) as e:
        raise ValueError(f"Invalid webhook timestamp: {e}")

    # Decode secret — Standard Webhooks uses "whsec_" + base64
    if secret.startswith("whsec_"):
        secret_bytes = base64.b64decode(secret[6:])
    else:
        secret_bytes = secret.encode()

    # Compute expected signature
    msg = f"{webhook_id}.{webhook_timestamp}.{body.decode('utf-8')}"
    raw_sig = hmac.new(secret_bytes, msg.encode(), hashlib.sha256).digest()
    expected = "v1," + base64.b64encode(raw_sig).decode()

    # Header may contain multiple space-separated signatures
    if not any(s == expected for s in webhook_signature.split(" ")):
        raise ValueError("Webhook signature mismatch")

    return json.loads(body)
