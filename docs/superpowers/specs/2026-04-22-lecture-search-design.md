# Lecture Search — Design Spec

**Date:** 2026-04-22
**Goal:** Let students search inside lecture content (summaries, titles, topics) so they can find any lecture by what was discussed, not just by title.

---

## Problem

The dashboard already has client-side search filtering title/topic/language. It cannot search inside lecture summaries — if a student types "eigenvalues" and that word is only in the summary (not the title), the lecture won't appear. The 120-char `summary_preview` returned per lecture is too short to be useful for content search.

---

## Architecture

No new files. No schema changes. No new API endpoints.

| File | Change |
|------|--------|
| `backend/app/services/supabase_service.py` | `get_recent_lectures` — add optional `q` param, apply `ilike` filter on title + topic + master_summary + summary |
| `backend/app/api/endpoints.py` | `GET /api/v1/lectures` — accept `q: str = Query(None)`, pass to `get_recent_lectures` |
| `frontend/src/components/Dashboard.jsx` | Debounced backend search when query ≥ 3 chars; revert to cached list when query cleared |

---

## Change Details

### 1. `get_recent_lectures` — add content search

`backend/app/services/supabase_service.py`, `get_recent_lectures(limit, offset, user_id)`:

Add `q: str = None` parameter. When `q` is provided (non-empty after strip), apply an `or` filter using Supabase's `.or_()` method:

```python
if q:
    term = q.strip()
    query = query.or_(
        f"title.ilike.%{term}%,"
        f"topic.ilike.%{term}%,"
        f"master_summary.ilike.%{term}%,"
        f"summary.ilike.%{term}%"
    )
```

This uses PostgreSQL `ilike` (case-insensitive `like`) — no index required for per-user query volumes (50–200 rows max per user).

Also add `master_summary` and `summary` to the SELECT so the snippet can be extracted:

**Current SELECT:**
```
"id, title, topic, language, total_chunks, total_sections, total_duration_seconds, created_at, master_summary, summary"
```

`master_summary` and `summary` are already selected — no change needed to the SELECT.

The returned `summary_preview` field is already built from `master_summary or summary`. When `q` is provided, extend the preview to 200 chars and include a snippet that shows context around the match:

```python
if q and preview_src:
    term = q.strip().lower()
    idx = preview_src.lower().find(term)
    if idx >= 0:
        start = max(0, idx - 60)
        end = min(len(preview_src), idx + len(term) + 60)
        snippet = ("…" if start > 0 else "") + preview_src[start:end] + ("…" if end < len(preview_src) else "")
    else:
        snippet = preview_src[:200]
    summary_preview = snippet
else:
    summary_preview = preview_src[:120] if preview_src else ""
```

### 2. `GET /api/v1/lectures` — accept `q` param

`backend/app/api/endpoints.py`, `get_lectures`:

Add `q: str = Query(None, max_length=200)` parameter and pass it to `get_recent_lectures`:

```python
@router.get("/lectures")
def get_lectures(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    q: str = Query(None, max_length=200),
    user=Depends(get_current_user),
):
    try:
        return get_recent_lectures(limit=limit, offset=offset, user_id=str(user.id), q=q)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch lectures")
```

When `q` is provided, the backend returns only matching lectures (filtered by PostgreSQL, not client). When `q` is absent, behaviour is identical to today.

### 3. Frontend — debounced backend search

`frontend/src/components/Dashboard.jsx`:

**Add a debounce ref and search results state:**

```javascript
const searchTimerRef = useRef(null);
const [searchResults, setSearchResults] = useState(null); // null = use cached list
const [searchLoading, setSearchLoading] = useState(false);
```

**Update the `onChange` handler for the search input:**

```javascript
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
        setSearchResults(null); // revert to cached list
        setSearchLoading(false);
    }
}}
```

**Update the `filtered` computation** to use `searchResults` when available:

```javascript
const baseList = searchResults !== null ? searchResults : lectures;
const filtered = baseList
    .filter(l => {
        const q = search.trim().toLowerCase();
        // When searchResults is active, skip client-side text match
        // (backend already filtered by content). Only apply dropdowns.
        const matchSearch = searchResults !== null || !q ||
            (l.title    || '').toLowerCase().includes(q) ||
            (l.topic    || '').toLowerCase().includes(q) ||
            (l.language || '').toLowerCase().includes(q);
        const matchTopic = !topicFilter || l.topic    === topicFilter;
        const matchLang  = !langFilter  || l.language === langFilter;
        return matchSearch && matchTopic && matchLang;
    })
    .sort((a, b) => { ... }); // unchanged
```

**Show a loading indicator** in the search bar when `searchLoading` is true — add a spinner class to the search wrap:

```jsx
<div className={`db-search-wrap${searchLoading ? ' db-search-loading' : ''}`}>
```

**Cleanup on unmount** to cancel pending debounce:

```javascript
useEffect(() => () => clearTimeout(searchTimerRef.current), []);
```

---

## Behaviour Summary

| User action | What happens |
|-------------|-------------|
| Types 1–2 chars | Client-side filter on title/topic/language (instant, cached list) |
| Types 3+ chars, pauses 400ms | Backend request with `?q=...` — content-matched results from DB |
| Clears search | Reverts to cached list instantly (no round-trip) |
| Types 3+ chars, keeps typing | Previous timer cancelled, new 400ms starts — only one request fires |
| Topic/language dropdowns while searching | Applied on top of backend search results |

---

## Non-Goals

- No Postgres FTS index (ilike is sufficient at per-user scale).
- No search highlighting in the UI (snippet in summary_preview is enough).
- No search history or autocomplete.
- No search across other users' lectures.
- No transcript-level search (summary search covers the key topics).
