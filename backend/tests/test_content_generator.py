from app.services.content_generator import summary_has_required_structure


def test_summary_has_required_structure_accepts_structured_long_summary():
    transcript = (
        "unit number one microeconomics macroeconomics positive normative statements "
        "economic goods non economic goods scarcity " * 40
    )
    summary = (
        "## Microeconomics vs. Macroeconomics\n\n"
        "Microeconomics studies individuals and firms.\n\n"
        "Key concepts: `microeconomics`, `macroeconomics`\n\n"
        "Examples:\n→ GDP is macroeconomic.\n\n---\n\n"
        "## Positive and Normative Statements\n\n"
        "Positive statements can be verified.\n\n"
        "Key concepts: `positive statements`, `normative statements`\n\n"
        "Examples:\n→ There are 300 students in the class.\n"
    )

    assert summary_has_required_structure(summary, transcript) is True


def test_summary_has_required_structure_rejects_unstructured_long_summary():
    transcript = (
        "unit number one microeconomics macroeconomics positive normative statements "
        "economic goods non economic goods scarcity " * 40
    )
    summary = "This is a generic lecture summary without section markers or grounded structure."

    assert summary_has_required_structure(summary, transcript) is False


def test_summary_has_required_structure_rejects_low_overlap_summary():
    transcript = (
        "unit number one microeconomics macroeconomics positive normative statements "
        "economic goods non economic goods scarcity " * 40
    )
    summary = (
        "## Personalized Solutions\n\n"
        "Customization improves user engagement and innovation.\n\n"
        "Key concepts: `customization`, `innovation`\n\n"
        "Examples:\n→ Feedback loops improve products.\n"
    )

    assert summary_has_required_structure(summary, transcript) is False
