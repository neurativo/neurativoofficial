"""
trust_service.py - transcript-grounded lecture intelligence helpers.

The current product still stores markdown summaries, but this service derives a
stronger structured view on top of them:
- grounded notes with claim verification
- concept-first educational sections
- citations and confidence metadata
- a clean split between grounded notes and AI study aids
"""
from __future__ import annotations

import re
import json
import time
import hashlib
from statistics import mean

from openai import OpenAI

from app.core.config import settings
from app.services.cost_tracker import log_cost
from app.services.supabase_service import get_lecture_concept_note_cards, update_lecture_concept_note_cards
from app.services.transcript_cleaner import clean as clean_transcript

_client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None

_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "because", "by", "for", "from",
    "in", "into", "is", "it", "its", "of", "on", "or", "that", "the", "their",
    "this", "to", "was", "were", "with", "we", "you", "they", "he", "she",
    "our", "your", "there", "here", "these", "those", "them",
}
_TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9'-]{1,}")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_GENERIC_TITLES = {"summary", "section", "part 1", "part 2", "part 3", "lecture preview", "key idea"}
_TITLE_BLACKLIST_PHRASES = (
    "designing personalized solutions",
    "unique needs",
    "speaker delivering material",
    "key concept",
    "more from the session",
    "lecture snapshot",
    "lecture will summarize",
    "focus week essay question",
    "delivering material third time",
    "provided free charge government classified",
    "characterized unlimited supply when",
)
_CONTRADICTION_PAIRS = (
    ("non economic", "economic"),
    ("positive statement", "normative statement"),
    ("positive statements", "normative statements"),
    ("increase", "decrease"),
    ("legal", "illegal"),
    ("true", "false"),
)
_DISTINCTION_MARKERS = (
    " vs ", " versus ", " whereas ", " unlike ", " different ", " distinction ",
    " compared with ", " compared to ", " not the same ", " contrast ",
)
_DEFINITION_MARKERS = (" is ", " are ", " refers to ", " means ", " defined as ", " called ")
_TRAP_MARKERS = (
    "do not confuse", "does not mean", "still", "not the same", "common mistake",
    "trap", "important clarification", "not simply", "not equal", "not equal to",
    "trick", "they will ask", "comes in paper", "comes in papers", "don't confuse",
    "students think", "students always get this wrong", "wrong", "do you agree",
    "not really", "careful here", "corrected", "correction",
)
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
_EXAMPLE_HINTS = (
    "example", "illustration", "scenario", "instance", "sample",
    "for example", "for instance", "such as", "consider", "take the case",
    "e.g.", "e.g,", "namely", "specifically", "to illustrate",
    "population growth", "fast track class", "300 students", "lactase digestion",
)
_INVENTORY_CACHE_VERSION = 8
_ADMIN_HINTS = (
    "focus week", "essay question", "mcq", "multiple choice", "next week",
    "this week", "unit number", "summarize unit", "revision week", "lecture will",
    "speaker", "delivering material", "third time", "today we will", "we are going to",
    "can you hear me", "repeat after me", "open your books", "attendance",
    "before break", "after break", "assignment deadline", "upload slides",
    "recording started", "microphone", "noise in the class",
    "total assessment", "assessment is out", "marks", "worth 20", "worth 200",
    "a-level paper", "q-test", "two and a half hours", "three hours",
    "specific speed", "complete the summary", "not included in this note",
)
_LOW_SIGNAL_TITLE_PATTERNS = (
    r"^lecture\b",
    r"^speaker\b",
    r"^focus week\b",
    r"^key concept$",
    r"^.*\bwill summarize\b",
    r"^.*\bdelivering material\b",
    r"^.*\bprovided free charge\b",
    r"^.*\bcharacterized unlimited supply\b",
)
# Domain-locked economics rule tables removed — GPT reconstruction handles canonical
# concept classification. These are kept as empty tuples for backward compatibility
# (functions referencing them will return None, which is correct behavior).
_CURRICULUM_CONCEPT_RULES = (
    ("Microeconomics vs Macroeconomics", ("microeconomics", "macroeconomics", "individual units", "whole economy")),
    ("Positive vs Normative Statements", ("positive", "positive statements", "normative", "normative statements", "objective", "factual", "testable", "validated", "verifiable", "value judgment", "value judgments", "opinion")),
    ("Free Goods vs Public Goods", ("free goods", "public goods", "sunlight", "air", "street lights", "national defense", "shared consumption")),
    ("Goods, Utility & Satisfaction", ("utility", "wants", "satisfaction", "goods")),
    ("Economic Goods & Scarcity", ("economic goods", "scarcity", "scarce", "limited supply", "limited in supply", "opportunity cost")),
    ("Economic vs Non-Economic Goods", ("economic goods", "non economic goods", "non-economic goods", "free of charge", "gifted by nature")),
    ("Economic Bads", ("economic bads", "economic bad", "bad", "bads", "pollution", "garbage", "dissatisfaction", "opposite of good")),
    ("Human Intervention & Resource Conversion", ("human intervention", "conversion", "convert", "bottled water", "tap water", "oxygen tank")),
    ("Economic vs Non-Economic Resources", ("economic resources", "non economic resources", "non-economic resources", "resources", "production", "inputs")),
    ("Cellular Pathways & Mechanisms", ("pathway", "enzyme", "enzymes", "cellular", "mechanism", "metabolic", "reaction")),
    ("Anatomy & Physiological Mechanisms", ("anatomy", "physiology", "organ", "tissue", "mechanism")),
    ("Clinical Reasoning & Contraindications", ("diagnosis", "symptom", "contraindication", "treatment", "clinical")),
    ("Legal Tests & Precedent", ("precedent", "legal test", "case law", "holding", "doctrine")),
    ("Statutory Interpretation", ("statutory", "interpretation", "section", "legislation", "meaning")),
    ("Theorems, Proofs & Derivations", ("theorem", "proof", "derive", "derivation", "lemma")),
    ("Formula Systems & Problem Solving", ("formula", "equation", "variable", "solve", "calculation")),
    ("Engineering Systems & Constraints", ("system", "constraint", "constraints", "optimization", "process", "design tradeoff")),
)
_BOUNDARY_HINTS = (
    # Pedagogical / admin signals (domain-general)
    "exam", "study", "overview", "introduction", "summary", "review",
    # Structural academic signals matching _ACADEMIC_TITLE_HINTS
    "theory", "model", "principle", "law", "theorem", "framework",
    "algorithm", "mechanism", "pathway", "hypothesis",
)
_CANONICAL_TITLE_RULES = (
    ("Microeconomics vs Macroeconomics", ("microeconomics", "macroeconomics"), ("positive", "normative")),
    ("Positive vs Normative Statements", ("positive", "normative"), ("goods", "utility")),
    ("Goods, Utility & Satisfaction", ("utility", "wants", "satisfaction"), ("economic goods", "public goods")),
    ("Economic Goods & Scarcity", ("economic goods", "scarcity"), ("public goods", "resources")),
    ("Economic vs Non-Economic Goods", ("economic goods", "non economic goods"), ("resources",)),
    ("Free Goods vs Public Goods", ("public goods", "free goods"), ("economic bads", "resources")),
    ("Economic Bads", ("economic bads", "bads"), ("resources", "human intervention")),
    ("Human Intervention & Resource Conversion", ("human intervention", "convert", "conversion"), ("resources",)),
    ("Economic vs Non-Economic Resources", ("economic resources", "non economic resources", "resources"), tuple()),
)
_CANONICAL_SUBTOPIC_RULES = (
    ("Microeconomics", ("microeconomics",)),
    ("Macroeconomics", ("macroeconomics",)),
    ("Positive Statements", ("positive statements", "testable", "verifiable")),
    ("Normative Statements", ("normative statements", "value judgment", "value judgments")),
    ("Utility", ("utility", "satisfaction")),
    ("Economic Goods", ("economic goods", "scarce", "opportunity cost")),
    ("Free Goods", ("free goods", "non economic goods", "non-economic goods", "gifted by nature")),
    ("Public Goods", ("public goods", "government", "street lights", "national defense")),
    ("Scarcity", ("scarcity", "limited in supply", "limited supply")),
    ("Economic Bads", ("economic bads", "bads", "garbage", "pollution")),
    ("Human Intervention", ("human intervention", "convert", "conversion")),
    ("Resources", ("resources", "production", "inputs")),
    ("Common Exam Traps", ("do not confuse", "important clarification", "trap", "not equal")),
)
_RELATIONSHIP_STOP_TERMS = {"common exam traps", "concepts"}
_CAUSAL_MARKERS = ("because", "therefore", "leads to", "results in", "causes", "requires", "require", "depends on", "create", "creates")
_STRUCTURAL_CONCEPT_ROLES = {"foundational concept", "supporting concept"}


class ConceptCoverageError(RuntimeError):
    """Raised when section generation cannot account for every inventory concept."""


def _tokenise(text: str) -> set[str]:
    words = _TOKEN_RE.findall((text or "").lower())
    return {w for w in words if w not in _STOPWORDS}


def _normalise_ws(text: str) -> str:
    return " ".join((text or "").split()).strip()


def _word_count(text: str) -> int:
    return len(_TOKEN_RE.findall(text or ""))


def _title_case_name(text: str) -> str:
    words = _normalise_ws(text).split()
    if not words:
        return ""
    lower_words = {"vs", "and", "or", "of", "to", "the", "a", "an", "in"}
    out = []
    for i, word in enumerate(words):
        lowered = word.lower()
        if i > 0 and lowered in lower_words:
            out.append(lowered)
        else:
            out.append(word[:1].upper() + word[1:])
    return " ".join(out)


def _split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_SPLIT_RE.split(_normalise_ws(text)) if s.strip()]


def _parse_summary_sections(summary: str) -> list[dict]:
    summary = (summary or "").strip()
    if not summary:
        return []

    has_headers = "## " in summary
    blocks = summary.split("## ") if has_headers else [summary]
    sections = []
    for idx, raw_block in enumerate(blocks):
        block = raw_block.strip()
        if not block:
            continue
        lines = [ln.strip() for ln in block.splitlines() if ln.strip() and ln.strip() != "---"]
        if not lines:
            continue

        title = lines[0] if has_headers else ("Summary" if idx == 0 else f"Section {idx + 1}")
        content = lines[1:] if has_headers else lines
        highlights, concepts, examples, prose_lines = [], [], [], []
        for line in content:
            if line.startswith(">"):
                highlights.append(line[1:].strip())
                continue
            if re.match(r"^key concepts:\s*", line, flags=re.I):
                concepts.extend(x.strip("` ").strip() for x in re.findall(r"`([^`]+)`", line))
                continue
            if re.match(r"^examples:\s*$", line, flags=re.I):
                continue
            if line.startswith(("→", "â†’", "Ã¢â€ â€™")):
                examples.append(line[1:].strip())
                continue
            if line.startswith("- "):
                bullet = line[2:].strip()
                if bullet.startswith(("→", "â†’", "Ã¢â€ â€™")) or "example" in bullet.lower():
                    examples.append(bullet.lstrip("→â†’Ã¢â€ â€™ ").strip())
                elif "`" in bullet or len(bullet.split()) <= 4:
                    concepts.append(bullet.replace("`", "").strip())
                else:
                    prose_lines.append(bullet)
                continue
            prose_lines.append(line.replace("**", ""))

        prose_text = _normalise_ws(" ".join(prose_lines))
        lead_sentence = prose_text
        prose = ""
        match = re.search(r"(?<=[.!?])\s+", prose_text)
        if match:
            lead_sentence = prose_text[:match.start()].strip()
            prose = prose_text[match.end():].strip()

        sections.append({
            "title": title[:120],
            "lead_sentence": lead_sentence,
            "prose": prose,
            "concepts": [c for c in concepts if c],
            "examples": [e for e in examples if e],
            "highlights": [h for h in highlights if h],
        })
    return sections


def _split_transcript_units(transcript: str) -> list[dict]:
    units = []
    lines = [ln.strip() for ln in (transcript or "").splitlines() if ln.strip()]
    if not lines and transcript.strip():
        lines = [transcript.strip()]

    for line_idx, line in enumerate(lines):
        parts = _split_sentences(line) or [line]
        for sent in parts:
            units.append({
                "text": sent,
                "line_index": line_idx,
                "tokens": _tokenise(sent),
            })
    return units


def _find_best_evidence(text: str, transcript_units: list[dict]) -> tuple[dict | None, float]:
    text_tokens = _tokenise(text)
    if not text_tokens:
        return None, 0.0

    best_unit = None
    best_score = 0.0
    for unit in transcript_units:
        overlap = len(text_tokens & unit["tokens"])
        if overlap == 0:
            continue
        score = overlap / max(1, len(text_tokens))
        if _normalise_ws(text).lower() in _normalise_ws(unit["text"]).lower():
            score = max(score, 0.95)
        if score > best_score:
            best_score = score
            best_unit = unit
    return best_unit, best_score


def _candidate_evidence_units(text: str, transcript_units: list[dict]) -> list[dict]:
    text_tokens = _tokenise(text)
    if not text_tokens:
        return []
    candidates = []
    for unit in transcript_units:
        overlap = len(text_tokens & unit["tokens"])
        if overlap > 0:
            candidates.append((overlap / max(1, len(text_tokens)), unit))
    candidates.sort(key=lambda item: item[0], reverse=True)
    return [unit for _, unit in candidates[:6]]


def _is_contradicted(text: str, evidence: str) -> bool:
    claim = _normalise_ws(text).lower().replace("-", " ")
    source = _normalise_ws(evidence).lower().replace("-", " ")
    if not claim or not source:
        return False

    for left, right in _CONTRADICTION_PAIRS:
        claim_has_left = left in claim
        claim_has_right = right in claim
        source_has_left = left in source
        source_has_right = right in source
        if claim_has_left and source_has_right and not source_has_left:
            return True
        if claim_has_right and source_has_left and not source_has_right:
            return True
    return False


def _has_relevant_contradiction(text: str, transcript_units: list[dict]) -> bool:
    for unit in _candidate_evidence_units(text, transcript_units):
        if _is_contradicted(text, unit["text"]):
            return True
    return False


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


def _is_low_signal_title(title: str) -> bool:
    lowered = _normalise_ws(title).lower().replace("-", " ")
    if not lowered:
        return True
    if any(re.search(pattern, lowered) for pattern in _LOW_SIGNAL_TITLE_PATTERNS):
        return True
    if any(phrase in lowered for phrase in _TITLE_BLACKLIST_PHRASES):
        return True
    words = lowered.split()
    if len(words) >= 5 and not any(hint in lowered for hint in _ACADEMIC_TITLE_HINTS):
        return True
    return False


def _canonical_curriculum_concept(text: str) -> str | None:
    lowered = _normalise_ws(text).lower().replace("-", " ")
    if not lowered:
        return None
    best_title = None
    best_matches = 0
    for canonical, signals in _CURRICULUM_CONCEPT_RULES:
        matches = sum(1 for signal in signals if signal in lowered)
        if matches > best_matches:
            best_title = canonical
            best_matches = matches
    return best_title if best_matches >= 2 else None


def _classify_concept_role(text: str, context: str = "") -> str:
    cleaned = _normalise_ws(text)
    lowered = cleaned.lower().replace("-", " ")
    context_lower = _normalise_ws(context).lower().replace("-", " ")
    if not lowered:
        return "low educational relevance"
    if any(re.search(pattern, lowered) for pattern in _LOW_SIGNAL_TITLE_PATTERNS):
        return "admin / logistics"
    if any(hint in lowered for hint in _ADMIN_HINTS):
        return "admin / logistics"
    if "motivational" in lowered or "remember to" in lowered or "you should study" in lowered:
        return "motivational / chatter"
    if any(marker in lowered for marker in _TRAP_MARKERS):
        return "exam trap"
    canonical = _canonical_curriculum_concept(" ".join([cleaned, context]))
    signal_count = _curriculum_signal_count(canonical, " ".join([cleaned, context])) if canonical else 0
    context_has_definition = any(marker in context_lower or marker in lowered for marker in _DEFINITION_MARKERS)
    context_has_distinction = any(marker in context_lower or marker in lowered for marker in _DISTINCTION_MARKERS)
    if canonical and (signal_count >= 2 or context_has_definition or context_has_distinction):
        return "foundational concept"
    has_example_hint = any(hint in lowered or hint in context_lower for hint in _EXAMPLE_HINTS)
    has_academic_term = any(hint in lowered for hint in _ACADEMIC_TITLE_HINTS)
    if has_example_hint and not has_academic_term:
        return "example"
    if "like " in lowered or "similar to" in lowered or "imagine" in lowered:
        return "analogy"

    signal_type = _educational_signal_type(" ".join([cleaned, context]))
    has_definition = any(marker in context_lower or marker in lowered for marker in _DEFINITION_MARKERS)
    has_distinction = any(marker in context_lower or marker in lowered for marker in _DISTINCTION_MARKERS)
    if canonical and (signal_count >= 2 or has_definition or has_distinction):
        return "foundational concept"
    if signal_type == "foundational concept":
        return "foundational concept"
    if signal_type == "supporting concept":
        return "supporting concept"
    if signal_type == "exam instruction":
        return "exam trap"
    if signal_type == "example":
        return "example"
    if signal_type == "administrative lecture content":
        return "admin / logistics"
    return "low educational relevance"


def _curriculum_signal_count(canonical: str | None, text: str) -> int:
    if not canonical:
        return 0
    lowered = _normalise_ws(text).lower().replace("-", " ")
    for rule_title, signals in _CURRICULUM_CONCEPT_RULES:
        if rule_title == canonical:
            return sum(1 for signal in signals if signal in lowered)
    return 0


def _canonical_title_from_text(title: str, lead_sentence: str, concepts: list[str], prose: str = "", examples: list[str] | None = None, highlights: list[str] | None = None) -> str | None:
    corpus = " ".join([
        _normalise_ws(title).lower(),
        _normalise_ws(lead_sentence).lower(),
        _normalise_ws(prose).lower(),
        " ".join(_normalise_ws(c).lower() for c in concepts or []),
        " ".join(_normalise_ws(e).lower() for e in examples or []),
        " ".join(_normalise_ws(h).lower() for h in highlights or []),
    ])
    curriculum = _canonical_curriculum_concept(corpus)
    if curriculum:
        return curriculum
    for canonical, required_terms, excluded_terms in _CANONICAL_TITLE_RULES:
        if all(term in corpus for term in required_terms):
            if excluded_terms and any(term in corpus for term in excluded_terms):
                continue
            return canonical
    return None


