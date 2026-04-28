# Domain-Aware Education Platform — Design Spec
**Date:** 2026-04-28
**Status:** Approved

## Overview

Neurativo handles lectures from any field of education — law, medicine, mathematics, computer science, history, and beyond. This spec covers making every AI-powered feature (summarization, Q&A, Smart Explain) fully domain-aware for any topic, plus the UX to let users declare or correct their field at any point.

The backend already has a partial foundation: `lectures.topic` column exists, 20 `KNOWN_TOPICS` are defined in `topic_service.py`, auto-detection fires on `chunk_idx == 1`, 12 domains have handcrafted guidance in `summarization_service.py`, and the topic badge renders in `LectureView`. This spec fills the gaps and completes the feature.

---

## What Already Exists (Do Not Re-Implement)

- `lectures.topic` DB column — already stored and retrieved
- `detect_lecture_topic()` in `topic_service.py` — auto-detects from transcript, fires on chunk 1
- `get_lecture_topic()` / `update_lecture_topic()` in `supabase_service.py`
- `_SECTION_TOPIC_GUIDANCE` dict in `summarization_service.py` — 12 known domains
- `_section_guidance(topic)` — injects guidance into Phase 2/3 summarization
- Topic passed to Smart Explain, visual analysis, and title generation
- Topic badge (purple pill) in `LectureView`
- Topic in SSE stream (`/stream-summary`)
- Topic in search and dashboard cards

---

## 1. Backend — Universal Summarization (`summarization_service.py`)

### 1a. Extend `_SECTION_TOPIC_GUIDANCE` to all 20+ KNOWN_TOPICS

Add the 8 currently missing domains:

| Domain | Focus guidance |
|--------|---------------|
| `business` | Key business models, strategic frameworks, financial concepts, market dynamics, and organizational decisions |
| `linguistics` | Language structures, phonological and syntactic rules, semantic distinctions, examples of usage, and theoretical frameworks |
| `political science` | Political systems, governance structures, policy arguments, ideological positions, and real-world case studies |
| `sociology` | Social structures and institutions, theoretical frameworks, empirical findings, group dynamics, and cultural analysis |
| `art` | Artistic movements and styles, works and artists referenced, compositional techniques, and critical/historical context |
| `music` | Musical concepts (harmony, rhythm, form), composers/works referenced, structural analysis, and historical context |
| `architecture` | Architectural styles and movements, structural and material principles, notable buildings and architects, and design rationale |
| `general` | Key concepts introduced, main arguments or findings, important definitions, and practical implications |

### 1b. Dynamic fallback for any unknown topic

Update `_section_guidance()` so any topic outside the dict still receives useful instruction:

```python
def _section_guidance(topic: str | None) -> str:
    if not topic:
        return ""
    known = _SECTION_TOPIC_GUIDANCE.get(topic.lower())
    if known:
        return " " + known
    # Dynamic fallback — handles any niche field
    return (
        f" This is a {topic} lecture. Apply domain-appropriate summarization: "
        "focus on the key terminology, core concepts, methodologies, and "
        "important findings specific to this field."
    )
```

### 1c. Topic hint in Phase 1 micro summaries

`generate_micro_summary()` is currently topic-agnostic. Add an optional `topic` parameter and inject a one-line domain hint into the system prompt — keeps it fast and cheap but makes bullets field-aware:

```
"You are Neurativo. Summarize the following {topic} lecture chunk into 2-4 extremely concise bullet points."
```

Caller (`process_live_chunk_bg`) already has topic available — pass it through.

### 1d. `_master_structure()` becomes domain-aware

Currently returns only the `_TITLE_INSTRUCTION` regardless of topic. Extend to append a domain framing note:

```python
def _master_structure(topic: str | None) -> str:
    base = _TITLE_INSTRUCTION
    if topic and topic != "general":
        base += (
            f" This is a {topic} lecture — structure the master summary to reflect "
            "how this field organises knowledge (e.g. theorem/proof for mathematics, "
            "case/principle for law, concept/application for science)."
        )
    return base
```

---

## 2. Backend — Domain-Aware Q&A (`qa_service.py`)

### Current gap
`answer_lecture_question(lecture_id, question)` has no domain context. The system prompt treats all lectures identically.

### Fix
- Add `topic: str | None = None` parameter to `answer_lecture_question()`
- Inject domain context at the top of the system prompt:

```
"This is a {topic} lecture. Apply domain-appropriate terminology, reasoning style, and precision when answering."
```

- Law: cites legal principles correctly. Math: uses proper notation. CS: discusses complexity and algorithms precisely. Medicine: uses clinical terminology.

### Endpoint change (`endpoints.py`)
The `/ask/{lecture_id}` endpoint already calls `get_lecture_topic(lecture_id)` for other purposes — fetch it there and pass to `answer_lecture_question()`.

---

## 3. Backend — Manual Topic Override

### New endpoint
```
PUT /api/v1/lectures/{lecture_id}/topic
Body: { "topic": "law" }
Auth: lecture owner only
```
- Accepts any non-empty string (not restricted to KNOWN_TOPICS — users may have custom fields)
- Normalises to lowercase, max 50 chars
- Updates `lectures.topic` via existing `update_lecture_topic()`
- Returns `{ "topic": "<updated_value>" }`

### Live start — declare domain upfront
Extend `StartSessionRequest` (or the `POST /live/start` body) with an optional `topic: str | None` field. If provided, store it on the lecture immediately so Phase 1 micro summaries are domain-aware from the very first chunk, before auto-detection fires.

