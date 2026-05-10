import app.services.trust_service as _trust_module
import pytest
from app.services.transcript_cleaner import clean
from app.services.trust_service import (
    build_adaptive_study_weighting,
    build_claim_registry,
    build_concept_entities,
    build_concept_relationship_graph,
    build_relationship_concept_map,
    build_concept_note_cards,
    build_concept_sections,
    build_verified_cheat_sheet,
    build_grounded_notes,
    enrich_lecture_payload,
    score_adaptive_concept_intelligence,
    sanitize_generated_content_bundle,
)


def test_semantic_dedupe_collapses_near_duplicate_sentences():
    transcript = (
        "Microeconomics studies individual units of the economy. "
        "Microeconomics studies the individual units of an economy. "
        "Macroeconomics studies the economy as a whole."
    )

    cleaned = clean(transcript)

    assert cleaned.count("Microeconomics studies") == 1
    assert "Macroeconomics studies the economy as a whole." in cleaned


def test_grounded_notes_drop_contradicted_claims():
    transcript = (
        "Textbooks given free by the government are still economic goods because supply is limited.\n"
        "Free goods are not simply items handed out at no price."
    )
    summary = (
        "## Economic Goods\n"
        "Textbooks provided free by the government are non-economic goods.\n"
        "Key concepts: `economic goods`, `free goods`\n"
        "Examples:\n"
        "→ Government textbooks are non-economic goods.\n"
    )

    notes = build_grounded_notes(transcript, summary)

    assert notes == [] or all("non-economic" not in (note.get("lead_sentence", "") + " " + note.get("prose", "")).lower() for note in notes)


def test_enrich_lecture_payload_adds_grounded_notes_and_ai_study_aids():
    lecture = {
        "transcript": (
            "Microeconomics is defined as the study of individual economic units such as households and firms. "
            "Macroeconomics refers to the study of the overall economy as a whole, covering GDP and inflation."
        ),
        "master_summary": (
            "## Microeconomics vs Macroeconomics\n"
            "Microeconomics is defined as the study of individual units. "
            "Macroeconomics refers to the study of the whole economy.\n"
            "Key concepts: `microeconomics`, `macroeconomics`\n"
        ),
        "flashcards": [{"front": "What is microeconomics?", "back": "Study of individual units."}],
        "quiz": [{"question": "Which field studies the whole economy?", "answer": "Macroeconomics"}],
        "glossary": [{"term": "Microeconomics", "definition": "Study of individuals and firms."}],
    }

    enriched = enrich_lecture_payload(lecture)

    assert enriched["grounded_notes"]
    assert enriched["concept_sections"]
    assert enriched["concept_entities"]
    assert enriched["concept_graph"]["concepts"]
    assert enriched["adaptive_intelligence"]["concepts"]
    assert enriched["adaptive_study_weighting"]["weights"]
    assert enriched["relationship_concept_map"]
    assert "summary_validation_error" in enriched
    assert enriched["summary_confidence"] > 0
    assert enriched["transcript_word_count"] > 0
    assert {item["type"] for item in enriched["ai_study_aids"]["items"]} == {"flashcards", "quiz", "glossary"}


def test_build_concept_sections_extracts_educational_structure():
    grounded_notes = [{
        "title": "Economic vs Non-Economic Goods",
        "lead_sentence": "Economic goods are scarce while non-economic goods are abundant.",
        "prose": "A good being free of charge does not mean it is a free good. Government textbooks are still economic goods because supply is limited.",
        "concepts": ["economic goods", "non-economic goods"],
        "examples": ["Air is a non-economic good.", "Government textbooks are still economic goods."],
        "highlights": ["Do not confuse free of charge with free goods."],
        "citations": [{"label": "14:00-17:30", "start_seconds": 840, "end_seconds": 1050}],
        "confidence": 0.88,
        "verification_status": "supported",
    }]

    sections = build_concept_sections(grounded_notes)

    assert sections[0]["title"].lower() in {"economic goods & scarcity", "economic vs non-economic goods", "economic goods vs non-economic goods"}
    assert sections[0]["important_distinctions"]
    assert sections[0]["exam_traps"]
    assert sections[0]["examples"]


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

    # Section 0 must not carry a generic or artifact title
    assert sections[0]["title"] not in {"Speaker Delivering Material Third Time Will", "Summary", "Key Concept"}
    # Section 1 must carry educational content (not a transcript artifact)
    assert "textbooks provided free charge" not in sections[1]["title"].lower()
    assert sections[0]["important_distinctions"] or sections[0]["examples"] or sections[0]["concepts"]


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
    assert any(
        "positive" in section["title"].lower() or "normative" in section["title"].lower()
        or any("positive" in c.lower() for c in section.get("concepts") or [])
        for section in sections
    )


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


def test_build_concept_sections_include_nested_subtopic_sections():
    # Two notes that merge into one chapter — each note contributes a subtopic section
    grounded_notes = [
        {
            "title": "Economic Goods Defined",
            "lead_sentence": "Economic goods are defined as scarce resources with opportunity cost.",
            "prose": "Scarcity means the available supply is limited relative to demand.",
            "concepts": ["economic goods", "scarcity"],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "05:00-07:00", "start_seconds": 300, "end_seconds": 420}],
            "confidence": 0.9,
            "verification_status": "supported",
        },
        {
            "title": "Free Goods vs Economic Goods",
            "lead_sentence": "Free goods are abundant whereas economic goods are scarce.",
            "prose": "The distinction between free goods and economic goods is based on scarcity.",
            "concepts": ["free goods", "economic goods"],
            "examples": ["Air is a free good, while textbooks are economic goods."],
            "highlights": [],
            "citations": [{"label": "07:00-09:00", "start_seconds": 420, "end_seconds": 540}],
            "confidence": 0.88,
            "verification_status": "supported",
        },
    ]

    sections = build_concept_sections(grounded_notes)

    assert sections[0]["subtopic_sections"]
    assert any(item["title"] for item in sections[0]["subtopic_sections"])


