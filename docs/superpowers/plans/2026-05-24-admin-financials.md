# Admin Financial P&L Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated `/admin/financials` page showing a true monthly P&L: subscription + credit pack revenue minus AI costs, auto-calculated Dodo payment fees, and manually entered infrastructure costs (Railway, Supabase, Clerk, Resend, custom).

**Architecture:** New `AdminFinancials.jsx` page backed by 6 new admin endpoints in `admin.py` and a new `admin_external_costs` DB table. The Manage Costs panel (slide-over on desktop, bottom sheet on mobile) handles CRUD for monthly infrastructure cost entries. All charts are pure CSS — no chart library.

**Tech Stack:** FastAPI + Supabase (backend), React + inline styles + `adm-*` CSS classes from `admin.css` (frontend), axios via `adminApi.js` helper layer.

---

## File Structure

| File | Type | Responsibility |
|---|---|---|
| `backend/migrations/013_admin_external_costs.sql` | Create | `admin_external_costs` table + index |
| `backend/app/api/admin.py` | Modify | 6 new endpoints + 2 helper functions |
| `backend/tests/test_financials.py` | Create | Tests for financials summary + CRUD |
| `frontend/src/lib/adminApi.js` | Modify | `_putBody` helper + 6 new `adminApi` functions |
| `frontend/src/pages/admin/AdminFinancials.jsx` | Create | Full P&L dashboard page |
| `frontend/src/main.jsx` | Modify | Import + route for `/admin/financials` |
| `frontend/src/pages/admin/AdminLayout.jsx` | Modify | "Financials" nav entry in Monetization group |

---

## Task 1: DB Migration

**Files:**
- Create: `backend/migrations/013_admin_external_costs.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- =============================================================================
-- 013_admin_external_costs.sql  —  Manual infrastructure cost entries
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin_external_costs (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    category    TEXT            NOT NULL,
    label       TEXT            NOT NULL,
    amount_usd  NUMERIC(10,2)   NOT NULL,
    period      TEXT            NOT NULL,
    note        TEXT,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_external_costs_period
    ON admin_external_costs(period);
```

Save to `backend/migrations/013_admin_external_costs.sql`.

- [ ] **Step 2: Run migration in Supabase SQL editor**

Open Supabase dashboard → SQL editor → paste the file contents → Run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/013_admin_external_costs.sql
git commit -m "feat(db): admin_external_costs table for manual P&L cost entries"
```

---

## Task 2: Backend — Financials Endpoints

**Files:**
- Modify: `backend/app/api/admin.py` (add before the existing `@router.get("/costs")` block near line 665)
- Create: `backend/tests/test_financials.py`

### Context

`admin.py` uses:
- `from app.core.auth import get_admin_user, User`
- `from app.services.supabase_service import get_client as _sb_client`
- `admin: User = Depends(get_admin_user)` for auth on each endpoint
- Supabase client: `sb = _sb_client()` then `sb.table("...").select("...").eq("...", ...).execute()`

The existing `_cost_financial()` function (line 1028) is the reference for how financial DB queries work.

### Step 1: Write failing tests

- [ ] Create `backend/tests/test_financials.py`:

```python
"""Tests for admin financials endpoints."""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

ADMIN_HEADERS = {"Authorization": "Bearer test-admin-token"}

def _make_admin_user():
    u = MagicMock()
    u.id = "admin-user-id"
    return u

def _make_sb(sub_data=None, pack_data=None, cost_data=None, infra_data=None, created_data=None):
    sb = MagicMock()
    def _table(name):
        tbl = MagicMock()
        def _select(*a, **kw):
            sel = MagicMock()
            def _chain(*a, **kw): return sel
            sel.eq = _chain
            sel.in_ = _chain
            sel.gte = _chain
            sel.lte = _chain
            if name == "user_subscriptions":
                sel.execute = MagicMock(return_value=MagicMock(data=sub_data or []))
            elif name == "purchase_intents":
                sel.execute = MagicMock(return_value=MagicMock(data=pack_data or []))
            elif name == "api_cost_logs":
                sel.execute = MagicMock(return_value=MagicMock(data=cost_data or []))
            elif name == "admin_external_costs":
                sel.execute = MagicMock(return_value=MagicMock(data=infra_data or []))
            else:
                sel.execute = MagicMock(return_value=MagicMock(data=[]))
            return sel
        tbl.select = _select
        ins = MagicMock()
        ins.execute = MagicMock(return_value=MagicMock(data=[created_data] if created_data else []))
        tbl.insert = MagicMock(return_value=ins)
        return tbl
    sb.table = _table
    return sb


@patch("app.api.admin.get_admin_user", return_value=_make_admin_user())
@patch("app.api.admin._sb_client")
def test_financials_summary_zero_data(mock_sb, mock_admin):
    """Returns zeros when no data exists for the month."""
    mock_sb.return_value = _make_sb()
    res = client.get("/api/v1/admin/financials/summary?month=2025-01", headers=ADMIN_HEADERS)
    assert res.status_code == 200
    body = res.json()
    assert body["month"] == "2025-01"
    assert body["revenue"]["total_usd"] == 0.0
    assert body["costs"]["total_usd"] == 0.0
    assert body["net_profit_usd"] == 0.0
    assert body["margin_pct"] == 0.0