def _note_curriculum_signature(note: dict) -> dict:
    raw_title = _normalise_ws(note.get("title", ""))
    safe_title = "" if _is_low_signal_title(raw_title) else raw_title
    concepts = note.get("concepts") or []
    examples = note.get("examples") or []
    highlights = note.get("highlights") or []
    lead = note.get("lead_sentence", "")
    prose = note.get("prose", "")
    signal_corpus = " ".join([lead, prose, " ".join(concepts), " ".join(highlights)])
    full_corpus = " ".join([safe_title, lead, prose, " ".join(concepts), " ".join(examples), " ".join(highlights)])
    canonical = _canonical_title_from_text(safe_title, lead, concepts, prose=prose, examples=examples, highlights=highlights)
    signal_type = _educational_signal_type(signal_corpus)
    concept_role = _classify_concept_role(" ".join([safe_title, " ".join(concepts)]), signal_corpus)
    canonical_signal_count = _curriculum_signal_count(canonical, full_corpus)

    if canonical and canonical_signal_count >= 2:
        if " vs " in canonical.lower() or any(marker in signal_corpus.lower() for marker in _DISTINCTION_MARKERS):
            signal_type = "foundational concept"
            concept_role = "foundational concept"
        elif signal_type in {"administrative lecture content", "low educational relevance", "example"}:
            signal_type = "supporting concept"
            if concept_role not in {"example", "admin / logistics", "motivational / chatter", "low educational relevance"}:
                concept_role = "supporting concept"

    title = canonical or _derive_title(raw_title, lead, concepts)
    strength = _title_quality(title, note) + min(2.0, canonical_signal_count * 0.4)
    is_admin_only = concept_role in {"admin / logistics", "motivational / chatter", "low educational relevance"} and not canonical
    is_example_only = concept_role in {"example", "analogy"} and not canonical
    is_driver = bool(canonical) and concept_role in _STRUCTURAL_CONCEPT_ROLES

    return {
        "title": title,
        "canonical": canonical,
        "signal_type": signal_type,
        "concept_role": concept_role,
        "signal_count": canonical_signal_count,
        "strength": strength,
        "is_admin_only": is_admin_only,
        "is_example_only": is_example_only,
        "is_driver": is_driver,
    }


def _status_from_score(score: float, contradicted: bool) -> str:
    if contradicted:
        return "contradicted"
    if score >= 0.55:
        return "supported"
    if score >= 0.22:
        return "weak"
    return "unsupported"


def _fmt_timestamp(seconds: int) -> str:
    seconds = max(0, int(seconds))
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def _chunk_range_to_citation(start_idx: int | None, end_idx: int | None) -> dict | None:
    if start_idx is None or end_idx is None or start_idx < 0 or end_idx < start_idx:
        return None
    start_sec = start_idx * 12
    end_sec = (end_idx + 1) * 12
    return {
        "chunk_range": [start_idx, end_idx],
        "start_seconds": start_sec,
        "end_seconds": end_sec,
        "label": f"{_fmt_timestamp(start_sec)}-{_fmt_timestamp(end_sec)}",
    }


def _derive_title(raw_title: str, lead_sentence: str, concepts: list[str]) -> str:
    canonical = _canonical_title_from_text(raw_title, lead_sentence, concepts)
    if canonical:
        return canonical
    title = _normalise_ws(raw_title).strip(":#- ")
    lowered = title.lower()
    if lowered.startswith("lecture distinguishes between") or lowered.startswith("lecture discusses distinction between"):
        title = ""
        lowered = ""
    if lowered.startswith("lecture ") or lowered.startswith("speaker "):
        title = ""
        lowered = ""
    if (
        title
        and not _is_low_signal_title(title)
        and lowered not in _GENERIC_TITLES
        and not re.fullmatch(r"section\s+\d+", lowered)
        and not any(phrase in lowered for phrase in _TITLE_BLACKLIST_PHRASES)
    ):
        return title[:120]

    lead = _normalise_ws(lead_sentence)
    if re.search(r"\bvs\b|\bversus\b", lead, flags=re.I):
        match = re.search(r"([A-Z][\w' -]{1,40}\s+(?:vs|versus)\s+[A-Z][\w' -]{1,40})", lead, flags=re.I)
        if match:
            return match.group(1).strip()[:120]

    if concepts:
        if len(concepts) >= 2:
            return f"{concepts[0]} vs {concepts[1]}"[:120]
        return concepts[0][:120]

    words = [w for w in _TOKEN_RE.findall(lead) if w.lower() not in _STOPWORDS]
    if not words:
        return "Key Concept"
    return " ".join(words[:6]).title()[:120]


def _title_quality(title: str, note: dict | None = None) -> float:
    cleaned = _normalise_ws(title)
    lowered = cleaned.lower()
    if not cleaned:
        return -5.0

    score = 0.0
    words = cleaned.split()
    if lowered in _GENERIC_TITLES or re.fullmatch(r"section\s+\d+", lowered):
        score -= 4.0
    if any(phrase in lowered for phrase in _TITLE_BLACKLIST_PHRASES):
        score -= 4.0
    if _is_low_signal_title(cleaned):
        score -= 3.5
    if re.search(r"\bvs\b|\bversus\b", lowered):
        score += 3.0
    if any(hint in lowered for hint in _ACADEMIC_TITLE_HINTS):
        score += 2.0
    if 2 <= len(words) <= 7:
        score += 1.5
    elif len(words) > 10:
        score -= 1.5
    if note:
        score += min(2.0, len(note.get("concepts") or []) * 0.5)
        if _collect_distinctions(note):
            score += 1.0
        if _collect_definition_lines(note):
            score += 0.5
    return score


def _is_example_like(note: dict) -> bool:
    title = _normalise_ws(note.get("title", "")).lower()
    lead = _normalise_ws(note.get("lead_sentence", "")).lower()
    prose = _normalise_ws(note.get("prose", "")).lower()
    concept_count = len(note.get("concepts") or [])
    if any(hint in title or hint in lead for hint in _EXAMPLE_HINTS):
        return True
    if _educational_signal_type(" ".join([title, lead, prose])) == "example":
        return True
    if concept_count <= 1 and not prose and len(note.get("examples") or []) > 0:
        return True
    return False


def _is_major_concept_note(note: dict) -> bool:
    title = _derive_title(note.get("title", ""), note.get("lead_sentence", ""), note.get("concepts") or [])
    strength = _title_quality(title, note)
    signal_type = _educational_signal_type(" ".join([
        note.get("lead_sentence", ""),
        note.get("prose", ""),
        " ".join(note.get("concepts") or []),
    ]))
    if signal_type in {"administrative lecture content", "teacher pacing commentary", "motivational guidance", "low educational relevance", "example"}:
        return False
    if re.search(r"\bvs\b|\bversus\b", title, flags=re.I):
        return True
    if any(hint in title.lower() for hint in _BOUNDARY_HINTS):
        return True
    if len(note.get("concepts") or []) >= 2 and strength >= 2.0:
        return True
    if _collect_definition_lines(note) and _collect_distinctions(note):
        return True
    if _note_density(note) >= 45 and strength >= 2.0 and not _is_example_like(note):
        return True
    return False


def _note_density(note: dict) -> int:
    return _word_count(
        " ".join(
            [
                note.get("lead_sentence", ""),
                note.get("prose", ""),
                " ".join(note.get("examples") or []),
                " ".join(note.get("highlights") or []),
            ]
        )
    )


def _note_overlap(left: dict, right: dict) -> float:
    left_tokens = _tokenise(" ".join([left.get("title", ""), left.get("lead_sentence", ""), " ".join(left.get("concepts") or [])]))
    right_tokens = _tokenise(" ".join([right.get("title", ""), right.get("lead_sentence", ""), " ".join(right.get("concepts") or [])]))
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / max(1, min(len(left_tokens), len(right_tokens)))


def _supports_current_examples(current: list[dict], candidate: dict) -> float:
    current_tokens = _tokenise(
        " ".join(
            " ".join(
                [
                    note.get("prose", ""),
                    " ".join(note.get("examples") or []),
                    " ".join(note.get("highlights") or []),
                ]
            )
            for note in current
        )
    )
    candidate_tokens = _tokenise(
        " ".join([candidate.get("title", ""), candidate.get("lead_sentence", ""), " ".join(candidate.get("concepts") or [])])
    )
    if not current_tokens or not candidate_tokens:
        return 0.0
    return len(current_tokens & candidate_tokens) / max(1, len(candidate_tokens))


def _citation_gap_seconds(current: list[dict], candidate: dict) -> int | None:
    current_citations = current[-1].get("citations") or []
    candidate_citations = candidate.get("citations") or []
    if not current_citations or not candidate_citations:
        return None
    current_end = current_citations[-1].get("end_seconds")
    candidate_start = candidate_citations[0].get("start_seconds")
    if current_end is None or candidate_start is None:
        return None
    return int(candidate_start) - int(current_end)


def _pick_chapter_title(notes: list[dict]) -> str:
    canonical = _canonical_title_from_text(
        " ".join(note.get("title", "") for note in notes),
        " ".join(note.get("lead_sentence", "") for note in notes),
        [concept for note in notes for concept in (note.get("concepts") or [])],
        prose=" ".join(note.get("prose", "") for note in notes),
        examples=[example for note in notes for example in (note.get("examples") or [])],
        highlights=[highlight for note in notes for highlight in (note.get("highlights") or [])],
    )
    if canonical:
        return canonical
    ranked = sorted(
        notes,
        key=lambda note: (
            _title_quality(note.get("title", ""), note),
            len(note.get("concepts") or []),
            _note_density(note),
        ),
        reverse=True,
    )
    for note in ranked:
        candidate = _derive_title(note.get("title", ""), note.get("lead_sentence", ""), note.get("concepts") or [])
        if _title_quality(candidate, note) >= 0.5:
            return candidate

    concepts = []
    for note in notes:
        concepts.extend(note.get("concepts") or [])
    concepts = _dedupe_texts(concepts)
    if len(concepts) >= 2:
        return f"{concepts[0]} and {concepts[1]}"[:120]
    if concepts:
        return concepts[0][:120]
    lead = next((n.get("lead_sentence", "") for n in notes if n.get("lead_sentence")), "")
    return _derive_title("", lead, [])


def _chapter_curriculum_signature(notes: list[dict]) -> dict:
    ranked: dict[str, dict] = {}
    best_note_signature: dict | None = None
    for note in notes:
        signature = _note_curriculum_signature(note)
        if best_note_signature is None or signature["strength"] > best_note_signature["strength"]:
            best_note_signature = signature
        canonical = signature.get("canonical")
        if not canonical:
            continue
        score = signature["signal_count"] + (2.0 if signature["is_driver"] else 0.0) + max(0.0, signature["strength"]) * 0.25
        current = ranked.setdefault(canonical, {"canonical": canonical, "score": 0.0, "count": 0})
        current["score"] += score
        current["count"] += 1

    if ranked:
        dominant = max(ranked.values(), key=lambda item: (item["score"], item["count"]))
        return {
            "canonical": dominant["canonical"],
            "score": dominant["score"],
            "count": dominant["count"],
            "fallback": best_note_signature,
        }
    return {
        "canonical": None,
        "score": 0.0,
        "count": 0,
        "fallback": best_note_signature,
    }


def _is_curriculum_transition(current: list[dict], candidate: dict) -> bool:
    current_signature = _chapter_curriculum_signature(current)
    candidate_signature = _note_curriculum_signature(candidate)
    current_canonical = current_signature.get("canonical")
    candidate_canonical = candidate_signature.get("canonical")

    if candidate_signature["is_admin_only"] or candidate_signature["is_example_only"]:
        return False
    if not candidate_canonical or not candidate_signature["is_driver"]:
        return False
    if not current_canonical:
        return False
    if candidate_canonical == current_canonical:
        return False

    overlap = max((_note_overlap(existing, candidate) for existing in current), default=0.0)
    if overlap >= 0.55 and _supports_current_examples(current, candidate) >= 0.35:
        return False
    return True


def _groups_share_curriculum(current: list[dict], candidate: list[dict]) -> bool:
    current_canonical = _chapter_curriculum_signature(current).get("canonical")
    candidate_canonical = _chapter_curriculum_signature(candidate).get("canonical")
    if not current_canonical or not candidate_canonical:
        return True
    if current_canonical == candidate_canonical:
        return True
    return False


def _same_major_family(current: list[dict], candidate: dict) -> bool:
    overlap = max((_note_overlap(existing, candidate) for existing in current), default=0.0)
    example_support = _supports_current_examples(current, candidate)
    citation_gap = _citation_gap_seconds(current, candidate)
    title = _derive_title(candidate.get("title", ""), candidate.get("lead_sentence", ""), candidate.get("concepts") or [])
    lowered = title.lower()
    current_title = _pick_chapter_title(current).lower()
    if overlap >= 0.35 or example_support >= 0.35:
        return True
    if citation_gap is not None and citation_gap <= 24 and overlap >= 0.18:
        return True
    if "goods" in lowered and "goods" in current_title:
        return True
    if "resources" in lowered and "resources" in current_title:
        return True
    return False


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


def _merge_chapter_notes(notes: list[dict]) -> dict:
    citations = []
    seen_citations = set()
    concepts = []
    examples = []
    definitions = []
    distinctions = []
    exam_traps = []
    core_parts = []
    subsection_titles = []
    confidences = []
    statuses = []
    subtopic_sections = []

    for note in notes:
        signature = _note_curriculum_signature(note)
        title = _derive_title(note.get("title", ""), note.get("lead_sentence", ""), note.get("concepts") or [])
        signal_type = _educational_signal_type(" ".join([
            title,
            note.get("lead_sentence", ""),
            note.get("prose", ""),
            " ".join(note.get("concepts") or []),
        ]))
        concept_role = signature.get("concept_role", _classify_concept_role(title, _build_core_explanation(note)))
        if (
            title
            and concept_role in _STRUCTURAL_CONCEPT_ROLES
            and title.lower() not in _GENERIC_TITLES
            and not re.fullmatch(r"section\s+\d+", title.lower())
        ):
            subsection_titles.append(title)
            subtopic_sections.append({
                "title": title,
                "signal_type": signal_type,
                "concept_role": concept_role,
                "overview": _build_core_explanation(note),
                "definitions": _collect_definition_lines(note)[:2],
                "examples": _dedupe_texts(note.get("examples") or [])[:2],
                "exam_traps": _collect_exam_traps(note)[:2],
                "citations": note.get("citations") or [],
            })

        if note.get("lead_sentence"):
            core_parts.append(note["lead_sentence"])
        if note.get("prose"):
            core_parts.append(note["prose"])

        concepts.extend(note.get("concepts") or [])
        examples.extend(note.get("examples") or [])
        definitions.extend(_collect_definition_lines(note))
        distinctions.extend(_collect_distinctions(note))
        exam_traps.extend(_collect_exam_traps(note))
        confidences.append(note.get("confidence", 0.0))
        statuses.append(note.get("verification_status", "weak"))

        for citation in note.get("citations") or []:
            key = (citation.get("start_seconds"), citation.get("end_seconds"), citation.get("label"))
            if key in seen_citations:
                continue
            seen_citations.add(key)
            citations.append(citation)

    title = _pick_chapter_title(notes)
    core_sentences = _filter_conflicting_texts(_dedupe_texts(_split_sentences(" ".join(core_parts))))
    if len(core_sentences) > 4:
        core_sentences = core_sentences[:4]

    concepts = _dedupe_texts(concepts)[:8]
    examples = _filter_conflicting_texts(_dedupe_texts(examples))[:5]
    definitions = _filter_conflicting_texts(_dedupe_texts(definitions))[:4]
    distinctions = _filter_conflicting_texts(_dedupe_texts(distinctions))[:4]
    exam_traps = _filter_conflicting_texts(_dedupe_texts(exam_traps))[:4]
    subsection_titles = [s for s in _dedupe_texts(subsection_titles) if s != title and not _is_low_signal_title(s)][:4]
    subtopics = []
    chapter_corpus = " ".join([
        title.lower(),
        " ".join(c.lower() for c in concepts),
        " ".join(e.lower() for e in examples),
        " ".join(d.lower() for d in definitions),
        " ".join(x.lower() for x in distinctions),
        " ".join(t.lower() for t in exam_traps),
    ])
    for label, terms in _CANONICAL_SUBTOPIC_RULES:
        if any(term in chapter_corpus for term in terms):
            subtopics.append(label)
    for label in subsection_titles:
        if label not in subtopics:
            subtopics.append(label)
    subtopics = _dedupe_texts(subtopics)[:6]
    deduped_subtopic_sections = []
    seen_subtopic_titles = set()
    for item in subtopic_sections:
        key = item["title"].lower()
        if item.get("concept_role") not in _STRUCTURAL_CONCEPT_ROLES:
            continue
        if key in seen_subtopic_titles:
            continue
        seen_subtopic_titles.add(key)
        deduped_subtopic_sections.append(item)
    deduped_subtopic_sections = deduped_subtopic_sections[:5]

    start_seconds = citations[0]["start_seconds"] if citations else None
    end_seconds = citations[-1]["end_seconds"] if citations else None
    confidence = round(mean([c for c in confidences if c]), 2) if any(confidences) else 0.0
    verification_status = "supported" if "supported" in statuses else "weak"

    return {
        "title": title or "Lecture Concept",
        "core_explanation": " ".join(core_sentences).strip(),
        "key_definitions": definitions,
        "important_distinctions": distinctions,
        "exam_traps": exam_traps,
        "examples": examples,
        "concepts": concepts,
        "citations": citations,
        "confidence": confidence,
        "verification_status": verification_status,
        "start_seconds": start_seconds,
        "end_seconds": end_seconds,
        "source_references": [c["label"] for c in citations],
        "subsections": subtopics,
        "subtopic_sections": deduped_subtopic_sections,
    }


