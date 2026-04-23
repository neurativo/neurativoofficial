# Admin Persistent Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-memory audit log (lost on restart, capped at 100 entries) with a persistent Supabase table, and add pagination + action filtering to the AdminSystem audit UI.

**Architecture:** A new `audit_logs` Supabase table stores every admin action. `admin_write_audit()` in `supabase_service.py` writes rows non-fatally. `admin.py` replaces `_audit()` with calls to the new writer (keeps the in-memory deque as a fallback display buffer). A new `GET /admin/audit-log` endpoint returns paginated, filterable rows. AdminSystem.jsx gains pagination controls and an action filter.

**Tech Stack:** FastAPI, Supabase Python client, React JSX, adminApi.js.

---

### Task 1: Create Supabase `audit_logs` table + backend writer

**Files:**
- Modify: `backend/app/services/supabase_service.py` (add `admin_write_audit`, `admin_get_audit_log`)
- Modify: `backend/app/api/admin.py` (replace `_audit()`, add `/audit-log` endpoint)
- Create: `backend/tests/test_audit_log.py`

**Context — current `_audit()` in `admin.py` (lines 44–51):**
```python
def _audit(admin_id: str, action: str, target_id: str = "", detail: str = "") -> None:
    _audit_log.appendleft({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "admin_id": admin_id,
        "action": action,
        "target_id": target_id,
        "detail": detail,
    })
```

**Context — `set_user_plan` in `supabase_service.py` (lines 1169–1180) shows the upsert pattern:**
```python
def set_user_plan(user_id: str, plan_tier: str) -> None:
    if not supabase:
        raise Exception("Supabase not initialized")
    from datetime import datetime, timezone
    resp = supabase.table("user_plans").upsert(
        {"user_id": user_id, "plan_tier": plan_tier, "updated_at": datetime.now(timezone.utc).isoformat()},
        on_conflict="user_id"
    ).execute()
```

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_audit_log.py`:

```python
"""Tests for persistent admin audit log."""


def test_admin_write_audit_exists():
    """supabase_service must export admin_write_audit function."""
    import inspect
    from app.services import supabase_service
    assert hasattr(supabase_service, "admin_write_audit"), (
        "supabase_service must have admin_write_audit function"
    )
    sig = inspect.signature(supabase_service.admin_write_audit)
    assert "admin_id" in sig.parameters
    assert "action" in sig.parameters
    assert "target_id" in sig.parameters
    assert "detail" in sig.parameters


def test_admin_get_audit_log_exists():
    """supabase_service must export admin_get_audit_log function."""
    import inspect
    from app.services import supabase_service
    assert hasattr(supabase_service, "admin_get_audit_log"), (
        "supabase_service must have admin_get_audit_log function"
    )
    sig = inspect.signature(supabase_service.admin_get_audit_log)
    assert "page" in sig.parameters
    assert "page_size" in sig.parameters
    assert "action_filter" in sig.parameters


def test_admin_py_uses_supabase_writer():
    """admin.py _audit() must call admin_write_audit, not only appendleft."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "admin_write_audit" in source, (
        "admin.py must import and call admin_write_audit from supabase_service"
    )


def test_audit_log_endpoint_exists():
    """GET /admin/audit-log endpoint must exist in admin.py."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "audit-log" in source or "audit_log_endpoint" in source, (
        "admin.py must have a GET /audit-log endpoint"
    )
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_audit_log.py -v 2>&1 | head -30
```

Expected: all 4 FAIL.

- [ ] **Step 3: Create the `audit_logs` Supabase table**

Run this SQL in the Supabase SQL editor (Dashboard → SQL Editor):

```sql
create table if not exists audit_logs (
    id          bigserial primary key,
    timestamp   timestamptz not null default now(),
    admin_id    text        not null,
    action      text        not null,
    target_id   text        not null default '',
    detail      text        not null default ''
);

create index if not exists audit_logs_timestamp_idx on audit_logs (timestamp desc);
create index if not exists audit_logs_action_idx    on audit_logs (action);
```

- [ ] **Step 4: Add `admin_write_audit` and `admin_get_audit_log` to `supabase_service.py`**

Find the `# ADMIN QUERIES` section (around line 1183). Add these two functions immediately before `admin_get_stats`:

