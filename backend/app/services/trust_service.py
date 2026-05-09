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
from statistics import mean

from app.services.transcript_cleaner import clean as clean_transcript

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
    "example", "illustration", "scenario", "case", "instance", "sample",
    "for example", "for instance", "such as", "consider", "take the case",
    "e.g.", "e.g,", "namely", "specifically", "to illustrate",
)
_ADMIN_HINTS = (
    "focus week", "essay question", "mcq", "multiple choice", "next week",
    "this week", "unit number", "summarize unit", "revision week", "lecture will",
    "speaker", "delivering material", "third time", "today we will", "we are going to",
    "can you hear me", "repeat after me", "open your books", "attendance",
    "before break", "after break", "assignment deadline", "upload slides",
    "recording started", "microphone", "noise in the class",
)
_LOW_SIGNAL_TITLE_PATTERNS = (
    r"^lecture\b",
    r"^speaker\b",
    r"^focus week\b",
    r"^.*\bwill summarize\b",
    r"^.*\bdelivering material\b",
    r"^.*\bprovided free charge\b",
    r"^.*\bcharacterized unlimited supply\b",
)
# Domain-locked economics rule tables removed — GPT reconstruction handles canonical
# concept classification. These are kept as empty tuples for backward compatibility
# (functions referencing them will return None, which is correct behavior).
_CURRICULUM_CONCEPT_RULES: tuple = ()
_BOUNDARY_HINTS = (
    "exam", "study", "microeconomics", "macroeconomics", "positive", "normative",
    "utility", "goods", "free goods", "public goods", "economic bads",
    "resources", "production", "human intervention",
)
_CANONICAL_TITLE_RULES: tuple = ()
_CANONICAL_SUBTOPIC_RULES: tuple = ()
_RELATIONSHIP_STOP_TERMS = {"common exam traps", "concepts"}
_CAUSAL_MARKERS = ("because", "therefore", "leads to", "results in", "causes", "requires", "require", "depends on", "create", "creates")
_STRUCTURAL_CONCEPT_ROLES = {"foundational concept", "supporting concept"}


def _tokenise(text: str) -> set[str]:
    words = _TOKEN_RE.findall((text or "").lower())
    return {w for w in words if w not in _STOPWORDS}


def _normalise_ws(text: str) -> str:
    return " ".join((text or "").split()).strip()


def _word_count(text: str) -> int:
    return len(_TOKEN_RE.findall(text or ""))


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
    for canonical, signals in _CURRICULUM_CONCEPT_RULES:
        matches = sum(1 for signal in signals if signal in lowered)
        if matches >= 2:
            return canonical
    return None


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
    has_example_hint = any(hint in lowered or hint in context_lower for hint in _EXAMPLE_HINTS)
    has_academic_term = any(hint in lowered for hint in _ACADEMIC_TITLE_HINTS)
    if has_example_hint and not has_academic_term:
        return "example"
    if "like " in lowered or "similar to" in lowered or "imagine" in lowered:
        return "analogy"

    signal_type = _educational_signal_type(" ".join([cleaned, context]))
    canonical = _canonical_curriculum_concept(" ".join([cleaned, context]))
    signal_count = _curriculum_signal_count(canonical, " ".join([cleaned, context])) if canonical else 0
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
    if score >= 0.72:
        return "supported"
    if score >= 0.42:
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
        for sentence in _split_sentences(text):
            lowered = sentence.lower()
            if any(marker in lowered for marker in _TRAP_MARKERS):
                traps.append(sentence)
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


