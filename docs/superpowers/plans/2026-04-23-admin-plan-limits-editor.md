# Admin Plan Limits Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins edit numeric plan limits (uploads/month, max durations, etc.) and boolean feature flags from the AdminSystem page without a code deployment.

**Architecture:** A `admin_config` Supabase table stores a single JSON row with key `plan_limits`. `get_plan_limits_override()` reads it on each request; `set_plan_limits_override()` writes it. `get_limits()` in `plans.py` checks Supabase first and falls back to the Python constants. `PATCH /admin/system/limits` is the write endpoint. AdminSystem.jsx makes the limit fields editable inline with a Save button per plan tier.

**Tech Stack:** FastAPI, Supabase Python client, React JSX, adminApi.js.

---

### Task 1: Backend — `admin_config` table + editable limits

**Files:**
- Modify: `backend/app/services/supabase_service.py` (add `get_plan_limits_override`, `set_plan_limits_override`)
- Modify: `backend/app/core/plans.py` (update `get_limits` to check Supabase first)
- Modify: `backend/app/api/admin.py` (add `PATCH /system/limits` endpoint)
- Create: `backend/tests/test_plan_limits_editor.py`

**Context — `get_limits` in `plans.py` (lines 88–89):**
```python
def get_limits(plan_tier: str) -> dict:
    return PLAN_LIMITS.get(plan_tier, PLAN_LIMITS["free"])
```

**Context — `get_system` in `admin.py` (lines 258–264):**
```python
@router.get("/system")
async def get_system(admin: User = Depends(get_admin_user)):
    return {
        "plan_limits": PLAN_LIMITS,
        "audit_log": list(_audit_log),
    }
```

**Context — numeric limit keys (from `plans.py`):**
```
live_lectures_per_month, live_max_duration_seconds,
uploads_per_month, upload_max_duration_seconds,
upload_max_bytes, total_minutes_per_month, max_summary_sections
```
`None` means unlimited. Boolean feature flags: `pdf_export, qa_enabled, sharing, multilingual, visual_capture, flashcards, action_items, speaker_diarization, lecture_comparison, bulk_export, api_access, global_search, spaced_repetition, priority_processing`.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_plan_limits_editor.py`:

```python
"""Tests for admin plan limits editor."""


def test_get_plan_limits_override_exists():
    """supabase_service must export get_plan_limits_override()."""
    from app.services import supabase_service
    assert hasattr(supabase_service, "get_plan_limits_override"), (
        "supabase_service must have get_plan_limits_override function"
    )


def test_set_plan_limits_override_exists():
    """supabase_service must export set_plan_limits_override(limits_dict)."""
    import inspect
    from app.services import supabase_service
    assert hasattr(supabase_service, "set_plan_limits_override"), (
        "supabase_service must have set_plan_limits_override function"
    )
    sig = inspect.signature(supabase_service.set_plan_limits_override)
    assert "limits" in sig.parameters


def test_get_limits_checks_supabase_override():
    """get_limits in plans.py must check Supabase override before using constants."""
    import inspect
    from app.core import plans
    source = inspect.getsource(plans.get_limits)
    assert "override" in source or "get_plan_limits_override" in source, (
        "get_limits must attempt to read Supabase overrides before falling back to constants"
    )


def test_admin_patch_limits_endpoint_exists():
    """admin.py must have a PATCH /system/limits endpoint."""
    import inspect
    from app.api import admin
    source = inspect.getsource(admin)
    assert "system/limits" in source or "system_limits" in source, (
        "admin.py must have PATCH /system/limits endpoint"
    )
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_plan_limits_editor.py -v 2>&1 | head -30
```

Expected: all 4 FAIL.

- [ ] **Step 3: Create the `admin_config` Supabase table**

Run in Supabase SQL editor:

```sql
create table if not exists admin_config (
    key   text primary key,
    value jsonb not null,
    updated_at timestamptz not null default now()
);
```

- [ ] **Step 4: Add `get_plan_limits_override` and `set_plan_limits_override` to `supabase_service.py`**

Add at the end of the ADMIN QUERIES section (after `admin_get_audit_log` if that's already added, or after `admin_get_stats`):

```python
def get_plan_limits_override() -> dict | None:
    """
    Reads plan limits override from admin_config table.
    Returns the stored dict if present, or None if not set (use Python constants as fallback).
    """
    if not supabase:
        return None
    try:
        resp = supabase.table("admin_config").select("value").eq("key", "plan_limits").limit(1).execute()
        if resp.data:
            return resp.data[0].get("value")
    except Exception as e:
        print(f"[admin_config] get_plan_limits_override error (non-fatal): {e}")
    return None


