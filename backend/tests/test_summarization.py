import json
import pytest
from unittest.mock import MagicMock, patch


def _make_chat_response(content: str, prompt_tokens: int = 10, completion_tokens: int = 20):
    """Helper: fake openai ChatCompletion response."""
    resp = MagicMock()
    resp.choices = [MagicMock()]
    resp.choices[0].message.content = content
    resp.usage.prompt_tokens     = prompt_tokens
    resp.usage.completion_tokens = completion_tokens
    return resp


# ─────────────────────────────────────────────────────────────────────────────
# segment_transcript
# ─────────────────────────────────────────────────────────────────────────────

def test_segment_transcript_returns_parsed_json():
    """segment_transcript returns a list of dicts when GPT returns valid JSON."""
    fake_segments = [
        {"title": "Krebs Cycle", "start": 0, "end": 500},
        {"title": "Electron Transport Chain", "start": 500, "end": 1000},
    ]
    fake_response = _make_chat_response(json.dumps(fake_segments))

    with patch("app.services.openai_service.client") as mock_client, \
         patch("app.services.summarization_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_response
        from app.services.summarization_service import segment_transcript
        result = segment_transcript("some transcript text about biology")

    assert isinstance(result, list)
    assert len(result) == 2
    assert result[0]["title"] == "Krebs Cycle"
    assert result[1]["start"] == 500


def test_segment_transcript_strips_markdown_fences():
    """segment_transcript handles GPT wrapping JSON in ```json ... ``` fences."""
    fake_segments = [{"title": "Topic A", "start": 0, "end": 100}]
    fenced = f"```json\n{json.dumps(fake_segments)}\n```"
    fake_response = _make_chat_response(fenced)

    with patch("app.services.openai_service.client") as mock_client, \
         patch("app.services.summarization_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_response
        from app.services.summarization_service import segment_transcript
        result = segment_transcript("text")

    assert result[0]["title"] == "Topic A"


def test_segment_transcript_falls_back_to_thirds_on_error():
    """segment_transcript returns equal-thirds fallback when GPT raises an exception."""
    with patch("app.services.openai_service.client") as mock_client, \
         patch("app.services.summarization_service.log_cost"), \
         patch("time.sleep"):
        mock_client.chat.completions.create.side_effect = Exception("API down")
        from app.services.summarization_service import segment_transcript
        result = segment_transcript("a" * 300)

    assert len(result) == 3
    assert result[0]["start"] == 0
    assert result[2]["end"] == 300


# ─────────────────────────────────────────────────────────────────────────────
# summarize_topic_segment
# ─────────────────────────────────────────────────────────────────────────────

def test_summarize_topic_segment_returns_string():
    """summarize_topic_segment returns the GPT content as a stripped string."""
    expected = "## Photosynthesis\n\nLeaf cells convert sunlight to glucose.\n\n---"
    fake_response = _make_chat_response(f"  {expected}  ")

    with patch("app.services.openai_service.client") as mock_client, \
         patch("app.services.summarization_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_response
        from app.services.summarization_service import summarize_topic_segment
        result = summarize_topic_segment("raw transcript text", title="Photosynthesis")

    assert result == expected


def test_summarize_topic_segment_injects_title_into_prompt():
    """The section title is included in the system prompt sent to GPT."""
    captured = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        return _make_chat_response("## My Title\n\nContent.\n\n---")

    with patch("app.services.openai_service.client") as mock_client, \
         patch("app.services.summarization_service.log_cost"):
        mock_client.chat.completions.create.side_effect = fake_create
        from app.services.summarization_service import summarize_topic_segment
        summarize_topic_segment("text", title="My Title")

    system_prompt = captured["messages"][0]["content"]
    assert "My Title" in system_prompt


def test_summarize_topic_segment_returns_empty_on_blank_input():
    """summarize_topic_segment returns '' without calling GPT if text is blank."""
    with patch("app.services.openai_service.client") as mock_client:
        mock_client.chat.completions.create.side_effect = AssertionError("should not be called")
        from app.services.summarization_service import summarize_topic_segment
        result = summarize_topic_segment("   ", title="Whatever")

    assert result == ""


# ─────────────────────────────────────────────────────────────────────────────
# recompute_final_summary
# ─────────────────────────────────────────────────────────────────────────────

def test_recompute_final_summary_saves_master_and_sets_final():
    """Full happy path: chunks → segments → summaries → saved, status='final'."""
    fake_segments = [
        {"title": "Topic A", "start": 0,  "end": 10},
        {"title": "Topic B", "start": 10, "end": 20},
    ]
    saved = {}

    with patch("app.services.recompute_service.get_lecture_language", return_value="en"), \
         patch("app.services.recompute_service.get_lecture_topic", return_value="biology"), \
         patch("app.services.recompute_service.get_all_chunk_transcripts",
               return_value=["hello world", "foo bar"]), \
         patch("app.services.recompute_service.segment_transcript",
               return_value=fake_segments), \
         patch("app.services.recompute_service.summarize_topic_segment",
               side_effect=lambda text, title, **kw: f"## {title}\n\nSummary.\n\n---"), \
         patch("app.services.recompute_service.update_lecture_summary_only",
               side_effect=lambda lid, master: saved.update({"master": master})), \
         patch("app.services.recompute_service.set_summary_status",
               side_effect=lambda lid, status: saved.update({"status": status})):
        from app.services.recompute_service import recompute_final_summary
        recompute_final_summary("lecture-123")

    assert saved["status"] == "final"
    assert "## Topic A" in saved["master"]
    assert "## Topic B" in saved["master"]


def test_recompute_final_summary_sets_final_even_when_no_chunks():
    """If no chunks exist, status still becomes 'final' (no crash)."""
    status_set = {}

    with patch("app.services.recompute_service.get_lecture_language", return_value="en"), \
         patch("app.services.recompute_service.get_lecture_topic", return_value=None), \
         patch("app.services.recompute_service.get_all_chunk_transcripts", return_value=[]), \
         patch("app.services.recompute_service.set_summary_status",
               side_effect=lambda lid, s: status_set.update({"status": s})):
        from app.services.recompute_service import recompute_final_summary
        recompute_final_summary("lecture-empty")

    assert status_set["status"] == "final"
