# Admin User Suspension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to suspend a user (blocking all API access without deleting their data) and unsuspend them, with a suspended badge in the user list and a visible Suspend/Unsuspend button in user detail.

**Architecture:** Add `is_suspended` boolean column to the existing `user_plans` Supabase table. Add `set_user_suspended(user_id, suspended)` to `supabase_service.py`. Add a `get_active_user` auth dependency in `auth.py` that wraps `get_current_user` with a suspension check — all non-admin endpoints switch to it. Admin routes get `PATCH /admin/users/{id}/suspend` and `PATCH /admin/users/{id}/unsuspend`. Frontend shows a suspended badge in user list and a Suspend/Unsuspend button in user detail.

**Tech Stack:** FastAPI, Supabase Python client, React JSX, adminApi.js.

---

### Task 1: Backend — suspension flag + auth enforcement

**Files:**
- Modify: `backend/app/services/supabase_service.py` (add `set_user_suspended`, `get_user_suspended`)
- Modify: `backend/app/core/auth.py` (add `get_active_user` dependency)
- Modify: `backend/app/api/admin.py` (add suspend/unsuspend endpoints, include `is_suspended` in user list)
- Modify: `backend/app/api/endpoints.py` (switch user endpoints to `get_active_user`)
- Create: `backend/tests/test_suspension.py`

**Context — `set_user_plan` in `supabase_service.py` (lines 1169–1180) — shows upsert pattern:**
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

**Context — `get_current_user` in `auth.py` (lines 31–83):**
```python
async def get_current_user(authorization: str = Header(None)) -> User:
    # validates Clerk JWT, returns User(id, email)
```

**Context — `get_user_plan` in `supabase_service.py` (lines 1049–1066) — shows how user_plans is queried:**
```python
def get_user_plan(user_ids: list) -> dict:
    # queries user_plans table, returns {user_id: plan_tier}
    resp = supabase.table("user_plans").select("user_id, plan_tier").in_("user_id", batch).execute()
```

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_suspension.py`:

```python
"""Tests for user suspension feature."""


def test_set_user_suspended_exists():
    """supabase_service must export set_user_suspended(user_id, suspended)."""
    import inspect
    from app.services import supabase_service
    assert hasattr(supabase_service, "set_user_suspended"), (
        "supabase_service must have set_user_suspended function"
    )
    sig = inspect.signature(supabase_service.set_user_suspended)
    assert "user_id" in sig.parameters
    assert "suspended" in sig.parameters


def test_get_user_suspended_exists():
    """supabase_service must export get_user_suspended(user_id) -> bool."""
    import inspect
    from app.services import supabase_service
    assert hasattr(supabase_service, "get_user_suspended"), (
        "supabase_service must have get_user_suspended function"
    )
    sig = inspect.signature(supabase_service.get_user_suspended)
    assert "user_id" in sig.parameters


def test_get_active_user_exists_in_auth():
    """auth.py must export get_active_user dependency."""
    from app.core import auth
    assert hasattr(auth, "get_active_user"), (
        "auth.py must have get_active_user dependency that checks suspension"
    )


def test_get_active_user_checks_suspension():
    """get_active_user must call get_user_suspended."""
    import inspect
    from app.core import auth
    source = inspect.getsource(auth.get_active_user)
    assert "get_user_suspended" in source or "suspended" in source, (
        "get_active_user must check suspension status from supabase_service"
    )