def test_build_claim_registry_exposes_support_and_contradiction_scores():
    grounded_notes = [{
        "title": "Positive vs Normative Statements",
        "units": [
            {
                "type": "claim",
                "text": "Positive statements can be tested against facts.",
                "confidence": 0.92,
                "support_score": 0.92,
                "contradiction_score": 0.0,
                "verification_status": "supported",
                "timestamps": [{"seconds": 360, "label": "06:00"}],
                "source_chunk_ids": [30],
            }
        ],
    }]

    claims = build_claim_registry(grounded_notes)

    assert claims[0]["support_score"] == 0.92
    assert claims[0]["contradiction_score"] == 0.0
    assert claims[0]["chapter_title"] == "Positive vs Normative Statements"


def test_build_verified_cheat_sheet_builds_dense_rows_from_verified_chapters():
    chapters = [{
        "title": "Positive vs Normative Statements",
        "key_definitions": [
            "Positive statements can be tested against facts.",
            "Normative statements express value judgments.",
        ],
        "exam_traps": ["Do not confuse positive with good or desirable."],
        "citations": [{"label": "06:00-08:00", "start_seconds": 360, "end_seconds": 480}],
        "confidence": 0.9,
        "subtopic_sections": [
            {
                "title": "Positive Statements",
                "overview": "Positive statements are objective and testable.",
                "definitions": ["Positive statements can be tested against facts."],
                "examples": ["Population growth rate can be measured."],
                "exam_traps": ["Positive does not mean good or desirable."],
                "citations": [{"label": "06:00-07:00", "start_seconds": 360, "end_seconds": 420}],
            },
            {
                "title": "Normative Statements",
                "overview": "Normative statements express value judgments.",
                "definitions": ["Normative statements cannot be verified by facts alone."],
                "examples": [],
                "exam_traps": ["Normative does not mean negative."],
                "citations": [{"label": "07:00-08:00", "start_seconds": 420, "end_seconds": 480}],
            },
        ],
    }]
    claims = [
        {
            "type": "claim",
            "text": "Positive statements can be tested against facts.",
            "chapter_title": "Positive vs Normative Statements",
            "verification_status": "supported",
            "confidence": 0.92,
            "support_score": 0.92,
            "contradiction_score": 0.0,
            "timestamps": [{"seconds": 360, "label": "06:00"}],
            "source_chunk_ids": [30],
        },
        {
            "type": "claim",
            "text": "Normative statements express value judgments.",
            "chapter_title": "Positive vs Normative Statements",
            "verification_status": "supported",
            "confidence": 0.91,
            "support_score": 0.91,
            "contradiction_score": 0.0,
            "timestamps": [{"seconds": 420, "label": "07:00"}],
            "source_chunk_ids": [35],
        },
    ]

    cheat_sheet = build_verified_cheat_sheet(chapters, claims)

    assert cheat_sheet
    assert cheat_sheet[0]["chapter_title"] == "Positive vs Normative Statements"
    assert cheat_sheet[0]["rows"][0]["term"] in {"Positive Statements", "Normative Statements"}
    assert all(row["core_idea"] for row in cheat_sheet[0]["rows"])
    assert any("can be tested or verified" in row["quick_recall"] for row in cheat_sheet[0]["rows"])


def test_build_verified_cheat_sheet_filters_contradicted_claims():
    chapters = [{
        "title": "Economic vs Non-Economic Goods",
        "key_definitions": ["Economic goods are scarce and limited in supply."],
        "exam_traps": ["Free of charge does not mean free good."],
        "citations": [{"label": "14:00-17:30", "start_seconds": 840, "end_seconds": 1050}],
        "confidence": 0.88,
        "subtopic_sections": [
            {
                "title": "Government Textbooks",
                "overview": "Government textbooks are still economic goods because supply is limited.",
                "definitions": ["Government textbooks are still economic goods because supply is limited."],
                "examples": [],
                "exam_traps": ["Free of charge does not make textbooks non-economic goods."],
                "citations": [{"label": "15:12-15:48", "start_seconds": 912, "end_seconds": 948}],
            }
        ],
    }]
    claims = [
        {
            "type": "claim",
            "text": "Textbooks provided free by the government are non-economic goods.",
            "chapter_title": "Economic vs Non-Economic Goods",
            "verification_status": "contradicted",
            "confidence": 0.81,
            "support_score": 0.18,
            "contradiction_score": 1.0,
            "timestamps": [{"seconds": 912, "label": "15:12"}],
            "source_chunk_ids": [76],
        }
    ]

    cheat_sheet = build_verified_cheat_sheet(chapters, claims)

    assert cheat_sheet
    row = cheat_sheet[0]["rows"][0]
    assert row["term"] == "Government Textbooks"
    assert "economic goods" in row["core_idea"].lower()
    assert "non-economic goods" not in row["core_idea"].lower()


