from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.openai_service import transcribe_audio
from app.services.supabase_service import (
    save_lecture, 
    create_lecture, 
    create_live_session,
    get_active_live_session, 
    append_lecture_transcript,
    update_live_session_timestamp,
    get_lecture_for_summarization,
    update_lecture_summary_only,
    create_lecture_chunk,
    get_micro_summaries,
    create_lecture_section,
    get_section_summaries,
    get_latest_section_end_index,
    get_unsummarized_chunks,
    end_live_session,
    update_lecture_analytics
)

from app.services.summarization_service import (
    generate_micro_summary,
    generate_section_summary,
    generate_master_summary
)
from app.services.pdf_service import generate_lecture_pdf
from fastapi.responses import Response


from app.services.qa_service import answer_lecture_question
from pydantic import BaseModel

class QuestionRequest(BaseModel):
    question: str

class ExplainRequest(BaseModel):
    text: str
    mode: str = "simple"

router = APIRouter()

from app.services.explanation_service import generate_explanation

@router.post("/explain/{lecture_id}")
def explain_text(lecture_id: str, request: ExplainRequest):
    """
    Generates a structured explanation for selected academic text.
    """
    explanation_data = generate_explanation(request.text, request.mode)
    return {
        "lecture_id": lecture_id,
        "explanation": explanation_data.get("explanation"),
        "analogy": explanation_data.get("analogy"),
        "breakdown": explanation_data.get("breakdown")
    }

@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    # Validate file extension
    # Allowed formats for Whisper: mp3, mp4, mpeg, mpga, m4a, wav, and webm
    allowed_extensions = ('.mp3', '.wav', '.m4a', '.mp4', '.mpeg', '.mpga', '.webm')
    if not file.filename.lower().endswith(allowed_extensions):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Supported formats: {', '.join(allowed_extensions)}"
        )
    
    transcript_text = await transcribe_audio(file)
    
    try:
        # Extract filename without extension for title
        # rsplit checks from right, maxsplit=1 ensures we get name and extension (if dot exists)
        title = file.filename.rsplit('.', 1)[0]
        
        # Save to Supabase
        lecture_id = save_lecture(title=title, transcript=transcript_text)
        
        return {
            "lecture_id": lecture_id,
            "transcript": transcript_text
        }
    except Exception as e:
        # If database save fails, we return 500
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to save lecture: {str(e)}"
        )

@router.get("/summarize/{lecture_id}")
def summarize(lecture_id: str):
    """
    Returns the latest hierarchical summary for a lecture.
    """
    lecture = get_lecture_for_summarization(lecture_id)
    summary = lecture.get("master_summary") or lecture.get("summary") or "Processing..."
    return {
        "lecture_id": lecture_id,
        "summary": summary
    }

@router.post("/ask/{lecture_id}")
def ask_question(lecture_id: str, request: QuestionRequest):
    """
    Answers a question about a specific lecture using RAG (Retrieval Augmented Generation).
    Uses in-memory embeddings for now.
    """
    answer = answer_lecture_question(lecture_id, request.question)
    return {
        "lecture_id": lecture_id,
        "question": request.question,
        "answer": answer
    }

@router.post("/live/start")
def start_live_session():
    """
    Starts a new live lecture session.
    Creates a placeholder lecture and an active live_session record.
    """
    try:
        # 1. Create a new lecture
        lecture_id = create_lecture(title="Live Session", transcript="")
        
        # 2. Create a new live session
        live_session_id = create_live_session(lecture_id)
        
        return {
            "lecture_id": lecture_id,
            "live_session_id": live_session_id,
            "status": "started"
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start live session: {str(e)}"
        )

