# PDF Upgrade — Design Spec

**Date:** 2026-04-21
**Goal:** Produce the best lecture study PDF a student will ever need — zero boilerplate, zero invented content, perfectly organised for genuine comprehension and active recall.

---

## Problem with Current PDF

1. `_call_enrich_section` demands exactly 3 concepts and 2 examples per section — GPT fabricates them when the transcript doesn't supply them.
2. No Table of Contents — hard to navigate multi-page documents.
3. Q&A shows questions and answers together — no active recall opportunity.
4. No quick-reference cheat sheet for revision.
5. No feedback on common misconceptions.
6. Glossary has no memory aids.
7. Single accent colour regardless of domain.
8. Cover stats are plain text — low visual impact.

---

## Architecture

No new files. Changes are confined to:

| File | Change |
|------|--------|
| `backend/app/services/pdf_service.py` | Fix `_call_enrich_section`, add `_call_mnemonics`, add `_call_common_mistakes`, wire into `generate_lecture_pdf`, pass new context vars |
| `backend/app/templates/lecture_template.html` | Full visual redesign: domain colours, cover tiles, TOC, section number watermarks, active-recall Q&A, common-mistakes callouts, mnemonic lines in glossary, cheat sheet page, notes lines |

---

## Content Changes (pdf_service.py)

### Fix `_call_enrich_section` — no forced invented content

**Current (broken):** prompt says "concepts and examples must not be empty" — forces GPT to invent.

**New prompt rule:** "Include only information explicitly stated in this transcript section. If no concepts were named or defined, return an empty array. If no examples were given, return an empty array. Never invent."

The JSON schema stays identical (`concepts`, `examples` as arrays). Downstream template already guards with `{% if sec.concepts %}` etc., so empty arrays render nothing.

### New: `_call_mnemonics(glossary_terms: list[dict]) -> list[dict]`

- Input: the glossary list `[{"term": "...", "definition": "..."}]`
- One GPT-4o-mini call for all terms together (not per-term)
- Prompt: "For each term, generate ONE memory hook: an acronym, rhyme, analogy, or vivid image that makes the term stick. Only generate a hook if one arises naturally — return null for terms where forcing one would be artificial."
- Returns: `[{"term": "...", "mnemonic": "..." | null}]`
- Merged back into glossary list in `generate_lecture_pdf`: iterate the returned list, look up each `term` in a dict built from the glossary list, set `item["mnemonic"] = mnemonic_or_null`. Items where the mnemonic is null or absent get no `"mnemonic"` key.
- Non-fatal: if this call fails, glossary items render without mnemonics (template guards with `{% if item.mnemonic %}`)

### New: `_call_common_mistakes(transcript: str, topic: str | None) -> list[dict]`

- Prompt: "Read this transcript and identify 2–3 genuine misconceptions the lecturer explicitly warned about, or classic logical traps students make with this material. Return only mistakes that are grounded in what was actually said. If none were mentioned, return an empty list."
- Returns: `[{"mistake": "...", "correction": "..."}]`
- Passed to template as `common_mistakes`; section only renders if list is non-empty
- Model: gpt-4o-mini, temperature 0.2

### Domain-aware accent colour

New helper `_get_domain_color(topic: str | None) -> str` returns a hex colour:

| Domain | Colour |
|--------|--------|
| medicine / nursing / pharmacy | `#DC2626` (deep red) |
| law / legal | `#1E3A5F` (navy) |
| computer science / software / engineering | `#4F46E5` (indigo) |
| physics / mathematics / chemistry | `#0D9488` (teal) |
| history / social sciences | `#92400E` (warm brown) |
| business / economics | `#059669` (emerald) |
| default / general | `#2563EB` (current blue) |

Passed to template as `accent_color`. Template uses it as a CSS variable override on `<body>` via inline `style`.

### Parallel task list additions

Both new calls added to `asyncio.gather()` alongside existing calls. Results unpacked in order. Both are non-fatal (return `[]` on exception).

### Context variables added

```python
"common_mistakes":  common_mistakes,   # list[dict] — may be empty
"accent_color":     accent_color,      # hex string
# glossary items now have optional "mnemonic" key
```

---

## Visual Design Changes (lecture_template.html)

### CSS: domain accent variable

```css
:root { --accent: #2563eb; }  /* default — overridden by inline body style */
```

Template opens `<body style="--accent: {{ accent_color }}">` — all existing accent references update automatically.

### Cover redesign — stats as tiles

Replace the current `cover-meta` flex row (plain labels + values) with a 2×3 tile grid. Each tile:
- Large bold number (18pt, `font-family: Lora`)
- Small uppercase label below (7pt)
- Light border, rounded corners, subtle shadow

Tiles: Date, Duration, Words Spoken, Reading Time, Sections, Q&A Pairs (shown only if > 0).

### Table of Contents (page 2, after cover)

- Renders only if `enriched_sections|length > 1`
- Each row: section number + title + dotted leader + page indicator ("p. ~N") estimated as `2 + loop.index * 1.5` (approximate, gives students orientation)
- Styled with Lora for section titles, Inter for page markers
- Page break after TOC

