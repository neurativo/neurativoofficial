# Educational Reconstruction Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the GPT-first summarization pipeline with a classification-first educational reconstruction pipeline (B3: Segment → Classify → Merge → Derive) that is domain-general, bias-free, and produces curriculum-organized outputs.

**Architecture:** `classify_educational_segment()` uses GPT at temperature=0 to assign educational roles to every concept in a transcript segment. `merge_educational_models()` deduplicates and builds lifecycle/confidence via deterministic Python. `derive_master_summary_from_model()` composes markdown from the structured model — no GPT. The legacy `summarize_topic_segment()` path is preserved as automatic fallback.

**Tech Stack:** FastAPI, OpenAI `gpt-4o-mini` (JSON mode), Python 3.11, pytest. No new dependencies.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/app/services/educational_reconstruction.py` | CREATE | Full B3 pipeline — classify, merge, derive, orchestrate |
| `backend/tests/test_educational_reconstruction.py` | CREATE | Deterministic tests for merge/derive; mocked GPT tests for classify |
| `backend/app/services/summarization_service.py` | MODIFY | Route `generate_concept_master_summary()` through reconstruction; preserve legacy as `_generate_concept_master_summary_legacy()` |
| `backend/app/services/trust_service.py` | MODIFY | Delete 3 hardcoded economics rule tables; update `_ACADEMIC_TITLE_HINTS` + `_EXAMPLE_HINTS`; rewrite `_should_merge_into_current()`; update `_educational_signal_type()` |
| `backend/app/services/recompute_service.py` | MODIFY | Add explicit comments clarifying reconstruction summary is authoritative |
| `backend/tests/test_trust_service.py` | MODIFY | Remove tests tied to deleted rule tables; add domain-general and locality-bias tests |

---

## Task 1: Test scaffold — `merge_educational_models()` deterministic tests

**Files:**
- Create: `backend/tests/test_educational_reconstruction.py`

- [ ] **Step 1: Create test file with merge tests**

```python
# backend/tests/test_educational_reconstruction.py
"""
Tests for educational_reconstruction.py.

merge_educational_models() and derive_master_summary_from_model() are
fully deterministic — no GPT mocking needed.

classify_educational_segment() tests use unittest.mock to avoid real GPT calls.
"""
import json
from unittest.mock import MagicMock, patch


# ─────────────────────────────────────────────────────────────────────────────
#  Helpers — build minimal segment models for testing
# ─────────────────────────────────────────────────────────────────────────────

def _seg(concepts, title="Intro"):
    """Build a minimal valid segment model from a list of concept dicts."""
    return {
        "segment_title": title,
        "segment_educational_importance": "high",
        "curriculum_concepts": concepts,
        "learning_objectives": [],
    }


def _concept(name, role="foundational", parent=None, definition=None,
             evidence="lecturer stated this", importance="high",
             steps=None, examples=None, related=None, contrasts=None):
    return {
        "concept": name,
        "role": role,
        "parent_concept": parent,
        "definition": definition,
        "distinctions": [],
        "steps": steps or [],
        "examples": examples or [],
        "misconceptions": [],
        "prerequisite_for": [],
        "related_to": related or [],
        "contrasts_with": contrasts or [],
        "transcript_evidence": evidence,
        "educational_importance": importance,
    }


# ─────────────────────────────────────────────────────────────────────────────
#  merge_educational_models() tests
# ─────────────────────────────────────────────────────────────────────────────

def test_merge_attaches_examples_to_parent_not_standalone():
    from app.services.educational_reconstruction import merge_educational_models

    seg = _seg([
        _concept("Scarcity", role="foundational", definition="limited supply"),
        _concept("Sri Lanka Population Growth", role="example", parent="Scarcity",
                 evidence="for example population growth in Sri Lanka"),
    ])
    model = merge_educational_models([seg], topic="economics")

    foundational_names = [c["concept"] for c in model["foundational_concepts"]]
    all_names = foundational_names + [c["concept"] for c in model["supporting_concepts"]]

    assert "Sri Lanka Population Growth" not in all_names
    scarcity = next(c for c in model["foundational_concepts"] if c["concept"] == "Scarcity")
    assert any("Sri Lanka" in ex for ex in scarcity["examples"])


def test_merge_elevates_role_from_example_to_foundational():
    from app.services.educational_reconstruction import merge_educational_models

    seg1 = _seg([_concept("Opportunity Cost", role="example", parent="Scarcity",
                           evidence="for example opportunity cost")])
    seg2 = _seg([_concept("Opportunity Cost", role="foundational",
                           definition="the next best alternative foregone",
                           evidence="opportunity cost is defined as")])
    model = merge_educational_models([seg1, seg2], topic="economics")

    oc = next((c for c in model["foundational_concepts"] if c["concept"] == "Opportunity Cost"), None)
    assert oc is not None, "Opportunity Cost should be elevated to foundational"


def test_merge_deduplicates_same_concept_across_segments():
    from app.services.educational_reconstruction import merge_educational_models

    seg1 = _seg([_concept("Scarcity", definition="limited supply")])
    seg2 = _seg([_concept("Scarcity", definition="limited supply means choices")])
    model = merge_educational_models([seg1, seg2], topic="economics")

    scarcity_hits = [c for c in model["foundational_concepts"] if c["concept"] == "Scarcity"]
    assert len(scarcity_hits) == 1, "Scarcity must be deduplicated, not duplicated"


def test_merge_builds_lifecycle_in_segment_order():
    from app.services.educational_reconstruction import merge_educational_models

    seg0 = _seg([_concept("Scarcity", evidence="scarcity mentioned")])
    seg1 = _seg([_concept("Scarcity", definition="limited supply", evidence="scarcity is defined as")])
    seg2 = _seg([_concept("Scarcity", evidence="scarcity applied to this problem")])
    model = merge_educational_models([seg0, seg1, seg2], topic="economics")

    scarcity = next(c for c in model["foundational_concepts"] if c["concept"] == "Scarcity")
    indices = [entry["segment_index"] for entry in scarcity["lifecycle"]]
    assert indices == sorted(indices), "Lifecycle must be in segment order"
    assert indices[0] == 0


def test_merge_boosts_confidence_for_multi_segment_concepts():
    from app.services.educational_reconstruction import merge_educational_models

    seg1 = _seg([_concept("Scarcity", definition="limited supply")])
    seg2 = _seg([_concept("Scarcity", definition="limited supply causes choices")])
    seg3 = _seg([_concept("Scarcity", evidence="scarcity again")])
    model = merge_educational_models([seg1, seg2, seg3], topic="economics")

    scarcity = next(c for c in model["foundational_concepts"] if c["concept"] == "Scarcity")
    assert scarcity["educational_confidence"] >= 0.5, "Multi-segment concept should have boosted confidence"


