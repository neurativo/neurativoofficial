import asyncio
import json
import math
import os
import re
from collections import Counter
from datetime import datetime

from jinja2 import Environment, FileSystemLoader
from playwright.sync_api import sync_playwright

from openai import OpenAI
from app.core.config import settings
from app.services.supabase_service import (
    get_lecture_for_summarization,
    get_section_summaries,
    get_lecture_sections,
    get_visual_frames,
)
from app.services.cost_tracker import log_cost
from app.services.trust_service import (
    _light_clean,
    build_claim_registry,
    build_adaptive_study_weighting,
    build_concept_entities,
    build_concept_relationship_graph,
    build_relationship_concept_map,
    build_concept_note_cards,
    build_concept_sections,
    score_adaptive_concept_intelligence,
    build_verified_cheat_sheet_from_cards,
    build_grounded_notes,
    lecture_summary_confidence,
    sanitize_pdf_artifacts,
    validate_summary_card_generation,
)

# ── OpenAI client ─────────────────────────────────────────────────────────────
_client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None

_PDF_TRANSCRIPT_ONLY_RULE = (
    "Only use information from the transcript provided. "
    "Do not add background knowledge, textbook content, or information not present in the transcript. "
    "Never invent details, definitions, examples, or relationships that are not explicitly supported by the transcript. "
    "If the transcript is about a specific subject, only generate content about what was actually taught in this specific lecture."
)



# ── Domain-aware labels ───────────────────────────────────────────────────────
_DOMAIN_LABELS = {
    "medicine":         ("Clinical Breakdown",   "Board Exam Prep",   "Clinical Terms"),
    "law":              ("Legal Analysis",        "Case Practice",     "Legal Glossary"),
    "computer science": ("Technical Deep-Dive",   "Coding Concepts",   "Technical Glossary"),
    "physics":          ("Derivations & Proofs",  "Problem Practice",  "Formulary"),
    "mathematics":      ("Derivations & Proofs",  "Problem Practice",  "Formulary"),
    "history":          ("Historical Narrative",  "Source Review",     "Historical Terms"),
}
_DEFAULT_LABELS = ("Section Breakdown", "Self-Test", "Key Terms")


def _get_domain_labels(topic: str | None) -> tuple[str, str, str]:
    if not topic:
        return _DEFAULT_LABELS
    return _DOMAIN_LABELS.get(topic.lower(), _DEFAULT_LABELS)


_DOMAIN_COLORS = {
    "medicine":         "#DC2626",
    "nursing":          "#DC2626",
    "pharmacy":         "#DC2626",
    "law":              "#1E3A5F",
    "legal":            "#1E3A5F",
    "computer science": "#4F46E5",
    "software":         "#4F46E5",
    "engineering":      "#4F46E5",
    "physics":          "#0D9488",
    "mathematics":      "#0D9488",
    "chemistry":        "#0D9488",
    "history":          "#92400E",
    "social sciences":  "#92400E",
    "business":         "#059669",
    "economics":        "#059669",
}
_DEFAULT_COLOR = "#2563EB"


def _get_domain_color(topic: str | None) -> str:
    if not topic:
        return _DEFAULT_COLOR
    return _DOMAIN_COLORS.get(topic.lower(), _DEFAULT_COLOR)


def _get_cover_stats(topic: str | None, enriched_sections: list[dict], concept_note_cards: list[dict], quick_review: list[dict]) -> dict:
    """Returns the 3rd and 4th cover tile stats based on domain and content."""
    n_sections = len([s for s in enriched_sections if s.get("title") and not str(s.get("title", "")).startswith("__")])

    # Count exam traps across all sections
    n_traps = sum(
        1 for s in enriched_sections
        if s.get("exam_traps")
    )

    # Count code blocks / equations / key concepts depending on domain
    topic_lower = (topic or "").lower()

    if topic_lower in ("computer science", "software", "programming"):
        # Count sections that have code examples
        n_code = sum(1 for s in enriched_sections if any(
            "def " in str(e) or "class " in str(e) or "()" in str(e) or "import " in str(e)
            for e in (s.get("examples") or [])
        ))
        stat4_value = max(n_code, n_traps)
        if stat4_value == 0:
            stat4_value = n_sections
        stat3 = {"k": "Sections", "v": str(n_sections), "u": "In this report"}
        stat4 = {"k": "Code Patterns", "v": str(stat4_value), "u": "Must-know idioms"}
    elif topic_lower in ("physics", "mathematics", "chemistry", "engineering"):
        # Count sections that have equations
        n_eq = sum(1 for s in enriched_sections if any(
            "=" in str(e) or "∫" in str(e) or "Δ" in str(e) or "²" in str(e)
            for e in (s.get("examples") or []) + (s.get("definitions") or [])
        ))
        stat4_value = max(n_eq, n_traps)
        if stat4_value == 0:
            stat4_value = n_sections
        stat3 = {"k": "Sections", "v": str(n_sections), "u": "In this report"}
        stat4 = {"k": "Key Equations", "v": str(stat4_value), "u": "Must-memorise"}
    elif topic_lower in ("economics", "business", "finance"):
        # Count exam traps — economics PDFs highlight mark targets
        n_cards = len([c for c in (concept_note_cards or []) if isinstance(c, dict) and not str(c.get("concept_name", "")).startswith("__")])
        stat3 = {"k": "Sections", "v": str(n_sections), "u": "In this report"}
        stat4 = {"k": "Exam Traps", "v": str(n_traps) if n_traps else str(n_cards), "u": "Flagged by lecturer"}
    elif topic_lower in ("medicine", "nursing", "pharmacy"):
        n_cards = len([c for c in (concept_note_cards or []) if isinstance(c, dict) and not str(c.get("concept_name", "")).startswith("__")])
        stat3 = {"k": "Sections", "v": str(n_sections), "u": "In this report"}
        stat4 = {"k": "Clinical Terms", "v": str(n_cards), "u": "In this report"}
    elif topic_lower in ("law", "legal"):
        stat3 = {"k": "Sections", "v": str(n_sections), "u": "In this report"}
        stat4 = {"k": "Exam Traps", "v": str(n_traps), "u": "Flagged by lecturer"}
    else:
        stat3 = {"k": "Sections", "v": str(n_sections), "u": "In this report"}
        stat4 = {"k": "Exam Traps", "v": str(n_traps) if n_traps else str(len(quick_review)), "u": "Flagged by lecturer"}

    return {"stat3": stat3, "stat4": stat4}


# ── Adaptive question count (Bloom's taxonomy scaling) ────────────────────────
_DIFFICULTIES = ["Recall", "Understanding", "Application"]


def _question_count(duration_sec: int) -> int:
    minutes = (duration_sec or 0) // 60
    if minutes < 30:  return 0
    if minutes < 60:  return 5
    if minutes < 120: return 8
    return 12


# ── Helpers ───────────────────────────────────────────────────────────────────

def format_duration(seconds: int) -> str:
    if not seconds:
        return "0m 0s"
    m = seconds // 60
    s = seconds % 60
    return f"{m}m {s}s"


def clean_markdown_to_html(text: str) -> str:
    """Simple markdown → HTML for the legacy summary_html context variable."""
    if not text:
        return ""
    html = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    lines = html.split('\n')
    out, in_list = [], False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if in_list:
                out.append("</ul>"); in_list = False
            out.append("<br>")
            continue
        if stripped.startswith("## "):
            if in_list:
                out.append("</ul>"); in_list = False
            out.append(f"<h3>{stripped[3:]}</h3>")
        elif stripped.startswith("- "):
            if not in_list:
                out.append("<ul>"); in_list = True
            content = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', stripped[2:])
            out.append(f"<li>{content}</li>")
        else:
            if in_list:
                out.append("</ul>"); in_list = False
            content = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', stripped)
            out.append(f"<p>{content}</p>")
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


def _extract_lead_sentence(prose: str) -> tuple[str, str]:
    """Split prose into (first sentence, remainder)."""
    if not prose:
        return "", ""
    m = re.search(r'(?<=[.!?])\s+', prose)
    if m:
        return prose[:m.start() + 1].strip(), prose[m.end():].strip()
    return prose.strip(), ""


def _truncate_words(text: str, limit: int) -> str:
    words = str(text or "").split()
    if len(words) <= limit:
        return " ".join(words)
    return " ".join(words[:limit]).rstrip(" .,;:") + "..."


def _normalise_structured_exam_trap(value) -> dict | None:
    if not isinstance(value, dict):
        return None
    misconception = str(value.get("misconception") or "").strip()
    correct = str(value.get("correct") or "").strip()
    if not misconception or not correct:
        return None
    if misconception.lower() == correct.lower():
        return None
    return {"misconception": misconception, "correct": correct}


def _fallback_structured_exam_trap(raw_trap, *, summary: str = "", distinction_text: str = "") -> dict | None:
    trap_text = str(raw_trap or "").strip()
    if len(trap_text) <= 10:
        return None
    correct = str(distinction_text or "").strip() or str(summary or "").strip()
    if not correct:
        return None
    misconception = f"Students think: {trap_text}"
    if misconception.lower() == correct.lower():
        return None
    return {"misconception": misconception, "correct": correct}


def _exam_trap_text(value) -> str:
    if isinstance(value, dict):
        misconception = str(value.get("misconception") or "").strip()
        correct = str(value.get("correct") or "").strip()
        return " ".join(part for part in (misconception, correct) if part).strip()
    return str(value or "").strip()


def _content_word_count(section: dict) -> int:
    return len(
        (
            (section.get("lead_sentence", "") or "")
            + " "
            + (section.get("prose", "") or "")
            + " "
            + " ".join(section.get("definitions") or [])
            + " "
            + " ".join(section.get("distinctions") or [])
            + " "
            + " ".join(section.get("examples") or [])
            + " "
            + " ".join(_exam_trap_text(item) for item in (section.get("exam_traps") or []))
        ).split()
    )


def _compact_inline_items(section: dict) -> list[dict]:
    items = []
    if section.get("definitions"):
        items.append({"label": "Definition", "text": _truncate_words(section["definitions"][0], 18), "kind": "definition"})
    if section.get("distinctions"):
        items.append({"label": "Distinction", "text": _truncate_words(section["distinctions"][0], 18), "kind": "distinction"})
    if section.get("examples"):
        items.append({"label": "Example", "text": _truncate_words(section["examples"][0], 16), "kind": "example"})
    return items[:4]


