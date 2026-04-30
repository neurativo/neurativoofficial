# PDF Export Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three structural features to the Neurativo PDF export: per-section real-world analogy, per-section mistake+remember callout, and executive summary key stats grid.

**Architecture:** Two files change — `pdf_service.py` gains new GPT fields in `_call_enrich_section()` plus a new `_call_key_stats()` function, and `lecture_template.html` gains the corresponding HTML blocks. All new content is conditional on truthy values so PDFs degrade gracefully when GPT returns null.

**Tech Stack:** Python / FastAPI, OpenAI gpt-4o-mini, Jinja2, Playwright, pytest + unittest.mock

---

## File Map

| File | What changes |
|------|-------------|
| `backend/app/services/pdf_service.py` | `_call_enrich_section()`: +3 JSON fields, max_tokens 550→900. New `_call_key_stats()`. `generate_lecture_pdf()`: add key_stats task, remove common_mistakes task, add/update fallback dicts. |
| `backend/app/templates/lecture_template.html` | Section card: analogy box after section bar, mistake+remember box before notes. Exec summary: key stats grid after exec-card. Global Common Mistakes section: removed. |
| `backend/tests/test_pdf_service.py` | New tests for the 3 new fields in `_call_enrich_section()` and for `_call_key_stats()`. Remove tests for `_call_common_mistakes` (function is no longer called from the pipeline). |

---

## Task 1: Backend — Extend `_call_enrich_section()` with analogy, mistake, remember

**Files:**
- Modify: `backend/app/services/pdf_service.py:165-231`
- Test: `backend/tests/test_pdf_service.py`

- [ ] **Step 1: Write the failing tests**

Add these tests to `backend/tests/test_pdf_service.py` (append after line 169):

```python
# ── _call_enrich_section — new fields: analogy, mistake, remember ──────────────

def test_enrich_section_returns_analogy_field():
    """New analogy field must appear in result when GPT returns it."""
    payload = json.dumps({
        "title": "Ohm's Law",
        "prose": "Ohm's Law relates voltage, current, and resistance.",
        "bullets": ["V = IR"],
        "concepts": ["Ohm's Law"],
        "examples": [],
        "analogy": "Think of voltage as water pressure, current as flow rate, and resistance as pipe width.",
        "mistake": None,
        "remember": "V = IR always holds for ohmic conductors.",
    })
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_enrich_section
        result = _call_enrich_section("Ohm's Law section text", 0, 1, "physics", "en")

    assert "analogy" in result
    assert "Think of voltage as water pressure" in result["analogy"]


def test_enrich_section_analogy_none_when_gpt_returns_null():
    """Null analogy from GPT must be stored as None, not the string 'null'."""
    payload = json.dumps({
        "title": "Abstract Algebra",
        "prose": "Rings generalise fields.",
        "bullets": ["Rings have two operations"],
        "concepts": ["Ring"],
        "examples": [],
        "analogy": None,
        "mistake": None,
        "remember": "A ring must be closed under addition and multiplication.",
    })
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_enrich_section
        result = _call_enrich_section("algebra text", 0, 1, "mathematics", "en")

    assert result["analogy"] is None


def test_enrich_section_returns_mistake_and_remember_fields():
    """mistake and remember fields must be present in result."""
    payload = json.dumps({
        "title": "SEO Basics",
        "prose": "SEO improves organic search ranking.",
        "bullets": ["Keywords matter"],
        "concepts": ["SEO"],
        "examples": [],
        "analogy": "Think of Google as a librarian who ranks books by relevance.",
        "mistake": "Keyword stuffing — cramming keywords destroys readability and is penalised.",
        "remember": "Content quality and backlinks are the two pillars of effective SEO.",
    })
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_enrich_section
        result = _call_enrich_section("SEO text", 0, 2, "business", "en")

    assert "mistake" in result
    assert "remember" in result
    assert "Keyword stuffing" in result["mistake"]
    assert "two pillars" in result["remember"]


def test_enrich_section_no_client_includes_new_fields():
    """When _client is None (no API key), fallback dict must include analogy/mistake/remember."""
    with patch("app.services.pdf_service._client", None):
        from app.services.pdf_service import _call_enrich_section
        result = _call_enrich_section("some section", 0, 1, None, "en")

    assert "analogy" in result
    assert result["analogy"] is None
    assert "mistake" in result
    assert result["mistake"] is None
    assert "remember" in result
    assert result["remember"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_pdf_service.py::test_enrich_section_returns_analogy_field tests/test_pdf_service.py::test_enrich_section_analogy_none_when_gpt_returns_null tests/test_pdf_service.py::test_enrich_section_returns_mistake_and_remember_fields tests/test_pdf_service.py::test_enrich_section_no_client_includes_new_fields -v
```