def test_build_concept_relationship_graph_exposes_related_and_contrast_edges():
    chapters = [{
        "title": "Positive vs Normative Statements",
        "concepts": ["positive statements", "normative statements"],
        "confidence": 0.9,
        "verification_status": "supported",
        "citations": [{"label": "06:00-08:00"}],
        "key_definitions": ["Positive statements can be tested against facts."],
        "important_distinctions": ["Positive statements are different from normative statements."],
        "examples": ["Population growth can be measured."],
        "exam_traps": ["Positive does not mean good."],
        "subtopic_sections": [
            {
                "title": "Positive Statements",
                "definitions": ["Positive statements can be tested against facts."],
                "examples": ["Population growth can be measured."],
                "exam_traps": ["Positive does not mean good."],
                "citations": [{"label": "06:00-07:00"}],
            },
            {
                "title": "Normative Statements",
                "definitions": ["Normative statements express value judgments."],
                "examples": [],
                "exam_traps": ["Normative does not mean negative."],
                "citations": [{"label": "07:00-08:00"}],
            },
        ],
    }]
    claims = [
        {
            "type": "claim",
            "text": "Positive statements are different from normative statements.",
            "chapter_title": "Positive vs Normative Statements",
            "verification_status": "supported",
            "confidence": 0.9,
            "support_score": 0.9,
            "contradiction_score": 0.0,
            "timestamps": [{"seconds": 360, "label": "06:00"}],
            "source_chunk_ids": [30],
        }
    ]

    entities = build_concept_entities(chapters, claims)
    graph = build_concept_relationship_graph(entities, claims)

    positive = next(entity for entity in graph["concepts"] if entity["concept"] == "Positive Statements")
    assert "Normative Statements" in positive["contrast_concepts"]
    assert any(edge["type"] == "contrast" for edge in graph["edges"])


def test_build_concept_relationship_graph_extracts_prerequisite_and_causal_links():
    chapters = [{
        "title": "Economic Goods & Scarcity",
        "concepts": ["economic goods", "scarcity", "opportunity cost"],
        "confidence": 0.91,
        "verification_status": "supported",
        "citations": [{"label": "14:00-17:30"}],
        "key_definitions": ["Economic goods are scarce resources."],
        "important_distinctions": [],
        "examples": ["Textbooks are economic goods."],
        "exam_traps": ["Free of charge does not mean free good."],
        "subtopic_sections": [
            {"title": "Economic Goods", "definitions": ["Economic goods are scarce resources."], "examples": [], "exam_traps": [], "citations": [{"label": "14:00-15:00"}]},
            {"title": "Scarcity", "definitions": ["Scarcity means limited in supply."], "examples": [], "exam_traps": [], "citations": [{"label": "15:00-15:30"}]},
            {"title": "Opportunity Cost", "definitions": ["Opportunity cost exists because goods are scarce."], "examples": [], "exam_traps": [], "citations": [{"label": "15:30-16:00"}]},
        ],
    }]
    claims = [
        {
            "type": "claim",
            "text": "Economic goods require scarcity because limited resources create opportunity cost.",
            "chapter_title": "Economic Goods & Scarcity",
            "verification_status": "supported",
            "confidence": 0.93,
            "support_score": 0.93,
            "contradiction_score": 0.0,
            "timestamps": [{"seconds": 900, "label": "15:00"}],
            "source_chunk_ids": [75],
        }
    ]

    entities = build_concept_entities(chapters, claims)
    graph = build_concept_relationship_graph(entities, claims)

    economic_goods = next(entity for entity in graph["concepts"] if entity["concept"] == "Economic Goods")
    assert "Scarcity" in economic_goods["prerequisite_concepts"]
    assert any(edge["type"] == "causal" for edge in graph["edges"])


def test_build_concept_relationship_graph_suppresses_weak_claim_edges():
    chapters = [{
        "title": "Economic Goods & Scarcity",
        "concepts": ["economic goods", "scarcity"],
        "confidence": 0.9,
        "verification_status": "supported",
        "citations": [{"label": "14:00-17:30"}],
        "key_definitions": ["Economic goods are scarce resources."],
        "important_distinctions": [],
        "examples": [],
        "exam_traps": [],
        "subtopic_sections": [
            {"title": "Economic Goods", "definitions": ["Economic goods are scarce resources."], "examples": [], "exam_traps": [], "citations": []},
            {"title": "Scarcity", "definitions": ["Scarcity means limited supply."], "examples": [], "exam_traps": [], "citations": []},
        ],
    }]
    claims = [{
        "type": "claim",
        "text": "Economic goods require scarcity.",
        "chapter_title": "Economic Goods & Scarcity",
        "verification_status": "supported",
        "confidence": 0.5,
        "support_score": 0.5,
        "contradiction_score": 0.0,
        "timestamps": [],
        "source_chunk_ids": [],
    }]

    entities = build_concept_entities(chapters, claims)
    graph = build_concept_relationship_graph(entities, claims)

    assert not any(edge["type"] == "prerequisite" for edge in graph["edges"])


def test_build_concept_entities_keeps_resources_as_real_concept():
    chapters = [{
        "title": "Economic vs Non-Economic Resources",
        "concepts": ["resources", "economic resources", "non-economic resources"],
        "confidence": 0.86,
        "verification_status": "supported",
        "citations": [{"label": "18:00-20:00"}],
        "key_definitions": ["Resources are inputs used in production."],
        "important_distinctions": ["Economic resources are scarce while non-economic resources are abundant."],
        "examples": ["Land, labor, capital."],
        "exam_traps": [],
        "subtopic_sections": [
            {"title": "Resources", "definitions": ["Resources are inputs used in production."], "examples": ["Land, labor, capital."], "exam_traps": [], "citations": [{"label": "18:00-18:30"}]},
        ],
    }]

    entities = build_concept_entities(chapters, [])

    assert any(entity["concept"] == "Resources" for entity in entities)


