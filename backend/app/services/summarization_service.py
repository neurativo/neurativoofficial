import json
import time
import app.services.openai_service as openai_service
from app.services.cost_tracker import log_cost


def _language_instruction(language: str) -> str:
    if not language or language == "en":
        return ""
    name = openai_service.get_language_display_name(language)
    return f" Always respond in {name} ({language}), matching the lecture language."


def _multilingual_instruction() -> str:
    return (
        " The transcript may contain mixed languages (e.g. English with Sinhala, "
        "Tamil, Arabic, or other local languages). Extract meaning accurately from "
        "all languages present. Always write your response in English."
    )


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
    "business": (
        "Focus on: key business models and strategies, financial concepts, "
        "market dynamics, organisational decisions, and real-world case studies."
    ),
    "linguistics": (
        "Focus on: language structures and rules (phonological, syntactic, semantic), "
        "theoretical frameworks, examples of usage, and cross-linguistic comparisons."
    ),
    "political science": (
        "Focus on: political systems and institutions, governance structures, "
        "policy arguments, ideological positions, and real-world case studies."
    ),
    "sociology": (
        "Focus on: social structures and institutions, theoretical frameworks, "
        "empirical findings, group dynamics, and cultural analysis."
    ),
    "art": (
        "Focus on: artistic movements and styles, works and artists referenced, "
        "compositional techniques, historical context, and critical perspectives."
    ),
    "music": (
        "Focus on: musical concepts (harmony, rhythm, form, structure), "
        "composers and works referenced, analytical observations, and historical context."
    ),
    "architecture": (
        "Focus on: architectural styles and movements, structural and material principles, "
        "notable buildings and architects referenced, and design rationale."
    ),
    "general": (
        "Focus on: key concepts introduced, main arguments or findings, "
        "important definitions, and practical implications."
    ),
}

_TITLE_INSTRUCTION = (
    "Generate section titles that specifically describe what is taught in each section "
    "of THIS lecture. Do not use generic category names like 'Overview', 'Key Processes', "
    "'Experimental Findings', 'Concepts', 'Applications', 'Introduction', or 'Summary'. "
    "Use specific descriptive titles like 'Circulatory and Respiratory System Interdependence' "
    "or 'Endocrine Hormones and Metabolism'. Each title must reflect the actual content "
    "of that section."
)


def _section_guidance(topic: str | None) -> str:
    if not topic:
        return ""
    known = _SECTION_TOPIC_GUIDANCE.get(topic.lower())
    if known:
        return " " + known
    # Dynamic fallback — handles any niche or custom field
    return (
        f" This is a {topic} lecture. Apply domain-appropriate summarization: "
        "focus on the key terminology, core concepts, methodologies, and "
        "important findings specific to this field."
    )


def _master_structure(topic: str | None) -> str:
    base = _TITLE_INSTRUCTION
    if topic and topic != "general":
        base += (
            f" This is a {topic} lecture — structure the master summary to reflect "
            "how this field organises knowledge (e.g. theorem/proof for mathematics, "
            "case/principle for law, concept/application for science)."
        )
    return base


# ─────────────────────────────────────────────────────────────────────────────
#  Summary phases
# ─────────────────────────────────────────────────────────────────────────────

def generate_micro_summary(text: str, language: str = "en") -> str:
    """
    PHASE 1: 2-4 bullet-point micro-summary for one 12-second chunk.
    Topic-agnostic — keeps it fast and cheap.
    Retries up to 3 times with exponential backoff (1s, 2s) on failure.
    """
    if not openai_service.client:
        return ""
    lang_note = _multilingual_instruction()
    last_err = None
    for attempt in range(3):
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
            log_cost("micro_summary", "gpt-4o-mini",
                     input_tokens=response.usage.prompt_tokens,
                     output_tokens=response.usage.completion_tokens)
            return response.choices[0].message.content
        except Exception as e:
            last_err = e
            if attempt < 2:
                time.sleep(2 ** attempt)
    print(f"Micro summary error after 3 attempts: {last_err}")
    return ""


