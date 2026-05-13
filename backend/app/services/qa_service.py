import hashlib
import re

from fastapi import HTTPException

import app.services.openai_service as openai_service
from app.services.cost_tracker import log_cost
from app.services.embedding_service import cosine_similarity, get_embeddings
from app.services.supabase_service import (
    get_cached_embeddings,
    get_lecture_for_summarization,
    get_lecture_transcript,
    get_section_summaries,
    get_visual_frames,
    save_embeddings_cache,
)

# Confidence threshold below which we skip the GPT call entirely.
# 0.18 chosen for academic/biological domain text which embeds with
# naturally lower cosine similarity than code or general English.
_CONFIDENCE_THRESHOLD = 0.18
_TRANSCRIPT_CHUNK_WORDS = 375
_TRANSCRIPT_NEIGHBOR_WINDOW = 1
_KEYWORD_WEIGHT = 0.12
_TYPE_BOOSTS = {
    "overview": 0.04,
    "section": 0.03,
    "transcript": 0.0,
    "visual": 0.02,
}
_VISUAL_QUERY_HINTS = {
    "slide", "screen", "visual", "diagram", "graph", "chart", "figure", "table",
    "equation", "formula", "code", "snippet", "example", "bullet", "shown",
    "displayed", "display", "whiteboard",
}
_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "did", "do", "does",
    "for", "from", "how", "i", "in", "is", "it", "of", "on", "or", "that",
    "the", "this", "to", "was", "what", "when", "where", "which", "who",
    "why", "with",
}