```python
def admin_write_audit(
    admin_id: str,
    action: str,
    target_id: str = "",
    detail: str = "",
) -> None:
    """Persists an admin action to the audit_logs Supabase table. Non-fatal."""
    if not supabase:
        return
    try:
        from datetime import datetime, timezone
        supabase.table("audit_logs").insert({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "admin_id": admin_id,
            "action": action,
            "target_id": target_id,
            "detail": detail,
        }).execute()
    except Exception as e:
        print(f"[audit] write failed (non-fatal): {e}")


def admin_get_audit_log(
    page: int = 1,
    page_size: int = 50,
    action_filter: str = "",
) -> dict:
    """
    Returns paginated audit log rows from Supabase.
    Falls back to empty list if table not found.
    """
    if not supabase:
        return {"logs": [], "total": 0}
    try:
        offset = (page - 1) * page_size
        q = supabase.table("audit_logs").select("*", count="exact").order("timestamp", desc=True)
        if action_filter:
            q = q.eq("action", action_filter)
        res = q.range(offset, offset + page_size - 1).execute()
        return {
            "logs": res.data or [],
            "total": res.count or 0,
            "page": page,
            "page_size": page_size,
        }
    except Exception as e:
        print(f"[audit] read failed: {e}")
        return {"logs": [], "total": 0, "page": page, "page_size": page_size}
```

- [ ] **Step 5: Update `admin.py` — replace `_audit()` and add endpoint**

**5a. Add import at the top of admin.py** (in the supabase_service import block, around line 21):

```python
from app.services.supabase_service import (
    admin_get_stats,
    admin_get_user_detail,
    admin_get_lecture_detail,
    admin_list_lectures,
    admin_list_sessions,
    set_user_plan,
    delete_user_account,
    delete_lecture,
    cleanup_old_chunks,
    get_user_plan,
    get_client as _sb_client,
    admin_write_audit,
    admin_get_audit_log,
)
```

**5b. Replace `_audit()` function (lines 44–51):**

```python
def _audit(admin_id: str, action: str, target_id: str = "", detail: str = "") -> None:
    """Write audit entry to Supabase (persistent) and in-memory buffer (fast display)."""
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "admin_id": admin_id,
        "action": action,
        "target_id": target_id,
        "detail": detail,
    }
    _audit_log.appendleft(entry)
    admin_write_audit(
        admin_id=admin_id,
        action=action,
        target_id=target_id,
        detail=detail,
    )
```

**5c. Add the `/audit-log` endpoint** immediately before the cost tracking section (before line 267):

```python
@router.get("/audit-log")
async def get_audit_log_endpoint(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action: str = Query(""),
    admin: User = Depends(get_admin_user),
):
    """Paginated admin audit log from Supabase."""
    return admin_get_audit_log(page=page, page_size=page_size, action_filter=action)
```

