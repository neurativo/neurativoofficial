"""
Live-transcript guards.

Whisper often invents YouTube outros on the first quiet 12s of a recording
(especially in Japanese). If that text is saved, the next chunk's prompt
locks the session into the wrong language.

This module decides whether a chunk is real lecture speech, and whether
its language should be persisted. It does not pin Whisper's language —
Sinhala/Tamil/English code-switching still works.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass

# True silence-garbage codes. ja/zh/si are real lecture languages and must
# not be blanket-dropped — they are handled via script + outro checks.
GARBAGE_LANGS = frozenset({"or", "bo", "km", "lo", "my", "am"})
CJK_LANGS = frozenset({"ja", "zh", "ko"})

# Exact short strings only (too small to use as substrings).
_EXACT_OUTROS = {
    "bye",
    "bye bye",
}

# Substring fragments. Long enough that they will not match real lecture prose.
_OUTRO_FRAGMENTS = (
    "thank you for watching",
    "thanks for watching",
    "thank you for listening",
    "thanks for listening",
    "please subscribe",
    "like and subscribe",
    "subscribe to my channel",
    "don't forget to subscribe",
    "see you in the next video",
    "see you next time",
    "i'll see you in the next one",
    # Japanese YouTube outros — the failure that poisoned English lectures.
    "本日はご覧",
    "ご覧いただき",
    "ありがとうございました",
    "ありがとうござい",
    "良い1日",
    "よい一日",
    "良い一日",
    "チャンネル登録",
    "次の動画",
    "ご視聴",
    # Chinese / Korean variants of the same hallucination.
    "谢谢观看",
    "感謝觀看",
    "感谢观看",
    "请订阅",
    "請訂閱",
    "시청해주셔서",
    "구독",
)

_HIRAGANA = re.compile(r"[\u3040-\u309f]")
_KATAKANA = re.compile(r"[\u30a0-\u30ff]")
_HAN = re.compile(r"[\u3400-\u9fff]")
_HANGUL = re.compile(r"[\uac00-\ud7af]")
_LATIN = re.compile(r"[A-Za-z]")
_SINHALA = re.compile(r"[\u0d80-\u0dff]")
_TAMIL = re.compile(r"[\u0b80-\u0bff]")
_LETTERS = re.compile(r"[^\W\d_]", re.UNICODE)
_SENTENCE_SPLIT = re.compile(r"(?<=[。！？.!?])\s*")


@dataclass(frozen=True)
class ChunkDecision:
    accept: bool
    text: str
    language: str | None
    reason: str
    lock_language: bool = False


def _letters(text: str) -> str:
    return "".join(_LETTERS.findall(text or ""))


def cjk_ratio(text: str) -> float:
    letters = _letters(text)
    if not letters:
        return 0.0
    cjk = sum(
        1
        for ch in letters
        if _HIRAGANA.match(ch) or _KATAKANA.match(ch) or _HAN.match(ch) or _HANGUL.match(ch)
    )
    return cjk / len(letters)


def infer_script_language(text: str) -> str | None:
    """Best-effort language from writing system, ignoring Whisper's label."""
    letters = _letters(text)
    if len(letters) < 4:
        return None
    n = len(letters)
    hira = sum(1 for ch in letters if _HIRAGANA.match(ch)) / n
    kata = sum(1 for ch in letters if _KATAKANA.match(ch)) / n
    han = sum(1 for ch in letters if _HAN.match(ch)) / n
    hang = sum(1 for ch in letters if _HANGUL.match(ch)) / n
    sinh = sum(1 for ch in letters if _SINHALA.match(ch)) / n
    tam = sum(1 for ch in letters if _TAMIL.match(ch)) / n
    lat = sum(1 for ch in letters if _LATIN.match(ch)) / n
    if hang >= 0.20:
        return "ko"
    if hira + kata >= 0.08:
        return "ja"
    if han >= 0.30:
        return "zh"
    if sinh >= 0.20:
        return "si"
    if tam >= 0.20:
        return "ta"
    if lat >= 0.50:
        return "en"
    return None


def effective_language(text: str, claimed: str | None) -> str | None:
    """
    If Whisper says 'en' but the glyphs are Japanese, trust the glyphs.
    Latin claimed codes (en/es/fr/…) are kept when the script is Latin.
    """
    script = infer_script_language(text)
    claimed = (claimed or "").strip() or None
    if script in CJK_LANGS and claimed not in CJK_LANGS:
        return script
    return claimed or script


def is_youtube_outro(text: str) -> bool:
    if not text or not text.strip():
        return False
    folded = text.strip().casefold()
    exact = folded.rstrip("!.。！ ").strip()
    if exact in _EXACT_OUTROS:
        return True
    return any(frag.casefold() in folded for frag in _OUTRO_FRAGMENTS)


