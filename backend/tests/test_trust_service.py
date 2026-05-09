from app.services.transcript_cleaner import clean
from app.services.trust_service import build_concept_sections, build_grounded_notes, enrich_lecture_payload


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