def set_plan_limits_override(limits: dict) -> None:
    """
    Stores the full plan_limits dict in admin_config table.
    Overwrites any existing override.
    """
    if not supabase:
        raise Exception("Supabase not initialized")
    from datetime import datetime, timezone
    supabase.table("admin_config").upsert(
        {
            "key": "plan_limits",
            "value": limits,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="key",
    ).execute()
```

- [ ] **Step 5: Update `get_limits` in `plans.py`**

Replace the current `get_limits` function (lines 88–89):

```python
def get_limits(plan_tier: str) -> dict:
    """
    Returns limits for a plan tier. Checks Supabase admin_config override first,
    falls back to Python constants if no override is set or Supabase is unavailable.
    """
    try:
        from app.services.supabase_service import get_plan_limits_override
        override = get_plan_limits_override()
        if override and plan_tier in override:
            # Merge override with base constants so any missing keys use defaults
            base = dict(PLAN_LIMITS.get(plan_tier, PLAN_LIMITS["free"]))
            base.update(override[plan_tier])
            return base
    except Exception:
        pass
    return PLAN_LIMITS.get(plan_tier, PLAN_LIMITS["free"])
```

- [ ] **Step 6: Add request model and `PATCH /system/limits` endpoint to `admin.py`**

**6a. Add request model** (after existing `UpdatePlanRequest` model around line 57):

```python
class UpdateLimitsRequest(BaseModel):
    tier: str        # "free" | "student" | "pro"
    limits: dict     # partial or full limits dict for that tier
```

**6b. Add to supabase_service imports in admin.py:**

```python
    set_plan_limits_override,
    get_plan_limits_override,
```

**6c. Add the endpoint** immediately after `get_system`:

```python
@router.patch("/system/limits")
async def update_plan_limits(
    body: UpdateLimitsRequest,
    admin: User = Depends(get_admin_user),
):
    """
    Update numeric limits or feature flags for a specific plan tier.
    Changes are persisted to Supabase and take effect immediately (no restart needed).
    """
    if body.tier not in ("free", "student", "pro"):
        raise HTTPException(status_code=400, detail="tier must be free, student, or pro")

    # Merge with existing override (or base constants) to avoid losing other tiers
    from app.core.plans import PLAN_LIMITS
    current_override = get_plan_limits_override() or {}
    # Start from the hardcoded base for this tier so all keys are present
    merged_tier = dict(PLAN_LIMITS.get(body.tier, PLAN_LIMITS["free"]))
    # Apply any existing override for this tier
    if body.tier in current_override:
        merged_tier.update(current_override[body.tier])
    # Apply the new changes
    merged_tier.update(body.limits)
    # Write back the full override dict
    new_override = dict(current_override)
    new_override[body.tier] = merged_tier
    try:
        set_plan_limits_override(new_override)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save limits: {e}")
    _audit(admin.id, "update_limits", body.tier, f"keys={list(body.limits.keys())}")
    return {"ok": True, "tier": body.tier, "limits": merged_tier}
```

**6d. Update `get_system` to return live (override-applied) limits:**

Replace the `get_system` function:

```python
@router.get("/system")
async def get_system(admin: User = Depends(get_admin_user)):
    """System info: effective plan limits (with any overrides), recent audit entries."""
    from app.core.plans import PLAN_LIMITS
    # Build effective limits (override-applied) for display
    effective_limits = {}
    for tier in ("free", "student", "pro"):
        from app.core.plans import get_limits
        effective_limits[tier] = get_limits(tier)
    recent = admin_get_audit_log(page=1, page_size=20)
    return {
        "plan_limits": effective_limits,
        "audit_log": recent["logs"],
    }
```

- [ ] **Step 7: Run tests — all 4 must pass**

```bash
cd backend && python -m pytest tests/test_plan_limits_editor.py -v 2>&1 | head -30
```

Expected: all 4 PASS.

- [ ] **Step 8: Run full suite — no regressions**

```bash
cd backend && python -m pytest tests/ -v 2>&1 | tail -20
```

- [ ] **Step 9: Commit backend**

```bash
cd backend && git add app/services/supabase_service.py app/core/plans.py app/api/admin.py tests/test_plan_limits_editor.py
git commit -m "feat: admin plan limits editor — PATCH /system/limits, Supabase override, get_limits fallback"
```

---

### Task 2: Frontend — editable plan limits in AdminSystem.jsx

**Files:**
- Modify: `frontend/src/lib/adminApi.js`
- Modify: `frontend/src/pages/admin/AdminSystem.jsx`

**Context — current plan limits display in AdminSystem.jsx (lines 85–116):**
The plan limits cards show read-only `<li>` rows with `fmtLimit(v)` display values. We'll replace these with editable inputs + a Save button per card.

- [ ] **Step 1: Add `updatePlanLimits` to adminApi.js**

In `frontend/src/lib/adminApi.js`, add to the `adminApi` export after `getSystem`:

```javascript
    updatePlanLimits: (tier, limits)           => _patch('/system/limits', { tier, limits }),
```

Note: `_patch` already exists and sends a PATCH with a JSON body.

- [ ] **Step 2: Update AdminSystem.jsx plan limits section**

Find the AdminSystem.jsx file (already updated in the audit-log plan, or still at the original). Replace only the plan limits section. The key change: replace read-only `<ul className="adm-limits-list">` with an editable form.

Add to the CSS string (inside the existing `const CSS = \`...\``) after `.adm-limits-list .val`:

