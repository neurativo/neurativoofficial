# backend/app/services/educational_reconstruction.py
"""
educational_reconstruction.py — B3 educational intelligence pipeline.

Architecture:
    classify_educational_segment()  — GPT classifies, returns structured JSON
    merge_educational_models()      — deterministic Python, deduplicates + builds model
    derive_master_summary_from_model() — deterministic composition, no GPT
    reconstruct_lecture_model()     — orchestrator, returns None on any failure

GPT classifies. Python organizes. Outputs are composed, not generated.
"""
from __future__ import annotations

import json
import re
import time

import app.services.openai_service as openai_service
from app.services.cost_tracker import log_cost
from app.services.summarization_service import segment_transcript

VALID_ROLES = frozenset({
    "foundational", "supporting", "procedural", "example",
    "analogy", "exam_trap", "admin", "chatter", "low_relevance",
})

# Role priority for elevation: higher index = higher priority
_ROLE_PRIORITY = {
    "low_relevance": 0, "chatter": 1, "admin": 2,
    "exam_trap": 3, "analogy": 4, "example": 5,
    "supporting": 6, "procedural": 7, "foundational": 8,
}

_IMPORTANCE_ORDER = {"high": 0, "medium": 1, "low": 2}
_CONFIDENCE_THRESHOLD = 0.25   # suppress from output if below this


def _canonical_concept_key(name: str) -> str:
    """Normalize concept name for deduplication: lowercase, strip punctuation, collapse whitespace."""
    if not name:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", name.lower())).strip()


def _validate_segment_model(model: dict) -> bool:
    """Return True only if the model is structurally valid with all evidence present."""
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
            return False
    return True


def _compute_educational_confidence(concept: dict) -> float:
    """
    Score how well-established this concept is as a curriculum entity.
    Returns a float in [0.0, 1.0].
    """
    score = 0.0
    if concept.get("transcript_evidence"):
        score += 0.20
    if concept.get("definition"):
        score += 0.20
    if concept.get("educational_importance") == "high":
        score += 0.20
    if concept.get("segment_count", 1) >= 2:
        score += 0.15
    if len(concept.get("distinctions") or []) >= 1:
        score += 0.10
    has_relationship = any([
        concept.get("related_to"),
        concept.get("contrasts_with"),
        concept.get("prerequisite_for"),
    ])
    if has_relationship:
        score += 0.10
    if len(concept.get("examples") or []) >= 1:
        score += 0.05

    role = concept.get("role", "")
    if role == "foundational":
        score += 0.10
    elif role in ("supporting", "procedural"):
        score += 0.05
    elif role not in ("foundational", "supporting", "procedural"):
        score *= 0.3

    return round(min(1.0, max(0.0, score)), 3)


def _detect_lifecycle_phase(existing: dict, incoming: dict) -> str:
    """
    Detect the pedagogical phase of a concept's reappearance.
    Uses heuristic rules — deterministic, no GPT.
    """
    has_existing_def = bool(existing.get("definition"))
    has_incoming_def = bool(incoming.get("definition"))
    has_example = bool(incoming.get("examples"))

    _DISTINCTION_MARKERS = (" vs ", " versus ", " whereas ", " unlike ", " contrast ")
    incoming_text = " ".join([
        incoming.get("definition") or "",
        " ".join(incoming.get("distinctions") or []),
        incoming.get("transcript_evidence") or "",
    ]).lower()

    if not has_existing_def and has_incoming_def:
        return "defined"
    if has_existing_def and has_incoming_def and incoming.get("definition") != existing.get("definition"):
        return "expanded"
    if has_example:
        return "exemplified"
    if any(m in incoming_text for m in _DISTINCTION_MARKERS):
        return "contrasted"
    if "appli" in incoming_text or "use this" in incoming_text or "problem" in incoming_text:
        return "applied"
    return "expanded"


def _merge_concept_records(existing: dict, incoming: dict, seg_idx: int) -> None:
    """Merge incoming concept data into existing registry entry in-place."""
    # Role can only go UP
    if _ROLE_PRIORITY.get(incoming.get("role", ""), 0) > _ROLE_PRIORITY.get(existing.get("role", ""), 0):
        existing["role"] = incoming["role"]

    # Prefer the longer/richer definition
    if incoming.get("definition") and (
        not existing.get("definition")
        or len(incoming["definition"]) > len(existing.get("definition", ""))
    ):
        existing["definition"] = incoming["definition"]

    # Merge lists (deduplicated)
    for field in ("distinctions", "examples", "misconceptions", "prerequisite_for", "related_to", "contrasts_with", "steps"):
        existing_list = existing.get(field) or []
        for item in incoming.get(field) or []:
            if item and item not in existing_list:
                existing_list.append(item)
        existing[field] = existing_list

    # Lifecycle — append new phase
    phase = _detect_lifecycle_phase(existing, incoming)
    existing["lifecycle"].append({
        "segment_index": seg_idx,
        "phase": phase,
        "brief": (incoming.get("transcript_evidence") or "")[:120],
    })


