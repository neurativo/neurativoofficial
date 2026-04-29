import pytest
from app.services.summarization_service import _section_guidance, _master_structure


def test_section_guidance_known_domain():
    result = _section_guidance("law")
    assert "statutes" in result or "legal" in result.lower()


def test_section_guidance_new_known_domain():
    result = _section_guidance("business")
    assert "business" in result.lower() or "strategic" in result.lower()


def test_section_guidance_unknown_domain_dynamic_fallback():
    result = _section_guidance("marine biology")
    assert "marine biology" in result
    assert "domain-appropriate" in result or "terminology" in result


def test_section_guidance_none_returns_empty():
    assert _section_guidance(None) == ""
    assert _section_guidance("") == ""


def test_master_structure_with_topic():
    result = _master_structure("mathematics")
    assert "mathematics" in result
    assert "theorem" in result or "proof" in result or "field" in result


def test_master_structure_general_no_domain_hint():
    result = _master_structure("general")
    # "general" topic must not inject the domain framing sentence
    assert "This is a general lecture" not in result


def test_master_structure_none_no_domain_hint():
    result = _master_structure(None)
    assert result  # non-empty — still contains title instruction


def test_generate_micro_summary_signature_accepts_topic():
    # Verify the function accepts topic without raising TypeError
    import inspect
    from app.services.summarization_service import generate_micro_summary
    sig = inspect.signature(generate_micro_summary)
    assert "topic" in sig.parameters
    assert sig.parameters["topic"].default is None