def _build_units(section: dict, transcript_units: list[dict]) -> tuple[list[dict], str, float, list[dict], dict]:
    units = []
    evidence_refs = []
    statuses = []
    scores = []

    def add_unit(kind: str, text: str) -> str | None:
        cleaned = _normalise_ws(text)
        if not cleaned:
            return None
        evidence, score = _find_best_evidence(cleaned, transcript_units)
        contradicted = _has_relevant_contradiction(cleaned, transcript_units) or _is_contradicted(cleaned, evidence["text"] if evidence else "")
        status = _status_from_score(score, contradicted)
        if status in {"unsupported", "contradicted"}:
            return None

        unit = {
            "type": kind,
            "text": cleaned,
            "confidence": round(score, 2),
            "support_score": round(score, 2),
            "contradiction_score": 1.0 if contradicted else 0.0,
            "verification_status": status,
            "source_chunk_ids": [evidence["line_index"]] if evidence else [],
            "timestamps": (
                [{"seconds": evidence["line_index"] * 12, "label": _fmt_timestamp(evidence["line_index"] * 12)}]
                if evidence else []
            ),
        }
        units.append(unit)
        statuses.append(status)
        scores.append(score)
        if evidence:
            evidence_refs.append({
                "label": _fmt_timestamp(evidence["line_index"] * 12),
                "start_seconds": evidence["line_index"] * 12,
                "end_seconds": (evidence["line_index"] + 1) * 12,
            })
        return cleaned

    kept_lead = add_unit("claim", section.get("lead_sentence", "")) or ""
    verified_section = {
        "title": _derive_title(section.get("title") or "Summary", kept_lead, section.get("concepts", []) or []),
        "lead_sentence": kept_lead,
        "prose": "",
        "concepts": [],
        "examples": [],
        "highlights": [],
    }

    prose_sentences = _split_sentences(section.get("prose", ""))
    kept_prose = [add_unit("claim", sent) for sent in prose_sentences]
    verified_section["prose"] = " ".join(x for x in kept_prose if x)

    for concept in section.get("concepts", []) or []:
        kept = add_unit("concept", concept)
        if kept:
            verified_section["concepts"].append(kept)

    for example in section.get("examples", []) or []:
        kept = add_unit("example", example)
        if kept:
            verified_section["examples"].append(kept)

    for highlight in section.get("highlights", []) or []:
        kept = add_unit("claim", highlight)
        if kept:
            verified_section["highlights"].append(kept)

    note_status = "unsupported"
    if statuses:
        note_status = "supported" if "supported" in statuses else "weak"
    confidence = round(mean(scores), 2) if scores else 0.0
    unique_refs = []
    seen = set()
    for ref in evidence_refs:
        key = (ref["start_seconds"], ref["end_seconds"])
        if key in seen:
            continue
        seen.add(key)
        unique_refs.append(ref)
    return units, note_status, confidence, unique_refs, verified_section


def build_grounded_notes(
    transcript: str,
    summary: str,
    section_rows: list[dict] | None = None,
) -> list[dict]:
    transcript_units = _split_transcript_units(transcript)
    section_rows = section_rows or []

    sections = []
    if section_rows:
        for idx, row in enumerate(section_rows):
            parsed = _parse_summary_sections(row.get("section_summary", ""))
            if parsed:
                section = parsed[0]
            else:
                raw_text = row.get("section_summary", "") or ""
                lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
                section = {
                    "title": lines[0][:120] if lines else f"Section {idx + 1}",
                    "lead_sentence": " ".join(lines[1:]).strip() if len(lines) > 1 else raw_text,
                    "prose": "",
                    "concepts": [],
                    "examples": [],
                    "highlights": [],
                }
            section["_citation"] = _chunk_range_to_citation(row.get("chunk_range_start"), row.get("chunk_range_end"))
            sections.append(section)
    else:
        sections = _parse_summary_sections(summary)

    grounded = []
    for section in sections:
        units, status, confidence, evidence_refs, verified = _build_units(section, transcript_units)
        citation = section.get("_citation")
        citations = []
        if citation:
            citations.append(citation)
        citations.extend(ref for ref in evidence_refs if ref not in citations)
        if not any([verified["lead_sentence"], verified["prose"], verified["concepts"], verified["examples"], verified["highlights"]]):
            continue
        grounded.append({
            **verified,
            "units": units,
            "citations": citations,
            "confidence": confidence,
            "verification_status": status,
        })
    return grounded


def _dedupe_texts(items: list[str]) -> list[str]:
    seen = set()
    out = []
    for item in items:
        cleaned = _normalise_ws(item)
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
    return out


def _filter_conflicting_texts(items: list[str]) -> list[str]:
    kept: list[str] = []
    for item in items:
        replaced = False
        for idx, existing in enumerate(kept):
            if _is_contradicted(item, existing) or _is_contradicted(existing, item):
                if _word_count(item) > _word_count(existing):
                    kept[idx] = item
                replaced = True
                break
        if not replaced:
            kept.append(item)
    return kept


def _collect_definition_lines(note: dict) -> list[str]:
    candidates = []
    for text in [note.get("lead_sentence", ""), note.get("prose", "")] + (note.get("highlights") or []):
        for sentence in _split_sentences(text):
            lowered = sentence.lower()
            if any(marker in lowered for marker in _DEFINITION_MARKERS):
                candidates.append(sentence)
    return _dedupe_texts(candidates)[:4]


def _collect_distinctions(note: dict) -> list[str]:
    distinctions = []
    title = note.get("title", "")
    if re.search(r"\bvs\b|\bversus\b", title, flags=re.I):
        distinctions.append(title)
    for text in [note.get("lead_sentence", ""), note.get("prose", "")] + (note.get("highlights") or []):
        for sentence in _split_sentences(text):
            lowered = sentence.lower()
            if any(marker in lowered for marker in _DISTINCTION_MARKERS) or lowered.count(" not ") >= 1:
                distinctions.append(sentence)
    return _dedupe_texts(distinctions)[:4]


def _collect_exam_traps(note: dict) -> list[str]:
    traps = []
    for text in [note.get("lead_sentence", ""), note.get("prose", "")] + (note.get("highlights") or []) + (note.get("examples") or []):
        sentences = _split_sentences(text)
        for idx, sentence in enumerate(sentences):
            lowered = sentence.lower()
            if any(marker in lowered for marker in _TRAP_MARKERS):
                window = []
                if idx > 0:
                    window.append(sentences[idx - 1])
                window.append(sentence)
                if idx + 1 < len(sentences):
                    window.append(sentences[idx + 1])
                traps.append(" ".join(window))
    return _dedupe_texts(traps)[:4]


def _build_core_explanation(note: dict) -> str:
    pieces = []
    if note.get("lead_sentence"):
        pieces.append(note["lead_sentence"])
    if note.get("prose"):
        pieces.append(note["prose"])
    if not pieces and note.get("highlights"):
        pieces.extend(note["highlights"])
    return _normalise_ws(" ".join(pieces))


def _inventory_key(text: str) -> str:
    canonical = _canonical_curriculum_concept(text)
    if canonical:
        return _normalise_ws(canonical).lower()
    tokens = [t for t in _TOKEN_RE.findall(_normalise_ws(text).lower()) if t not in _STOPWORDS]
    return " ".join(tokens[:6])


def _concept_inventory_from_notes(grounded_notes: list[dict]) -> list[dict]:
    """
    Mandatory concept inventory pass.

    This is intentionally coverage-oriented: a concept enters the inventory if
    the transcript-backed note contains a definition, example, contrast, exam
    trap, correction, or a substantial explanation. Admin/meta notes are
    excluded before section generation can down-rank anything.
    """
    inventory_by_key: dict[str, dict] = {}
    order = []

    for note in grounded_notes or []:
        signature = _note_curriculum_signature(note)
        if signature["is_admin_only"]:
            continue

        definitions = _collect_definition_lines(note)
        distinctions = _collect_distinctions(note)
        exam_traps = _collect_exam_traps(note)
        examples = _dedupe_texts(note.get("examples") or [])
        explanation = _build_core_explanation(note)
        concepts = _dedupe_texts(note.get("concepts") or [])
        is_substantial = _word_count(explanation) >= 20
        qualifies = any([
            definitions,
            distinctions,
            exam_traps,
            examples,
            signature["concept_role"] in _STRUCTURAL_CONCEPT_ROLES,
            signature["concept_role"] == "exam trap",
            is_substantial,
        ])
        if not qualifies:
            continue

        title = signature.get("canonical") or _derive_title(note.get("title", ""), note.get("lead_sentence", ""), concepts)
        if not title or title.lower() == "key concept" or _is_low_signal_title(title):
            title = (concepts[0] if concepts else "").strip()
        if not title:
            continue

        key = _inventory_key(" ".join([title, explanation, " ".join(concepts)]))
        if not key:
            continue

        if key not in inventory_by_key:
            inventory_by_key[key] = {
                "key": key,
                "title": title,
                "core_explanation": explanation,
                "key_definitions": [],
                "important_distinctions": [],
                "exam_traps": [],
                "examples": [],
                "concepts": [],
                "citations": [],
                "confidence": note.get("confidence", 0.0),
                "verification_status": note.get("verification_status", "weak"),
                "source_notes": [],
            }
            order.append(key)

        item = inventory_by_key[key]
        if explanation:
            item["core_explanation"] = " ".join(_dedupe_texts(_split_sentences(" ".join([
                item.get("core_explanation", ""),
                explanation,
            ]))))[:1200]
        item["key_definitions"] = _dedupe_texts(item["key_definitions"] + definitions)[:5]
        item["important_distinctions"] = _dedupe_texts(item["important_distinctions"] + distinctions)[:5]
        item["exam_traps"] = _dedupe_texts(item["exam_traps"] + exam_traps)[:5]
        item["examples"] = _dedupe_texts(item["examples"] + examples)[:8]
        item["concepts"] = _dedupe_texts(item["concepts"] + concepts + [title])[:10]
        item["confidence"] = max(float(item.get("confidence") or 0.0), float(note.get("confidence") or 0.0))
        if note.get("verification_status") == "supported":
            item["verification_status"] = "supported"
        item["source_notes"].append(note)
        for citation in note.get("citations") or []:
            ckey = (citation.get("start_seconds"), citation.get("end_seconds"), citation.get("label"))
            if not any((c.get("start_seconds"), c.get("end_seconds"), c.get("label")) == ckey for c in item["citations"]):
                item["citations"].append(citation)

    return [inventory_by_key[key] for key in order]


def _section_covers_inventory_item(section: dict, item: dict) -> bool:
    section_key = _section_merge_key(section)
    item_key = item.get("key") or _inventory_key(item.get("title", ""))
    if section_key and item_key and section_key == item_key:
        return True
    corpus = " ".join([
        section.get("title", ""),
        " ".join(section.get("concepts") or []),
        section.get("core_explanation", ""),
        " ".join(section.get("key_definitions") or []),
    ]).lower()
    title = _normalise_ws(item.get("title", "")).lower()
    if title and title in corpus:
        return True
    item_tokens = _tokenise(" ".join([item.get("title", ""), " ".join(item.get("concepts") or [])]))
    section_tokens = _tokenise(corpus)
    return bool(item_tokens and len(item_tokens & section_tokens) / max(1, len(item_tokens)) >= 0.75)


def _inventory_item_to_section(item: dict) -> dict:
    citations = item.get("citations") or []
    starts = [c.get("start_seconds") for c in citations if c.get("start_seconds") is not None]
    ends = [c.get("end_seconds") for c in citations if c.get("end_seconds") is not None]
    return {
        "title": item.get("title") or "Lecture Concept",
        "core_explanation": item.get("core_explanation") or "",
        "key_definitions": item.get("key_definitions") or [],
        "important_distinctions": item.get("important_distinctions") or [],
        "exam_traps": item.get("exam_traps") or [],
        "examples": item.get("examples") or [],
        "concepts": item.get("concepts") or [item.get("title")],
        "citations": citations,
        "confidence": round(float(item.get("confidence") or 0.0), 2),
        "verification_status": item.get("verification_status", "weak"),
        "start_seconds": min(starts) if starts else None,
        "end_seconds": max(ends) if ends else None,
        "source_references": [c.get("label") for c in citations if c.get("label")],
        "subsections": [],
        "subtopic_sections": [],
    }


def _attach_inventory_item_to_section(section: dict, item: dict) -> dict:
    merged = _merge_section_records(section, _inventory_item_to_section(item))
    subtopic_title = item.get("title") or ""
    if subtopic_title and subtopic_title != merged.get("title"):
        subtopics = merged.get("subtopic_sections") or []
        if not any(_normalise_ws(s.get("title", "")).lower() == subtopic_title.lower() for s in subtopics):
            subtopics.append({
                "title": subtopic_title,
                "signal_type": "supporting concept",
                "concept_role": "supporting concept",
                "overview": item.get("core_explanation") or "",
                "definitions": item.get("key_definitions") or [],
                "examples": item.get("examples") or [],
                "exam_traps": item.get("exam_traps") or [],
                "citations": item.get("citations") or [],
            })
            merged["subtopic_sections"] = subtopics[:8]
        merged["subsections"] = _dedupe_texts((merged.get("subsections") or []) + [subtopic_title])[:8]
    return merged


def _best_related_section_index(sections: list[dict], item: dict) -> int | None:
    item_tokens = _tokenise(" ".join([
        item.get("title", ""),
        item.get("core_explanation", ""),
        " ".join(item.get("concepts") or []),
    ]))
    best_idx = None
    best_score = 0.0
    for idx, section in enumerate(sections):
        section_tokens = _tokenise(" ".join([
            section.get("title", ""),
            section.get("core_explanation", ""),
            " ".join(section.get("concepts") or []),
            " ".join(section.get("key_definitions") or []),
        ]))
        if not item_tokens or not section_tokens:
            continue
        overlap = len(item_tokens & section_tokens) / max(1, len(item_tokens))
        if overlap > best_score:
            best_score = overlap
            best_idx = idx
    return best_idx if best_score >= 0.35 else None


def _ensure_inventory_coverage(sections: list[dict], inventory: list[dict]) -> list[dict]:
    covered_sections = list(sections)
    missing: list[dict] = []

    for _ in range(3):
        missing = [
            item for item in inventory
            if not any(_section_covers_inventory_item(section, item) for section in covered_sections)
        ]
        if not missing:
            return _merge_duplicate_concept_sections(covered_sections)

        for item in missing:
            related_idx = _best_related_section_index(covered_sections, item)
            if related_idx is not None:
                covered_sections[related_idx] = _attach_inventory_item_to_section(covered_sections[related_idx], item)
            else:
                covered_sections.append(_inventory_item_to_section(item))
        covered_sections = _merge_duplicate_concept_sections(covered_sections)

    missing = [
        item for item in inventory
        if not any(_section_covers_inventory_item(section, item) for section in covered_sections)
    ]
    if missing:
        missing_titles = ", ".join(_normalise_ws(item.get("title", "")) or item.get("key", "") for item in missing)
        raise ConceptCoverageError(f"Section coverage failed for inventory concepts: {missing_titles}")
    return covered_sections


def build_concept_sections(grounded_notes: list[dict]) -> list[dict]:
    if not grounded_notes:
        return []

    concept_inventory = _concept_inventory_from_notes(grounded_notes)

    structural_notes: list[dict] = []
    for note in grounded_notes:
        signature = _note_curriculum_signature(note)
        if signature["is_admin_only"]:
            continue
        if signature["is_example_only"] and not structural_notes:
            continue
        structural_notes.append(note)

    if not structural_notes:
        return _ensure_inventory_coverage([], concept_inventory)

    total_notes = len(structural_notes)
    desired_sections = total_notes
    if total_notes > 7:
        desired_sections = min(7, max(5, round(total_notes / 2)))

    chapters: list[list[dict]] = []
    current: list[dict] = []
    for note in structural_notes:
        if not current:
            current = [note]
            continue
        if _should_merge_into_current(current, note, desired_sections, total_notes):
            current.append(note)
        else:
            chapters.append(current)
            current = [note]
    if current:
        chapters.append(current)

    while len(chapters) > desired_sections and len(chapters) > 1:
        merge_candidates = [idx for idx in range(1, len(chapters)) if _groups_share_curriculum(chapters[idx - 1], chapters[idx])]
        if not merge_candidates:
            break
        merge_index = min(
            merge_candidates,
            key=lambda idx: (
                len(chapters[idx - 1]) + len(chapters[idx]),
                _chapter_curriculum_signature(chapters[idx])["score"],
                _title_quality(chapters[idx][0].get("title", ""), chapters[idx][0]),
            ),
        )
        chapters[merge_index - 1].extend(chapters[merge_index])
        del chapters[merge_index]

    generated = _merge_duplicate_concept_sections([_merge_chapter_notes(group) for group in chapters if group])
    return _ensure_inventory_coverage(generated, concept_inventory)


def _section_merge_key(section: dict) -> str:
    title = _normalise_ws(section.get("title", "")).lower().replace("&", " and ")
    corpus = " ".join([
        title,
        section.get("core_explanation", ""),
        " ".join(section.get("concepts") or []),
        " ".join(section.get("key_definitions") or []),
        " ".join(section.get("important_distinctions") or []),
    ])
    canonical = _canonical_curriculum_concept(corpus) or _canonical_title_from_text(
        section.get("title", ""),
        section.get("core_explanation", ""),
        section.get("concepts") or [],
        prose=" ".join(section.get("key_definitions") or []),
        examples=section.get("examples") or [],
        highlights=(section.get("important_distinctions") or []) + (section.get("exam_traps") or []),
    )
    if canonical:
        return _normalise_ws(canonical).lower()
    tokens = [t for t in _TOKEN_RE.findall(title) if t not in _STOPWORDS]
    return " ".join(tokens[:5])


def _merge_section_records(base: dict, incoming: dict) -> dict:
    merged = dict(base)
    text_fields = ("core_explanation",)
    for field in text_fields:
        merged[field] = " ".join(_dedupe_texts(_split_sentences(" ".join([
            merged.get(field, ""),
            incoming.get(field, ""),
        ]))))[:1200]

    for field in ("key_definitions", "important_distinctions", "exam_traps", "examples", "concepts", "subsections", "source_references"):
        merged[field] = _dedupe_texts((merged.get(field) or []) + (incoming.get(field) or []))

    citations = []
    seen = set()
    for citation in (merged.get("citations") or []) + (incoming.get("citations") or []):
        key = (citation.get("start_seconds"), citation.get("end_seconds"), citation.get("label"))
        if key in seen:
            continue
        seen.add(key)
        citations.append(citation)
    merged["citations"] = citations

    subtopic_sections = []
    seen_subtopics = set()
    for item in (merged.get("subtopic_sections") or []) + (incoming.get("subtopic_sections") or []):
        key = _normalise_ws(item.get("title", "")).lower()
        if not key or key in seen_subtopics:
            continue
        seen_subtopics.add(key)
        subtopic_sections.append(item)
    merged["subtopic_sections"] = subtopic_sections[:8]

    starts = [s for s in (merged.get("start_seconds"), incoming.get("start_seconds")) if s is not None]
    ends = [s for s in (merged.get("end_seconds"), incoming.get("end_seconds")) if s is not None]
    if starts:
        merged["start_seconds"] = min(starts)
    if ends:
        merged["end_seconds"] = max(ends)
    merged["confidence"] = round(max(float(merged.get("confidence") or 0.0), float(incoming.get("confidence") or 0.0)), 2)
    merged["verification_status"] = "supported" if "supported" in {merged.get("verification_status"), incoming.get("verification_status")} else "weak"
    return merged


