"""
trust_service.py - retrieval-backed grounding helpers for lecture notes.

Keeps the current summary pipeline intact while deriving a safer lecture-view
payload: grounded notes, lightweight verification metadata, citations, and a
clean separation between notes and AI study aids.
"""
from __future__ import annotations

import re
from statistics import mean

from app.services.transcript_cleaner import clean as clean_transcript

_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into",
    "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "were", "with",
    "we", "you", "they", "he", "she", "i", "our", "their", "your", "there", "here",
}
_TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9'-]{1,}")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_CONTRADICTION_PAIRS = (
    ("non economic", "economic"),
    ("positive statement", "normative statement"),
    ("positive statements", "normative statements"),
    ("increase", "decrease"),
    ("legal", "illegal"),
    ("true", "false"),
)


def _tokenise(text: str) -> set[str]:
    words = _TOKEN_RE.findall((text or "").lower())
    return {w for w in words if w not in _STOPWORDS}


def _normalise_ws(text: str) -> str:
    return " ".join((text or "").split()).strip()


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
            if line.startswith(("→", "â†’")):
                examples.append(line[1:].strip())
                continue
            if line.startswith("- "):
                bullet = line[2:].strip()
                if bullet.startswith(("→", "â†’")) or "example" in bullet.lower():
                    examples.append(bullet.lstrip("→â†’ ").strip())
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
        parts = [seg.strip() for seg in _SENTENCE_SPLIT_RE.split(line) if seg.strip()]
        if not parts:
            parts = [line]
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


def _build_units(section: dict, transcript_units: list[dict]) -> tuple[list[dict], str, float, list[dict]]:
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

    verified_section = {
        "title": section.get("title") or "Summary",
        "lead_sentence": add_unit("claim", section.get("lead_sentence", "")) or "",
        "prose": "",
        "concepts": [],
        "examples": [],
        "highlights": [],
    }

    prose_sentences = [s.strip() for s in _SENTENCE_SPLIT_RE.split(section.get("prose", "")) if s.strip()]
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
        if "weak" in statuses and "supported" not in statuses:
            note_status = "weak"
        elif "weak" in statuses:
            note_status = "supported"
        else:
            note_status = "supported"
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
    payload = dict(lecture_data)
    payload["grounded_notes"] = grounded_notes
    payload["ai_study_aids"] = build_ai_study_aids(lecture_data)
    payload["summary_confidence"] = lecture_summary_confidence(grounded_notes)
    payload["transcript_word_count"] = len(clean_transcript(transcript).split()) if transcript else 0
    return payload