@router.post("/live/{lecture_id}/chunk")
async def process_live_chunk(lecture_id: str, file: UploadFile = File(...)):
    """
    Processes an audio chunk for a live session.
    Transcribes the chunk and appends it to the lecture.
    """
    # 1. Validate Live Session
    session = get_active_live_session(lecture_id)
    if not session:
        raise HTTPException(status_code=400, detail="Active live session not found for this lecture")

    # 2. Transcribe Chunk
    try:
        chunk_text = await transcribe_audio(file)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    if not chunk_text:
        # If transcription is empty, just return current state
        # But usually we might want to log this.
        return {
            "lecture_id": lecture_id,
            "chunk_transcript": "",
            "message": "Empty transcription"
        }

    # 3. Update Transcript & Session
    try:
        # Append transcript provided in the chunk
        # Note: append_lecture_transcript returns the length of the *new* full transcript ideally, 
        # or we can fetch it. Ideally append_lecture_transcript should return the total length.
        # Let's assume append_lecture_transcript logic fits or we adjust.
        # In step 142 I wrote append_lecture_transcript to return `len(new_transcript)`.
        
        full_transcript_length = append_lecture_transcript(lecture_id, chunk_text)
        update_live_session_timestamp(session['id'])
        update_lecture_analytics(lecture_id, chunk_duration=12) # Track chunk usage (12s chunks)
        
        # 4. Hierarchical Summarization Logic (Semantic Density Rule)
        summary_updated = False
        try:
            # Fetch current lecture state
            lecture_data = get_lecture_for_summarization(lecture_id)
            if lecture_data:
                current_total_chunks = lecture_data.get("total_chunks") or 0
                chunk_idx = current_total_chunks - 1 # Deterministic index
                
                # PHASE 1: Micro Summary
                micro = generate_micro_summary(chunk_text)
                create_lecture_chunk(lecture_id, chunk_text, micro, chunk_idx)
                
                # Check semantic density for PHASE 2
                last_sec_end = get_latest_section_end_index(lecture_id)
                pending_chunks = get_unsummarized_chunks(lecture_id, last_sec_end)
                
                if pending_chunks:
                    combined_micro_text = " ".join([c['micro_summary'] for c in pending_chunks if c.get('micro_summary')])
                    word_count = len(combined_micro_text.split())
                    
                    # New Accumulator Rule: 900 words AND at least 6 chunks
                    if word_count >= 900 and len(pending_chunks) >= 6:
                        # PHASE 2: Section Summary (Immutable once generated)
                        last_idx = pending_chunks[-1]['chunk_index']
                        start_idx = pending_chunks[0]['chunk_index']
                        current_total_secs = lecture_data.get("total_sections") or 0
                        
                        micro_list = [c['micro_summary'] for c in pending_chunks]
                        new_section = generate_section_summary(micro_list)
                        create_lecture_section(lecture_id, new_section, start_idx, last_idx, current_total_secs)
                        
                        # PHASE 3: Master Summary (Only rebuilds when a section is finalized)
                        all_sections = get_section_summaries(lecture_id)
                        if all_sections:
                            master = generate_master_summary(all_sections)
                            update_lecture_summary_only(lecture_id, master)
                            summary_updated = True
        except Exception as hierarchical_err:
            print(f"Hierarchical summarization error (non-fatal): {hierarchical_err}")
        
        return {
            "lecture_id": lecture_id,
            "chunk_transcript": chunk_text,
            "full_transcript_length": full_transcript_length,
            "summary_updated": summary_updated
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update lecture: {str(e)}")

@router.post("/live/{lecture_id}/end")
def end_session_endpoint(lecture_id: str):
    """
    Ends the live session for a lecture.
    """
    try:
        end_live_session(lecture_id)
        return {"status": "ended", "lecture_id": lecture_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to end session: {str(e)}")

from fastapi.responses import StreamingResponse

@router.get("/lectures/{lecture_id}/analytics")
def get_analytics(lecture_id: str):
    """
    Returns analytics for a lecture.
    """
    try:
        data = get_lecture_for_summarization(lecture_id)
        if not data:
            raise HTTPException(status_code=404, detail="Lecture not found")
            
        transcript = data.get("transcript") or ""
        summary = data.get("summary") or ""
        
        # Safe metric calculation
        word_count = len(transcript.split()) if transcript else 0
        transcript_length = len(transcript) if transcript else 0
        summary_length = len(summary) if summary else 0
        
        # Avoid division by zero
        compression_ratio = 0.0
        if transcript_length > 0:
            compression_ratio = round(summary_length / transcript_length, 2)
        
        return {
            "word_count": word_count,
            "transcript_length": transcript_length,
            "total_chunks": data.get("total_chunks") or 0,
            "total_duration_seconds": data.get("total_duration_seconds") or 0,
            "compression_ratio": compression_ratio
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_analytics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch analytics: {str(e)}")

@router.get("/lectures/{lecture_id}/export/pdf")
def export_pdf(lecture_id: str):
    """
    Generates and returns a PDF of the lecture using Playwright (sync).
    """
    try:
        # Note: generate_lecture_pdf is now sync and returns bytes
        pdf_bytes = generate_lecture_pdf(lecture_id)
        
        return Response(
            content=pdf_bytes, 
            media_type="application/pdf", 
            headers={
                "Content-Disposition": f"attachment; filename=lecture_{lecture_id}.pdf"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in export_pdf: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")








@router.get("/lectures/{lecture_id}")
def get_lecture_details(lecture_id: str):
    """
    Retrieves the current state of a lecture (transcript, summary).
    """
    lecture = get_lecture_for_summarization(lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return lecture
