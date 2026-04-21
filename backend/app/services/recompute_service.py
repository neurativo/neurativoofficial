"""
recompute_service.py

End-of-session final summary recompute pipeline.

Called as a FastAPI BackgroundTask after a live session ends.
Runs two GPT passes over the full raw transcript:
  Pass 1 — segment_transcript(): detect natural topic boundaries
  Pass 2 — summarize_topic_segment(): summarize each topic directly from transcript

Saves the result to lectures.master_summary and sets summary_status = 'final'.
"""

from app.services.summarization_service import segment_transcript, summarize_topic_segment
from app.services.supabase_service import (
    get_all_chunk_transcripts,
    set_summary_status,
    update_lecture_summary_only,
    get_lecture_language,
    get_lecture_topic,
)


def recompute_final_summary(lecture_id: str) -> None:
    """
    Orchestrates the end-of-session recompute.

    Flow:
    1. Fetch all raw transcript chunks and concatenate.
    2. Pass 1: detect topic segments via segment_transcript().
    3. Pass 2: summarize each segment via summarize_topic_segment().
    4. Assemble and save the definitive master_summary.
    5. Set summary_status = 'final'.

    Always sets summary_status to 'final' even on failure, so the frontend
    stops showing the "Refining…" badge regardless of outcome.
    """
    try:
        language = get_lecture_language(lecture_id) or "en"
        topic    = get_lecture_topic(lecture_id)

        # Step 1: collect raw transcript
        transcripts = get_all_chunk_transcripts(lecture_id)
        if not transcripts:
            print(f"[recompute] {lecture_id}: no chunks found, skipping.")
            set_summary_status(lecture_id, "final")
            return

        full_text = " ".join(transcripts)

        # Step 2: topic segmentation
        segments = segment_transcript(full_text, topic=topic)
        if not segments:
            print(f"[recompute] {lecture_id}: segmentation returned nothing, skipping.")
            set_summary_status(lecture_id, "final")
            return

        # Step 3: per-topic summarization
        topic_summaries = []
        for seg in segments:
            start      = max(0, int(seg.get("start", 0)))
            end        = min(len(full_text), int(seg.get("end", len(full_text))))
            text_slice = full_text[start:end].strip()
            if not text_slice:
                continue
            summary = summarize_topic_segment(
                text_slice,
                title=seg.get("title", "Topic"),
                topic=topic,
                language=language,
            )
            if summary:
                topic_summaries.append(summary)

        if not topic_summaries:
            print(f"[recompute] {lecture_id}: all topic summaries empty, skipping save.")
            set_summary_status(lecture_id, "final")
            return

        # Step 4: assemble and save
        master = "\n\n".join(topic_summaries)
        update_lecture_summary_only(lecture_id, master)
        print(f"[recompute] {lecture_id}: done. {len(topic_summaries)} topics.")

    except Exception as e:
        print(f"[recompute] {lecture_id}: error (non-fatal): {e}")

    finally:
        # Always mark final so the frontend badge clears
        try:
            set_summary_status(lecture_id, "final")
        except Exception as e:
            print(f"[recompute] {lecture_id}: could not set final status: {e}")
