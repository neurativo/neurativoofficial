import app.services.openai_service as openai_service


def _language_instruction(language: str) -> str:
    if not language or language == "en":
        return ""
    name = openai_service.get_language_display_name(language)
    return f" Always respond in {name} ({language}), matching the lecture language."


# ─────────────────────────────────────────────────────────────────────────────
#  Topic-aware schemas
# ─────────────────────────────────────────────────────────────────────────────

# Per-topic guidance injected into the section-summary system prompt.
_SECTION_TOPIC_GUIDANCE = {
    "law": (
        "Focus on: relevant statutes and regulations, key cases cited, "
        "legal principles applied, and practical legal implications."
    ),
    "medicine": (
        "Focus on: clinical presentation and symptoms, diagnostic criteria, "
        "treatment protocols, drugs or dosages mentioned, and core medical concepts."
    ),
    "physics": (
        "Focus on: physical concepts introduced, equations and laws stated, "
        "experiments or empirical evidence discussed, and real-world applications."
    ),
    "computer science": (
        "Focus on: algorithms and their complexity, data structures used, "
        "system or architecture design decisions, and key programming concepts."
    ),
    "history": (
        "Focus on: historical context and setting, key events, influential figures, "
        "causes and effects, and historical significance."
    ),
    "mathematics": (
        "Focus on: definitions and axioms stated, theorems and proofs, "
        "methods and techniques introduced, and worked examples."
    ),
    "economics": (
        "Focus on: economic context, key models or frameworks presented, "
        "core concepts and definitions, and policy implications."
    ),
    "literature": (
        "Focus on: themes explored, key works or authors referenced, "
        "literary devices and techniques, and critical or interpretive perspectives."
    ),
    "chemistry": (
        "Focus on: reactions and mechanisms, compounds and properties, "
        "experimental procedures, and theoretical principles."
    ),
    "biology": (
        "Focus on: biological processes and systems, key organisms or structures, "
        "experimental findings, and core theoretical concepts."
    ),
    "psychology": (
        "Focus on: psychological theories and models, key experiments cited, "
        "clinical or behavioural concepts, and real-world applications."
    ),
    "philosophy": (
        "Focus on: philosophical arguments and their structure, key thinkers cited, "
        "core concepts and definitions, and counterarguments addressed."
    ),
    "engineering": (
        "Focus on: design principles and constraints, materials and methods, "
        "calculations or specifications, and practical engineering trade-offs."
    ),
}

# Per-topic section headers for the master summary.
_MASTER_TOPIC_STRUCTURE = {
    "law":              "## Legal Framework\n## Statutes & Regulations\n## Key Cases\n## Legal Principles\n## Practical Implications",
    "medicine":         "## Clinical Overview\n## Symptoms & Diagnosis\n## Treatment & Management\n## Drugs & Dosage\n## Key Concepts",
    "physics":          "## Core Concepts\n## Equations & Laws\n## Experiments & Evidence\n## Applications",
    "computer science": "## Algorithms & Complexity\n## Data Structures\n## System Design\n## Code Concepts\n## Key Takeaways",
    "history":          "## Historical Context\n## Key Events\n## Key Figures\n## Causes & Effects\n## Significance",
    "mathematics":      "## Definitions & Axioms\n## Theorems & Proofs\n## Methods & Techniques\n## Worked Examples",
    "economics":        "## Economic Context\n## Key Models\n## Core Concepts\n## Policy Implications",
    "literature":       "## Overview\n## Themes\n## Key Works & Authors\n## Literary Devices\n## Critical Perspectives",
    "chemistry":        "## Core Concepts\n## Reactions & Mechanisms\n## Compounds & Properties\n## Experimental Methods",
    "biology":          "## Overview\n## Key Processes\n## Structures & Organisms\n## Experimental Findings\n## Concepts",
    "psychology":       "## Overview\n## Key Theories\n## Experiments & Evidence\n## Clinical Concepts\n## Applications",
    "philosophy":       "## Overview\n## Core Arguments\n## Key Thinkers\n## Concepts & Definitions\n## Counterarguments",
    "engineering":      "## Design Overview\n## Principles & Methods\n## Calculations & Specs\n## Trade-offs\n## Key Takeaways",
}