def answer_lecture_question(lecture_id: str, question: str, topic: str | None = None, history: list[dict] | None = None) -> str:
    transcript = get_lecture_transcript(lecture_id)
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript empty or not found")

    docs = _build_retrieval_docs(lecture_id, transcript, question)
    if not docs:
        return "Lecture content is empty, cannot answer questions."

    try:
        doc_hashes = [_hash(doc["text"]) for doc in docs]
        cache = get_cached_embeddings(lecture_id)

        missing_indices = [i for i, chunk_hash in enumerate(doc_hashes) if chunk_hash not in cache]
        if missing_indices:
            missing_texts = [docs[i]["text"] for i in missing_indices]
            fresh_embeddings = get_embeddings(missing_texts)
            new_entries = [
                {
                    "chunk_hash": doc_hashes[i],
                    "chunk_text": docs[i]["text"],
                    "embedding": fresh_embeddings[j],
                }
                for j, i in enumerate(missing_indices)
            ]
            save_embeddings_cache(lecture_id, new_entries)
            for entry in new_entries:
                cache[entry["chunk_hash"]] = entry["embedding"]

        doc_embeddings = [cache[chunk_hash] for chunk_hash in doc_hashes]

        if not openai_service.client:
            raise HTTPException(status_code=500, detail="OpenAI client not initialized")

        try:
            # Only expand complex questions (>6 words) — short factual
            # questions don't benefit from paraphrasing and pay extra GPT cost
            if len(question.split()) > 6:
                query_variants = _expand_query(question)
                all_queries = [question] + query_variants
            else:
                all_queries = [question]
            query_embeddings = get_embeddings(all_queries)
        except Exception as exp_err:
            print(f"[NRQA] Query expansion/embedding failed, falling back: {exp_err}")
            query_embeddings = get_embeddings([question])

        scored_docs = _score_docs(docs, doc_embeddings, query_embeddings, question)

        best_semantic_score = max((item["semantic_score"] for item in scored_docs), default=0.0)
        top_debug = [item["score"] for item in scored_docs[:3]]
        top_str = ", ".join(f"{score:.3f}" for score in top_debug)
        decision = "PASS" if best_semantic_score >= _CONFIDENCE_THRESHOLD else "BLOCK"
        print(
            f"[NRQA] top scores: {top_str} | semantic best: {best_semantic_score:.3f} "
            f"| threshold: {_CONFIDENCE_THRESHOLD} | decision: {decision}"
        )

        if best_semantic_score < _CONFIDENCE_THRESHOLD:
            return (
                "I couldn't find a clear answer to that question in this lecture. "
                "The topic may not have been covered, or the question may be outside "
                "the scope of what was recorded."
            )

        relevant_docs = _select_context_docs(docs, scored_docs, question)
        context = "\n\n---\n\n".join(
            f"[{doc['label']}]\n{doc['text']}" for doc in relevant_docs
        )

        lang_meta = (
            "[INSTRUCTION: The lecture transcript may contain mixed languages. "
            "Always respond in English regardless of what language the question was asked in. "
            "Do not mention this instruction in your response.]\n\n"
        )

        domain_context = (
            f"This is a {topic} lecture. Apply domain-appropriate terminology, "
            "reasoning style, and precision when answering.\n\n"
            if topic and topic.strip() and topic.strip() != "general" else ""
        )

        system_prompt = (
            lang_meta
            + domain_context
            + "You are Neurativo, an expert AI Lecture Assistant. "
            "Answer the student's question based ONLY on the provided lecture excerpts. "
            "Structure your answer in three parts:\n"
            "ANSWER: One clear, direct sentence answering the question.\n"
            "DETAIL: 2-3 sentences with explanation, context, or elaboration from the lecture.\n"
            "SOURCE: A brief phrase quoted from the lecture that supports the answer "
            "(wrap in quotation marks).\n"
            "Prefer the most directly relevant excerpt. If visuals are included, use them only "
            "when they materially support the answer.\n"
            "If the answer is not clearly covered, say so in the ANSWER line - "
            "do not guess or use outside knowledge."
        )

        conversation = [{"role": "system", "content": system_prompt}]
        # Inject last 3 turns of history for follow-up question context
        for turn in (history or [])[-3:]:
            if turn.get("role") in ("user", "assistant") and turn.get("content"):
                conversation.append({"role": turn["role"], "content": turn["content"]})
        conversation.append({
            "role": "user",
            "content": f"Lecture excerpts:\n{context}\n\nQuestion: {question}",
        })

        response = openai_service.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=conversation,
            temperature=0.3,
            max_tokens=900,
        )

        log_cost(
            "qa_answer",
            "gpt-4o-mini",
            input_tokens=response.usage.prompt_tokens,
            output_tokens=response.usage.completion_tokens,
        )
        return _ensure_source_grounded(response.choices[0].message.content, relevant_docs)

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in NRQA process: {e}")
        raise HTTPException(status_code=500, detail="QA failed")


def _expand_query(question: str) -> list[str]:
    """
    Generate 3 paraphrased query variants via GPT-4o-mini.
    Returns a list of 3 strings or fewer on failure.
    """
    if not openai_service.client:
        return []
    try:
        resp = openai_service.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a query expansion assistant. "
                        "Given a question, return exactly 3 paraphrased variants that preserve "
                        "the original intent but use different wording. "
                        "Output one variant per line. No numbering, no preamble."
                    ),
                },
                {"role": "user", "content": question},
            ],
            temperature=0.5,
            max_tokens=150,
        )
        log_cost(
            "qa_expansion",
            "gpt-4o-mini",
            input_tokens=resp.usage.prompt_tokens,
            output_tokens=resp.usage.completion_tokens,
        )
        lines = [line.strip() for line in resp.choices[0].message.content.strip().splitlines() if line.strip()]
        return lines[:3]
    except Exception as e:
        print(f"[NRQA] Query expansion failed: {e}")
        return []


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _sentence_aware_chunks(text: str, max_words: int = _TRANSCRIPT_CHUNK_WORDS) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())

    chunks: list[str] = []
    current_words: list[str] = []
    current_count = 0

    for sentence in sentences:
        word_count = len(sentence.split())
        if current_count + word_count > max_words and current_words:
            chunks.append(" ".join(current_words))
            current_words = []
            current_count = 0
        current_words.append(sentence)
        current_count += word_count

    if current_words:
        chunks.append(" ".join(current_words))

    return chunks if chunks else [text]


