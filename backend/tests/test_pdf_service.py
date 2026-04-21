import json
import pytest
from unittest.mock import MagicMock, patch


def _make_chat_response(content: str, prompt_tokens: int = 10, completion_tokens: int = 20):
    resp = MagicMock()
    resp.choices = [MagicMock()]
    resp.choices[0].message.content = content
    resp.usage.prompt_tokens = prompt_tokens
    resp.usage.completion_tokens = completion_tokens
    return resp


# ── _get_domain_color ──────────────────────────────────────────────────────────

def test_get_domain_color_medicine():
    from app.services.pdf_service import _get_domain_color
    assert _get_domain_color("medicine") == "#DC2626"

def test_get_domain_color_law():
    from app.services.pdf_service import _get_domain_color
    assert _get_domain_color("law") == "#1E3A5F"

def test_get_domain_color_cs():
    from app.services.pdf_service import _get_domain_color
    assert _get_domain_color("computer science") == "#4F46E5"

def test_get_domain_color_physics():
    from app.services.pdf_service import _get_domain_color
    assert _get_domain_color("physics") == "#0D9488"

def test_get_domain_color_unknown_returns_default():
    from app.services.pdf_service import _get_domain_color
    assert _get_domain_color("basket weaving") == "#2563EB"

def test_get_domain_color_none_returns_default():
    from app.services.pdf_service import _get_domain_color
    assert _get_domain_color(None) == "#2563EB"


# ── _call_enrich_section — anti-hallucination ──────────────────────────────────

def test_enrich_section_accepts_empty_concepts_and_examples():
    """GPT returning empty arrays must not be rejected — the fix removes the forced-content rule."""
    payload = json.dumps({
        "title": "Action Potential Propagation",
        "prose": "The action potential travels along the axon.",
        "bullets": ["Depolarisation occurs first"],
        "concepts": [],
        "examples": [],
    })
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_enrich_section
        result = _call_enrich_section("some section text", 0, 3, "medicine", "en")

    assert result["concepts"] == []
    assert result["examples"] == []
    assert result["title"] == "Action Potential Propagation"


def test_enrich_section_prompt_forbids_invented_content():
    """The prompt sent to GPT must NOT contain the forced-content instruction."""
    captured = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        return _make_chat_response(json.dumps({
            "title": "T", "prose": "p", "bullets": [], "concepts": [], "examples": []
        }))

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.side_effect = fake_create
        from app.services.pdf_service import _call_enrich_section
        _call_enrich_section("text", 0, 1, None, "en")

    prompt = captured["messages"][0]["content"]
    assert "must not be empty" not in prompt
    assert "Never invent" in prompt or "only if" in prompt.lower()


# ── _call_common_mistakes ──────────────────────────────────────────────────────

def test_call_common_mistakes_returns_list_of_dicts():
    payload = json.dumps({"mistakes": [
        {"mistake": "Confusing mitosis with meiosis", "correction": "Mitosis produces identical diploid cells; meiosis produces haploid gametes."},
    ]})
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_common_mistakes
        result = _call_common_mistakes("transcript about cell division", "biology")

    assert isinstance(result, list)
    assert len(result) == 1
    assert result[0]["mistake"] == "Confusing mitosis with meiosis"
    assert "correction" in result[0]


def test_call_common_mistakes_returns_empty_when_none_mentioned():
    payload = json.dumps({"mistakes": []})
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_common_mistakes
        result = _call_common_mistakes("transcript", None)

    assert result == []


def test_call_common_mistakes_returns_empty_on_api_error():
    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.side_effect = Exception("API down")
        from app.services.pdf_service import _call_common_mistakes
        result = _call_common_mistakes("transcript", "physics")

    assert result == []


# ── _call_mnemonics ────────────────────────────────────────────────────────────

def test_call_mnemonics_returns_merged_glossary():
    """Mnemonics are merged back into the glossary list by term name."""
    glossary = [
        {"term": "Mitosis", "definition": "Cell division producing identical daughter cells."},
        {"term": "Meiosis", "definition": "Cell division producing haploid gametes."},
    ]
    payload = json.dumps({"mnemonics": [
        {"term": "Mitosis", "mnemonic": "MITosis = MITtens — two identical hands"},
        {"term": "Meiosis", "mnemonic": None},
    ]})
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_mnemonics
        result = _call_mnemonics(glossary)

    assert result[0]["mnemonic"] == "MITosis = MITtens — two identical hands"
    assert result[1].get("mnemonic") is None


def test_call_mnemonics_handles_api_error_gracefully():
    """On API error, original glossary list is returned unchanged."""
    glossary = [{"term": "ATP", "definition": "Energy currency of the cell."}]
    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.side_effect = Exception("timeout")
        from app.services.pdf_service import _call_mnemonics
        result = _call_mnemonics(glossary)

    assert result == glossary  # unchanged


def test_call_mnemonics_empty_glossary_returns_empty():
    from app.services.pdf_service import _call_mnemonics
    assert _call_mnemonics([]) == []
