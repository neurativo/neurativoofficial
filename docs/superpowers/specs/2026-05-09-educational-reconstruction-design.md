# Educational Reconstruction Architecture — Design Spec
**Date:** 2026-05-09
**Status:** Approved for implementation
**Approach:** B3 — Segment → Classify → Merge → Derive

---

## 1. Problem Statement

The Neurativo pipeline currently operates in the wrong order:

```
Transcript → GPT summarizes → trust/intelligence layer reorganizes summaries
```

GPT is allowed to decide educational structure (via free-form summarization), and the intelligence layer attempts to repair the result afterward. This causes:

- **Transcript-locality bias**: chapters are grouped by when content appeared in the transcript, not by curriculum coherence
- **Example leakage**: GPT promotes examples (e.g. "Population Growth Sri Lanka") into section titles, which then enter the concept hierarchy
- **Weak concept persistence**: a concept briefly interrupted by a digression may be split across two chapters
- **Domain lock**: `_CURRICULUM_CONCEPT_RULES` / `_CANONICAL_TITLE_RULES` are hardcoded for economics, invisible to biology, law, CS, math
- **Dual pipeline confusion**: `generate_content()` and `generate_concept_master_summary()` run separately with no explicit precedence

**Required shift:**

```
Transcript → educational concept reconstruction → grounded curriculum model → all outputs derive from model
```

---

## 2. Core Architectural Principles

### 2.1 The educational model is the single source of truth

All downstream products — summary, grounded notes, concept sections, relationship graph, cheat sheet, flashcards, quizzes — derive from the same structured educational model. The model is built once per lecture from the transcript. GPT's role shifts from "decide structure" to "classify content."

### 2.2 Summaries are derived views, not source truth

`derive_master_summary_from_model()` is the most important principle in this redesign. Summaries are **composed from the educational model**, not generated as free-form AI prose. This means the summary is always consistent with the curriculum model, never ahead of it or contradicting it.

### 2.3 GPT classifies; Python organizes

GPT is used for what it is actually good at: reading natural-language text and assigning semantic roles. Python handles all deterministic logic: deduplication, merging, relationship building, ordering, composition. This makes the system inspectable and debuggable.

### 2.4 Examples are demoted, not discarded

Examples are educationally critical — they are the best learning mechanism in lectures. The architecture demotes examples from the curriculum hierarchy but keeps them as **first-class educational evidence attached to concepts**. Examples must remain:
- Retrievable per concept
- Visible in notes and revision systems
- Strongly typed as `role: "example"` so downstream systems can use them correctly

**Never discard examples. Attach them. Never promote them.**

---

## 3. New Pipeline (B3)

### 3.1 Recompute Path (live session end / upload)

```
transcript
  → clean_transcript()                         [UNCHANGED]
  → segment_transcript(transcript, topic)       [UNCHANGED — GPT, finds topic boundaries]
  → classify_educational_segment() × N          [NEW — replaces summarize_topic_segment()]
       returns structured JSON per segment
  → merge_educational_models(segment_models)    [NEW — deterministic Python, no GPT]
       returns unified curriculum model with lifecycle tracking
  → derive_master_summary_from_model(model)     [NEW — deterministic, no GPT]
       returns markdown for frontend display
  → update_lecture_summary_only(master_summary) [UNCHANGED — saves to DB]
  → save_generated_content(content)             [UNCHANGED — saves flashcards/quiz/glossary]
```

### 3.2 Lecture View Path (GET /lectures/{id})

```
DB master_summary (now model-derived, curriculum-organized)
  → build_grounded_notes()                      [UNCHANGED interface — better input quality]
  → build_concept_sections()                    [MODIFIED — locality bias removed]
  → build_claim_registry()                      [UNCHANGED]
  → build_concept_entities()                    [UNCHANGED]
  → build_concept_relationship_graph()          [UNCHANGED]
  → score_adaptive_concept_intelligence()       [UNCHANGED]
  → build_verified_cheat_sheet()                [UNCHANGED]
  → build_adaptive_study_weighting()            [UNCHANGED]
```

### 3.3 Fallback Path

If `classify_educational_segment()` fails (malformed JSON, GPT error, empty model):
- Fall back to existing `summarize_topic_segment()` path
- Log fallback occurrence for monitoring
- Existing `build_grounded_notes()` runs unchanged on the fallback summary

**The fallback is preserved indefinitely.** The new architecture will encounter malformed JSON, noisy transcripts, weak lectures, unusual ASR quality, and edge-case domains. Graceful degradation is not optional.

---

## 4. New Service: `educational_reconstruction.py`

**Location:** `backend/app/services/educational_reconstruction.py`

### 4.1 Concept Role Taxonomy (complete, with `procedural`)

Every item extracted from the transcript MUST be assigned exactly one role before entering any downstream system:

| Role | Meaning | Enters chapters? | Enters graph? | Enters cheat sheet? | Preserves order? |
|------|---------|-----------------|--------------|-------------------|-----------------|
| `foundational` | Core curriculum concept. Reusable, definable, teachable on its own. | YES | YES | YES | NO |
| `supporting` | Secondary concept that explains or extends a foundational concept. | YES (as subtopic) | YES | SOMETIMES | NO |
| `procedural` | Stepwise educational process where sequence continuity matters. | YES (as ordered subsection) | YES | AS STEPS | YES — must preserve order |
| `example` | Specific instance illustrating a concept. Lecture-local evidence. | NO (attached only) | NO | NO | NO |
| `analogy` | Comparison mechanism used to explain a concept. | NO (attached only) | NO | NO | NO |
| `exam_trap` | Misconception or confusion point explicitly warned about. | NO (attached to concept) | NO | AS WARNING | NO |
| `admin` | Logistics: marks, deadlines, schedules, attendance. | NO | NO | NO | NO |
| `chatter` | Filler, jokes, motivation, classroom management. | NO | NO | NO | NO |
| `low_relevance` | Transcript noise, repetition, unclear speech. | NO | NO | NO | NO |

