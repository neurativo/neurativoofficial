# backend/app/services/content_generator.py
"""
content_generator.py - single GPT call for all lecture content.

Produces in one API call:
  - master_summary   (markdown, structured sections)
  - flashcards       [{front, back}] x 10-20
  - quiz             [{question, options[4], answer, explanation}] x 5-12
  - glossary         [{term, definition}] x 10-20

Checks DB cache before calling GPT - skips if all fields already populated.
Caller (job_queue worker) is responsible for saving results to DB.
"""
import json
import re
import time
from typing import Optional

from openai import OpenAI

from app.core.config import settings
from app.services.cost_tracker import log_cost
_client = OpenAI(
    api_key=settings.OPENAI_API_KEY,
    timeout=120,
) if settings.OPENAI_API_KEY else None

# Whisper model - hardcoded, never change
WHISPER_MODEL = "whisper-1"


_DEPTH_INSTRUCTION = (
    " Preserve the exact technical depth of the speaker. "
    "If graduate-level terminology, notation, or domain jargon is used, reproduce it faithfully - "
    "do not simplify or paraphrase technical terms for a general audience."
)

_TRANSCRIPT_ONLY_RULE = (
    "\n\nCRITICAL - TRANSCRIPT FIDELITY:"
    " Only include information explicitly stated in the transcript."
    " Do NOT add background knowledge, textbook context, or explanations the professor did not give."
    " If a concept is mentioned but not elaborated on, note it briefly as 'mentioned in passing' rather than expanding it."
    " Preserve specific numbers, names, dates, and terms exactly as spoken."
    " Do not rewrite or academicise informal speech - keep the professor's own examples and phrasing."
    " It is correct and expected to produce shorter output when the lecture content is sparse."
)

_MATH_TOPICS = {
    "mathematics", "physics", "chemistry", "statistics", "calculus",
    "linear algebra", "quantum mechanics", "thermodynamics", "signal processing",
    "electrical engineering", "civil engineering", "mechanical engineering",
    "biology", "economics", "quantitative finance",
}

_CODE_TOPICS = {
    "computer science", "software engineering", "programming", "algorithms",
    "data structures", "machine learning", "deep learning", "artificial intelligence",
    "neural networks", "operating systems", "databases", "computer architecture",
    "cybersecurity", "networking",
}

_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "because", "by", "for", "from",
    "has", "have", "in", "into", "is", "it", "its", "of", "on", "or", "that",
    "the", "their", "this", "to", "was", "were", "will", "with", "your",
}


def _format_guidance(topic: str | None) -> str:
    if not topic:
        return ""
    t = topic.lower().strip()
    hints = []
    is_math = (t in _MATH_TOPICS or any(k in t for k in (
        "math", "physic", "chem", "quant", "statistic", "biolog",
        "econom", "signal", "circuit", "thermodynam", "mechan",
    )))
    is_code = (t in _CODE_TOPICS or any(k in t for k in (
        "computer", "software", "programm", "algorithm", "data structure",
        "machine learn", "neural", "deep learn",
    )))
    if is_math:
        hints.append(
            "Use LaTeX for mathematical expressions: inline with $...$ and display equations with $$...$$."
        )
    if is_code:
        hints.append(
            "Use fenced code blocks with a language tag for any code, pseudocode, or algorithmic notation."
        )
    return (" " + " ".join(hints)) if hints else ""


def _topic_hint(topic: str | None) -> str:
    if not topic or topic.strip().lower() in ("", "general"):
        return ""
    return f" This is a {topic} lecture."


def _flashcard_count(word_count: int) -> int:
    """Scale flashcard count with lecture length."""
    if word_count < 1500:
        return 8
    if word_count < 5000:
        return 12
    if word_count < 15000:
        return 16
    return 20


def _quiz_count(word_count: int) -> int:
    """Scale quiz question count with lecture length."""
    if word_count < 1500:
        return 4
    if word_count < 5000:
        return 6
    if word_count < 15000:
        return 8
    return 12