### Section number watermark

Each `section-card` gets a large background number ("01", "02"…) rendered as:
```css
.section-num-bg {
    position: absolute; right: 0; top: -8mm;
    font-size: 52pt; font-weight: 700; color: #f1f5f9;
    font-family: 'Lora', serif; line-height: 1; user-select: none;
}
```
Section card gets `position: relative; overflow: visible`.

### Active recall Q&A format

Each `review-item`:
1. Question block — solid left border in accent colour, bold text, white background
2. Dotted separator line with centred label "✂ fold here to self-test"
3. Answer block — light grey background (`#f8fafc`), smaller font, colour `var(--ink-3)` — visually distinct from question

CSS:
```css
.fold-line {
    border-top: 1.5px dashed #cbd5e1;
    margin: 3mm 0;
    text-align: center;
    position: relative;
}
.fold-label {
    position: absolute; top: -7px; left: 50%; transform: translateX(-50%);
    background: white; padding: 0 6px;
    font-size: 7pt; color: #94a3b8; letter-spacing: 0.5px;
}
```

### Common Mistakes section

Renders only if `common_mistakes` is non-empty. Amber callout style:

```css
.mistake-card {
    background: #fffbeb;
    border-left: 3px solid #f59e0b;
    border-radius: 0 8px 8px 0;
    padding: 3.5mm 5mm;
    margin-bottom: 3mm;
}
.mistake-label { font-size: 7pt; font-weight: 700; color: #b45309; text-transform: uppercase; letter-spacing: 1px; }
.mistake-text  { font-size: 9.5pt; font-weight: 600; color: #92400e; margin: 1.5mm 0; }
.correction-text { font-size: 9pt; color: #44403c; line-height: 1.65; }
```

Placed between Key Takeaways and Glossary.

### Mnemonics in glossary

Each `glossary-item` gains a third row below definition:
```html
{% if item.mnemonic %}
<div class="glossary-mnemonic">💡 {{ item.mnemonic }}</div>
{% endif %}
```
```css
.glossary-mnemonic { font-size: 8pt; color: #7c3aed; font-style: italic; margin-top: 2mm; }
```

### Notes lines per section

Each `section-card` gets a notes block at the bottom:
```html
<div class="section-notes">
    <div class="notes-label">My notes</div>
    <div class="notes-lines"></div>
</div>
```
```css
.section-notes { margin-top: 4mm; border-top: 1px solid #f1f5f9; padding-top: 3mm; }
.notes-label   { font-size: 6.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #d1d5db; margin-bottom: 2mm; }
.notes-lines   { height: 12mm; background-image: repeating-linear-gradient(to bottom, transparent, transparent 5.5mm, #e5e7eb 5.5mm, #e5e7eb 6mm); }
```

### Cheat Sheet (last page before Learning Path)

Full page break before. Three-column layout:

**Column 1 — Key Terms:** All glossary terms as `term: short-definition` pairs. Definition truncated to 8 words via a Jinja2 custom filter `truncate_words` registered in `generate_lecture_pdf` (`env.filters["truncate_words"] = lambda s, n: " ".join(str(s).split()[:n]) + ("…" if len(str(s).split()) > n else "")`). Tiny font (7.5pt).

**Column 2 — Core Concepts:** All concept strings from all sections, deduplicated. Done template-side using a Jinja2 `namespace` accumulator: iterate `enriched_sections`, collect all `sec.concepts` into a set, render as pills. Same pill style as in section cards but smaller (7pt).

**Column 3 — Top 5 Takeaways:** Numbered list, ultra-compact (8pt).

Header: "Quick Reference" eyebrow label + "Cheat Sheet" h2.
Bottom note: "Cut out and keep" in muted small text.

### Page break strategy

`page-break-before: always` added to: TOC page, Executive Summary eyebrow, Section Breakdown eyebrow, Conceptual Map eyebrow, Key Takeaways eyebrow, Common Mistakes eyebrow, Glossary eyebrow, Cheat Sheet, Q&A eyebrow, Learning Path eyebrow.

---

## Section Order (final document)

1. Cover
2. Table of Contents
3. Executive Summary
4. Section Breakdown (with notes lines)
5. Conceptual Map (if 3+ sections)
6. Key Takeaways
7. Common Mistakes (if any)
8. Glossary + Mnemonics
9. Visual Content (if any)
10. Self-Test / Q&A (active recall format)
11. Cheat Sheet
12. Learning Path

---

## Anti-Hallucination Constraints

- `_call_enrich_section`: concepts and examples may be empty arrays — template guards with `{% if %}`.
- `_call_common_mistakes`: returns empty list if nothing was said — section does not render.
- `_call_mnemonics`: null for terms where a natural mnemonic doesn't exist — field skipped in template.
- All GPT calls use `temperature ≤ 0.3` for factual content.
- Executive summary is already sourced from `transcript[:6000]` — no change needed.

---

## Non-Goals

- No new backend API endpoints.
- No changes to ExportModal or the streaming progress UI.
- No changes to supabase_service.py or any other service.
- No font changes (Inter + Lora already excellent).
- No PDF splitting into multiple files.
