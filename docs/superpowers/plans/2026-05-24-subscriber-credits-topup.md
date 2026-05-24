# Subscriber-Only Credit Packs + Mid-Lecture Top-Up Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock credit pack purchases behind an active subscription, add a smart mid-lecture top-up banner in the live recording UI, and surface credit pack revenue data in the admin billing panel.

**Architecture:** Backend API gate (403 for free tier on `/billing/credits-checkout`) is the authoritative check; frontend reflects it with a graceful locked UI. The mid-lecture flow is purely client-side: App.jsx computes the approaching credit boundary from elapsed time vs. balance and renders a `TopUpBanner` component that opens the credits page in a new tab while polling for balance changes. Admin data comes from two new read-only endpoints in `billing.py` querying the existing `purchase_intents` table.

**Tech Stack:** FastAPI + Supabase Python client (backend), React 18 + Tailwind CSS (frontend), pytest (backend tests)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/app/api/billing.py` | Modify | Add subscription check to credits checkout; add 2 admin read endpoints |
| `backend/app/services/credits_service.py` | Modify | Graceful shortfall — don't throw 402 on finalization excess |
| `backend/tests/test_credits_shortfall.py` | Create | Tests for graceful shortfall behavior |
| `backend/tests/test_billing_gate.py` | Create | Tests for subscription gate on checkout |
| `frontend/src/components/TopUpBanner.jsx` | Create | 3-state banner: warning → urgent → countdown |
| `frontend/src/App.jsx` | Modify | Credit balance state, TopUpBanner integration, balance polling |
| `frontend/src/pages/CreditsPage.jsx` | Modify | Subscriber gate UI, `?topup=1` mode, plan_tier fetch |
| `frontend/src/lib/adminApi.js` | Modify | Add `getCreditPurchases` + `getCreditRevenue` to `billingApi` |
| `frontend/src/pages/admin/AdminBilling.jsx` | Modify | Add Credit Pack Sales section (stats + table) |

---

## Task 1: Graceful credit shortfall at session end

**Files:**
- Modify: `backend/app/services/credits_service.py` (function `finalize_reserved_credits`, ~line 243)
- Create: `backend/tests/test_credits_shortfall.py`

Currently, if a session runs longer than the reserved 1 credit covers and the user has no remaining balance, `finalize_reserved_credits` calls `_deduct_amount` which raises HTTP 402. This bubbles up and can corrupt the session-end flow. We catch it and forgive the shortfall (max 1 credit / $0.33 worst case).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_credits_shortfall.py`:

```python
"""Tests for graceful credit shortfall handling in finalize_reserved_credits."""
import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException


def _make_db(credits=0, reserved_amount=1):
    """Build a mock Supabase db client."""
    db = MagicMock()

    # profiles.select returns credits
    profile_resp = MagicMock()
    profile_resp.data = [{"credits": credits}]
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = profile_resp

    # credit_transactions for _reserved_amount
    tx_resp = MagicMock()
    tx_resp.data = [{"amount": -reserved_amount, "reason": "credit_reserved"}]

    # lectures.select for refund_credit
    lec_resp = MagicMock()
    lec_resp.data = [{"credit_deducted": True, "total_duration_seconds": 1800}]

    return db


def test_finalize_forgives_shortfall_when_balance_zero():
    """When a 35-min session reserved 1 credit but balance is now 0, finalize should not raise."""
    from app.services.credits_service import finalize_reserved_credits

    with patch("app.services.credits_service._fresh_db") as mock_db_fn, \
         patch("app.services.credits_service.mark_credit_deducted"):
        db = _make_db(credits=0, reserved_amount=1)
        mock_db_fn.return_value = db

        # Should NOT raise — shortfall is forgiven
        try:
            finalize_reserved_credits("user-1", "lecture-1", actual_duration_seconds=2100)  # 35 min → needs 2 credits
        except HTTPException as exc:
            pytest.fail(f"finalize_reserved_credits raised HTTP {exc.status_code} but should forgive shortfall")


def test_finalize_still_deducts_when_balance_sufficient():
    """Normal case: user has enough credits, finalize deducts the difference."""
    from app.services.credits_service import finalize_reserved_credits

    with patch("app.services.credits_service._fresh_db") as mock_db_fn, \
         patch("app.services.credits_service.mark_credit_deducted"), \
         patch("app.services.credits_service._deduct_amount") as mock_deduct:
        db = _make_db(credits=5, reserved_amount=1)
        mock_db_fn.return_value = db

        finalize_reserved_credits("user-1", "lecture-1", actual_duration_seconds=2100)  # 35 min → needs 2
        # Should call _deduct_amount for the 1 extra credit
        mock_deduct.assert_called_once()
        args = mock_deduct.call_args[0]
        assert args[2] == 1  # amount = 2 actual - 1 reserved = 1
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_credits_shortfall.py -v
```

Expected: Both tests import fine but `test_finalize_forgives_shortfall_when_balance_zero` will fail because `_deduct_amount` currently raises 402.

- [ ] **Step 3: Apply the fix in credits_service.py**

Find this block in `finalize_reserved_credits` (around line 270):

```python
    elif actual > reserved:
        _deduct_amount(user_id, lecture_id, actual - reserved, reason="lecture_processed")
```

Replace with:

```python
    elif actual > reserved:
        try:
            _deduct_amount(user_id, lecture_id, actual - reserved, reason="lecture_processed")
        except HTTPException as exc:
            if exc.status_code == 402:
                print(f"[credits] shortfall forgiven for {user_id} lecture {lecture_id}: "
                      f"needed {actual} credits, had {reserved} reserved, balance insufficient")
            else:
                raise
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && python -m pytest tests/test_credits_shortfall.py -v
```

Expected:
```
PASSED tests/test_credits_shortfall.py::test_finalize_forgives_shortfall_when_balance_zero
PASSED tests/test_credits_shortfall.py::test_finalize_still_deducts_when_balance_sufficient
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/credits_service.py backend/tests/test_credits_shortfall.py
git commit -m "fix(credits): forgive shortfall on session finalization instead of raising 402"
```