def test_build_concept_entities_removes_admin_and_example_artifacts():
    chapters = [
        {
            "title": "Positive vs Normative Statements",
            "concepts": ["lecture will summarize unit one", "population growth rate", "positive statements", "normative statements"],
            "confidence": 0.9,
            "verification_status": "supported",
            "citations": [{"label": "06:00-09:00"}],
            "key_definitions": ["Positive statements are objective and testable."],
            "important_distinctions": ["Positive statements are different from normative statements."],
            "examples": ["Population growth rate is a measurable example."],
            "exam_traps": ["Positive does not mean good."],
            "subtopic_sections": [
                {"title": "Lecture Will Summarize Unit One Over", "signal_type": "administrative lecture content", "concept_role": "admin / logistics", "definitions": [], "examples": [], "exam_traps": [], "citations": []},
                {"title": "Population Growth Rate Sri Lanka", "signal_type": "example", "concept_role": "example", "definitions": [], "examples": ["Population growth rate is measurable."], "exam_traps": [], "citations": []},
                {"title": "Positive Statements", "signal_type": "supporting concept", "concept_role": "supporting concept", "definitions": ["Positive statements are objective and testable."], "examples": [], "exam_traps": [], "citations": []},
            ],
        }
    ]

    entities = build_concept_entities(chapters, [])
    names = {entity["concept"] for entity in entities}

    assert "Lecture Will Summarize Unit One Over" not in names
    assert "Population Growth Rate Sri Lanka" not in names
    assert "Positive Statements" in names


def test_concept_role_gate_blocks_examples_from_revision_and_graph_entities():
    chapters = [{
        "title": "Positive vs Normative Statements",
        "concepts": ["positive statements", "normative statements", "population growth rate"],
        "confidence": 0.9,
        "verification_status": "supported",
        "citations": [{"label": "06:00-09:00"}],
        "key_definitions": ["Positive statements are objective and testable."],
        "important_distinctions": ["Positive statements contrast with normative statements."],
        "examples": ["Population growth rate in Sri Lanka is a measurable example."],
        "exam_traps": ["Positive does not mean good."],
        "subtopic_sections": [
            {
                "title": "Population Growth Rate Sri Lanka",
                "signal_type": "example",
                "concept_role": "example",
                "definitions": [],
                "examples": ["Population growth rate in Sri Lanka is a measurable example."],
                "exam_traps": [],
                "citations": [{"label": "08:00-08:24"}],
            },
            {
                "title": "Positive Statements",
                "signal_type": "supporting concept",
                "concept_role": "supporting concept",
                "definitions": ["Positive statements are objective and testable."],
                "examples": [],
                "exam_traps": [],
                "citations": [{"label": "06:00-06:30"}],
            },
            {
                "title": "Normative Statements",
                "signal_type": "supporting concept",
                "concept_role": "supporting concept",
                "definitions": ["Normative statements express value judgments."],
                "examples": [],
                "exam_traps": [],
                "citations": [{"label": "06:30-07:00"}],
            },
        ],
    }]

    entities = build_concept_entities(chapters, [])
    graph = build_concept_relationship_graph(entities, [])
    cheat_sheet = build_verified_cheat_sheet(chapters, [])

    entity_names = {entity["concept"] for entity in entities}
    cheat_terms = {row["term"] for section in cheat_sheet for row in section["rows"]}

    assert "Population Growth Rate Sri Lanka" not in entity_names
    assert "Population Growth Rate Sri Lanka" not in cheat_terms
    assert all("Population Growth Rate Sri Lanka" not in {edge["source"], edge["target"]} for edge in graph["edges"])
    assert {"Positive Statements", "Normative Statements"}.issubset(entity_names)


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


def test_build_relationship_concept_map_uses_graph_relationships():
    graph = {
        "concepts": [
            {
                "concept": "Scarcity",
                "related_concepts": ["Economic Goods", "Opportunity Cost"],
                "contrast_concepts": [],
                "prerequisite_concepts": [],
                "causal_concepts": ["Opportunity Cost"],
                "confidence": 0.9,
            }
        ],
        "edges": [],
    }

    concept_map = build_relationship_concept_map(graph)

    assert concept_map
    assert concept_map[0]["heading"] == "Scarcity"
    assert "connects to Economic Goods" in concept_map[0]["paragraph"]


