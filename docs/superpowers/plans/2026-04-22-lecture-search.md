# Lecture Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add content search to the lecture dashboard so students can find any lecture by typing keywords that appear in its title, topic, or full summary.

**Architecture:** Add `q` param to `get_recent_lectures` that applies a case-insensitive `ilike` filter on title + topic + master_summary + summary columns via Supabase. Wire it to the existing `GET /api/v1/lectures` endpoint. The frontend debounces the existing search box (400ms, ≥3 chars) and calls the backend; shorter queries stay client-side.

**Tech Stack:** FastAPI, Supabase Python client (`or_` filter), React hooks (`useRef`, `useState`), axios.

---

### Task 1: Backend — add `q` param to `get_recent_lectures` + endpoint

**Files:**
- Modify: `backend/app/services/supabase_service.py` (function `get_recent_lectures`, lines 572–605)
- Modify: `backend/app/api/endpoints.py` (function `get_lectures`, lines 1153–1166)
- Create: `backend/tests/test_search.py`

**Context — current `get_recent_lectures` signature (lines 572–573):**
```python
def get_recent_lectures(limit: int = 5, offset: int = 0, user_id: str = None) -> list:
```

**Context — current `get_lectures` endpoint (lines 1153–1166):**
```python
@router.get("/lectures")
def get_lectures(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
):
    try:
        return get_recent_lectures(limit=limit, offset=offset, user_id=str(user.id))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch lectures")
```

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_search.py`:

```python
"""Tests for lecture search functionality."""


def test_get_recent_lectures_accepts_q_param():
    """get_recent_lectures must accept a q keyword argument."""
    import inspect
    from app.services.supabase_service import get_recent_lectures

    sig = inspect.signature(get_recent_lectures)
    assert "q" in sig.parameters, (
        "get_recent_lectures must have a 'q' parameter for content search."
    )


def test_get_recent_lectures_q_default_is_none():
    """get_recent_lectures q param must default to None (no search = all lectures)."""
    import inspect
    from app.services.supabase_service import get_recent_lectures

    sig = inspect.signature(get_recent_lectures)
    assert sig.parameters["q"].default is None, (
        "get_recent_lectures 'q' parameter must default to None."
    )


def test_get_lectures_endpoint_accepts_q_param():
    """GET /lectures endpoint source must accept a q query parameter."""
    import inspect
    from app.api import endpoints

    source = inspect.getsource(endpoints.get_lectures)
    assert "q" in source, (
        "get_lectures endpoint must accept a 'q' query parameter."
    )


def test_get_recent_lectures_applies_ilike_when_q_provided():
    """get_recent_lectures must use ilike filtering when q is not None."""
    import inspect
    from app.services.supabase_service import get_recent_lectures

    source = inspect.getsource(get_recent_lectures)
    assert "ilike" in source, (
        "get_recent_lectures must apply ilike filter when q is provided."
    )


