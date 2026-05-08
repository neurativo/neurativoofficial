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

    def fake_get_lecture(lecture_id):
        return {"summary": "Negligence requires duty, breach, causation, and damages."}

    def fake_get_sections(lecture_id):
        return ["Duty of care and breach are core negligence elements."]

    def fake_get_visuals(lecture_id):
        return []

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
        mock.patch("app.services.qa_service.get_lecture_for_summarization", fake_get_lecture),
        mock.patch("app.services.qa_service.get_section_summaries", fake_get_sections),
        mock.patch("app.services.qa_service.get_visual_frames", fake_get_visuals),
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


def test_visual_questions_include_visual_context():
    import unittest.mock as mock

    def fake_get_transcript(lecture_id):
        return "The lecturer described the neural network, then pointed to the diagram."

    def fake_get_lecture(lecture_id):
        return {"summary": "A lecture about neural network architecture."}

    def fake_get_sections(lecture_id):
        return ["The lecture explains the input, hidden, and output layers."]

    def fake_get_visuals(lecture_id):
        return [
            {
                "timestamp_seconds": 90,
                "formatted_text": "Input layer -> Hidden layer -> Output layer",
                "summary": "Network architecture diagram",
                "equations": [],
                "diagrams": ["Three-layer neural network"],
                "title": "Network Diagram",
                "code": "",
            }
        ]

    def fake_get_cached(lecture_id):
        return {}

    def fake_save_cache(lecture_id, entries):
        pass

    fake_embedding = [0.1] * 1536

    def fake_get_embeddings(texts):
        return [fake_embedding] * len(texts)

    fake_completion = mock.MagicMock()
    fake_completion.choices = [mock.MagicMock()]
    fake_completion.choices[0].message.content = (
        'ANSWER: It showed a three-layer neural network.\n'
        'DETAIL: The diagram connected the input layer to a hidden layer and then the output layer.\n'
        'SOURCE: "missing quote"'
    )
    fake_completion.usage.prompt_tokens = 10
    fake_completion.usage.completion_tokens = 10

    with (
        mock.patch("app.services.qa_service.get_lecture_transcript", fake_get_transcript),
        mock.patch("app.services.qa_service.get_lecture_for_summarization", fake_get_lecture),
        mock.patch("app.services.qa_service.get_section_summaries", fake_get_sections),
        mock.patch("app.services.qa_service.get_visual_frames", fake_get_visuals),
        mock.patch("app.services.qa_service.get_cached_embeddings", fake_get_cached),
        mock.patch("app.services.qa_service.save_embeddings_cache", fake_save_cache),
        mock.patch("app.services.qa_service.get_embeddings", fake_get_embeddings),
        mock.patch("app.services.qa_service.cosine_similarity", return_value=0.9),
        mock.patch("app.services.openai_service.client") as mock_client,
        mock.patch("app.services.qa_service.log_cost"),
    ):
        mock_client.chat.completions.create.return_value = fake_completion
        result = answer_lecture_question("lec123", "What did the diagram show?", topic="computer science")
        call_args = mock_client.chat.completions.create.call_args
        user_msg = call_args[1]["messages"][1]["content"]
        assert "Visual Frame 1" in user_msg
        assert 'SOURCE: "missing quote"' not in result
        assert "SOURCE:" in result
