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
    "economics", "microeconomics", "macroeconomics", "positive", "normative",
    "goods", "resources", "production", "utility", "demand", "supply",
    "law", "rights", "biology", "medicine", "physics", "chemistry",
    "engineering", "calculus", "statistics", "classification", "theory",
    "structure", "strategy", "comparison", "statements", "concepts",
)
_EXAMPLE_HINTS = (
    "example", "illustration", "scenario", "case", "instance", "sample",
    "population growth", "bottled water", "oxygen tank", "rainwater",
)
_BOUNDARY_HINTS = (
    "exam", "study", "microeconomics", "macroeconomics", "positive", "normative",
    "utility", "goods", "free goods", "public goods", "economic bads",
    "resources", "production", "human intervention",
)


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
    if concept_count <= 1 and not prose and len(note.get("examples") or []) > 0:
        return True
    return False


def _is_major_concept_note(note: dict) -> bool:
    title = _derive_title(note.get("title", ""), note.get("lead_sentence", ""), note.get("concepts") or [])
    strength = _title_quality(title, note)
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

    current_words = sum(_note_density(note) for note in current)
    candidate_words = _note_density(candidate)
    candidate_title = _derive_title(candidate.get("title", ""), candidate.get("lead_sentence", ""), candidate.get("concepts") or [])
    candidate_strength = _title_quality(candidate_title, candidate)
    weak_candidate = candidate_strength < 1.5 or (candidate_words < 35 and candidate_strength < 2.5)
    example_support = _supports_current_examples(current, candidate)
    citation_gap = _citation_gap_seconds(current, candidate)

    if _is_example_like(candidate) and (example_support >= 0.18 or citation_gap is None or citation_gap <= 60):
        return True
    if weak_candidate and not _is_major_concept_note(candidate):
        return True
    if _same_major_family(current, candidate):
        return True
    if citation_gap is not None and citation_gap >= 120 and _is_major_concept_note(candidate):
        return False
    if _is_major_concept_note(candidate):
        return False
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

    for note in notes:
        title = _derive_title(note.get("title", ""), note.get("lead_sentence", ""), note.get("concepts") or [])
        if title and title.lower() not in _GENERIC_TITLES and not re.fullmatch(r"section\s+\d+", title.lower()):
            subsection_titles.append(title)

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
    subsection_titles = [s for s in _dedupe_texts(subsection_titles) if s != title][:4]

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
        "subsections": subsection_titles,
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
        contradicted = _is_contradicted(cleaned, evidence["text"] if evidence else "")
        status = _status_from_score(score, contradicted)
        if status in {"unsupported", "contradicted"}:
            return None

        unit = {
            "type": kind,
            "text": cleaned,
            "confidence": round(score, 2),
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
        merge_index = min(
            range(1, len(chapters)),
            key=lambda idx: (
                len(chapters[idx - 1]) + len(chapters[idx]),
                _title_quality(chapters[idx][0].get("title", ""), chapters[idx][0]),
            ),
        )
        chapters[merge_index - 1].extend(chapters[merge_index])
        del chapters[merge_index]

    return [_merge_chapter_notes(group) for group in chapters if group]


def _verify_generated_text(text: str, transcript_units: list[dict], minimum_score: float = 0.42) -> tuple[str, float]:
    cleaned = _normalise_ws(text)
    if not cleaned:
        return "unsupported", 0.0
    evidence, score = _find_best_evidence(cleaned, transcript_units)
    contradicted = _is_contradicted(cleaned, evidence["text"] if evidence else "")
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

    payload = dict(lecture_data)
    payload["grounded_notes"] = grounded_notes
    payload["concept_sections"] = concept_sections
    payload["ai_study_aids"] = build_ai_study_aids(lecture_data)
    payload["summary_confidence"] = lecture_summary_confidence(grounded_notes)
    payload["transcript_word_count"] = len(clean_transcript(transcript).split()) if transcript else 0
    return payload
