import json as _json

import app.services.openai_service as openai_service
from app.services.cost_tracker import log_cost


def generate_concept_map(master_summary: str, topic: str | None = None) -> dict:
    """
    Extracts a concept map (nodes + edges) from the master summary.

    Returns:
        {
          "nodes": [{"id": "1", "label": "...", "group": "main|supporting|example"}],
          "edges": [{"source": "1", "target": "2", "label": "..."}]
        }
    """
    if not openai_service.client:
        raise Exception("OpenAI client not initialized")

    domain_hint = (
        f"This is a {topic} lecture. Use domain-appropriate concept names.\n\n"
        if topic and topic.strip() and topic.strip() != "general"
        else ""
    )

    prompt = (
        domain_hint
        + "Extract a concept map from the lecture summary below.\n\n"
        "Rules:\n"
        "- Identify 8 to 15 core concepts.\n"
        '- Each node must have: "id" (string integer), "label" (2-4 word concept name), '
        '"group" (one of: "main", "supporting", "example").\n'
        '  - "main": central/primary concepts\n'
        '  - "supporting": sub-concepts or mechanisms\n'
        '  - "example": concrete instances or applications\n'
        "- Each edge must have: \"source\" (node id), \"target\" (node id), "
        '"label" (short relationship phrase, ≤4 words).\n'
        "- Include 8 to 18 edges.\n"
        '- Return a JSON object with keys "nodes" and "edges".\n\n'
        f"Lecture summary:\n{master_summary}"
    )

    response = openai_service.client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert knowledge graph builder. "
                    "Extract structured concept maps that show how ideas relate to each other."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
        max_tokens=1200,
    )

    log_cost(
        "concept_map_generate",
        "gpt-4o-mini",
        input_tokens=response.usage.prompt_tokens,
        output_tokens=response.usage.completion_tokens,
    )

    raw = _json.loads(response.choices[0].message.content)
    nodes = []
    for n in raw.get("nodes") or []:
        if not isinstance(n, dict):
            continue
        if not n.get("id") or not n.get("label"):
            continue
        nodes.append({
            "id": str(n["id"]),
            "label": str(n["label"]).strip(),
            "group": n.get("group", "supporting") if n.get("group") in ("main", "supporting", "example") else "supporting",
        })

    edges = []
    node_ids = {n["id"] for n in nodes}
    for e in raw.get("edges") or []:
        if not isinstance(e, dict):
            continue
        src = str(e.get("source", ""))
        tgt = str(e.get("target", ""))
        if src not in node_ids or tgt not in node_ids:
            continue
        edges.append({
            "source": src,
            "target": tgt,
            "label": str(e.get("label", "")).strip(),
        })

    return {"nodes": nodes, "edges": edges}