def is_hallucinated_transcript(text: str) -> bool:
    """YouTube outros, plus Whisper's repetitive-character loops."""
    if not text or not text.strip():
        return False
    if is_youtube_outro(text):
        # Whole chunk is an outro, or leftover after stripping is just a sign-off.
        stripped = strip_outro_sentences(text)
        if len(_letters(stripped)) < 40:
            return True

    chars = [c for c in text if not c.isspace() and c not in ".,!?;:-。、"]
    if len(chars) >= 20:
        if len(set(chars)) / len(chars) <= 0.10:
            return True

    words = text.split()
    if len(words) >= 6:
        top_word_count = Counter(words).most_common(1)[0][1]
        if top_word_count / len(words) >= 0.60:
            return True

    if len(words) >= 12:
        for n in (3, 4, 5):
            ngrams = [" ".join(words[i : i + n]) for i in range(len(words) - n + 1)]
            if ngrams:
                top_count = Counter(ngrams).most_common(1)[0][1]
                if top_count >= 4:
                    return True

    return False


def strip_outro_sentences(text: str) -> str:
    """Drop sentences that are YouTube outros; keep real lecture prose."""
    raw = (text or "").strip()
    if not raw:
        return ""
    parts = [p.strip() for p in _SENTENCE_SPLIT.split(raw) if p and p.strip()]
    if len(parts) <= 1:
        return "" if is_youtube_outro(raw) else raw
    kept = [p for p in parts if not is_youtube_outro(p)]
    leftover = " ".join(kept).strip()
    # If we stripped an outro and only a short sign-off remains, drop it all.
    if leftover and len(_letters(leftover)) < 40:
        return ""
    return leftover


def strip_cjk_sentences(text: str) -> str:
    parts = [p.strip() for p in _SENTENCE_SPLIT.split(text or "") if p and p.strip()]
    if not parts:
        return text.strip() if text and cjk_ratio(text) < 0.30 else ""
    kept = [p for p in parts if cjk_ratio(p) < 0.30]
    return " ".join(kept).strip()


def _confirmed_language(stored: str | None) -> str | None:
    """Empty / placeholder 'en' from lecture insert is treated as unset."""
    if not stored:
        return None
    return stored


def evaluate_live_chunk(
    text: str,
    detected_language: str | None,
    stored_language: str | None,
) -> ChunkDecision:
    """
    Decide whether this live chunk belongs in the transcript.

    stored_language should be None until the first *accepted* chunk locks it.
    Live sessions must not pre-fill language='en' or Japanese lectures get dropped.
    """
    raw = (text or "").strip()
    if not raw:
        return ChunkDecision(False, "", None, "empty")

    stored = _confirmed_language(stored_language)
    cleaned = strip_outro_sentences(raw)
    if not cleaned:
        return ChunkDecision(False, "", None, "youtube_outro")

    if is_hallucinated_transcript(cleaned):
        return ChunkDecision(False, "", None, "hallucinated")

    eff = effective_language(cleaned, detected_language)
    if eff in GARBAGE_LANGS:
        return ChunkDecision(False, "", None, f"garbage_lang:{eff}")

    cjk_dom = cjk_ratio(cleaned) >= 0.30
    claimed = (detected_language or "").strip() or None

    # Whisper labelled this English (or another non-CJK code) but wrote CJK.
    # That is the silence-outro / prompt-poison path, not a Japanese lecture.
    if cjk_dom and claimed not in CJK_LANGS:
        return ChunkDecision(False, "", None, "script_vs_claimed_mismatch")

    if stored in CJK_LANGS:
        return ChunkDecision(True, cleaned, stored, "cjk_lecture", lock_language=False)

    if stored:
        if cjk_dom:
            return ChunkDecision(False, "", stored, "cjk_in_non_cjk_lecture")
        latin_only = strip_cjk_sentences(cleaned)
        if not latin_only:
            return ChunkDecision(False, "", stored, "cjk_in_non_cjk_lecture")
        return ChunkDecision(True, latin_only, stored, "accepted", lock_language=False)

    # Language not locked yet.
    if cjk_dom and len(_letters(cleaned)) < 24:
        return ChunkDecision(False, "", None, "early_cjk")

    lock_lang = eff or claimed
    return ChunkDecision(True, cleaned, lock_lang, "accepted_first", lock_language=bool(lock_lang))


def whisper_prompt_from_transcript(transcript: str | None, stored_language: str | None) -> str | None:
    """Last ~50 words, omitted when they would re-seed a CJK hallucination."""
    if not transcript or not transcript.strip():
        return None
    words = transcript.split()
    prompt = " ".join(words[-50:])
    stored = _confirmed_language(stored_language)
    if stored not in CJK_LANGS and cjk_ratio(prompt) >= 0.30:
        return None
    return prompt