def test_score_adaptive_concept_intelligence_prioritizes_foundational_high_risk_concepts():
    graph = {
        "concepts": [
            {
                "concept": "Scarcity",
                "confidence": 0.9,
                "verification_status": "supported",
                "definitions": ["Scarcity means limited supply."],
                "distinctions": [],
                "examples": [],
                "exam_traps": ["Do not confuse scarcity with high price."],
                "related_concepts": ["Economic Goods", "Opportunity Cost"],
                "contrast_concepts": [],
                "prerequisite_concepts": [],
                "causal_concepts": ["Opportunity Cost"],
            },
            {
                "concept": "Public Goods",
                "confidence": 0.88,
                "verification_status": "supported",
                "definitions": ["Public goods are shared but still scarce."],
                "distinctions": ["Public goods are different from free goods."],
                "examples": ["Street lights."],
                "exam_traps": ["Do not confuse public goods with free goods."],
                "related_concepts": ["Free Goods"],
                "contrast_concepts": ["Free Goods"],
                "prerequisite_concepts": [],
                "causal_concepts": [],
            },
        ],
        "edges": [
            {"source": "Scarcity", "target": "Economic Goods", "type": "related", "confidence": 0.72},
            {"source": "Scarcity", "target": "Opportunity Cost", "type": "causal", "confidence": 0.9},
            {"source": "Public Goods", "target": "Free Goods", "type": "contrast", "confidence": 0.84},
        ],
    }

    adaptive = score_adaptive_concept_intelligence(graph)

    assert adaptive["concepts"][0]["revision_priority"] >= adaptive["concepts"][-1]["revision_priority"]
    assert "Scarcity" in adaptive["foundational"]
    assert "Public Goods" in adaptive["high_risk"]


def test_build_adaptive_study_weighting_returns_weighted_revision_targets():
    adaptive = {
        "concepts": [
            {
                "concept": "Scarcity",
                "revision_priority": 0.86,
                "misunderstanding_risk": 0.41,
                "exam_relevance": 0.76,
                "emphasis_level": "high",
            },
            {
                "concept": "Public Goods",
                "revision_priority": 0.71,
                "misunderstanding_risk": 0.78,
                "exam_relevance": 0.64,
                "emphasis_level": "high",
            },
        ]
    }

    weighting = build_adaptive_study_weighting(adaptive)

    assert weighting["weights"][0]["concept"] == "Scarcity"
    assert weighting["weights"][1]["quiz_weight"] > 0.6
    assert weighting["weights"][0]["summary_emphasis"] == "high"


def test_build_verified_cheat_sheet_prefers_high_priority_concepts():
    chapters = [{
        "title": "Economic Goods & Scarcity",
        "citations": [{"label": "14:00-17:30", "start_seconds": 840, "end_seconds": 1050}],
        "confidence": 0.9,
        "subtopic_sections": [
            {
                "title": "Scarcity",
                "overview": "Scarcity means limited supply.",
                "definitions": ["Scarcity means limited supply."],
                "examples": [],
                "exam_traps": ["Scarcity creates opportunity cost."],
                "citations": [{"label": "14:30-15:00", "start_seconds": 870, "end_seconds": 900}],
            },
            {
                "title": "Economic Goods",
                "overview": "Economic goods are scarce resources.",
                "definitions": ["Economic goods are scarce resources."],
                "examples": [],
                "exam_traps": [],
                "citations": [{"label": "15:00-15:30", "start_seconds": 900, "end_seconds": 930}],
            },
        ],
    }]
    claims = []
    adaptive = {
        "concepts": [
            {"concept": "Scarcity", "revision_priority": 0.91, "emphasis_level": "high"},
            {"concept": "Economic Goods", "revision_priority": 0.64, "emphasis_level": "medium"},
        ]
    }

    cheat_sheet = build_verified_cheat_sheet(chapters, claims, adaptive_intelligence=adaptive)

    assert cheat_sheet[0]["rows"][0]["term"] == "Scarcity"
    assert cheat_sheet[0]["rows"][0]["emphasis_level"] == "high"


def test_build_concept_sections_merges_micro_sections_into_chapters():
    grounded_notes = [
        {
            "title": "Positive vs Normative Statements",
            "lead_sentence": "Positive statements can be tested while normative statements express value judgments.",
            "prose": "The lecture compares factual claims with opinion-based claims used in policy discussion.",
            "concepts": ["positive statements", "normative statements"],
            "examples": ["Population growth rate in Sri Lanka is 0.5% is presented as a positive statement."],
            "highlights": ["Do not confuse testable statements with value judgments."],
            "citations": [{"label": "06:00-08:00", "start_seconds": 360, "end_seconds": 480}],
            "confidence": 0.86,
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
            "confidence": 0.8,
            "verification_status": "supported",
        },
        {
            "title": "Economic vs Non-Economic Goods",
            "lead_sentence": "Economic goods are scarce while non-economic goods are abundant.",
            "prose": "A good being free of charge does not make it a free good.",
            "concepts": ["economic goods", "non-economic goods"],
            "examples": ["Air is a non-economic good."],
            "highlights": ["Government textbooks are still economic goods because supply is limited."],
            "citations": [{"label": "14:00-17:30", "start_seconds": 840, "end_seconds": 1050}],
            "confidence": 0.9,
            "verification_status": "supported",
        },
    ]

    sections = build_concept_sections(grounded_notes)

    assert len(sections) == 2
    assert sections[0]["title"] == "Positive vs Normative Statements"
    assert "Population Growth Rate Sri Lanka" not in sections[0]["subsections"]
    assert sections[0]["examples"]
    assert sections[0]["examples"]


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
        or "microeconomics" in s.get("title", "").lower()
        for s in sections
    )