def _section_render_profile(section: dict) -> dict:
    word_count = _content_word_count(section)
    subtopic_count = len(section.get("subtopic_sections") or [])
    concept_count = len(section.get("concepts") or [])
    has_traps = bool(section.get("exam_traps"))
    compact_mode = word_count <= 95 and subtopic_count <= 2
    expanded_mode = word_count >= 210 or subtopic_count >= 4
    render_mode = "compact" if compact_mode else "expanded" if expanded_mode else "standard"
    inline_items = _compact_inline_items(section)
    inline_mode = render_mode == "compact" or (render_mode == "standard" and len(inline_items) >= 3 and subtopic_count <= 2)
    show_subtopic_stack = subtopic_count > 0
    if inline_mode and subtopic_count <= 2 and word_count < 135:
        show_subtopic_stack = False

    estimated_pages = max(1.0, round((word_count / 155) + (subtopic_count * 0.18) + (0.18 if has_traps else 0.0), 1))
    toc_title = section.get("title", "")
    if len(toc_title.split()) > 7:
        toc_title = _truncate_words(toc_title, 7)

    return {
        "render_mode": render_mode,
        "inline_mode": inline_mode,
        "inline_items": inline_items,
        "show_subtopic_stack": show_subtopic_stack,
        "show_definition_box": bool(section.get("definitions")) and not inline_mode,
        "show_distinction_box": bool(section.get("distinctions")) and not inline_mode,
        "show_examples_block": bool(section.get("examples")) and not inline_mode,
        "chapter_density": "dense" if word_count >= 170 else "compact" if compact_mode else "balanced",
        "toc_title": toc_title,
        "estimated_pages": estimated_pages,
        "concept_count": concept_count,
        "subtopic_count": subtopic_count,
    }


def _concept_cards_to_pdf_sections(concept_note_cards: list[dict]) -> list[dict]:
    sections = []
    for card in concept_note_cards or []:
        title = card.get("concept_name") or ""
        if not title or title.startswith("__"):
            continue
        summary = str(card.get("summary") or "").strip()
        raw_definitions = card.get("key_definitions") or []
        examples = card.get("examples") or []
        all_text = (
            summary
            + " "
            + " ".join(
                str(item.get("definition") or "").strip()
                for item in raw_definitions
                if isinstance(item, dict)
            )
            + " "
            + " ".join(str(example).strip() for example in examples if str(example).strip())
        ).strip()
        if len(all_text.split()) < 15:
            print(f"[pdf] skipping thin section: {title}")
            continue
        if not raw_definitions and not examples and len(summary.split()) < 18:
            print(f"[pdf] skipping low-evidence section: {title}")
            continue
        citations = [{
            "label": f"{card.get('source_start')} - {card.get('source_end')}",
            "start_seconds": None,
            "end_seconds": None,
        }] if card.get("source_start") and card.get("source_end") else []
        definitions = [
            f"{item.get('term')}: {item.get('definition')}"
            for item in raw_definitions
            if isinstance(item, dict) and (item.get("term") or item.get("definition"))
        ]
        distinction_obj = card.get("key_distinction") or {}
        distinctions = []
        if isinstance(distinction_obj, dict) and distinction_obj:
            a = distinction_obj.get("concept_a") or {}
            b = distinction_obj.get("concept_b") or {}
            distinctions = [
                " vs ".join([str(a.get("name", "")).strip(), str(b.get("name", "")).strip()]).strip(" vs ")
            ]
        trap_obj = card.get("exam_trap") or {}
        exam_traps = []
        exam_trap_structured = None
        structured_trap = _normalise_structured_exam_trap(trap_obj)
        if structured_trap:
            exam_traps = [structured_trap]
            exam_trap_structured = structured_trap
        elif isinstance(trap_obj, str) and trap_obj.strip():
            fallback_trap = _fallback_structured_exam_trap(
                trap_obj,
                summary=summary,
                distinction_text=(distinctions or [""])[0],
            )
            if fallback_trap:
                exam_traps = [fallback_trap]
                exam_trap_structured = fallback_trap
            else:
                exam_traps = [trap_obj.strip()]
        section = {
            "title": title,
            "lead_sentence": (definitions or [card.get("summary", "")])[0],
            "prose": "",
            "bullets": [],
            "concepts": [title],
            "examples": examples,
            "definitions": definitions,
            "distinctions": distinctions,
            "versus_items": _build_versus_items(title, distinctions),
            "exam_traps": exam_traps,
            "subsections": [
                label for label, values in [
                    ("Definition", definitions),
                    ("Key Distinction", distinctions),
                    ("Exam Trap", exam_traps),
                    ("Professor's Examples", examples),
                ] if values
            ],
            "subtopic_sections": [],
            "raw_section": "",
            "analogy": None,
            "mistake": None,
            "remember": None,
            "citations": citations,
            "confidence": card.get("confidence") or 0.0,
            "verification_status": card.get("verification_status") or "supported",
            "exam_trap_structured": exam_trap_structured,
        }
        section.update(_section_render_profile(section))
        sections.append(section)
    return sections


def _has_placeholder_timestamps(cards: list[dict]) -> bool:
    placeholders = {"", "00:00", "00:00:00"}
    visible_cards = [
        card for card in (cards or [])
        if isinstance(card, dict) and not str(card.get("concept_name", "")).startswith("__")
    ]
    if not visible_cards:
        return False
    bad = 0
    for card in visible_cards:
        start = str(card.get("source_start") or "").strip()
        end = str(card.get("source_end") or "").strip()
        if start in placeholders or end in placeholders:
            bad += 1
    return bad > 0


def _build_versus_items(title: str, distinctions: list[str]) -> list[dict]:
    text = " ".join([title or ""] + (distinctions or []))
    match = re.search(r"\b([A-Z][A-Za-z\s-]{2,40})\s+(?:vs\.?|versus)\s+([A-Z][A-Za-z\s-]{2,40})\b", text)
    if match:
        return [{"left": match.group(1).strip(), "right": match.group(2).strip(), "detail": (distinctions or [""])[0]}]
    distinction = (distinctions or [""])[0]
    while_match = re.search(r"(.{3,80}?)\s+(?:while|whereas|but|unlike)\s+(.{3,100})", distinction, flags=re.I)
    if while_match:
        return [{
            "left": while_match.group(1).strip(" .,:;"),
            "right": while_match.group(2).strip(" .,:;"),
            "detail": distinction,
        }]
    return []


def _adaptive_priority_for_text(text: str, adaptive_intelligence: dict) -> float:
    lowered = (text or "").lower()
    best = 0.0
    for concept in adaptive_intelligence.get("concepts", []) or []:
        concept_name = str(concept.get("concept", "")).lower()
        if concept_name and concept_name in lowered:
            best = max(best, float(concept.get("revision_priority") or 0.0))
    return round(best, 2)


def _prioritize_revision_outputs(
    glossary: list[dict],
    takeaways: list[str],
    quick_review: list[dict],
    adaptive_intelligence: dict,
) -> tuple[list[dict], list[str], list[dict]]:
    glossary_sorted = sorted(
        glossary,
        key=lambda item: (
            -_adaptive_priority_for_text(f"{item.get('term', '')}. {item.get('definition', '')}", adaptive_intelligence),
            item.get("term", ""),
        ),
    )
    takeaways_sorted = sorted(
        takeaways,
        key=lambda item: -_adaptive_priority_for_text(item, adaptive_intelligence),
    )
    quick_review_sorted = sorted(
        quick_review,
        key=lambda item: -_adaptive_priority_for_text(
            f"{item.get('question', '')}. {item.get('answer', '')}. {item.get('explanation', '')}",
            adaptive_intelligence,
        ),
    )
    return glossary_sorted, takeaways_sorted, quick_review_sorted


def _glossary_from_concept_sections(concept_sections: list[dict]) -> list[dict]:
    terms = []
    seen = set()
    for section in concept_sections or []:
        candidates = [section.get("title", "")] + (section.get("concepts") or [])
        definitions = (section.get("key_definitions") or []) + [section.get("core_explanation", "")]
        definition = next((d for d in definitions if d and len(d.split()) >= 4), "")
        for term in candidates:
            term = (term or "").strip()
            key = term.lower()
            if not term or key in seen or term.lower() in {"key concept", "lecture concept"}:
                continue
            if not definition:
                continue
            seen.add(key)
            terms.append({"term": term, "definition": definition})
    return terms


def _merge_glossary(primary: list[dict], supplemental: list[dict], limit: int = 24) -> list[dict]:
    merged = []
    seen = set()
    for item in (primary or []) + (supplemental or []):
        term = (item.get("term") or "").strip()
        definition = (item.get("definition") or "").strip()
        key = term.lower()
        if not term or not definition or key in seen:
            continue
        seen.add(key)
        merged.append({"term": term, "definition": definition, **{k: v for k, v in item.items() if k not in {"term", "definition"}}})
        if len(merged) >= limit:
            break
    return merged


def _build_revision_focus_summary(adaptive_intelligence: dict) -> list[dict]:
    return [
        {
            "concept": item["concept"],
            "reason": item["reason"],
            "emphasis_level": item["emphasis_level"],
        }
        for item in (adaptive_intelligence.get("revision_focus") or [])[:4]
    ]


