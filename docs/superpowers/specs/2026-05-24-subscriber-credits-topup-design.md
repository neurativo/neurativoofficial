# Subscriber-Only Credit Packs + Mid-Lecture Top-Up Flow
**Date:** 2026-05-24
**Status:** Approved for implementation

---

## Overview

Two interconnected features:
1. **Subscriber gate** — credit pack purchases locked behind an active Student/Pro subscription. Free users see the packs but cannot buy them; they see a clear "Subscribe to unlock" CTA instead.
2. **Mid-lecture top-up flow** — during a live recording session, a smart banner warns when credits are running low and lets the user top up in a new tab without stopping the recording.

Additionally: an **admin billing view** of all credit pack purchases, revenue, and per-user top-up history.

---

## Feature 1: Subscriber Gate on Credit Packs

### Backend

**File:** `backend/app/api/billing.py`

Add a subscription check to the credits checkout endpoint (identified in frontend as `/api/v1/billing/credits-checkout`):

```
POST /billing/credits-checkout
```

1. Fetch `plan_tier` from `profiles` table for the requesting user.
2. If `plan_tier == "free"`, return:
   ```json
   HTTP 403
   { "error": "subscription_required", "message": "Credit packs require an active Student or Pro subscription." }
   ```
3. Continue existing Dodo checkout logic for non-free users.

This is the authoritative gate — the UI reflects it, but the API enforces it regardless.

### Frontend — CreditsPage.jsx

**Fetch plan_tier:** Add profile fetch (`GET /api/v1/profile`) in parallel with balance + history on mount. Extract `plan_tier` from response.

**Free user experience:**
- Render pack cards normally (same layout, same prices) — conversion anchor
- Overlay each pack card with a lock state:
  - Dimmed opacity (0.5)
  - Lock icon (🔒) over the buy button
  - Buy button replaced with disabled "Subscribers only" label
  - No hover effect
- Above the pack grid: a prominent upgrade CTA card:
  ```
  ┌─────────────────────────────────────────────┐
  │ 🔒 Credit packs are available on Student    │
  │    and Pro plans.                           │
  │    [Upgrade to Student — $9.99/mo →]        │
  └─────────────────────────────────────────────┘
  ```
  CTA links to `/pricing` or triggers checkout for Student plan.

**On 403 response from buy attempt (belt-and-suspenders):** Show the same upgrade CTA inline under the error message.

**Subscribed users:** No change — existing pack purchase flow is unchanged.

**`?topup=1` query param:** When the page is opened with `?topup=1` (from the mid-lecture banner), display a prominent "Top-up mode" header: "Add credits to continue your recording." Auto-scroll to the pack grid.

---

## Feature 2: Mid-Lecture Top-Up Flow

### Credit boundary logic

Credits are consumed at `ceil(duration_seconds / 1800)` per session. The frontend can predict when the current session will need more credits than the user has.

**Pre-emptive warning threshold:** Show banner when:
```
ceil((recordingSeconds + 300) / 1800) >= creditBalance
```
i.e., warn 5 minutes before the next credit boundary is crossed.

**Urgent threshold:** Show urgent state when:
```
ceil(recordingSeconds / 1800) >= creditBalance
```
i.e., the session has already crossed into a block that costs more than available.

### TopUpBanner component (new)

**File:** `frontend/src/components/TopUpBanner.jsx`

Self-contained component. Props:
- `recordingSeconds` — current elapsed session seconds
- `creditBalance` — current credit balance (fetched at session start, updated by polling)
- `onTopUp` — called when user taps Top Up (opens new tab)
- `onAutoEnd` — called when countdown reaches 0 (triggers graceful session end)

**Three visual states:**

1. **Warning (amber)** — `ceil((recordingSeconds + 300) / 1800) >= creditBalance`
   - Text: "Running low — you'll need another credit in ~5 min. Top up to keep recording."
   - Action: "Top Up →" button (opens `/credits?topup=1` in new tab)
   - Dismiss: small × to snooze for 5 min