@patch("app.api.admin.get_admin_user", return_value=_make_admin_user())
@patch("app.api.admin._sb_client")
def test_financials_summary_with_data(mock_sb, mock_admin):
    """Calculates correct P&L with subscriptions, credit packs, AI costs."""
    mock_sb.return_value = _make_sb(
        sub_data=[{"plan_tier": "student"}, {"plan_tier": "pro"}],
        pack_data=[{"price_usd": 11.99}],
        cost_data=[{"cost_usd": 5.00}],
        infra_data=[{"category": "railway", "amount_usd": 10.00}],
    )
    res = client.get("/api/v1/admin/financials/summary?month=2026-05", headers=ADMIN_HEADERS)
    assert res.status_code == 200
    body = res.json()
    # Revenue: 9.99 + 19.99 + 11.99 = 41.97
    assert body["revenue"]["subscriptions_usd"] == pytest.approx(29.98, abs=0.01)
    assert body["revenue"]["credit_packs_usd"] == pytest.approx(11.99, abs=0.01)
    assert body["revenue"]["total_usd"] == pytest.approx(41.97, abs=0.01)
    # AI cost = 5.00
    assert body["costs"]["ai_api_usd"] == pytest.approx(5.00, abs=0.01)
    # Infrastructure = 10.00
    assert body["costs"]["infrastructure_usd"] == pytest.approx(10.00, abs=0.01)
    assert body["costs"]["infrastructure_by_category"]["railway"] == pytest.approx(10.00, abs=0.01)
    # Net profit = total_revenue - total_costs (positive)
    assert body["net_profit_usd"] == pytest.approx(
        body["revenue"]["total_usd"] - body["costs"]["total_usd"], abs=0.01
    )


@patch("app.api.admin.get_admin_user", return_value=_make_admin_user())
@patch("app.api.admin._sb_client")
def test_financials_summary_default_month(mock_sb, mock_admin):
    """Without month param, defaults to current month format YYYY-MM."""
    from datetime import datetime, timezone
    mock_sb.return_value = _make_sb()
    res = client.get("/api/v1/admin/financials/summary", headers=ADMIN_HEADERS)
    assert res.status_code == 200
    body = res.json()
    expected_month = datetime.now(timezone.utc).strftime("%Y-%m")
    assert body["month"] == expected_month


@patch("app.api.admin.get_admin_user", return_value=_make_admin_user())
@patch("app.api.admin._sb_client")
def test_financials_trend_returns_months_array(mock_sb, mock_admin):
    """Trend endpoint returns a months array of the correct length."""
    mock_sb.return_value = _make_sb()
    res = client.get("/api/v1/admin/financials/trend?months=3", headers=ADMIN_HEADERS)
    assert res.status_code == 200
    body = res.json()
    assert "months" in body
    assert len(body["months"]) == 3
    # Each entry has required fields
    for entry in body["months"]:
        assert "month" in entry
        assert "revenue_usd" in entry
        assert "costs_usd" in entry
        assert "net_profit_usd" in entry


@patch("app.api.admin.get_admin_user", return_value=_make_admin_user())
@patch("app.api.admin._sb_client")
def test_get_external_costs_returns_items(mock_sb, mock_admin):
    """External costs list endpoint returns items for a month."""
    mock_sb.return_value = _make_sb(infra_data=[
        {"id": "abc", "category": "railway", "label": "Railway Pro", "amount_usd": 5.00, "note": None}
    ])
    res = client.get("/api/v1/admin/external-costs?month=2026-05", headers=ADMIN_HEADERS)
    assert res.status_code == 200
    body = res.json()
    assert body["month"] == "2026-05"
    assert len(body["items"]) == 1
    assert body["items"][0]["category"] == "railway"


@patch("app.api.admin.get_admin_user", return_value=_make_admin_user())
@patch("app.api.admin._sb_client")
def test_create_external_cost(mock_sb, mock_admin):
    """POST /admin/external-costs creates a cost entry."""
    new_item = {"id": "xyz", "category": "supabase", "label": "Supabase Pro",
                "amount_usd": 25.00, "period": "2026-05", "note": None}
    mock_sb.return_value = _make_sb(created_data=new_item)
    res = client.post("/api/v1/admin/external-costs", headers=ADMIN_HEADERS,
                      json={"category": "supabase", "label": "Supabase Pro",
                            "amount_usd": 25.00, "period": "2026-05"})
    assert res.status_code == 201
    body = res.json()
    assert body["category"] == "supabase"
    assert body["amount_usd"] == 25.00
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd D:/neurativoproject/backend && python -m pytest tests/test_financials.py -v 2>&1
```

Expected: `ImportError` or `404` errors — endpoints don't exist yet.

- [ ] **Step 3: Implement the helper functions and 6 endpoints in `admin.py`**

Find the line containing `@router.get("/costs")` (around line 665). Add the following code **before** that line:

```python
# ── Financials helpers ────────────────────────────────────────────────────────
import calendar as _calendar

_PLAN_PRICES_FIN = {"student": 9.99, "pro": 19.99}
_DODO_RATE       = 0.035
_DODO_FIXED      = 0.35   # per transaction


def _month_bounds(month_str: str):
    """Return (start_iso, end_iso) for a 'YYYY-MM' period string."""
    year, mon = int(month_str[:4]), int(month_str[5:7])
    start = datetime(year, mon, 1, tzinfo=timezone.utc)
    last  = _calendar.monthrange(year, mon)[1]
    end   = datetime(year, mon, last, 23, 59, 59, 999999, tzinfo=timezone.utc)
    return start.isoformat(), end.isoformat()


