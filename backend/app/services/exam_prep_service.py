import json as _json

import app.services.openai_service as openai_service
from app.services.cost_tracker import log_cost

_SHORT_LECTURE_WORD_THRESHOLD = 1500  # same as content_generator


def generate_exam_prep(master_summary: str, glossary: list, topic: str | None = None) -> list[dict]:
    """
    Generates 5–8 open-ended exam-style questions with model answers,
    key bullet points, and difficulty labels.

    Returns a list of dicts:
        {question, model_answer, key_points: [str], difficulty: "easy"|"medium"|"hard"}
    """
    if not openai_service.client:
        raise Exception("OpenAI client not initialized")

    word_count = len(master_summary.split())
    num_questions = 5 if word_count < _SHORT_LECTURE_WORD_THRESHOLD else 8

    domain_hint = (
        f"This is a {topic} lecture. Use domain-appropriate terminology and reasoning.\n\n"
        if topic and topic.strip() and topic.strip() != "general"
        else ""
    )

    glossary_terms = ""
    if glossary:
        terms = [g.get("term", "") for g in glossary if isinstance(g, dict) and g.get("term")]
        if terms:
            glossary_terms = "Key terms from this lecture: " + ", ".join(terms[:20]) + "\n\n"

    prompt = (
        domain_hint
        + glossary_terms
        + f"Based on the lecture summary below, generate exactly {num_questions} open-ended exam-style questions.\n\n"
        "For each question return a JSON object with these keys:\n"
        '  "question": the exam question (one sentence)\n'
        '  "model_answer": a thorough 2-4 sentence model answer\n'
        '  "key_points": an array of 2-4 short bullet strings summarising key marking points\n'
        '  "difficulty": one of "easy", "medium", or "hard"\n\n'
        f"Return a JSON object with a single key \"questions\" whose value is an array of {num_questions} objects.\n\n"
        f"Lecture summary:\n{master_summary}"
    )

    response = openai_service.client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert exam question writer. "
                    "Generate challenging but fair exam questions that test deep understanding, "
                    "not just recall. Vary difficulty across the set."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.4,
        max_tokens=2000,
    )

    log_cost(
        "exam_prep_generate",
        "gpt-4o-mini",
        input_tokens=response.usage.prompt_tokens,
        output_tokens=response.usage.completion_tokens,
    )

    raw = _json.loads(response.choices[0].message.content)
    questions = raw.get("questions") or []
    # Validate and sanitize each question dict
    result = []
    for q in questions:
        if not isinstance(q, dict):
            continue
        if not q.get("question") or not q.get("model_answer"):
            continue
        result.append({
            "question": str(q["question"]).strip(),
            "model_answer": str(q["model_answer"]).strip(),
            "key_points": [str(p).strip() for p in q.get("key_points", []) if str(p).strip()],
            "difficulty": q.get("difficulty", "medium") if q.get("difficulty") in ("easy", "medium", "hard") else "medium",
        })
    return result
