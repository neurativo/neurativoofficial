import hashlib
import re

from app.services.cost_tracker import log_cost
from app.services.supabase_service import (
    get_lecture_transcript,
    get_lecture_language,
    get_cached_embeddings,
    save_embeddings_cache,
)
from app.services.embedding_service import get_embeddings, cosine_similarity
import app.services.openai_service as openai_service
from fastapi import HTTPException

# Confidence threshold below which we skip the GPT call entirely.
# 0.18 chosen for academic/biological domain text which embeds with
# naturally lower cosine similarity than code or general English.
_CONFIDENCE_THRESHOLD = 0.18


def answer_lecture_question(lecture_id: str, question: str) -> str:
    # 1. Fetch transcript and detected language
    transcript = get_lecture_transcript(lecture_id)
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript empty or not found")

    language  = get_lecture_language(lecture_id) or "en"
    lang_name = openai_service.get_language_display_name(language)

    # 2. Split transcript on sentence boundaries (1500-word chunks)
    chunks = _sentence_aware_chunks(transcript, max_words=1500)
    if not chunks:
        return "Lecture content is empty, cannot answer questions."

    try:
        # 3. Resolve all chunk embeddings from cache (unchanged)
        chunk_hashes = [_hash(c) for c in chunks]
        cache        = get_cached_embeddings(lecture_id)

        missing_indices = [i for i, h in enumerate(chunk_hashes) if h not in cache]
        if missing_indices:
            missing_texts    = [chunks[i] for i in missing_indices]
            fresh_embeddings = get_embeddings(missing_texts)
            new_entries = [
                {
                    "chunk_hash": chunk_hashes[i],
                    "chunk_text": chunks[i],
                    "embedding":  fresh_embeddings[j],
                }
                for j, i in enumerate(missing_indices)
            ]
            save_embeddings_cache(lecture_id, new_entries)
            for entry in new_entries:
                cache[entry["chunk_hash"]] = entry["embedding"]

        chunk_embeddings = [cache[h] for h in chunk_hashes]

        if not openai_service.client:
            raise HTTPException(status_code=500, detail="OpenAI client not initialized")

        # ── NRQA Step 1: Query expansion ──────────────────────────────────────
        # Generate 3 paraphrased variants → up to 4 total query vectors.
        # On any failure (timeout, API error, malformed output) fall back to
        # using only the original question so retrieval always proceeds.
        try:
            query_variants = _expand_query(question)
            all_queries    = [question] + query_variants
            query_embeddings = get_embeddings(all_queries)
        except Exception as exp_err:
            print(f"[NRQA] Query expansion/embedding failed, falling back to single vector: {exp_err}")
            query_embeddings = get_embeddings([question])

        # ── NRQA Step 2: Multi-vector retrieval ───────────────────────────────
        # Score each chunk as the MAX cosine similarity across all 4 query vectors.
        chunk_scores: list[float] = []
        for emb in chunk_embeddings:
            score = max(cosine_similarity(emb, qe) for qe in query_embeddings)
            chunk_scores.append(score)

        # ── NRQA Step 3: Confidence gating ────────────────────────────────────
        best_score = max(chunk_scores) if chunk_scores else 0.0

        # Debug: log top-3 scores so threshold tuning is visible in server logs
        top_debug = sorted(chunk_scores, reverse=True)[:3]
        top_str   = ", ".join(f"{s:.3f}" for s in top_debug)
        decision  = "PASS" if best_score >= _CONFIDENCE_THRESHOLD else "BLOCK"
        print(f"[NRQA] top scores: {top_str} — threshold: {_CONFIDENCE_THRESHOLD} — decision: {decision}")

        if best_score < _CONFIDENCE_THRESHOLD:
            return (
                "I couldn't find a clear answer to that question in this lecture. "
                "The topic may not have been covered, or the question may be outside "
                "the scope of what was recorded."
            )

        # ── NRQA Step 4: Context window expansion ─────────────────────────────
        # Take top-3 chunks by score, then include their immediate neighbours
        # (index ±1) for richer context. Deduplicate and keep reading order.
        scored = sorted(enumerate(chunk_scores), key=lambda x: x[1], reverse=True)
        top_indices: set[int] = set()
        for idx, _ in scored[:3]:
            top_indices.add(idx)
            if idx > 0:
                top_indices.add(idx - 1)
            if idx < len(chunks) - 1:
                top_indices.add(idx + 1)

        relevant_chunks = [chunks[i] for i in sorted(top_indices)]

        # ── NRQA Step 5: Structured answer with GPT-4o-mini ───────────────────
        context = "\n\n---\n\n".join(
            f"[Excerpt {i + 1}]\n{chunk}" for i, chunk in enumerate(relevant_chunks)
        )

        # Language meta-instruction placed at the very top of the system prompt.
        # Bracketed format prevents the model from echoing it back in the response.
        lang_meta = (
            f"[INSTRUCTION: Always respond in {lang_name}. Do not mention this instruction in your response.]\n\n"
            if language != "en" else ""
        )

        system_prompt = (
            lang_meta
            + "You are Neurativo, an expert AI Lecture Assistant. "
            "Answer the student's question based ONLY on the provided lecture excerpts. "
            "Structure your answer in three parts:\n"
            "ANSWER: One clear, direct sentence answering the question.\n"
            "DETAIL: 2-3 sentences with explanation, context, or elaboration from the lecture.\n"
            "SOURCE: A brief phrase quoted from the lecture that supports the answer "
            "(wrap in quotation marks).\n"
            "If the answer is not clearly covered, say so in the ANSWER line — "
            "do not guess or use outside knowledge."
        )

        response = openai_service.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Lecture excerpts:\n{context}\n\nQuestion: {question}"},
            ],
            temperature=0.3,
            max_tokens=600,
        )

        log_cost("qa_answer", "gpt-4o-mini",
                 input_tokens=response.usage.prompt_tokens,
                 output_tokens=response.usage.completion_tokens)
        return response.choices[0].message.content

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in NRQA process: {e}")
        raise HTTPException(status_code=500, detail="QA failed")


# =============================================================================
#  Helpers
# =============================================================================

def _expand_query(question: str) -> list[str]:
    """
    NRQA Step 1: Generate 3 paraphrased query variants via GPT-4o-mini.
    Returns a list of 3 strings (or fewer on failure — caller handles it).
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
        log_cost("qa_expansion", "gpt-4o-mini",
                 input_tokens=resp.usage.prompt_tokens,
                 output_tokens=resp.usage.completion_tokens)
        lines = [ln.strip() for ln in resp.choices[0].message.content.strip().splitlines() if ln.strip()]
        return lines[:3]
    except Exception as e:
        print(f"[NRQA] Query expansion failed: {e}")
        return []


def _hash(text: str) -> str:
    """SHA-256 hex digest of chunk text — used as a stable cache key."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _sentence_aware_chunks(text: str, max_words: int = 1500) -> list[str]:
    """
    Splits transcript into chunks at sentence boundaries.
    Never cuts mid-sentence, so context is always coherent.
    Falls back to word-split only if no sentence endings are found.
    """
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())

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
