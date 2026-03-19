import hashlib
import re

from app.services.supabase_service import (
    get_lecture_transcript,
    get_lecture_language,
    get_cached_embeddings,
    save_embeddings_cache,
)
from app.services.embedding_service import get_embeddings, cosine_similarity
import app.services.openai_service as openai_service
from fastapi import HTTPException


def answer_lecture_question(lecture_id: str, question: str) -> str:
    # 1. Fetch transcript and detected language
    transcript = get_lecture_transcript(lecture_id)
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript empty or not found")

    language = get_lecture_language(lecture_id) or "en"
    lang_name = openai_service.get_language_display_name(language)

    # 2. Split transcript on sentence boundaries
    chunks = _sentence_aware_chunks(transcript, max_words=1500)
    if not chunks:
        return "Lecture content is empty, cannot answer questions."

    try:
        # 3. Compute per-chunk hashes and resolve embeddings from cache
        chunk_hashes = [_hash(c) for c in chunks]
        cache = get_cached_embeddings(lecture_id)

        missing_indices = [i for i, h in enumerate(chunk_hashes) if h not in cache]

        if missing_indices:
            missing_texts      = [chunks[i] for i in missing_indices]
            fresh_embeddings   = get_embeddings(missing_texts)

            new_entries = [
                {
                    "chunk_hash": chunk_hashes[i],
                    "chunk_text": chunks[i],
                    "embedding":  fresh_embeddings[j],
                }
                for j, i in enumerate(missing_indices)
            ]
            save_embeddings_cache(lecture_id, new_entries)

            # Merge into local cache so the rest of this request can use them
            for entry in new_entries:
                cache[entry["chunk_hash"]] = entry["embedding"]

        chunk_embeddings = [cache[h] for h in chunk_hashes]

        # 4. Embed question and pick top-3 relevant chunks
        question_embedding = get_embeddings([question])[0]
        similarities = [
            (cosine_similarity(emb, question_embedding), i)
            for i, emb in enumerate(chunk_embeddings)
        ]
        similarities.sort(key=lambda x: x[0], reverse=True)
        top_indices    = [idx for _, idx in similarities[:3]]
        relevant_chunks = [chunks[i] for i in sorted(top_indices)]

        # 5. Ask GPT with structured citation prompt
        if not openai_service.client:
            raise HTTPException(status_code=500, detail="OpenAI client not initialized")

        context = "\n\n---\n\n".join(
            f"[Excerpt {i+1}]\n{chunk}" for i, chunk in enumerate(relevant_chunks)
        )

        lang_instruction = (
            f" Always respond in {lang_name} ({language}), "
            "matching the language of the lecture."
            if language != "en" else ""
        )

        system_prompt = (
            "You are an expert AI Lecture Assistant. "
            "Answer the user's question based ONLY on the provided lecture excerpts. "
            "When you use information from an excerpt, cite it inline by quoting a brief "
            "identifying phrase from that excerpt in quotation marks "
            '(e.g. "According to the lecture: \\"...\\"".). '
            "If the answer is not covered in the excerpts, say so clearly — "
            "do not guess or use outside knowledge. "
            "Be clear, accurate, and concise."
            + lang_instruction
        )

        response = openai_service.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Lecture excerpts:\n{context}\n\nQuestion: {question}"}
            ],
            temperature=0.3,
            max_tokens=600
        )

        return response.choices[0].message.content

    except Exception as e:
        print(f"Error in QA process: {e}")
        raise HTTPException(status_code=500, detail=f"QA failed: {str(e)}")


# =============================================================================
#  Helpers
# =============================================================================

def _hash(text: str) -> str:
    """MD5 hex digest of chunk text — used as a stable cache key."""
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def _sentence_aware_chunks(text: str, max_words: int = 1500) -> list[str]:
    """
    Splits transcript into chunks at sentence boundaries.
    Never cuts mid-sentence, so context is always coherent.
    Falls back to word-split only if no sentence endings are found.
    """
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())

    chunks = []
    current_words = []
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