2. **Urgent (red)** — `ceil(recordingSeconds / 1800) >= creditBalance`
   - Text: "You're past your credit limit. Top up now to ensure this session saves correctly."
   - Action: "Top Up →" button — cannot be dismissed

3. **Countdown (red + live timer)** — urgent state sustained for 5+ minutes with no top-up
   - Text: "Auto-saving in [countdown] — top up to continue recording."
   - Countdown: 60 seconds, then triggers `onAutoEnd`
   - Action: "Top Up →" still visible

**Layout:**
- Mobile: fixed bottom sheet (bottom: 0, full width, rounded top corners, sits above bottom nav)
- Desktop: fixed banner below the recording header (top: 64px, full width, z-index above content)
- Smooth slide-in animation

**Auto-clear:** When `creditBalance` increases (detected by polling), banner clears immediately with a brief green toast: "Credits added — keep recording!"

### App.jsx additions

**Credit balance fetch at session start:**
After successful `POST /api/v1/live/start`, also fetch `GET /api/v1/credits/balance`. Store `creditBalance` in state.

**Balance polling:**
When `topUpBannerVisible === true`, start polling `GET /api/v1/credits/balance` every 20 seconds. Stop polling when banner clears or session ends.

**State additions:**
```
creditBalance: number          — credit balance, fetched at start
topUpBannerVisible: bool       — whether TopUpBanner is rendered
```

**handleTopUp function:**
```
1. Opens window.open('/credits?topup=1', '_blank')
2. Starts balance polling (20s interval)
```

**handleCreditBalanceUpdate(newBalance):**
```
1. If newBalance > creditBalance: clear banner, show toast, stop polling
2. Update creditBalance state
```

**onAutoEnd handler:**
Calls the existing session-end logic (same as user tapping "End Session").

**Pre-session warning (before recording starts):**
On `/record` page load, fetch balance. If balance <= 2, show a soft amber info bar (not the TopUpBanner, just a static callout): "You have [N] credit(s). Consider topping up before starting a long session." with a "Top Up →" link to `/credits`.

### Backend — graceful shortfall at session end

**File:** `backend/app/services/credits_service.py`

Modify `finalize_reserved_credits`: if `_deduct_amount` raises HTTP 402 (insufficient credits for overage), catch it, log the shortfall, and complete without the additional deduction. Session content is never withheld. The shortfall is at most 1 credit (~$0.33) and is forgiven.

```python
try:
    _deduct_amount(user_id, lecture_id, actual - reserved, reason="lecture_processed")
except HTTPException as exc:
    if exc.status_code == 402:
        print(f"[credits] shortfall forgiven for {user_id} lecture {lecture_id}: needed {actual}, had {reserved}")
    else:
        raise
```

---

## Feature 3: Admin — Credit Pack Purchases & Revenue

### Backend — new admin endpoints

**File:** `backend/app/api/billing.py` (admin billing routes live here, under the `/billing` router prefix)

#### `GET /billing/admin/credit-purchases` → `/api/v1/billing/admin/credit-purchases`

Query params: `page` (default 1), `page_size` (default 25), `product` (optional filter), `from_date`, `to_date`

Returns paginated list of completed credit pack purchases from `purchase_intents` where:
- `status = 'completed'`
- `product IN ('small_pack', 'large_pack', 'pro_pack')`

Join with `profiles` to include user email and plan_tier.

Response shape:
```json
{
  "items": [
    {
      "id": "...",
      "created_at": "...",
      "user_id": "...",
      "email": "user@example.com",
      "plan_tier": "student",
      "product": "large_pack",
      "product_label": "Best Value",
      "credits": 30,
      "price_usd": 11.99,
      "dodo_payment_id": "..."
    }
  ],
  "total": 142,
  "page": 1,
  "page_size": 25
}
```

#### `GET /billing/admin/credit-revenue` → `/api/v1/billing/admin/credit-revenue`

