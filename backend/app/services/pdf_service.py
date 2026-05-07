import asyncio
import json
import math
import os
import re
from collections import Counter
from datetime import datetime

from jinja2 import Environment, FileSystemLoader
from playwright.sync_api import sync_playwright

from openai import OpenAI
from app.core.config import settings
from app.services.supabase_service import get_lecture_for_summarization, get_visual_frames
from app.services.cost_tracker import log_cost

# ── OpenAI client ─────────────────────────────────────────────────────────────
_client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None



# ── Domain-aware labels ───────────────────────────────────────────────────────
_DOMAIN_LABELS = {
    "medicine":         ("Clinical Breakdown",   "Board Exam Prep",   "Clinical Terms"),
    "law":              ("Legal Analysis",        "Case Practice",     "Legal Glossary"),
    "computer science": ("Technical Deep-Dive",   "Coding Concepts",   "Technical Glossary"),
    "physics":          ("Derivations & Proofs",  "Problem Practice",  "Formulary"),
    "mathematics":      ("Derivations & Proofs",  "Problem Practice",  "Formulary"),
    "history":          ("Historical Narrative",  "Source Review",     "Historical Terms"),
}
_DEFAULT_LABELS = ("Section Breakdown", "Self-Test", "Key Terms")


def _get_domain_labels(topic: str | None) -> tuple[str, str, str]:
    if not topic:
        return _DEFAULT_LABELS
    return _DOMAIN_LABELS.get(topic.lower(), _DEFAULT_LABELS)


_DOMAIN_COLORS = {
    "medicine":         "#DC2626",
    "nursing":          "#DC2626",
    "pharmacy":         "#DC2626",
    "law":              "#1E3A5F",
    "legal":            "#1E3A5F",
    "computer science": "#4F46E5",
    "software":         "#4F46E5",
    "engineering":      "#4F46E5",
    "physics":          "#0D9488",
    "mathematics":      "#0D9488",
    "chemistry":        "#0D9488",
    "history":          "#92400E",
    "social sciences":  "#92400E",
    "business":         "#059669",
    "economics":        "#059669",
}
_DEFAULT_COLOR = "#2563EB"


def _get_domain_color(topic: str | None) -> str:
    if not topic:
        return _DEFAULT_COLOR
    return _DOMAIN_COLORS.get(topic.lower(), _DEFAULT_COLOR)


# ── Adaptive question count (Bloom's taxonomy scaling) ────────────────────────
_DIFFICULTIES = ["Recall", "Understanding", "Application"]


def _question_count(duration_sec: int) -> int:
    minutes = (duration_sec or 0) // 60
    if minutes < 30:  return 0
    if minutes < 60:  return 5
    if minutes < 120: return 8
    return 12


# ── Helpers ───────────────────────────────────────────────────────────────────

def format_duration(seconds: int) -> str:
    if not seconds:
        return "0m 0s"
    m = seconds // 60
    s = seconds % 60
    return f"{m}m {s}s"


def clean_markdown_to_html(text: str) -> str:
    """Simple markdown → HTML for the legacy summary_html context variable."""
    if not text:
        return ""
    html = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    lines = html.split('\n')
    out, in_list = [], False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if in_list:
                out.append("</ul>"); in_list = False
            out.append("<br>")
            continue
        if stripped.startswith("## "):
            if in_list:
                out.append("</ul>"); in_list = False
            out.append(f"<h3>{stripped[3:]}</h3>")
        elif stripped.startswith("- "):
            if not in_list:
                out.append("<ul>"); in_list = True
            content = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', stripped[2:])
            out.append(f"<li>{content}</li>")
        else:
            if in_list:
                out.append("</ul>"); in_list = False
            content = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', stripped)
            out.append(f"<p>{content}</p>")
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


def _extract_lead_sentence(prose: str) -> tuple[str, str]:
    """Split prose into (first sentence, remainder)."""
    if not prose:
        return "", ""
    m = re.search(r'(?<=[.!?])\s+', prose)
    if m:
        return prose[:m.start() + 1].strip(), prose[m.end():].strip()
    return prose.strip(), ""


# ── GPT worker functions (all sync — called via asyncio.to_thread) ────────────

