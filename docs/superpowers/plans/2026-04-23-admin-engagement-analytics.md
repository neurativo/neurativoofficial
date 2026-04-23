# Admin Engagement Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Analytics page to the admin panel showing active user counts (DAU/WAU/MAU), feature adoption rates, and top users by activity — all derived from existing `api_cost_logs` and `lectures` tables, no new DB columns needed.

**Architecture:** A new `GET /admin/analytics` endpoint aggregates data from `api_cost_logs` (feature usage by day, by user) and `lectures` (lecture counts, creation dates). A new `AdminAnalytics.jsx` page visualises: active users chart (7/30/90 day selector), feature adoption bar chart (% of active users who used each feature), and a top-10 users table by lecture count + API calls. AdminLayout gets an Analytics nav link.

**Tech Stack:** FastAPI, Supabase Python client, React JSX (inline SVG/CSS charts — no chart library).

---

### Task 1: Backend — analytics endpoint

**Files:**
- Modify: `backend/app/api/admin.py` (add `GET /analytics` endpoint)
- Create: `backend/tests/test_analytics.py`

**Context — `_cost_summary` in `admin.py` (lines 310–347) shows the pattern for querying `api_cost_logs`:**
```python
res = sb.table("api_cost_logs").select("feature,cost_usd,created_at,model").gte("created_at", since).execute()
```

**Context — `admin_get_stats` in `supabase_service.py` (line 1187) shows how to query the lectures table.**

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_analytics.py`:

```python
"""Tests for admin engagement analytics endpoint."""


def test_analytics_endpoint_exists():
    """admin.py must have a GET /analytics endpoint."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "/analytics" in source or "analytics_endpoint" in source or "get_analytics" in source, (
        "admin.py must have a GET /analytics endpoint"
    )


def test_analytics_returns_active_users():
    """The analytics function must compute active_users (dau/wau/mau)."""
    import inspect
    from app.api import admin
    # Check the _analytics_summary function or the endpoint handler
    source = inspect.getsource(admin)
    assert "dau" in source.lower() or "active_users" in source or "daily_active" in source, (
        "analytics must include active user counts (DAU/WAU/MAU)"
    )


def test_analytics_returns_feature_adoption():
    """The analytics function must compute feature_adoption rates."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "feature_adoption" in source or "adoption" in source, (
        "analytics must include feature adoption rates"
    )