def generate_section_summary(micro_summaries: list, language: str = "en", topic: str = None) -> str:
    """
    PHASE 2: Unified section summary from a list of micro-summaries.
    When a topic is known, domain-specific focus guidance is injected.
    Retries up to 3 times with exponential backoff (1s, 2s) on failure.
    """
    if not openai_service.client:
        return ""
    combined_micro = "\n".join(micro_summaries)
    lang_note      = _multilingual_instruction()
    topic_note     = _section_guidance(topic)
    last_err = None
    for attempt in range(3):
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
            log_cost("section_summary", "gpt-4o-mini",
                     input_tokens=response.usage.prompt_tokens,
                     output_tokens=response.usage.completion_tokens)
            return response.choices[0].message.content
        except Exception as e:
            last_err = e
            if attempt < 2:
                time.sleep(2 ** attempt)
    print(f"Section summary error after 3 attempts: {last_err}")
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
    lang_note         = _multilingual_instruction()
    structure         = _master_structure(topic)
    topic_label       = f" This is a {topic} lecture." if topic and topic != "general" else ""

    # Per-section format template injected into the prompt so GPT outputs
    # structured markdown that the frontend parseSummary() function can parse.
    section_format = (
        "For EACH section use this exact markdown format — no deviations:\n\n"
        "## Section Title\n\n"
        "One lead sentence capturing the single most important idea of this section.\n\n"
        "Main prose explanation in 2-3 sentences giving context and depth.\n\n"
        "> You MUST include a blockquote insight for EVERY section."
        " Every topic has at least one counterintuitive or surprising truth — find it and write it here."
        " No section should be missing this line.\n\n"
        "Key concepts: `concept one`, `concept two`, `concept three`, `concept four`\n\n"
        "Examples:\n"
        "→ First concrete example or real-world application\n"
        "→ Second concrete example or real-world application\n\n"
        "---\n\n"
        "STRICT RULES:\n"
        "- Every section MUST have a 'Key concepts:' line with backtick-wrapped terms.\n"
        "- Every section MUST have at least one '→' example line under 'Examples:'.\n"
        "- Every section MUST have a '> blockquote' insight line — this is not optional.\n"
        "- The lead sentence must be exactly ONE sentence ending with a period.\n"
        "- Do NOT use **bold** anywhere. Use `backticks` for key terms only.\n"
        "- Do NOT write a section titled 'Key Takeaways' — every section must cover real content.\n"
        "- Do not repeat information across sections. Prioritize high-signal concepts.\n"
    )

    last_err = None
    for attempt in range(3):
        try:
            response = openai_service.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are Neurativo, an academic lecture summarizer."
                            + topic_label +
                            " Create a Master Summary from the following section summaries."
                            " Keep it under 900 words.\n\n"
                            + structure + "\n\n"
                            + section_format
                            + lang_note
                        )
                    },
                    {"role": "user", "content": combined_sections}
                ],
                temperature=0.2,
                max_tokens=1200
            )
            log_cost("master_summary", "gpt-4o-mini",
                     input_tokens=response.usage.prompt_tokens,
                     output_tokens=response.usage.completion_tokens)
            master_summary = response.choices[0].message.content
            break
        except Exception as e:
            last_err = e
            if attempt < 2:
                time.sleep(2 ** attempt)
    else:
        print(f"Master summary error after 3 attempts: {last_err}")
        return ""

    # Hard word cap — compress if over 900 words
    if len(master_summary.split()) > 900:
        print("Master summary exceeds 900 words. Compressing...")
        for attempt in range(3):
            try:
                compression_response = openai_service.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are Neurativo. Compress this structured summary to under 900 words "
                                "while preserving its exact markdown structure "
                                "(## headers, Key concepts: lines, Examples: with → arrows, > blockquotes) "
                                "and all key insights." + lang_note
                            )
                        },
                        {
                            "role": "user",
                            "content": f"Compress to under 900 words:\n\n{master_summary}"
                        }
                    ],
                    temperature=0.2,
                    max_tokens=1200
                )
                log_cost("master_summary_compression", "gpt-4o-mini",
                         input_tokens=compression_response.usage.prompt_tokens,
                         output_tokens=compression_response.usage.completion_tokens)
                master_summary = compression_response.choices[0].message.content
                break
            except Exception as e:
                if attempt < 2:
                    time.sleep(2 ** attempt)
                else:
                    print(f"Compression pass error after 3 attempts: {e}")

    return master_summary


# ─────────────────────────────────────────────────────────────────────────────
#  End-of-session recompute — Pass 1: topic segmentation
# ─────────────────────────────────────────────────────────────────────────────