Expected: 4 FAILs (KeyError or AssertionError — `analogy` key not in result)

- [ ] **Step 3: Implement the changes in `_call_enrich_section()`**

In `backend/app/services/pdf_service.py`, replace the entire `_call_enrich_section` function (lines 165–231) with:

```python
def _call_enrich_section(
    section_text: str,
    idx: int,
    total: int,
    topic: str | None,
    language: str,
) -> dict:
    if not _client:
        lead, rest = _extract_lead_sentence(section_text[:300])
        return {
            "title": f"Section {idx + 1}", "lead_sentence": lead, "prose": rest,
            "bullets": [], "concepts": [], "examples": [], "raw_section": section_text,
            "analogy": None, "mistake": None, "remember": None,
        }
    hint = f" Domain: {topic}." if topic else ""
    resp = _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "user",
                "content": (
                    "Note: The transcript may contain mixed languages. Extract meaning from all languages present. Respond in English.\n\n"
                    f"You are enriching section {idx + 1} of {total} from a lecture.{hint}\n"
                    f"Section summary:\n{section_text}\n\n"
                    "Return a JSON object with exactly these fields:\n"
                    "- \"title\": A crisp noun-phrase title describing specifically what concepts "
                    "are taught in THIS section (max 6 words). "
                    "FORBIDDEN generic titles: 'Introduction', 'Overview', 'Fundamentals', 'Basics', "
                    "'Summary', 'Review', 'Lecture Notes'. Name the actual concepts taught.\n"
                    "- \"prose\": 2-3 flowing sentences expanding the core idea. Present tense. No bullets.\n"
                    "- \"bullets\": Array of 3-5 specific key points as short strings\n"
                    "- \"concepts\": Array of key concept names explicitly named or defined in this section "
                    "(single nouns or short noun phrases, e.g. 'Action Potential', 'Ohm\\'s Law'). "
                    "Return an empty array if no concepts were explicitly named.\n"
                    "- \"examples\": Array of concrete real-world examples or applications "
                    "the lecturer explicitly gave. Return an empty array if none were given. "
                    "Never invent examples that were not in the source text.\n"
                    "- \"analogy\": A 2-3 sentence real-world analogy that makes this concept click. "
                    "Use 'Think of...' or 'Imagine...' framing. Only generate if a natural analogy "
                    "exists for this specific content. Return null if no natural analogy exists.\n"
                    "- \"mistake\": One specific misconception students commonly make with this "
                    "section's content. Grounded in the source material. Return null if none is "
                    "clearly identifiable.\n"
                    "- \"remember\": One key principle to remember from this section — a positive, "
                    "memorable one-sentence formulation. Always include.\n"
                    "STRICT RULE: only include information explicitly present in the section text. "
                    "Empty arrays for concepts and examples are valid and preferred over invented content.\n"
                    "Return only valid JSON."
                ),
            }
        ],
        temperature=0.3,
        max_tokens=900,
        response_format={"type": "json_object"},
    )
    log_cost("pdf_enrich_section", "gpt-4o-mini",
             input_tokens=resp.usage.prompt_tokens,
             output_tokens=resp.usage.completion_tokens)
    try:
        data = json.loads(resp.choices[0].message.content)
    except Exception:
        data = {}
    prose = data.get("prose", "")
    lead, rest = _extract_lead_sentence(prose)
    concepts = data.get("concepts") or []
    examples = data.get("examples") or []
    print(f"[enrich_section] s{idx + 1}/{total}: title={data.get('title')!r} concepts={concepts} examples={examples}")
    return {
        "title":         data.get("title", f"Section {idx + 1}"),
        "lead_sentence": lead,
        "prose":         rest,
        "bullets":       data.get("bullets") or [],
        "concepts":      concepts,
        "examples":      examples,
        "raw_section":   section_text,
        "analogy":       data.get("analogy") or None,
        "mistake":       data.get("mistake") or None,
        "remember":      data.get("remember") or None,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_pdf_service.py::test_enrich_section_returns_analogy_field tests/test_pdf_service.py::test_enrich_section_analogy_none_when_gpt_returns_null tests/test_pdf_service.py::test_enrich_section_returns_mistake_and_remember_fields tests/test_pdf_service.py::test_enrich_section_no_client_includes_new_fields -v
```

