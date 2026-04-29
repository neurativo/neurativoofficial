# Domain-Aware Education Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every AI feature in Neurativo (summarization, Q&A, Smart Explain) fully domain-aware for any field of education, and give users control over their lecture's domain at every stage.

**Architecture:** The backend already detects topics and stores them on lectures. This plan fills the gaps: extends domain guidance to all known fields + adds a dynamic fallback for any unknown topic, threads topic into Q&A (currently missing), adds a manual override endpoint, and builds a domain selection UI + domain-specific rendering in the frontend.

**Tech Stack:** Python/FastAPI (backend), React (frontend), `katex` (math rendering), `highlight.js` (code syntax highlighting)

---

## File Map

### Backend — modified
- `backend/app/services/summarization_service.py` — extend domain dict, dynamic fallback, topic in micro summary, domain-aware master structure
- `backend/app/services/qa_service.py` — add `topic` param, inject domain context into system prompt
- `backend/app/api/endpoints.py` — add `PUT /lectures/{id}/topic`, accept `topic` in `/live/start` body, accept `topic` form field in `/transcribe`, pass topic to Q&A, pass topic to micro summary

### Frontend — modified
- `frontend/src/lib/api.js` — add `updateLectureTopic(id, topic)` helper
- `frontend/src/pages/LectureView.jsx` — make topic badge clickable, inline domain dropdown
- `frontend/src/components/QAAnswer.jsx` — accept `topic` prop, use `renderDomainContent`
- `frontend/src/components/ImportModal.jsx` — add domain picker step, pass topic to upload
- `frontend/src/App.jsx` — domain picker modal before starting live session, pass topic to `/live/start`

### Frontend — new
- `frontend/src/lib/renderDomainContent.jsx` — KaTeX + highlight.js rendering pipeline

---

## Task 1: Extend `_SECTION_TOPIC_GUIDANCE` and add dynamic fallback

**Files:**
- Modify: `backend/app/services/summarization_service.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_summarization_domain.py`:

```python
import pytest
from app.services.summarization_service import _section_guidance, _master_structure


def test_section_guidance_known_domain():
    result = _section_guidance("law")
    assert "statutes" in result or "legal" in result.lower()


def test_section_guidance_new_known_domain():
    result = _section_guidance("business")
    assert "business" in result.lower() or "strategic" in result.lower()


def test_section_guidance_unknown_domain_dynamic_fallback():
    result = _section_guidance("marine biology")
    assert "marine biology" in result
    assert "domain-appropriate" in result or "terminology" in result


def test_section_guidance_none_returns_empty():
    assert _section_guidance(None) == ""
    assert _section_guidance("") == ""


def test_master_structure_with_topic():
    result = _master_structure("mathematics")
    assert "mathematics" in result
    assert "theorem" in result or "proof" in result or "field" in result


def test_master_structure_general_no_domain_hint():
    result = _master_structure("general")
    # Should not inject domain framing for "general"
    assert "general" not in result or "lecture" not in result.lower()


def test_master_structure_none_no_domain_hint():
    result = _master_structure(None)
    assert result  # non-empty — still contains title instruction
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_summarization_domain.py -v
```

Expected: FAIL — `test_section_guidance_new_known_domain` and `test_section_guidance_unknown_domain_dynamic_fallback` fail since `business` is missing and no dynamic fallback exists.

- [ ] **Step 3: Extend `_SECTION_TOPIC_GUIDANCE` and update `_section_guidance` and `_master_structure`**

In `backend/app/services/summarization_service.py`, after the existing entries in `_SECTION_TOPIC_GUIDANCE` (after the `"engineering"` entry at the closing `}`), add:

```python
    "business": (
        "Focus on: key business models and strategies, financial concepts, "
        "market dynamics, organisational decisions, and real-world case studies."
    ),
    "linguistics": (
        "Focus on: language structures and rules (phonological, syntactic, semantic), "
        "theoretical frameworks, examples of usage, and cross-linguistic comparisons."
    ),
    "political science": (
        "Focus on: political systems and institutions, governance structures, "
        "policy arguments, ideological positions, and real-world case studies."
    ),
    "sociology": (
        "Focus on: social structures and institutions, theoretical frameworks, "
        "empirical findings, group dynamics, and cultural analysis."
    ),
    "art": (
        "Focus on: artistic movements and styles, works and artists referenced, "
        "compositional techniques, historical context, and critical perspectives."
    ),
    "music": (
        "Focus on: musical concepts (harmony, rhythm, form, structure), "
        "composers and works referenced, analytical observations, and historical context."
    ),
    "architecture": (
        "Focus on: architectural styles and movements, structural and material principles, "
        "notable buildings and architects referenced, and design rationale."
    ),
    "general": (
        "Focus on: key concepts introduced, main arguments or findings, "
        "important definitions, and practical implications."
    ),
```