def _call_executive_summary(transcript: str, title: str, topic: str | None, strict: bool = False) -> str:
    if not _client:
        return ""
    hint = f" The lecture is about {topic}." if topic else ""
    strict_rule = (
        " ABSOLUTE RULE: every sentence must be directly supported by the transcript above. "
        "If you cannot find content for a sentence in the transcript, do not write it. "
        "Never infer, generalise, or draw on external knowledge."
    ) if strict else ""
    resp = _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are summarizing a specific lecture transcript provided below. "
                    "Only use information from this transcript. "
                    "Do not add any external knowledge, context, or content from any other source. "
                    "If something is not in the transcript, do not include it. "
                    "Write dense, precise prose. Use present tense ('The lecture examines...'). No bullet points."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"TRANSCRIPT:\n{transcript[:6000]}\n\n"
                    f"Write a 3-paragraph executive summary of the lecture titled \"{title}\".{hint} "
                    "Each paragraph is 3-4 sentences. Separate paragraphs with a blank line. "
                    f"Return only the summary text, no preamble.{strict_rule}"
                ),
            },
        ],
        temperature=0.2 if strict else 0.4,
        max_tokens=650,
    )
    log_cost("pdf_executive_summary", "gpt-4o-mini",
             input_tokens=resp.usage.prompt_tokens,
             output_tokens=resp.usage.completion_tokens)
    return resp.choices[0].message.content.strip()


def _call_enrich_section(
    section_text: str,
    idx: int,
    total: int,
    topic: str | None,
    language: str,
) -> dict:
    if not _client:
        lead, rest = _extract_lead_sentence(section_text[:300])
        return {
            "title": f"Section {idx + 1}", "lead_sentence": lead, "prose": rest,
            "bullets": [], "concepts": [], "examples": [], "raw_section": section_text,
            "analogy": None, "mistake": None, "remember": None,
        }
    hint = f" Domain: {topic}." if topic else ""
    resp = _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "user",
                "content": (
                    "Note: The transcript may contain mixed languages. Extract meaning from all languages present. Respond in English.\n\n"
                    f"You are enriching section {idx + 1} of {total} from a lecture.{hint}\n"
                    f"Section summary:\n{section_text}\n\n"
                    "Return a JSON object with exactly these fields:\n"
                    "- \"title\": A crisp noun-phrase title describing specifically what concepts "
                    "are taught in THIS section (max 6 words). "
                    "FORBIDDEN generic titles: 'Introduction', 'Overview', 'Fundamentals', 'Basics', "
                    "'Summary', 'Review', 'Lecture Notes'. Name the actual concepts taught.\n"
                    "- \"prose\": 2-3 flowing sentences expanding the core idea. Present tense. No bullets.\n"
                    "- \"bullets\": Array of 3-5 specific key points as short strings\n"
                    "- \"concepts\": Array of key concept names explicitly named or defined in this section "
                    "(single nouns or short noun phrases, e.g. 'Action Potential', 'Ohm\\'s Law'). "
                    "Return an empty array if no concepts were explicitly named.\n"
                    "- \"examples\": Array of concrete real-world examples or applications "
                    "the lecturer explicitly gave. Return an empty array if none were given. "
                    "Never invent examples that were not in the source text.\n"
                    "- \"analogy\": A 2-3 sentence real-world analogy that makes this concept click. "
                    "Use 'Think of...' or 'Imagine...' framing. Only generate if a natural analogy "
                    "exists for this specific content. Return null if no natural analogy exists.\n"
                    "- \"mistake\": One specific misconception students commonly make with this "
                    "section's content. Grounded in the source material. Return null if none is "
                    "clearly identifiable.\n"
                    "- \"remember\": One key principle to remember from this section — a positive, "
                    "memorable one-sentence formulation. Always include.\n"
                    "STRICT RULE: only include information explicitly present in the section text. "
                    "Empty arrays for concepts and examples are valid and preferred over invented content.\n"
                    "Return only valid JSON."
                ),
            }
        ],
        temperature=0.3,
        max_tokens=900,
        response_format={"type": "json_object"},
    )
    log_cost("pdf_enrich_section", "gpt-4o-mini",
             input_tokens=resp.usage.prompt_tokens,
             output_tokens=resp.usage.completion_tokens)
    try:
        data = json.loads(resp.choices[0].message.content)
    except Exception:
        data = {}
    prose = data.get("prose", "")
    lead, rest = _extract_lead_sentence(prose)
    concepts = data.get("concepts") or []
    examples = data.get("examples") or []
    print(f"[enrich_section] s{idx + 1}/{total}: title={data.get('title')!r} concepts={concepts} examples={examples}")
    return {
        "title":         data.get("title", f"Section {idx + 1}"),
        "lead_sentence": lead,
        "prose":         rest,
        "bullets":       data.get("bullets") or [],
        "concepts":      concepts,
        "examples":      examples,
        "raw_section":   section_text,
        "analogy":       data.get("analogy") or None,
        "mistake":       data.get("mistake") or None,
        "remember":      data.get("remember") or None,
    }


