# PDF Export Redesign — Design Spec
**Date:** 2026-04-30
**Status:** Approved

## Overview

The Neurativo PDF export already generates a 12-section professional report. Three structural features present in reference-quality academic PDFs are currently missing. This spec adds those three features with minimal scope: no new sections are created, no existing sections are removed (except the global Common Mistakes section which is superseded), and all new content is generated from existing lecture data.

---

## What Already Exists (Do Not Re-Implement)

- `pdf_service.py` — all GPT worker functions, parallel `asyncio.gather()` pipeline, `generate_lecture_pdf()`
- `lecture_template.html` — all 12 sections, typography, CSS variables, section card structure
- `_call_enrich_section()` — per-section enrichment returning `title`, `lead_sentence`, `prose`, `bullets`, `concepts`, `examples`, `raw_section`
- `_call_common_mistakes()` — global transcript-level mistakes (DEPRECATED by this spec — replaced by per-section)
- `_call_executive_summary()` — 3-paragraph exec summary

---

## Gap 1 — Real-World Analogy Per Section

### What changes

`_call_enrich_section()` gains one new JSON field in its GPT response schema:

```
"analogy": "Think of X as Y because Z. This analogy breaks down because..."
```

- 2–3 sentences using a concrete real-world comparison
- Must arise naturally from the section's subject matter
- If no natural analogy exists, return `null` — never force one

Increase `max_tokens` from 550 to 900 to accommodate three new fields (analogy + mistake + remember, see Gap 2).

Updated GPT schema in `_call_enrich_section()`:

```
"- \"analogy\": A 2-3 sentence real-world analogy that makes the concept click immediately.
   Use 'Think of...' or 'Imagine...' framing. Return null if no natural analogy exists.\n"
```

Fallback dict in `_call_enrich_section()` (no-client branch) gains `"analogy": None`.
Exception branch in `generate_lecture_pdf()` gains `"analogy": None`.

### Template change — section card

After `<hr class="section-bar">` and before the lead sentence, add a two-column "What it is / Real-world analogy" box, rendered only when `sec.analogy` is truthy:

```html
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
{% endif %}
```

When the analogy box is shown, suppress the standalone `<p class="ls-lead">` so the lead sentence is not duplicated (it appears inside the "What it is" column).

---

## Gap 2 — Per-Section Mistake + Remember

### What changes (backend)

`_call_enrich_section()` gains two new JSON fields:

```
"mistake": "A common error students make with this specific concept..."
"remember": "The key principle to hold onto: ..."
```

Rules for GPT:
- `mistake`: one specific misconception grounded in THIS section's content. Return `null` if none is clearly identifiable.
- `remember`: one positive, memorable principle from this section. Always generate — every section has something worth remembering.

Fallback dict and exception branch both gain `"mistake": None, "remember": None`.

### Remove global Common Mistakes section

`_call_common_mistakes()` is no longer called. Remove it from the parallel task list in `generate_lecture_pdf()` and remove the unpacking of `common_mistakes` from the results. Remove `"common_mistakes": common_mistakes` from the template context. The global Common Mistakes section in the template is removed.

This is cleaner: mistakes are now contextual (tied to the section they belong to) rather than aggregated at the end.

### Template change — section card

At the bottom of each section card, before `<div class="section-notes">`, add a two-column mistake/remember box, rendered only when at least one field is truthy:

```html
{% if sec.mistake or sec.remember %}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin-top:4mm;border-radius:8px;overflow:hidden;border:1px solid #fde68a;">
    {% if sec.mistake %}
    <div style="padding:3mm 4mm;background:#fffbeb;border-right:1px solid #fde68a;">
        <div style="font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#b45309;margin-bottom:1.5mm;">Common Mistake</div>
        <div style="font-size:8.5pt;color:#78350f;line-height:1.6;">{{ sec.mistake }}</div>
    </div>
    {% else %}
    <div></div>
    {% endif %}
    {% if sec.remember %}
    <div style="padding:3mm 4mm;background:#f0fff4;">
        <div style="font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#059669;margin-bottom:1.5mm;">Remember This</div>
        <div style="font-size:8.5pt;color:#134e4a;line-height:1.6;">{{ sec.remember }}</div>
    </div>
    {% else %}
    <div></div>
    {% endif %}
</div>
{% endif %}
```