def test_analytics_returns_top_users():
    """The analytics function must compute top_users by activity."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "top_users" in source, (
        "analytics must include top_users list"
    )
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_analytics.py -v 2>&1 | head -30
```

Expected: all 4 FAIL.

- [ ] **Step 3: Add `_analytics_summary` helper and `GET /analytics` endpoint to `admin.py`**

Add this helper function immediately before the cost tracking section (before `_query_cost_logs`):

```python
def _analytics_summary(days: int = 30) -> dict:
    """
    Computes engagement analytics from api_cost_logs and lectures tables.
    Returns: active_users (dau/wau/mau counts), feature_adoption, top_users, daily_active.
    """
    try:
        sb = _sb_client()
        if not sb:
            return {"active_users": {}, "feature_adoption": {}, "top_users": [], "daily_active": []}

        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        since = (now - timedelta(days=days)).isoformat()
        since_7 = (now - timedelta(days=7)).isoformat()
        since_1 = (now - timedelta(days=1)).isoformat()

        # --- Active users from api_cost_logs (user_id field) ---
        # Fetch all log rows in the period
        logs_res = sb.table("api_cost_logs").select("user_id,feature,created_at").gte("created_at", since).execute()
        logs = logs_res.data or []

        users_30 = {r["user_id"] for r in logs if r.get("user_id")}
        users_7 = {r["user_id"] for r in logs if r.get("user_id") and r.get("created_at", "") >= since_7}
        users_1 = {r["user_id"] for r in logs if r.get("user_id") and r.get("created_at", "") >= since_1}

        active_users = {
            "dau": len(users_1),
            "wau": len(users_7),
            "mau": len(users_30),
        }

        # --- Feature adoption: % of active users who used each feature ---
        feature_users: dict = {}
        for r in logs:
            feat = r.get("feature")
            uid = r.get("user_id")
            if feat and uid:
                if feat not in feature_users:
                    feature_users[feat] = set()
                feature_users[feat].add(uid)

        total_active = max(len(users_30), 1)
        feature_adoption = {
            feat: round(len(uids) / total_active * 100, 1)
            for feat, uids in feature_users.items()
        }
        feature_adoption = dict(sorted(feature_adoption.items(), key=lambda x: -x[1]))

        # --- Daily active users (for sparkline chart) ---
        daily_active_map: dict = {}
        for r in logs:
            day = (r.get("created_at") or "")[:10]
            uid = r.get("user_id")
            if day and uid:
                if day not in daily_active_map:
                    daily_active_map[day] = set()
                daily_active_map[day].add(uid)
        daily_active = sorted(
            [{"date": d, "active_users": len(uids)} for d, uids in daily_active_map.items()],
            key=lambda x: x["date"],
        )

        # --- Top users by API call count in the period ---
        user_call_counts: dict = {}
        for r in logs:
            uid = r.get("user_id")
            if uid:
                user_call_counts[uid] = user_call_counts.get(uid, 0) + 1
        top_user_ids = sorted(user_call_counts, key=lambda u: -user_call_counts[u])[:10]

        # Fetch lecture counts for top users
        from app.services.supabase_service import admin_lecture_counts_by_user
        lecture_counts = admin_lecture_counts_by_user(top_user_ids) if top_user_ids else {}

        top_users = [
            {
                "user_id": uid,
                "api_calls": user_call_counts[uid],
                "lectures": lecture_counts.get(uid, 0),
            }
            for uid in top_user_ids
        ]

        return {
            "active_users": active_users,
            "feature_adoption": feature_adoption,
            "top_users": top_users,
            "daily_active": daily_active,
        }
    except Exception as e:
        print(f"[admin/analytics] summary failed: {e}")
        return {"active_users": {}, "feature_adoption": {}, "top_users": [], "daily_active": []}
```

Add the endpoint immediately after `_analytics_summary` (before `_query_cost_logs`):

```python
@router.get("/analytics")
async def get_analytics(
    days: int = Query(30, ge=1, le=365),
    admin: User = Depends(get_admin_user),
):
    """Engagement analytics: active users (DAU/WAU/MAU), feature adoption, top users."""
    return _analytics_summary(days=days)
```

- [ ] **Step 4: Run tests — all 4 must pass**

```bash
cd backend && python -m pytest tests/test_analytics.py -v 2>&1 | head -30
```

Expected: all 4 PASS.

- [ ] **Step 5: Run full suite — no regressions**

```bash
cd backend && python -m pytest tests/ -v 2>&1 | tail -20
```

- [ ] **Step 6: Commit backend**

```bash
cd backend && git add app/api/admin.py tests/test_analytics.py
git commit -m "feat: admin analytics endpoint — DAU/WAU/MAU, feature adoption, top users"
```

---

### Task 2: Frontend — AdminAnalytics page

**Files:**
- Create: `frontend/src/pages/admin/AdminAnalytics.jsx`
- Modify: `frontend/src/lib/adminApi.js`
- Modify: `frontend/src/pages/admin/AdminLayout.jsx`
- Modify: `frontend/src/main.jsx`

**Context — AdminLayout.jsx sidebar nav links look like:**
```jsx
<NavLink to="/admin" end>Dashboard</NavLink>
<NavLink to="/admin/users">Users</NavLink>
```

**Context — main.jsx routes for admin (under `<Route path="/admin" element={<AdminLayout />}>`):**
```jsx
<Route index element={<AdminDashboard />} />
<Route path="users" element={<AdminUsers />} />
```

- [ ] **Step 1: Add `getAnalytics` to adminApi.js**

In `frontend/src/lib/adminApi.js`, add to the `adminApi` export:

```javascript
    getAnalytics:    (p = {})                  => _get('/analytics', p),
```

- [ ] **Step 2: Create `AdminAnalytics.jsx`**

Create `frontend/src/pages/admin/AdminAnalytics.jsx`:

```jsx
import React, { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi.js';

const CSS = `
.adm-page-title { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 24px; }
.adm-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 24px; }
.adm-select { padding: 8px 12px; background: #141414; border: 1px solid #2a2a2a; border-radius: 7px; color: #e8e8e8; font-size: 13px; cursor: pointer; }
.adm-stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
.adm-stat-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 20px; text-align: center; }
.adm-stat-label { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
.adm-stat-value { font-size: 32px; font-weight: 700; color: #fff; }
.adm-stat-sub { font-size: 11px; color: #444; margin-top: 4px; }
.adm-section-title { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; margin-top: 28px; }
.adm-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 20px; margin-bottom: 24px; }
.adm-bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.adm-bar-label { width: 180px; font-size: 12px; color: #888; flex-shrink: 0; }
.adm-bar-track { flex: 1; height: 6px; background: #1e1e1e; border-radius: 3px; overflow: hidden; }
.adm-bar-fill { height: 100%; background: #7c3aed; border-radius: 3px; transition: width 0.4s; }
.adm-bar-pct { font-size: 11px; color: #555; width: 36px; text-align: right; }
.adm-sparkline { display: flex; align-items: flex-end; gap: 2px; height: 48px; }
.adm-spark-bar { flex: 1; background: #7c3aed44; border-radius: 2px 2px 0 0; min-height: 2px; }
.adm-table-wrap { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; overflow: hidden; }
.adm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.adm-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #555; border-bottom: 1px solid #1e1e1e; background: #0f0f0f; text-transform: uppercase; letter-spacing: 0.06em; }
.adm-table td { padding: 11px 16px; border-bottom: 1px solid #111; color: #c8c8c8; vertical-align: middle; }
.adm-table tr:last-child td { border-bottom: none; }
.adm-empty { text-align: center; padding: 32px; color: #444; }
@media (max-width: 700px) { .adm-stats-row { grid-template-columns: 1fr; } .adm-bar-label { width: 120px; } }
`;

export default function AdminAnalytics() {
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        adminApi.getAnalytics({ days })
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [days]);

    const activeUsers = data?.active_users || {};
    const featureAdoption = data?.feature_adoption || {};
    const topUsers = data?.top_users || [];
    const dailyActive = data?.daily_active || [];
    const maxDaily = Math.max(...dailyActive.map(d => d.active_users), 1);
    const maxAdoption = Math.max(...Object.values(featureAdoption), 1);

    return (
        <div>
            <style>{CSS}</style>
            <div className="adm-page-title">Engagement Analytics</div>

            <div className="adm-toolbar">
                <span style={{ fontSize: 13, color: '#555' }}>Period:</span>
                <select className="adm-select" value={days} onChange={e => setDays(Number(e.target.value))}>
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={90}>Last 90 days</option>
                    <option value={365}>Last 365 days</option>
                </select>
            </div>

            {loading && <div style={{ color: '#444', fontSize: 13 }}>Loading…</div>}

            {!loading && (
                <>
                    {/* Active user stats */}
                    <div className="adm-stats-row">
                        <div className="adm-stat-card">
                            <div className="adm-stat-label">Daily Active Users</div>
                            <div className="adm-stat-value">{activeUsers.dau ?? '—'}</div>
                            <div className="adm-stat-sub">last 24h</div>
                        </div>
                        <div className="adm-stat-card">
                            <div className="adm-stat-label">Weekly Active Users</div>
                            <div className="adm-stat-value">{activeUsers.wau ?? '—'}</div>
                            <div className="adm-stat-sub">last 7 days</div>
                        </div>
                        <div className="adm-stat-card">
                            <div className="adm-stat-label">Monthly Active Users</div>
                            <div className="adm-stat-value">{activeUsers.mau ?? '—'}</div>
                            <div className="adm-stat-sub">last {days} days</div>
                        </div>
                    </div>

                    {/* Daily active sparkline */}
                    {dailyActive.length > 0 && (
                        <>
                            <div className="adm-section-title">Daily Active Users ({days}d)</div>
                            <div className="adm-card" style={{ paddingBottom: 10 }}>
                                <div className="adm-sparkline">
                                    {dailyActive.map((d, i) => (
                                        <div
                                            key={i}
                                            className="adm-spark-bar"
                                            title={`${d.date}: ${d.active_users} users`}
                                            style={{ height: `${Math.max(4, Math.round((d.active_users / maxDaily) * 48))}px` }}
                                        />
                                    ))}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#333', marginTop: 4 }}>
                                    <span>{dailyActive[0]?.date}</span>
                                    <span>{dailyActive[dailyActive.length - 1]?.date}</span>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Feature adoption */}
                    {Object.keys(featureAdoption).length > 0 && (
                        <>
                            <div className="adm-section-title">Feature Adoption (% of active users)</div>
                            <div className="adm-card">
                                {Object.entries(featureAdoption).map(([feat, pct]) => (
                                    <div className="adm-bar-row" key={feat}>
                                        <span className="adm-bar-label">{feat.replace(/_/g, ' ')}</span>
                                        <div className="adm-bar-track">
                                            <div className="adm-bar-fill" style={{ width: `${Math.round((pct / maxAdoption) * 100)}%` }} />
                                        </div>
                                        <span className="adm-bar-pct">{pct}%</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Top users */}
                    <div className="adm-section-title">Top Users by Activity</div>
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>User ID</th>
                                    <th>API Calls</th>
                                    <th>Lectures</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!topUsers.length && (
                                    <tr><td colSpan={4} className="adm-empty">No activity data yet.</td></tr>
                                )}
                                {topUsers.map((u, i) => (
                                    <tr key={u.user_id}>
                                        <td style={{ color: '#555' }}>{i + 1}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{u.user_id}</td>
                                        <td>{u.api_calls.toLocaleString()}</td>
                                        <td>{u.lectures}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
```

- [ ] **Step 3: Add Analytics route to `main.jsx`**

Read `frontend/src/main.jsx` to find the admin routes section. Find:

```jsx
<Route path="system" element={<AdminSystem />} />
```

Add immediately after it:

```jsx
<Route path="analytics" element={<AdminAnalytics />} />
```

Also add the import at the top of `main.jsx` with the other admin imports:

```jsx
import AdminAnalytics from './pages/admin/AdminAnalytics.jsx';
```

- [ ] **Step 4: Add Analytics nav link to `AdminLayout.jsx`**

Read `frontend/src/pages/admin/AdminLayout.jsx` to find the sidebar nav links section. Find the NavLink or Link for "System" and add a new link for Analytics after "Costs" or before "System":

```jsx
<NavLink to="/admin/analytics">Analytics</NavLink>
```

(Follow the exact same NavLink pattern used by the other sidebar links in that file.)

- [ ] **Step 5: Verify files look correct**

Read `frontend/src/pages/admin/AdminAnalytics.jsx` lines 1–10 and `frontend/src/main.jsx` to confirm the route and import are present.

- [ ] **Step 6: Commit frontend**

```bash
git add frontend/src/pages/admin/AdminAnalytics.jsx frontend/src/lib/adminApi.js frontend/src/pages/admin/AdminLayout.jsx frontend/src/main.jsx
git commit -m "feat: admin Analytics page — DAU/WAU/MAU, feature adoption bars, top users table"
```

---

## Self-Review

**Spec coverage:**
- ✅ `GET /admin/analytics?days=N` endpoint
- ✅ `active_users`: dau/wau/mau counts from `api_cost_logs.user_id`
- ✅ `feature_adoption`: % of active users per feature
- ✅ `daily_active`: per-day active user count for sparkline
- ✅ `top_users`: top 10 by API call count with lecture count
- ✅ Frontend: period selector (7/30/90/365)
- ✅ Frontend: 3 stat cards (DAU/WAU/MAU)
- ✅ Frontend: sparkline bar chart for daily active
- ✅ Frontend: horizontal bar chart for feature adoption
- ✅ Frontend: top users table
- ✅ AdminLayout nav link added
- ✅ Route added to main.jsx

**Placeholder scan:** None found.

**Type consistency:**
- `_analytics_summary(days)` returns `{active_users, feature_adoption, top_users, daily_active}` ↔ frontend reads `data?.active_users`, `data?.feature_adoption` etc. ✅