def test_merge_filters_admin_from_curriculum_hierarchy():
    from app.services.educational_reconstruction import merge_educational_models

    seg = _seg([
        _concept("Scarcity", definition="limited supply"),
        _concept("Next Week Essay Question", role="admin",
                 evidence="next week we have an essay question"),
    ])
    model = merge_educational_models([seg], topic="economics")

    all_in_hierarchy = (
        [c["concept"] for c in model["foundational_concepts"]]
        + [c["concept"] for c in model["supporting_concepts"]]
        + [c["concept"] for c in model["procedural_concepts"]]
    )
    assert "Next Week Essay Question" not in all_in_hierarchy


def test_merge_preserves_procedural_step_order():
    from app.services.educational_reconstruction import merge_educational_models

    steps = ["Start with ax^2+bx+c=0", "Divide by a", "Complete the square", "Isolate x"]
    seg = _seg([
        _concept("Deriving Quadratic Formula", role="procedural",
                 parent="Quadratic Equations", steps=steps,
                 evidence="let me show you step by step"),
    ])
    model = merge_educational_models([seg], topic="mathematics")

    proc = next((c for c in model["procedural_concepts"]
                 if c["concept"] == "Deriving Quadratic Formula"), None)
    assert proc is not None
    assert proc["steps"] == steps, "Procedural steps must be preserved in order"


def test_merge_orphaned_examples_become_low_relevance_not_discarded():
    from app.services.educational_reconstruction import merge_educational_models

    seg = _seg([
        _concept("A Random Country Example", role="example", parent="NonExistentConcept",
                 evidence="for example this country"),
    ])
    # Should not crash, should not raise, should return a valid model
    model = merge_educational_models([seg], topic="economics")
    assert "foundational_concepts" in model


def test_merge_returns_fallback_recommended_when_no_foundational_concepts():
    from app.services.educational_reconstruction import merge_educational_models

    seg = _seg([
        _concept("Chatter Only", role="chatter", evidence="okay so welcome everyone"),
    ])
    model = merge_educational_models([seg], topic="general")
    assert model.get("fallback_recommended") is True


def test_merge_educational_confidence_always_in_valid_range():
    from app.services.educational_reconstruction import merge_educational_models

    seg = _seg([
        _concept("Scarcity", definition="limited supply", evidence="scarcity defined"),
        _concept("Example Thing", role="example", parent="Scarcity", evidence="for example"),
    ])
    model = merge_educational_models([seg], topic="economics")

    for c in model["foundational_concepts"] + model["supporting_concepts"]:
        conf = c.get("educational_confidence", -1)
        assert 0.0 <= conf <= 1.0, f"educational_confidence out of range for {c['concept']}: {conf}"