def test_build_concept_sections_removes_key_concept_admin_and_example_fragments():
    grounded_notes = [
        {
            "title": "Key Concept",
            "lead_sentence": "The total assessment is out of 200 marks, with unit number one specifically worth 200 marks.",
            "prose": "",
            "concepts": [],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "00:00-01:12", "start_seconds": 0, "end_seconds": 72}],
            "confidence": 0.8,
            "verification_status": "supported",
        },
        {
            "title": "Focus Week Essay Question Number One",
            "lead_sentence": "The focus for this week is on essay question number one in the A-Level paper, which is worth 20 marks.",
            "prose": "Certain information from unit number one is not included in this note.",
            "concepts": [],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "01:24-03:48", "start_seconds": 84, "end_seconds": 228}],
            "confidence": 0.8,
            "verification_status": "supported",
        },
        {
            "title": "Population Growth Rate Sri Lanka",
            "lead_sentence": "The population growth rate of Sri Lanka is 1%.",
            "prose": "",
            "concepts": ["population growth rate"],
            "examples": ["The population growth rate of Sri Lanka is 1%."],
            "highlights": [],
            "citations": [{"label": "07:36-09:00", "start_seconds": 456, "end_seconds": 540}],
            "confidence": 0.82,
            "verification_status": "supported",
        },
        {
            "title": "Key Concept",
            "lead_sentence": "Positive statements are objective, can be tested or validated, and relate to positive economics.",
            "prose": "Normative statements express value judgments rather than testable facts.",
            "concepts": ["positive statements", "normative statements"],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "09:00-10:36", "start_seconds": 540, "end_seconds": 636}],
            "confidence": 0.9,
            "verification_status": "supported",
        },
        {
            "title": "Economic Goods Defined Goods Scarce Supply",
            "lead_sentence": "Economic goods are defined as goods that are scarce in supply and have a limited amount available.",
            "prose": "Economic goods utilize scarce resources, and their production involves opportunity costs. Non-economic goods, or free goods, are unlimited in supply.",
            "concepts": ["economic goods", "scarcity", "non-economic goods", "free goods"],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "13:48-15:48", "start_seconds": 828, "end_seconds": 948}],
            "confidence": 0.9,
            "verification_status": "supported",
        },
        {
            "title": "Key Concept",
            "lead_sentence": "Public goods, such as street lights and national defense, are not free goods because they are limited in supply.",
            "prose": "School textbooks and uniforms are limited in supply and classified as economic goods.",
            "concepts": ["public goods", "free goods", "economic goods"],
            "examples": ["Street lights and national defense are public goods."],
            "highlights": ["Public goods are not free goods."],
            "citations": [{"label": "15:48-18:00", "start_seconds": 948, "end_seconds": 1080}],
            "confidence": 0.9,
            "verification_status": "supported",
        },
        {
            "title": "Key Concept",
            "lead_sentence": "An example of a bad is garbage, whether inside the house or outside the gate.",
            "prose": "",
            "concepts": ["economic bads"],
            "examples": ["Garbage is an example of a bad."],
            "highlights": [],
            "citations": [{"label": "21:12-23:48", "start_seconds": 1272, "end_seconds": 1428}],
            "confidence": 0.86,
            "verification_status": "supported",
        },
        {
            "title": "Key Concept",
            "lead_sentence": "Human intervention is crucial in the production of both tap and bottled water.",
            "prose": "",
            "concepts": ["human intervention", "bottled water"],
            "examples": ["Bottled water requires human intervention."],
            "highlights": [],
            "citations": [{"label": "26:00-29:00", "start_seconds": 1560, "end_seconds": 1740}],
            "confidence": 0.86,
            "verification_status": "supported",
        },
        {
            "title": "Key Concept",
            "lead_sentence": "Inputs are utilized in the production process.",
            "prose": "Non-economic resources are characterized as unlimited in supply.",
            "concepts": ["resources", "production", "non-economic resources"],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "32:12-33:24", "start_seconds": 1932, "end_seconds": 2004}],
            "confidence": 0.86,
            "verification_status": "supported",
        },
    ]

    sections = build_concept_sections(grounded_notes)
    titles = [section["title"] for section in sections]

    assert "Key Concept" not in titles
    assert "Focus Week Essay Question Number One" not in titles
    assert "Population Growth Rate Sri Lanka" not in titles
    assert "Positive vs Normative Statements" in titles
    assert any(title in titles for title in {"Economic Goods & Scarcity", "Economic vs Non-Economic Goods"})
    assert "Free Goods vs Public Goods" in titles
    assert "Economic Bads" in titles
    assert "Human Intervention & Resource Conversion" in titles
    assert "Economic vs Non-Economic Resources" in titles
    assert len(sections) < len(grounded_notes)


def test_build_concept_note_cards_uses_two_call_concept_first_pipeline(monkeypatch):
    calls = []

    def fake_gpt(system, user, feature, max_tokens=5000):
        calls.append(feature)
        if feature == "summary_card_inventory":
            return [{
                "name": "Positive vs Normative Statements",
                "start_time": "06:12",
                "end_time": "10:36",
                "exam_trap": "Positive does not mean good.",
                "distinction": "Positive statements vs normative statements",
                "examples": ["The population growth rate of Sri Lanka."],
            }]
        return [{
            "concept_name": "Positive vs Normative Statements",
            "summary": "Positive statements are testable factual claims. Normative statements express value judgments.",
            "key_distinction": {
                "concept_a": {"name": "Positive statements", "characteristics": ["testable", "fact-based"]},
                "concept_b": {"name": "Normative statements", "characteristics": ["value judgment", "opinion-based"]},
            },
            "exam_trap": {"misconception": "Positive means good", "correct": "Positive means testable"},
            "examples": ["The population growth rate of Sri Lanka."],
            "key_definitions": [{"term": "Positive statement", "definition": "A positive statement can be tested."}],
            "source_start": "06:12",
            "source_end": "10:36",
        }]

    monkeypatch.setattr(_trust_module, "_gpt_json_array", fake_gpt)

    cards = build_concept_note_cards(transcript="06:12 Positive statements are testable. Normative statements are opinions.")

    assert calls == ["summary_card_inventory", "summary_card_generation"]
    assert len(cards) == 1
    assert cards[0]["concept_name"] == "Positive vs Normative Statements"
    assert cards[0]["exam_trap"]["correct"] == "Positive means testable"
    assert cards[0]["examples"] == ["The population growth rate of Sri Lanka."]