def build_concept_sections(grounded_notes: list[dict]) -> list[dict]:
    if not grounded_notes:
        return []

    total_notes = len(grounded_notes)
    desired_sections = total_notes
    if total_notes > 7:
        desired_sections = min(7, max(5, round(total_notes / 2)))

    chapters: list[list[dict]] = []
    current: list[dict] = []
    for note in grounded_notes:
        signature = _note_curriculum_signature(note)
        if signature["is_admin_only"] and not current:
            continue
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

    return [_merge_chapter_notes(group) for group in chapters if group]


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
    lowered = _normalise_ws(text).lower()
    if not lowered:
        return ""
    if "testable" in lowered or "tested against facts" in lowered or "verifiable" in lowered:
        return "Fact-based"
    if "value judgment" in lowered or "opinion" in lowered or "normative" in lowered:
        return "Opinion-based"
    if "scarce" in lowered or "limited in supply" in lowered or "opportunity cost" in lowered:
        return "Limited supply"
    if "unlimited in supply" in lowered or "gifted by nature" in lowered or "abundant" in lowered:
        return "Naturally abundant"
    if "public good" in lowered or "shared" in lowered:
        return "Shared access"
    if "dissatisfaction" in lowered or "harm" in lowered or "pollution" in lowered or "garbage" in lowered:
        return "Negative utility"
    if "human intervention" in lowered or "convert" in lowered or "conversion" in lowered:
        return "Needs intervention"
    tokens = [word for word in _TOKEN_RE.findall(text) if word.lower() not in _STOPWORDS]
    if not tokens:
        return ""
    return " ".join(tokens[:3]).title()


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
            exam_trap = _compress_core_idea((subtopic.get("exam_traps") or [""])[0], limit=10)
            quick_recall = _quick_recall_cue(" ".join(filter(None, [core_idea, exam_trap])))
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
            exam_trap = _compress_core_idea((chapter.get("exam_traps") or [""])[0], limit=10)
            if overview:
                rows.append({
                    "term": chapter_title or "Key Concept",
                    "core_idea": overview,
                    "exam_trap": exam_trap,
                    "quick_recall": _quick_recall_cue(" ".join(filter(None, [overview, exam_trap]))),
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
                "exam_trap": _compress_core_idea((chapter.get("exam_traps") or [""])[0], limit=10),
                "quick_recall": _quick_recall_cue(overview),
                "citations": (chapter.get("citations") or [])[:1],
                "confidence": round(float(chapter.get("confidence") or 0.0), 2),
                "revision_priority": float(priority_lookup.get(_normalise_concept_key(chapter.get("title", "")), {}).get("revision_priority", chapter.get("confidence") or 0.0)),
                "emphasis_level": priority_lookup.get(_normalise_concept_key(chapter.get("title", "")), {}).get("emphasis_level", "medium"),
            }],
        })
    return fallback_rows


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
    for item in content.get("glossary") or []:
        term = _normalise_ws(item.get("term", ""))
        definition = _normalise_ws(item.get("definition", ""))
        if not term or not definition:
            continue
        if term.lower() not in allowed_terms and term.lower() not in _tokenise(transcript):
            continue
        status, _ = _verify_generated_text(f"{term}. {definition}", transcript_units, minimum_score=0.3)
        if status in {"supported", "weak"}:
            glossary_out.append({"term": term, "definition": definition})

    flashcards_out = []
    for card in content.get("flashcards") or []:
        front = _normalise_ws(card.get("front", ""))
        back = _normalise_ws(card.get("back", ""))
        if not front or not back:
            continue
        status_back, _ = _verify_generated_text(back, transcript_units, minimum_score=0.3)
        status_pair, _ = _verify_generated_text(f"{front}. {back}", transcript_units, minimum_score=0.22)
        if status_back == "contradicted" or status_pair == "contradicted":
            continue
        if status_back in {"supported", "weak"} or status_pair in {"supported", "weak"}:
            flashcards_out.append({"front": front, "back": back})

    quiz_out = []
    for item in content.get("quiz") or []:
        question = _normalise_ws(item.get("question", ""))
        answer = _normalise_ws(item.get("answer", ""))
        explanation = _normalise_ws(item.get("explanation", ""))
        options = item.get("options") or []
        if not question or not answer:
            continue
        combo = ". ".join(x for x in [question, explanation] if x)
        status, _ = _verify_generated_text(combo or question, transcript_units, minimum_score=0.22)
        if status == "contradicted":
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
                continue
        if status in {"supported", "weak"}:
            quiz_out.append({
                "question": question,
                "options": options,
                "answer": answer,
                "explanation": explanation,
            })

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

    quick_review_out = []
    for item in quick_review or []:
        question = _normalise_ws(item.get("question", ""))
        answer = _normalise_ws(item.get("answer", ""))
        status, _ = _verify_generated_text(f"{question}. {answer}", transcript_units, minimum_score=0.22)
        if question and answer and status in {"supported", "weak"}:
            quick_review_out.append(item)

    takeaways_out = []
    for takeaway in takeaways or []:
        status, _ = _verify_generated_text(takeaway, transcript_units, minimum_score=0.22)
        if status in {"supported", "weak"}:
            takeaways_out.append(takeaway)

    roadmap = study_roadmap or {"next_topics": [], "prerequisites": []}
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


def enrich_lecture_payload(lecture_data: dict, section_rows: list[dict] | None = None) -> dict:
    if not lecture_data:
        return lecture_data

    transcript = lecture_data.get("transcript") or ""
    summary = lecture_data.get("master_summary") or lecture_data.get("summary") or ""
    grounded_notes = build_grounded_notes(transcript, summary, section_rows=section_rows)
    concept_sections = build_concept_sections(grounded_notes)
    claim_registry = build_claim_registry(grounded_notes)
    concept_entities = build_concept_entities(concept_sections, claim_registry)
    concept_graph = build_concept_relationship_graph(concept_entities, claim_registry)
    adaptive_intelligence = score_adaptive_concept_intelligence(concept_graph)
    relationship_concept_map = build_relationship_concept_map(concept_graph)
    verified_cheat_sheet = build_verified_cheat_sheet(concept_sections, claim_registry, adaptive_intelligence=adaptive_intelligence)
    adaptive_study_weighting = build_adaptive_study_weighting(adaptive_intelligence)

    payload = dict(lecture_data)
    payload["grounded_notes"] = grounded_notes
    payload["concept_sections"] = concept_sections
    payload["chapter_hierarchy"] = concept_sections
    payload["claim_registry"] = claim_registry
    payload["concept_entities"] = concept_entities
    payload["concept_graph"] = concept_graph
    payload["adaptive_intelligence"] = adaptive_intelligence
    payload["adaptive_study_weighting"] = adaptive_study_weighting
    payload["relationship_concept_map"] = relationship_concept_map
    payload["verified_cheat_sheet"] = verified_cheat_sheet
    payload["ai_study_aids"] = build_ai_study_aids(lecture_data)
    payload["summary_confidence"] = lecture_summary_confidence(grounded_notes)
    payload["transcript_word_count"] = len(clean_transcript(transcript).split()) if transcript else 0
    return payload
