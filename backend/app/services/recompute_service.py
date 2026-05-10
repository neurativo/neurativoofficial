"""
Full rebuild pipeline for generated lecture outputs.

Recompute snapshots the previous generated state, clears generated outputs,
rebuilds from the original transcript only, validates concept coverage, then
saves. If anything fails, the previous generated output is restored.
"""

from app.services.content_generator import (
    generate as generate_content,
    summary_has_required_structure,
)
from app.services.summarization_service import generate_concept_master_summary
from app.services.transcript_cleaner import clean as clean_transcript
from app.services.trust_service import (
    build_concept_note_cards,
    build_concept_sections,
    build_grounded_notes,
    sanitize_generated_content_bundle,
    validate_summary_card_generation,
)
from app.services.supabase_service import (
    clear_generated_outputs_for_recompute,
    get_all_chunk_transcripts,
    get_lecture_full,
    get_lecture_language,
    get_lecture_topic,
    restore_generated_outputs,
    save_generated_content,
    set_summary_status,
    snapshot_generated_outputs,
    update_lecture_summary_only,
)


def _full_original_transcript(lecture: dict | None, lecture_id: str) -> str:
    transcript = (lecture or {}).get("transcript") or ""
    if transcript.strip():
        return transcript
    chunk_transcripts = get_all_chunk_transcripts(lecture_id)
    return " ".join(chunk_transcripts)


def recompute_final_summary(lecture_id: str) -> None:
    """
    Recompute every generated artifact from the original transcript.

    Previous sections/cards/study aids are never used as inputs. Missing
    concepts or grounding below the hard gate abort the recompute and restore
    the previous generated state.
    """
    snapshot: dict | None = None
    try:
        language = get_lecture_language(lecture_id) or "en"
        topic = get_lecture_topic(lecture_id)
        lecture = get_lecture_full(lecture_id) or {}
        title = lecture.get("title") or "Live Session"

        original_transcript = _full_original_transcript(lecture, lecture_id)
        if not original_transcript.strip():
            print(f"[recompute] {lecture_id}: no original transcript available; previous output unchanged.")
            return

        cleaned = clean_transcript(original_transcript)
        if not cleaned:
            print(f"[recompute] {lecture_id}: transcript empty after cleaning; previous output unchanged.")
            return

        snapshot = snapshot_generated_outputs(lecture_id)
        clear_generated_outputs_for_recompute(lecture_id)

        concept_summary = generate_concept_master_summary(cleaned, topic=topic, language=language)
        if not concept_summary:
            raise RuntimeError("concept summary generation returned empty output")

        grounded_notes = build_grounded_notes(cleaned, concept_summary, section_rows=[])
        concept_sections = build_concept_sections(grounded_notes)
        concept_note_cards = build_concept_note_cards(transcript=original_transcript, lecture_id=lecture_id)
        validate_summary_card_generation(
            concept_sections,
            concept_note_cards,
            grounded_notes,
            transcript=original_transcript,
        )

        content = generate_content(
            cleaned,
            title,
            topic,
            language,
            force=True,
            existing_summary="",
            existing_flashcards=[],
        )

        if content and summary_has_required_structure(content.get("summary", ""), cleaned):
            content = sanitize_generated_content_bundle(
                cleaned,
                content,
                summary=concept_summary,
            )
            save_generated_content(lecture_id, content)
            update_lecture_summary_only(lecture_id, concept_summary)
            set_summary_status(lecture_id, "final")
            print(f"[recompute] {lecture_id}: recompute complete with validated concept coverage.")
            return

        raise RuntimeError("study-aid generation returned no valid bundle")

    except Exception as exc:
        if snapshot is not None:
            try:
                restore_generated_outputs(lecture_id, snapshot)
                print(f"[recompute] {lecture_id}: failed and restored previous generated output: {exc}")
            except Exception as restore_exc:
                print(
                    f"[recompute] {lecture_id}: failed, and rollback also failed: "
                    f"{restore_exc}; original error: {exc}"
                )
        else:
            print(f"[recompute] {lecture_id}: failed before generated output was cleared: {exc}")