def _build_prompt(
    transcript: str,
    title: str,
    topic: str | None,
    language: str,
) -> tuple[str, str]:
    """Returns (system_prompt, user_prompt)."""
    word_count = len(transcript.split())
    n_flash = _flashcard_count(word_count)
    n_quiz = _quiz_count(word_count)
    topic_hint = _topic_hint(topic)
    fmt = _format_guidance(topic)
    lang_note = (
        "" if language == "en"
        else f" The transcript is in {language}. Write all output in the same language."
    )
    word_budget = min(1800, max(1000, 400 + word_count // 10))

    system = (
        f"You are Neurativo, an elite academic AI for students from undergrad to PhD level.{topic_hint}"
        f"{_DEPTH_INSTRUCTION}{fmt}{lang_note}"
        f"{_TRANSCRIPT_ONLY_RULE}\n\n"
        "You generate four types of learning content from a lecture transcript in a single response.\n"
        "Return ONLY valid JSON - no markdown fences, no preamble.\n\n"
        "JSON schema:\n"
        "{\n"
        '  "summary": "<markdown string - see rules below>",\n'
        '  "flashcards": [{"front": "<question or term>", "back": "<answer or definition>"}],\n'
        '  "quiz": [{"question": "<question>", "options": ["<plain option text>", "<plain option text>", "<plain option text>", "<plain option text>"], "answer": "<A/B/C/D>", "explanation": "<why correct>"}],\n'
        '  "glossary": [{"term": "<term>", "definition": "<precise academic definition>"}]\n'
        "}\n\n"
        "SUMMARY RULES:\n"
        "- Use ## Section Title headings for each major topic\n"
        "- One lead sentence per section (present tense, specific)\n"
        "- 2-3 sentences of explanation per section\n"
        "- A > blockquote with a counterintuitive or surprising insight (mandatory for every section)\n"
        "- Key concepts: `term1`, `term2`, `term3` (mandatory, backticks only)\n"
        "- Examples: → first example → second example (mandatory)\n"
        "- Do NOT use **bold**. Use `backticks` for key terms only.\n"
        f"- Maximum {word_budget} words total across all sections\n\n"
        f"FLASHCARD RULES: {n_flash} cards. Front = one focused question or key term. Back = a precise, self-contained answer or definition. "
        "Each card must be ATOMIC - test exactly ONE concept; never combine two ideas into one card. "
        "Do NOT create duplicate or near-duplicate cards; every card must cover a distinct concept. "
        "Cover the most testable concepts from the lecture. Flashcards must test subject matter concepts only. "
        "Never generate a flashcard about class logistics, exam structure, mark allocations, study plans, or anything the professor said about the class itself. "
        "Only generate cards about what the professor taught.\n\n"
        f"QUIZ RULES: {n_quiz} multiple-choice questions, each with EXACTLY 4 options and EXACTLY ONE correct answer. "
        "Options must be PLAIN text WITHOUT any 'A:'/'B:' letter prefix (the answer field carries the letter). "
        "Distractors must be plausible, mutually exclusive, and roughly the same length as the correct answer - never joke options, 'all/none of the above', or overlapping choices. "
        "The 'answer' field is a single letter A/B/C/D matching the 0-based position of the correct option. "
        "Bloom's taxonomy: mix recall, understanding, and application. Explanation must be 1-2 sentences stating why the correct option is right. "
        "Quiz questions must test understanding of subject matter concepts only. "
        "Never ask about mark allocations, exam structure, class logistics, or study plans. Every question must relate to a concept the professor actually explained.\n\n"
        "GLOSSARY RULES: 15-25 terms. Include every distinct subject matter term the professor defined or explained. "
        "Deduplicate terms (case-insensitive) - never list the same term twice. Order strictly alphabetically by term. "
        "Each definition is 1-2 precise sentences using the professor's own definition where possible, not a textbook definition. "
        "Never include terms about class logistics or exam structure."
    )

    user = (
        f"Lecture title: {title}\n\n"
        f"TRANSCRIPT:\n{transcript}"
    )

    return system, user


def _tokenise_keywords(text: str) -> set[str]:
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9'-]{2,}", (text or "").lower())
    return {w for w in words if w not in _STOPWORDS}


def summary_has_required_structure(summary: str, transcript: str = "") -> bool:
    """
    Reject obviously malformed master summaries before they are shown/exported.
    Long lectures must produce structured sections with at least some lexical
    overlap with the transcript; short lectures may use the compact fallback.
    """
    summary = (summary or "").strip()
    if not summary:
        return False

    transcript_words = len((transcript or "").split())
    is_short = transcript_words and transcript_words < 500

    if not is_short and "## " not in summary:
        return False

    summary_keys = _tokenise_keywords(summary)
    transcript_keys = _tokenise_keywords(transcript)
    if transcript_keys:
        overlap = len(summary_keys & transcript_keys)
        if overlap < 5:
            return False

    return True


def _normalise_content(data: dict) -> dict:
    """
    Defensively normalise model output so downstream rendering is always
    internally consistent:
      - flashcards: keep dicts with front/back, drop duplicates (by front+back)
      - quiz: keep well-formed items (question + >=2 options + valid A-D answer),
              strip stray 'A:'/'B:' option prefixes, coerce answer to a letter
      - glossary: drop blanks, dedupe by lowercased term, sort alphabetically
    Malformed items are skipped rather than crashing the pipeline.
    """
    # ---- flashcards ----
    flashcards = []
    seen_fc = set()
    for c in (data.get("flashcards") or []):
        if not isinstance(c, dict):
            continue
        front = str(c.get("front", "")).strip()
        back = str(c.get("back", "")).strip()
        if not front and not back:
            continue
        key = (front.lower(), back.lower())
        if key in seen_fc:
            continue
        seen_fc.add(key)
        flashcards.append({"front": front, "back": back})

    # ---- quiz ----
    quiz = []
    prefix_re = re.compile(r"^\s*[A-Da-d][:.\)]\s*")
    for q in (data.get("quiz") or []):
        if not isinstance(q, dict):
            continue
        question = str(q.get("question", "")).strip()
        raw_opts = q.get("options")
        if not question or not isinstance(raw_opts, list):
            continue
        options = [prefix_re.sub("", str(o)).strip() for o in raw_opts if str(o).strip()]
        if len(options) < 2:
            continue
        answer = str(q.get("answer", "")).strip().upper()
        letter = answer[:1] if answer[:1] in "ABCD" else "A"
        # Guard: answer letter must index into the available options.
        if ord(letter) - 65 >= len(options):
            letter = "A"
        explanation = str(q.get("explanation", "")).strip()
        quiz.append({
            "question": question,
            "options": options,
            "answer": letter,
            "explanation": explanation,
        })

    # ---- glossary ----
    glossary = []
    seen_terms = set()
    for g in (data.get("glossary") or []):
        if not isinstance(g, dict):
            continue
        term = str(g.get("term", "")).strip()
        definition = str(g.get("definition", "")).strip()
        if not term:
            continue
        key = term.lower()
        if key in seen_terms:
            continue
        seen_terms.add(key)
        glossary.append({"term": term, "definition": definition})
    glossary.sort(key=lambda x: x["term"].lower())

    return {
        "summary": data.get("summary", ""),
        "flashcards": flashcards,
        "quiz": quiz,
        "glossary": glossary,
    }


def generate(
    transcript: str,
    title: str,
    topic: str | None,
    language: str = "en",
    force: bool = False,
    existing_summary: str | None = None,
    existing_flashcards: list | None = None,
) -> dict:
    """
    Generates summary, flashcards, quiz, and glossary in one GPT call.

    Returns dict with keys: summary, flashcards, quiz, glossary.
    Returns empty dict if GPT is unavailable.

    Cache check: if existing_summary AND existing_flashcards are both non-empty
    AND force=False, returns None to signal "use cached values".
    """
    if (
        not force
        and existing_summary
        and existing_summary.strip()
        and existing_flashcards
        and len(existing_flashcards) > 0
    ):
        return None

    if not _client:
        return {}

    from app.services.trust_service import _light_clean

    original = transcript or ""
    cleaned = _light_clean(original)
    if len(cleaned.split()) < 100:
        print(
            f"[content-gen] cleaning produced too little content "
            f"({len(cleaned.split())} words) - using original transcript"
        )
        transcript = original
    else:
        transcript = cleaned

    if not transcript.strip():
        print(f"[content-gen] transcript empty after cleaning - using raw input")
        transcript = original.strip()
    print(f"[content-gen] first 300 chars of transcript sent to GPT: {transcript[:300]}")
    print(f"[content-gen] last 300 chars of transcript sent to GPT: {transcript[-300:]}")
    print(f"[content-gen] total words: {len(transcript.split())}")
    system, user = _build_prompt(transcript, title, topic, language)

    last_err = None
    for attempt in range(3):
        try:
            resp = _client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=0.2,
                max_tokens=10000,
                response_format={"type": "json_object"},
            )
            log_cost(
                "content_generate",
                "gpt-4o-mini",
                input_tokens=resp.usage.prompt_tokens,
                output_tokens=resp.usage.completion_tokens,
            )
            raw = resp.choices[0].message.content
            data = json.loads(raw)
            print(f"[content-gen] raw response length: {len(raw)}")
            print(
                f"[content-gen] raw response keys present: "
                f"{list(data.keys()) if isinstance(data, dict) else 'not a dict'}"
            )
            print(f"[content-gen] flashcards type: {type(data.get('flashcards'))}")
            print(f"[content-gen] flashcards value: {data.get('flashcards')}")
            print(f"[content-gen] quiz type: {type(data.get('quiz'))}")
            print(f"[content-gen] glossary type: {type(data.get('glossary'))}")
            return _normalise_content(data if isinstance(data, dict) else {})

        except json.JSONDecodeError as exc:
            print(f"[content_generator] JSON parse error (attempt {attempt + 1}): {exc}")
            last_err = exc
        except Exception as exc:
            last_err = exc
            print(f"[content_generator] GPT error (attempt {attempt + 1}): {exc}")
        if attempt < 2:
            time.sleep(2 ** attempt)

    print(f"[content_generator] failed after 3 attempts: {last_err}")
    return {}
