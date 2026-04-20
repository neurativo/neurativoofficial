# LectureView UI/UX Redesign — Design Spec

**Date:** 2026-04-20
**Scope:** Full redesign of `frontend/src/pages/LectureView.jsx` — transcript panel, summary panel, Q&A, stats, mobile layout, and dark mode. Stays 100% within Neurativo's existing design token system.
**Approach:** Studio Mode (two-column split) · Segmented transcript with time ranges · Summary cards with collapsible master summary · Warm minimalism aligned with site vibe

---

## Problem

The current LectureView is functional but feels unfinished:
- Transcript shows chunk index numbers (`1`, `2`, `3`) instead of meaningful time ranges
- All chunks look identical — there is no visual hierarchy between old and new content
- Summary cards have good bones but inconsistent spacing and no master summary access without scrolling
- Q&A source citations are invisible — user can't tell which part of the lecture the answer came from
- Stats panel is a generic grid with no personality
- Mobile layout is a hard 42vh split with no user control
- Selectable-text Smart Explain has no visual affordance

---

## Solution Overview

Three targeted areas of improvement:
1. **Transcript panel** — time ranges, live-chunk accent, waveform sub-header, text-select affordance, auto-scroll with resume
2. **AI panel** — richer section cards, collapsible master summary, better Q&A citations, improved stats
3. **Layout & mobile** — drag handle between panels, mobile bottom sheet, full dark mode alignment

---

## Section 1: Layout & Structure

**Desktop (≥ 768px):**
- Two-column split: transcript left `55%`, AI panel right `45%`
- A `4px`-wide invisible drag handle on the border lets users resize the split (min 30%, max 70%)
- Both panels scroll independently with the existing `4px` styled scrollbar

**Mobile (< 768px, currently 680px):**
- Vertical stack: transcript on top `55vh`, AI panel fills remaining height
- A `24px`-tall drag handle strip between panels — user can pull AI panel up to `80vh` or push it down to `20vh`
- Handle renders as a `32×4px` rounded pill centered in the strip (color: `var(--color-border-hov)`)

**Navbar (48px, unchanged height):**
- Left: `← Back` link + lecture title (truncated, centered flex)
- Right: Export button + Share button (existing functionality, unchanged)
- No recording controls — LectureView is a completed-lecture view only

---

## Section 2: Transcript Panel

### Sub-header strip (32px)
A thin strip between the panel label and the transcript list:
- **Left:** Language badge pill — existing `.lv-pill-lang` class, shows `EN`, `AR`, etc.
- **Right:** Word count — `"1,234 words"` in `var(--color-muted)`, 11px

### Chunk rows (replaces current `.lv-segment`)

Each chunk displays as a two-column row:

**Left column (52px, fixed):**
- Time range: `0:00` on line 1, `–0:12` on line 2 (or a single `0:00` if range unavailable)
- Font: JetBrains Mono, 10px, `var(--color-muted)`
- Vertically top-aligned

**Right column (flex):**
- Text: Inter, 14px, line-height 1.75
- Past chunks: `var(--color-sec)` — slightly muted, normal weight
- Latest chunk (last in list): left border `3px solid #6366f1`, text `var(--color-text)`, font-weight 500, background `#f5f3ff` (light indigo tint, `#1e1338` in dark mode) — fades out via `section-highlight-fade` animation after 3 seconds, settling to just the left border

**Chunk entry animation:**
New chunks appear with `animation: fade-in 0.25s ease` — the existing keyframe. No slide, just fade.

### Text selection → Smart Explain