def _compose_toc_entries(
    enriched_sections: list[dict],
    *,
    include_exec: bool,
    include_map: bool,
    include_quick_review: bool,
    include_cheat_sheet: bool,
) -> list[dict]:
    entries = []
    page_cursor = 2.0
    if include_exec:
        entries.append({"kind": "static", "number": "—", "title": "Executive Summary", "depth": 0, "page": "p. 2"})
        page_cursor += 1.0

    for idx, sec in enumerate(enriched_sections, start=1):
        pages = float(sec.get("estimated_pages") or 1.0)
        entries.append({
            "kind": "chapter",
            "number": f"{idx}.",
            "title": sec.get("toc_title") or sec.get("title") or f"Chapter {idx}",
            "depth": 0,
            "page": f"p. ~{int(page_cursor)}",
        })
        for sub_idx, sub in enumerate((sec.get("subsections") or [])[:3], start=1):
            entries.append({
                "kind": "subsection",
                "number": f"{idx}.{sub_idx}",
                "title": sub,
                "depth": 1,
                "page": "",
            })
        page_cursor += max(0.8, pages)

    if include_map:
        entries.append({"kind": "static", "number": "—", "title": "Conceptual Map", "depth": 0, "page": f"p. ~{int(page_cursor)}"})
        page_cursor += 1.0
    if include_quick_review:
        entries.append({"kind": "static", "number": "—", "title": "Self-Test", "depth": 0, "page": f"p. ~{int(page_cursor)}"})
        page_cursor += 1.0
    if include_cheat_sheet:
        entries.append({"kind": "static", "number": "—", "title": "Cheat Sheet", "depth": 0, "page": "last"})
    return entries


_PDF_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into",
    "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "were", "with",
}
_TITLE_BANNED_PHRASES = (
    "designing personalized solutions",
    "unique needs",
    "speaker delivering material",
    "key concept",
)


def _keyword_set(text: str) -> set[str]:
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9'-]{2,}", (text or "").lower())
    return {w for w in words if w not in _PDF_STOPWORDS}


def _has_grounded_overlap(candidate: str, source: str, minimum: int = 2) -> bool:
    return len(_keyword_set(candidate) & _keyword_set(source)) >= minimum


def _fallback_title(title: str, transcript: str, topic: str | None) -> str:
    lowered = (title or "").lower()
    if title and not any(phrase in lowered for phrase in _TITLE_BANNED_PHRASES) and _has_grounded_overlap(title, transcript, minimum=2):
        return title
    lower = (transcript or "").lower()
    if topic == "economics" and "unit number one" in lower:
        return "Economics Unit One Review"
    if topic and topic != "general":
        return f"{topic.title()} Lecture Summary"[:60]
    return "Lecture Summary"


def _resolve_document_title(title: str, transcript: str, topic: str | None, concept_sections: list[dict]) -> str:
    base = _fallback_title(title, transcript, topic)
    generic_topic_title = f"{topic.title()} Lecture Summary"[:60] if topic and topic != "general" else None
    if base != "Lecture Summary" and base != generic_topic_title:
        return base

    strong_titles = [
        sec.get("title", "").strip()
        for sec in concept_sections
        if sec.get("title") and _has_grounded_overlap(sec.get("title", ""), transcript, minimum=1)
    ]
    if strong_titles:
        lead = strong_titles[0]
        if topic and topic != "general":
            return f"{topic.title()} Lecture Review: {lead}"[:90]
        return f"Lecture Review: {lead}"[:90]
    return base


def _extract_summary_sections_loose(summary: str) -> list[str]:
    """
    Best-effort fallback for malformed summaries that omitted `##` headings but
    still contain repeated title + prose + key-concepts blocks.
    """
    lines = [ln.rstrip() for ln in (summary or "").splitlines()]
    sections = []
    current = []

    def flush():
        block = "\n".join(current).strip()
        if block:
            sections.append(block)

    for line in lines:
        stripped = line.strip()
        if (
            stripped
            and current
            and not stripped.startswith(("Key concepts", "Examples", ">", "→", "- ", "`"))
            and stripped[:1].isupper()
            and len(stripped.split()) <= 10
            and not stripped.endswith(".")
        ):
            flush()
            current.clear()
        current.append(line)
    flush()
    return [s for s in sections if s.strip()]


def _fallback_takeaways(summary: str, sections: list[dict]) -> list[str]:
    takeaways = []
    for sec in sections:
        sentence = (sec.get("remember") or sec.get("lead_sentence") or sec.get("prose") or "").strip()
        if sentence:
            takeaways.append(sentence)
        if len(takeaways) == 5:
            break
    if takeaways:
        return takeaways

    for para in re.split(r"\n\s*\n", summary or ""):
        cleaned = " ".join(para.split()).strip()
        if cleaned:
            takeaways.append(cleaned)
        if len(takeaways) == 5:
            break
    return takeaways


def _build_lite_sections(raw_sections: list[str], summary: str, transcript: str, limit: int) -> list[dict]:
    sections_data: list[dict] = []
    for i, sec in enumerate(raw_sections[:limit]):
        lines = [ln.strip() for ln in sec.split("\n") if ln.strip()]
        sec_title = lines[0][:80] if lines else f"Section {i + 1}"
        prose = "\n".join(lines[1:]).strip() or sec.strip()
        sections_data.append({
            "title":         sec_title,
            "lead_sentence": "",
            "prose":         _truncate_words(prose, 130),
            "bullets":       [],
            "concepts":      [],
            "examples":      [],
            "analogy":       None,
            "mistake":       None,
            "remember":      None,
        })

    if sections_data:
        return sections_data

    summary_paras = [p.strip() for p in re.split(r"\n\s*\n", summary or "") if p.strip()]
    for i, para in enumerate(summary_paras[:limit]):
        sections_data.append({
            "title":         "Lecture Preview" if i == 0 else f"Key Idea {i + 1}",
            "lead_sentence": "",
            "prose":         _truncate_words(para, 130),
            "bullets":       [],
            "concepts":      [],
            "examples":      [],
            "analogy":       None,
            "mistake":       None,
            "remember":      None,
        })

    if sections_data:
        return sections_data

    transcript_words = str(transcript or "").split()
    if transcript_words:
        midpoint = min(len(transcript_words), 120)
        first_excerpt = " ".join(transcript_words[:midpoint])
        second_excerpt = " ".join(transcript_words[midpoint:midpoint + 120])
        sections_data.append({
            "title":         "Lecture Snapshot",
            "lead_sentence": "",
            "prose":         _truncate_words(first_excerpt, 130),
            "bullets":       [],
            "concepts":      [],
            "examples":      [],
            "analogy":       None,
            "mistake":       None,
            "remember":      None,
        })
        if second_excerpt:
            sections_data.append({
                "title":         "More From The Session",
                "lead_sentence": "",
                "prose":         _truncate_words(second_excerpt, 130),
                "bullets":       [],
                "concepts":      [],
                "examples":      [],
                "analogy":       None,
                "mistake":       None,
                "remember":      None,
            })

    return sections_data


# ── GPT worker functions (all sync — called via asyncio.to_thread) ────────────

def _call_executive_summary(transcript: str, title: str, topic: str | None, strict: bool = False) -> str:
    if not _client:
        return ""
    hint = f" The lecture is about {topic}." if topic else ""
    strict_rule = (
        " ABSOLUTE RULE: every sentence must be directly supported by the transcript above. "
        "If you cannot find content for a sentence in the transcript, do not write it. "
        "Never infer, generalise, or draw on external knowledge."
    ) if strict else ""
    resp = _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are summarizing a specific lecture transcript provided below. "
                    "Only use information from this transcript. "
                    "Do not add any external knowledge, context, or content from any other source. "
                    "If something is not in the transcript, do not include it. "
                    "Write dense, precise prose. Use present tense ('The lecture examines...'). No bullet points. "
                    f"{_PDF_TRANSCRIPT_ONLY_RULE}"
                ),
            },
            {
                "role": "user",
                "content": (
                    # Sample beginning + end so the exec summary covers the full lecture arc,
                    # not just the first ~15 minutes. Beginning establishes what is being taught;
                    # end captures conclusions, takeaways, and forward references.
                    f"TRANSCRIPT (beginning):\n{transcript[:5000]}\n\n"
                    + (f"TRANSCRIPT (conclusion):\n{transcript[-3000:]}\n\n" if len(transcript) > 8000 else "")
                    + f"Write a 3-paragraph executive summary of the lecture titled \"{title}\".{hint} "
                    "Each paragraph is 3-4 sentences. Separate paragraphs with a blank line. "
                    f"Return only the summary text, no preamble.{strict_rule}"
                ),
            },
        ],
        temperature=0.2 if strict else 0.4,
        max_tokens=650,
    )
    log_cost("pdf_executive_summary", "gpt-4o-mini",
             input_tokens=resp.usage.prompt_tokens,
             output_tokens=resp.usage.completion_tokens)
    return resp.choices[0].message.content.strip()