def merge_educational_models(segment_models: list[dict], topic: str | None = None) -> dict:
    """
    Reconcile per-segment models into a unified curriculum model.
    Deterministic Python — no GPT call.
    """
    if not segment_models:
        return {
            "domain": topic or "general",
            "foundational_concepts": [],
            "supporting_concepts": [],
            "procedural_concepts": [],
            "concept_relationships": [],
            "learning_objectives": [],
            "topic_flow": [],
            "reconstruction_quality": "insufficient",
            "fallback_recommended": True,
        }

    registry: dict[str, dict] = {}
    all_objectives = []

    # Step 1+2: Normalize, collect, deduplicate, build lifecycle
    for seg_idx, segment_model in enumerate(segment_models):
        for concept in segment_model.get("curriculum_concepts") or []:
            name = (concept.get("concept") or "").strip()
            if not name:
                continue
            key = _canonical_concept_key(name)
            if not key:
                continue

            if key not in registry:
                entry = {
                    **concept,
                    "concept": name,
                    "segment_count": 1,
                    "attached": False,
                    "lifecycle": [{
                        "segment_index": seg_idx,
                        "phase": "introduced",
                        "brief": (concept.get("transcript_evidence") or "")[:120],
                    }],
                    "examples": list(concept.get("examples") or []),
                    "distinctions": list(concept.get("distinctions") or []),
                    "steps": list(concept.get("steps") or []),
                    "related_to": list(concept.get("related_to") or []),
                    "contrasts_with": list(concept.get("contrasts_with") or []),
                    "prerequisite_for": list(concept.get("prerequisite_for") or []),
                    "misconceptions": list(concept.get("misconceptions") or []),
                }
                registry[key] = entry
            else:
                registry[key]["segment_count"] += 1
                _merge_concept_records(registry[key], concept, seg_idx)

        for obj in segment_model.get("learning_objectives") or []:
            all_objectives.append(obj)

    # Step 4: Attach examples and analogies to parent concepts
    for key, concept in list(registry.items()):
        if concept["role"] in ("example", "analogy"):
            parent_raw = (concept.get("parent_concept") or "").strip()
            parent_key = _canonical_concept_key(parent_raw)
            if parent_key and parent_key in registry:
                parent = registry[parent_key]
                example_name = concept["concept"]
                if example_name not in parent["examples"]:
                    parent["examples"].append(example_name)
                concept["attached"] = True
            else:
                # Orphaned — keep as low_relevance, do not discard
                concept["role"] = "low_relevance"

    # Step 5: Compute educational_confidence
    for concept in registry.values():
        concept["educational_confidence"] = _compute_educational_confidence(concept)

    # Step 8: Persistence boost
    for concept in registry.values():
        if concept["segment_count"] >= 2 and concept["role"] in ("foundational", "procedural"):
            concept["educational_confidence"] = min(
                1.0, concept["educational_confidence"] + 0.12
            )
            if concept.get("educational_importance") == "medium":
                concept["educational_importance"] = "high"

    # Step 6: Build curriculum hierarchy (filter non-educational)
    foundational = []
    supporting = []
    procedural = []
    for concept in registry.values():
        if concept.get("attached") or concept["role"] in ("admin", "chatter", "low_relevance"):
            continue
        if concept["role"] == "foundational":
            foundational.append(concept)
        elif concept["role"] == "supporting":
            supporting.append(concept)
        elif concept["role"] == "procedural":
            procedural.append(concept)

    # Sort by educational_importance desc, then confidence desc
    foundational.sort(key=lambda c: (
        _IMPORTANCE_ORDER.get(c.get("educational_importance", "low"), 2),
        -c.get("educational_confidence", 0.0),
    ))
    supporting.sort(key=lambda c: -c.get("educational_confidence", 0.0))

    # Step 7: Build relationship map (only foundational/supporting/procedural endpoints)
    eligible_keys = {
        _canonical_concept_key(c["concept"])
        for c in foundational + supporting + procedural
    }
    relationships = []
    seen_edges = set()
    for concept in foundational + supporting + procedural:
        source_name = concept["concept"]
        source_key = _canonical_concept_key(source_name)
        for target_name in concept.get("related_to") or []:
            target_key = _canonical_concept_key(target_name)
            if target_key in eligible_keys and target_key != source_key:
                edge = (source_key, target_key, "related")
                if edge not in seen_edges:
                    seen_edges.add(edge)
                    relationships.append({
                        "source": source_name,
                        "target": target_name,
                        "type": "related",
                        "confidence": round(concept.get("educational_confidence", 0.5), 2),
                    })
        for target_name in concept.get("contrasts_with") or []:
            target_key = _canonical_concept_key(target_name)
            if target_key in eligible_keys and target_key != source_key:
                edge = (source_key, target_key, "contrast")
                if edge not in seen_edges:
                    seen_edges.add(edge)
                    relationships.append({
                        "source": source_name,
                        "target": target_name,
                        "type": "contrast",
                        "confidence": round(concept.get("educational_confidence", 0.5), 2),
                    })

    # Step 9: Reconstruction quality
    n_foundational = len(foundational)
    n_with_def = sum(1 for c in foundational if c.get("definition"))
    if n_foundational >= 3 and n_with_def >= 2:
        quality = "high"
        fallback = False
    elif n_foundational >= 1 and n_with_def >= 1:
        quality = "medium"
        fallback = False
    elif n_foundational >= 1:
        quality = "low"
        fallback = False
    else:
        quality = "insufficient"
        fallback = True

    topic_flow = [c["concept"] for c in foundational[:8]]

    return {
        "domain": topic or "general",
        "foundational_concepts": foundational,
        "supporting_concepts": supporting,
        "procedural_concepts": procedural,
        "concept_relationships": relationships,
        "learning_objectives": all_objectives,
        "topic_flow": topic_flow,
        "reconstruction_quality": quality,
        "fallback_recommended": fallback,
    }