---

## Gap 3 — Executive Summary Key Stats Callout

### New function: `_call_key_stats()`

```python
def _call_key_stats(transcript: str, topic: str | None) -> list[dict]:
    """
    Extracts 4 memorable statistics, key numbers, or metrics from the lecture.
    Returns: [{"value": "28–30%", "label": "of clicks go to the #1 search result"}]
    Returns [] if no clear numbers or statistics are present in the transcript.
    """
```

GPT prompt:
- Extract exactly 4 key numbers/statistics/metrics from the transcript
- Each entry: `value` (the number/percentage/ratio — short, bold-worthy) + `label` (brief description, ~8 words max)
- If the lecture does not contain 4 distinct quantitative facts, return fewer (minimum 0 — never invent numbers)
- Model: `gpt-4o-mini`, max_tokens: 300, response_format: json_object

JSON schema: `{"stats": [{"value": "...", "label": "..."}]}`

Add to parallel task list in `generate_lecture_pdf()`. Unpack result as `key_stats: list[dict]`.
Add `"key_stats": key_stats` to template context.

### Template change — exec summary

After the `</div>` closing the `.exec-card`, add the stats grid, rendered only when `key_stats` is non-empty:

```html
{% if key_stats %}
<div style="display:grid;grid-template-columns:repeat({{ [key_stats|length, 4]|min }},1fr);gap:3mm;margin-top:4mm;margin-bottom:2mm;">
    {% for stat in key_stats %}
    <div style="text-align:center;padding:4mm 3mm;background:var(--accent-lt);border-radius:8px;border:1px solid var(--accent-mid);">
        <div style="font-family:'Lora',Georgia,serif;font-size:18pt;font-weight:700;color:var(--accent);line-height:1.1;margin-bottom:2mm;">{{ stat.value }}</div>
        <div style="font-size:7.5pt;color:var(--ink-3);line-height:1.4;">{{ stat.label }}</div>
    </div>
    {% endfor %}
</div>
{% endif %}
```

---

## Files Changed

### Backend
| File | Change |
|------|--------|
| `backend/app/services/pdf_service.py` | `_call_enrich_section()`: add `analogy`, `mistake`, `remember` fields; increase `max_tokens` to 900. New `_call_key_stats()` function. `generate_lecture_pdf()`: add `_call_key_stats` to parallel tasks; remove `_call_common_mistakes` from tasks; add `key_stats` to context; remove `common_mistakes` from context; update fallback/exception dicts for enriched sections. |

### Template
| File | Change |
|------|--------|
| `backend/app/templates/lecture_template.html` | Section card: analogy box after section bar (with conditional lead sentence suppression). Section card: mistake+remember box before notes lines. Exec summary: key stats grid after exec-card. Remove global Common Mistakes section block. |

---

## Data Flow

```
generate_lecture_pdf()
  parallel gather:
    _call_executive_summary()       → exec_summary (str)
    _call_key_stats()               → key_stats (list[dict])      ← NEW
    _call_enrich_section() × N      → enriched_sections (adds analogy, mistake, remember) ← EXTENDED
    _call_glossary()
    _call_takeaways()
    _call_quick_review()
    _call_conceptual_map()          (3+ sections only)
    _call_study_roadmap()
    # _call_common_mistakes()       ← REMOVED

  template context:
    key_stats         → exec summary stats grid
    enriched_sections[i].analogy   → section analogy box
    enriched_sections[i].mistake   → section mistake box
    enriched_sections[i].remember  → section remember box
```

---

## Out of Scope

- Typography/visual design overhaul (separate feature)
- Cover page stat tile personalization (separate feature)
- Changing any other section structure (Glossary, TOC, Cheat Sheet, Self-Test, etc.)
- Re-running GPT for already-exported lectures