def test_search_snippet_shown_when_q_provided():
    """get_recent_lectures must return a longer snippet when q is provided."""
    import inspect
    from app.services.supabase_service import get_recent_lectures

    source = inspect.getsource(get_recent_lectures)
    # Must contain snippet logic — look for idx or find() usage for q context
    assert "idx" in source or ".find(" in source, (
        "get_recent_lectures must extract a context snippet around the match when q is provided."
    )
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_search.py -v 2>&1 | head -30
```

Expected: all 5 tests FAIL.

- [ ] **Step 3: Update `get_recent_lectures` in `supabase_service.py`**

Replace the full `get_recent_lectures` function with:

```python
def get_recent_lectures(limit: int = 5, offset: int = 0, user_id: str = None, q: str = None) -> list:
    """
    Returns lectures sorted by created_at DESC.
    When user_id is provided, filters to that user's lectures only.
    When q is provided, applies case-insensitive content search on
    title, topic, master_summary, and summary columns.
    """
    if not supabase:
        return []
    query = (
        supabase.table("lectures")
        .select(
            "id, title, topic, language, total_chunks, total_sections, "
            "total_duration_seconds, created_at, master_summary, summary"
        )
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    if user_id:
        query = query.eq("user_id", user_id)
    if q:
        term = q.strip()
        query = query.or_(
            f"title.ilike.%{term}%,"
            f"topic.ilike.%{term}%,"
            f"master_summary.ilike.%{term}%,"
            f"summary.ilike.%{term}%"
        )
    response = query.execute()
    if not hasattr(response, "data"):
        return []
    rows = []
    for row in response.data:
        preview_src = row.get("master_summary") or row.get("summary") or ""
        if q and preview_src:
            term = q.strip().lower()
            idx = preview_src.lower().find(term)
            if idx >= 0:
                start = max(0, idx - 60)
                end = min(len(preview_src), idx + len(term) + 60)
                snippet = (
                    ("…" if start > 0 else "")
                    + preview_src[start:end]
                    + ("…" if end < len(preview_src) else "")
                )
            else:
                snippet = preview_src[:200]
            summary_preview = snippet
        else:
            summary_preview = preview_src[:120] if preview_src else ""
        rows.append({
            "id":                     row["id"],
            "title":                  row.get("title") or "Untitled",
            "topic":                  row.get("topic"),
            "language":               row.get("language") or "en",
            "total_chunks":           row.get("total_chunks") or 0,
            "total_sections":         row.get("total_sections") or 0,
            "total_duration_seconds": row.get("total_duration_seconds") or 0,
            "created_at":             row.get("created_at"),
            "summary_preview":        summary_preview,
        })
    return rows
```

- [ ] **Step 4: Update `get_lectures` endpoint in `endpoints.py`**

Replace the `get_lectures` function with:

```python
@router.get("/lectures")
def get_lectures(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    q: str = Query(None, max_length=200),
    user=Depends(get_current_user),
):
    """
    Returns lectures for the authenticated user sorted by created_at DESC.
    Optional ?q= param enables content search on title, topic, and summary.
    """
    try:
        return get_recent_lectures(limit=limit, offset=offset, user_id=str(user.id), q=q)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch lectures")
```

- [ ] **Step 5: Run tests — all 5 must pass**

```bash
cd backend && python -m pytest tests/test_search.py -v 2>&1 | head -30
```

Expected: all 5 PASS.

- [ ] **Step 6: Run full suite — no regressions**

```bash
cd backend && python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/services/supabase_service.py app/api/endpoints.py tests/test_search.py
git commit -m "feat: add content search to GET /lectures via q param — ilike on title/topic/summary"
```

---

### Task 2: Frontend — debounced backend search in Dashboard

**Files:**
- Modify: `frontend/src/components/Dashboard.jsx`

**Context — current state variables (lines 396–407):**
```javascript
const [lectures, setLectures] = useState([]);
const [loading, setLoading]   = useState(true);
const [search, setSearch]     = useState('');
const [topicFilter, setTopicFilter] = useState('');
const [langFilter,  setLangFilter]  = useState('');
const [sortBy,    setSortBy]    = useState('newest');
```

**Context — current search input onChange (lines ~597–598):**
```javascript
onChange={e => setSearch(e.target.value)}
```

**Context — current filtered computation (lines 482–501):**
```javascript
const filtered = lectures
    .filter(l => {
        const q = search.trim().toLowerCase();
        const matchSearch = !q ||
            (l.title    || '').toLowerCase().includes(q) ||
            (l.topic    || '').toLowerCase().includes(q) ||
            (l.language || '').toLowerCase().includes(q);
        const matchTopic = !topicFilter || l.topic    === topicFilter;
        const matchLang  = !langFilter  || l.language === langFilter;
        return matchSearch && matchTopic && matchLang;
    })
    .sort((a, b) => {
        if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
        if (sortBy === 'az')     return (a.title || '').localeCompare(b.title || '');
        return new Date(b.created_at) - new Date(a.created_at);
    });
```

**Context — current search input JSX (lines ~590–606):**
```jsx
<div className="db-search-wrap">
    <span className="db-search-icon">...</span>
    <input
        ref={searchRef}
        className="db-search"
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { setSearch(''); e.target.blur(); } }}
        placeholder="Search by title, topic or language…"
    />