Expected: 4 PASSes

- [ ] **Step 5: Verify existing tests still pass**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_pdf_service.py -v
```

Expected: All tests pass (including original `test_enrich_section_accepts_empty_concepts_and_examples` etc.)

- [ ] **Step 6: Commit**

```bash
cd D:/neurativoproject/backend
git add app/services/pdf_service.py tests/test_pdf_service.py
git commit -m "feat(pdf): add analogy, mistake, remember fields to _call_enrich_section"
```

---

## Task 2: Backend — Add `_call_key_stats()` function

**Files:**
- Modify: `backend/app/services/pdf_service.py` (insert after `_call_common_mistakes`, ~line 462)
- Test: `backend/tests/test_pdf_service.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_pdf_service.py`:

```python
# ── _call_key_stats ────────────────────────────────────────────────────────────

def test_call_key_stats_returns_list_of_dicts_with_value_and_label():
    payload = json.dumps({"stats": [
        {"value": "28-30%", "label": "of clicks go to the #1 search result"},
        {"value": "$42", "label": "returned per $1 spent on email marketing"},
        {"value": "5-7x", "label": "more to acquire than retain a customer"},
        {"value": "2-4%", "label": "average e-commerce conversion rate"},
    ]})
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_key_stats
        result = _call_key_stats("transcript about digital marketing", "business")

    assert isinstance(result, list)
    assert len(result) == 4
    assert result[0]["value"] == "28-30%"
    assert "label" in result[0]


def test_call_key_stats_returns_empty_when_no_numbers_present():
    payload = json.dumps({"stats": []})
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_key_stats
        result = _call_key_stats("a purely conceptual lecture with no numbers", None)

    assert result == []


def test_call_key_stats_returns_empty_on_api_error():
    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.side_effect = Exception("network error")
        from app.services.pdf_service import _call_key_stats
        result = _call_key_stats("transcript", "physics")

    assert result == []


def test_call_key_stats_no_client_returns_empty():
    with patch("app.services.pdf_service._client", None):
        from app.services.pdf_service import _call_key_stats
        result = _call_key_stats("transcript", "medicine")

    assert result == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_pdf_service.py::test_call_key_stats_returns_list_of_dicts_with_value_and_label tests/test_pdf_service.py::test_call_key_stats_returns_empty_when_no_numbers_present tests/test_pdf_service.py::test_call_key_stats_returns_empty_on_api_error tests/test_pdf_service.py::test_call_key_stats_no_client_returns_empty -v
```

Expected: 4 FAILs (ImportError — `_call_key_stats` not defined)

- [ ] **Step 3: Implement `_call_key_stats()`**

In `backend/app/services/pdf_service.py`, insert the following function AFTER `_call_mnemonics` and BEFORE `# ── PDF renderer`:

```python
def _call_key_stats(transcript: str, topic: str | None) -> list[dict]:
    """
    Extracts up to 4 memorable statistics, key numbers, or metrics from the lecture.
    Returns [{"value": "28-30%", "label": "of clicks go to the #1 result"}].
    Returns [] if no quantitative facts are present. Non-fatal on error.
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
                        "Note: The transcript may contain mixed languages. Extract meaning from all languages present. Respond in English.\n\n"
                        f"TRANSCRIPT:\n{transcript[:5000]}\n\n"
                        f"Extract up to 4 memorable statistics, key numbers, or metrics from this lecture.{hint} "
                        "Each entry needs a VALUE (the number, percentage, or ratio — short, bold-worthy, max 8 characters) "
                        "and a LABEL (what it measures, max 8 words). "
                        "STRICT RULE: only include numbers explicitly stated in the transcript. "
                        "Return fewer than 4 if fewer distinct quantitative facts exist. "
                        "Return an empty stats array if the lecture contains no clear statistics.\n"
                        'Return JSON: {"stats": [{"value": "...", "label": "..."}]}'
                    ),
                }
            ],
            temperature=0.2,
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        log_cost("pdf_key_stats", "gpt-4o-mini",
                 input_tokens=resp.usage.prompt_tokens,
                 output_tokens=resp.usage.completion_tokens)
        return json.loads(resp.choices[0].message.content).get("stats", [])
    except Exception as e:
        print(f"_call_key_stats error (non-fatal): {e}")
        return []
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_pdf_service.py::test_call_key_stats_returns_list_of_dicts_with_value_and_label tests/test_pdf_service.py::test_call_key_stats_returns_empty_when_no_numbers_present tests/test_pdf_service.py::test_call_key_stats_returns_empty_on_api_error tests/test_pdf_service.py::test_call_key_stats_no_client_returns_empty -v
```