When the user selects any text inside the transcript list:
- A small floating button `✦ Explain` appears 8px above the selection midpoint
- Style: `background: var(--color-dark); color: var(--color-dark-fg); border-radius: 6px; padding: 5px 10px; font-size: 12px; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.15)`
- On click: calls `POST /api/v1/explain/{lectureId}` with `{ text: selectedText }` — same endpoint already used in App.jsx — and displays the result in a right-side slide-in panel (same structure as App.jsx's explanation panel)
- The panel shows: explanation, analogy, step-by-step. Close button dismisses it.
- Disappears on `selectionchange` to empty or on click outside
- **Implementation note:** LectureView does not currently have Smart Explain. This adds it, reusing the existing API endpoint and duplicating (not importing) the explanation panel JSX — the App.jsx version is too entangled with recording state to extract cleanly at this stage.

### Auto-scroll

- The transcript list auto-scrolls to the bottom when new chunks arrive (behavior unchanged)
- LectureView shows a completed lecture — no live auto-scroll needed
- Scroll position is preserved on tab switch back

---

## Section 3: AI Panel

### Tab strip (40px)

Underline-style tabs: Summary · Ask · Stats · Visuals
- Active tab: `border-bottom: 2px solid var(--color-text)`, `color: var(--color-text)`
- Inactive: `color: var(--color-muted)`, no border
- Transition: `color 0.12s, border-color 0.12s` (existing)
- Tab body switches with `opacity 0 → 1` crossfade, `150ms`

### Summary tab

**Section cards (existing structure, improved layout):**
- Uses existing `ACCENTS_LIGHT` / `ACCENTS_DARK` cycling palette (violet → blue → emerald → orange → pink → green)
- Left border `3px solid accent.border`
- Card header: accent-colored title (Outfit font, 13px, font-weight 600) + right-aligned time range chip (`0:00–8:00`, JetBrains Mono 10px, muted)
- Highlight rows (`>` lines): existing `.lv-sum-highlight` with accent bg tint + left border
- Lead sentence: `var(--color-sec)`, 13px
- Concept pills: existing `.concept-pill` style
- Examples: existing `→` arrow rows
- Card entry animation: existing `summary-card-enter` (300ms ease)
- Most recently added card gets `section-new` class for the 2s border flash

**Lecture Overview row (new — below all section cards):**
- A collapsible row pinned at the bottom of the summary scroll area
- Collapsed state: `"Lecture Overview  ↓"` — 12px, `var(--color-muted)`, full-width clickable row with `1px solid var(--color-border)` top border
- Expanded state: master summary text rendered as plain prose, `var(--color-sec)`, 13px, line-height 1.7, with a `↑ Collapse` link at the bottom
- Expand/collapse with `200ms` height animation

### Ask tab

**Chat layout:**
- Question bubbles: right-aligned, `background: var(--color-dark)`, `color: var(--color-dark-fg)`, `border-radius: 10px 10px 2px 10px`, max-width 85%, padding `10px 14px`, font-size 13px
- Answer cards: left-aligned, `background: var(--color-card)`, `border: 1px solid var(--color-border)`, `border-radius: 10px 10px 10px 2px`, max-width 88%, padding `10px 14px`, font-size 13px, line-height 1.65
- Source citation (below each answer): `"From your lecture transcript"` — 11px, `var(--color-muted)`, italic, `margin-top: 6px`. If the Q&A API response ever includes chunk indices, this can be upgraded to `"From minutes 2–7"` by mapping chunk index to time range — but the fallback string is always safe.
- Thinking indicator: existing `dots-bounce` animation on 3 dots while loading

**Input bar (pinned at panel bottom):**
- Unchanged from current — input + Send button, `border-top: 1px solid var(--color-border)`

### Stats tab

**Metric grid: 2 columns, 3 rows (6 cards)**

Cards use existing `.lv-stat-card` style. Content per card:

| Card | Value | Sub-label |
|------|-------|-----------|
| Duration | `HH:MM:SS` | total recording time |
| Words | `1,234` | transcribed |
| Chunks | `42` | 12s segments |
| Sections | `3` | summarized |
| Language | `English` | detected |
| Topics | `18` | key concepts extracted |

The "Topics" count is the total number of concept pills across all parsed section summaries — derived client-side from `parseSummary()` output, no backend change needed.

Value font: 22px, font-weight 600, `var(--color-text)`, letter-spacing -0.5px.
Label: 11px, uppercase, `var(--color-muted)`, letter-spacing 0.5px.
Sub-label: 12px, `var(--color-muted)`.

**Divider below grid:** a `1px solid var(--color-border)` rule, then a compact topic pills row showing extracted key concepts as `.lv-pill-topic` pills (existing style).

### Visuals tab

Unchanged from current implementation.

---

## Section 4: Visual System

All colors use existing CSS custom properties — zero new tokens introduced.

| Element | Light | Dark |
|---------|-------|------|
| Page background | `#fafaf9` (+ dot grid) | `#121212` (+ dot grid) |
| Panel background | `#fafaf9` | `#121212` |
| Card background | `#ffffff` | `#1e1e1e` |
| Primary border | `#f0ede8` | `#2c2c2c` |
| Primary text | `#1a1a1a` | `#f0ede8` |
| Secondary text | `#6b6b6b` | `#a0a0a0` |
| Muted text | `#a3a3a3` | `#666666` |
| Live/accent | `#6366f1` | `#818cf8` |
| Highlight bg | `#f5f3ff` | `#1e1338` |

**Fonts:**
- Body / UI: Inter
- Section card titles: Outfit
- Timestamps: JetBrains Mono

**The dot grid background** (`radial-gradient` on `body`) shows through both panels — panels have no opaque background color override, allowing the site texture to breathe through.

---

## Section 5: Animations

All use existing keyframes from `index.css` — no new keyframes added.

| Trigger | Animation | Duration |
|---------|-----------|----------|
| New transcript chunk appears | `fade-in` | 250ms |
| New section summary card | `summary-card-enter` | 300ms |
| Most recent section card border flash | `section-highlight-fade` / `section-highlight-fade-dark` | 2s |
| Smart Explain button appears | `fade-in` | 150ms |
| Tab body switch | opacity 0→1 | 150ms |
| Lecture Overview expand | height auto | 200ms |

---

## Section 6: Mobile Specifics

- **Transcript panel height:** starts at `55vh`, draggable down to `20vh` or up to `80vh`
- **Drag handle:** `24px` strip, `32×4px` pill indicator, `cursor: ns-resize`
- **AI panel tabs:** horizontally scrollable if screen is very narrow (existing behavior preserved)
- **Q&A input:** uses `font-size: 16px` on mobile to prevent iOS zoom on focus
- **Smooth scroll:** `-webkit-overflow-scrolling: touch` on both scrollable panels
- **Smart Explain button:** appears above selection on touch — uses `touchend` + `selectionchange` events

---

## Section 7: What Is Not Changing

- API calls, data fetching, state management — all unchanged
- `parseSummary()` function — unchanged
- `ShareModal` component — unchanged
- `ExportModal` component — unchanged
- `QAAnswer` component — unchanged
- `useIsDark()` hook — unchanged
- All existing CSS class names and variables — extended, not replaced
- Visuals tab content — unchanged
- Backend — no changes

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/pages/LectureView.jsx` | Full CSS block rewrite + transcript rows + summary cards + Q&A + stats + drag handle + Smart Explain button |

---

## Success Criteria

- Transcript chunks show time ranges (`0:00–0:12`) instead of chunk index numbers
- Latest chunk has left-border indigo accent; older chunks are visually muted
- Summary panel shows section cards with time range chips + collapsible master summary
- Q&A answers show source time range citation
- Stats panel shows 6 meaningful metric cards including accuracy signal
- Mobile drag handle lets user resize panels between 20vh–80vh
- Smart Explain floating button appears on any text selection
- All above work identically in dark mode using existing CSS variables
- No new design tokens, fonts, or dependencies introduced