```css
.adm-limit-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #0d0d0d; }
.adm-limit-row:last-child { border-bottom: none; }
.adm-limit-label { font-size: 12px; color: #888; }
.adm-limit-input { width: 90px; padding: 4px 8px; background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 5px; color: #e8e8e8; font-size: 12px; text-align: right; outline: none; }
.adm-limit-input:focus { border-color: #7c3aed; }
.adm-limit-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: #7c3aed; }
.adm-card-footer { display: flex; justify-content: flex-end; margin-top: 14px; gap: 8px; align-items: center; }
.adm-save-result { font-size: 11px; color: #34d399; }
```

Replace the plan limits rendering section. Find the `{Object.entries(plans).map(([tier, limits]) => (` block and replace it with this complete component:

In the component body, add state after the existing state declarations:

```javascript
const [editedLimits, setEditedLimits] = useState({});
const [saving, setSaving] = useState({});  // {tier: bool}
const [saveResult, setSaveResult] = useState({});  // {tier: string}
```

Add a helper function (before `return`):

```javascript
const NUMERIC_LIMIT_KEYS = [
    { key: 'live_lectures_per_month',     label: 'Live lectures / month' },
    { key: 'live_max_duration_seconds',   label: 'Max live duration (sec)' },
    { key: 'uploads_per_month',           label: 'Uploads / month' },
    { key: 'upload_max_duration_seconds', label: 'Max upload duration (sec)' },
    { key: 'upload_max_bytes',            label: 'Max upload bytes' },
    { key: 'total_minutes_per_month',     label: 'Total minutes / month' },
];

const FEATURE_FLAG_KEYS = [
    'pdf_export', 'qa_enabled', 'sharing', 'multilingual',
    'visual_capture', 'flashcards', 'action_items',
    'speaker_diarization', 'lecture_comparison', 'bulk_export',
    'api_access', 'global_search', 'spaced_repetition', 'priority_processing',
];

function getLimitEdit(tier, key, fallback) {
    return editedLimits[tier]?.[key] !== undefined
        ? editedLimits[tier][key]
        : fallback;
}

function setLimitEdit(tier, key, val) {
    setEditedLimits(prev => ({
        ...prev,
        [tier]: { ...(prev[tier] || {}), [key]: val },
    }));
}

async function saveLimits(tier) {
    const changes = editedLimits[tier];
    if (!changes || !Object.keys(changes).length) return;
    setSaving(prev => ({ ...prev, [tier]: true }));
    setSaveResult(prev => ({ ...prev, [tier]: '' }));
    try {
        await adminApi.updatePlanLimits(tier, changes);
        setSaveResult(prev => ({ ...prev, [tier]: '✓ Saved' }));
        const fresh = await adminApi.getSystem();
        setSystem(fresh);
        setEditedLimits(prev => ({ ...prev, [tier]: {} }));
    } catch {
        setSaveResult(prev => ({ ...prev, [tier]: '✗ Failed' }));
    } finally {
        setSaving(prev => ({ ...prev, [tier]: false }));
        setTimeout(() => setSaveResult(prev => ({ ...prev, [tier]: '' })), 3000);
    }
}
```