def _call_glossary(transcript: str, topic: str | None, n_terms: int = 8) -> list[dict]:
    if not _client:
        return []
    hint = f" Domain: {topic}." if topic else ""
    resp = _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "user",
                "content": (
                    "Note: The transcript may contain mixed languages. Extract meaning from all languages present. Respond in English.\n\n"
                    f"TRANSCRIPT:\n{transcript[:5000]}\n\n"
                    f"Extract {n_terms} key academic or technical terms from this lecture.{hint} "
                    "For each term provide a clear 1-sentence definition a student can memorise. "
                    'Return JSON: {"terms": [{"term": "...", "definition": "..."}]}'
                ),
            }
        ],
        temperature=0.2,
        max_tokens=700,
        response_format={"type": "json_object"},
    )
    log_cost("pdf_glossary", "gpt-4o-mini",
             input_tokens=resp.usage.prompt_tokens,
             output_tokens=resp.usage.completion_tokens)
    try:
        return json.loads(resp.choices[0].message.content).get("terms", [])
    except Exception:
        return []


def _call_takeaways(transcript: str, summary: str, topic: str | None) -> list[str]:
    if not _client:
        return []
    hint = f" Domain: {topic}." if topic else ""
    resp = _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "user",
                "content": (
                    "Note: The transcript may contain mixed languages. Extract meaning from all languages present. Respond in English.\n\n"
                    f"SUMMARY:\n{summary[:3000]}\n\n"
                    f"List exactly 5 key takeaways from this lecture.{hint} "
                    "Each takeaway is one complete, actionable sentence starting with a verb or concept. "
                    'Return JSON: {"takeaways": ["...", ...]}'
                ),
            }
        ],
        temperature=0.3,
        max_tokens=450,
        response_format={"type": "json_object"},
    )
    log_cost("pdf_takeaways", "gpt-4o-mini",
             input_tokens=resp.usage.prompt_tokens,
             output_tokens=resp.usage.completion_tokens)
    try:
        return json.loads(resp.choices[0].message.content).get("takeaways", [])
    except Exception:
        return []


def _call_quick_review(
    transcript: str,
    summary: str,
    topic: str | None,
    n_questions: int,
) -> list[dict]:
    if not _client or n_questions == 0:
        return []
    hint = f" Domain: {topic}." if topic else ""
    diff_list = "\n".join(
        [f"Q{i + 1}: {_DIFFICULTIES[i % 3]}" for i in range(n_questions)]
    )
    resp = _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "user",
                "content": (
                    "Note: The transcript may contain mixed languages. Extract meaning from all languages present. Respond in English.\n\n"
                    f"TRANSCRIPT:\n{transcript[:4000]}\nSUMMARY:\n{summary[:2000]}\n\n"
                    f"Generate {n_questions} exam-style questions.{hint}\n"
                    f"Difficulty assignments (Bloom's taxonomy):\n{diff_list}\n\n"
                    "Recall = factual. Understanding = conceptual explanation. Application = applying to scenario.\n"
                    "Each answer is 2-3 sentences. Keep the assigned difficulty exactly.\n"
                    'Return JSON: {"questions": [{"question": "...", "answer": "...", "difficulty": "..."}]}'
                ),
            }
        ],
        temperature=0.4,
        max_tokens=1400,
        response_format={"type": "json_object"},
    )
    log_cost("pdf_quick_review", "gpt-4o-mini",
             input_tokens=resp.usage.prompt_tokens,
             output_tokens=resp.usage.completion_tokens)
    try:
        return json.loads(resp.choices[0].message.content).get("questions", [])
    except Exception:
        return []