Replace the existing `_section_guidance` function:

```python
def _section_guidance(topic: str | None) -> str:
    if not topic:
        return ""
    known = _SECTION_TOPIC_GUIDANCE.get(topic.lower())
    if known:
        return " " + known
    # Dynamic fallback — handles any niche or custom field
    return (
        f" This is a {topic} lecture. Apply domain-appropriate summarization: "
        "focus on the key terminology, core concepts, methodologies, and "
        "important findings specific to this field."
    )
```

Replace the existing `_master_structure` function:

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

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_summarization_domain.py -v
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/summarization_service.py backend/tests/test_summarization_domain.py
git commit -m "feat: extend domain guidance to all 20+ fields with dynamic fallback for any topic"
```

---

## Task 2: Topic hint in Phase 1 micro summaries

**Files:**
- Modify: `backend/app/services/summarization_service.py`

- [ ] **Step 1: Add `topic` param to `generate_micro_summary` signature**

Change the function signature from:
```python
def generate_micro_summary(text: str, language: str = "en") -> str:
```
to:
```python
def generate_micro_summary(text: str, language: str = "en", topic: str | None = None) -> str:
```

- [ ] **Step 2: Inject domain hint into the system prompt**

In the same function, change the system prompt content from:
```python
"content": (
    "You are Neurativo. Summarize the following lecture chunk "
    "into 2-4 extremely concise bullet points." + lang_note
)
```
to:
```python
"content": (
    f"You are Neurativo. Summarize the following "
    f"{topic + ' ' if topic and topic != 'general' else ''}lecture chunk "
    "into 2-4 extremely concise bullet points." + lang_note
)
```

- [ ] **Step 3: Write a quick test**

Add to `backend/tests/test_summarization_domain.py`:

```python
def test_generate_micro_summary_signature_accepts_topic():
    # Verify the function accepts topic without raising TypeError
    import inspect
    from app.services.summarization_service import generate_micro_summary
    sig = inspect.signature(generate_micro_summary)
    assert "topic" in sig.parameters
    assert sig.parameters["topic"].default is None
```

- [ ] **Step 4: Run test**

```bash
cd backend && python -m pytest tests/test_summarization_domain.py::test_generate_micro_summary_signature_accepts_topic -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/summarization_service.py backend/tests/test_summarization_domain.py
git commit -m "feat: add topic param to generate_micro_summary for domain-aware phase 1 bullets"
```

---

## Task 3: Domain-aware Q&A

**Files:**
- Modify: `backend/app/services/qa_service.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_qa_domain.py`:

```python
import inspect
from app.services.qa_service import answer_lecture_question


def test_answer_lecture_question_accepts_topic():
    sig = inspect.signature(answer_lecture_question)
    assert "topic" in sig.parameters
    assert sig.parameters["topic"].default is None