def derive_master_summary_from_model(model: dict, topic: str | None = None) -> str:
    """
    Compose master_summary markdown from the structured educational model.
    Deterministic — no GPT call. Summaries are views of the model, not generated prose.

    Invariants guaranteed:
    - Examples NEVER appear as ## section headers
    - Admin/chatter/low_relevance never appear
    - Section order: educational_importance desc, confidence desc
    - procedural steps appear in order inside their parent section
    - Concepts with educational_confidence < _CONFIDENCE_THRESHOLD (0.25) are suppressed
    """
    sections = []

    foundational = [
        c for c in model.get("foundational_concepts") or []
        if c.get("educational_confidence", 0.0) >= _CONFIDENCE_THRESHOLD
    ]
    # Re-sort by importance then confidence
    foundational.sort(key=lambda c: (
        _IMPORTANCE_ORDER.get(c.get("educational_importance", "low"), 2),
        -c.get("educational_confidence", 0.0),
    ))

    # Build a lookup: parent canonical key → list of procedural concepts
    procedural_by_parent: dict[str, list[dict]] = {}
    for proc in model.get("procedural_concepts") or []:
        parent_raw = (proc.get("parent_concept") or "").strip()
        parent_key = _canonical_concept_key(parent_raw)
        if parent_key:
            procedural_by_parent.setdefault(parent_key, []).append(proc)
        else:
            # Standalone procedural — attach to empty key for output at end
            procedural_by_parent.setdefault("", []).append(proc)

    def _render_concept_section(concept: dict) -> str:
        lines = [f"## {concept['concept']}"]
        lines.append("")

        if concept.get("definition"):
            lines.append(concept["definition"])
            lines.append("")

        if concept.get("distinctions"):
            lines.append(f"> {concept['distinctions'][0]}")
            lines.append("")

        related = concept.get("related_to") or []
        contrasts = concept.get("contrasts_with") or []
        key_terms = [concept["concept"]] + related[:2] + contrasts[:1]
        if len(key_terms) > 1:
            lines.append("Key concepts: " + ", ".join(f"`{t}`" for t in key_terms[:4]))
            lines.append("")

        if concept.get("examples"):
            lines.append("Examples:")
            for ex in concept["examples"][:3]:
                lines.append(f"→ {ex}")
            lines.append("")

        if concept.get("misconceptions"):
            lines.append(f"> Common trap: {concept['misconceptions'][0]}")
            lines.append("")

        # Attach procedural concepts under this foundational concept
        parent_key = _canonical_concept_key(concept["concept"])
        for proc in procedural_by_parent.get(parent_key) or []:
            if proc.get("steps"):
                lines.append(f"Steps: {proc['concept']}")
                for i, step in enumerate(proc["steps"], 1):
                    lines.append(f"→ Step {i}: {step}")
                lines.append("")

        lines.append("---")
        return "\n".join(lines)

    for concept in foundational:
        sections.append(_render_concept_section(concept))

    # Standalone procedural (no parent in foundational)
    for proc in procedural_by_parent.get("", []):
        if proc.get("educational_confidence", 0.0) < _CONFIDENCE_THRESHOLD:
            continue
        lines = [f"## {proc['concept']}", ""]
        if proc.get("steps"):
            for i, step in enumerate(proc["steps"], 1):
                lines.append(f"→ Step {i}: {step}")
        lines.append("")
        lines.append("---")
        sections.append("\n".join(lines))

    # Supporting concepts (medium+ importance, above threshold, non-admin)
    for concept in model.get("supporting_concepts") or []:
        if concept.get("role") in ("admin", "chatter", "low_relevance"):
            continue
        if concept.get("educational_confidence", 0.0) < _CONFIDENCE_THRESHOLD:
            continue
        if _IMPORTANCE_ORDER.get(concept.get("educational_importance", "low"), 2) > 1:
            continue  # skip low importance supporting
        sections.append(_render_concept_section(concept))

    return "\n\n".join(sections)