Expected: 4 PASSes

- [ ] **Step 5: Run full test suite**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_pdf_service.py -v
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
cd D:/neurativoproject/backend
git add app/services/pdf_service.py tests/test_pdf_service.py
git commit -m "feat(pdf): add _call_key_stats function for exec summary stats grid"
```

---

## Task 3: Backend — Wire `key_stats` into `generate_lecture_pdf()` and remove `common_mistakes`

**Files:**
- Modify: `backend/app/services/pdf_service.py:599-766`

This task has no new unit tests — the changes are wiring (task list + result unpacking + context dict). The template test (Task 5) validates end-to-end.

- [ ] **Step 1: Update the parallel task list**

In `generate_lecture_pdf()`, find the block starting with `# Common mistakes — transcript-sourced only` (around line 629) and replace it with:

```python
    # Key stats — extracted from transcript for exec summary callout
    tasks.append(asyncio.to_thread(_call_key_stats, transcript, topic))
```

(The old `tasks.append(asyncio.to_thread(_call_common_mistakes, transcript, topic))` line is deleted.)

- [ ] **Step 2: Update the result unpacking**

Find the block that unpacks `common_mistakes` (around lines 679-683):

```python
    r = results[ri]; ri += 1
    common_mistakes: list[dict] = r if not isinstance(r, Exception) else []
```

Replace with:

```python
    r = results[ri]; ri += 1
    key_stats: list[dict] = r if not isinstance(r, Exception) else []
```

- [ ] **Step 3: Update the exception fallback in the enriched_sections loop**

Find the exception branch inside the `for i in range(n_sections)` loop (around lines 641-655):

```python
        if isinstance(r, Exception):
            lead, rest = _extract_lead_sentence(raw_sections[i][:300])
            enriched_sections.append({
                "title":         f"Section {i + 1}",
                "lead_sentence": lead,
                "prose":         rest,
                "bullets":       [],
                "concepts":      [],
                "examples":      [],
                "raw_section":   raw_sections[i],
            })
```

Replace with:

```python
        if isinstance(r, Exception):
            lead, rest = _extract_lead_sentence(raw_sections[i][:300])
            enriched_sections.append({
                "title":         f"Section {i + 1}",
                "lead_sentence": lead,
                "prose":         rest,
                "bullets":       [],
                "concepts":      [],
                "examples":      [],
                "raw_section":   raw_sections[i],
                "analogy":       None,
                "mistake":       None,
                "remember":      None,
            })
```

- [ ] **Step 4: Update the template context dict**

Find the `context = {` block (around line 735).

Remove the line:
```python
        "common_mistakes":      common_mistakes,
```

Add in its place:
```python
        "key_stats":            key_stats,
```

The full context block should now look like:

```python
    context = {
        # Cover
        "title":                title,
        "created_at":           created_at,
        "duration_formatted":   duration_formatted,
        "word_count":           f"{word_count:,}",
        "total_chunks":         total_chunks,
        "total_sections":       n_sections,
        "total_concepts":       total_concepts,
        "qa_pairs":             qa_pairs,
        "language":             language.upper(),
        "topic":                topic,
        "reading_time_minutes": reading_time_minutes,
        # Domain labels
        "section_label":        section_label,
        "review_label":         review_label,
        "glossary_label":       glossary_label,
        # Enriched content
        "executive_summary":    exec_summary,
        "enriched_sections":    enriched_sections,
        "glossary":             glossary,
        "takeaways":            takeaways,
        "quick_review":         quick_review,
        "conceptual_map":       conceptual_map,
        "study_roadmap":        study_roadmap,
        # Legacy variable (kept for backwards compatibility)
        "summary_html":         clean_markdown_to_html(summary),
        "compression_ratio":    0.0,
        # Visual frames
        "visual_frames":        visual_frames,
        "key_stats":            key_stats,
        "accent_color":         _get_domain_color(topic),
    }
```