Returns aggregated revenue data:
```json
{
  "total_revenue_usd": 1234.56,
  "total_purchases": 87,
  "this_month_revenue_usd": 234.00,
  "this_month_purchases": 19,
  "by_product": {
    "small_pack":  { "count": 20, "revenue_usd": 99.80,  "pct": 8 },
    "large_pack":  { "count": 45, "revenue_usd": 539.55, "pct": 44 },
    "pro_pack":    { "count": 22, "revenue_usd": 483.78, "pct": 39 }
  },
  "monthly_trend": [
    { "month": "2026-04", "revenue_usd": 180.00, "purchases": 15 },
    { "month": "2026-05", "revenue_usd": 234.00, "purchases": 19 }
  ]
}
```

### Frontend — adminApi.js

Add two functions to the existing `billingApi` object (which already points to `BILLING_BASE = .../api/v1/billing`):
- `getCreditPurchases(params)` → `_billingGet('/admin/credit-purchases', params)`
- `getCreditRevenue()` → `_billingGet('/admin/credit-revenue')`

### Frontend — AdminBilling.jsx additions

Add a new "Credit Pack Sales" section below the existing subscription content.

**Summary row (4 stat cards):**
- All-time revenue ($)
- This month revenue ($)
- Purchases this month (#)
- Top-selling pack (product label)

**Revenue by product table:**
| Pack | Sales | Revenue | % of Pack Revenue |
|------|-------|---------|-------------------|
| Starter (10 cr) | 20 | $99.80 | 8% |
| Best Value (30 cr) | 45 | $539.55 | 44% |
| Power Pack (60 cr) | 22 | $483.78 | 39% |

**Monthly trend table:**
| Month | Purchases | Revenue |
|-------|-----------|---------|
| May 2026 | 19 | $234.00 |
| Apr 2026 | 15 | $180.00 |

**Purchase history table (paginated):**
| Date | User | Plan | Pack | Credits | Amount | Payment ID |
|------|------|------|------|---------|--------|------------|
| May 24 | user@x.com | Student | Best Value | 30 cr | $11.99 | dodo_xxx |

- User links to `/admin/users/{id}`
- Filter by product (dropdown), date range (from/to inputs)
- All tables responsive (horizontal scroll on mobile)

---

## Mobile Responsiveness

- `TopUpBanner`: bottom sheet on mobile, top banner on desktop (CSS media query at 640px)
- Subscriber gate on CreditsPage: upgrade CTA card stacks vertically on mobile, full-width button
- Admin tables: `overflow-x: auto` wrapper, min-column widths so data is readable
- Stat cards: 2-column grid on mobile, 4-column on desktop

---

## Error States

| Scenario | Handling |
|---|---|
| Profile fetch fails in CreditsPage | Assume free tier (safe default — API still gates) |
| Balance fetch fails at session start in App.jsx | Skip pre-emptive warning; don't block session start |
| Balance poll fails | Silently retry next interval; no UI disruption |
| Admin endpoint returns empty | Show empty state rows, not errors |
| Dodo checkout 403 (subscription_required) | Show upgrade CTA inline |

---

## Files Changed

| File | Type | Change |
|---|---|---|
| `backend/app/api/billing.py` | Edit | Add subscription check to credits checkout |
| `backend/app/api/admin.py` | Edit | Add 2 credit purchase/revenue endpoints |
| `backend/app/services/credits_service.py` | Edit | Graceful shortfall handling in finalize |
| `frontend/src/components/TopUpBanner.jsx` | Create | New banner component (3 states) |
| `frontend/src/pages/CreditsPage.jsx` | Edit | Subscriber gate, topup mode, plan_tier fetch |
| `frontend/src/App.jsx` | Edit | Pre-session warning, TopUpBanner integration, balance polling |
| `frontend/src/lib/adminApi.js` | Edit | Add getCreditPurchases + getCreditRevenue |
| `frontend/src/pages/admin/AdminBilling.jsx` | Edit | Add credit pack sales section |

**No new migrations required** — all data exists in `purchase_intents` and `profiles`.
