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
    # Weak concept (confidence < _CONFIDENCE_THRESHOLD = 0.25) should be suppressed from output
    assert "Weak Concept" not in summary


def test_derive_returns_non_empty_string_for_valid_model():
    from app.services.educational_reconstruction import derive_master_summary_from_model

    model = _minimal_model(foundational=[
        _full_concept("Opportunity Cost", definition="The value of the next best alternative.")
    ])
    summary = derive_master_summary_from_model(model, topic="economics")

    assert isinstance(summary, str)
    assert len(summary.strip()) > 50


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


def test_merge_empty_segment_list_returns_fallback():
    from app.services.educational_reconstruction import merge_educational_models

    model = merge_educational_models([], topic="economics")
    assert model["reconstruction_quality"] == "insufficient"
    assert model["fallback_recommended"] is True
    assert model["foundational_concepts"] == []


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
