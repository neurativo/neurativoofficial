# Admin Financial Overview (P&L Dashboard)
**Date:** 2026-05-24
**Status:** Approved for implementation

---

## Overview

A dedicated financial dashboard at `/admin/financials` that gives a complete monthly P&L view: subscription + credit pack revenue minus AI API costs, Dodo payment processing fees (auto-calculated), and manually entered infrastructure costs (Railway, Supabase, Clerk, Resend, custom). The result is a true net profit figure, not just gross margin against API spend.

This is a new page — separate from the existing `AdminCosts.jsx` (which remains as the technical API cost drill-down tool) and `AdminBilling.jsx` (which remains as the operational billing tool).

---

## Database

### New Migration: `013_admin_external_costs.sql`

```sql
CREATE TABLE admin_external_costs (
    id          uuid primary key default gen_random_uuid(),
    category    text not null,          -- 'railway' | 'supabase' | 'clerk' | 'resend' | 'other'
    label       text not null,          -- e.g. "Railway Pro Plan"
    amount_usd  numeric(10,2) not null,
    period      text not null,          -- 'YYYY-MM' e.g. '2026-05'
    note        text,
    created_at  timestamptz default now(),
    updated_at  timestamptz default now()
);

CREATE INDEX idx_admin_external_costs_period ON admin_external_costs(period);
```

No foreign keys. Admin-only table. No RLS required (backend validates admin JWT).

---

## P&L Calculation Logic

For a given `period` (YYYY-MM):

### Revenue
- **Subscription revenue** — query `user_subscriptions` for subscribers whose `subscription_status IN ('active', 'renewed')` and `subscription_period_end >= month_start`. Multiply counts by plan price (`student × $9.99 + pro × $19.99`). For the current month this is a live snapshot; for past months it reflects subscriptions that were active during that month based on `subscription_period_end`.
- **Credit pack revenue** — sum of `purchase_intents.price_usd` where `status = 'completed'` and `created_at` falls within the month.
- **Total Revenue** = subscription revenue + credit pack revenue

### Costs

**AI API costs (auto)**
Sum of `api_cost_logs.cost_usd` where `created_at` falls within the month.

**Payment processing fees (auto-calculated)**
Dodo standard rate: **3.5% + $0.35 per transaction**

- Credit pack fees: For each completed `purchase_intents` record in the period:
  `fee = price_usd * 0.035 + 0.35`
- Subscription fees: Estimated from active subscriber count:
  `fee = mrr_usd * 0.035 + total_subscribers * 0.35`
- Total Dodo fees = credit pack fees + subscription fees
- Label in UI: "Payment Processing (Dodo)" with a tooltip explaining auto-calculation

**Infrastructure costs (manual)**
Sum of `admin_external_costs.amount_usd` where `period = 'YYYY-MM'`, grouped by category.

**Total Costs** = AI costs + Dodo fees + infrastructure costs

### Net Profit
`net_profit = total_revenue - total_costs`
`margin_pct = (net_profit / total_revenue * 100)` if total_revenue > 0, else 0

---

## Backend

**File:** `backend/app/api/admin.py`

All new endpoints require admin JWT (same as existing admin routes). Add before the existing costs section.

### `GET /admin/financials/summary`

Query param: `month` (string, format `YYYY-MM`, default = current month)

Response:
```json
{
  "month": "2026-05",
  "revenue": {
    "subscriptions_usd": 249.80,
    "subscriber_counts": { "student": 15, "pro": 5 },
    "credit_packs_usd": 54.99,
    "credit_pack_count": 3,
    "total_usd": 304.79
  },
  "costs": {
    "ai_api_usd": 156.23,
    "dodo_fees_usd": 12.44,
    "dodo_fees_breakdown": {
      "credit_pack_fees_usd": 2.29,
      "subscription_fees_usd": 10.15
    },
    "infrastructure_usd": 30.78,
    "infrastructure_by_category": {
      "railway":  5.00,
      "supabase": 25.00,
      "clerk":    0.00,
      "resend":   0.78,
      "other":    0.00
    },
    "total_usd": 199.45
  },
  "net_profit_usd": 105.34,
  "margin_pct": 34.6
}
```