def _call_enrich_section(
    section_text: str,
    idx: int,
    total: int,
    topic: str | None,
    language: str,
) -> dict:
    if not _client:
        lead, rest = _extract_lead_sentence(section_text[:300])
        return {
            "title": f"Section {idx + 1}", "lead_sentence": lead, "prose": rest,
            "bullets": [], "concepts": [], "examples": [], "raw_section": section_text,
            "analogy": None, "mistake": None, "remember": None,
        }
    hint = f" Domain: {topic}." if topic else ""
    resp = _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": _PDF_TRANSCRIPT_ONLY_RULE,
            },
            {
                "role": "user",
                "content": (
                    "Note: The transcript may contain mixed languages. Extract meaning from all languages present. Respond in English.\n\n"
                    f"You are enriching section {idx + 1} of {total} from a lecture.{hint}\n"
                    f"Section summary:\n{section_text}\n\n"
                    "Return a JSON object with exactly these fields:\n"
                    "- \"title\": A crisp noun-phrase title describing specifically what concepts "
                    "are taught in THIS section (max 6 words). "
                    "FORBIDDEN generic titles: 'Introduction', 'Overview', 'Fundamentals', 'Basics', "
                    "'Summary', 'Review', 'Lecture Notes'. Name the actual concepts taught.\n"
                    "- \"prose\": 2-3 flowing sentences expanding the core idea. Present tense. No bullets.\n"
                    "- \"bullets\": Array of 3-5 specific key points as short strings\n"
                    "- \"concepts\": Array of key concept names explicitly named or defined in this section "
                    "(single nouns or short noun phrases, e.g. 'Action Potential', 'Ohm\\'s Law'). "
                    "Return an empty array if no concepts were explicitly named.\n"
                    "- \"examples\": Array of concrete real-world examples or applications "
                    "the lecturer explicitly gave. Return an empty array if none were given. "
                    "Never invent examples that were not in the source text.\n"
                    "- \"definition\": The professor's own definition restated cleanly. If the "
                    "professor refined it, use the most complete transcript-supported version.\n"
                    "- \"key_distinction\": The most important contrast taught in this section, "
                    "for example positive vs normative or economic vs non-economic goods. Return null if absent.\n"
                    "- \"exam_trap\": When the section contains a misconception correction, trick warning, or student error pattern, return an object with two fields:\n"
                    '  "misconception": "What students wrongly believe — must be a FALSE or incomplete belief, not the correct answer. Start with \'Students often think...\' or \'A common mistake is thinking...\'"\n'
                    '  "correct": "The actual correct understanding that corrects the misconception above — must differ from misconception"\n'
                    "CRITICAL: misconception and correct must NEVER be the same text. misconception = what students commonly get wrong or misunderstand; correct = the actual correct understanding. These two fields MUST be different from each other. Never copy the definition verbatim into both fields. If you cannot identify a genuine misconception from the transcript, set exam_trap to null.\n"
                    "- \"analogy\": A 2-3 sentence real-world analogy that makes this concept click. "
                    "Use 'Think of...' or 'Imagine...' framing. Only generate if a natural analogy "
                    "exists for this specific content. Return null if no natural analogy exists.\n"
                    "- \"mistake\": One specific misconception students commonly make with this "
                    "section's content. Grounded in the source material. Return null if none is "
                    "clearly identifiable.\n"
                    "- \"remember\": One key principle to remember from this section — a positive, "
                    "memorable one-sentence formulation. Always include.\n"
                    "STRICT RULE: only include information explicitly present in the section text. "
                    "Empty arrays for concepts and examples are valid and preferred over invented content.\n"
                    "Return only valid JSON."
                ),
            }
        ],
        temperature=0.3,
        max_tokens=900,
        response_format={"type": "json_object"},
    )
    log_cost("pdf_enrich_section", "gpt-4o-mini",
             input_tokens=resp.usage.prompt_tokens,
             output_tokens=resp.usage.completion_tokens)
    try:
        data = json.loads(resp.choices[0].message.content)
    except Exception:
        data = {}
    prose = data.get("prose", "")
    lead, rest = _extract_lead_sentence(prose)
    concepts = data.get("concepts") or []
    examples = data.get("examples") or []
    print(f"[enrich_section] s{idx + 1}/{total}: title={data.get('title')!r} concepts={concepts} examples={examples}")
    structured_trap = _normalise_structured_exam_trap(data.get("exam_trap"))
    print(f"[enrich_section] s{idx + 1}/{total}: structured_exam_trap={'yes' if structured_trap else 'no'}")
    exam_traps = [structured_trap] if structured_trap else []
    return {
        "title":         data.get("title", f"Section {idx + 1}"),
        "lead_sentence": lead,
        "prose":         rest,
        "bullets":       data.get("bullets") or [],
        "concepts":      concepts,
        "examples":      examples,
        "definitions":   [data.get("definition")] if data.get("definition") else [],
        "distinctions":  [data.get("key_distinction")] if data.get("key_distinction") else [],
        "exam_traps":    exam_traps,
        "exam_trap_structured": structured_trap,
        "raw_section":   section_text,
        "analogy":       data.get("analogy") or None,
        "mistake":       data.get("mistake") or None,
        "remember":      data.get("remember") or None,
    }


def _call_glossary(transcript: str, topic: str | None, n_terms: int = 8) -> list[dict]:
    if not _client:
        return []
    hint = f" Domain: {topic}." if topic else ""
    resp = _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": _PDF_TRANSCRIPT_ONLY_RULE,
            },
            {
                "role": "user",
                "content": (
                    "Note: The transcript may contain mixed languages. Extract meaning from all languages present. Respond in English.\n\n"
                    # transcript arg is the grounded_summary (full-lecture coverage) — use all of it
                    f"LECTURE CONTENT:\n{transcript[:9000]}\n\n"
                    f"Extract up to {n_terms} distinct academic or technical terms introduced or defined in this lecture.{hint} "
                    "Prefer every lecture-defined term over generic textbook terms. For economics lectures, include each "
                    "distinct economics term the professor introduced, including positive/normative statements, economic/non-economic goods, "
                    "free goods, public goods, utility, disutility, opportunity cost, scarcity, and economic/non-economic resources when present. "
                    "Definitions must match what the professor said and must never contradict explicit lecture statements. "
                    "If the lecture says public goods are limited in supply, do not define them as unlimited. "
                    "For each term provide one exam-ready sentence a student can memorise. "
                    'Return JSON: {"terms": [{"term": "...", "definition": "..."}]}'
                ),
            }
        ],
        temperature=0.2,
        max_tokens=1200,
        response_format={"type": "json_object"},
    )
    log_cost("pdf_glossary", "gpt-4o-mini",
             input_tokens=resp.usage.prompt_tokens,
             output_tokens=resp.usage.completion_tokens)
    try:
        return json.loads(resp.choices[0].message.content).get("terms", [])
    except Exception:
        return []


def _call_glossary_from_cards(concept_note_cards: list[dict], topic: str | None, n_terms: int = 8) -> list[dict]:
    visible_cards = [
        card for card in (concept_note_cards or [])
        if isinstance(card, dict) and not str(card.get("concept_name", "")).startswith("__")
    ]
    if not visible_cards:
        return []

    out = []
    seen = set()
    for card in visible_cards:
        term = str(card.get("concept_name") or "").strip()
        key = term.lower()
        if not term or key in seen:
            continue
        key_definitions = [
            item for item in (card.get("key_definitions") or [])
            if isinstance(item, dict) and str(item.get("definition") or "").strip()
        ]
        if not key_definitions:
            continue
        matching = next(
            (
                item for item in key_definitions
                if str(item.get("term") or "").strip().lower() == key
            ),
            None,
        )
        if not matching:
            continue
        definition = str(matching.get("definition") or "").strip()
        key = term.lower()
        if not term or not definition or key in seen:
            continue
        seen.add(key)
        out.append({"term": term, "definition": definition})
        if len(out) >= n_terms:
            break
    return out


def _fallback_conceptual_map_from_sections(sections: list[str]) -> list[dict]:
    out = []
    seen = set()

    def add_connection(left: str, relation: str, right: str) -> None:
        left_clean = str(left or "").strip()
        right_clean = str(right or "").strip()
        relation_clean = str(relation or "").strip()
        if not left_clean or not right_clean or not relation_clean:
            return
        if left_clean.lower() == right_clean.lower():
            return
        text = f"{left_clean} -> {relation_clean} -> {right_clean}"
        normalized = re.sub(r"\s+", " ", text).strip().lower()
        if normalized in seen:
            return
        seen.add(normalized)
        out.append({"heading": "CONNECTION", "paragraph": text})

    titles = []
    for section in sections or []:
        lines = [line.strip() for line in str(section or "").splitlines() if line.strip()]
        if not lines:
            continue
        title = lines[0]
        body = " ".join(lines[1:]).lower()
        titles.append(title)
        if "scarce" in body and "opportunity cost" in body:
            add_connection(title, "involves", "Opportunity Cost")
        if "unlimited in supply" in body or "free goods" in body:
            add_connection(title, "are", "Free Goods")
        if "inputs used to produce" in body or "inputs for producing" in body:
            add_connection(title, "are inputs for", "Goods and Services")

    for title in titles:
        parts = re.split(r"\s+vs\.?\s+", title, flags=re.I)
        if len(parts) == 2:
            add_connection(parts[0], "contrasts with", parts[1])

    if "Economic Goods" in titles and "Non-economic Goods" in titles:
        add_connection("Economic Goods", "are scarce unlike", "Non-economic Goods")
    if "Non-economic Goods" in titles and "Non-economic Resources" in titles:
        add_connection("Non-economic Goods", "are unlimited like", "Non-economic Resources")

    return out


def _call_takeaways(transcript: str, summary: str, topic: str | None) -> list[str]:
    if not _client:
        return []
    hint = f" Domain: {topic}." if topic else ""
    resp = _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": _PDF_TRANSCRIPT_ONLY_RULE,
            },
            {
                "role": "user",
                "content": (
                    "Note: The transcript may contain mixed languages. Extract meaning from all languages present. Respond in English.\n\n"
                    f"SUMMARY:\n{summary[:3000]}\n\n"
                    f"List exactly 5 key takeaways from this lecture.{hint} "
                    "Each takeaway is one complete, actionable sentence starting with a verb or concept. "
                    'Return JSON: {"takeaways": ["...", ...]}'
                ),
            }
        ],
        temperature=0.3,
        max_tokens=450,
        response_format={"type": "json_object"},
    )
    log_cost("pdf_takeaways", "gpt-4o-mini",
             input_tokens=resp.usage.prompt_tokens,
             output_tokens=resp.usage.completion_tokens)
    try:
        return json.loads(resp.choices[0].message.content).get("takeaways", [])
    except Exception:
        return []


def _call_quick_review(
    transcript: str,
    summary: str,
    topic: str | None,
    n_questions: int,
) -> list[dict]:
    if not _client or n_questions == 0:
        return []
    hint = f" Domain: {topic}." if topic else ""
    diff_list = "\n".join(
        [f"Q{i + 1}: {_DIFFICULTIES[i % 3]}" for i in range(n_questions)]
    )
    resp = _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": _PDF_TRANSCRIPT_ONLY_RULE,
            },
            {
                "role": "user",
                "content": (
                    "Note: The transcript may contain mixed languages. Extract meaning from all languages present. Respond in English.\n\n"
                    f"TRANSCRIPT:\n{transcript[:5000]}\nSUMMARY:\n{summary[:4000]}\n\n"
                    f"Generate {n_questions} exam-style questions.{hint}\n"
                    f"Difficulty assignments (Bloom's taxonomy):\n{diff_list}\n\n"
                    "Recall = factual. Understanding = conceptual explanation. Application = applying to scenario.\n"
                    "Each answer is 2-3 sentences. Keep the assigned difficulty exactly.\n"
                    'Return JSON: {"questions": [{"question": "...", "answer": "...", "difficulty": "..."}]}'
                ),
            }
        ],
        temperature=0.4,
        max_tokens=1400,
        response_format={"type": "json_object"},
    )
    log_cost("pdf_quick_review", "gpt-4o-mini",
             input_tokens=resp.usage.prompt_tokens,
             output_tokens=resp.usage.completion_tokens)
    try:
        return json.loads(resp.choices[0].message.content).get("questions", [])
    except Exception:
        return []