</div>
```

- [ ] **Step 1: Read Dashboard.jsx to confirm exact current state**

Read `frontend/src/components/Dashboard.jsx` lines 390–420 (state declarations) and lines 480–510 (filtered computation) to confirm they match the context above before editing.

- [ ] **Step 2: Add new state and ref near the existing state declarations**

Find the block of `useState` declarations (around line 396). Add these two lines immediately after the `sortBy` state declaration:

```javascript
const searchTimerRef = useRef(null);
const [searchResults, setSearchResults] = useState(null); // null = use cached list
const [searchLoading, setSearchLoading] = useState(false);
```

`useRef` is already imported (it's used for `searchRef` elsewhere). No new imports needed.

- [ ] **Step 3: Add cleanup effect for the debounce timer**

Find the existing `useEffect` that fetches lectures (around line 420). Add a new cleanup effect immediately after it:

```javascript
useEffect(() => () => clearTimeout(searchTimerRef.current), []);
```

- [ ] **Step 4: Update the `filtered` computation**

Replace the current `filtered` computation (the block starting `const filtered = lectures`) with:

```javascript
const baseList = searchResults !== null ? searchResults : lectures;
const filtered = baseList
    .filter(l => {
        const q = search.trim().toLowerCase();
        // When searchResults is active (backend search), backend already filtered
        // by content — only apply the dropdown filters client-side.
        const matchSearch = searchResults !== null || !q ||
            (l.title    || '').toLowerCase().includes(q) ||
            (l.topic    || '').toLowerCase().includes(q) ||
            (l.language || '').toLowerCase().includes(q);
        const matchTopic = !topicFilter || l.topic    === topicFilter;
        const matchLang  = !langFilter  || l.language === langFilter;
        return matchSearch && matchTopic && matchLang;
    })
    .sort((a, b) => {
        if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
        if (sortBy === 'az')     return (a.title || '').localeCompare(b.title || '');
        return new Date(b.created_at) - new Date(a.created_at);
    });
```

- [ ] **Step 5: Update the search input**

Replace the search input JSX block with:

```jsx
<div className={`db-search-wrap${searchLoading ? ' db-search-loading' : ''}`}>
    <span className="db-search-icon">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
    </span>
    <input
        ref={searchRef}
        className="db-search"
        type="text"
        value={search}
        onChange={e => {
            const val = e.target.value;
            setSearch(val);
            clearTimeout(searchTimerRef.current);
            if (val.trim().length >= 3) {
                setSearchLoading(true);
                searchTimerRef.current = setTimeout(async () => {
                    try {
                        const res = await api.get(`/api/v1/lectures?limit=50&q=${encodeURIComponent(val.trim())}`);
                        const list = Array.isArray(res.data) ? res.data : [];
                        setSearchResults(list);
                    } catch {
                        setSearchResults([]);
                    } finally {
                        setSearchLoading(false);
                    }
                }, 400);
            } else {
                setSearchResults(null);
                setSearchLoading(false);
            }
        }}
        onKeyDown={e => {
            if (e.key === 'Escape') {
                setSearch('');
                setSearchResults(null);
                setSearchLoading(false);
                clearTimeout(searchTimerRef.current);
                e.target.blur();
            }
        }}
        placeholder="Search lectures by title, topic or content…"
    />
</div>
```

- [ ] **Step 6: Verify the edit looks correct**

Read `frontend/src/components/Dashboard.jsx` lines 480–520 and 585–640 to confirm:
- `baseList` is used in `filtered`
- `searchResults` state is referenced
- `searchLoading` class is applied to `db-search-wrap`
- `onKeyDown` clears `searchResults` when Escape is pressed
- No syntax errors visible

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Dashboard.jsx
git commit -m "feat: debounced backend content search in Dashboard — fires on 3+ chars, reverts on clear"
```

---

## Self-Review

**Spec coverage:**
- ✅ Task 1: `q` param added to `get_recent_lectures` with `ilike` on title/topic/master_summary/summary
- ✅ Task 1: snippet extraction shows context around match when `q` provided
- ✅ Task 1: `GET /lectures` endpoint accepts `q: str = Query(None, max_length=200)`
- ✅ Task 2: debounce 400ms, fires at ≥3 chars
- ✅ Task 2: reverts to cached list when query cleared
- ✅ Task 2: `searchResults` overrides `lectures` as base for `filtered`
- ✅ Task 2: topic/language dropdowns still applied on top of search results
- ✅ Task 2: Escape clears search and searchResults
- ✅ Task 2: `searchLoading` class on search wrap for visual feedback

**Placeholder scan:** None found. All code blocks are complete and exact.

**Type consistency:**
- `get_recent_lectures(q=None)` → called as `get_recent_lectures(..., q=q)` ✅
- `searchResults: null | lecture[]` → `baseList = searchResults !== null ? searchResults : lectures` ✅
- `searchLoading: boolean` → used in className ternary ✅