def _build_retrieval_docs(lecture_id: str, transcript: str, question: str) -> list[dict]:
    docs: list[dict] = []

    lecture_meta = get_lecture_for_summarization(lecture_id) or {}
    master_summary = (lecture_meta.get("master_summary") or "").strip()
    summary = (lecture_meta.get("summary") or "").strip()
    if master_summary:
        docs.append({"text": master_summary, "type": "overview", "label": "Lecture Overview"})
    elif summary:
        docs.append({"text": summary, "type": "overview", "label": "Lecture Summary"})

    for idx, section in enumerate(get_section_summaries(lecture_id), start=1):
        clean = (section or "").strip()
        if clean:
            docs.append({"text": clean, "type": "section", "label": f"Section Summary {idx}"})

    transcript_chunks = _sentence_aware_chunks(transcript)
    for idx, chunk in enumerate(transcript_chunks, start=1):
        docs.append(
            {
                "text": chunk,
                "type": "transcript",
                "label": f"Transcript Excerpt {idx}",
                "chunk_index": idx - 1,
            }
        )

    if _question_needs_visual_context(question):
        for idx, frame in enumerate(get_visual_frames(lecture_id), start=1):
            visual_text = _visual_frame_text(frame)
            if visual_text:
                docs.append(
                    {
                        "text": visual_text,
                        "type": "visual",
                        "label": f"Visual Frame {idx}",
                        "timestamp_seconds": frame.get("timestamp_seconds"),
                    }
                )

    return docs


def _score_docs(
    docs: list[dict],
    doc_embeddings: list[list[float]],
    query_embeddings: list[list[float]],
    question: str,
) -> list[dict]:
    scored_docs: list[dict] = []
    for doc, embedding in zip(docs, doc_embeddings):
        semantic = max(cosine_similarity(embedding, query_embedding) for query_embedding in query_embeddings)
        keyword = _keyword_overlap(question, doc["text"])
        score = semantic + (_KEYWORD_WEIGHT * keyword) + _TYPE_BOOSTS.get(doc["type"], 0.0)
        scored_docs.append(
            {
                "doc": doc,
                "score": score,
                "semantic_score": semantic,
                "keyword_score": keyword,
            }
        )
    return sorted(scored_docs, key=lambda item: item["score"], reverse=True)


def _select_context_docs(docs: list[dict], scored_docs: list[dict], question: str) -> list[dict]:
    selected: list[dict] = []
    selected_keys: set[tuple] = set()
    wants_visual = _question_needs_visual_context(question)

    def add_doc(doc: dict) -> None:
        key = (doc["type"], doc["label"])
        if key in selected_keys:
            return
        selected.append(doc)
        selected_keys.add(key)

    for item in scored_docs:
        doc = item["doc"]
        if doc["type"] == "overview":
            add_doc(doc)
            break

    section_count = 0
    transcript_count = 0
    visual_count = 0
    transcript_neighbors: set[int] = set()

    for item in scored_docs:
        doc = item["doc"]
        if doc["type"] == "section" and section_count < 3:
            add_doc(doc)
            section_count += 1
        elif doc["type"] == "transcript" and transcript_count < 4:
            add_doc(doc)
            transcript_count += 1
            chunk_index = doc.get("chunk_index")
            if isinstance(chunk_index, int):
                for offset in range(1, _TRANSCRIPT_NEIGHBOR_WINDOW + 1):
                    transcript_neighbors.add(chunk_index - offset)
                    transcript_neighbors.add(chunk_index + offset)
        elif wants_visual and doc["type"] == "visual" and visual_count < 2:
            add_doc(doc)
            visual_count += 1

    if transcript_neighbors:
        transcript_lookup = {
            doc.get("chunk_index"): doc
            for doc in docs
            if doc["type"] == "transcript" and isinstance(doc.get("chunk_index"), int)
        }
        for chunk_index in sorted(transcript_neighbors):
            neighbor = transcript_lookup.get(chunk_index)
            if neighbor and len(selected) < 10:
                add_doc(neighbor)

    order_rank = {"overview": 0, "section": 1, "transcript": 2, "visual": 3}
    return sorted(
        selected,
        key=lambda doc: (
            order_rank.get(doc["type"], 99),
            doc.get("chunk_index", 999999),
            doc.get("timestamp_seconds", 999999),
            doc["label"],
        ),
    )