def _call_study_roadmap(
    topic: str | None,
    title: str,
    section_titles: list[str],
    transcript: str = "",
) -> dict:
    if not _client:
        return {"days": [], "reminders": [], "next_topics": [], "prerequisites": []}
    topic_hint = f"Topic: {topic}. " if topic else ""
    titles_str = ", ".join(section_titles) if section_titles else "N/A"
    transcript_excerpt = transcript[:4000].strip() if transcript else ""
    n_sections = len(section_titles)
    n_days = 3 if n_sections <= 6 else 5 if n_sections <= 14 else 7
    resp = _client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert study planner. You create concrete day-by-day study schedules "
                    "based only on the sections actually covered in this lecture. "
                    "Never recommend external resources or topics not present in the transcript. "
                    f"{_PDF_TRANSCRIPT_ONLY_RULE}"
                ),
            },
            {
                "role": "user",
                "content": (
                    "Note: The transcript may contain mixed languages. Extract meaning from all languages present. Respond in English.\n\n"
                    f"TRANSCRIPT (excerpt):\n{transcript_excerpt}\n\n"
                    f"Lecture title: \"{title}\"\n"
                    f"{topic_hint}Sections covered ({n_sections} total): {titles_str}\n\n"
                    f"Create a {n_days}-day study plan for this lecture. Distribute the sections across the days logically — "
                    "group related sections together, put foundational concepts on day 1, advanced or synthesis topics last.\n\n"
                    "For each day provide:\n"
                    "- \"day\": day number as integer\n"
                    "- \"label\": a short evocative label for what this day covers (max 5 words, e.g. 'Foundations & Core Laws')\n"
                    "- \"chapters\": the section titles covered this day as an array of strings\n"
                    "- \"task\": one concrete hands-on task the student should do after reading (e.g. 'Write your own decorator from scratch', 'Redraw the transformer diagram from memory'). Be specific to the actual content.\n\n"
                    "Also provide:\n"
                    "- \"reminders\": array of 4-6 short sharp reminders or warnings the lecturer gave. "
                    "Extract these directly from the transcript — things like rules, warnings, common mistakes the lecturer flagged. "
                    "Each reminder is one sentence max 20 words.\n"
                    "- \"next_topics\": array of 3 objects with \"topic\" and \"reason\", based on what the lecturer said comes next\n"
                    "- \"prerequisites\": array of 2 objects with \"concept\" and \"reason\"\n\n"
                    'Return JSON: {"days": [{"day": 1, "label": "...", "chapters": ["..."], "task": "..."}], '
                    '"reminders": ["...", ...], "next_topics": [...], "prerequisites": [...]}'
                ),
            },
        ],
        temperature=0.3,
        max_tokens=1200,
        response_format={"type": "json_object"},
    )
    log_cost("pdf_study_roadmap", "gpt-4o",
             input_tokens=resp.usage.prompt_tokens,
             output_tokens=resp.usage.completion_tokens)
    try:
        data = json.loads(resp.choices[0].message.content)
        return {
            "days": data.get("days", []),
            "reminders": data.get("reminders", []),
            "next_topics":   data.get("next_topics", []),
            "prerequisites": data.get("prerequisites", []),
        }
    except Exception:
        return {"days": [], "reminders": [], "next_topics": [], "prerequisites": []}


def _call_conceptual_map(section_summaries: list[str]) -> list[dict]:
    """GPT-4o synthesis: returns distinct concept-to-concept lecture connections."""
    if not _client:
        return []
    combined = "\n\n".join([f"Section {i + 1}: {s}" for i, s in enumerate(section_summaries)])
    resp = _client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": (
                    "You synthesise academic knowledge, finding the ideas that bridge across lecture sections. "
                    f"{_PDF_TRANSCRIPT_ONLY_RULE}"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"SECTIONS:\n{combined}\n\n"
                    "Create a conceptual map showing how the concepts in this lecture connect to each other. "
                    "For each connection describe the relationship in one sentence.\n\n"
                    "Do not summarise individual sections — find the cross-cutting ideas. "
                    "Each entry needs a short heading (max 4 words) and the connecting paragraph.\n"
                    'Return JSON: {"connections": [{"heading": "...", "paragraph": "..."}]}'
                ),
            },
        ],
        temperature=0.5,
        max_tokens=900,
        response_format={"type": "json_object"},
    )
    log_cost("pdf_conceptual_map", "gpt-4o",
             input_tokens=resp.usage.prompt_tokens,
             output_tokens=resp.usage.completion_tokens)
    try:
        return json.loads(resp.choices[0].message.content).get("connections", [])
    except Exception:
        return []


def _call_conceptual_map_connections(section_summaries: list[str]) -> list[dict]:
    if not _client:
        return []
    combined = "\n\n".join([f"Section {i + 1}: {s}" for i, s in enumerate(section_summaries)])
    resp = _client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": (
                    "You synthesise academic knowledge, finding the ideas that bridge across lecture sections. "
                    f"{_PDF_TRANSCRIPT_ONLY_RULE}"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"SECTIONS:\n{combined}\n\n"
                    "Create a conceptual map showing how the concepts in this lecture connect to each other. "
                    "Write it as a sequence of labelled prose blocks — not arrows, not bullet points, not a list of connections.\n\n"
                    "Each block has:\n"
                    "- \"heading\": a short ALL-CAPS label showing the role this cluster plays in the lecture "
                    "(e.g. 'FOUNDATION', 'CORE LAW', 'FROM ROTATION TO AC', 'BACKEND STACK', 'BRIDGE TO QUANTUM'). "
                    "Max 4 words. Must describe the conceptual role, not just repeat a section title.\n"
                    "- \"paragraph\": 2-3 sentences explaining how the concepts in this cluster connect to each other "
                    "AND how this cluster connects to the next one. Written as flowing prose, present tense. "
                    "Name the actual concepts explicitly. Show the dependency or relationship.\n\n"
                    "Rules:\n"
                    "- 4 to 7 blocks total depending on lecture length\n"
                    "- Each block covers a natural cluster of related sections\n"
                    "- The blocks must form a narrative chain — each one leads into the next\n"
                    "- Never write generic blocks like 'Introduction' or 'Summary'\n"
                    "- Only use concepts explicitly present in the sections above\n\n"
                    'Return JSON: {"connections": [{"heading": "FOUNDATION", "paragraph": "..."}, ...]}'
                ),
            },
        ],
        temperature=0.4,
        max_tokens=1000,
        response_format={"type": "json_object"},
    )
    log_cost("pdf_conceptual_map", "gpt-4o",
             input_tokens=resp.usage.prompt_tokens,
             output_tokens=resp.usage.completion_tokens)
    try:
        connections = json.loads(resp.choices[0].message.content).get("connections", [])
    except Exception:
        return []
    out = []
    seen = set()
    for conn in connections or []:
        heading = str(conn.get("heading") or "").strip().upper()
        paragraph = str(conn.get("paragraph") or "").strip()
        if not heading or not paragraph:
            continue
        key = heading.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append({"heading": heading, "paragraph": paragraph})
    return out




def _call_mnemonics(glossary: list[dict]) -> list[dict]:
    """
    Generates memory hooks for glossary terms. Returns the same list with
    an optional "mnemonic" key added to each item (None where no natural
    mnemonic exists). Non-fatal: returns original list on any error.
    """
    if not _client or not glossary:
        return glossary
    terms_text = "\n".join(
        f"- {item['term']}: {item['definition']}" for item in glossary
    )
    try:
        resp = _client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": _PDF_TRANSCRIPT_ONLY_RULE,
                },
                {
                    "role": "user",
                    "content": (
                        f"For each term below, generate ONE memory hook "
                        "(acronym, rhyme, analogy, or vivid image) that makes it stick. "
                        "Only generate a hook if one arises naturally from the term's meaning. "
                        "Return null for terms where forcing one would be artificial.\n\n"
                        f"Terms:\n{terms_text}\n\n"
                        'Return JSON: {"mnemonics": [{"term": "...", "mnemonic": "..." | null}]}'
                    ),
                }
            ],
            temperature=0.4,
            max_tokens=600,
            response_format={"type": "json_object"},
        )
        log_cost("pdf_mnemonics", "gpt-4o-mini",
                 input_tokens=resp.usage.prompt_tokens,
                 output_tokens=resp.usage.completion_tokens)
        mnemonic_map = {
            m["term"]: m.get("mnemonic")
            for m in json.loads(resp.choices[0].message.content).get("mnemonics", [])
        }
        for item in glossary:
            m = mnemonic_map.get(item["term"])
            if m is not None:
                item["mnemonic"] = m
        return glossary
    except Exception as e:
        print(f"_call_mnemonics error (non-fatal): {e}")
        return glossary


_STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "this", "that", "these",
    "those", "with", "from", "into", "about", "also", "just", "very",
    "and", "but", "for", "not", "you", "they", "what", "which", "who",
    "when", "where", "how", "all", "each", "some", "such", "more", "most",
    "then", "than", "only", "its", "our", "their", "your", "his", "her",
}


def _top_terms(text: str, n: int = 5) -> list[str]:
    """Returns n most frequent non-stopword tokens (>=4 chars) from text."""
    words = re.findall(r'[a-z]{4,}', text.lower())
    counts = Counter(w for w in words if w not in _STOPWORDS)
    return [term for term, _ in counts.most_common(n)]


