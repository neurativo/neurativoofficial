import app.services.openai_service as openai_service
from app.services.cost_tracker import log_cost

# Canonical domain labels the classifier is steered toward.
# Kept lowercase so comparisons elsewhere are case-insensitive string matches.
KNOWN_TOPICS = [
    "medicine", "law", "physics", "computer science", "history",
    "mathematics", "economics", "literature", "chemistry", "biology",
    "psychology", "philosophy", "engineering", "business", "linguistics",
    "political science", "sociology", "art", "music", "architecture",
]


def detect_lecture_topic(transcript: str) -> str:
    """
    Classifies the lecture domain from the transcript so far.
    Makes a single GPT-4o-mini call with a strict, low-temperature prompt.
    Returns a short lowercase label (max 30 chars).
    Falls back to "general" on any error.
    """
    if not openai_service.client or not transcript.strip():
        return "general"

    known_list = ", ".join(KNOWN_TOPICS)

    try:
        response = openai_service.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a lecture domain classifier. "
                        "Given a transcript excerpt, output ONLY a single short domain label. "
                        f"Prefer one from this list if it fits: {known_list}. "
                        "If none fit, output a short custom label (1-2 words, lowercase). "
                        "Output the label only — no explanation, no punctuation, no quotes."
                    )
                },
                {
                    "role": "user",
                    "content": f"Classify this lecture excerpt:\n\n{transcript[:2500]}"
                }
            ],
            temperature=0.1,
            max_tokens=10,
        )
        log_cost("topic_detection", "gpt-4o-mini",
                 input_tokens=response.usage.prompt_tokens,
                 output_tokens=response.usage.completion_tokens)
        raw = response.choices[0].message.content.strip().lower()
        return raw[:30] if raw else "general"

    except Exception as e:
        print(f"[topic_service] Detection error: {e}")
        return "general"
