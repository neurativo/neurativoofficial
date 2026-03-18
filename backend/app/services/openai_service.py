import asyncio
from openai import OpenAI
from fastapi import UploadFile, HTTPException
from app.core.config import settings
from io import BytesIO

# Initialize the OpenAI client only if the API key is available to avoid immediate errors on startup,
# but we will check it before usage.
client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None

async def transcribe_audio(file: UploadFile) -> str:
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")
    
    if not client:
        raise HTTPException(status_code=500, detail="OpenAI client not initialized")

    try:
        # Read the file content
        file_content = await file.read()
        
        # Create a file-like object with the original filename
        # This is crucial for OpenAI to detect the file type
        file_obj = BytesIO(file_content)
        file_obj.name = file.filename

        # Call OpenAI Whisper API in a thread to avoid blocking the async event loop
        transcript_response = await asyncio.to_thread(
            client.audio.transcriptions.create,
            model="whisper-1",
            file=file_obj
        )
        
        return transcript_response.text

    except Exception as e:
        # Log the error here in a real app
        print(f"Error during transcription: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