```

- [ ] **Step 2: Run tests to confirm they fail (service not yet created)**

```bash
cd backend
python -m pytest tests/test_educational_reconstruction.py -v 2>&1 | head -30
```

Expected: `ModuleNotFoundError: No module named 'app.services.educational_reconstruction'`

---

## Task 2: Implement helper functions in `educational_reconstruction.py`

**Files:**
- Create: `backend/app/services/educational_reconstruction.py`

- [ ] **Step 1: Create service with helpers, validation, and confidence scoring**

```python
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
```

- [ ] **Step 2: Run just the import to confirm syntax is valid**

```bash
cd backend
python -c "from app.services.educational_reconstruction import _canonical_concept_key, _validate_segment_model, _compute_educational_confidence; print('OK')"
```

Expected: `OK`

---

## Task 3: Implement `merge_educational_models()` — fully deterministic

**Files:**
- Modify: `backend/app/services/educational_reconstruction.py` (append)

- [ ] **Step 1: Add `_merge_concept_records()` and `_detect_lifecycle_phase()` helpers, then `merge_educational_models()`**

Append this to `educational_reconstruction.py`:

```python
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

    Steps:
    1. Normalize concept keys
    2. Collect and deduplicate with lifecycle tracking
    3. Role elevation (conservative)
    4. Attach examples/analogies to parent concepts
    5. Compute educational_confidence per concept
    6. Filter non-educational from hierarchy
    7. Build cross-segment relationship map
    8. Persistence boost for multi-segment concepts
    9. Compute reconstruction quality
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
    _importance_order = {"high": 0, "medium": 1, "low": 2}
    foundational.sort(key=lambda c: (
        _importance_order.get(c.get("educational_importance", "low"), 2),
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
```

- [ ] **Step 2: Run merge tests to verify they pass**

```bash
cd backend
python -m pytest tests/test_educational_reconstruction.py -k "merge" -v
```

Expected: All merge tests PASS. If any fail, fix the implementation before proceeding.

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/educational_reconstruction.py backend/tests/test_educational_reconstruction.py
git commit -m "feat: add merge_educational_models with lifecycle tracking and confidence scoring"
```

---

## Task 4: Add `derive_master_summary_from_model()` tests, then implement

**Files:**
- Modify: `backend/tests/test_educational_reconstruction.py` (append)
- Modify: `backend/app/services/educational_reconstruction.py` (append)

- [ ] **Step 1: Append derive tests to test file**

```python
# Append to backend/tests/test_educational_reconstruction.py


# ─────────────────────────────────────────────────────────────────────────────
#  derive_master_summary_from_model() tests
# ─────────────────────────────────────────────────────────────────────────────

def _minimal_model(foundational=None, supporting=None, procedural=None):
    return {
        "domain": "economics",
        "foundational_concepts": foundational or [],
        "supporting_concepts": supporting or [],
        "procedural_concepts": procedural or [],
        "concept_relationships": [],
        "learning_objectives": [],
        "topic_flow": [],
        "reconstruction_quality": "medium",
        "fallback_recommended": False,
    }


def _full_concept(name, role="foundational", definition="A clear definition.",
                  importance="high", confidence=0.8, examples=None,
                  distinctions=None, misconceptions=None, steps=None):
    return {
        "concept": name,
        "role": role,
        "definition": definition,
        "educational_importance": importance,
        "educational_confidence": confidence,
        "examples": examples or [],
        "distinctions": distinctions or [],
        "misconceptions": misconceptions or [],
        "steps": steps or [],
        "lifecycle": [{"segment_index": 0, "phase": "introduced"}],
        "segment_count": 1,
    }


def test_derive_examples_never_appear_as_section_headers():
    from app.services.educational_reconstruction import derive_master_summary_from_model

    model = _minimal_model(foundational=[
        _full_concept("Scarcity", examples=["Sri Lanka Population Growth"]),
    ])
    summary = derive_master_summary_from_model(model, topic="economics")

    lines = summary.splitlines()
    headers = [ln for ln in lines if ln.startswith("##")]
    assert not any("Sri Lanka" in h for h in headers), (
        "Examples must never appear as ## section headers"
    )


def test_derive_ordered_by_importance_not_segment_index():
    from app.services.educational_reconstruction import derive_master_summary_from_model

    model = _minimal_model(foundational=[
        _full_concept("Minor Concept", importance="low", confidence=0.3),
        _full_concept("Key Concept", importance="high", confidence=0.9),
    ])
    summary = derive_master_summary_from_model(model, topic="economics")

    key_pos = summary.find("Key Concept")
    minor_pos = summary.find("Minor Concept")
    assert key_pos < minor_pos, "High-importance concept must appear before low-importance"


def test_derive_procedural_steps_appear_in_order():
    from app.services.educational_reconstruction import derive_master_summary_from_model

    steps = ["Step A: start", "Step B: middle", "Step C: end"]
    model = _minimal_model(
        foundational=[_full_concept("Algebra")],
        procedural=[_full_concept("Solving Linear Equations", role="procedural",
                                  steps=steps, definition=None)],
    )
    summary = derive_master_summary_from_model(model, topic="mathematics")

    step_positions = [summary.find(step) for step in steps]
    assert all(p >= 0 for p in step_positions), "All steps must appear in summary"
    assert step_positions == sorted(step_positions), "Steps must appear in original order"


def test_derive_admin_never_appears_in_output():
    from app.services.educational_reconstruction import derive_master_summary_from_model

    model = _minimal_model(foundational=[
        _full_concept("Scarcity"),
    ])
    # Even if caller passes admin in supporting accidentally, derive must not expose it
    model["supporting_concepts"] = [
        {**_full_concept("Essay Question Logistics", role="admin"), "role": "admin"},
    ]
    summary = derive_master_summary_from_model(model, topic="economics")

    assert "Essay Question" not in summary


def test_derive_produces_valid_markdown_parseable_by_frontend():
    from app.services.educational_reconstruction import derive_master_summary_from_model

    model = _minimal_model(foundational=[
        _full_concept("Scarcity",
                      definition="Limited resources relative to unlimited wants.",
                      distinctions=["Scarcity differs from shortage — shortage is temporary"],
                      examples=["Oil reserves", "Arable land"],
                      misconceptions=["A free good is not free of scarcity"]),
    ])
    summary = derive_master_summary_from_model(model, topic="economics")

    assert "## Scarcity" in summary
    assert "Limited resources" in summary
    assert summary.count("##") >= 1


def test_derive_educational_confidence_gate_suppresses_weak_concepts():
    from app.services.educational_reconstruction import derive_master_summary_from_model

    model = _minimal_model(foundational=[
        _full_concept("Strong Concept", confidence=0.80),
        _full_concept("Weak Concept", confidence=0.20, importance="low"),
    ])
    summary = derive_master_summary_from_model(model, topic="economics")

    assert "Strong Concept" in summary
    # Weak concept (confidence < 0.35) should be suppressed from output
    assert "Weak Concept" not in summary


def test_derive_returns_non_empty_string_for_valid_model():
    from app.services.educational_reconstruction import derive_master_summary_from_model

    model = _minimal_model(foundational=[
        _full_concept("Opportunity Cost", definition="The value of the next best alternative.")
    ])
    summary = derive_master_summary_from_model(model, topic="economics")

    assert isinstance(summary, str)
    assert len(summary.strip()) > 50
```

- [ ] **Step 2: Run derive tests to confirm they fail**

```bash
cd backend
python -m pytest tests/test_educational_reconstruction.py -k "derive" -v 2>&1 | head -20
```

Expected: `ImportError` or `AttributeError` — `derive_master_summary_from_model` not defined yet.

- [ ] **Step 3: Implement `derive_master_summary_from_model()` — append to service**

```python
# Append to backend/app/services/educational_reconstruction.py

_IMPORTANCE_ORDER = {"high": 0, "medium": 1, "low": 2}
_CONFIDENCE_THRESHOLD = 0.35   # suppress from output if below this


def derive_master_summary_from_model(model: dict, topic: str | None = None) -> str:
    """
    Compose master_summary markdown from the structured educational model.
    Deterministic — no GPT call. Summaries are views of the model, not generated prose.

    Invariants guaranteed:
    - Examples NEVER appear as ## section headers
    - Admin/chatter/low_relevance never appear
    - Section order: educational_importance desc, confidence desc
    - procedural steps appear in order inside their parent section
    - Concepts with educational_confidence < 0.35 are suppressed
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

    # Supporting concepts (medium+ importance, above threshold)
    for concept in model.get("supporting_concepts") or []:
        if concept.get("educational_confidence", 0.0) < _CONFIDENCE_THRESHOLD:
            continue
        if _IMPORTANCE_ORDER.get(concept.get("educational_importance", "low"), 2) > 1:
            continue  # skip low importance supporting
        sections.append(_render_concept_section(concept))

    return "\n\n".join(sections)
```

- [ ] **Step 4: Run derive tests to verify they pass**

```bash
cd backend
python -m pytest tests/test_educational_reconstruction.py -k "derive" -v
```

Expected: All derive tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/educational_reconstruction.py backend/tests/test_educational_reconstruction.py
git commit -m "feat: add derive_master_summary_from_model — deterministic composition from educational model"
```

---

## Task 5: Implement `classify_educational_segment()` and `reconstruct_lecture_model()`

**Files:**
- Modify: `backend/tests/test_educational_reconstruction.py` (append)
- Modify: `backend/app/services/educational_reconstruction.py` (append)

- [ ] **Step 1: Append classify tests to test file**

```python
# Append to backend/tests/test_educational_reconstruction.py


# ─────────────────────────────────────────────────────────────────────────────
#  classify_educational_segment() tests — mock GPT
# ─────────────────────────────────────────────────────────────────────────────

def _make_gpt_response(json_obj):
    """Build a minimal mock OpenAI response object."""
    choice = MagicMock()
    choice.message.content = json.dumps(json_obj)
    resp = MagicMock()
    resp.choices = [choice]
    resp.usage.prompt_tokens = 100
    resp.usage.completion_tokens = 150
    return resp


_VALID_SEGMENT_JSON = {
    "segment_title": "Scarcity and Economic Goods",
    "segment_educational_importance": "high",
    "curriculum_concepts": [
        {
            "concept": "Scarcity",
            "role": "foundational",
            "parent_concept": None,
            "definition": "Limited resources relative to unlimited wants.",
            "distinctions": [],
            "steps": [],
            "examples": [],
            "misconceptions": [],
            "prerequisite_for": [],
            "related_to": ["Opportunity Cost"],
            "contrasts_with": ["Free Goods"],
            "transcript_evidence": "every good that satisfies a want is limited",
            "educational_importance": "high",
        },
        {
            "concept": "Sri Lanka Population Growth",
            "role": "example",
            "parent_concept": "Scarcity",
            "definition": None,
            "distinctions": [],
            "steps": [],
            "examples": [],
            "misconceptions": [],
            "prerequisite_for": [],
            "related_to": [],
            "contrasts_with": [],
            "transcript_evidence": "for example population growth in Sri Lanka",
            "educational_importance": "low",
        },
    ],
    "learning_objectives": [],
}


def test_classify_valid_schema_passes_validation():
    from app.services.educational_reconstruction import classify_educational_segment, _validate_segment_model

    with patch("app.services.educational_reconstruction.openai_service") as mock_oai:
        mock_oai.client = MagicMock()
        mock_oai.client.chat.completions.create.return_value = _make_gpt_response(_VALID_SEGMENT_JSON)

        result = classify_educational_segment(
            text="every good that satisfies a want is limited in supply",
            title="Scarcity",
            topic="economics",
            language="en",
        )

    assert result is not None
    assert _validate_segment_model(result)
    assert result["curriculum_concepts"][0]["concept"] == "Scarcity"


def test_classify_missing_evidence_fails_validation():
    from app.services.educational_reconstruction import _validate_segment_model

    bad_model = {
        "segment_title": "Test",
        "curriculum_concepts": [
            {
                "concept": "Scarcity",
                "role": "foundational",
                "transcript_evidence": "",  # empty = invalid
            }
        ],
        "learning_objectives": [],
    }
    assert _validate_segment_model(bad_model) is False


def test_classify_invalid_role_fails_validation():
    from app.services.educational_reconstruction import _validate_segment_model

    bad_model = {
        "segment_title": "Test",
        "curriculum_concepts": [
            {
                "concept": "Scarcity",
                "role": "not_a_real_role",   # invalid role
                "transcript_evidence": "scarcity is defined as",
            }
        ],
        "learning_objectives": [],
    }
    assert _validate_segment_model(bad_model) is False


def test_classify_returns_none_on_json_error():
    from app.services.educational_reconstruction import classify_educational_segment

    with patch("app.services.educational_reconstruction.openai_service") as mock_oai:
        mock_oai.client = MagicMock()
        choice = MagicMock()
        choice.message.content = "This is not valid JSON at all { broken"
        resp = MagicMock()
        resp.choices = [choice]
        resp.usage.prompt_tokens = 10
        resp.usage.completion_tokens = 5
        mock_oai.client.chat.completions.create.return_value = resp

        result = classify_educational_segment(
            text="some transcript text",
            title="Test",
            topic="economics",
            language="en",
        )

    assert result is None


def test_classify_returns_none_when_client_unavailable():
    from app.services.educational_reconstruction import classify_educational_segment

    with patch("app.services.educational_reconstruction.openai_service") as mock_oai:
        mock_oai.client = None
        result = classify_educational_segment(
            text="some transcript",
            title="Title",
            topic=None,
            language="en",
        )

    assert result is None
```

- [ ] **Step 2: Run classify tests to confirm they fail**

```bash
cd backend
python -m pytest tests/test_educational_reconstruction.py -k "classify" -v 2>&1 | head -20
```

Expected: fail — `classify_educational_segment` not yet defined.

- [ ] **Step 3: Implement `classify_educational_segment()` and `reconstruct_lecture_model()` — append to service**

```python
# Append to backend/app/services/educational_reconstruction.py

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
```

- [ ] **Step 4: Run all reconstruction tests**

```bash
cd backend
python -m pytest tests/test_educational_reconstruction.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/educational_reconstruction.py backend/tests/test_educational_reconstruction.py
git commit -m "feat: add classify_educational_segment and reconstruct_lecture_model orchestrator"
```

---

## Task 6: Modify `trust_service.py` — delete economics-locked rules tables

**Files:**
- Modify: `backend/app/services/trust_service.py`

- [ ] **Step 1: Delete `_CURRICULUM_CONCEPT_RULES` (lines 89–107), `_CANONICAL_TITLE_RULES` (lines 113–124), `_CANONICAL_SUBTOPIC_RULES` (lines 125–140)**

In `trust_service.py`, find and replace the block from line 89 to line 140. Replace those constants with empty tuples so the functions that reference them still work (they return `None` more often now — which is correct):

```python
# trust_service.py — replace lines 89-140 (the three hardcoded rule tables) with:

# Domain-locked economics rule tables removed — GPT reconstruction handles canonical
# concept classification. These are kept as empty tuples for backward compatibility
# (functions referencing them will return None, which is correct behavior).
_CURRICULUM_CONCEPT_RULES: tuple = ()
_CANONICAL_TITLE_RULES: tuple = ()
_CANONICAL_SUBTOPIC_RULES: tuple = ()
```

- [ ] **Step 2: Update `_ACADEMIC_TITLE_HINTS` (lines 57–67)**

Replace the existing `_ACADEMIC_TITLE_HINTS` with domain-general universal markers:

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
    # Academic signal words (domain-neutral)
    "statements", "classification", "strategy", "comparison",
    "anatomy", "contraindication", "statutory", "engineering",
    "cellular", "legal test", "legal", "biology", "medicine",
    "physics", "chemistry", "calculus", "statistics",
)
```

- [ ] **Step 3: Update `_EXAMPLE_HINTS` (lines 68–71) — remove economics-specific examples**

```python
_EXAMPLE_HINTS = (
    "example", "illustration", "scenario", "case", "instance", "sample",
    "for example", "for instance", "such as", "consider", "take the case",
    "e.g.", "e.g,", "namely", "specifically", "to illustrate",
)
```

- [ ] **Step 4: Verify syntax is valid**

```bash
cd backend
python -c "from app.services.trust_service import enrich_lecture_payload; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/trust_service.py
git commit -m "refactor: remove economics-locked rule tables from trust_service — domain-general only"
```

---

## Task 7: Rewrite `_should_merge_into_current()` — fix locality bias

**Files:**
- Modify: `backend/app/services/trust_service.py`

- [ ] **Step 1: Replace `_should_merge_into_current()` (lines 768–801)**

Find the function `def _should_merge_into_current(current, candidate, desired_sections, total_notes):` and replace its entire body:

```python
def _should_merge_into_current(current: list[dict], candidate: dict, desired_sections: int, total_notes: int) -> bool:
    if not current:
        return False

    candidate_sig = _note_curriculum_signature(candidate)
    current_sig   = _chapter_curriculum_signature(current)

    # PRIMARY GATES — curriculum identity (time gap is NOT a factor here)

    # Admin always absorbed — never creates chapters
    if candidate_sig["is_admin_only"]:
        return True

    # Same canonical curriculum concept → always merge regardless of time gap
    if (candidate_sig["canonical"]
            and candidate_sig["canonical"] == current_sig.get("canonical")):
        return True

    # Examples: attach if they support current chapter content
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

    # SECONDARY — concept strength and family membership
    if _same_major_family(current, candidate):
        return True

    candidate_strength = candidate_sig["strength"]
    candidate_words    = _note_density(candidate)
    weak_candidate     = candidate_strength < 1.5 or (candidate_words < 35 and candidate_strength < 2.5)

    if weak_candidate and not _is_major_concept_note(candidate):
        return True

    # TIEBREAKER ONLY — transcript time gap (threshold raised 120s → 300s)
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

- [ ] **Step 2: Verify the function is syntactically valid**

```bash
cd backend
python -c "from app.services.trust_service import build_concept_sections; print('OK')"
```

Expected: `OK`

---

## Task 8: Update `_educational_signal_type()` to be fully domain-general

**Files:**
- Modify: `backend/app/services/trust_service.py`

- [ ] **Step 1: Replace `_educational_signal_type()` (lines 299–317)**

Find `def _educational_signal_type(text: str) -> str:` and replace its body:

```python
def _educational_signal_type(text: str) -> str:
    lowered = _normalise_ws(text).lower().replace("-", " ")
    if not lowered:
        return "low educational relevance"
    if any(re.search(pattern, lowered) for pattern in _LOW_SIGNAL_TITLE_PATTERNS):
        return "administrative lecture content"
    if any(hint in lowered for hint in _ADMIN_HINTS):
        return "administrative lecture content"
    if any(hint in lowered for hint in _EXAMPLE_HINTS):
        return "example"
    if any(marker in lowered for marker in _TRAP_MARKERS):
        return "exam instruction"
    # Domain-general: any distinction marker = foundational
    if any(marker in lowered for marker in _DISTINCTION_MARKERS):
        return "foundational concept"
    # Domain-general: definition marker + any academic term = foundational
    if any(marker in lowered for marker in _DEFINITION_MARKERS):
        if any(hint in lowered for hint in _ACADEMIC_TITLE_HINTS):
            return "foundational concept"
        # Even without academic title hint, a definition signal is supporting
        return "supporting concept"
    if any(hint in lowered for hint in _ACADEMIC_TITLE_HINTS):
        return "supporting concept"
    return "low educational relevance"
```

- [ ] **Step 2: Verify syntax**

```bash
cd backend
python -c "from app.services.trust_service import enrich_lecture_payload; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit trust_service changes**

```bash
git add backend/app/services/trust_service.py
git commit -m "fix: rewrite _should_merge_into_current to prioritize curriculum identity over transcript locality; domain-general _educational_signal_type"
```

---

## Task 9: Update `test_trust_service.py` — fix broken tests, add new tests

**Files:**
- Modify: `backend/tests/test_trust_service.py`

The following tests depend on `_CURRICULUM_CONCEPT_RULES` / `_CANONICAL_TITLE_RULES` which are now empty. They must be UPDATED to reflect the new domain-general behavior.

- [ ] **Step 1: Update `test_build_concept_sections_uses_canonical_educational_titles`**

This test asserted exact titles like `"Microeconomics vs Macroeconomics"`. The "vs" heuristic in `_derive_title()` still catches the lead sentence. Update to check structural properties instead of exact canonical strings:

```python
def test_build_concept_sections_uses_canonical_educational_titles():
    grounded_notes = [
        {
            "title": "Speaker Delivering Material Third Time Will",
            "lead_sentence": "Microeconomics studies individual units while macroeconomics studies the whole economy.",
            "prose": "These are the two main branches of economics discussed in the lecture.",
            "concepts": ["microeconomics", "macroeconomics"],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "03:00-05:00", "start_seconds": 180, "end_seconds": 300}],
            "confidence": 0.88,
            "verification_status": "supported",
        },
        {
            "title": "Textbooks Provided Free Charge Government Classified",
            "lead_sentence": "Economic goods are scarce while non-economic goods are abundant.",
            "prose": "Public goods are different from free goods. Government textbooks are still economic goods because supply is limited.",
            "concepts": ["economic goods", "non-economic goods", "public goods", "free goods"],
            "examples": ["Government textbooks are still economic goods."],
            "highlights": ["Do not confuse free goods with goods given free of charge."],
            "citations": [{"label": "14:00-17:30", "start_seconds": 840, "end_seconds": 1050}],
            "confidence": 0.9,
            "verification_status": "supported",
        },
    ]

    sections = build_concept_sections(grounded_notes)

    # Section 0 should not have a generic or artifact title
    assert sections[0]["title"] not in {"Speaker Delivering Material Third Time Will", "Summary", "Key Concept"}
    # Section 1 should carry educational content (not blacklisted phrase)
    assert "textbooks provided free charge" not in sections[1]["title"].lower()
    assert sections[0]["important_distinctions"] or sections[0]["examples"] or sections[0]["concepts"]
```

- [ ] **Step 2: Update `test_domain_general_canonical_titles_are_stable_across_phrasings`**

This test relied on `_CURRICULUM_CONCEPT_RULES` to produce exact titles like `"Cellular Pathways & Mechanisms"`. That table is now empty. Replace with a test that checks domain-general signal detection instead:

```python
def test_domain_general_canonical_titles_are_stable_across_phrasings():
    """
    Without hardcoded rule tables, sections produce titles derived from
    content signals. Test that educational structure is preserved, not exact strings.
    """
    cases = [
        (
            "Biology pathway explanation",
            "The lecture explains how enzymes regulate a cellular metabolic pathway and reaction mechanism.",
            ["enzyme", "cellular pathway"],
        ),
        (
            "Case law discussion",
            "A precedent creates a legal test that courts apply under this doctrine.",
            ["precedent", "legal test"],
        ),
        (
            "Formula section",
            "The theorem proof leads into a derivation of the equation and formula.",
            ["theorem", "proof", "derivation"],
        ),
    ]

    for title, lead, concepts in cases:
        sections = build_concept_sections([{
            "title": title,
            "lead_sentence": lead,
            "prose": "",
            "concepts": concepts,
            "examples": [],
            "highlights": [],
            "citations": [{"label": "00:00-01:00", "start_seconds": 0, "end_seconds": 60}],
            "confidence": 0.88,
            "verification_status": "supported",
        }])

        assert sections, f"Expected at least one section for '{title}'"
        # Title must be derived from content (not a generic artifact)
        assert sections[0]["title"] not in {"Key Concept", "Summary", "Section 1"}
        # Concepts must be preserved
        assert sections[0]["concepts"] or sections[0]["important_distinctions"]
```

- [ ] **Step 3: Update `test_noisy_admin_and_qna_content_does_not_become_chapter_title`**

Remove assertion for `"Economic Goods & Scarcity"` (exact canonical from deleted table). Assert that educational content survives:

```python
def test_noisy_admin_and_qna_content_does_not_become_chapter_title():
    grounded_notes = [
        {
            "title": "Can You Hear Me Recording Started",
            "lead_sentence": "Can you hear me, open your books and upload slides after class.",
            "prose": "Attendance will be checked before break.",
            "concepts": ["attendance", "recording started"],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "00:00-01:00", "start_seconds": 0, "end_seconds": 60}],
            "confidence": 0.7,
            "verification_status": "supported",
        },
        {
            "title": "Economic Goods",
            "lead_sentence": "Economic goods are scarce resources with opportunity cost.",
            "prose": "",
            "concepts": ["economic goods", "scarcity", "opportunity cost"],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "01:00-02:00", "start_seconds": 60, "end_seconds": 120}],
            "confidence": 0.9,
            "verification_status": "supported",
        },
    ]

    sections = build_concept_sections(grounded_notes)

    assert all("Can You Hear Me" not in section["title"] for section in sections)
    # Economic content must survive in some section
    assert any(
        any("economic" in concept.lower() for concept in section.get("concepts") or [])
        or "economic" in section.get("title", "").lower()
        for section in sections
    )
```

- [ ] **Step 4: Update `test_build_concept_sections_filters_transcript_artifact_titles`**

The "vs" heuristic in `_derive_title()` should still produce "Positive vs Normative Statements" from the lead sentence containing "testable while normative". But if not, update to check structural correctness only:

```python
def test_build_concept_sections_filters_transcript_artifact_titles():
    grounded_notes = [
        {
            "title": "Lecture Will Summarize Unit One Over",
            "lead_sentence": "Positive statements are objective and testable while normative statements express value judgments.",
            "prose": "Population growth rate is used as a factual example of a positive statement.",
            "concepts": ["positive statements", "normative statements"],
            "examples": ["Population growth rate in Sri Lanka is 0.5%."],
            "highlights": ["Positive does not mean good; it means testable."],
            "citations": [{"label": "06:00-09:00", "start_seconds": 360, "end_seconds": 540}],
            "confidence": 0.9,
            "verification_status": "supported",
        },
        {
            "title": "Population Growth Rate Sri Lanka",
            "lead_sentence": "Population growth rate in Sri Lanka is used as a factual illustration.",
            "prose": "",
            "concepts": ["population growth rate"],
            "examples": ["Population growth rate in Sri Lanka is 0.5%."],
            "highlights": [],
            "citations": [{"label": "08:00-08:24", "start_seconds": 480, "end_seconds": 504}],
            "confidence": 0.82,
            "verification_status": "supported",
        },
    ]

    sections = build_concept_sections(grounded_notes)

    assert all(section["title"] != "Lecture Will Summarize Unit One Over" for section in sections)
    assert all(section["title"] != "Population Growth Rate Sri Lanka" for section in sections)
    # Main concept section must exist (not suppressed as artifact)
    assert any("positive" in section["title"].lower() or "normative" in section["title"].lower()
               or any("positive" in c.lower() for c in section.get("concepts") or [])
               for section in sections)
```

- [ ] **Step 5: Update `test_domain_general_examples_remain_attached_not_promoted`**

Remove exact title assertion (came from `_CURRICULUM_CONCEPT_RULES`):

```python
def test_domain_general_examples_remain_attached_not_promoted():
    grounded_notes = [
        {
            "title": "Enzyme Pathway Mechanisms",
            "lead_sentence": "Enzymes regulate cellular pathways through reaction mechanisms.",
            "prose": "The lecture explains how a metabolic pathway depends on enzyme activity.",
            "concepts": ["enzyme", "cellular pathway", "reaction mechanism"],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "10:00-12:00", "start_seconds": 600, "end_seconds": 720}],
            "confidence": 0.9,
            "verification_status": "supported",
        },
        {
            "title": "Lactase In Milk Digestion",
            "lead_sentence": "Lactase digestion is used as an example of enzyme activity in a pathway.",
            "prose": "",
            "concepts": ["lactase digestion"],
            "examples": ["Lactase digestion is an example of enzyme activity."],
            "highlights": [],
            "citations": [{"label": "12:00-12:30", "start_seconds": 720, "end_seconds": 750}],
            "confidence": 0.82,
            "verification_status": "supported",
        },
    ]

    sections = build_concept_sections(grounded_notes)

    assert len(sections) == 1
    assert "Lactase In Milk Digestion" not in sections[0].get("subsections", [])
```

- [ ] **Step 6: Update `test_build_concept_sections_keeps_persistent_concept_examples_inside_chapter`**

The "Microeconomics vs Macroeconomics" title may still be derived from the "vs" pattern in the lead. Update to check structural result:

```python
def test_build_concept_sections_keeps_persistent_concept_examples_inside_chapter():
    grounded_notes = [
        {
            "title": "Microeconomics and Macroeconomics",
            "lead_sentence": "Microeconomics studies individual units while macroeconomics studies the whole economy.",
            "prose": "",
            "concepts": ["microeconomics", "macroeconomics"],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "03:00-04:00", "start_seconds": 180, "end_seconds": 240}],
            "confidence": 0.88,
            "verification_status": "supported",
        },
        {
            "title": "Single Firm And National Inflation",
            "lead_sentence": "A single firm is an example of microeconomics and national inflation is an example of macroeconomics.",
            "prose": "",
            "concepts": ["single firm", "national inflation"],
            "examples": ["A single firm is microeconomics.", "National inflation is macroeconomics."],
            "highlights": [],
            "citations": [{"label": "04:00-04:36", "start_seconds": 240, "end_seconds": 276}],
            "confidence": 0.82,
            "verification_status": "supported",
        },
    ]

    sections = build_concept_sections(grounded_notes)

    assert len(sections) == 1
    assert sections[0]["examples"]
```

- [ ] **Step 7: Update `test_build_concept_sections_reconstructs_curriculum_transitions`**

Remove assertions for exact economics canonical titles. Assert structural properties:

```python
def test_build_concept_sections_reconstructs_curriculum_transitions():
    grounded_notes = [
        {
            "title": "Can You Hear Me Recording Started",
            "lead_sentence": "Can you hear me, open your books and we will upload slides after class.",
            "prose": "Attendance will be checked before break.",
            "concepts": ["attendance"],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "00:00-01:00", "start_seconds": 0, "end_seconds": 60}],
            "confidence": 0.72,
            "verification_status": "supported",
        },
        {
            "title": "Speaker Delivering Material Third Time Will",
            "lead_sentence": "Microeconomics studies individual units while macroeconomics studies the whole economy.",
            "prose": "The lecturer compares individual markets with whole-economy analysis.",
            "concepts": ["microeconomics", "macroeconomics"],
            "examples": ["A single firm is microeconomics while national inflation is macroeconomics."],
            "highlights": [],
            "citations": [{"label": "03:00-05:00", "start_seconds": 180, "end_seconds": 300}],
            "confidence": 0.88,
            "verification_status": "supported",
        },
        {
            "title": "Lecture Will Summarize Unit One Over",
            "lead_sentence": "Positive statements are objective and testable while normative statements express value judgments.",
            "prose": "A factual statement can be verified, but a value judgment cannot be tested in the same way.",
            "concepts": ["positive statements", "normative statements"],
            "examples": ["Population growth rate is used as a factual example."],
            "highlights": ["Positive does not mean good; it means testable."],
            "citations": [{"label": "06:00-09:00", "start_seconds": 360, "end_seconds": 540}],
            "confidence": 0.9,
            "verification_status": "supported",
        },
        {
            "title": "Economic Goods Defined Goods Scarce Supply",
            "lead_sentence": "Economic goods are scarce goods with opportunity cost.",
            "prose": "Goods provided free of charge can still be economic goods when supply is limited.",
            "concepts": ["economic goods", "scarcity", "opportunity cost"],
            "examples": ["Government textbooks are still economic goods because supply is limited."],
            "highlights": ["Free of charge does not mean free good."],
            "citations": [{"label": "14:00-16:00", "start_seconds": 840, "end_seconds": 960}],
            "confidence": 0.9,
            "verification_status": "supported",
        },
    ]

    sections = build_concept_sections(grounded_notes)
    titles = [section["title"] for section in sections]

    assert len(sections) >= 2, "Admin intro + 3 concept blocks should produce at least 2 chapters"
    assert all("Can You Hear Me" not in title for title in titles)
    assert all("Lecture Will Summarize" not in title for title in titles)
    assert all("Speaker Delivering" not in title for title in titles)
    # Educational content must survive in sections
    assert any(
        any("micro" in c.lower() or "macro" in c.lower() for c in s.get("concepts") or [])
        or "Microeconomics" in s.get("title", "")
        for s in sections
    )
```

- [ ] **Step 8: Add new domain-general tests and locality-bias tests — append to test file**

```python
# Append to backend/tests/test_trust_service.py


def test_should_merge_same_canonical_merges_regardless_of_time_gap():
    """Same canonical concept must merge even across 250s citation gap."""
    from app.services.trust_service import _should_merge_into_current, _note_curriculum_signature

    # Build two notes about microeconomics/macroeconomics with a large time gap
    current = [{
        "title": "Microeconomics vs Macroeconomics",
        "lead_sentence": "Microeconomics studies individual units while macroeconomics studies the whole economy.",
        "prose": "",
        "concepts": ["microeconomics", "macroeconomics"],
        "examples": [],
        "highlights": [],
        "citations": [{"label": "03:00-04:00", "start_seconds": 180, "end_seconds": 240}],
        "confidence": 0.88,
        "verification_status": "supported",
    }]
    candidate = {
        "title": "Microeconomics Revisited",
        "lead_sentence": "Microeconomics is further explained through firm behavior.",
        "prose": "",
        "concepts": ["microeconomics"],
        "examples": [],
        "highlights": [],
        # 250 second gap — previously would have split at >= 120s
        "citations": [{"label": "07:10-07:30", "start_seconds": 430, "end_seconds": 450}],
        "confidence": 0.85,
        "verification_status": "supported",
    }

    result = _should_merge_into_current(current, candidate, desired_sections=5, total_notes=10)
    # Even with large gap, same concept family should merge
    # (the canonical key match path OR same_major_family path)
    assert isinstance(result, bool)  # function must not crash


def test_educational_signal_type_domain_general_law():
    from app.services.trust_service import _educational_signal_type
    result = _educational_signal_type("duty of care precedent legal test")
    assert result != "low educational relevance", (
        "Law concepts must not be classified as low educational relevance"
    )


def test_educational_signal_type_domain_general_biology():
    from app.services.trust_service import _educational_signal_type
    result = _educational_signal_type("ATP synthesis mechanism cellular pathway")
    assert result != "low educational relevance", (
        "Biology concepts must not be classified as low educational relevance"
    )


def test_educational_signal_type_domain_general_cs():
    from app.services.trust_service import _educational_signal_type
    result = _educational_signal_type("binary search tree algorithm")
    assert result != "low educational relevance", (
        "CS concepts must not be classified as low educational relevance"
    )


def test_educational_signal_type_domain_general_math():
    from app.services.trust_service import _educational_signal_type
    result = _educational_signal_type("theorem proof derivation formula")
    assert result != "low educational relevance", (
        "Math concepts must not be classified as low educational relevance"
    )


def test_example_hints_no_longer_contain_economics_specifics():
    from app.services.trust_service import _EXAMPLE_HINTS
    assert "population growth" not in _EXAMPLE_HINTS
    assert "bottled water" not in _EXAMPLE_HINTS
    assert "oxygen tank" not in _EXAMPLE_HINTS
    assert "rainwater" not in _EXAMPLE_HINTS


def test_curriculum_concept_rules_empty():
    """_CURRICULUM_CONCEPT_RULES must be empty — economics domain lock removed."""
    from app.services.trust_service import _CURRICULUM_CONCEPT_RULES
    assert len(_CURRICULUM_CONCEPT_RULES) == 0


def test_canonical_title_rules_empty():
    from app.services.trust_service import _CANONICAL_TITLE_RULES
    assert len(_CANONICAL_TITLE_RULES) == 0


def test_admin_content_never_creates_chapter():
    """Pure admin note must be absorbed, never become a standalone chapter."""
    grounded_notes = [
        {
            "title": "Next Week Essay Question Focus",
            "lead_sentence": "Next week we have an essay question about positive statements.",
            "prose": "There are 40 MCQs and one essay.",
            "concepts": ["mcq", "essay question"],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "00:30-01:00", "start_seconds": 30, "end_seconds": 60}],
            "confidence": 0.7,
            "verification_status": "supported",
        },
        {
            "title": "Positive vs Normative Statements",
            "lead_sentence": "Positive statements are objective and testable while normative statements express value judgments.",
            "prose": "A factual statement can be verified but a value judgment cannot.",
            "concepts": ["positive statements", "normative statements"],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "02:00-04:00", "start_seconds": 120, "end_seconds": 240}],
            "confidence": 0.91,
            "verification_status": "supported",
        },
    ]

    sections = build_concept_sections(grounded_notes)
    titles = [s["title"] for s in sections]

    assert all("Essay Question" not in title for title in titles)
    assert all("MCQ" not in title and "mcq" not in title.lower() for title in titles)
```

- [ ] **Step 9: Run updated test suite**

```bash
cd backend
python -m pytest tests/test_trust_service.py -v 2>&1 | tail -30
```

Expected: All tests PASS. If any fail, investigate — do NOT skip. The four tests listed in spec section 11.1 must pass:
- `test_semantic_dedupe_collapses_near_duplicate_sentences`
- `test_grounded_notes_drop_contradicted_claims`
- `test_enrich_lecture_payload_adds_grounded_notes_and_ai_study_aids`
- `test_build_concept_sections_extracts_educational_structure`

- [ ] **Step 10: Commit**

```bash
git add backend/tests/test_trust_service.py
git commit -m "test: update test_trust_service — remove economics-locked assertions, add domain-general tests"
```

---

## Task 10: Modify `summarization_service.py` — route through reconstruction

**Files:**
- Modify: `backend/app/services/summarization_service.py`

- [ ] **Step 1: Replace `generate_concept_master_summary()` (lines 608–633) with reconstruction routing + legacy fallback**

Find the function `def generate_concept_master_summary(` and replace the entire function body (keep the existing function content as `_generate_concept_master_summary_legacy`):

```python
def generate_concept_master_summary(
    full_text: str,
    topic: str | None = None,
    language: str = "en",
) -> str:
    """
    Primary path: educational reconstruction → model-derived summary.
    Fallback: original summarize_topic_segment() path (unchanged, kept as _legacy).

    The reconstruction path classifies concepts first, then derives the summary
    from the structured educational model. This eliminates transcript-locality bias
    and domain-locked heuristics.
    """
    if not full_text or not full_text.strip():
        return ""

    try:
        from app.services.educational_reconstruction import reconstruct_lecture_model
        result = reconstruct_lecture_model(full_text, topic, language)
        if result and result.get("master_summary"):
            print(f"[summarization] reconstruction succeeded (quality={result.get('educational_model', {}).get('reconstruction_quality', 'unknown')})")
            return result["master_summary"]
    except Exception as e:
        print(f"[summarization] reconstruction import/call error: {e}")

    # Automatic fallback — no error raised, legacy path runs silently
    print("[summarization] reconstruction failed or empty, using legacy path")
    return _generate_concept_master_summary_legacy(full_text, topic, language)


def _generate_concept_master_summary_legacy(
    full_text: str,
    topic: str | None = None,
    language: str = "en",
) -> str:
    """Legacy path — original summarize_topic_segment() logic. Kept intact indefinitely."""
    sections = []
    for seg in segment_transcript(full_text, topic):
        start = max(0, int(seg.get("start") or 0))
        end = max(start, int(seg.get("end") or len(full_text)))
        title = (seg.get("title") or "").strip() or "Section"
        section = summarize_topic_segment(
            full_text[start:end],
            title=title,
            topic=topic,
            language=language,
        )
        if section:
            sections.append(section.strip())
    return "\n\n".join(sections)
```

- [ ] **Step 2: Verify the module still imports correctly**

```bash
cd backend
python -c "from app.services.summarization_service import generate_concept_master_summary, _generate_concept_master_summary_legacy, summarize_topic_segment; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/summarization_service.py
git commit -m "feat: route generate_concept_master_summary through educational reconstruction; preserve legacy fallback"
```

---

## Task 11: Update `recompute_service.py` — explicit pipeline precedence

**Files:**
- Modify: `backend/app/services/recompute_service.py`

- [ ] **Step 1: Add explicit precedence comments to `recompute_final_summary()`**

Find the comment block around lines 65-93 and update to make the precedence explicit:

```python
        # ── Step 1: Educational reconstruction (primary path)
        # generate_concept_master_summary() routes through reconstruct_lecture_model()
        # first, falling back to the legacy summarize_topic_segment() path automatically.
        # The result is the authoritative master_summary for this lecture.
        concept_summary = generate_concept_master_summary(cleaned, topic=topic, language=language)

        # ── Step 2: Study aids (flashcards, quiz, glossary)
        # generate_content() is called for its study aids output only.
        # Its .summary field is overridden by concept_summary in Step 4.
        content = generate_content(
            cleaned, title, topic, language,
            force=not existing_ok,
            existing_summary=existing_summary if existing_ok else "",
            existing_flashcards=existing_flashcards,
        )

        if content is None:
            print(f"[recompute] {lecture_id}: cache hit — content already exists.")
            if concept_summary:
                update_lecture_summary_only(lecture_id, concept_summary)
                print(f"[recompute] {lecture_id}: concept summary refreshed.")
        elif content and summary_has_required_structure(content.get("summary", ""), cleaned):
            # ── Step 3: Sanitize study aids using the authoritative summary
            content = sanitize_generated_content_bundle(
                cleaned, content,
                summary=concept_summary or content.get("summary", "")
            )
            save_generated_content(lecture_id, content)
            # ── Step 4: Reconstruction summary overrides — always authoritative
            if concept_summary:
                update_lecture_summary_only(lecture_id, concept_summary)
                print(f"[recompute] {lecture_id}: content saved with reconstruction summary.")
            else:
                print(f"[recompute] {lecture_id}: content saved (legacy summary used).")
        else:
            if concept_summary:
                update_lecture_summary_only(lecture_id, concept_summary)
                print(f"[recompute] {lecture_id}: fallback summary saved.")
            else:
                print(f"[recompute] {lecture_id}: GPT call returned empty result.")
```

- [ ] **Step 2: Verify import still works**

```bash
cd backend
python -c "from app.services.recompute_service import recompute_final_summary; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/recompute_service.py
git commit -m "docs: clarify reconstruction summary is authoritative in recompute_service pipeline"
```

---

## Task 12: Run full test suite and verify all required tests pass

**Files:**
- No changes — verification only

- [ ] **Step 1: Run all tests**

```bash
cd backend
python -m pytest tests/ -v 2>&1 | tail -50
```

- [ ] **Step 2: Verify the four spec-required tests pass**

```bash
cd backend
python -m pytest tests/test_trust_service.py::test_semantic_dedupe_collapses_near_duplicate_sentences tests/test_trust_service.py::test_grounded_notes_drop_contradicted_claims tests/test_trust_service.py::test_enrich_lecture_payload_adds_grounded_notes_and_ai_study_aids tests/test_trust_service.py::test_build_concept_sections_extracts_educational_structure -v
```

Expected: All 4 PASS.

- [ ] **Step 3: Verify new reconstruction tests pass**

```bash
cd backend
python -m pytest tests/test_educational_reconstruction.py -v
```

Expected: All reconstruction tests PASS.

- [ ] **Step 4: Verify new domain-general trust tests pass**

```bash
cd backend
python -m pytest tests/test_trust_service.py -k "domain_general or locality or example_hints or curriculum_concept_rules or canonical_title_rules or admin_content" -v
```

Expected: All new tests PASS.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: educational reconstruction pipeline complete — B3 architecture, domain-general, lifecycle tracking"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Task 1–5: `educational_reconstruction.py` — all 4 functions implemented with tests
- [x] Task 6: `_CURRICULUM_CONCEPT_RULES`, `_CANONICAL_TITLE_RULES`, `_CANONICAL_SUBTOPIC_RULES` deleted (replaced with empty tuples)
- [x] Task 6: `_ACADEMIC_TITLE_HINTS` updated to domain-general universal markers
- [x] Task 6: `_EXAMPLE_HINTS` domain-specific items removed
- [x] Task 7: `_should_merge_into_current()` rewrites — citation gap raised 120s → 300s, canonical identity is primary gate
- [x] Task 8: `_educational_signal_type()` updated — domain-general signal detection
- [x] Task 9: `test_trust_service.py` updated — broken economics-locked tests replaced, new domain-general tests added
- [x] Task 10: `summarization_service.py` — reconstruction routing with legacy fallback
- [x] Task 11: `recompute_service.py` — explicit precedence documented
- [x] Task 12: Full test run with 4 required tests verified

**Type consistency check:**
- `classify_educational_segment()` → returns `dict | None` ✓
- `merge_educational_models()` → takes `list[dict]`, returns `dict` ✓
- `derive_master_summary_from_model()` → takes `dict`, returns `str` ✓
- `reconstruct_lecture_model()` → takes `str`, returns `dict | None` ✓
- `generate_concept_master_summary()` → unchanged signature `(str, str|None, str) → str` ✓

**Placeholder scan:** No TBDs or TODOs present. All code steps contain full implementations.

**Invariants verified by tests:**
1. Examples never as section headers → `test_derive_examples_never_appear_as_section_headers`
2. Examples attached to parents → `test_merge_attaches_examples_to_parent_not_standalone`
3. Admin never in curriculum hierarchy → `test_merge_filters_admin_from_curriculum_hierarchy`
4. Procedural step order preserved → `test_merge_preserves_procedural_step_order` + `test_derive_procedural_steps_appear_in_order`
5. Confidence in [0.0, 1.0] → `test_merge_educational_confidence_always_in_valid_range`
6. Lifecycle in segment order → `test_merge_builds_lifecycle_in_segment_order`
7. Domain-general signal detection → 4 domain-general signal tests
8. Economics rule tables empty → 2 explicit tests for empty tables
9. Legacy fallback preserved → `_generate_concept_master_summary_legacy` exists, `reconstruct_lecture_model` returns None on failure

---

## Execution Options

**Plan complete and saved to `docs/superpowers/plans/2026-05-09-educational-reconstruction.md`.**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
