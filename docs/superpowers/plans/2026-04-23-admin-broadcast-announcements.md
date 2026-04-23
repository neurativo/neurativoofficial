# Admin Broadcast Announcements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins create in-app announcement banners (info/warning/maintenance) that appear on the user Dashboard and can be dismissed per-session. Admins can create, expire, and delete announcements from a new AdminAnnouncements page.

**Architecture:** A `announcements` Supabase table stores active banners (text, type, expires_at). `GET /api/v1/announcements` is a public (authenticated) endpoint that returns non-expired announcements. Admin routes `POST /admin/announcements`, `DELETE /admin/announcements/{id}` manage them. Dashboard.jsx fetches on mount and shows a dismissible banner. A new `AdminAnnouncements.jsx` page lists and creates announcements.

**Tech Stack:** FastAPI, Supabase Python client, React JSX, adminApi.js, existing `api.js` (user-facing).

---

### Task 1: Backend — announcements table + endpoints

**Files:**
- Modify: `backend/app/services/supabase_service.py` (add `get_announcements`, `create_announcement`, `delete_announcement`)
- Modify: `backend/app/api/admin.py` (add admin announcement endpoints)
- Modify: `backend/app/api/endpoints.py` (add `GET /announcements` user endpoint)
- Create: `backend/tests/test_announcements.py`

**Context — `set_user_plan` upsert pattern in `supabase_service.py` (lines 1169–1180).**

**Context — a typical user endpoint in `endpoints.py` uses `Depends(get_current_user)` (or `get_active_user` after suspension plan is implemented).**

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_announcements.py`:

```python
"""Tests for broadcast announcements feature."""


def test_get_announcements_exists():
    """supabase_service must export get_announcements()."""
    from app.services import supabase_service
    assert hasattr(supabase_service, "get_announcements"), (
        "supabase_service must have get_announcements function"
    )


def test_create_announcement_exists():
    """supabase_service must export create_announcement(text, type, expires_at)."""
    import inspect
    from app.services import supabase_service
    assert hasattr(supabase_service, "create_announcement"), (
        "supabase_service must have create_announcement function"
    )
    sig = inspect.signature(supabase_service.create_announcement)
    assert "text" in sig.parameters
    assert "ann_type" in sig.parameters


def test_delete_announcement_exists():
    """supabase_service must export delete_announcement(announcement_id)."""
    import inspect
    from app.services import supabase_service
    assert hasattr(supabase_service, "delete_announcement"), (
        "supabase_service must have delete_announcement function"
    )
    sig = inspect.signature(supabase_service.delete_announcement)
    assert "announcement_id" in sig.parameters