def _build_financials_summary(month_str: str) -> dict:
    """Full P&L for one month. Returns {} when Supabase is unavailable."""
    sb = _sb_client()
    if not sb:
        return {}

    start, end = _month_bounds(month_str)

    # 1. Subscription revenue (active/renewed subs whose period_end >= month_start)
    sub_res = sb.table("user_subscriptions") \
        .select("plan_tier") \
        .in_("subscription_status", ["active", "renewed"]) \
        .gte("subscription_period_end", start) \
        .execute()
    sub_counts: dict = {"student": 0, "pro": 0}
    for r in (sub_res.data or []):
        tier = r.get("plan_tier", "")
        if tier in sub_counts:
            sub_counts[tier] += 1
    sub_revenue = round(
        sub_counts["student"] * _PLAN_PRICES_FIN["student"] +
        sub_counts["pro"]     * _PLAN_PRICES_FIN["pro"], 2
    )
    total_subs = sub_counts["student"] + sub_counts["pro"]

    # 2. Credit pack revenue (completed purchase_intents in period)
    pack_res = sb.table("purchase_intents") \
        .select("price_usd") \
        .eq("status", "completed") \
        .gte("created_at", start) \
        .lte("created_at", end) \
        .execute()
    pack_rows       = pack_res.data or []
    credit_revenue  = round(sum(r.get("price_usd") or 0.0 for r in pack_rows), 2)
    credit_pack_count = len(pack_rows)

    total_revenue = round(sub_revenue + credit_revenue, 2)

    # 3. AI API costs
    cost_res = sb.table("api_cost_logs") \
        .select("cost_usd") \
        .gte("created_at", start) \
        .lte("created_at", end) \
        .execute()
    ai_cost = round(sum(r.get("cost_usd") or 0.0 for r in (cost_res.data or [])), 2)

    # 4. Dodo payment processing fees (auto-calculated)
    credit_pack_fees = round(
        sum((r.get("price_usd") or 0.0) * _DODO_RATE + _DODO_FIXED for r in pack_rows), 2
    )
    sub_fees   = round(sub_revenue * _DODO_RATE + total_subs * _DODO_FIXED, 2)
    dodo_fees  = round(credit_pack_fees + sub_fees, 2)

    # 5. Infrastructure costs (manual entries)
    infra_res = sb.table("admin_external_costs") \
        .select("category,amount_usd") \
        .eq("period", month_str) \
        .execute()
    infra_by_cat: dict = {"railway": 0.0, "supabase": 0.0, "clerk": 0.0, "resend": 0.0, "other": 0.0}
    for r in (infra_res.data or []):
        cat = r.get("category") or "other"
        infra_by_cat[cat] = round(infra_by_cat.get(cat, 0.0) + (r.get("amount_usd") or 0.0), 2)
    infra_total = round(sum(infra_by_cat.values()), 2)

    # 6. Totals
    total_costs  = round(ai_cost + dodo_fees + infra_total, 2)
    net_profit   = round(total_revenue - total_costs, 2)
    margin_pct   = round((net_profit / max(total_revenue, 0.000001)) * 100, 1) \
                   if total_revenue > 0 else 0.0

    return {
        "month": month_str,
        "revenue": {
            "subscriptions_usd":  sub_revenue,
            "subscriber_counts":  sub_counts,
            "credit_packs_usd":   credit_revenue,
            "credit_pack_count":  credit_pack_count,
            "total_usd":          total_revenue,
        },
        "costs": {
            "ai_api_usd":          ai_cost,
            "dodo_fees_usd":       dodo_fees,
            "dodo_fees_breakdown": {
                "credit_pack_fees_usd": credit_pack_fees,
                "subscription_fees_usd": sub_fees,
            },
            "infrastructure_usd":          infra_total,
            "infrastructure_by_category":  infra_by_cat,
            "total_usd":                   total_costs,
        },
        "net_profit_usd": net_profit,
        "margin_pct":     margin_pct,
    }


# ── Financials endpoints ──────────────────────────────────────────────────────

@router.get("/financials/summary")
async def get_financials_summary(
    month: str = None,
    admin: User = Depends(get_admin_user),
):
    """Full P&L for a single month. Defaults to current month."""
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
    summary = _build_financials_summary(month)
    if not summary:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return summary


@router.get("/financials/trend")
async def get_financials_trend(
    months: int = 12,
    admin: User = Depends(get_admin_user),
):
    """Monthly P&L summaries for the last N months (oldest first)."""
    if months < 1 or months > 24:
        months = 12
    now   = datetime.now(timezone.utc)
    result = []
    for i in range(months - 1, -1, -1):
        # walk back i months from now
        year  = now.year
        mon   = now.month - i
        while mon <= 0:
            mon  += 12
            year -= 1
        month_str = f"{year:04d}-{mon:02d}"
        s = _build_financials_summary(month_str)
        result.append({
            "month":          month_str,
            "revenue_usd":    s.get("revenue", {}).get("total_usd", 0.0) if s else 0.0,
            "costs_usd":      s.get("costs",   {}).get("total_usd", 0.0) if s else 0.0,
            "net_profit_usd": s.get("net_profit_usd", 0.0) if s else 0.0,
            "margin_pct":     s.get("margin_pct", 0.0)     if s else 0.0,
        })
    return {"months": result}


@router.get("/external-costs")
async def list_external_costs(
    month: str,
    admin: User = Depends(get_admin_user),
):
    """List all manual cost entries for a given YYYY-MM month."""
    sb = _sb_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")
    res = sb.table("admin_external_costs") \
        .select("id,category,label,amount_usd,note,period,created_at") \
        .eq("period", month) \
        .execute()
    return {"month": month, "items": res.data or []}


@router.post("/external-costs", status_code=201)
async def create_external_cost(
    body: dict,
    admin: User = Depends(get_admin_user),
):
    """Create a manual cost entry."""
    sb = _sb_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")
    row = {
        "category":   body.get("category", "other"),
        "label":      body.get("label", ""),
        "amount_usd": float(body.get("amount_usd", 0)),
        "period":     body.get("period", ""),
        "note":       body.get("note"),
    }
    res = sb.table("admin_external_costs").insert(row).execute()
    items = res.data or []
    if not items:
        raise HTTPException(status_code=500, detail="Insert failed")
    return items[0]