---

## Task 2: Subscriber gate on credits checkout endpoint

**Files:**
- Modify: `backend/app/api/billing.py` (function `create_credits_checkout`, line 100)
- Create: `backend/tests/test_billing_gate.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_billing_gate.py`:

```python
"""Tests for subscriber-only gate on credit pack checkout."""
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient


def _mock_free_user():
    u = MagicMock()
    u.id = "user-free-1"
    u.email = "free@example.com"
    return u


def _mock_student_user():
    u = MagicMock()
    u.id = "user-student-1"
    u.email = "student@example.com"
    return u


def test_free_user_gets_403_on_credits_checkout():
    """Free tier users should receive 403 subscription_required."""
    from app.api.billing import create_credits_checkout
    from app.api.billing import CreditsCheckoutBody
    import asyncio

    body = CreditsCheckoutBody(pack="small_pack")
    user = _mock_free_user()

    with patch("app.api.billing.supabase_service._fresh_db") as mock_db_fn, \
         patch("app.api.billing.settings") as mock_settings:
        mock_settings.DODO_API_KEY = "test-key"
        db = MagicMock()
        profile_resp = MagicMock()
        profile_resp.data = {"plan_tier": "free"}
        db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = profile_resp
        mock_db_fn.return_value = db

        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(create_credits_checkout(body, user))

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail["error"] == "subscription_required"


def test_student_user_passes_subscription_check():
    """Student tier users should pass the gate and proceed to Dodo."""
    from app.api.billing import create_credits_checkout
    from app.api.billing import CreditsCheckoutBody
    import asyncio

    body = CreditsCheckoutBody(pack="small_pack")
    user = _mock_student_user()

    with patch("app.api.billing.supabase_service._fresh_db") as mock_db_fn, \
         patch("app.api.billing.settings") as mock_settings, \
         patch("app.api.billing.dodo_service") as mock_dodo, \
         patch("app.api.billing.create_credits_purchase_intent", return_value="intent-1"):
        mock_settings.DODO_API_KEY = "test-key"
        mock_settings.CLERK_SECRET_KEY = "clerk-key"

        db = MagicMock()
        profile_resp = MagicMock()
        profile_resp.data = {"plan_tier": "student"}
        db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = profile_resp
        mock_db_fn.return_value = db

        mock_dodo.create_credits_checkout.return_value = ("session-1", "https://checkout.dodopayments.com/abc")

        result = asyncio.run(create_credits_checkout(body, user))
        assert "checkout_url" in result
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_billing_gate.py -v
```

Expected: `test_free_user_gets_403_on_credits_checkout` fails (no 403 raised yet).

- [ ] **Step 3: Add the subscription check to billing.py**

In `backend/app/api/billing.py`, inside `create_credits_checkout`, add immediately after the `DODO_API_KEY` check:

```python
@router.post("/credits-checkout")
async def create_credits_checkout(body: CreditsCheckoutBody, user=Depends(get_active_user)):
    """
    Creates a Dodo one-time payment checkout for a credit pack.
    Returns {"checkout_url": "https://..."}.
    Requires an active Student or Pro subscription.
    """
    if not settings.DODO_API_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")

    # ── Subscription gate ──────────────────────────────────────────────────
    try:
        db = supabase_service._fresh_db()
        profile_resp = db.table("profiles").select("plan_tier").eq(
            "id", str(user.id)
        ).maybe_single().execute()
        plan_tier = (profile_resp.data or {}).get("plan_tier", "free")
    except Exception:
        plan_tier = "free"  # safe default — gate stays closed on DB error

    if plan_tier == "free":
        raise HTTPException(
            status_code=403,
            detail={
                "error": "subscription_required",
                "message": "Credit packs require an active Student or Pro subscription.",
            },
        )
    # ── End subscription gate ──────────────────────────────────────────────

    user_id = str(user.id)
    # ... rest of existing function unchanged
```

Find the exact old function header and first two lines to replace cleanly:

Old text to find (lines 98–105 of billing.py):
```python
@router.post("/credits-checkout")
async def create_credits_checkout(body: CreditsCheckoutBody, user=Depends(get_active_user)):
    """
    Creates a Dodo one-time payment checkout for a credit pack.
    Returns {"checkout_url": "https://..."}.
    """
    if not settings.DODO_API_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")

    user_id = str(user.id)
```

New text:
```python
@router.post("/credits-checkout")
async def create_credits_checkout(body: CreditsCheckoutBody, user=Depends(get_active_user)):
    """
    Creates a Dodo one-time payment checkout for a credit pack.
    Returns {"checkout_url": "https://..."}.
    Requires an active Student or Pro subscription.
    """
    if not settings.DODO_API_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")

    # ── Subscription gate ──────────────────────────────────────────────────
    try:
        _db = supabase_service._fresh_db()
        _prof = _db.table("profiles").select("plan_tier").eq(
            "id", str(user.id)
        ).maybe_single().execute()
        _plan_tier = (_prof.data or {}).get("plan_tier", "free")
    except Exception:
        _plan_tier = "free"

    if _plan_tier == "free":
        raise HTTPException(
            status_code=403,
            detail={
                "error": "subscription_required",
                "message": "Credit packs require an active Student or Pro subscription.",
            },
        )
    # ── End subscription gate ──────────────────────────────────────────────

    user_id = str(user.id)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && python -m pytest tests/test_billing_gate.py -v
```

Expected: Both PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/billing.py backend/tests/test_billing_gate.py
git commit -m "feat(billing): require active subscription to purchase credit packs"
```

---

## Task 3: Admin credit purchase endpoints

**Files:**
- Modify: `backend/app/api/billing.py` (add 2 new routes at end of file before webhook)

These are two read-only admin endpoints. All data lives in the existing `purchase_intents` table.

- [ ] **Step 1: Add helper function and two routes to billing.py**

Add the following **before** the `@router.post("/webhook")` route in `billing.py`:

```python
# ── Admin: credit pack purchase data ──────────────────────────────────────────