### `GET /admin/financials/trend`

Query param: `months` (int, default 12, max 24)

Returns array of monthly P&L summaries, oldest first:
```json
{
  "months": [
    {
      "month": "2025-06",
      "revenue_usd": 0,
      "costs_usd": 0,
      "net_profit_usd": 0,
      "margin_pct": 0
    },
    ...
    {
      "month": "2026-05",
      "revenue_usd": 304.79,
      "costs_usd": 199.45,
      "net_profit_usd": 105.34,
      "margin_pct": 34.6
    }
  ]
}
```

### `GET /admin/external-costs`

Query param: `month` (YYYY-MM, required)

Returns all entries for the month:
```json
{
  "month": "2026-05",
  "items": [
    { "id": "...", "category": "railway", "label": "Railway Pro", "amount_usd": 5.00, "note": null },
    { "id": "...", "category": "supabase", "label": "Supabase Pro", "amount_usd": 25.00, "note": null }
  ]
}
```

### `POST /admin/external-costs`

Body:
```json
{ "category": "railway", "label": "Railway Pro", "amount_usd": 5.00, "period": "2026-05", "note": null }
```

Returns created item (201).

### `PUT /admin/external-costs/{id}`

Body: same shape as POST (all fields required).
Returns updated item.

### `DELETE /admin/external-costs/{id}`

Returns 204.

---

## Frontend

**File:** `frontend/src/pages/admin/AdminFinancials.jsx`

### Layout

```
┌──────────────────────────────────────────────────────────┐
│ Financials          ← May 2026 →        [Manage Costs]   │
├──────────────┬──────────────┬──────────────┬─────────────┤
│ Total Revenue│ Total Costs  │  Net Profit  │   Margin    │
│  $304.79     │  $199.45     │  $105.34 ✓  │   34.6%     │
│              │              │  (green)     │  (green pill)│
├──────────────┴──────────────┴──────────────┴─────────────┤
│ INCOME STATEMENT                                          │
│                                                           │
│  REVENUE                                                  │
│    Subscriptions         $249.80   [15 student · 5 pro]   │
│    Credit Packs           $54.99   [3 purchases]          │
│    ─────────────────────────────────────────────────      │
│    Total Revenue         $304.79                          │
│                                                           │
│  COSTS                                                    │
│    AI API Costs          $156.23   → costs page           │
│    Payment Processing     $12.44   (ℹ Dodo 3.5%+$0.35)   │
│    Infrastructure         $30.78   [▼ expand]             │
│      Railway               $5.00                          │
│      Supabase             $25.00                          │
│      Resend                $0.78                          │
│    ─────────────────────────────────────────────────      │
│    Total Costs           $199.45                          │
│                                                           │
│  NET PROFIT              $105.34   Margin: 34.6%          │
├─────────────────────────────┬────────────────────────────┤
│ 12-Month Trend              │ Cost Breakdown              │
│ (bar chart: rev/cost/profit)│ (donut: AI / Dodo / Infra) │
└─────────────────────────────┴────────────────────────────┘
```

### KPI Cards
- 4 cards in a row (desktop), 2×2 grid (mobile, ≤640px)
- Net Profit card: green background tint + checkmark if positive, red + warning icon if negative
- Margin card: colored pill (green ≥30%, amber 10–29%, red <10%)

### Income Statement
- Two sections: REVENUE and COSTS, each with a subtotal row
- Infrastructure row is collapsible (click to expand/collapse, chevron icon)
- "AI API Costs" row has a small `→` link to `/admin/costs`
- "Payment Processing" row has an `ℹ` tooltip: "Auto-calculated: 3.5% + $0.35 per transaction (Dodo standard rate)"
- NET PROFIT row: large text, bold, green/red color
- All amounts in USD. No LKR on this page (clean financial view)