#### The `procedural` role — why it is essential

Without `procedural`, the system flattens any stepwise educational content into unordered concepts or loses sequential dependencies. This breaks:

- **Mathematics**: derivation steps, proofs — order is the educational content
- **Physics**: problem-solving workflows, circuit analysis
- **Engineering**: design workflows, optimization procedures
- **CS/Programming**: algorithm steps, implementation sequences
- **Medicine**: diagnostic procedures, treatment protocols
- **Chemistry**: reaction mechanisms, synthesis steps

A `procedural` concept has `steps: [str]` (ordered list) instead of unordered `distinctions`. It is grouped as an ordered subsection inside the chapter of its parent foundational concept, or as its own chapter if it IS the primary content of a segment (e.g., a lecture dedicated entirely to proving a theorem).

**`procedural` in the GPT prompt:**
```
- "procedural": A stepwise educational process where the ORDER of steps matters.
  Use this for: mathematical derivations, proofs, algorithms, engineering workflows,
  medical procedures, chemical mechanisms, implementation sequences.
  The sequence IS the educational content.
  Include steps[] in order. Do not flatten into bullet points.
```

**`procedural` output schema extension:**
```json
{
  "concept": "Deriving the Quadratic Formula",
  "role": "procedural",
  "parent_concept": "Quadratic Equations",
  "steps": [
    "Start with ax² + bx + c = 0",
    "Divide both sides by a",
    "Complete the square by adding (b/2a)² to both sides",
    "Take the square root of both sides",
    "Isolate x to get x = (-b ± √(b²-4ac)) / 2a"
  ],
  "educational_importance": "high",
  "transcript_evidence": "let me show you how to derive this step by step"
}
```

### 4.2 Concept Lifecycle Tracking

Lectures frequently introduce a concept, then revisit, deepen, apply, and contrast it across multiple segments. Current merge logic deduplicates correctly but loses this **pedagogical progression**.

Every concept in the unified model carries a `lifecycle` array — a timeline of how the concept evolved across the lecture:

```json
{
  "concept": "Opportunity Cost",
  "lifecycle": [
    {"segment_index": 1, "phase": "introduced",  "brief": "first mention alongside scarcity"},
    {"segment_index": 3, "phase": "defined",     "brief": "formal definition given"},
    {"segment_index": 5, "phase": "applied",     "brief": "used to analyze a production decision"},
    {"segment_index": 7, "phase": "contrasted",  "brief": "contrasted with sunk cost"}
  ]
}
```

**Defined lifecycle phases:**

| Phase | Trigger |
|-------|---------|
| `introduced` | First mention of concept name; no definition yet |
| `defined` | Formal definition or explanation given |
| `expanded` | Additional depth, nuance, or qualification added |
| `exemplified` | A concrete example given for the concept |
| `contrasted` | Explicitly compared/contrasted with another concept |
| `applied` | Used to analyze a problem or case |
| `revised` | Corrected or nuanced from an earlier statement |
| `concluded` | Explicitly summarized or wrapped up |

**Implementation:** `merge_educational_models()` populates `lifecycle` as it processes segments in order. When a concept appears in segment N, a lifecycle entry is appended with the detected phase.

**Phase detection heuristics (deterministic Python, no GPT):**
- Segment index 0 (or first appearance) → `introduced`
- Concept has `definition` not seen before → `defined`
- Concept already has a definition, and new text adds to `distinctions` → `expanded`
- A new `examples` item arrives → `exemplified`
- Text contains `_DISTINCTION_MARKERS` → `contrasted`
- Concept appears in the context of a problem or scenario → `applied`

**Why this matters:** The lifecycle is the foundation for future tutoring infrastructure, adaptive revision sequencing, concept mastery tracking, and study roadmap generation. It does not need to be perfect in Phase 1 — even a simple introduced/defined/expanded/applied classification is vastly better than nothing.

### 4.3 Per-Concept Educational Confidence

Each concept in the unified model carries an `educational_confidence` float in [0.0, 1.0]. This is distinct from the claim-level `confidence` in the existing trust_service (which measures transcript grounding). Educational confidence measures **how well-established this concept is as a curriculum entity**.

**Scoring factors:**

| Factor | Weight | Rationale |
|--------|--------|-----------|
| Has `transcript_evidence` | +0.20 | Grounded in transcript |
| Has `definition` | +0.20 | Properly defined |
| `educational_importance == "high"` | +0.20 | GPT judged important |
| Appears in 2+ segments (persistence) | +0.15 | Concept recurs = central |
| Has ≥1 `distinction` | +0.10 | Well-articulated |
| Has ≥1 relationship (related/contrast/prereq) | +0.10 | Curriculum-connected |
| Has ≥1 `example` attached | +0.05 | Concretely illustrated |
| `role == "foundational"` | +0.10 bonus | Core concept |
| `role == "supporting"` | +0.05 bonus | Secondary |
| `role not in {foundational, supporting, procedural}` | ×0.3 penalty | Should not be a concept |

**Usage downstream:**
- `educational_confidence < 0.35` → suppress from cheat sheet, graph nodes, revision anchors
- `educational_confidence >= 0.65` → high-priority revision concept
- Used by `score_adaptive_concept_intelligence()` as an additional input signal
- Enables future hallucination suppression (low-confidence concepts get filtered harder)