- [ ] **Step 5: Run the full pdf test suite to confirm no regressions**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_pdf_service.py -v
```

Expected: All tests pass. Note: The 3 tests for `_call_common_mistakes` (`test_call_common_mistakes_returns_list_of_dicts`, `test_call_common_mistakes_returns_empty_when_none_mentioned`, `test_call_common_mistakes_returns_empty_on_api_error`) should still PASS — the function still exists in the file, it's just no longer called from the pipeline. Do NOT delete these tests or the function.

- [ ] **Step 6: Commit**

```bash
cd D:/neurativoproject/backend
git add app/services/pdf_service.py
git commit -m "feat(pdf): wire key_stats into generate_lecture_pdf, remove common_mistakes from pipeline"
```

---

## Task 4: Template — Add analogy two-column box to section cards

**Files:**
- Modify: `backend/app/templates/lecture_template.html:791-851`

- [ ] **Step 1: Locate the section card template block**

In `lecture_template.html`, find this block (around line 799–808):

```html
        <hr class="section-bar">

        {% if sec.lead_sentence %}
        <p class="ls-lead">{{ sec.lead_sentence }}</p>
        {% endif %}

        {% if sec.prose %}
```

- [ ] **Step 2: Replace the section-bar + lead sentence block**

Replace the lines from `<hr class="section-bar">` through `{% endif %}` (the lead sentence endif) with:

```html
        <hr class="section-bar">

        {% if sec.analogy %}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin-bottom:4mm;border:1px solid var(--slate-200);border-radius:8px;overflow:hidden;">
            <div style="padding:3.5mm 4mm;background:#fafbfc;border-right:1px solid var(--slate-200);">
                <div style="font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--ink-4);margin-bottom:2mm;">What it is</div>
                <div style="font-size:9pt;color:var(--ink-2);line-height:1.6;">{{ sec.lead_sentence }}</div>
            </div>
            <div style="padding:3.5mm 4mm;background:#f0fff4;">
                <div style="font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#059669;margin-bottom:2mm;">Real-world analogy</div>
                <div style="font-size:9pt;color:#134e4a;line-height:1.6;">{{ sec.analogy }}</div>
            </div>
        </div>
        {% else %}
        {% if sec.lead_sentence %}
        <p class="ls-lead">{{ sec.lead_sentence }}</p>
        {% endif %}
        {% endif %}
```

This shows the analogy box (with lead sentence inside the left column) when `sec.analogy` is truthy. Falls back to the original standalone lead sentence when analogy is null.

- [ ] **Step 3: Verify the HTML is valid**

Open `backend/app/templates/lecture_template.html` and confirm:
- The `{% if sec.analogy %}` block is properly closed with `{% endif %}`
- There is no duplicate standalone lead sentence when analogy is shown
- The existing `{% if sec.prose %}` block immediately follows with no extra blank lines

- [ ] **Step 4: Commit**

```bash
cd D:/neurativoproject/backend
git add app/templates/lecture_template.html
git commit -m "feat(pdf): add real-world analogy two-column box to section cards"
```

---

## Task 5: Template — Add mistake+remember box and key stats grid; remove global Common Mistakes

**Files:**
- Modify: `backend/app/templates/lecture_template.html`

This task has three sub-changes to the template.

### 5a: Add mistake+remember box to section cards

- [ ] **Step 1: Locate the section notes block**

In `lecture_template.html`, find this block inside the `{% for sec in enriched_sections %}` loop (around line 846):

```html
        <div class="section-notes">
            <div class="notes-label">My Notes</div>
            <div class="notes-lines"></div>
        </div>
    </div>
    {% endfor %}
```

- [ ] **Step 2: Insert mistake+remember box before the notes block**

Replace the `<div class="section-notes">` block (and the closing `</div>{% endfor %}`) with:

```html
        {% if sec.mistake or sec.remember %}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin-top:4mm;border-radius:8px;overflow:hidden;border:1px solid #fde68a;">
            {% if sec.mistake %}
            <div style="padding:3mm 4mm;background:#fffbeb;border-right:1px solid #fde68a;">
                <div style="font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#b45309;margin-bottom:1.5mm;">Common Mistake</div>
                <div style="font-size:8.5pt;color:#78350f;line-height:1.6;">{{ sec.mistake }}</div>
            </div>
            {% else %}
            <div style="background:#fffbeb;border-right:1px solid #fde68a;"></div>
            {% endif %}
            {% if sec.remember %}
            <div style="padding:3mm 4mm;background:#f0fff4;">
                <div style="font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#059669;margin-bottom:1.5mm;">Remember This</div>
                <div style="font-size:8.5pt;color:#134e4a;line-height:1.6;">{{ sec.remember }}</div>
            </div>
            {% else %}
            <div style="background:#f0fff4;"></div>
            {% endif %}
        </div>
        {% endif %}

        <div class="section-notes">
            <div class="notes-label">My Notes</div>
            <div class="notes-lines"></div>
        </div>
    </div>
    {% endfor %}