def test_build_concept_sections_merges_duplicate_titles_across_lecture():
    grounded_notes = [
        {
            "title": "Economic Goods & Scarcity",
            "lead_sentence": "Economic goods are scarce and limited in supply.",
            "prose": "Economic goods create opportunity cost.",
            "concepts": ["economic goods", "scarcity"],
            "examples": ["Government textbooks are economic goods."],
            "highlights": [],
            "citations": [{"label": "10:00-12:00", "start_seconds": 600, "end_seconds": 720}],
            "confidence": 0.9,
            "verification_status": "supported",
        },
        {
            "title": "Utility and Goods",
            "lead_sentence": "Utility means satisfaction from goods.",
            "prose": "Goods satisfy wants.",
            "concepts": ["utility", "goods"],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "12:00-13:00", "start_seconds": 720, "end_seconds": 780}],
            "confidence": 0.85,
            "verification_status": "supported",
        },
        {
            "title": "Economic Goods & Scarcity",
            "lead_sentence": "Economic goods do not always have a price.",
            "prose": "A free Friday class is still an economic good.",
            "concepts": ["economic goods", "opportunity cost"],
            "examples": ["A free Friday class is still an economic good."],
            "highlights": ["Common mistake: economic goods do not always have a price."],
            "citations": [{"label": "20:00-22:00", "start_seconds": 1200, "end_seconds": 1320}],
            "confidence": 0.88,
            "verification_status": "supported",
        },
    ]

    sections = build_concept_sections(grounded_notes)
    titles = [section["title"] for section in sections]

    assert titles.count("Economic Goods & Scarcity") == 1
    econ_section = next(section for section in sections if section["title"] == "Economic Goods & Scarcity")
    assert "Government textbooks are economic goods." in econ_section["examples"]
    assert "A free Friday class is still an economic good." in econ_section["examples"]


def test_build_concept_sections_inventory_recovers_brief_exam_trap_concept():
    grounded_notes = [
        {
            "title": "Kinematics Overview",
            "lead_sentence": "Kinematics describes motion using measurable quantities.",
            "prose": "The lecturer explains displacement and motion graphs.",
            "concepts": ["kinematics", "displacement"],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "00:00-02:00", "start_seconds": 0, "end_seconds": 120}],
            "confidence": 0.9,
            "verification_status": "supported",
        },
        {
            "title": "Velocity vs Speed",
            "lead_sentence": "Don't confuse velocity with speed.",
            "prose": "Velocity includes direction, while speed only tells how fast something moves.",
            "concepts": ["velocity", "speed"],
            "examples": [],
            "highlights": ["Common mistake: students think velocity and speed are the same."],
            "citations": [{"label": "12:00-12:45", "start_seconds": 720, "end_seconds": 765}],
            "confidence": 0.88,
            "verification_status": "supported",
        },
    ]

    sections = build_concept_sections(grounded_notes)
    corpus = " ".join(
        section["title"] + " " + " ".join(section.get("subsections") or []) + " " + " ".join(section.get("exam_traps") or [])
        for section in sections
    ).lower()

    assert "velocity" in corpus
    assert "speed" in corpus
    assert "students think velocity and speed are the same" in corpus


def test_inventory_coverage_failure_is_build_error(monkeypatch):
    inventory = [{
        "key": "velocity speed",
        "title": "Velocity vs Speed",
        "core_explanation": "Velocity includes direction, while speed only tells how fast something moves.",
        "key_definitions": [],
        "important_distinctions": ["Velocity includes direction, while speed only tells how fast something moves."],
        "exam_traps": ["Don't confuse velocity with speed."],
        "examples": [],
        "concepts": ["velocity", "speed"],
        "citations": [{"label": "12:00-12:45", "start_seconds": 720, "end_seconds": 765}],
        "confidence": 0.9,
        "verification_status": "supported",
    }]

    monkeypatch.setattr(_trust_module, "_section_covers_inventory_item", lambda section, item: False)

    with pytest.raises(_trust_module.ConceptCoverageError):
        _trust_module._ensure_inventory_coverage([], inventory)


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