_GENERIC_MASTER_STRUCTURE = "## Overview\n## Key Points\n## Important Definitions\n## Examples"


def _section_guidance(topic: str | None) -> str:
    if not topic:
        return ""
    return " " + _SECTION_TOPIC_GUIDANCE.get(topic.lower(), "")


def _master_structure(topic: str | None) -> str:
    if not topic:
        return _GENERIC_MASTER_STRUCTURE
    return _MASTER_TOPIC_STRUCTURE.get(topic.lower(), _GENERIC_MASTER_STRUCTURE)


# ─────────────────────────────────────────────────────────────────────────────
#  Summary phases
# ─────────────────────────────────────────────────────────────────────────────

def generate_micro_summary(text: str, language: str = "en") -> str:
    """
    PHASE 1: 2-4 bullet-point micro-summary for one 12-second chunk.
    Topic-agnostic — keeps it fast and cheap.
    """
    if not openai_service.client:
        return ""
    lang_note = _language_instruction(language)
    try:
        response = openai_service.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are Neurativo. Summarize the following lecture chunk "
                        "into 2-4 extremely concise bullet points." + lang_note
                    )
                },
                {"role": "user", "content": text}
            ],
            temperature=0.2,
            max_tokens=150
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"Micro summary error: {e}")
        return ""


def generate_section_summary(micro_summaries: list, language: str = "en", topic: str = None) -> str:
    """
    PHASE 2: Unified section summary from a list of micro-summaries.
    When a topic is known, domain-specific focus guidance is injected.
    """
    if not openai_service.client:
        return ""
    combined_micro = "\n".join(micro_summaries)
    lang_note      = _language_instruction(language)
    topic_note     = _section_guidance(topic)
    try:
        response = openai_service.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are Neurativo. Create a unified, formal section summary "
                        "from these micro-summaries. Use clear paragraph form."
                        + topic_note + lang_note
                    )
                },
                {"role": "user", "content": combined_micro}
            ],
            temperature=0.2,
            max_tokens=400
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"Section summary error: {e}")
        return ""


def generate_master_summary(section_summaries: list, language: str = "en", topic: str = None) -> str:
    """
    PHASE 3: Master summary built from all section summaries.
    Structure adapts to the detected lecture topic.
    Includes a hard 900-word cap with a compression pass.
    """
    if not openai_service.client:
        return ""
    combined_sections = "\n\n".join(section_summaries)
    lang_note         = _language_instruction(language)
    structure         = _master_structure(topic)
    topic_label       = f" This is a {topic} lecture." if topic and topic != "general" else ""

    try:
        response = openai_service.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are Neurativo, an academic lecture summarizer."
                        + topic_label +
                        " Create a Master Summary from the following section summaries. "
                        "Keep it under 900 words. Use this exact section structure:\n"
                        + structure +
                        "\nDo not repeat information. Prioritize high-signal concepts."
                        + lang_note
                    )
                },
                {"role": "user", "content": combined_sections}
            ],
            temperature=0.2,
            max_tokens=1000
        )
        master_summary = response.choices[0].message.content

        # Hard word cap — compress if over 900 words
        if len(master_summary.split()) > 900:
            print("Master summary exceeds 900 words. Compressing...")
            compression_response = openai_service.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are Neurativo. Compress this structured summary to under 900 words "
                            "while preserving its structure and key insights." + lang_note
                        )
                    },
                    {
                        "role": "user",
                        "content": f"Compress to under 900 words:\n\n{master_summary}"
                    }
                ],
                temperature=0.2,
                max_tokens=1000
            )
            master_summary = compression_response.choices[0].message.content

        return master_summary

    except Exception as e:
        print(f"Master summary error: {e}")
        return ""