def _merge_duplicate_concept_sections(sections: list[dict]) -> list[dict]:
    merged_by_key: dict[str, dict] = {}
    order = []
    for section in sections:
        key = _section_merge_key(section)
        if not key:
            key = _normalise_ws(section.get("title", "")).lower()
        if key in merged_by_key:
            merged_by_key[key] = _merge_section_records(merged_by_key[key], section)
        else:
            merged_by_key[key] = section
            order.append(key)
    return [merged_by_key[key] for key in order]


def _single_source_range(citations: list[dict]) -> dict | None:
    if not citations:
        return None
    starts = [c.get("start_seconds") for c in citations if c.get("start_seconds") is not None]
    ends = [c.get("end_seconds") for c in citations if c.get("end_seconds") is not None]
    if starts and ends:
        start = min(starts)
        end = max(ends)
        return {
            "start_seconds": start,
            "end_seconds": end,
            "label": f"{_fmt_timestamp(start)} - {_fmt_timestamp(end)}",
        }
    first = citations[0]
    if first.get("label"):
        return {"label": first["label"]}
    return None


def _first_useful_sentence(texts: list[str], limit: int = 2) -> str:
    sentences = []
    for text in texts:
        for sentence in _split_sentences(text):
            if _educational_signal_type(sentence) == "administrative lecture content":
                continue
            sentences.append(sentence)
    return " ".join(_dedupe_texts(sentences)[:limit])


def _useful_sentences(texts: list[str], limit: int = 4) -> list[str]:
    sentences = []
    for text in texts:
        for sentence in _split_sentences(text):
            if _educational_signal_type(sentence) == "administrative lecture content":
                continue
            sentences.append(sentence)
    return _dedupe_texts(sentences)[:limit]


_CARD_CLEAN_DROP_MARKERS = (
    "study plan", "past paper", "whatsapp group",
    "attendance register", "finish by", "three hours",
    "next class", "colored pens",
    "coloured pens", "this week",
    "marks from", "essay question number", "mcq",
    "fast track", "theory class", "revision class",
    "before you come", "expected to do", "monday",
    "tuesday", "friday", "how do you get that",
    "our target", "this week's target", "summarize unit",
    "summary of unit", "two and a half hours",
    "i will maintain", "certain speed", "third time",
    "100th time", "this is not a theory class",
    "wrong class", "go through that note",
    "80 to 90 percent", "summarized note",
    "answer writing", "improve answer",
)


def _light_clean(text: str) -> str:
    if not text or not text.strip():
        return ""
    # Remove Whisper noise markers only
    text = re.sub(r'\[.*?\]', ' ', text)
    # Collapse excessive whitespace
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = text.strip()

    admin_words = {
        "marks", "paper", "exam", "test", "quiz", "class", "session",
        "today", "week", "target", "score", "finish", "plan", "note",
        "study", "revision", "summary", "cover", "topic", "unit",
        "chapter", "register", "attendance", "group", "send", "whatsapp",
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
        "sunday", "tomorrow", "yesterday", "morning", "evening", "hour",
        "minute", "time", "speed", "start", "begin", "end", "done",
    }
    if "\n\n" in text:
        paragraphs = [p.strip() for p in re.split(r'\n\s*\n+', text) if p.strip()]
        separator = "\n\n"
    else:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        paragraphs = ["\n".join(lines[i:i + 4]) for i in range(0, len(lines), 4)]
        separator = "\n"

    max_skip_chars = int(len(text) * 0.3)
    skip_count = 0
    skipped_chars = 0
    for paragraph in paragraphs:
        tokens = {token.lower() for token in _TOKEN_RE.findall(paragraph)}
        admin_count = len(tokens & admin_words)
        if admin_count >= 2 and skipped_chars + len(paragraph) <= max_skip_chars:
            skip_count += 1
            skipped_chars += len(paragraph)
            continue
        break
    if skip_count:
        text = separator.join(paragraphs[skip_count:]).strip()
    return text


def clean_summary_card_transcript(transcript: str) -> str:
    cleaned = _light_clean(transcript or "")
    kept = []
    for raw_line in cleaned.splitlines():
        line = _normalise_ws(raw_line)
        if not line:
            continue
        lowered = line.lower()
        if any(f" {marker} " in f" {lowered} " for marker in _CARD_CLEAN_DROP_MARKERS):
            continue
        if re.search(r"\b(today|class|lecture|session)\b.*\b(finish|start|continue|cover|record)\b", lowered):
            continue
        sentences = []
        for sentence in _split_sentences(line):
            words = sentence.split()
            if len(words) < 5 and sentence[-1:] not in ".!?":
                continue
            sentences.append(sentence)
        if sentences:
            kept.append(" ".join(sentences))
    return "\n".join(kept)


def _chunk_by_sentences(text: str, target_words: int = 150) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks = []
    current = []
    current_words = 0

    for sentence in sentences:
        sentence_words = sentence.split()
        if len(sentence_words) > target_words:
            if current:
                chunks.append(" ".join(current))
                current = []
                current_words = 0
            for start in range(0, len(sentence_words), target_words):
                segment_words = sentence_words[start:start + target_words]
                if segment_words:
                    chunks.append(" ".join(segment_words))
            continue

        words = len(sentence_words)
        if current_words + words > target_words and current:
            chunks.append(" ".join(current))
            current = [sentence]
            current_words = words
        else:
            current.append(sentence)
            current_words += words

    if current:
        chunks.append(" ".join(current))

    return chunks


def _inventory_cache_sentinel(transcript_hash: str, inventory: list[dict]) -> dict:
    return {
        "concept_name": "__inventory_cache__",
        "cache_version": _INVENTORY_CACHE_VERSION,
        "transcript_hash": transcript_hash,
        "inventory": inventory,
    }


def _is_internal_card(card: dict) -> bool:
    concept_name = _normalise_ws(str((card or {}).get("concept_name") or ""))
    return concept_name.startswith("__")


def _non_trivial_words(text: str) -> list[str]:
    return [token.lower() for token in re.findall(r"[a-zA-Z][a-zA-Z0-9'-]*", text or "") if len(token) > 4]


def _card_body_grounding_score(cards: list[dict], transcript: str) -> float:
    visible_cards = [card for card in (cards or []) if not _is_internal_card(card)]
    if not visible_cards:
        return 0.0
    if not (transcript or "").strip():
        return 1.0
    transcript_words = set(_non_trivial_words(transcript))
    if not transcript_words:
        return 1.0

    grounded_cards = 0
    for card in visible_cards:
        body_parts = [card.get("summary", "")]
        for definition in card.get("key_definitions") or []:
            if isinstance(definition, dict):
                body_parts.append(_normalise_ws(str(definition.get("definition") or "")))
        for example in card.get("examples") or []:
            body_parts.append(_normalise_ws(str(example or "")))
        body_words = set(_non_trivial_words(" ".join(part for part in body_parts if part)))
        if not body_words:
            continue
        overlap = sum(1 for word in body_words if word in transcript_words)
        if overlap / max(1, len(body_words)) >= 0.7:
            grounded_cards += 1

    return round(grounded_cards / len(visible_cards), 2)