Replace the plan limits cards JSX `{Object.entries(plans).map(...)`:

```jsx
<div className="adm-two-col">
    {Object.entries(plans).map(([tier, limits]) => (
        <div className="adm-card" key={tier}>
            <div className="adm-card-title">
                <span className={`adm-plan-pill adm-plan-${tier}`}>{tier}</span>
                {' '}Plan Limits
            </div>

            {/* Numeric limits */}
            {NUMERIC_LIMIT_KEYS.map(({ key, label }) => {
                const raw = getLimitEdit(tier, key, limits[key]);
                return (
                    <div className="adm-limit-row" key={key}>
                        <span className="adm-limit-label">{label}</span>
                        <input
                            className="adm-limit-input"
                            type="number"
                            min="0"
                            placeholder="∞"
                            value={raw === null || raw === undefined ? '' : raw}
                            onChange={e => {
                                const v = e.target.value === '' ? null : Number(e.target.value);
                                setLimitEdit(tier, key, v);
                            }}
                        />
                    </div>
                );
            })}

            {/* Feature flags */}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #111' }}>
                <div style={{ fontSize: 11, color: '#444', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Feature flags</div>
                {FEATURE_FLAG_KEYS.map(key => {
                    const val = getLimitEdit(tier, key, limits[key]);
                    return (
                        <div className="adm-limit-row" key={key}>
                            <span className="adm-limit-label">{key.replace(/_/g, ' ')}</span>
                            <input
                                className="adm-limit-checkbox"
                                type="checkbox"
                                checked={!!val}
                                onChange={e => setLimitEdit(tier, key, e.target.checked)}
                            />
                        </div>
                    );
                })}
            </div>

            <div className="adm-card-footer">
                {saveResult[tier] && <span className="adm-save-result">{saveResult[tier]}</span>}
                <button
                    className="adm-btn-primary"
                    onClick={() => saveLimits(tier)}
                    disabled={saving[tier] || !editedLimits[tier] || !Object.keys(editedLimits[tier] || {}).length}
                >
                    {saving[tier] ? 'Saving…' : 'Save'}
                </button>
            </div>
        </div>
    ))}
</div>
```

- [ ] **Step 3: Verify the edit looks correct**

Read `frontend/src/pages/admin/AdminSystem.jsx` lines 1–40 to confirm imports, and search for `saveLimits` to confirm it's defined.

- [ ] **Step 4: Commit frontend**

```bash
git add frontend/src/lib/adminApi.js frontend/src/pages/admin/AdminSystem.jsx
git commit -m "feat: editable plan limits in AdminSystem — numeric fields + feature flag checkboxes"
```

---

## Self-Review

**Spec coverage:**
- ✅ `admin_config` Supabase table (SQL in plan)
- ✅ `get_plan_limits_override()` reads JSON from Supabase
- ✅ `set_plan_limits_override(limits)` writes/upserts to Supabase
- ✅ `get_limits()` checks Supabase override first, falls back to constants
- ✅ `PATCH /admin/system/limits` — validates tier, merges with existing, writes to Supabase
- ✅ `GET /admin/system` returns effective (override-applied) limits
- ✅ Audit log entry on limit update
- ✅ Frontend: numeric inputs per limit key (empty = unlimited)
- ✅ Frontend: checkbox per feature flag
- ✅ Frontend: Save button per tier card, disabled when no edits
- ✅ Frontend: `✓ Saved` / `✗ Failed` feedback

**Placeholder scan:** None found.

**Type consistency:**
- `PATCH /system/limits` body: `{ tier: str, limits: dict }` ↔ `UpdateLimitsRequest(tier, limits)` ✅
- `adminApi.updatePlanLimits(tier, limits)` → `_patch('/system/limits', { tier, limits })` ✅
- Numeric input value `''` → `null` (unlimited) ↔ backend stores `null` as unlimited ✅
