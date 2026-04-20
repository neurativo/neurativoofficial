# Final Summary Recompute — Design Spec

**Date:** 2026-04-20
**Scope:** Replace the live triple-compression summary chain with a single definitive recompute pass at session end, sourced directly from the raw transcript.

---

## Problem

The current master summary is generated from section summaries, which are generated from micro-summaries — three lossy compression steps away from the actual transcript. Each step loses fidelity, introduces boilerplate, and risks hallucination. The LectureView summary reflects a lossy approximation of the lecture, not its content.

---

## Solution Overview

When a session ends, a background job fetches the full raw transcript (all chunk transcripts concatenated), runs two focused GPT passes — topic segmentation then per-topic summarization — and writes the definitive master_summary back to the database. The live pipeline (micro-summaries, N.A.S.T., section cards) is untouched and continues to provide real-time feedback during recording. The LectureView shows the live version immediately and upgrades silently to the recomputed version when it is ready.

---

## Algorithm

### Pass 1 — Topic Segmentation (1 GPT call)

**Input:** Full concatenated raw transcript (all `lecture_chunks.transcript` fields joined with a space, ordered by `chunk_index`).

**Task:** GPT identifies where topics naturally shift and assigns each a specific, descriptive title. No summarization — structure detection only.

**Prompt (system):**
```
You are analyzing a lecture transcript. Identify every distinct topic or subtopic covered.

Rules:
- Titles must be specific and descriptive (e.g. "Krebs Cycle — ATP Production", not "Overview" or "Section 1")
- A topic shift occurs when the speaker moves to a genuinely new concept, not just a new sentence
- Minimum 1 topic, maximum 12 topics
- Cover the entire transcript — every part must belong to a topic
- Return ONLY valid JSON, no other text

Return a JSON array:
[{"title": "...", "start": <char_index>, "end": <char_index>}, ...]
```

**Temperature:** 0.0
**Model:** gpt-4o-mini
**Max tokens:** 800

If JSON parsing fails, fall back to splitting the transcript into equal thirds and using generic titles derived from the first sentence of each segment.

---

### Pass 2 — Per-Topic Summarization (N GPT calls, one per topic)

**Input:** The transcript slice for that topic only (characters `start` to `end` from Pass 1).

**Task:** Write a structured, faithful summary of only what was said in that slice.

**Prompt (system):**
```
You are summarizing a section of a lecture transcript. Your only source is the text provided.

STRICT RULES — violations make the summary worthless:
1. Include ONLY information explicitly stated in this transcript section. Do not add background knowledge.
2. Key concepts: only terms the speaker named or defined. If a term appears but was not explained, omit it.
3. Examples: only examples the speaker gave. If no example was given, omit the Examples section entirely.
4. The blockquote must restate something the speaker actually emphasized — a contrast drawn, a conclusion stated, a warning given. If nothing qualifies, omit the blockquote.
5. Do not write "the speaker says" or "in this section" — write the content directly.
6. No filler phrases: no "it is important to note", "in conclusion", "as mentioned above".

Output format — use exactly this markdown structure, omitting any section that has no content:

## {title}

{One sentence capturing the single most important idea stated in this section.}

{2–4 sentences explaining what was covered, using the speaker's own terminology.}

[> {One sentence restating a key point the speaker emphasized — only if one exists}]

[Key concepts: `term1`, `term2`, `term3`]

[Examples:
→ {example the speaker gave}
→ {example the speaker gave}]

---
```

**Temperature:** 0.1
**Model:** gpt-4o-mini
**Max tokens:** 500 per topic

**Domain injection:** If `lectures.topic` is set, append to the system prompt:
```
This is a {topic} lecture. Use precise {topic} terminology as the speaker used it.
```

---

### Assembly

Topic summaries are concatenated in order (Pass 1 order) with no additional GPT call. The result is written to `lectures.master_summary` and `lectures.summary`.

---

## Long Transcript Handling

- **Under 20,000 words** (~26,000 tokens): Pass 1 sends the full transcript in one call. GPT-4o-mini's 128K context handles this.
- **Over 20,000 words**: Split transcript into windows of 15,000 words with 500-word overlap. Run Pass 1 on each window independently to get per-window segments. Deduplicate overlapping boundaries. Then run Pass 2 normally per topic segment.

---

## Status Signal

Add `summary_status` column (text, default `'live'`) to the `lectures` table.

| Value | Meaning |
|-------|---------|
| `'live'` | Recording in progress or recompute not yet started |
| `'recomputing'` | Session ended, background job running |
| `'final'` | Recompute complete — definitive summary is in master_summary |

The frontend reads `summary_status` from `GET /api/v1/lectures/{id}` (already polled). While `'recomputing'`, a subtle badge `"Refining summary…"` is shown in the LectureView AI panel header. When it becomes `'final'`, the badge disappears.

---

## Frontend Change (LectureView.jsx)

- Read `summary_status` from the lecture object (already fetched on mount)
- If `summary_status === 'recomputing'`: show a small `"Refining summary…"` badge (12px, `var(--color-muted)`, italic) in the Summary tab header, next to the tab label
- Poll interval: existing 3s poll already in place — no new polling logic needed
- When `summary_status` flips to `'final'`, badge disappears and `parseSummary()` re-runs on the updated `master_summary` — section cards refresh

---

## Files Changed

| File | Change |
|------|--------|
| `backend/app/services/summarization_service.py` | Add `segment_transcript()`, `summarize_topic_segment()`, `recompute_final_summary()` |
| `backend/app/api/endpoints.py` | Session end: set status to `'recomputing'`, fire `recompute_final_summary` as background task |
| `backend/app/services/supabase_service.py` | Add `get_all_chunk_transcripts(lecture_id)`, `set_summary_status(lecture_id, status)` |
| `frontend/src/pages/LectureView.jsx` | Read `summary_status`, show/hide "Refining…" badge |
| Supabase | `ALTER TABLE lectures ADD COLUMN summary_status text DEFAULT 'live'` |

**Not changed:** Live pipeline (micro-summaries, N.A.S.T., section triggers), QA service, embedding service, export, share, frontend recording flow.

---

## Success Criteria

- LectureView summary contains only information actually spoken in the lecture — zero hallucinated facts
- Topics are named specifically (not "Section 1", "Overview", "Key Takeaways")
- Sections with no examples have no Examples row; sections with no defined terms have no Key concepts row
- "Refining summary…" badge appears immediately after session ends and disappears when recompute is done
- Works for any domain: medicine, CS, law, history, philosophy, engineering — no manual configuration
- Recompute completes within 30 seconds for a 1-hour lecture
- All existing tests pass; 3 new unit tests cover `segment_transcript`, `summarize_topic_segment`, and `recompute_final_summary` happy paths