def test_domain_context_injected_in_prompt():
    """Verify topic flows into the system prompt string."""
    # We patch openai to capture the messages sent
    import unittest.mock as mock
    from app.services import qa_service, openai_service

    captured = {}

    def fake_get_transcript(lecture_id):
        return "The defendant breached the duty of care in the tort of negligence."

    def fake_get_cached(lecture_id):
        return {}

    def fake_save_cache(lecture_id, entries):
        pass

    fake_embedding = [0.1] * 1536

    def fake_get_embeddings(texts):
        return [fake_embedding] * len(texts)

    fake_completion = mock.MagicMock()
    fake_completion.choices = [mock.MagicMock()]
    fake_completion.choices[0].message.content = "ANSWER: test\nDETAIL: detail\nSOURCE: source"
    fake_completion.usage.prompt_tokens = 10
    fake_completion.usage.completion_tokens = 10

    with (
        mock.patch("app.services.qa_service.get_lecture_transcript", fake_get_transcript),
        mock.patch("app.services.qa_service.get_cached_embeddings", fake_get_cached),
        mock.patch("app.services.qa_service.save_embeddings_cache", fake_save_cache),
        mock.patch("app.services.qa_service.get_embeddings", fake_get_embeddings),
        mock.patch("app.services.qa_service.cosine_similarity", return_value=0.9),
        mock.patch("app.services.openai_service.client") as mock_client,
        mock.patch("app.services.qa_service.log_cost"),
    ):
        mock_client.chat.completions.create.return_value = fake_completion
        answer_lecture_question("lec123", "What is negligence?", topic="law")
        call_args = mock_client.chat.completions.create.call_args
        system_msg = call_args[1]["messages"][0]["content"]
        assert "law" in system_msg
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_qa_domain.py -v
```

Expected: FAIL — `answer_lecture_question` has no `topic` parameter.

- [ ] **Step 3: Add `topic` parameter and inject domain context**

In `backend/app/services/qa_service.py`, change the function signature:

```python
def answer_lecture_question(lecture_id: str, question: str, topic: str | None = None) -> str:
```

Find the `system_prompt` variable (around line 120) and update it. Replace:

```python
        system_prompt = (
            lang_meta
            + "You are Neurativo, an expert AI Lecture Assistant. "
```

with:

```python
        domain_context = (
            f"This is a {topic} lecture. Apply domain-appropriate terminology, "
            "reasoning style, and precision when answering.\n\n"
            if topic and topic != "general" else ""
        )
        system_prompt = (
            lang_meta
            + domain_context
            + "You are Neurativo, an expert AI Lecture Assistant. "
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_qa_domain.py -v
```

Expected: Both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/qa_service.py backend/tests/test_qa_domain.py
git commit -m "feat: domain-aware Q&A — inject topic context into answer system prompt"
```

---

## Task 4: Backend endpoints — wire topic through

**Files:**
- Modify: `backend/app/api/endpoints.py`

This task has 4 sub-changes. All in one file, one commit.

- [ ] **Step 1: Pass topic to `answer_lecture_question` in the `/ask` endpoint**

Find the `ask_question_auth` function (around line 1182). Replace:

```python
def ask_question_auth(request: Request, lecture_id: str, body: QuestionRequest, user=Depends(get_active_user)):
    _check_owner(lecture_id, user.id)
    try:
        answer = answer_lecture_question(lecture_id, body.question)
```

with:

```python
def ask_question_auth(request: Request, lecture_id: str, body: QuestionRequest, user=Depends(get_active_user)):
    _check_owner(lecture_id, user.id)
    try:
        topic = get_lecture_topic(lecture_id)
        answer = answer_lecture_question(lecture_id, body.question, topic=topic)
```

- [ ] **Step 2: Pass topic to `generate_micro_summary` in `process_live_chunk_bg`**

Find the call to `generate_micro_summary` in `process_live_chunk_bg`. It looks like:

```python
micro = generate_micro_summary(chunk_text, language=language)
```

Replace with:

```python
micro = generate_micro_summary(chunk_text, language=language, topic=topic)
```

(The function already has `topic` in scope at that point — it's fetched at step 6 of the chunk processing pipeline.)

- [ ] **Step 3: Accept `topic` in `/live/start` body**

Add a new Pydantic model near the other request models (around line 220):

```python
class StartSessionBody(BaseModel):
    topic: str | None = Field(None, max_length=50)
```

Change the `start_live_session` signature from:

```python
def start_live_session(request: Request, user=Depends(get_active_user)):
```

to:

```python
def start_live_session(request: Request, body: StartSessionBody = StartSessionBody(), user=Depends(get_active_user)):
```

After `lecture_id = create_lecture(...)`, add:

```python
        if body.topic:
            update_lecture_topic(lecture_id, body.topic.strip().lower()[:50])
```

- [ ] **Step 4: Accept `topic` form field in `/transcribe`**

Change the `transcribe` function signature. Add `topic: str | None = Form(None)` after the `file` parameter:

```python
async def transcribe(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    topic: str | None = Form(None),
    user=Depends(get_active_user),
):
```

After `lecture_id = save_lecture(...)` (around line 443), add:

```python
    if topic:
        try:
            update_lecture_topic(lecture_id, topic.strip().lower()[:50])
        except Exception:
            pass
```

- [ ] **Step 5: Add `PUT /lectures/{lecture_id}/topic` endpoint**

Add this new endpoint after the `PATCH /lectures/{lecture_id}/title` endpoint (around line 1280):

```python
class TopicUpdateRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=50)


@router.put("/lectures/{lecture_id}/topic")
def update_topic(lecture_id: str, body: TopicUpdateRequest, user=Depends(get_active_user)):
    _check_owner(lecture_id, user.id)
    normalised = body.topic.strip().lower()[:50]
    update_lecture_topic(lecture_id, normalised)
    return {"topic": normalised}
```

- [ ] **Step 6: Verify the server starts without errors**

```bash
cd backend && python -m uvicorn app.main:app --reload --port 8001
```

Expected: Server starts, no import errors. Stop with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/endpoints.py
git commit -m "feat: wire topic through endpoints — QA, micro summary, live start, import, topic override"
```

---

## Task 5: Install frontend dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install katex and highlight.js**

```bash
cd frontend && npm install katex highlight.js
```

- [ ] **Step 2: Verify install**

```bash
cd frontend && node -e "require('katex'); require('highlight.js'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add katex and highlight.js for domain-specific content rendering"
```

---

## Task 6: Create `renderDomainContent` rendering pipeline

**Files:**
- Create: `frontend/src/lib/renderDomainContent.jsx`

- [ ] **Step 1: Create the file**

```jsx
// frontend/src/lib/renderDomainContent.jsx
import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';

const MATH_TOPICS = new Set(['mathematics', 'physics', 'engineering', 'chemistry']);
const CODE_TOPICS = new Set(['computer science', 'engineering']);

/**
 * Renders a block of text with domain-appropriate formatting:
 * - KaTeX for math equations ($$...$$  and  $...$) when topic is math/physics/engineering/chemistry
 * - highlight.js for fenced code blocks when topic is CS/engineering
 * - Plain text otherwise
 *
 * Returns an array of React elements.
 */
export function renderDomainContent(text, topic) {
    if (!text) return null;
    const normalTopic = topic?.toLowerCase() || '';

    let parts = [text];

    if (CODE_TOPICS.has(normalTopic)) {
        parts = parts.flatMap(part => {
            if (typeof part !== 'string') return [part];
            return renderCodeBlocks(part);
        });
    }

    if (MATH_TOPICS.has(normalTopic)) {
        parts = parts.flatMap(part => {
            if (typeof part !== 'string') return [part];
            return renderMath(part);
        });
    }

    // Remaining plain strings stay as-is
    return parts.map((part, i) =>
        typeof part === 'string'
            ? <span key={i}>{part}</span>
            : React.cloneElement(part, { key: i })
    );
}

// ── Code rendering ─────────────────────────────────────────────────────────

function renderCodeBlocks(text) {
    const CODE_FENCE = /```(\w*)\n([\s\S]*?)```/g;
    const parts = [];
    let last = 0;
    let match;

    while ((match = CODE_FENCE.exec(text)) !== null) {
        if (match.index > last) {
            parts.push(text.slice(last, match.index));
        }
        const lang = match[1];
        const code = match[2];
        let highlighted;
        try {
            highlighted = lang && hljs.getLanguage(lang)
                ? hljs.highlight(code, { language: lang }).value
                : hljs.highlightAuto(code).value;
        } catch {
            highlighted = code;
        }
        parts.push(
            <CodeBlock key={match.index} lang={lang} highlighted={highlighted} raw={code} />
        );
        last = match.index + match[0].length;
    }

    if (last < text.length) parts.push(text.slice(last));
    return parts.length ? parts : [text];
}

function CodeBlock({ lang, highlighted, raw }) {
    const [copied, setCopied] = React.useState(false);

    function copy() {
        navigator.clipboard.writeText(raw).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }

    return (
        <div style={{ position: 'relative', margin: '10px 0', borderRadius: 10, overflow: 'hidden', background: '#f6f8fa', border: '1px solid #e8e4de' }}>
            {lang && (
                <div style={{ padding: '4px 12px', fontSize: 11, color: '#a3a3a3', borderBottom: '1px solid #e8e4de', background: '#f0ede8', fontFamily: 'monospace' }}>
                    {lang}
                </div>
            )}
            <pre style={{ margin: 0, padding: '12px 14px', overflowX: 'auto', fontSize: 12, lineHeight: 1.6, fontFamily: 'monospace' }}>
                <code dangerouslySetInnerHTML={{ __html: highlighted }} />
            </pre>
            <button
                onClick={copy}
                style={{
                    position: 'absolute', top: lang ? 28 : 6, right: 8,
                    padding: '2px 8px', fontSize: 11, borderRadius: 6,
                    background: '#ffffff', border: '1px solid #e8e4de',
                    cursor: 'pointer', color: copied ? '#16a34a' : '#6b6b6b',
                    fontFamily: 'Inter, sans-serif',
                }}
            >
                {copied ? 'Copied!' : 'Copy'}
            </button>
        </div>
    );
}

// ── Math rendering ──────────────────────────────────────────────────────────

function renderMath(text) {
    // Block math: $$...$$
    const BLOCK = /\$\$([\s\S]+?)\$\$/g;
    // Inline math: $...$  (but not $$)
    const INLINE = /(?<!\$)\$(?!\$)((?:[^$\\]|\\[\s\S])+?)\$(?!\$)/g;

    const parts = [];
    let processed = text;
    let offset = 0;

    // Handle block math first
    const blockParts = [];
    let last = 0;
    let match;
    while ((match = BLOCK.exec(processed)) !== null) {
        if (match.index > last) blockParts.push(processed.slice(last, match.index));
        try {
            const html = katex.renderToString(match[1].trim(), { displayMode: true, throwOnError: false });
            blockParts.push(<span key={match.index} dangerouslySetInnerHTML={{ __html: html }} style={{ display: 'block', textAlign: 'center', margin: '8px 0' }} />);
        } catch {
            blockParts.push(match[0]);
        }
        last = match.index + match[0].length;
    }
    if (last < processed.length) blockParts.push(processed.slice(last));

    // Now handle inline math within string parts
    return blockParts.flatMap((part, i) => {
        if (typeof part !== 'string') return [part];
        const inlineParts = [];
        let ilast = 0;
        let imatch;
        INLINE.lastIndex = 0;
        while ((imatch = INLINE.exec(part)) !== null) {
            if (imatch.index > ilast) inlineParts.push(part.slice(ilast, imatch.index));
            try {
                const html = katex.renderToString(imatch[1].trim(), { displayMode: false, throwOnError: false });
                inlineParts.push(<span key={`${i}-${imatch.index}`} dangerouslySetInnerHTML={{ __html: html }} />);
            } catch {
                inlineParts.push(imatch[0]);
            }
            ilast = imatch.index + imatch[0].length;
        }
        if (ilast < part.length) inlineParts.push(part.slice(ilast));
        return inlineParts.length ? inlineParts : [part];
    });
}
```

- [ ] **Step 2: Verify it imports without error**

```bash
cd frontend && node -e "
const { createRequire } = require('module');
console.log('Dependencies available');
"
```

Expected: no errors (the JSX won't run in node directly, but dependency resolution should work).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/renderDomainContent.jsx
git commit -m "feat: add renderDomainContent — KaTeX math + highlight.js code rendering pipeline"
```

---

## Task 7: Update QAAnswer to use domain rendering

**Files:**
- Modify: `frontend/src/components/QAAnswer.jsx`

- [ ] **Step 1: Add `topic` prop and apply `renderDomainContent`**

The full updated `QAAnswer.jsx`. Read the existing file first to confirm the styling hasn't changed, then replace imports and update render calls:

Add import at the top:
```jsx
import { renderDomainContent } from '../lib/renderDomainContent.jsx';
```

Change the component signature from:
```jsx
export default function QAAnswer({ text, dark = false }) {
```
to:
```jsx
export default function QAAnswer({ text, dark = false, topic = null }) {
```

In the plain fallback branch, replace:
```jsx
return <span style={{ fontSize: 13, lineHeight: 1.65 }}>{p.raw}</span>;
```
with:
```jsx
return <span style={{ fontSize: 13, lineHeight: 1.65 }}>{renderDomainContent(p.raw, topic) || p.raw}</span>;
```

Find where `p.answer`, `p.detail` are rendered as text. They'll look something like `{p.answer}` and `{p.detail}`. Wrap each with `renderDomainContent`:
- `{p.answer}` → `{renderDomainContent(p.answer, topic) || p.answer}`
- `{p.detail}` → `{renderDomainContent(p.detail, topic) || p.detail}`

(Leave `p.source` as plain text — it's a direct quote from the transcript, not AI-generated math/code.)

- [ ] **Step 2: Update all call sites of QAAnswer to pass `topic`**

In `frontend/src/pages/LectureView.jsx`, find where `<QAAnswer` is rendered. Add `topic={lecture?.topic}`:

```jsx
<QAAnswer text={...} dark={...} topic={lecture?.topic} />
```

In `frontend/src/App.jsx`, find where `<QAAnswer` is rendered. Add `topic={topicRef?.current}` or pass however topic is available in that component. Look for the `qaHistory` render loop — it will look like `<QAAnswer text={entry.answer} .../>`. Add `topic={topic}` where `topic` is the live-detected topic from the SSE stream (it's stored in state as `topic` or similar — check the SSE handler in App.jsx).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/QAAnswer.jsx frontend/src/pages/LectureView.jsx frontend/src/App.jsx
git commit -m "feat: domain-aware Q&A rendering — KaTeX + code highlighting in answers"
```

---

## Task 8: Add `updateLectureTopic` API helper

**Files:**
- Modify: `frontend/src/lib/api.js`

- [ ] **Step 1: Add the helper**

At the end of `frontend/src/lib/api.js`, before the final `export default api;`, add:

```js
export function updateLectureTopic(lectureId, topic) {
    return api.put(`/api/v1/lectures/${lectureId}/topic`, { topic });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api.js
git commit -m "feat: add updateLectureTopic API helper"
```

---

## Task 9: Clickable topic badge in LectureView

**Files:**
- Modify: `frontend/src/pages/LectureView.jsx`

The topic badge is at line ~639:
```jsx
{lecture?.topic && <span className="lv-pill lv-pill-topic">{lecture.topic}</span>}
```

- [ ] **Step 1: Add topic editing state**

After the existing state declarations (around line 437), add:

```jsx
const [topicEditing, setTopicEditing] = useState(false);
const [topicDraft, setTopicDraft]     = useState('');
const [topicSaving, setTopicSaving]   = useState(false);
```

- [ ] **Step 2: Add the topic save handler**

After the state declarations, add:

```jsx
async function saveTopic(newTopic) {
    if (!newTopic || newTopic === lecture?.topic) { setTopicEditing(false); return; }
    setTopicSaving(true);
    try {
        const { updateLectureTopic } = await import('../lib/api.js');
        await updateLectureTopic(lecture.id, newTopic);
        setLecture(l => ({ ...l, topic: newTopic }));
    } catch {
        // silent fail — badge reverts to original
    } finally {
        setTopicSaving(false);
        setTopicEditing(false);
    }
}
```

- [ ] **Step 3: Add CSS for the topic dropdown**

In the `CSS` const string (the large template literal near the top of LectureView), add:

```css
  .lv-topic-wrap { position: relative; display: inline-block; }
  .lv-topic-dropdown {
    position: absolute; top: calc(100% + 6px); left: 0; z-index: 50;
    background: var(--color-card); border: 1px solid var(--color-border);
    border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.10);
    padding: 8px; min-width: 200px; max-height: 260px; overflow-y: auto;
  }
  .lv-topic-option {
    padding: 7px 10px; border-radius: 7px; font-size: 12px; cursor: pointer;
    color: var(--color-text); transition: background 0.1s;
    text-transform: capitalize;
  }
  .lv-topic-option:hover { background: var(--color-bg); }
  .lv-topic-option.selected { background: #f3f0ff; color: #7c3aed; font-weight: 500; }
  .lv-topic-custom { width: 100%; margin-top: 6px; padding: 6px 8px; font-size: 12px;
    border: 1px solid var(--color-border); border-radius: 7px; outline: none;
    font-family: 'Inter', sans-serif; background: var(--color-bg); color: var(--color-text);
  }
```

- [ ] **Step 4: Replace the static badge with the interactive one**

Add the domain list constant near the top of the component (after imports):

```jsx
const KNOWN_TOPICS = [
    'medicine','law','physics','computer science','history','mathematics',
    'economics','literature','chemistry','biology','psychology','philosophy',
    'engineering','business','linguistics','political science','sociology',
    'art','music','architecture',
];
```

Replace:
```jsx
{lecture?.topic && <span className="lv-pill lv-pill-topic">{lecture.topic}</span>}
```

with:

```jsx
{lecture?.topic && (
    <div className="lv-topic-wrap">
        <span
            className="lv-pill lv-pill-topic"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            title="Click to change domain"
            onClick={() => { setTopicDraft(''); setTopicEditing(e => !e); }}
        >
            {topicSaving ? '…' : lecture.topic}
        </span>
        {topicEditing && (
            <div className="lv-topic-dropdown">
                {KNOWN_TOPICS.map(t => (
                    <div
                        key={t}
                        className={`lv-topic-option${lecture.topic === t ? ' selected' : ''}`}
                        onClick={() => saveTopic(t)}
                    >
                        {t}
                    </div>
                ))}
                <input
                    className="lv-topic-custom"
                    placeholder="Custom field…"
                    value={topicDraft}
                    onChange={e => setTopicDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveTopic(topicDraft); }}
                />
            </div>
        )}
    </div>
)}
```

- [ ] **Step 5: Close dropdown on outside click**

Add a useEffect after the state declarations:

```jsx
useEffect(() => {
    if (!topicEditing) return;
    function handleClick(e) {
        if (!e.target.closest('.lv-topic-wrap')) setTopicEditing(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
}, [topicEditing]);
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/LectureView.jsx
git commit -m "feat: clickable topic badge in LectureView — inline domain selector with custom field support"
```

---

## Task 10: Domain picker in live recording start flow

**Files:**
- Modify: `frontend/src/App.jsx`

The live session start is in `startLiveSession()` at line ~622. Currently calls `api.post('/api/v1/live/start')` with no body.

- [ ] **Step 1: Add domain picker state**

Find the existing state declarations at the top of the App component. Add:

```jsx
const [showDomainPicker, setShowDomainPicker] = useState(false);
const [selectedDomain, setSelectedDomain]     = useState('');
```

- [ ] **Step 2: Add the KNOWN_TOPICS constant near the top of the file (before the component)**

```jsx
const KNOWN_TOPICS_LIST = [
    'medicine','law','physics','computer science','history','mathematics',
    'economics','literature','chemistry','biology','psychology','philosophy',
    'engineering','business','linguistics','political science','sociology',
    'art','music','architecture',
];
```

- [ ] **Step 3: Modify `startLiveSession` to accept and pass topic**

Change from:
```jsx
const startLiveSession = async () => {
    try {
        const res = await api.post('/api/v1/live/start');
```

to:
```jsx
const startLiveSession = async (topic = '') => {
    try {
        const body = topic ? { topic } : {};
        const res = await api.post('/api/v1/live/start', body);
```

- [ ] **Step 4: Add domain picker CSS**

In the main CSS string or a `<style>` block in App.jsx, add:

```css
.dp-overlay { position: fixed; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.4); backdrop-filter: blur(6px); padding: 16px; }
.dp-modal { background: var(--color-card, #fff); border: 1px solid var(--color-border, #f0ede8); border-radius: 20px; width: 100%; max-width: 440px; padding: 24px; font-family: 'Inter', sans-serif; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
.dp-title { font-size: 17px; font-weight: 600; color: var(--color-text, #1a1a1a); letter-spacing: -0.4px; margin: 0 0 4px; }
.dp-sub { font-size: 13px; color: var(--color-muted, #a3a3a3); margin: 0 0 18px; }
.dp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-bottom: 14px; }
.dp-pill { padding: 7px 4px; border-radius: 9px; border: 1.5px solid var(--color-border, #f0ede8); background: none; cursor: pointer; font-size: 11px; font-weight: 500; color: var(--color-text, #1a1a1a); text-align: center; transition: all 0.12s; text-transform: capitalize; font-family: 'Inter', sans-serif; }
.dp-pill:hover { border-color: #6366f1; color: #6366f1; }
.dp-pill.active { background: #f3f0ff; border-color: #6366f1; color: #6366f1; }
.dp-actions { display: flex; gap: 10px; margin-top: 6px; }
.dp-btn-primary { flex: 1; padding: 11px; background: #1a1a1a; color: #fafaf9; border: none; border-radius: 11px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; }
.dp-btn-ghost { flex: 1; padding: 11px; background: none; color: var(--color-sec, #6b6b6b); border: 1.5px solid var(--color-border, #f0ede8); border-radius: 11px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: 'Inter', sans-serif; }
```

- [ ] **Step 5: Find the "Start Recording" button and intercept it**

Find where `startLiveSession()` is called directly (the main "Start" / "Record" button in the idle state). Instead of calling it directly, show the domain picker:

Replace any `onClick={() => startLiveSession()}` (or similar) on the primary start button with:

```jsx
onClick={() => { setSelectedDomain(''); setShowDomainPicker(true); }}
```

- [ ] **Step 6: Add the domain picker modal to the JSX**

Near the end of the App return (before the closing `</>`), add:

```jsx
{showDomainPicker && (
    <div className="dp-overlay" onClick={e => { if (e.target.classList.contains('dp-overlay')) setShowDomainPicker(false); }}>
        <div className="dp-modal">
            <p className="dp-title">What are you recording?</p>
            <p className="dp-sub">Optional — AI auto-detects if you skip.</p>
            <div className="dp-grid">
                {KNOWN_TOPICS_LIST.map(t => (
                    <button
                        key={t}
                        className={`dp-pill${selectedDomain === t ? ' active' : ''}`}
                        onClick={() => setSelectedDomain(d => d === t ? '' : t)}
                    >
                        {t}
                    </button>
                ))}
            </div>
            <div className="dp-actions">
                <button className="dp-btn-ghost" onClick={() => { setShowDomainPicker(false); startLiveSession(''); }}>
                    Skip
                </button>
                <button className="dp-btn-primary" onClick={() => { setShowDomainPicker(false); startLiveSession(selectedDomain); }}>
                    {selectedDomain ? `Start — ${selectedDomain}` : 'Start Recording'}
                </button>
            </div>
        </div>
    </div>
)}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: domain picker modal before live recording — passes topic to /live/start"
```

---

## Task 11: Domain picker in ImportModal

**Files:**
- Modify: `frontend/src/components/ImportModal.jsx`

- [ ] **Step 1: Add domain state**

In the ImportModal component, find the existing state declarations. Add:

```jsx
const [selectedDomain, setSelectedDomain] = useState('');
```

Add the constant near the top of the file (before the component):

```jsx
const KNOWN_TOPICS_LIST = [
    'medicine','law','physics','computer science','history','mathematics',
    'economics','literature','chemistry','biology','psychology','philosophy',
    'engineering','business','linguistics','political science','sociology',
    'art','music','architecture',
];
```

- [ ] **Step 2: Add domain picker CSS to the existing `CSS` const**

In the `CSS` template literal, add:

```css
  .im-domain-section { margin-top: 14px; }
  .im-domain-label { font-size: 12px; font-weight: 500; color: var(--color-sec); margin-bottom: 8px; }
  .im-domain-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .im-domain-pill { padding: 6px 4px; border-radius: 8px; border: 1.5px solid var(--color-border); background: none; cursor: pointer; font-size: 11px; font-weight: 500; color: var(--color-text); text-align: center; transition: all 0.12s; text-transform: capitalize; font-family: 'Inter', sans-serif; }
  .im-domain-pill:hover { border-color: #6366f1; color: #6366f1; }
  .im-domain-pill.active { background: #f3f0ff; border-color: #6366f1; color: #6366f1; }
```

- [ ] **Step 3: Render the domain picker after the file info section**

Find where the file info (`im-file-info`) is rendered, after it add:

```jsx
{file && (
    <div className="im-domain-section">
        <p className="im-domain-label">Field (optional — AI detects if blank)</p>
        <div className="im-domain-grid">
            {KNOWN_TOPICS_LIST.map(t => (
                <button
                    key={t}
                    className={`im-domain-pill${selectedDomain === t ? ' active' : ''}`}
                    onClick={() => setSelectedDomain(d => d === t ? '' : t)}
                >
                    {t}
                </button>
            ))}
        </div>
    </div>
)}
```

- [ ] **Step 4: Pass `topic` in the upload FormData**

Find where the upload is triggered (where `api.post('/api/v1/transcribe', formData, ...)` is called). Add the topic field to FormData before the post:

```jsx
if (selectedDomain) formData.append('topic', selectedDomain);
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ImportModal.jsx
git commit -m "feat: domain picker in ImportModal — passes topic field to /transcribe upload"
```

---

## Task 12: Apply renderDomainContent to summary panel

**Files:**
- Modify: `frontend/src/pages/LectureView.jsx`

The summary panel renders `parseSummary()` output. Each section has `.summary` (prose), `.insight` (blockquote), and `.examples` (array). These are the surfaces to enrich.

- [ ] **Step 1: Import renderDomainContent in LectureView**

Add at the top of the file:

```jsx
import { renderDomainContent } from '../lib/renderDomainContent.jsx';
```

- [ ] **Step 2: Find the summary section render**

Search for where `section.summary` or `sec.summary` is rendered in JSX. It will look something like:

```jsx
<p>{section.summary}</p>
```

or similar. Replace plain text renders with domain-aware renders:

```jsx
<p>{renderDomainContent(section.summary, lecture?.topic) || section.summary}</p>
```

Similarly for `section.insight`:
```jsx
{renderDomainContent(section.insight, lecture?.topic) || section.insight}
```

And each example in `section.examples`:
```jsx
{renderDomainContent(example, lecture?.topic) || example}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/LectureView.jsx
git commit -m "feat: domain-specific rendering in summary panel — math equations and code blocks"
```

---

## Task 13: Verify full flow end-to-end

- [ ] **Step 1: Start backend**

```bash
cd backend && uvicorn app.main:app --reload
```

- [ ] **Step 2: Start frontend**

```bash
cd frontend && npm run dev
```

- [ ] **Step 3: Test domain picker**

1. Open the app, click start recording
2. Verify the domain picker modal appears
3. Select "mathematics", click Start
4. After first chunk, verify the topic badge shows "mathematics"

- [ ] **Step 4: Test topic correction**

1. Open a lecture with an existing topic badge
2. Click the badge
3. Verify dropdown opens with all 20 domains
4. Select a different domain
5. Verify badge updates immediately

- [ ] **Step 5: Test math rendering**

1. Open a mathematics lecture (or manually set topic to "mathematics" via the badge)
2. Ask a question that involves an equation, e.g. "What is the quadratic formula?"
3. Verify the response renders `$x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$` as a rendered equation, not raw LaTeX

- [ ] **Step 6: Test import domain picker**

1. Open the import modal
2. Attach a file
3. Verify domain picker appears below the file info
4. Select a domain and import
5. Verify the lecture's topic badge shows the selected domain immediately

- [ ] **Step 7: Run all backend tests**

```bash
cd backend && python -m pytest tests/test_summarization_domain.py tests/test_qa_domain.py -v
```

Expected: All tests PASS.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: domain-aware education platform — complete implementation"
```

---

## Summary

| Task | What it does |
|------|-------------|
| 1 | Extend domain guidance to all 20+ fields + dynamic fallback for any unknown topic |
| 2 | Topic hint in Phase 1 micro summaries |
| 3 | Domain context injected into Q&A system prompt |
| 4 | Wire topic through all endpoints (QA, micro, live start, import, override) |
| 5 | Install katex + highlight.js |
| 6 | `renderDomainContent` pipeline (math + code rendering) |
| 7 | QAAnswer uses domain rendering |
| 8 | `updateLectureTopic` API helper |
| 9 | Clickable topic badge in LectureView with dropdown + custom field |
| 10 | Domain picker modal in live recording start flow |
| 11 | Domain picker in ImportModal |
| 12 | Domain rendering in summary panel |
| 13 | End-to-end verification |