def test_admin_suspend_endpoints_exist():
    """admin.py must have suspend and unsuspend route handlers."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "suspend" in source, "admin.py must have suspend endpoint"
    assert "unsuspend" in source, "admin.py must have unsuspend endpoint"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_suspension.py -v 2>&1 | head -30
```

Expected: all 5 FAIL.

- [ ] **Step 3: Add `is_suspended` column to `user_plans` Supabase table**

Run in Supabase SQL editor:

```sql
alter table user_plans
    add column if not exists is_suspended boolean not null default false;
```

- [ ] **Step 4: Add `set_user_suspended` and `get_user_suspended` to `supabase_service.py`**

Find the `set_user_plan` function (around line 1169). Add these two functions immediately after it:

```python
def set_user_suspended(user_id: str, suspended: bool) -> None:
    """Sets the is_suspended flag on a user in user_plans. Non-fatal on missing table."""
    if not supabase:
        raise Exception("Supabase not initialized")
    from datetime import datetime, timezone
    supabase.table("user_plans").upsert(
        {
            "user_id": user_id,
            "is_suspended": suspended,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="user_id",
    ).execute()


def get_user_suspended(user_id: str) -> bool:
    """Returns True if the user is suspended. Defaults to False if not found."""
    if not supabase or not user_id:
        return False
    try:
        resp = supabase.table("user_plans").select("is_suspended").eq("user_id", user_id).limit(1).execute()
        if resp.data:
            return bool(resp.data[0].get("is_suspended", False))
    except Exception as e:
        print(f"[suspension] get_user_suspended error (non-fatal): {e}")
    return False
```

- [ ] **Step 5: Add `get_active_user` to `auth.py`**

At the end of `backend/app/core/auth.py`, add:

```python
async def get_active_user(authorization: str = Header(None)) -> User:
    """
    FastAPI dependency — validates Clerk JWT and checks that the user is not suspended.
    Raises 401 if not authenticated, 403 if suspended.
    """
    user = await get_current_user(authorization)
    # Import here to avoid circular imports at module load time
    from app.services.supabase_service import get_user_suspended
    if get_user_suspended(user.id):
        raise HTTPException(
            status_code=403,
            detail="Account suspended. Contact support at support@neurativo.com.",
        )
    return user
```

- [ ] **Step 6: Switch user endpoints in `endpoints.py` to use `get_active_user`**

In `backend/app/api/endpoints.py`, find the imports at the top. The current import is:

```python
from app.core.auth import get_current_user, User
```

Replace with:

```python
from app.core.auth import get_current_user, get_active_user, User
```

Then, for all user-facing endpoint dependencies, replace `Depends(get_current_user)` with `Depends(get_active_user)`. Do NOT change admin endpoints — they use `get_admin_user` which is separate.

To do this safely, search for `Depends(get_current_user)` in endpoints.py and replace all occurrences:

```bash
cd backend && grep -n "Depends(get_current_user)" app/api/endpoints.py | head -20
```

Use the Edit tool to replace `get_current_user` → `get_active_user` in all endpoint function signatures in `endpoints.py`. Admin routes in `admin.py` use `get_admin_user` — do not touch those.

- [ ] **Step 7: Add suspend/unsuspend endpoints to `admin.py`**

In `backend/app/api/admin.py`, add to the imports from `supabase_service`:

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
    set_user_suspended,
    get_user_suspended,
)
```

Add these two endpoints immediately after `delete_user` (after line 194):

```python
@router.patch("/users/{user_id}/suspend")
async def suspend_user(user_id: str, admin: User = Depends(get_admin_user)):
    """Suspend a user — blocks all API access without deleting their data."""
    try:
        set_user_suspended(user_id, True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to suspend user: {e}")
    _audit(admin.id, "suspend_user", user_id)
    return {"ok": True, "user_id": user_id, "is_suspended": True}


@router.patch("/users/{user_id}/unsuspend")
async def unsuspend_user(user_id: str, admin: User = Depends(get_admin_user)):
    """Lift suspension — restores full API access."""
    try:
        set_user_suspended(user_id, False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to unsuspend user: {e}")
    _audit(admin.id, "unsuspend_user", user_id)
    return {"ok": True, "user_id": user_id, "is_suspended": False}
```

- [ ] **Step 8: Include `is_suspended` in user list and user detail responses in `admin.py`**

In the `list_users` function (around line 82), the `merged` list is built per-user. After building the `plans_map`, also fetch suspension status. Find the section that builds `merged` (around line 111–125) and update:

First, add a helper call after `counts_map`:

```python
    # Fetch suspension status for all user IDs
    from app.services.supabase_service import admin_get_suspended_map
    suspended_map = admin_get_suspended_map(user_ids)
```

Then in the `merged.append(...)` dict, add `"is_suspended": suspended_map.get(uid, False)`.

Now add `admin_get_suspended_map` to `supabase_service.py` (add after `get_user_suspended`):

```python
def admin_get_suspended_map(user_ids: list) -> dict:
    """Returns {user_id: is_suspended} for a list of user IDs. Defaults to False."""
    if not supabase or not user_ids:
        return {}
    result = {}
    try:
        for i in range(0, len(user_ids), 100):
            batch = user_ids[i:i + 100]
            resp = supabase.table("user_plans").select("user_id, is_suspended").in_("user_id", batch).execute()
            for row in (resp.data or []):
                result[row["user_id"]] = bool(row.get("is_suspended", False))
    except Exception as e:
        print(f"[suspension] admin_get_suspended_map error (non-fatal): {e}")
    return result
```

Also add `admin_get_suspended_map` to the imports in `admin.py`.

In `get_user` (around line 144), after fetching `supabase_detail`, add:

```python
    is_suspended = get_user_suspended(user_id)
    profile.update({"is_suspended": is_suspended})
```

- [ ] **Step 9: Run tests — all 5 must pass**

```bash
cd backend && python -m pytest tests/test_suspension.py -v 2>&1 | head -30
```

Expected: all 5 PASS.

- [ ] **Step 10: Run full suite — no regressions**

```bash
cd backend && python -m pytest tests/ -v 2>&1 | tail -20
```

- [ ] **Step 11: Commit backend**

```bash
cd backend && git add app/services/supabase_service.py app/core/auth.py app/api/admin.py app/api/endpoints.py tests/test_suspension.py
git commit -m "feat: user suspension — set_user_suspended, get_active_user dependency, admin suspend/unsuspend endpoints"
```

---

### Task 2: Frontend — Suspend button + suspended badge

**Files:**
- Modify: `frontend/src/lib/adminApi.js`
- Modify: `frontend/src/pages/admin/AdminUserDetail.jsx`
- Modify: `frontend/src/pages/admin/AdminUsers.jsx`

**Context — current adminApi.js exports include `deleteUser`:**
```javascript
    deleteUser:      (userId)                  => _delete(`/users/${userId}`),
```

**Context — AdminUserDetail.jsx has a danger zone section with delete button (lines ~28–44 of CSS, ~200+ of JSX). The plan card has `adm-plan-form` with a select + save button pattern.**

- [ ] **Step 1: Add suspend/unsuspend to adminApi.js**

In `frontend/src/lib/adminApi.js`, add after `deleteUser`:

```javascript
    suspendUser:     (userId)                  => _patch(`/users/${userId}/suspend`),
    unsuspendUser:   (userId)                  => _patch(`/users/${userId}/unsuspend`),
```

- [ ] **Step 2: Add Suspend button and suspended badge to AdminUserDetail.jsx**

Read `frontend/src/pages/admin/AdminUserDetail.jsx` lines 60–250 to find the `profile` rendering and danger zone section.

In the CSS constant (top of file), add these styles after `.adm-btn-danger:hover`:

```css
.adm-suspended-badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; background: #78350f22; color: #fbbf24; border: 1px solid #78350f55; margin-left: 8px; }
.adm-btn-warn { background: #78350f22; border: 1px solid #78350f55; color: #fbbf24; padding: 8px 16px; border-radius: 7px; font-size: 13px; cursor: pointer; }
.adm-btn-warn:hover { background: #78350f44; }
```

In the component, add suspension state after existing state declarations:

```javascript
const [suspending, setSuspending] = useState(false);
```

Add a `handleSuspend` function after the existing `handleDelete` function:

```javascript
async function handleSuspend() {
    if (!data) return;
    const isSuspended = data.profile?.is_suspended;
    setSuspending(true);
    try {
        if (isSuspended) {
            await adminApi.unsuspendUser(userId);
        } else {
            await adminApi.suspendUser(userId);
        }
        const fresh = await adminApi.getUser(userId);
        setData(fresh);
    } catch {
        // silent — no toast for now
    } finally {
        setSuspending(false);
    }
}
```

In the JSX, find the "Danger Zone" section. Add a Suspend button **above** the Delete button:

```jsx
<div className="adm-danger-zone">
    <div className="adm-danger-title">Danger Zone</div>
    <button
        className={data.profile?.is_suspended ? 'adm-btn adm-btn-warn' : 'adm-btn adm-btn-warn'}
        onClick={handleSuspend}
        disabled={suspending}
        style={{ marginBottom: 10 }}
    >
        {suspending
            ? '…'
            : data.profile?.is_suspended
                ? 'Unsuspend User'
                : 'Suspend User'}
    </button>
    {/* existing delete button below */}
```

Also in the profile info section, show a suspended badge next to the display name or plan pill:

```jsx
{data.profile?.is_suspended && (
    <span className="adm-suspended-badge">SUSPENDED</span>
)}
```

- [ ] **Step 3: Add suspended badge to AdminUsers.jsx user list**

Read `frontend/src/pages/admin/AdminUsers.jsx` lines 50–150 to find where the user row is rendered.

In the CSS constant, add:

```css
.adm-suspended-badge { display: inline-block; padding: 1px 7px; border-radius: 99px; font-size: 10px; font-weight: 600; background: #78350f22; color: #fbbf24; border: 1px solid #78350f55; margin-left: 6px; }
```

In the user row JSX (where the user's email/name is rendered), add:

```jsx
{u.is_suspended && <span className="adm-suspended-badge">SUSPENDED</span>}
```

- [ ] **Step 4: Verify changes look correct**

Read `frontend/src/pages/admin/AdminUserDetail.jsx` lines 1–30 (imports) and search for `handleSuspend` and `adm-suspended-badge` to confirm they're present.

- [ ] **Step 5: Commit frontend**

```bash
git add frontend/src/lib/adminApi.js frontend/src/pages/admin/AdminUserDetail.jsx frontend/src/pages/admin/AdminUsers.jsx
git commit -m "feat: suspend/unsuspend user in admin panel — badge in list + button in detail"
```

---

## Self-Review

**Spec coverage:**
- ✅ `is_suspended` column added to `user_plans` (SQL migration in plan)
- ✅ `set_user_suspended(user_id, suspended)` in supabase_service
- ✅ `get_user_suspended(user_id)` in supabase_service
- ✅ `admin_get_suspended_map(user_ids)` for bulk list fetch
- ✅ `get_active_user` dependency in auth.py — raises 403 on suspension
- ✅ `endpoints.py` switches to `get_active_user` for all user endpoints
- ✅ `PATCH /admin/users/{id}/suspend` + `PATCH /admin/users/{id}/unsuspend`
- ✅ `is_suspended` included in user list + user detail responses
- ✅ Audit log entry on suspend + unsuspend
- ✅ Frontend: suspended badge in AdminUsers list
- ✅ Frontend: Suspend/Unsuspend button in AdminUserDetail
- ✅ Frontend: SUSPENDED badge in profile info area

**Placeholder scan:** None found.

**Type consistency:**
- `set_user_suspended(user_id: str, suspended: bool)` ↔ `adminApi.suspendUser(userId)` calls `PATCH` which triggers `set_user_suspended(user_id, True)` ✅
- `is_suspended: bool` returned in both list + detail ✅