```python
class StartSessionRequest(BaseModel):
    ...
    topic: str | None = None  # optional upfront declaration
```

On start, if `topic` is provided: `update_lecture_topic(lecture_id, topic)`.

---

## 4. Frontend — Domain Selection UI

### 4a. Start Session modal — domain picker (optional)

Add an optional domain step to the recording start flow. Present the 20 KNOWN_TOPICS as a scrollable pill grid. User can:
- Tap a domain pill → sets `topic` in the `POST /live/start` body
- Skip → auto-detection handles it as before

UI: pills in a 4-column grid, indigo selected state, "Skip / Let AI detect" ghost button.

### 4b. Clickable topic badge in LectureView

The existing `lv-pill-topic` badge is static text. Make it an interactive element:
- Click → opens an inline dropdown with 20 KNOWN_TOPICS + "Custom…" text input
- On select → `PUT /api/v1/lectures/{id}/topic` → update local state
- Badge text updates immediately (optimistic)
- If a summary already exists, show a subtle nudge: "Domain updated. Summaries will reflect this on next recording."

The badge renders in the summary panel header (line 639 of LectureView). Style the dropdown to match the existing pill/card system.

### 4c. Import flow domain picker

The `ImportModal` component (audio file upload) — add the same optional domain pill grid after the file is selected, before upload. Passes `topic` in the import request body.

The upload endpoint (`POST /transcribe`) should accept optional `topic` and store it before kicking off summarization.

### 4d. Dashboard

No changes needed. Topic badge already displays on lecture cards.

---

## 5. Frontend — Domain-Specific Content Rendering

### 5a. KaTeX for math/physics/engineering

Install `katex`. Create a utility `renderMath(text)` that:
1. Detects `$$...$$` (block) and `$...$` (inline) patterns
2. Renders with `katex.renderToString()`
3. Falls back to plain text on any KaTeX error

Apply to:
- Summary panel sections (in `parseSummary` / render layer)
- Q&A answers (in `QAAnswer` component)
- Smart Explain panel output

Only activate KaTeX processing when `lecture.topic` is in `['mathematics', 'physics', 'engineering', 'chemistry']` — avoids false positives on `$` in economics/business text.

### 5b. Syntax highlighting for CS

Install `highlight.js` (or use `Prism.js` — both work). Create a utility `renderCode(text)` that:
1. Detects ` ```lang ... ``` ` fenced code blocks
2. Renders with syntax highlighting
3. Adds a copy-to-clipboard button on hover

Apply to same three surfaces as KaTeX. Activate when `lecture.topic` is in `['computer science', 'engineering']`.

### 5c. Rendering pipeline

Both utilities slot into a shared `renderDomainContent(text, topic)` function that the summary panel, QAAnswer, and SmartExplain panel all call instead of rendering raw text. Internally it chains: math render → code render → plain text for anything else. This keeps the rendering logic in one place.

---

## Data Flow Summary

```
User declares topic (optional)
  → POST /live/start { topic }
  → stored immediately on lecture

Chunk arrives
  → generate_micro_summary(text, language, topic)  ← NOW topic-aware
  → classify_chunk(chunk_text, topic)
  → auto-detect topic on chunk_idx == 1 IF topic not already set
  → generate_section_summary(micro_list, language, topic)  ← extended guidance
  → generate_master_summary(sections, language, topic)     ← domain-structured

User asks question
  → GET topic from DB
  → answer_lecture_question(lecture_id, question, topic)   ← NOW domain-aware

User corrects topic
  → PUT /lectures/{id}/topic
  → badge updates instantly
  → next summary generation uses new topic

Frontend renders AI output
  → renderDomainContent(text, topic)
  → KaTeX if math/physics/engineering/chemistry
  → highlight.js if CS/engineering
  → plain text otherwise
```

---

## Files Changed

### Backend
| File | Change |
|------|--------|
| `backend/app/services/summarization_service.py` | Extend `_SECTION_TOPIC_GUIDANCE` (8 new domains), dynamic fallback in `_section_guidance()`, topic param in `generate_micro_summary()`, domain hint in `_master_structure()` |
| `backend/app/services/qa_service.py` | Add `topic` param, inject domain context into system prompt |
| `backend/app/api/endpoints.py` | Pass topic to `answer_lecture_question()`; add `PUT /lectures/{id}/topic`; accept `topic` in `StartSessionRequest` and `/transcribe`; pass topic to `generate_micro_summary()` in `process_live_chunk_bg` |

### Frontend
| File | Change |
|------|--------|
| `frontend/src/pages/LectureView.jsx` | Make topic badge clickable; inline domain dropdown; call `PUT /topic` |
| `frontend/src/components/ImportModal.jsx` | Add optional domain picker step |
| `frontend/src/components/QAAnswer.jsx` | Use `renderDomainContent()` |
| `frontend/src/lib/api.js` | Add `updateLectureTopic(id, topic)` helper |
| `frontend/src/lib/renderDomainContent.js` | NEW — KaTeX + highlight.js rendering pipeline |
| `frontend/src/pages/LandingPage.jsx` or recording modal | Domain picker pills in start session flow |

### Dependencies
| Package | Purpose |
|---------|---------|
| `katex` (frontend) | Math equation rendering |
| `highlight.js` (frontend) | Code syntax highlighting |

---

## Out of Scope

- Re-summarizing existing lectures when domain changes (summaries are immutable once generated; new domain applies to future chunks only)
- Per-domain PDF export templates (separate feature)
- Domain-specific flashcard generation (separate feature)
- Changing auto-detection to fire earlier than chunk_idx == 1