def _call_key_stats(transcript: str, topic: str | None) -> list[dict]:
    """
    Extracts up to 4 memorable statistics, key numbers, or metrics from the lecture.
    Returns [{"value": "28-30%", "label": "of clicks go to the #1 result"}].
    Returns [] if no quantitative facts are present. Non-fatal on error.
    """
    if not _client:
        return []
    hint = f" Domain: {topic}." if topic else ""
    try:
        resp = _client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": _PDF_TRANSCRIPT_ONLY_RULE,
                },
                {
                    "role": "user",
                    "content": (
                        "Note: The transcript may contain mixed languages. Extract meaning from all languages present. Respond in English.\n\n"
                        f"TRANSCRIPT:\n{transcript[:5000]}\n\n"
                        f"Extract up to 4 memorable statistics, key numbers, or metrics from this lecture.{hint} "
                        "Each entry needs a VALUE (the number, percentage, or ratio — short, bold-worthy, max 8 characters) "
                        "and a LABEL (what it measures, max 8 words). "
                        "STRICT RULE: only include numbers explicitly stated in the transcript. "
                        "Return fewer than 4 if fewer distinct quantitative facts exist. "
                        "Return an empty stats array if the lecture contains no clear statistics.\n"
                        'Return JSON: {"stats": [{"value": "...", "label": "..."}]}'
                    ),
                }
            ],
            temperature=0.2,
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        log_cost("pdf_key_stats", "gpt-4o-mini",
                 input_tokens=resp.usage.prompt_tokens,
                 output_tokens=resp.usage.completion_tokens)
        return json.loads(resp.choices[0].message.content).get("stats", [])
    except Exception as e:
        print(f"_call_key_stats error (non-fatal): {e}")
        return []


# ── PDF renderer (sync, run in thread) ───────────────────────────────────────

def _render_pdf(html_content: str, title_short: str, watermark: bool = False) -> bytes:
    # Use a per-call context manager instead of a global browser singleton.
    print("[pdf-render] starting Playwright render")
    with sync_playwright() as pw:
        print("[pdf-render] launching chromium")
        browser = pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
            ],
        )
        try:
            page = browser.new_page()
            try:
                print("[pdf-render] setting page content")
                page.set_content(html_content, wait_until="networkidle", timeout=30000)
                # Explicitly wait for all fonts to finish loading before snapshotting.
                # networkidle alone doesn't guarantee font-swap has completed ? this does.
                page.evaluate("() => document.fonts.ready")
                print("[pdf-render] page content ready")
                footer = (
                    "<div style='"
                    "width:100%;font-size:7pt;color:#94a3b8;"
                    "font-family:Arial,sans-serif;"
                    "letter-spacing:0!important;word-spacing:0!important;"
                    "font-variant-ligatures:none!important;"
                    "font-feature-settings:&quot;liga&quot; 0,&quot;calt&quot; 0!important;"
                    "text-rendering:geometricPrecision;"
                    "text-align:center;padding:0 22mm;"
                    "box-sizing:border-box;"
                    "'>Page <span class='pageNumber'></span> "
                    "of <span class='totalPages'></span> &middot; Neurativo</div>"
                )
                if watermark:
                    footer = (
                        "<div style='"
                        "width:100%;font-family:Arial,sans-serif;"
                        "letter-spacing:0!important;word-spacing:0!important;"
                        "font-variant-ligatures:none!important;"
                        "font-feature-settings:&quot;liga&quot; 0,&quot;calt&quot; 0!important;"
                        "text-rendering:geometricPrecision;"
                        "box-sizing:border-box;padding:0 22mm;"
                        "display:flex;justify-content:space-between;align-items:center;"
                        "'>"
                        "<span style='font-size:7pt;color:#94a3b8;'>"
                        "Page <span class='pageNumber'></span> of <span class='totalPages'></span>"
                        "</span>"
                        "<span style='font-size:7pt;font-weight:600;color:#7c3aed;"
                        "background:#f5f3ff;padding:2px 8px;border-radius:4px;"
                        "border:1px solid #ddd8fe;'>"
                        "Neurativo Free - upgrade for the full report"
                        "</span>"
                        "</div>"
                    )
                print("[pdf-render] generating pdf bytes")
                pdf_bytes = page.pdf(
                    format="A4",
                    margin={"top": "28mm", "bottom": "16mm", "left": "22mm", "right": "22mm"},
                    print_background=True,
                    display_header_footer=True,
                    header_template=(
                        "<div style='"
                        "width:100%;font-size:7pt;color:#94a3b8;"
                        "font-family:Arial,sans-serif;"
                        "letter-spacing:0!important;word-spacing:0!important;"
                        "font-variant-ligatures:none!important;"
                        "font-feature-settings:&quot;liga&quot; 0,&quot;calt&quot; 0!important;"
                        "text-rendering:geometricPrecision;"
                        "display:flex;justify-content:space-between;"
                        "padding:0 22mm;border-bottom:0.5px solid #e2e8f0;"
                        "padding-bottom:4px;box-sizing:border-box;"
                        f"'><span>{title_short}</span>"
                        "<span>Lecture Intelligence Report</span></div>"
                    ),
                    footer_template=footer,
                )
            finally:
                page.close()
        finally:
            browser.close()
    print("[pdf-render] render complete")
    return pdf_bytes


# ── Lite-tier fast path (no GPT calls) ───────────────────────────────────────

