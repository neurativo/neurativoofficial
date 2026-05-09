# backend/app/services/transcript_cleaner.py
"""
transcript_cleaner.py — pre-GPT transcript normalisation.

Pipeline:
  1. Remove Whisper artefact markers  ([silence], [music], etc.)
  2. Remove filler words
  3. Collapse repeated-word stutters   ("the the the" → "the")
  4. Remove duplicate consecutive sentences
  5. Collapse whitespace
  6. Hard-cap at MAX_WORDS words

No AI calls — pure regex/string operations. ~10 ms for a 2-hour transcript.
"""
import re

# Words considered fillers when appearing as standalone tokens.
# Do NOT remove "like" mid-sentence — only when it's a standalone filler.
_FILLERS = {
    "um", "uh", "er", "ah", "hmm", "hm", "mhm", "uhh", "umm",
    "erm", "uhm", "uhhh", "oh", "okay", "ok",
}

# Whisper silence/noise markers
_MARKER_RE = re.compile(r'\[[\w\s]+\]', re.IGNORECASE)

# Repeated word pattern: "word word" → "word"  (handles 2-6 repetitions)
_REPEAT_WORD_RE = re.compile(r'\b(\w+)(\s+\1){1,5}\b', re.IGNORECASE)

# Collapse 3+ spaces/newlines
_WHITESPACE_RE = re.compile(r'[ \t]{2,}')
_NEWLINE_RE    = re.compile(r'\n{3,}')
_TOKEN_RE = re.compile(r"\b[\w'-]+\b")

# Approximate GPT token ≈ 0.75 words for English; cap at 80K tokens input
# We cap at 60K words as a conservative estimate.
MAX_WORDS = 60_000


def _remove_fillers(text: str) -> str:
    """Remove standalone filler words."""
    tokens = text.split()
    return " ".join(t for t in tokens if t.lower().rstrip(",.!?;:") not in _FILLERS)


def _deduplicate_sentences(text: str) -> str:
    """Remove consecutive duplicate sentences (common in poor live recordings)."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    deduped = []
    prev = None
    for s in sentences:
        normalised = s.strip().lower()
        if normalised != prev:
            deduped.append(s.strip())
        prev = normalised
    return " ".join(deduped)


def _semantic_similarity(a: str, b: str) -> float:
    a_tokens = {t.lower() for t in _TOKEN_RE.findall(a)}
    b_tokens = {t.lower() for t in _TOKEN_RE.findall(b)}
    if not a_tokens or not b_tokens:
        return 0.0

    overlap = len(a_tokens & b_tokens) / max(1, min(len(a_tokens), len(b_tokens)))
    if overlap >= 0.9:
        return overlap

    a_words = a.lower().split()
    b_words = b.lower().split()
    if len(a_words) >= 6 and len(b_words) >= 6:
        prefix = sum(1 for x, y in zip(a_words, b_words) if x == y)
        suffix = sum(1 for x, y in zip(reversed(a_words), reversed(b_words)) if x == y)
        prefix_ratio = prefix / min(len(a_words), len(b_words))
        suffix_ratio = suffix / min(len(a_words), len(b_words))
        overlap = max(overlap, prefix_ratio, suffix_ratio)
    return overlap


def _deduplicate_semantic_neighbours(text: str) -> str:
    """
    Remove adjacent near-duplicate sentences that differ only slightly because of
    ASR overlap or restarts at chunk boundaries.
    """
    sentences = re.split(r'(?<=[.!?])\s+', text)
    deduped = []
    prev = None
    for sentence in sentences:
        cleaned = sentence.strip()
        if not cleaned:
            continue
        if prev is not None and _semantic_similarity(cleaned, prev) >= 0.88:
            continue
        deduped.append(cleaned)
        prev = cleaned
    return " ".join(deduped)


def clean(transcript: str) -> str:
    """
    Full cleaning pipeline. Returns cleaned transcript string.
    Safe to call with empty string — returns empty string.
    """
    if not transcript or not transcript.strip():
        return ""

    text = transcript

    # Step 1: remove Whisper markers like [silence], [music], [noise]
    text = _MARKER_RE.sub(" ", text)

    # Step 2: remove filler words
    text = _remove_fillers(text)

    # Step 3: collapse repeated-word stutters ("the the the" → "the")
    text = _REPEAT_WORD_RE.sub(r'\1', text)

    # Step 4: remove consecutive duplicate sentences
    text = _deduplicate_sentences(text)
    text = _deduplicate_semantic_neighbours(text)

    # Step 5: collapse whitespace
    text = _WHITESPACE_RE.sub(" ", text)
    text = _NEWLINE_RE.sub("\n\n", text)
    text = text.strip()

    # Step 6: hard word cap
    words = text.split()
    if len(words) > MAX_WORDS:
        text = " ".join(words[:MAX_WORDS])
        print(f"[cleaner] transcript capped at {MAX_WORDS} words (was {len(words)} words)")

    return text