def _call_study_roadmap(
    topic: str | None,
    title: str,
    section_titles: list[str],
    transcript: str = "",
) -> dict:
    """GPT-4o: recommends prerequisite concepts and next topics for this lecture.
    Uses the actual transcript so forward references (e.g. 'we'll cover unit 8 next')
    are surfaced as explicit next-step recommendations."""
    if not _client:
        return {"next_topics": [], "prerequisites": []}
    topic_hint = f"Topic: {topic}. " if topic else ""
    titles_str = ", ".join(section_titles) if section_titles else "N/A"
    # Include a slice of the transcript so GPT can extract forward references
    transcript_excerpt = transcript[:4000].strip() if transcript else ""
    resp = _client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert curriculum designer who maps academic learning paths. "
                    "You only use information from the transcript provided — never from general knowledge about the subject. "
                    "If the professor explicitly mentions future topics, unit numbers, or follow-up lessons, "
                    "those must appear as the first entries in next_topics."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Note: The transcript may contain mixed languages. Extract meaning from all languages present. Respond in English.\n\n"
                    f"TRANSCRIPT (excerpt):\n{transcript_excerpt}\n\n"
                    f"Lecture title: \"{title}\"\n"
                    f"{topic_hint}Sections covered: {titles_str}\n\n"
                    "Based ONLY on the lecture transcript provided above, return a JSON object with exactly two fields:\n"
                    "- \"next_topics\": array of 3-5 objects, each with \"topic\" (name) and "
                    "\"reason\" (one sentence). If the professor mentioned specific units, topics, "
                    "or subjects to study next, list those first. Do not recommend topics that were "
                    "not mentioned or clearly implied by this specific lecture.\n"
                    "- \"prerequisites\": array of 2-3 objects, each with \"concept\" (name) and "
                    "\"reason\" (one sentence explaining why knowing it helps with this lecture).\n"
                    "Be specific to this lecture's content. Do not be generic."
                ),
            },
        ],
        temperature=0.3,
        max_tokens=700,
        response_format={"type": "json_object"},
    )
    log_cost("pdf_study_roadmap", "gpt-4o",
             input_tokens=resp.usage.prompt_tokens,
             output_tokens=resp.usage.completion_tokens)
    try:
        data = json.loads(resp.choices[0].message.content)
        return {
            "next_topics":   data.get("next_topics", []),
            "prerequisites": data.get("prerequisites", []),
        }
    except Exception:
        return {"next_topics": [], "prerequisites": []}


def _call_conceptual_map(section_summaries: list[str]) -> list[dict]:
    """GPT-4o synthesis: finds cross-cutting threads connecting multiple sections."""
    if not _client:
        return []
    combined = "\n\n".join([f"Section {i + 1}: {s}" for i, s in enumerate(section_summaries)])
    resp = _client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": "You synthesise academic knowledge, finding the ideas that bridge across lecture sections.",
            },
            {
                "role": "user",
                "content": (
                    f"SECTIONS:\n{combined}\n\n"
                    f"Identify 3 to 5 conceptual threads that CONNECT multiple sections. "
                    "Each thread is 2-3 sentences showing how ideas in different sections relate. "
                    "Do not summarise individual sections — find the cross-cutting ideas. "
                    "Each entry needs a short heading (max 4 words) and the connecting paragraph.\n"
                    'Return JSON: {"connections": [{"heading": "...", "paragraph": "..."}]}'
                ),
            },
        ],
        temperature=0.5,
        max_tokens=900,
        response_format={"type": "json_object"},
    )
    log_cost("pdf_conceptual_map", "gpt-4o",
             input_tokens=resp.usage.prompt_tokens,
             output_tokens=resp.usage.completion_tokens)
    try:
        return json.loads(resp.choices[0].message.content).get("connections", [])
    except Exception:
        return []




def _call_mnemonics(glossary: list[dict]) -> list[dict]:
    """
    Generates memory hooks for glossary terms. Returns the same list with
    an optional "mnemonic" key added to each item (None where no natural
    mnemonic exists). Non-fatal: returns original list on any error.
    """
    if not _client or not glossary:
        return glossary
    terms_text = "\n".join(
        f"- {item['term']}: {item['definition']}" for item in glossary
    )
    try:
        resp = _client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"For each term below, generate ONE memory hook "
                        "(acronym, rhyme, analogy, or vivid image) that makes it stick. "
                        "Only generate a hook if one arises naturally from the term's meaning. "
                        "Return null for terms where forcing one would be artificial.\n\n"
                        f"Terms:\n{terms_text}\n\n"
                        'Return JSON: {"mnemonics": [{"term": "...", "mnemonic": "..." | null}]}'
                    ),
                }
            ],
            temperature=0.4,
            max_tokens=600,
            response_format={"type": "json_object"},
        )
        log_cost("pdf_mnemonics", "gpt-4o-mini",
                 input_tokens=resp.usage.prompt_tokens,
                 output_tokens=resp.usage.completion_tokens)
        mnemonic_map = {
            m["term"]: m.get("mnemonic")
            for m in json.loads(resp.choices[0].message.content).get("mnemonics", [])
        }
        for item in glossary:
            m = mnemonic_map.get(item["term"])
            if m is not None:
                item["mnemonic"] = m
        return glossary
    except Exception as e:
        print(f"_call_mnemonics error (non-fatal): {e}")
        return glossary


_STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "this", "that", "these",
    "those", "with", "from", "into", "about", "also", "just", "very",
    "and", "but", "for", "not", "you", "they", "what", "which", "who",
    "when", "where", "how", "all", "each", "some", "such", "more", "most",
    "then", "than", "only", "its", "our", "their", "your", "his", "her",
}


def _top_terms(text: str, n: int = 5) -> list[str]:
    """Returns n most frequent non-stopword tokens (>=4 chars) from text."""
    words = re.findall(r'[a-z]{4,}', text.lower())
    counts = Counter(w for w in words if w not in _STOPWORDS)
    return [term for term, _ in counts.most_common(n)]


def _call_key_stats(transcript: str, topic: str | None) -> list[dict]:
    """
    Extracts up to 4 memorable statistics, key numbers, or metrics from the lecture.
    Returns [{"value": "28-30%", "label": "of clicks go to the #1 result"}].
    Returns [] if no quantitative facts are present. Non-fatal on error.
    """
    if not _client:
        return []
    hint = f" Domain: {topic}." if topic else ""
    try:
        resp = _client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Note: The transcript may contain mixed languages. Extract meaning from all languages present. Respond in English.\n\n"
                        f"TRANSCRIPT:\n{transcript[:5000]}\n\n"
                        f"Extract up to 4 memorable statistics, key numbers, or metrics from this lecture.{hint} "
                        "Each entry needs a VALUE (the number, percentage, or ratio — short, bold-worthy, max 8 characters) "
                        "and a LABEL (what it measures, max 8 words). "
                        "STRICT RULE: only include numbers explicitly stated in the transcript. "
                        "Return fewer than 4 if fewer distinct quantitative facts exist. "
                        "Return an empty stats array if the lecture contains no clear statistics.\n"
                        'Return JSON: {"stats": [{"value": "...", "label": "..."}]}'
                    ),
                }
            ],
            temperature=0.2,
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        log_cost("pdf_key_stats", "gpt-4o-mini",
                 input_tokens=resp.usage.prompt_tokens,
                 output_tokens=resp.usage.completion_tokens)
        return json.loads(resp.choices[0].message.content).get("stats", [])
    except Exception as e:
        print(f"_call_key_stats error (non-fatal): {e}")
        return []


# ── PDF renderer (sync, run in thread) ───────────────────────────────────────

def _render_pdf(html_content: str, title_short: str, watermark: bool = False) -> bytes:
    # Use a per-call context manager instead of a global browser singleton.
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            try:
                page.set_content(html_content, wait_until="networkidle")
                # Explicitly wait for all fonts to finish loading before snapshotting.
                # networkidle alone doesn't guarantee font-swap has completed — this does.
                page.evaluate("() => document.fonts.ready")
                footer = (
                    "<div style='"
                    "width:100%;font-size:7pt;color:#94a3b8;"
                    "font-family:Arial,sans-serif;"
                    "text-align:center;padding:0 22mm;"
                    "box-sizing:border-box;"
                    "'>Page <span class='pageNumber'></span> "
                    "of <span class='totalPages'></span> · Neurativo</div>"
                )
                if watermark:
                    footer = (
                        "<div style='"
                        "width:100%;font-family:Arial,sans-serif;"
                        "box-sizing:border-box;padding:0 22mm;"
                        "display:flex;justify-content:space-between;align-items:center;"
                        "'>"
                        "<span style='font-size:7pt;color:#94a3b8;'>"
                        "Page <span class='pageNumber'></span> of <span class='totalPages'></span>"
                        "</span>"
                        "<span style='font-size:7pt;font-weight:600;color:#7c3aed;"
                        "background:#f5f3ff;padding:2px 8px;border-radius:4px;"
                        "border:1px solid #ddd8fe;'>"
                        "Neurativo Free — upgrade for the full report"
                        "</span>"
                        "</div>"
                    )
                pdf_bytes = page.pdf(
                    format="A4",
                    margin={"top": "28mm", "bottom": "16mm", "left": "22mm", "right": "22mm"},
                    print_background=True,
                    display_header_footer=True,
                    header_template=(
                        "<div style='"
                        "width:100%;font-size:7pt;color:#94a3b8;"
                        "font-family:Arial,sans-serif;"
                        "display:flex;justify-content:space-between;"
                        "padding:0 22mm;border-bottom:0.5px solid #e2e8f0;"
                        "padding-bottom:4px;box-sizing:border-box;"
                        f"'><span>{title_short}</span>"
                        "<span>Lecture Intelligence Report</span></div>"
                    ),
                    footer_template=footer,
                )
            finally:
                page.close()
        finally:
            browser.close()
    return pdf_bytes


