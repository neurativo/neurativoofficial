# PDF Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the lecture PDF export to the best student study document possible — active recall Q&A, anti-hallucination content fixes, domain-aware colours, TOC, cheat sheet, mnemonics, common mistakes, and notes lines.

**Architecture:** Two files change. `pdf_service.py` gains three new GPT helpers (`_call_common_mistakes`, `_call_mnemonics`, `_get_domain_color`), fixes the forced-content bug in `_call_enrich_section`, and passes four new context variables to the template. `lecture_template.html` is upgraded in place: new CSS classes, cover tiles, TOC, active-recall Q&A fold lines, common mistakes callouts, glossary mnemonics, per-section notes lines, and a cheat-sheet final page.

**Tech Stack:** Python/FastAPI, OpenAI gpt-4o-mini, Jinja2, Playwright, HTML/CSS

---

## File Map

| File | Change |
|------|--------|
| `backend/app/services/pdf_service.py` | Fix `_call_enrich_section` prompt; add `_get_domain_color`, `_call_common_mistakes`, `_call_mnemonics`; wire both new GPT calls into `generate_lecture_pdf`; register `truncate_words` Jinja2 filter; add `accent_color`, `common_mistakes` context vars; merge mnemonics into glossary |
| `backend/app/templates/lecture_template.html` | New CSS classes; body accent variable; cover tiles; TOC; section watermarks; active-recall Q&A; common mistakes section; glossary mnemonics; notes lines; cheat sheet; page breaks; section reorder |
| `backend/tests/test_pdf_service.py` | New file — unit tests for all new/changed service functions |

---

### Task 1: Fix `_call_enrich_section` + add `_get_domain_color` + tests

**Files:**
- Modify: `backend/app/services/pdf_service.py:33-36,161-173`
- Create: `backend/tests/test_pdf_service.py`

- [ ] **Step 1: Create `backend/tests/test_pdf_service.py` with failing tests**

```python
import json
import pytest
from unittest.mock import MagicMock, patch


def _make_chat_response(content: str, prompt_tokens: int = 10, completion_tokens: int = 20):
    resp = MagicMock()
    resp.choices = [MagicMock()]
    resp.choices[0].message.content = content
    resp.usage.prompt_tokens = prompt_tokens
    resp.usage.completion_tokens = completion_tokens
    return resp


# ── _get_domain_color ──────────────────────────────────────────────────────────

def test_get_domain_color_medicine():
    from app.services.pdf_service import _get_domain_color
    assert _get_domain_color("medicine") == "#DC2626"

def test_get_domain_color_law():
    from app.services.pdf_service import _get_domain_color
    assert _get_domain_color("law") == "#1E3A5F"

def test_get_domain_color_cs():
    from app.services.pdf_service import _get_domain_color
    assert _get_domain_color("computer science") == "#4F46E5"

def test_get_domain_color_physics():
    from app.services.pdf_service import _get_domain_color
    assert _get_domain_color("physics") == "#0D9488"

def test_get_domain_color_unknown_returns_default():
    from app.services.pdf_service import _get_domain_color
    assert _get_domain_color("basket weaving") == "#2563EB"

def test_get_domain_color_none_returns_default():
    from app.services.pdf_service import _get_domain_color
    assert _get_domain_color(None) == "#2563EB"


# ── _call_enrich_section — anti-hallucination ──────────────────────────────────

def test_enrich_section_accepts_empty_concepts_and_examples():
    """GPT returning empty arrays must not be rejected — the fix removes the forced-content rule."""
    payload = json.dumps({
        "title": "Action Potential Propagation",
        "prose": "The action potential travels along the axon.",
        "bullets": ["Depolarisation occurs first"],
        "concepts": [],
        "examples": [],
    })
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_enrich_section
        result = _call_enrich_section("some section text", 0, 3, "medicine", "en")

    assert result["concepts"] == []
    assert result["examples"] == []
    assert result["title"] == "Action Potential Propagation"


def test_enrich_section_prompt_forbids_invented_content():
    """The prompt sent to GPT must NOT contain the forced-content instruction."""
    captured = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        return _make_chat_response(json.dumps({
            "title": "T", "prose": "p", "bullets": [], "concepts": [], "examples": []
        }))

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.side_effect = fake_create
        from app.services.pdf_service import _call_enrich_section
        _call_enrich_section("text", 0, 1, None, "en")

    prompt = captured["messages"][0]["content"]
    assert "must not be empty" not in prompt
    assert "Never invent" in prompt or "only if" in prompt.lower()
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_pdf_service.py -v 2>&1 | tail -20
```
Expected: `ImportError` or `AssertionError` — `_get_domain_color` does not exist yet; `_call_enrich_section` prompt still has the bad rule.

- [ ] **Step 3: Add `_get_domain_color` to `pdf_service.py` after `_get_domain_labels`**

Find the block (around line 33):
```python
def _get_domain_labels(topic: str | None) -> tuple[str, str, str]:
    if not topic:
        return _DEFAULT_LABELS
    return _DOMAIN_LABELS.get(topic.lower(), _DEFAULT_LABELS)
```

Add immediately after it:
```python

_DOMAIN_COLORS = {
    "medicine":         "#DC2626",
    "nursing":          "#DC2626",
    "pharmacy":         "#DC2626",
    "law":              "#1E3A5F",
    "legal":            "#1E3A5F",
    "computer science": "#4F46E5",
    "software":         "#4F46E5",
    "engineering":      "#4F46E5",
    "physics":          "#0D9488",
    "mathematics":      "#0D9488",
    "chemistry":        "#0D9488",
    "history":          "#92400E",
    "social sciences":  "#92400E",
    "business":         "#059669",
    "economics":        "#059669",
}
_DEFAULT_COLOR = "#2563EB"


def _get_domain_color(topic: str | None) -> str:
    if not topic:
        return _DEFAULT_COLOR
    return _DOMAIN_COLORS.get(topic.lower(), _DEFAULT_COLOR)
```

