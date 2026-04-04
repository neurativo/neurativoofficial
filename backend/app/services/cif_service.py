"""
Content Intelligence Filter (CIF)

Classifies each transcribed audio chunk into one of four categories before
summarization runs. Keeps the summary pipeline clean by routing non-lecture
content away from the summarizer.

Categories:
  LECTURE           — lecturer explaining / teaching / presenting
  STUDENT_QUESTION  — a student asking a question
  LECTURER_RESPONSE — lecturer answering a student question directly
  OFF_TOPIC         — administrative, unrelated, or noise content

Fail-toward-inclusion: any error returns LECTURE so content is never
silently dropped due to a classification failure.
"""
import json

import app.services.openai_service as openai_service
from app.services.cost_tracker import log_cost

_VALID_TYPES = {"LECTURE", "STUDENT_QUESTION", "LECTURER_RESPONSE", "OFF_TOPIC"}


def classify_chunk(chunk_text: str, topic: str | None) -> dict:
    """
    Makes one GPT-4o-mini call to classify a transcript chunk.

    Returns:
        {
            "type":       "LECTURE" | "STUDENT_QUESTION" | "LECTURER_RESPONSE" | "OFF_TOPIC",
            "confidence": float  (0.0–1.0),
            "note":       str    (brief reason, empty string on error),
        }

    On any error, returns {"type": "LECTURE", "confidence": 0.5, "note": ""}
    so the summarization pipeline always proceeds safely.
    """
    if not openai_service.client:
        return {"type": "LECTURE", "confidence": 0.5, "note": ""}

    topic_hint = f" The lecture topic is {topic}." if topic else ""

    try:
        resp = openai_service.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a Content Intelligence Filter for lecture transcripts."
                        + topic_hint
                        + " Classify the following transcript chunk into exactly one category:\n"
                        "- LECTURE: lecturer explaining content, teaching, or presenting information\n"
                        "- STUDENT_QUESTION: a student asking a question\n"
                        "- LECTURER_RESPONSE: lecturer responding directly to a student question\n"
                        "- OFF_TOPIC: clearly off-topic content (administrative, unrelated, silence, noise)\n"
                        "Return only valid JSON with exactly these fields: "
                        '{"type": "LECTURE", "confidence": 0.95, "note": "brief reason"}'
                    ),
                },
                {"role": "user", "content": chunk_text[:800]},
            ],
            temperature=0.1,
            max_tokens=60,
            response_format={"type": "json_object"},
        )

        data = json.loads(resp.choices[0].message.content)

        cif_type   = data.get("type", "LECTURE")
        if cif_type not in _VALID_TYPES:
            cif_type = "LECTURE"

        confidence = float(data.get("confidence", 0.5))
        confidence = max(0.0, min(1.0, confidence))

        note = str(data.get("note", ""))

        log_cost("cif_classification", "gpt-4o-mini",
                 input_tokens=resp.usage.prompt_tokens,
                 output_tokens=resp.usage.completion_tokens)
        print(f"[CIF] type={cif_type} confidence={confidence:.2f} note={note!r}")
        return {"type": cif_type, "confidence": confidence, "note": note}

    except Exception as e:
        print(f"[CIF] Classification error (failing toward inclusion): {e}")
        return {"type": "LECTURE", "confidence": 0.5, "note": ""}
