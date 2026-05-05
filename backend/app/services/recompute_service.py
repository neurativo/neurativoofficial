"""
recompute_service.py — end-of-session final summary pipeline.

Called as a FastAPI BackgroundTask after a live session ends.
Uses a SINGLE GPT call via content_generator.generate() instead of
the old multi-call approach (N+1 GPT calls for N topic segments).
Saves summary, flashcards, quiz, and glossary in one shot.
"""
from app.services.content_generator import generate as generate_content
from app.services.transcript_cleaner import clean as clean_transcript
from app.services.supabase_service import (
    get_all_chunk_transcripts,
    set_summary_status,
    save_generated_content,
    get_lecture_language,
    get_lecture_topic,
    get_lecture_full,
)


def recompute_final_summary(lecture_id: str) -> None:
    """
    End-of-session recompute: one GPT call for all content.

    Flow:
    1. Fetch all raw transcript chunks and concatenate.
    2. Clean transcript.
    3. Single GPT call → summary + flashcards + quiz + glossary.
    4. Save all content.
    5. Set summary_status = 'final'.
    """
    try:
        language = get_lecture_language(lecture_id) or "en"
        topic    = get_lecture_topic(lecture_id)
        lecture  = get_lecture_full(lecture_id)
        title    = (lecture or {}).get("title", "Live Session")

        transcripts = get_all_chunk_transcripts(lecture_id)
        if not transcripts:
            print(f"[recompute] {lecture_id}: no chunks, skipping.")
            set_summary_status(lecture_id, "final")
            return

        full_text = " ".join(transcripts)
        cleaned   = clean_transcript(full_text)

        if not cleaned:
            print(f"[recompute] {lecture_id}: transcript empty after cleaning.")
            set_summary_status(lecture_id, "final")
            return

        existing_summary    = (lecture or {}).get("master_summary") or ""
        existing_flashcards = (lecture or {}).get("flashcards") or []

        content = generate_content(
            cleaned, title, topic, language,
            force=False,
            existing_summary=existing_summary,
            existing_flashcards=existing_flashcards,
        )

        if content is None:
            print(f"[recompute] {lecture_id}: cache hit — content already exists.")
        elif content:
            save_generated_content(lecture_id, content)
            print(f"[recompute] {lecture_id}: content saved.")
        else:
            print(f"[recompute] {lecture_id}: GPT call returned empty result.")

    except Exception as e:
        print(f"[recompute] {lecture_id}: error (non-fatal): {e}")
    finally:
        try:
            set_summary_status(lecture_id, "final")
        except Exception as e:
            print(f"[recompute] {lecture_id}: could not set final status: {e}")