- [ ] **Step 4: Fix `_call_enrich_section` prompt — remove forced-content rule**

Find (around line 168):
```python
                    "- \"concepts\": Array of exactly 3 key concept names from this section "
                    "(single nouns or short noun phrases, e.g. 'Action Potential', 'Ohm's Law')\n"
                    "- \"examples\": Array of exactly 2 concrete real-world examples or applications "
                    "from this section (one sentence each)\n"
                    "IMPORTANT: All 5 fields are required. concepts and examples must not be empty.\n"
```

Replace with:
```python
                    "- \"concepts\": Array of key concept names explicitly named or defined in this section "
                    "(single nouns or short noun phrases, e.g. 'Action Potential', 'Ohm\\'s Law'). "
                    "Return an empty array if no concepts were explicitly named.\n"
                    "- \"examples\": Array of concrete real-world examples or applications "
                    "the lecturer explicitly gave. Return an empty array if none were given. "
                    "Never invent examples that were not in the source text.\n"
                    "STRICT RULE: only include information explicitly present in the section text. "
                    "Empty arrays for concepts and examples are valid and preferred over invented content.\n"
```

- [ ] **Step 5: Run tests — all should pass**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_pdf_service.py -v 2>&1 | tail -20
```
Expected: All 8 tests pass.

- [ ] **Step 6: Commit**

```bash
cd D:/neurativoproject
git add backend/app/services/pdf_service.py backend/tests/test_pdf_service.py
git commit -m "feat: fix enrich_section anti-hallucination + add _get_domain_color"
```

---

### Task 2: Add `_call_common_mistakes` + wire into gather

**Files:**
- Modify: `backend/app/services/pdf_service.py`
- Modify: `backend/tests/test_pdf_service.py`

- [ ] **Step 1: Add failing tests to `test_pdf_service.py`**

Append to the file:
```python

# ── _call_common_mistakes ──────────────────────────────────────────────────────

def test_call_common_mistakes_returns_list_of_dicts():
    payload = json.dumps({"mistakes": [
        {"mistake": "Confusing mitosis with meiosis", "correction": "Mitosis produces identical diploid cells; meiosis produces haploid gametes."},
    ]})
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_common_mistakes
        result = _call_common_mistakes("transcript about cell division", "biology")

    assert isinstance(result, list)
    assert len(result) == 1
    assert result[0]["mistake"] == "Confusing mitosis with meiosis"
    assert "correction" in result[0]


def test_call_common_mistakes_returns_empty_when_none_mentioned():
    payload = json.dumps({"mistakes": []})
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_common_mistakes
        result = _call_common_mistakes("transcript", None)

    assert result == []


def test_call_common_mistakes_returns_empty_on_api_error():
    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.side_effect = Exception("API down")
        from app.services.pdf_service import _call_common_mistakes
        result = _call_common_mistakes("transcript", "physics")

    assert result == []
```

- [ ] **Step 2: Run new tests — confirm they fail**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_pdf_service.py::test_call_common_mistakes_returns_list_of_dicts -v 2>&1 | tail -10
```
Expected: `ImportError: cannot import name '_call_common_mistakes'`

- [ ] **Step 3: Add `_call_common_mistakes` to `pdf_service.py`**

After `_call_conceptual_map` function (around line 370, before `_render_pdf`), insert:

```python

def _call_common_mistakes(transcript: str, topic: str | None) -> list[dict]:
    """
    Identifies 2-3 genuine misconceptions the lecturer warned about, or classic
    logical traps students make. Returns [] if none were mentioned.
    STRICT: only returns mistakes grounded in the transcript.
    """
    if not _client:
        return []
    hint = f" Domain: {topic}." if topic else ""
    try:
        resp = _client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"TRANSCRIPT:\n{transcript[:5000]}\n\n"
                        f"Read this lecture transcript carefully.{hint} "
                        "Identify 2-3 genuine misconceptions the lecturer explicitly warned about, "
                        "or classic logical traps students make with this specific material. "
                        "STRICT RULE: return only mistakes that are clearly grounded in what was "
                        "actually said in this transcript. If the lecturer did not warn about any "
                        "misconceptions, return an empty mistakes array — do not invent warnings.\n"
                        'Return JSON: {"mistakes": [{"mistake": "...", "correction": "..."}]}'
                    ),
                }
            ],
            temperature=0.2,
            max_tokens=600,
            response_format={"type": "json_object"},
        )
        log_cost("pdf_common_mistakes", "gpt-4o-mini",
                 input_tokens=resp.usage.prompt_tokens,
                 output_tokens=resp.usage.completion_tokens)
        return json.loads(resp.choices[0].message.content).get("mistakes", [])
    except Exception as e:
        print(f"_call_common_mistakes error (non-fatal): {e}")
        return []
```

- [ ] **Step 4: Wire `_call_common_mistakes` into `generate_lecture_pdf`**

In `generate_lecture_pdf`, find the tasks list build section. After:
```python
    # Study roadmap — always generated (GPT-4o, curriculum positioning)
    tasks.append(asyncio.to_thread(
        _call_study_roadmap, topic, title,
        [s.split('\n')[0].strip() for s in raw_sections],
    ))
```

Add:
```python

    # Common mistakes — transcript-sourced only
    tasks.append(asyncio.to_thread(_call_common_mistakes, transcript, topic))
```

- [ ] **Step 5: Unpack `common_mistakes` from results**

Find the unpack section. After:
```python
    r = results[ri]; ri += 1
    study_roadmap: dict = r if not isinstance(r, Exception) else {"next_topics": [], "prerequisites": []}
```

Add:
```python

    r = results[ri]; ri += 1
    common_mistakes: list[dict] = r if not isinstance(r, Exception) else []
```

- [ ] **Step 6: Add `common_mistakes` to context dict**

