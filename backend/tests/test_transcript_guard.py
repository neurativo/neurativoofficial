"""Live-chunk language / YouTube-outro guards."""
from app.services.transcript_guard import (
    evaluate_live_chunk,
    infer_script_language,
    is_hallucinated_transcript,
    is_youtube_outro,
    strip_outro_sentences,
    whisper_prompt_from_transcript,
)

JA_OUTRO = "本日はご覧いただきありがとうございます。良い1日を!"
JA_PYTHON = (
    "本日はご覧いただきありがとうございます。良い1日を! "
    "Pythonは高レベルのインタープレートプログラミング言語です。"
)
EN_PYTHON = (
    "Python is a high-level, interpreted programming language known for its "
    "readability and simplicity. Created by Guido van Rossum and released in 1991."
)
JA_LECTURE = (
    "今日の授業では、関数とクラスの違いについて説明します。"
    "関数は処理をまとめるための仕組みで、クラスはデータと処理を一つにします。"
)


def test_japanese_youtube_outro_is_detected():
    assert is_youtube_outro(JA_OUTRO)
    assert is_hallucinated_transcript(JA_OUTRO)


def test_english_thanks_for_watching_is_detected_as_substring():
    text = "Thank you for watching today. Have a good day!"
    assert is_youtube_outro(text)
    assert is_hallucinated_transcript(text)


def test_user_bug_first_chunk_japanese_outro_labelled_english():
    """Whisper said en, text was Japanese YouTube outro → drop, do not lock ja."""
    d = evaluate_live_chunk(JA_OUTRO, detected_language="en", stored_language=None)
    assert d.accept is False
    assert d.lock_language is False
    assert d.text == ""


def test_user_bug_poisoned_followup_chunk_dropped():
    """Japanese 'translation' of an English lecture, still labelled en → drop."""
    d = evaluate_live_chunk(JA_PYTHON, detected_language="en", stored_language=None)
    assert d.accept is False
    assert "script" in d.reason or d.reason == "youtube_outro"


def test_after_english_lock_cjk_chunk_is_dropped():
    d = evaluate_live_chunk(JA_PYTHON, detected_language="ja", stored_language="en")
    assert d.accept is False
    ja_only = "関数は処理をまとめるための仕組みで、クラスはデータと処理を一つにします。"
    d2 = evaluate_live_chunk(ja_only, detected_language="ja", stored_language="en")
    assert d2.accept is False
    assert d2.reason == "cjk_in_non_cjk_lecture"


def test_real_english_lecture_is_accepted_and_locks():
    d = evaluate_live_chunk(EN_PYTHON, detected_language="en", stored_language=None)
    assert d.accept is True
    assert d.lock_language is True
    assert d.language == "en"
    assert "Guido" in d.text


def test_real_japanese_lecture_labelled_ja_is_accepted():
    d = evaluate_live_chunk(JA_LECTURE, detected_language="ja", stored_language=None)
    assert d.accept is True
    assert d.language == "ja"
    assert d.lock_language is True


def test_sinhala_chunk_not_treated_as_garbage():
    text = "අද පාඩමේදී අපි ක්ෂුද්‍ර ආර්ථික විද්‍යාව ගැන කතා කරමු"
    d = evaluate_live_chunk(text, detected_language="si", stored_language=None)
    assert d.accept is True
    assert d.language == "si"


def test_code_switch_sinhala_then_english_kept():
    d = evaluate_live_chunk(EN_PYTHON, detected_language="en", stored_language="si")
    assert d.accept is True
    assert d.lock_language is False
    assert d.language == "si"


def test_strip_outro_keeps_english_after_japanese_thanks():
    mixed = JA_OUTRO + " " + EN_PYTHON
    kept = strip_outro_sentences(mixed)
    assert "Python is a high-level" in kept
    assert "本日は" not in kept


def test_infer_japanese_from_kana():
    assert infer_script_language(JA_OUTRO) == "ja"


def test_whisper_prompt_omits_cjk_tail_on_english_lecture():
    prompt = whisper_prompt_from_transcript(JA_PYTHON, stored_language="en")
    assert prompt is None


def test_whisper_prompt_keeps_english_tail():
    prompt = whisper_prompt_from_transcript(EN_PYTHON, stored_language="en")
    assert prompt is not None
    assert "Python" in prompt


def test_odia_garbage_lang_dropped():
    d = evaluate_live_chunk("୧୧୧୧୧୧୧୧୧୧୧୧୧୧୧୧୧୧୧୧", detected_language="or", stored_language=None)
    assert d.accept is False
