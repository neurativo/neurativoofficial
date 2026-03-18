import app.services.openai_service as openai_service

def generate_micro_summary(text: str) -> str:
    """
    PHASE 1: Generates a micro-summary (2-4 bullet points) for a specific chunk.
    """
    if not openai_service.client: return ""
    try:
        response = openai_service.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are Neurativo. Summarize the following lecture chunk into 2-4 extremely concise bullet points."},
                {"role": "user", "content": text}
            ],
            temperature=0.2,
            max_tokens=150
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"Micro summary error: {e}")
        return ""

def generate_section_summary(micro_summaries: list) -> str:
    """
    PHASE 2: Generates a Section Summary from a list of micro-summaries.
    """
    if not openai_service.client: return ""
    combined_micro = "\n".join(micro_summaries)
    try:
        response = openai_service.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are Neurativo. Create a unified, formal section summary from these micro-summaries. Use clear paragraph form."},
                {"role": "user", "content": combined_micro}
            ],
            temperature=0.2,
            max_tokens=400
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"Section summary error: {e}")
        return ""

def generate_master_summary(section_summaries: list) -> str:
    """
    PHASE 3: Generates the Master Summary ONLY from section summaries.
    Includes a hard word cap and secondary compression pass.
    """
    if not openai_service.client: return ""
    combined_sections = "\n\n".join(section_summaries)
    try:
        response = openai_service.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are Neurativo, an academic lecture summarizer. "
                        "Create a Master Summary from the following section summaries. "
                        "Keep it under 900 words. Maintain strict academic structure: "
                        "## Overview, ## Key Points, ## Important Definitions, ## Examples. "
                        "Do not repeat information. Prioritize high-signal concepts."
                    )
                },
                {"role": "user", "content": combined_sections}
            ],
            temperature=0.2,
            max_tokens=1000
        )
        master_summary = response.choices[0].message.content

        # Hard Word Cap (Word count proxy check)
        word_count = len(master_summary.split())
        if word_count > 900:
            print(f"Master summary exceeds 900 words ({word_count}). Compressing...")
            compression_response = openai_service.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": "You are Neurativo. Compress structured summaries to under 900 words while preserving structure and key insights."
                    },
                    {
                        "role": "user",
                        "content": f"Compress the following structured summary to under 900 words while preserving structure and key insights:\n\n{master_summary}"
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