Find the context dict. After `"visual_frames": visual_frames,`, add:
```python
        "common_mistakes":      common_mistakes,
```

- [ ] **Step 7: Run all tests**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_pdf_service.py -v 2>&1 | tail -20
```
Expected: All 11 tests pass.

- [ ] **Step 8: Verify import clean**

```bash
cd D:/neurativoproject/backend
python -c "from app.services.pdf_service import _call_common_mistakes, _get_domain_color; print('OK')"
```
Expected: `OK`

- [ ] **Step 9: Commit**

```bash
cd D:/neurativoproject
git add backend/app/services/pdf_service.py backend/tests/test_pdf_service.py
git commit -m "feat: add _call_common_mistakes — transcript-sourced misconceptions"
```

---

### Task 3: Add `_call_mnemonics` + merge + wire + new context vars

**Files:**
- Modify: `backend/app/services/pdf_service.py`
- Modify: `backend/tests/test_pdf_service.py`

- [ ] **Step 1: Add failing tests**

Append to `backend/tests/test_pdf_service.py`:
```python

# ── _call_mnemonics ────────────────────────────────────────────────────────────

def test_call_mnemonics_returns_merged_glossary():
    """Mnemonics are merged back into the glossary list by term name."""
    glossary = [
        {"term": "Mitosis", "definition": "Cell division producing identical daughter cells."},
        {"term": "Meiosis", "definition": "Cell division producing haploid gametes."},
    ]
    payload = json.dumps({"mnemonics": [
        {"term": "Mitosis", "mnemonic": "MITosis = MITtens — two identical hands"},
        {"term": "Meiosis", "mnemonic": None},
    ]})
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_mnemonics
        result = _call_mnemonics(glossary)

    assert result[0]["mnemonic"] == "MITosis = MITtens — two identical hands"
    assert result[1].get("mnemonic") is None


def test_call_mnemonics_handles_api_error_gracefully():
    """On API error, original glossary list is returned unchanged."""
    glossary = [{"term": "ATP", "definition": "Energy currency of the cell."}]
    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.side_effect = Exception("timeout")
        from app.services.pdf_service import _call_mnemonics
        result = _call_mnemonics(glossary)

    assert result == glossary  # unchanged


def test_call_mnemonics_empty_glossary_returns_empty():
    from app.services.pdf_service import _call_mnemonics
    assert _call_mnemonics([]) == []
```

- [ ] **Step 2: Run new tests — confirm they fail**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_pdf_service.py::test_call_mnemonics_returns_merged_glossary -v 2>&1 | tail -10
```
Expected: `ImportError: cannot import name '_call_mnemonics'`

- [ ] **Step 3: Add `_call_mnemonics` to `pdf_service.py`**

After `_call_common_mistakes`, insert:

```python

def _call_mnemonics(glossary: list[dict]) -> list[dict]:
    """
    Generates memory hooks for glossary terms. Returns the same list with
    an optional "mnemonic" key added to each item (None where no natural
    mnemonic exists). Non-fatal: returns original list on any error.
    """
    if not _client or not glossary:
        return glossary
    terms_text = "\n".join(
        f"- {item['term']}: {item['definition']}" for item in glossary
    )
    try:
        resp = _client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"For each term below, generate ONE memory hook "
                        "(acronym, rhyme, analogy, or vivid image) that makes it stick. "
                        "Only generate a hook if one arises naturally from the term's meaning. "
                        "Return null for terms where forcing one would be artificial.\n\n"
                        f"Terms:\n{terms_text}\n\n"
                        'Return JSON: {"mnemonics": [{"term": "...", "mnemonic": "..." | null}]}'
                    ),
                }
            ],
            temperature=0.4,
            max_tokens=600,
            response_format={"type": "json_object"},
        )
        log_cost("pdf_mnemonics", "gpt-4o-mini",
                 input_tokens=resp.usage.prompt_tokens,
                 output_tokens=resp.usage.completion_tokens)
        mnemonic_map = {
            m["term"]: m.get("mnemonic")
            for m in json.loads(resp.choices[0].message.content).get("mnemonics", [])
        }
        for item in glossary:
            m = mnemonic_map.get(item["term"])
            if m is not None:
                item["mnemonic"] = m
        return glossary
    except Exception as e:
        print(f"_call_mnemonics error (non-fatal): {e}")
        return glossary
```

- [ ] **Step 4: Wire `_call_mnemonics` as a sequential second pass in `generate_lecture_pdf`**

`_call_mnemonics` needs the glossary result, so it runs AFTER the first `asyncio.gather`. Find the block after the glossary is unpacked:

```python
    glossary: list[dict] = results[ri] if not isinstance(results[ri], Exception) else []
    ri += 1
```

Add immediately after:
```python

    # Mnemonics — sequential second pass (needs glossary result)
    if glossary:
        try:
            glossary = await asyncio.to_thread(_call_mnemonics, glossary)
        except Exception as e:
            print(f"mnemonics pass error (non-fatal): {e}")
```

- [ ] **Step 5: Add `truncate_words` Jinja2 filter + new context vars**

Find in `generate_lecture_pdf`:
```python
    env.filters["format_time"] = _fmt_time_mmss
```

Add after it:
```python
    def _truncate_words(s: str, n: int) -> str:
        words = str(s).split()
        return (" ".join(words[:n]) + "…") if len(words) > n else str(s)
    env.filters["truncate_words"] = _truncate_words
```

Then find the context dict and add below `"visual_frames": visual_frames,`:
```python
        "accent_color":         _get_domain_color(topic),
```

(Note: `common_mistakes` was already added in Task 2.)