### 4.4 Learning Objectives — Lightweight Structural Support

The architecture does NOT yet build a full learning objective system. However, the data structures and extraction logic are designed to accommodate it without breaking changes.

**What is extracted now (Phase 1):**

During `classify_educational_segment()`, GPT is asked to identify explicit learning objectives when they appear in the transcript:

```json
"learning_objectives": [
  {
    "objective_type": "compare",
    "concepts": ["Positive Statements", "Normative Statements"],
    "transcript_evidence": "by the end of this section you should be able to distinguish between..."
  }
]
```

**Objective types (Bloom's taxonomy alignment):**

| Type | Example trigger |
|------|----------------|
| `define` | "you should be able to define..." |
| `compare` | "distinguish between X and Y" |
| `classify` | "categorize these into..." |
| `derive` | "derive the formula for..." |
| `prove` | "prove that..." |
| `apply` | "use this to solve..." |
| `evaluate` | "assess whether..." |
| `analyze` | "analyze the relationship between..." |
| `calculate` | "compute / calculate..." |
| `interpret` | "interpret the meaning of..." |

**What is NOT built yet:** no objectives engine, no objective-to-quiz mapping, no adaptive sequencing driven by objectives. The data is captured and stored in the model's `learning_objectives` list. Phase 2 will use it.

**Why capture now:** Adding a `learning_objectives` field to the GPT classification prompt costs zero additional GPT calls. Retrofitting this later would require re-running reconstruction on all existing lectures.

### 4.5 `classify_educational_segment(text, title, topic, language)` → dict

**Purpose:** Replace `summarize_topic_segment()`. Instead of producing markdown prose, classifies each concept in the segment with an explicit educational role.

**Input:**
- `text`: raw transcript text for this segment
- `title`: segment title from `segment_transcript()` (used as context hint only)
- `topic`: detected domain (economics, biology, law, etc.) or None
- `language`: language code

**GPT call:** gpt-4o-mini, temperature=0.0, `response_format={"type": "json_object"}`, max_tokens=900

**System prompt:**

```
You are an educational knowledge engineer analyzing a lecture transcript segment.
Your task is NOT to summarize. Your task is to CLASSIFY the educational content
by identifying every concept and assigning it a precise educational role.

ROLE DEFINITIONS (assign exactly one per item):

"foundational" — A named, teachable curriculum concept with a definition.
  Can stand alone as a revision topic. The lecturer is explicitly TEACHING this idea.

"supporting" — A secondary concept that explains or qualifies a foundational concept.

"procedural" — A stepwise process where the ORDER of steps is the educational content.
  Use for: mathematical derivations, proofs, algorithms, engineering workflows,
  medical procedures, chemical mechanisms, implementation sequences.
  Include steps[] in order.

"example" — A specific case, location, person, event, or instance used to ILLUSTRATE.
  Specific countries, companies, patients, datasets are almost always examples, NOT concepts.
  Examples are educationally valuable — attach them to their parent concept.

"analogy" — A comparison or metaphor used to make a concept clearer.

"exam_trap" — A misconception, confusion point, or warning explicitly stated by the lecturer.

"admin" — Logistics: marks, deadlines, essay structure, MCQ count, attendance, schedules.

"chatter" — Filler, jokes, pacing comments, classroom management, motivation.

"low_relevance" — Transcript noise, repetition, unclear speech, incomplete sentences.

MANDATORY CLASSIFICATION RULES:
1. Specific locations (Sri Lanka, London, Tokyo), people, or events → role: "example"
2. "For example...", "Consider...", "Take the case of...", "Such as..." → role: "example"
3. "Do not confuse...", "Common mistake...", "Important: X ≠ Y", "Trap..." → role: "exam_trap"
4. "Next week...", "Essay question...", "Marks are...", "MCQ..." → role: "admin"
5. Every concept MUST include transcript_evidence — a short exact or near-exact quote
   from the transcript proving this concept was discussed. No evidence = low_relevance.
6. If the lecturer mentions a concept name without explaining it, use role: "supporting"
   with a null definition — do not invent a definition.
7. Only assign "foundational" if the lecturer actually names AND explains an idea
   that a student would need to learn and be tested on.
8. Examples are FIRST-CLASS educational evidence. Attach them carefully to their
   parent concept via parent_concept field. Do not discard them.

OUTPUT: Return ONLY valid JSON matching this exact schema. No prose. No markdown fences.
```

**Output schema:**
```json
{
  "segment_title": "Short academic curriculum title (3-6 words, specific)",
  "segment_educational_importance": "high|medium|low",
  "curriculum_concepts": [
    {
      "concept": "Scarcity",
      "role": "foundational",
      "parent_concept": null,
      "definition": "The condition where available resources are insufficient to satisfy all wants.",
      "distinctions": ["Scarcity differs from shortage — shortage is temporary, scarcity is fundamental"],
      "steps": [],
      "examples": ["limited oil reserves"],
      "misconceptions": ["A good being free of charge does not make it a non-economic good"],
      "prerequisite_for": ["Opportunity Cost", "Economic Choice"],
      "related_to": ["Resource Allocation", "Economic Goods"],
      "contrasts_with": ["Free Goods", "Public Goods"],
      "transcript_evidence": "every good that satisfies a want is limited in supply",
      "educational_importance": "high"
    },
    {
      "concept": "Population growth in Sri Lanka",
      "role": "example",
      "parent_concept": "Scarcity",
      "definition": null,
      "distinctions": [],
      "steps": [],
      "examples": [],
      "misconceptions": [],
      "prerequisite_for": [],
      "related_to": [],
      "contrasts_with": [],
      "transcript_evidence": "for example, population growth in Sri Lanka has increased demand for resources",
      "educational_importance": "low"
    },
    {
      "concept": "Deriving the Demand Curve",
      "role": "procedural",
      "parent_concept": "Demand",
      "definition": null,
      "distinctions": [],
      "steps": [
        "Start with individual utility maximization",
        "Hold income and other prices constant",
        "Vary the price of the good",
        "Record the quantity demanded at each price",
        "Plot price against quantity to get the demand curve"
      ],
      "examples": [],
      "misconceptions": [],
      "prerequisite_for": [],
      "related_to": ["Demand", "Consumer Surplus"],
      "contrasts_with": [],
      "transcript_evidence": "let me show you step by step how we derive the demand curve",
      "educational_importance": "medium"
    }
  ],
  "learning_objectives": [
    {
      "objective_type": "compare",
      "concepts": ["Economic Goods", "Free Goods"],
      "transcript_evidence": "by the end you should be able to distinguish between economic and free goods"
    }
  ]
}
```

**Domain-general design verification:**

| Domain | Foundational caught by | Examples caught by | Procedural needed for |
|--------|----------------------|-------------------|----------------------|
| Economics | "positive/normative distinction" → foundational | "Sri Lanka" → Rule 1 | Demand derivation, cost analysis |
| Biology | "ATP synthesis" → foundational | "a muscle cell in isolation" → Rule 2 | Enzyme reaction mechanisms |
| Medicine | "hypertension diagnostic criteria" → foundational | "Patient J, 45yo" → Rule 1 | Diagnostic procedure, dosing protocol |
| Law | "duty of care" → foundational | "Donoghue v Stevenson" → Rule 1 | Statutory interpretation steps |
| Mathematics | "Rolle's theorem" → foundational | "f(x) = x²" → Rule 2 | Proof derivations |
| CS | "binary search" → foundational | "searching [3,7,12] for 7" → example | Algorithm execution trace |
| Physics | "conservation of momentum" → foundational | "a 5kg block..." → Rule 2 | Derivation of kinematic equations |

### 4.6 `merge_educational_models(segment_models, topic)` → dict

**Purpose:** Reconcile per-segment models into a unified curriculum model. Handles concept persistence, lifecycle tracking, deduplication, relationship graph building, and role elevation. **No GPT call — pure deterministic Python.**

**Key operations (in order):**

**Step 1 — Normalize concept keys**
```python
def _canonical_concept_key(name: str) -> str:
    # lowercase, strip punctuation, collapse whitespace
    # "Economic Goods" == "economic goods" == "Economic  Goods"
    return re.sub(r'\s+', ' ', re.sub(r'[^\w\s]', '', name.lower())).strip()
```

**Step 2 — Collect and deduplicate across segments, building lifecycle**
```python
for seg_idx, segment_model in enumerate(segment_models):
    for concept in segment_model["curriculum_concepts"]:
        key = _canonical_concept_key(concept["concept"])
        if key not in registry:
            registry[key] = {**concept, "segment_count": 1,
                             "lifecycle": [{"segment_index": seg_idx, "phase": "introduced", ...}]}
        else:
            _merge_concept_records(registry[key], concept, seg_idx)
            registry[key]["segment_count"] += 1
```

**Step 3 — Role elevation (conservative)**
```
Role priority: foundational > procedural > supporting > example > analogy > exam_trap > admin > chatter > low_relevance

If same concept appears as "example" in segment 1 and "foundational" in segment 3:
    → elevate to "foundational". The concept was taught more fully — respect that.

Role can only go UP never down across merges.
```

**Step 4 — Attach examples and analogies to parent concepts**
```python
for key, concept in registry.items():
    if concept["role"] in ("example", "analogy"):
        parent_key = _canonical_concept_key(concept.get("parent_concept") or "")
        if parent_key and parent_key in registry:
            registry[parent_key]["examples"].append(concept["concept"])
            # Keep the example in registry with role preserved for retrieval
            # but mark attached=True so it's excluded from standalone hierarchy
            concept["attached"] = True
        else:
            # Orphaned example: keep as low_relevance, do not discard
            concept["role"] = "low_relevance"
```

**Step 5 — Compute educational_confidence per concept**
```python
for concept in registry.values():
    concept["educational_confidence"] = _compute_educational_confidence(concept)
```

**Step 6 — Filter non-educational content from curriculum hierarchy**
```python
# admin, chatter, low_relevance never enter hierarchy
# examples/analogies marked attached=True excluded from standalone hierarchy
# Kept in registry for downstream retrieval but not in curriculum_concepts output
```

**Step 7 — Build cross-segment relationship map**
```python
# Collect all relationships, normalize keys, deduplicate
# Only add edge if BOTH endpoints are foundational/supporting/procedural
```

**Step 8 — Concept persistence boost**
```python
for concept in registry.values():
    if concept["segment_count"] >= 2 and concept["role"] in ("foundational", "procedural"):
        concept["educational_confidence"] = min(1.0, concept["educational_confidence"] + 0.12)
        if concept.get("educational_importance") == "medium":
            concept["educational_importance"] = "high"  # multi-segment → elevate
```

**Output structure:**
```json
{
  "domain": "economics",
  "foundational_concepts": [
    {
      "concept": "Scarcity",
      "role": "foundational",
      "educational_confidence": 0.87,
      "educational_importance": "high",
      "definition": "...",
      "distinctions": [...],
      "examples": ["Population growth in Sri Lanka", "limited oil reserves"],
      "misconceptions": [...],
      "lifecycle": [
        {"segment_index": 0, "phase": "introduced"},
        {"segment_index": 2, "phase": "defined"},
        {"segment_index": 4, "phase": "applied"}
      ],
      "prerequisite_for": [...],
      "related_to": [...],
      "contrasts_with": [...]
    }
  ],
  "supporting_concepts": [...],
  "procedural_concepts": [...],
  "concept_relationships": [
    {"source": "Scarcity", "target": "Opportunity Cost", "type": "prerequisite_for", "confidence": 0.85}
  ],
  "learning_objectives": [...],
  "topic_flow": ["Scarcity", "Economic Goods", "Free Goods", "Opportunity Cost"],
  "reconstruction_quality": "high|medium|low",
  "fallback_recommended": false
}
```

### 4.7 `derive_master_summary_from_model(model, topic)` → str

**Purpose:** Produce the `master_summary` markdown from the structured educational model. **No GPT call — deterministic composition.**

This is the key architectural shift. Summaries are **views of the educational model**, not sources of educational truth. The output format is identical to the existing `master_summary` field so the frontend requires no changes.

**Composition rules:**
```
Sort order: foundational concepts by educational_importance desc, then educational_confidence desc
Then: procedural concepts grouped under their parent foundational concept
Then: supporting concepts (educational_importance >= "medium" only)

For each foundational concept:
    ## {concept}

    {definition}

    [if distinctions exist:]
    > {distinctions[0]}

    Key concepts: `{concept}`, `{related_to[:2]}`, `{contrasts_with[:1]}`

    [if examples exist:]
    Examples:
    → {examples[0]}
    → {examples[1]}  [if present]

    [if misconceptions exist:]
    > Common trap: {misconceptions[0]}

    [if procedural concepts attached:]
    Steps: {procedural.concept}
    → Step 1: {steps[0]}
    → Step 2: {steps[1]}
    ...

    ---
```

**Guaranteed invariants of derived summary:**
- Examples NEVER appear as `## Section Title` — always as `→ bullet`
- Admin/chatter never appear
- Section order reflects educational importance, not transcript position
- Every section title is the canonical concept name (stable, curriculum-aligned)
- `procedural` steps appear in order inside their parent concept section

### 4.8 `reconstruct_lecture_model(transcript, topic, language)` → dict

**Orchestrator function — public API of the service:**

```python
def reconstruct_lecture_model(transcript: str, topic: str | None = None, language: str = "en") -> dict | None:
    """
    Full educational reconstruction pipeline.
    Returns {"educational_model": ..., "master_summary": ...} on success.
    Returns None on failure (caller falls back to legacy path).
    Never raises.
    """
    try:
        segments = segment_transcript(transcript, topic)
        if not segments:
            return None

        segment_models = []
        for seg in segments:
            start = max(0, int(seg.get("start") or 0))
            end   = max(start, int(seg.get("end") or len(transcript)))
            text  = transcript[start:end].strip()
            title = (seg.get("title") or "").strip()
            if not text:
                continue
            model = classify_educational_segment(text, title, topic, language)
            if model and _validate_segment_model(model):
                segment_models.append(model)
            else:
                print(f"[reconstruction] segment '{title}' failed validation, skipping")

        if not segment_models:
            print("[reconstruction] all segments failed, returning None for fallback")
            return None

        unified = merge_educational_models(segment_models, topic)
        if not unified or unified.get("fallback_recommended"):
            return None

        summary = derive_master_summary_from_model(unified, topic)
        if not summary or not summary.strip():
            return None

        return {"educational_model": unified, "master_summary": summary}

    except Exception as e:
        print(f"[reconstruction] unexpected error: {e}")
        return None
```

---

## 5. Modified: `summarization_service.py`

**`generate_concept_master_summary()` — updated orchestration:**

```python
def generate_concept_master_summary(full_text: str, topic: str | None = None, language: str = "en") -> str:
    """
    Primary path: educational reconstruction → model-derived summary.
    Fallback: original summarize_topic_segment() path (unchanged, kept as _legacy).
    """
    from app.services.educational_reconstruction import reconstruct_lecture_model
    result = reconstruct_lecture_model(full_text, topic, language)
    if result and result.get("master_summary"):
        return result["master_summary"]
    # Automatic fallback — no error raised, legacy path runs silently
    print("[summarization] reconstruction failed or empty, using legacy path")
    return _generate_concept_master_summary_legacy(full_text, topic, language)


def _generate_concept_master_summary_legacy(full_text: str, topic: str | None = None, language: str = "en") -> str:
    """Legacy path — original summarize_topic_segment() logic. Kept intact indefinitely."""
    sections = []
    for seg in segment_transcript(full_text, topic):
        start = max(0, int(seg.get("start") or 0))
        end   = max(start, int(seg.get("end") or len(full_text)))
        title = (seg.get("title") or "").strip() or "Section"
        section = summarize_topic_segment(full_text[start:end], title=title, topic=topic, language=language)
        if section:
            sections.append(section.strip())
    return "\n\n".join(sections)
```

**`summarize_topic_segment()` is NOT deleted or renamed.** It becomes the legacy fallback. No callers break.

---

## 6. Modified: `trust_service.py`

### 6.1 Remove domain-locked rules

**DELETE these constants entirely:**
- `_CURRICULUM_CONCEPT_RULES` (lines 89–107) — 16 hardcoded economics rules
- `_CANONICAL_TITLE_RULES` (lines 113–124) — 10 hardcoded economics title rules
- `_CANONICAL_SUBTOPIC_RULES` (lines 125–140) — 16 hardcoded economics subtopic rules

**The functions that used them (`_canonical_curriculum_concept()`, `_canonical_title_from_text()`) will now return `None` more often** — which is correct. The GPT reconstruction pass now handles canonical concept detection. The fallback heuristics use domain-general patterns only.

### 6.2 Update `_ACADEMIC_TITLE_HINTS` — domain-general

**Remove economics-specific terms:**
```python
# REMOVE: "economics", "microeconomics", "macroeconomics", "positive", "normative",
#          "goods", "resources", "production", "utility", "demand", "supply",
#          "scarcity", "opportunity cost", "free goods", "public goods"
```

**Replace with universal educational markers:**
```python
_ACADEMIC_TITLE_HINTS = (
    # Universal curriculum structure
    "theory", "classification", "taxonomy", "hierarchy", "framework",
    "model", "principle", "law", "rule", "hypothesis",
    # Universal educational content
    "definition", "concept", "distinction", "comparison",
    # Universal STEM
    "theorem", "proof", "derivation", "formula", "equation",
    "mechanism", "pathway", "process", "system", "algorithm",
    "structure", "method", "procedure", "function",
    # Universal academic disciplines (generic)
    "analysis", "synthesis", "interpretation", "evaluation",
    "diagnosis", "precedent", "constraint", "optimization",
)
```

### 6.3 Update `_EXAMPLE_HINTS` — remove domain-specific items

**Remove:** `"population growth"`, `"bottled water"`, `"oxygen tank"`, `"rainwater"` (economics examples)

**Keep (domain-universal):**
```python
_EXAMPLE_HINTS = (
    "example", "illustration", "scenario", "case", "instance", "sample",
    "for example", "for instance", "such as", "consider", "take the case",
    "e.g.", "e.g,", "namely", "specifically", "to illustrate",
)
```

### 6.4 Fix locality bias in `_should_merge_into_current()`

**Demote transcript-time as primary decision signal:**

```python
def _should_merge_into_current(current, candidate, desired_sections, total_notes):
    if not current:
        return False

    candidate_sig = _note_curriculum_signature(candidate)
    current_sig   = _chapter_curriculum_signature(current)

    # PRIMARY GATES — curriculum identity (not locality)

    # Admin always absorbed — never creates chapters
    if candidate_sig["is_admin_only"]:
        return True

    # Same canonical curriculum concept → always merge regardless of time gap
    if (candidate_sig["canonical"]
            and candidate_sig["canonical"] == current_sig.get("canonical")):
        return True

    # Examples attach to the current chapter if they overlap — never split
    if candidate_sig["is_example_only"]:
        if _supports_current_examples(current, candidate) >= 0.12:
            return True
        citation_gap = _citation_gap_seconds(current, candidate)
        if citation_gap is None or citation_gap <= 90:
            return True  # close-by example → attach
        return False  # distant, unrelated example → let it float

    # Genuine curriculum transition → always split
    if _is_curriculum_transition(current, candidate):
        return False

    # SECONDARY — concept strength and family
    if _same_major_family(current, candidate):
        return True

    candidate_strength = candidate_sig["strength"]
    candidate_words    = _note_density(candidate)
    weak_candidate     = candidate_strength < 1.5 or (candidate_words < 35 and candidate_strength < 2.5)

    if weak_candidate and not _is_major_concept_note(candidate):
        return True

    # TIEBREAKER ONLY — transcript time (threshold raised 120s → 300s)
    citation_gap = _citation_gap_seconds(current, candidate)
    if citation_gap is not None and citation_gap >= 300 and _is_major_concept_note(candidate):
        return False  # very long gap + major concept → likely new chapter

    if _is_major_concept_note(candidate):
        return False

    current_words = sum(_note_density(n) for n in current)
    if current_words < 130:
        return True

    return False
```

### 6.5 Update `_educational_signal_type()` — domain-general

Replace economics-biased hints with domain-general patterns:

```python
def _educational_signal_type(text: str) -> str:
    lowered = _normalise_ws(text).lower().replace("-", " ")
    if not lowered:
        return "low educational relevance"
    if any(re.search(p, lowered) for p in _LOW_SIGNAL_TITLE_PATTERNS):
        return "administrative lecture content"
    if any(hint in lowered for hint in _ADMIN_HINTS):
        return "administrative lecture content"
    if any(hint in lowered for hint in _EXAMPLE_HINTS):
        return "example"
    if any(marker in lowered for marker in _TRAP_MARKERS):
        return "exam instruction"
    # Domain-general: any distinction or definition signal = foundational
    if any(marker in lowered for marker in _DISTINCTION_MARKERS):
        return "foundational concept"
    if any(marker in lowered for marker in _DEFINITION_MARKERS):
        return "foundational concept"
    if any(hint in lowered for hint in _ACADEMIC_TITLE_HINTS):
        return "supporting concept"
    return "low educational relevance"
```

### 6.6 Functions to keep completely unchanged

- `build_grounded_notes()` — interface unchanged, input quality improves
- `_find_best_evidence()` — correct grounding logic
- `_is_contradicted()` / `_has_relevant_contradiction()` — correct
- `_build_units()` — correct claim verification
- `build_claim_registry()` — correct
- `build_concept_entities()` — correct (already filters by role)
- `build_concept_relationship_graph()` — correct (already filters examples/admin from edges)
- `score_adaptive_concept_intelligence()` — correct pedagogical scoring formula
- `build_verified_cheat_sheet()` — correct (already gates by concept_role)
- `enrich_lecture_payload()` — correct orchestration, unchanged

---

## 7. Modified: `recompute_service.py`

**Clarify pipeline precedence — reconstruction summary is authoritative:**

The logic is the same as today, just with explicit intent:

```python
# Step 1: Educational reconstruction (primary — produces the authoritative master_summary)
concept_summary = generate_concept_master_summary(cleaned, topic=topic, language=language)

# Step 2: Study aids (flashcards, quiz, glossary) — generate_content() runs for these only
content = generate_content(cleaned, title, topic, language, force=not existing_ok,
                            existing_summary=existing_summary if existing_ok else "",
                            existing_flashcards=existing_flashcards)

# Step 3: Save
if content:
    content = sanitize_generated_content_bundle(
        cleaned, content,
        summary=concept_summary or content.get("summary", "")
    )
    save_generated_content(lecture_id, content)

# Step 4: Reconstruction summary overrides — always
if concept_summary:
    update_lecture_summary_only(lecture_id, concept_summary)
```

`content["summary"]` from `generate_content()` is still saved initially, but immediately overridden by `concept_summary`. This ensures the reconstruction summary is always what the user sees.

---

## 8. Soft Segmentation — Future Direction

The current architecture depends on `segment_transcript()` as a hard boundary source. This is acceptable for Phase 1 but is the largest remaining structural risk. Bad segmentation can still poison downstream reconstruction by splitting coherent concepts or fusing distinct ones.

**The merge layer already mitigates this substantially** via lifecycle tracking and role elevation. A concept split across two segments due to a bad boundary will still be merged during `merge_educational_models()` because both instances will share the same canonical key.

**Future direction (Phase 3+):** Move toward soft educational transitions — overlapping concept windows, rolling concept state, transition confidence scoring. The architecture is designed to accommodate this without breaking changes because:
- `merge_educational_models()` already operates on segment models as input; changing how segments are produced doesn't change the merge interface
- Lifecycle tracking already supports concepts spanning multiple segments
- `topic_flow` in the unified model already provides an educational ordering that transcends transcript position

**Do not implement this in Phase 1.** Design for it, don't block on it.

---

## 9. Quality Validation and Error Handling

### 9.1 `_validate_segment_model(model)` → bool

```python
VALID_ROLES = {"foundational", "supporting", "procedural", "example",
               "analogy", "exam_trap", "admin", "chatter", "low_relevance"}

def _validate_segment_model(model: dict) -> bool:
    if not isinstance(model, dict):
        return False
    concepts = model.get("curriculum_concepts")
    if not isinstance(concepts, list):
        return False
    for c in concepts:
        if not isinstance(c, dict):
            return False
        if c.get("role") not in VALID_ROLES:
            return False
        if not c.get("transcript_evidence"):
            return False  # evidence is mandatory — no phantom concepts
    return True
```

### 9.2 `reconstruction_quality` signal

Built during `merge_educational_models()`:

| Level | Condition | Action |
|-------|-----------|--------|
| `"high"` | ≥3 foundational concepts, all with definitions and evidence | Use reconstruction path |
| `"medium"` | ≥1 foundational concept with definition | Use reconstruction path |
| `"low"` | Only supporting/example found | Use reconstruction, warn |
| `"insufficient"` | 0 foundational concepts, <2 supporting | `fallback_recommended = True` → use legacy |

### 9.3 Failure modes and responses

| Failure | Response |
|---------|----------|
| GPT returns invalid JSON | Log, skip segment, use remaining segments |
| GPT returns valid JSON but fails validation | Log, skip segment |
| All segments fail | Return None → full legacy fallback |
| `merge_educational_models()` exception | Catch, return None → full legacy fallback |
| `derive_master_summary_from_model()` produces empty string | Return None → full legacy fallback |
| `reconstruct_lecture_model()` exception | Catch in outer try/except, return None |
| Legacy fallback also fails | Original behavior unchanged (empty summary) |

---

## 10. Domain-General Verification

The same classification rules handle all domains without branching:

| Domain | Foundational detection | Example detection | Procedural use |
|--------|----------------------|-------------------|---------------|
| Economics | distinction/definition markers | "Sri Lanka", "for example" | demand derivation |
| Biology | mechanism/pathway in `_ACADEMIC_TITLE_HINTS` | "a muscle cell", "such as" | enzyme mechanisms |
| Medicine | diagnostic criteria w/ definition | "Patient J", "consider this case" | clinical procedure |
| Law | principle + definition | "Donoghue v Stevenson" | statutory interpretation |
| Mathematics | theorem/derivation in hints | "f(x) = x²", "consider" | proof steps |
| CS | algorithm + definition | "searching [3,7,12]" | algorithm trace |
| Physics | law/theorem + definition | "a 5kg block", "for instance" | kinematic derivation |

**No domain-specific code paths exist in the new system.**

---

## 11. Test Plan

### 11.1 Existing tests (must still pass)

- `test_semantic_dedupe_collapses_near_duplicate_sentences` — unchanged
- `test_grounded_notes_drop_contradicted_claims` — unchanged
- `test_enrich_lecture_payload_adds_grounded_notes_and_ai_study_aids` — unchanged
- `test_build_concept_sections_extracts_educational_structure` — should pass with improved logic

### 11.2 New: `test_educational_reconstruction.py`

**`merge_educational_models()` tests (no GPT — fully deterministic):**
```python
test_merge_attaches_examples_to_parent_not_standalone()
test_merge_elevates_role_from_example_to_foundational()
test_merge_deduplicates_same_concept_across_segments()
test_merge_builds_lifecycle_in_segment_order()
test_merge_boosts_confidence_for_multi_segment_concepts()
test_merge_filters_admin_from_curriculum_hierarchy()
test_merge_preserves_procedural_step_order()
test_merge_orphaned_examples_become_low_relevance_not_discarded()
test_merge_returns_none_when_all_segments_empty()
```

**`derive_master_summary_from_model()` tests (no GPT — fully deterministic):**
```python
test_derive_examples_never_appear_as_section_headers()
test_derive_ordered_by_importance_not_segment_index()
test_derive_procedural_steps_appear_in_order()
test_derive_admin_never_appears_in_output()
test_derive_produces_valid_frontend_parseable_markdown()
test_derive_educational_confidence_gate_suppresses_weak_concepts()
```

**`classify_educational_segment()` tests (mock GPT):**
```python
test_classify_valid_schema_passes_validation()
test_classify_missing_evidence_fails_validation()
test_classify_invalid_role_fails_validation()
test_classify_fallback_triggered_on_json_error()
```

### 11.3 Modified: `test_trust_service.py`

```python
test_should_merge_same_canonical_merges_regardless_of_time_gap()
# Two notes, citation_gap=250s, same canonical concept → merged

test_should_merge_curriculum_transition_splits_regardless_of_proximity()
# Two notes, citation_gap=5s, different canonical concepts + transition detected → split

test_educational_signal_type_domain_general_law()
# "duty of care" → not "low educational relevance"

test_educational_signal_type_domain_general_biology()
# "ATP synthesis mechanism" → not "low educational relevance"

test_educational_signal_type_domain_general_cs()
# "binary search tree algorithm" → not "low educational relevance"

test_example_hints_no_longer_contain_economics_specifics()
# "population growth" not in _EXAMPLE_HINTS
# "bottled water" not in _EXAMPLE_HINTS
```

---

## 12. Files Changed Summary

| File | Action | Change |
|------|--------|--------|
| `backend/app/services/educational_reconstruction.py` | CREATE | New service — full B3 pipeline |
| `backend/app/services/summarization_service.py` | MODIFY | `generate_concept_master_summary()` routes to reconstruction; `summarize_topic_segment()` unchanged as legacy fallback |
| `backend/app/services/trust_service.py` | MODIFY | Remove economics-locked rule tables; domain-general hints; fix `_should_merge_into_current()` locality bias; domain-general `_educational_signal_type()` |
| `backend/app/services/recompute_service.py` | MODIFY | Explicit pipeline precedence — reconstruction summary is authoritative |
| `backend/tests/test_educational_reconstruction.py` | CREATE | New deterministic tests for merge and derive functions |
| `backend/tests/test_trust_service.py` | MODIFY | Add domain-general and locality-bias tests |

**Not changed:**
`transcript_cleaner.py`, `topic_service.py`, `qa_service.py`, `content_generator.py`, `pdf_service.py`, `endpoints.py`, all frontend files, DB schema.

---

## 13. Rollout Strategy

**Phase 1 (this implementation):**
- Build `educational_reconstruction.py`
- Modify `summarization_service.py`, `trust_service.py`, `recompute_service.py`
- Both paths active: reconstruction primary, legacy fallback automatic on any failure
- Log reconstruction quality and fallback frequency per lecture

**Phase 2 (after stability confirmed across domains):**
- Add `educational_model` JSONB column to `lectures` table
- Store structured model alongside `master_summary`
- `enrich_lecture_payload()` reads model when available (skips markdown parse entirely)
- Flashcards and quiz generated from educational model concepts (not raw transcript)

**Phase 3 (tutoring infrastructure):**
- Learning objectives drive quiz generation (Bloom's taxonomy alignment)
- Lifecycle tracking feeds adaptive study sequencing
- Concept confidence feeds tutoring AI personalization
- Soft segmentation (overlapping windows, rolling concept state)

---

## 14. System Invariants — What Must Always Be True

1. Examples NEVER appear as chapter titles, graph nodes, or cheat-sheet concepts
2. Examples remain first-class educational evidence, attached to parent concepts, never discarded
3. Admin/chatter content is never present in any educational output
4. Foundational concepts survive even if they appear in only one transcript segment
5. The same educational concept is never split across multiple chapters
6. `procedural` concepts preserve step order in all outputs
7. Chapter order reflects educational importance, not transcript chronology
8. Relationship graphs connect only foundational/supporting/procedural — never examples or admin
9. `master_summary` markdown is curriculum-organized, not lecture-chronology-organized
10. The pipeline never crashes on malformed GPT output — fallback always succeeds silently
11. All 20 supported domains produce valid educational models — no domain-specific code branches
12. `educational_confidence` is always in [0.0, 1.0] — never None, never negative
13. Lifecycle array is always in segment order — never reordered
14. Backward compatibility: all existing API response shapes are preserved exactly

---

## 15. Implementation Philosophy

The system increasingly behaves like a **curriculum designer** — not a transcript summarizer.

GPT classifies. Python organizes. Outputs are composed, not generated.

Every architectural decision prioritizes:
- **Modularity**: each function has one clear purpose and testable interface
- **Determinism**: merge, lifecycle, confidence, composition — all pure Python
- **Inspectability**: structured JSON at every stage, no opaque AI blobs
- **Graceful degradation**: fallback always available, never a hard crash
- **Incremental trust**: Phase 1 proves the pipeline, Phase 2 deepens it, Phase 3 extends it

Avoid: giant ontologies, symbolic AI overengineering, multi-stage GPT chaining, autonomous reasoning loops, premature abstraction.

---

*Spec self-review complete: No TBDs. No contradictions between sections. `procedural` role integrated throughout taxonomy table, GPT prompt, schema, merge logic, derive logic, and tests. Lifecycle tracking integrated in merge and output schema. Educational confidence integrated in merge and downstream usage. Learning objectives captured but not overengineered. Soft segmentation noted as future direction without premature implementation. All 14 invariants explicit and non-contradictory. Economics-specific logic absent from all new code.*