**5d. Update `GET /system`** to no longer embed the full audit log (it's now fetched separately):

Replace the `get_system` function body:

```python
@router.get("/system")
async def get_system(admin: User = Depends(get_admin_user)):
    """System info: plan limits config + recent audit entries."""
    recent = admin_get_audit_log(page=1, page_size=20)
    return {
        "plan_limits": PLAN_LIMITS,
        "audit_log": recent["logs"],
    }
```

- [ ] **Step 6: Run tests — all 4 must pass**

```bash
cd backend && python -m pytest tests/test_audit_log.py -v 2>&1 | head -30
```

Expected: all 4 PASS.

- [ ] **Step 7: Run full suite — no regressions**

```bash
cd backend && python -m pytest tests/ -v 2>&1 | tail -20
```

- [ ] **Step 8: Commit backend**

```bash
cd backend && git add app/services/supabase_service.py app/api/admin.py tests/test_audit_log.py
git commit -m "feat: persist admin audit log to Supabase audit_logs table"
```

---

### Task 2: Update AdminSystem.jsx — paginated, filterable audit log

**Files:**
- Modify: `frontend/src/lib/adminApi.js`
- Modify: `frontend/src/pages/admin/AdminSystem.jsx`

**Context — current adminApi.js exports (lines 41–56):**
```javascript
export const adminApi = {
    verify:          ()                        => _get('/verify'),
    getStats:        ()                        => _get('/stats'),
    // ... existing entries ...
    getSystem:       ()                        => _get('/system'),
    // ...
};
```

- [ ] **Step 1: Add `getAuditLog` to adminApi.js**

In `frontend/src/lib/adminApi.js`, add to the `adminApi` export object (after `getSystem`):

```javascript
    getAuditLog:     (p = {})                  => _get('/audit-log', p),
```

- [ ] **Step 2: Update AdminSystem.jsx**

Replace the full content of `frontend/src/pages/admin/AdminSystem.jsx` with:

```jsx
import React, { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi.js';

const CSS = `
.adm-page-title { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 24px; }
.adm-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
.adm-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 20px; }
.adm-card-title { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px; }
.adm-plan-row { display: flex; justify-content: space-between; align-items: baseline; padding: 10px 0; border-bottom: 1px solid #111; }
.adm-plan-row:last-child { border-bottom: none; }
.adm-plan-name { font-size: 13px; font-weight: 600; color: #e8e8e8; }
.adm-plan-pill { display: inline-block; padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; }
.adm-plan-free { background: #ffffff0f; color: #888; }
.adm-plan-student { background: #7c3aed22; color: #a78bfa; border: 1px solid #7c3aed44; }
.adm-plan-pro { background: #0369a122; color: #38bdf8; border: 1px solid #0369a144; }
.adm-limits-list { margin: 0; padding: 0; list-style: none; }
.adm-limits-list li { display: flex; justify-content: space-between; font-size: 12px; color: #888; padding: 5px 0; border-bottom: 1px solid #0d0d0d; }
.adm-limits-list li:last-child { border-bottom: none; }
.adm-limits-list .val { color: #c8c8c8; }
.adm-cleanup-row { display: flex; gap: 10px; align-items: center; }
.adm-input { padding: 8px 12px; background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 7px; color: #e8e8e8; font-size: 13px; outline: none; width: 80px; }
.adm-btn-primary { background: #7c3aed; color: #fff; padding: 8px 16px; border-radius: 7px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; }
.adm-btn-primary:hover { background: #6d28d9; }
.adm-btn-primary:disabled { opacity: 0.5; cursor: default; }
.adm-btn-ghost { background: transparent; border: 1px solid #2a2a2a; color: #888; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
.adm-btn-ghost:hover:not(:disabled) { border-color: #555; color: #e8e8e8; }
.adm-btn-ghost:disabled { opacity: 0.3; cursor: default; }
.adm-result { font-size: 12px; color: #888; }
.adm-section-title { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; margin-top: 28px; }
.adm-audit-wrap { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; overflow: hidden; }
.adm-audit-toolbar { display: flex; gap: 10px; align-items: center; padding: 12px 16px; border-bottom: 1px solid #1e1e1e; background: #0f0f0f; }
.adm-audit-select { padding: 6px 10px; background: #141414; border: 1px solid #2a2a2a; border-radius: 6px; color: #e8e8e8; font-size: 12px; cursor: pointer; }
.adm-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.adm-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #555; border-bottom: 1px solid #1e1e1e; background: #0f0f0f; text-transform: uppercase; letter-spacing: 0.06em; }
.adm-table td { padding: 10px 16px; border-bottom: 1px solid #111; color: #888; vertical-align: middle; }
.adm-table tr:last-child td { border-bottom: none; }
.adm-empty { text-align: center; padding: 24px; color: #444; }
.adm-action-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #1e1e1e; color: #888; }
.adm-action-delete { background: #7f1d1d22; color: #f87171; }
.adm-action-update { background: #7c3aed22; color: #a78bfa; }
.adm-action-cleanup { background: #065f4622; color: #34d399; }
.adm-action-suspend { background: #78350f22; color: #fbbf24; }
.adm-pagination { display: flex; align-items: center; gap: 10px; padding: 12px 16px; font-size: 12px; color: #555; border-top: 1px solid #1e1e1e; }
@media (max-width: 800px) { .adm-two-col { grid-template-columns: 1fr; } }
`;

function fmtLimit(v) {
    if (v === null || v === undefined) return '∞';
    if (typeof v === 'number' && v > 1000000) return `${(v / 1024 / 1024 / 1024).toFixed(1)} GB`;
    if (typeof v === 'number' && v >= 3600) return `${(v / 3600).toFixed(1)}h`;
    if (typeof v === 'number' && v >= 60) return `${Math.floor(v / 60)}m`;
    return String(v);
}

function actionClass(action) {
    if (action?.includes('delete')) return 'adm-action-badge adm-action-delete';
    if (action?.includes('update')) return 'adm-action-badge adm-action-update';
    if (action?.includes('cleanup')) return 'adm-action-badge adm-action-cleanup';
    if (action?.includes('suspend')) return 'adm-action-badge adm-action-suspend';
    return 'adm-action-badge';
}

const ACTION_OPTIONS = ['', 'delete_user', 'delete_lecture', 'update_plan', 'cleanup_chunks', 'suspend_user', 'unsuspend_user'];

export default function AdminSystem() {
    const [system, setSystem] = useState(null);
    const [cleanupDays, setCleanupDays] = useState(0);
    const [cleaning, setCleaning] = useState(false);
    const [cleanResult, setCleanResult] = useState('');

    // Audit log state
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditTotal, setAuditTotal] = useState(0);
    const [auditPage, setAuditPage] = useState(1);
    const [auditAction, setAuditAction] = useState('');
    const [auditLoading, setAuditLoading] = useState(false);
    const PAGE_SIZE = 50;

    useEffect(() => { adminApi.getSystem().then(setSystem); }, []);

    useEffect(() => {
        setAuditLoading(true);
        adminApi.getAuditLog({ page: auditPage, page_size: PAGE_SIZE, action: auditAction })
            .then(r => { setAuditLogs(r.logs || []); setAuditTotal(r.total || 0); })
            .catch(() => {})
            .finally(() => setAuditLoading(false));
    }, [auditPage, auditAction]);

    async function runCleanup() {
        setCleaning(true);
        setCleanResult('');
        try {
            const r = await adminApi.triggerCleanup(cleanupDays);
            setCleanResult(`✓ Deleted ${r.deleted_chunks ?? 0} chunks`);
            adminApi.getSystem().then(setSystem);
            // Refresh audit log to show cleanup entry
            adminApi.getAuditLog({ page: 1, page_size: PAGE_SIZE, action: auditAction })
                .then(r => { setAuditLogs(r.logs || []); setAuditTotal(r.total || 0); setAuditPage(1); });
        } catch {
            setCleanResult('Cleanup failed');
        } finally {
            setCleaning(false);
        }
    }

    const plans = system?.plan_limits || {};
    const totalPages = Math.ceil(auditTotal / PAGE_SIZE);

    return (
        <div>
            <style>{CSS}</style>
            <div className="adm-page-title">System</div>

            <div className="adm-two-col">
                {Object.entries(plans).map(([tier, limits]) => (
                    <div className="adm-card" key={tier}>
                        <div className="adm-card-title">
                            <span className={`adm-plan-pill adm-plan-${tier}`}>{tier}</span>
                            {' '}Plan Limits
                        </div>
                        <ul className="adm-limits-list">
                            <li><span>Live lectures / month</span><span className="val">{fmtLimit(limits.live_lectures_per_month)}</span></li>
                            <li><span>Max live duration</span><span className="val">{fmtLimit(limits.live_max_duration_seconds)}</span></li>
                            <li><span>Audio uploads / month</span><span className="val">{fmtLimit(limits.uploads_per_month)}</span></li>
                            <li><span>Max upload duration</span><span className="val">{fmtLimit(limits.upload_max_duration_seconds)}</span></li>
                            <li><span>Max upload size</span><span className="val">{fmtLimit(limits.upload_max_bytes)}</span></li>
                        </ul>
                    </div>
                ))}
            </div>

            <div className="adm-card" style={{ marginBottom: 28 }}>
                <div className="adm-card-title">Storage Cleanup</div>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>
                    Deletes raw <code style={{ fontFamily: 'monospace', fontSize: 12 }}>lecture_chunks</code> for
                    lectures that have a completed summary — chunks are never used again after summarisation finishes.
                    Set min age to 0 to clean all completed lectures, or enter a number to skip lectures newer than N days.
                </p>
                <div className="adm-cleanup-row">
                    <span style={{ fontSize: 13, color: '#666' }}>Min age</span>
                    <input className="adm-input" type="number" min="0" max="365"
                        value={cleanupDays} onChange={e => setCleanupDays(Number(e.target.value))} />
                    <span style={{ fontSize: 13, color: '#666' }}>days</span>
                    <button className="adm-btn-primary" onClick={runCleanup} disabled={cleaning}>
                        {cleaning ? 'Cleaning…' : 'Run Cleanup'}
                    </button>
                    {cleanResult && <span className="adm-result">{cleanResult}</span>}
                </div>
            </div>

            <div className="adm-section-title">
                Audit Log {auditTotal > 0 && <span style={{ color: '#444', fontWeight: 400 }}>— {auditTotal} entries</span>}
            </div>
            <div className="adm-audit-wrap">
                <div className="adm-audit-toolbar">
                    <span style={{ fontSize: 12, color: '#555' }}>Filter by action:</span>
                    <select className="adm-audit-select" value={auditAction}
                        onChange={e => { setAuditAction(e.target.value); setAuditPage(1); }}>
                        {ACTION_OPTIONS.map(a => (
                            <option key={a} value={a}>{a || 'All actions'}</option>
                        ))}
                    </select>
                </div>
                <table className="adm-table">
                    <thead>
                        <tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th><th>Detail</th></tr>
                    </thead>
                    <tbody>
                        {auditLoading && (
                            <tr><td colSpan={5} className="adm-empty">Loading…</td></tr>
                        )}
                        {!auditLoading && !auditLogs.length && (
                            <tr><td colSpan={5} className="adm-empty">No actions recorded yet.</td></tr>
                        )}
                        {!auditLoading && auditLogs.map((entry, i) => (
                            <tr key={entry.id ?? i}>
                                <td style={{ whiteSpace: 'nowrap' }}>
                                    {new Date(entry.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{entry.admin_id?.slice(0, 14)}…</td>
                                <td><span className={actionClass(entry.action)}>{entry.action}</span></td>
                                <td style={{ fontFamily: 'monospace', fontSize: 10, color: '#555' }}>{entry.target_id?.slice(0, 14) || '—'}</td>
                                <td style={{ color: '#555' }}>{entry.detail || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {totalPages > 1 && (
                    <div className="adm-pagination">
                        <button className="adm-btn-ghost" disabled={auditPage <= 1}
                            onClick={() => setAuditPage(p => p - 1)}>← Prev</button>
                        <span>{auditPage} / {totalPages}</span>
                        <button className="adm-btn-ghost" disabled={auditPage >= totalPages}
                            onClick={() => setAuditPage(p => p + 1)}>Next →</button>
                    </div>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Verify the file looks right**

Read `frontend/src/pages/admin/AdminSystem.jsx` lines 1–30 and confirm it imports from `adminApi.js` and has `getAuditLog` called in a `useEffect`.

- [ ] **Step 4: Commit frontend**

```bash
git add frontend/src/lib/adminApi.js frontend/src/pages/admin/AdminSystem.jsx
git commit -m "feat: paginated persistent audit log in AdminSystem with action filter"
```

---

## Self-Review

**Spec coverage:**
- ✅ `audit_logs` Supabase table with timestamp/admin_id/action/target_id/detail columns
- ✅ `admin_write_audit()` writes non-fatally to Supabase
- ✅ `_audit()` now writes to both Supabase and in-memory buffer
- ✅ `GET /admin/audit-log` endpoint with page/page_size/action params
- ✅ Frontend: action filter dropdown
- ✅ Frontend: pagination (prev/next, page/total display)
- ✅ `GET /system` still returns recent 20 entries for backward compat

**Placeholder scan:** None found.

**Type consistency:**
- `admin_get_audit_log(page, page_size, action_filter)` → called as `_get('/audit-log', { page, page_size, action })` ✅
- `audit_logs` table columns match what `admin_write_audit` inserts ✅
