from unittest.mock import MagicMock


def _seg(text, no_speech_prob):
    s = MagicMock()
    s.text = text
    s.no_speech_prob = no_speech_prob
    return s


def test_all_segments_below_threshold_kept():
    from app.services.openai_service import filter_segments_by_confidence
    segs = [_seg("Hello world", 0.1), _seg("this is a test", 0.3)]
    assert filter_segments_by_confidence(segs) == "Hello world this is a test"


def test_segments_above_threshold_dropped():
    from app.services.openai_service import filter_segments_by_confidence
    segs = [_seg("real speech", 0.2), _seg("ありがとうございました", 0.9)]
    assert filter_segments_by_confidence(segs) == "real speech"


def test_segment_exactly_at_threshold_is_kept():
    from app.services.openai_service import filter_segments_by_confidence
    segs = [_seg("borderline", 0.6)]
    assert filter_segments_by_confidence(segs) == "borderline"


def test_all_segments_above_threshold_returns_empty():
    from app.services.openai_service import filter_segments_by_confidence
    segs = [_seg("noise", 0.7), _seg("hiss", 0.95)]
    assert filter_segments_by_confidence(segs) == ""


def test_empty_input_returns_empty():
    from app.services.openai_service import filter_segments_by_confidence
    assert filter_segments_by_confidence([]) == ""


def test_missing_no_speech_prob_defaults_to_zero_and_is_kept():
    from app.services.openai_service import filter_segments_by_confidence
    s = MagicMock(spec=[])
    s.text = "good speech"
    assert filter_segments_by_confidence([s]) == "good speech"