```

### 5b: Add key stats grid after exec summary

- [ ] **Step 3: Locate the exec-card closing tag**

In `lecture_template.html`, find this block (around line 778):

```html
    <div class="exec-card">
        {% set exec_paras = executive_summary.split('\n\n') %}
        {% for para in exec_paras %}
            {% if loop.first %}
            <p class="drop-cap">{{ para }}</p>
            {% else %}
            <p>{{ para }}</p>
            {% endif %}
        {% endfor %}
    </div>
    {% endif %}
```

- [ ] **Step 4: Insert key stats grid after the exec-card div**

Replace the `</div>\n    {% endif %}` at the end of the exec summary block with:

```html
    </div>

    {% if key_stats %}
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-top:4mm;margin-bottom:2mm;">
        {% for stat in key_stats %}
        <div style="text-align:center;padding:4mm 3mm;background:var(--accent-lt);border-radius:8px;border:1px solid var(--accent-mid);">
            <div style="font-family:'Lora',Georgia,serif;font-size:18pt;font-weight:700;color:var(--accent);line-height:1.1;margin-bottom:2mm;">{{ stat.value }}</div>
            <div style="font-size:7.5pt;color:var(--ink-3);line-height:1.4;">{{ stat.label }}</div>
        </div>
        {% endfor %}
    </div>
    {% endif %}
    {% endif %}
```

(The outer `{% endif %}` closes the `{% if executive_summary %}` block.)

### 5c: Remove global Common Mistakes section

- [ ] **Step 5: Delete the global Common Mistakes section block**

In `lecture_template.html`, find and delete this entire block (around lines 897–914):

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

Delete all 17 lines including the HTML comment header.

- [ ] **Step 6: Verify template integrity**

Scan `lecture_template.html` to confirm:
- No reference to `common_mistakes` variable remains (search for `common_mistakes`)
- `key_stats` appears exactly once (in the exec summary grid)
- `sec.analogy` appears in the section card loop
- `sec.mistake` and `sec.remember` appear in the section card loop
- All `{% if %}` blocks are properly closed with `{% endif %}`

```bash
grep -n "common_mistakes\|key_stats\|sec\.analogy\|sec\.mistake\|sec\.remember" D:/neurativoproject/backend/app/templates/lecture_template.html
```

Expected output:
- 0 lines with `common_mistakes`
- 1 line with `key_stats`
- Lines with `sec.analogy`, `sec.mistake`, `sec.remember`

- [ ] **Step 7: Run all pdf tests**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_pdf_service.py -v
```

Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
cd D:/neurativoproject/backend
git add app/templates/lecture_template.html
git commit -m "feat(pdf): add mistake+remember box, key stats grid; remove global common mistakes section"
```

---

## Task 6: Integration smoke test

**Files:**
- No code changes — manual verification

- [ ] **Step 1: Start the backend server**

```bash
cd D:/neurativoproject/backend
uvicorn app.main:app --reload --port 8000
```

- [ ] **Step 2: Export a PDF for an existing lecture**

Use the frontend or curl. Confirm the PDF renders without errors (HTTP 200, Content-Type: application/pdf).

If you don't have a live lecture, trigger via the API:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/v1/lectures/<lecture_id>/export/pdf -o test_export.pdf
```

- [ ] **Step 3: Verify the PDF structure**

Open `test_export.pdf` and confirm:
1. Executive summary page shows 4 stat tiles below the paragraphs (if the lecture had statistics)
2. Each section card has the two-column analogy box below the section rule (if analogy was generated)
3. Each section card has the amber/green mistake+remember box above the notes lines (if content was generated)
4. There is NO global "Common Mistakes" section anywhere in the document
5. All other sections (TOC, Glossary, Self-Test, Cheat Sheet, Learning Path) render correctly

- [ ] **Step 4: Run the full backend test suite**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/ -v --tb=short
```

Expected: All tests pass

- [ ] **Step 5: Final commit if any fixes were needed**

If any issues were found and fixed in steps 2-4, commit the fixes before marking done.
