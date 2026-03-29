import json
from openai import OpenAI
from app.core.config import settings
from fastapi import HTTPException

client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None

# Topics that benefit from deep step-by-step, formal, equation-heavy breakdowns.
_TECHNICAL_TOPICS = {
    "physics", "computer science", "medicine", "law", "mathematics",
    "chemistry", "biology", "engineering",
}

# Topics where context, significance, and interpretation matter more than derivation.
_HUMANITIES_TOPICS = {
    "history", "literature", "philosophy", "political science",
    "sociology", "art", "music", "linguistics", "psychology",
}


def _classify_topic_group(topic: str | None) -> str:
    """Returns 'technical', 'humanities', or 'general'."""
    if not topic:
        return "general"
    t = topic.lower()
    if t in _TECHNICAL_TOPICS:
        return "technical"
    if t in _HUMANITIES_TOPICS:
        return "humanities"
    return "general"


def generate_explanation(selected_text: str, mode: str = "simple", topic: str = None):
    """
    Generates a structured explanation for academic content.

    mode:  'simple' | 'technical' — controls register (plain vs. formal).
    topic: detected lecture domain — routes the depth and framing of the
           breakdown section:
             • technical topics  → step-by-step derivation / algorithm trace
             • humanities topics → historical context + significance
             • general / unknown → generic step-by-step breakdown
    """
    if not client:
        raise HTTPException(status_code=500, detail="OpenAI client not initialized")

    topic_group = _classify_topic_group(topic)
    topic_label = f" This content is from a {topic} lecture." if topic and topic != "general" else ""

    # ── System instruction ────────────────────────────────────────────────────
    if mode == "technical":
        system_instruction = (
            "You are Neurativo, an AI academic tutor."
            + topic_label +
            " Provide a rigorous, technically precise explanation using domain-specific "
            "terminology. Assume the reader has academic background. "
            "Avoid unnecessary verbosity. Return your response as a valid JSON object."
        )
    else:
        system_instruction = (
            "You are Neurativo, an AI academic tutor."
            + topic_label +
            " Explain clearly and simply, as if to someone encountering this concept "
            "for the first time. Avoid jargon unless necessary. "
            "Return your response as a valid JSON object."
        )

    # ── Breakdown section label + instruction ─────────────────────────────────
    if topic_group == "technical":
        breakdown_label = "Step-by-Step Breakdown / Derivation"
        breakdown_instruction = (
            "Provide a thorough step-by-step breakdown: show the derivation, "
            "algorithm trace, or formal proof where applicable. "
            "Include relevant equations, notation, or pseudocode."
        )
    elif topic_group == "humanities":
        breakdown_label = "Historical / Cultural Context & Significance"
        breakdown_instruction = (
            "Explain the historical or cultural context in which this concept arose, "
            "its significance and impact, and the main interpretive perspectives "
            "or scholarly debates around it."
        )
    else:
        breakdown_label = "Step-by-Step Breakdown (if applicable)"
        breakdown_instruction = "Break the concept into clear, ordered steps where applicable."

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_instruction},
                {
                    "role": "user",
                    "content": (
                        "Explain the following academic content across three dimensions:\n\n"
                        f"1. Simple Explanation\n"
                        f"2. Real-World Analogy\n"
                        f"3. {breakdown_label}: {breakdown_instruction}\n\n"
                        f"Content:\n{selected_text}\n\n"
                        "Keep the response structured and concise. "
                        "Must follow this exact JSON format:\n"
                        "{\n"
                        "  \"explanation\": \"...\",\n"
                        "  \"analogy\": \"...\",\n"
                        "  \"breakdown\": \"...\"\n"
                        "}"
                    )
                }
            ],
            temperature=0.3,
            max_tokens=700,
            response_format={"type": "json_object"}
        )

        content = response.choices[0].message.content
        return json.loads(content)

    except Exception as e:
        print(f"Error generating explanation: {e}")
        raise HTTPException(status_code=500, detail="Explanation failed")