def segment_transcript(full_text: str, topic: str = None) -> list:
    """
    Pass 1 of the end-of-session recompute.
    Sends the full raw transcript to GPT and asks it to identify where topics
    naturally shift, returning a list of {"title", "start", "end"} dicts.

    "start" and "end" are character indices into full_text.
    Falls back to equal thirds if GPT fails or returns unparseable JSON.
    Retries up to 3 times with exponential backoff.
    """
    if not openai_service.client or not full_text.strip():
        return []

    topic_line = (
        f" This is a {topic} lecture." if topic and topic != "general" else ""
    )

    last_err = None
    for attempt in range(3):
        try:
            response = openai_service.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            f"You are analyzing a lecture transcript.{topic_line}"
                            " Identify every distinct topic or subtopic covered.\n\n"
                            "Rules:\n"
                            "- Titles must be specific and descriptive "
                            "(e.g. 'Krebs Cycle — ATP Production', not 'Overview' or 'Section 1')\n"
                            "- A topic shift occurs when the speaker moves to a genuinely new concept, "
                            "not just a new sentence\n"
                            "- Minimum 1 topic, maximum 12 topics\n"
                            "- Every character in the transcript must belong to exactly one topic\n"
                            "- Return ONLY valid JSON, no other text, no markdown fences\n\n"
                            "Return a JSON array:\n"
                            '[{"title": "...", "start": <char_index>, "end": <char_index>}, ...]'
                        )
                    },
                    {"role": "user", "content": full_text}
                ],
                temperature=0.0,
                max_tokens=800,
            )
            log_cost(
                "segment_transcript", "gpt-4o-mini",
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens,
            )
            raw = response.choices[0].message.content.strip()
            # Strip markdown code fences if GPT wraps in them anyway
            if raw.startswith("```"):
                lines = raw.split("\n")
                raw = "\n".join(lines[1:])
                if raw.endswith("```"):
                    raw = raw[:-3].strip()
            segments = json.loads(raw)
            if isinstance(segments, list) and len(segments) > 0:
                return segments
        except Exception as e:
            last_err = e
            if attempt < 2:
                time.sleep(2 ** attempt)

    print(f"segment_transcript error after 3 attempts: {last_err}. Using fallback.")
    # Fallback: split into thirds
    n = len(full_text)
    return [
        {"title": "Part 1", "start": 0,         "end": n // 3},
        {"title": "Part 2", "start": n // 3,     "end": (2 * n) // 3},
        {"title": "Part 3", "start": (2 * n) // 3, "end": n},
    ]


# ─────────────────────────────────────────────────────────────────────────────
#  End-of-session recompute — Pass 2: per-topic summarization
# ─────────────────────────────────────────────────────────────────────────────

def summarize_topic_segment(
    segment_text: str,
    title: str,
    topic: str = None,
    language: str = "en",
) -> str:
    """
    Pass 2 of the end-of-session recompute.
    Summarizes one topic segment directly from the raw transcript slice.

    Anti-hallucination rules are baked in: optional sections (blockquote,
    Key concepts, Examples) are ONLY written if the content warrants them.
    Output is compatible with the frontend parseSummary() function.
    Retries up to 3 times with exponential backoff.
    """
    if not openai_service.client or not segment_text.strip():
        return ""

    lang_note  = _multilingual_instruction()
    topic_line = (
        f" This is a {topic} lecture."
        f" Use precise {topic} terminology exactly as the speaker used it."
        if topic and topic != "general" else ""
    )

    section_format = (
        "Use exactly this markdown structure for your output "
        "(omit any section that has no content from the transcript):\n\n"
        f"## {title}\n\n"
        "{{One sentence capturing the single most important idea STATED in this section.}}\n\n"
        "{{2-4 sentences explaining what was covered, in the speaker's own terminology.}}\n\n"
        "[Include ONLY if the speaker emphasized a key point, drew a contrast, or stated a conclusion:\n"
        "> {{One sentence restating that point}}]\n\n"
        "[Include ONLY if the speaker named or defined specific terms:\n"
        "Key concepts: `term1`, `term2`, `term3`]\n\n"
        "[Include ONLY if the speaker gave explicit examples:\n"
        "Examples:\n"
        "→ {{example the speaker gave}}]\n\n"
        "---"
    )

    last_err = None
    for attempt in range(3):
        try:
            response = openai_service.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            f"You are summarizing a section of a lecture transcript.{topic_line}"
                            " Your ONLY source is the transcript text provided.\n\n"
                            "STRICT RULES — violations make the summary worthless:\n"
                            "1. Include ONLY information explicitly stated in this transcript. "
                            "Do not add background knowledge, definitions, or context the speaker did not give.\n"
                            "2. Key concepts: only terms the speaker named or defined. "
                            "If a term appears but was not explained, omit it.\n"
                            "3. Examples: only examples the speaker gave. "
                            "If no example was given, omit the Examples section entirely — do not invent one.\n"
                            "4. The blockquote must restate something the speaker actually emphasized. "
                            "If nothing qualifies, omit the blockquote entirely.\n"
                            "5. Write content directly — do not use 'the speaker says' or 'in this section'.\n"
                            "6. No filler phrases: no 'it is important to note', "
                            "'in conclusion', 'as we can see', 'as mentioned above'.\n"
                            "7. Do NOT use **bold**. Use `backticks` for key terms only.\n\n"
                            + section_format
                            + lang_note
                        )
                    },
                    {"role": "user", "content": segment_text}
                ],
                temperature=0.1,
                max_tokens=500,
            )
            log_cost(
                "topic_segment_summary", "gpt-4o-mini",
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            last_err = e
            if attempt < 2:
                time.sleep(2 ** attempt)

    print(f"summarize_topic_segment error after 3 attempts: {last_err}")
    return ""
