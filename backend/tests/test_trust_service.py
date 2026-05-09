from app.services.transcript_cleaner import clean
from app.services.trust_service import (
    build_adaptive_study_weighting,
    build_claim_registry,
    build_concept_entities,
    build_concept_relationship_graph,
    build_relationship_concept_map,
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
        "transcript": "Microeconomics studies individuals and firms.\nMacroeconomics studies the whole economy.",
        "master_summary": (
            "## Core Ideas\n"
            "Microeconomics studies individuals and firms. Macroeconomics studies the whole economy.\n"
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
    assert enriched["verified_cheat_sheet"]
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

    assert sections[0]["title"] in {"Economic Goods & Scarcity", "Economic vs Non-Economic Goods"}
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

    assert sections[0]["title"] == "Microeconomics vs Macroeconomics"
    assert sections[1]["title"] in {"Economic Goods & Scarcity", "Economic vs Non-Economic Goods", "Public Goods vs Free Goods"}


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
            "lead_sentence": "Population growth rate is an example of a measurable factual claim.",
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

    assert sections[0]["title"] == "Positive vs Normative Statements"
    assert all(section["title"] != "Lecture Will Summarize Unit One Over" for section in sections)
    assert all(section["title"] != "Population Growth Rate Sri Lanka" for section in sections)


def test_domain_general_canonical_titles_are_stable_across_phrasings():
    cases = [
        (
            "Biology pathway explanation",
            "The lecture explains how enzymes regulate a cellular metabolic pathway and reaction mechanism.",
            ["enzyme", "cellular pathway"],
            "Cellular Pathways & Mechanisms",
        ),
        (
            "Case law discussion",
            "A precedent creates a legal test that courts apply under this doctrine.",
            ["precedent", "legal test"],
            "Legal Tests & Precedent",
        ),
        (
            "Formula section",
            "The theorem proof leads into a derivation of the equation and formula.",
            ["theorem", "proof", "derivation"],
            "Theorems, Proofs & Derivations",
        ),
        (
            "Engineering process",
            "The system design has constraints and optimization tradeoffs in the process flow.",
            ["system", "constraints", "optimization"],
            "Engineering Systems & Constraints",
        ),
        (
            "Clinical warning",
            "Diagnosis depends on symptoms and contraindications before treatment.",
            ["diagnosis", "contraindication", "treatment"],
            "Clinical Reasoning & Contraindications",
        ),
    ]

    for title, lead, concepts, expected in cases:
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

        assert sections[0]["title"] == expected


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
    assert any(section["title"] == "Economic Goods & Scarcity" for section in sections)


def test_build_concept_sections_include_nested_subtopic_sections():
    grounded_notes = [{
        "title": "Economic vs Non-Economic Goods",
        "lead_sentence": "Economic goods are scarce while non-economic goods are abundant.",
        "prose": "Public goods are different from free goods. Government textbooks are still economic goods because supply is limited.",
        "concepts": ["economic goods", "non-economic goods", "public goods", "free goods"],
        "examples": ["Government textbooks are still economic goods."],
        "highlights": ["Do not confuse free goods with goods given free of charge."],
        "citations": [{"label": "14:00-17:30", "start_seconds": 840, "end_seconds": 1050}],
        "confidence": 0.9,
        "verification_status": "supported",
        "units": [],
    }]

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
    assert any(row["quick_recall"] == "Fact-based" for row in cheat_sheet[0]["rows"])


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
                {"title": "Lecture Will Summarize Unit One Over", "signal_type": "administrative lecture content", "definitions": [], "examples": [], "exam_traps": [], "citations": []},
                {"title": "Population Growth Rate Sri Lanka", "signal_type": "example", "definitions": [], "examples": ["Population growth rate is measurable."], "exam_traps": [], "citations": []},
                {"title": "Positive Statements", "definitions": ["Positive statements are objective and testable."], "examples": [], "exam_traps": [], "citations": []},
            ],
        }
    ]

    entities = build_concept_entities(chapters, [])
    names = {entity["concept"] for entity in entities}

    assert "Lecture Will Summarize Unit One Over" not in names
    assert "Population Growth Rate Sri Lanka" not in names
    assert "Positive Statements" in names


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