_CREDIT_PACK_KEYS = ("small_pack", "large_pack", "pro_pack")
_PACK_LABELS = {
    "small_pack": "Starter (10 cr)",
    "large_pack": "Best Value (30 cr)",
    "pro_pack":   "Power Pack (60 cr)",
}


@router.get("/admin/credit-purchases")
async def admin_credit_purchases(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    product: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    _: User = Depends(get_admin_user),
):
    """Paginated list of completed credit pack purchases with user email."""
    db = supabase_service._fresh_db()

    q = db.table("purchase_intents").select("*").eq("status", "completed").in_(
        "product", list(_CREDIT_PACK_KEYS)
    )
    if product and product in _CREDIT_PACK_KEYS:
        q = db.table("purchase_intents").select("*").eq("status", "completed").eq("product", product)
    if from_date:
        q = q.gte("created_at", from_date)
    if to_date:
        q = q.lte("created_at", to_date + "T23:59:59Z")

    # Fetch all matching rows for total count, then slice for page
    all_resp = q.order("created_at", desc=True).execute()
    all_items = all_resp.data or []
    total = len(all_items)
    offset = (page - 1) * page_size
    page_items = all_items[offset: offset + page_size]

    # Batch-fetch profile emails for this page
    user_ids = list({i["user_id"] for i in page_items if i.get("user_id")})
    profile_map: dict = {}
    if user_ids:
        prof_resp = db.table("profiles").select("id, email, plan_tier").in_("id", user_ids).execute()
        for p in (prof_resp.data or []):
            profile_map[p["id"]] = p

    items = []
    for row in page_items:
        prof = profile_map.get(row.get("user_id"), {})
        items.append({
            "id":             row.get("id"),
            "created_at":     row.get("created_at"),
            "user_id":        row.get("user_id"),
            "email":          prof.get("email", "—"),
            "plan_tier":      prof.get("plan_tier", "—"),
            "product":        row.get("product"),
            "product_label":  _PACK_LABELS.get(row.get("product", ""), row.get("product", "")),
            "credits":        row.get("credits"),
            "price_usd":      row.get("price_usd"),
            "dodo_payment_id": row.get("dodo_payment_id"),
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/admin/credit-revenue")
async def admin_credit_revenue(_: User = Depends(get_admin_user)):
    """Aggregated credit pack revenue: totals, by-product breakdown, monthly trend."""
    from collections import defaultdict
    from datetime import datetime, timezone

    db = supabase_service._fresh_db()
    resp = db.table("purchase_intents").select(
        "product, price_usd, credits, created_at"
    ).eq("status", "completed").in_("product", list(_CREDIT_PACK_KEYS)).execute()
    items = resp.data or []

    now = datetime.now(timezone.utc)
    this_month = now.strftime("%Y-%m")

    total_rev   = sum(float(i.get("price_usd") or 0) for i in items)
    total_count = len(items)
    month_items = [i for i in items if (i.get("created_at") or "")[:7] == this_month]

    by_product = {}
    for key, label in _PACK_LABELS.items():
        p_items = [i for i in items if i.get("product") == key]
        rev = sum(float(i.get("price_usd") or 0) for i in p_items)
        by_product[key] = {
            "label":       label,
            "count":       len(p_items),
            "revenue_usd": round(rev, 2),
            "pct":         round(rev / total_rev * 100) if total_rev else 0,
        }

    monthly: dict = defaultdict(lambda: {"purchases": 0, "revenue_usd": 0.0})
    for i in items:
        m = (i.get("created_at") or "")[:7]
        if m:
            monthly[m]["purchases"] += 1
            monthly[m]["revenue_usd"] = round(monthly[m]["revenue_usd"] + float(i.get("price_usd") or 0), 2)

    return {
        "total_revenue_usd":      round(total_rev, 2),
        "total_purchases":        total_count,
        "this_month_revenue_usd": round(sum(float(i.get("price_usd") or 0) for i in month_items), 2),
        "this_month_purchases":   len(month_items),
        "by_product":             by_product,
        "monthly_trend":          [{"month": k, **v} for k, v in sorted(monthly.items(), reverse=True)][:12],
    }
```

Also add `Optional` and `Query` to the imports at the top of `billing.py` if not already present:
```python
from typing import Literal, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
```

And add `get_admin_user` to the auth import:
```python
from app.core.auth import get_active_user, get_admin_user
```

- [ ] **Step 2: Verify syntax**

```bash
cd backend && python -c "from app.api.billing import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/billing.py
git commit -m "feat(admin): credit pack purchase + revenue endpoints"
```

---

## Task 4: TopUpBanner component

**Files:**
- Create: `frontend/src/components/TopUpBanner.jsx`

This is the core mid-lecture UI. Three visual states driven by credit math. Docks to the bottom on mobile, pins below header on desktop.

- [ ] **Step 1: Create TopUpBanner.jsx**

Create `frontend/src/components/TopUpBanner.jsx`:

```jsx
import React, { useEffect, useRef, useState } from 'react';

/**
 * TopUpBanner — shown during a live recording when credits are running low.
 *
 * Props:
 *   recordingSeconds  {number}   elapsed session seconds
 *   creditBalance     {number}   credit balance AFTER the initial 1-credit reservation
 *   onTopUp           {function} called when user taps Top Up — opens credits page in new tab
 *   onAutoEnd         {function} called when countdown reaches 0 — triggers graceful session end
 */
export default function TopUpBanner({ recordingSeconds, creditBalance, onTopUp, onAutoEnd }) {
    const [countdown, setCountdown] = useState(60);
    const urgentSinceRef = useRef(null);
    const countdownRef   = useRef(null);

    // ── Credit boundary math ─────────────────────────────────────────────
    // 1 credit was already reserved at session start; we track additional credits needed.
    const additionalNeeded     = Math.max(0, Math.ceil(recordingSeconds / 1800) - 1);
    const additionalNeededSoon = Math.max(0, Math.ceil((recordingSeconds + 300) / 1800) - 1);

    const isUrgent  = additionalNeeded > creditBalance;
    const isWarning = !isUrgent && additionalNeededSoon > creditBalance;
    const isVisible = isWarning || isUrgent;

    // ── Countdown logic: start 60s countdown after 5 min of urgent state ─
    useEffect(() => {
        if (!isUrgent) {
            urgentSinceRef.current = null;
            clearInterval(countdownRef.current);
            setCountdown(60);
            return;
        }
        if (!urgentSinceRef.current) {
            urgentSinceRef.current = Date.now();
        }
        const elapsed = (Date.now() - urgentSinceRef.current) / 1000;
        if (elapsed >= 300 && !countdownRef.current) {
            // 5 min elapsed in urgent state — start countdown
            countdownRef.current = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(countdownRef.current);
                        countdownRef.current = null;
                        onAutoEnd();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
    }, [isUrgent, recordingSeconds]);

    useEffect(() => () => clearInterval(countdownRef.current), []);

    if (!isVisible) return null;

    const isCountdown = isUrgent && urgentSinceRef.current &&
        (Date.now() - urgentSinceRef.current) / 1000 >= 300;

    // ── Styles ────────────────────────────────────────────────────────────
    const bgColor  = isUrgent ? '#fef2f2' : '#fffbeb';
    const border   = isUrgent ? '1px solid #fca5a5' : '1px solid #fde68a';
    const dot      = isUrgent ? '#ef4444' : '#f59e0b';
    const textMain = isUrgent ? '#991b1b' : '#92400e';
    const textSub  = isUrgent ? '#b91c1c' : '#b45309';
    const btnBg    = '#1a1a1a';

    const message = isCountdown
        ? `Auto-saving in ${countdown}s — top up to keep recording.`
        : isUrgent
        ? "You're past your credit limit. Top up now to ensure this session saves."
        : `Running low — you'll need another credit in ~5 min. Top up to keep recording.`;

    return (
        <>
            <style>{`
                @keyframes slideUpBanner {
                    from { transform: translateY(100%); opacity: 0; }
                    to   { transform: translateY(0);    opacity: 1; }
                }
                @keyframes slideDownBanner {
                    from { transform: translateY(-100%); opacity: 0; }
                    to   { transform: translateY(0);     opacity: 1; }
                }
                .topup-banner {
                    position: fixed;
                    z-index: 200;
                    left: 0; right: 0;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    background: ${bgColor};
                    border-top: ${border};
                    animation: slideUpBanner 0.25s ease;
                    box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
                }
                /* Mobile: dock to bottom */
                @media (max-width: 639px) {
                    .topup-banner {
                        bottom: 64px; /* above bottom nav */
                        border-radius: 16px 16px 0 0;
                        flex-wrap: wrap;
                    }
                }
                /* Desktop: pin below top header (approx 64px) */
                @media (min-width: 640px) {
                    .topup-banner {
                        top: 64px;
                        border-top: none;
                        border-bottom: ${border};
                        animation: slideDownBanner 0.25s ease;
                        box-shadow: 0 2px 12px rgba(0,0,0,0.06);
                    }
                }
                .topup-dot {
                    width: 8px; height: 8px;
                    border-radius: 50%;
                    background: ${dot};
                    flex-shrink: 0;
                    animation: pulse 1.5s infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.4; }
                }
                .topup-msg {
                    flex: 1;
                    font-size: 13px;
                    font-weight: 500;
                    color: ${textMain};
                    line-height: 1.4;
                    min-width: 0;
                }
                .topup-sub {
                    font-size: 11px;
                    color: ${textSub};
                    margin-top: 2px;
                }
                .topup-btn {
                    flex-shrink: 0;
                    padding: 7px 14px;
                    background: ${btnBg};
                    color: #fafaf9;
                    border: none;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    white-space: nowrap;
                    transition: opacity 0.15s;
                }
                .topup-btn:hover { opacity: 0.8; }
            `}</style>

            <div className="topup-banner" role="alert" aria-live="assertive">
                <div className="topup-dot" />
                <div className="topup-msg">
                    {message}
                    <div className="topup-sub">
                        {isUrgent
                            ? `${additionalNeeded} credit(s) needed beyond reservation — top up to finalize correctly.`
                            : `Balance: ${creditBalance} credit(s) · next block costs 1 more.`
                        }
                    </div>
                </div>
                <button className="topup-btn" onClick={onTopUp}>
                    Top Up →
                </button>
            </div>
        </>
    );
}
```

- [ ] **Step 2: Verify it renders without errors**

Start the frontend dev server and navigate to `/record`. Open the browser console and confirm no import errors. (Visual verification — component won't show until session is active.)

```bash
cd frontend && npm run dev
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TopUpBanner.jsx
git commit -m "feat: TopUpBanner component — 3-state mid-lecture credit warning"
```

---

## Task 5: App.jsx — credit balance state + TopUpBanner integration

**Files:**
- Modify: `frontend/src/App.jsx`

Four surgical edits to the 3065-line file. Do them in order.

- [ ] **Step 1: Add creditBalance state and polling ref (near line 193, after plan limits block)**

Find this exact block:
```javascript
    // ── Plan limits ───────────────────────────────────────────
    const [maxDurationSeconds, setMaxDurationSeconds] = useState(null);
    const [isUnlimitedDuration, setIsUnlimitedDuration] = useState(true);
    const [planTier, setPlanTier]                     = useState('free');
    const [limitModal, setLimitModal]                 = useState({ show: false, reason: '', plan: '', limit: 0, limitLabel: '', resetsAt: '', credits: 0, required: 1 });
```

Add two lines after it:
```javascript
    // ── Plan limits ───────────────────────────────────────────
    const [maxDurationSeconds, setMaxDurationSeconds] = useState(null);
    const [isUnlimitedDuration, setIsUnlimitedDuration] = useState(true);
    const [planTier, setPlanTier]                     = useState('free');
    const [limitModal, setLimitModal]                 = useState({ show: false, reason: '', plan: '', limit: 0, limitLabel: '', resetsAt: '', credits: 0, required: 1 });

    // ── Credit top-up banner ──────────────────────────────────
    const [creditBalance, setCreditBalance]           = useState(0);
    const balancePollRef                              = useRef(null);
```

- [ ] **Step 2: Add import for TopUpBanner at top of file**

Find the existing imports block (around lines 1–8). Add after the last import:

```javascript
import TopUpBanner from './components/TopUpBanner.jsx';
```

- [ ] **Step 3: Add balance fetch + polling helpers (after startLiveSession function)**

Find this line (around line 810):
```javascript
            startRecording(res.data.lecture_id);
            // isStarting clears when sessionStatus changes to 'recording' (in startRecording)
```

Replace with:
```javascript
            startRecording(res.data.lecture_id);
            // isStarting clears when sessionStatus changes to 'recording' (in startRecording)

            // Fetch initial credit balance for top-up banner
            try {
                const balRes = await api.get('/api/v1/credits/balance');
                setCreditBalance(balRes.data?.credits ?? 0);
            } catch { /* non-critical */ }
```

Then find the `stopSummaryPoll` function and add the balance polling helpers right after it:

```javascript
    const stopSummaryPoll = () => {
        clearInterval(summaryPollRef.current);
        summaryPollRef.current = null;
    };
```

Add after:
```javascript
    const startBalancePoll = () => {
        if (balancePollRef.current) return;
        balancePollRef.current = setInterval(async () => {
            try {
                const res = await api.get('/api/v1/credits/balance');
                const newBal = res.data?.credits ?? 0;
                setCreditBalance(prev => {
                    if (newBal > prev) {
                        // Credits increased — banner will auto-hide via re-render
                        stopBalancePoll();
                        // Brief toast — use existing showError mechanism creatively:
                        // (the banner clears itself via isVisible logic)
                    }
                    return newBal;
                });
            } catch { /* ignore poll failures */ }
        }, 20000);
    };

    const stopBalancePoll = () => {
        clearInterval(balancePollRef.current);
        balancePollRef.current = null;
    };

    const handleTopUp = () => {
        window.open('/credits?topup=1', '_blank', 'noopener');
        startBalancePoll();
    };

    const handleTopUpAutoEnd = () => {
        stopBalancePoll();
        // Trigger the same graceful end as the user pressing "End Session"
        // Find the existing end-session handler — it's called via the endModal confirm
        // We call the API directly here for the auto-end case
        if (lectureId) {
            api.post(`/api/v1/live/${lectureId}/end`).catch(() => {});
        }
    };
```

Also add cleanup to the session end flow — find `stopSummaryPoll()` calls near the session end and add `stopBalancePoll()` alongside them. Search for:

```javascript
        stopSummaryPoll();
```

There will be multiple occurrences. Add `stopBalancePoll();` after each one.

- [ ] **Step 4: Render TopUpBanner in the active session JSX**

Find the limitModal render (around line 1726):
```javascript
            {/* ── Limit Modal (no credits / plan limit) ── */}
            {limitModal.show && (
```

Add the TopUpBanner render directly before it:
```javascript
            {/* ── Mid-lecture top-up banner ── */}
            {sessionStatus === 'recording' && (
                <TopUpBanner
                    recordingSeconds={recordingSeconds}
                    creditBalance={creditBalance}
                    onTopUp={handleTopUp}
                    onAutoEnd={handleTopUpAutoEnd}
                />
            )}

            {/* ── Limit Modal (no credits / plan limit) ── */}
            {limitModal.show && (
```

There is a second copy of the limitModal render in the ACTIVE SESSION section (around line 2801). Add the TopUpBanner before that one too:

```javascript
            {/* ── Mid-lecture top-up banner ── */}
            {sessionStatus === 'recording' && (
                <TopUpBanner
                    recordingSeconds={recordingSeconds}
                    creditBalance={creditBalance}
                    onTopUp={handleTopUp}
                    onAutoEnd={handleTopUpAutoEnd}
                />
            )}
```

- [ ] **Step 5: Verify in browser**

Start a live session with 0 or 1 credits remaining. The TopUpBanner should appear. With sufficient credits it should not appear.

```bash
cd frontend && npm run dev
```

Navigate to `/record`, start a session with a test account that has low credits. Confirm:
- Banner appears at correct threshold
- "Top Up →" opens `/credits?topup=1` in a new tab
- Banner disappears after topping up (within ~20s of the poll)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(recording): mid-lecture top-up banner with credit boundary detection"
```

---

## Task 6: CreditsPage.jsx — subscriber gate + top-up mode

**Files:**
- Modify: `frontend/src/pages/CreditsPage.jsx`

Three additions: (1) fetch plan_tier alongside balance, (2) subscriber gate UI for free users, (3) `?topup=1` mode header.

- [ ] **Step 1: Add plan_tier fetch to the load effect**

Find the existing load effect:
```javascript
    useEffect(() => {
        // Show success banner if redirected back from Dodo checkout
        if (new URLSearchParams(location.search).get('purchased') === '1') {
            setPurchased(true);
        }
        Promise.all([creditsApi.getBalance(), creditsApi.getHistory()])
            .then(([balRes, histRes]) => {
                setBalance(balRes.data);
                setHistory(histRes.data.transactions || []);
            })
            .catch(() => setError('Failed to load credit data.'))
            .finally(() => setLoading(false));
    }, []);
```

Replace with:
```javascript
    const [planTier, setPlanTier] = useState('free');
    const [isTopUpMode] = useState(
        new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('topup') === '1'
    );

    useEffect(() => {
        if (new URLSearchParams(location.search).get('purchased') === '1') {
            setPurchased(true);
        }
        Promise.all([creditsApi.getBalance(), creditsApi.getHistory(), api.get('/api/v1/profile')])
            .then(([balRes, histRes, profRes]) => {
                setBalance(balRes.data);
                setHistory(histRes.data.transactions || []);
                setPlanTier(profRes.data?.plan_tier || 'free');
            })
            .catch(() => {
                setError('Failed to load credit data.');
                // planTier stays 'free' — safe default, API will also gate
            })
            .finally(() => setLoading(false));
    }, []);
```

Note: `useState` calls must be at the top of the component. Move the two new `useState` declarations to the top of the `CreditsPage` function alongside the existing ones.

- [ ] **Step 2: Add subscriber gate CSS to the CSS string**

Find the CSS constant. After the last CSS rule (before the closing backtick), add:

```css
  /* Subscriber gate */
  .cr-gate-card { background: var(--color-card); border: 1.5px solid #fde68a; border-radius: 14px; padding: 20px 22px; margin-bottom: 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .cr-gate-icon { font-size: 24px; flex-shrink: 0; }
  .cr-gate-text { flex: 1; min-width: 180px; }
  .cr-gate-title { font-size: 14px; font-weight: 600; color: #92400e; margin-bottom: 3px; }
  .cr-gate-sub { font-size: 12px; color: #b45309; line-height: 1.5; }
  .cr-gate-btn { display: inline-block; padding: 8px 18px; background: #1a1a1a; color: #fafaf9; border-radius: 9px; font-size: 13px; font-weight: 500; text-decoration: none; white-space: nowrap; transition: opacity .15s; border: none; cursor: pointer; }
  .cr-gate-btn:hover { opacity: 0.8; }
  .cr-pack-locked { opacity: 0.45; pointer-events: none; position: relative; }
  .cr-pack-lock-label { display: block; text-align: center; padding: 9px 16px; border-radius: 9px; font-size: 12px; font-weight: 500; color: var(--color-muted); border: 1.5px solid var(--color-border); background: transparent; }
  /* Top-up mode banner */
  .cr-topup-mode { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #15803d; font-weight: 500; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
```

- [ ] **Step 3: Render gate card and locked packs for free users**

Find the pack grid section:
```javascript
                {/* Packs */}
                <div className="cr-section-title">Buy credits</div>
                <div className="cr-pack-grid">
```

Replace with:
```javascript
                {/* Packs */}
                <div className="cr-section-title">Buy credits</div>

                {/* Top-up mode header */}
                {isTopUpMode && (
                    <div className="cr-topup-mode">
                        <span>💳</span>
                        <span>Add credits to continue your recording — your session is still running in the other tab.</span>
                    </div>
                )}

                {/* Subscriber gate for free users */}
                {planTier === 'free' && (
                    <div className="cr-gate-card">
                        <div className="cr-gate-icon">🔒</div>
                        <div className="cr-gate-text">
                            <div className="cr-gate-title">Credit packs are available on Student &amp; Pro plans</div>
                            <div className="cr-gate-sub">Subscribe to unlock top-ups, unlimited lecture count, Q&amp;A, flashcards, and more.</div>
                        </div>
                        <a href="/pricing" className="cr-gate-btn">Upgrade to Student →</a>
                    </div>
                )}

                <div className="cr-pack-grid">
```

Then update the three pack buy buttons to be locked for free users. For each pack, change the button from:
```javascript
                        <button
                            className="cr-pack-btn cr-pack-btn-outline"
                            onClick={() => handleBuy('small_pack')}
                            disabled={!!pending}
                        >
                            {pending === 'small_pack' ? 'Processing…' : 'Buy pack'}
                        </button>
```

To:
```javascript
                        {planTier === 'free' ? (
                            <span className="cr-pack-lock-label">🔒 Subscribers only</span>
                        ) : (
                            <button
                                className="cr-pack-btn cr-pack-btn-outline"
                                onClick={() => handleBuy('small_pack')}
                                disabled={!!pending}
                            >
                                {pending === 'small_pack' ? 'Processing…' : 'Buy pack'}
                            </button>
                        )}
```

Apply the same pattern to `large_pack` (using `cr-pack-btn-dark`) and `pro_pack`.

Also update `handleBuy` to handle the 403 gracefully — the API will gate it even if somehow a free user calls it:
```javascript
    async function handleBuy(product) {
        setPending(product);
        setError('');
        try {
            const res = await api.post('/api/v1/billing/credits-checkout', { pack: product });
            window.location.href = res.data.checkout_url;
        } catch (err) {
            if (err.response?.status === 403 && err.response?.data?.error === 'subscription_required') {
                setError('Credit packs require an active subscription. Please upgrade your plan first.');
            } else {
                setError(err.response?.data?.detail || 'Could not start checkout. Please try again.');
            }
            setPending(null);
        }
    }
```

- [ ] **Step 4: Verify visually**

Check two scenarios in the browser:
1. Free tier account → `/credits` → packs should appear locked with "Subscribers only" label and the gate card above
2. Student/Pro account → `/credits` → packs should appear and be purchasable as before
3. Any account → `/credits?topup=1` → top-up mode banner should appear at the top of the packs section

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/CreditsPage.jsx
git commit -m "feat(credits): subscriber gate for credit packs + top-up mode header"
```

---

## Task 7: adminApi.js — credit purchase API functions

**Files:**
- Modify: `frontend/src/lib/adminApi.js`

- [ ] **Step 1: Add two functions to billingApi**

Find the end of the `billingApi` object in `adminApi.js`. It currently ends with something like:
```javascript
    getCustomerPortal: (customerId, returnUrl) =>
        _billingPostParams(`/admin/customers/${customerId}/portal`, returnUrl ? { return_url: returnUrl } : {}),
};
```

Add before the closing `};`:
```javascript
    getCreditPurchases: ({ page = 1, pageSize = 25, product, fromDate, toDate } = {}) =>
        _billingGet('/admin/credit-purchases', {
            page,
            page_size: pageSize,
            ...(product   ? { product }              : {}),
            ...(fromDate  ? { from_date: fromDate }  : {}),
            ...(toDate    ? { to_date: toDate }       : {}),
        }),

    getCreditRevenue: () =>
        _billingGet('/admin/credit-revenue'),
```

- [ ] **Step 2: Verify no syntax errors**

```bash
cd frontend && node --input-type=module < src/lib/adminApi.js 2>&1 | head -5
```

Expected: No output (no errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/adminApi.js
git commit -m "feat(admin): add getCreditPurchases and getCreditRevenue to billingApi"
```

---

## Task 8: AdminBilling.jsx — Credit Pack Sales section

**Files:**
- Modify: `frontend/src/pages/admin/AdminBilling.jsx`

Add a "Credit Pack Sales" section at the bottom of the component: summary stat cards, revenue-by-product breakdown table, and paginated purchase history table. Follow the existing component's CSS-in-JS patterns.

- [ ] **Step 1: Add credit pack state + data fetching**

Find the main `AdminBilling` component's state declarations and `useEffect`. The component uses `billingApi`. Add credit pack state alongside existing state:

Find:
```javascript
export default function AdminBilling() {
```

And inside the component, find the existing `useEffect` that fetches data. Add credit data fetching in parallel:

```javascript
    const [creditRevenue, setCreditRevenue]       = useState(null);
    const [creditPurchases, setCreditPurchases]   = useState({ items: [], total: 0 });
    const [creditPage, setCreditPage]             = useState(1);
    const [creditProduct, setCreditProduct]       = useState('');
    const [creditLoading, setCreditLoading]       = useState(false);
```

Add a separate effect for credit data:
```javascript
    useEffect(() => {
        billingApi.getCreditRevenue()
            .then(r => setCreditRevenue(r.data))
            .catch(() => {});
    }, []);

    useEffect(() => {
        setCreditLoading(true);
        billingApi.getCreditPurchases({ page: creditPage, pageSize: 25, product: creditProduct || undefined })
            .then(r => setCreditPurchases(r.data))
            .catch(() => {})
            .finally(() => setCreditLoading(false));
    }, [creditPage, creditProduct]);
```

- [ ] **Step 2: Add helper + CSS for the credit section**

Add a `CreditStatCard` helper component (local to this file) alongside any existing helper components at the top of the file:

```javascript
function CreditStatCard({ label, value, sub }) {
    return (
        <div style={{
            background: 'var(--ab-card, #1a1a1a)', border: '1px solid var(--ab-border, #2a2a2a)',
            borderRadius: 10, padding: '16px 20px', flex: '1 1 140px',
        }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: '#6b7280', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', color: '#f9fafb' }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{sub}</div>}
        </div>
    );
}
```

- [ ] **Step 3: Add the Credit Pack Sales JSX section**

Find the closing `</div>` of the last section in the AdminBilling return JSX (before the final `</div>` that closes the page wrapper). Add the entire Credit Pack Sales section there:

```jsx
                {/* ── Credit Pack Sales ───────────────────────────────────── */}
                <div style={{ marginTop: 40 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.3px', color: '#f9fafb', marginBottom: 16 }}>
                        Credit Pack Sales
                    </div>

                    {/* Summary stat cards */}
                    {creditRevenue && (
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
                            <CreditStatCard
                                label="All-time revenue"
                                value={`$${creditRevenue.total_revenue_usd.toFixed(2)}`}
                                sub={`${creditRevenue.total_purchases} purchases`}
                            />
                            <CreditStatCard
                                label="This month"
                                value={`$${creditRevenue.this_month_revenue_usd.toFixed(2)}`}
                                sub={`${creditRevenue.this_month_purchases} purchases`}
                            />
                            <CreditStatCard
                                label="Top seller"
                                value={Object.entries(creditRevenue.by_product).sort((a,b)=>b[1].count-a[1].count)[0]?.[1]?.label || '—'}
                                sub="by volume"
                            />
                        </div>
                    )}

                    {/* Revenue by product */}
                    {creditRevenue && (
                        <div style={{ background: 'var(--ab-card,#1a1a1a)', border: '1px solid var(--ab-border,#2a2a2a)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
                            <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--ab-border,#2a2a2a)' }}>
                                Revenue by pack
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--ab-border,#2a2a2a)' }}>
                                            {['Pack','Sales','Revenue','% of packs'].map(h => (
                                                <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(creditRevenue.by_product).map(([key, p]) => (
                                            <tr key={key} style={{ borderBottom: '1px solid var(--ab-border,#2a2a2a)' }}>
                                                <td style={{ padding: '10px 16px', color: '#f9fafb', fontWeight: 500 }}>{p.label}</td>
                                                <td style={{ padding: '10px 16px', color: '#d1d5db' }}>{p.count}</td>
                                                <td style={{ padding: '10px 16px', color: '#4ade80', fontWeight: 600 }}>${p.revenue_usd.toFixed(2)}</td>
                                                <td style={{ padding: '10px 16px', color: '#9ca3af' }}>{p.pct}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Filter bar */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb', flex: 1 }}>Purchase history</div>
                        <select
                            value={creditProduct}
                            onChange={e => { setCreditProduct(e.target.value); setCreditPage(1); }}
                            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--ab-border,#2a2a2a)', background: 'var(--ab-card,#1a1a1a)', color: '#f9fafb', fontSize: 12 }}
                        >
                            <option value="">All packs</option>
                            <option value="small_pack">Starter (10 cr)</option>
                            <option value="large_pack">Best Value (30 cr)</option>
                            <option value="pro_pack">Power Pack (60 cr)</option>
                        </select>
                    </div>

                    {/* Purchase history table */}
                    <div style={{ background: 'var(--ab-card,#1a1a1a)', border: '1px solid var(--ab-border,#2a2a2a)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--ab-border,#2a2a2a)' }}>
                                        {['Date','User','Plan','Pack','Credits','Amount','Payment ID'].map(h => (
                                            <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {creditLoading ? (
                                        <tr><td colSpan={7} style={{ padding: '24px 16px', textAlign: 'center', color: '#6b7280' }}>Loading…</td></tr>
                                    ) : creditPurchases.items.length === 0 ? (
                                        <tr><td colSpan={7} style={{ padding: '24px 16px', textAlign: 'center', color: '#6b7280' }}>No credit pack purchases yet.</td></tr>
                                    ) : creditPurchases.items.map(row => (
                                        <tr key={row.id} style={{ borderBottom: '1px solid var(--ab-border,#2a2a2a)' }}>
                                            <td style={{ padding: '10px 16px', color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtDate(row.created_at)}</td>
                                            <td style={{ padding: '10px 16px' }}>
                                                <a href={`/admin/users/${row.user_id}`} style={{ color: '#60a5fa', textDecoration: 'none', fontSize: 12 }}>{row.email}</a>
                                            </td>
                                            <td style={{ padding: '10px 16px' }}>
                                                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', background: '#1e3a5f', color: '#60a5fa', padding: '2px 7px', borderRadius: 4 }}>{row.plan_tier}</span>
                                            </td>
                                            <td style={{ padding: '10px 16px', color: '#f9fafb', fontWeight: 500, whiteSpace: 'nowrap' }}>{row.product_label}</td>
                                            <td style={{ padding: '10px 16px', color: '#d1d5db' }}>{row.credits} cr</td>
                                            <td style={{ padding: '10px 16px', color: '#4ade80', fontWeight: 600 }}>${Number(row.price_usd).toFixed(2)}</td>
                                            <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 11, fontFamily: 'monospace' }}>{row.dodo_payment_id ? row.dodo_payment_id.slice(0,16) + '…' : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Pagination */}
                    {creditPurchases.total > 25 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#9ca3af' }}>
                            <span>{creditPurchases.total} total purchases</span>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    disabled={creditPage <= 1}
                                    onClick={() => setCreditPage(p => p - 1)}
                                    style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--ab-border,#2a2a2a)', background: 'transparent', color: creditPage <= 1 ? '#374151' : '#f9fafb', cursor: creditPage <= 1 ? 'default' : 'pointer', fontSize: 12 }}
                                >← Prev</button>
                                <span style={{ padding: '5px 0' }}>Page {creditPage}</span>
                                <button
                                    disabled={creditPage * 25 >= creditPurchases.total}
                                    onClick={() => setCreditPage(p => p + 1)}
                                    style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--ab-border,#2a2a2a)', background: 'transparent', color: creditPage * 25 >= creditPurchases.total ? '#374151' : '#f9fafb', cursor: creditPage * 25 >= creditPurchases.total ? 'default' : 'pointer', fontSize: 12 }}
                                >Next →</button>
                            </div>
                        </div>
                    )}
                </div>
```

Note: `fmtDate` is already defined at the top of `AdminBilling.jsx` — use it directly.

- [ ] **Step 4: Verify in browser**

Navigate to `/admin/billing`. Scroll to the bottom. Confirm:
- Stat cards render (even if $0 with no data)
- Revenue by product table renders
- Purchase history table renders (shows "No credit pack purchases yet." if no data)
- Filters work without error
- Responsive on mobile (tables scroll horizontally)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/AdminBilling.jsx
git commit -m "feat(admin): credit pack sales section — revenue stats + purchase history"
```

---

## Task 9: End-to-end smoke test + final commit

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: All tests pass.

- [ ] **Step 2: Smoke-test subscriber gate**

1. Log in as a free-tier user → `/credits` → packs should be locked with "🔒 Subscribers only"
2. The gate card "Credit packs are available on Student & Pro plans" should be visible above packs
3. Try clicking a pack button — should be disabled (pointer-events none)
4. If you call `POST /api/v1/billing/credits-checkout` via DevTools with a free user's token → get 403 with `subscription_required`

- [ ] **Step 3: Smoke-test top-up banner**

1. Log in as student user with 1 credit
2. Start a live session → 1 credit reserved → balance = 0
3. Wait ~30 seconds into the session; the banner should appear in Warning state (additionalNeededSoon = 1 > balance = 0)
4. Click "Top Up →" → `/credits?topup=1` opens in new tab with the green top-up mode banner
5. Purchase credits in the new tab → within 20s the banner in the original tab should disappear

- [ ] **Step 4: Smoke-test admin billing section**

1. Go to `/admin/billing` → scroll to "Credit Pack Sales"
2. With real purchase data: verify stat cards show correct totals
3. Filter by product → only that product's purchases appear
4. Click user email link → navigates to `/admin/users/{id}`

- [ ] **Step 5: Final git log check**

```bash
git log --oneline -10
```

Expected: 8 commits from this feature visible.

---

## Self-Review Checklist

**Spec coverage:**
- [x] Backend subscription gate (403) — Task 2
- [x] Graceful shortfall forgiveness — Task 1
- [x] Admin credit purchase endpoint — Task 3
- [x] Admin credit revenue endpoint — Task 3
- [x] TopUpBanner: warning / urgent / countdown states — Task 4
- [x] App.jsx: balance fetch at session start — Task 5
- [x] App.jsx: balance polling every 20s — Task 5
- [x] App.jsx: auto-end on countdown zero — Task 5
- [x] CreditsPage: free user locked packs — Task 6
- [x] CreditsPage: upgrade CTA gate card — Task 6
- [x] CreditsPage: `?topup=1` mode banner — Task 6
- [x] CreditsPage: 403 handled in handleBuy — Task 6
- [x] adminApi: getCreditPurchases + getCreditRevenue — Task 7
- [x] AdminBilling: stat cards, by-product table, purchase history, pagination — Task 8
- [x] Mobile responsive (TopUpBanner bottom sheet, tables overflow-x) — Tasks 4, 8
- [x] No new migrations required — confirmed (purchase_intents + profiles already exist)