# ── Lite-tier fast path (no GPT calls) ───────────────────────────────────────

async def _generate_lite_pdf(
    lecture_id: str,
    title: str,
    created_at: str,
    duration_formatted: str,
    word_count: int,
    topic: str | None,
    language: str,
    raw_sections: list,
    watermark: bool = False,
) -> bytes:
    """Generates a lite PDF with no GPT enrichment — summary text only.
    When watermark=True, adds a 'Neurativo Free — upgrade for full report'
    badge on every page footer and limits to first 2 sections."""
    section_label, review_label, glossary_label = _get_domain_labels(topic)
    domain_color = _get_domain_color(topic)

    sections_data = []
    for i, sec in enumerate(raw_sections):
        lines = sec.split("\n")
        sec_title = lines[0].strip()[:80] if lines[0].strip() else f"Section {i + 1}"
        prose = "\n".join(lines[1:]).strip()
        sections_data.append({
            "title":         sec_title,
            "lead_sentence": "",
            "prose":         prose or sec,
            "bullets":       [],
            "concepts":      [],
            "examples":      [],
            "analogy":       None,
            "mistake":       None,
            "remember":      None,
        })

    n_sections = len(sections_data)

    # Render template with same context keys as standard path
    template_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")
    env = Environment(loader=FileSystemLoader(template_dir))

    def _fmt_time_mmss(seconds):
        m = (seconds or 0) // 60
        s = (seconds or 0) % 60
        return f"{m:02d}:{s:02d}"

    env.filters["format_time"] = _fmt_time_mmss

    def _truncate_words(s: str, n: int) -> str:
        words = str(s).split()
        return (" ".join(words[:n]) + "…") if len(words) > n else str(s)

    env.filters["truncate_words"] = _truncate_words
    template = env.get_template("lecture_template.html")

    context = {
        "title":                title,
        "created_at":           created_at,
        "duration_formatted":   duration_formatted,
        "word_count":           f"{word_count:,}",
        "total_chunks":         0,
        "total_sections":       n_sections,
        "total_concepts":       0,
        "qa_pairs":             0,
        "language":             language.upper(),
        "topic":                topic,
        "reading_time_minutes": max(1, word_count // 238),
        "section_label":        section_label,
        "review_label":         review_label,
        "glossary_label":       glossary_label,
        "executive_summary":    "",
        "enriched_sections":    sections_data,
        "glossary":             [],
        "takeaways":            [],
        "quick_review":         [],
        "conceptual_map":       [],
        "study_roadmap":        {"next_topics": [], "prerequisites": []},
        "summary_html":         "",
        "compression_ratio":    0.0,
        "visual_frames":        [],
        "key_stats":            [],
        "accent_color":         domain_color,
    }

    html_content = template.render(**context)
    title_short = title[:50] + ("…" if len(title) > 50 else "")
    return await asyncio.to_thread(_render_pdf, html_content, title_short, watermark)


# ── Main async entry point ────────────────────────────────────────────────────

async def generate_lecture_pdf(
    lecture_id: str,
    user_id: str | None = None,
    quality: str = "standard",   # "free" | "lite" | "standard" | "full"
) -> bytes:
    """
    Async PDF generator. All GPT enrichment calls run in parallel via
    asyncio.gather() + asyncio.to_thread(), making export ~5x faster than
    sequential calls.

    quality="free":     2-section preview with watermark footer, no GPT enrichment.
                        Given to free-plan users so they see the output and feel the
                        upgrade pull rather than seeing a 403 error.
    quality="lite":     4-section preview, no watermark, no GPT enrichment.
    quality="standard": Full sections + GPT enrichment (Student plan).
    quality="full":     Full sections + GPT enrichment + all extras (Pro plan).
    """
    IS_FREE = quality == "free"
    IS_LITE = quality == "lite" or IS_FREE
    # 1. Fetch lecture data
    data = await asyncio.to_thread(get_lecture_for_summarization, lecture_id)
    if not data:
        raise Exception("Lecture not found")

    transcript    = data.get("transcript") or ""
    summary       = data.get("master_summary") or data.get("summary") or ""
    title         = data.get("title") or "Lecture Notes"
    created_at    = str(data.get("created_at") or datetime.now().date())[:10]
    total_chunks  = data.get("total_chunks") or 0
    language      = data.get("language") or "en"
    topic         = data.get("topic") or None

    # Duration: derive from total_chunks * 12s (more accurate than stored total_duration_seconds)
    duration_sec = total_chunks * 12

    # Word count: deduplicate consecutive identical transcript lines before counting
    if transcript:
        raw_lines  = [ln.strip() for ln in transcript.split("\n") if ln.strip()]
        dedup_lines: list[str] = []
        for ln in raw_lines:
            if not dedup_lines or ln != dedup_lines[-1]:
                dedup_lines.append(ln)
        word_count = len(" ".join(dedup_lines).split())
    else:
        word_count = 0

    duration_formatted  = format_duration(duration_sec)
    section_label, review_label, glossary_label = _get_domain_labels(topic)

    # 2. Parse raw sections from master summary
    raw_sections = [s.strip() for s in summary.split("## ") if s.strip()]
    n_sections   = len(raw_sections)
    n_questions  = _question_count(duration_sec)

    # ── Lite/Free tier: skip all GPT calls ───────────────────────────────────
    if IS_LITE:
        # Free plan: first 2 sections + watermark; Lite: first 4 sections, no watermark
        section_limit = 2 if IS_FREE else 4
        raw_sections = raw_sections[:section_limit]
        return await _generate_lite_pdf(
            lecture_id=lecture_id,
            title=title,
            created_at=created_at,
            duration_formatted=duration_formatted,
            word_count=word_count,
            topic=topic,
            language=language,
            raw_sections=raw_sections,
            watermark=IS_FREE,
        )

    # 3. Build parallel task list
    tasks: list = []

    # Executive summary
    tasks.append(asyncio.to_thread(_call_executive_summary, transcript, title, topic))

    # Per-section enrichments
    for i, sec in enumerate(raw_sections):
        tasks.append(asyncio.to_thread(_call_enrich_section, sec, i, n_sections, topic, language))

    # Glossary
    tasks.append(asyncio.to_thread(_call_glossary, transcript, topic, 8 if n_sections >= 3 else 5))

    # Takeaways
    tasks.append(asyncio.to_thread(_call_takeaways, transcript, summary, topic))

    # Quick review
    tasks.append(asyncio.to_thread(_call_quick_review, transcript, summary, topic, n_questions))

    # Conceptual map — only for 3+ sections (GPT-4o, synthesis quality matters)
    has_map = n_sections >= 3
    if has_map:
        tasks.append(asyncio.to_thread(_call_conceptual_map, raw_sections))

    # Study roadmap — always generated (GPT-4o, curriculum positioning)
    # Pass transcript so forward references ("we'll cover unit 8 next") are surfaced
    tasks.append(asyncio.to_thread(
        _call_study_roadmap, topic, title,
        [s.split('\n')[0].strip() for s in raw_sections],   # first line = section title
        transcript,
    ))

    # Key stats — extracted from transcript for exec summary callout
    tasks.append(asyncio.to_thread(_call_key_stats, transcript, topic))

    # 4. Run all calls in parallel
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # 5. Unpack results in task order
    ri = 0

    exec_summary = results[ri] if not isinstance(results[ri], Exception) else ""
    ri += 1

    enriched_sections: list[dict] = []
    for i in range(n_sections):
        r = results[ri]; ri += 1
        if isinstance(r, Exception):
            lead, rest = _extract_lead_sentence(raw_sections[i][:300])
            enriched_sections.append({
                "title":         f"Section {i + 1}",
                "lead_sentence": lead,
                "prose":         rest,
                "bullets":       [],
                "concepts":      [],
                "examples":      [],
                "raw_section":   raw_sections[i],
                "analogy":       None,
                "mistake":       None,
                "remember":      None,
            })
        else:
            enriched_sections.append(r)

    glossary: list[dict] = results[ri] if not isinstance(results[ri], Exception) else []
    ri += 1

    # Mnemonics — sequential second pass (needs glossary result)
    if glossary:
        try:
            glossary = await asyncio.to_thread(_call_mnemonics, glossary)
        except Exception as e:
            print(f"mnemonics pass error (non-fatal): {e}")

    takeaways: list[str] = results[ri] if not isinstance(results[ri], Exception) else []
    ri += 1

    quick_review: list[dict] = results[ri] if not isinstance(results[ri], Exception) else []
    ri += 1

    conceptual_map: list[dict] = []
    if has_map:
        r = results[ri]; ri += 1
        conceptual_map = r if not isinstance(r, Exception) else []

    r = results[ri]; ri += 1
    study_roadmap: dict = r if not isinstance(r, Exception) else {"next_topics": [], "prerequisites": []}

    r = results[ri]; ri += 1
    key_stats: list[dict] = r if not isinstance(r, Exception) else []

    # 5b. Validate exec_summary content aligns with the transcript.
    # Extracts the top 5 meaningful terms from the transcript and checks that
    # at least 3 appear in the summary. Catches cross-job contamination early.
    if exec_summary and transcript:
        top_terms = _top_terms(transcript[:8000], n=5)
        summary_lower = exec_summary.lower()
        matched = sum(1 for t in top_terms if t in summary_lower)
        if matched < 3:
            print(f"[pdf] exec_summary validation: only {matched}/5 transcript terms found "
                  f"({top_terms}). Regenerating with strict prompt.")
            try:
                exec_summary = await asyncio.to_thread(
                    _call_executive_summary, transcript, title, topic, True
                )
                matched_retry = sum(1 for t in top_terms if t in exec_summary.lower())
                if matched_retry < 3:
                    print(f"[pdf] exec_summary still failed after strict retry ({matched_retry}/5). "
                          f"Keeping retry output but flagging lecture_id={lecture_id} for review.")
            except Exception as e:
                print(f"[pdf] exec_summary retry error (non-fatal): {e}")

    # 6. Estimate reading time (total enriched words ÷ 238 wpm)
    doc_word_count = (
        len((exec_summary or "").split())
        + sum(
            len((s.get("lead_sentence", "") + " " + s.get("prose", "") + " "
                 + " ".join(s.get("bullets", []))).split())
            for s in enriched_sections
        )
        + sum(len((t.get("term", "") + " " + t.get("definition", "")).split()) for t in glossary)
        + sum(len(tw.split()) for tw in takeaways)
        + sum(len((q.get("question", "") + " " + q.get("answer", "")).split()) for q in quick_review)
        + sum(len(c.get("paragraph", "").split()) for c in conceptual_map)
        + sum(len((t.get("topic", "") + " " + t.get("reason", "")).split()) for t in study_roadmap.get("next_topics", []))
        + sum(len((p.get("concept", "") + " " + p.get("reason", "")).split()) for p in study_roadmap.get("prerequisites", []))
    )
    reading_time_minutes = max(1, math.ceil(doc_word_count / 238))

    # 6b. Fetch visual frames captured during this lecture
    try:
        visual_frames = await asyncio.to_thread(get_visual_frames, lecture_id)
    except Exception:
        visual_frames = []

    # 7. Render Jinja2 template
    template_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")
    env          = Environment(loader=FileSystemLoader(template_dir))

    def _fmt_time_mmss(seconds):
        m = (seconds or 0) // 60
        s = (seconds or 0) % 60
        return f"{m:02d}:{s:02d}"

    env.filters["format_time"] = _fmt_time_mmss
    def _truncate_words(s: str, n: int) -> str:
        words = str(s).split()
        return (" ".join(words[:n]) + "…") if len(words) > n else str(s)
    env.filters["truncate_words"] = _truncate_words
    template     = env.get_template("lecture_template.html")

    total_concepts = sum(len(s.get("concepts", [])) for s in enriched_sections)
    qa_pairs       = len(quick_review)

    context = {
        # Cover
        "title":                title,
        "created_at":           created_at,
        "duration_formatted":   duration_formatted,
        "word_count":           f"{word_count:,}",
        "total_chunks":         total_chunks,
        "total_sections":       n_sections,
        "total_concepts":       total_concepts,
        "qa_pairs":             qa_pairs,
        "language":             language.upper(),
        "topic":                topic,
        "reading_time_minutes": reading_time_minutes,
        # Domain labels
        "section_label":        section_label,
        "review_label":         review_label,
        "glossary_label":       glossary_label,
        # Enriched content
        "executive_summary":    exec_summary,
        "enriched_sections":    enriched_sections,
        "glossary":             glossary,
        "takeaways":            takeaways,
        "quick_review":         quick_review,
        "conceptual_map":       conceptual_map,
        "study_roadmap":        study_roadmap,
        # Legacy variable (kept for backwards compatibility)
        "summary_html":         clean_markdown_to_html(summary),
        "compression_ratio":    0.0,
        # Visual frames
        "visual_frames":        visual_frames,
        "key_stats":            key_stats[:4],
        "accent_color":         _get_domain_color(topic),
    }

    html_content = template.render(**context)

    # 8. Generate PDF in thread (Playwright is sync)
    title_short = title[:50] + ("…" if len(title) > 50 else "")
    pdf_bytes   = await asyncio.to_thread(_render_pdf, html_content, title_short, False)
    return pdf_bytes