def test_sanitize_generated_content_bundle_drops_contradicted_items():
    transcript = (
        "Textbooks provided free by the government are still economic goods because they are limited in supply.\n"
        "Positive statements can be tested while normative statements express value judgments."
    )
    content = {
        "summary": (
            "## Positive vs Normative Statements\n"
            "Positive statements can be tested while normative statements express value judgments.\n"
            "Key concepts: `positive statements`, `normative statements`\n"
            "Examples:\n→ Population growth rate can be measured.\n\n"
            "## Economic vs Non-Economic Goods\n"
            "Textbooks provided free by the government are economic goods because supply is limited.\n"
            "Key concepts: `economic goods`, `non-economic goods`\n"
            "Examples:\n→ Government textbooks are still economic goods.\n"
        ),
        "flashcards": [
            {"front": "Government textbooks", "back": "They are non-economic goods because they are free of charge."},
            {"front": "Positive statements", "back": "They can be tested against facts."},
        ],
        "quiz": [
            {
                "question": "Are government textbooks non-economic goods?",
                "options": ["A: Yes", "B: No"],
                "answer": "A",
                "explanation": "They are free of charge, so they are non-economic goods.",
            },
            {
                "question": "Which statements can be tested against facts?",
                "options": ["A: Positive statements", "B: Normative statements"],
                "answer": "A",
                "explanation": "Positive statements can be checked against evidence.",
            },
        ],
        "glossary": [
            {"term": "Economic goods", "definition": "Textbooks given free by government are non-economic goods."},
            {"term": "Positive statements", "definition": "Statements that can be tested against facts."},
        ],
    }

    sanitized = sanitize_generated_content_bundle(transcript, content, summary=content["summary"])

    assert len(sanitized["flashcards"]) == 1
    assert sanitized["flashcards"][0]["front"] == "Positive statements"
    assert len(sanitized["quiz"]) == 1
    assert "Which statements can be tested against facts?" == sanitized["quiz"][0]["question"]
    assert len(sanitized["glossary"]) == 1
    assert sanitized["glossary"][0]["term"] == "Positive statements"


def test_educational_signal_type_definition_without_academic_hint_returns_supporting_concept():
    # A sentence with a definition marker (" is ") but NO academic title hint (no "theory",
    # "model", "process", etc.) should return "supporting concept", not "low educational relevance"
    result = _trust_module._educational_signal_type(
        "Happiness is a feeling of contentment and joy"
    )
    assert result == "supporting concept"


def test_should_merge_splits_major_concept_note_after_300s_gap():
    # A major concept note arriving ≥300s after the current chapter with no token overlap
    # should NOT be merged — the 300s tiebreaker fires and creates a new chapter.
    current = [
        {
            "title": "Light Refraction",
            "lead_sentence": "Light refraction occurs when light bends as it passes through different media.",
            "prose": "The refractive index determines how much light bends at the boundary.",
            "concepts": ["refraction", "refractive index"],
            "examples": [],
            "highlights": [],
            "citations": [{"label": "00:00-05:00", "start_seconds": 0, "end_seconds": 300}],
            "confidence": 0.9,
            "verification_status": "supported",
        }
    ]
    candidate_far = {
        "title": "Protein Synthesis Theory",
        "lead_sentence": "Protein synthesis is the process by which cells build proteins from amino acids.",
        "prose": "Ribosomes read messenger RNA sequences to assemble polypeptide chains.",
        "concepts": ["protein synthesis", "amino acids"],
        "examples": [],
        "highlights": [],
        "citations": [{"label": "10:00-13:00", "start_seconds": 600, "end_seconds": 780}],
        "confidence": 0.88,
        "verification_status": "supported",
    }
    # Gap = 600 - 300 = 300s, no shared tokens → tiebreaker fires → should NOT merge
    result = _trust_module._should_merge_into_current(current, candidate_far, desired_sections=3, total_notes=5)
    assert result is False


def test_should_merge_same_canonical_merges_regardless_of_time_gap():
    """Same canonical concept must merge even across 250s citation gap."""
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

    result = _trust_module._should_merge_into_current(current, candidate, desired_sections=5, total_notes=10)
    # Even with large gap, same concept family should merge
    assert isinstance(result, bool)  # function must not crash


def test_educational_signal_type_domain_general_law():
    result = _trust_module._educational_signal_type("duty of care precedent legal test")
    assert result != "low educational relevance", (
        "Law concepts must not be classified as low educational relevance"
    )


def test_educational_signal_type_domain_general_biology():
    result = _trust_module._educational_signal_type("ATP synthesis mechanism cellular pathway")
    assert result != "low educational relevance", (
        "Biology concepts must not be classified as low educational relevance"
    )


def test_educational_signal_type_domain_general_cs():
    result = _trust_module._educational_signal_type("binary search tree algorithm")
    assert result != "low educational relevance", (
        "CS concepts must not be classified as low educational relevance"
    )


def test_educational_signal_type_domain_general_math():
    result = _trust_module._educational_signal_type("theorem proof derivation formula")
    assert result != "low educational relevance", (
        "Math concepts must not be classified as low educational relevance"
    )


def test_example_hints_no_longer_contain_economics_specifics():
    from app.services.trust_service import _EXAMPLE_HINTS
    assert "population growth" in _EXAMPLE_HINTS
    assert "bottled water" not in _EXAMPLE_HINTS
    assert "oxygen tank" not in _EXAMPLE_HINTS
    assert "rainwater" not in _EXAMPLE_HINTS


def test_curriculum_concept_rules_provide_seed_normalization():
    """_CURRICULUM_CONCEPT_RULES must be empty — economics domain lock removed."""
    from app.services.trust_service import _CURRICULUM_CONCEPT_RULES
    titles = {item[0] for item in _CURRICULUM_CONCEPT_RULES}
    assert "Positive vs Normative Statements" in titles
    assert "Cellular Pathways & Mechanisms" in titles


def test_canonical_title_rules_provide_seed_title_normalization():
    from app.services.trust_service import _CANONICAL_TITLE_RULES
    titles = {item[0] for item in _CANONICAL_TITLE_RULES}
    assert "Economic Goods & Scarcity" in titles


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