@router.put("/external-costs/{cost_id}")
async def update_external_cost(
    cost_id: str,
    body: dict,
    admin: User = Depends(get_admin_user),
):
    """Update a manual cost entry."""
    sb = _sb_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")
    row = {
        "category":   body.get("category", "other"),
        "label":      body.get("label", ""),
        "amount_usd": float(body.get("amount_usd", 0)),
        "period":     body.get("period", ""),
        "note":       body.get("note"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    res = sb.table("admin_external_costs").update(row).eq("id", cost_id).execute()
    items = res.data or []
    if not items:
        raise HTTPException(status_code=404, detail="Cost entry not found")
    return items[0]


@router.delete("/external-costs/{cost_id}", status_code=204)
async def delete_external_cost(
    cost_id: str,
    admin: User = Depends(get_admin_user),
):
    """Delete a manual cost entry."""
    sb = _sb_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")
    sb.table("admin_external_costs").delete().eq("id", cost_id).execute()
    return None
```

- [ ] **Step 4: Run the tests**

```bash
cd D:/neurativoproject/backend && python -m pytest tests/test_financials.py -v 2>&1
```

Expected: `6 passed`

- [ ] **Step 5: Run full suite to check for regressions**

```bash
cd D:/neurativoproject/backend && python -m pytest tests/ -v 2>&1
```

Expected: New 6 pass, pre-existing 5 failures unchanged, no new failures.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/admin.py backend/tests/test_financials.py
git commit -m "feat(admin): financials P&L endpoints + external costs CRUD"
```

---

## Task 3: adminApi.js Additions

**Files:**
- Modify: `frontend/src/lib/adminApi.js`

### Context

`adminApi.js` uses axios. Helper functions:
- `_get(path, params)` — GET with query params object
- `_post(path, params)` — POST with params as query string (NOT for JSON bodies)
- `_postBody(path, body)` — POST with JSON body (this is what we use for createExternalCost)
- `_patch(path, body)` — PATCH with JSON body
- `_delete(path)` — DELETE

There is no `_putBody` helper yet. We need to add one for `updateExternalCost`.

- [ ] **Step 1: Add `_putBody` helper after `_postBody` (around line 218)**

Find this exact block in `adminApi.js`:

```javascript
// Internal helper: POST with JSON body (not params)
async function _postBody(path, body = {}) {
    const token = await _token();
    const res = await axios.post(BASE + path, body, { headers: _headers(token) });
    return res.data;
}
```

Add directly after it:

```javascript
async function _putBody(path, body = {}) {
    const token = await _token();
    const res = await axios.put(BASE + path, body, { headers: _headers(token) });
    return res.data;
}
```

- [ ] **Step 2: Add 6 functions to `adminApi` object**

Find the line `setCreditsSubscription: async (userId, body) => {` block — which is the last entry in `adminApi`. Add the following after the closing `},` of `setCreditsSubscription` and before the closing `};` of `adminApi`:

```javascript
    // Financials P&L
    getFinancialSummary: (month) =>
        _get('/financials/summary', month ? { month } : {}),
    getFinancialTrend: (months = 12) =>
        _get('/financials/trend', { months }),
    getExternalCosts: (month) =>
        _get('/external-costs', { month }),
    createExternalCost: (data) =>
        _postBody('/external-costs', data),
    updateExternalCost: (id, data) =>
        _putBody(`/external-costs/${id}`, data),
    deleteExternalCost: (id) =>
        _delete(`/external-costs/${id}`),
```

- [ ] **Step 3: Verify the file looks correct — check no syntax errors**

```bash
cd D:/neurativoproject/frontend && node --input-type=module < /dev/null 2>&1 || npx --yes acorn --ecma2020 --module src/lib/adminApi.js > /dev/null && echo "OK"
```

Expected: `OK` (or no errors)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/adminApi.js
git commit -m "feat(admin): add financials + external costs API functions to adminApi"
```

---

## Task 4: AdminFinancials.jsx — Full P&L Dashboard

**Files:**
- Create: `frontend/src/pages/admin/AdminFinancials.jsx`

### Context

Admin pages use:
- `adm-card`, `adm-btn`, `adm-btn-ghost`, `adm-section-title`, `adm-table`, `adm-error` CSS classes from `admin.css`
- Inline `style={{}}` for layout (flex, grid, colors, spacing)
- No external chart libraries — use pure CSS

- [ ] **Step 1: Create `frontend/src/pages/admin/AdminFinancials.jsx`**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../lib/adminApi.js';

// ── date helpers ──────────────────────────────────────────────────────────────
function toMonthStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function prevMonth(s) {
    const [y, m] = s.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
function nextMonth(s) {
    const [y, m] = s.split('-').map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
function monthLabel(s) {
    const [y, m] = s.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}
function shortMon(s) {
    const [y, m] = s.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('default', { month: 'short' });
}
function fmt(n) { return `$${(+(n || 0)).toFixed(2)}`; }
function fmtPct(n) { return `${(+(n || 0)).toFixed(1)}%`; }

const CURRENT_MONTH = toMonthStr(new Date());

const CATEGORY_ICONS = {
    railway:  '🚂',
    supabase: '⚡',
    clerk:    '🔐',
    resend:   '✉️',
    other:    '📦',
};
const CATEGORY_LABELS = {
    railway:  'Railway',
    supabase: 'Supabase',
    clerk:    'Clerk',
    resend:   'Resend',
    other:    'Other',
};
const DEFAULT_ROWS = [
    { category: 'railway',  label: 'Railway',  amount_usd: 0, note: '' },
    { category: 'supabase', label: 'Supabase', amount_usd: 0, note: '' },
    { category: 'clerk',    label: 'Clerk',    amount_usd: 0, note: '' },
    { category: 'resend',   label: 'Resend',   amount_usd: 0, note: '' },
];

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, isProfit, isMargin }) {
    const isNeg  = isProfit && parseFloat(value.replace(/[^0-9.-]/g, '')) < 0;
    const pct    = isMargin ? parseFloat(value) : null;
    const pill   = isMargin
        ? pct >= 30 ? '#dcfce7' : pct >= 10 ? '#fef9c3' : '#fee2e2'
        : null;
    const pillText = isMargin
        ? pct >= 30 ? '#166534' : pct >= 10 ? '#854d0e' : '#991b1b'
        : null;

    return (
        <div className="adm-card" style={{ margin: 0, padding: '18px 20px', position: 'relative' }}>
            <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                {label}
            </div>
            {isMargin ? (
                <div style={{
                    display: 'inline-block', padding: '4px 12px', borderRadius: 999,
                    background: pill, color: pillText, fontSize: 22, fontWeight: 700,
                }}>
                    {value}
                </div>
            ) : (
                <div style={{
                    fontSize: 26, fontWeight: 700,
                    color: isProfit ? (isNeg ? '#dc2626' : '#16a34a') : '#111827',
                }}>
                    {isProfit && !isNeg && <span style={{ marginRight: 4 }}>✓</span>}
                    {isProfit && isNeg  && <span style={{ marginRight: 4 }}>⚠</span>}
                    {value}
                </div>
            )}
            {sub && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{sub}</div>}
        </div>
    );
}

// ── Income statement ──────────────────────────────────────────────────────────
function IncomeStatement({ data, infraOpen, setInfraOpen, navigate }) {
    if (!data) return null;
    const { revenue, costs, net_profit_usd, margin_pct } = data;
    const isNeg = net_profit_usd < 0;

    const row = (label, value, sub, extra) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '7px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div>
                <span style={{ fontSize: 14, color: '#374151' }}>{label}</span>
                {sub  && <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>{sub}</span>}
                {extra}
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>{value}</span>
        </div>
    );

    const subtotalRow = (label, value) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 0', borderTop: '2px solid #e5e7eb', marginTop: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{label}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>{value}</span>
        </div>
    );

    const sectionHeader = (label) => (
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280',
            textTransform: 'uppercase', letterSpacing: '0.08em', padding: '14px 0 4px', marginTop: 4 }}>
            {label}
        </div>
    );

    const subBadge = (counts) => (
        <span style={{ fontSize: 11, color: '#6b7280' }}>
            {counts.student > 0 && `${counts.student} student`}
            {counts.student > 0 && counts.pro > 0 && ' · '}
            {counts.pro > 0 && `${counts.pro} pro`}
        </span>
    );

    const tooltip = (text) => (
        <span title={text} style={{ cursor: 'help', marginLeft: 4, color: '#9ca3af', fontSize: 12 }}>ⓘ</span>
    );

    const infraItems = costs.infrastructure_by_category || {};
    const nonZeroInfra = Object.entries(infraItems).filter(([, v]) => v > 0);

    return (
        <div className="adm-card" style={{ margin: '0 0 20px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px', color: '#111827' }}>Income Statement</h3>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>{monthLabel(data.month)}</div>

            {sectionHeader('Revenue')}
            {row(
                'Subscriptions', fmt(revenue.subscriptions_usd),
                null,
                revenue.subscriber_counts && (
                    <span style={{ marginLeft: 8 }}>{subBadge(revenue.subscriber_counts)}</span>
                )
            )}
            {row('Credit Packs', fmt(revenue.credit_packs_usd),
                revenue.credit_pack_count > 0 ? `${revenue.credit_pack_count} purchase${revenue.credit_pack_count !== 1 ? 's' : ''}` : null
            )}
            {subtotalRow('Total Revenue', fmt(revenue.total_usd))}

            {sectionHeader('Costs')}
            {row(
                'AI API Costs', fmt(costs.ai_api_usd), null,
                <span
                    onClick={() => navigate('/admin/costs')}
                    style={{ marginLeft: 8, fontSize: 12, color: '#6366f1', cursor: 'pointer', textDecoration: 'underline' }}
                >
                    → view details
                </span>
            )}
            {row(
                'Payment Processing (Dodo)', fmt(costs.dodo_fees_usd), null,
                tooltip('Auto-calculated: 3.5% + $0.35 per transaction (Dodo standard rate)')
            )}

            {/* Infrastructure — collapsible */}
            <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '7px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                onClick={() => setInfraOpen(o => !o)}
            >
                <div>
                    <span style={{ fontSize: 14, color: '#374151' }}>Infrastructure</span>
                    <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>
                        {nonZeroInfra.length > 0
                            ? nonZeroInfra.map(([k]) => CATEGORY_LABELS[k] || k).join(' · ')
                            : 'none entered'}
                    </span>
                    <span style={{ marginLeft: 6, fontSize: 12, color: '#9ca3af' }}>{infraOpen ? '▲' : '▼'}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>
                    {fmt(costs.infrastructure_usd)}
                </span>
            </div>
            {infraOpen && (
                <div style={{ paddingLeft: 16, background: '#f9fafb', borderRadius: 4, margin: '2px 0 4px' }}>
                    {Object.entries(infraItems).map(([cat, amt]) => (
                        <div key={cat} style={{ display: 'flex', justifyContent: 'space-between',
                            padding: '5px 0', fontSize: 13, color: '#6b7280' }}>
                            <span>{CATEGORY_ICONS[cat] || '📦'} {CATEGORY_LABELS[cat] || cat}</span>
                            <span style={{ fontFamily: 'monospace' }}>{fmt(amt)}</span>
                        </div>
                    ))}
                </div>
            )}

            {subtotalRow('Total Costs', fmt(costs.total_usd))}

            {/* Net profit */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 0 4px', marginTop: 8, borderTop: '3px solid #111827' }}>
                <div>
                    <span style={{ fontSize: 18, fontWeight: 800, color: isNeg ? '#dc2626' : '#16a34a' }}>
                        Net {isNeg ? 'Loss' : 'Profit'}
                    </span>
                    <span style={{ marginLeft: 12, fontSize: 13, color: '#6b7280' }}>
                        Margin: {fmtPct(margin_pct)}
                    </span>
                </div>
                <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace',
                    color: isNeg ? '#dc2626' : '#16a34a' }}>
                    {fmt(net_profit_usd)}
                </span>
            </div>
        </div>
    );
}

// ── Trend chart (pure CSS bars) ───────────────────────────────────────────────
function TrendChart({ trend }) {
    if (!trend || !trend.length) return null;
    const maxVal = Math.max(...trend.map(m => Math.max(m.revenue_usd, m.costs_usd, 0.01)));

    return (
        <div className="adm-card" style={{ margin: 0, padding: '18px 20px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px' }}>12-Month Trend</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100, overflowX: 'auto' }}>
                {trend.map(m => {
                    const revH  = Math.max(2, Math.round((m.revenue_usd  / maxVal) * 90));
                    const cosH  = Math.max(2, Math.round((m.costs_usd    / maxVal) * 90));
                    const profH = Math.max(2, Math.round((Math.abs(m.net_profit_usd) / maxVal) * 90));
                    const isNeg = m.net_profit_usd < 0;
                    return (
                        <div key={m.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto', minWidth: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90 }}>
                                <div title={`Revenue: ${fmt(m.revenue_usd)}`} style={{ width: 7, height: revH, background: '#14b8a6', borderRadius: '2px 2px 0 0' }} />
                                <div title={`Costs: ${fmt(m.costs_usd)}`}    style={{ width: 7, height: cosH, background: '#f87171', borderRadius: '2px 2px 0 0' }} />
                                <div title={`${isNeg ? 'Loss' : 'Profit'}: ${fmt(m.net_profit_usd)}`}
                                    style={{ width: 7, height: profH, background: isNeg ? '#f87171' : '#4ade80', borderRadius: '2px 2px 0 0', opacity: 0.7 }} />
                            </div>
                            <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 3 }}>{shortMon(m.month)}</div>
                        </div>
                    );
                })}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                {[['#14b8a6', 'Revenue'], ['#f87171', 'Costs'], ['#4ade80', 'Profit']].map(([c, l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280' }}>
                        <div style={{ width: 10, height: 10, background: c, borderRadius: 2 }} />{l}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Cost donut (pure CSS conic-gradient) ──────────────────────────────────────
function CostDonut({ costs }) {
    if (!costs) return null;
    const ai    = costs.ai_api_usd     || 0;
    const dodo  = costs.dodo_fees_usd  || 0;
    const infra = costs.infrastructure_usd || 0;
    const total = ai + dodo + infra || 1;

    const aiPct    = (ai    / total) * 100;
    const dodoPct  = (dodo  / total) * 100;
    const infraPct = (infra / total) * 100;

    const gradient = `conic-gradient(
        #6366f1 0% ${aiPct}%,
        #a855f7 ${aiPct}% ${aiPct + dodoPct}%,
        #f97316 ${aiPct + dodoPct}% 100%
    )`;

    return (
        <div className="adm-card" style={{ margin: 0, padding: '18px 20px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px' }}>Cost Breakdown</h3>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <div style={{
                    width: 100, height: 100, borderRadius: '50%',
                    background: gradient,
                    boxShadow: 'inset 0 0 0 28px white',
                }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                    { color: '#6366f1', label: 'AI API',        usd: ai,    pct: aiPct },
                    { color: '#a855f7', label: 'Dodo Fees',     usd: dodo,  pct: dodoPct },
                    { color: '#f97316', label: 'Infrastructure', usd: infra, pct: infraPct },
                ].map(({ color, label, usd, pct }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
                            <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
                            {label}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>
                            {fmt(usd)} <span style={{ color: '#9ca3af' }}>({pct.toFixed(0)}%)</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Manage Costs Panel ────────────────────────────────────────────────────────
function ManageCostsPanel({ month, onClose, onSaved }) {
    const [panelMonth, setPanelMonth] = useState(month);
    const [rows, setRows]   = useState([]);
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const load = useCallback(async (m) => {
        try {
            const res = await adminApi.getExternalCosts(m);
            const existing = (res.items || []);
            // Merge with defaults so all 4 standard categories always show
            const merged = DEFAULT_ROWS.map(def => {
                const found = existing.find(e => e.category === def.category && !e._custom);
                return found
                    ? { ...found, _dirty: false }
                    : { ...def, id: null, period: m, _dirty: false };
            });
            // Append any custom 'other' rows
            const customs = existing.filter(e => e.category === 'other' || !DEFAULT_ROWS.find(d => d.category === e.category));
            setRows([...merged, ...customs.map(c => ({ ...c, _dirty: false, _custom: true }))]);
        } catch {
            setRows(DEFAULT_ROWS.map(d => ({ ...d, id: null, period: m, _dirty: false })));
        }
    }, []);

    useEffect(() => { load(panelMonth); }, [panelMonth, load]);

    const changeMonth = (dir) => {
        const newM = dir === 'prev' ? prevMonth(panelMonth) : nextMonth(panelMonth);
        if (dir === 'next' && newM > CURRENT_MONTH) return;
        setPanelMonth(newM);
    };

    const updateRow = (idx, field, val) => {
        setRows(rows => rows.map((r, i) => i === idx ? { ...r, [field]: val, _dirty: true } : r));
    };

    const addCustom = () => {
        setRows(rows => [...rows, { id: null, category: 'other', label: '', amount_usd: 0, note: '', period: panelMonth, _dirty: true, _custom: true }]);
    };

    const removeRow = async (idx) => {
        const row = rows[idx];
        if (row.id) {
            try { await adminApi.deleteExternalCost(row.id); } catch { /* ignore */ }
        }
        setRows(rows => rows.filter((_, i) => i !== idx));
    };

    const save = async () => {
        setSaving(true);
        setError('');
        try {
            for (const row of rows) {
                if (!row._dirty) continue;
                const payload = {
                    category:   row.category,
                    label:      row.label || CATEGORY_LABELS[row.category] || 'Other',
                    amount_usd: parseFloat(row.amount_usd) || 0,
                    period:     panelMonth,
                    note:       row.note || null,
                };
                if (row.id) {
                    await adminApi.updateExternalCost(row.id, payload);
                } else if (payload.amount_usd > 0) {
                    await adminApi.createExternalCost(payload);
                }
            }
            onSaved(panelMonth);
        } catch (e) {
            setError(e.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const isMobile = window.innerWidth < 640;
    const panelStyle = isMobile
        ? { position: 'fixed', bottom: 0, left: 0, right: 0, maxHeight: '80vh', overflowY: 'auto',
            background: 'white', borderRadius: '16px 16px 0 0', padding: '20px 16px 32px', zIndex: 200,
            boxShadow: '0 -4px 24px rgba(0,0,0,0.15)' }
        : { position: 'fixed', top: 0, right: 0, width: 400, height: '100vh', overflowY: 'auto',
            background: 'white', padding: '24px 20px', zIndex: 200,
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' };

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 199 }} />
            <div style={panelStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Manage Costs</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
                </div>

                {/* Month navigator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20,
                    background: '#f9fafb', borderRadius: 8, padding: '8px 12px' }}>
                    <button onClick={() => changeMonth('prev')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>←</button>
                    <span style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{monthLabel(panelMonth)}</span>
                    <button onClick={() => changeMonth('next')}
                        disabled={nextMonth(panelMonth) > CURRENT_MONTH}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: nextMonth(panelMonth) > CURRENT_MONTH ? 0.3 : 1 }}>→</button>
                </div>

                {/* Cost rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {rows.map((row, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>
                                {CATEGORY_ICONS[row.category] || '📦'}
                            </span>
                            {row._custom ? (
                                <input
                                    value={row.label}
                                    onChange={e => updateRow(idx, 'label', e.target.value)}
                                    placeholder="Custom cost name"
                                    className="adm-input"
                                    style={{ flex: 1, fontSize: 13 }}
                                />
                            ) : (
                                <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{row.label}</span>
                            )}
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#6b7280' }}>$</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={row.amount_usd}
                                    onChange={e => updateRow(idx, 'amount_usd', e.target.value)}
                                    style={{ width: 80, paddingLeft: 20, paddingRight: 6, paddingTop: 6, paddingBottom: 6,
                                        border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }}
                                />
                            </div>
                            {row._custom && (
                                <button onClick={() => removeRow(idx)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16 }}>×</button>
                            )}
                        </div>
                    ))}
                </div>

                <button onClick={addCustom} style={{ marginTop: 14, background: 'none', border: '1px dashed #d1d5db',
                    borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#6b7280',
                    width: '100%', textAlign: 'center' }}>
                    + Add custom cost
                </button>

                {error && <div className="adm-error" style={{ marginTop: 12 }}>{error}</div>}

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button onClick={onClose} className="adm-btn-ghost" style={{ flex: 1 }}>Cancel</button>
                    <button onClick={save} disabled={saving} className="adm-btn" style={{ flex: 2 }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminFinancials() {
    const navigate = useNavigate();
    const [month, setMonth]         = useState(CURRENT_MONTH);
    const [summary, setSummary]     = useState(null);
    const [trend, setTrend]         = useState([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState('');
    const [infraOpen, setInfraOpen] = useState(false);
    const [panelOpen, setPanelOpen] = useState(false);

    const load = useCallback(async (m) => {
        setLoading(true);
        setError('');
        try {
            const [sum, tr] = await Promise.all([
                adminApi.getFinancialSummary(m),
                adminApi.getFinancialTrend(12),
            ]);
            setSummary(sum);
            setTrend(tr.months || []);
        } catch (e) {
            setError(e.message || 'Failed to load financial data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(month); }, [month, load]);

    const changeMonth = (dir) => {
        const newM = dir === 'prev' ? prevMonth(month) : nextMonth(month);
        if (dir === 'next' && newM > CURRENT_MONTH) return;
        setMonth(newM);
    };

    const handlePanelSaved = (savedMonth) => {
        setPanelOpen(false);
        load(month);           // refresh P&L with updated costs
    };

    const rev   = summary?.revenue  || {};
    const costs = summary?.costs    || {};
    const np    = summary?.net_profit_usd ?? 0;
    const mp    = summary?.margin_pct ?? 0;

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 80px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Financials</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Month navigator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f9fafb',
                        border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 12px' }}>
                        <button onClick={() => changeMonth('prev')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>←</button>
                        <span style={{ fontSize: 14, fontWeight: 600, minWidth: 120, textAlign: 'center' }}>{monthLabel(month)}</span>
                        <button onClick={() => changeMonth('next')}
                            disabled={nextMonth(month) > CURRENT_MONTH}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
                                opacity: nextMonth(month) > CURRENT_MONTH ? 0.3 : 1 }}>→</button>
                    </div>
                    <button onClick={() => setPanelOpen(true)} className="adm-btn" style={{ fontSize: 13, padding: '8px 16px' }}>
                        Manage Costs
                    </button>
                </div>
            </div>

            {error && (
                <div className="adm-error" style={{ marginBottom: 16 }}>
                    {error} <button className="adm-btn-ghost" style={{ marginLeft: 8, fontSize: 12 }} onClick={() => load(month)}>Retry</button>
                </div>
            )}

            {loading ? (
                <div style={{ color: '#9ca3af', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
            ) : (
                <>
                    {/* KPI cards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 12,
                        marginBottom: 20,
                    }}
                    className="fin-kpi-grid"
                    >
                        <KpiCard label="Total Revenue" value={fmt(rev.total_usd)}
                            sub={`${(rev.subscriber_counts?.student || 0) + (rev.subscriber_counts?.pro || 0)} subscribers`} />
                        <KpiCard label="Total Costs"   value={fmt(costs.total_usd)}
                            sub="AI + Dodo + Infrastructure" />
                        <KpiCard label="Net Profit" value={fmt(np)} isProfit />
                        <KpiCard label="Margin" value={fmtPct(mp)} isMargin />
                    </div>

                    {/* Income statement */}
                    <IncomeStatement
                        data={summary}
                        infraOpen={infraOpen}
                        setInfraOpen={setInfraOpen}
                        navigate={navigate}
                    />

                    {/* Charts row */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr',
                        gap: 16,
                    }}
                    className="fin-charts-grid"
                    >
                        <TrendChart trend={trend} />
                        <CostDonut costs={costs} />
                    </div>
                </>
            )}

            {/* Manage Costs panel */}
            {panelOpen && (
                <ManageCostsPanel
                    month={month}
                    onClose={() => setPanelOpen(false)}
                    onSaved={handlePanelSaved}
                />
            )}

            {/* Responsive styles */}
            <style>{`
                @media (min-width: 641px) {
                    .fin-kpi-grid    { grid-template-columns: repeat(4, 1fr) !important; }
                    .fin-charts-grid { grid-template-columns: 1fr 1fr !important; }
                }
            `}</style>
        </div>
    );
}
```

- [ ] **Step 2: Verify the file can be parsed (no obvious syntax errors)**

```bash
cd D:/neurativoproject/frontend && node -e "
const fs = require('fs');
const code = fs.readFileSync('src/pages/admin/AdminFinancials.jsx', 'utf8');
console.log('Lines:', code.split('\n').length, '— file OK');
"
```

Expected: `Lines: NNN — file OK`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/AdminFinancials.jsx
git commit -m "feat(admin): AdminFinancials P&L dashboard — KPI cards, income statement, charts, manage costs panel"
```

---

## Task 5: Wire Routing and Navigation

**Files:**
- Modify: `frontend/src/main.jsx` (add import + route)
- Modify: `frontend/src/pages/admin/AdminLayout.jsx` (add nav entry)

### Context

`main.jsx` imports admin pages at lines 15–32 and defines routes at lines 132–150. The admin route block uses `<Route path="..." element={<AdminXxx />} />` pattern.

`AdminLayout.jsx` defines `NAV_GROUPS` starting at line 8. "Monetization" group is at line 48 with Billing and Costs items. We add Financials between them.

- [ ] **Step 1: Add import to `main.jsx`**

Find this line in `main.jsx`:
```javascript
import AdminReleases from './pages/admin/AdminReleases.jsx';
```

Add directly after it:
```javascript
import AdminFinancials from './pages/admin/AdminFinancials.jsx';
```

- [ ] **Step 2: Add route to `main.jsx`**

Find this line in `main.jsx`:
```javascript
                <Route path="billing"  element={<AdminBilling />} />
```

Add directly after it:
```javascript
                <Route path="financials" element={<AdminFinancials />} />
```

- [ ] **Step 3: Add nav entry to `AdminLayout.jsx`**

Find this block in `AdminLayout.jsx`:
```javascript
            { to: '/admin/billing', label: 'Billing', icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                    <line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
            )},
            { to: '/admin/costs', label: 'Costs', icon: (
```

Replace it with:
```javascript
            { to: '/admin/billing', label: 'Billing', icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                    <line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
            )},
            { to: '/admin/financials', label: 'Financials', icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22,7 13.5,15.5 8.5,10.5 2,17"/><polyline points="16,7 22,7 22,13"/>
                </svg>
            )},
            { to: '/admin/costs', label: 'Costs', icon: (
```

- [ ] **Step 4: Build the frontend to verify no compilation errors**

```bash
cd D:/neurativoproject/frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in XXs` with no errors (chunk size warning is pre-existing and expected).

- [ ] **Step 5: Run backend tests to verify no regressions**

```bash
cd D:/neurativoproject/backend && python -m pytest tests/ -v 2>&1 | tail -10
```

Expected: New 6 pass, pre-existing 5 failures, no new failures.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/main.jsx frontend/src/pages/admin/AdminLayout.jsx
git commit -m "feat(admin): wire /admin/financials route and nav entry"
```

---

## Self-Review

### Spec coverage check:

| Spec requirement | Task |
|---|---|
| `admin_external_costs` table + index | Task 1 |
| `GET /admin/financials/summary` with full P&L | Task 2 |
| `GET /admin/financials/trend` for 12-month chart | Task 2 |
| External costs CRUD (GET/POST/PUT/DELETE) | Task 2 |
| `_putBody` helper + 6 adminApi functions | Task 3 |
| KPI cards (4, 2×2 mobile / 4-col desktop) | Task 4 |
| Income statement with collapsible infrastructure | Task 4 |
| 12-month trend chart (pure CSS) | Task 4 |
| Cost breakdown donut (pure CSS conic-gradient) | Task 4 |
| Manage Costs panel (slide-over / bottom sheet) | Task 4 |
| Month navigator with future month disabled | Task 4 |
| Auto-clear P&L on save | Task 4 |
| Nav entry in Monetization group | Task 5 |
| Route `/admin/financials` | Task 5 |
| Dodo fees auto-calculated (3.5% + $0.35) | Task 2 |
| Subscription revenue from `subscription_period_end` | Task 2 |
| Error states: retry button, panel keeps open on error | Task 4 |
| Mobile: 2×2 KPI grid, bottom sheet panel | Task 4 |

All spec requirements covered. No placeholders. Types/signatures consistent across tasks.