### 12-Month Trend Chart
- Grouped bar chart, pure CSS (no chart library — three colored bars per month)
- Revenue (teal), Costs (coral/red), Profit (green or red if loss)
- Month labels on x-axis (abbreviated: "Jan", "Feb", etc.)
- Values on hover (simple title attribute tooltip)
- Full width on mobile

### Cost Breakdown Donut
- Pure CSS donut using conic-gradient
- Three segments: AI Costs (blue), Dodo Fees (purple), Infrastructure (orange)
- Legend below with amounts and percentages
- Full width on mobile

### Manage Costs Panel
- **Desktop:** right-side slide-over drawer (width 400px, overlay backdrop)
- **Mobile:** bottom sheet (slides up from bottom, rounded top corners)
- Month selector at top of panel (same ← Month → navigator)
- Pre-populated category rows: Railway, Supabase, Clerk, Resend (always shown, $0.00 if no entry)
- Each row: category icon + label + amount input ($) + optional note + delete button
- "+ Add custom" button at bottom of list → adds a new row with text input for label
- Save / Cancel buttons at panel footer
- On save: refetches summary, updates all P&L numbers in place

### Month Navigation
- `← [Month Year] →` arrows at page top
- Cannot navigate past current month (future months disabled)
- Default: current month on load
- When month changes: re-fetch summary + trend (trend always shows last 12 from current month)

### Admin Sidebar
Add "Financials" nav entry between "Costs" and "Billing" in the admin sidebar.

---

## adminApi.js additions

`adminApi.js` uses shared helpers `_get`, `_post`, `_patch`, `_delete` (all require admin JWT via `_token()`). A `_put` helper does not exist yet — add it alongside the others following the same pattern as `_post`.

Add `_put` helper:
```javascript
async function _put(path, body = {}) {
    const token = await _token();
    const res = await fetch(`${BASE}/api/v1/admin${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}
```

Add to existing `adminApi` object:
```javascript
getFinancialSummary: (month) =>
    _get(`/financials/summary${month ? `?month=${month}` : ''}`),
getFinancialTrend: (months = 12) =>
    _get(`/financials/trend?months=${months}`),
getExternalCosts: (month) =>
    _get(`/external-costs?month=${month}`),
createExternalCost: (data) =>
    _post('/external-costs', data),
updateExternalCost: (id, data) =>
    _put(`/external-costs/${id}`, data),
deleteExternalCost: (id) =>
    _delete(`/external-costs/${id}`),
```

Note: `_get` in adminApi.js already serializes query params — verify this in implementation and use the correct calling convention.

---

## Error States

| Scenario | Handling |
|---|---|
| No external costs entered for month | Infrastructure row shows $0.00, no error |
| No revenue for month (early month / new product) | All zeros, margin shows "—" |
| `api_cost_logs` empty for month | AI costs = $0.00 |
| Summary fetch fails | Skeleton loaders → error message with retry button |
| External cost save fails | Inline error in panel, keep panel open |
| Month has no data at all | Show zeros, prompt "Add infrastructure costs for this month" |

---

## Mobile Responsiveness

- KPI cards: 2×2 grid (≤640px), 4-column row (≥641px)
- Income statement: full width, collapsible infrastructure section
- Charts: stacked vertically, full width
- Manage Costs: bottom sheet with `max-height: 80vh`, scrollable list
- All tap targets ≥44px

---

## Files Changed

| File | Type | Change |
|---|---|---|
| `backend/migrations/013_admin_external_costs.sql` | Create | New table |
| `backend/app/api/admin.py` | Edit | 6 new endpoints (financials summary, trend, external costs CRUD) |
| `frontend/src/pages/admin/AdminFinancials.jsx` | Create | New P&L dashboard page |
| `frontend/src/lib/adminApi.js` | Edit | 6 new API functions |
| `frontend/src/main.jsx` | Edit | Add `/admin/financials` route (admin routes are defined here) |
| `frontend/src/pages/admin/AdminLayout.jsx` | Edit | Add "Financials" nav entry between Costs and Billing |

**No changes to existing AdminCosts.jsx or AdminBilling.jsx.**