def test_admin_announcement_endpoints_exist():
    """admin.py must have POST and DELETE /announcements endpoints."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "announcements" in source, (
        "admin.py must have announcement management endpoints"
    )


def test_user_announcements_endpoint_exists():
    """endpoints.py must have GET /announcements endpoint."""
    import inspect
    from app.api import endpoints
    source = inspect.getsource(endpoints)
    assert "announcements" in source, (
        "endpoints.py must have GET /announcements endpoint returning active announcements"
    )
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_announcements.py -v 2>&1 | head -30
```

Expected: all 5 FAIL.

- [ ] **Step 3: Create the `announcements` Supabase table**

Run in Supabase SQL editor:

```sql
create table if not exists announcements (
    id         bigserial primary key,
    text       text        not null,
    ann_type   text        not null default 'info',  -- 'info' | 'warning' | 'maintenance'
    expires_at timestamptz,                           -- null = never expires
    created_at timestamptz not null default now(),
    created_by text        not null default ''
);

create index if not exists announcements_expires_idx on announcements (expires_at);
```

- [ ] **Step 4: Add `get_announcements`, `create_announcement`, `delete_announcement` to `supabase_service.py`**

Add at the end of the ADMIN QUERIES section:

```python
def get_announcements() -> list:
    """
    Returns all non-expired announcements sorted by created_at DESC.
    Includes announcements with expires_at = null (permanent) and those not yet expired.
    """
    if not supabase:
        return []
    try:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        # Fetch rows where expires_at is null OR expires_at >= now
        res = supabase.table("announcements").select("*").or_(
            f"expires_at.is.null,expires_at.gte.{now}"
        ).order("created_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        print(f"[announcements] get error (non-fatal): {e}")
        return []


def create_announcement(
    text: str,
    ann_type: str = "info",
    expires_at: str | None = None,
    created_by: str = "",
) -> dict:
    """Creates a new announcement row. Returns the inserted row."""
    if not supabase:
        raise Exception("Supabase not initialized")
    payload = {
        "text": text,
        "ann_type": ann_type,
        "created_by": created_by,
    }
    if expires_at:
        payload["expires_at"] = expires_at
    res = supabase.table("announcements").insert(payload).execute()
    if res.data:
        return res.data[0]
    raise Exception("Insert returned no data")


def delete_announcement(announcement_id: int) -> None:
    """Permanently deletes an announcement by ID."""
    if not supabase:
        raise Exception("Supabase not initialized")
    supabase.table("announcements").delete().eq("id", announcement_id).execute()
```

- [ ] **Step 5: Add admin announcement endpoints to `admin.py`**

**5a. Add import:**

```python
from app.services.supabase_service import (
    # ... existing imports ...
    get_announcements,
    create_announcement,
    delete_announcement,
)
```

**5b. Add request model** (after existing models):

```python
class CreateAnnouncementRequest(BaseModel):
    text: str
    ann_type: str = "info"      # "info" | "warning" | "maintenance"
    expires_at: Optional[str] = None   # ISO-8601 datetime string or null
```

**5c. Add endpoints** (add near the bottom, before the cost section):

```python
@router.get("/announcements")
async def list_announcements(admin: User = Depends(get_admin_user)):
    """List all active (non-expired) announcements."""
    return {"announcements": get_announcements()}


@router.post("/announcements")
async def create_announcement_endpoint(
    body: CreateAnnouncementRequest,
    admin: User = Depends(get_admin_user),
):
    """Create a new broadcast announcement."""
    if body.ann_type not in ("info", "warning", "maintenance"):
        raise HTTPException(status_code=400, detail="ann_type must be info, warning, or maintenance")
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")
    try:
        row = create_announcement(
            text=body.text.strip(),
            ann_type=body.ann_type,
            expires_at=body.expires_at,
            created_by=admin.id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create announcement: {e}")
    _audit(admin.id, "create_announcement", str(row.get("id", "")), f"type={body.ann_type}")
    return {"ok": True, "announcement": row}


@router.delete("/announcements/{announcement_id}")
async def delete_announcement_endpoint(
    announcement_id: int,
    admin: User = Depends(get_admin_user),
):
    """Permanently delete an announcement."""
    try:
        delete_announcement(announcement_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete announcement: {e}")
    _audit(admin.id, "delete_announcement", str(announcement_id))
    return {"ok": True, "deleted_id": announcement_id}
```

- [ ] **Step 6: Add `GET /announcements` to user `endpoints.py`**

In `backend/app/api/endpoints.py`, add the import for `get_announcements` at the top (in the supabase_service imports block):

```python
from app.services.supabase_service import (
    # ... existing imports ...
    get_announcements,
)
```

Then add this endpoint at the end of the file (or near similar lightweight endpoints):

```python
@router.get("/announcements")
def get_active_announcements(user=Depends(get_current_user)):
    """Returns active (non-expired) announcements for the authenticated user."""
    try:
        return {"announcements": get_announcements()}
    except Exception:
        return {"announcements": []}
```

- [ ] **Step 7: Run tests — all 5 must pass**

```bash
cd backend && python -m pytest tests/test_announcements.py -v 2>&1 | head -30
```

Expected: all 5 PASS.

- [ ] **Step 8: Run full suite — no regressions**

```bash
cd backend && python -m pytest tests/ -v 2>&1 | tail -20
```

- [ ] **Step 9: Commit backend**

```bash
cd backend && git add app/services/supabase_service.py app/api/admin.py app/api/endpoints.py tests/test_announcements.py
git commit -m "feat: broadcast announcements — Supabase table, admin CRUD endpoints, GET /announcements user endpoint"
```

---

### Task 2: Frontend — AdminAnnouncements page

**Files:**
- Create: `frontend/src/pages/admin/AdminAnnouncements.jsx`
- Modify: `frontend/src/lib/adminApi.js`
- Modify: `frontend/src/pages/admin/AdminLayout.jsx`
- Modify: `frontend/src/main.jsx`

- [ ] **Step 1: Add announcement methods to adminApi.js**

In `frontend/src/lib/adminApi.js`, add to the `adminApi` export:

```javascript
    listAnnouncements:   ()                     => _get('/announcements'),
    createAnnouncement:  (body)                 => {
        const token = _token();
        return token.then(t => axios.post(BASE + '/announcements', body, { headers: _headers(t) }).then(r => r.data));
    },
    deleteAnnouncement:  (id)                   => _delete(`/announcements/${id}`),
```

Note: `createAnnouncement` needs a proper POST with a JSON body. Use this pattern (axios.post):

```javascript
    createAnnouncement: async (body) => {
        const token = await _token();
        const res = await axios.post(BASE + '/announcements', body, { headers: _headers(token) });
        return res.data;
    },
```

- [ ] **Step 2: Create `AdminAnnouncements.jsx`**

Create `frontend/src/pages/admin/AdminAnnouncements.jsx`:

```jsx
import React, { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi.js';

const CSS = `
.adm-page-title { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 24px; }
.adm-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 20px; margin-bottom: 24px; }
.adm-card-title { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px; }
.adm-form-row { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.adm-label { font-size: 12px; color: #666; }
.adm-textarea { padding: 10px 12px; background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 7px; color: #e8e8e8; font-size: 13px; outline: none; resize: vertical; min-height: 72px; font-family: inherit; }
.adm-textarea:focus { border-color: #7c3aed; }
.adm-select { padding: 8px 12px; background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 7px; color: #e8e8e8; font-size: 13px; cursor: pointer; }
.adm-input { padding: 8px 12px; background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 7px; color: #e8e8e8; font-size: 13px; outline: none; }
.adm-input:focus { border-color: #7c3aed; }
.adm-btn-primary { background: #7c3aed; color: #fff; padding: 8px 18px; border-radius: 7px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; }
.adm-btn-primary:hover { background: #6d28d9; }
.adm-btn-primary:disabled { opacity: 0.5; cursor: default; }
.adm-form-result { font-size: 12px; color: #34d399; margin-top: 6px; }
.adm-table-wrap { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; overflow: hidden; }
.adm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.adm-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #555; border-bottom: 1px solid #1e1e1e; background: #0f0f0f; text-transform: uppercase; letter-spacing: 0.06em; }
.adm-table td { padding: 11px 16px; border-bottom: 1px solid #111; color: #c8c8c8; vertical-align: middle; }
.adm-table tr:last-child td { border-bottom: none; }
.adm-empty { text-align: center; padding: 32px; color: #444; }
.adm-type-info { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #0369a122; color: #38bdf8; }
.adm-type-warning { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #78350f22; color: #fbbf24; }
.adm-type-maintenance { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #7f1d1d22; color: #f87171; }
.adm-btn-danger-sm { background: #7f1d1d22; border: 1px solid #7f1d1d55; color: #f87171; padding: 4px 10px; border-radius: 5px; font-size: 11px; cursor: pointer; }
.adm-btn-danger-sm:hover { background: #7f1d1d44; }
`;

function TypeBadge({ type }) {
    return <span className={`adm-type-${type || 'info'}`}>{type || 'info'}</span>;
}

export default function AdminAnnouncements() {
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);

    // Form state
    const [text, setText] = useState('');
    const [annType, setAnnType] = useState('info');
    const [expiresAt, setExpiresAt] = useState('');
    const [creating, setCreating] = useState(false);
    const [createResult, setCreateResult] = useState('');

    function loadAnnouncements() {
        setLoading(true);
        adminApi.listAnnouncements()
            .then(r => setAnnouncements(r.announcements || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }

    useEffect(loadAnnouncements, []);

    async function handleCreate(e) {
        e.preventDefault();
        if (!text.trim()) return;
        setCreating(true);
        setCreateResult('');
        try {
            await adminApi.createAnnouncement({
                text: text.trim(),
                ann_type: annType,
                expires_at: expiresAt || null,
            });
            setCreateResult('✓ Announcement created');
            setText('');
            setAnnType('info');
            setExpiresAt('');
            loadAnnouncements();
        } catch {
            setCreateResult('✗ Failed to create');
        } finally {
            setCreating(false);
            setTimeout(() => setCreateResult(''), 3000);
        }
    }

    async function handleDelete(id) {
        try {
            await adminApi.deleteAnnouncement(id);
            setAnnouncements(prev => prev.filter(a => a.id !== id));
        } catch { /* silent */ }
    }

    return (
        <div>
            <style>{CSS}</style>
            <div className="adm-page-title">Broadcast Announcements</div>

            <div className="adm-card">
                <div className="adm-card-title">Create Announcement</div>
                <form onSubmit={handleCreate}>
                    <div className="adm-form-row">
                        <label className="adm-label">Message</label>
                        <textarea
                            className="adm-textarea"
                            placeholder="Scheduled maintenance on Friday at 3 PM UTC…"
                            value={text}
                            onChange={e => setText(e.target.value)}
                            maxLength={500}
                        />
                    </div>
                    <div className="adm-form-row">
                        <label className="adm-label">Type</label>
                        <select className="adm-select" value={annType} onChange={e => setAnnType(e.target.value)}>
                            <option value="info">Info (blue)</option>
                            <option value="warning">Warning (yellow)</option>
                            <option value="maintenance">Maintenance (red)</option>
                        </select>
                    </div>
                    <div className="adm-form-row">
                        <label className="adm-label">Expires at (optional — leave blank for permanent)</label>
                        <input
                            className="adm-input"
                            type="datetime-local"
                            value={expiresAt}
                            onChange={e => setExpiresAt(e.target.value)}
                            style={{ maxWidth: 260 }}
                        />
                    </div>
                    <button className="adm-btn-primary" type="submit" disabled={creating || !text.trim()}>
                        {creating ? 'Creating…' : 'Post Announcement'}
                    </button>
                    {createResult && <div className="adm-form-result">{createResult}</div>}
                </form>
            </div>

            <div className="adm-table-wrap">
                <table className="adm-table">
                    <thead>
                        <tr><th>Message</th><th>Type</th><th>Expires</th><th>Created</th><th></th></tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={5} className="adm-empty">Loading…</td></tr>}
                        {!loading && !announcements.length && (
                            <tr><td colSpan={5} className="adm-empty">No active announcements.</td></tr>
                        )}
                        {!loading && announcements.map(a => (
                            <tr key={a.id}>
                                <td style={{ maxWidth: 320 }}>{a.text}</td>
                                <td><TypeBadge type={a.ann_type} /></td>
                                <td style={{ color: '#555', fontSize: 12 }}>
                                    {a.expires_at
                                        ? new Date(a.expires_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                        : 'Never'}
                                </td>
                                <td style={{ color: '#555', fontSize: 12 }}>
                                    {new Date(a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric' })}
                                </td>
                                <td>
                                    <button className="adm-btn-danger-sm" onClick={() => handleDelete(a.id)}>Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Add route and nav link**

**In `frontend/src/main.jsx`**, add the import:

```jsx
import AdminAnnouncements from './pages/admin/AdminAnnouncements.jsx';
```

And the route (inside the admin routes block):

```jsx
<Route path="announcements" element={<AdminAnnouncements />} />
```

**In `frontend/src/pages/admin/AdminLayout.jsx`**, add the nav link following the existing NavLink pattern:

```jsx
<NavLink to="/admin/announcements">Announcements</NavLink>
```

- [ ] **Step 4: Commit frontend admin**

```bash
git add frontend/src/pages/admin/AdminAnnouncements.jsx frontend/src/lib/adminApi.js frontend/src/pages/admin/AdminLayout.jsx frontend/src/main.jsx
git commit -m "feat: AdminAnnouncements page — create/delete/list broadcast announcements"
```

---

### Task 3: Frontend — announcement banner in Dashboard.jsx

**Files:**
- Modify: `frontend/src/components/Dashboard.jsx`

**Context — Dashboard.jsx already imports `api` from `'../lib/api'` and has a `useEffect` for fetching lectures on mount.**

- [ ] **Step 1: Add announcement banner to Dashboard.jsx**

In `frontend/src/components/Dashboard.jsx`, add to the CSS string (find the existing `const CSS` or inline styles — Dashboard uses inline `<style>` in the component):

Read Dashboard.jsx lines 1–30 to find how CSS is injected. Then add these classes to the CSS constant:

```css
.db-announcement { display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; line-height: 1.5; }
.db-announcement-info { background: #0369a115; border: 1px solid #0369a133; color: #7dd3fc; }
.db-announcement-warning { background: #78350f15; border: 1px solid #78350f33; color: #fcd34d; }
.db-announcement-maintenance { background: #7f1d1d15; border: 1px solid #7f1d1d33; color: #fca5a5; }
.db-announcement-dismiss { margin-left: auto; cursor: pointer; background: none; border: none; color: inherit; opacity: 0.6; font-size: 16px; padding: 0 4px; line-height: 1; flex-shrink: 0; }
.db-announcement-dismiss:hover { opacity: 1; }
```

Add state after existing state declarations:

```javascript
const [announcements, setAnnouncements] = useState([]);
const [dismissedIds, setDismissedIds] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('dismissed_ann') || '[]'); } catch { return []; }
});
```

Add a `useEffect` to fetch announcements on mount (add alongside the existing lectures useEffect):

```javascript
useEffect(() => {
    api.get('/api/v1/announcements')
        .then(r => setAnnouncements(Array.isArray(r.data?.announcements) ? r.data.announcements : []))
        .catch(() => {});
}, []);
```

Add a dismiss handler:

```javascript
function dismissAnnouncement(id) {
    const next = [...dismissedIds, id];
    setDismissedIds(next);
    try { sessionStorage.setItem('dismissed_ann', JSON.stringify(next)); } catch {}
}
```

In the JSX return, add the announcements banner section at the very top of the main content area (before the lecture list or toolbar). Find the outer wrapper div and add immediately inside it:

```jsx
{announcements
    .filter(a => !dismissedIds.includes(a.id))
    .map(a => (
        <div key={a.id} className={`db-announcement db-announcement-${a.ann_type || 'info'}`}>
            <span>{a.text}</span>
            <button className="db-announcement-dismiss" onClick={() => dismissAnnouncement(a.id)} aria-label="Dismiss">×</button>
        </div>
    ))
}
```

- [ ] **Step 2: Verify**

Read `frontend/src/components/Dashboard.jsx` and confirm `dismissAnnouncement` function and `db-announcement` CSS class are present.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Dashboard.jsx
git commit -m "feat: show broadcast announcements banner in Dashboard — session-dismissible"
```

---

## Self-Review

**Spec coverage:**
- ✅ `announcements` Supabase table (SQL in plan)
- ✅ `get_announcements()` — filters expired rows
- ✅ `create_announcement(text, ann_type, expires_at, created_by)`
- ✅ `delete_announcement(id)`
- ✅ `GET /admin/announcements` — list active
- ✅ `POST /admin/announcements` — create with validation
- ✅ `DELETE /admin/announcements/{id}`
- ✅ `GET /api/v1/announcements` — user-facing, authenticated
- ✅ Audit log on create + delete
- ✅ AdminAnnouncements page: create form (text, type, expires_at) + list + delete
- ✅ AdminLayout nav link + main.jsx route
- ✅ Dashboard.jsx: fetches announcements, shows type-styled banners, session-dismissible

**Placeholder scan:** None found.

**Type consistency:**
- `create_announcement(ann_type=...)` ↔ `CreateAnnouncementRequest(ann_type=...)` ↔ frontend sends `{ ann_type: annType }` ✅
- `a.ann_type` in frontend matches `ann_type` column in DB and `adm-type-{ann_type}` CSS class ✅
- `dismissedIds` stored in `sessionStorage` — clears on tab close, intentional ✅