_GPT_SYSTEM_PROMPT = """\
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

{
  "segment_title": "Short academic curriculum title (3-6 words, specific)",
  "segment_educational_importance": "high|medium|low",
  "curriculum_concepts": [
    {
      "concept": "...",
      "role": "foundational|supporting|procedural|example|analogy|exam_trap|admin|chatter|low_relevance",
      "parent_concept": null,
      "definition": "...",
      "distinctions": [],
      "steps": [],
      "examples": [],
      "misconceptions": [],
      "prerequisite_for": [],
      "related_to": [],
      "contrasts_with": [],
      "transcript_evidence": "...",
      "educational_importance": "high|medium|low"
    }
  ],
  "learning_objectives": [
    {
      "objective_type": "define|compare|classify|derive|prove|apply|evaluate|analyze|calculate|interpret",
      "concepts": [],
      "transcript_evidence": "..."
    }
  ]
}"""


def classify_educational_segment(
    text: str,
    title: str,
    topic: str | None = None,
    language: str = "en",
) -> dict | None:
    """
    Replace summarize_topic_segment(). Classify each concept in the segment
    with an explicit educational role.

    Returns a validated segment model dict, or None on any failure.
    """
    if not openai_service.client or not (text or "").strip():
        return None

    topic_line = f" This is a {topic} lecture." if topic and topic != "general" else ""
    user_content = (
        f"Segment title (context hint only): {title}\n\n"
        f"Transcript text:\n{text}"
    )
    if language and language != "en":
        try:
            lang_name = openai_service.get_language_display_name(language)
            user_content += f"\n\nNote: Lecture is in {lang_name}. Classify in English."
        except Exception:
            pass

    last_err = None
    for attempt in range(3):
        try:
            response = openai_service.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": _GPT_SYSTEM_PROMPT + topic_line,
                    },
                    {"role": "user", "content": user_content},
                ],
                temperature=0.0,
                max_tokens=900,
                response_format={"type": "json_object"},
            )
            log_cost(
                "classify_educational_segment", "gpt-4o-mini",
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens,
            )
            raw = response.choices[0].message.content.strip()
            model = json.loads(raw)
            return model  # _validate_segment_model called by caller
        except json.JSONDecodeError as e:
            print(f"[reconstruction] classify JSON parse error (attempt {attempt + 1}): {e}")
            last_err = e
        except Exception as e:
            last_err = e
            if attempt < 2:
                time.sleep(2 ** attempt)

    print(f"[reconstruction] classify_educational_segment failed after 3 attempts: {last_err}")
    return None


def reconstruct_lecture_model(
    transcript: str,
    topic: str | None = None,
    language: str = "en",
) -> dict | None:
    """
    Full educational reconstruction pipeline — public API of this service.

    Returns {"educational_model": ..., "master_summary": ...} on success.
    Returns None on any failure — caller falls back to legacy path.
    Never raises.
    """
    try:
        if not transcript or not transcript.strip():
            return None

        segments = segment_transcript(transcript, topic)
        if not segments:
            print("[reconstruction] segment_transcript returned empty — returning None")
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
            print("[reconstruction] all segments failed validation — returning None for fallback")
            return None

        unified = merge_educational_models(segment_models, topic)
        if not unified or unified.get("fallback_recommended"):
            print(f"[reconstruction] merge recommended fallback (quality={unified.get('reconstruction_quality')})")
            return None

        summary = derive_master_summary_from_model(unified, topic)
        if not summary or not summary.strip():
            print("[reconstruction] derive produced empty summary — returning None")
            return None

        return {"educational_model": unified, "master_summary": summary}

    except Exception as e:
        print(f"[reconstruction] unexpected error in reconstruct_lecture_model: {e}")
        return None
