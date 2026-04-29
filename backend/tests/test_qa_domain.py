import inspect
from app.services.qa_service import answer_lecture_question


def test_answer_lecture_question_accepts_topic():
    sig = inspect.signature(answer_lecture_question)
    assert "topic" in sig.parameters
    assert sig.parameters["topic"].default is None


def test_domain_context_injected_in_prompt():
    """Verify topic flows into the system prompt string."""
    import unittest.mock as mock
    from app.services import openai_service

    def fake_get_transcript(lecture_id):
        return "The defendant breached the duty of care in the tort of negligence."

    def fake_get_cached(lecture_id):
        return {}

    def fake_save_cache(lecture_id, entries):
        pass

    fake_embedding = [0.1] * 1536

    def fake_get_embeddings(texts):
        return [fake_embedding] * len(texts)

    fake_completion = mock.MagicMock()
    fake_completion.choices = [mock.MagicMock()]
    fake_completion.choices[0].message.content = "ANSWER: test\nDETAIL: detail\nSOURCE: source"
    fake_completion.usage.prompt_tokens = 10
    fake_completion.usage.completion_tokens = 10

    with (
        mock.patch("app.services.qa_service.get_lecture_transcript", fake_get_transcript),
        mock.patch("app.services.qa_service.get_cached_embeddings", fake_get_cached),
        mock.patch("app.services.qa_service.save_embeddings_cache", fake_save_cache),
        mock.patch("app.services.qa_service.get_embeddings", fake_get_embeddings),
        mock.patch("app.services.qa_service.cosine_similarity", return_value=0.9),
        mock.patch("app.services.openai_service.client") as mock_client,
        mock.patch("app.services.qa_service.log_cost"),
    ):
        mock_client.chat.completions.create.return_value = fake_completion
        answer_lecture_question("lec123", "What is negligence?", topic="law")
        call_args = mock_client.chat.completions.create.call_args
        system_msg = call_args[1]["messages"][0]["content"]
        assert "law" in system_msg