- [ ] **Step 6: Run all tests**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_pdf_service.py -v 2>&1 | tail -20
```
Expected: All 14 tests pass.

- [ ] **Step 7: Verify import clean**

```bash
cd D:/neurativoproject/backend
python -c "from app.services.pdf_service import _call_mnemonics, generate_lecture_pdf; print('OK')"
```
Expected: `OK`

- [ ] **Step 8: Commit**

```bash
cd D:/neurativoproject
git add backend/app/services/pdf_service.py backend/tests/test_pdf_service.py
git commit -m "feat: add _call_mnemonics, truncate_words filter, accent_color context var"
```

---

### Task 4: Template — CSS, body accent, cover tiles, TOC

**Files:**
- Modify: `backend/app/templates/lecture_template.html`

- [ ] **Step 1: Change `<body>` tag to inject accent colour**

Find:
```html
<body>
```
Replace with:
```html
<body style="--accent: {{ accent_color }};">
```

- [ ] **Step 2: Add new CSS classes at end of `<style>` block (before `</style>`)**

Find `    </style>` and insert before it:

```css

        /* ─── TABLE OF CONTENTS ─────────────────────────────────────────── */
        .toc-page { page-break-after: always; padding-top: 4mm; }
        .toc-title-h { font-family: 'Lora', Georgia, serif; font-size: 15pt; font-weight: 700; color: var(--ink); margin: 0 0 6mm 0; }
        .toc-row { display: flex; align-items: baseline; gap: 4px; margin-bottom: 3.5mm; page-break-inside: avoid; }
        .toc-num { font-size: 8pt; font-weight: 700; color: var(--accent); min-width: 22px; }
        .toc-sec-title { font-family: 'Lora', Georgia, serif; font-size: 10pt; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 420px; }
        .toc-dots { flex: 1; border-bottom: 1px dotted var(--slate-300); margin: 0 4px 3px; }
        .toc-page-num { font-size: 8pt; color: var(--ink-4); font-family: 'Courier New', monospace; white-space: nowrap; }

        /* ─── COVER TILES ───────────────────────────────────────────────── */
        .cover-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-top: 2mm; }
        .cover-tile { border: 1px solid var(--slate-200); border-radius: 10px; padding: 4mm 5mm; background: #fafbfc; }
        .tile-value { font-family: 'Lora', Georgia, serif; font-size: 18pt; font-weight: 700; color: var(--ink); line-height: 1.1; margin-bottom: 2px; }
        .tile-label { font-size: 7pt; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-4); }

        /* ─── SECTION NUMBER WATERMARK ──────────────────────────────────── */
        .section-card { position: relative; }
        .section-num-bg { position: absolute; right: -2mm; top: -6mm; font-size: 52pt; font-weight: 700; color: #f1f5f9; font-family: 'Lora', serif; line-height: 1; pointer-events: none; user-select: none; z-index: 0; }
        .section-card-header { position: relative; z-index: 1; }

        /* ─── ACTIVE RECALL Q&A ─────────────────────────────────────────── */
        .review-question-block { border-left: 3px solid var(--accent); padding: 3mm 4mm; background: #ffffff; border-radius: 0 7px 7px 0; margin-bottom: 2mm; }
        .fold-line { position: relative; border-top: 1.5px dashed #cbd5e1; margin: 3mm 0; }
        .fold-label { position: absolute; top: -7px; left: 50%; transform: translateX(-50%); background: white; padding: 0 8px; font-size: 6.5pt; color: #94a3b8; letter-spacing: 0.4px; white-space: nowrap; }
        .review-answer-block { background: #f8fafc; border: 1px solid var(--slate-100); border-radius: 7px; padding: 3mm 4mm; }

        /* ─── COMMON MISTAKES ───────────────────────────────────────────── */
        .mistake-card { background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 3.5mm 5mm; margin-bottom: 3mm; page-break-inside: avoid; }
        .mistake-label { font-size: 7pt; font-weight: 700; color: #b45309; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 1.5mm; }
        .mistake-text { font-size: 9.5pt; font-weight: 600; color: #92400e; margin: 0 0 2mm 0; line-height: 1.55; }
        .correction-text { font-size: 9pt; color: #44403c; line-height: 1.65; }

        /* ─── GLOSSARY MNEMONIC ─────────────────────────────────────────── */
        .glossary-mnemonic { font-size: 8pt; color: #7c3aed; font-style: italic; margin-top: 2mm; line-height: 1.45; }

        /* ─── SECTION NOTES LINES ───────────────────────────────────────── */
        .section-notes { margin-top: 4mm; padding-top: 3mm; border-top: 1px solid #f1f5f9; }
        .notes-label { font-size: 6.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #d1d5db; margin-bottom: 2mm; }
        .notes-lines { height: 12mm; background-image: repeating-linear-gradient(to bottom, transparent, transparent 5.5mm, #e5e7eb 5.5mm, #e5e7eb 6mm); }

        /* ─── CHEAT SHEET ───────────────────────────────────────────────── */
        .cheat-sheet-page { page-break-before: always; }
        .cs-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6mm; margin-top: 4mm; }
        .cs-col-heading { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-4); border-bottom: 1.5px solid var(--slate-200); padding-bottom: 2mm; margin-bottom: 3mm; }
        .cs-term-row { display: flex; gap: 4px; margin-bottom: 2.5mm; font-size: 7.5pt; line-height: 1.4; }
        .cs-term { font-weight: 700; color: var(--ink); white-space: nowrap; }
        .cs-def { color: var(--ink-3); }
        .cs-pill { display: inline-block; background: var(--accent-lt); color: var(--accent); border: 0.5px solid var(--accent-mid); border-radius: 20px; padding: 1px 7px; font-size: 7pt; font-weight: 500; margin: 1.5px 2px; }
        .cs-takeaway { font-size: 8pt; color: var(--ink-2); line-height: 1.5; margin-bottom: 2.5mm; display: flex; gap: 5px; }
        .cs-takeaway-num { font-weight: 700; color: var(--accent); min-width: 14px; }
        .cs-footer { text-align: center; font-size: 7pt; color: var(--ink-4); margin-top: 5mm; border-top: 1px solid var(--slate-100); padding-top: 3mm; }

        /* ─── PAGE BREAK STRATEGY ───────────────────────────────────────── */
        .pb-before { page-break-before: always; }
```

- [ ] **Step 3: Replace cover-meta with cover-tiles**

Find the `cover-meta` block:
```html
            <div class="cover-meta">
                <div class="cover-meta-item">
                    <div class="cover-meta-label">Date</div>
                    <div class="cover-meta-value">{{ created_at }}</div>
                </div>
                <div class="cover-meta-item">
                    <div class="cover-meta-label">Duration</div>
                    <div class="cover-meta-value">{{ duration_formatted }}</div>
                </div>
                <div class="cover-meta-item">
                    <div class="cover-meta-label">Words Spoken</div>
                    <div class="cover-meta-value">{{ word_count }}</div>
                </div>
                <div class="cover-meta-item">
                    <div class="cover-meta-label">Est. Reading Time</div>
                    <div class="cover-meta-value">{{ reading_time_minutes }} min</div>
                </div>
                <div class="cover-meta-item">
                    <div class="cover-meta-label">Sections</div>
                    <div class="cover-meta-value">{{ total_sections }}</div>
                </div>
                {% if total_concepts %}
                <div class="cover-meta-item">
                    <div class="cover-meta-label">Concepts</div>
                    <div class="cover-meta-value">{{ total_concepts }}</div>
                </div>
                {% endif %}
                {% if qa_pairs %}
                <div class="cover-meta-item">
                    <div class="cover-meta-label">Q&amp;A Pairs</div>
                    <div class="cover-meta-value">{{ qa_pairs }}</div>
                </div>
                {% endif %}
            </div>
```

Replace with:
```html
            <div class="cover-tiles">
                <div class="cover-tile">
                    <div class="tile-value">{{ created_at }}</div>
                    <div class="tile-label">Date</div>
                </div>
                <div class="cover-tile">
                    <div class="tile-value">{{ duration_formatted }}</div>
                    <div class="tile-label">Duration</div>
                </div>
                <div class="cover-tile">
                    <div class="tile-value">{{ word_count }}</div>
                    <div class="tile-label">Words Spoken</div>
                </div>
                <div class="cover-tile">
                    <div class="tile-value">{{ reading_time_minutes }} min</div>
                    <div class="tile-label">Est. Reading</div>
                </div>
                <div class="cover-tile">
                    <div class="tile-value">{{ total_sections }}</div>
                    <div class="tile-label">Sections</div>
                </div>
                {% if qa_pairs %}
                <div class="cover-tile">
                    <div class="tile-value">{{ qa_pairs }}</div>
                    <div class="tile-label">Q&amp;A Pairs</div>
                </div>
                {% endif %}
            </div>
```

- [ ] **Step 4: Add Table of Contents after the cover div**

Find `<!-- ══════════════════════════════════════════` just before `EXECUTIVE SUMMARY`. Add before it:

```html

    <!-- ══════════════════════════════════════════
         TABLE OF CONTENTS
    ══════════════════════════════════════════ -->
    {% if enriched_sections | length > 1 %}
    <div class="toc-page">
        <div class="eyebrow-row" style="padding-top: 2mm;">
            <span class="eyebrow-label">Contents</span>
        </div>
        <hr class="eyebrow-rule">
        <div class="toc-title-h">Table of Contents</div>

        {% if executive_summary %}
        <div class="toc-row">
            <span class="toc-num">—</span>
            <span class="toc-sec-title">Executive Summary</span>
            <span class="toc-dots"></span>
            <span class="toc-page-num">p. ~2</span>
        </div>
        {% endif %}

        {% for sec in enriched_sections %}
        <div class="toc-row">
            <span class="toc-num">{{ "%02d"|format(loop.index) }}</span>
            <span class="toc-sec-title">{{ sec.title }}</span>
            <span class="toc-dots"></span>
            <span class="toc-page-num">p. ~{{ (3 + loop.index * 1.5) | int }}</span>
        </div>
        {% endfor %}

        {% if conceptual_map %}
        <div class="toc-row">
            <span class="toc-num">—</span>
            <span class="toc-sec-title">Conceptual Map</span>
            <span class="toc-dots"></span>
            <span class="toc-page-num">p. ~{{ (3 + enriched_sections|length * 1.5 + 1) | int }}</span>
        </div>
        {% endif %}

        {% if quick_review %}
        <div class="toc-row">
            <span class="toc-num">—</span>
            <span class="toc-sec-title">Self-Test ({{ quick_review|length }} Questions)</span>
            <span class="toc-dots"></span>
            <span class="toc-page-num">p. ~{{ (3 + enriched_sections|length * 1.5 + 3) | int }}</span>
        </div>
        {% endif %}

        <div class="toc-row">
            <span class="toc-num">—</span>
            <span class="toc-sec-title">Cheat Sheet</span>
            <span class="toc-dots"></span>
            <span class="toc-page-num">last</span>
        </div>
    </div>
    {% endif %}

```

- [ ] **Step 5: Add `pb-before` class to each major section eyebrow-row**

Find each `<div class="eyebrow-row">` that starts a major document section and add the `pb-before` class:

For Executive Summary (first eyebrow after TOC):
```html
    <div class="eyebrow-row pb-before">
```

For Section Breakdown eyebrow:
```html
    <div class="eyebrow-row pb-before">
```

For Conceptual Map eyebrow:
```html
    <div class="eyebrow-row pb-before">
```

For Key Takeaways eyebrow:
```html
    <div class="eyebrow-row pb-before">
```

For Glossary eyebrow:
```html
    <div class="eyebrow-row pb-before" style="padding-top: 10mm;">
```
→ remove the inline `padding-top` since `pb-before` handles the page break:
```html
    <div class="eyebrow-row pb-before">
```

For Visual Content eyebrow (if any):
```html
    <div class="eyebrow-row pb-before">
```

For Self-Test eyebrow:
```html
    <div class="eyebrow-row pb-before" style="padding-top: 10mm;">
```
→ same, remove inline padding:
```html
    <div class="eyebrow-row pb-before">
```

For Learning Path eyebrow:
```html
    <div class="eyebrow-row pb-before" style="padding-top: 10mm;">
```
→ remove inline padding:
```html
    <div class="eyebrow-row pb-before">
```

- [ ] **Step 6: Verify template renders without Jinja2 errors**

```bash
cd D:/neurativoproject/backend
python -c "
from jinja2 import Environment, FileSystemLoader
import os
template_dir = os.path.join('app', 'templates')
env = Environment(loader=FileSystemLoader(template_dir))
t = env.get_template('lecture_template.html')
html = t.render(
    title='Test', created_at='2026-04-21', duration_formatted='45m 0s',
    word_count='5,000', reading_time_minutes=12, total_sections=3, qa_pairs=5,
    total_concepts=9, language='EN', topic='medicine', accent_color='#DC2626',
    executive_summary='Test summary.', enriched_sections=[
        {'title': 'Sec 1', 'lead_sentence': 'Lead.', 'prose': 'Prose.',
         'bullets': ['b1'], 'concepts': ['c1'], 'examples': ['e1']},
    ],
    conceptual_map=[], takeaways=['T1'], glossary=[
        {'term': 'ATP', 'definition': 'Energy currency.', 'mnemonic': 'A Tiny Powerhouse'}
    ],
    common_mistakes=[], visual_frames=[], quick_review=[
        {'question': 'Q1?', 'answer': 'A1.', 'difficulty': 'Recall'}
    ],
    study_roadmap={'prerequisites': [], 'next_topics': []},
    section_label='Clinical Breakdown', review_label='Board Exam Prep',
    glossary_label='Clinical Terms', summary_html='', compression_ratio=0.0,
)
print('OK', len(html), 'chars')
"
```
Expected: `OK NNNNN chars` (no errors)

- [ ] **Step 7: Commit**

```bash
cd D:/neurativoproject
git add backend/app/templates/lecture_template.html
git commit -m "feat: template — CSS classes, body accent, cover tiles, TOC, page breaks"
```

---

### Task 5: Template — section watermarks, active recall Q&A, common mistakes

**Files:**
- Modify: `backend/app/templates/lecture_template.html`

- [ ] **Step 1: Add section number watermark to each section card**

Find the section-card loop. The section card header currently looks like:
```html
    <div class="section-card">
        <div class="section-card-header">
```

Replace with:
```html
    <div class="section-card">
        <div class="section-num-bg">{{ "%02d"|format(loop.index) }}</div>
        <div class="section-card-header">
```

- [ ] **Step 2: Add notes lines to each section card**

Find the closing tag of section-card (after the examples block):
```html
    </div>
    {% endfor %}
    {% endif %}
```
The structure is: `</div>` for the last `{% if sec.examples %}` block, then `</div>` closing `section-card`. Find the `</div>` that closes `section-card` (the one just before `{% endfor %}`) and add the notes block before it:

The section card ends with:
```html
        {% endif %}
    </div>
    {% endfor %}
```

Change to:
```html
        {% endif %}

        <div class="section-notes">
            <div class="notes-label">My Notes</div>
            <div class="notes-lines"></div>
        </div>
    </div>
    {% endfor %}
```

- [ ] **Step 3: Restructure Q&A into active recall format**

Find the review-item block:
```html
    {% for item in quick_review %}
    <div class="review-item">
        <div class="review-header">
            <span class="review-num">Q{{ loop.index }}</span>
            <span class="review-dot">·</span>
            {% if item.difficulty == 'Recall' %}
            <span class="difficulty-badge diff-recall">Recall</span>
            {% elif item.difficulty == 'Understanding' %}
            <span class="difficulty-badge diff-understanding">Understanding</span>
            {% elif item.difficulty == 'Application' %}
            <span class="difficulty-badge diff-application">Application</span>
            {% else %}
            <span class="difficulty-badge diff-recall">{{ item.difficulty }}</span>
            {% endif %}
        </div>
        <div class="review-question">{{ item.question }}</div>
        <div class="review-answer">{{ item.answer }}</div>
    </div>
    {% endfor %}
```

Replace with:
```html
    {% for item in quick_review %}
    <div class="review-item">
        <div class="review-header">
            <span class="review-num">Q{{ loop.index }}</span>
            <span class="review-dot">·</span>
            {% if item.difficulty == 'Recall' %}
            <span class="difficulty-badge diff-recall">Recall</span>
            {% elif item.difficulty == 'Understanding' %}
            <span class="difficulty-badge diff-understanding">Understanding</span>
            {% elif item.difficulty == 'Application' %}
            <span class="difficulty-badge diff-application">Application</span>
            {% else %}
            <span class="difficulty-badge diff-recall">{{ item.difficulty }}</span>
            {% endif %}
        </div>
        <div class="review-question-block">
            <div class="review-question">{{ item.question }}</div>
        </div>
        <div class="fold-line">
            <span class="fold-label">✂ fold here to self-test</span>
        </div>
        <div class="review-answer-block">
            <div class="review-answer">{{ item.answer }}</div>
        </div>
    </div>
    {% endfor %}
```

- [ ] **Step 4: Add Common Mistakes section between Key Takeaways and Glossary**

Find the Glossary section opener:
```html
    {% if glossary %}
    <div class="eyebrow-row pb-before">
        <span class="eyebrow-label">{{ glossary_label }}</span>
    </div>
```

Insert before it:
```html
    <!-- ══════════════════════════════════════════
         COMMON MISTAKES
    ══════════════════════════════════════════ -->
    {% if common_mistakes %}
    <div class="eyebrow-row pb-before">
        <span class="eyebrow-label">Watch Out</span>
    </div>
    <hr class="eyebrow-rule">
    <h2>Common Mistakes</h2>

    {% for item in common_mistakes %}
    <div class="mistake-card">
        <div class="mistake-label">⚠ Misconception</div>
        <div class="mistake-text">{{ item.mistake }}</div>
        <div class="correction-text">✓ {{ item.correction }}</div>
    </div>
    {% endfor %}
    {% endif %}


```

- [ ] **Step 5: Verify template renders**

```bash
cd D:/neurativoproject/backend
python -c "
from jinja2 import Environment, FileSystemLoader
import os
env = Environment(loader=FileSystemLoader(os.path.join('app', 'templates')))
t = env.get_template('lecture_template.html')
html = t.render(
    title='Test', created_at='2026-04-21', duration_formatted='45m 0s',
    word_count='5,000', reading_time_minutes=12, total_sections=2, qa_pairs=3,
    total_concepts=6, language='EN', topic='physics', accent_color='#0D9488',
    executive_summary='Summary text.', enriched_sections=[
        {'title': 'Wave Mechanics', 'lead_sentence': 'Lead.', 'prose': 'Prose.',
         'bullets': ['b1','b2'], 'concepts': ['Wave','Frequency'], 'examples': []},
        {'title': 'Quantum States', 'lead_sentence': 'Lead2.', 'prose': 'Prose2.',
         'bullets': ['b3'], 'concepts': [], 'examples': ['e1']},
    ],
    conceptual_map=[{'heading': 'Connection', 'paragraph': 'Para.'}],
    takeaways=['T1','T2','T3'], glossary=[
        {'term': 'Wave', 'definition': 'Oscillation propagating through space.', 'mnemonic': 'WAVElet = small wave'},
        {'term': 'Quanta', 'definition': 'Discrete energy packets.'},
    ],
    common_mistakes=[
        {'mistake': 'Treating light as only a wave.', 'correction': 'Light exhibits both wave and particle properties.'}
    ],
    visual_frames=[], quick_review=[
        {'question': 'What is a quantum?', 'answer': 'Discrete energy unit.', 'difficulty': 'Recall'},
        {'question': 'Explain superposition.', 'answer': 'Particle exists in multiple states.', 'difficulty': 'Understanding'},
    ],
    study_roadmap={'prerequisites': [{'concept': 'Classical Mechanics', 'reason': 'Needed.'}],
                   'next_topics': [{'topic': 'Quantum Entanglement', 'reason': 'Follows.'}]},
    section_label='Derivations', review_label='Problem Practice',
    glossary_label='Formulary', summary_html='', compression_ratio=0.0,
)
print('OK', len(html), 'chars')
assert 'fold here to self-test' in html
assert 'Common Mistakes' in html
assert 'Wave Mechanics' in html
assert '01' in html
print('All assertions passed')
"
```
Expected: `OK NNNNN chars` then `All assertions passed`

- [ ] **Step 6: Commit**

```bash
cd D:/neurativoproject
git add backend/app/templates/lecture_template.html
git commit -m "feat: template — section watermarks, active recall Q&A, common mistakes"
```

---

### Task 6: Template — glossary mnemonics, notes lines already done, cheat sheet, final section order

**Files:**
- Modify: `backend/app/templates/lecture_template.html`

- [ ] **Step 1: Add mnemonic line to each glossary item**

Find in the glossary grid:
```html
        <div class="glossary-item">
            <div class="glossary-term">{{ item.term }}</div>
            <div class="glossary-def">{{ item.definition }}</div>
        </div>
```

Replace with:
```html
        <div class="glossary-item">
            <div class="glossary-term">{{ item.term }}</div>
            <div class="glossary-def">{{ item.definition }}</div>
            {% if item.mnemonic %}
            <div class="glossary-mnemonic">💡 {{ item.mnemonic }}</div>
            {% endif %}
        </div>
```

- [ ] **Step 2: Add Cheat Sheet section before Learning Path**

Find the Learning Path section opener:
```html
    {% if study_roadmap and (study_roadmap.prerequisites or study_roadmap.next_topics) %}
    <div class="eyebrow-row pb-before">
        <span class="eyebrow-label">Your Learning Path</span>
    </div>
```

Insert before it:
```html
    <!-- ══════════════════════════════════════════
         CHEAT SHEET
    ══════════════════════════════════════════ -->
    {% if glossary or takeaways or enriched_sections %}
    <div class="cheat-sheet-page">
        <div class="eyebrow-row">
            <span class="eyebrow-label">Quick Reference</span>
        </div>
        <hr class="eyebrow-rule">
        <h2>Cheat Sheet</h2>

        <div class="cs-grid">

            <!-- Column 1: Key Terms -->
            <div class="cs-col">
                <div class="cs-col-heading">Key Terms</div>
                {% for item in glossary %}
                <div class="cs-term-row">
                    <span class="cs-term">{{ item.term }}:</span>
                    <span class="cs-def">{{ item.definition | truncate_words(8) }}</span>
                </div>
                {% endfor %}
            </div>

            <!-- Column 2: Core Concepts (deduplicated) -->
            <div class="cs-col">
                <div class="cs-col-heading">Core Concepts</div>
                {% set seen = namespace(concepts=[]) %}
                {% for sec in enriched_sections %}
                    {% for c in sec.concepts %}
                        {% if c not in seen.concepts %}
                            {% set seen.concepts = seen.concepts + [c] %}
                            <span class="cs-pill">{{ c }}</span>
                        {% endif %}
                    {% endfor %}
                {% endfor %}
            </div>

            <!-- Column 3: Top Takeaways -->
            <div class="cs-col">
                <div class="cs-col-heading">Top Takeaways</div>
                {% for t in takeaways[:5] %}
                <div class="cs-takeaway">
                    <span class="cs-takeaway-num">{{ loop.index }}.</span>
                    <span>{{ t }}</span>
                </div>
                {% endfor %}
            </div>

        </div>

        <div class="cs-footer">Cut out and keep · Generated by Neurativo</div>
    </div>
    {% endif %}


```

- [ ] **Step 3: Verify final template renders with all features**

```bash
cd D:/neurativoproject/backend
python -c "
from jinja2 import Environment, FileSystemLoader
import os

def _truncate_words(s, n):
    words = str(s).split()
    return (' '.join(words[:n]) + '…') if len(words) > n else str(s)

env = Environment(loader=FileSystemLoader(os.path.join('app', 'templates')))
env.filters['truncate_words'] = _truncate_words

def _fmt(s):
    m = (s or 0) // 60; sec = (s or 0) % 60
    return f'{m:02d}:{sec:02d}'
env.filters['format_time'] = _fmt

t = env.get_template('lecture_template.html')
html = t.render(
    title='Cell Biology', created_at='2026-04-21', duration_formatted='60m 0s',
    word_count='8,000', reading_time_minutes=18, total_sections=3, qa_pairs=5,
    total_concepts=9, language='EN', topic='medicine', accent_color='#DC2626',
    executive_summary='This lecture covers cell biology fundamentals.',
    enriched_sections=[
        {'title': 'Mitosis', 'lead_sentence': 'Cells divide.', 'prose': 'Mitosis produces two identical daughter cells.',
         'bullets': ['4 phases', 'DNA replication precedes'], 'concepts': ['Prophase','Metaphase'], 'examples': ['skin cell renewal']},
        {'title': 'Meiosis', 'lead_sentence': 'Sex cells form.', 'prose': 'Meiosis halves the chromosome count.',
         'bullets': ['2 divisions'], 'concepts': ['Crossing over'], 'examples': []},
        {'title': 'Cell Cycle', 'lead_sentence': 'Cells follow a cycle.', 'prose': 'The cell cycle has distinct phases.',
         'bullets': ['G1, S, G2, M'], 'concepts': [], 'examples': ['cancer disrupts cycle']},
    ],
    conceptual_map=[{'heading': 'Division Link', 'paragraph': 'Both mitosis and meiosis involve spindle formation.'}],
    takeaways=['Mitosis produces identical cells.', 'Meiosis produces gametes.', 'Checkpoints prevent errors.'],
    glossary=[
        {'term': 'Mitosis', 'definition': 'Division producing two identical diploid daughter cells.', 'mnemonic': 'MITtens = two identical gloves'},
        {'term': 'Meiosis', 'definition': 'Division producing four haploid gamete cells.'},
        {'term': 'Cytokinesis', 'definition': 'Physical division of the cytoplasm after nuclear division.', 'mnemonic': None},
    ],
    common_mistakes=[
        {'mistake': 'Confusing mitosis with meiosis.', 'correction': 'Mitosis = identical diploid cells; meiosis = haploid gametes.'}
    ],
    visual_frames=[], quick_review=[
        {'question': 'What are the phases of mitosis?', 'answer': 'Prophase, Metaphase, Anaphase, Telophase.', 'difficulty': 'Recall'},
        {'question': 'How does crossing over increase genetic diversity?', 'answer': 'Homologous chromosomes exchange segments during meiosis I.', 'difficulty': 'Understanding'},
    ],
    study_roadmap={'prerequisites': [{'concept': 'DNA Structure', 'reason': 'Required foundation.'}],
                   'next_topics': [{'topic': 'Genetics', 'reason': 'Builds on meiosis.'}]},
    section_label='Clinical Breakdown', review_label='Board Exam Prep',
    glossary_label='Clinical Terms', summary_html='', compression_ratio=0.0,
)
checks = [
    ('TOC', 'Table of Contents'),
    ('Cover tiles', 'cover-tile'),
    ('Watermark', 'section-num-bg'),
    ('Active recall fold', 'fold here to self-test'),
    ('Common mistakes', 'Common Mistakes'),
    ('Mnemonic', 'MITtens'),
    ('Notes lines', 'notes-lines'),
    ('Cheat sheet', 'Cheat Sheet'),
    ('CS pill', 'cs-pill'),
    ('Learning path', 'Your Learning Path'),
]
for label, needle in checks:
    assert needle in html, f'MISSING: {label} ({needle!r})'
    print(f'  ✓ {label}')
print('All checks passed. HTML length:', len(html))
"
```
Expected: All 10 checks print `✓` then `All checks passed`.

- [ ] **Step 4: Run full backend test suite**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/ --tb=short -q 2>&1 | tail -10
```
Expected: All tests pass (20 existing + 14 new = 34 total).

- [ ] **Step 5: Commit**

```bash
cd D:/neurativoproject
git add backend/app/templates/lecture_template.html
git commit -m "feat: template — glossary mnemonics, cheat sheet, complete PDF upgrade"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Fix `_call_enrich_section` forced content | Task 1 |
| `_get_domain_color()` helper | Task 1 |
| `_call_common_mistakes()` | Task 2 |
| Wire common_mistakes into gather + context | Task 2 |
| `_call_mnemonics()` | Task 3 |
| Merge mnemonics into glossary | Task 3 |
| `truncate_words` Jinja2 filter | Task 3 |
| `accent_color` context var | Task 3 |
| Body accent CSS variable | Task 4 |
| Cover tiles | Task 4 |
| Table of Contents | Task 4 |
| Page break strategy | Task 4 |
| Section number watermarks | Task 5 |
| Active recall Q&A fold format | Task 5 |
| Common mistakes section (amber callout) | Task 5 |
| Notes lines per section | Task 5 |
| Glossary mnemonic lines | Task 6 |
| Cheat sheet page (3-col: terms, concepts, takeaways) | Task 6 |
| Section order: TOC → Exec → Sections → Map → Takeaways → Mistakes → Glossary → Visual → Q&A → Cheat → Path | Tasks 4–6 |
| Anti-hallucination for all new GPT calls | Tasks 1–3 |
| Unit tests for all new/changed service functions | Tasks 1–3 |

All spec requirements covered. No placeholders. No TBDs.