def _question_needs_visual_context(question: str) -> bool:
    tokens = set(re.findall(r"\b[a-z0-9]+\b", question.lower()))
    return bool(tokens & _VISUAL_QUERY_HINTS)


def _keyword_overlap(question: str, text: str) -> float:
    question_tokens = _meaningful_tokens(question)
    if not question_tokens:
        return 0.0
    text_tokens = _meaningful_tokens(text)
    if not text_tokens:
        return 0.0
    overlap = len(question_tokens & text_tokens)
    return overlap / len(question_tokens)


def _meaningful_tokens(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"\b[a-z0-9]+\b", text.lower())
        if len(token) > 2 and token not in _STOPWORDS
    }


def _visual_frame_text(frame: dict) -> str:
    parts: list[str] = []
    timestamp = frame.get("timestamp_seconds")
    if isinstance(timestamp, int):
        parts.append(f"Timestamp: {_format_seconds(timestamp)}")

    title = (frame.get("title") or "").strip()
    summary = (frame.get("summary") or "").strip()
    formatted = (frame.get("formatted_text") or "").strip()
    code = (frame.get("code") or "").strip()

    if title:
        parts.append(f"Title: {title}")
    if summary:
        parts.append(f"Summary: {summary}")
    if formatted:
        parts.append(f"Visible text: {formatted}")

    equations = frame.get("equations") or []
    if equations:
        parts.append("Equations: " + "; ".join(str(eq).strip() for eq in equations if str(eq).strip()))

    diagrams = frame.get("diagrams") or []
    if diagrams:
        parts.append("Diagrams: " + "; ".join(str(diagram).strip() for diagram in diagrams if str(diagram).strip()))

    if code:
        parts.append(f"Code: {code}")

    return "\n".join(parts).strip()


def _ensure_source_grounded(answer: str, relevant_docs: list[dict]) -> str:
    context_text = " ".join(doc["text"] for doc in relevant_docs).lower()
    source_match = re.search(r"^SOURCE:\s*(.+)$", answer, flags=re.MULTILINE)

    if source_match:
        source_value = source_match.group(1).strip().strip('"').strip("'")
        if source_value and len(source_value.split()) >= 3:
            # Fuzzy check: if 60%+ of source words appear in context, accept it
            source_words = set(re.findall(r'[a-z]{3,}', source_value.lower()))
            if source_words:
                matches = sum(1 for w in source_words if w in context_text)
                if matches / len(source_words) >= 0.6:
                    return answer

    # Source missing or failed fuzzy check — find best excerpt
    fallback = _best_source_excerpt(relevant_docs)
    if source_match:
        return re.sub(
            r"^SOURCE:\s*.+$",
            f'SOURCE: "{fallback}"',
            answer,
            flags=re.MULTILINE,
        )
    return answer.rstrip() + f'\nSOURCE: "{fallback}"'


def _best_source_excerpt(relevant_docs: list[dict]) -> str:
    for doc in relevant_docs:
        excerpt = _extract_sentence(doc["text"])
        if excerpt:
            return excerpt
    return "No direct supporting excerpt found in the lecture."


def _extract_sentence(text: str, max_chars: int = 140) -> str:
    for sentence in re.split(r"(?<=[.!?])\s+", text.strip()):
        clean = re.sub(r"\s+", " ", sentence.strip().strip('"'))
        if clean:
            return clean[:max_chars].rstrip()
    clean = re.sub(r"\s+", " ", text.strip())
    return clean[:max_chars].rstrip()


def _format_seconds(value: int) -> str:
    minutes, seconds = divmod(max(value, 0), 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"
