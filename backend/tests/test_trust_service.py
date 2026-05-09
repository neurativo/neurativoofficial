from app.services.transcript_cleaner import clean
from app.services.trust_service import (
    build_claim_registry,
    build_concept_sections,
    build_grounded_notes,
    enrich_lecture_payload,
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

    assert sections[0]["title"] == "Economic vs Non-Economic Goods"
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

    assert sections[0]["title"] == "Branches of Economics"
    assert sections[1]["title"] in {"Economic vs Non-Economic Goods", "Public Goods vs Free Goods"}


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
    assert "Population Growth Rate Sri Lanka" in sections[0]["subsections"]
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