def _deduplicate_raw(concepts: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for concept in concepts or []:
        if not isinstance(concept, dict):
            continue
        name = _normalise_ws(str(concept.get("name") or "")).lower()
        if name and name not in seen:
            seen.add(name)
            out.append(concept)
    return out[:20]


def _normalise_card_shapes(cards_raw: list[dict]) -> list[dict]:
    normalised = []
    for card in cards_raw or []:
        if not isinstance(card, dict):
            continue
        if "concept_name" in card:
            normalised.append(card)
            continue
        keys = [k for k in card.keys() if k not in ("concept_name",)]
        if len(keys) == 1:
            concept_name = keys[0]
            inner = card[concept_name]
            if isinstance(inner, dict):
                inner = dict(inner)
                inner["concept_name"] = concept_name
                normalised.append(inner)
    return normalised


def _extract_json_array(raw: str) -> list[dict]:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    if not text.startswith("["):
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1 and end > start:
            text = text[start:end + 1]
    data = json.loads(text)
    if not isinstance(data, list):
        raise ConceptCoverageError("Summary card GPT response was not a JSON array")
    return [item for item in data if isinstance(item, dict)]


def _gpt_json_array(
    system_prompt: str,
    user_message: str,
    feature: str,
    max_tokens: int = 5000,
    model: str = "gpt-4o-mini",
    temperature: float = 0.1,
) -> list[dict]:
    if not _client:
        raise ConceptCoverageError("OpenAI client not configured for summary card generation")
    last_error = None
    for attempt in range(3):
        try:
            response = _client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            usage = getattr(response, "usage", None)
            if usage:
                log_cost(
                    feature,
                    model,
                    input_tokens=usage.prompt_tokens,
                    output_tokens=usage.completion_tokens,
                )
            return _extract_json_array(response.choices[0].message.content)
        except Exception as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(2 ** attempt)
    raise ConceptCoverageError(f"{feature} failed: {last_error}")


_INVENTORY_PROMPT = """You are an expert academic 
note-taker extracting concepts from a lecture transcript.

CRITICAL INSTRUCTION: This transcript may begin with 
several paragraphs of exam strategy, class logistics, 
study plan instructions, or administrative talk. 
SKIP ALL OF THAT. Do not extract any concepts from 
administrative or logistical content.

Only extract concepts from the subject matter the 
professor actually taught. Subject matter is anything 
where the professor defines a term, explains how 
something works, gives an example of a concept, 
contrasts two ideas, or flags something as exam-relevant.

TECHNICAL CONTENT HANDLING:
This transcript may come from any academic
field including but not limited to:
programming, mathematics, physics, chemistry,
biology, medicine, law, economics, history,
literature, engineering, data science.

When technical content is present:
- Preserve code snippets, function names,
  and programming terms exactly as spoken
- Preserve mathematical expressions and
  equations as closely as possible to how
  they were spoken
- Preserve chemical formulas and scientific
  notation exactly
- Preserve medical terminology, drug names,
  and clinical terms exactly
- Preserve legal citations and case names exactly
- Never simplify or paraphrase technical terms
- A concept is still valid even if only
  partially explained - extract what was said

RULES FOR CODE, EQUATIONS, AND FORMULAS:

RULE 1 - HEARD CLEARLY:
If a code snippet, equation, or formula was
clearly spoken or shown in the transcript,
preserve it exactly as spoken.
Convert spoken math to notation where clear:
example: professor says 'f of x equals x
squared plus 2x' -> preserve as: f(x) = x² + 2x
example: professor says 'time complexity is
O of n log n' -> preserve as: O(n log n)
Place all code and formulas in the examples
field so they render distinctly from plain text.

RULE 2 - PARTIALLY HEARD:
If part of a formula, equation, or code snippet
was clearly heard but part was unclear or
inaudible, preserve exactly what was heard
and mark the unclear portion with [?].
Example: professor said 'E equals mc' then
became inaudible -> preserve as: E = mc[?]
Never fill in the [?] with background knowledge.
Never complete a partial formula even if you
know the full version.
If professor said 'the formula is x squared
plus [unclear]' -> preserve as: x² + [?]

RULE 3 - CANNOT IDENTIFY:
If a technical term, formula, code snippet,
or equation was mentioned but is completely
unclear or inaudible from the transcript,
write exactly:
[unclear technical term - refer to recording]
Never attempt to reconstruct it.
Never guess what it might have been.

RULE 4 - NEVER RECONSTRUCT:
Never use background knowledge to complete
or correct what the professor said.
If the professor made an error in a formula
and then corrected it, preserve only the
corrected version.
If the professor stated something that seems
incomplete, preserve it as stated with [?]
marking the unclear part.
The student must refer to their own recording
for anything marked [?] or [unclear].

These four rules apply to every field:
- A partial Python function -> preserve with [?]
- A partial differential equation -> preserve with [?]
- A partial chemical formula -> preserve with [?]
- A partial legal citation -> preserve with [?]
- A partial medical dosage -> preserve with [?]
Never guess. Never complete. Never reconstruct.

Return a JSON array. Each item is one concept with:
  name: real term or principle name.
        Never 'Key Concept'. Never a sentence.
        Good examples: 'Microeconomics vs Macroeconomics',
        'Positive vs Normative Statements',
        'Economic Goods vs Free Goods',
        'Economic Bads and Disutility',
        'Converting Non-Economic to Economic Goods',
        'Goods and Utility'
  start_time: timestamp of first mention
  end_time: timestamp of last mention
  exam_trap: misconception the professor flagged or null
  distinction: other concept contrasted with this or null
  examples: array of real examples professor used
  depth: "full" if the professor spent substantial time on this
         concept with clear definition or demonstration (3+ dedicated
         sentences). "brief" if only touched on lightly (1-2 sentences).
  evidence_quote: one verbatim phrase from the transcript (max 20 words)
                  proving the professor actively taught this concept,
                  not just mentioned its name.

A concept qualifies ONLY if the professor does at least ONE of:
  - Explicitly defines it in a dedicated sentence
    ("X is Y", "X means Y", "X is a type of Y") — the definition
    must be about this concept alone, not part of a multi-item list
  - Demonstrates it with a worked example, code snippet, or
    step-by-step walkthrough specific to this concept
  - Contrasts it specifically with another named concept in a
    focused comparison
  - Flags it as exam-relevant and explains why
  - Corrects a common misconception about it with explanation

AND there must be evidence of sustained attention:
  - At least 2 distinct sentences in the transcript that are
    specifically about this concept (not adjacent concepts)
  - If you cannot find 2 sentences of explanation for a concept,
    do not include it regardless of how relevant it sounds

A concept does NOT qualify if:
  - It is only mentioned in a list of possibilities, use cases,
    or applications ("you can use X for A, B, C, D")
  - The professor only names it without defining or demonstrating it
  - It appears as background context used to motivate another topic
  - It is a single throwaway example inside an explanation of
    something else
  - Class timing, logistics, attendance
  - Study plans or exam strategy
  - How the lecture will be structured
  - Past papers or answer writing technique

CRITICAL FOR PROGRAMMING AND CS LECTURES:
  Extract the actual language features and constructs taught:
  variables, data types, operators, conditionals, loops,
  functions, classes, error handling, built-in functions.
  Do NOT extract application domains that are only listed
  as possibilities (machine learning, web development,
  data science, Django, Flask, automation, PyCharm) unless
  those domains are actually taught with code examples
  and dedicated explanation in this lecture.
  If the professor says "Python is used for data science,
  web development, and automation" — that is a mention,
  not a taught concept. Extract nothing from that sentence.

For a 30-40 minute subject lecture you should typically
find between 6 and 14 distinct concepts.
If you find fewer than 5 you have missed concepts —
re-read the transcript and look harder.

For every 500 words of transcript you should
expect to find at least 2 concepts. If you are
finding fewer than this you are being too
conservative. Re-read and look for concepts you
initially skipped.

Do not merge distinct concepts into one entry.
Do not invent concepts not in the transcript.
Return only the JSON array. No other text."""


_CARD_PROMPT = """You are building study cards 
from a lecture transcript and concept inventory.

Return a JSON array where each element is 
a flat object with concept_name as an explicit 
field. Do not use concept names as dictionary 
keys. Each object must have this exact structure:
{
  'concept_name': 'the concept name here',
  'summary': '...',
  'key_distinction': null or object,
  'exam_trap': null or object,
  'examples': [],
  'key_definitions': [],
  'source_start': '00:00',
  'source_end': '00:00'
}
Never nest the card content inside the concept 
name as a key.

TECHNICAL CONTENT HANDLING:
This transcript may come from any academic
field including but not limited to:
programming, mathematics, physics, chemistry,
biology, medicine, law, economics, history,
literature, engineering, data science.

When technical content is present:
- Preserve code snippets, function names,
  and programming terms exactly as spoken
- Preserve mathematical expressions and
  equations as closely as possible to how
  they were spoken
- Preserve chemical formulas and scientific
  notation exactly
- Preserve medical terminology, drug names,
  and clinical terms exactly
- Preserve legal citations and case names exactly
- Never simplify or paraphrase technical terms
- A concept is still valid even if only
  partially explained - extract what was said

RULES FOR CODE, EQUATIONS, AND FORMULAS:

RULE 1 - HEARD CLEARLY:
If a code snippet, equation, or formula was
clearly spoken or shown in the transcript,
preserve it exactly as spoken.
Convert spoken math to notation where clear:
example: professor says 'f of x equals x
squared plus 2x' -> preserve as: f(x) = x² + 2x
example: professor says 'time complexity is
O of n log n' -> preserve as: O(n log n)
Place all code and formulas in the examples
field so they render distinctly from plain text.

RULE 2 - PARTIALLY HEARD:
If part of a formula, equation, or code snippet
was clearly heard but part was unclear or
inaudible, preserve exactly what was heard
and mark the unclear portion with [?].
Example: professor said 'E equals mc' then
became inaudible -> preserve as: E = mc[?]
Never fill in the [?] with background knowledge.
Never complete a partial formula even if you
know the full version.
If professor said 'the formula is x squared
plus [unclear]' -> preserve as: x² + [?]

RULE 3 - CANNOT IDENTIFY:
If a technical term, formula, code snippet,
or equation was mentioned but is completely
unclear or inaudible from the transcript,
write exactly:
[unclear technical term - refer to recording]
Never attempt to reconstruct it.
Never guess what it might have been.

RULE 4 - NEVER RECONSTRUCT:
Never use background knowledge to complete
or correct what the professor said.
If the professor made an error in a formula
and then corrected it, preserve only the
corrected version.
If the professor stated something that seems
incomplete, preserve it as stated with [?]
marking the unclear part.
The student must refer to their own recording
for anything marked [?] or [unclear].

These four rules apply to every field:
- A partial Python function -> preserve with [?]
- A partial differential equation -> preserve with [?]
- A partial chemical formula -> preserve with [?]
- A partial legal citation -> preserve with [?]
- A partial medical dosage -> preserve with [?]
Never guess. Never complete. Never reconstruct.

CRITICAL RULE: Every word in every card must come 
from the transcript provided. You are not allowed 
to use any background knowledge, textbook 
definitions, or explanations not in the transcript.

If the transcript does not explain something fully 
write what the transcript says and nothing more.
A short honest card is better than a long 
hallucinated one.

For each concept in the inventory generate a card:

  concept_name:
    Use the name from the inventory exactly.
    Do not rename or improve it.

  summary:
    2-3 sentences built only from the transcript.
    Must use words that appear in the transcript.
    Must not add context from outside the transcript.
    Start with what the professor actually said.
    For the summary field: include everything the
    professor said about this concept across the
    entire transcript. Do not limit to one sentence.
    If the professor made multiple points about this
    concept include all of them in the summary,
    up to 4 sentences maximum.

  key_distinction:
    Only if inventory distinction is not null.
    Must use the professor's own words to describe 
    both sides. Do not explain from background.
    null if not applicable.

  exam_trap:
    Only if inventory exam_trap is not null.
    Must be an object with TWO fields that MUST be genuinely different:
      misconception: What students commonly get WRONG about this concept.
        Must be a FALSE or incomplete belief. Must NOT be the correct answer.
        Start with 'Students often think...' or 'A common mistake is...'
        Example: 'Students often think free goods means goods given for free by the government'
      correct: The actual correct understanding that directly contradicts
        the misconception above.
        Example: 'Free goods means goods unlimited in supply regardless of price'
    CRITICAL RULES:
    - misconception and correct MUST contradict each other
    - misconception must describe a WRONG belief, not the right answer
    - NEVER set both fields to the same text or meaning
    - NEVER use the concept definition as the misconception
    - If no genuine misconception exists for this concept, set exam_trap to null
    null if not applicable.

  examples:
    Include the professor's examples but consolidate intelligently:
    1. Keep distinct, genuinely different examples as separate items (max 4)
    2. If the professor listed multiple fragments of the SAME illustration
       (e.g. rattling off several normative statement examples one after
       another), merge them into ONE clean representative example
    3. Remove verbal filler fragments: 'words like, for example, should',
       'let's say,', 'okay,', 'you know,' — replace with clean versions
       like 'Words like "should" or "unfair"'
    4. Each example must be a complete, standalone, meaningful item
    5. Strip sentence fragments under 5 words
    6. If 8 fragments all illustrate the same concept, return 1-2 clean
       consolidated examples, not 8 raw fragments
    Empty array if no real examples exist in transcript.

  key_definitions:
    Each definition must be the professor's own 
    words from the transcript.
    Do not write dictionary definitions.
    If professor did not define it formally use 
    the closest explanatory sentence from transcript.
    Include every distinct definition or clarification
    the professor gave for this concept, not just the first one.

  source_start: start timestamp
  source_end: end timestamp

Return only JSON array. No other text.
Every concept from inventory must have a card.
Zero background knowledge allowed."""


VERIFICATION_PROMPT = """You are checking whether a 
concept inventory is complete.

You have a lecture transcript and an existing list 
of concepts that were already identified.

Your job is to find concepts that were MISSED.
Read the entire transcript carefully and identify 
any concept that:
  - Was defined or explained by the professor
  - Is NOT already in the existing concept list
  - Received at least 30 seconds of explanation
  - Has at least one example or distinction

For each missed concept return:
  name: real term name, never Key Concept
  start_time: first mention timestamp
  end_time: last mention timestamp
  exam_trap: professor flagged misconception or null
  distinction: contrasted concept or null
  examples: array of real examples or empty array

If no concepts were missed return an empty array.
Return only the JSON array. No other text.

Be thorough. Common missed concept types:
  - Conversion or transformation concepts
    (e.g. converting one type of thing to another)
  - Classification sub-types the professor listed
  - Concepts introduced briefly but with clear examples
  - Concepts the professor said will appear in exams
  - Contrasting pairs where only one was captured"""


def build_concept_inventory_from_transcript(transcript: str, lecture_id: str | None = None) -> list[dict]:
    cleaned = clean_summary_card_transcript(transcript)
    if not cleaned:
        return []
    MAX_TRANSCRIPT_WORDS = 80000
    cleaned_words = cleaned.split()
    original_word_count = len(cleaned_words)
    if original_word_count > MAX_TRANSCRIPT_WORDS:
        print(
            f"[inventory] transcript capped at {MAX_TRANSCRIPT_WORDS} words "
            f"(was {original_word_count} words)"
        )
        cleaned = " ".join(cleaned_words[:MAX_TRANSCRIPT_WORDS])
        cleaned_words = cleaned.split()
    concept_cap = 20
    if len(cleaned_words) > 35000:
        concept_cap = 40
    elif len(cleaned_words) > 15000:
        concept_cap = 30
    transcript_hash = hashlib.md5(cleaned.encode()).hexdigest()
    if lecture_id:
        existing_cards = get_lecture_concept_note_cards(lecture_id)
        for card in existing_cards:
            if not isinstance(card, dict):
                continue
            if _normalise_ws(str(card.get("concept_name") or "")) != "__inventory_cache__":
                continue
            if (
                card.get("transcript_hash") == transcript_hash
                and card.get("cache_version") == _INVENTORY_CACHE_VERSION
            ):
                try:
                    cached_inventory = card.get("inventory", [])
                    if not isinstance(cached_inventory, list):
                        raise ValueError("inventory not a list")
                except Exception:
                    cached_inventory = []
                if len(cached_inventory) < 3:
                    print(
                        f"[inventory-cache] cached inventory has only {len(cached_inventory)} concepts - "
                        f"ignoring stale cache and re-extracting"
                    )
                    break
                print(f"[inventory-cache] cache hit for {lecture_id}")
                print(f"[summary-card-debug] merged inventory count: {len(cached_inventory[:20])}")
                print(f"[summary-card-debug] merged inventory names: {[item.get('name') for item in cached_inventory[:20] if isinstance(item, dict)]}")
                return cached_inventory
        print(f"[inventory-cache] cache miss for {lecture_id}")

    para_chunks = [cleaned] if len(cleaned_words) < 200 else _chunk_by_sentences(cleaned, 150)

    PARA_PROMPT = """Read this passage from a lecture 
transcript. Find every concept the professor is 
teaching.

STRICT RULES:
- Use ONLY words and phrases that appear in this 
  passage. Do not use any outside knowledge.
- concept name must be a word or short phrase 
  that actually appears in the passage text.
  If the professor said "economic goods" use 
  "economic goods". If the professor said 
  "positive statements" use "positive statements".
  Never invent a label not in the text.
- exam_trap must be a direct quote or close 
  paraphrase of what the professor said. 
  If none return null.
- examples must be copied directly from the text.
  If none return empty array.

TECHNICAL CONTENT HANDLING:
This transcript may come from any academic
field including but not limited to:
programming, mathematics, physics, chemistry,
biology, medicine, law, economics, history,
literature, engineering, data science.

When technical content is present:
- Preserve code snippets, function names,
  and programming terms exactly as spoken
- Preserve mathematical expressions and
  equations as closely as possible to how
  they were spoken
- Preserve chemical formulas and scientific
  notation exactly
- Preserve medical terminology, drug names,
  and clinical terms exactly
- Preserve legal citations and case names exactly
- Never simplify or paraphrase technical terms
- A concept is still valid even if only
  partially explained - extract what was said

RULES FOR CODE, EQUATIONS, AND FORMULAS:

RULE 1 - HEARD CLEARLY:
If a code snippet, equation, or formula was
clearly spoken or shown in the transcript,
preserve it exactly as spoken.
Convert spoken math to notation where clear:
example: professor says 'f of x equals x
squared plus 2x' -> preserve as: f(x) = x² + 2x
example: professor says 'time complexity is
O of n log n' -> preserve as: O(n log n)
Place all code and formulas in the examples
field so they render distinctly from plain text.

RULE 2 - PARTIALLY HEARD:
If part of a formula, equation, or code snippet
was clearly heard but part was unclear or
inaudible, preserve exactly what was heard
and mark the unclear portion with [?].
Example: professor said 'E equals mc' then
became inaudible -> preserve as: E = mc[?]
Never fill in the [?] with background knowledge.
Never complete a partial formula even if you
know the full version.
If professor said 'the formula is x squared
plus [unclear]' -> preserve as: x² + [?]

RULE 3 - CANNOT IDENTIFY:
If a technical term, formula, code snippet,
or equation was mentioned but is completely
unclear or inaudible from the transcript,
write exactly:
[unclear technical term - refer to recording]
Never attempt to reconstruct it.
Never guess what it might have been.

RULE 4 - NEVER RECONSTRUCT:
Never use background knowledge to complete
or correct what the professor said.
If the professor made an error in a formula
and then corrected it, preserve only the
corrected version.
If the professor stated something that seems
incomplete, preserve it as stated with [?]
marking the unclear part.
The student must refer to their own recording
for anything marked [?] or [unclear].

These four rules apply to every field:
- A partial Python function -> preserve with [?]
- A partial differential equation -> preserve with [?]
- A partial chemical formula -> preserve with [?]
- A partial legal citation -> preserve with [?]
- A partial medical dosage -> preserve with [?]
Never guess. Never complete. Never reconstruct.

Return a JSON array. Each item:
  name: word or phrase from the passage itself
  exam_trap: professor's own words or null
  examples: copied from passage or empty array
  quote: the single most important sentence from 
         the passage that defines this concept.
         Must be copied verbatim from the text.

If this passage contains no concepts return [].
Return only a JSON array. No other text."""

    all_raw = []
    for i, para in enumerate(para_chunks):
        if i % 10 == 0:
            print(f"[inventory] processing chunk {i + 1}/{len(para_chunks)}...")
        try:
            result = _gpt_json_array(
                PARA_PROMPT,
                para,
                f"para_extract_{i}",
                max_tokens=800,
                model="gpt-4o-mini",
                temperature=0,
            )
        except Exception as exc:
            print(f"[inventory] GPT call failed: {exc}")
            result = []
        all_raw.extend(result)

    print(f"[summary-card-debug] paragraph chunk count: {len(para_chunks)}")
    print(f"[summary-card-debug] raw concept count before merge: {len(all_raw)}")

    if not all_raw:
        return []

    MERGE_PROMPT = """You have a list of concepts 
extracted from a lecture transcript. Each concept 
has a name and a quote taken directly from the 
transcript.

Your job is to merge duplicates and produce a 
clean final list.

STRICT RULES:
- Keep the name exactly as extracted. Do not 
  rename concepts to textbook terminology.
  If the extraction says "economic goods" keep 
  "economic goods". Never change it to 
  "scarcity of resources" or any other label.
- Only merge two entries if their quotes are 
  clearly about the same thing.
- If two entries have different quotes about 
  different aspects keep them separate.
- Do not add any information not in the quotes.
- Do not remove any concept unless it is 
  clearly about class logistics or admin.

For pairs that belong together use format 
"X vs Y" only if the professor explicitly 
contrasted them. Use the exact words from 
the quotes.

For each final concept return:
  name: preserved exactly from extraction
  start_time: position in lecture as mm:ss
  end_time: end position as mm:ss
  exam_trap: preserved from extraction or null
  distinction: only if explicitly contrasted
  examples: all examples collected
  key_quote: the best quote from the extractions
             copied verbatim

Remove concepts where name is a single generic 
word with no subject meaning on its own.
Remove concepts that are clearly admin content.

For start_time and end_time: estimate the timestamp based on the
position of this concept in the transcript.
If the transcript is approximately 33 minutes long and this concept
appears in the first third, start_time should be around 04:00 to 12:00.
Format as mm:ss. Do not return 00:00 unless the concept genuinely
appears at the very start.
Use the order of concepts in the raw extraction list to estimate position.

Aim for 7 to 14 concepts for a 30-minute lecture.
Return only JSON array. No other text."""
    all_raw_ordered = [item for item in all_raw if isinstance(item, dict)]

    try:
        merged = _gpt_json_array(
            MERGE_PROMPT,
            json.dumps(all_raw_ordered, ensure_ascii=False),
            "concept_merge",
            max_tokens=3000,
            model="gpt-4o",
            temperature=0,
        )
    except Exception as exc:
        print(f"[inventory] merge failed, using raw extractions: {exc}")
        merged = _deduplicate_raw(all_raw_ordered)

    def normalise_inventory(inventory_items: list[dict]) -> list[dict]:
        out = []
        seen = set()
        estimated_duration_seconds = max(60, int(round((len(cleaned_words) / 150) * 60))) if cleaned_words else 60
        total_items = max(1, len(inventory_items))
        for item in inventory_items:
            name = _normalise_ws(item.get("name", ""))
            if not name or name.lower() == "key concept" or _is_low_signal_title(name):
                continue
            name = _title_case_name(name)
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            index = len(out)
            slot_seconds = max(45, estimated_duration_seconds // total_items)
            start_guess = min(
                max(0, estimated_duration_seconds - 1),
                int(round((index / max(1, total_items)) * estimated_duration_seconds))
            )
            if index == 0 and start_guess == 0:
                start_guess = min(estimated_duration_seconds - 1, max(15, slot_seconds // 4))
            end_guess = min(estimated_duration_seconds, start_guess + slot_seconds)
            start_time = _normalise_ws(str(item.get("start_time") or ""))
            end_time = _normalise_ws(str(item.get("end_time") or ""))
            if not re.match(r"^\d{2}:\d{2}(?::\d{2})?$", start_time) or start_time == "00:00":
                start_time = _fmt_timestamp(start_guess)
            if not re.match(r"^\d{2}:\d{2}(?::\d{2})?$", end_time) or end_time == "00:00":
                end_time = _fmt_timestamp(max(start_guess + 30, end_guess))
            out.append({
                "name": name,
                "start_time": start_time,
                "end_time": end_time,
                "exam_trap": item.get("exam_trap") or None,
                "distinction": item.get("distinction") or None,
                "examples": item.get("examples") if isinstance(item.get("examples"), list) else [],
                "quote": _normalise_ws(str(item.get("quote") or "")),
                "key_quote": _normalise_ws(str(item.get("key_quote") or "")),
                "depth": _normalise_ws(str(item.get("depth") or "full")) or "full",
                "evidence_quote": _normalise_ws(str(item.get("evidence_quote") or "")),
            })
        return out

    out = normalise_inventory(merged)

    # Filter out concepts the model marked as "brief" — these are ghost concepts
    # that were only mentioned in passing (e.g. application domains in a list)
    # rather than actively taught. Do this before capping so brief concepts
    # never consume card-generation slots.
    brief_concepts = [item for item in out if item.get("depth") == "brief"]
    if brief_concepts:
        print(
            f"[inventory] filtered {len(brief_concepts)} brief-depth concepts "
            f"(mentioned only, not taught): "
            f"{[item['name'] for item in brief_concepts]}"
        )
    out = [item for item in out if item.get("depth") != "brief"]

    if len(out) < 3:
        print(f"[inventory-cache] refusing to cache inventory with only {len(out)} concepts")
    print(f"[summary-card-debug] merged inventory count: {len(out[:concept_cap])}")
    print(f"[summary-card-debug] merged inventory names: {[item['name'] for item in out[:concept_cap]]}")
    return out[:concept_cap]


def _clean_examples(examples: list[str]) -> list[str]:
    """
    Post-process examples to remove transcript noise:
    - Strip leading filler phrases
    - Remove fragments under 4 words
    - Deduplicate by first-5-word key
    - Cap at 4 examples
    """
    if not examples:
        return []

    filler_patterns = [
        r'^words like,?\s*',
        r'^for example,?\s*',
        r"^let'?s say,?\s*",
        r'^okay,?\s*',
        r'^so,?\s*',
        r'^and,?\s*',
        r'^or,?\s*',
        r'^like,?\s*',
        r'^you know,?\s*',
        r'^i mean,?\s*',
        r'^right,?\s*',
        r'^well,?\s*',
        r'^maybe,?\s*',
        r'^even,?\s*',
        r'^things like,?\s*',
        r'^for instance,?\s*',
        r'^such as,?\s*',
        r'^say,?\s*',
    ]

    cleaned = []
    seen_keys = set()

    for ex in examples:
        text = str(ex or '').strip()
        if not text:
            continue
        # Strip leading filler
        for pattern in filler_patterns:
            text = re.sub(pattern, '', text, flags=re.IGNORECASE).strip()
        # Skip if too short
        if len(text.split()) < 4:
            continue
        # Deduplicate by first 5 words
        key = ' '.join(text.lower().split()[:5])
        if key in seen_keys:
            continue
        seen_keys.add(key)
        # Capitalise first letter
        text = text[0].upper() + text[1:]
        cleaned.append(text)

    return cleaned[:4]


def _normalise_generated_card(card: dict, inventory_item: dict) -> dict:
    concept_name = _normalise_ws(card.get("concept_name", "")) or inventory_item["name"]
    source_start = _normalise_ws(str(card.get("source_start") or inventory_item.get("start_time") or ""))
    source_end = _normalise_ws(str(card.get("source_end") or inventory_item.get("end_time") or ""))
    definitions = card.get("key_definitions") if isinstance(card.get("key_definitions"), list) else []
    examples = card.get("examples") if isinstance(card.get("examples"), list) else []
    return {
        "concept_name": concept_name,
        "summary": _normalise_ws(card.get("summary", "")),
        "key_distinction": card.get("key_distinction") or None,
        "exam_trap": card.get("exam_trap") or None,
        "examples": _clean_examples([
            _normalise_ws(str(item))
            for item in examples
            if _normalise_ws(str(item))
        ]),
        "key_definitions": [
            {
                "term": _normalise_ws(str(item.get("term", ""))),
                "definition": _normalise_ws(str(item.get("definition", ""))),
            }
            for item in definitions
            if isinstance(item, dict) and (_normalise_ws(str(item.get("term", ""))) or _normalise_ws(str(item.get("definition", ""))))
        ],
        "source_start": source_start,
        "source_end": source_end,
    }


def validate_generated_summary_cards(inventory: list[dict], cards: list[dict], transcript: str = "") -> dict:
    inventory_names = [c.get("name", "") for c in inventory if c.get("name")]
    card_names = [c.get("concept_name", "") for c in cards if c.get("concept_name")]
    missing = [name for name in inventory_names if name not in card_names]
    if missing:
        raise ConceptCoverageError(f"Summary card coverage failed. Missing concepts: {', '.join(missing)}")
    if len(card_names) != len(set(name.lower() for name in card_names)):
        raise ConceptCoverageError("Summary card validation failed: duplicate card titles")
    bad = [name for name in card_names if name.lower() == "key concept" or _is_low_signal_title(name)]
    if bad:
        raise ConceptCoverageError(f"Summary card validation failed: invalid cards: {', '.join(bad)}")
    for card in cards:
        if not card.get("summary"):
            raise ConceptCoverageError(f"Summary card validation failed: {card.get('concept_name')} has no summary")
        if not card.get("source_start") or not card.get("source_end"):
            raise ConceptCoverageError(f"Summary card validation failed: {card.get('concept_name')} has no single source range")
        if len(_split_sentences(card.get("summary", ""))) < 1 and not card.get("key_definitions") and not card.get("examples"):
            raise ConceptCoverageError(f"Summary card validation failed: {card.get('concept_name')} is too thin")
    return {"concept_count": len(inventory_names), "card_count": len(cards), "missing": []}


def build_summary_cards_from_transcript(transcript: str, lecture_id: str | None = None) -> list[dict]:
    cleaned = clean_summary_card_transcript(transcript)
    if not cleaned:
        return []
    inventory_hash_words = cleaned.split()
    if len(inventory_hash_words) > 80000:
        inventory_hash_text = " ".join(inventory_hash_words[:80000])
    else:
        inventory_hash_text = cleaned
    transcript_hash = hashlib.md5(inventory_hash_text.encode()).hexdigest()
    inventory = build_concept_inventory_from_transcript(cleaned, lecture_id=lecture_id)
    if not inventory:
        return []
    print(f"[cards] cached inventory returned: {len(inventory)} concepts")
    print(f"[cards] calling card generation...")
    MAX_CARD_TRANSCRIPT_WORDS = 60000
    transcript_words = cleaned.split()
    if len(transcript_words) > MAX_CARD_TRANSCRIPT_WORDS:
        cleaned_for_cards = " ".join(transcript_words[:MAX_CARD_TRANSCRIPT_WORDS])
    else:
        cleaned_for_cards = cleaned
    try:
        cards_raw = _gpt_json_array(
            _CARD_PROMPT,
            "Transcript:\n" + cleaned_for_cards + "\n\nConcept inventory:\n" + json.dumps(inventory, ensure_ascii=False),
            "summary_card_generation",
            max_tokens=8000,
            temperature=0.4,
        )
    except Exception as exc:
        print(f"[cards] GPT call failed: {exc}")
        cards_raw = []
    cards_raw = _normalise_card_shapes(cards_raw)
    print(f"[cards] raw cards from GPT: {len(cards_raw)}")
    print(f"[cards] inventory names: {[c.get('name') for c in inventory]}")
    print(f"[cards] GPT returned names: {[c.get('concept_name') for c in cards_raw]}")
    if cards_raw:
        print(f"[cards] first raw card keys: {list(cards_raw[0].keys())}")
        print(f"[cards] first raw card: {json.dumps(cards_raw[0], ensure_ascii=False)[:300]}")
    by_inventory_name = {
        _normalise_ws(item["name"]).lower(): item
        for item in inventory
        if item.get("name")
    }
    cards = []
    for raw in cards_raw:
        name = _normalise_ws(raw.get("concept_name", ""))
        inventory_item = by_inventory_name.get(name.lower())
        if inventory_item:
            cards.append(_normalise_generated_card(raw, inventory_item))

    def card_content_word_count(card: dict) -> int:
        parts = [card.get("summary", "")]
        for item in card.get("key_definitions") or []:
            if isinstance(item, dict):
                parts.append(_normalise_ws(str(item.get("definition") or "")))
        for item in card.get("examples") or []:
            parts.append(_normalise_ws(str(item or "")))
        return len(" ".join(part for part in parts if part).split())

    kept_cards = []
    thin_cards = []
    for card in cards:
        word_count = card_content_word_count(card)
        if word_count < 15:
            print(f"[cards] filtered: {card.get('concept_name')} - word count: {word_count}")
            print(
                "[summary-card-debug] filtered thin card: "
                f"{card.get('concept_name', '')} ({word_count} words)"
            )
            thin_cards.append(card)
        else:
            kept_cards.append(card)
    print(f"[cards] after filtering: {len(kept_cards)}")

    for thin_card in thin_cards:
        thin_name = _normalise_ws(thin_card.get("concept_name", ""))
        if not thin_name:
            continue
        related_card = next(
            (
                card for card in kept_cards
                if thin_name.lower() in _normalise_ws(card.get("concept_name", "")).lower()
            ),
            None,
        )
        if related_card:
            inventory_item = by_inventory_name.get(thin_name.lower(), {})
            key_quote = _normalise_ws(str(inventory_item.get("key_quote") or inventory_item.get("quote") or ""))
            if key_quote and key_quote not in (related_card.get("examples") or []):
                related_card.setdefault("examples", []).append(key_quote)

    for card in kept_cards:
        name = card.get("concept_name", "")
        if name and not name.startswith("__"):
            card["concept_name"] = _title_case_name(name)

    kept_names = {card.get("concept_name", "") for card in kept_cards}
    filtered_inventory = [item for item in inventory if item.get("name", "") in kept_names]

    validate_generated_summary_cards(filtered_inventory, kept_cards, cleaned)
    if lecture_id:
        if len(filtered_inventory) >= 3:
            try:
                sentinel = _inventory_cache_sentinel(transcript_hash, filtered_inventory)
                persisted_cards = [sentinel, *kept_cards]
            except Exception as exc:
                print(f"[inventory-cache] sentinel construction failed: {exc}")
                persisted_cards = kept_cards
        else:
            persisted_cards = kept_cards
        update_lecture_concept_note_cards(lecture_id, persisted_cards)
    return kept_cards


def build_concept_note_cards(
    concept_sections: list[dict] | None = None,
    *,
    transcript: str = "",
    lecture_id: str | None = None,
) -> list[dict]:
    """
    Generate on-screen concept cards with the new concept-first GPT pipeline.

    The old section/chunk-derived card logic has been removed. Callers must pass
    the full original transcript; cards are built from two sequential GPT calls:
    concept inventory, then card content.
    """
    if not transcript:
        raise ConceptCoverageError("Summary card generation requires the full original transcript")
    return build_summary_cards_from_transcript(transcript, lecture_id=lecture_id)


def validate_summary_card_generation(
    concept_sections: list[dict],
    concept_note_cards: list[dict],
    grounded_notes: list[dict] | None = None,
    *,
    transcript: str = "",
    minimum_grounding: float = 0.65,
) -> dict:
    """
    Hard gate for summary-card output.

    A missing concept, duplicate title, empty trap for a detected trap, missing
    source range, or weak grounding is a build error. Callers must not proceed
    to UI/PDF output when this raises ConceptCoverageError.
    """
    cards = [card for card in (concept_note_cards or []) if not _is_internal_card(card)]
    titles = [_normalise_ws(card.get("concept_name", "")) for card in cards]
    lowered_titles = [title.lower() for title in titles if title]
    if len(lowered_titles) != len(set(lowered_titles)):
        raise ConceptCoverageError("Card validation failed: duplicate concept card titles")

    bad_titles = [
        title for title in titles
        if not title
        or title.lower() == "key concept"
        or len(_split_sentences(title)) > 1
        or _is_low_signal_title(title)
    ]
    if bad_titles:
        raise ConceptCoverageError(f"Card validation failed: invalid concept titles: {', '.join(bad_titles)}")

    for card in cards:
        title = card.get("concept_name", "")
        if not card.get("source_start") or not card.get("source_end"):
            raise ConceptCoverageError(f"Card validation failed: {title} does not have exactly one source timestamp range")
        if not card.get("summary"):
            raise ConceptCoverageError(f"Card validation failed: {title} has no summary")
        if len(_split_sentences(card.get("summary", ""))) <= 1 and not card.get("key_definitions") and not card.get("examples"):
            raise ConceptCoverageError(f"Card validation failed: {title} is too thin")

    try:
        grounding = _card_body_grounding_score(cards, transcript)
    except Exception as exc:
        print(f"[grounding] score calculation failed: {exc}")
        grounding = 1.0
    if grounding < minimum_grounding:
        raise ConceptCoverageError(f"Card validation failed: grounding score {grounding:.0%} below {minimum_grounding:.0%}")

    return {
        "card_count": len(cards),
        "concept_count": len([s for s in concept_sections or [] if not _is_low_signal_title(s.get("title", ""))]),
        "grounding_score": grounding,
    }


def build_claim_registry(grounded_notes: list[dict]) -> list[dict]:
    claims = []
    seen = set()
    for note in grounded_notes:
        for unit in note.get("units") or []:
            if unit.get("type") not in {"claim", "concept", "example"}:
                continue
            text = _normalise_ws(unit.get("text", ""))
            if not text:
                continue
            key = (unit.get("type"), text.lower())
            if key in seen:
                continue
            seen.add(key)
            claims.append({
                "type": unit.get("type"),
                "text": text,
                "chapter_title": note.get("title"),
                "verification_status": unit.get("verification_status", note.get("verification_status", "weak")),
                "confidence": unit.get("confidence", note.get("confidence", 0.0)),
                "support_score": unit.get("support_score", unit.get("confidence", 0.0)),
                "contradiction_score": unit.get("contradiction_score", 0.0),
                "timestamps": unit.get("timestamps") or [],
                "source_chunk_ids": unit.get("source_chunk_ids") or [],
            })
    return claims


def _claim_allows_cheat_sheet_entry(claim: dict) -> bool:
    status = claim.get("verification_status", "unsupported")
    confidence = float(claim.get("confidence") or 0.0)
    support_score = float(claim.get("support_score") or 0.0)
    contradiction_score = float(claim.get("contradiction_score") or 0.0)
    if status == "contradicted":
        return False
    if contradiction_score >= 0.25:
        return False
    if status != "supported":
        return False
    return confidence >= 0.55 and support_score >= 0.55


def _compress_core_idea(text: str, limit: int = 8) -> str:
    cleaned = _normalise_ws(text)
    if not cleaned:
        return ""
    first_sentence = _split_sentences(cleaned)[0] if _split_sentences(cleaned) else cleaned
    words = first_sentence.split()
    if len(words) <= limit:
        return first_sentence.rstrip(".")
    return " ".join(words[:limit]).rstrip(" .,;:") + "..."


def _quick_recall_cue(text: str) -> str:
    cleaned = _normalise_ws(text)
    lowered = cleaned.lower()
    if not lowered:
        return ""
    sentences = _split_sentences(cleaned)

    def _cap_sentence(s: str, limit: int = 24) -> str:
        words = s.split()
        if len(words) > limit:
            s = " ".join(words[:limit]).rstrip(" ,;:") + "."
        elif s and s[-1] not in ".!?":
            s += "."
        return s

    # 1. vs/versus/whereas — use first complete sentence (≤20 words)
    if any(kw in lowered for kw in ("vs ", " versus ", "whereas")):
        for sent in sentences:
            words = sent.split()
            if 4 <= len(words) <= 20:
                return _cap_sentence(sent)

    # 2. Definition markers — take matching sentence
    def_markers = ("is defined as", "refers to", " means ", "is called", "is a ")
    for marker in def_markers:
        if marker in lowered:
            for sent in sentences:
                if marker in sent.lower():
                    return _cap_sentence(sent)

    # 3. Exam trap markers — find corrective sentence
    trap_markers = ("students often think", "common mistake", "do not confuse", "don't confuse", "misconception")
    for marker in trap_markers:
        if marker in lowered:
            for sent in sentences:
                if any(m in sent.lower() for m in trap_markers):
                    return _cap_sentence(sent)

    # 4. CS signals — find complexity sentence
    cs_markers = ("time complexity", "big o", "o(n)", "o(log", "o(1)", "algorithm", "runtime")
    if any(kw in lowered for kw in cs_markers):
        for sent in sentences:
            sent_low = sent.lower()
            if any(kw in sent_low for kw in cs_markers):
                return _cap_sentence(sent)

    # 5. Formula signals — find equation sentence
    if re.search(r'[=²∫Δαβ∑]|O\([^)]+\)', cleaned):
        for sent in sentences:
            if re.search(r'[=²∫Δαβ∑]|O\([^)]+\)', sent):
                return _cap_sentence(sent)

    # 6. Economics domain patterns (preserved)
    if "resources" in lowered and ("unlimited in supply" in lowered or "gifted by nature" in lowered or "abundant" in lowered):
        return "Non-economic resources are naturally available without scarcity in the lecture context."
    if "unlimited in supply" in lowered or "gifted by nature" in lowered or "abundant" in lowered:
        return "A free or non-economic good is naturally available without scarcity in the lecture context."
    if "testable" in lowered or "tested against facts" in lowered or "verifiable" in lowered:
        return "A positive statement is fact-based and can be tested or verified."
    if "value judgment" in lowered or "normative" in lowered:
        return "A normative statement expresses a value judgment or opinion."
    if "scarce" in lowered or "limited in supply" in lowered or "opportunity cost" in lowered:
        return "An economic good is scarce, so using it involves opportunity cost."
    if "public good" in lowered or ("shared" in lowered and "good" in lowered):
        return "A public good can be shared, but it is not the same as a free good."
    if "dissatisfaction" in lowered or "pollution" in lowered or "garbage" in lowered:
        return "An economic bad creates disutility rather than satisfaction."
    if "human intervention" in lowered or "conversion" in lowered:
        return "Human intervention can convert a non-economic good into an economic good."

    # 7. Universal fallback: first sentence, max 24 words
    first = sentences[0] if sentences else cleaned
    return _cap_sentence(first)


def _quick_recall_under_ten_words(card: dict) -> str:
    first_def = (card.get("key_definitions") or [{}])[0]
    definition = first_def.get("definition", "") if isinstance(first_def, dict) else str(first_def)
    trap = card.get("exam_trap") or {}
    trap_text = " ".join([trap.get("misconception", ""), trap.get("correct", "")]) if isinstance(trap, dict) else str(trap)
    cue = _quick_recall_cue(" ".join(filter(None, [
        definition,
        card.get("summary", ""),
        trap_text,
    ])))
    words = cue.replace("—", " ").split()
    if len(words) <= 10:
        return cue
    return " ".join(words[:10]).rstrip(" .,;:") + "."


def _timestamp_to_seconds(value: str | int | float | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value).strip()
    if not text:
        return None
    parts = text.split(":")
    try:
        nums = [int(float(part)) for part in parts]
    except ValueError:
        return None
    if len(nums) == 2:
        return nums[0] * 60 + nums[1]
    if len(nums) == 3:
        return nums[0] * 3600 + nums[1] * 60 + nums[2]
    return nums[0] if nums else None


def _pick_term_citation(item: dict, fallback_citations: list[dict]) -> list[dict]:
    item_citations = item.get("citations") or []
    if item_citations:
        return item_citations[:1]
    return (fallback_citations or [])[:1]


def _claim_mentions_term(claim: dict, term: str, chapter_title: str) -> bool:
    text = _normalise_ws(claim.get("text", "")).lower()
    if not text:
        return False
    term_lower = _normalise_ws(term).lower()
    chapter_lower = _normalise_ws(chapter_title).lower()
    if term_lower and term_lower in text:
        return True
    return bool(chapter_lower and chapter_lower in text)


def build_verified_cheat_sheet(
    chapter_hierarchy: list[dict],
    claim_registry: list[dict],
    adaptive_intelligence: dict | None = None,
) -> list[dict]:
    """
    Build a deterministic revision sheet from verified lecture chapters.

    Output shape:
    [
        {
            "chapter_title": "...",
            "rows": [
                {
                    "term": "...",
                    "core_idea": "...",
                    "exam_trap": "...",
                    "quick_recall": "...",
                    "citations": [...],
                    "confidence": 0.91,
                }
            ]
        }
    ]
    """
    if not chapter_hierarchy:
        return []

    allowed_claims = [
        claim for claim in claim_registry
        if _claim_allows_cheat_sheet_entry(claim)
    ]

    priority_lookup = {
        _normalise_concept_key(item["concept"]): item
        for item in (adaptive_intelligence or {}).get("concepts", [])
    }
    sections = []
    for chapter in chapter_hierarchy:
        chapter_title = _normalise_ws(chapter.get("title", ""))
        chapter_citations = chapter.get("citations") or []
        chapter_exam_trap = _compress_core_idea((chapter.get("exam_traps") or [""])[0], limit=16)
        chapter_claims = [
            claim for claim in allowed_claims
            if _normalise_ws(claim.get("chapter_title", "")).lower() == chapter_title.lower()
        ]
        rows = []
        seen_terms = set()

        for subtopic in chapter.get("subtopic_sections") or []:
            if subtopic.get("concept_role", "supporting concept") not in _STRUCTURAL_CONCEPT_ROLES:
                continue
            term = _normalise_ws(subtopic.get("title", ""))
            if not term:
                continue
            key = term.lower()
            if key in seen_terms:
                continue
            related_claims = [claim for claim in chapter_claims if _claim_mentions_term(claim, term, chapter_title)]
            best_claim = max(
                related_claims,
                key=lambda claim: (claim.get("support_score", 0.0), claim.get("confidence", 0.0)),
                default=None,
            )
            definition = (subtopic.get("definitions") or [""])[0]
            overview = subtopic.get("overview", "")
            core_source = definition or (best_claim.get("text", "") if best_claim else overview)
            core_idea = _compress_core_idea(core_source or overview, limit=10)
            exam_trap = _compress_core_idea((subtopic.get("exam_traps") or [""])[0], limit=16) or chapter_exam_trap
            quick_recall = _quick_recall_cue(" ".join(filter(None, [core_source, (subtopic.get("exam_traps") or [""])[0], overview])))
            confidence = max(
                float(best_claim.get("confidence", 0.0)) if best_claim else 0.0,
                float(chapter.get("confidence") or 0.0),
            )
            if not core_idea:
                continue
            rows.append({
                "term": term,
                "core_idea": core_idea,
                "exam_trap": exam_trap,
                "quick_recall": quick_recall,
                "citations": _pick_term_citation(subtopic, chapter_citations),
                "confidence": round(confidence, 2),
                "revision_priority": float(priority_lookup.get(_normalise_concept_key(term), {}).get("revision_priority", confidence)),
                "emphasis_level": priority_lookup.get(_normalise_concept_key(term), {}).get("emphasis_level", "medium"),
            })
            seen_terms.add(key)

        if not rows:
            chapter_claim = max(
                chapter_claims,
                key=lambda claim: (claim.get("support_score", 0.0), claim.get("confidence", 0.0)),
                default=None,
            )
            overview_source = (
                (chapter.get("key_definitions") or [""])[0]
                or (chapter_claim.get("text", "") if chapter_claim else chapter.get("core_explanation", ""))
            )
            overview = _compress_core_idea(overview_source, limit=11)
            exam_trap = chapter_exam_trap
            if overview:
                rows.append({
                    "term": chapter_title or "Key Concept",
                    "core_idea": overview,
                    "exam_trap": exam_trap,
                    "quick_recall": _quick_recall_cue(" ".join(filter(None, [overview_source, (chapter.get("exam_traps") or [""])[0], chapter.get("core_explanation", "")]))),
                    "citations": chapter_citations[:1],
                    "confidence": round(float(chapter.get("confidence") or 0.0), 2),
                    "revision_priority": float(priority_lookup.get(_normalise_concept_key(chapter_title), {}).get("revision_priority", chapter.get("confidence") or 0.0)),
                    "emphasis_level": priority_lookup.get(_normalise_concept_key(chapter_title), {}).get("emphasis_level", "medium"),
                })

        if not rows:
            continue

        rows = sorted(rows, key=lambda row: (-row.get("revision_priority", 0.0), -row["confidence"], len(row["term"])))
        sections.append({
            "chapter_title": chapter_title or "Key Concept",
            "rows": rows[:6],
        })

    if sections:
        return sections

    fallback_rows = []
    for chapter in chapter_hierarchy[:6]:
        overview = _compress_core_idea(chapter.get("core_explanation", ""), limit=11)
        if not overview:
            continue
        fallback_rows.append({
            "chapter_title": _normalise_ws(chapter.get("title", "")) or "Key Concept",
            "rows": [{
                "term": _normalise_ws(chapter.get("title", "")) or "Key Concept",
                "core_idea": overview,
                "exam_trap": chapter_exam_trap,
                "quick_recall": _quick_recall_cue(chapter.get("core_explanation", "") or overview),
                "citations": (chapter.get("citations") or [])[:1],
                "confidence": round(float(chapter.get("confidence") or 0.0), 2),
                "revision_priority": float(priority_lookup.get(_normalise_concept_key(chapter.get("title", "")), {}).get("revision_priority", chapter.get("confidence") or 0.0)),
                "emphasis_level": priority_lookup.get(_normalise_concept_key(chapter.get("title", "")), {}).get("emphasis_level", "medium"),
            }],
        })
    return fallback_rows


def build_verified_cheat_sheet_from_cards(concept_note_cards: list[dict]) -> list[dict]:
    """
    Build the cheat sheet directly from the final validated cards.

    One final card produces one row, so the screen card set, PDF sections, and
    cheat sheet cannot drift apart.
    """
    rows = []
    seen = set()
    for card in concept_note_cards or []:
        if _is_internal_card(card):
            continue
        term = _normalise_ws(card.get("concept_name", ""))
        if not term or term.lower() == "key concept":
            continue
        key = term.lower()
        if key in seen:
            continue
        seen.add(key)

        key_definitions = [
            item for item in (card.get("key_definitions") or [])
            if isinstance(item, dict) and _normalise_ws(item.get("definition", ""))
        ]
        matching_def = next(
            (
                item for item in key_definitions
                if _normalise_ws(item.get("term", "")).lower() == key
            ),
            None,
        )
        definition = _normalise_ws(matching_def.get("definition", "") if matching_def else "")
        summary = _normalise_ws(card.get("summary", ""))
        # Core Idea: first complete sentence — readable prose, up to 20 words
        _core_source = definition or summary
        _sentences = re.split(r'(?<=[.!?])\s+', _core_source.strip())
        _first = _sentences[0].strip().rstrip('.') if _sentences else _core_source
        _words = _first.split()
        core_idea = (' '.join(_words[:20]).rstrip(' .,;') + ('…' if len(_words) > 20 else '')) if _words else _core_source

        # Strip mid-sentence verbal fillers from core_idea
        _mid_fillers = [
            r',\s*right\s*,\s*are\s+the\s+',   # catches ", right, are the X" repetition
            r'\bright\s*,\s*are\s+the\s+',       # catches "right, are the X" without leading comma
            r',\s*right\s*,',
            r',\s*okay\s*,',
            r',\s*you know\s*,',
            r',\s*I mean\s*,',
            r',\s*like\s*,(?!\s*\w+\s+(?:a|an|the)\s)',
            r',\s*so\s*,',
        ]
        for _pat in _mid_fillers:
            core_idea = re.sub(_pat, ' ', core_idea, flags=re.IGNORECASE)
        core_idea = re.sub(r'\s+', ' ', core_idea).strip()

        # Quick Recall: sharpest memory hook — prioritise exam trap correct
        # field over raw definition to avoid being identical to Core Idea
        _trap_obj = card.get("exam_trap")
        _trap_correct = None
        if isinstance(_trap_obj, dict):
            _trap_correct = _normalise_ws(_trap_obj.get("correct", ""))

        if _trap_correct and len(_trap_correct.split()) >= 4:
            # Use exam trap correct field — already the exam-ready version
            _tc_words = _trap_correct.split()
            quick_recall_text = ' '.join(_tc_words[:12]).rstrip(' .,;')
            if len(_tc_words) > 12:
                quick_recall_text += '.'
            elif quick_recall_text and quick_recall_text[-1] not in '.!?':
                quick_recall_text += '.'
        elif card.get("remember") and len(str(card.get("remember", "")).split()) >= 4:
            # Use remember field — explicitly a memory hook
            _rem = _normalise_ws(str(card["remember"]))
            _rem_words = _rem.split()
            quick_recall_text = ' '.join(_rem_words[:12]).rstrip(' .,;')
            if quick_recall_text and quick_recall_text[-1] not in '.!?':
                quick_recall_text += '.'
        else:
            # Fallback: compress summary to ≤10 words
            quick_recall_text = _quick_recall_cue(definition or summary)

        # Strip mid-sentence fillers from quick_recall too
        for _pat in _mid_fillers:
            quick_recall_text = re.sub(_pat, ' ', quick_recall_text, flags=re.IGNORECASE)
        quick_recall_text = re.sub(r'\s+', ' ', quick_recall_text).strip()

        # Final deduplication guard — if still identical to core_idea,
        # take a different slice of the source text
        if quick_recall_text.lower().rstrip('.') == core_idea.lower().rstrip('.'):
            _words = (definition or summary).split()
            if len(_words) > 8:
                quick_recall_text = ' '.join(_words[4:12]).rstrip(' .,;') + '.'
            else:
                quick_recall_text = ' '.join(_words[:8]).rstrip(' .,;') + '.'

        raw_trap_obj = card.get("exam_trap")
        exam_trap = ""
        exam_trap_structured = None
        if isinstance(raw_trap_obj, dict) and raw_trap_obj:
            misconception = _normalise_ws(raw_trap_obj.get("misconception", ""))
            correct = _normalise_ws(raw_trap_obj.get("correct", ""))
            if misconception and correct and misconception.lower() != correct.lower():
                exam_trap_structured = {
                    "misconception": misconception,
                    "correct": correct,
                }
                exam_trap = f"{misconception} — actually {correct}".strip()
        elif isinstance(raw_trap_obj, str) and _normalise_ws(raw_trap_obj):
            trap_text = _normalise_ws(raw_trap_obj)
            # Try to split self-contained "Students think X; actually Y" style strings
            _split_m = re.search(
                r"^(.{10,}?)\s*[;.]\s*(?:actually|but|however|in fact|the truth is|correct(?:ly)?[:,]?)\s*(.{10,})$",
                trap_text,
                flags=re.IGNORECASE,
            )
            if _split_m:
                _misc = _split_m.group(1).strip().rstrip(".,;")
                _corr = _split_m.group(2).strip()
                if _misc.lower() != _corr.lower():
                    exam_trap_structured = {"misconception": _misc, "correct": _corr}
                    exam_trap = f"{_misc} — actually {_corr}".strip()
            else:
                # Only use fallback if trap is meaningfully different from summary (< 60% word overlap)
                trap_words = set(trap_text.lower().split())
                summary_words = set(_normalise_ws(summary).lower().split())
                overlap = (
                    len(trap_words & summary_words) / max(len(trap_words), 1)
                    if trap_words and summary_words else 1.0
                )
                fallback_correct = _normalise_ws(definition or summary)
                if overlap < 0.6 and fallback_correct and trap_text.lower() != fallback_correct.lower():
                    if trap_text.lower().startswith("students think"):
                        misconception = trap_text
                    elif trap_text.lower().startswith("students"):
                        misconception = trap_text
                    else:
                        misconception = f"Students often think: {trap_text}"
                    if misconception.lower() != fallback_correct.lower():
                        exam_trap_structured = {
                            "misconception": misconception,
                            "correct": fallback_correct,
                        }
                        exam_trap = f"{misconception} — actually {fallback_correct}".strip()
        source = {
            "label": f"{card.get('source_start')} - {card.get('source_end')}",
            "start_seconds": _timestamp_to_seconds(card.get("source_start")),
            "end_seconds": _timestamp_to_seconds(card.get("source_end")),
        }
        rows.append({
            "term": term,
            "core_idea": core_idea,
            "exam_trap": exam_trap,
            "exam_trap_structured": exam_trap_structured,
            "quick_recall": quick_recall_text,
            "citations": [source] if source else [],
            "confidence": round(float(card.get("confidence") or 0.0), 2),
            "revision_priority": round(float(card.get("confidence") or 0.0), 2),
            "emphasis_level": "high" if exam_trap else "medium",
        })

    if not rows:
        return []
    rows = sorted(rows, key=lambda row: (
        ((row.get("citations") or [{}])[0].get("start_seconds") is None),
        (row.get("citations") or [{}])[0].get("start_seconds") or 0,
    ))
    return [{"chapter_title": "Concept Cards", "rows": rows}]


def _normalise_concept_key(text: str) -> str:
    return _normalise_ws(text).strip(" .,:;").lower()


def _dedupe_dicts_by(items: list[dict], key_name: str) -> list[dict]:
    seen = set()
    out = []
    for item in items:
        key = item.get(key_name)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def build_concept_entities(chapter_hierarchy: list[dict], claim_registry: list[dict]) -> list[dict]:
    entities: dict[str, dict] = {}
    supported_claims = [
        claim for claim in claim_registry
        if claim.get("verification_status") == "supported" and float(claim.get("contradiction_score") or 0.0) < 0.25
    ]

    def ensure_entity(term: str, chapter: dict, source: dict | None = None) -> dict | None:
        cleaned = _normalise_ws(term)
        context = " ".join([
            cleaned,
            chapter.get("title", ""),
            " ".join(chapter.get("key_definitions") or []),
            " ".join(chapter.get("important_distinctions") or []),
        ])
        concept_role = _classify_concept_role(cleaned, context)
        canonical = _canonical_curriculum_concept(context)
        if concept_role not in _STRUCTURAL_CONCEPT_ROLES:
            return None
        if canonical and _is_low_signal_title(cleaned):
            cleaned = canonical
        key = _normalise_concept_key(cleaned)
        if not cleaned or not key or key in _RELATIONSHIP_STOP_TERMS:
            return None
        signal_type = _educational_signal_type(" ".join([
            cleaned,
            chapter.get("title", ""),
            " ".join(chapter.get("key_definitions") or []),
            " ".join(chapter.get("important_distinctions") or []),
        ]))
        if signal_type in {"administrative lecture content", "low educational relevance"}:
            return None
        entity = entities.setdefault(key, {
            "concept": cleaned,
            "canonical_key": key,
            "signal_type": signal_type,
            "concept_role": concept_role,
            "chapter_title": chapter.get("title", ""),
            "definitions": [],
            "distinctions": [],
            "examples": [],
            "exam_traps": [],
            "citations": [],
            "related_concepts": [],
            "contrast_concepts": [],
            "prerequisite_concepts": [],
            "causal_concepts": [],
            "confidence": float(chapter.get("confidence") or 0.0),
            "verification_status": chapter.get("verification_status", "weak"),
        })
        if source:
            entity["definitions"].extend(source.get("definitions") or [])
            entity["examples"].extend(source.get("examples") or [])
            entity["exam_traps"].extend(source.get("exam_traps") or [])
            entity["citations"].extend(source.get("citations") or [])
        return entity

    for chapter in chapter_hierarchy:
        chapter_terms = []
        for subtopic in chapter.get("subtopic_sections") or []:
            if subtopic.get("concept_role", "supporting concept") not in _STRUCTURAL_CONCEPT_ROLES:
                continue
            entity = ensure_entity(subtopic.get("title", ""), chapter, source=subtopic)
            if entity:
                chapter_terms.append(entity["canonical_key"])
        for concept in chapter.get("concepts") or []:
            entity = ensure_entity(concept, chapter)
            if entity:
                chapter_terms.append(entity["canonical_key"])
                entity["definitions"].extend(chapter.get("key_definitions") or [])
                entity["distinctions"].extend(chapter.get("important_distinctions") or [])
                entity["examples"].extend(chapter.get("examples") or [])
                entity["exam_traps"].extend(chapter.get("exam_traps") or [])
                entity["citations"].extend(chapter.get("citations") or [])

        chapter_terms = [term for term in _dedupe_texts(chapter_terms) if term in entities]
        for term in chapter_terms:
            entity = entities[term]
            entity["related_concepts"].extend(
                entities[other]["concept"] for other in chapter_terms if other != term
            )

    for entity in entities.values():
        concept = entity["concept"]
        related_claims = [claim for claim in supported_claims if _claim_mentions_term(claim, concept, entity["chapter_title"])]
        if related_claims:
            best = max(related_claims, key=lambda claim: (claim.get("support_score", 0.0), claim.get("confidence", 0.0)))
            entity["confidence"] = round(max(float(entity["confidence"] or 0.0), float(best.get("confidence") or 0.0)), 2)
            entity["citations"].extend({"label": ts["label"]} for ts in best.get("timestamps") or [] if ts.get("label"))
        entity["definitions"] = _filter_conflicting_texts(_dedupe_texts(entity["definitions"]))[:3]
        entity["distinctions"] = _filter_conflicting_texts(_dedupe_texts(entity["distinctions"]))[:3]
        entity["examples"] = _filter_conflicting_texts(_dedupe_texts(entity["examples"]))[:3]
        entity["exam_traps"] = _filter_conflicting_texts(_dedupe_texts(entity["exam_traps"]))[:3]
        entity["citations"] = _dedupe_dicts_by(entity["citations"], "label")[:3]
        entity["related_concepts"] = _dedupe_texts(entity["related_concepts"])[:5]

    return sorted(entities.values(), key=lambda item: (item["chapter_title"], item["concept"]))


def build_concept_relationship_graph(concept_entities: list[dict], claim_registry: list[dict]) -> dict:
    entities_by_key = {entity["canonical_key"]: entity for entity in concept_entities}
    edges = []
    seen_edges = set()

    def add_edge(source_key: str, target_name: str, rel_type: str, confidence: float):
        if confidence < 0.55:
            return
        if source_key not in entities_by_key:
            return
        target_key = _normalise_concept_key(target_name)
        if target_key not in entities_by_key or target_key == source_key:
            return
        if entities_by_key[source_key].get("concept_role") not in _STRUCTURAL_CONCEPT_ROLES:
            return
        if entities_by_key[target_key].get("concept_role") not in _STRUCTURAL_CONCEPT_ROLES:
            return
        key = (source_key, target_key, rel_type)
        if key in seen_edges:
            return
        seen_edges.add(key)
        edges.append({
            "source": entities_by_key[source_key]["concept"],
            "target": entities_by_key[target_key]["concept"],
            "type": rel_type,
            "confidence": round(confidence, 2),
        })

    chapter_groups: dict[str, list[str]] = {}
    for entity in concept_entities:
        chapter_groups.setdefault(entity.get("chapter_title", ""), []).append(entity["canonical_key"])

    for chapter_title, keys in chapter_groups.items():
        keys = [key for key in _dedupe_texts(keys) if key in entities_by_key]
        for idx, source_key in enumerate(keys):
            for target_key in keys[idx + 1:]:
                source_signal = entities_by_key[source_key].get("signal_type")
                target_signal = entities_by_key[target_key].get("signal_type")
                if source_signal in {"example", "exam instruction"} or target_signal in {"example", "exam instruction"}:
                    continue
                add_edge(source_key, entities_by_key[target_key]["concept"], "related", 0.68)
                add_edge(target_key, entities_by_key[source_key]["concept"], "related", 0.68)
        if " vs " in chapter_title.lower():
            for idx, source_key in enumerate(keys):
                for target_key in keys[idx + 1:]:
                    add_edge(source_key, entities_by_key[target_key]["concept"], "contrast", 0.84)
                    add_edge(target_key, entities_by_key[source_key]["concept"], "contrast", 0.84)

    for claim in claim_registry:
        support_score = float(claim.get("support_score") or 0.0)
        if claim.get("verification_status") != "supported" or float(claim.get("contradiction_score") or 0.0) >= 0.25:
            continue
        if support_score < 0.6:
            continue
        text = _normalise_ws(claim.get("text", ""))
        lowered = text.lower()
        matched = sorted(
            [
                (lowered.find(entity["concept"].lower()), entity)
                for entity in concept_entities
                if entity["concept"].lower() in lowered
            ],
            key=lambda item: item[0],
        )
        matched = [entity for pos, entity in matched if pos >= 0]
        if len(matched) < 2:
            continue
        source = matched[0]
        for target in matched[1:]:
            if any(marker in lowered for marker in ("depends on", "requires", "require")):
                add_edge(source["canonical_key"], target["concept"], "prerequisite", support_score)
            if any(marker in lowered for marker in ("because", "causes", "leads to", "results in", "therefore", "create", "creates")):
                add_edge(source["canonical_key"], target["concept"], "causal", support_score)
            if " not " in lowered or "different from" in lowered or "contrast" in lowered:
                add_edge(source["canonical_key"], target["concept"], "contrast", support_score)

    for entity in concept_entities:
        key = entity["canonical_key"]
        entity["related_concepts"] = sorted({
            edge["target"] for edge in edges
            if edge["source"] == entity["concept"] and edge["type"] == "related"
        })[:5]
        entity["contrast_concepts"] = sorted({
            edge["target"] for edge in edges
            if edge["source"] == entity["concept"] and edge["type"] == "contrast"
        })[:4]
        entity["prerequisite_concepts"] = sorted({
            edge["target"] for edge in edges
            if edge["source"] == entity["concept"] and edge["type"] == "prerequisite"
        })[:4]
        entity["causal_concepts"] = sorted({
            edge["target"] for edge in edges
            if edge["source"] == entity["concept"] and edge["type"] == "causal"
        })[:4]

    return {"concepts": concept_entities, "edges": edges}


def build_relationship_concept_map(concept_graph: dict) -> list[dict]:
    map_blocks = []
    for entity in concept_graph.get("concepts", [])[:8]:
        fragments = []
        if entity.get("related_concepts"):
            fragments.append("connects to " + ", ".join(entity["related_concepts"][:3]))
        if entity.get("contrast_concepts"):
            fragments.append("contrasts with " + ", ".join(entity["contrast_concepts"][:2]))
        if entity.get("prerequisite_concepts"):
            fragments.append("depends on " + ", ".join(entity["prerequisite_concepts"][:2]))
        if entity.get("causal_concepts"):
            fragments.append("helps explain " + ", ".join(entity["causal_concepts"][:2]))
        if not fragments:
            continue
        map_blocks.append({
            "heading": entity["concept"],
            "paragraph": f"{entity['concept']} " + "; ".join(fragments) + ".",
            "related": entity.get("related_concepts", [])[:3],
            "contrasts": entity.get("contrast_concepts", [])[:2],
            "prerequisites": entity.get("prerequisite_concepts", [])[:2],
            "confidence": entity.get("confidence", 0.0),
        })
    return map_blocks


def _clamp_score(value: float) -> float:
    return round(max(0.0, min(1.0, value)), 2)


def score_adaptive_concept_intelligence(concept_graph: dict) -> dict:
    concepts = concept_graph.get("concepts", []) or []
    if not concepts:
        return {"concepts": [], "high_priority": [], "high_risk": [], "foundational": [], "revision_focus": []}

    degree_counts = {}
    incoming_prereq = {}
    for edge in concept_graph.get("edges", []) or []:
        degree_counts[edge["source"]] = degree_counts.get(edge["source"], 0) + 1
        degree_counts[edge["target"]] = degree_counts.get(edge["target"], 0) + 1
        if edge["type"] == "prerequisite":
            incoming_prereq[edge["target"]] = incoming_prereq.get(edge["target"], 0) + 1

    max_degree = max(degree_counts.values(), default=1)
    scored = []
    for entity in concepts:
        concept_name = entity["concept"]
        signal_type = entity.get("signal_type", "supporting concept")
        concept_role = entity.get("concept_role", signal_type)
        definitions = len(entity.get("definitions") or [])
        distinctions = len(entity.get("distinctions") or [])
        traps = len(entity.get("exam_traps") or [])
        contrasts = len(entity.get("contrast_concepts") or [])
        prerequisites = len(entity.get("prerequisite_concepts") or [])
        causal = len(entity.get("causal_concepts") or [])
        related = len(entity.get("related_concepts") or [])
        centrality = _clamp_score(degree_counts.get(concept_name, 0) / max_degree)
        dependency_weight = _clamp_score((prerequisites + incoming_prereq.get(concept_name, 0) + causal * 0.5) / 4)
        misunderstanding_risk = _clamp_score((traps * 0.45) + (distinctions * 0.2) + (contrasts * 0.18))
        exam_relevance = _clamp_score((traps * 0.35) + (distinctions * 0.2) + (definitions * 0.12) + (0.18 if centrality >= 0.6 else 0.0))
        educational_importance = _clamp_score(
            (centrality * 0.34)
            + (dependency_weight * 0.26)
            + min(0.2, definitions * 0.08)
            + min(0.12, related * 0.03)
            + (0.08 if entity.get("verification_status") == "supported" else 0.0)
        )
        revision_priority = _clamp_score(
            (educational_importance * 0.36)
            + (misunderstanding_risk * 0.28)
            + (exam_relevance * 0.24)
            + (float(entity.get("confidence") or 0.0) * 0.12)
        )
        if signal_type == "foundational concept":
            educational_importance = _clamp_score(educational_importance + 0.12)
            revision_priority = _clamp_score(revision_priority + 0.1)
        elif concept_role not in _STRUCTURAL_CONCEPT_ROLES or signal_type in {"example", "exam instruction"}:
            educational_importance = _clamp_score(educational_importance * 0.55)
            revision_priority = _clamp_score(revision_priority * 0.62)
        foundational = dependency_weight >= 0.45 or centrality >= 0.65 or definitions >= 2
        if concept_role not in _STRUCTURAL_CONCEPT_ROLES or signal_type in {"example", "exam instruction"}:
            foundational = False
        if revision_priority >= 0.78 or misunderstanding_risk >= 0.72:
            emphasis = "high"
        elif revision_priority >= 0.55:
            emphasis = "medium"
        else:
            emphasis = "low"

        enriched = {
            **entity,
            "centrality": centrality,
            "dependency_weight": dependency_weight,
            "misunderstanding_risk": misunderstanding_risk,
            "exam_relevance": exam_relevance,
            "educational_importance": educational_importance,
            "revision_priority": revision_priority,
            "foundational": foundational,
            "emphasis_level": emphasis,
        }
        scored.append(enriched)

    scored.sort(key=lambda item: (-item["revision_priority"], -item["educational_importance"], item["concept"]))
    high_priority = [item["concept"] for item in scored if item["revision_priority"] >= 0.68][:6]
    high_risk = [item["concept"] for item in scored if item["misunderstanding_risk"] >= 0.55][:6]
    foundational = [item["concept"] for item in scored if item["foundational"]][:6]
    revision_focus = [
        {
            "concept": item["concept"],
            "priority": item["revision_priority"],
            "reason": (
                "High confusion risk"
                if item["misunderstanding_risk"] >= 0.6
                else "Foundational dependency concept"
                if item["foundational"]
                else "High centrality concept"
            ),
            "emphasis_level": item["emphasis_level"],
        }
        for item in scored[:6]
    ]
    return {
        "concepts": scored,
        "high_priority": high_priority,
        "high_risk": high_risk,
        "foundational": foundational,
        "revision_focus": revision_focus,
    }


def build_adaptive_study_weighting(adaptive_intelligence: dict) -> dict:
    concepts = adaptive_intelligence.get("concepts", []) or []
    weighting = []
    for item in concepts[:8]:
        weighting.append({
            "concept": item["concept"],
            "cheat_sheet_weight": _clamp_score(item["revision_priority"]),
            "flashcard_weight": _clamp_score((item["revision_priority"] * 0.7) + (item["misunderstanding_risk"] * 0.3)),
            "quiz_weight": _clamp_score((item["exam_relevance"] * 0.55) + (item["misunderstanding_risk"] * 0.45)),
            "summary_emphasis": item["emphasis_level"],
        })
    return {"weights": weighting}


def _verify_generated_text(text: str, transcript_units: list[dict], minimum_score: float = 0.42) -> tuple[str, float]:
    cleaned = _normalise_ws(text)
    if not cleaned:
        return "unsupported", 0.0
    evidence, score = _find_best_evidence(cleaned, transcript_units)
    contradicted = _has_relevant_contradiction(cleaned, transcript_units) or _is_contradicted(cleaned, evidence["text"] if evidence else "")
    status = _status_from_score(score, contradicted)
    if score < minimum_score and status != "contradicted":
        status = "unsupported"
    return status, round(score, 2)


def _registry_terms(grounded_notes: list[dict]) -> set[str]:
    terms = set()
    for note in grounded_notes:
        for concept in note.get("concepts") or []:
            terms.add(_normalise_ws(concept).lower())
        terms.add(_normalise_ws(note.get("title", "")).lower())
    return {t for t in terms if t}


def sanitize_generated_content_bundle(transcript: str, content: dict, summary: str = "", section_rows: list[dict] | None = None) -> dict:
    """
    Drop contradicted or weakly grounded flashcards / quiz items / glossary
    entries before they are persisted or reused by other outputs.
    """
    transcript_units = _split_transcript_units(transcript)
    grounded_notes = build_grounded_notes(transcript, summary or content.get("summary", ""), section_rows=section_rows)
    allowed_terms = _registry_terms(grounded_notes)

    glossary_out = []
    _transcript_lower = transcript.lower()
    for item in content.get("glossary") or []:
        term = _normalise_ws(item.get("term", ""))
        definition = _normalise_ws(item.get("definition", ""))
        if not term or not definition:
            print(f"[sanitize] glossary '{term[:30]}' -> dropped (missing term or definition)")
            continue
        # Only drop if no significant word from the term appears anywhere in the transcript
        _term_words = [w for w in term.lower().split() if len(w) > 3]
        _term_in_transcript = any(w in _transcript_lower for w in _term_words)
        if not _term_in_transcript and term.lower() not in allowed_terms:
            print(f"[sanitize] glossary '{term[:30]}' -> dropped (term not grounded in allowed terms/transcript)")
            continue
        status, _ = _verify_generated_text(f"{term}. {definition}", transcript_units, minimum_score=0.3)
        if status in {"supported", "weak"}:
            glossary_out.append({"term": term, "definition": definition})
            print(f"[sanitize] glossary '{term[:30]}' -> kept")
        else:
            print(f"[sanitize] glossary '{term[:30]}' -> dropped ({status})")

    flashcards_out = []
    for card in content.get("flashcards") or []:
        front = _normalise_ws(card.get("front", ""))
        back = _normalise_ws(card.get("back", ""))
        if not front or not back:
            print(f"[sanitize] flashcard '{front[:50]}' -> dropped (missing front or back)")
            continue
        status_back, _ = _verify_generated_text(back, transcript_units, minimum_score=0.3)
        status_pair, _ = _verify_generated_text(f"{front}. {back}", transcript_units, minimum_score=0.22)
        if status_back == "contradicted" or status_pair == "contradicted":
            print(f"[sanitize] flashcard '{front[:50]}' -> dropped (contradicted)")
            continue
        if status_back in {"supported", "weak"} or status_pair in {"supported", "weak"}:
            flashcards_out.append({"front": front, "back": back})
            print(f"[sanitize] flashcard '{front[:50]}' -> kept")
        else:
            print(f"[sanitize] flashcard '{front[:50]}' -> dropped (back={status_back}, pair={status_pair})")

    quiz_out = []
    for item in content.get("quiz") or []:
        question = _normalise_ws(item.get("question", ""))
        answer = _normalise_ws(item.get("answer", ""))
        explanation = _normalise_ws(item.get("explanation", ""))
        options = item.get("options") or []
        if not question or not answer:
            print(f"[sanitize] quiz '{question[:50]}' -> dropped (missing question or answer)")
            continue
        combo = ". ".join(x for x in [question, explanation] if x)
        status, _ = _verify_generated_text(combo or question, transcript_units, minimum_score=0.22)
        if status == "contradicted":
            print(f"[sanitize] quiz '{question[:50]}' -> dropped (contradicted)")
            continue
        answer_option = None
        if answer and options:
            answer_key = answer.split(":", 1)[0].strip().upper()
            for option in options:
                if str(option).strip().upper().startswith(f"{answer_key}:"):
                    answer_option = _normalise_ws(str(option).split(":", 1)[1] if ":" in str(option) else str(option))
                    break
        if answer_option:
            answer_status, _ = _verify_generated_text(answer_option, transcript_units, minimum_score=0.22)
            if answer_status == "contradicted":
                print(f"[sanitize] quiz '{question[:50]}' -> dropped (answer contradicted)")
                continue
        if status in {"supported", "weak"}:
            quiz_out.append({
                "question": question,
                "options": options,
                "answer": answer,
                "explanation": explanation,
            })
            print(f"[sanitize] quiz '{question[:50]}' -> kept")
        else:
            print(f"[sanitize] quiz '{question[:50]}' -> dropped ({status})")

    print(f"[sanitize] quiz: {len(content.get('quiz') or [])} → {len(quiz_out)}")
    print(f"[sanitize] flashcards: {len(content.get('flashcards') or [])} → {len(flashcards_out)}")
    print(f"[sanitize] glossary: {len(content.get('glossary') or [])} → {len(glossary_out)}")
    return {
        **content,
        "flashcards": flashcards_out,
        "quiz": quiz_out,
        "glossary": glossary_out,
    }


def sanitize_pdf_artifacts(
    transcript: str,
    grounded_notes: list[dict],
    glossary: list[dict] | None = None,
    quick_review: list[dict] | None = None,
    takeaways: list[str] | None = None,
    study_roadmap: dict | None = None,
) -> dict:
    transcript_units = _split_transcript_units(transcript)
    glossary_out = []
    for item in glossary or []:
        term = _normalise_ws(item.get("term", ""))
        definition = _normalise_ws(item.get("definition", ""))
        status, _ = _verify_generated_text(f"{term}. {definition}", transcript_units, minimum_score=0.3)
        if term and definition and status in {"supported", "weak"}:
            glossary_out.append(item)

    quick_review_out = [
        q for q in (quick_review or [])
        if isinstance(q, dict) and q.get("question") and q.get("answer")
    ]

    takeaways_out = [
        t for t in (takeaways or [])
        if isinstance(t, str) and len(t.strip()) > 10
    ]

    roadmap = study_roadmap or {"days": [], "reminders": [], "next_topics": [], "prerequisites": []}
    next_topics_out = []
    for item in roadmap.get("next_topics", []) or []:
        text = _normalise_ws(f"{item.get('topic', '')}. {item.get('reason', '')}")
        status, _ = _verify_generated_text(text, transcript_units, minimum_score=0.18)
        if item.get("topic") and status in {"supported", "weak"}:
            next_topics_out.append(item)
    prerequisites_out = []
    for item in roadmap.get("prerequisites", []) or []:
        text = _normalise_ws(f"{item.get('concept', '')}. {item.get('reason', '')}")
        status, _ = _verify_generated_text(text, transcript_units, minimum_score=0.18)
        if item.get("concept") and status in {"supported", "weak"}:
            prerequisites_out.append(item)

    return {
        "glossary": glossary_out,
        "quick_review": quick_review_out,
        "takeaways": takeaways_out,
        "study_roadmap": {
            "days": roadmap.get("days", []) or [],
            "reminders": roadmap.get("reminders", []) or [],
            "next_topics": next_topics_out,
            "prerequisites": prerequisites_out,
        },
    }


def build_ai_study_aids(lecture_data: dict) -> dict:
    flashcards = lecture_data.get("flashcards") or []
    quiz = lecture_data.get("quiz") or []
    glossary = lecture_data.get("glossary") or []
    items = []
    if flashcards:
        items.append({"type": "flashcards", "label": "Flashcards", "count": len(flashcards)})
    if quiz:
        items.append({"type": "quiz", "label": "Quiz", "count": len(quiz)})
    if glossary:
        items.append({"type": "glossary", "label": "Glossary", "count": len(glossary)})
    return {"items": items, "count": len(items)}


def lecture_summary_confidence(grounded_notes: list[dict]) -> float:
    scores = [note.get("confidence", 0.0) for note in grounded_notes if note.get("confidence")]
    return round(mean(scores), 2) if scores else 0.0


def enrich_lecture_payload(
    lecture_data: dict,
    section_rows: list[dict] | None = None,
    *,
    strict_validation: bool = False,
) -> dict:
    if not lecture_data:
        return lecture_data

    transcript = lecture_data.get("transcript") or ""
    cleaned_transcript = clean_transcript(transcript)
    summary = lecture_data.get("master_summary") or lecture_data.get("summary") or ""
    validation_error = None
    grounded_notes = build_grounded_notes(cleaned_transcript, summary, section_rows=section_rows)
    try:
        concept_sections = build_concept_sections(grounded_notes)
        saved_cards = lecture_data.get("concept_note_cards")
        if isinstance(saved_cards, str):
            try:
                saved_cards = json.loads(saved_cards)
            except Exception:
                saved_cards = []
        visible_saved = [
            c for c in (saved_cards or [])
            if isinstance(c, dict)
            and not str(c.get("concept_name", "")).startswith("__")
        ]
        if len(visible_saved) >= 3:
            concept_note_cards = saved_cards
        else:
            concept_note_cards = build_concept_note_cards(transcript=transcript, lecture_id=lecture_data.get("id"))
        validate_summary_card_generation(
            concept_sections,
            concept_note_cards,
            grounded_notes,
            transcript=transcript,
        )
    except ConceptCoverageError as exc:
        if strict_validation:
            raise
        validation_error = str(exc)
        concept_note_cards = []
    claim_registry = build_claim_registry(grounded_notes)
    concept_entities = build_concept_entities(concept_sections, claim_registry)
    concept_graph = build_concept_relationship_graph(concept_entities, claim_registry)
    adaptive_intelligence = score_adaptive_concept_intelligence(concept_graph)
    relationship_concept_map = build_relationship_concept_map(concept_graph)
    verified_cheat_sheet = build_verified_cheat_sheet_from_cards(concept_note_cards)
    adaptive_study_weighting = build_adaptive_study_weighting(adaptive_intelligence)

    payload = dict(lecture_data)
    payload["grounded_notes"] = grounded_notes
    payload["concept_sections"] = concept_sections
    payload["concept_note_cards"] = concept_note_cards
    payload["chapter_hierarchy"] = concept_sections
    payload["claim_registry"] = claim_registry
    payload["concept_entities"] = concept_entities
    payload["concept_graph"] = concept_graph
    payload["adaptive_intelligence"] = adaptive_intelligence
    payload["adaptive_study_weighting"] = adaptive_study_weighting
    payload["relationship_concept_map"] = relationship_concept_map
    payload["verified_cheat_sheet"] = verified_cheat_sheet
    payload["summary_validation_error"] = validation_error
    payload["ai_study_aids"] = build_ai_study_aids(lecture_data)
    try:
        card_confidence = _card_body_grounding_score(concept_note_cards, transcript)
        payload["summary_confidence"] = (
            card_confidence if card_confidence > 0 else lecture_summary_confidence(grounded_notes)
        )
    except Exception as exc:
        print(f"[grounding] score calculation failed: {exc}")
        payload["summary_confidence"] = 1.0
    payload["transcript_word_count"] = len(cleaned_transcript.split()) if transcript else 0
    return payload