async def _generate_lite_pdf(
    lecture_id: str,
    title: str,
    created_at: str,
    duration_formatted: str,
    word_count: int,
    topic: str | None,
    language: str,
    transcript: str,
    summary: str,
    raw_sections: list,
    total_sections_actual: int,
    watermark: bool = False,
) -> bytes:
    """Generates a lite PDF with no GPT enrichment — summary text only.
    When watermark=True, adds a 'Neurativo Free — upgrade for full report'
    badge on every page footer and limits to first 2 sections."""
    section_label, review_label, glossary_label = _get_domain_labels(topic)
    domain_color = _get_domain_color(topic)

    section_limit = 2 if watermark else 4
    sections_data = _build_lite_sections(raw_sections, summary, transcript, section_limit)

    n_sections = len(sections_data)
    hidden_sections = max(0, total_sections_actual - n_sections)
    preview_upgrade = bool(watermark)
    preview_now_features = [
        f"{n_sections or 1} preview section{'s' if (n_sections or 1) != 1 else ''}",
        "Watermarked PDF preview",
        "Lecture metadata and duration stats",
    ]
    preview_upgrade_features = [
        "Full transcript export",
        "Complete section-by-section report",
        "Glossary, self-test, and study roadmap",
        "Clean PDF with no preview watermark",
    ]
    executive_summary = ""
    if preview_upgrade:
        executive_summary = (
            f"This free preview shows the opening view of \"{title}\" and up to {n_sections or 1} "
            f"section preview{'s' if (n_sections or 1) != 1 else ''}. "
            f"Upgrade to unlock the full report"
            f"{f', including {hidden_sections} more section' + ('s' if hidden_sections != 1 else '') if hidden_sections else ''}."
        )

    # Render template with same context keys as standard path
    template_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")
    env = Environment(loader=FileSystemLoader(template_dir))

    def _fmt_time_mmss(seconds):
        m = (seconds or 0) // 60
        s = (seconds or 0) % 60
        return f"{m:02d}:{s:02d}"

    env.filters["format_time"] = _fmt_time_mmss

    def _truncate_words(s: str, n: int) -> str:
        words = str(s).split()
        return (" ".join(words[:n]) + "…") if len(words) > n else str(s)

    env.filters["truncate_words"] = _truncate_words
    template = env.get_template("lecture_template.html")

    context = {
        "title":                title,
        "created_at":           created_at,
        "duration_formatted":   duration_formatted,
        "word_count":           f"{word_count:,}",
        "total_chunks":         0,
        "total_sections":       total_sections_actual or n_sections,
        "total_concepts":       0,
        "qa_pairs":             0,
        "language":             language.upper(),
        "topic":                topic,
        "reading_time_minutes": max(1, word_count // 238),
        "cover_stat3":          {"k": "Sections", "v": str(total_sections_actual or n_sections), "u": "In this report"},
        "cover_stat4":          {"k": "Reading", "v": str(max(1, word_count // 238)), "u": "Minutes estimated"},
        "section_label":        section_label,
        "review_label":         review_label,
        "glossary_label":       glossary_label,
        "executive_summary":    executive_summary,
        "cover_summary_preview": (executive_summary[:220].rsplit(" ", 1)[0] + "...") if executive_summary and len(executive_summary) > 220 else executive_summary,
        "enriched_sections":    sections_data,
        "glossary":             [],
        "takeaways":            [],
        "quick_review":         [],
        "conceptual_map":       [],
        "study_roadmap":        {"days": [], "reminders": [], "next_topics": [], "prerequisites": []},
        "summary_html":         "",
        "compression_ratio":    0.0,
        "visual_frames":        [],
        "key_stats":            [],
        "accent_color":         domain_color,
        "preview_upgrade":      preview_upgrade,
        "preview_hidden_sections": hidden_sections,
        "preview_now_features": preview_now_features,
        "preview_upgrade_features": preview_upgrade_features,
        "preview_sections":     sections_data[:2],
    }

    html_content = template.render(**context)
    title_short = title[:50] + ("…" if len(title) > 50 else "")
    return await asyncio.to_thread(_render_pdf, html_content, title_short, watermark)


# ── Main async entry point ────────────────────────────────────────────────────

async def generate_lecture_pdf(
    lecture_id: str,
    user_id: str | None = None,
    quality: str = "standard",   # "free" | "lite" | "standard" | "full"
) -> bytes:
    """
    Async PDF generator. All GPT enrichment calls run in parallel via
    asyncio.gather() + asyncio.to_thread(), making export ~5x faster than
    sequential calls.

    quality="free":     2-section preview with watermark footer, no GPT enrichment.
                        Given to free-plan users so they see the output and feel the
                        upgrade pull rather than seeing a 403 error.
    quality="lite":     4-section preview, no watermark, no GPT enrichment.
    quality="standard": Full sections + GPT enrichment (Student plan).
    quality="full":     Full sections + GPT enrichment + all extras (Pro plan).
    """
    try:
        IS_FREE = quality == "free"
        IS_LITE = quality == "lite" or IS_FREE
        lecture_data = await asyncio.to_thread(get_lecture_for_summarization, lecture_id)
        if not lecture_data:
            raise Exception("Lecture not found")

        transcript = lecture_data.get("transcript") or ""
        cleaned_transcript = _light_clean(transcript or "")
        if len(cleaned_transcript.split()) < 100:
            print("[pdf] light clean produced too little content ? using raw transcript")
            cleaned_transcript = (transcript or "").strip()
        summary = lecture_data.get("master_summary") or lecture_data.get("summary") or ""
        topic = lecture_data.get("topic") or None
        title = lecture_data.get("title") or "Lecture Notes"
        created_at = str(lecture_data.get("created_at") or datetime.now().date())[:10]
        total_chunks = lecture_data.get("total_chunks") or 0
        language = lecture_data.get("language") or "en"
        section_rows = await asyncio.to_thread(get_lecture_sections, lecture_id)
        grounded_notes = build_grounded_notes(cleaned_transcript, summary, section_rows=section_rows)
        concept_sections = build_concept_sections(grounded_notes)

        saved_cards = lecture_data.get("concept_note_cards") or []
        if isinstance(saved_cards, str):
            try:
                saved_cards = json.loads(saved_cards)
            except Exception:
                saved_cards = []
        visible_saved = [
            c for c in saved_cards
            if isinstance(c, dict)
            and not str(c.get("concept_name", "")).startswith("__")
        ]
        if len(visible_saved) >= 3 and not _has_placeholder_timestamps(visible_saved):
            concept_note_cards = saved_cards
            print(f"[pdf] using {len(visible_saved)} saved concept cards")
        else:
            concept_note_cards = build_concept_note_cards(
                transcript=transcript,
                lecture_id=lecture_id,
            )
            print(f"[pdf] regenerated concept cards: {len(concept_note_cards)}")

        validate_summary_card_generation(
            concept_sections,
            concept_note_cards,
            grounded_notes,
            transcript=transcript,
        )
        claim_registry = build_claim_registry(grounded_notes)
        title = _resolve_document_title(title, transcript, topic, concept_sections)
        grounded_summary = "\n\n".join(
            " ".join(
                part for part in [
                    note.get("title", ""),
                    note.get("core_explanation", "") or note.get("lead_sentence", ""),
                    note.get("prose", ""),
                    " ".join(note.get("examples", []) or []),
                ] if part
            ).strip()
            for note in (concept_sections or grounded_notes)
        ).strip()

        duration_sec = total_chunks * 12
        word_count = len(cleaned_transcript.split()) if cleaned_transcript else 0
        duration_formatted = format_duration(duration_sec)
        section_label, review_label, glossary_label = _get_domain_labels(topic)

        def _card_field_text(value) -> str:
            if value is None:
                return ""
            if isinstance(value, str):
                return value.strip()
            if isinstance(value, dict):
                if "misconception" in value or "correct" in value:
                    parts = []
                    if value.get("misconception"):
                        parts.append(f"Students think: {value['misconception']}")
                    if value.get("correct"):
                        parts.append(f"Actually: {value['correct']}")
                    return " ".join(parts).strip()
                if "concept_a" in value or "concept_b" in value:
                    parts = []
                    for side in ("concept_a", "concept_b"):
                        item = value.get(side) or {}
                        if isinstance(item, dict):
                            name = str(item.get("name") or "").strip()
                            chars = ", ".join(item.get("characteristics") or [])
                            text = ": ".join(x for x in (name, chars) if x)
                            if text:
                                parts.append(text)
                    return " vs ".join(parts).strip()
                return " ".join(str(v).strip() for v in value.values() if str(v).strip()).strip()
            if isinstance(value, list):
                chunks = [_card_field_text(item) for item in value]
                return " | ".join(chunk for chunk in chunks if chunk).strip()
            return str(value).strip()

        raw_sections = []
        if concept_note_cards:
            for card in concept_note_cards:
                if not isinstance(card, dict) or str(card.get("concept_name", "")).startswith("__"):
                    continue
                block = [card.get("concept_name", "Concept")]
                if card.get("summary"):
                    block.append(card["summary"])
                definitions = _card_field_text(card.get("key_definitions"))
                if definitions:
                    block.append("Definitions: " + definitions)
                if card.get("key_distinction"):
                    block.append("Key distinction: " + _card_field_text(card["key_distinction"]))
                if card.get("exam_trap"):
                    block.append("Exam trap: " + _card_field_text(card["exam_trap"]))
                examples = _card_field_text(card.get("examples"))
                if examples:
                    block.append("Examples: " + examples)
                raw_sections.append("\n".join(block).strip())
        elif concept_sections:
            for note in concept_sections:
                block = [note.get("title", "Summary")]
                if note.get("core_explanation"):
                    block.append(note["core_explanation"])
                if note.get("concepts"):
                    block.append("Key concepts: " + ", ".join(f"`{c}`" for c in note["concepts"]))
                if note.get("examples"):
                    block.append("Examples:")
                    block.extend(f"-> {example}" for example in note["examples"])
                raw_sections.append("\n".join(block).strip())
        elif grounded_notes:
            for note in grounded_notes:
                block = [note.get("title", "Summary")]
                if note.get("lead_sentence"):
                    block.append(note["lead_sentence"])
                if note.get("prose"):
                    block.append(note["prose"])
                if note.get("concepts"):
                    block.append("Key concepts: " + ", ".join(f"`{c}`" for c in note["concepts"]))
                if note.get("examples"):
                    block.append("Examples:")
                    block.extend(f"-> {example}" for example in note["examples"])
                raw_sections.append("\n".join(block).strip())
        else:
            raw_sections = [s.strip() for s in summary.split("## ") if s.strip()]
        if not raw_sections:
            raw_sections = [s.strip() for s in get_section_summaries(lecture_id) if s.strip()]
        if not raw_sections:
            raw_sections = _extract_summary_sections_loose(summary)
        n_sections = len(raw_sections)
        n_questions = _question_count(duration_sec)

        if IS_LITE:
            section_limit = 2 if IS_FREE else 4
            raw_sections = raw_sections[:section_limit]
            return await _generate_lite_pdf(
                lecture_id=lecture_id,
                title=title,
                created_at=created_at,
                duration_formatted=duration_formatted,
                word_count=word_count,
                topic=topic,
                language=language,
                transcript=cleaned_transcript,
                summary=summary,
                raw_sections=raw_sections,
                total_sections_actual=n_sections,
                watermark=IS_FREE,
            )

        tasks: list = []
        tasks.append(asyncio.to_thread(_call_executive_summary, cleaned_transcript, title, topic))
        tasks.append(asyncio.to_thread(_call_glossary_from_cards, concept_note_cards, topic, 18 if n_sections >= 3 else 10))
        tasks.append(asyncio.to_thread(_call_takeaways, cleaned_transcript, grounded_summary or summary, topic))
        tasks.append(asyncio.to_thread(_call_quick_review, cleaned_transcript, grounded_summary or summary, topic, n_questions))

        concept_entities = build_concept_entities(concept_sections, claim_registry)
        concept_graph = build_concept_relationship_graph(concept_entities, claim_registry)
        adaptive_intelligence = score_adaptive_concept_intelligence(concept_graph)
        adaptive_study_weighting = build_adaptive_study_weighting(adaptive_intelligence)
        deterministic_conceptual_map = build_relationship_concept_map(concept_graph)

        has_map = n_sections >= 3
        if has_map:
            tasks.append(asyncio.to_thread(_call_conceptual_map_connections, raw_sections))

        tasks.append(asyncio.to_thread(
            _call_study_roadmap,
            topic,
            title,
            [s.splitlines()[0].strip() if s.splitlines() else "" for s in raw_sections],
            cleaned_transcript,
        ))
        tasks.append(asyncio.to_thread(_call_key_stats, cleaned_transcript, topic))

        use_deterministic_concept_cards = bool(visible_saved or concept_note_cards)
        if not use_deterministic_concept_cards:
            for i, raw_sec in enumerate(raw_sections):
                tasks.append(asyncio.to_thread(_call_enrich_section, raw_sec, i, n_sections, topic, language))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        ri = 0
        exec_summary = results[ri] if not isinstance(results[ri], Exception) else ""
        ri += 1

        enriched_sections: list[dict] = []
        if concept_note_cards:
            enriched_sections = _concept_cards_to_pdf_sections(concept_note_cards)
        elif concept_sections:
            for note in concept_sections:
                section = {
                    "title": note.get("title") or "Summary",
                    "lead_sentence": note.get("core_explanation") or "",
                    "prose": "",
                    "bullets": [],
                    "concepts": note.get("concepts") or [],
                    "examples": note.get("examples") or [],
                    "definitions": note.get("key_definitions") or [],
                    "distinctions": note.get("important_distinctions") or [],
                    "exam_traps": note.get("exam_traps") or [],
                    "subsections": note.get("subsections") or [],
                    "subtopic_sections": note.get("subtopic_sections") or [],
                    "raw_section": "",
                    "analogy": None,
                    "mistake": None,
                    "remember": None,
                    "citations": note.get("citations") or [],
                    "confidence": note.get("confidence") or 0.0,
                    "verification_status": note.get("verification_status") or "supported",
                    "exam_trap_structured": None,
                }
                section.update(_section_render_profile(section))
                enriched_sections.append(section)
        elif grounded_notes:
            for note in grounded_notes:
                section = {
                    "title": note.get("title") or "Summary",
                    "lead_sentence": note.get("lead_sentence") or "",
                    "prose": note.get("prose") or "",
                    "bullets": note.get("highlights") or [],
                    "concepts": note.get("concepts") or [],
                    "examples": note.get("examples") or [],
                    "definitions": [],
                    "distinctions": [],
                    "exam_traps": [],
                    "subsections": [],
                    "subtopic_sections": [],
                    "raw_section": "",
                    "analogy": None,
                    "mistake": None,
                    "remember": None,
                    "citations": note.get("citations") or [],
                    "confidence": note.get("confidence") or 0.0,
                    "verification_status": note.get("verification_status") or "supported",
                    "exam_trap_structured": None,
                }
                section.update(_section_render_profile(section))
                enriched_sections.append(section)
        else:
            for i in range(n_sections):
                lead, rest = _extract_lead_sentence(raw_sections[i][:300])
                section = {
                    "title": f"Section {i + 1}",
                    "lead_sentence": lead,
                    "prose": rest,
                    "bullets": [],
                    "concepts": [],
                    "examples": [],
                    "definitions": [],
                    "distinctions": [],
                    "exam_traps": [],
                    "subsections": [],
                    "subtopic_sections": [],
                    "raw_section": raw_sections[i],
                    "analogy": None,
                    "mistake": None,
                    "remember": None,
                    "citations": [],
                    "confidence": 0.0,
                    "verification_status": "weak",
                    "exam_trap_structured": None,
                }
                section.update(_section_render_profile(section))
                enriched_sections.append(section)

        glossary: list[dict] = results[ri] if not isinstance(results[ri], Exception) else []
        ri += 1
        glossary = glossary[:24]
        if glossary:
            try:
                glossary = await asyncio.to_thread(_call_mnemonics, glossary)
            except Exception as e:
                print(f"mnemonics pass error (non-fatal): {e}")

        takeaways: list[str] = results[ri] if not isinstance(results[ri], Exception) else []
        ri += 1
        quick_review: list[dict] = results[ri] if not isinstance(results[ri], Exception) else []
        ri += 1

        conceptual_map: list[dict] = []
        if has_map:
            r = results[ri]
            ri += 1
            conceptual_map = r if not isinstance(r, Exception) else []
        if not conceptual_map:
            conceptual_map = _fallback_conceptual_map_from_sections(raw_sections) or deterministic_conceptual_map

        r = results[ri]
        ri += 1
        study_roadmap: dict = r if not isinstance(r, Exception) else {"days": [], "reminders": [], "next_topics": [], "prerequisites": []}

        r = results[ri]
        ri += 1
        key_stats: list[dict] = r if not isinstance(r, Exception) else []

        section_enrichments: list[dict] = []
        if not use_deterministic_concept_cards:
            for _ in raw_sections:
                r = results[ri]
                ri += 1
                section_enrichments.append(r if not isinstance(r, Exception) else {})

        for i, section in enumerate(enriched_sections):
            if i >= len(section_enrichments):
                break
            enr = section_enrichments[i]
            if not isinstance(enr, dict):
                continue
            if enr.get("analogy") and not section.get("analogy"):
                section["analogy"] = enr["analogy"]
            if enr.get("mistake") and not section.get("mistake"):
                section["mistake"] = enr["mistake"]
            if enr.get("remember") and not section.get("remember"):
                section["remember"] = enr["remember"]
            if enr.get("exam_trap_structured") and not section.get("exam_trap_structured"):
                section["exam_trap_structured"] = enr["exam_trap_structured"]
            for field in ("definitions", "distinctions", "exam_traps", "examples"):
                if enr.get(field):
                    section[field] = list(dict.fromkeys((section.get(field) or []) + (enr.get(field) or [])))
                    section.update(_section_render_profile(section))
            if not section.get("prose") and enr.get("prose"):
                section["prose"] = enr["prose"]
                section.update(_section_render_profile(section))
            if not section.get("bullets") and enr.get("bullets"):
                section["bullets"] = enr["bullets"]

        if exec_summary and transcript:
            top_terms = _top_terms(transcript[:8000], n=5)
            summary_lower = exec_summary.lower()
            matched = sum(1 for t in top_terms if t in summary_lower)
            if matched < 3:
                print(f"[pdf] exec_summary validation: only {matched}/5 transcript terms found ({top_terms}). Regenerating with strict prompt.")
                try:
                    exec_summary = await asyncio.to_thread(_call_executive_summary, cleaned_transcript, title, topic, True)
                    matched_retry = sum(1 for t in top_terms if t in exec_summary.lower())
                    if matched_retry < 3:
                        print(f"[pdf] exec_summary still failed after strict retry ({matched_retry}/5). Keeping retry output but flagging lecture_id={lecture_id} for review.")
                except Exception as e:
                    print(f"[pdf] exec_summary retry error (non-fatal): {e}")

        if takeaways and not _has_grounded_overlap(" ".join(takeaways), transcript, minimum=3):
            print(f"[pdf] takeaways failed transcript-overlap validation; using fallback.")
            takeaways = _fallback_takeaways(grounded_summary or summary, enriched_sections)
        elif not takeaways:
            takeaways = _fallback_takeaways(grounded_summary or summary, enriched_sections)

        sanitized_artifacts = sanitize_pdf_artifacts(
            transcript,
            grounded_notes,
            glossary=glossary,
            quick_review=quick_review,
            takeaways=takeaways,
            study_roadmap=study_roadmap,
        )
        glossary = sanitized_artifacts["glossary"]
        quick_review = sanitized_artifacts["quick_review"]
        takeaways = sanitized_artifacts["takeaways"] or _fallback_takeaways(grounded_summary or summary, enriched_sections)
        study_roadmap = {
            "days": sanitized_artifacts["study_roadmap"].get("days", []),
            "reminders": sanitized_artifacts["study_roadmap"].get("reminders", []),
            "next_topics": sanitized_artifacts["study_roadmap"].get("next_topics", []),
            "prerequisites": sanitized_artifacts["study_roadmap"].get("prerequisites", []),
        }
        print(f"[pdf] study_roadmap keys after sanitize: {list(study_roadmap.keys())}")
        glossary, takeaways, quick_review = _prioritize_revision_outputs(
            glossary,
            takeaways,
            quick_review,
            adaptive_intelligence,
        )
        verified_cheat_sheet = build_verified_cheat_sheet_from_cards(concept_note_cards)
        revision_focus = _build_revision_focus_summary(adaptive_intelligence)
        toc_entries = _compose_toc_entries(
            enriched_sections,
            include_exec=bool(exec_summary),
            include_map=bool(conceptual_map),
            include_quick_review=bool(quick_review),
            include_cheat_sheet=bool(verified_cheat_sheet),
        )

        doc_word_count = (
            len((exec_summary or "").split())
            + sum(
                len((s.get("lead_sentence", "") + " " + s.get("prose", "") + " " + " ".join(s.get("bullets", []))).split())
                for s in enriched_sections
            )
            + sum(len((t.get("term", "") + " " + t.get("definition", "")).split()) for t in glossary)
            + sum(len(tw.split()) for tw in takeaways)
            + sum(len((q.get("question", "") + " " + q.get("answer", "")).split()) for q in quick_review)
            + sum(len(c.get("paragraph", "").split()) for c in conceptual_map)
            + sum(len((t.get("topic", "") + " " + t.get("reason", "")).split()) for t in study_roadmap.get("next_topics", []))
            + sum(len((p.get("concept", "") + " " + p.get("reason", "")).split()) for p in study_roadmap.get("prerequisites", []))
            + sum(
                len(
                    (
                        str(day.get("label", ""))
                        + " "
                        + " ".join(day.get("chapters", []) or [])
                        + " "
                        + str(day.get("task", ""))
                    ).split()
                )
                for day in study_roadmap.get("days", [])
            )
            + sum(len(str(reminder).split()) for reminder in study_roadmap.get("reminders", []))
            + sum(
                len(
                    (
                        row.get("term", "")
                        + " "
                        + row.get("core_idea", "")
                        + " "
                        + row.get("exam_trap", "")
                        + " "
                        + row.get("quick_recall", "")
                    ).split()
                )
                for section in verified_cheat_sheet
                for row in section.get("rows", [])
            )
        )
        reading_time_minutes = max(1, math.ceil(doc_word_count / 238))

        try:
            visual_frames = await asyncio.to_thread(get_visual_frames, lecture_id)
        except Exception:
            visual_frames = []

        template_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")
        env = Environment(loader=FileSystemLoader(template_dir))

        def _fmt_time_mmss(seconds):
            m = (seconds or 0) // 60
            s = (seconds or 0) % 60
            return f"{m:02d}:{s:02d}"

        env.filters["format_time"] = _fmt_time_mmss

        def _truncate_words(s: str, n: int) -> str:
            words = str(s).split()
            return (" ".join(words[:n]) + "?") if len(words) > n else str(s)

        env.filters["truncate_words"] = _truncate_words
        template = env.get_template("lecture_template.html")
        total_concepts = sum(len(s.get("concepts", [])) for s in enriched_sections)
        qa_pairs = len(quick_review)
        cheat_sheet_chapter_count = len([
            c for c in (concept_note_cards or [])
            if isinstance(c, dict) and not str(c.get("concept_name", "")).startswith("__")
        ])
        cover_stats = _get_cover_stats(topic, enriched_sections, concept_note_cards, quick_review)
        context = {
            "title": title,
            "created_at": created_at,
            "duration_formatted": duration_formatted,
            "word_count": f"{word_count:,}",
            "total_chunks": total_chunks,
            "total_sections": n_sections,
            "total_concepts": total_concepts,
            "qa_pairs": qa_pairs,
            "language": language.upper(),
            "topic": topic,
            "reading_time_minutes": reading_time_minutes,
            "cover_stat3": cover_stats["stat3"],
            "cover_stat4": cover_stats["stat4"],
            "summary_confidence": lecture_summary_confidence(grounded_notes),
            "section_label": section_label,
            "review_label": review_label,
            "glossary_label": glossary_label,
            "executive_summary": exec_summary,
            "cover_summary_preview": (exec_summary[:220].rsplit(" ", 1)[0] + "...") if exec_summary and len(exec_summary) > 220 else exec_summary,
            "enriched_sections": enriched_sections,
            "glossary": glossary,
            "takeaways": takeaways,
            "quick_review": quick_review,
            "conceptual_map": conceptual_map,
            "concept_graph": concept_graph,
            "adaptive_intelligence": adaptive_intelligence,
            "adaptive_study_weighting": adaptive_study_weighting,
            "revision_focus": revision_focus,
            "cheat_sheet_chapter_count": cheat_sheet_chapter_count,
            "study_roadmap": study_roadmap,
            "verified_cheat_sheet": verified_cheat_sheet,
            "toc_entries": toc_entries,
            "summary_html": clean_markdown_to_html(grounded_summary or summary),
            "compression_ratio": 0.0,
            "visual_frames": visual_frames,
            "key_stats": key_stats[:4],
            "accent_color": _get_domain_color(topic),
        }
        html_content = template.render(**context)
        title_short = title[:50] + ("?" if len(title) > 50 else "")
        pdf_bytes = await asyncio.to_thread(_render_pdf, html_content, title_short, False)
        return pdf_bytes
    except Exception as exc:
        import traceback
        print(f"[pdf] generation failed: {exc}")
        print(traceback.format_exc())
        raise
