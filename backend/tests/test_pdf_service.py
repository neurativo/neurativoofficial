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


# ── _call_enrich_section — new fields: analogy, mistake, remember ──────────────

def test_enrich_section_returns_analogy_field():
    """New analogy field must appear in result when GPT returns it."""
    payload = json.dumps({
        "title": "Ohm's Law",
        "prose": "Ohm's Law relates voltage, current, and resistance.",
        "bullets": ["V = IR"],
        "concepts": ["Ohm's Law"],
        "examples": [],
        "analogy": "Think of voltage as water pressure, current as flow rate, and resistance as pipe width.",
        "mistake": None,
        "remember": "V = IR always holds for ohmic conductors.",
    })
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_enrich_section
        result = _call_enrich_section("Ohm's Law section text", 0, 1, "physics", "en")

    assert "analogy" in result
    assert "Think of voltage as water pressure" in result["analogy"]


def test_enrich_section_analogy_none_when_gpt_returns_null():
    """Null analogy from GPT must be stored as None, not the string 'null'."""
    payload = json.dumps({
        "title": "Abstract Algebra",
        "prose": "Rings generalise fields.",
        "bullets": ["Rings have two operations"],
        "concepts": ["Ring"],
        "examples": [],
        "analogy": None,
        "mistake": None,
        "remember": "A ring must be closed under addition and multiplication.",
    })
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_enrich_section
        result = _call_enrich_section("algebra text", 0, 1, "mathematics", "en")

    assert result["analogy"] is None


def test_enrich_section_returns_mistake_and_remember_fields():
    """mistake and remember fields must be present in result."""
    payload = json.dumps({
        "title": "SEO Basics",
        "prose": "SEO improves organic search ranking.",
        "bullets": ["Keywords matter"],
        "concepts": ["SEO"],
        "examples": [],
        "analogy": "Think of Google as a librarian who ranks books by relevance.",
        "mistake": "Keyword stuffing — cramming keywords destroys readability and is penalised.",
        "remember": "Content quality and backlinks are the two pillars of effective SEO.",
    })
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_enrich_section
        result = _call_enrich_section("SEO text", 0, 2, "business", "en")

    assert "mistake" in result
    assert "remember" in result
    assert "Keyword stuffing" in result["mistake"]
    assert "two pillars" in result["remember"]


def test_enrich_section_no_client_includes_new_fields():
    """When _client is None (no API key), fallback dict must include analogy/mistake/remember."""
    with patch("app.services.pdf_service._client", None):
        from app.services.pdf_service import _call_enrich_section
        result = _call_enrich_section("some section", 0, 1, None, "en")

    assert "analogy" in result
    assert result["analogy"] is None
    assert "mistake" in result
    assert result["mistake"] is None
    assert "remember" in result
    assert result["remember"] is None


# ── _call_key_stats ────────────────────────────────────────────────────────────

def test_call_key_stats_returns_list_of_dicts_with_value_and_label():
    payload = json.dumps({"stats": [
        {"value": "28-30%", "label": "of clicks go to the #1 search result"},
        {"value": "$42", "label": "returned per $1 spent on email marketing"},
        {"value": "5-7x", "label": "more to acquire than retain a customer"},
        {"value": "2-4%", "label": "average e-commerce conversion rate"},
    ]})
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_key_stats
        result = _call_key_stats("transcript about digital marketing", "business")

    assert isinstance(result, list)
    assert len(result) == 4
    assert result[0]["value"] == "28-30%"
    assert "label" in result[0]


def test_call_key_stats_returns_empty_when_no_numbers_present():
    payload = json.dumps({"stats": []})
    fake_resp = _make_chat_response(payload)

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.return_value = fake_resp
        from app.services.pdf_service import _call_key_stats
        result = _call_key_stats("a purely conceptual lecture with no numbers", None)

    assert result == []


def test_call_key_stats_returns_empty_on_api_error():
    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.side_effect = Exception("network error")
        from app.services.pdf_service import _call_key_stats
        result = _call_key_stats("transcript", "physics")

    assert result == []


def test_call_key_stats_no_client_returns_empty():
    with patch("app.services.pdf_service._client", None):
        from app.services.pdf_service import _call_key_stats
        result = _call_key_stats("transcript", "medicine")

    assert result == []
